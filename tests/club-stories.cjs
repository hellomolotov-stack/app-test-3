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
    if (opts.method === 'PATCH') {
        for (const [path, value] of Object.entries(JSON.parse(opts.body))) {
            const [first, ...rest] = path.split('/');
            let target = node[leaf] ||= {};
            let key = first;
            for (const next of rest) { target = target[key] ||= {}; key = next; }
            if (value === null) delete target[key];
            else target[key] = value;
        }
    }
    else if (opts.method === 'PUT') node[leaf] = JSON.parse(opts.body);
    return Response.json(structuredClone(node[leaf] ?? null));
};

(async () => {
    db.hikeBadges[date] = { done: { at: now, people: [{ userId: '101' }] } };
    db.clubAchievements.rain = { title: 'промок, но дошёл', medal: { imageUrl: '/assets/achievements/badges/rain.png' },
        grants: { '101': { date, issuedAt: now } } };
    assert.equal(await autoScan('test-token'), 1);
    assert.equal(db.clubStories[`auto_badges_${date}`], undefined);
    assert.equal(db.clubStories[expected.id].status, 'published');
    db.clubStories[expected.id].views = { reader: now };
    assert.equal(await autoScan('test-token'), 0, 'Do not duplicate a letter or overwrite its views');
    assert.equal(db.clubStories[expected.id].views.reader, now);
    db.clubStories[expected.id].status = 'hidden';
    assert.equal(await autoScan('test-token'), 0, 'Do not republish a hidden letter');
    db.clubStories.old_member = { id: 'old_member', type: 'member', status: 'published', title: 'Новый участник', image: '/assets/card.png', button: { label: 'записаться на хайк', action: 'hike' } };
    assert.deepEqual((await storiesFor('test-token', 'reader'))[0].button, { label: 'узнать о карте', action: 'card' });
    await adminSave('test-token', { ...expected, id: 'manual_letter', op: 'publish', days: 7 }, 'admin');
    assert.equal(db.clubStories.manual_letter.type, 'letter');
    assert.equal(db.clubStories.manual_letter.button.action, expected.button.action);
    db.members = { '101': { user_id: '101', user_name: 'Новый участник' },
        '102': { user_id: '102', card_image_url: '/assets/assigned.png' } };
    db.pending_payments = { new: { user_id: '101', ts: now / 1000, completed: true, card_type: 'permanent' } };
    db.clubStories.auto_card_102 = { id: 'auto_card_102', type: 'member', source: 'auto', status: 'published',
        title: 'Существующая сторис', text: 'Ручной текст', views: { reader: now } };
    await autoScan('test-token');
    assert.equal(db.clubStories.auto_card_101.status, 'draft');
    assert.equal(db.clubStories.auto_card_101.awaiting_card_image, true);
    assert.equal(db.clubStories.auto_card_102.image, '/assets/assigned.png');
    assert.equal(db.clubStories.auto_card_102.text, 'Ручной текст');
    assert.equal(db.clubStories.auto_card_102.views.reader, now);
    assert(!(await storiesFor('test-token', 'reader')).some(story => story.id === 'auto_card_101'));
    await assert.rejects(adminSave('test-token', { ...db.clubStories.auto_card_101, op: 'publish' }, 'admin'), /сначала присвой/);
    db.pending_payments = {};
    db.members['101'].card_image_url = '/assets/new-card.png';
    await autoScan('test-token');
    assert.equal(db.clubStories.auto_card_101.status, 'published');
    assert.equal(db.clubStories.auto_card_101.image, '/assets/new-card.png');
    assert.equal(db.clubStories.auto_card_101.awaiting_card_image, undefined);
    db.clubStories.auto_card_101.status = 'hidden';
    await autoScan('test-token');
    assert.equal(db.clubStories.auto_card_101.status, 'hidden');
    console.log('Club stories: latest letter, safe actions, publication and idempotency: PASS');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
