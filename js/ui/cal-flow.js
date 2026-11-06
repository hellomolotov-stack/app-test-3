// js/ui/cal-flow.js – календарь «витрина с перспективой» (вариант Б, 06.11.2026; пока только @maxmolotov).
// Карточки событий листаются вбок со снапом: центральная крупная, соседние повёрнуты в 3D и притушены.
// Сверху – месяцы, подсвечен месяц центральной карточки. Прошедшие слева (последние 70 дней), будущие справа,
// старт – на ближайшем будущем. Фото – «фото на обложку» из админки, иначе наш пейзаж с этого маршрута.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { showBottomSheet, isWaitlisted, toggleTeaserNotify, fetchGoingFromServer } from './calendar.js';
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
        ${tag(h, past)}<span class="cf-in"><small>${when}</small><b>${esc(title)}</b><span class="cf-going" data-going="${h.date}"></span><em>${sub}</em></span></button>`;
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
        ${scaleHtml(list)}`;
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
            container.querySelectorAll('.cf-tick').forEach((x, i) => x.classList.toggle('is-on', i === best));
            const th = container.querySelector('.cf-thumb'), tk = container.querySelectorAll('.cf-tick')[best];
            if (th && tk) th.style.left = tk.style.left;
        }
    };
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    const center = (i, smooth) => { const c = cards[i]; if (c) track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' }); };
    requestAnimationFrame(() => {
        center(start, false); update();
        // один раз: карусель покачивается – подсказка, что тут листается
        let hinted = false; try { hinted = localStorage.getItem('cfHinted') === '1'; } catch (e) {}
        if (!hinted) setTimeout(() => {
            try { localStorage.setItem('cfHinted', '1'); } catch (e) {}
            track.scrollBy({ left: 90, behavior: 'smooth' });
            setTimeout(() => center(start, true), 520);
        }, 900);
    });
    // шкала сезона: тап или протяжка пальцем – быстро к событию этой даты
    const scale = container.querySelector('.cf-scale');
    if (scale) {
        const ticks = [...scale.querySelectorAll('.cf-tick')];
        const pick = x => {
            const r = scale.getBoundingClientRect(), f = (x - r.left) / r.width * 100;
            let bi = 0, bd = 1e9; ticks.forEach((t, i) => { const d = Math.abs(parseFloat(t.style.left) - f); if (d < bd) { bd = d; bi = i; } });
            if (bi !== cur) { haptic(); center(bi, false); update(); }
        };
        let drag = false;
        scale.addEventListener('pointerdown', e => { drag = true; scale.setPointerCapture?.(e.pointerId); pick(e.clientX); });
        scale.addEventListener('pointermove', e => { if (drag) pick(e.clientX); });
        const end = () => { drag = false; };
        scale.addEventListener('pointerup', end); scale.addEventListener('pointercancel', end);
    }
    // кто идёт – аватарки на будущих хайках
    const dates = list.filter(h => h.date >= t && !isTeaser(h)).map(h => h.date).slice(0, 8);
    if (dates.length) fetchGoingFromServer(dates).then(lists => dates.forEach((d, k) => fillGoing(container, d, lists[k]))).catch(() => {});
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

const GRADS = [['#f6b26b', '#e06666'], ['#6fa8dc', '#3d85c6'], ['#93c47d', '#38761d'], ['#c27ba0', '#741b47'], ['#ffd966', '#bf9000']];
const first = n => String(n || '').trim().split(/\s+/)[0] || '';
function fillGoing(container, date, lst) {
    const box = container.querySelector(`[data-going="${date}"]`);
    const people = (Array.isArray(lst) ? lst : []).filter(p => p && p.userId);
    if (!box || !people.length) return;
    const av = people.slice(0, 4).map((p, i) => { const g = GRADS[i % GRADS.length];
        return `<i style="background:linear-gradient(135deg,${g[0]},${g[1]})">${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="" onerror="this.remove()">` : esc((first(p.name)[0] || '?').toUpperCase())}</i>`; }).join('');
    const names = people.slice(0, 2).map(p => esc(first(p.name))).filter(Boolean).join(', ');
    const rest = people.length - Math.min(2, people.length);
    box.innerHTML = `<span class="cf-avs">${av}</span><span>${names}${rest > 0 ? ` +${rest}` : ''}</span>`;
}
// шкала сезона: отметки событий по датам (цвет – тип), подписи месяцев, бегунок на текущей карточке
function scaleHtml(list) {
    const t0 = dt(list[0].date).getTime(), t1 = dt(list[list.length - 1].date).getTime(), span = Math.max(1, t1 - t0);
    const pos = d => (4 + (dt(d).getTime() - t0) / span * 92).toFixed(2);
    const t = today();
    const ticks = list.map(h => `<i class="cf-tick${h.date < t ? ' is-past' : isCity(h) ? ' is-city' : isTeaser(h) ? ' is-soon' : ''}" style="left:${pos(h.date)}%"></i>`).join('');
    const months = [...new Set(list.map(h => h.date.slice(0, 7)))].map(m => {
        const f = list.find(h => h.date.startsWith(m)).date;
        return `<span class="cf-mlab" style="left:${pos(f)}%">${MON3[Number(m.slice(5)) - 1]}</span>`;
    }).join('');
    const ahead = list.filter(h => h.date >= t).length, was = list.length - ahead;
    return `<div class="cf-scale-wrap"><div class="cf-scale"><span class="cf-line"></span>${ticks}<span class="cf-thumb"></span></div><div class="cf-mlabs">${months}</div>
        <div class="cf-count"><span>${was ? `${was} было` : ''}</span><span>${ahead ? `${ahead} впереди` : ''}</span></div></div>`;
}
