// api/bc.js – нажатия на кнопки рассылок (статистика в админке, см. adminBroadcastStats_ в Apps Script).
//   GET  ?b=<id>&u=<https-ссылка> – кнопка-ссылка: +1 к broadcasts/<id>/url_clicks и переход по ссылке
//   POST { initData, b }          – кнопка в приложение: broadcasts/<id>/clicks/<user_id> = время (уникальные люди)
const { verifyInitData } = require('./tg-auth');
const { getAccessToken } = require('./club-content');
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const validId = b => /^[a-z0-9]{4,16}$/.test(String(b || ''));

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        if (req.method === 'GET') {
            const target = String(req.query.u || '');
            if (!/^https:\/\//.test(target)) return res.status(400).end();
            if (validId(req.query.b)) {
                try {
                    const token = await getAccessToken();
                    await fetch(`${DB}/broadcasts/${req.query.b}/url_clicks.json`, {
                        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ '.sv': { increment: 1 } }), signal: AbortSignal.timeout(5000)
                    });
                } catch (e) { /* статистика не должна мешать переходу */ }
            }
            res.setHeader('Location', target);
            return res.status(302).end();
        }
        if (req.method !== 'POST') return res.status(405).end();
        let body = req.body || {};
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
        if (!validId(body.b)) return res.status(400).json({ error: 'bad id' });
        const user = verifyInitData(String(body.initData || ''), process.env.TELEGRAM_BOT_TOKEN || '');
        if (!user?.id) return res.status(401).json({ error: 'bad initData' });
        const token = await getAccessToken();
        await fetch(`${DB}/broadcasts/${body.b}/clicks/${user.id}.json`, {
            method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(Math.floor(Date.now() / 1000)), signal: AbortSignal.timeout(8000)
        });
        return res.status(200).json({ ok: true });
    } catch (e) {
        return res.status(500).json({ error: 'server error' });
    }
};
