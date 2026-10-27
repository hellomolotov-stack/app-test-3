import { state } from '../state.js';
import { loadAchievementCollections, claimAchievements, achievementMeta } from '../achievements.js';
import { haptic } from '../utils.js';
import { openAchievementsPopup } from './achievements-popup.js';
import { CLUB_ACHIEVEMENTS, catalogByTitle, tierOf } from '../achievements-catalog.js';
import { medalForTitle } from '../achievements-medals.js';
import { openAchievementsCollection, visibleEarned } from './achievements-collection.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function medalStripHtml(items, compact = false) {
    return `<div class="medal-strip${compact ? ' is-compact' : ''}">${items.map((a, index) => `<button type="button" class="medal-miniature" data-medal="${index}" aria-label="${esc(a.title)}" title="${esc(a.title)}">
        <img src="${esc(a.medal.imageUrl)}" width="88" height="88" alt="" loading="lazy"><span>${esc(a.title)}</span></button>`).join('')}</div>`;
}

export function wireMedalStrip(host, items) {
    host.querySelectorAll('[data-medal]').forEach(button => button.addEventListener('click', () => {
        haptic(); openAchievementsPopup(items, { fresh: false, source: 'коллекция медалей', initialIndex: Number(button.dataset.medal) });
    }));
}

export async function mountMyAchievements() {
    const card = document.getElementById('cardBlock');
    const userId = String(state.user?.id || '');
    if (!card || !userId || document.getElementById('myAchievements')) return;
    const host = document.createElement('section');
    host.id = 'myAchievements'; host.className = 'card-container achievements-home'; host.hidden = true;
    card.after(host);
    try {
        // сначала авто-ачивки (по хайкам и карте) – не дольше 4 с, чтобы блок не ждал
        await Promise.race([claimAchievements(), new Promise(r => setTimeout(r, 4000))]);
        const data = await loadAchievementCollections([userId]);
        if (!host.isConnected || String(state.user?.id || '') !== userId) return;
        const items = data[userId] || [];
        // блок видят все, у кого есть ачивки, и владельцы карты – им «замочки» показывают, что собирать
        if (!items.length && state.userCard?.status !== 'active') return;
        const total = CLUB_ACHIEVEMENTS.length + items.filter(a => !catalogByTitle(a.title)).length;
        // без карты видны три последние полученные, остальные полученные – размытые с замком
        const visible = visibleEarned(items);
        const hidden = items.slice(visible.length);
        const locks = Math.min(Math.max(0, total - items.length), items.length ? 2 : 4);
        host.innerHTML = `<div class="mya-head"><h2 class="section-title">🏅 мои ачивки</h2><button type="button" class="mya-all" data-mya-all>все ›</button></div>
            <div class="mya-shelf">${visible.map((a, i) => `<button type="button" class="mya-it" data-medal="${i}" aria-label="${esc(a.title)}">
                <span class="mya-pic">${a.seenAt === null ? '<span class="mya-new">new</span>' : ''}<img src="${esc(a.medal.imageUrl)}" alt="" loading="lazy"></span><span class="mya-name">${esc(a.title)}</span></button>`).join('')}
            ${hidden.map(a => `<button type="button" class="mya-it is-hidden" data-mya-card aria-label="ачивка откроется с картой"><span class="mya-pic"><img src="${esc(a.medal.imageUrl)}" alt="" loading="lazy"><b>🔒</b></span><span class="mya-name">с картой</span></button>`).join('')}
            ${Array.from({ length: locks }, () => '<div class="mya-it is-lock" aria-hidden="true"><span class="mya-pic"><b>🔒</b></span><span class="mya-name">???</span></div>').join('')}</div>
            ${tierCountsHtml(items, total)}
            ${nextGoalHtml(items)}
            ${hidden.length ? `<button type="button" class="mya-card-hint" data-mya-card>ещё ${hidden.length} ${hidden.length === 1 ? 'твоя ачивка скрыта' : 'твоих ачивки скрыты'} – <b>оформи карту интеллигента, чтобы видеть все</b> ›</button>` : ''}`;
        host.hidden = false;
        wireMedalStrip(host, visible);
        host.querySelector('[data-mya-all]')?.addEventListener('click', () => { haptic(); openAchievementsCollection(items); });
        host.querySelectorAll('[data-mya-card]').forEach(b => b.addEventListener('click', () => {
            haptic(); import('./card-sheet.js').then(m => m.openCardSheet({ source: 'ачивки на главной' })).catch(() => {});
        }));
    } catch { /* Unavailable collections never block the homepage or expose drafts. */ }
}

// счётчик по уровням: серебро · золото · фиолет
function tierCountsHtml(items, total) {
    const n = { common: 0, rare: 0, very: 0 };
    items.forEach(a => { n[tierOf(catalogByTitle(a.title)?.rarity || a.rarity)]++; });
    return `<div class="mya-tiers"><span class="is-common"><i></i>${n.common}</span><span class="is-rare"><i></i>${n.rare}</span><span class="is-very"><i></i>${n.very}</span>
        <small>${items.length} из ${total}</small></div>`;
}
// «почти получено»: ближайшая медаль за число хайков
const HIKE_GOALS = [[1, 'первый хайк с интеллигенцией'], [5, '5 хайков'], [10, '10 хайков'], [25, '25 хайков'], [50, '50 хайков']];
const hikesWord = n => n % 10 === 1 && n % 100 !== 11 ? 'хайк' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'хайка' : 'хайков';
function nextGoalHtml(items) {
    const progress = achievementMeta().progress;
    if (!progress) return '';
    const owned = new Set(items.map(a => catalogByTitle(a.title)?.id || a.title));
    const goal = HIKE_GOALS.find(([min, title]) => min > progress.hikes && !owned.has(catalogByTitle(title)?.id || title));
    if (!goal) return '';
    const [min, title] = goal, left = min - progress.hikes, art = medalForTitle(title);
    return `<div class="mya-goal">${art ? `<img src="${esc(art.imageUrl)}" alt="" loading="lazy">` : '<i class="mya-goal-blank"></i>'}
        <div><b>ещё ${left} ${hikesWord(left)} до «${esc(title)}»</b><span class="mya-goal-bar"><i style="width:${Math.round(progress.hikes / min * 100)}%"></i></span>
        <small>${progress.hikes} из ${min}${progress.member ? '' : ' · считаем прошедшие хайки, на которые ты записывался'}</small></div></div>`;
}

export function openMedal(achievement) {
    if (achievement?.medal) openAchievementsPopup([achievement], { fresh: false, source: 'медаль участника' });
}
