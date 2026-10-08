const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const handler = require('../api/club-content');

const botToken = 'test-only-bot-token';
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.TELEGRAM_BOT_TOKEN = botToken;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'test@example.invalid',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
const base = {
    metrics: { hikes: '100', locations: '20', kilometers: '1200', meetings: '400' },
    updates: [{ date: '2026-10-01', update: 'старое обновление' }],
};
const overrides = {};
let writes = 0;
const realFetch = global.fetch;
global.fetch = async (url, options = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'test-token', expires_in: 3600 });
    const match = String(url).match(/\/(adminContent\/)?(metrics|updates)\.json$/);
    assert.ok(match, 'Only fixed content paths are requested');
    const [, override, section] = match;
    if (options.method === 'PUT') {
        assert.ok(override);
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        if (options.headers['If-Match'] !== `"${section}-${overrides[section]?.version || 0}"`) return new Response('', { status: 412 });
        const data = JSON.parse(options.body);
        overrides[section] = { ...data, version: (overrides[section]?.version || 0) + 1 };
        writes++;
        return Response.json(data);
    }
    return Response.json(override ? overrides[section] || null : base[section], {
        headers: { etag: `"${section}-${overrides[section]?.version || 0}"` },
    });
};

function signedUser(username, age = 0) {
    const params = new URLSearchParams({
        user: JSON.stringify({ id: 123, username }),
        auth_date: String(Math.floor(Date.now() / 1000) - age),
    });
    const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
    return params.toString();
}

async function call(method, body) {
    const result = { headers: {} };
    const res = {
        setHeader(key, value) { result.headers[key] = value; },
        status(code) { result.status = code; return this; },
        json(value) { result.body = value; return this; },
    };
    await handler({ method, body }, res);
    return result;
}

(async () => {
    let response = await call('GET');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.metrics, base.metrics);
    const data = {
        section: 'metrics', value: { hikes: 150, locations: 25, kilometers: 1550.5, meetings: 500 },
        revision: response.body.revisions.metrics,
    };
    assert.equal((await call('POST', data)).status, 401);
    assert.equal((await call('POST', { ...data, initData: signedUser('visitor') })).status, 403);
    assert.equal((await call('POST', { ...data, initData: signedUser('maxmolotov', 8 * 86400) })).status, 401);
    assert.equal(writes, 0, 'Unauthorized users never write');
    const initData = signedUser('MaxMolotov');
    assert.equal((await call('POST', { ...data, initData, value: { ...data.value, hikes: -1 } })).status, 400);
    assert.equal((await call('POST', { ...data, initData, value: { ...data.value, meetings: [] } })).status, 400);
    assert.equal((await call('POST', { ...data, initData, section: '../members' })).status, 400);
    response = await call('POST', { ...data, initData });
    assert.equal(response.status, 200);
    assert.equal(writes, 1);
    assert.equal((await call('POST', { ...data, initData })).status, 409, 'Reject stale editor writes');
    base.metrics.hikes = '999';
    response = await call('GET');
    assert.equal(response.body.metrics.hikes, '150', 'Table synchronization cannot overwrite manual metrics');
    assert.ok(!JSON.stringify(response.body).includes('updatedBy'), 'Public response excludes audit identities');
    const updates = {
        section: 'updates', revision: response.body.revisions.updates, initData: signedUser('hellointelligent'),
        value: [{ date: '2026-10-01', update: 'старое обновление' }, { date: '2026-10-08', update: 'новое обновление' }],
    };
    assert.equal((await call('POST', { ...updates, value: [{ date: '2026-02-30', update: 'неверная дата' }] })).status, 400);
    assert.equal((await call('POST', { ...updates, value: [{ date: '2026-10-08', update: '  ' }] })).status, 400);
    assert.equal((await call('POST', updates)).status, 200);
    response = await call('GET');
    assert.equal(response.body.updates[0].date, '2026-10-08', 'Newest update first');
    assert.equal(response.body.updates.length, 2);
    assert.deepEqual(response.body.metrics, { hikes: '150', locations: '25', kilometers: '1550.5', meetings: '500' });
    assert.equal((await call('POST', { ...updates, value: [], revision: response.body.revisions.updates })).status, 200);
    // Firebase represents an empty array by removing its property.
    delete overrides.updates.value;
    response = await call('GET');
    assert.deepEqual(response.body.updates, [], 'An empty manual list must not restore old table updates');
    assert.equal((await call('DELETE')).status, 405);
    console.log('Club content tests passed: auth, validation, persistence, sync protection, concurrent edits');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = realFetch; });
