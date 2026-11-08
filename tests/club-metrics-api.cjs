const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'test@example.invalid', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const handler = require('../api/club-content');
const originalFetch = global.fetch, originalNow = Date.now;
Date.now = () => Date.parse('2026-11-08T18:00:00Z');
const before = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`2020-01-${String(i + 1).padStart(2, '0')}`, { title: 'исторический хайк', people: { a: 'участник' } }]));
const db = {
    'adminContent/metrics': { hasValue: true, value: { hikes: '999', kilometers: '999', meetings: '999', locations: '18' } },
    hikeVisitsBefore: before, hikeParticipants: { '2026-11-08': { b: { name: 'непубличное имя' } } }, noShows: {},
    hikes: { '2026-11-08': { title: 'хайк', start_time: '12:00', tags: ['6 км'] } },
};
global.fetch = async (url, options = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'test', expires_in: 3600 });
    assert.equal(options.method, undefined, 'Derived metrics never mutate database on GET');
    const key = new URL(url).pathname.slice(1).replace(/\.json$/, '');
    return Response.json(db[key] || null, { headers: { etag: 'null_etag' } });
};
async function call(query) {
    const result = {};
    await handler({ method: 'GET', query }, { setHeader() {}, status(code) { result.code=code;return this; }, json(value) { result.data=value;return this; } });
    return result;
}
(async () => {
    for (const query of [{ metrics: '1' }, {}]) {
        const r = await call(query);
        assert.equal(r.code, 200);
        assert.equal(r.data.metricsMode, 'automatic');
        assert.deepEqual(r.data.metrics, { hikes: '21', kilometers: '185', locations: '18', meetings: '2' });
        assert.ok(!JSON.stringify(r.data).includes('непубличное имя'));
    }
    db.hikes['2026-11-08'].tags = ['9 км'];
    assert.equal((await call({ metrics: '1' })).data.metrics.kilometers, '188');
    console.log('Metrics API: both endpoints derive current totals, ignore manual overrides, reflect edits and expose no participants: PASS');
})().catch(e => { console.error(e);process.exitCode=1; }).finally(() => { global.fetch=originalFetch;Date.now=originalNow; });
