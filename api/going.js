// api/going.js – кто записан на хайки: число и аватарки одним запросом с нашего домена.
// Замеры 08–12.10: прямое соединение телефона с Firebase у части людей занимает 6–10+ с,
// поэтому места и аватарки появлялись с задержкой. Сервер Vercel читает базу за доли секунды.
// Только чтение; отдаём лишь то, что нужно экрану (id, имя, фото, время записи).
// Firebase в приложении остаётся – для живых обновлений и как запасной путь.
//   GET /api/going?d=2026-10-11,2026-10-18          – кэш CDN 10 с (для показа)
//   GET /api/going?d=2026-10-11&fresh=1              – без кэша (проверка мест перед записью)
const { getAccessToken } = require('./club-content');

const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const MAX_DATES = 20;

async function read(path, token) {
    const r = await fetch(`${DB}/${path}.json`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
    const fresh = String(req.query.fresh || '') === '1';
    const dates = [...new Set(String(req.query.d || '').split(','))]
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, MAX_DATES);
    if (!dates.length) return res.status(400).json({ error: 'no dates' });

    try {
        const token = await getAccessToken();
        const lists = await Promise.all(dates.map(d => read(`hikeParticipants/${d}`, token).catch(() => undefined)));
        const going = {};
        dates.forEach((d, i) => {
            const all = lists[i];
            if (all === undefined) return; // не прочиталось – дату не отдаём, приложение возьмёт из Firebase
            going[d] = Object.entries(all || {})
                .filter(([, p]) => p && typeof p === 'object' && p.timestamp)
                .map(([id, p]) => ({ userId: String(p.userId || id), name: String(p.name || '').slice(0, 64), photoUrl: String(p.photoUrl || ''), timestamp: Number(p.timestamp) || 0 }))
                .sort((a, b) => b.timestamp - a.timestamp);
        });
        res.setHeader('Cache-Control', fresh ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30');
        return res.status(200).json({ going });
    } catch (e) {
        console.error('going:', e.message);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(500).json({ error: 'failed' });
    }
};
