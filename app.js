function syncLeaders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('leaders');
  if (!sheet) {
    Logger.log('Лист "leaders" не найден');
    return;
  }
  
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  
  const leaders = {};
  data.forEach(row => {
    let [date, name, bio, username] = row;
    if (Object.prototype.toString.call(date) === '[object Date]') {
      date = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      date = String(date).trim();
    }
    name = String(name || '').trim();
    bio = String(bio || '').trim();
    username = String(username || '').trim();
    
    if (date && name) {
      leaders[date] = {
        name: name,
        bio: bio,
        username: username
      };
    }
  });
  
  const firebaseUrl = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app/leaders.json';
  const options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(leaders),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(firebaseUrl, options);
  Logger.log('Статус: ' + response.getResponseCode());
  Logger.log('Ответ: ' + response.getContentText());
}
