// ─────────────────────────────────────────────────────────────────
// Актуальный обработчик suggestEvent для doPost() в Apps Script.
// Убедись что в doPost() есть:
//   if (action === 'suggestEvent') { ... handleSuggestEvent(params) ... }
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
    params.user_id  || '',
    params.username ? '@' + params.username : '',
    params.event_title       || '',
    params.event_description || '',
    params.event_datetime    || ''
  ]);
}
