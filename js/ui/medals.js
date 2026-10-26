import { state } from '../state.js';
import { loadAchievementCollections } from '../achievements.js';
import { haptic } from '../utils.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let closeViewer = null;

export function medalStripHtml(items, compact = false) {
    return `<div class="medal-strip${compact ? ' is-compact' : ''}">${items.map((a, index) => `<button type="button" class="medal-miniature" data-medal="${index}" aria-label="${esc(a.title)}" title="${esc(a.title)}">
        <img src="${esc(a.medal.imageUrl)}" width="88" height="88" alt="" loading="lazy"><span>${esc(a.title)}</span></button>`).join('')}</div>`;
}

export function wireMedalStrip(host, items) {
    host.querySelectorAll('[data-medal]').forEach(button => button.addEventListener('click', () => {
        haptic(); openMedal(items[Number(button.dataset.medal)]);
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
    } catch { /* The collection never blocks the homepage or exposes a private draft. */ }
}

export async function openMedal(achievement) {
    closeViewer?.();
    if (!achievement?.medal) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = document.createElement('div');
    dialog.className = 'medal-viewer'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', achievement.title);
    dialog.innerHTML = `<button type="button" class="medal-close" aria-label="закрыть медаль" title="закрыть">×</button>
        <div class="medal-stage" role="img" aria-label="объёмная медаль ${esc(achievement.title)}"><span class="medal-loading" role="status">загружаю медаль…</span></div>
        <div class="medal-caption"><h2>${esc(achievement.title)}</h2><div class="medal-view-modes" role="group" aria-label="сторона медали">
            <button type="button" data-side="front" aria-pressed="true">лицо</button><button type="button" data-side="back" aria-pressed="false">оборот</button></div></div>`;
    document.body.appendChild(dialog); document.body.style.overflow = 'hidden';
    const inert = [...document.querySelectorAll('#mainContent, #bottomNav, .header')].map(el => [el, el.inert]);
    inert.forEach(([el]) => { el.inert = true; });
    let scene = null;
    const controller = new AbortController();
    const keydown = e => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') {
            const buttons = [...dialog.querySelectorAll('button:not(:disabled)')].filter(button => button.getClientRects().length);
            const next = (buttons.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
            e.preventDefault(); buttons[next].focus();
        }
    };
    const close = () => {
        controller.abort();
        scene?.dispose(); dialog.remove();
        document.body.style.overflow = previousOverflow;
        inert.forEach(([el, value]) => { el.inert = value; });
        document.removeEventListener('keydown', keydown); window.removeEventListener('pagehide', close);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        if (closeViewer === close) closeViewer = null;
    };
    closeViewer = close;
    dialog.querySelector('.medal-close').onclick = close;
    document.addEventListener('keydown', keydown); window.addEventListener('pagehide', close);
    dialog.querySelector('.medal-close').focus({ preventScroll: true });
    const stage = dialog.querySelector('.medal-stage');
    if (!achievement.medal.modelUrl) {
        stage.innerHTML = `<img class="medal-static" src="${esc(achievement.medal.imageUrl)}" alt="${esc(achievement.title)}">`;
        dialog.querySelector('.medal-view-modes').hidden = true;
        return;
    }
    try {
        // Variable import keeps Three.js out of the initial application bundle.
        const runtimeUrl = '/assets/achievements/medal-runtime-v1.js';
        const runtime = await import(runtimeUrl);
        if (!dialog.isConnected) return;
        scene = await runtime.mountMedalScene(stage, achievement, { signal: controller.signal });
        if (!dialog.isConnected) { scene.dispose(); return; }
        stage.querySelector('.medal-loading')?.remove();
        dialog.querySelectorAll('[data-side]').forEach(button => button.onclick = () => {
            haptic(); scene.showSide(button.dataset.side);
            dialog.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        });
    } catch {
        scene?.dispose();
        if (dialog.isConnected) {
            stage.innerHTML = `<img class="medal-static" src="${esc(achievement.medal.imageUrl)}" alt="${esc(achievement.title)}"><p class="medal-render-error" role="status">3D сейчас недоступно</p>`;
            dialog.querySelector('.medal-view-modes').hidden = true;
        }
    }
}
