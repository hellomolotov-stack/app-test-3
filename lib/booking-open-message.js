// lib/booking-open-message.js – текст сообщения «открыли запись» (анонс без записи, см. js/booking-opens.js).
// Шаблон редактируется в админке (booking_open_text/<дата>); пусто – DEFAULT. Подстановки: {имя}, {название}, {дата}.
// Текст из админки – обычный, HTML экранируем; название хайка выделяется жирным.
const DEFAULT = '{имя}, открыли запись 🏔\n\n{название}\n{дата}\n\nкак и обещали – сообщаем первыми. открой хайк, чтобы посмотреть маршрут и записаться 👇';
const WDF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(template, { name = '', title = '', date = '', startTime = '' }) {
    const [y, m, d] = String(date).split('-').map(Number);
    const when = d ? `${WDF[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MG[m - 1]}${startTime ? ' · ' + startTime : ''}` : '';
    let t = esc(String(template || '').trim() || DEFAULT);
    // без имени убираем «{имя}, » целиком, чтобы не было «, открыли запись»
    t = name ? t.split('{имя}').join(esc(name)) : t.replace(/\{имя\}[,!]?\s*/g, '');
    return t.split('{название}').join(`<b>${esc(title || 'хайк')}</b>`).split('{дата}').join(esc(when)).trim();
}

const BUTTON = 'открыть хайк';
// текст кнопки – из админки (booking_open_button/<дата>), пусто – «открыть хайк»
const button = (date, text) => ({ inline_keyboard: [[{ text: String(text || '').trim().slice(0, 40) || BUTTON, url: `https://t.me/yaltahiking_bot?startapp=hike_${date}` }]] });

module.exports = { DEFAULT, BUTTON, render, button };
