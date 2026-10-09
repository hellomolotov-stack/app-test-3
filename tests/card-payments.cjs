const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = vm.createContext({ URL, CARD_OFFER_PRICE: 5000 });
vm.runInContext(fs.readFileSync('appscript-card-payment.gs', 'utf8'), context);
const api = fs.readFileSync('js/api.js', 'utf8');
vm.runInContext(api.slice(api.indexOf('export function validatePayment'), api.indexOf('export async function initPayment')).replace('export ', ''), context);

function payment(type, giftType) {
    const product = context.clubPaymentProduct_({ card_type: type, gift_card_type: giftType });
    const receipt = encodeURIComponent(JSON.stringify({ items: [{ name: product.description, quantity: 1,
        sum: product.amount, payment_method: 'full_payment', payment_object: 'service', tax: 'none' }] }));
    const signature = crypto.createHash('md5').update(`test:${product.amount.toFixed(2)}:123:${receipt}:test-password`).digest('hex');
    const params = new URLSearchParams({ MerchantLogin: 'test', OutSum: product.amount.toFixed(2), InvId: '123',
        Receipt: receipt, SignatureValue: signature });
    return { status: 'ok', url: 'https://auth.robokassa.ru/Merchant/Index.aspx?' + params,
        card_type: type, gift_card_type: product.giftCardType, amount: product.amount };
}
for (const [type, giftType, amount, title] of [
    ['ticket', undefined, 1000, 'Билет'], ['season', undefined, 5500, 'сезонная'],
    ['permanent', undefined, 7500, 'бессрочная'], ['offer', undefined, 5000, 'бессрочная'],
    ['gift', 'season', 5500, 'сезонная'], ['gift', 'permanent', 7500, 'бессрочная'],
]) {
    const data = payment(type, giftType);
    assert.equal(data.amount, amount);
    const receipt = JSON.parse(decodeURIComponent(new URL(data.url).searchParams.get('Receipt')));
    assert.ok(receipt.items[0].name.includes(title));
    assert.equal(context.validatePayment(data, { cardType: type, giftCardType: giftType, expectedAmount: amount }), data);
    assert.throws(() => context.validatePayment(data, { cardType: type, giftCardType: giftType, expectedAmount: amount + 1 }));
    assert.throws(() => context.validatePayment({ ...data, amount: 1 }, { cardType: type, giftCardType: giftType }));
    const badReceipt = new URL(data.url);
    badReceipt.searchParams.set('Receipt', encodeURIComponent(JSON.stringify({ items: [{ name: title, quantity: 1, sum: 1, tax: 'none' }] })));
    assert.throws(() => context.validatePayment({ ...data, url: badReceipt.href }, { cardType: type, giftCardType: giftType }));
}
assert.equal(context.clubPaymentProduct_({ card_type: 'gift' }).amount, 5500, 'Legacy gift quote is preserved');
assert.throws(() => context.clubPaymentProduct_({ card_type: 'unknown' }));
assert.throws(() => context.clubPaymentProduct_({ card_type: 'gift', gift_card_type: 'offer' }));
assert.throws(() => context.validatePayment(payment('gift', 'season'), { cardType: 'gift', giftCardType: 'permanent' }));
assert.ok(context.clubPaymentProduct_({ card_type: 'season' }).description.includes('текущий и следующий сезон'));
console.log('Card payments passed: ticket, season, permanent, offer, both gifts, receipt totals/types, invalid data, legacy quote');

const initSource = api.slice(api.indexOf('export async function initPayment'), api.indexOf('// Личное спецпредложение')).replace('export ', '');
Object.assign(context, { URLSearchParams, AbortController, setTimeout, clearTimeout, log: () => {}, REGISTRATION_API_URL: 'https://script.google.com/test' });
vm.runInContext(initSource, context);
(async () => {
    for (const pilot of [false, true]) {
        context.isAdmissionPilot = () => pilot;
        for (const giftType of ['season', 'permanent']) {
            let sent;
            context.fetch = async (url, options) => { sent = Object.fromEntries(options.body); return { text: async () => JSON.stringify(payment('gift', giftType)) }; };
            context.admissionRequest = async (action, body) => { sent = body.payment; return payment('gift', giftType); };
            const result = await context.initPayment({ userId: '123', cardType: 'gift', giftCardType: giftType });
            assert.equal(result.gift_card_type, giftType);
            assert.equal(pilot ? sent.giftCardType : sent.gift_card_type, giftType);
        }
    }
    console.log('Payment transport passed: gift type forwarded in regular and admission-pilot flows');
})().catch(error => { console.error(error); process.exitCode = 1; });
