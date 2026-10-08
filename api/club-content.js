const crypto = require('crypto');
const { verifyInitData, ADMIN_USERNAMES } = require('./tg-auth');
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const METRICS = ['hikes', 'locations', 'kilometers', 'meetings'];
let accessToken = null;
let tokenRequest = null;

async function getAccessToken() {
    if (accessToken && accessToken.until > Date.now() + 60000) return accessToken.value;
    if (tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
        const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null');
        if (!account?.private_key || !account.client_email) throw new Error('not configured');
        const now = Math.floor(Date.now() / 1000);
        const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
        const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
            iss: account.client_email,
            scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
            aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
        })}`;
        const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST', signal: AbortSignal.timeout(10000),
            body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
        });
        if (!response.ok) throw new Error('token unavailable');
        const data = await response.json();
        if (!data.access_token) throw new Error('token unavailable');
        accessToken = { value: data.access_token, until: Date.now() + Number(data.expires_in || 3600) * 1000 };
        return accessToken.value;
    })().finally(() => { tokenRequest = null; });
    return tokenRequest;
}

async function readSection(section, token) {
    const response = await fetch(`${DB}/adminContent/${section}.json`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('content unavailable');
    const override = await response.json();
    if (override && (override.hasValue === true || Object.hasOwn(override, 'value'))) return { value: override.value, revision: response.headers.get('etag') };
    const base = await fetch(`${DB}/${section}.json`, { signal: AbortSignal.timeout(10000) });
    if (!base.ok) throw new Error('content unavailable');
    return { value: await base.json(), revision: response.headers.get('etag') };
}

function normalizeUpdates(value) {
    const list = Array.isArray(value) ? value : Object.values(value || {});
    return list.filter(item => item && item.date && typeof item.update === 'string')
        .map(item => ({ date: String(item.date).slice(0, 10), update: item.update }))
        .sort((a, b) => b.date.localeCompare(a.date));
}

function isValidRevision(value) {
    // Firebase returns unquoted ETags, including null_etag for an empty node.
    return typeof value === 'string' && value.length <= 256
        && /^(?:[A-Za-z0-9_+/=-]+|"[A-Za-z0-9_+/=-]+")$/.test(value);
}

function validateValue(section, value) {
    if (section === 'metrics') {
        const metrics = {};
        for (const key of METRICS) {
            const raw = value?.[key];
            const number = Number(raw);
            if (!['string', 'number'].includes(typeof raw) || String(raw).trim() === '' || !Number.isFinite(number)
                || number < 0 || number > 1e9 || (key !== 'kilometers' && !Number.isInteger(number))) {
                throw new Error('укажи неотрицательные числа во всех четырёх полях');
            }
            metrics[key] = String(number);
        }
        return metrics;
    }
    if (!Array.isArray(value) || value.length > 300) throw new Error('слишком много обновлений');
    const updates = value.map(item => {
        const date = String(item?.date || '');
        const text = typeof item?.update === 'string' ? item.update.trim() : '';
        const parsed = new Date(`${date}T12:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
            throw new Error('укажи корректную дату обновления');
        }
        if (!text || text.length > 5000) throw new Error('текст обновления должен быть от 1 до 5000 символов');
        return { date, update: text };
    });
    return normalizeUpdates(updates);
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'метод не поддерживается' });
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'неверный запрос' }); } }
    let user = null;
    let value;
    if (req.method === 'POST') {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return res.status(503).json({ error: 'сервер не настроен' });
        user = verifyInitData(String(body.initData || ''), token);
        if (!user?.id) return res.status(401).json({ error: 'открой админку внутри Telegram' });
        if (!ADMIN_USERNAMES.includes(String(user.username || '').toLowerCase())) return res.status(403).json({ error: 'только для администраторов' });
        if (!['metrics', 'updates'].includes(body.section) || !isValidRevision(body.revision)) {
            return res.status(400).json({ error: 'обнови данные редактора' });
        }
        try { value = validateValue(body.section, body.value); }
        catch (error) { return res.status(400).json({ error: error.message }); }
    }
    try {
        const token = await getAccessToken();
        if (req.method === 'GET') {
            const [metrics, updates] = await Promise.all([readSection('metrics', token), readSection('updates', token)]);
            return res.status(200).json({
                metrics: metrics.value || Object.fromEntries(METRICS.map(key => [key, '0'])),
                updates: normalizeUpdates(updates.value),
                revisions: { metrics: metrics.revision, updates: updates.revision },
            });
        }
        const response = await fetch(`${DB}/adminContent/${body.section}.json`, {
            method: 'PUT', signal: AbortSignal.timeout(10000),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': body.revision },
            body: JSON.stringify({ value, hasValue: true, updatedAt: Date.now(), updatedBy: String(user.id) }),
        });
        if (response.status === 412) return res.status(409).json({ error: 'данные уже изменились — обнови редактор перед сохранением' });
        if (!response.ok) throw new Error('write unavailable');
        return res.status(200).json({ section: body.section, value });
    } catch (error) {
        console.error('club-content:', error.message);
        return res.status(502).json({ error: 'не удалось связаться с базой клуба, попробуй ещё раз' });
    }
};
