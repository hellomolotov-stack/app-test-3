// Replacement helpers for the existing Firebase Apps Script file.
function escapeDigestHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatUserLink(username, firstName, lastName, userId) {
  const uname = String(username || '').replace(/^@/, '');
  const name = escapeDigestHtml_([firstName, lastName].filter(Boolean).join(' ') || uname || String(userId || ''));
  if (/^[A-Za-z0-9_]+$/.test(uname)) {
    return `<a href="https://t.me/${uname}">${name}</a> (@${uname})`;
  }
  if (/^\d+$/.test(String(userId || ''))) {
    return `<a href="tg://user?id=${userId}">${name}</a>`;
  }
  return name;
}

function sendLongTelegram_(chatId, text) {
  const LIMIT = 3900;
  const lines = String(text).split('\n');
  let chunk = '';
  let sent = 0;
  function sendChunk(value) {
    const result = sendTelegramMessage(chatId, value);
    if (!result || !result.ok) {
      throw new Error('Telegram digest delivery failed: ' + String(result && result.error || 'unknown'));
    }
    sent++;
  }
  lines.forEach(line => {
    if (chunk && (chunk + '\n' + line).length > LIMIT) {
      sendChunk(chunk);
      chunk = '<i>…продолжение</i>\n' + line;
    } else {
      chunk = chunk ? chunk + '\n' + line : line;
    }
  });
  if (chunk.trim()) sendChunk(chunk);
  Logger.log('digest: successfully sent ' + sent + ' message(s)');
  return sent;
}

function prettyAction_(action) {
  let a = String(action || '—').trim();
  let guest = false;
  if (/_guest$/.test(a)) { guest = true; a = a.replace(/_guest$/, ''); }
  if (a.indexOf('клик: ') === 0) a = '👆 ' + a.substring(6);
  else if (a.indexOf('крутит 3D-карту') === 0) a = '🗺 ' + a;
  return escapeDigestHtml_(guest ? a + ' (гость)' : a);
}

function sendHourlyDigest(endAt) {
  const adminChatId = getAdminChatId();
  if (!adminChatId) throw new Error('ADMIN_CHAT_ID is not configured');
  const guestsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('guests');
  if (!guestsSheet || guestsSheet.getLastRow() < 2) return;
  const lastRow = guestsSheet.getLastRow();
  const lastCol = guestsSheet.getLastColumn();
  const headers = guestsSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const tailStart = Math.max(2, lastRow - 4000 + 1);
  const data = guestsSheet.getRange(tailStart, 1, lastRow - tailStart + 1, lastCol).getValues();
  const tsIdx = headers.indexOf('timestamp');
  const userIdIdx = headers.indexOf('user_id');
  const unameIdx = headers.indexOf('username');
  const fnIdx = headers.indexOf('first_name');
  const lnIdx = headers.indexOf('last_name');
  const actionIdx = headers.indexOf('action');
  const now = endAt instanceof Date ? endAt : new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const rows = data.filter(row => {
    const uname = String(row[unameIdx] || '').toLowerCase().replace('@', '');
    if (TEST_ACCOUNTS.includes(uname)) return false;
    const ts = row[tsIdx];
    const rowDate = ts instanceof Date ? ts : new Date(ts);
    return rowDate >= oneHourAgo && rowDate <= now;
  });
  Logger.log('hourly digest: ' + rows.length + ' action(s) in ' + oneHourAgo.toISOString() + ' - ' + now.toISOString());
  if (rows.length === 0) return;
  const byUser = {};
  rows.forEach(row => {
    const uid = String(row[userIdIdx] || '');
    if (!byUser[uid]) {
      byUser[uid] = {
        username: String(row[unameIdx] || '').replace('@', ''),
        firstName: String(row[fnIdx] || ''), lastName: String(row[lnIdx] || ''), actions: []
      };
    }
    const ts = row[tsIdx];
    const rowDate = ts instanceof Date ? ts : new Date(ts);
    const timeStr = Utilities.formatDate(rowDate, 'Europe/Moscow', 'HH:mm');
    const action = prettyAction_(row[actionIdx]);
    const list = byUser[uid].actions;
    const prev = list[list.length - 1];
    if (prev && prev.action === action) prev.n++;
    else list.push({ time: timeStr, action, n: 1 });
  });
  const fromTime = Utilities.formatDate(oneHourAgo, 'Europe/Moscow', 'HH:mm');
  const toTime = Utilities.formatDate(now, 'Europe/Moscow', 'HH:mm');
  let text = `🕐 <b>Активность за ${fromTime}–${toTime}</b>\n`;
  Object.values(byUser).forEach(user => {
    const userLink = formatUserLink(user.username, user.firstName, user.lastName, '');
    text += `\n👤 ${userLink}\n`;
    user.actions.forEach(a => { text += `  • ${a.time} — ${a.action}${a.n > 1 ? ' ×' + a.n : ''}\n`; });
  });
  sendLongTelegram_(adminChatId, text);
}

// In sendDailyDigest, escape grouped action headings with escapeDigestHtml_(action).
// Run once to reproduce the old formatting failure and recover the missed hour.
function recoverHourlyDigest20261008() {
  const adminChatId = getAdminChatId();
  if (!adminChatId) throw new Error('ADMIN_CHAT_ID is not configured');
  const legacy = sendTelegramMessage(adminChatId, 'Проверка формата сводки: hike_<дата>');
  Logger.log('legacy digest formatting: ' + (legacy.ok ? 'accepted' : legacy.error));
  sendHourlyDigest(new Date('2026-10-08T13:46:42Z'));
}
