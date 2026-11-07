const assert = require('node:assert/strict');
const { latestLetterStory, autoScan, storiesFor, adminSave } = require('../lib/club-stories');

const now = Date.now();
const date = new Date(now + 3 * 3600000 - 86400000).toISOString().slice(0, 10);
const future = new Date(now + 3 * 3600000 + 86400000).toISOString().slice(0, 10);
const hikes = {
    [date]: { title: 'хайк на Демерджи', letter_link: 'https://t.me/yaltahikingchat/6014', letter_text: 'Интеллигенты, это был наш хайк. '.repeat(20) },
    [future]: { title: 'будущий хайк', letter_link: 'https://t.me/yaltahikingchat/7000' },
    '2025-01-01': { title: 'старый хайк', letter_link: 'https://t.me/yaltahikingchat/1' },
};
const expected = latestLetterStory(hikes, now);
assert.equal(expected.id, `auto_letter_${date}`);
assert.equal(expected.type, 'letter');
assert.equal(expected.title, 'письмо с хайка · Демерджи');
assert.equal(expected.button.action, 'letter:https://t.me/yaltahikingchat/6014');
assert.ok(expected.text.length <= 240 && expected.text.endsWith('…'));
assert.equal(latestLetterStory({}, now), null);
assert.equal(latestLetterStory({ [date]: { letter_link: 'https://t.me.evil.invalid/chat/1' } }, now), null);
assert.equal(latestLetterStory({ [date]: { letter_link: 'https://t.me/yaltahikingchat/6014' } }, now).text, '');

const db = { hikes, clubStories: {}, pending_payments: {}, mmNotes: {}, hikeBadges: {}, clubAchievements: {} };
const originalFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
    assert.equal(opts.headers.Authorization, 'Bearer test-token');
    const parts = new URL(url).pathname.replace(/^\//, '').replace(/\.json$/, '').split('/');
    const leaf = parts.pop();
    let node = db;
    for (const p of parts) node = node[p] ||= {};
    if (opts.method === 'PATCH') Object.assign(node[leaf] ||= {}, JSON.parse(opts.body));
    else if (opts.method === 'PUT') node[leaf] = JSON.parse(opts.body);
    return Response.json(structuredClone(node[leaf] ?? null));
};

(async () => {
    assert.equal(await autoScan('test-token'), 1);
    assert.equal(db.clubStories[expected.id].status, 'published');
    db.clubStories[expected.id].views = { reader: now };
    assert.equal(await autoScan('test-token'), 0, 'Do not duplicate a letter or overwrite its views');
    assert.equal(db.clubStories[expected.id].views.reader, now);
    db.clubStories[expected.id].status = 'hidden';
    assert.equal(await autoScan('test-token'), 0, 'Do not republish a hidden letter');
    db.clubStories.old_member = { id: 'old_member', type: 'member', status: 'published', title: 'Новый участник', button: { label: 'записаться на хайк', action: 'hike' } };
    assert.deepEqual((await storiesFor('test-token', 'reader'))[0].button, { label: 'узнать о карте', action: 'card' });
    await adminSave('test-token', { ...expected, id: 'manual_letter', op: 'publish', days: 7 }, 'admin');
    assert.equal(db.clubStories.manual_letter.type, 'letter');
    assert.equal(db.clubStories.manual_letter.button.action, expected.button.action);
    console.log('Club stories: latest letter, safe actions, publication and idempotency: PASS');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
