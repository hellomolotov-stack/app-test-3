// js/ui/club-stories.js – сторис клуба: кружки под приветствием и просмотр на весь экран.
// Данные – /api/me (action stories), админка – вкладка «📸 сторис» (admin.js), сервер – lib/club-stories.js.
// Просмотр: тап справа – дальше, слева – назад, удержание – пауза, свайп вниз – закрыть.
import { state } from '../state.js';
import { meCall } from '../net.js';
import { log } from '../api.js';
import { haptic, openLink, openLetterLink } from '../utils.js';
import { openCardSheet } from './card-sheet.js';

const SEEN_KEY = 'clubStoriesSeen';
const DURATION = 7000;
const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAG = { member: 'новый член клуба', badges: 'новые значки', summary: 'новая саммари', letter: 'новое письмо', app: 'обновление', event: 'событие', custom: 'клуб' };
const EMOJI = { member: '🎉', badges: '🏅', summary: '🧠', letter: '✉️', app: '💫', event: '📅', custom: '⛰️' };
const BG = {
    member: 'radial-gradient(ellipse 130% 90% at 50% 28%,#1d3a55 0%,#132639 42%,#0a1018 100%)',
    badges: 'radial-gradient(ellipse 130% 90% at 50% 28%,#3a3110 0%,#232317 42%,#0a1018 100%)',
    summary: 'radial-gradient(ellipse 130% 90% at 50% 28%,#3a2a55 0%,#281f3b 42%,#120e1c 100%)',
    letter: 'radial-gradient(ellipse 130% 90% at 50% 28%,#51432e 0%,#332c22 42%,#151310 100%)',
    app: 'radial-gradient(ellipse 130% 90% at 50% 28%,#123a4a 0%,#102733 42%,#0a1018 100%)',
    event: 'radial-gradient(ellipse 130% 90% at 50% 28%,#4a2412 0%,#2e1d16 42%,#0a1018 100%)',
    custom: 'radial-gradient(ellipse 130% 90% at 50% 28%,#1e2b0e 0%,#172018 42%,#0a1018 100%)',
};

let stories = [];
const seenSet = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } };
function markSeen(id) {
    try { const s = seenSet(); s.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300))); } catch (e) {}
}
const isSeen = s => s.seen || seenSet().has(s.id);
const imgUrl = u => (u && u.startsWith('/') ? u : u && !/^https?:/.test(u) ? '/' + u : u);
const actionButton = story => story.type === 'member'
    ? { label: state.userCard?.status === 'active' ? 'подарить карту другу' : 'узнать о карте', action: state.userCard?.status === 'active' ? 'gift' : 'card' }
    : story.button;
// в кружке – картинка (карта, значок) или эмодзи типа
function thumb(s) {
    if (s.type === 'summary') return `<span class="cst-pic cst-plaud"><img src="assets/plaud-v2.webp" alt=""></span>`;
    if (s.type === 'letter') return '<span class="cst-pic cst-letter"><span>✉️</span></span>';
    if (s.type === 'member' && s.image) return `<span class="cst-pic cst-cardthumb"><img src="${esc(imgUrl(s.image))}" alt=""></span>`;
    if (s.image && s.visual === 'plain') return `<span class="cst-pic cst-plainthumb" style="background:${BG[s.type] || BG.custom}"><img src="${esc(imgUrl(s.image))}" alt=""></span>`;
    if (s.image && s.type !== 'app') return `<span class="cst-pic" style="background-image:url('${esc(imgUrl(s.image))}')${s.type === 'badges' ? ';background-size:82%;background-color:#16222e' : ''}"></span>`;
    return `<span class="cst-pic cst-emoji" style="background:${BG[s.type] || BG.custom}">${EMOJI[s.type] || '⛰️'}</span>`;
}
const label = s => { if (s.type === 'letter') return 'новое письмо Макса'; const t = String(s.title || '').replace(/\s[–—-]\s.*$/, '').replace(/^новые значки · /, ''); return t.length > 24 ? t.slice(0, 23) + '…' : t; };

function rowHtml() {
    const seen = seenSet();
    // непросмотренные – первыми
    const list = [...stories].sort((a, b) => (isSeen(a) ? 1 : 0) - (isSeen(b) ? 1 : 0));
    const letter = list.find(s => s.type === 'letter');
    const launch = list.find(s => s.id === 'st_launch');
    if (letter && launch) {
        list.splice(list.indexOf(letter), 1);
        list.splice(list.indexOf(launch), 0, letter);
    }
    return `<div class="cst-row">${list.map(s => {
        const fresh = !(s.seen || seen.has(s.id));
        return `<button type="button" class="cst${s.type === 'letter' ? ' cst-is-letter' : ''}${fresh ? ' is-new' : ''}" data-cst="${esc(s.id)}"><span class="cst-ring">${thumb(s)}${fresh ? '<span class="cst-nb">NEW</span>' : ''}</span><span class="cst-lab">${esc(label(s))}</span></button>`;
    }).join('')}</div>`;
}

// вставить ленту в host; пока данных нет (или их нет вовсе) – остаётся то, что там было
// без мерцания: главная перерисовывается 2–3 раза подряд – ленту рисуем сразу из памяти (или из прошлого запуска),
// а свежий список подтягиваем один раз и тихо обновляем, только если он изменился
let storiesRequest = null;
function paint(host) {
    host.classList.add('cst-host');
    host.innerHTML = rowHtml();
    mountClicks(host);
}
export async function mountClubStories(host) {
    if (!host) return;
    if (!stories || !stories.length) {
        try { const saved = JSON.parse(localStorage.getItem('cstCache') || '[]'); if (Array.isArray(saved) && saved.length) stories = saved; } catch (e) {}
    }
    if (stories && stories.length) paint(host);
    let fresh;
    try {
        const r = await (storiesRequest ||= meCall('stories', {}, 8000));
        fresh = (r && r.stories) || [];
    } catch (e) { storiesRequest = null; return; }
    const changed = JSON.stringify(fresh) !== JSON.stringify(stories || []);
    stories = fresh;
    try { localStorage.setItem('cstCache', JSON.stringify(fresh)); } catch (e) {}
    if (!host.isConnected) return;
    if (!fresh.length) { host.classList.remove('cst-host'); host.innerHTML = ''; return; }
    if (changed || !host.querySelector('[data-cst]')) paint(host);
}
function mountClicks(host) {
    host.querySelector('[data-cst-arch]')?.addEventListener('click', () => { haptic(); openArchive(); });
    host.querySelectorAll('[data-cst]').forEach(b => b.addEventListener('click', () => {
        const list = [...host.querySelectorAll('[data-cst]')].map(x => stories.find(s => s.id === x.dataset.cst)).filter(Boolean);
        openStories(list, list.findIndex(s => s.id === b.dataset.cst), () => { host.innerHTML = rowHtml(); mountClicks(host); });
    }));
}

function visual(s) {
    const img = imgUrl(s.image);
    if (s.type === 'member' && img) return `<div class="csv-stage"><div class="csv-card-halo"></div><img class="csv-cardimg" src="${esc(img)}" alt=""></div>`;
    if (s.type === 'badges' && img) return `<div class="csv-stage"><div class="csv-halo"></div><img class="csv-badge" src="${esc(img)}" alt=""></div>`;
    if (s.visual === 'plain' && img) return `<div class="csv-stage"><div class="csv-halo"></div><img class="csv-badge csv-wide" src="${esc(img)}" alt=""></div>`;
    if (s.type === 'app' && img) return `<div class="csv-stage"><div class="csv-phone"><img src="${esc(img)}" alt=""></div></div>`;
    if (s.type === 'summary') return `<div class="csv-stage"><div class="csv-plaud-halo"></div><img class="csv-plaud" src="assets/plaud-v2.webp" alt=""></div>`;
    if (s.type === 'letter') return '<div class="csv-stage"><div class="csv-letter-halo"></div><span class="csv-envelope" aria-hidden="true">✉️</span></div>';
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

async function runAction(action, title = '') {
    const a = String(action || '');
    if (a.startsWith('letter:https://t.me/')) return openLetterLink(a.slice(7), title, state.userCard?.status !== 'active');
    if (a.startsWith('url:')) return openLink(a.slice(4), 'сторис', state.userCard?.status !== 'active');
    if (a.startsWith('mm:')) { const m = await import('./mm-reader.js'); return m.openMmReader(a.slice(3)); }
    if (a === 'gift') return openCardSheet({ source: 'сторис', gift: true });
    if (a === 'card') {
        if (state.userCard?.status === 'active') { const m = await import('./privileges.js'); return m.renderPriv(); }
        return openCardSheet({ source: 'сторис' });
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

// шторка-заготовка для действий без своей читалки: выезжает за пальцем, затем открывается настоящая шторка
function peekSheet(s) {
    const el = document.createElement('div');
    el.className = 'csv-peek';
    el.innerHTML = `<div class="csv-peek-sheet"><i class="csv-peek-grab"></i><b>${esc(s.button?.label || '')}</b><span class="csv-peek-dots"><i></i><i></i><i></i></span></div>`;
    document.body.appendChild(el);
    const sh = el.firstElementChild;
    const H = () => sh.getBoundingClientRect().height;
    return {
        set(p) { sh.style.transform = `translateY(${((1 - p) * H()).toFixed(1)}px)`; el.style.background = `rgba(5,8,12,${(.5 * p).toFixed(3)})`; },
        commit() { sh.style.transition = 'transform .28s cubic-bezier(.2,.9,.3,1)'; sh.style.transform = 'translateY(0)'; setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); }, 420); },
        cancel() { sh.style.transition = 'transform .22s ease'; sh.style.transform = `translateY(${H()}px)`; el.style.transition = 'background .22s'; el.style.background = 'rgba(5,8,12,0)'; setTimeout(() => el.remove(), 240); },
    };
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
        const button = actionButton(s);
        bars.forEach((b, k) => { b.style.width = k < i ? '100%' : '0%'; });
        body.innerHTML = `
            <div class="csv-bg" style="background:${BG[s.type] || BG.custom}"></div>
            ${visual(s)}
            <div class="csv-shade"></div>
            <div class="csv-head"><span class="csv-av"></span><b>интеллигенция</b><span>· ${ago(s.date)}</span><button type="button" class="csv-x" aria-label="закрыть">✕</button></div>
            <div class="csv-text"><span class="csv-tag csv-t-${esc(s.type)}"><i></i>${esc(TAG[s.type] || 'клуб')}</span><h2>${esc(s.title)}</h2>${s.text ? `<p>${esc(s.text)}</p>` : ''}
                ${button ? `<button type="button" class="csv-btn">${esc(button.label)}</button>` : ''}</div>`;
        elapsed = 0; t0 = performance.now();
        // картинку – посередине между шапкой и текстом
        requestAnimationFrame(() => {
            const stg = body.querySelector('.csv-stage'), hd = body.querySelector('.csv-head'), tx = body.querySelector('.csv-text');
            if (!stg || !hd || !tx) return;
            const a = hd.getBoundingClientRect().bottom + 14, b = tx.getBoundingClientRect().top - 14;
            if (b > a) {
                stg.style.top = a + 'px'; stg.style.height = (b - a) + 'px';
                const envelope = stg.querySelector('.csv-envelope');
                if (envelope) envelope.style.fontSize = Math.min(112, (b - a) * .65) + 'px';
            }
        });
        if (String(button?.action || '').startsWith('mm:')) import('./mm-reader.js').then(m => m.ensureMmNotes()).catch(() => {});
        if (!preview) {
            markSeen(s.id);
            if (!s.seen) { s.seen = true; meCall('story_view', { id: s.id }).catch(() => {}); }
            log('сторис: открыл', state.userCard?.status !== 'active', state.user, { id: s.id, type: s.type });
        }
    };
    const close = (instant = false) => {
        cancelAnimationFrame(raf);
        if (instant) {
            ov.remove();
            if (!document.querySelector('.mmr-overlay, .cs-overlay')) document.body.style.overflow = '';
            onClose?.(); return;
        }
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
        try { ov.setPointerCapture(e.pointerId); } catch (err) {}
        holdTimer = setTimeout(() => { held = true; pause(true); }, 220);
    });
    // свайп вверх: снизу за пальцем выезжает шторка действия (у саммари – сама читалка)
    let drag = null, dragTried = false;
    let dragGen = 0;
    const startDrag = async () => {
        dragTried = true;
        const gen = ++dragGen;
        const s = list[i], a = String(actionButton(s)?.action || '');
        let d = null;
        if (a.startsWith('mm:') && !preview) {
            const m = await import('./mm-reader.js');
            d = m.dragMmReader(a.slice(3));
            if (d) d.kind = 'mm';
        }
        // без промежуточной шторки: значки, хайк, карта – сразу своё действие после свайпа
        d = d || { kind: 'direct', set() {}, commit() {}, cancel() {} };
        // палец уже отпустили, пока грузилось, – убираем
        if (gen !== dragGen || !dragTried) { d.cancel(); return; }
        drag = d;
    };
    ov.addEventListener('pointermove', e => {
        const dy = e.clientY - sy;
        if (st && dy < -12 && actionButton(list[i])) {
            clearTimeout(holdTimer);
            if (!dragTried) { pause(true); startDrag(); }
            const p = Math.min(1, -dy / (window.innerHeight * .55));
            drag?.set(p);
            body.style.transform = `scale(${1 - p * .06})`;
            body.style.filter = `brightness(${1 - p * .35})`;
        }
        else if (st && dy > 0) body.style.transform = `translateY(${dy * .6}px) scale(${1 - Math.min(dy, 300) / 2000})`;
    });
    ov.addEventListener('pointerup', e => {
        clearTimeout(holdTimer);
        if (!st) return;
        const dy = e.clientY - sy, dx = e.clientX - sx;
        st = 0;
        if (dragTried) {
            const d = drag; drag = null; dragTried = false; dragGen++;
            body.style.transition = 'transform .25s ease, filter .25s ease';
            if (dy < -80 && d) {
                haptic();
                const s = list[i];
                const action = actionButton(s)?.action;
                if (!preview) log('сторис: свайп вверх', state.userCard?.status !== 'active', state.user, { id: s.id, action });
                d.commit();
                if (d.kind === 'mm') { setTimeout(() => close(true), 330); }
                else { close(true); if (!preview) setTimeout(() => runAction(action, s.title), 60); }
            } else {
                d?.cancel(); body.style.transform = ''; body.style.filter = ''; pause(false);
            }
            setTimeout(() => { body.style.transition = ''; }, 260);
            return;
        }
        body.style.transform = '';
        if (held) { pause(false); return; }
        if (dy > 90) return close();
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
            const action = actionButton(s)?.action;
            if (!preview) log('сторис: кнопка', state.userCard?.status !== 'active', state.user, { id: s.id, action });
            close();
            if (!preview) setTimeout(() => runAction(action, s.title), 260);
        }
    });
    show();
    raf = requestAnimationFrame(tick);
}

// ---------- архив сторис: шторка со всеми опубликованными, как «все значки» ----------
let archive = null;
async function openArchive() {
    log('сторис: архив', state.userCard?.status !== 'active', state.user);
    const ov = document.createElement('div');
    ov.className = 'sa-overlay';
    ov.innerHTML = `<div class="sa-sheet" role="dialog" aria-label="архив сторис"><div class="cs-grab" aria-hidden="true"></div>
        <div class="sa-top"><b>архив сторис</b><button type="button" class="sa-x" aria-label="закрыть">✕</button></div>
        <div class="sa-scroll"><div class="sa-wait">загружаю…</div></div></div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-on'));
    const close = () => { ov.classList.remove('is-on'); setTimeout(() => ov.remove(), 280); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.sa-x')) { haptic(); close(); } });
    try { if (!archive) archive = ((await meCall('stories', { all: 1 }, 10000)) || {}).stories || []; } catch (e) { archive = null; }
    const box = ov.querySelector('.sa-scroll');
    const list = archive || [];
    if (!list.length) { box.innerHTML = '<div class="sa-wait">пока пусто</div>'; return; }
    const M = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const day = ts => { const d = new Date(Number(ts) || Date.now()); return `${d.getDate()} ${M[d.getMonth()]}`; };
    const cover = s => {
        if (s.image && s.type !== 'app') return `<span class="sa-pic" style="background-image:url('${esc(imgUrl(s.image))}')${s.type === 'badges' ? ';background-size:70%;background-repeat:no-repeat;background-color:#16222e' : ''}"></span>`;
        if (s.type === 'summary') return `<span class="sa-pic sa-emo" style="background:${BG.summary}"><img src="assets/plaud-v2.webp" alt=""></span>`;
        return `<span class="sa-pic sa-emo" style="background:${BG[s.type] || BG.custom}"><i>${EMOJI[s.type] || '⛰️'}</i></span>`;
    };
    box.innerHTML = `<div class="sa-grid">${list.map((s, i) => `<button type="button" class="sa-it" data-sa="${i}">${cover(s)}<span class="sa-t">${esc(label(s))}</span><span class="sa-d">${day(s.date)}</span></button>`).join('')}</div>`;
    box.querySelectorAll('[data-sa]').forEach(b => b.addEventListener('click', () => { haptic(); openStories(list, Number(b.dataset.sa)); }));
}
