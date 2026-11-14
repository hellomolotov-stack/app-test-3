// js/booking-opens.js – «анонс без записи» (14.11.2026): хайк с названием и датой виден, но до времени
// booking_opens/<дата> (закрытый узел базы, приходит через /api/boot) детали не открываются –
// только «напомнить». В эту минуту /api/hikes?open=<дата> пишет подписчикам листа ожидания в бота.
import { state } from './state.js';

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

try { const c = JSON.parse(localStorage.getItem('bookingOpensCache') || 'null'); if (c && typeof c === 'object' && !state.bookingOpens) state.bookingOpens = c; } catch (e) {}

export function setBookingOpens(map) {
    state.bookingOpens = map && typeof map === 'object' ? map : {};
    try { localStorage.setItem('bookingOpensCache', JSON.stringify(state.bookingOpens)); } catch (e) {}
}
export function bookingOpensAt(date) {
    const t = Date.parse(state.bookingOpens?.[date] || '');
    return Number.isFinite(t) ? t : 0;
}
export const bookingNotOpen = date => { const t = bookingOpensAt(date); return !!t && Date.now() < t; };
// «пн, 17 ноября · 19:00» по Москве
export function opensLabel(date, { short = false } = {}) {
    const t = bookingOpensAt(date);
    if (!t) return '';
    const d = new Date(t + 3 * 3600000);
    if (short) return `с ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    return `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
