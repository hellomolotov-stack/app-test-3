// js/ui/day-strip.js – календарь «полоса дней» (пока только для isV2()): лента только из дней, где что-то есть.
// Слева от «сегодня» – прошедшие (с фото с хайка), справа – будущие. Нажал день – большая карточка:
//   прошедший: фото с обложки (админка → «фото на обложку»), иначе 3D-карта маршрута; кнопка – саммари или шторка хайка
//   будущий: фото или 3D-карта маршрута; кнопка – шторка хайка (запись и оплата – как раньше)
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { showBottomSheet, snapshotHikeMap, fetchGoingFromServer, isWaitlisted, toggleTeaserNotify } from './calendar.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON3 = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WDF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const PAST_DAYS = 70;
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yes = v => v === true || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const dt = d => new Date(d + 'T12:00:00');

function kind(h) {
    if (yes(h.city) || (!(h.title && h.title.trim()) && /🏄/.test(h.emoji || ''))) return 'city';
    if (yes(h.book_club)) return 'city';
    if (/пицц/i.test(h.title || '')) return 'pizza';
    return 'hike';
}
const COLOR = { hike: '#D9FD19', city: '#5BB4E5', pizza: '#F28C28' };
const TAGS = { hike: ['хайк', '#D9FD19', '#111'], city: ['в городе', '#2F8FC4', '#fff'], pizza: ['в гостях', '#F28C28', '#fff'] };

function events() {
    const t = today(), from = new Date(Date.now() - PAST_DAYS * 86400000).toISOString().slice(0, 10);
    return (state.hikesList || [])
        .filter(h => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && !yes(h.cancelled))
        // прошедшие – только состоявшиеся (с названием), будущие – все запланированные
        .filter(h => (h.date < t ? h.date >= from && h.title && h.title.trim() : true))
        .sort((a, b) => a.date.localeCompare(b.date));
}
const photoUrl = h => { const v = state.hikePhotos?.[h.date]; return v ? `/api/hikes?photo=${h.date}&v=${v}` : ''; };
const titleOf = h => (h.title && h.title.trim()) || (kind(h) === 'city' ? 'вечер в городе · скоро' : 'хайк · маршрут скоро');

// 3D-снимок маршрута для карточки: в памяти и в localStorage (последние 6)
const SNAP_KEY = 'dsSnaps';
const snapMem = {};
function readSnap(date) { try { return (JSON.parse(localStorage.getItem(SNAP_KEY) || '{}'))[date] || null; } catch (e) { return null; } }
function saveSnap(date, url) {
    try {
        const all = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}'); all[date] = url;
        const keys = Object.keys(all); while (keys.length > 6) delete all[keys.shift()];
        localStorage.setItem(SNAP_KEY, JSON.stringify(all));
    } catch (e) {}
}
async function mapSnap(h, w, hh) {
    if (snapMem[h.date]) return snapMem[h.date];
    const cached = readSnap(h.date); if (cached) return (snapMem[h.date] = cached);
    const c = await snapshotHikeMap(h, { width: w, height: hh, ratio: 2, timeout: 12000 }).catch(() => null);
    if (!c) return null;
    const url = c.toDataURL('image/jpeg', .78);
    snapMem[h.date] = url; saveSnap(h.date, url);
    return url;
}

let selDate = null;
export function renderDayStrip(container) {
    if (!container) return;
    const list = events();
    const t = today();
    if (!list.length) { container.innerHTML = ''; return; }
    if (!selDate || !list.some(h => h.date === selDate)) selDate = (list.find(h => h.date >= t) || list[list.length - 1]).date;
    let pills = '', todayPut = false;
    list.forEach(h => {
        if (!todayPut && h.date >= t) { pills += '<div class="ds-today"><span>сегодня</span></div>'; todayPut = true; }
        const d = dt(h.date), past = h.date < t, ph = photoUrl(h);
        pills += `<button type="button" class="ds-day${past ? ' is-past' : ''}${h.date === selDate ? ' is-sel' : ''}" data-ds="${h.date}"${ph ? ` style="background-image:url('${ph}')"` : ''}>
            <small>${WD[d.getDay()]}</small><b>${d.getDate()}</b><u>${MON3[d.getMonth()]}</u><em style="background:${COLOR[kind(h)]}"></em></button>`;
    });
    if (!todayPut) pills += '<div class="ds-today"><span>сегодня</span></div>';
    container.innerHTML = `<div class="ds">
        <div class="ds-hd"><h2 class="section-title">события</h2></div>
        <div class="ds-days" id="dsDays">${pills}</div>
        <div class="ds-card" id="dsCard"></div></div>`;
    const strip = container.querySelector('#dsDays');
    strip.querySelectorAll('[data-ds]').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.ds === selDate) return;
        haptic();
        selDate = b.dataset.ds;
        strip.querySelectorAll('.ds-day').forEach(x => x.classList.toggle('is-sel', x === b));
        b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        log('календарь: день', state.userCard?.status !== 'active', state.user, { date: selDate });
        drawCard(container, list.find(h => h.date === selDate));
    }));
    // ближайшее событие – в центре ленты
    requestAnimationFrame(() => {
        const s = strip.querySelector('.ds-day.is-sel');
        if (s) strip.scrollLeft = s.offsetLeft - strip.clientWidth / 2 + s.offsetWidth / 2;
    });
    drawCard(container, list.find(h => h.date === selDate));
    // саммари мастермайндов – для кнопки «читать саммари» у прошедших
    if (!state.mmNotes) import('./mm-reader.js').then(m => m.ensureMmNotes()).then(() => {
        if (container.isConnected) drawCard(container, list.find(h => h.date === selDate));
    }).catch(() => {});
}

function drawCard(container, h) {
    const card = container.querySelector('#dsCard');
    if (!card || !h) return;
    const t = today(), past = h.date < t, k = kind(h), d = dt(h.date);
    const [tag, tbg, tfg] = past ? ['было ✓', 'rgba(255,255,255,.92)', '#111'] : TAGS[k];
    const ph = photoUrl(h);
    const note = (state.mmNotes || []).find(n => n.date === h.date);
    const teaser = !past && !(h.title && h.title.trim());
    const notified = teaser && isWaitlisted(h.date);
    const btn = past ? (note ? 'читать саммари' : 'подробнее') : teaser ? (notified ? '✓ сообщим об открытии' : '🔔 сообщить, когда откроется запись') : (k === 'hike' ? 'записаться' : 'иду');
    const when = `${WDF[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${!past && h.start_time ? ' · ' + esc(h.start_time) : ''}`;
    const meta = [h.distance && `${esc(h.distance)} км`, !past && Number(h.capacity) > 0 && `${Number(h.capacity)} мест`].filter(Boolean).join(' · ');
    card.className = 'ds-card' + (ph ? ' has-photo' : '');
    card.style.backgroundImage = ph ? `url('${ph}')` : '';
    card.innerHTML = `
        <span class="ds-tag" style="background:${tbg};color:${tfg}">${tag}</span>
        ${!ph ? `<span class="ds-emo">${esc(h.emoji || (k === 'hike' ? '⛰️' : k === 'pizza' ? '🍕' : '🏙'))}</span>` : ''}
        <div class="ds-when">${when}</div>
        <h3>${esc(titleOf(h))}</h3>
        ${meta ? `<div class="ds-meta">${meta}</div>` : ''}
        <div class="ds-foot"><div class="ds-av" id="dsAv"></div></div>
        <button type="button" class="ds-btn${past || notified ? ' is-glass' : ''}">${btn}</button>`;
    card.querySelector('.ds-btn').addEventListener('click', async () => {
        haptic();
        log(`календарь: ${btn}`, state.userCard?.status !== 'active', state.user, { date: h.date });
        if (past && note) { const m = await import('./mm-reader.js'); return m.openMmReader(note.id); }
        if (teaser) { await toggleTeaserNotify(h.date).catch(() => {}); return drawCard(container, h); }
        const i = (state.hikesWithTitle || []).findIndex(x => x.date === h.date);
        if (i !== -1) showBottomSheet(i);
    });
    // кто идёт / был
    fetchGoingFromServer([h.date]).then(([lst]) => {
        if (selDate !== h.date || !Array.isArray(lst) || !lst.length) return;
        const av = card.querySelector('#dsAv'); if (!av) return;
        const faces = lst.filter(p => p.photoUrl).slice(0, 4).map(p => `<i style="background-image:url('${esc(p.photoUrl)}')"></i>`).join('');
        av.innerHTML = `${faces}<span>${past ? `${lst.length} ${lst.length % 10 === 1 && lst.length % 100 !== 11 ? 'был' : 'были'}` : `идут ${lst.length}`}</span>`;
    }).catch(() => {});
    // без фото – 3D-карта маршрута
    if (!ph) {
        const r = card.getBoundingClientRect();
        mapSnap(h, Math.round(r.width) || 360, Math.round(r.height) || 430).then(url => {
            if (!url || selDate !== h.date) return;
            card.style.backgroundImage = `url('${url}')`;
            card.classList.add('has-photo', 'is-map');
            card.querySelector('.ds-emo')?.remove();
        });
    }
}
