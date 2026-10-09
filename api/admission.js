const crypto = require('crypto');
const { verifyInitData, ADMIN_USERNAMES } = require('./tg-auth');
const { getAccessToken } = require('./club-content');
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const PILOT_PATH = 'helloIntelligent';
const RULES_VERSION = 'pilot-2026-10-09';
const LINK = 'https://t.me/yaltahiking_bot?startapp=admission';
const isPilot = user => !!user?.id && String(user.username || '').toLowerCase() === 'hellointelligent';
const failure = (status, message) => Object.assign(new Error(message), { status });

async function read(token) {
    const response = await fetch(`${DB}/admissionPilot/${PILOT_PATH}.json`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw failure(502, 'не удалось загрузить заявку');
    return { record: await response.json(), revision: response.headers.get('etag') };
}

async function write(token, revision, record) {
    if (!revision) throw failure(502, 'не удалось проверить версию заявки');
    const response = await fetch(`${DB}/admissionPilot/${PILOT_PATH}.json`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': revision },
        body: JSON.stringify(record), signal: AbortSignal.timeout(10000),
    });
    if (response.status === 412) throw failure(409, 'заявка уже изменилась, обнови её');
    if (!response.ok) throw failure(502, 'не удалось сохранить заявку');
}

// короткая анкета: имя (подставляется из Telegram), «ты и Ялта» одним тапом и галочки-взгляды
const YALTA = ['local', 'moved', 'season'];
const VIEWS = ['alone', 'silence', 'thinks', 'irony', 'no', 'speaker'];
function validateForm(form) {
    const name = typeof form?.name === 'string' ? form.name.trim() : '';
    if (name.length < 2 || name.length > 80) throw failure(400, 'проверь, как тебя зовут');
    if (!YALTA.includes(form?.yalta)) throw failure(400, 'отметь, как ты связан с Ялтой');
    const views = Array.isArray(form?.views) ? [...new Set(form.views.filter(v => VIEWS.includes(v)))] : [];
    return { name, yalta: form.yalta, views };
}

function publicRecord(record) {
    if (!record) return { status: 'new' };
    const { notification, ...data } = record;
    return { ...data, notificationStatus: notification?.status || 'none' };
}

function notificationText(status) {
    if (status === 'approved') return 'рады знакомству 🤍\n\nмы прочитали анкету – добро пожаловать в клуб. теперь можно записаться на хайк или оформить карту интеллигента';
    if (status === 'rejected') return 'спасибо, что рассказал о себе 🤍\n\nсейчас не получится позвать тебя в клуб. но в него входят и по приглашению – если кто-то из клуба захочет взять тебя с собой, будем рады';
    return 'анкета у нас 🤍\n\nмы прочитаем её сами и напишем тебе здесь в течение 3 часов. пока можно посмотреть ближайшие хайки в приложении';
}

// A short lease prevents two admins from sending the same decision concurrently.
// An uncertain Telegram timeout is not retried automatically.
async function deliver(token) {
    const current = await read(token);
    const record = current.record;
    if (!record?.notification || record.notification.status === 'sent') return record;
    if (record.notification.status === 'sending' && Date.now() - record.notification.startedAt < 60000) return record;
    const id = record.notification.id;
    record.notification = { ...record.notification, status: 'sending', startedAt: Date.now() };
    await write(token, current.revision, record);
    let status = 'uncertain';
    try {
        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
            body: JSON.stringify({ chat_id: record.userId, text: notificationText(record.status),
                reply_markup: { inline_keyboard: [[{ text: 'Перейти в приложение', url: LINK }]] } }),
        });
        const data = await response.json();
        status = response.ok && data.ok === true ? 'sent' : 'failed';
    } catch { /* Keep the decision and expose delivery uncertainty to the admin. */ }
    const latest = await read(token);
    if (latest.record?.notification?.id === id) {
        latest.record.notification.status = status;
        latest.record.notification.finishedAt = Date.now();
        await write(token, latest.revision, latest.record);
    }
    return latest.record;
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'метод не поддерживается' });
    if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ error: 'сервер не настроен' });
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'неверный запрос' }); } }
    const user = verifyInitData(String(body.initData || ''), process.env.TELEGRAM_BOT_TOKEN || '');
    if (!user?.id) return res.status(401).json({ error: 'открой приложение внутри Telegram' });
    const adminAction = ['list', 'decide', 'reset', 'retry'].includes(body.action);
    const admin = ADMIN_USERNAMES.includes(String(user.username || '').toLowerCase());
    if (adminAction ? !admin : !isPilot(user)) return res.status(403).json({ error: 'пилот доступен только тестовому аккаунту' });
    if (!['status', 'submit', 'welcome', 'payment', 'list', 'decide', 'reset', 'retry'].includes(body.action)) return res.status(400).json({ error: 'неизвестное действие' });
    try {
        const token = await getAccessToken();
        const { record, revision } = await read(token);
        if (!adminAction && record && record.userId !== String(user.id)) throw failure(403, 'заявка привязана к другому Telegram ID, обратись к администратору');
        if (body.action === 'status' || body.action === 'list') return res.status(200).json({ application: publicRecord(record), revision, serverNow: Date.now() });
        if (body.action === 'payment') {
            if (record?.status !== 'approved' || record.rulesVersion !== RULES_VERSION) throw failure(403, 'сначала дождись одобрения и ознакомься с правилами');
            const payment = body.payment || {};
            if (!['ticket', 'season', 'permanent', 'offer', 'gift'].includes(payment.cardType)) throw failure(400, 'неверный тип оплаты');
            if (payment.cardType === 'gift' && !['season', 'permanent'].includes(payment.giftCardType)) throw failure(400, 'неверный тип подарочной карты');
            const endpoint = process.env.REGISTRATION_API_URL;
            if (!endpoint?.startsWith('https://script.google.com/')) throw failure(503, 'оплата пока не настроена');
            const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(15000), body: new URLSearchParams({
                action: 'initPayment', user_id: String(user.id), first_name: user.first_name || '', last_name: user.last_name || '',
                username: user.username || '', hike_date: String(payment.hikeDate || '').slice(0, 10),
                hike_title: String(payment.hikeTitle || '').slice(0, 200), card_type: payment.cardType,
                ...(payment.cardType === 'gift' ? { gift_card_type: payment.giftCardType } : {}),
            }) });
            const result = await response.json();
            if (!response.ok || result.status !== 'ok') throw failure(502, 'не удалось создать оплату, попробуй ещё раз');
            return res.status(200).json(result);
        }
        if (body.action === 'submit') {
            if (record) return res.status(200).json({ application: publicRecord(record), revision, serverNow: Date.now() });
            const form = validateForm(body.form);
            const context = { hikeDate: /^\d{4}-\d{2}-\d{2}$/.test(body.context?.hikeDate || '') ? body.context.hikeDate : '',
                hikeTitle: String(body.context?.hikeTitle || '').slice(0, 200) };
            await write(token, revision, { id: crypto.randomUUID(), userId: String(user.id), username: user.username, form, context,
                status: 'pending', createdAt: Date.now(), notification: { id: crypto.randomUUID(), status: 'pending' } });
        } else if (body.action === 'welcome') {
            if (record?.status !== 'approved') throw failure(403, 'заявка ещё не одобрена');
            if (body.accept !== true) throw failure(400, 'подтверди, что ознакомился с правилами');
            await write(token, revision, { ...record, rulesVersion: RULES_VERSION, rulesAcceptedAt: Date.now() });
        } else {
            if (body.revision !== revision) throw failure(409, 'заявка уже изменилась, обнови её');
            if (record?.notification?.status === 'sending' && Date.now() - record.notification.startedAt < 60000) throw failure(409, 'уведомление отправляется, подожди немного');
            if (body.action === 'reset') {
                await write(token, revision, null);
                return res.status(200).json({ application: { status: 'new' }, serverNow: Date.now() });
            }
            if (!record) throw failure(404, 'заявки пока нет');
            if (body.action === 'decide') {
                if (record.status !== 'pending') throw failure(409, 'по этой заявке уже принято решение');
                if (!['approved', 'rejected'].includes(body.decision)) throw failure(400, 'неверное решение');
                await write(token, revision, { ...record, status: body.decision, reviewedAt: Date.now(), reviewedBy: String(user.id),
                    notification: { id: crypto.randomUUID(), status: 'pending' } });
            }
        }
        if (['submit', 'decide', 'retry'].includes(body.action)) {
            try { await deliver(token); } catch { /* The durable state can be retried from admin. */ }
        }
        const latest = await read(token);
        return res.status(200).json({ application: publicRecord(latest.record), revision: latest.revision, serverNow: Date.now() });
    } catch (error) {
        return res.status(error.status || 502).json({ error: error.status ? error.message : 'не удалось связаться с клубом, попробуй ещё раз' });
    }
};
module.exports.isPilot = isPilot;
