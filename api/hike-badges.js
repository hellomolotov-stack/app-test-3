// api/hike-badges.js – Vercel Cron в 18:00 по Москве: значки участникам сегодняшнего хайка (см. lib/hike-badges.js).
// Без секрета крона – только проверка, что всё на месте (маршрут, сколько человек), без имён и без выдачи.
const crypto = require('crypto');
const { getAccessToken } = require('./club-content');
const { grantHikeBadges } = require('../lib/hike-badges');

const sameSecret = (a, b) => !!a && !!b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const moscowToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
    const cron = sameSecret(String(req.headers.authorization || '').replace(/^Bearer /, ''), process.env.CRON_SECRET || '');
    try {
        const token = await getAccessToken();
        const result = await grantHikeBadges(moscowToday(), token, { dryRun: !cron });
        if (cron) return res.status(200).json(result);
        return res.status(200).json({ date: result.date, route: result.route || null, people: result.people?.length || 0, skipped: result.skipped || null });
    } catch (e) {
        console.error('hike-badges:', e.message);
        return res.status(502).json({ error: 'не получилось' });
    }
};
