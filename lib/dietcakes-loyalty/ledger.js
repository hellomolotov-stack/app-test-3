'use strict';
const crypto = require('node:crypto');
const LIMIT = 1500000; // kopecks, gross before discount
class LoyaltyError extends Error { constructor(code, status = 409) { super(code); this.code = code; this.status = status; } }
const fail = (code, status) => { throw new LoyaltyError(code, status); };
function amount(value) { if (!Number.isSafeInteger(value) || value <= 0 || value > 100000000) fail('invalid_amount', 400); return value; }
function identifier(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(value)) fail('invalid_reference', 400); return value; }
function monthAt(now) { return new Date(now + 10800000).toISOString().slice(0, 7); }
function recordKey(source, reference) { if (!['offline', 'online'].includes(source)) fail('invalid_source', 400); return crypto.createHash('sha256').update(`${source}:${identifier(reference)}`).digest('hex'); }
function bucket(state, month) { return state.months[month] ||= { usedGross: 0, operations: {} }; }
function activeHold(op, now) { return op.state === 'reserved' && (op.expiresAt === null || op.expiresAt > now); }
function usage(month, now) { const reservedGross = Object.values(month.operations).filter(op => activeHold(op, now)).reduce((sum, op) => sum + op.gross, 0); return { usedGross: month.usedGross, reservedGross, remainingGross: Math.max(0, LIMIT - month.usedGross - reservedGross) }; }
function split(gross, available) { amount(gross); const highGross = Math.min(gross, Math.max(0, available)), lowGross = gross - highGross; const discount = Math.round((highGross * 10 + lowGross * 5) / 100); return { gross, highGross, lowGross, discount, payable: gross - discount }; }
function locate(state, key) { for (const [month, data] of Object.entries(state.months)) if (data.operations[key]) return { month, data, op: data.operations[key] }; return null; }
function fingerprint(input) { return { source: input.source, reference: identifier(input.reference), actor: identifier(input.actor) }; }
function publicOperation(op, month) { return { month, state: op.state, ...op.quote, refundedGross: op.refundedGross || 0, expiresAt: op.expiresAt }; }
function transition(raw, input, now = Date.now()) {
    if (!Number.isSafeInteger(now)) fail('invalid_time', 400);
    const state = raw ? structuredClone(raw) : { version: 1, months: {} };
    if (state.version !== 1 || !state.months || typeof state.months !== 'object') fail('invalid_ledger', 503);
    const currentMonth = monthAt(now), current = bucket(state, currentMonth);
    if (input.action === 'status') return { state, value: { month: currentMonth, limitGross: LIMIT, ...usage(current, now) } };
    if (input.action === 'quote') return { state, value: { month: currentMonth, ...split(amount(input.gross), usage(current, now).remainingGross) } };
    const fp = fingerprint(input), key = recordKey(input.source, input.reference), found = locate(state, key);
    if (found && (found.op.actor !== fp.actor || found.op.source !== fp.source || found.op.reference !== fp.reference)) fail('operation_owner_mismatch', 403);
    if (input.action === 'reserve') {
        const gross = amount(input.gross);
        if (found) {
            if (found.op.gross !== gross) fail('idempotency_conflict');
            if (found.op.state !== 'reserved' && found.op.state !== 'confirmed') fail('operation_closed');
            if (found.op.state === 'reserved' && !activeHold(found.op, now)) fail('reservation_expired');
            return { state, value: publicOperation(found.op, found.month) };
        }
        const op = { ...fp, gross, quote: split(gross, usage(current, now).remainingGross), state: 'reserved', createdAt: now,
            // Online holds stay until the store explicitly confirms/cancels its order.
            expiresAt: input.source === 'offline' ? now + 600000 : null };
        current.operations[key] = op;
        return { state, value: publicOperation(op, currentMonth) };
    }
    if (!found) fail('operation_not_found', 404);
    const { op, data, month } = found;
    if (input.action === 'confirm') {
        if (op.state === 'confirmed') return { state, value: publicOperation(op, month) };
        if (!activeHold(op, now)) fail('reservation_expired');
        // A quote must be recalculated across a calendar-month boundary.
        if (month !== currentMonth) fail('month_changed');
        op.state = 'confirmed'; op.confirmedAt = now; data.usedGross += op.gross;
    } else if (input.action === 'cancel') {
        if (op.state === 'confirmed') fail('confirmed_sale_requires_refund');
        op.state = 'cancelled'; op.cancelledAt ||= now;
    } else if (input.action === 'refund') {
        if (op.state !== 'confirmed') fail('sale_not_confirmed');
        const refundId = identifier(input.refundReference), gross = amount(input.gross);
        op.refunds ||= {};
        if (op.refunds[refundId]) {
            if (op.refunds[refundId].gross !== gross) fail('idempotency_conflict');
        } else {
            const refunded = op.refundedGross || 0;
            if (refunded + gross > op.gross) fail('refund_exceeds_sale');
            // Refunding belongs to the sale's original month, never the current month.
            op.refunds[refundId] = { gross, at: now }; op.refundedGross = refunded + gross; data.usedGross -= gross;
        }
    } else fail('invalid_action', 400);
    return { state, value: publicOperation(op, month) };
}
function signCard(uid, secret) { if (!/^\d{1,16}$/.test(String(uid))) fail('invalid_card', 400); const prefix = `dc1_${uid}`; return `${prefix}_${crypto.createHmac('sha256', secret).update(prefix).digest('base64url').slice(0, 28)}`; }
function verifyCard(value, secret) { const match = /^dc1_(\d{1,16})_([A-Za-z0-9_-]{28})$/.exec(String(value)); if (!match) fail('invalid_card', 400); const expected = signCard(match[1], secret); if (!crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) fail('invalid_card', 403); return match[1]; }
async function transact(store, uid, command, now = Date.now()) {
    for (let attempt = 0; attempt < 6; attempt++) {
        const snapshot = await store.read(uid), result = transition(snapshot.value, command, now);
        if (['status', 'quote'].includes(command.action)) return result.value;
        // Only retry a proven CAS conflict. Never blindly repeat a timed-out write.
        if (await store.compareAndSet(uid, snapshot.etag, result.state)) return result.value;
    }
    fail('concurrent_update_retry', 409);
}
module.exports = { LIMIT, LoyaltyError, amount, monthAt, split, transition, signCard, verifyCard, transact };
