import { state } from '../state.js';
import { loadAchievementCollections } from '../achievements.js';
import { haptic } from '../utils.js';
import { openAchievementsPopup } from './achievements-popup.js';
import { CLUB_ACHIEVEMENTS } from '../achievements-catalog.js';

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
        const data = await loadAchievementCollections([userId]);
        if (!host.isConnected || String(state.user?.id || '') !== userId) return;
        const items = data[userId] || [];
        // блок видят все, у кого есть ачивки, и владельцы карты – им «замочки» показывают, что собирать
        if (!items.length && state.userCard?.status !== 'active') return;
        const total = Math.max(CLUB_ACHIEVEMENTS.length, items.length);
        const locks = Math.min(Math.max(0, total - items.length), items.length ? 2 : 4);
        host.innerHTML = `<div class="mya-head"><h2 class="section-title">🏅 мои ачивки</h2>${items.length ? '<button type="button" class="mya-all" data-mya-all>все ›</button>' : ''}</div>
            <div class="mya-shelf">${items.map((a, i) => `<button type="button" class="mya-it" data-medal="${i}" aria-label="${esc(a.title)}">
                <span class="mya-pic">${a.seenAt === null ? '<span class="mya-new">new</span>' : ''}<img src="${esc(a.medal.imageUrl)}" alt="" loading="lazy"></span><span class="mya-name">${esc(a.title)}</span></button>`).join('')}
            ${Array.from({ length: locks }, () => '<div class="mya-it is-lock" aria-hidden="true"><span class="mya-pic"><b>🔒</b></span><span class="mya-name">???</span></div>').join('')}</div>
            <div class="mya-prog"><i style="width:${Math.round(items.length / total * 100)}%"></i></div>
            <div class="mya-cap">${items.length ? `${items.length} из ${total} ачивок клуба` : `первая ачивка – за первый хайк с клубом · всего ${total}`}</div>`;
        host.hidden = false;
        wireMedalStrip(host, items);
        host.querySelector('[data-mya-all]')?.addEventListener('click', () => {
            haptic(); openAchievementsPopup(items, { fresh: false, source: 'мои ачивки: все' });
        });
    } catch { /* Unavailable collections never block the homepage or expose drafts. */ }
}

export function openMedal(achievement) {
    if (achievement?.medal) openAchievementsPopup([achievement], { fresh: false, source: 'медаль участника' });
}
