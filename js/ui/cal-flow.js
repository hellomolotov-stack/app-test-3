// js/ui/cal-flow.js – календарь «витрина с перспективой» (вариант Б, 06.11.2026; пока только @maxmolotov).
// Карточки событий листаются вбок со снапом: центральная крупная, соседние повёрнуты в 3D и притушены.
// Сверху – месяцы, подсвечен месяц центральной карточки. Прошедшие слева (последние 70 дней), будущие справа,
// старт – на ближайшем будущем. Фото – «фото на обложку» из админки, иначе наш пейзаж с этого маршрута.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { showBottomSheet, isWaitlisted, toggleTeaserNotify } from './calendar.js';
import { heroPhotoFor } from './rd-home.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON3 = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yes = v => v === true || ['yes', 'true'].includes(String(v).toLowerCase());
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const dt = d => new Date(d + 'T12:00:00');
const isTeaser = h => !(h.title && h.title.trim());
const isCity = h => yes(h.city) || yes(h.book_club) || (isTeaser(h) && /🏄/.test(h.emoji || ''));

function events() {
    const t = today(), from = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
    return (state.hikesList || [])
        .filter(h => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && !yes(h.cancelled))
        .filter(h => (h.date < t ? h.date >= from && !isTeaser(h) : true))
        .sort((a, b) => a.date.localeCompare(b.date));
}
function photo(h) {
    const v = state.hikePhotos?.[h.date];
    if (v) return `/api/hikes?photo=${h.date}&v=${v}`;
    if (isCity(h) && /^https?:|^\//.test(String(h.image || '')) && !/trek|tropa/i.test(h.image)) return h.image;
    return `assets/teaser/${heroPhotoFor(isTeaser(h) ? '' : h.title)}.webp`;
}
function tag(h, past) {
    if (past) return '<span class="cf-tag is-past">было ✓</span>';
    if (isTeaser(h)) return '<span class="cf-tag is-soon">готовим</span>';
    return isCity(h) ? '<span class="cf-tag is-city">в городе</span>' : '<span class="cf-tag">хайк</span>';
}
function cardHtml(h, i) {
    const past = h.date < today(), d = dt(h.date);
    const when = `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${h.time ? ` · ${esc(h.time)}` : ''}`;
    const title = isTeaser(h) ? (isCity(h) ? 'готовим вечер в городе' : 'готовим хайк') : h.title;
    const sub = isTeaser(h) ? (isWaitlisted(h.date) ? '✓ сообщим об открытии' : 'нажми – сообщим об открытии') : past ? 'смотреть отчёт' : 'подробнее и запись';
    return `<button type="button" class="cf-card${past ? ' is-past' : ''}" data-i="${i}" style="background-image:url('${esc(photo(h))}')">
        ${tag(h, past)}<span class="cf-in"><small>${when}</small><b>${esc(title)}</b><em>${sub}</em></span></button>`;
}

export function renderCalFlow(container) {
    const list = events();
    if (!list.length) { container.innerHTML = ''; return; }
    const t = today();
    let start = list.findIndex(h => h.date >= t); if (start < 0) start = list.length - 1;
    const months = [...new Set(list.map(h => h.date.slice(0, 7)))];
    container.className = 'card-container cf-wrap';
    container.innerHTML = `
        <div class="cf-head"><b>события</b><span class="cf-months">${months.map(m => `<i data-m="${m}">${MON3[Number(m.slice(5)) - 1]}</i>`).join('')}</span></div>
        <div class="cf-track">${list.map(cardHtml).join('')}</div>
        <div class="cf-dots">${list.map((_, i) => `<i data-d="${i}"></i>`).join('')}</div>`;
    const track = container.querySelector('.cf-track');
    const cards = [...track.children];
    let cur = -1;
    const update = () => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0, bestD = 1e9;
        cards.forEach((c, i) => {
            const off = (c.offsetLeft + c.offsetWidth / 2 - mid) / c.offsetWidth; // −1 … 0 … 1
            const k = Math.max(-1.6, Math.min(1.6, off));
            c.style.transform = `perspective(900px) rotateY(${-k * 28}deg) scale(${1 - Math.min(1, Math.abs(k)) * .16})`;
            c.style.opacity = String(1 - Math.min(1, Math.abs(k)) * .45);
            c.style.zIndex = String(10 - Math.round(Math.abs(k) * 3));
            if (Math.abs(off) < bestD) { bestD = Math.abs(off); best = i; }
        });
        if (best !== cur) {
            cur = best;
            const m = list[best].date.slice(0, 7);
            container.querySelectorAll('.cf-months i').forEach(x => x.classList.toggle('is-on', x.dataset.m === m));
            container.querySelectorAll('.cf-dots i').forEach((x, i) => x.classList.toggle('is-on', i === best));
        }
    };
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    const center = (i, smooth) => { const c = cards[i]; if (c) track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' }); };
    requestAnimationFrame(() => { center(start, false); update(); });
    container.querySelectorAll('.cf-months i').forEach(x => x.addEventListener('click', () => {
        haptic(); const i = list.findIndex(h => h.date.startsWith(x.dataset.m)); if (i >= 0) center(i, true);
    }));
    cards.forEach((c, i) => c.addEventListener('click', async () => {
        if (i !== cur) { haptic(); center(i, true); return; }
        const h = list[i];
        haptic();
        log('календарь-витрина: карточка', state.userCard?.status !== 'active', state.user, { date: h.date });
        if (isTeaser(h)) {
            const on = await toggleTeaserNotify(h.date).catch(() => isWaitlisted(h.date));
            const em = c.querySelector('em'); if (em) em.textContent = on ? '✓ сообщим об открытии' : 'нажми – сообщим об открытии';
            return;
        }
        const idx = (state.hikesWithTitle || []).findIndex(x => x.date === h.date);
        if (idx >= 0) showBottomSheet(idx);
    }));
}
