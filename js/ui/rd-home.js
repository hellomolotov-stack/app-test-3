// Верх новой главной (редизайн, пока только для html.rd):
// шапка с маленькой картой, «свежее в клубе», карточка ближайшего события с теми, кто идёт.
// Всё ниже (связи, календарь, саммари, погода, цифры) – прежние блоки в новых стилях.
import { state } from '../state.js';
import { haptic, openLink, parseLinks } from '../utils.js';
import { log } from '../api.js';
import { isUpcomingHike, moscowDateKey } from '../hike-timing.js';
import { capacityFor, isPostponed, fetchGoingFromServer, showBottomSheet, snapshotHikeMap, nextTeaser, isWaitlisted, toggleTeaserNotify } from './calendar.js';
import { renderPriv } from './privileges.js';
import { isV2 } from '../redesign.js';
import { hikingBoxEnabled, hikingBoxRowHtml, bindHikingBoxRow } from './hiking-box.js';
import { openCardSheet } from './card-sheet.js';
import { setRdGlow } from '../redesign.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const GRADS = [['#F6B26B', '#E06666'], ['#6FA8DC', '#3D85C6'], ['#93C47D', '#38761D'], ['#C27BA0', '#741B47'], ['#FFD966', '#BF9000'], ['#8E7CC3', '#351C75']];
const yes = v => v === true || String(v).toLowerCase() === 'yes';
const plural = (n, a, b, c) => { const x = n % 10, y = n % 100; return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 12 || y > 14) ? b : c; };
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'участник';
const dayDiff = date => Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(moscowDateKey() + 'T12:00:00Z')) / 86400000);

function eventKind(h) {
    if (isPostponed(h)) return 'rain';
    if (yes(h.city)) return 'city';
    if (yes(h.woman)) return 'woman';
    return 'hike';
}

function whenLabel(h) {
    const d = dayDiff(h.date);
    const t = h.start_time ? ` · ${h.start_time}` : '';
    if (d === 0) return h.start_time ? `сегодня в ${h.start_time}` : 'сегодня';
    if (d === 1) return h.start_time ? `завтра в ${h.start_time}` : 'завтра';
    if (d > 1 && d < 7) return `через ${d} ${plural(d, 'день', 'дня', 'дней')}${t}`;
    const dt = new Date(h.date + 'T12:00:00');
    return `${WD_SHORT[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]}${t}`;
}

function nextEvent() {
    const list = state.hikesWithTitle || [];
    for (let i = 0; i < list.length; i++) {
        const h = list[i];
        if (!yes(h.cancelled) && !yes(h.book_club) && isUpcomingHike(h)) return { hike: h, index: i };
    }
    return null;
}

// ---------- «свежее в клубе» ----------
const SEEN_KEY = 'rdSeenStories';
function seenSet() { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } }
function markSeen(key) {
    try { const s = seenSet(); s.add(key); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200))); } catch (e) {}
}

const ICONS = {
    news: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z"/>',
    letter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    report: '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
    talk: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
};
const STORY_BG = { news: 'linear-gradient(135deg,#3B4A12,#1A200A)', letter: 'linear-gradient(135deg,#F3E3C3,#C9A66B)', report: 'linear-gradient(135deg,#3E5A6E,#1B2A36)', talk: 'linear-gradient(135deg,#3A2A55,#1A1524)' };
const STORY_FG = { news: '#D9FD19', letter: '#5A3E14', report: '#CFE3F0', talk: '#C7B8E6' };

// подпись под кружком – начало новости до тире или первые слова
function storyLabel(text) {
    const t = String(text || '').replace(/^(в приложении|теперь|сделали|добавили|запустили)\s+/i, '').split(/\s[–—-]\s|[,.:]/)[0].trim();
    const words = t.split(/\s+/).slice(0, 4).join(' ');
    return words.length > 26 ? words.slice(0, 25) + '…' : words || 'новое';
}

function buildStories() {
    const today = moscowDateKey();
    const out = [];
    const recent = d => d && dayDiff(String(d).slice(0, 10)) >= -21 && String(d).slice(0, 10) <= today;
    (state.updates || []).filter(u => recent(u.date)).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 2)
        .forEach(u => out.push({ key: 'u:' + u.date + ':' + String(u.update).slice(0, 24), kind: 'news', label: storyLabel(u.update), text: u.update, date: u.date }));
    // последний прошедший хайк: письмо и отчёт
    const past = (state.hikesWithTitle || []).filter(h => h.date < today && !yes(h.city) && !yes(h.cancelled)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (past && /^https?:\/\//.test(String(past.letter_link || ''))) out.push({ key: 'l:' + past.date, kind: 'letter', label: 'письмо Макса', link: past.letter_link, date: past.date });
    if (past && /^https?:\/\//.test(String(past.report_link || ''))) out.push({ key: 'r:' + past.date, kind: 'report', label: 'отчёт: ' + String(past.title).replace(/^хайк (на|по|в)\s+/i, ''), link: past.report_link, date: past.date });
    const sums = [...(state.mastermindSummaries || [])].filter(s => s && s.link).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (sums[0]) out.push({ key: 's:' + sums[0].date, kind: 'talk', label: 'саммари', link: sums[0].link, date: sums[0].date, text: sums[0].title });
    return out;
}

function storiesHtml(stories) {
    if (!stories.length) return '';
    const seen = seenSet();
    const unread = stories.filter(s => !seen.has(s.key)).length;
    return `
        <div class="rd-fresh">
            <div class="rd-fresh-head"><span>свежее в клубе</span>${unread ? `<b>${unread}</b>` : ''}</div>
            <div class="rd-stories">
                ${stories.map((s, i) => `
                    <button type="button" class="rd-story${seen.has(s.key) ? '' : ' is-new'}" data-story="${i}">
                        <span class="rd-story-ring"><span class="rd-story-pic" style="background:${STORY_BG[s.kind]};color:${STORY_FG[s.kind]}">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[s.kind]}</svg>
                        </span></span>
                        <span class="rd-story-label">${esc(s.label)}</span>
                    </button>`).join('')}
            </div>
        </div>`;
}

function openStory(s) {
    haptic();
    markSeen(s.key);
    log('rd: свежее', state.userCard.status !== 'active', state.user, { kind: s.kind });
    if (s.link) { openLink(s.link, s.label, state.userCard.status !== 'active'); return; }
    const ov = document.createElement('div');
    ov.className = 'rd-story-overlay';
    const dt = new Date(String(s.date).slice(0, 10) + 'T12:00:00');
    ov.innerHTML = `<div class="rd-story-card" role="dialog" aria-label="${esc(s.label)}">
        <span class="rd-story-date">${dt.getDate()} ${MONTHS[dt.getMonth()]}</span>
        <p>${parseLinks(esc(s.text), state.userCard.status !== 'active')}</p>
        <button type="button" class="rd-story-close">понятно</button></div>`;
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.rd-story-close')) ov.remove(); });
    document.body.appendChild(ov);
}

// ---------- карточка ближайшего события ----------
function heroHtml(ev) {
    if (!ev) return '';
    const h = ev.hike;
    const kind = eventKind(h);
    const tags = (Array.isArray(h.tags) ? h.tags : []).slice(0, 4);
    // обложка – наше фото с этого маршрута (assets/teaser), не схема трека; маршрута нет в фото – любой пейзаж клуба
    const img = `assets/teaser/${heroPhotoFor(h.title)}.webp`;
    const booked = state.hikeBookingStatus?.[ev.index] === true;
    return `
        <div class="rd-hero is-${kind}" id="rdHero" data-index="${ev.index}">
            <div class="rd-hero-cover" id="rdHeroCover">
                ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
                <span class="rd-hero-when"><i></i>${esc(whenLabel(h))}</span>
                ${booked && isV2() ? '<span class="rd-ok">✓ ты записан</span>' : ''}
            </div>
            <div class="rd-hero-body">
                <span class="rd-hero-title">${esc(h.title)}</span>
                ${tags.length ? `<div class="rd-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
                <div class="rd-going" id="rdGoing"><span class="rd-going-wait">смотрю, кто идёт…</span></div>
                ${booked && isV2() ? ticketHtml(ev) : `<button type="button" class="rd-cta" id="rdHeroCta">${booked ? 'ты идёшь · детали' : 'подробнее и запись'}</button>`}
            </div>
        </div>`;
}

// записан (классика v2): блок хайка = билет – действия из «моих записей», бокс к хайку, «ещё запись»
function otherBookings(ev) {
    const t = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    return (state.hikesWithTitle || []).map((h, i) => ({ h, i }))
        .filter(({ h, i }) => i !== ev.index && state.hikeBookingStatus?.[i] === true && h.date >= t && !yes(h.cancelled))
        .sort((a, b) => a.h.date.localeCompare(b.h.date));
}
function ticketHtml(ev) {
    const h = ev.hike;
    const city = yes(h.city) || yes(h.book_club);
    const owner = state.userCard?.status === 'active';
    const more = otherBookings(ev)[0];
    const md = more ? new Date(more.h.date + 'T12:00:00') : null;
    return `${!city && hikingBoxEnabled(h.date) ? `<div class="rd-box" data-box-date="${h.date}">${hikingBoxRowHtml('', h.date)}</div>` : ''}
        ${more ? `<button type="button" class="rd-more" data-more="${more.i}"><span>ещё запись</span><b>${md.getDate()} ${MONTHS[md.getMonth()]} · ${esc(more.h.title)} ›</b></button>` : ''}`;
}

function avatarHtml(p, i) {
    const g = GRADS[i % GRADS.length];
    const photo = String(p.photoUrl || '');
    return `<span class="rd-av" style="background:linear-gradient(135deg,${g[0]},${g[1]})">${photo ? `<img src="${esc(photo)}" alt="" onerror="this.remove()">` : ''}${esc(firstName(p.name)[0] || '?').toUpperCase()}</span>`;
}

function agoLabel(ts) {
    const h = Math.max(1, Math.floor((Date.now() - Number(ts)) / 3600000));
    if (h < 24) return `${h} ч назад`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'вчера' : `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
}

function fillGoing(ev, list) {
    const box = document.getElementById('rdGoing');
    if (!box) return;
    const h = ev.hike;
    const me = String(state.user?.id || '');
    const people = (Array.isArray(list) ? list : []).filter(p => p && p.userId);
    const cap = capacityFor(h);
    const n = people.length;
    const left = Math.max(0, cap - n);
    const others = people.filter(p => String(p.userId) !== me);
    const names = others.slice(0, 2).map(p => esc(firstName(p.name)));
    const rest = others.length - names.length;
    const latest = others.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
    const showSeats = !yes(h.city) || Number(h.capacity) > 0;
    box.innerHTML = n ? `
        <div class="rd-going-row">
            <span class="rd-avs">${others.slice(0, 4).map(avatarHtml).join('')}</span>
            <span class="rd-going-text">${names.length ? `<b>${names.join(', ')}</b>` : ''}${rest > 0 ? `<br><span>и ещё ${rest} ${plural(rest, 'идёт', 'идут', 'идут')}</span>` : names.length ? '<br><span>уже идут</span>' : ''}</span>
            ${showSeats ? `<span class="rd-going-n">${n} / ${cap}</span>` : ''}
        </div>
        ${latest?.timestamp ? `<div class="rd-live"><i></i>новая запись: ${esc(latest.name)} · ${agoLabel(latest.timestamp)}</div>` : ''}
        ${showSeats ? `<div class="rd-seats"><span style="width:${Math.min(100, Math.round(n / cap * 100))}%"></span></div><div class="rd-seats-note">${left ? `осталось ${left} ${plural(left, 'место', 'места', 'мест')}` : 'мест нет – можно в лист ожидания'}</div>` : ''}`
        : `<div class="rd-live"><i></i>запись открыта – будь первым</div>`;
}

function mountCover(h) {
    const cover = document.getElementById('rdHeroCover');
    if (!cover || cover.querySelector('img')) return;
    // 3D-рельеф маршрута тем же снимком, что и для сторис; без трека – остаётся градиент
    setTimeout(() => {
        snapshotHikeMap(h, { width: 390, height: 230, ratio: 2, colorful: true }).then(canvas => {
            if (!canvas || !cover.isConnected) return;
            canvas.className = 'rd-hero-map';
            cover.prepend(canvas);
        }).catch(() => {});
    }, 700);
}

// ---------- сборка ----------
export function rdHomeTopHtml({ stories = true, teaser = false, mini = true, hero = true, between = '' } = {}) {
    const user = state.user;
    const now = new Date();
    const owner = state.userCard.status === 'active';
    const cardImg = owner && state.userCard.cardUrl ? state.userCard.cardUrl : 'assets/card-front.jpg';
    const ev = nextEvent();
    setRdGlow(ev ? eventKind(ev.hike) : 'hike');
    return `
        <div class="rd-head">
            <div class="rd-head-text">
                <span class="rd-date">${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}</span>
                <span class="rd-hello">привет, ${esc(user?.first_name || 'друг')}</span>
            </div>
            ${mini ? '' : '<!--'}<button type="button" class="rd-mini-card${owner ? '' : ' is-guest'}" id="rdMiniCard" aria-label="${owner ? 'моя карта интеллигента' : 'карта интеллигента'}">
                ${owner ? `<img src="${esc(cardImg)}" alt="">
                <span>${Number(state.userCard.hikes || 0)}</span>`
                : `<span class="rd-mc"><img class="mc-grey" src="assets/card-grey.png" alt=""><i class="mb" style="background-image:url('assets/card-front.jpg')"></i><i class="g1" style="background-image:url('assets/card-front.jpg')"></i><i class="g2" style="background-image:url('assets/card-front.jpg')"></i><i class="g3"></i></span><span class="rd-q">?</span>`}
            </button>${mini ? '' : '-->'}
        </div>
        ${stories ? `<div id="clubStoriesHost">${storiesHtml(buildStories())}</div>` : '<div id="clubStoriesHost"></div>'}
        ${between}
        ${!hero ? '' : ev ? heroHtml(ev) : (teaser ? teaserHtml() : '')}`;
}

// классический дизайн v2: только шапка с мини-картой и ближайший хайк (без «свежего» и свечения)
export function v2HomeTopHtml() { return rdHomeTopHtml({ stories: false, teaser: true }); }
// гость в v2: в углу мини-карта с глитчем (нажатие – слайдер покупки), большого блока с картой на главной нет
export function v2GuestTopHtml(cardHtml = '') { return rdHomeTopHtml({ stories: false, teaser: true, between: cardHtml }); }

// хайка с названием пока нет – компактная плашка «готовим хайк» с тумблером.
// Тумблер – постоянная подписка (localStorage hikeAlertsOn): пока включён, человек подписан на открытие записи
// каждой будущей даты-заглушки (тот же лист ожидания hike_waitlist, бот пишет при публикации хайка).
const ALERTS_KEY = 'hikeAlertsOn';
const MON3 = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function alertsOn() { try { return localStorage.getItem(ALERTS_KEY) === '1'; } catch (e) { return false; } }
// пейзажи с хайков клуба без людей (assets/teaser, отобраны из «Хайкинг интеллигенция фото»); при каждом заходе – новое
const TEASER_PHOTOS = [
    ['ayudag-1', 'на Аю-Даг'], ['ayudag-2', 'на Аю-Даг'], ['ayudag-3', 'на Аю-Даг'],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [`demerdzhi-${n}`, 'на Демерджи']),
    ['eklizi-1', 'на Эклизи-Бурун'], ['eklizi-3', 'на Эклизи-Бурун'], ['eklizi-5', 'на Эклизи-Бурун'],
    ['kant-1', 'на Кант'],
    ...[1, 2, 3, 4].map(n => [`krestovaya-${n}`, 'на Крестовую гору']),
    ['tsarskaya-1', 'по Царской тропе'], ['tsarskaya-2', 'по Царской тропе'], ['tsarskaya-4', 'по Царской тропе'],
];
const ROUTE_KEYS = [['ayudag', /аю.?даг/i], ['demerdzhi', /демерд/i], ['eklizi', /эклизи|чатыр/i], ['kant', /кант/i], ['krestovaya', /крестов/i], ['tsarskaya', /царск/i]];
const heroPhotos = {};
export function heroPhotoFor(title) {
    if (heroPhotos[title]) return heroPhotos[title];
    const key = (ROUTE_KEYS.find(([, re]) => re.test(String(title || ''))) || [])[0];
    const pool = TEASER_PHOTOS.map(([f]) => f).filter(f => !key || f.startsWith(key + '-'));
    return (heroPhotos[title] = pool[Math.floor(Math.random() * pool.length)]);
}
let teaserPhoto = null; // одна картинка на заход – перерисовки главной её не меняют
function pickTeaserPhoto() {
    if (teaserPhoto) return teaserPhoto;
    let last = '';
    try { last = localStorage.getItem('teaserPhotoLast') || ''; } catch (e) {}
    const pool = TEASER_PHOTOS.filter(([f]) => f !== last);
    teaserPhoto = pool[Math.floor(Math.random() * pool.length)];
    try { localStorage.setItem('teaserPhotoLast', teaserPhoto[0]); } catch (e) {}
    return teaserPhoto;
}

function teaserHtml() {
    const t = nextTeaser();
    if (!t) return '';
    const d = new Date(t.date + 'T12:00:00');
    const on = alertsOn() || isWaitlisted(t.date);
    const [file, where] = pickTeaserPhoto();
    return `
        <div class="card-container v2-tg" id="v2Teaser">
            <div class="v2-tg-photo" style="background-image:url('assets/teaser/${file}.webp')"><span>фото с хайка ${esc(where)}</span></div>
            <div class="v2-tg-row">
                <div class="v2-tg-date"><b>${d.getDate()}</b><small>${MON3[d.getMonth()]}</small></div>
                <div class="v2-tg-text"><b>готовим хайк</b><span id="v2TgSub">${on ? 'сообщим, когда откроется запись' : 'включи, чтобы узнать об открытии записи'}</span></div>
                <button type="button" class="v2-tg-sw${on ? ' is-on' : ''}" id="v2TeaserBtn" data-date="${t.date}" role="switch" aria-checked="${on}" aria-label="уведомлять об открытии записи"></button>
            </div>
        </div>`;
}

export function wireRdHomeTop() {
    // сторис клуба (js/ui/club-stories.js) заменяют «свежее в клубе», когда есть опубликованные
    const csHost = document.getElementById('clubStoriesHost');
    if (csHost) import('./club-stories.js').then(m => m.mountClubStories(csHost)).catch(e => console.error(e));
    const owner = state.userCard.status === 'active';
    const ev = nextEvent();
    document.getElementById('rdMiniCard')?.addEventListener('click', () => {
        haptic();
        log('rd: мини-карта', !owner, state.user);
        if (owner) renderPriv();
        else openCardSheet({ source: 'главная (новый дизайн)', hikeDate: ev?.hike.date, hikeTitle: ev?.hike.title });
    });
    const stories = buildStories();
    document.querySelectorAll('.rd-story').forEach(btn => btn.addEventListener('click', () => {
        const s = stories[Number(btn.dataset.story)];
        if (!s) return;
        btn.classList.remove('is-new');
        openStory(s);
    }));
    const tb = document.getElementById('v2TeaserBtn');
    if (tb) {
        const date = tb.dataset.date;
        // тумблер включён, а на эту дату ещё не подписан (новая заглушка) – подписываем тихо
        if (alertsOn() && !isWaitlisted(date)) toggleTeaserNotify(date).catch(() => {});
        tb.addEventListener('click', async () => {
            haptic();
            const want = !tb.classList.contains('is-on');
            tb.classList.toggle('is-on', want); tb.setAttribute('aria-checked', want);
            document.getElementById('v2TgSub').textContent = want ? 'сообщим, когда откроется запись' : 'включи, чтобы узнать об открытии записи';
            try { localStorage.setItem(ALERTS_KEY, want ? '1' : '0'); } catch (e) {}
            log(want ? 'главная: уведомления о хайках – вкл' : 'главная: уведомления о хайках – выкл', !owner, state.user, { date });
            if (isWaitlisted(date) !== want) {
                const now = await toggleTeaserNotify(date).catch(() => isWaitlisted(date));
                if (now !== want) {
                    tb.classList.toggle('is-on', now); tb.setAttribute('aria-checked', now);
                    document.getElementById('v2TgSub').textContent = now ? 'сообщим, когда откроется запись' : 'включи, чтобы узнать об открытии записи';
                    try { localStorage.setItem(ALERTS_KEY, now ? '1' : '0'); } catch (e) {}
                }
            }
        });
    }
    if (!ev) return;
    const open = () => { haptic(); log('rd: ближайшее событие', !owner, state.user, { date: ev.hike.date }); showBottomSheet(ev.index); };
    document.getElementById('rdHeroCta')?.addEventListener('click', open);
    // записан: вся карточка открывает шторку хайка (кроме строки бокса и «ещё запись»)
    const heroEl = document.getElementById('rdHero');
    if (heroEl && heroEl.querySelector('.rd-ok')) heroEl.addEventListener('click', e => {
        if (e.target.closest('.rd-box, .rd-more')) return;
        open();
    });
    const boxEl = document.querySelector('#rdHero .rd-box');
    if (boxEl) bindHikingBoxRow(boxEl.querySelector('.hb-row'), boxEl.dataset.boxDate, 'билет на главной');
    document.querySelector('#rdHero .rd-more')?.addEventListener('click', e => { haptic(); showBottomSheet(Number(e.currentTarget.dataset.more)); });
    document.getElementById('rdHeroCover')?.addEventListener('click', open);
    fetchGoingFromServer([ev.hike.date]).then(([list]) => fillGoing(ev, list)).catch(() => fillGoing(ev, []));
}
