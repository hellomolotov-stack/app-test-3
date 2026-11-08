// js/ui/home.js
import { mountAdmissionEntry } from './admission.js';
import { isAdmissionPilot } from '../admission.js';
import { haptic, openLink, parseLinks, formatDateForDisplay, mainDiv, subtitle, tg, showConfetti, scrollToElement } from '../utils.js';
import { state, saveBookingStatusToLocal } from '../state.js';
import { isUpcomingHike } from '../hike-timing.js';
import { log, updateRegistrationInSheet } from '../api.js';
import { getDatabase, addParticipant, removeParticipant, setUserRegistrationStatus, loadPopups, loadAllProfiles } from '../firebase.js';
import { showBottomNav, setupBottomNav, setUserInteracted, showBack, hideBack, cleanupProfileOverlays } from './common.js';
import { renderCalendar, showBottomSheet, showGuestBookingPopup, showHikePickerSheet, getAvailableCardsCount, renderRoutesMap } from './calendar.js';
import { renderIntelligentsiaRoutes, refreshIntelligentsiaRouteFavorites } from './intelligentsia-routes.js';
import { renderNewcomerPage, renderPriv, renderGuestPrivileges, renderSafetyPage } from './privileges.js';
import { renderProfiles } from './profiles.js';
import { renderWeatherBlock, initWeatherBlock } from './weather.js';
import { openCardSheet } from './card-sheet.js';
import { cardQrEnabled, openCardQr } from './card-qr.js';
import { cardScratchHtml, mountCardScratch } from './card-scratch.js';
import { openOnboardingChat } from './chat-entry.js';
import { setLumenContext } from './lumen.js';
import { isLumenPilotUser } from '../lumen/config.js';
import { mountCircle } from './circle.js';
import { ensureMmNotes, mmNotes, mmNoteForDate } from './mm-reader.js';
import { summaryParticipants } from '../mm-participants.js';
import { mountAdminEntry } from './admin-entry.js';
import { mountMyAchievements } from './medals.js';
import { maybeShowNewAchievements } from './achievements-popup.js';
import { isRedesign, applyRedesignFlag, isV2 } from '../redesign.js';
import { rdHomeTopHtml, wireRdHomeTop, v2HomeTopHtml, v2GuestTopHtml } from './rd-home.js';

function getVisitedRouteIds() {
    const visited = new Set();
    state.hikesWithTitle.forEach((hike, index) => {
        if (!state.hikeBookingStatus[index]) return;
        const title = (hike.title || '').toLowerCase();
        ROUTE_TRACKS.forEach(route => {
            if (route.keywords.some(kw => title.includes(kw))) visited.add(route.id);
        });
    });
    return visited;
}

export function removeStickyHikeCta() {
    document.getElementById('stickyHikeCta')?.remove();
}

function greeting(firstName) {
    return `👋🏻 привет, ${firstName}!`;
}

function mountStickyHikeCta() {
    removeStickyHikeCta();
    let nextHikeIndex = -1;
    for (let i = 0; i < (state.hikesWithTitle || []).length; i++) {
        const h = state.hikesWithTitle[i];
        if (isUpcomingHike(h)) {
            nextHikeIndex = i;
            break;
        }
    }
    if (nextHikeIndex === -1) return;
    const hike = state.hikesWithTitle[nextHikeIndex];
    const dateStr = formatDateForDisplay(hike.date);
    const cta = document.createElement('div');
    cta.id = 'stickyHikeCta';
    cta.className = 'sticky-hike-cta';
    cta.innerHTML = `<button class="btn btn-yellow sticky-hike-btn" id="stickyHikeBtn">записаться на хайк · ${dateStr}</button>`;
    document.body.appendChild(cta);
    document.getElementById('stickyHikeBtn').addEventListener('click', () => {
        haptic();
        log('sticky cta', true, state.user);
        const i = state.hikesWithTitle.findIndex(h => h.date === hike.date);
        showBottomSheet(i !== -1 ? i : nextHikeIndex);
    });
}

window.addEventListener('club:hike-clock', () => {
    if (document.getElementById('stickyHikeCta')) mountStickyHikeCta();
});

function getCurrentTopOffset() {
    if (!tg) return 76;
    const safeTop = tg.contentSafeAreaInset?.top || 0;
    return safeTop + 60;
}

function scrollToCalendarAndHighlight() {
    const calendar = document.getElementById('calendarContainer');
    if (!calendar) return;
    const offset = getCurrentTopOffset();
    const rect = calendar.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const targetY = rect.top + scrollTop - offset;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    calendar.style.transition = 'box-shadow 0.5s';
    calendar.style.boxShadow = '0 0 20px 5px rgba(255,255,255,0.7)';
    setTimeout(() => { calendar.style.boxShadow = ''; }, 1500);
}

function updateMetricsUI() {
    const hikesEl = document.querySelector('[data-metric="hikes"]');
    const locationsEl = document.querySelector('[data-metric="locations"]');
    const kilometersEl = document.querySelector('[data-metric="kilometers"]');
    const meetingsEl = document.querySelector('[data-metric="meetings"]');
    if (hikesEl) hikesEl.textContent = state.metrics.hikes;
    if (locationsEl) locationsEl.textContent = state.metrics.locations;
    if (kilometersEl) kilometersEl.textContent = state.metrics.kilometers;
    if (meetingsEl) meetingsEl.textContent = state.metrics.meetings;
}
window.addEventListener('club:metrics-updated', updateMetricsUI);


const mskDayOf = d => { const s = String(d || ''); const t = new Date(s); return s.includes('T') && !isNaN(t) ? t.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }) : s.slice(0, 10); };
// когда заметки Plaud загрузились – перерисовываем блок саммари (кнопки «читать» открывают читалку)
function refreshMastermindBlock() {
    ensureMmNotes().then(list => {
        if (!list.length) return;
        const c = document.getElementById('mastermindSummariesContainer');
        if (!c) return;
        c.innerHTML = renderMastermindSummaries();
        wireMmCover(c);
        c.querySelectorAll('.guest-read-btn').forEach(btn => btn.addEventListener('click', handleGuestRead));
        try { fitMastermindScroll(); } catch (e) {}
    });
}
// классика v2: «обложка выпуска» – последний мастермайнд из читалки (заметки Plaud):
// тема, дата и место, коротко – с каким запросом пришёл человек, кто был, «читать»
function mmRequest(body) {
    const lines = String(body || '').split('\n');
    let i = lines.findIndex(l => /^#{2,3}\s*запрос/i.test(l.trim()));
    const from = i >= 0 ? i + 1 : lines.findIndex(l => l.trim() && !/^#/.test(l.trim()) && !/^хайк,|^\d/.test(l.trim()));
    for (let k = Math.max(0, from); k < lines.length; k++) {
        const t = lines[k].trim();
        if (!t) continue;
        if (/^#/.test(t)) break;
        return t.replace(/\*\*/g, '').replace(/\[(.+?)\]/g, '$1').replace(/^>\s?/, '');
    }
    return '';
}
function mmCoverHtml() {
    const n = mmNotes()[0];
    if (!n) return '';
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const d = new Date(n.date + 'T12:00:00');
    const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const req = mmRequest(n.body);
    return `<div class="card-container mmc" data-mmc="${esc(n.id)}">
        <div class="mmc-top">
            <div class="mmc-art"><img src="assets/plaud-v2.webp" alt=""></div>
            <div class="mmc-meta"><span class="mmc-k">мастермайнд · ${d.getDate()} ${months[d.getMonth()]}</span><b>${esc(n.title)}</b>${n.place ? `<span class="mmc-when">${esc(n.place)}</span>` : ''}</div>
        </div>
        ${req ? `<p class="mmc-q">${esc(req)}</p>` : ''}
        <div class="mmc-foot"><span class="mmc-avs" data-mmc-avs="${esc(n.date)}"></span><button type="button" class="mmc-read" data-mmc-read>читать саммари</button></div>
    </div>`;
}
function wireMmCover(root) {
    const box = root?.querySelector?.('.mmc');
    if (!box) return;
    const open = () => { haptic(); log('мастермайнд: обложка на главной', state.userCard.status !== 'active', state.user); import('./mm-reader.js').then(m => m.openMmReader(box.dataset.mmc)); };
    box.addEventListener('click', open);
    const av = box.querySelector('[data-mmc-avs]');
    if (av) import('./calendar.js').then(m => m.fetchGoingFromServer([av.dataset.mmcAvs])).then(([lst]) => {
        const participants = summaryParticipants(lst);
        const ppl = participants.slice(0, 4);
        const G = ['#e06666', '#3d85c6', '#38761d', '#741b47', '#bf9000'];
        const all = participants.length;
        av.innerHTML = ppl.map((p, i) => `<i style="background:${G[i % 5]}">${p.photoUrl ? `<img src="${String(p.photoUrl).replace(/"/g, '')}" alt="" onerror="this.remove()">` : String(p.name || '?').trim()[0] || '?'}</i>`).join('') + (all ? `<span class="mmc-n">${all} ${all % 10 === 1 && all % 100 !== 11 ? 'участник' : (all % 10 >= 2 && all % 10 <= 4 && (all % 100 < 10 || all % 100 >= 20)) ? 'участника' : 'участников'}</span>` : '');
    }).catch(() => {});
}

function renderMastermindSummaries() {
    if (isV2() && mmNotes().length) return mmCoverHtml();
    // саммари из листа + те, что добавлены к хайкам в админке (summary_link), без повторов по ссылке
    const listed = state.mastermindSummaries || [];
    const links = new Set(listed.map(s => String(s.link || '').trim()));
    // дата уже есть в списке (например, поправили в админке) – саммари этого хайка не дублируем
    const days = new Set(listed.map(s => String(s.date || '').slice(0, 10)));
    const fromHikes = (state.hikesWithTitle || []).filter(h => /^https?:\/\//.test(String(h.summary_link || '').trim()) && !links.has(String(h.summary_link).trim()) && !days.has(String(h.date).slice(0, 10)))
        .map(h => ({ date: h.date, title: String(h.summary_title || '').trim() || h.title, link: String(h.summary_link).trim() }));
    // саммари, которые читаются прямо в приложении (заметки Plaud), – тоже в списке, без повторов по дате
    const known = new Set([...listed, ...fromHikes].map(s => mskDayOf(s.date)));
    const fromNotes = mmNotes().filter(n => !known.has(n.date)).map(n => ({ date: n.date, title: n.title, link: '' }));
    const summaries = [...listed, ...fromHikes, ...fromNotes].sort((a, b) => mskDayOf(b.date).localeCompare(mskDayOf(a.date)));
    const isGuest = state.userCard.status !== 'active';
    const currentYear = new Date().getFullYear();
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    let innerHtml = '';
    if (summaries.length === 0) {
        innerHtml = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: var(--surface-inner); border-radius: 12px; backdrop-filter: blur(4px);">
                <div style="flex: 1;">
                    <span style="color: #ffffff;">скоро здесь появится первая запись</span>
                </div>
            </div>
        `;
    } else {
        summaries.forEach(item => {
            let formattedDate = '';
            if (item.date) {
                // даты из таблицы приходят как полночь по Москве в UTC (…T21:00:00Z) – берём день по Москве
                const dt = new Date(item.date);
                const dateStr = String(item.date).includes('T') && !isNaN(dt) ? dt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }) : String(item.date).split('T')[0];
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                    const day = parseInt(parts[2], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const year = parseInt(parts[0], 10);
                    if (year === currentYear) {
                        formattedDate = `${day} ${monthNames[month]}`;
                    } else {
                        formattedDate = `${year}.${String(month+1).padStart(2,'0')}.${String(day).padStart(2,'0')}`;
                    }
                } else {
                    formattedDate = item.date;
                }
            }
            const note = mmNoteForDate(mskDayOf(item.date));
            const readBtn = note
                ? `<button type="button" data-mm-note="${note.id}" style="width: auto; margin: 0; padding: 8px 14px; flex-shrink: 0; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); color: #ffffff; border-radius: 20px; font-size: 13px; font-family: inherit; cursor: pointer; white-space: nowrap;">${isGuest ? '🔒 начало' : 'читать'}</button>`
                : isGuest
                ? `<button class="btn guest-read-btn" style="width: auto; margin: 0; padding: 8px 14px; flex-shrink: 0; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); color: rgba(255,255,255,0.85); border-radius: 20px; font-size: 13px;">🔒</button>`
                : `<a href="${item.link}" target="_blank" class="mastermind-read-link" style="width: auto; margin: 0; padding: 8px 14px; flex-shrink: 0; text-decoration: none; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); color: #ffffff; border-radius: 20px; font-size: 13px; white-space: nowrap;" data-date="${item.date}" data-title="${item.title || ''}">читать</a>`;
            innerHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: var(--surface-inner); border-radius: 12px; backdrop-filter: blur(4px);">
                    <div style="flex: 1; margin-right: 16px;">
                        <span style="color: #B9A2FF; font-weight: 900; font-style: italic; white-space: nowrap;">${formattedDate}</span>
                        <span style="color: #ffffff; margin-left: 8px;">${item.title || 'Без названия'}</span>
                    </div>
                    ${readBtn}
                </div>
            `;
        });
    }

    return `
        <div class="card-container" id="mastermindSummariesCard">
            <h2 class="section-title" style="margin: 0 16px 16px 16px;">саммари мастермайнда
            </h2>
            <p style="margin: -8px 16px 16px; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.55);">здесь собраны записи всех ценных мыслей, которые были озвучены участниками на мастермайнд сессиях во время хайков на вершинах гор южного берега. материал записан Plaud Note Pro и обработан с помощью последних моделей ChatGPT и Claude</p>
            <div class="mm-scroll">${innerHtml}</div>
        </div>
    `;
}

// видно ровно три последних саммари, остальные – прокруткой внутри блока; градиент внизу
// показывает, что ниже есть ещё, и исчезает, когда долистали до конца
function fitMastermindScroll() {
    const box = document.querySelector('#mastermindSummariesCard .mm-scroll');
    if (!box) return;
    const fit = () => {
        const items = box.children;
        if (items.length <= 3) { box.classList.add('is-all'); return; }
        box.style.maxHeight = `${items[2].offsetTop + items[2].offsetHeight - items[0].offsetTop}px`;
        const edge = () => box.classList.toggle('is-end', box.scrollTop + box.clientHeight >= box.scrollHeight - 2);
        box.addEventListener('scroll', edge, { passive: true });
        edge();
    };
    requestAnimationFrame(fit);
}

function renderSafetyBanner() {
    const s = state.safety;
    if (!s || !s.active) return '';
    const label = s.banner || '🆘 на случай ЧП — будь наготове';
    return `
        <div class="safety-banner" id="safetyBanner">
            <span class="safety-banner-text">${label}</span>
            <span class="safety-banner-arrow">›</span>
        </div>
    `;
}

// подпись в самом низу главной: «разработано в мастерской Молотова» → личка в Telegram
function renderMakerCredit() {
    return `<div class="maker-credit"><button type="button" id="makerCreditBtn"><small>разработано</small><span>в мастерской Молотова <span aria-hidden="true">↗</span></span></button></div>`;
}

function wireSafetyBanner() {
    document.getElementById('makerCreditBtn')?.addEventListener('click', () => {
        haptic();
        openLink('https://t.me/maxmolotov', 'мастерская Молотова', state.userCard.status !== 'active');
    });
    document.getElementById('safetyBanner')?.addEventListener('click', () => {
        haptic();
        log('баннер ЧП', state.userCard.status !== 'active', state.user);
        renderSafetyPage(state.userCard.status !== 'active');
    });
}

function renderTestimonialsBlock() {
    const items = (state.testimonials || []).filter(t => t && (t.text || t.quote));
    if (!items.length) return '<div id="testimonialsContainer"></div>';

    let cards = '';
    items.forEach(t => {
        const text = t.text || t.quote || '';
        const name = t.name || '';
        const meta = t.meta || t.role || (t.hikes ? `${t.hikes} хайков в клубе` : '');
        const photo = t.photo || t.avatar || '';
        const avatar = photo
            ? `<img src="${photo}" class="tst-avatar" onerror="this.style.display='none'">`
            : `<div class="tst-avatar tst-avatar-ph">${(name.charAt(0) || '🙂').toUpperCase()}</div>`;
        cards += `
            <div class="tst-card">
                <div class="tst-quote">«${text}»</div>
                <div class="tst-author">
                    ${avatar}
                    <div class="tst-author-meta">
                        <div class="tst-name">${name}</div>
                        ${meta ? `<div class="tst-role">${meta}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    return `
        <div class="card-container" id="testimonialsContainer">
            <h2 class="section-title" style="margin: 0 16px 16px 16px;">почему остаются</h2>
            <div class="tst-scroller">${cards}</div>
        </div>
    `;
}

function renderUpdatesBlock() {
    const updates = state.updates || [];
    if (!updates.length) return '';

    let itemsHtml = '';
    updates.forEach(item => {
        const formattedDate = formatDateForDisplay(item.date);
        const safeText = String(item.update || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
        let text = parseLinks(safeText, state.userCard.status !== 'active');
        itemsHtml += `
            <div class="update-item">
                <span class="update-date">${formattedDate}</span>
                <span class="update-text">${text}</span>
            </div>
        `;
    });

    return `
        <div class="card-container updates-container">
            <h2 class="section-title" style="margin: 0 16px 16px 16px;">обновления
            </h2>
            <div class="updates-scroll">${itemsHtml}</div>
        </div>
    `;
}

// классика v2: «клуб в цифрах» одной фразой, цифры выделены лаймом; ниже чипы с фактами
const CLUB_START = '2025-05-25'; // первый хайк клуба
function metricsStoryHtml() {
    const m = state.metrics || {};
    const s = new Date(CLUB_START + 'T12:00:00'), now = new Date();
    const months = Math.max(1, (now.getFullYear() - s.getFullYear()) * 12 + now.getMonth() - s.getMonth());
    const span = months >= 15 && months <= 20 ? 'за полтора года' : months >= 21 && months <= 27 ? 'за два года' : months >= 12 ? 'за год с лишним' : `за ${months} мес.`;
    const v = k => `<em data-metric="${k}">${m[k] ?? ''}</em>`;
    return `<div class="mst-text">${span} мы прошли ${v('kilometers')}&nbsp;км на ${v('hikes')}&nbsp;хайках, побывали в ${v('locations')}&nbsp;местах Крыма и познакомили людей друг с другом ${v('meetings')}&nbsp;раз</div>
        <div class="mst-chips"><span>🪪 <b>20+</b> владельцев карты</span><span>🏔 выше всего – <b>1527 м</b></span><span>📅 с мая 2025</span></div>`;
}

window.addEventListener('club:content-updated', () => {
    if (!mainDiv()?.querySelector('.metrics-header')) return;
    updateMetricsUI();
    const current = mainDiv().querySelector('.updates-container');
    const template = document.createElement('template');
    template.innerHTML = renderUpdatesBlock();
    const next = template.content.firstElementChild;
    if (current && next) {
        current.querySelector('.updates-scroll').innerHTML = next.querySelector('.updates-scroll').innerHTML;
    } else if (current) current.remove();
    else if (next) mainDiv().querySelector('.maker-credit')?.before(next);
    const mm = document.getElementById('mastermindSummariesContainer');
    if (mm) mm.innerHTML = renderMastermindSummaries();
});

function handleGuestRead(e) {
    e.preventDefault();
    log('мастермайнд', true, state.user);
    showGuestMastermindPopup();
}

async function showGuestMastermindPopup() {
    haptic();
    showGuestBookingPopup(null, null, null, 'mastermind');
}

let _hikePreviewUnsub = null;
let _ctaTimer = null;

const GUEST_QA = [
    { q: 'хочется выдохнуть?', btns: ['хочется', 'прямо сейчас'], a: 'горный воздух – лучший терапевт' },
    { q: 'когда последний раз делал что-то впервые?', btns: ['не помню…', 'давно'], a: 'запишись на хайк – билет 1 200 ₽' },
    { q: 'надоело знакомиться через экран?', btns: ['надоело', 'а как?'], a: 'тропа знакомит честнее тиндера' },
    { q: 'хочется кружиться с раскинутыми руками?', btns: ['хочется!', 'а где?'], a: '500+ метров над Ялтой' },
    { q: 'не можешь найти своих людей?', btns: ['не могу', 'а где они?'], a: 'они уже здесь' },
];

// ==================== СТРОКА «СПРОСИ» НАВЕРХУ ГЛАВНОЙ ====================
// Написанное уходит организаторам сразу (через чат поддержки → бот), чипы открывают готовые ответы.
const ASK_GROUPS = [
    ['🥾 первый хайк', [
        ['как проходит хайк', 'first_time'], ['что взять с собой', 'pack'], ['нужна ли подготовка', 'faq:подготовк'],
        ['вдруг не выдержу темп', 'd_pace'], ['будет неловко с незнакомыми', 'd_awkward'], ['нет подходящей обуви', 'd_gear'],
    ]],
    ['🏔 клуб', [
        ['что за клуб', 'faq:о клубе'], ['что такое хайкинг', 'faq:что такое хайкинг'], ['как вступить в клуб', 'join', 'pilot'],
        ['что такое мастермайнд', 'faq:мастермайнд'], ['зачем звёзды в чате', 'faq:звёзд'],
    ]],
    ['🌟 запись и карта', [['как попасть на хайк', 'faq:как попасть'], ['что даёт карта интеллигента', 'card']]],
    ['🛡️ правила', [['как с безопасностью', 'faq:безопасност'], ['можно ли с алкоголем', 'faq:алкогол'], ['нужен ли пропуск в заповедник', 'faq:пропуск']]],
];

function askGroups() {
    const pilot = isAdmissionPilot(state.user);
    return ASK_GROUPS.map(([title, qs]) => [title, qs.filter(q => q[2] !== 'pilot' || pilot)]);
}

function askBarHtml() {
    const groups = askGroups();
    const all = groups.flatMap(g => g[1]);
    return `
        <form class="ask-bar" id="askBar" autocomplete="off">
            <div class="ask-bar-field">
                <span class="ask-bar-spark">✦</span>
                <input class="ask-bar-input" id="askBarInput" type="text" maxlength="500" enterkeyhint="send"
                    placeholder="спроси про хайки, карту или клуб…">
                <button class="ask-bar-send" type="submit" aria-label="отправить">↑</button>
            </div>
            <div class="ask-bar-row">
                <div class="ask-bar-chips">${all.map(q => `<button type="button" class="ask-bar-chip" data-node="${q[1]}">${q[0]}</button>`).join('')}</div>
                <button type="button" class="ask-bar-more" aria-label="все вопросы" aria-expanded="false">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            <div class="ask-bar-dd"><div class="ask-bar-dd-in">
                <div class="ask-bar-dd-head">вопросы, на которые уже есть ответ</div>
                ${groups.map(([title, qs]) => `<div class="ask-bar-grp"><div class="ask-bar-g">${title}</div><div class="ask-bar-qs">${qs.map(q => `<button type="button" class="ask-bar-q" data-node="${q[1]}">${q[0]}</button>`).join('')}</div></div>`).join('')}
                <button type="button" class="ask-bar-own">не нашёл ответ? <b>напиши свой вопрос ↑</b></button>
            </div></div>
        </form>`;
}

function wireAskBar() {
    const form = document.getElementById('askBar');
    if (!form) return;
    const input = form.querySelector('.ask-bar-input');
    const more = form.querySelector('.ask-bar-more');
    const sync = () => form.classList.toggle('has-text', !!input.value.trim());
    const setOpen = (open) => { form.classList.toggle('dd-open', open); more.setAttribute('aria-expanded', String(open)); };
    input.addEventListener('input', sync);
    input.addEventListener('focus', () => log('строка вопроса: фокус', state.userCard.status !== 'active', state.user));
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        haptic();
        input.value = '';
        sync();
        input.blur();
        setOpen(false);
        log('строка вопроса: отправил', state.userCard.status !== 'active', state.user);
        openOnboardingChat(null, null, false, { initialSupportMessage: text });
    });
    more.addEventListener('click', () => {
        haptic();
        const open = !form.classList.contains('dd-open');
        setOpen(open);
        if (open) log('строка вопроса: все вопросы', state.userCard.status !== 'active', state.user);
    });
    form.querySelector('.ask-bar-own').addEventListener('click', () => { haptic(); setOpen(false); input.focus(); });
    form.querySelectorAll('[data-node]').forEach(btn => btn.addEventListener('click', () => {
        haptic();
        log(`строка вопроса: ${btn.textContent}`, state.userCard.status !== 'active', state.user);
        openOnboardingChat(btn.dataset.node);
    }));
}

function renderGuestHome() {
    if (_hikePreviewUnsub) { _hikePreviewUnsub(); _hikePreviewUnsub = null; }
    clearTimeout(_ctaTimer);
    cleanupProfileOverlays();
    const firstName = state.user?.first_name || 'друг';
    const v2 = isV2();
    subtitle().textContent = v2 ? '' : greeting(firstName);
    subtitle().classList.add('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();

    const nextHikeIdx = (state.hikesWithTitle || []).findIndex(
        h => isUpcomingHike(h)
    );
    const nextHike = nextHikeIdx >= 0 ? state.hikesWithTitle[nextHikeIdx] : null;

    // v2: большого блока с картой нет – в углу шапки мини-карта с глитчем, она открывает слайдер покупки
    const cardHtml = v2 ? '' : `
        <div class="card-container" id="cardBlock">
            ${cardScratchHtml()}
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">${state.userCard.hikes || 0}</span></div>
            <div class="sc-row">
                <div class="sc-text"><b>карта интеллигента</b><span>что за ней скрывается?</span></div>
                <button type="button" class="btn btn-yellow sc-btn" id="cardBadgeBtn">узнать</button>
            </div>
        </div>
        ${/* блок «интеллигентный помощник» на главной гостя убран (15.10) – спросить можно строкой сверху */ false ? `
        <div class="card-container" id="chatBlock">
            <h2 class="section-title">интеллигентный помощник</h2>
            <div class="guest-chat">
                <div class="gc-inner">
                    <div class="gc-viewport">
                        <div class="gc-thread" id="gcThread"></div>
                    </div>
                </div>
                <div class="gc-chips" id="gcChips"></div>
            </div>
        </div>
        ` : ''}
    `;

    main.innerHTML = `
        ${v2 ? v2GuestTopHtml(cardHtml) + '<div class="card-container" id="calendarContainer"></div><div id="rdMedalsAnchor"></div>' : askBarHtml() + cardHtml}
        <div id="circleContainer"></div>
        ${v2 ? '' : '<div class="card-container" id="calendarContainer"></div>'}
        ${/* блок «для новичков» убран у всех (07.11) */ false ? `
        <div class="card-container">
            <h2 class="section-title">для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest">
                <span class="newcomer-text">как всё устроено</span>
                <img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image">
            </div>
        </div>
        ` : ''}
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
        ${renderWeatherBlock()}
        <div class="card-container">
            <div class="metrics-header"><h2 class="metrics-title">клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" class="metrics-link dynamic-link" data-url="https://t.me/yaltahiking/148" data-guest="true"><span class="ml-long">смотреть </span>отчёты ›</a></div>
            ${isV2() ? metricsStoryHtml() : `
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${state.metrics.hikes}</div></div>
                <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${state.metrics.locations}</div></div>
                <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${state.metrics.kilometers}</div></div>
                <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${state.metrics.meetings}</div></div>
            </div>`}
        </div>
        ${renderTestimonialsBlock()}
        ${isV2() ? '' : renderUpdatesBlock()}
        ${isV2() ? '' : renderSafetyBanner()}
        ${renderMakerCredit()}
    `;

    wireSafetyBanner();
    if (v2) wireRdHomeTop(); else wireAskBar();
    fitMastermindScroll();
    const cardBtn = document.getElementById('cardBadgeBtn');
    cardBtn?.addEventListener('click', () => {
        openCardSheet({ source: 'кнопка «узнать»', hikeDate: nextHike?.date, hikeTitle: nextHike?.title });
    });
    if (!v2) mountCardScratch(document.getElementById('cardBlock'), {
        onOpen: () => openCardSheet({ source: 'касание карты', hikeDate: nextHike?.date, hikeTitle: nextHike?.title }),
        onEnough: () => {
            cardBtn?.classList.add('is-pulse');
            window.dispatchEvent(new CustomEvent('club:act', { detail: { type: 'card_scratched' } }));
        }
    });

    // Q&A диалог с кнопками-ответами
    const gcThread = document.getElementById('gcThread');
    const gcChips = document.getElementById('gcChips');

    if (gcThread && gcChips) {
        let qaIdx = Math.floor(Math.random() * GUEST_QA.length);
        let busy = false;

        const addBubble = (text, cls) => {
            const row = document.createElement('div');
            row.className = 'gc-row ' + (cls === 'gc-out' ? 'gc-row-out' : 'gc-row-in');
            const b = document.createElement('span');
            b.className = 'gc-bub ' + cls;
            if (cls === 'gc-typing') b.innerHTML = '<i></i><i></i><i></i>';
            else b.textContent = text;
            row.appendChild(b);
            gcThread.appendChild(row);
            return row;
        };

        const showChips = (labels, onPick) => {
            gcChips.innerHTML = '';

            const chatBtn = document.createElement('button');
            chatBtn.className = 'gc-chip-chat';
            chatBtn.textContent = 'в чат';
            chatBtn.addEventListener('click', () => {
                haptic();
                log('в чат из qa', true, state.user);
                openOnboardingChat();
            });
            gcChips.appendChild(chatBtn);

            const right = document.createElement('div');
            right.className = 'gc-chips-right';
            labels.forEach(label => {
                const chip = document.createElement('button');
                chip.className = 'gc-chip';
                chip.textContent = label;
                chip.addEventListener('click', () => { haptic(); onPick(label); });
                right.appendChild(chip);
            });
            gcChips.appendChild(right);
        };

        // «пойти на хайк →» есть всегда: открывает ближайший хайк, а если впереди пока только
        // заглушка «готовим хайк» – ведёт к календарю, где можно попросить сообщить об открытии записи.
        const showHikeChip = () => {
            const chip = document.createElement('button');
            chip.className = 'gc-chip gc-chip-hike';
            chip.textContent = 'пойти на хайк →';
            chip.addEventListener('click', () => {
                haptic();
                log('пойти на хайк из qa', true, state.user, { target: nextHike ? 'hike' : 'calendar' });
                if (nextHike) { const i = state.hikesWithTitle.findIndex(h => h.date === nextHike.date); showBottomSheet(i !== -1 ? i : nextHikeIdx); return; }
                const cal = document.getElementById('calendarContainer');
                if (cal) scrollToElement(cal, 76);
            });
            gcChips.appendChild(chip);
        };

        const startRound = (i) => {
            clearTimeout(_ctaTimer);
            qaIdx = ((i % GUEST_QA.length) + GUEST_QA.length) % GUEST_QA.length;
            busy = false;
            const pair = GUEST_QA[qaIdx];

            gcThread.classList.add('gc-thread-exit');
            setTimeout(() => {
                gcThread.classList.remove('gc-thread-exit');
                gcThread.innerHTML = '';
                gcChips.innerHTML = '';
                addBubble(pair.q, 'gc-in');

                showChips(pair.btns, (picked) => {
                    if (busy) return;
                    busy = true;
                    gcChips.innerHTML = '';
                    addBubble(picked, 'gc-out');
                    log('qa ответ', true, state.user, { idx: String(qaIdx), btn: picked });

                    const typingRow = addBubble('', 'gc-typing');
                    setTimeout(() => {
                        typingRow.remove();
                        addBubble(pair.a, 'gc-in gc-answer');
                        showHikeChip();
                        _ctaTimer = setTimeout(() => startRound(qaIdx + 1), 5000);
                    }, 900);
                });
            }, 350);
        };

        // первый раунд без exit-анимации
        const pair = GUEST_QA[qaIdx];
        addBubble(pair.q, 'gc-in');
        showChips(pair.btns, (picked) => {
            if (busy) return;
            busy = true;
            gcChips.innerHTML = '';
            addBubble(picked, 'gc-out');
            log('qa ответ', true, state.user, { idx: String(qaIdx), btn: picked });
            const typingRow = addBubble('', 'gc-typing');
            setTimeout(() => {
                typingRow.remove();
                addBubble(pair.a, 'gc-in gc-answer');
                showHikeChip();
                _ctaTimer = setTimeout(() => startRound(qaIdx + 1), 5000);
            }, 900);
        });

    }

    // новичкам
    document.getElementById('newcomerBtnGuest')?.addEventListener('click', () => {
        haptic(); setUserInteracted();
        log('новичкам', true, state.user);
        if (isLumenPilotUser(state.user)) openOnboardingChat(null, null, true);
        else openOnboardingChat('faq');
    });

    // аватарки членов клуба (лениво)
    loadAllProfiles().then(profiles => {
        state.profiles = profiles;
        refreshIntelligentsiaRouteFavorites();
        const arr = Object.values(profiles || {}).filter(p => p && (p.avatarUrl || p.photoUrl));
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        const el = document.getElementById('guestClubAvatars');
        if (el) {
            el.innerHTML = arr.slice(0, 4).map(p =>
                `<img src="${p.avatarUrl || p.photoUrl}" class="guest-club-avatar" onerror="this.remove()">`
            ).join('');
        }
    }).catch(() => {});

    const readButtons = document.querySelectorAll('.guest-read-btn');
    readButtons.forEach(btn => {
        btn.removeEventListener('click', handleGuestRead);
        btn.addEventListener('click', handleGuestRead);
    });

    refreshMastermindBlock();
    mountCircle(document.getElementById('circleContainer'));
    renderCalendarOrStrip(document.getElementById('calendarContainer'));
    initWeatherBlock();

    const goBtn = document.querySelector('.booking-go-btn');
    if (goBtn) {
        goBtn.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            scrollToCalendarAndHighlight();
            log('мне повезёт', true, state.user);
        });
    }

    setupBottomNav();
}

function renderOwnerHome() {
    cleanupProfileOverlays();
    const user = state.user;
    const firstName = user?.first_name || 'друг';
    const v2 = isV2();
    subtitle().textContent = v2 ? '' : greeting(firstName);
    subtitle().classList.remove('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();
    main.innerHTML = `
        ${v2 ? v2HomeTopHtml() + '<div class="card-container" id="calendarContainer"></div><div id="rdMedalsAnchor"></div>' : askBarHtml()}
        ${v2 ? '' : `<div class="card-container" id="cardBlock">
            <img src="${state.userCard.cardUrl}" alt="карта" class="card-image" id="ownerCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">${state.userCard.hikes}</span></div>
            <div style="display: flex; gap: 12px; margin: 0 16px 12px 16px;">
                <a href="#" class="btn btn-yellow" id="privBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">привилегии</a>
                ${cardQrEnabled()
                    ? `<a href="#" class="btn btn-outline" id="cardQrBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">показать QR</a>`
                    : `<a href="#" class="btn btn-outline" id="supportBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">поддержка</a>`}
            </div>
            <button type="button" class="gift-text-link" id="giftCardBtn">подарить карту другу ›</button>
        </div>`}
        <div id="circleContainer"></div>
        ${v2 ? '' : '<div class="card-container" id="calendarContainer"></div>'}
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
        ${renderWeatherBlock()}
        ${/* блок «для новичков» убран у всех (07.11) */ false ? `
        <div class="card-container">
            <h2 class="section-title">для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtn">
                <span class="newcomer-text">как всё устроено</span>
                <img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image">
            </div>
        </div>
        ` : ''}
        <div class="card-container">
            <div class="metrics-header"><h2 class="metrics-title">клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" class="metrics-link dynamic-link" data-url="https://t.me/yaltahiking/148" data-guest="false"><span class="ml-long">смотреть </span>отчёты ›</a></div>
            ${isV2() ? metricsStoryHtml() : `
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${state.metrics.hikes}</div></div>
                <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${state.metrics.locations}</div></div>
                <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${state.metrics.kilometers}</div></div>
                <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${state.metrics.meetings}</div></div>
            </div>`}
        </div>
        ${isV2() ? '' : renderUpdatesBlock()}
        ${isV2() ? '' : renderSafetyBanner()}
        ${renderMakerCredit()}
    `;

    wireSafetyBanner();
    if (v2) wireRdHomeTop(); else wireAskBar();
    fitMastermindScroll();
    document.getElementById('giftCardBtn')?.addEventListener('click', () => {
        haptic();
        openCardSheet({ source: 'главная владельца', gift: true });
    });
    document.getElementById('ownerCardImage')?.addEventListener('click', () => {
        haptic();
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        showConfetti();
        log('карта', false, user);
    });
    document.getElementById('privBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); log('привилегии', false, user); renderPriv(); });
    document.getElementById('cardQrBtn')?.addEventListener('click', (e) => { e.preventDefault(); setUserInteracted(); openCardQr(); });
    document.getElementById('supportBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/hellointelligent', 'поддержка', false); });
    document.getElementById('newcomerBtn')?.addEventListener('click', () => {
        haptic(); setUserInteracted(); log('новичкам', false, user);
        if (isLumenPilotUser(state.user)) openOnboardingChat(null, null, true);
        else renderNewcomerPage(false);
    });

    document.querySelectorAll('.mastermind-read-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            log('мастермайнд', false, state.user);
            const url = link.href;
            const tgApp = window.Telegram?.WebApp;
            if (tgApp) tgApp.openLink(url);
            else window.open(url, '_blank');
        });
    });


    refreshMastermindBlock();
    mountCircle(document.getElementById('circleContainer'));
    renderCalendarOrStrip(document.getElementById('calendarContainer'));
    initWeatherBlock();

    const goBtn = document.querySelector('.booking-go-btn');
    if (goBtn) {
        goBtn.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            scrollToCalendarAndHighlight();
            log('мне повезёт', false, state.user);
        });
    }

    setupBottomNav();
}

// новая главная (редизайн, пока только для isRedesign()): верх – rd-home.js, ниже прежние живые блоки
function renderRdHome() {
    cleanupProfileOverlays();
    subtitle().textContent = '';
    subtitle().classList.remove('subtitle-guest');
    showBottomNav(true);
    const isGuest = state.userCard.status !== 'active';
    const main = mainDiv();
    main.innerHTML = `
        ${rdHomeTopHtml()}
        <div id="circleContainer"></div>
        <div id="rdMedalsAnchor"></div>
        <div class="card-container" id="calendarContainer"></div>
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
        ${renderWeatherBlock()}
        <div class="card-container">
            <div class="metrics-header"><h2 class="metrics-title">клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" class="metrics-link dynamic-link" data-url="https://t.me/yaltahiking/148" data-guest="${isGuest}"><span class="ml-long">смотреть </span>отчёты ›</a></div>
            ${isV2() ? metricsStoryHtml() : `
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${state.metrics.hikes}</div></div>
                <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${state.metrics.locations}</div></div>
                <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${state.metrics.kilometers}</div></div>
                <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${state.metrics.meetings}</div></div>
            </div>`}
        </div>
        ${isV2() ? '' : renderUpdatesBlock()}
        ${isV2() ? '' : renderSafetyBanner()}
        ${renderMakerCredit()}
    `;
    wireRdHomeTop();
    wireSafetyBanner();
    fitMastermindScroll();
    document.querySelectorAll('.mastermind-read-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            log('мастермайнд', isGuest, state.user);
            openLink(link.href, 'мастермайнд', isGuest);
        });
    });
    refreshMastermindBlock();
    mountCircle(document.getElementById('circleContainer'));
    renderCalendarOrStrip(document.getElementById('calendarContainer'));
    initWeatherBlock();
    setupBottomNav();
}

// классика v2 (пока только @maxmolotov): календарь «полоса дней» (day-strip.js) вместо месячного
function renderCalendarOrStrip(el) {
    // развилка «витрина» (Макс) / «события» (остальные v2) / обычный календарь – вся в renderCalendar (calendar.js)
    renderCalendar(el);
}

export function renderHome() {
    setLumenContext({ screen: 'home', scenario: localStorage.getItem('chatOnboardingVisited') ? 'home' : 'first_visit' });
    document.querySelector('.profile-edit-fab')?.remove();
    hideBack();
    if (window._floatingScrollHandler) {
        window.removeEventListener('scroll', window._floatingScrollHandler);
        window._floatingScrollHandler = null;
    }
    const existingPopup = document.getElementById('guestPopup');
    if (existingPopup) existingPopup.remove();

    if (state.userCard.status === 'loading') {
        mainDiv().innerHTML = '<div class="loader" style="display:flex; justify-content:center; padding:40px 0;">Загрузка...</div>';
        showBottomNav(false);
        return;
    }

    updateMetricsUI();

    loadPopups().then(freshPopups => {
        if (freshPopups && Object.keys(freshPopups).length) {
            state.popups = freshPopups;
        }
    }).catch(err => {
        console.warn('Не удалось загрузить попапы при старте:', err);
    });

    applyRedesignFlag();
    if (isRedesign()) {
        renderRdHome();
    } else if (state.userCard.status === 'active' && state.userCard.cardUrl) {
        renderOwnerHome();
    } else {
        renderGuestHome();
    }
    mountAdminEntry();
    mountAdmissionEntry();
    mountMyAchievements();
    maybeShowNewAchievements(); // новые ачивки – поп-ап один раз
}
