const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler } = require('../api/achievements');

const botToken = 'profile-achievement-test-only';
process.env.TELEGRAM_BOT_TOKEN = botToken;
const profiles = {
    '101': { name: 'Гость', userId: 101 },
    '102': { name: 'Участник', userId: 102 },
    '104': { name: 'Ранее награждён', userId: 104 },
};
const members = { '102': { user_id: '102', hikes_count: 0 } };
const records = {}, revisions = {};
let writes = 0, profileReadFails = false;
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const version = id => revisions[id] ? `version_${revisions[id]}` : 'null_etag';
const handler = createHandler({ getAccessToken: async () => 'fake-db-token', fetch: async (url, options = {}) => {
    const path = new URL(url).pathname.slice(1).replace(/\.json$/, '');
    assert.equal(options.headers.Authorization, 'Bearer fake-db-token');
    if (path === 'clubAchievements') return Response.json(copy(records));
    if (path === 'hikes' || path.startsWith('userRegistrations/')) return Response.json({});
    if (path.startsWith('members/')) return Response.json(copy(members[path.split('/')[1]]));
    if (path.startsWith('userProfiles/')) {
        if (profileReadFails) return new Response('', { status: 503 });
        return Response.json(copy(profiles[path.split('/')[1]]));
    }
    const match = /^clubAchievements\/([0-9a-f-]+)$/.exec(path);
    assert.ok(match, `Unexpected database path: ${path}`);
    const id = match[1];
    if (options.method === 'PUT') {
        if (options.headers['If-Match'] !== version(id)) return new Response('', { status: 412 });
        records[id] = JSON.parse(options.body); revisions[id] = (revisions[id] || 0) + 1; writes++;
        return Response.json(copy(records[id]));
    }
    return Response.json(copy(records[id]), { headers: { etag: version(id) } });
} });
function signed(id) {
    const params = new URLSearchParams({ user: JSON.stringify({ id, first_name: `Тест ${id}` }), auth_date: String(Math.floor(Date.now() / 1000)) });
    const data = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(data).digest('hex'));
    return params.toString();
}
async function claim(id, extra = {}) {
    const out = {};
    await handler({ method: 'POST', body: { action: 'claim', initData: signed(id), ...extra } }, {
        setHeader() {}, status(status) { out.status = status; return this; }, json(body) { out.body = body; return this; },
    });
    return out;
}
const grants = id => Object.values(records).filter(record => record.title === 'показал себя клубу' && record.grants?.[id]?.issuedAt);

(async () => {
    const guest = await claim(101);
    assert.equal(guest.status, 200);
    assert.ok(guest.body.granted.includes('показал себя клубу'), 'First saved guest profile earns the badge even when other auto-awards are disabled');
    assert.equal(grants('101').length, 1);
    const award = grants('101')[0];
    assert.equal(award.medal.imageUrl, '/assets/achievements/badges/profile-v2.png');
    assert.equal(award.publicationStatus, 'published');
    assert.equal((await claim(101)).body.granted.includes('показал себя клубу'), false, 'Editing cannot award the same badge twice');
    assert.equal(grants('101').length, 1);

    const cardHolder = await claim(102);
    assert.equal(cardHolder.status, 200);
    assert.ok(cardHolder.body.granted.includes('показал себя клубу'), 'Card ownership is not required or disqualifying');
    assert.equal(grants('102')[0].id, award.id, 'Both groups share the same badge definition');

    const absent = await claim(103);
    assert.equal(absent.status, 200);
    assert.ok(!absent.body.granted.includes('показал себя клубу'), 'First app open without a saved profile is not enough');
    assert.equal(grants('103').length, 0);
    profiles['103'] = { name: 'Позже', userId: 103 };
    assert.ok((await claim(103)).body.granted.includes('показал себя клубу'), 'Saving after the initial claim awards on the next claim');

    const [parallelA, parallelB] = await Promise.all([claim(104), claim(104)]);
    assert.equal(parallelA.status, 200);
    assert.equal(parallelB.status, 200);
    assert.equal(grants('104').length, 1, 'Concurrent claims are idempotent');
    assert.equal([parallelA, parallelB].filter(r => r.body.granted.includes('показал себя клубу')).length, 1);
    profileReadFails = true;
    profiles['105'] = { name: 'Ошибка', userId: 105 };
    const failed = await claim(105);
    assert.equal(failed.status, 200, 'A profile lookup outage must not block the welcome badge');
    assert.ok(failed.body.granted.includes('добро пожаловать'));
    assert.equal(grants('105').length, 0);
    profileReadFails = false;
    assert.ok((await claim(105)).body.granted.includes('показал себя клубу'));
    assert.ok(writes > 0);
    console.log('Profile achievement: authenticated guest/member, verified profile, existing profiles, concurrent idempotency and retry passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
