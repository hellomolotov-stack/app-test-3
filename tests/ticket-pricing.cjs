const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sources = ['js/state.js','js/api.js','js/ui/card-sheet.js','js/ui/calendar.js','js/ui/bot-nudge.js','js/ui/onboarding-chat.js','js/ui/home.js'];
for (const path of sources) {
    const source = fs.readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /1[ \u00a0\u202f]?500\s*₽/, path + ' must not quote the old ticket price');
}
for (const path of ['js/ui/card-sheet.js','js/ui/calendar.js']) assert.match(fs.readFileSync(path,'utf8'),/const TICKET_PRICE = 1200;/);
assert.match(fs.readFileSync('js/state.js','utf8'),/ticketPrice: 1200/);
assert.equal(Math.ceil(7500 / 1200), 7);
const faqAnswer = 'билет на хайк за 1 200 ₽';
const entries = { 'popupConfig/ticketPrice': 1500, faq: [{q:'как записаться?',a:'билет за 1 500 ₽'}] };
const writes = [];
const context = vm.createContext({
    SpreadsheetApp: {getActiveSpreadsheet:()=>({getId:()=> '1neN7zYOvUdfRK9bG7WRhsAZt9XmtYi9l_tzHeFvYlds',
        getSheetByName:()=>({getRange:range=>({getValue:()=>range==='B1'?'ticketPrice':1200,getValues:()=>[['как записаться?',faqAnswer]]})})})},
    clubPaymentProduct_:()=>({amount:1200}),
    FIREBASE_URL:'https://test/',FIREBASE_SECRET:'test',
    fbGet_:path=>entries[path], Logger:{log:()=>{}},
    UrlFetchApp:{fetch:(url,options)=>{
        const path=url.slice('https://test/'.length).split('.json')[0];
        writes.push(path);entries[path]=JSON.parse(options.payload);return {getResponseCode:()=>200};
    }}
});
vm.runInContext(fs.readFileSync('appscript-ticket-price-1200.gs','utf8'),context);
context.publishTicketPrice1200();
assert.deepEqual(writes,['popupConfig/ticketPrice','faq/0/a']);
assert.equal(entries['popupConfig/ticketPrice'],1200);
assert.equal(entries['faq/0/a'],faqAnswer);
context.clubPaymentProduct_=()=>({amount:1500});
assert.throws(()=>context.publishTicketPrice1200(),/Server ticket price must be 1200/);
console.log('Ticket pricing passed: app/bot text, 1200 constants, 7-hike break-even, exact data writes, stale server rejected');
