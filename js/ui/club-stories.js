// js/ui/club-stories.js – сторис клуба: кружки под приветствием и просмотр на весь экран.
// Данные – /api/me (action stories), админка – вкладка «📸 сторис» (admin.js), сервер – lib/club-stories.js.
// Просмотр: тап справа – дальше, слева – назад, удержание – пауза, свайп вниз – закрыть.
import { state } from '../state.js';
import { meCall } from '../net.js';
import { log } from '../api.js';
import { haptic, openLink } from '../utils.js';

const SEEN_KEY = 'clubStoriesSeen';
const DURATION = 7000;
const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAG = { member: 'новый член клуба', badges: 'новые значки', summary: 'новая summary мастермайнда', app: 'новое в приложении', event: 'событие', custom: 'клуб' };
const EMOJI = { member: '🎉', badges: '🏅', summary: '🧠', app: '✨', event: '📅', custom: '⛰️' };
const BG = {
    member: 'radial-gradient(100% 60% at 50% 32%,#1d3a55,#0a1018 72%)',
    badges: 'radial-gradient(100% 60% at 50% 32%,#3a3110,#0a1018 72%)',
    summary: 'radial-gradient(110% 70% at 30% 20%,#3a2a55,#120e1c 75%)',
    app: 'radial-gradient(100% 60% at 50% 30%,#123a4a,#0a1018 72%)',
    event: 'radial-gradient(100% 60% at 50% 30%,#4a2412,#0a1018 72%)',
    custom: 'radial-gradient(100% 60% at 50% 30%,#1e2b0e,#0a1018 72%)',
};

let stories = [];
const seenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } };
function markSeen(id) {
    try { const s = seenSet(); s.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300))); } catch (e) {}
}
const isSeen = s => s.seen || seenSet().has(s.id);
const imgUrl = u => (u && u.startsWith('/') ? u : u && !/^https?:/.test(u) ? '/' + u : u);
// в кружке – картинка (карта, значок) или эмодзи типа
function thumb(s) {
    if (s.type === 'summary') return `<span class="cst-pic cst-plaud"></span>`;
    if (s.image && s.type !== 'app') return `<span class="cst-pic" style="background-image:url('${esc(imgUrl(s.image))}')${s.type === 'badges' ? ';background-size:82%;background-color:#16222e' : ''}"></span>`;
    return `<span class="cst-pic cst-emoji" style="background:${BG[s.type] || BG.custom}">${EMOJI[s.type] || '⛰️'}</span>`;
}
const label = s => { const t = String(s.title || '').replace(/\s[–—-]\s.*$/, '').replace(/^новые значки · /, ''); return t.length > 24 ? t.slice(0, 23) + '…' : t; };

function rowHtml() {
    const seen = seenSet();
    // непросмотренные – первыми
    const list = [...stories].sort((a, b) => (isSeen(a) ? 1 : 0) - (isSeen(b) ? 1 : 0));
    return `<div class="cst-row">${list.map(s => {
        const fresh = !(s.seen || seen.has(s.id));
        return `<button type="button" class="cst${fresh ? ' is-new' : ''}" data-cst="${esc(s.id)}"><span class="cst-ring">${thumb(s)}${fresh ? '<span class="cst-nb">NEW</span>' : ''}</span><span class="cst-lab">${esc(label(s))}</span></button>`;
    }).join('')}</div>`;
}

// вставить ленту в host; пока данных нет (или их нет вовсе) – остаётся то, что там было
export async function mountClubStories(host) {
    if (!host) return;
    try {
        const r = await meCall('stories', {}, 8000);
        stories = (r && r.stories) || [];
    } catch (e) { return; }
    if (!stories.length || !host.isConnected) return;
    host.innerHTML = rowHtml();
    host.classList.add('cst-host');
    mountClicks(host);
}
function mountClicks(host) {
    host.querySelectorAll('[data-cst]').forEach(b => b.addEventListener('click', () => {
        const list = [...host.querySelectorAll('[data-cst]')].map(x => stories.find(s => s.id === x.dataset.cst)).filter(Boolean);
        openStories(list, list.findIndex(s => s.id === b.dataset.cst), () => { host.innerHTML = rowHtml(); mountClicks(host); });
    }));
}

function visual(s) {
    const img = imgUrl(s.image);
    if (s.type === 'member' && img) return `<div class="csv-stage"><img class="csv-cardimg" src="${esc(img)}" alt=""></div>`;
    if (s.type === 'badges' && img) return `<div class="csv-stage"><div class="csv-halo"></div><img class="csv-badge" src="${esc(img)}" alt=""></div>`;
    if (s.type === 'app' && img) return `<div class="csv-stage"><div class="csv-phone"><img src="${esc(img)}" alt=""></div></div>`;
    if (s.type === 'summary') return `<div class="csv-stage"><div class="csv-plaud-halo"></div><img class="csv-plaud" src="assets/plaud.webp" alt=""></div>`;
    if (img) return `<div class="csv-cover" style="background-image:url('${esc(img)}')"></div>`;
    return `<div class="csv-stage"><div class="csv-big">${EMOJI[s.type] || '⛰️'}</div></div>`;
}
function ago(ts) {
    const h = Math.floor((Date.now() - Number(ts || 0)) / 3600000);
    if (h < 1) return 'только что';
    if (h < 24) return `${h} ч`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'вчера' : `${d} дн`;
}

async function runAction(action) {
    const a = String(action || '');
    if (a.startsWith('url:')) return openLink(a.slice(4), 'сторис', state.userCard?.status !== 'active');
    if (a.startsWith('mm:')) { const m = await import('./mm-reader.js'); return m.openMmReader(a.slice(3)); }
    if (a === 'card') {
        if (state.userCard?.status === 'active') { const m = await import('./privileges.js'); return m.renderPriv(); }
        const m = await import('./card-sheet.js'); return m.openCardSheet({ source: 'сторис' });
    }
    if (a === 'hike') {
        const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
        const i = (state.hikesWithTitle || []).map((h, k) => [h, k]).filter(([h]) => h.date >= today && h.title && !/^(yes|true)$/i.test(String(h.cancelled || ''))).sort((x, y) => x[0].date.localeCompare(y[0].date))[0]?.[1];
        if (i !== undefined) { const m = await import('./calendar.js'); return m.showBottomSheet(i); }
        return document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth' });
    }
    if (a === 'badges') return (document.getElementById('myAchievements') || document.getElementById('rdMedalsAnchor'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (a === 'calendar') return document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth' });
    if (a === 'circle') { const m = await import('./circle.js'); return m.openCircleSheet(); }
}

// просмотр; preview: true – из админки, без отметок о просмотре
export function openStories(list, start = 0, onClose = null, { preview = false } = {}) {
    if (!list.length) return;
    document.querySelectorAll('.csv-overlay').forEach(o => o.remove());
    let i = Math.max(0, start), t0 = 0, elapsed = 0, paused = false, raf = 0;
    const ov = document.createElement('div');
    ov.className = 'csv-overlay';
    // в полноэкранном Telegram сверху его кнопки «закрыть» и «⋯» – полоски и шапку ставим ниже них
    const tgw = window.Telegram?.WebApp;
    // нет данных от Telegram (браузер) – отступ системной «чёлки»
    const top = tgw?.isFullscreen ? (tgw.safeAreaInset?.top || 0) + (tgw.contentSafeAreaInset?.top || 0) : 0;
    ov.style.setProperty('--csv-top', top ? `${top}px` : 'env(safe-area-inset-top)');
    ov.innerHTML = `<div class="csv-bars">${list.map(() => '<i><b></b></i>').join('')}</div><div class="csv-body"></div>`;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    const bars = [...ov.querySelectorAll('.csv-bars b')];
    const body = ov.querySelector('.csv-body');

    const show = () => {
        const s = list[i];
        bars.forEach((b, k) => { b.style.width = k < i ? '100%' : '0%'; });
        body.innerHTML = `
            <div class="csv-bg" style="background:${BG[s.type] || BG.custom}"></div>
            ${visual(s)}
            <div class="csv-shade"></div>
            <div class="csv-head"><span class="csv-av"></span><b>интеллигенция</b><span>· ${ago(s.date)}</span><button type="button" class="csv-x" aria-label="закрыть">✕</button></div>
            <div class="csv-text"><span class="csv-tag csv-t-${esc(s.type)}"><i></i>${esc(TAG[s.type] || 'клуб')}</span><h2>${esc(s.title)}</h2>${s.text ? `<p>${esc(s.text)}</p>` : ''}
                ${s.button ? `<button type="button" class="csv-btn">${esc(s.button.label)}</button>` : ''}</div>`;
        elapsed = 0; t0 = performance.now();
        if (!preview) {
            markSeen(s.id);
            if (!s.seen) { s.seen = true; meCall('story_view', { id: s.id }).catch(() => {}); }
            log('сторис: открыл', state.userCard?.status !== 'active', state.user, { id: s.id, type: s.type });
        }
    };
    const close = () => {
        cancelAnimationFrame(raf);
        ov.classList.add('is-out');
        ov.style.pointerEvents = 'none';
        document.body.style.overflow = '';
        setTimeout(() => ov.remove(), 220);
        onClose?.();
    };
    const go = d => {
        if (i + d >= list.length) return close();
        i = Math.max(0, i + d); show();
    };
    const tick = now => {
        if (!paused) {
            const p = Math.min(1, (elapsed + now - t0) / DURATION);
            bars[i].style.width = (p * 100) + '%';
            if (p >= 1) { go(1); }
        }
        raf = requestAnimationFrame(tick);
    };
    const pause = on => {
        if (on === paused) return;
        if (on) elapsed += performance.now() - t0; else t0 = performance.now();
        paused = on;
        ov.classList.toggle('is-paused', on);
    };

    let sx = 0, sy = 0, st = 0, holdTimer = 0, held = false;
    ov.addEventListener('pointerdown', e => {
        if (e.target.closest('.csv-btn, .csv-x')) return;
        sx = e.clientX; sy = e.clientY; st = Date.now(); held = false;
        holdTimer = setTimeout(() => { held = true; pause(true); }, 220);
    });
    ov.addEventListener('pointermove', e => {
        const dy = e.clientY - sy;
        if (st && dy < 0 && list[i].button) body.style.transform = `translateY(${Math.max(dy, -120) * .25}px)`;
        else if (st && dy > 0) body.style.transform = `translateY(${dy * .6}px) scale(${1 - Math.min(dy, 300) / 2000})`;
    });
    ov.addEventListener('pointerup', e => {
        clearTimeout(holdTimer);
        if (!st) return;
        const dy = e.clientY - sy, dx = e.clientX - sx;
        st = 0; body.style.transform = '';
        if (held) { pause(false); return; }
        if (dy > 90) return close();
        // свайп вверх – то же, что кнопка внизу («потяни вверх»)
        if (dy < -70 && list[i].button) { ov.querySelector('.csv-btn')?.click(); return; }
        if (Math.abs(dx) > 50) { haptic(); return go(dx < 0 ? 1 : -1); }
        if (Math.abs(dx) + Math.abs(dy) > 12) return;
        haptic();
        go(e.clientX < window.innerWidth * .33 ? -1 : 1);
    });
    ov.addEventListener('pointercancel', () => { clearTimeout(holdTimer); st = 0; body.style.transform = ''; pause(false); });
    ov.addEventListener('click', e => {
        if (e.target.closest('.csv-x')) { haptic(); close(); return; }
        const b = e.target.closest('.csv-btn');
        if (b) {
            haptic();
            const s = list[i];
            if (!preview) log('сторис: кнопка', state.userCard?.status !== 'active', state.user, { id: s.id, action: s.button?.action });
            close();
            if (!preview) setTimeout(() => runAction(s.button?.action), 260);
        }
    });
    show();
    raf = requestAnimationFrame(tick);
}
