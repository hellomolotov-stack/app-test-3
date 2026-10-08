// api/story.js – картинка для сторис «иду на хайк».
// Telegram берёт картинку для сторис (shareToStory) и для сохранения (downloadFile) только по публичной
// ссылке, поэтому мини-апп рисует её у себя и присылает сюда:
//   POST { initData, date, img: base64 jpeg } → кладём в Firebase stories/<id>, отвечаем { url }
//   GET  /story/<id>.jpg (rewrite на ?id=) → отдаём картинку
// В базу ходим ключом сервисного аккаунта (FIREBASE_SERVICE_ACCOUNT), правила базы не трогаем.
const crypto = require('crypto');

const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const MAX_AGE_SEC = 7 * 24 * 3600;
const MAX_IMG_B64 = 3.5 * 1024 * 1024;

function verifyInitData(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const checkString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
    if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
    const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
    if (!(age >= -300 && age <= MAX_AGE_SEC)) return null;
    try { return JSON.parse(params.get('user') || 'null'); } catch (e) { return null; }
}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// OAuth-токен Google для Realtime Database по ключу сервисного аккаунта (живёт час – держим в памяти)
let cachedToken = null;
async function dbToken() {
    if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.value;
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null');
    if (!sa || !sa.private_key) throw new Error('not configured');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }))}`;
    const jwt = `${unsigned}.${b64url(crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key))}`;
    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`
    });
    const j = await r.json();
    if (!j.access_token) throw new Error('token failed');
    cachedToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return cachedToken.value;
}

module.exports = async (req, res) => {
    try {
        if (req.method === 'GET') {
            const id = String(req.query.id || '').replace(/\.jpg$/, '');
            if (!/^[\w-]{6,60}$/.test(id)) return res.status(404).end();
            const token = await dbToken();
            const r = await fetch(`${DB}/stories/${id}/img.json?access_token=${token}`);
            const b64 = r.ok ? await r.json() : null;
            if (!b64 || typeof b64 !== 'string') return res.status(404).end();
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.status(200).send(Buffer.from(b64, 'base64'));
        }
        if (req.method !== 'POST') return res.status(405).end();

        res.setHeader('Cache-Control', 'no-store');
        let body = req.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const user = botToken ? verifyInitData(String(body?.initData || ''), botToken) : null;
        if (!user || !user.id) return res.status(401).json({ error: 'bad initData' });

        const img = String(body?.img || '').replace(/^data:image\/jpeg;base64,/, '');
        if (!img || img.length > MAX_IMG_B64 || !/^[A-Za-z0-9+/=]+$/.test(img)) return res.status(400).json({ error: 'bad image' });
        const date = /^\d{4}-\d{2}-\d{2}$/.test(body?.date) ? body.date : 'hike';

        const id = `${date}_${crypto.randomBytes(6).toString('hex')}`;
        const token = await dbToken();
        const w = await fetch(`${DB}/stories/${id}.json?access_token=${token}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ img, uid: String(user.id), date, ts: Date.now() })
        });
        if (!w.ok) return res.status(502).json({ error: 'save failed' });
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        return res.status(200).json({ url: `https://${host}/story/${id}.jpg` });
    } catch (e) {
        return res.status(500).json({ error: 'server error' });
    }
};
