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
        const [member, regs] = await Promise.all([
            read(`members/${id}`, token),
            read(`userRegistrations/${id}`, token),
        ]);
        // тот же вид, что отдаёт loadUserData() в js/firebase.js
        const card = member && member.user_id
            ? { status: 'active', hikes: member.hikes_count || 0, cardUrl: member.card_image_url || '' }
            : { status: 'inactive', hikes: 0, cardUrl: '' };
        return res.status(200).json({ uid: id, card, regs: regs || {} });
    } catch (e) {
        console.error('me:', e.message);
        return res.status(502).json({ error: 'db unavailable' });
    }
};
