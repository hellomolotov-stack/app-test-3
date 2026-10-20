'use strict';
const crypto = require('node:crypto');
const { LoyaltyError, signCard, verifyCard, transact } = require('../lib/dietcakes-loyalty/ledger');
const { DATABASE, firebaseStore } = require('../lib/dietcakes-loyalty/firebase-store');
const PILOT_IDS = ['163665735', '7845375334'];
const ids = value => String(value || '').split(',').map(x => x.trim()).filter(x => /^\d{1,16}$/.test(x));
function sameSecret(actual, expected) { return typeof expected === 'string' && expected.length >= 32 && typeof actual === 'string' && Buffer.byteLength(actual) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)); }
// ---- заказы «на хайк»: сразу пишем организатору в бот, накануне в 17:05 – итог по хайку ----
const rub = k => (Math.round(Number(k) || 0) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const dayLabel = d => { const [y, m, dd] = d.split('-').map(Number); return `${String(dd).padStart(2, '0')}.${String(m).padStart(2, '0')} (${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]})`; };
const FREE_DELIVERY = 200000; // от 2 000 ₽ за хайк магазин везёт боксы организатору домой
function cleanOrder(o) {
    if (!o || typeof o !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.date)) || !/^[\w-]{1,20}$/.test(String(o.number)) || !['paid', 'cancelled'].includes(o.status)) return null;
    const int = v => Number.isSafeInteger(v) && v >= 0 && v < 1e9 ? v : 0, str = (v, n) => String(v == null ? '' : v).slice(0, n);
    return { number: str(o.number, 20), status: o.status, date: o.date, route: str(o.route, 120), name: str(o.name, 60), phone: str(o.phone, 30),
        items: (Array.isArray(o.items) ? o.items : []).slice(0, 30).map(i => ({ name: str(i && i.name, 80), qty: int(i && i.qty), total: int(i && i.total) })),
        total: int(o.total), card_discount: int(o.card_discount), ready_food: o.ready_food === true, tg: str(o.tg, 64) };
}
function hikeTotals(orders) {
    const paid = Object.values(orders || {}).filter(o => o && o.status === 'paid');
    const sum = paid.reduce((a, o) => a + (o.total || 0), 0);
    return { paid, sum, decision: sum >= FREE_DELIVERY ? '🚚 магазин везёт боксы к тебе домой' : `🛍 забираешь в магазине сам (до ${rub(FREE_DELIVERY)})` };
}
// Подписанный Telegram ID покупателя (любого, не только владельца карты) – чтобы бот мог написать ему о его заказе.
function signRef(uid, secret) { const p = `tg1_${uid}`; return `${p}_${crypto.createHmac('sha256', secret).update(p).digest('base64url').slice(0, 28)}`; }
function verifyRef(value, secret) {
    const m = /^tg1_(\d{1,16})_([A-Za-z0-9_-]{28})$/.exec(String(value || '')); if (!m) return '';
    const expected = signRef(m[1], secret);
    return crypto.timingSafeEqual(Buffer.from(String(value)), Buffer.from(expected)) ? m[1] : '';
}
// крайний срок заказа (и бесплатной отмены) – как в плагине: 17:00 МСК накануне, с готовой едой 20:00 за два дня
function hikeDeadline(date, ready) { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d - (ready ? 2 : 1), ready ? 17 : 14, 0); }
function orderLines(o) {
    return [`👤 ${esc(o.name || 'без имени')}${o.phone ? ' · ' + esc(o.phone) : ''}`,
        `🧺 ${o.items.map(i => `${esc(i.name)}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ') || '—'}`,
        `💳 ${rub(o.total)}${o.card_discount ? ` (скидка по карте ${rub(o.card_discount)})` : ''}${o.ready_food ? ' · 🍱 готовая еда' : ''}`];
}
function createHandler(deps) {
    const handle = async function (req, res) {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'POST only' });
        const env = deps.env, mode = env.DC_LOYALTY_MODE;
        if (!['pilot', 'live'].includes(mode)) return res.status(503).json({ error: 'loyalty_disabled' });
        if (!env.DC_CARD_SIGNING_KEY || env.DC_CARD_SIGNING_KEY.length < 32) return res.status(503).json({ error: 'not_configured' });
        // Vercel Cron: итог по хайку завтрашнего дня
        if (req.method === 'GET') {
            if (!sameSecret(String(req.headers.authorization || '').replace(/^Bearer /, ''), env.CRON_SECRET)) return res.status(401).json({ error: 'unauthorized' });
            const tomorrow = new Date(Date.now() + 3 * 3600000 + 86400000).toISOString().slice(0, 10);
            const { paid, sum, decision } = hikeTotals(await deps.hikeOrders.read(tomorrow));
            if (!paid.length) return res.status(200).json({ sent: false, date: tomorrow });
            const routes = [...new Set(paid.map(o => o.route).filter(Boolean))].join(', ');
            const text = [`📦 <b>Боксы на хайк завтра, ${dayLabel(tomorrow)}</b>${routes ? ' · ' + esc(routes) : ''}`,
                `${paid.length} ${paid.length === 1 ? 'заказ' : paid.length < 5 ? 'заказа' : 'заказов'} на ${rub(sum)} → ${decision}`, '',
                ...paid.map((o, i) => [`<b>${i + 1}. №${esc(o.number)}</b>`, ...orderLines(o)].join('\n'))].join('\n');
            await deps.notify(text);
            return res.status(200).json({ sent: true, date: tomorrow, orders: paid.length });
        }
        let body = req.body;
        try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_request' }); }
        if (!body || typeof body !== 'object' || JSON.stringify(body).length > 16384) return res.status(400).json({ error: 'invalid_request' });
        // Приложение: подписанный Telegram ID для ссылки в магазин (любому пользователю)
        if (body.action === 'app_ref' || body.action === 'hike_cancelled') {
            const user = deps.verifyInitData(String(body.initData || ''));
            if (!user || !/^\d{1,16}$/.test(String(user.id))) return res.status(401).json({ error: 'unauthorized' });
            const uid = String(user.id);
            if (body.action === 'app_ref') return res.status(200).json({ ref: signRef(uid, env.DC_CARD_SIGNING_KEY) });
            // человек отменил участие в хайке – если у него оплачен бокс на эту дату, бот спросит, что с ним сделать
            const date = String(body.date || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });
            try {
                const mine = Object.values(await deps.hikeOrders.read(date)).filter(o => o && o.status === 'paid' && o.tg === uid && !o.request);
                for (const o of mine) {
                    const canCancel = Date.now() < hikeDeadline(date, o.ready_food);
                    const buttons = [[{ text: 'заберу сам в магазине', callback_data: `dco:p:${date}:${o.number}` }]];
                    if (canCancel) buttons.unshift([{ text: 'отменить заказ и вернуть деньги', callback_data: `dco:c:${date}:${o.number}` }]);
                    await deps.message(uid, [`Ты отменил(а) участие в хайке ${dayLabel(date)}, а у тебя оплачен хайкинг бокс (заказ №${esc(o.number)}, ${rub(o.total)}).`,
                        '', canCancel ? 'Что с ним сделать?' : 'Бокс уже собирают, поэтому отменить его нельзя – но его можно забрать в магазине «Жить здорово».'].join('\n'), buttons);
                }
                return res.status(200).json({ orders: mine.length });
            } catch { return res.status(503).json({ error: 'service_unavailable' }); }
        }
        // Приложение клуба: владелец карты получает свой QR для кассы. Личность – только из подписанных данных Telegram.
        if (body.action === 'app_card') {
            const user = deps.verifyInitData(String(body.initData || ''));
            if (!user || !/^\d{1,16}$/.test(String(user.id))) return res.status(401).json({ error: 'unauthorized' });
            const uid = String(user.id);
            if (mode === 'pilot' && !PILOT_IDS.includes(uid)) return res.status(403).json({ error: 'pilot_card_only' });
            try {
                if (!await deps.activeMember(uid)) return res.status(403).json({ error: 'inactive_card' });
            } catch { return res.status(503).json({ error: 'service_unavailable' }); }
            const card = signCard(uid, env.DC_CARD_SIGNING_KEY);
            return res.status(200).json({ url: `https://t.me/yaltahiking_bot?start=${card}`, mode });
        }
        const bot = sameSecret(req.headers['x-dc-bot-key'], env.DC_CASHIER_BOT_KEY);
        const store = sameSecret(req.headers['x-dc-store-key'], env.DC_STORE_KEY);
        if (!bot && !store) return res.status(401).json({ error: 'unauthorized' });
        if (bot && body.mode !== mode) return res.status(409).json({ error: 'mode_mismatch' });
        if (bot && store) return res.status(400).json({ error: 'ambiguous_actor' });
        const actor = String(body.actor || ''), action = body.action;
        if (!/^\d{1,16}$/.test(actor)) return res.status(400).json({ error: 'invalid_actor' });
        // Покупатель выбрал в боте, что делать с боксом после отмены участия
        if (bot && action === 'box_choice') {
            const date = String(body.date || ''), number = String(body.number || ''), choice = body.choice;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[\w-]{1,20}$/.test(number) || !['cancel', 'pickup'].includes(choice)) return res.status(400).json({ error: 'invalid_request' });
            try {
                const all = await deps.hikeOrders.read(date), o = all[number];
                if (!o || o.tg !== actor || o.status !== 'paid') return res.status(404).json({ error: 'order_not_found' });
                if (o.request) return res.status(200).json({ ok: true, choice: o.request, already: true });
                if (choice === 'cancel' && Date.now() >= hikeDeadline(date, o.ready_food)) return res.status(409).json({ error: 'too_late' });
                await deps.hikeOrders.save({ ...o, request: choice });
                await deps.notify(choice === 'cancel'
                    ? [`↩️ <b>Запрос на отмену · заказ №${esc(o.number)}</b>`, `Покупатель не идёт на хайк ${dayLabel(date)} и просит отменить заказ и вернуть деньги.`, ...orderLines(o), '', 'Магазин: отмени заказ и сделай возврат в WooCommerce – покупатель получит уведомление сам.'].join('\n')
                    : [`🛍 <b>Заберёт сам · заказ №${esc(o.number)}</b>`, `Покупатель не идёт на хайк ${dayLabel(date)} и заберёт бокс в магазине. На хайк этот заказ не везём.`, ...orderLines(o)].join('\n'));
                return res.status(200).json({ ok: true, choice });
            } catch { return res.status(503).json({ error: 'service_unavailable' }); }
        }
        // Сотрудники магазина (добавляет владелец через бота): касса + уведомления о заказах, без прав администратора бота.
        const owners = ids(env.DC_OWNER_IDS || '163665735');
        if (bot && ['staff_invite', 'staff_join', 'staff_list', 'staff_remove', 'staff_ids'].includes(action)) {
            try {
                if (action === 'staff_ids') return res.status(200).json({ ids: Object.keys(await deps.staff.members()), owners, mode });
                if (action === 'staff_join') {
                    const code = String(body.code || '');
                    if (!/^[a-z0-9]{8,24}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
                    const invite = await deps.staff.takeInvite(code);
                    if (!invite || invite.exp < Date.now()) return res.status(410).json({ error: 'invite_expired' });
                    await deps.staff.add(actor, String(body.name || '').slice(0, 60));
                    return res.status(200).json({ ok: true, mode });
                }
                if (!owners.includes(actor)) return res.status(403).json({ error: 'owner_only' });
                if (action === 'staff_invite') return res.status(200).json({ code: await deps.staff.invite(Date.now() + 7 * 86400000), mode });
                if (action === 'staff_list') return res.status(200).json({ members: await deps.staff.members(), mode });
                const uid = String(body.uid || '');
                if (!/^\d{1,16}$/.test(uid)) return res.status(400).json({ error: 'invalid_uid' });
                await deps.staff.remove(uid);
                return res.status(200).json({ ok: true, mode });
            } catch { return res.status(503).json({ error: 'service_unavailable' }); }
        }
        let staffIds = [];
        if (bot && action !== 'card') { try { staffIds = Object.keys(await deps.staff.members()); } catch { staffIds = []; } }
        const cashiers = mode === 'pilot' ? PILOT_IDS : ids(env.DC_CASHIER_IDS).concat(staffIds);
        const allowed = bot && (action === 'card' || cashiers.includes(actor));
        if (store && action === 'card') return res.status(403).json({ error: 'action_forbidden' });
        if (bot && !allowed) return res.status(403).json({ error: 'cashier_forbidden' });
        if (store && action === 'health') return res.status(200).json({ ok: true });
        if (store && action === 'hike_order') {
            const order = cleanOrder(body.order);
            if (!order) return res.status(400).json({ error: 'invalid_order' });
            order.tg = verifyRef(order.tg, env.DC_CARD_SIGNING_KEY); // подпись не сошлась – просто без Telegram
            try {
                const prev = (await deps.hikeOrders.read(order.date))[order.number];
                if (prev && prev.request) order.request = prev.request;
                if (order.status === 'cancelled' && order.tg) await deps.message(order.tg, `Заказ хайкинг бокса №${esc(order.number)} отменён. Деньги вернутся тем же способом, которым ты платил(а).`);
                const all = await deps.hikeOrders.save(order);
                const { paid, sum, decision } = hikeTotals(all);
                const head = order.status === 'paid'
                    ? `🆕 <b>Бокс на хайк ${dayLabel(order.date)}</b> · заказ №${esc(order.number)} оплачен`
                    : `❌ <b>Заказ №${esc(order.number)} отменён</b> · хайк ${dayLabel(order.date)}`;
                const text = [head, order.route ? `🏔 ${esc(order.route)}` : '', ...orderLines(order), '',
                    `Итого на ${dayLabel(order.date)}: ${paid.length} ${paid.length === 1 ? 'заказ' : paid.length < 5 ? 'заказа' : 'заказов'} на ${rub(sum)} → ${decision}`].filter(x => x !== '').join('\n');
                await deps.notify(text);
                return res.status(200).json({ ok: true });
            } catch { return res.status(503).json({ error: 'service_unavailable' }); }
        }
        if (store && (!env.DC_ONLINE_ENABLED || env.DC_ONLINE_ENABLED !== '1')) return res.status(503).json({ error: 'online_disabled' });
        try {
            const uid = action === 'card' && bot ? actor : verifyCard(body.card, env.DC_CARD_SIGNING_KEY);
            if (mode === 'pilot' && !PILOT_IDS.includes(uid)) throw new LoyaltyError('pilot_card_only', 403);
            if (!['card', 'status', 'quote', 'reserve', 'confirm', 'cancel', 'refund'].includes(action)) throw new LoyaltyError('invalid_action', 400);
            if (bot && action === 'refund' && !ids(env.DC_REFUND_ADMIN_IDS).includes(actor)) throw new LoyaltyError('refund_forbidden', 403);
            if (!['confirm', 'cancel', 'refund'].includes(action) && !await deps.activeMember(uid)) throw new LoyaltyError('inactive_card', 403);
            if (action === 'card') {
                const card = signCard(uid, env.DC_CARD_SIGNING_KEY);
                return res.status(200).json({ card, url: `https://t.me/yaltahiking_bot?start=${card}`, mode });
            }
            const command = { action, source: bot ? 'offline' : 'online', actor: bot ? actor : 'dietcakes', reference: body.reference,
                gross: body.gross, refundReference: body.refundReference };
            const result = await transact(deps.store(mode), uid, command, deps.now ? deps.now() : Date.now());
            return res.status(200).json({ ...result, mode });
        } catch (error) {
            // No user amounts, QR tokens, credentials, provider errors or request bodies in logs.
            const known = error instanceof LoyaltyError;
            return res.status(known ? error.status : 503).json({ error: known ? error.code : 'service_unavailable' });
        }
    };
    return async function (req, res) {
        const started = Date.now();
        let status = 200;
        const originalStatus = res.status;
        res.status = function (code) { status = code; return originalStatus.call(this, code); };
        try { return await handle(req, res); }
        finally {
            res.status = originalStatus;
            // Operational metadata only: never log bodies, identifiers, signatures or keys.
            let body = req.body;
            try { if (typeof body === 'string') body = JSON.parse(body); } catch { body = null; }
            const actions = ['app_card', 'app_ref', 'health', 'quote', 'status', 'reserve', 'confirm', 'cancel', 'refund', 'card', 'hike_order', 'hike_cancelled', 'box_choice', 'staff_invite', 'staff_join', 'staff_list', 'staff_remove', 'staff_ids'];
            const headers = req.headers || {};
            const report = { event: 'dc_loyalty_result', action: req.method === 'GET' ? 'cron' : actions.includes(body && body.action) ? body.action : 'unknown',
                status, duration_ms: Math.max(0, Date.now() - started),
                store_key_present: typeof headers['x-dc-store-key'] === 'string',
                store_authorized: sameSecret(headers['x-dc-store-key'], deps.env.DC_STORE_KEY),
                bot_key_present: typeof headers['x-dc-bot-key'] === 'string',
                card_present: !!(body && typeof body.card === 'string' && body.card.length),
                init_data_present: !!(body && typeof body.initData === 'string' && body.initData.length) };
            try { (deps.diagnostic || (value => console.info(JSON.stringify(value))))(report); } catch { /* Diagnostics must never affect the response. */ }
        }
    };
}
module.exports = createHandler({
    env: process.env,
    staff: {
        async req(path, init = {}) {
            const { getAccessToken } = require('./club-content');
            const r = await fetch(`${DATABASE}/dcShopStaff/${path}.json`, { ...init, headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error('staff');
            return r.json();
        },
        async members() { return (await this.req('members')) || {}; },
        async add(uid, name) { await this.req(`members/${uid}`, { method: 'PUT', body: JSON.stringify({ name, at: Date.now() }) }); },
        async remove(uid) { await this.req(`members/${uid}`, { method: 'DELETE' }); },
        async invite(exp) { const code = crypto.randomBytes(9).toString('hex'); await this.req(`invites/${code}`, { method: 'PUT', body: JSON.stringify({ exp }) }); return code; },
        async takeInvite(code) { const inv = await this.req(`invites/${code}`); if (inv) await this.req(`invites/${code}`, { method: 'DELETE' }); return inv; }
    },
    hikeOrders: {
        // dcHikeOrders/<дата>/<номер заказа> – закрыт для чтения клиентам, пишет только сервер
        async save(order) {
            const { getAccessToken } = require('./club-content'), token = await getAccessToken();
            const url = `${DATABASE}/dcHikeOrders/${order.date}/${order.number}.json`;
            const put = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...order, at: Date.now() }), signal: AbortSignal.timeout(8000) });
            if (!put.ok) throw new Error('save');
            return this.read(order.date, token);
        },
        async read(date, token) {
            const { getAccessToken } = require('./club-content');
            const r = await fetch(`${DATABASE}/dcHikeOrders/${date}.json`, { headers: { Authorization: `Bearer ${token || await getAccessToken()}` }, signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error('read');
            return (await r.json()) || {};
        }
    },
    async message(uid, text, buttons) {
        const token = process.env.TELEGRAM_BOT_TOKEN; if (!token || !/^\d{1,16}$/.test(String(uid))) return;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: uid, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) }),
            signal: AbortSignal.timeout(8000) }).catch(() => {});
    },
    async notify(text) {
        const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) return;
        let staff = []; try { staff = Object.keys(await this.staff.members()); } catch { staff = []; }
        const ids = [...new Set(String(process.env.DC_ORDER_NOTIFY_IDS || '163665735').split(',').map(x => x.trim()).concat(staff))].filter(x => /^\d{1,16}$/.test(x));
        await Promise.all(ids.map(id => fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: id, text, parse_mode: 'HTML', disable_web_page_preview: true }), signal: AbortSignal.timeout(8000) }).catch(() => {})));
    },
    verifyInitData(initData) { const token = process.env.TELEGRAM_BOT_TOKEN; return token ? require('./tg-auth').verifyInitData(initData, token) : null; },
    store(mode) { const { getAccessToken } = require('./club-content'); return firebaseStore(getAccessToken, mode === 'pilot' ? 'dietcakesLoyaltyPilot' : 'dietcakesLoyalty'); },
    async activeMember(uid) {
        const { getAccessToken } = require('./club-content');
        const response = await fetch(`${DATABASE}/members/${uid}.json`, { headers: { Authorization: `Bearer ${await getAccessToken()}` }, signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error('member unavailable');
        const member = await response.json();
        return !!member && String(member.user_id) === uid && !['inactive', 'revoked', 'blocked'].includes(member.status) && member.active !== false;
    }
});
module.exports.createHandler = createHandler;
