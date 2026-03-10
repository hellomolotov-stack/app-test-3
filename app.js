function syncMetrics() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('metrics');
  if (!sheet) {
    Logger.log('Лист "metrics" не найден');
    return;
  }
  const data = sheet.getRange(2, 1, 1, 4).getValues()[0];
  const payload = {
    hikes: String(data[0] || '0'),
    kilometers: String(data[1] || '0'),
    locations: String(data[2] || '0'),
    meetings: String(data[3] || '0')
  };
  const firebaseUrl = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app/metrics.json';
  const options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(firebaseUrl, options);
  Logger.log('Metrics sync status: ' + response.getResponseCode());
}

function createMetricsTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncMetrics') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('syncMetrics')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Metrics trigger created');
}
