// js/ui/cal-flow.js – календарь «витрина с перспективой» + «колёсико дат» (07.11.2026; пока только @maxmolotov).
// Карточки событий листаются вбок со снапом: центральная крупная, соседние повёрнуты в 3D и притушены.
// Под ними – лента дат событий с насечками и лаймовой «линзой» в центре, как барабан выбора времени на iPhone:
// едет вместе с карточками, её можно крутить пальцем; каждая новая дата – щелчок вибрации (selectionChanged).
// Прошедшие события – чёрно-белые, будущие без маршрута – размытая картинка и «?».
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { showBottomSheet, isWaitlisted, toggleTeaserNotify, fetchGoingFromServer } from './calendar.js';
import { heroPhotoFor } from './rd-home.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON3 = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const CELL = 46;      // ширина ячейки даты в колёсике
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yes = v => v === true || ['yes', 'true'].includes(String(v).toLowerCase());
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const dt = d => new Date(d + 'T12:00:00');
const isTeaser = h => !(h.title && h.title.trim());
const isCity = h => yes(h.city) || yes(h.book_club) || (isTeaser(h) && /🏄/.test(h.emoji || ''));
const tick = () => { try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged(); } catch (e) {} };

// все события: из приложения (с марта 2026) + хайки до приложения (assets/past-hikes.json – только даты и названия)
let preApp = null;
function events() {
    const t = today();
    const app = (state.hikesList || [])
        .filter(h => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && !yes(h.cancelled))
        .filter(h => (h.date < t ? !isTeaser(h) : true));
    const have = new Set(app.map(h => h.date));
    const old = (preApp || []).filter(h => !have.has(h.date)).map(h => ({ ...h, preApp: true }));
    return [...old, ...app].sort((a, b) => a.date.localeCompare(b.date));
}
function photo(h) {
    const v = state.hikePhotos?.[h.date];
    if (v) return `/api/hikes?photo=${h.date}&v=${v}`;
    if (isCity(h) && /^https?:|^\//.test(String(h.image || '')) && !/trek|tropa/i.test(h.image)) return h.image;
    return `assets/teaser/${heroPhotoFor(isTeaser(h) ? `?${h.date}` : h.title)}.webp`;
}
function cardHtml(h, i) {
    const t = today(), past = h.date < t, teaser = isTeaser(h), d = dt(h.date);
    const wi = (state.hikesWithTitle || []).findIndex(x => x.date === h.date);
    const booked = !past && !teaser && wi >= 0 && state.hikeBookingStatus?.[wi] === true;
    const when = `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${past && d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}${h.time ? ` · ${esc(h.time)}` : ''}`;
    const tag = past ? `<span class="cf-tag is-past">${isCity(h) ? 'Событие завершено' : 'Хайк завершён'}</span>`
        : teaser ? '<span class="cf-tag is-soon">готовим</span>'
        : booked ? '<span class="cf-tag is-booked">✓ ты записан</span>'
        : isCity(h) ? '<span class="cf-tag is-city">в городе</span>' : '<span class="cf-tag">запись открыта</span>';
    const on = teaser && isWaitlisted(h.date);
    const cls = `cf-card${past ? ' is-past' : ''}${teaser ? ' is-teaser' : ''}${on ? ' is-on' : ''}`;
    const bg = `<span class="cf-bg" style="background-image:url('${esc(photo(h))}')"></span>`;
    if (teaser) {
        // будущий без маршрута: «?», колокольчик, строка с тумблером; подписан – карточка «загорается» лаймом
        return `<button type="button" class="${cls}" data-i="${i}">${bg}<span class="cf-q">?</span>${tag}<span class="cf-bell">🔔</span>
            <span class="cf-in cf-in-t"><small>${when}</small></span>
            <span class="cf-tbar"><span class="cf-tlab">${on ? 'сообщим об открытии' : 'сообщить об открытии'}</span><i class="cf-sw"></i></span></button>`;
    }
    const sub = past ? (h.preApp ? (h.n ? `были ${h.n}` : 'до приложения') : 'смотреть отчёт') : booked ? 'детали' : 'детали и запись';
    const title = esc(h.title)
        .replace(/(Массан)(дров)(ской)/gi, '$1&shy;$2&shy;$3')
        .replace(/(Черно)(реченск)/gi, '$1&shy;$2');
    return `<button type="button" class="${cls}" data-i="${i}">${bg}
        ${tag}<span class="cf-in"><small>${when}</small><b class="cf-title" lang="ru">${title}</b><span class="cf-going" data-going="${h.date}"></span><em>${sub}</em></span></button>`;
}
function wheelHtml(list) {
    const t = today();
    return `<div class="cf-wheel" aria-hidden="true"><span class="cf-lens"></span><div class="cf-wl">${list.map((h, i) => { const d = dt(h.date);
        return `<span class="cf-d${h.date < t ? ' is-past' : ''}${isCity(h) ? ' is-city' : ''}" data-w="${i}"><small>${WD[d.getDay()]}</small><b>${d.getDate()}</b></span>`; }).join('')}</div></div>
        <div class="cf-mon"><span data-mp></span><b data-mc></b><span data-mn></span></div>`;
}

export function renderCalFlow(container) {
    if (preApp === null) {
        preApp = [];
        fetch('assets/past-hikes.json').then(r => (r.ok ? r.json() : [])).then(j => {
            preApp = Array.isArray(j) ? j : [];
            if (preApp.length && container.isConnected) renderCalFlow(container);
        }).catch(() => {});
    }
    const list = events();
    if (!list.length) { container.innerHTML = ''; return; }
    const t = today();
    // в центр – событие ПОСЛЕ того, что уже стоит наверху главной (ближайший хайк или плашка «готовим»)
    const topDate = ((state.hikesList || []).filter(h => h && h.date >= t && !yes(h.cancelled) && !yes(h.book_club) && !(yes(h.city) && !isTeaser(h)) && !/🌧/.test(h.emoji || ''))
        .sort((a, b) => a.date.localeCompare(b.date))[0] || {}).date || '';
    let start = list.findIndex(h => (topDate ? h.date > topDate : h.date >= t));
    if (start < 0) start = list.findIndex(h => h.date >= t);
    if (start < 0) start = list.length - 1;
    container.className = 'card-container cf-wrap';
    container.innerHTML = `
        <div class="cf-head"><b>календарь</b><span>${list.filter(h => h.date >= t).length} впереди</span></div>
        <div class="cf-track">${list.map(cardHtml).join('')}</div>
        ${wheelHtml(list)}`;
    const track = container.querySelector('.cf-track');
    let interacted = false;
    const markInteracted = () => { interacted = true; };
    container.addEventListener('pointerdown', markInteracted, { once: true, passive: true });
    container.addEventListener('wheel', markInteracted, { once: true, passive: true });
    const cards = [...track.children];
    const wl = container.querySelector('.cf-wl');
    const days = [...wl.children];
    const mP = container.querySelector('[data-mp]'), mC = container.querySelector('[data-mc]'), mN = container.querySelector('[data-mn]');
    const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : cards[0].offsetWidth);
    const posNow = () => (track.scrollLeft + track.clientWidth / 2 - (cards[0].offsetLeft + cards[0].offsetWidth / 2)) / step();
    let cur = -1;
    const update = () => {
        const pos = Math.max(0, Math.min(list.length - 1, posNow()));
        cards.forEach((c, i) => {
            const k = Math.max(-1.6, Math.min(1.6, i - pos)), a = Math.min(1, Math.abs(k));
            c.style.transform = `perspective(900px) rotateY(${-k * 26}deg) scale(${1 - a * .14})`;
            c.style.opacity = String(1 - a * .4);
            c.style.zIndex = String(10 - Math.round(Math.abs(k) * 3));
        });
        wl.style.transform = `translateX(${-(pos * CELL + CELL / 2)}px)`;
        const best = Math.round(pos);
        if (best !== cur) {
            if (cur !== -1) tick();
            cur = best;
            days.forEach((d, i) => d.classList.toggle('is-on', i === best));
            const m = dt(list[best].date), mi = m.getMonth();
            mP.textContent = MON3[(mi + 11) % 12]; mC.textContent = MONN[mi]; mN.textContent = MON3[(mi + 1) % 12];
        }
    };
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    const center = (i, smooth) => { const c = cards[i]; if (c) track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' }); };
    requestAnimationFrame(() => {
        center(start, false); update();
        let hinted = false; try { hinted = localStorage.getItem('cfHinted2') === '1'; } catch (e) {}
        if (!hinted) setTimeout(() => {
            if (interacted || !container.isConnected) return;
            try { localStorage.setItem('cfHinted2', '1'); } catch (e) {}
            track.scrollBy({ left: 80, behavior: 'smooth' });
            setTimeout(() => { if (!interacted && container.isConnected) center(start, true); }, 520);
        }, 900);
    });

    // колёсико: тянешь пальцем – карусель едет (ячейка колёсика = одна карточка); тап по дате – к ней
    const wheel = container.querySelector('.cf-wheel');
    let wx = null, wStart = 0, moved = false;
    wheel.addEventListener('pointerdown', e => { wx = e.clientX; wStart = track.scrollLeft; moved = false; wheel.setPointerCapture?.(e.pointerId); track.style.scrollSnapType = 'none'; });
    wheel.addEventListener('pointermove', e => {
        if (wx === null) return;
        const dx = e.clientX - wx; if (Math.abs(dx) > 3) moved = true;
        track.scrollLeft = wStart - dx / CELL * step();
    });
    const wEnd = e => {
        if (wx === null) return;
        track.style.scrollSnapType = '';
        if (!moved) {
            const r = wheel.getBoundingClientRect();
            const target = Math.round(posNow() + (e.clientX - (r.left + r.width / 2)) / CELL);
            center(Math.max(0, Math.min(list.length - 1, target)), true);
        } else center(Math.max(0, Math.min(list.length - 1, Math.round(posNow()))), true);
        wx = null;
    };
    wheel.addEventListener('pointerup', wEnd); wheel.addEventListener('pointercancel', wEnd);

    cards.forEach((c, i) => c.addEventListener('click', async () => {
        if (i !== cur) { haptic(); center(i, true); return; }
        const h = list[i];
        haptic();
        log('календарь-витрина: карточка', state.userCard?.status !== 'active', state.user, { date: h.date });
        if (isTeaser(h)) {
            const want = !c.classList.contains('is-on');
            const paint = v => { c.classList.toggle('is-on', v); const l = c.querySelector('.cf-tlab'); if (l) l.textContent = v ? 'сообщим об открытии' : 'сообщить об открытии'; };
            paint(want);
            const on = await toggleTeaserNotify(h.date).catch(() => isWaitlisted(h.date));
            if (on !== want) paint(on);
            return;
        }
        if (h.preApp) return;
        const idx = (state.hikesWithTitle || []).findIndex(x => x.date === h.date);
        if (idx >= 0) showBottomSheet(idx);
    }));
    const dates = list.filter(h => h.date >= t && !isTeaser(h)).map(h => h.date).slice(0, 8);
    if (dates.length) fetchGoingFromServer(dates).then(lists => dates.forEach((d, k) => fillGoing(container, d, lists[k]))).catch(() => {});
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
