// api/hikes.js – список хайков для первого запуска приложения.
// Без кэша главная ждала Firebase: SDK с серверов Google + соединение с базой в Европе –
// из Крыма без VPN это 10+ секунд. Этот ответ отдаёт CDN Vercel (тот же домен, что и само
// приложение), поэтому главная рисуется сразу; Firebase подключается в фоне и обновляет данные.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';

// обложка прошедшего хайка (админка → hikePhotos/<дата>): /api/hikes?photo=2026-11-01&v=<версия>
// картинка лежит в закрытом узле базы сжатым JPEG; адрес с версией – CDN держит её «навсегда»
async function sendPhoto(req, res, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).end();
    try {
        const { getAccessToken } = require('./club-content');
        const token = await getAccessToken();
        const r = await fetch(`${DB}/hikePhotos/${date}/data.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
        const b64 = r.ok ? await r.json() : null;
        if (!b64) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(404).end(); }
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
        return res.status(200).send(Buffer.from(String(b64), 'base64'));
    } catch (e) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(502).end();
    }
}

module.exports = async (req, res) => {
    if (req.query && req.query.photo) return sendPhoto(req, res, String(req.query.photo));
    try {
        const r = await fetch(`${DB}/hikes.json`);
        if (!r.ok) throw new Error('firebase ' + r.status);
        const hikes = await r.json();
        // минута свежести на CDN, ещё 10 минут – старая копия, пока подтягивается новая
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).send(JSON.stringify(hikes || {}));
    } catch (e) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(502).json({ error: 'hikes unavailable' });
    }
};
