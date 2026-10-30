import { state } from '../state.js';
import { loadAchievementCollections, claimAchievements, achievementMeta, achievementsVisible, isWaiting, metalOf, isCardHolder, sortByValue } from '../achievements.js';
import { haptic } from '../utils.js';
import { openAchievementsPopup } from './achievements-popup.js';
import { catalogByTitle, routeBadgeForHike } from '../achievements-catalog.js';
import { medalForTitle, medalSrc } from '../achievements-medals.js';
import { openAchievementsCollection } from './achievements-collection.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function medalStripHtml(items, compact = false) {
    return `<div class="medal-strip${compact ? ' is-compact' : ''}">${items.map((a, index) => `<button type="button" class="medal-miniature" data-medal="${index}" aria-label="${esc(a.title)}" title="${esc(a.title)}">
        <img ${medalSrc(a.medal.imageUrl)} width="88" height="88" alt="" loading="lazy"><span>${esc(a.title)}</span></button>`).join('')}</div>`;
}

// all – все значки человека: в окне появится серая «смотреть все» (слайдер по всем значкам)
// owner – имя, если это значки другого участника (из профилей)
export function wireMedalStrip(host, items, all = null, owner = '') {
    host.querySelectorAll('[data-medal]').forEach(button => button.addEventListener('click', () => {
        haptic(); openAchievementsPopup(items, { fresh: false, source: owner ? 'значки участника' : 'коллекция медалей', initialIndex: Number(button.dataset.medal), all, owner });
    }));
}

export async function mountMyAchievements() {
    const card = document.getElementById('cardBlock');
    const userId = String(state.user?.id || '');
    if (!card || !userId || document.getElementById('myAchievements') || !achievementsVisible()) return;
    const host = document.createElement('section');
    host.id = 'myAchievements'; host.className = 'card-container achievements-home'; host.hidden = true;
    card.after(host);
    try {
        // сначала авто-ачивки (по хайкам и карте) – не дольше 4 с, чтобы блок не ждал
        await Promise.race([claimAchievements(), new Promise(r => setTimeout(r, 4000))]);
        const data = await loadAchievementCollections([userId]);
        if (!host.isConnected || String(state.user?.id || '') !== userId) return;
        const items = data[userId] || [];
        // без карты легендарные и эпические «ждут активации»: в цвете, со свечением и замком
        const waiting = items.filter(isWaiting);
        rememberWaiting(userId, items);
        // три плитки: полученные значки, а если их меньше трёх – следующие шаги серым; четвёртая – «все значки»
        // на главной – сначала недавно полученные (в разделе и профилях – по ценности)
        const shelf = [...items].sort((a, b) => (b.grant?.issuedAt || 0) - (a.grant?.issuedAt || 0)).slice(0, 3);
        const owned = new Set(items.map(a => catalogByTitle(a.title)?.id || a.title));
        const nextSteps = FIRST_STEPS.filter(st => !owned.has(st.id)).slice(0, 3 - shelf.length);
        host.innerHTML = `<div class="mya-head"><h2 class="section-title">🎒 мои значки</h2></div>
            ${items.length ? '' : '<p class="mya-sub">собирай значки за хайки, маршруты и моменты на тропе</p>'}
            <div class="mya-shelf">${shelf.map((a, i) => { const w = isWaiting(a) ? metalOf(a) : '';
                return `<button type="button" class="mya-it${w ? ` is-wait is-${w}` : ''}" data-medal="${i}" aria-label="${esc(a.title)}">
                <span class="mya-pic">${a.seenAt === null ? '<span class="mya-new">new</span>' : ''}<img ${medalSrc(a.medal.imageUrl)} alt="" loading="lazy">${w ? '<b class="wait-lock">🔒</b>' : ''}</span><span class="mya-name">${esc(a.title)}</span></button>`; }).join('')}
            ${nextSteps.map(st => { const art = medalForTitle(st.title);
                return `<button type="button" class="mya-it is-next" data-mya-all aria-label="${esc(st.title)}"><span class="mya-pic">${art ? `<img ${medalSrc(art.imageUrl)} alt="" loading="lazy">` : '<b>?</b>'}</span><span class="mya-name">${esc(st.short)}</span></button>`; }).join('')}
            <button type="button" class="mya-it is-all" data-mya-all aria-label="все значки"><span class="mya-pic"><b>${items.length > shelf.length ? `+${items.length - shelf.length}` : '›'}</b></span><span class="mya-name">все значки</span></button></div>
            ${goalsHtml(owned)}
            ${waiting.length ? `<button type="button" class="mya-wait" data-mya-card><span class="mya-wait-stack">${waiting.slice(0, 3).map(a => `<img ${medalSrc(a.medal.imageUrl)} alt="" class="is-glow-${metalOf(a)}">`).join('')}</span>
                <span><b>${waiting.length} ${plural(waiting.length, 'значок ждёт', 'значка ждут', 'значков ждут')} активации</b><small>откроются с картой интеллигента</small></span><i>›</i></button>` : ''}`;
        host.hidden = false;
        wireMedalStrip(host, shelf, sortByValue([...items]));
        host.querySelectorAll('[data-mya-all]').forEach(b => b.addEventListener('click', () => { haptic(); openAchievementsCollection(items); }));
        host.querySelectorAll('[data-mya-step]').forEach(b => b.addEventListener('click', e => { haptic(); runStep(e.currentTarget.dataset.myaStep); }));
        wireGoals(host);
        host.querySelectorAll('[data-mya-card]').forEach(b => b.addEventListener('click', () => {
            haptic(); import('./card-sheet.js').then(m => m.openCardSheet({ source: 'значки ждут активации' })).catch(() => {});
        }));
        showActivated(userId, items);
    } catch { /* Unavailable collections never block the homepage or expose drafts. */ }
}

const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
// значки, ждавшие активации, запоминаем в браузере; когда человек стал владельцем карты – показываем их разом:
// «открыто N значков» (сам «владелец карты интеллигента» выдаётся автоматически и попадает туда же как новый)
const waitKey = id => `ach_waiting_${id}`;
function rememberWaiting(userId, items) {
    if (isCardHolder()) return;
    try { localStorage.setItem(waitKey(userId), JSON.stringify(items.filter(isWaiting).map(a => a.id))); } catch { /* storage is optional */ }
}
function showActivated(userId, items) {
    if (!isCardHolder()) return;
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem(waitKey(userId)) || '[]'); localStorage.removeItem(waitKey(userId)); } catch { return; }
    const opened = items.filter(a => ids.includes(a.id) || (a.seenAt === null && catalogByTitle(a.title)?.id === 'card-owner'));
    if (!opened.length || !ids.length) return;
    const n = opened.length;
    setTimeout(() => openAchievementsPopup(opened, { fresh: true, source: 'карта активировала значки',
        title: `открыто <b>${n} ${plural(n, 'значок', 'значка', 'значков')}</b>` }), 900);
}
// первые шаги – серые плитки на полке, пока значков меньше трёх
const FIRST_STEPS = [
    { id: 'welcome', title: 'добро пожаловать', short: 'добро пожаловать' },
    { id: 'first-hike', title: 'первый хайк с интеллигенцией', short: 'первый хайк' },
    { id: 'story', title: 'показал горы в сторис', short: 'горы в сторис' },
];
// «следующий значок»: одна строка под полкой, листается свайпом – до трёх целей, которые реально взять скоро.
// порядок: маршрут ближайшего хайка, где человек ещё не был → значок за число хайков, если до него 1–2 →
// первый хайк (новичкам) → сторис → +1 (владельцам карты) → встреча в городе. 50 хайков «через год» не показываем.
const normT = t => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'–—-]/g, ' ').replace(/\s+/g, ' ').trim();
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dayLabel = d => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const HIKE_GOALS = [[5, '5 хайков'], [10, '10 хайков'], [20, '20 хайков'], [30, '30 хайков'], [50, '50 хайков']];
const hikesWord = n => n % 10 === 1 && n % 100 !== 11 ? 'хайк' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'хайка' : 'хайков';
const isTrailHike = h => h.cancelled !== true && h.city !== true && h.city !== 'yes' && h.book_club !== true;

function nearestGoals(owned) {
    const goals = [];
    const today = new Date().toISOString().slice(0, 10);
    const progress = achievementMeta().progress;
    const hiked = (progress?.hikes || 0) > 0;
    const ownedTitles = new Set([...owned].map(normT));
    // 1. маршрут ближайшего хайка, значка которого ещё нет
    const hikes = (state.hikesWithTitle || []).map((h, index) => ({ ...h, index })).filter(h => h.date >= today && isTrailHike(h));
    for (const h of hikes.slice(0, 4)) {
        const title = routeBadgeForHike(h.title);
        const key = title && (catalogByTitle(title)?.id || title);
        if (!title || owned.has(key) || ownedTitles.has(normT(title))) continue;
        const booked = !!state.hikeBookingStatus?.[h.index];
        goals.push({ title, sub: `${booked ? 'ты записан' : 'новый маршрут'} · ${dayLabel(h.date)}`, action: `hike:${h.index}`, button: booked ? 'открыть' : 'записаться' });
        break;
    }
    // 2. значок за число хайков – только если до него 1–2 хайка (прогресс точный у владельцев карты)
    if (progress?.member) {
        const next = HIKE_GOALS.find(([min, t]) => min > progress.hikes && !owned.has(catalogByTitle(t)?.id));
        const left = next ? next[0] - progress.hikes : 0;
        if (next && left <= 2) goals.push({ title: next[1], sub: `ещё ${left} ${hikesWord(left)} до значка`, action: 'hike', button: 'записаться' });
    }
    // 3. быстрые: первый хайк новичку, сторис, +1 владельцу карты, встреча в городе
    if (!hiked && !owned.has('first-hike')) goals.push({ title: 'первый хайк с интеллигенцией', sub: 'запишись на ближайший хайк', action: 'hike', button: 'записаться' });
    if (!owned.has('story')) goals.push({ title: 'показал горы в сторис', sub: 'поделись хайком · 1 минута', action: 'story', button: 'поделиться' });
    if (state.userCard?.status === 'active' && !owned.has('plus-one')) goals.push({ title: 'привёл своего +1', sub: 'позови друга на хайк', action: 'hike', button: 'позвать' });
    if (!owned.has('first-city-event')) goals.push({ title: 'свои в городе', sub: 'приди на встречу клуба в городе', action: 'city', button: 'смотреть' });
    return goals.slice(0, 3);
}
function goalsHtml(owned) {
    const goals = nearestGoals(owned);
    if (!goals.length) return '';
    return `<div class="mya-next"><div class="mya-next-track">${goals.map(g => { const art = medalForTitle(g.title);
        return `<div class="mya-next-it">${art ? `<img ${medalSrc(art.imageUrl)} alt="" loading="lazy">` : '<i class="mya-goal-blank"></i>'}
            <div><b>${esc(g.title)}</b><small>${esc(g.sub)}</small></div>
            <button type="button" class="mya-step-go" data-mya-step="${esc(g.action)}">${esc(g.button)} ›</button></div>`; }).join('')}</div>
        ${goals.length > 1 ? `<div class="mya-next-dots">${goals.map((_, i) => `<i${i ? '' : ' class="is-on"'}></i>`).join('')}</div>` : ''}</div>`;
}
function wireGoals(host) {
    const track = host.querySelector('.mya-next-track');
    const dots = host.querySelectorAll('.mya-next-dots i');
    if (!track || !dots.length) return;
    track.addEventListener('scroll', () => {
        const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        dots.forEach((d, k) => d.classList.toggle('is-on', k === i));
    }, { passive: true });
}
function runStep(action) {
    const [kind, arg] = action.split(':');
    if (kind === 'hike') {
        // конкретный хайк – его шторка; иначе ближайший хайк, как кнопка бота
        const today = new Date().toISOString().slice(0, 10);
        const idx = arg != null ? Number(arg) : (state.hikesWithTitle || []).findIndex(h => h.date >= today && isTrailHike(h));
        if (idx >= 0) import('./calendar.js').then(m => m.showBottomSheet(idx)).catch(() => {});
        else document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    const target = kind === 'story' && document.querySelector('.bk-story-btn') ? document.getElementById('userBookingsCard') : document.getElementById('calendarContainer');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function openMedal(achievement) {
    if (achievement?.medal) openAchievementsPopup([achievement], { fresh: false, source: 'медаль участника' });
}
