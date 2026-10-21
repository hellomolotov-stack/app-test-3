// Run once after updating the existing script and the two source cells.
// Only the current ticket price and matching FAQ answer are published.
function publishTicketPrice1200() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getId() !== '1neN7zYOvUdfRK9bG7WRhsAZt9XmtYi9l_tzHeFvYlds') throw new Error('Unexpected source spreadsheet');
  const config = ss.getSheetByName('popupConfig');
  if (config.getRange('B1').getValue() !== 'ticketPrice' || Number(config.getRange('B2').getValue()) !== 1200) throw new Error('Source ticket price must be 1200');
  if (clubPaymentProduct_({ card_type: 'ticket' }).amount !== 1200) throw new Error('Server ticket price must be 1200');
  const faqRow = ss.getSheetByName('faq').getRange('A4:B4').getValues()[0];
  if (String(faqRow[1]).indexOf('1 200 ₽') < 0) throw new Error('Source FAQ must contain the new price');
  const faq = fbGet_('faq');
  const matches = Object.keys(faq || {}).filter(key => faq[key] && faq[key].q === faqRow[0]);
  if (matches.length !== 1) throw new Error('Expected one matching FAQ entry');
  const changes = [
    ['popupConfig/ticketPrice', 1200],
    ['faq/' + matches[0] + '/a', faqRow[1]]
  ];
  changes.forEach(function (change) {
    const response = UrlFetchApp.fetch(FIREBASE_URL + change[0] + '.json?auth=' + FIREBASE_SECRET, {
      method: 'put', contentType: 'application/json', payload: JSON.stringify(change[1]), muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('Pricing update failed: ' + change[0] + ' HTTP ' + response.getResponseCode());
    if (JSON.stringify(fbGet_(change[0])) !== JSON.stringify(change[1])) throw new Error('Pricing readback failed: ' + change[0]);
  });
  Logger.log('VERIFIED ticket price: 1200; FAQ price: 1200; all other configuration and payment records preserved');
}
