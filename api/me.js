// api/me.js – статус карты и записи человека одним запросом с нашего домена.
// Замеры 08–10.10: Firebase SDK качается быстро, а первое соединение телефона с базой
// (Google, Европа) занимает 3–6 с, у каждого пятого 10+ с. Сервер Vercel ходит в базу
// за доли секунды, поэтому главная узнаёт «карта есть / нет» почти сразу.
// Firebase в приложении остаётся – для живых обновлений и как запасной путь, если тут ошибка.
const { verifyInitData } = require('./tg-auth');
const { getAccessToken } = require('./club-content');
const { hikeCount } = require('../lib/hike-count');

const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';

async function read(path, token) {
    const r = await fetch(`${DB}/${path}.json`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
}

// Личные ссылки «место сверх лимита», которые человек уже открывал (passlinks/<код>/opens/<id>),
// на ещё не прошедшие хайки: { 'YYYY-MM-DD': код }. Так пропуск работает на любом устройстве,
// а не только там, где открыли ссылку. Сбой здесь не мешает главному ответу.
async function passesFor(id, token) {
    try {
        const all = (await read('passlinks', token)) || {};
        const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); // МСК
        const out = {};
        Object.entries(all).forEach(([code, p]) => {
            if (p && p.opens && p.opens[id] && /^\d{4}-\d{2}-\d{2}$/.test(p.hike_date || '') && p.hike_date >= today) {
                out[p.hike_date] = code;
            }
        });
        return out;
    } catch (e) {
        console.error('me passes:', e.message);
        return {};
    }
}

// Предложение карты (логика – как activeCardOffer_ в Apps Script). С 22.10.2026 оно только одно –
// личное приглашение в близкий круг из админки «💳 продажа карты»: card_offers/<id> с kind 'circle',
// личной ценой (карта минус оплаченные билеты) и сроком. Автоматической спеццены после хайка больше нет.
const FULL_PRICE = 7500;
async function offerFor(id, token) {
    try {
        const o = await read(`card_offers/${id}`, token);
        if (!o || o.used_at || o.closed_at || o.kind !== 'circle' || !o.price) return null;
        if (!(Number(o.expires_at) * 1000 > Date.now())) return null;
        return { kind: 'circle', price: Number(o.price), full_price: FULL_PRICE, expires_at: Number(o.expires_at),
            tickets_count: o.tickets_count || 0, tickets_sum: o.tickets_sum || 0 };
    } catch (e) {
        console.error('me offer:', e.message);
        return null;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(503).json({ error: 'not configured' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const user = verifyInitData(String((body && body.initData) || ''), botToken);
    if (!user || !user.id) return res.status(401).json({ error: 'bad initData' });

    try {
        const id = String(user.id);
        const token = await getAccessToken();
        const regsP = read(`userRegistrations/${id}`, token);
        const [member, regs, passes, offer] = await Promise.all([
            read(`members/${id}`, token),
            regsP,
            passesFor(id, token),
            offerFor(id, token),
        ]);
        // тот же вид, что отдаёт loadUserData() в js/firebase.js
        // пройдено хайков – и с картой, и без: история до приложения + хайки через приложение
        const hikes = await hikeCount(id, token, { member }).catch(() => Number(member?.hikes_count) || 0);
        const card = member && member.user_id
            ? { status: 'active', hikes, cardUrl: member.card_image_url || '' }
            : { status: 'inactive', hikes, cardUrl: '' };
        return res.status(200).json({ uid: id, card, regs: regs || {}, passes, offer: card.status === 'active' ? null : offer });
    } catch (e) {
        console.error('me:', e.message);
        return res.status(502).json({ error: 'db unavailable' });
    }
};
