const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../appscript-digest-fix.gs'), 'utf8');
const messages = [];
const logs = [];
let fail = false;
const rows = [
  [new Date('2026-10-08T13:18:21Z'), '1', 'visitor', 'Имя <тест>', '', 'пришёл по ссылке: hike_<дата>'],
  [new Date('2026-10-08T13:18:36Z'), '1', 'visitor', 'Имя <тест>', '', 'пришёл по ссылке: hike_<дата>'],
  [new Date('2026-10-08T13:20:00Z'), '2', 'maxmolotov', 'Админ', '', 'тест'],
  [new Date('2026-10-08T12:00:00Z'), '3', 'old_visitor', 'Имя', '', 'старое действие'],
];
const headers = ['timestamp', 'user_id', 'username', 'first_name', 'last_name', 'action'];
const context = vm.createContext({
  Logger: { log: value => logs.push(value) },
  Date,
  TEST_ACCOUNTS: ['maxmolotov', 'hellointelligent'],
  Utilities: { formatDate: value => new Date(value.getTime() + 3 * 3600000).toISOString().slice(11, 16) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => {
    assert.equal(name, 'guests');
    return {
      getLastRow: () => rows.length + 1, getLastColumn: () => 6,
      getRange: start => ({ getValues: () => start === 1 ? [headers] : rows }),
    };
  } }) },
  getAdminChatId: () => 'test-admin',
  sendTelegramMessage: (chatId, text) => {
    assert.equal(chatId, 'test-admin');
    if (text.includes('<дата>')) return { ok: false, error: 'Bad Request: unsupported start tag' };
    if (fail) return { ok: false, error: 'test delivery error' };
    messages.push(text);
    return { ok: true };
  },
});
vm.runInContext(source, context);
assert.equal(context.escapeDigestHtml_('<дата> & "текст"'), '&lt;дата&gt; &amp; &quot;текст&quot;');
assert.equal(context.prettyAction_('пришёл по ссылке: hike_<дата>_guest'), 'пришёл по ссылке: hike_&lt;дата&gt; (гость)');
assert.equal(context.prettyAction_('клик: R&D'), '👆 R&amp;D');
assert.equal(context.formatUserLink('user', 'Имя <тест>', 'A&B', ''), '<a href="https://t.me/user">Имя &lt;тест&gt; A&amp;B</a> (@user)');
assert.equal(context.formatUserLink('', 'Имя', '', '123'), '<a href="tg://user?id=123">Имя</a>');
assert.equal(context.formatUserLink('bad"<tag>', 'Имя', '', '123'), '<a href="tg://user?id=123">Имя</a>');
assert.equal(context.sendLongTelegram_('test-admin', context.prettyAction_('hike_<дата>')), 1);
assert.equal(messages[0], 'hike_&lt;дата&gt;');
const long = Array.from({ length: 100 }, () => 'действие '.repeat(10)).join('\n');
assert.ok(context.sendLongTelegram_('test-admin', long) > 1);
assert.ok(messages.every(text => text.length <= 3900));
fail = true;
assert.throws(() => context.sendLongTelegram_('test-admin', 'отчёт'), /test delivery error/, 'Telegram errors cannot silently mark a digest as successful');
fail = false;
context.recoverHourlyDigest20261008();
const recovered = messages[messages.length - 1];
assert.ok(recovered.includes('Активность за 15:46–16:46'));
assert.ok(recovered.includes('hike_&lt;дата&gt; ×2'));
assert.ok(recovered.includes('Имя &lt;тест&gt;'));
assert.ok(!recovered.includes('Админ'));
assert.ok(!recovered.includes('старое действие'));
assert.ok(logs.some(value => value.includes('unsupported start tag')));
assert.ok(logs.some(value => value.includes('hourly digest: 2 action(s)')));
const count = messages.length;
context.sendHourlyDigest(new Date('2026-10-08T15:46:42Z'));
assert.equal(messages.length, count, 'Empty hours do not send reports');
console.log('Digest regression tests passed: HTML escaping, safe names, chunks, delivery errors, recovery');
