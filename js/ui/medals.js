import { state } from '../state.js';
import { loadAchievementCollections, claimAchievements, achievementMeta, achievementsVisible } from '../achievements.js';
import { haptic } from '../utils.js';
import { openAchievementsPopup } from './achievements-popup.js';
import { catalogByTitle } from '../achievements-catalog.js';
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
        const shelf = visible.slice(0, 3);
        const owned = new Set(items.map(a => catalogByTitle(a.title)?.id || a.title));
        const nextSteps = FIRST_STEPS.filter(st => !owned.has(st.id)).slice(0, 3 - shelf.length);
        host.innerHTML = `<div class="mya-head"><h2 class="section-title">🏅 мои значки</h2></div>
            ${items.length ? '' : '<p class="mya-sub">собирай значки за хайки, маршруты и моменты на тропе</p>'}
            <div class="mya-shelf">${shelf.map((a, i) => `<button type="button" class="mya-it" data-medal="${i}" aria-label="${esc(a.title)}">
                <span class="mya-pic">${a.seenAt === null ? '<span class="mya-new">new</span>' : ''}<img ${medalSrc(a.medal.imageUrl)} alt="" loading="lazy"></span><span class="mya-name">${esc(a.title)}</span></button>`).join('')}
            ${nextSteps.map(st => { const art = medalForTitle(st.title);
                return `<button type="button" class="mya-it is-next" data-mya-all aria-label="${esc(st.title)}"><span class="mya-pic">${art ? `<img ${medalSrc(art.imageUrl)} alt="" loading="lazy">` : '<b>?</b>'}</span><span class="mya-name">${esc(st.short)}</span></button>`; }).join('')}
            <button type="button" class="mya-it is-all" data-mya-all aria-label="все значки"><span class="mya-pic"><b>${items.length > shelf.length ? `+${items.length - shelf.length}` : '›'}</b></span><span class="mya-name">все значки</span></button></div>
            ${(items.length < 3 && nextStepHtml(owned)) || nextGoalHtml(items)}
            ${hidden.length ? `<button type="button" class="mya-card-hint" data-mya-card>ещё ${hidden.length} ${hidden.length % 10 === 1 && hidden.length % 100 !== 11 ? 'твой значок скрыт' : hidden.length % 10 >= 2 && hidden.length % 10 <= 4 && (hidden.length % 100 < 10 || hidden.length % 100 >= 20) ? 'твоих значка скрыты' : 'твоих значков скрыты'} – <b>оформи карту интеллигента, чтобы видеть все</b> ›</button>` : ''}`;
        host.hidden = false;
        wireMedalStrip(host, shelf);
        host.querySelectorAll('[data-mya-all]').forEach(b => b.addEventListener('click', () => { haptic(); openAchievementsCollection(items); }));
        host.querySelector('[data-mya-step]')?.addEventListener('click', e => { haptic(); runStep(e.currentTarget.dataset.myaStep); });
        host.querySelectorAll('[data-mya-card]').forEach(b => b.addEventListener('click', () => {
            haptic(); import('./card-sheet.js').then(m => m.openCardSheet({ source: 'ачивки на главной' })).catch(() => {});
        }));
    } catch { /* Unavailable collections never block the homepage or expose drafts. */ }
}

// первые шаги: стартовый значок выдаётся сам при входе, дальше – первый хайк и сторис с хайка.
// на главной подсказка показывает ближайший не полученный шаг и кнопку, которая ведёт туда, где он делается
const FIRST_STEPS = [
    { id: 'welcome', title: 'добро пожаловать', short: 'добро пожаловать' },
    { id: 'first-hike', title: 'первый хайк с интеллигенцией', short: 'первый хайк', hint: 'запишись на ближайший хайк', action: 'hike', button: 'записаться' },
    { id: 'story', title: 'показал горы в сторис', short: 'горы в сторис', hint: 'поделись хайком в сторис – кнопка в «мои записи»', action: 'story', button: 'поделиться' },
];
function nextStepHtml(owned) {
    // кто уже ходил с клубом, тому «первый хайк» не предлагаем, даже если значок ещё не выдан
    const hiked = (achievementMeta().progress?.hikes || 0) > 0;
    const st = FIRST_STEPS.find(x => x.action && !owned.has(x.id) && !(x.id === 'first-hike' && hiked));
    if (!st) return '';
    const art = medalForTitle(st.title);
    return `<div class="mya-goal mya-step">${art ? `<img ${medalSrc(art.imageUrl)} alt="" loading="lazy">` : '<i class="mya-goal-blank"></i>'}
        <div><b>следующий – «${esc(st.short)}»</b><small>${esc(st.hint)}</small></div>
        <button type="button" class="mya-step-go" data-mya-step="${st.action}">${esc(st.button)} ›</button></div>`;
}
function runStep(action) {
    if (action === 'hike') {
        // как кнопка бота «ближайший хайк»: шторка ближайшего хайка, иначе – календарь
        const today = new Date().toISOString().slice(0, 10);
        const idx = (state.hikesWithTitle || []).findIndex(h => h.date >= today && h.cancelled !== true && h.city !== true && h.city !== 'yes' && h.book_club !== true);
        if (idx >= 0) import('./calendar.js').then(m => m.showBottomSheet(idx)).catch(() => {});
        else document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    const target = document.querySelector('.bk-story-btn') ? document.getElementById('userBookingsCard') : document.getElementById('calendarContainer');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// «почти получено»: ближайшая медаль за число хайков
const HIKE_GOALS = [[1, 'первый хайк с интеллигенцией'], [5, '5 хайков'], [10, '10 хайков'], [20, '20 хайков'], [30, '30 хайков'], [50, '50 хайков']];
const hikesWord = n => n % 10 === 1 && n % 100 !== 11 ? 'хайк' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'хайка' : 'хайков';
function nextGoalHtml(items) {
    const progress = achievementMeta().progress;
    // у гостей хайки до приложения не записаны – прогресс был бы неверным, показываем только владельцам карты
    if (!progress || !progress.member) return '';
    const owned = new Set(items.map(a => catalogByTitle(a.title)?.id || a.title));
    const goal = HIKE_GOALS.find(([min, title]) => min > progress.hikes && !owned.has(catalogByTitle(title)?.id || title));
    if (!goal) return '';
    const [min, title] = goal, left = min - progress.hikes, art = medalForTitle(title);
    return `<div class="mya-goal">${art ? `<img ${medalSrc(art.imageUrl)} alt="" loading="lazy">` : '<i class="mya-goal-blank"></i>'}
        <div><b>ещё ${left} ${hikesWord(left)} до «${esc(title)}»</b><span class="mya-goal-bar"><i style="width:${Math.round(progress.hikes / min * 100)}%"></i></span>
        <small>${progress.hikes} из ${min}</small></div></div>`;
}

export function openMedal(achievement) {
    if (achievement?.medal) openAchievementsPopup([achievement], { fresh: false, source: 'медаль участника' });
}
