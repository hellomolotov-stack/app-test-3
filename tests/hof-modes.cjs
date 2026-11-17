const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../js/ui/hof-session.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.replaceAll('export ', '') + '\nthis.helpers = { createHoldTracker, personalHofSessions };', context);
const { createHoldTracker, personalHofSessions } = context.helpers;
let time = 0;
const personal = createHoldTracker('personal', () => time);
personal.begin(1); time = 38200; personal.confirm();
personal.confirm();
assert.equal(personal.holds[0], 38, 'Double tap does not replace the confirmed result');
personal.begin(2); time += 30000; personal.begin(2); time += 45000;
assert.equal(personal.elapsed(), 75, 'Media events do not restart the clock while voice waits');
personal.confirm();
personal.begin(3); time += 120000; personal.discard(); personal.confirm();
assert.equal(personal.holds.length, 2, 'Leaving an unfinished hold creates no personal result');
personal.begin(3); time += 94000; personal.confirm();
assert.deepEqual(Array.from(personal.holds), [38, 75, 94]);
const guided = createHoldTracker('guided', () => time);
guided.begin(1); time += 26100; guided.confirm(); guided.discard();
assert.equal(guided.holds.length, 0, 'Voice timing cannot become a personal record');
assert.equal(personalHofSessions([{ holds: [91] }, { mode: 'legacy', holds: [90] }, { mode: 'guided', holds: [60] }, { mode: 'personal', holds: [38] }]).length, 1);

// Exercise persistence and badge eligibility with a mocked database, no application or browser.
const BOT = 'test:hof-modes';
process.env.TELEGRAM_BOT_TOKEN = BOT;
const authPath = require.resolve('../api/club-content.js');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { getAccessToken: async () => 'test-db-token' } };
const handler = require('../api/me.js');
const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 555, first_name: 'Тест' }) });
const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
let stored, badgeWrites = 0;
global.fetch = async (url, options = {}) => {
    const key = new URL(url).pathname;
    if (options.method === 'PUT') { stored = JSON.parse(options.body); return { ok: true, json: async () => stored }; }
    if (options.method === 'PATCH') { badgeWrites++; return { ok: true, json: async () => ({}) }; }
    return { ok: true, json: async () => key === '/hof/555.json' ? { test: stored } : null };
};
async function save(value) {
    let status, payload;
    await handler({ method: 'POST', body: { action: 'hof', op: 'save', initData: params.toString(), ...value } }, {
        setHeader() {}, status(code) { status = code; return this; }, json(data) { payload = data; return this; },
    });
    assert.equal(status, 200);
    return payload;
}
(async () => {
    await save({ mode: 'guided', holds: [26, 60, 91], rounds: 3, done: true, duration: 610 });
    assert.equal(stored.mode, 'guided'); assert.deepEqual(stored.holds, []);
    assert.equal(stored.rounds, 3); assert.equal(stored.duration, 610);
    assert.equal(badgeWrites, 1, 'Guided practice still qualifies as a completed session');
    await save({ mode: 'personal', holds: [38, 75, 94], rounds: 3, done: true, duration: 660 });
    assert.deepEqual(stored.holds, [38, 75, 94]); assert.equal(badgeWrites, 2);
    await save({ mode: 'personal', holds: [38], rounds: 1, done: false });
    assert.equal(badgeWrites, 2, 'Partial practice does not grant a complete-session badge');
    await save({ holds: [26, 60, 91], rounds: 3, done: false });
    assert.equal(stored.mode, 'legacy', 'Old clients remain compatible and separate from new personal records');
    console.log('PASS Hof modes: clocks, confirmation, unfinished holds, records, persistence and badges');
})().catch(error => { console.error(error); process.exit(1); });
