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

// «анонс без записи»: в минуту booking_opens/<дата> пишем подписчикам hike_waitlist/<дата> «открыли запись».
// Зовут: Vercel Cron (?cron=booking-open) и само приложение, открытое после этого времени (?open=<дата>).
// Повторный вызов ничего не шлёт: замок booking_open_sent/<дата> ставится условной записью (ETag).
async function openBooking(date, token) {
    const get = async path => { const r = await fetch(`${DB}/${path}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); };
    const at = Date.parse(await get(`booking_opens/${date}`) || '');
    if (!Number.isFinite(at)) return { date, skipped: 'нет времени открытия' };
    if (Date.now() < at) return { date, skipped: 'ещё рано' };
    if (Date.now() - at > 3 * 86400000) return { date, skipped: 'давно открыта' };
    // замок: создаём booking_open_sent/<дата>, только если его ещё нет
    const lockUrl = `${DB}/booking_open_sent/${date}.json`;
    const head = await fetch(lockUrl, { headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(8000) });
    if ((await head.json()) !== null) return { date, skipped: 'уже отправлено' };
    const lock = await fetch(lockUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'if-match': head.headers.get('etag') || 'null_etag', 'Content-Type': 'application/json' }, body: JSON.stringify({ at: Date.now() }), signal: AbortSignal.timeout(8000) });
    if (!lock.ok) return { date, skipped: 'уже отправляется' };
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const hike = await get(`hikes/${date}`) || {};
    const list = await get(`hike_waitlist/${date}`) || {};
    const msg = require('../lib/booking-open-message');
    const template = await get(`booking_open_text/${date}`).catch(() => null);
    const btnText = await get(`booking_open_button/${date}`).catch(() => null);
    const marks = {};
    let sent = 0;
    for (const [uid, p] of Object.entries(list)) {
        if (!p || p.notified_at || !/^\d+$/.test(uid)) continue;
        const text = msg.render(template, { name: p.name || '', title: hike.title, date, startTime: hike.start_time || '' });
        try {
            const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
                body: JSON.stringify({ chat_id: uid, text, parse_mode: 'HTML', disable_web_page_preview: true,
                    reply_markup: msg.button(date, btnText) }),
            });
            if ((await r.json().catch(() => ({}))).ok) { sent++; marks[`${uid}/notified_at`] = Math.floor(Date.now() / 1000); }
        } catch (e) { console.error('booking-open send', uid, e.message); }
    }
    if (sent) await fetch(`${DB}/hike_waitlist/${date}.json`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(marks), signal: AbortSignal.timeout(8000) });
    await fetch(lockUrl, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sent, total: Object.keys(list).length }), signal: AbortSignal.timeout(8000) });
    return { date, sent };
}

module.exports = async (req, res) => {
    if (req.query && req.query.photo) return sendPhoto(req, res, String(req.query.photo));
    if (req.query && (req.query.open || req.query.cron === 'booking-open')) {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const { getAccessToken } = require('./club-content');
            const token = await getAccessToken();
            let dates = [];
            if (req.query.open) dates = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.open)) ? [String(req.query.open)] : [];
            else {
                const r = await fetch(`${DB}/booking_opens.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
                dates = Object.keys((r.ok ? await r.json() : null) || {});
            }
            const results = [];
            for (const d of dates) results.push(await openBooking(d, token));
            return res.status(200).json({ results });
        } catch (e) {
            console.error('booking-open:', e.message);
            return res.status(502).json({ error: 'не получилось' });
        }
    }
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
