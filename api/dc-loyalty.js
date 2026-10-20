'use strict';
const crypto = require('node:crypto');
const { LoyaltyError, signCard, verifyCard, transact } = require('../lib/dietcakes-loyalty/ledger');
const { DATABASE, firebaseStore } = require('../lib/dietcakes-loyalty/firebase-store');
const PILOT_IDS = ['163665735', '7845375334'];
const ids = value => String(value || '').split(',').map(x => x.trim()).filter(x => /^\d{1,16}$/.test(x));
function sameSecret(actual, expected) { return typeof expected === 'string' && expected.length >= 32 && typeof actual === 'string' && Buffer.byteLength(actual) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)); }
function createHandler(deps) {
    return async function (req, res) {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
        const env = deps.env, mode = env.DC_LOYALTY_MODE;
        if (!['pilot', 'live'].includes(mode)) return res.status(503).json({ error: 'loyalty_disabled' });
        if (!env.DC_CARD_SIGNING_KEY || env.DC_CARD_SIGNING_KEY.length < 32) return res.status(503).json({ error: 'not_configured' });
        let body = req.body;
        try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_request' }); }
        if (!body || typeof body !== 'object' || JSON.stringify(body).length > 4096) return res.status(400).json({ error: 'invalid_request' });
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
        const cashiers = mode === 'pilot' ? PILOT_IDS : ids(env.DC_CASHIER_IDS);
        const allowed = bot && (action === 'card' || cashiers.includes(actor));
        if (store && action === 'card') return res.status(403).json({ error: 'action_forbidden' });
        if (bot && !allowed) return res.status(403).json({ error: 'cashier_forbidden' });
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
}
module.exports = createHandler({
    env: process.env,
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
