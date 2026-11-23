// js/ui/pull-refresh.js – «потяни вниз, чтобы обновить» на главной.
// Тянешь от самого верха – сверху выезжает логотип; отпустил дальше порога – главная
// перезапрашивает свои данные (/api/me: карта, записи) и перерисовывается. Работает только на главной
// (#calendarContainer в #mainContent) и когда не открыта шторка/оверлей.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { refreshClubMetrics } from '../club-content.js';

const MAX = 110, TRIGGER = 72;
let el = null, startY = 0, pull = 0, active = false, busy = false;

function topInset() {
    const t = window.Telegram?.WebApp;
    return (t?.safeAreaInset?.top || 0) + (t?.contentSafeAreaInset?.top || 0);
}
function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'ptr';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<img src="/assets/logo-hiking.png" alt="" width="140" height="55" draggable="false">';
    document.body.appendChild(el);
    return el;
}
function onHome(target) {
    const main = document.getElementById('mainContent');
    if (!main || !main.querySelector('#calendarContainer')) return false;
    if (!target || !main.contains(target)) return false;
    if (document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden') return false;
    return !document.querySelector('.bottom-sheet.active, .bottom-sheet.open, .cs-overlay, .mmr-sheet, .adm, .cst-viewer');
}
function paint() {
    const e = ensureEl();
    const p = Math.min(pull, MAX);
    e.style.transition = '';
    e.style.top = `${topInset() + 8}px`;
    e.style.transform = `translate(-50%, ${p - 50}px)`;
    e.style.opacity = String(Math.min(1, p / TRIGGER));
    e.classList.toggle('is-ready', p >= TRIGGER);
}
function reset() {
    if (!el) return;
    el.classList.remove('is-ready');
    el.style.transition = 'transform .25s ease, opacity .25s ease';
    el.style.transform = 'translate(-50%, -50px)';
    el.style.opacity = '0';
    setTimeout(() => { if (el) el.style.transition = ''; }, 260);
}

async function refreshHome() {
    await refreshClubMetrics().catch(e => console.warn('metrics refresh:', e.message));
    const tg = window.Telegram?.WebApp;
    try {
        if (tg?.initData) {
            const r = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData }), signal: AbortSignal.timeout(8000) });
            const me = r.ok ? await r.json() : null;
            if (me && me.card && String(me.uid) === String(state.user?.id)) {
                state.userCard = me.card;
                state._userRegs = me.regs || {};
            }
        }
    } catch (e) { console.warn('pull refresh', e); }
    try { localStorage.removeItem('cstCache'); } catch (e) {}
    try { (await import('./club-stories.js')).resetClubStories(); } catch (e) {}
    const { renderHome } = await import('./home.js');
    renderHome();
}

export function initPullRefresh() {
    if (window.__ptrInit) return;
    window.__ptrInit = true;
    window.addEventListener('touchstart', e => {
        if (busy || e.touches.length !== 1 || window.scrollY > 0 || !onHome(e.target)) { active = false; return; }
        ensureEl();
        active = true; startY = e.touches[0].clientY; pull = 0;
    }, { passive: true });
    window.addEventListener('touchmove', e => {
        if (!active) return;
        const dy = e.touches[0].clientY - startY;
        if (dy <= 0 || window.scrollY > 0) { if (pull) { pull = 0; paint(); } return; }
        const was = pull >= TRIGGER;
        pull = dy * 0.5; // сопротивление
        paint();
        if (!was && pull >= TRIGGER) haptic('light');
    }, { passive: true });
    window.addEventListener('touchcancel', () => {
        if (!active) return;
        active = false;
        pull = 0;
        reset();
    }, { passive: true });
    window.addEventListener('touchend', async () => {
        if (!active) return;
        active = false;
        if (pull < TRIGGER) { pull = 0; reset(); return; }
        busy = true;
        const e = ensureEl();
        e.style.transition = 'transform .2s ease';
        e.style.transform = `translate(-50%, ${TRIGGER - 50}px)`;
        haptic('medium');
        const t0 = Date.now();
        await refreshHome().catch(() => {});
        await new Promise(r => setTimeout(r, Math.max(0, 700 - (Date.now() - t0))));
        pull = 0; busy = false; reset();
    });
}
