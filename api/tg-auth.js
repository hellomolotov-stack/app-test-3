// api/tg-auth.js – вход в Firebase по подписи Telegram.
// Мини-апп присылает initData; проверяем подпись токеном бота и выдаём Firebase custom token
// с uid = Telegram id. Дальше правила базы пускают человека только к его собственным данным.
// Нужны переменные окружения Vercel: TELEGRAM_BOT_TOKEN и FIREBASE_SERVICE_ACCOUNT (JSON ключа).
const crypto = require('crypto');

const MAX_AGE_SEC = 7 * 24 * 3600; // приложение может долго висеть открытым – initData живёт неделю
const ADMIN_USERNAMES = ['maxmolotov', 'hellointelligent'];

function verifyInitData(initData, botToken) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const checkString = [...params.entries()]
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
    if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
    const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
    if (!(age >= -300 && age <= MAX_AGE_SEC)) return null;
    try { return JSON.parse(params.get('user') || 'null'); } catch (e) { return null; }
}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// Firebase custom token – JWT, подписанный ключом сервисного аккаунта (без firebase-admin).
function createCustomToken(serviceAccount, uid, claims) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now,
        exp: now + 3600,
        uid,
        claims
    };
    const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key);
    return `${unsigned}.${b64url(signature)}`;
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    let serviceAccount = null;
    try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null'); } catch (e) {}
    if (!botToken || !serviceAccount || !serviceAccount.private_key) {
        return res.status(503).json({ error: 'auth not configured' });
    }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const user = verifyInitData(String((body && body.initData) || ''), botToken);
    if (!user || !user.id) return res.status(401).json({ error: 'bad initData' });

    const username = String(user.username || '').toLowerCase();
    const token = createCustomToken(serviceAccount, String(user.id), {
        admin: ADMIN_USERNAMES.includes(username)
    });
    return res.status(200).json({ token, uid: String(user.id) });
};

module.exports.verifyInitData = verifyInitData;
module.exports.ADMIN_USERNAMES = ADMIN_USERNAMES;
