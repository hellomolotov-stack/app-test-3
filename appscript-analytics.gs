// Club analytics v1. Append to the current live project, never replace its source.
var CLUB_ANALYTICS_ADMINS = ['163665735', '7845375334'];
var CLUB_ANALYTICS_HEADERS = ['id', 'at', 'received_at', 'user_id', 'session', 'event', 'hike_date', 'member'];

function caRead_(path) {
  var response = UrlFetchApp.fetch(FIREBASE_URL + path + '.json?auth=' + FIREBASE_SECRET, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Источник данных недоступен: ' + path.split('/')[0]);
  return JSON.parse(response.getContentText());
}

function caSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('analytics_events');
  if (!sheet) throw new Error('Сбор аналитики ещё не включён');
  return sheet;
}

function caAppend_(events) {
  if (!events.length) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = caSheet_();
    if (sheet.getLastRow() > 200000) throw new Error('Журнал аналитики заполнен');
    var cache = CacheService.getScriptCache();
    var rows = events.filter(function(e) { return !cache.get('ca:' + e.id); }).map(function(e) {
      return [e.id, e.at, Date.now(), e.uid, e.session || '', e.event, e.date || '', e.member === true];
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, CLUB_ANALYTICS_HEADERS.length).setValues(rows);
    events.forEach(function(e) { cache.put('ca:' + e.id, '1', 21600); });
  } finally { lock.releaseLock(); }
}

function handleClubAnalytics_(params) {
  try {
    var user = verifyTelegramInitData_(params.init_data);
    if (!user || !/^\d+$/.test(String(user.id))) throw new Error('нет доступа');
    var auth = /(?:^|&)auth_date=(\d+)/.exec(params.init_data || '');
    if (!auth || Number(auth[1]) * 1000 > Date.now() + 300000) throw new Error('нет доступа');
    if (CLUB_ANALYTICS_ADMINS.indexOf(String(user.id)) !== -1) return _adminOut({ status: 'ok', excluded: true });
    var rateCache = CacheService.getScriptCache(), rateKey = 'ca-rate:' + user.id + ':' + Math.floor(Date.now() / 60000);
    var rate = Number(rateCache.get(rateKey) || 0);
    if (rate >= 60) throw new Error('слишком много событий');
    var events = JSON.parse(params.events || '[]');
    if (!Array.isArray(events) || events.length > 20) throw new Error('неверный пакет');
    rateCache.put(rateKey, String(rate + events.length), 120);
    var now = Date.now();
    var allowed = ['app_open', 'hike_view', 'booking_intent', 'booking_success', 'checkout_error'];
    events.forEach(function(e) {
      if (!e || !/^[a-zA-Z0-9_-]{1,150}$/.test(e.id || '') || !/^[a-zA-Z0-9_-]{1,80}$/.test(e.session || '') ||
          allowed.indexOf(e.event) < 0 || !Number.isFinite(e.at) || e.at < now - 3600000 || e.at > now + 30000 ||
          (e.event !== 'app_open' && !/^\d{4}-\d{2}-\d{2}$/.test(e.date || ''))) throw new Error('неверное событие');
    });
    var member = caRead_('members/' + user.id);
    var isMember = !!(member && member.user_id);
    var verified = [];
    events.forEach(function(e) {
      if (e.event === 'booking_success') {
        var registered = caRead_('userRegistrations/' + user.id + '/' + e.date);
        var participant = caRead_('hikeParticipants/' + e.date + '/' + user.id);
        if (registered !== true || !participant || !Number(participant.timestamp)) return;
        e.at = Number(participant.timestamp);
        e.id = 'reg-' + user.id + '-' + e.date + '-' + e.at;
      }
      verified.push({ id: e.id, uid: String(user.id), at: e.at, session: e.session, event: e.event, date: e.date, member: isMember });
    });
    caAppend_(verified);
    return _adminOut({ status: 'ok' });
  } catch (err) { return _adminOut({ status: 'error', message: 'аналитика недоступна' }); }
}

// Called only after Robokassa signature verification and a successful DB write.
function caPaymentRecorded_(pending, invoice) {
  if (!pending || !pending.user_id || !pending.hike_date || CLUB_ANALYTICS_ADMINS.indexOf(String(pending.user_id)) !== -1) return;
  var uid = String(pending.user_id);
  var registered = caRead_('userRegistrations/' + uid + '/' + pending.hike_date);
  var participant = caRead_('hikeParticipants/' + pending.hike_date + '/' + uid);
  if (registered === true && participant && Number(participant.timestamp)) {
    caAppend_([{ id: 'reg-' + uid + '-' + pending.hike_date + '-' + participant.timestamp, uid: uid,
      at: Number(participant.timestamp), event: 'booking_success', date: pending.hike_date,
      member: pending.card_type !== 'ticket' }]);
  }
}

function caDay_(time) { return Utilities.formatDate(new Date(time), 'Europe/Moscow', 'yyyy-MM-dd'); }
function caYes_(v) { return v === true || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true'; }

// Pure aggregation: ordered, unique-person cohorts, with a seven-day conversion window.
function caAggregate_(events, payments, registrations, date, from, to, asOf, captureStart) {
  var seen = {}, people = {}, errors = {}, active = {}, paidToday = {}, otherPaid = {}, mismatch = {};
  events.filter(function(e) { return e.at >= captureStart && e.at <= asOf && CLUB_ANALYTICS_ADMINS.indexOf(e.uid) < 0; })
    .sort(function(a, b) { return a.at - b.at; }).forEach(function(e) {
      if (seen[e.id]) return;
      seen[e.id] = true;
      if (!people[e.uid]) people[e.uid] = [];
      people[e.uid].push(e);
      if (e.date === date && e.event === 'checkout_error' && e.at >= from && e.at < to) errors[e.uid] = true;
    });
  var invoices = {};
  Object.keys(payments || {}).forEach(function(key) {
    var p = payments[key];
    if (!p || p.hike_date !== date || CLUB_ANALYTICS_ADMINS.indexOf(String(p.user_id)) >= 0) return;
    var uid = String(p.user_id), created = Number(p.ts) * 1000 + 999, paid = Number(p.paid_at) * 1000 + 999;
    if (!invoices[uid]) invoices[uid] = [];
    invoices[uid].push({ at: created, paid: p.completed === true && paid > 0 ? paid : 0, ticket: p.card_type === 'ticket' });
    if (p.completed === true && paid >= Math.max(from, captureStart) && paid < to && paid <= asOf) {
      (p.card_type === 'ticket' ? paidToday : otherPaid)[uid] = true;
      if (!registrations[uid] || registrations[uid][date] !== true) mismatch[uid] = true;
    }
  });
  Object.keys(registrations || {}).forEach(function(uid) {
    if (CLUB_ANALYTICS_ADMINS.indexOf(uid) < 0 && registrations[uid] && registrations[uid][date] === true) active[uid] = true;
  });
  var guest = [0, 0, 0, 0, 0, 0], member = [0, 0, 0, 0], alternative = {}, cohorts = 0;
  Object.keys(people).forEach(function(uid) {
    var list = people[uid];
    var entry = list.find(function(e) { return e.event === 'app_open' && e.at >= from && e.at < to; });
    if (!entry) return;
    cohorts++;
    var end = Math.min(asOf, entry.at + 7 * 86400000);
    var after = function(event, time) { return list.find(function(e) { return e.event === event && e.date === date && e.at >= time && e.at <= end; }); };
    var counts = entry.member ? member : guest;
    counts[0]++;
    var view = after('hike_view', entry.at);
    if (!view) return;
    counts[1]++;
    var intent = after('booking_intent', view.at);
    if (!intent) return;
    counts[2]++;
    var booked = after('booking_success', intent.at);
    if (entry.member) { if (booked) counts[3]++; return; }
    var ps = (invoices[uid] || []).filter(function(p) { return p.at >= intent.at && p.at <= end; });
    if (ps.some(function(p) { return !p.ticket && p.paid >= p.at - 999 && p.paid <= end; })) alternative[uid] = true;
    var ticket = ps.filter(function(p) { return p.ticket; });
    if (!ticket.length) return;
    counts[3]++;
    var paid = ticket.filter(function(p) { return p.paid >= p.at - 999 && p.paid <= end; }).sort(function(a, b) { return a.paid - b.paid; })[0];
    if (!paid) return;
    counts[4]++;
    // Receipt and registration are written within the same second, in that order.
    if (after('booking_success', Math.max(intent.at, paid.paid - 1999))) counts[5]++;
  });
  var insights = [];
  insights.push('Записей сейчас: ' + Object.keys(active).length + '; оплат билетов за период: ' + Object.keys(paidToday).length + '; покупок карты на этот хайк: ' + Object.keys(otherPaid).length);
  if (guest[0] < 10) insights.push('Гостей в когорте ' + guest[0] + ': пока мало данных для вывода об узком месте');
  else {
    var labels = ['открытие → просмотр хайка', 'просмотр → желание записаться', 'желание → создание счёта', 'счёт → оплата', 'оплата → подтверждение записи'];
    var weakest = null;
    for (var i = 1; i < guest.length; i++) {
      if (guest[i - 1] < 10) continue;
      var ratio = guest[i] / guest[i - 1];
      if (!weakest || ratio < weakest.ratio) weakest = { label: labels[i - 1], ratio: ratio, n: guest[i - 1] };
    }
    insights.push(weakest ? 'Проверить этап «' + weakest.label + '»: ' + Math.round(weakest.ratio * 100) + '% из ' + weakest.n + ' человек. Это наблюдение, не причина' : 'Для сравнения отдельных этапов пока мало данных');
  }
  insights.push('Ошибки оформления: ' + Object.keys(errors).length + ' чел.; оплатили, но сейчас не записаны: ' + Object.keys(mismatch).length + ' (возможна отмена; проверить)');
  return { guest: guest, member: member, alternative: Object.keys(alternative).length, active: Object.keys(active).length,
    paid: Object.keys(paidToday).length, cardPaid: Object.keys(otherPaid).length, errors: Object.keys(errors).length,
    mismatch: Object.keys(mismatch).length, cohorts: cohorts, insights: insights };
}

function clubAnalyticsReport_(params) {
  var props = PropertiesService.getScriptProperties();
  var captureStart = Number(props.getProperty('CLUB_ANALYTICS_START'));
  if (!captureStart) throw new Error('Аналитика ещё не включена');
  var now = Date.now(), today = caDay_(now), period = String(params.period || 'today');
  var midnight = new Date(today + 'T00:00:00+03:00').getTime();
  var from = period === 'yesterday' ? midnight - 86400000 : period === '7d' ? midnight - 6 * 86400000 : midnight;
  var to = period === 'yesterday' ? midnight : now;
  var hikes = caRead_('hikes') || {};
  var choices = Object.keys(hikes).filter(function(date) {
    var h = hikes[date];
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && h && String(h.title || '').trim() && !caYes_(h.city) && !caYes_(h.book_club) && !caYes_(h.cancelled);
  }).sort().map(function(date) { return { date: date, title: hikes[date].title }; });
  var date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : (choices.find(function(h) { return h.date >= today; }) || {}).date;
  if (!date || !hikes[date]) return { status: 'ok', empty: true, captureStart: captureStart, choices: choices };
  var sheet = caSheet_();
  var values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues() : [];
  var events = values.map(function(row) { return { id: String(row[0]), at: Number(row[1]), uid: String(row[3]), event: String(row[5]), date: String(row[6]), member: row[7] === true }; });
  var result = caAggregate_(events, caRead_('pending_payments') || {}, caRead_('userRegistrations') || {}, date, from, to, now, captureStart);
  result.status = 'ok'; result.date = date; result.title = hikes[date].title; result.period = period;
  result.from = Math.min(to, Math.max(from, captureStart)); result.to = to; result.asOf = now;
  result.noCoverage = captureStart >= to;
  result.captureStart = captureStart; result.partial = captureStart > from; result.choices = choices;
  result.guestLabels = ['Открыли приложение', 'Посмотрели хайк', 'Решили записаться', 'Создан счёт за билет', 'Оплата подтверждена', 'Запись подтверждена'];
  result.memberLabels = ['Открыли приложение', 'Посмотрели хайк', 'Решили записаться', 'Запись подтверждена'];
  return result;
}

function caChart_(report) {
  var table = Charts.newDataTable().addColumn(Charts.ColumnType.STRING, 'Этап').addColumn(Charts.ColumnType.NUMBER, 'Людей');
  report.guestLabels.forEach(function(label, i) { table.addRow([label + ' · ' + report.guest[i], report.guest[i]]); });
  return Charts.newBarChart().setDataTable(table).setDimensions(1080, 660)
    .setTitle('Запись по билету · ' + report.title).setLegendPosition(Charts.Position.NONE)
    .setColors(['#d8ab36']).setXAxisTitle('Уникальные люди')
    .setOption('hAxis', { minValue: 0, maxValue: Math.max(1, report.guest[0]), format: '0' })
    .setOption('chartArea', { left: 310, top: 90, width: 690, height: 450 })
    .setOption('fontSize', 18).build().getAs('image/png').setName('club-funnel.png');
}

function sendClubAnalyticsDaily() {
  var props = PropertiesService.getScriptProperties(), day = caDay_(Date.now());
  var evening = new Date(Date.now() + 10800000).getUTCHours() >= 20;
  var slot = day + (evening ? ':evening' : ':preview');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (props.getProperty('CLUB_ANALYTICS_SENT') === slot) return;
    var attempt = props.getProperty('CLUB_ANALYTICS_SENDING');
    if (attempt && attempt.split('|')[0] === slot) throw new Error('Отправка уже начата; перед повтором проверь Telegram');
    var report = clubAnalyticsReport_({ period: 'today' });
    if (report.empty) { Logger.log('Нет ближайшего хайка для отчёта'); return; }
    var chatId = String(getAdminChatId() || '');
    if (chatId !== '163665735') throw new Error('Проверь ADMIN_CHAT_ID: отчёт предназначен Максиму');
    var html = function(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var time = Utilities.formatDate(new Date(report.asOf), 'Europe/Moscow', 'HH:mm');
    var caption = (evening ? 'Вечерняя аналитика клуба' : 'Дневной срез аналитики') + ' · ' + day + ', ' + time + ' МСК\n<b>' + html(report.title) + '</b> · ' + report.date + '\n\n' +
      'С картой: ' + report.member.join(' → ') + '\nКупили карту вместо билета в когорте: ' + report.alternative + '\n\n' +
      report.insights.map(html).join('\n\n') + '\n\nКогорта открывших за сегодня; конверсии до момента отчёта, максимум 7 дней. Админы исключены. Сбор с ' + caDay_(report.captureStart) + (report.partial ? ' · неполный день' : '');
    var chart = caChart_(report);
    props.setProperty('CLUB_ANALYTICS_SENDING', slot + '|' + Date.now());
    var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + getBotToken() + '/sendPhoto', {
      method: 'post', payload: { chat_id: chatId, photo: chart, caption: caption.slice(0, 1000), parse_mode: 'HTML' }, muteHttpExceptions: true
    });
    var result = JSON.parse(response.getContentText());
    if (!result.ok) { props.deleteProperty('CLUB_ANALYTICS_SENDING'); throw new Error('Telegram не принял отчёт'); }
    props.setProperty('CLUB_ANALYTICS_SENT', slot);
    props.setProperty('CLUB_ANALYTICS_MESSAGE_ID', String(result.result.message_id));
    props.deleteProperty('CLUB_ANALYTICS_SENDING');
    Logger.log('Воронка доставлена администратору, message_id=' + result.result.message_id);
  } finally { lock.releaseLock(); }
}

function installClubAnalytics() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('analytics_events');
  if (!sheet) {
    sheet = ss.insertSheet('analytics_events');
    sheet.getRange(1, 1, 1, 8).setValues([CLUB_ANALYTICS_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CLUB_ANALYTICS_START')) props.setProperty('CLUB_ANALYTICS_START', String(Date.now()));
  var triggers = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'sendClubAnalyticsDaily'; });
  if (!triggers.length) ScriptApp.newTrigger('sendClubAnalyticsDaily').timeBased().atHour(20).nearMinute(30).everyDays(1).inTimezone('Europe/Moscow').create();
  Logger.log('Аналитика включена; вечерний отчёт около 20:30 МСК; часовые отчёты сохранены');
}
