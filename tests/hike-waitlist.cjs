const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sent = [], patches = [];
const lists = {
    '2026-10-18': { '1': { name: 'Аня', username: 'anna' } },
    '2026-10-25': { '1': { name: 'Аня' }, '2': { name: 'Иван', notified_at: 123 }, '3': { name: 'Катя' }, '4': { name: 'Олег' } }
};
const context = vm.createContext({ Date, FIREBASE_URL: 'https://test/', FIREBASE_SECRET: 'test',
    loadHikeWaitlist_: date => lists[date] || {},
    sendAutoMessage: message => { sent.push(message); return { ok: message.userId !== '4' }; },
    UrlFetchApp: { fetch: (url, options) => patches.push(JSON.parse(options.payload)) }
});
vm.runInContext(fs.readFileSync('appscript-hike-waitlist.gs','utf8'),context);
assert.equal(context.notifyHikeWaitlist_(['2026-10-18','2026-10-25'],'2026-10-25','хайк на Ай-Петри','11:00'),2);
const expected = 'регистрация открыта 🎟️\n\n<b>хайк на Ай-Петри</b>\nвоскресенье, 25 октября · 11:00\nкак и обещали – сообщаем тебе заранее, пока не опубликовали анонс для всех\n\nоткрой хайк, чтобы посмотреть маршрут и записаться';
assert.equal(sent.length,3,'Duplicates and previously notified subscribers must be skipped');
for (const message of sent) {
    assert.equal(message.text,expected);
    assert.equal(message.startapp,'hike_2026-10-25');
    assert.equal(message.buttonText,'открыть хайк');
    assert.equal(message.messageKey,'waitlist_open');
}
assert.deepEqual(Object.keys(patches[0]).sort(),['2026-10-18/1/notified_at','2026-10-25/3/notified_at']);
sent.length=0;patches.length=0;
assert.equal(context.notifyHikeWaitlist_(['2026-10-25'],'2026-10-25','Ай <Йори> & лес',''),2);
assert.ok(sent[0].text.includes('<b>Ай &lt;Йори&gt; &amp; лес</b>'));
assert.ok(!sent[0].text.includes(' · '),'Missing time must not leave a separator');
sent.length=0;patches.length=0;
assert.equal(context.notifyHikeWaitlist_(['2026-10-26'],'2026-10-26','маршрут','12:00'),0);
assert.equal(sent.length,0);assert.equal(patches.length,0);
console.log('Waitlist notification passed: exact approved copy, dynamic date/time, deep link, deduplication, escaped title, failed-send retry, no real sends');
