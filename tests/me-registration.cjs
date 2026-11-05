// /api/me: лёгкий статус и запись без оплаты через сервер (register / unregister).
// Firebase и токен Google подменены: проверяем, что и куда пишет сервер, и кому он отказывает.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const BOT = '123:test-token';
process.env.TELEGRAM_BOT_TOKEN = BOT;

// токен Google не нужен – подменяем модуль до загрузки api/me.js
const clubContentPath = require.resolve(path.join(__dirname, '..', 'api', 'club-content.js'));
require.cache[clubContentPath] = { id: clubContentPath, filename: clubContentPath, loaded: true, exports: { getAccessToken: async () => 'test-token' } };
const handler = require('../api/me.js');

function initData(user) {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), query_id: 'q' });
    const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
    return params.toString();
}

const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
const future = new Date(Date.now() + 3 * 3600 * 1000 + 5 * 86400000).toISOString().slice(0, 10);
const past = new Date(Date.now() + 3 * 3600 * 1000 - 5 * 86400000).toISOString().slice(0, 10);

function db(data) {
    const patches = [];
    global.fetch = async (url, options = {}) => {
        const u = new URL(url);
        if (options.method === 'PATCH') {
            patches.push(JSON.parse(options.body));
            return { ok: !data.patchFails, status: data.patchFails ? 500 : 200, json: async () => ({}) };
        }
        const key = decodeURIComponent(u.pathname.replace(/^\//, '').replace(/\.json$/, ''));
        return { ok: true, status: 200, json: async () => (key in data ? data[key] : null) };
    };
    return patches;
}

async function call(body) {
    let status = 0, payload = null;
    const res = { setHeader() {}, status(code) { status = code; return this; }, json(obj) { payload = obj; return this; } };
    await handler({ method: 'POST', body }, res);
    return { status, payload };
}

(async () => {
    const owner = { id: 555, first_name: 'Аня', photo_url: 'https://t.me/i/u.jpg' };
    const guest = { id: 777, first_name: 'Гость' };
    const hikes = {
        [`hikes/${future}`]: { title: 'хайк на Кант' },
        [`hikes/${today}`]: { title: 'хайк сегодня' },
        [`hikes/${past}`]: { title: 'прошедший' },
        'hikes/2099-01-01': { title: 'отменён', cancelled: 'yes' },
        'hikes/2099-02-01': { title: 'пицца', city: 'yes' },
    };

    // status: только карта и записи
    let patches = db({ ...hikes, 'members/555': { user_id: 555, card_image_url: 'card.jpg' }, 'userRegistrations/555': { [future]: true } });
    let r = await call({ initData: initData(owner), action: 'status' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.payload, { uid: '555', card: { status: 'active', cardUrl: 'card.jpg' }, regs: { [future]: true } });

    // владелец карты записывается: участник + отметка, одним обновлением
    r = await call({ initData: initData(owner), action: 'register', date: future });
    assert.equal(r.status, 200);
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0][`hikeParticipants/${future}/555`], { userId: 555, name: 'Аня', photoUrl: 'https://t.me/i/u.jpg', timestamp: { '.sv': 'timestamp' } });
    assert.equal(patches[0][`userRegistrations/555/${future}`], true);

    // сегодняшний хайк ещё можно, прошедший и отменённый – нет, несуществующий – 404
    assert.equal((await call({ initData: initData(owner), action: 'register', date: today })).status, 200);
    assert.equal((await call({ initData: initData(owner), action: 'register', date: past })).payload.code, 'REGISTRATION_CLOSED');
    assert.equal((await call({ initData: initData(owner), action: 'register', date: '2099-01-01' })).payload.code, 'CANCELLED');
    assert.equal((await call({ initData: initData(owner), action: 'register', date: '2099-03-03' })).status, 404);
    assert.equal((await call({ initData: initData(owner), action: 'register', date: 'bad' })).status, 400);

    // гость без карты на хайк – отказ, на городское событие – можно
    patches = db({ ...hikes });
    r = await call({ initData: initData(guest), action: 'register', date: future });
    assert.equal(r.status, 403);
    assert.equal(r.payload.code, 'CARD_REQUIRED');
    assert.equal(patches.length, 0, 'Refusal writes nothing');
    assert.equal((await call({ initData: initData(guest), action: 'register', date: '2099-02-01' })).status, 200);

    // отмена: владельцу снимаем и отметку, гостю отметку о билете оставляем
    patches = db({ ...hikes, 'members/555': { user_id: 555 } });
    await call({ initData: initData(owner), action: 'unregister', date: future });
    assert.deepEqual(patches.at(-1), { [`hikeParticipants/${future}/555`]: null, [`userRegistrations/555/${future}`]: false });
    patches = db({ ...hikes });
    await call({ initData: initData(guest), action: 'unregister', date: future });
    assert.deepEqual(patches.at(-1), { [`hikeParticipants/${future}/777`]: null });

    // чужая или поддельная подпись – 401; сбой базы – 502, без «успеха»
    assert.equal((await call({ initData: initData(owner).replace(/hash=[^&]+/, 'hash=00'), action: 'register', date: future })).status, 401);
    db({ ...hikes, 'members/555': { user_id: 555 }, patchFails: true });
    assert.equal((await call({ initData: initData(owner), action: 'register', date: future })).status, 502);

    console.log('me registration passed: status, register/unregister rules, refusals, signature, db failure');
})().catch(error => { console.error(error); process.exit(1); });
