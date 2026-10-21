// Reference for the existing Apps Script function; replace it rather than adding a duplicate.
function notifyHikeWaitlist_(dates, date, title, startTime) {
  const people = {};
  dates.forEach(d => {
    const list = loadHikeWaitlist_(d);
    Object.keys(list).forEach(uid => {
      if (!list[uid] || list[uid].notified_at || people[uid]) return;
      people[uid] = { from: d, name: list[uid].name || '', username: list[uid].username || '' };
    });
  });
  const ids = Object.keys(people);
  if (!ids.length) return 0;

  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const [y, m, d] = date.split('-').map(Number);
  const when = WD[new Date(y, m - 1, d).getDay()] + ', ' + d + ' ' + MG[m - 1] + (startTime ? ' · ' + startTime : '');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const now = Math.floor(Date.now() / 1000);
  const marks = {};
  let sent = 0;
  ids.forEach(uid => {
    const p = people[uid];
    const text = 'регистрация открыта 🎟️\n\n<b>' + esc(title) + '</b>\n' + when +
      '\nкак и обещали – сообщаем тебе заранее, пока не опубликовали анонс для всех\n\nоткрой хайк, чтобы посмотреть маршрут и записаться';
    const res = sendAutoMessage({ userId: uid, text: text, messageKey: 'waitlist_open', username: p.username, firstName: p.name, hikeDate: date, startapp: 'hike_' + date, buttonText: 'открыть хайк' });
    if (res && res.ok) {
      sent++;
      marks[p.from + '/' + uid + '/notified_at'] = now;
    }
  });
  if (Object.keys(marks).length) {
    UrlFetchApp.fetch(FIREBASE_URL + 'hike_waitlist.json?auth=' + FIREBASE_SECRET, {
      method: 'patch', contentType: 'application/json', payload: JSON.stringify(marks), muteHttpExceptions: true
    });
  }
  return sent;
}
