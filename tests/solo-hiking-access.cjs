const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { canDownload } = require('../lib/solo-hiking');

const botToken = '123:test-solo-token';
process.env.TELEGRAM_BOT_TOKEN = botToken;
require.cache[require.resolve('../api/club-content.js')] = {
    exports: { getAccessToken: async () => 'test-firebase-token' },
};
const handler = require('../api/me.js');

const members = new Set(['101', '202']);
const reads = [];
const routes = {
    fixture: { title: 'Тестовый маршрут', segments: [[[44.5, 34.1], [44.6, 34.2]]] },
};
let unavailable = false;
global.fetch = async url => {
    const path = new URL(url).pathname;
    reads.push(path);
    if (path.startsWith('/members/')) {
        const id = path.slice('/members/'.length, -'.json'.length);
        return { ok: !unavailable, status: 503, json: async () => members.has(id) ? { user_id: id } : null };
    }
    assert.equal(path, '/routes.json');
    return { ok: true, json: async () => routes };
};

function initData(id) {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }) });
    const data = [...params].map(([key, value]) => `${key}=${value}`).sort().join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
    return params.toString();
}

async function call(body) {
    reads.length = 0;
    const response = {
        headers: {},
        setHeader(key, value) { this.headers[key] = value; },
        status(code) { this.code = code; return this; },
        json(payload) { this.payload = payload; return this; },
    };
    await handler({ method: 'POST', body }, response);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    return response;
}

(async () => {
    const first = { action: 'soloRoutes', initData: initData(101) };
    const cached = { ...first, cached: true };
    let response = await call(first);
    assert.equal(response.code, 200);
    assert.deepEqual(reads, ['/members/101.json', '/routes.json']);
    assert.equal(response.payload.routes.find(route => route.id === 'fixture').title, 'Тестовый маршрут');

    response = await call({ ...cached, initData: initData(202) });
    assert.equal(response.code, 200);
    assert.deepEqual(response.payload, { cached: true });
    assert.deepEqual(reads, ['/members/202.json']);

    assert.equal((await call({ ...first, initData: 'invalid' })).code, 401);
    assert.deepEqual(reads, []);
    assert.equal((await call({ ...first, initData: initData(303) })).code, 403);
    assert.deepEqual(reads, ['/members/303.json']);

    response = await call({ action: 'soloDownload', initData: initData(202), routeId: 'fixture' });
    assert.equal(response.code, 200);
    const { searchParams } = new URL(response.payload.download, 'https://fixture.test');
    assert.equal(canDownload(searchParams.get('soloGpx'), searchParams.get('expires'), searchParams.get('signature'), botToken), true);

    members.delete('101');
    assert.equal((await call(cached)).code, 403);
    assert.deepEqual(reads, ['/members/101.json']);
    assert.equal((await call({ ...first, action: 'soloDownload', routeId: 'fixture' })).code, 403);
    assert.deepEqual(reads, ['/members/101.json']);

    unavailable = true;
    assert.equal((await call({ ...cached, initData: initData(202) })).code, 502);
    assert.deepEqual(reads, ['/members/202.json']);
    console.log('Solo hiking passed: signed card holders, access recheck on cached opens, revocation, and GPX issuance');
})().catch(error => { console.error(error); process.exitCode = 1; });
