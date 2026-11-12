// js/ui/survey.js – опросы в приложении: баннер на главной и шторка «один вопрос на экране».
// Что показывать и какие вопросы – решает сервер (lib/survey.js, /api/me survey). Ответы уходят сразу после каждого вопроса,
// поэтому недопройденный опрос не теряется, а баннер потом предлагает «продолжить».
import { state } from '../state.js';
import { meCall } from '../net.js';
import { log } from '../api.js';
import { haptic, showConfetti } from '../utils.js';
import { rarityLabel } from '../achievements.js';

const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const OTHER = 'другое';
let data = null;      // { segment, banner, questions, answers }
let loadedAt = 0;
let shown = false;

// ссылка t.me/…?startapp=survey_B открывает превью опроса сегмента B (только для тестовых людей, сервер проверяет)
const previewSegment = () => { try { const p = window.Telegram?.WebApp?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('startapp') || ''; return (/^survey_([A-F])$/.exec(p) || [])[1] || ''; } catch (e) { return ''; } };
const ICONS = {
    'найти друзей в Ялте': '🤝', 'познакомиться с интересными людьми': '👥', 'поговорить о важном, а не о погоде и работе': '💬',
    'выбраться в горы, которые давно хотелось увидеть': '⛰️', 'провести выходные не в одиночестве': '🌤️', 'побыть в тишине и очистить голову': '🤫',
    'попробовать что-то новое': '✨', 'сменить круг общения': '🔄', 'познакомиться с кем-то для отношений': '💛', 'узнать, что за интеллигенция такая': '🔎',
    'другое': '✍️', 'да': '👍', 'только пересказом': '🗣️', 'нет': '🙅', 'да, напишите мне в телеграм': '📨', 'может быть позже': '⏳',
};
const shuffle = list => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const bannerHtml = b => `
    <div class="card-container sv-banner" id="svBanner">
        <div class="sv-b-top">
            <img class="sv-badge-img" src="assets/survey-badge.webp" alt="">
            <div class="sv-b-txt"><small>опрос · 2–3 минуты</small><b>${esc(b.title)}</b><span>${esc(b.text)}</span></div>
        </div>
        <div class="sv-b-btns">
            <button type="button" class="btn btn-yellow sv-go" data-sv="go">${b.resume ? 'продолжить' : 'пройти'}</button>
            <div class="sv-b-sub"><button type="button" class="sv-ghost" data-sv="later">позже</button><button type="button" class="sv-ghost" data-sv="declined">отказаться</button></div>
        </div>
    </div>`;

export async function mountSurveyBanner(host) {
    if (!host || !window.Telegram?.WebApp?.initData) return;
    try {
        if (!data || Date.now() - loadedAt > 60000) {
            const r = await meCall('survey', { preview: previewSegment() }, 8000);
            data = r?.survey || null; loadedAt = Date.now();
        }
    } catch (e) { return; }
    if (!host.isConnected) return;
    if (!data) { host.innerHTML = ''; return; }
    host.innerHTML = bannerHtml(data.banner);
    if (!shown) { shown = true; log('опрос: баннер показан', false, state.user, { segment: data.segment }); }
    scheduleNudge();
    host.querySelector('[data-sv="go"]').addEventListener('click', () => { haptic(); log('опрос: открыл', false, state.user, { segment: data.segment }); openSurvey(host); });
    host.querySelectorAll('.sv-ghost').forEach(b => b.addEventListener('click', async () => {
        haptic();
        const op = b.dataset.sv;
        log(`опрос: ${op === 'later' ? 'позже' : 'отказался'}`, false, state.user, { segment: data.segment });
        const el = host.querySelector('#svBanner');
        el.classList.add('is-out');
        setTimeout(() => { host.innerHTML = ''; }, 260);
        try { await meCall('survey_state', { op, segment: data.segment }); } catch (e) { /* баннер вернётся при следующем заходе */ }
        data = null;
    }));
}

function openSurvey(host) {
    document.querySelector('.sv-overlay')?.remove();
    const { segment } = data;
    const qs = data.questions;
    const answers = JSON.parse(JSON.stringify(data.answers || {}));
    const orders = {}; // порядок вариантов фиксируем на время прохождения
    // с какого вопроса продолжить: первый без ответа
    let idx = qs.findIndex(q => !answers[q.id]);
    const allDone = idx < 0; // все ответы уже есть, а «готово» не дошло до сервера – просто довершаем
    if (allDone) idx = qs.length - 1;

    const el = document.createElement('div');
    el.className = 'sv-overlay';
    el.innerHTML = `<div class="sv-sheet">
        <div class="cs-grab sv-grab"></div>
        <button type="button" class="hb-close sv-close" aria-label="закрыть">✕</button>
        <div class="sv-rw"><img src="assets/survey-badge.webp" alt=""><div class="sv-rw-t"><small></small><div class="sv-dots"></div></div></div>
        <div class="sv-body"></div>
        <div class="sv-bar"><button type="button" class="sv-skip">пропустить</button><button type="button" class="btn btn-yellow sv-next">дальше</button></div>
    </div>`;
    const tgw = window.Telegram?.WebApp;
    const inset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
    el.style.setProperty('--sv-top', (inset ? inset + 14 : 40) + 'px');
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    const body = el.querySelector('.sv-body'), next = el.querySelector('.sv-next'), skipBtn = el.querySelector('.sv-skip');
    let cur = { sel: [], text: '', other: '' }, leaving = false;

    const close = () => {
        if (leaving) return; leaving = true;
        el.classList.remove('is-on');
        setTimeout(() => el.remove(), 380);
        mountSurveyBanner(host); // обновить «продолжить»
    };
    el.querySelector('.sv-close').addEventListener('click', () => { haptic(); close(); });
    el.querySelector('.sv-grab').addEventListener('click', close);
    el.addEventListener('click', e => { if (e.target === el) close(); });

    function optionsOf(q) {
        let opts = q.options || [];
        if (q.from) {
            const prev = answers[q.from]?.a;
            opts = Array.isArray(prev) ? prev : [];
        }
        if (!orders[q.id]) {
            const list = q.shuffle ? shuffle(opts) : opts.slice();
            if (q.other && !q.from) list.push(OTHER);
            orders[q.id] = list;
        }
        return orders[q.id];
    }
    const valueOf = q => {
        if (q.type === 'text') return cur.text.trim();
        const chosen = cur.sel.map(v => (v === OTHER && cur.other.trim() ? `другое: ${cur.other.trim()}` : v));
        return q.type === 'single' ? chosen[0] || '' : chosen;
    };
    const filled = q => { const v = valueOf(q); return Array.isArray(v) ? v.length > 0 : !!v; };

    function paint() {
        const q = qs[idx];
        if (q.from) delete orders[q.id]; // D3 пересобираем из актуальных ответов D2
        if (q.from && !optionsOf(q).length && idx < qs.length - 1) { idx++; return paint(); } // в D2 ничего не отметили
        const prev = answers[q.id];
        cur = { sel: [], text: '', other: '' };
        if (prev && !prev.skip) {
            if (q.type === 'text') cur.text = prev.a || '';
            else (Array.isArray(prev.a) ? prev.a : [prev.a]).forEach(v => {
                if (/^другое: /.test(v)) { cur.sel.push(OTHER); cur.other = v.slice(8); } else cur.sel.push(v);
            });
        }
        const left = qs.length - idx;
        el.querySelector('.sv-rw small').textContent = `до значка · ${left} ${left === 1 ? 'вопрос' : left >= 2 && left <= 4 ? 'вопроса' : 'вопросов'}`;
        el.querySelector('.sv-dots').innerHTML = qs.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('');
        next.textContent = idx === qs.length - 1 ? (q.type === 'text' ? 'отправить' : 'готово') : (q.type === 'text' ? 'отправить' : 'дальше');
        const hint = q.type === 'multi' ? 'можно выбрать несколько' : q.note || '';
        let inner = `<div class="sv-msg"><span class="sv-av">и</span><div class="sv-bub">${esc(q.title)}</div></div><div class="sv-hint">${esc(hint)}</div>`;
        if (q.type === 'text') {
            inner += `<textarea class="sv-text" rows="7" maxlength="2000" placeholder="напиши своими словами"></textarea>`;
        } else {
            const list = optionsOf(q);
            const wide = list.some(o => o.length > 52);
            inner += `<div class="sv-tiles${wide ? ' is-wide' : ''}">${list.map(o => `<button type="button" class="sv-tile${cur.sel.includes(o) ? ' is-on' : ''}" data-o="${esc(o)}">${ICONS[o] ? `<em>${ICONS[o]}</em>` : ''}<span>${esc(o)}</span></button>`).join('')}</div>
                <input class="sv-other" type="text" maxlength="200" placeholder="что именно" ${cur.sel.includes(OTHER) ? '' : 'hidden'} value="${esc(cur.other)}">`;
        }
        body.innerHTML = inner;
        body.scrollTop = 0;
        const sync = () => { next.disabled = !filled(q); };
        if (q.type === 'text') {
            const ta = body.querySelector('.sv-text'); ta.value = cur.text;
            ta.addEventListener('input', () => { cur.text = ta.value; sync(); });
        } else {
            const other = body.querySelector('.sv-other');
            other.addEventListener('input', () => { cur.other = other.value; sync(); });
            body.querySelectorAll('.sv-tile').forEach(b => b.addEventListener('click', () => {
                haptic();
                const o = b.dataset.o;
                if (q.type === 'single') { cur.sel = [o]; body.querySelectorAll('.sv-tile').forEach(x => x.classList.toggle('is-on', x === b)); }
                else { cur.sel = cur.sel.includes(o) ? cur.sel.filter(x => x !== o) : [...cur.sel, o]; b.classList.toggle('is-on'); }
                other.hidden = !cur.sel.includes(OTHER);
                if (!other.hidden) other.focus({ preventScroll: true });
                sync();
            }));
        }
        sync();
    }

    function go(skip) {
        const q = qs[idx];
        const v = skip ? null : valueOf(q);
        answers[q.id] = skip ? { skip: true } : { a: v };
        const saved = meCall('survey_answer', { segment, q: q.id, a: v, skip: !!skip }, 8000).catch(() => {});
        log(`опрос: ${q.id} ${skip ? 'пропуск' : 'ответ'}`, false, state.user, { segment });
        if (idx < qs.length - 1) {
            body.classList.add('is-leave');
            setTimeout(() => { body.classList.remove('is-leave'); idx++; paint(); }, 160);
        } else saved.then(finish);
    }
    next.addEventListener('click', () => { haptic(); go(false); });
    skipBtn.addEventListener('click', () => { haptic(); go(true); });

    async function finish() {
        // сначала сохраняем конец опроса: значок выдаётся на сервере сразу, как только он засчитан
        meCall('survey_finish', { segment }, 10000).catch(() => { /* состояние дойдёт при следующем заходе */ });
        log('опрос: пройден', false, state.user, { segment });
        data = null;
        showBadgeReward(() => close());
    }

    if (allDone) finish(); else paint();
}

// финальный экран: «спасибо!» и значок в свечении с конфетти – как окно «новый значок» (стили .ach-*)
function showBadgeReward(onClose) {
    document.querySelector('.sv-reward')?.remove();
    const el = document.createElement('div');
    el.className = 'ach-overlay sv-reward';
    el.innerHTML = `<div class="ach-sheet sv-reward-sheet" role="dialog" aria-modal="true" aria-label="значок за опрос">
        <button type="button" class="ach-close" aria-label="закрыть">✕</button>
        <h2 class="ach-title">спасибо!</h2>
        <div class="sv-r-stage"><img src="assets/survey-badge.webp" alt="значок «поделился взглядом»"></div>
        <span class="ach-rar is-legendary">${esc(rarityLabel('legendary') || 'легендарный')}</span>
        <p class="sv-r-cap">значок «поделился взглядом» уже твой</p>
        <button type="button" class="btn btn-yellow ach-btn">закрыть</button>
    </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    setTimeout(() => el.isConnected && showConfetti({ into: el }), 250);
    try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); } catch (e) {}
    let gone = false;
    const done = () => { if (gone) return; gone = true; el.classList.remove('is-on'); setTimeout(() => el.remove(), 300); onClose && onClose(); };
    el.querySelector('.ach-close').addEventListener('click', done);
    el.querySelector('.ach-btn').addEventListener('click', () => { haptic(); done(); });
}

// ---------- всплывашка снизу: «ответишь на пару вопросов за значок?» ----------
// Не накладывается на другие окна: ждёт, пока экран чистый, потом ещё пару секунд, и только тогда выезжает.
// Не чаще раза за заход и не больше 3 раз человеку; «позже» прячет на сутки, крестик – насовсем (баннер на главной остаётся).
const BUSY = '.ai-island.visible, .ach-overlay, .acol-overlay, .admission-overlay, .bottom-sheet-overlay.active, .city-ticket-overlay, .cq-overlay, .csv-overlay, .cw-overlay, .hb-overlay, .inv-overlay, .mmr-overlay, .modal-overlay, .profile-blur-overlay, .rd-story-overlay, .sa-overlay, .sv-overlay, .reg-ticket-overlay, .zp-overlay, .cs-overlay, .bot-chat-overlay, .bottom-sheet.visible';
const FIRST_DELAY = 7000, QUIET_MS = 2500, MAX_SHOWS = 3;
let nudgeTimer = 0, nudgeEl = null, nudgeShown = false, nudgeDone = false;
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const busyNow = () => !!document.querySelector(BUSY);
const appReady = () => { const l = document.getElementById('initial-loader'); return document.documentElement.classList.contains('app-ready') && (!l || l.style.display === 'none' || getComputedStyle(l).display === 'none'); };

function scheduleNudge() {
    if (nudgeTimer || nudgeDone || !data) return;
    const test = !!data.test; // у тестовых аккаунтов без ограничений по числу показов
    if (!test && (Number(ls.get('svNudgeN')) >= MAX_SHOWS || Number(ls.get('svNudgeUntil')) > Date.now())) return;
    const started = Date.now();
    let quietSince = Date.now();
    nudgeTimer = setInterval(() => {
        const host = document.getElementById('surveyHost');
        const banner = host && host.querySelector('#svBanner');
        const busy = busyNow();
        if (busy) quietSince = Date.now();
        if (!banner || !data || document.visibilityState === 'hidden') { // ушли с главной – ждём возврата, но не вечно
            if (nudgeEl) hideNudge(true);
            if (Date.now() - started > 5 * 60000) stopNudge();
            quietSince = Date.now();
            return;
        }
        if (nudgeEl) { if (busy) hideNudge(true); return; } // поверх вылезло другое окно – убираем, вернёмся после паузы
        if (!appReady() || busy || Date.now() - started < FIRST_DELAY || Date.now() - quietSince < QUIET_MS) return;
        showNudge(banner, test);
    }, 400);
}
function stopNudge() { clearInterval(nudgeTimer); nudgeTimer = 0; }

function hideNudge(keepWaiting) {
    const el = nudgeEl; nudgeEl = null;
    if (el) { el.classList.remove('is-on'); setTimeout(() => el.remove(), 350); }
    if (!keepWaiting) stopNudge();
}

function showNudge(banner, test) {
    if (!nudgeShown) { // счётчик показов – один раз за заход
        nudgeShown = true;
        if (!test) ls.set('svNudgeN', String((Number(ls.get('svNudgeN')) || 0) + 1));
        log('опрос: всплывашка показана', false, state.user, { segment: data.segment });
    }
    const el = document.createElement('div');
    el.className = 'sv-nudge';
    el.innerHTML = `<button type="button" class="sv-nx" aria-label="закрыть">✕</button>
        <img class="sv-n-img" src="assets/survey-badge.webp" alt="">
        <div class="sv-n-t">${esc(data.banner.title)}</div>
        <div class="sv-n-s">ответишь на пару вопросов? подарим легендарный значок</div>
        <div class="sv-n-b"><button type="button" class="btn btn-yellow sv-n-yes">да, отвечу</button><button type="button" class="sv-n-later">позже</button></div>`;
    document.body.appendChild(el);
    nudgeEl = el;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    el.querySelector('.sv-n-yes').addEventListener('click', () => {
        haptic(); log('опрос: всплывашка – да', false, state.user, { segment: data.segment });
        nudgeDone = true; hideNudge(false);
        glideToBanner();
    });
    el.querySelector('.sv-n-later').addEventListener('click', () => {
        haptic(); log('опрос: всплывашка – позже', false, state.user, { segment: data.segment });
        ls.set('svNudgeUntil', String(Date.now() + 24 * 3600000)); nudgeDone = true; hideNudge(false);
    });
    el.querySelector('.sv-nx').addEventListener('click', () => {
        haptic(); log('опрос: всплывашка – закрыл', false, state.user, { segment: data.segment });
        ls.set('svNudgeN', '99'); nudgeDone = true; hideNudge(false);
    });
}

// плавный доскролл: баннер встаёт посередине экрана, на секунды подсвечивается кольцом; любое касание прерывает
function glideToBanner() {
    const banner = document.getElementById('svBanner');
    if (!banner) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = scrollY, t0 = performance.now();
    let stop = false;
    const cancel = () => { stop = true; };
    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(t => window.addEventListener(t, cancel, { once: true, capture: true, passive: true }));
    const target = () => { const r = banner.getBoundingClientRect(); return Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, r.top + scrollY - (innerHeight - r.height) / 2)); };
    const step = now => {
        if (stop) return;
        const p = reduced ? 1 : Math.min(1, (now - t0) / 1100);
        const e = p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
        window.scrollTo({ top: from + (target() - from) * e, behavior: 'instant' });
        if (p < 1) requestAnimationFrame(step);
        else { banner.classList.add('sv-flash'); setTimeout(() => banner.classList.remove('sv-flash'), 3200); }
    };
    requestAnimationFrame(step);
}
