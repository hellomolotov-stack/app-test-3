// api/me.js – статус карты и записи человека одним запросом с нашего домена.
// Замеры 08–10.10: Firebase SDK качается быстро, а первое соединение телефона с базой
// (Google, Европа) занимает 3–6 с, у каждого пятого 10+ с. Сервер Vercel ходит в базу
// за доли секунды, поэтому главная узнаёт «карта есть / нет» почти сразу.
// Firebase в приложении остаётся – для живых обновлений и как запасной путь, если тут ошибка.
const { verifyInitData } = require('./tg-auth');
const { getAccessToken } = require('./club-content');

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

// Личное спецпредложение карты (card_offers/<id>, включает админка «новички») + общие настройки
// баннера (card_offer_settings). Логика – как activeCardOffer_/cardOfferSettings_ в Apps Script.
const OFFER_DEFAULTS = { price: 5000, full_price: 7500, days: 3, title: 'карта интеллигента за [цена]', text: 'для тех, кто уже ходил с нами · ещё [срок]' };
async function offerFor(id, token) {
    try {
        const o = await read(`card_offers/${id}`, token);
        if (!o || o.used_at || o.closed_at || !(Number(o.expires_at) * 1000 > Date.now())) return null;
        const s = (await read('card_offer_settings', token)) || {};
        const num = (v, def) => { const n = Math.round(Number(v)); return n >= 100 && n <= 100000 ? n : def; };
        return {
            price: num(s.price, OFFER_DEFAULTS.price),
            full_price: num(s.full_price, OFFER_DEFAULTS.full_price),
            expires_at: Number(o.expires_at),
            title: String(s.title || OFFER_DEFAULTS.title).slice(0, 80),
            text: String(s.text != null ? s.text : OFFER_DEFAULTS.text).slice(0, 160),
        };
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
        const [member, regs, passes, offer] = await Promise.all([
            read(`members/${id}`, token),
            read(`userRegistrations/${id}`, token),
            passesFor(id, token),
            offerFor(id, token),
        ]);
        // тот же вид, что отдаёт loadUserData() в js/firebase.js
        const card = member && member.user_id
            ? { status: 'active', hikes: member.hikes_count || 0, cardUrl: member.card_image_url || '' }
            : { status: 'inactive', hikes: 0, cardUrl: '' };
        return res.status(200).json({ uid: id, card, regs: regs || {}, passes, offer: card.status === 'active' ? null : offer });
    } catch (e) {
        console.error('me:', e.message);
        return res.status(502).json({ error: 'db unavailable' });
    }
};
