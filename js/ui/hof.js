// js/ui/hof.js – блок «дыхание по Виму Хофу» на главной (под «твоими связями»).
// Блок – вариант А (голубой, видео в карточке), подготовка – экран А, дыхание – экран Б (кольца, таймер задержки).
// Голос – дорожка из видео-руководства (assets/hof/voice.m4a), фазы на экране идут по разметке TIMELINE (секунды дорожки).
// Сессии пишутся в Firebase hof/<uid> через /api/me action hof. Пока только @maxmolotov.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { TIMELINE } from './hof-timeline.js';

const TEST_IDS = ['163665735'];
let sessions = null;

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const lg = a => { try { log(a, state.userCard?.status !== 'active', state.user); } catch (e) {} };

async function api(payload) {
    const r = await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hof', initData: window.Telegram?.WebApp?.initData || '', ...payload }) });
    if (!r.ok) throw new Error('server');
    return r.json();
}

function stats() {
    const list = (sessions || []).filter(s => s.done || (s.holds || []).length);
    const best = Math.max(0, ...list.flatMap(s => s.holds || []));
    return { n: list.length, best };
}

function statLine() {
    const { n, best } = stats();
    if (!n) return 'первая сессия – 11 минут, сидя или лёжа';
    const word = n % 10 === 1 && n % 100 !== 11 ? 'раз' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'раза' : 'раз');
    return `ты дышал ${n} ${word}${best ? ` · лучшая задержка ${mmss(best)}` : ''}`;
}

export function mountHof() {
    if (!TEST_IDS.includes(String(state.user?.id || ''))) return;
    const anchor = document.getElementById('circleContainer');
    if (!anchor) return;
    let el = document.getElementById('hofBlock');
    if (!el) { el = document.createElement('div'); el.id = 'hofBlock'; anchor.insertAdjacentElement('afterend', el); }
    paintBlock(el);
    if (!sessions) api({ op: 'list' }).then(j => { sessions = j.sessions || []; paintBlock(el); }).catch(() => {});
}

function paintBlock(el) {
    el.innerHTML = `
    <div class="card-container hof-card">
        <div class="hof-tag">тренажёр дыхания по методу Хофа</div>
        <div class="hof-title">дыши как ледяной человек</div>
        <div class="hof-text">11 минут дыхания – и тело просыпается, как после холодного душа, а стресс уходит. Исследование, опубликованное в журнале PNAS, показало: практика запускает выброс адреналина и гасит воспаление. С этим методом Вим Хоф поставил десятки мировых рекордов – почти два часа просидел во льду и поднялся на Килиманджаро в одних шортах.</div>
        <div class="hof-video" id="hofVideo">
            <img src="assets/hof/cover.jpg" alt="" loading="lazy">
            <span class="hof-play"></span><span class="hof-vcap">кто такой Вим Хоф · 45 с</span>
        </div>
        <button class="hof-btn" id="hofStart">начать дыхание</button>
        <div class="hof-stat">${esc(statLine())}</div>
    </div>`;
    el.querySelector('#hofVideo').addEventListener('click', () => { haptic(); lg('хоф: видео'); playFullscreen(); });
    el.querySelector('#hofStart').addEventListener('click', () => { haptic(); lg('хоф: открыл подготовку'); openPrep(); });
}

// видео «кто такой Вим Хоф» (assets/hof/wim.mp4) – сразу на весь экран, с русскими субтитрами
function playFullscreen() {
    const ov = document.createElement('div');
    ov.className = 'hof-ov hof-vid-ov is-in';
    ov.innerHTML = `<video src="assets/hof/wim.mp4" poster="assets/hof/cover.jpg" controls playsinline preload="auto" crossorigin="anonymous">
            <track kind="subtitles" srclang="ru" label="русские" src="assets/hof/wim.ru.vtt" default>
        </video><button class="hof-x hof-vid-x" aria-label="закрыть">✕</button>`;
    document.body.appendChild(ov);
    const v = ov.querySelector('video');
    try { v.textTracks[0].mode = 'showing'; } catch (e) {}
    const close = () => { try { v.pause(); } catch (e) {} ov.remove(); };
    ov.querySelector('.hof-vid-x').addEventListener('click', () => { haptic(); close(); });
    v.addEventListener('ended', () => { try { document.fullscreenElement && document.exitFullscreen(); } catch (e) {} close(); });
    // iPhone: системный плеер на весь экран (субтитры default показывает сам); выход из него – закрываем
    v.addEventListener('webkitendfullscreen', close);
    // закрытие свайпом вниз: видео едет за пальцем, фон бледнеет; отпустил ниже 110px – закрываем
    let y0 = null, dy = 0;
    ov.addEventListener('touchstart', e => { if (e.touches.length === 1) { y0 = e.touches[0].clientY; dy = 0; v.style.transition = 'none'; } }, { passive: true });
    ov.addEventListener('touchmove', e => {
        if (y0 === null) return;
        dy = Math.max(0, e.touches[0].clientY - y0);
        v.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 400) / 2000})`;
        ov.style.background = `rgba(0,0,0,${Math.max(0.3, 1 - dy / 400)})`;
    }, { passive: true });
    ov.addEventListener('touchend', () => {
        if (y0 === null) return;
        y0 = null;
        if (dy > 110) { haptic(); close(); return; }
        v.style.transition = 'transform .25s'; v.style.transform = ''; ov.style.background = '';
    });
    v.play().catch(() => {});
    try {
        if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
        else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    } catch (e) {}
    document.addEventListener('fullscreenchange', function f() { if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', f); close(); } });
}

function openPrep() {
    const ov = document.createElement('div');
    ov.className = 'hof-ov hof-prep';
    ov.innerHTML = `
        <div class="hof-top"><span>перед стартом</span><button class="hof-x" aria-label="закрыть">✕</button></div>
        <div class="hof-prep-body">
            <div class="hof-title hof-p-title">один раунд –<br>три фазы</div>
            <div class="hof-p-sub">повторим 3 раза. голос подскажет каждый шаг</div>
            <div class="hof-p-bar"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
            <div class="hof-p-legend"><span class="b1">≈2 мин</span><span class="b2">30 с – 1,5 мин</span><span class="b3">15 с</span></div>
            <div class="hof-p-cards">
                <div class="hof-p-card is-main"><div class="ic ic-ring"></div><div><b>30 глубоких вдохов</b><span>полный вдох животом и грудью, выдох – свободно, без усилия</span></div></div>
                <div class="hof-p-card"><div class="ic ic-timer">1:30</div><div><b>задержка на выдохе</b><span>не дыши, сколько комфортно – таймер считает</span></div></div>
                <div class="hof-p-card"><div class="ic ic-15">15</div><div><b>вдох и держим 15 с</b><span>восстановление – и следующий раунд</span></div></div>
            </div>
            <button class="hof-btn" id="hofGo">поехали · 11 минут</button>
            <div class="hof-p-warn">сидя или лёжа · не в воде и не за рулём. закружилась голова – просто дыши как обычно</div>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-in'));
    const close = () => { ov.classList.remove('is-in'); setTimeout(() => ov.remove(), 250); };
    ov.querySelector('.hof-x').addEventListener('click', () => { haptic(); close(); });
    ov.querySelector('#hofGo').addEventListener('click', () => { haptic(); close(); lg('хоф: начал сессию'); openSession(); });
}

// фаза в момент t: из разметки дорожки
function phaseAt(t) {
    let cur = TIMELINE[0];
    for (const p of TIMELINE) { if (p.t <= t) cur = p; else break; }
    return cur;
}

function openSession() {
    const ov = document.createElement('div');
    ov.className = 'hof-ov hof-run';
    ov.innerHTML = `
        <div class="hof-round" id="hofRound">приготовься</div>
        <div class="hof-center">
            <div class="hof-rings">
                <div class="r r1"></div><div class="r r2"></div>
                <div class="hof-core" id="hofCore"></div>
                <div class="hof-num"><b id="hofBig"></b><small id="hofSmall"></small></div>
            </div>
            <div class="hof-phase" id="hofPhase">слушай инструкцию</div>
            <div class="hof-hist" id="hofHist"></div>
        </div>
        <div class="hof-ctrl">
            <button class="hof-c" id="hofPause" aria-label="пауза">❚❚</button>
            <button class="hof-c hof-c-go" id="hofBreathe" style="display:none">вдохнуть</button>
            <button class="hof-c hof-c-x" id="hofClose" aria-label="выйти">✕</button>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-in'));
    const audio = new Audio('assets/hof/voice.m4a');
    audio.preload = 'auto';
    const $ = id => ov.querySelector('#' + id);
    const holds = []; // секунды задержки на выдохе по раундам
    let holdStart = null, holdWall = 0, holdRound = 0, raf = 0, finished = false, lastPhaseKey = '';
    try { window.Telegram?.WebApp?.disableVerticalSwipes?.(); } catch (e) {}
    let wake = null;
    try { navigator.wakeLock?.request('screen').then(w => { wake = w; }).catch(() => {}); } catch (e) {}

    const paint = () => {
        const t = audio.currentTime;
        const p = phaseAt(t);
        const key = `${p.kind}${p.round || ''}`;
        const core = $('hofCore');
        if (key !== lastPhaseKey) {
            lastPhaseKey = key;
            if (p.kind === 'hold' && holdStart === null) { holdStart = t; holdWall = performance.now(); holdRound = p.round; try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('soft'); } catch (e) {} }
            if (p.kind !== 'hold' && holdStart !== null) { holds[holdRound - 1] = Math.round((performance.now() - holdWall) / 1000); holdStart = null; renderHist(); }
            $('hofBreathe').style.display = p.kind === 'hold' ? '' : 'none';
            ov.dataset.phase = p.kind;
            $('hofRound').textContent = p.round ? `раунд ${p.round} из 3` : (p.kind === 'end' ? 'готово' : 'приготовься');
        }
        if (p.kind === 'breathe') {
            // один цикл вдох-выдох = (end - t0) / count
            const per = (p.end - p.t) / p.count;
            const k = Math.max(0, t - p.t);
            const i = Math.min(p.count, Math.floor(k / per) + 1);
            const f = (k % per) / per; // 0..1 внутри вдоха-выдоха
            const inhale = f < 0.5;
            const scale = 0.62 + 0.38 * Math.sin(Math.PI * f);
            core.style.transform = `scale(${scale.toFixed(3)})`;
            $('hofBig').textContent = i;
            $('hofSmall').textContent = `из ${p.count}`;
            $('hofPhase').textContent = inhale ? 'вдох' : 'выдох';
        } else if (p.kind === 'hold') {
            core.style.transform = 'scale(0.62)';
            $('hofBig').textContent = mmss(holdStart === null ? 0 : (performance.now() - holdWall) / 1000);
            $('hofSmall').textContent = 'задержка';
            $('hofPhase').textContent = audio.paused ? 'на паузе – держи, сколько хочется' : 'выдохни и не дыши';
        } else if (p.kind === 'recover') {
            const left = Math.max(0, Math.ceil(p.end - t));
            core.style.transform = 'scale(1)';
            $('hofBig').textContent = left;
            $('hofSmall').textContent = 'держи';
            $('hofPhase').textContent = 'глубокий вдох и задержка';
        } else {
            core.style.transform = `scale(${(0.8 + 0.04 * Math.sin(t * 1.4)).toFixed(3)})`;
            $('hofBig').textContent = '';
            $('hofSmall').textContent = '';
            $('hofPhase').textContent = p.kind === 'end' ? 'отличная работа' : (p.label || 'слушай инструкцию');
        }
        if (!finished) raf = requestAnimationFrame(paint);
    };
    const renderHist = () => {
        $('hofHist').innerHTML = holds.map((h, i) => h ? `<span>раунд ${i + 1} · ${mmss(h)}</span>` : '').join('');
    };
    const save = done => {
        const list = holds.filter(Boolean);
        if (!done && !list.length) return;
        api({ op: 'save', rounds: list.length, holds: list, done }).then(j => { sessions = j.sessions || sessions; const b = document.getElementById('hofBlock'); if (b) paintBlock(b); }).catch(() => {});
        lg(done ? `хоф: сессия завершена${list.length ? ' · ' + list.map(mmss).join(' / ') : ''}` : `хоф: вышел на раунде ${list.length + 1}`);
    };
    const close = () => {
        finished = true; cancelAnimationFrame(raf); audio.pause();
        try { wake?.release(); } catch (e) {}
        ov.classList.remove('is-in'); setTimeout(() => ov.remove(), 250);
    };
    audio.addEventListener('ended', () => {
        if (holdStart !== null) { holds[holdRound - 1] = Math.round((performance.now() - holdWall) / 1000); holdStart = null; }
        finished = true; cancelAnimationFrame(raf);
        save(true);
        ov.dataset.phase = 'end';
        $('hofRound').textContent = 'готово';
        $('hofBig').textContent = '✓'; $('hofSmall').textContent = '';
        $('hofPhase').textContent = 'отличная работа';
        renderHist();
        $('hofPause').style.display = 'none';
    });
    $('hofPause').addEventListener('click', () => {
        haptic();
        if (audio.paused) { audio.play().catch(() => {}); $('hofPause').textContent = '❚❚'; }
        else { audio.pause(); $('hofPause').textContent = '▶'; }
    });
    $('hofBreathe').addEventListener('click', () => {
        haptic();
        const p = phaseAt(audio.currentTime);
        if (p.kind === 'hold' && p.skipTo) { audio.currentTime = p.skipTo; if (audio.paused) { audio.play().catch(() => {}); $('hofPause').textContent = '❚❚'; } }
    });
    $('hofClose').addEventListener('click', () => { haptic(); if (!audio.ended) save(false); close(); });
    audio.play().then(() => { raf = requestAnimationFrame(paint); }).catch(() => {
        $('hofPhase').textContent = 'нажми ▶, чтобы включить голос';
        $('hofPause').textContent = '▶';
        raf = requestAnimationFrame(paint);
    });
}
