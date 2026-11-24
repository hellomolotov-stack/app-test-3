const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { latestCardPurchase } = require('../lib/card-payment');

const source = fs.readFileSync('api/me.js', 'utf8');
const handler = source.slice(source.indexOf('async function cardPaymentReceipt'), source.indexOf('module.exports ='));
const receipts = new Map();
const ts = Date.parse('2026-11-25T10:00:00+03:00') / 1000;
const purchase = { user_id: 1, completed: true, card_type: 'season', ts };
const payments = {
    old: { ...purchase, ts: ts - 86400 },
    first: purchase,
    other: { ...purchase, user_id: 2, ts: ts + 1 },
    gift: { ...purchase, card_type: 'gift', ts: ts + 2 },
    unpaid: { ...purchase, completed: false, ts: ts + 3 },
};
const context = vm.createContext({
    DB: 'https://test.invalid',
    AbortSignal,
    latestCardPurchase,
    getAccessToken: async () => 'fake-token',
    read: async (path) => path === 'pending_payments' ? payments : { user_id: 1 },
    fetch: async (url, options) => {
        if (options.method !== 'PUT') {
            const value = receipts.get(url) || null;
            return { ok: true, headers: new Headers({ etag: '"empty"' }), json: async () => value };
        }
        assert.equal(options.headers['If-Match'], '"empty"');
        if (receipts.has(url)) return { status: 412 };
        receipts.set(url, JSON.parse(options.body));
        return { ok: true };
    },
});
vm.runInContext(handler, context);
const request = () => context.cardPaymentReceipt({ id: 1 }, { status(code) {
    assert.equal(code, 200);
    return { json: body => body };
} });

(async () => {
    assert.equal(latestCardPurchase(payments, '1')[0], 'first');
    const concurrent = await Promise.all([request(), request()]);
    assert.equal(concurrent.filter(x => x.show).length, 1);
    assert.equal(concurrent.find(x => x.show).plan, 'season');
    assert.equal((await request()).show, false);
    payments.renewal = { ...purchase, card_type: 'permanent', paid_at: ts + 20 };
    assert.equal((await request()).show, true);
    assert.equal((await request()).show, false);
    assert.equal(receipts.size, 2);
    console.log('Card receipt: concurrent opens, reopen and new purchase passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
