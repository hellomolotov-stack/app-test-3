// ================================================================
// РАССЫЛКА С СЕГМЕНТАЦИЕЙ
// Замени функцию sendBroadcast() в своём Apps Script на эту
// ================================================================
//
// Колонки листа «broadcasts»:
//   date       — дата (необязательно)
//   text       — текст сообщения, [имя] заменится на имя
//   segment    — кому слать: card_holders / guests / all
//   startapp   — раздел приложения: calendar, profiles, home,
//                или hike_2026-06-07 для конкретного события
//   user_id    — конкретный user_id (перекрывает segment)
//   status     — заполняется автоматически: sent
//   sent_at    — заполняется автоматически
//
// ================================================================

function sendBroadcast() {
  var token = getBotToken();
  if (!token) {
    Logger.log('❌ Не указан BOT_TOKEN');
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var botUsername = getBotUsername();
  var baseAppUrl = 'https://t.me/' + botUsername;

  // ── Имена из profiles ────────────────────────────────────────
  var nameMap = {};
  var profilesSheet = ss.getSheetByName('profiles');
  if (profilesSheet) {
    var pRows = profilesSheet.getDataRange().getValues();
    var pHeaders = pRows.shift().map(function(h){ return String(h).trim(); });
    var pUidIdx  = pHeaders.indexOf('user_id');
    var pNameIdx = pHeaders.indexOf('name');
    if (pUidIdx !== -1 && pNameIdx !== -1) {
      pRows.forEach(function(row) {
        var uid = String(row[pUidIdx]).trim();
        if (uid) nameMap[uid] = String(row[pNameIdx] || '').trim();
      });
    }
  }

  // ── Владельцы карт из members ────────────────────────────────
  var cardHolderIds = [];
  var membersSheet = ss.getSheetByName('members');
  if (membersSheet && membersSheet.getLastRow() > 1) {
    var mRows = membersSheet.getRange(2, 1, membersSheet.getLastRow() - 1, 2).getValues();
    mRows.forEach(function(row) {
      var uid = String(row[0]).trim();
      if (uid) cardHolderIds.push(uid);
    });
  }

  // ── Гости с разрешением на сообщения ────────────────────────
  var guestIds = [];
  var guestsSheet = ss.getSheetByName('guests');
  if (guestsSheet) {
    var gRows = guestsSheet.getDataRange().getValues();
    var gHeaders = gRows.shift().map(function(h){ return String(h).trim(); });
    var gUidIdx   = gHeaders.indexOf('user_id');
    var gAllowIdx = gHeaders.indexOf('allow_messages');
    if (gUidIdx !== -1 && gAllowIdx !== -1) {
      gRows.forEach(function(row) {
        var allow = String(row[gAllowIdx] || '').trim().toLowerCase();
        if (allow === 'yes') {
          var uid = String(row[gUidIdx]).trim();
          if (uid) guestIds.push(uid);
        }
      });
    }
  }

  // ── Лист broadcasts ──────────────────────────────────────────
  var broadcastSheet = ss.getSheetByName('broadcasts');
  if (!broadcastSheet) {
    Logger.log('❌ Лист broadcasts не найден');
    return;
  }

  var broadcastData = broadcastSheet.getDataRange().getValues();
  var broadcastHeaders = broadcastData.shift().map(function(h){ return String(h).trim(); });

  var textIdx     = broadcastHeaders.indexOf('text');
  var statusIdx   = broadcastHeaders.indexOf('status');
  var sentAtIdx   = broadcastHeaders.indexOf('sent_at');
  var startappIdx = broadcastHeaders.indexOf('startapp');
  var userIdIdx   = broadcastHeaders.indexOf('user_id');
  var segmentIdx  = broadcastHeaders.indexOf('segment');

  if (textIdx === -1) {
    Logger.log('❌ Столбец text не найден в broadcasts');
    return;
  }

  for (var i = 0; i < broadcastData.length; i++) {
    var row = broadcastData[i];
    var status = String(row[statusIdx] || '').trim().toLowerCase();
    if (status === 'sent') continue;

    var text = String(row[textIdx] || '').trim();
    if (!text) continue;

    var segment     = segmentIdx  !== -1 ? String(row[segmentIdx]  || '').trim().toLowerCase() : 'all';
    var startapp    = startappIdx !== -1 ? String(row[startappIdx] || '').trim() : '';
    var targetUserId = userIdIdx  !== -1 ? String(row[userIdIdx]   || '').trim() : '';

    // Определяем получателей
    var recipients = [];
    if (targetUserId) {
      recipients = [targetUserId];
    } else if (segment === 'card_holders') {
      recipients = cardHolderIds;
    } else if (segment === 'guests') {
      recipients = guestIds;
    } else {
      // 'all' или пусто — все уникальные
      var seen = {};
      cardHolderIds.concat(guestIds).forEach(function(uid) {
        if (!seen[uid]) { seen[uid] = true; recipients.push(uid); }
      });
    }

    var sent = 0, failed = 0;

    for (var j = 0; j < recipients.length; j++) {
      var userId = recipients[j];
      var name = nameMap[userId] || '';
      var personalizedText = text.replace(/\[имя\]/gi, name || 'друг');

      var payload = {
        chat_id: userId,
        text: personalizedText,
        parse_mode: 'HTML'
      };

      if (startapp) {
        payload.reply_markup = JSON.stringify({
          inline_keyboard: [[
            { text: '▶ открыть', url: baseAppUrl + '?startapp=' + startapp }
          ]]
        });
      }

      try {
        var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
        var response = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        var result = JSON.parse(response.getContentText());
        if (result.ok) {
          sent++;
        } else {
          Logger.log('❌ ' + userId + ': ' + result.description);
          failed++;
        }
        Utilities.sleep(40);
      } catch(e) {
        Logger.log('❌ Ошибка сети для ' + userId + ': ' + e);
        failed++;
      }
    }

    var rowNum = i + 2;
    broadcastSheet.getRange(rowNum, statusIdx + 1).setValue('sent');
    broadcastSheet.getRange(rowNum, sentAtIdx + 1).setValue(
      Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm')
    );
    Logger.log('✅ Строка ' + rowNum + ': отправлено ' + sent + ', ошибок ' + failed);
  }

  Logger.log('✅ Рассылка завершена');
}
