import { state } from '../state.js';
import { loadAchievementCollections } from '../achievements.js';
import { haptic } from '../utils.js';
import { openAchievementsPopup } from './achievements-popup.js';

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
        if (!items.length) return;
        host.innerHTML = `<h2 class="section-title">мои достижения</h2>${medalStripHtml(items)}`;
        host.hidden = false;
        wireMedalStrip(host, items);
    } catch { /* Unavailable collections never block the homepage or expose drafts. */ }
}

export function openMedal(achievement) {
    if (achievement?.medal) openAchievementsPopup([achievement], { fresh: false, source: 'медаль участника' });
}
