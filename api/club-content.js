const crypto = require('crypto');
const { verifyInitData, isAdminUser } = require('./tg-auth');
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const METRICS = ['hikes', 'locations', 'kilometers', 'meetings'];
const { clubPairs } = require('../lib/circle');
const { getClubMetrics } = require('../lib/club-metrics');
const { publishNotes } = require('../lib/mm-notes');
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

// мастермайнды: своя правка из админки (adminContent/masterminds) или собранные по умолчанию
async function readMasterminds(token) {
    const response = await fetch(`${DB}/adminContent/masterminds.json`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('content unavailable');
    const override = await response.json();
    const value = override?.hasValue ? normalizeMasterminds(override.value) : await defaultMasterminds(token);
    return { value, revision: response.headers.get('etag') };
}

function normalizeUpdates(value) {
    const list = Array.isArray(value) ? value : Object.values(value || {});
    return list.filter(item => item && item.date && typeof item.update === 'string')
        .map(item => ({ date: String(item.date).slice(0, 10), update: item.update }))
        .sort((a, b) => b.date.localeCompare(a.date));
}

// дата из таблицы приходит полночью по Москве в UTC (…T21:00:00Z) – берём день по Москве
function mskDay(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 10) : '';
}

function normalizeMasterminds(value) {
    const list = Array.isArray(value) ? value : Object.values(value || {});
    return list.filter(item => item && item.date && item.title && item.link)
        .map(item => ({ date: mskDay(item.date), title: String(item.title).trim(), link: String(item.link).trim() }))
        .filter(item => item.date)
        .sort((a, b) => b.date.localeCompare(a.date));
}

// пока мастермайнды не правили в админке – собираем их как на главной: лист таблицы + саммари у хайков
async function defaultMasterminds(token) {
    const get = async path => {
        const r = await fetch(`${DB}/${path}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error('content unavailable');
        return r.json();
    };
    const [listed, hikes] = await Promise.all([get('mastermindSummaries'), get('hikes')]);
    const items = normalizeMasterminds(listed);
    const links = new Set(items.map(item => item.link));
    for (const [date, hike] of Object.entries(hikes || {})) {
        const link = String(hike?.summary_link || '').trim();
        if (!/^https?:\/\//.test(link) || links.has(link)) continue;
        items.push({ date: mskDay(hike.date || date), title: String(hike.summary_title || '').trim() || String(hike.title || '').trim(), link });
    }
    return normalizeMasterminds(items);
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
    if (section === 'masterminds') {
        if (!Array.isArray(value) || value.length > 300) throw new Error('слишком много мастермайндов');
        return normalizeMasterminds(value.map(item => {
            const date = String(item?.date || '');
            const title = String(item?.title || '').trim();
            const link = String(item?.link || '').trim();
            const parsed = new Date(`${date}T12:00:00Z`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
                throw new Error('укажи корректную дату мастермайнда');
            }
            if (!title || title.length > 300) throw new Error('название мастермайнда должно быть от 1 до 300 символов');
            if (!/^https?:\/\/\S+$/.test(link) || link.length > 2000) throw new Error('ссылка должна начинаться с https://');
            return { date, title, link };
        }));
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

const COPY_KEYS = new Set(['homeAsk0', 'homeAsk1', 'homeAsk2', 'homeAsk3', 'homeAssistant', 'homeMastermind', 'homeMetrics', 'homeNew', 'homeReasons', 'homeUpdates', 'ticketBell', 'ticketDone', 'ticketHike', 'ticketHikeTitle', 'ticketHome', 'ticketHomeTitle', 'ticketInvite', 'ticketInviteFriend', 'ticketNotify', 'ticketNotifyInfo', 'ticketOpen', 'ticketPack', 'ticketPhone', 'ticketPlace', 'ticketRoute', 'ticketSaved', 'ticketStatus']);
async function appCopy(req, res, body, user) {
    if (body && !(body.restore === true || (COPY_KEYS.has(body.key)
        && typeof body.text === 'string' && body.text.trim() && body.text.length <= 240
        && !/[\r\n\u0000-\u001f]/.test(body.text)))) {
        return res.status(400).json({ error: 'введи текст до 240 символов в одну строку' });
    }
    try {
        const url = `${DB}/adminContent/appCopy.json`;
        const auth = { Authorization: `Bearer ${await getAccessToken()}` };
        const current = await fetch(url, { headers: { ...auth, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(6000) });
        if (!current.ok) throw new Error('copy read failed');
        const stored = await current.json();
        const value = stored?.value || {};
        const revision = current.headers.get('etag');
        if (!body) return res.status(200).json({ value, revision, canRestore: !!stored?.hasPrevious });
        if (!revision || body.revision !== revision) return res.status(409).json({ error: 'текст уже обновился, открой редактор снова' });
        if (body.restore && !stored?.hasPrevious) return res.status(400).json({ error: 'предыдущей версии нет' });
        const next = body.restore ? (stored.previous || {}) : { ...value, [body.key]: body.text.trim() };
        const result = await fetch(url, {
            method: 'PUT', signal: AbortSignal.timeout(6000),
            headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': revision },
            body: JSON.stringify({ value: next, previous: value, hasPrevious: true, updatedBy: String(user.id), updatedAt: Date.now() }),
        });
        if (result.status === 412) return res.status(409).json({ error: 'текст уже обновился, открой редактор снова' });
        if (!result.ok) throw new Error('copy write failed');
        return res.status(200).json({ value: next, canRestore: true });
    } catch (error) {
        console.error('app-copy:', error.message);
        return res.status(502).json({ error: 'тексты сейчас недоступны, попробуй ещё раз' });
    }
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'метод не поддерживается' });
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'неверный запрос' }); } }
    if (req.method === 'GET' && req.query?.copy === '1') return appCopy(req, res);
    if (req.method === 'POST' && body.action === 'app_copy') {
        if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ error: 'сервер не настроен' });
        const telegram = verifyInitData(String(body.initData || ''), process.env.TELEGRAM_BOT_TOKEN);
        if (!isAdminUser(telegram)) return res.status(403).json({ error: 'только для администраторов' });
        return appCopy(req, res, body, telegram);
    }
    // пробный HTML-виджет Telegram (Bot API 10.4) – только Максу, по тому же секрету, что и саммари
    if (req.method === 'POST' && body.action === 'widgetTest') {
        const secret = process.env.SUMMARY_SECRET || '';
        const got = String(req.headers['x-summary-secret'] || '');
        if (!secret || got.length !== secret.length || !require('crypto').timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return res.status(401).json({ error: 'unauthorized' });
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return res.status(500).json({ error: 'no bot token' });
        const html = String(body.html || '').slice(0, 32768);
        const r = await fetch(`https://api.telegram.org/bot${token}/sendWidget`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: 163665735, html, public_data: String(body.public_data || '').slice(0, 1024), caption: String(body.caption || '').slice(0, 1024), height: body.height || undefined }),
            signal: AbortSignal.timeout(10000),
        }).then(x => x.json()).catch(e => ({ ok: false, description: e.message }));
        return res.status(200).json({ ok: r.ok, description: r.description || '', message_id: r.result?.message_id });
    }

    // публикация саммари мастермайндов воскресной задачей (Plaud → сюда); ключ – переменная SUMMARY_SECRET в Vercel
    if (req.method === 'POST' && body.action === 'publishNotes') {
        const secret = process.env.SUMMARY_SECRET || '';
        const got = String(req.headers['x-summary-secret'] || '');
        if (!secret || got.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return res.status(401).json({ error: 'нет доступа' });
        try { return res.status(200).json({ published: await publishNotes(await getAccessToken(), body.notes) }); }
        catch (e) { console.error('publishNotes:', e.message); return res.status(400).json({ error: e.message }); }
    }
    let user = null;
    let value;
    if (req.method === 'POST') {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return res.status(503).json({ error: 'сервер не настроен' });
        user = verifyInitData(String(body.initData || ''), token);
        if (!user?.id) return res.status(401).json({ error: 'открой админку внутри Telegram' });
        if (!isAdminUser(user)) return res.status(403).json({ error: 'только для администраторов' });
        // обложка прошедшего хайка: JPEG (base64) из админки, до ~700 КБ; data: null – убрать
        if (body.action === 'hike_photo') {
            const date = String(body.date || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'плохая дата' });
            const data = body.data == null ? null : String(body.data).replace(/^data:image\/jpeg;base64,/, '');
            if (data !== null && (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 950000)) return res.status(400).json({ error: 'фото слишком большое или не JPEG' });
            try {
                const t = await getAccessToken();
                const v = Date.now();
                const put = (path, val) => fetch(`${DB}/${path}.json`, { method: val === null ? 'DELETE' : 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: val === null ? undefined : JSON.stringify(val), signal: AbortSignal.timeout(15000) });
                const r1 = await put(`hikePhotos/${date}`, data === null ? null : { data, v, by: String(user.id) });
                const r2 = await put(`hikePhotoIndex/${date}`, data === null ? null : v);
                if (!r1.ok || !r2.ok) throw new Error('write failed');
                return res.status(200).json({ ok: true, v: data === null ? null : v });
            } catch (e) {
                console.error('hike_photo:', e.message);
                return res.status(502).json({ error: 'не удалось сохранить фото' });
            }
        }
        // текст сообщения «открыли запись» (lib/booking-open-message.js): прочитать / прислать себе пример
        if (body.action === 'booking_open_get' || body.action === 'booking_open_test') {
            const date = String(body.date || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'плохая дата' });
            const msg = require('../lib/booking-open-message');
            try {
                const t = await getAccessToken();
                const get = async path => (await fetch(`${DB}/${path}.json`, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15000) })).json();
                if (body.action === 'booking_open_get') return res.status(200).json({ text: (await get(`booking_open_text/${date}`)) || '', button: (await get(`booking_open_button/${date}`)) || '', default: msg.DEFAULT, defaultButton: msg.BUTTON });
                const hike = (await get(`hikes/${date}`)) || {};
                const html = msg.render(String(body.text || '').slice(0, 1500), { name: String(user.first_name || ''), title: String(body.title || hike.title || ''), date, startTime: String(body.start_time || hike.start_time || '') });
                const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
                    body: JSON.stringify({ chat_id: user.id, text: html, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: msg.button(date, body.button) }) });
                const j = await r.json().catch(() => ({}));
                if (!j.ok) return res.status(502).json({ error: j.description ? 'телеграм: ' + j.description : 'не отправилось' });
                return res.status(200).json({ ok: true });
            } catch (e) {
                console.error('booking_open_text:', e.message);
                return res.status(502).json({ error: 'не получилось' });
            }
        }
        // «когда откроется запись» (js/booking-opens.js): booking_opens/<дата> = ISO по Москве; at: null – запись открыта сразу
        if (body.action === 'booking_opens') {
            const date = String(body.date || ''), original = String(body.original || '');
            const at = body.at == null || body.at === '' ? null : String(body.at);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (original && !/^\d{4}-\d{2}-\d{2}$/.test(original))) return res.status(400).json({ error: 'плохая дата' });
            if (at !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+03:00$/.test(at)) return res.status(400).json({ error: 'плохое время открытия' });
            try {
                const t = await getAccessToken();
                const put = (path, val) => fetch(`${DB}/${path}.json`, { method: val === null ? 'DELETE' : 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: val === null ? undefined : JSON.stringify(val), signal: AbortSignal.timeout(15000) });
                const prev = await (await fetch(`${DB}/booking_opens/${date}.json`, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(15000) })).json().catch(() => null);
                const rs = [await put(`booking_opens/${date}`, at)];
                if (original && original !== date) rs.push(await put(`booking_opens/${original}`, null));
                if (typeof body.text === 'string') {
                    const text = body.text.trim().slice(0, 1500);
                    const isDefault = !text || text === require('../lib/booking-open-message').DEFAULT;
                    rs.push(await put(`booking_open_text/${date}`, isDefault ? null : text));
                    if (original && original !== date) rs.push(await put(`booking_open_text/${original}`, null));
                }
                if (typeof body.button === 'string') {
                    const bt = body.button.trim().slice(0, 40);
                    rs.push(await put(`booking_open_button/${date}`, !bt || bt === require('../lib/booking-open-message').BUTTON ? null : bt));
                    if (original && original !== date) rs.push(await put(`booking_open_button/${original}`, null));
                }
                // время поменяли – рассылку «открыли запись» можно отправить заново в новую минуту
                if (prev !== at) rs.push(await put(`booking_open_sent/${date}`, null));
                if (rs.some(r => !r.ok)) throw new Error('write failed');
                return res.status(200).json({ ok: true, at });
            } catch (e) {
                console.error('booking_opens:', e.message);
                return res.status(502).json({ error: 'не удалось сохранить время открытия записи' });
            }
        }
        // сторис клуба (lib/club-stories.js): список с автоматическими черновиками и сохранение
        if (body.action === 'stories' || body.action === 'story_save') {
            try {
                const { adminList, adminSave } = require('../lib/club-stories');
                const t = await getAccessToken();
                if (body.action === 'story_save') await adminSave(t, body.story || {}, user.id);
                return res.status(200).json(await adminList(t));
            } catch (e) {
                console.error('stories admin:', e.message);
                return res.status(400).json({ error: e.message });
            }
        }
        // опросы: все ответы для вкладки «📋 опросы»
        if (body.action === 'surveys') {
            try { return res.status(200).json(await require('../lib/survey').adminReport(await getAccessToken())); }
            catch (e) { console.error('surveys admin:', e.message); return res.status(502).json({ error: e.message }); }
        }
        if (!['metrics', 'updates', 'masterminds'].includes(body.section) || !isValidRevision(body.revision)) {
            return res.status(400).json({ error: 'обнови данные редактора' });
        }
        try { value = validateValue(body.section, body.value); }
        catch (error) { return res.status(400).json({ error: error.message }); }
    }
    try {
        const token = await getAccessToken();
        if (req.method === 'GET') {
            if (req.query?.metrics === '1') {
                const stored = await readSection('metrics', token);
                const metrics = await getClubMetrics(token, stored.value || {});
                return res.status(200).json({ metrics, metricsMode: 'automatic' });
            }
            const [metrics, updates, masterminds] = await Promise.all([readSection('metrics', token), readSection('updates', token), readMasterminds(token)]);
            let m = metrics.value || Object.fromEntries(METRICS.map(key => [key, '0']));
            const automatic = await getClubMetrics(token, m).catch(e => { console.error('club metrics:', e.message); return null; });
            if (automatic) m = automatic;
            else {
                const pairs = await clubPairs(token).catch(e => { console.error('club-content pairs:', e.message); return null; });
                if (pairs) m.meetings = String(pairs);
            }
            return res.status(200).json({
                metrics: m,
                metricsMode: automatic ? 'automatic' : 'fallback',
                updates: normalizeUpdates(updates.value),
                masterminds: masterminds.value,
                revisions: { metrics: metrics.revision, updates: updates.revision, masterminds: masterminds.revision },
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

module.exports.getAccessToken = getAccessToken;
module.exports.normalizeMasterminds = normalizeMasterminds;
