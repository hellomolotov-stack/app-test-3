// ─────────────────────────────────────────────────────────────────
// Добавь этот кейс в switch-блок внутри doPost() твоего Apps Script
// ─────────────────────────────────────────────────────────────────

//    case 'suggestEvent':
//      handleSuggestEvent(params);
//      break;

// ─────────────────────────────────────────────────────────────────
// Добавь эту функцию в конец файла Apps Script
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Запусти эту функцию вручную один раз из редактора Apps Script,
// чтобы создать лист «Предложения событий» в таблице members
// (либо он создастся автоматически при первой подаче формы)
// ─────────────────────────────────────────────────────────────────
function setupSuggestEventSheet() {
  handleSuggestEvent({});
  Logger.log('Лист «Предложения событий» готов');
}

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
      'Имя',
      'Фамилия',
      'Название события',
      'Описание',
      'Предлагаемая дата/время'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d9fd19');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(6, 200);
    sheet.setColumnWidth(7, 350);
    sheet.setColumnWidth(8, 160);
  }

  var mskTime = Utilities.formatDate(
    new Date(),
    'Europe/Moscow',
    'dd.MM.yyyy HH:mm'
  );

  sheet.appendRow([
    mskTime,
    params.user_id   || '',
    params.username  ? '@' + params.username : '',
    params.first_name || '',
    params.last_name  || '',
    params.event_title       || '',
    params.event_description || '',
    params.event_datetime    || ''
  ]);
}
