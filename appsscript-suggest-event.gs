// ─────────────────────────────────────────────────────────────────
// Актуальный обработчик suggestEvent для doPost() в Apps Script.
// Убедись что в doPost() есть:
//   if (action === 'suggestEvent') { handleSuggestEvent(params); }
// ─────────────────────────────────────────────────────────────────

function handleSuggestEvent(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Предложения событий';
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = [
      'Дата подачи (МСК)',
      'user_id',
      'Username',
      'Название события',
      'Описание',
      'Предлагаемая дата/время'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d9fd19');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(4, 200);
    sheet.setColumnWidth(5, 350);
    sheet.setColumnWidth(6, 160);
  }

  var mskTime = Utilities.formatDate(
    new Date(),
    'Europe/Moscow',
    'dd.MM.yyyy HH:mm'
  );

  sheet.appendRow([
    mskTime,
    params.user_id        || '',
    params.username ? '@' + params.username : '',
    params.event_title       || '',
    params.event_description || '',
    params.event_datetime    || ''
  ]);

  sendSuggestEventNotification(params);
}

function sendSuggestEventNotification(params) {
  var token = getBotToken();
  var adminChatId = PropertiesService.getScriptProperties().getProperty('ADMIN_CHAT_ID');
  if (!token || !adminChatId) return;

  var username = params.username || '';
  var userId   = params.user_id  || '';
  var userLink = username
    ? '<a href="https://t.me/' + username + '">' + username + '</a> (@' + username + ')'
    : 'id ' + userId;

  var text = '💡 <b>Новое предложение события</b>\n\n'
    + '👤 ' + userLink + '\n'
    + '🎯 Название: ' + (params.event_title       || '—') + '\n'
    + '📝 Описание: ' + (params.event_description || '—') + '\n'
    + '📅 Предлагаемая дата: ' + (params.event_datetime || '—');

  var payload = {
    chat_id:    adminChatId,
    text:       text,
    parse_mode: 'HTML'
  };

  try {
    UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + token + '/sendMessage',
      {
        method:           'post',
        contentType:      'application/json',
        payload:          JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );
  } catch(e) {
    Logger.log('sendSuggestEventNotification error: ' + e);
  }
}
