import { state } from '../state.js';
import { loadAchievementCollections } from '../achievements.js';
import { haptic } from '../utils.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rarityNames = { common: 'базовая', rare: 'редкая', legendary: 'легендарная', mythical: 'мифическая' };
const medalCount = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'медаль' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'медали' : 'медалей'}`;
let closeViewer = null;

export function medalStripHtml(items, compact = false) {
    return `<div class="medal-strip${compact ? ' is-compact' : ''}">${items.slice(0, 3).map((a, index) => `<button type="button" class="medal-miniature" data-medal="${index}" aria-label="${esc(a.title)}" title="${esc(a.title)}">
        <img src="${esc(a.medal.imageUrl)}" width="64" height="64" alt="" loading="lazy"></button>`).join('')}
        ${compact && items.length > 3 ? `<button type="button" class="medal-more" data-medal-all aria-label="все медали, ещё ${items.length - 3}" title="все медали">+${items.length - 3}</button>` : ''}</div>`;
}

export function wireMedalStrip(host, items) {
    host.querySelectorAll('[data-medal]').forEach(button => button.addEventListener('click', () => {
        haptic(); openMedals(items, Number(button.dataset.medal));
    }));
    host.querySelectorAll('[data-medal-all]').forEach(button => button.addEventListener('click', () => {
        haptic(); openMedals(items);
    }));
}

export async function mountCardMedals() {
    const card = document.getElementById('cardBlock');
    const userId = String(state.user?.id || '');
    if (!card || !userId || card.querySelector('.card-medals')) return;
    const host = document.createElement('div');
    host.className = 'card-medals'; host.hidden = true;
    card.appendChild(host);
    try {
        const data = await loadAchievementCollections([userId]);
        if (!host.isConnected || String(state.user?.id || '') !== userId) return;
        const items = data[userId] || [];
        if (!items.length) return;
        host.innerHTML = `<div class="card-medals-head"><span>${medalCount(items.length)}</span><button type="button" data-medal-all aria-label="развернуть все медали" title="развернуть">все <span aria-hidden="true">↗</span></button></div>${medalStripHtml(items)}`;
        host.hidden = false;
        wireMedalStrip(host, items);
    } catch { /* Unavailable collections never block the card or expose drafts. */ }
}

export function openMedal(achievement) { openMedals([achievement], 0); }

export function openMedals(input, initialIndex = null) {
    const items = input.filter(a => a?.medal?.imageUrl);
    if (!items.length) return;
    closeViewer?.(true);
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const overlay = document.createElement('div');
    overlay.className = 'hb-overlay medals-overlay';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'медали');
    overlay.innerHTML = `<div class="hb-sheet medals-sheet"><div class="cs-grab hb-grab"></div>
        <header class="medals-head"><button type="button" class="medals-collection-btn" aria-label="все медали" title="все медали">▦</button><h2>медали</h2><button type="button" class="medals-close" aria-label="закрыть медали" title="закрыть">×</button></header>
        <div class="hb-scroll medals-scroll"></div></div>`;
    const telegram = window.Telegram?.WebApp;
    const inset = (telegram?.safeAreaInset?.top || 0) + (telegram?.contentSafeAreaInset?.top || 0);
    overlay.querySelector('.medals-sheet').style.top = (inset ? inset + 14 : 40) + 'px';
    document.body.appendChild(overlay); document.body.style.overflow = 'hidden';
    const inert = [...document.querySelectorAll('#mainContent, #bottomNav, .header')].map(el => [el, el.inert]);
    inert.forEach(([el]) => { el.inert = true; });
    let closed = false, cleaned = false, timer, index = Number.isInteger(initialIndex) ? Math.max(0, Math.min(initialIndex, items.length - 1)) : null;
    const content = overlay.querySelector('.medals-scroll');
    const collectionButton = overlay.querySelector('.medals-collection-btn');
    const closeButton = overlay.querySelector('.medals-close');
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true; clearTimeout(timer);
        overlay.remove(); document.body.style.overflow = previousOverflow;
        inert.forEach(([el, value]) => { el.inert = value; });
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        if (closeViewer === close) closeViewer = null;
    };
    const close = (immediate = false) => {
        if (closed) { if (immediate) cleanup(); return; }
        closed = true; overlay.classList.remove('is-on');
        document.removeEventListener('keydown', keydown); window.removeEventListener('pagehide', pagehide);
        if (immediate) cleanup(); else timer = setTimeout(cleanup, 360);
    };
    const pagehide = () => close(true);
    const move = delta => {
        if (index === null || items.length < 2) return;
        haptic(); index = (index + delta + items.length) % items.length; render();
    };
    const keydown = event => {
        if (event.key === 'Escape') close();
        if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
        if (event.key === 'Tab') {
            const buttons = [...overlay.querySelectorAll('button:not(:disabled)')].filter(b => b.getClientRects().length);
            const next = (buttons.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
            event.preventDefault(); buttons[next].focus();
        }
    };
    function render() {
        const focusAction = document.activeElement?.dataset.medalMove;
        collectionButton.disabled = index === null;
        content.scrollTop = 0;
        if (index === null) {
            content.innerHTML = `<div class="medals-total">${medalCount(items.length)}</div><div class="medals-grid">${items.map((a, i) => `<button type="button" class="medals-grid-item" data-open-medal="${i}"><img src="${esc(a.medal.imageUrl)}" alt="" loading="lazy" width="240" height="240"><span>${esc(a.title)}</span></button>`).join('')}</div>`;
            content.querySelectorAll('[data-open-medal]').forEach(button => button.onclick = () => {
                haptic(); index = Number(button.dataset.openMedal); render(); collectionButton.focus({ preventScroll: true });
            });
        } else {
            const a = items[index];
            const date = /^\d{4}-\d{2}-\d{2}$/.test(a.grant?.date || '') ? a.grant.date.split('-').reverse().join('.') : '';
            content.innerHTML = `<div class="medal-large"><img src="${esc(a.medal.imageUrl)}" alt="${esc(a.title)}" width="900" height="900" draggable="false"></div>
                <div class="medal-detail" aria-live="polite"><span class="medal-rarity" data-rarity="${esc(a.rarity)}">${esc(rarityNames[a.rarity] || '')}</span><h3>${esc(a.title)}</h3>${a.description ? `<p class="medal-description">${esc(a.description)}</p>` : ''}<p>${esc([a.grant?.name, date].filter(Boolean).join(' · '))}</p></div>
                ${items.length > 1 ? `<nav class="medals-pager" aria-label="листать медали"><button type="button" data-medal-move="-1" aria-label="предыдущая медаль" title="предыдущая">←</button><span>${index + 1} / ${items.length}</span><button type="button" data-medal-move="1" aria-label="следующая медаль" title="следующая">→</button></nav>` : ''}`;
            content.querySelectorAll('[data-medal-move]').forEach(button => button.onclick = () => move(Number(button.dataset.medalMove)));
            if (focusAction) content.querySelector(`[data-medal-move="${focusAction}"]`)?.focus({ preventScroll: true });
            if (items.length > 1) { const next = new Image(); next.src = items[(index + 1) % items.length].medal.imageUrl; }
        }
    }
    let start = null;
    content.addEventListener('touchstart', event => {
        start = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    content.addEventListener('touchcancel', () => { start = null; }, { passive: true });
    content.addEventListener('touchend', event => {
        if (!start || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
        start = null;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) move(dx < 0 ? 1 : -1);
    }, { passive: true });
    collectionButton.onclick = () => { haptic(); index = null; render(); closeButton.focus({ preventScroll: true }); };
    closeButton.onclick = () => { haptic(); close(); };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', keydown); window.addEventListener('pagehide', pagehide);
    closeViewer = close;
    render(); closeButton.focus({ preventScroll: true });
    overlay.getBoundingClientRect();
    requestAnimationFrame(() => { if (!closed) overlay.classList.add('is-on'); });
}
