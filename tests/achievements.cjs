const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler } = require('../api/achievements');

const token = 'test-only-achievement-token';
process.env.TELEGRAM_BOT_TOKEN = token;
const records = {};
const versions = {};
let calls = 0, writes = 0, failNextWrite = false;
const profiles = { '101': { name: 'Анна', username: 'anna' }, '102': { name: 'Илья <script>', username: 'ilya' } };
const members = { '101': { user_id: '101', first_name: 'Аня' }, '103': { user_id: '103', first_name: 'Максим', last_name: 'Молотов' } };
const participants = { '104': { name: 'Гость без профиля', timestamp: 1 }, '101': { name: 'Анна', timestamp: 2 } };
const copy = value => JSON.parse(JSON.stringify(value));
const etag = id => versions[id] ? `version_${versions[id]}` : 'null_etag';
const handler = createHandler({ getAccessToken: async () => 'test-db-token', fetch: async (url, options = {}) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer test-db-token');
    const path = String(url).split('.app/')[1]?.replace(/\.json$/, '');
    if (path === 'userProfiles') return Response.json(profiles);
    if (path === 'members') return Response.json(members);
    if (path === 'hikeParticipants/2026-10-25') return Response.json(participants);
    if (path === 'clubAchievements') return Response.json(records);
    if (path?.startsWith('app_users')) return Response.json({ '101': true, '102': true });
    if (path?.startsWith('userRegistrations/') || path === 'hikes') return Response.json({});
    if (path === 'achievementNotices' || path?.startsWith('hikeAttendance/') || path?.startsWith('achievementSeen/')) {
        if (options.method === 'PATCH') return Response.json({});
        return Response.json(null);
    }
    if (path?.startsWith('members/')) return Response.json(members[path.split('/')[1]] || null);
    if (path?.startsWith('userProfiles/')) return Response.json(profiles[path.split('/')[1]] || null);
    const match = /^clubAchievements\/([0-9a-f-]+)$/.exec(path);
    assert.ok(match, 'Only fixed achievement/person registry paths are requested');
    const id = match[1];
    if (options.method === 'PUT') {
        if (failNextWrite) { failNextWrite = false; return new Response('', { status: 503 }); }
        if (options.headers['If-Match'] !== etag(id)) return new Response('', { status: 412 });
        records[id] = JSON.parse(options.body); versions[id] = (versions[id] || 0) + 1; writes++;
        return Response.json(records[id]);
    }
    return Response.json(copy(records[id] || null), { headers: { etag: etag(id) } });
} });
function signed(id = 163665735, username = 'maxmolotov', age = 0) {
    const params = new URLSearchParams({ user: JSON.stringify({ id, username }), auth_date: String(Math.floor(Date.now() / 1000) - age) });
    const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
    return params.toString();
}
async function call(body, method = 'POST') {
    const output = { headers: {} };
    await handler({ method, body }, { setHeader(k, v) { output.headers[k] = v; }, status(code) { output.status = code; return this; }, json(value) { output.body = value; return this; } });
    return output;
}
const auth = signed();
const draft = { title: 'залез в пещеру пауков', rarity: 'mythical', kind: 'special', hikeDate: '2026-10-25', date: '2026-10-25',
    recipients: [{ userId: '101', name: 'Анна', date: '2026-10-25' }, { userId: '104', name: 'Гость', date: '2026-10-24' }] };
const save = (id = crypto.randomUUID(), value = draft, revision = 'null_etag') => ({ action: 'save', id, requestId: crypto.randomUUID(), revision, draft: copy(value), initData: auth });

(async () => {
    assert.equal((await call({}, 'GET')).status, 405);
    assert.equal((await call({ action: 'list' })).status, 401);
    assert.equal((await call({ action: 'list', initData: signed(999, 'maxmolotov') })).status, 403, 'A stolen admin username grants no permissions');
    assert.equal((await call({ action: 'list', initData: signed(999, 'visitor') })).status, 403);
    assert.equal((await call({ action: 'list', initData: signed(163665735, 'maxmolotov', 8 * 86400) })).status, 401);
    assert.equal(calls, 0, 'Authorization occurs before any database I/O');
    assert.equal((await call({ action: 'list', initData: signed(7845375334, 'hellointelligent') })).status, 200);
    const first = await call({ action: 'list', initData: auth });
    assert.equal(first.headers['Cache-Control'], 'no-store');
    assert.equal(first.body.people.find(p => p.userId === '103').name, 'Максим Молотов');
    assert.equal(first.body.people.find(p => p.userId === '101').name, 'Анна', 'Profile name takes priority');
    assert.equal(first.body.achievements.length, 0);
    const roster = await call({ action: 'roster', hikeDate: '2026-10-25', initData: auth });
    assert.deepEqual(roster.body.people.filter(p => p.registered).map(p => p.userId).sort(), ['101', '104']);
    assert.equal((await call({ action: 'roster', hikeDate: '../members', initData: auth })).status, 400);
    assert.equal((await call({ action: 'roster', hikeDate: '2026-02-30', initData: auth })).status, 400);
    const invalid = save();
    for (const revision of ['*', '"*"', '', null, 'null_etag\r\nX: test', 'a,b']) {
        assert.equal((await call({ ...invalid, revision })).status, 400);
    }
    assert.equal((await call({ ...invalid, id: '../members' })).status, 400);
    assert.equal((await call({ ...invalid, id: [invalid.id] })).status, 400);
    for (const value of [
        { ...draft, title: '' }, { ...draft, title: 'x'.repeat(121) }, { ...draft, rarity: 'admin' },
        { ...draft, date: '2026-02-30' }, { ...draft, kind: 'all' }, { ...draft, recipients: [] },
        { ...draft, recipients: [draft.recipients[0], draft.recipients[0]] },
        { ...draft, recipients: [{ userId: '../members', name: 'test' }] },
        { ...draft, recipients: [{ userId: '101', name: 'test\ninvalid' }] },
    ]) assert.equal((await call({ ...invalid, draft: value })).status, 400);
    assert.equal(writes, 0);
    assert.equal((await call(save(undefined, { ...draft, recipients: [{ userId: '999999', name: 'Unknown' }] }))).status, 400);

    const request = save();
    const created = await call(request);
    assert.equal(created.status, 200);
    assert.equal(created.body.achievement.status, 'draft');
    assert.equal(created.body.achievement.medal, null);
    assert.equal(records[request.id].publicationStatus, 'draft');
    assert.deepEqual(records[request.id].grants, {}, 'Save stores a private draft, not any profile grants');
    assert.equal(records[request.id].publishedAt, null);
    assert.equal(records[request.id].recipients['101'].issuedAt, undefined, 'Planned recipients have no issue timestamp');
    assert.equal(records[request.id].recipients['101'].issuedBy, undefined);
    assert.equal(created.body.achievement.recipients['104'].date, '2026-10-24', 'Personal date is editable');
    assert.deepEqual(Object.keys(created.body.achievement.recipients).sort(), ['101', '104'], 'Never awards every registered person implicitly');
    assert.ok(!('lastWrite' in created.body.achievement));
    assert.equal((await call(request)).body.replayed, true);
    assert.equal(writes, 1, 'Retry after lost response is idempotent');
    assert.equal((await call({ ...request, draft: { ...draft, title: 'другая ачивка' } })).status, 409, 'Request ID cannot be reused with changed contents');
    const get = await call({ action: 'get', id: request.id, initData: auth });
    const update = save(request.id, { ...draft, recipients: [{ userId: '103', name: 'Макс', date: '2026-10-23' }] }, get.body.revision);
    const updated = await call(update);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.achievement.createdAt, created.body.achievement.createdAt);
    assert.deepEqual(Object.keys(updated.body.achievement.recipients), ['103'], 'Removed recipients are revoked atomically');
    assert.equal((await call({ ...update, requestId: crypto.randomUUID() })).status, 409, 'Stale editor cannot overwrite another save');

    const medal = { action: 'set_medal', id: request.id, requestId: crypto.randomUUID(), revision: etag(request.id), initData: auth,
        medal: { imageUrl: '/assets/achievements/spider-v1.webp', modelUrl: '/assets/achievements/spider-v1.glb' } };
    for (const imageUrl of ['https://evil.invalid/x.png', '/assets/achievements/../members.png', 'javascript:alert(1)', '/assets/achievements/test.svg', '/assets/achievements/a//b.png']) {
        assert.equal((await call({ ...medal, medal: { imageUrl } })).status, 400);
    }
    const attached = await call(medal);
    assert.equal(attached.status, 200);
    assert.equal(attached.body.achievement.status, 'ready');
    assert.equal(records[request.id].publicationStatus, 'published');
    assert.ok(records[request.id].publishedAt > 0);
    assert.equal(records[request.id].grants['103'].issuedAt, records[request.id].medal.attachedAt, 'First actual issue occurs at attachment time');
    assert.equal(records[request.id].grants['103'].issuedBy, '163665735');
    assert.equal(attached.body.achievement.recipients['103'].name, 'Макс');
    assert.equal((await call(medal)).body.replayed, true, 'Attachment also has safe retries');
    const more = save(request.id, { ...draft, recipients: [...draft.recipients, { userId: '103', name: 'Максим' }] }, etag(request.id));
    assert.equal((await call(more)).body.achievement.status, 'ready', 'New recipients share already attached art');
    assert.equal(Object.keys(records[request.id].recipients).length, 3);
    assert.equal(Object.keys(records[request.id].grants).length, 3);
    assert.equal((await call(save(request.id, { ...draft, rarity: 'rare' }, etag(request.id)))).body.achievement.medal, null, 'A changed design never keeps obsolete medal art');
    assert.deepEqual(records[request.id].grants, {}, 'Without a current medal it is a draft again, not a profile award');
    const concurrent = etag(request.id);
    const results = await Promise.all([call(save(request.id, { ...draft, title: 'первая правка' }, concurrent)), call(save(request.id, { ...draft, title: 'вторая правка' }, concurrent))]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409], 'CAS prevents simultaneous overwrites');
    failNextWrite = true;
    const retry = save();
    assert.equal((await call(retry)).status, 502);
    assert.equal(records[retry.id], undefined, 'Failed write never reports success');
    assert.equal((await call(retry)).status, 200);
    assert.equal((await call({ action: 'get', id: crypto.randomUUID(), initData: auth })).status, 404);
    const list = await call({ action: 'list', initData: auth });
    assert.equal(list.body.achievements.length, 2);
    const legacyId = crypto.randomUUID();
    records[legacyId] = { ...created.body.achievement, id: legacyId, schemaVersion: 1, publicationStatus: undefined,
        recipients: { '101': { userId: '101', name: 'Анна', date: '2026-10-25', issuedAt: 100, issuedBy: '163665735' } }, medal: null };
    const legacy = await call({ action: 'get', id: legacyId, initData: auth });
    assert.equal(legacy.body.achievement.status, 'draft', 'Pre-change awards without medals are also private drafts');
    assert.deepEqual(legacy.body.achievement.grants, {});
    assert.equal(legacy.body.achievement.recipients['101'].issuedAt, undefined);
    const legacyAttached = await call({ ...medal, id: legacyId, revision: 'null_etag', requestId: crypto.randomUUID() });
    assert.equal(legacyAttached.status, 200);
    assert.ok(legacyAttached.body.achievement.grants['101'].issuedAt > 100, 'Legacy draft issue timestamp is not reused');
    const own = await call({ action: 'collection', initData: signed(101, 'anna') });
    assert.equal(own.status, 200);
    assert.deepEqual(Object.keys(own.body.collections), ['101']);
    assert.equal(own.body.collections['101'].length, 1, 'Only the published medal, never unrendered drafts');
    const publicMedal = own.body.collections['101'][0];
    assert.deepEqual(Object.keys(publicMedal).sort(), ['description', 'grant', 'holders', 'id', 'kind', 'medal', 'rarity', 'seenAt', 'title']);
    assert.equal(publicMedal.grant.name, 'Анна');
    assert.equal(publicMedal.grant.date, '2026-10-25');
    assert.ok(!('attachedBy' in publicMedal.medal));
    assert.ok(!('issuedBy' in publicMedal.grant));
    assert.equal((await call({ action: 'collection', userIds: ['101'], initData: signed(999, 'visitor') })).status, 403, 'Guests cannot enumerate member awards');
    assert.equal((await call({ action: 'collection', userIds: ['101'], initData: signed(103, 'member_without_profile') })).status, 403);
    assert.equal((await call({ action: 'collection', userIds: ['101', '103'], initData: signed(101, 'anna') })).status, 200);
    assert.deepEqual((await call({ action: 'collection', initData: signed(999, 'visitor') })).body.collections, { '999': [] }, 'Any authenticated user can view only their own published awards');
    for (const userIds of [[], ['../members'], [101], Array(201).fill('101')]) {
        assert.equal((await call({ action: 'collection', userIds, initData: auth })).status, 400);
    }
    const noGrant = crypto.randomUUID();
    records[noGrant] = { ...records[legacyId], id: noGrant, grants: {} };
    assert.equal((await call({ action: 'collection', initData: signed(101, 'anna') })).body.collections['101'].length, 1, 'A medal definition without a personal grant is not an award');
    console.log('Achievements API passed: protected private drafts with no grants, publication only with medal, legacy draft compatibility, auth, validation, safe retries, CAS and personal engraving');
})().catch(error => { console.error(error); process.exitCode = 1; });
