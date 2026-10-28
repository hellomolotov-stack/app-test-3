import { state } from '../state.js';
import { loadAchievementCollections, claimAchievements, achievementMeta, achievementsVisible } from '../achievements.js';
import { haptic } from '../utils.js';
import { openAchievementsPopup } from './achievements-popup.js';
import { ACHIEVEMENT_CATALOG, catalogByTitle } from '../achievements-catalog.js';
import { medalForTitle, medalSrc } from '../achievements-medals.js';
import { openAchievementsCollection, visibleEarned } from './achievements-collection.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function medalStripHtml(items, compact = false) {
    return `<div class="medal-strip${compact ? ' is-compact' : ''}">${items.map((a, index) => `<button type="button" class="medal-miniature" data-medal="${index}" aria-label="${esc(a.title)}" title="${esc(a.title)}">
        <img ${medalSrc(a.medal.imageUrl)} width="88" height="88" alt="" loading="lazy"><span>${esc(a.title)}</span></button>`).join('')}</div>`;
}

export function wireMedalStrip(host, items) {
    host.querySelectorAll('[data-medal]').forEach(button => button.addEventListener('click', () => {
        haptic(); openAchievementsPopup(items, { fresh: false, source: 'коллекция медалей', initialIndex: Number(button.dataset.medal) });
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
        // без карты видны три последние полученные, остальные полученные – размытые с замком
        const visible = visibleEarned(items);
        const hidden = items.filter(a => !visible.includes(a));
        // три плитки: полученные значки, а если их меньше трёх – следующие шаги серым; четвёртая – «все значки»
        // на главной – сначала недавно полученные (в разделе и профилях – по ценности)
        const shelf = [...visible].sort((a, b) => (b.grant?.issuedAt || 0) - (a.grant?.issuedAt || 0)).slice(0, 3);
        const owned = new Set(items.map(a => catalogByTitle(a.title)?.id || a.title));
        const nextSteps = FIRST_STEPS.filter(st => !owned.has(st.id)).slice(0, 3 - shelf.length);
        host.innerHTML = `<div class="mya-head"><h2 class="section-title">🎒 мои значки</h2></div>
            ${items.length ? '' : '<p class="mya-sub">собирай значки за хайки, маршруты и моменты на тропе</p>'}
            <div class="mya-shelf">${shelf.map((a, i) => `<button type="button" class="mya-it" data-medal="${i}" aria-label="${esc(a.title)}">
                <span class="mya-pic">${a.seenAt === null ? '<span class="mya-new">new</span>' : ''}<img ${medalSrc(a.medal.imageUrl)} alt="" loading="lazy"></span><span class="mya-name">${esc(a.title)}</span></button>`).join('')}
            ${nextSteps.map(st => { const art = medalForTitle(st.title);
                return `<button type="button" class="mya-it is-next" data-mya-all aria-label="${esc(st.title)}"><span class="mya-pic">${art ? `<img ${medalSrc(art.imageUrl)} alt="" loading="lazy">` : '<b>?</b>'}</span><span class="mya-name">${esc(st.short)}</span></button>`; }).join('')}
            <button type="button" class="mya-it is-all" data-mya-all aria-label="все значки"><span class="mya-pic"><b>${items.length > shelf.length ? `+${items.length - shelf.length}` : '›'}</b></span><span class="mya-name">все значки</span></button></div>
            ${goalsHtml(owned)}
            ${hidden.length ? `<button type="button" class="mya-card-hint" data-mya-card>ещё ${hidden.length} ${hidden.length % 10 === 1 && hidden.length % 100 !== 11 ? 'твой значок скрыт' : hidden.length % 10 >= 2 && hidden.length % 10 <= 4 && (hidden.length % 100 < 10 || hidden.length % 100 >= 20) ? 'твоих значка скрыты' : 'твоих значков скрыты'} – <b>оформи карту интеллигента, чтобы видеть все</b> ›</button>` : ''}`;
        host.hidden = false;
        wireMedalStrip(host, shelf);
        host.querySelectorAll('[data-mya-all]').forEach(b => b.addEventListener('click', () => { haptic(); openAchievementsCollection(items); }));
        host.querySelectorAll('[data-mya-step]').forEach(b => b.addEventListener('click', e => { haptic(); runStep(e.currentTarget.dataset.myaStep); }));
        wireGoals(host);
        host.querySelectorAll('[data-mya-card]').forEach(b => b.addEventListener('click', () => {
            haptic(); import('./card-sheet.js').then(m => m.openCardSheet({ source: 'ачивки на главной' })).catch(() => {});
        }));
    } catch { /* Unavailable collections never block the homepage or expose drafts. */ }
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
// по каким словам название хайка в календаре узнаётся как маршрут значка
const ROUTE_KEYS = { 'route-krestovaya': ['крестов'], 'route-kant': ['кант', 'форос'], 'route-pallasa': ['паллас'], 'route-eklizi': ['эклизи'],
    'route-ilyas': ['ильяс'], 'route-biuk': ['биюк'], 'route-balaklava': ['балаклав', 'айя'], 'route-kanyon': ['каньон', 'черноречен'],
    'route-demerdji': ['демерджи', 'привидени'], 'route-ushchelye': ['уч кош'], 'route-ayudag': ['аю даг'], 'route-massandra': ['массандр'],
    'route-paragilmen': ['парагильмен'], 'route-kushkaya': ['куш ка'], 'route-evrejskaya': ['еврейск'], 'route-biruzovoe': ['бирюзов'],
    'route-tsarskaya': ['царск'], 'route-ai-yori': ['ай йори'], 'at-bash': ['ат баш'] };
const routeTitle = id => id === 'at-bash' ? 'хайк на Ат-Баш' : ACHIEVEMENT_CATALOG.find(a => a.id === id)?.title;
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
        const key = Object.keys(ROUTE_KEYS).find(id => ROUTE_KEYS[id].some(k => normT(h.title).includes(k)));
        const title = key && routeTitle(key);
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
