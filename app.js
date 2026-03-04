function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter;
    const action = params.action;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('registrations');
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Sheet not found' })).setMimeType(ContentService.MimeType.JSON);

    if (action === 'get') {
      // Получить все регистрации пользователя
      const user_id = params.user_id;
      const data = sheet.getDataRange().getValues();
      const result = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (String(row[0]) === String(user_id)) {
          const obj = {
            user_id: row[0],
            first_name: row[1],
            last_name: row[2],
            username: row[3],
            profile_link: row[4],
            hikeDate: row[5],
            hikeTitle: row[6],
            status: row[7],
            has_card: row[8],
            updated_at: row[9]
          };
          result.push(obj);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', registrations: result })).setMimeType(ContentService.MimeType.JSON);
      
    } else if (action === 'update') {
      // Обновить или создать запись
      const user_id = params.user_id;
      const first_name = params.first_name || '';
      const last_name = params.last_name || '';
      const username = params.username || '';
      const profile_link = params.profile_link || '';
      const hike_date = params.hike_date;
      const hike_title = params.hike_title || '';
      const status = params.status; // 'booked' или 'cancelled'
      const has_card = params.has_card || 'нет';

      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      // Поиск существующей записи
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (String(row[0]) === String(user_id) && String(row[5]) === String(hike_date)) {
          rowIndex = i + 1;
          break;
        }
      }
      
      const now = new Date();
      if (rowIndex === -1) {
        // Новая запись
        const newRow = [
          user_id,
          first_name,
          last_name,
          username,
          profile_link,
          hike_date,
          hike_title,
          status,
          has_card,
          now
        ];
        sheet.appendRow(newRow);
      } else {
        // Обновляем статус и, возможно, другие поля
        const statusCol = headers.indexOf('status') + 1;
        const hasCardCol = headers.indexOf('has_card') + 1;
        const updatedCol = headers.indexOf('updated_at') + 1;
        
        if (statusCol > 0) sheet.getRange(rowIndex, statusCol).setValue(status);
        if (hasCardCol > 0) sheet.getRange(rowIndex, hasCardCol).setValue(has_card);
        if (updatedCol > 0) sheet.getRange(rowIndex, updatedCol).setValue(now);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);

    } else if (action === 'count') {
      // Получить количество участников для конкретного хайка
      const hike_date = params.hike_date;
      if (!hike_date) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Missing hike_date' })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const data = sheet.getDataRange().getValues();
      let count = 0;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (String(row[5]) === String(hike_date) && String(row[7]) === 'booked') {
          count++;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', count: count })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
