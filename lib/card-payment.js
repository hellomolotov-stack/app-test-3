// Before the new receipt system, the short payment confirmation left no durable mark.
const RECEIPTS_FROM = Date.parse('2026-11-24T11:00:00+03:00') / 1000;
const CARD_TYPES = new Set(['permanent', 'season', 'offer']);
const paidAt = payment => Number(payment.paid_at || payment.ts);

function latestCardPurchase(payments, uid) {
    return Object.entries(payments || {}).filter(([, payment]) => payment?.completed === true &&
        String(payment.user_id) === uid && CARD_TYPES.has(payment.card_type) && paidAt(payment) >= RECEIPTS_FROM)
        .sort(([, a], [, b]) => paidAt(b) - paidAt(a))[0];
}

module.exports = { latestCardPurchase };
