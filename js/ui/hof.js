// js/ui/hof.js – блок «дыхание по Виму Хофу» на главной (под «твоими связями»).
// Блок – вариант А (голубой, видео в карточке), подготовка – экран А, дыхание – экран Б (кольца, таймер задержки).
// Голос – дорожка из видео-руководства (assets/hof/voice.m4a), фазы на экране идут по разметке TIMELINE (секунды дорожки).
// Сессии пишутся в Firebase hof/<uid> через /api/me action hof. Открыт всем с 13.11.2026.
import { state } from '../state.js';
import { haptic, openLink } from '../utils.js';
import { log } from '../api.js';
import { TIMELINE } from './hof-timeline.js';
import { createHoldTracker, personalHofSessions } from './hof-session.js';

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
    const best = Math.max(0, ...personalHofSessions(list).flatMap(s => s.holds || []));
    return { n: list.length, best };
}

function statLine() {
    const { n, best } = stats();
    if (!n) return 'выбери тренировку или свой темп';
    const word = n % 10 === 1 && n % 100 !== 11 ? 'раз' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'раза' : 'раз');
    return `ты дышал ${n} ${word}${best ? `, лучшая задержка ${mmss(best)}` : ''}`;
}

export function mountHof() {
    // под мастермайндом (13.11); если блока саммари нет – под «твоими связями»
    const anchor = document.getElementById('mastermindSummariesContainer') || document.getElementById('circleContainer');
    if (!anchor) return;
    let el = document.getElementById('hofBlock');
    if (!el) { el = document.createElement('div'); el.id = 'hofBlock'; anchor.insertAdjacentElement('afterend', el); }
    paintBlock(el);
    if (!sessions) api({ op: 'list' }).then(j => { sessions = j.sessions || []; paintBlock(el); }).catch(() => {});
}

function paintBlock(el) {
    el.innerHTML = `
    <div class="card-container hof-card">
        <div data-app-copy="copy_490a77b95fee2bb701dd" class="hof-tag">техника, которую мы делаем на хайках</div>
        <div data-app-copy="copy_4225766561126639cbb8" class="hof-title">метод Вима Хофа</div>
        <div data-app-copy="copy_a5c1f4978cd89ea4052e" class="hof-text">11 минут дыхания, и тело просыпается, как после холодного душа, а стресс уходит. исследование в журнале PNAS: практика запускает выброс адреналина и гасит воспаление. с этим методом Вим Хоф поставил десятки мировых рекордов, почти два часа просидел во льду и поднялся на Килиманджаро в одних шортах</div>
        <div class="hof-video" id="hofVideo">
            <img src="assets/hof/cover.jpg" alt="" loading="lazy">
            <span class="hof-play"></span><span data-app-copy="copy_a70ce5380204c95b376c" class="hof-vcap">кто такой Вим Хоф 45 с</span>
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
        <div class="hof-top"><span data-app-copy="copy_97134af30acd1f9608be">перед стартом</span><button class="hof-x" aria-label="закрыть">✕</button></div>
        <div class="hof-prep-body">
            <div class="hof-title hof-p-title">один раунд<br>три фазы</div>
            <div data-app-copy="copy_741a865b867558a882f9" class="hof-p-sub">повторим 3 раза, голос подскажет каждый шаг</div>
            <div class="hof-p-bar" aria-label="дыхание, задержка, восстановление"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
            <div class="hof-p-legend"><span data-app-copy="copy_775e522d1d9376df76d9" class="b1">≈2 мин</span><span class="b2" id="hofHoldLegend">до 1,5 мин</span><span data-app-copy="copy_1a61d48e1e251b4ea07d" class="b3">15 с</span></div>
            <div class="hof-p-cards">
                <div class="hof-p-card is-main"><div class="ic ic-ring" aria-hidden="true"></div><div><b data-app-copy="copy_ffd85f780b9f9ca2313e">30 глубоких вдохов</b><span>полный вдох животом и грудью<br>выдох свободно, без усилия</span></div></div>
                <div class="hof-p-card"><div class="ic ic-timer" id="hofHoldIcon" aria-hidden="true">1:30</div><div><b data-app-copy="copy_efb0f4189f9708ee7a6c">задержка на выдохе</b><span id="hofHoldInstruction">следуй голосу<br>можно перейти к вдоху раньше</span></div></div>
                <div class="hof-p-card"><div class="ic ic-15" aria-hidden="true">15</div><div><b data-app-copy="copy_4e5a6c206918c16c091f">вдох и держим 15 с</b><span>восстановление<br>и следующий раунд</span></div></div>
            </div>
            <div data-app-copy="copy_80c0006e302459340da6" class="hof-mode-label">выбери свой режим</div>
            <div class="hof-modes" role="group" aria-label="режим дыхания">
                <button data-app-copy="copy_4b13a4b1b2059c8820ab" type="button" class="hof-mode" data-mode="guided" aria-pressed="true" aria-describedby="hofGuidedCaption">тренировка</button>
                <button data-app-copy="copy_61353618197ce6487ce0" type="button" class="hof-mode" data-mode="personal" aria-pressed="false" aria-describedby="hofPersonalCaption">в своём темпе</button>
            </div>
            <div class="hof-mode-captions">
                <div id="hofGuidedCaption" data-mode-caption="guided" data-active="true">осваивай технику<br>голос ведёт каждый шаг</div>
                <div id="hofPersonalCaption" data-mode-caption="personal" data-active="false">сам выбирай длительность задержек<br>и отмечай личные рекорды</div>
            </div>
            <button class="hof-btn" id="hofGo">начать ≈11 минут</button>
            <button type="button" class="hof-share" id="hofShare">поделиться трекером</button>
            <div class="hof-p-warn">сидя или лёжа, не в воде и не за рулём<br>закружилась голова, дыши как обычно</div>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-in'));
    const close = () => { ov.classList.remove('is-in'); setTimeout(() => ov.remove(), 250); };
    ov.querySelector('.hof-x').addEventListener('click', () => { haptic(); close(); });
    ov.querySelector('#hofShare').addEventListener('click', () => {
        haptic(); lg('хоф: поделиться трекером');
        const url = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/yaltahiking_bot?startapp=hof')}&text=${encodeURIComponent('трекер дыхания по методу Вима Хофа')}`;
        openLink(url, 'хоф: поделиться', false);
    });
    let mode = 'guided';
    try { if (localStorage.getItem('hof-mode') === 'personal') mode = 'personal'; } catch (e) {}
    const selectMode = value => {
        mode = value;
        ov.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        ov.querySelectorAll('[data-mode-caption]').forEach(c => c.dataset.active = String(c.dataset.modeCaption === mode));
        ov.querySelector('#hofHoldLegend').textContent = mode === 'personal' ? 'твой темп' : 'до 1,5 мин';
        ov.querySelector('#hofHoldIcon').textContent = mode === 'personal' ? '∞' : '1:30';
        ov.querySelector('#hofHoldInstruction').innerHTML = mode === 'personal'
            ? 'задержку заканчиваешь кнопкой<br>голос ждёт, время сохраняется'
            : 'следуй голосу<br>можно перейти к вдоху раньше';
        ov.querySelector('#hofGo').textContent = mode === 'personal' ? 'начать в своём темпе' : 'начать ≈11 минут';
    };
    ov.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { haptic(); selectMode(b.dataset.mode); }));
    selectMode(mode);
    ov.querySelector('#hofGo').addEventListener('click', () => {
        haptic();
        try { localStorage.setItem('hof-mode', mode); } catch (e) {}
        close(); lg(`хоф: начал сессию ${mode}`); openSession(mode);
    });
}

// фаза в момент t: из разметки дорожки
function phaseAt(t) {
    let cur = TIMELINE[0];
    for (const p of TIMELINE) { if (p.t <= t) cur = p; else break; }
    return cur;
}

// значок «три раунда по Хофу» за полную сессию: запись из коллекции человека (для окна значка по кнопке «забрать значок»)
async function findBadge(badge) {
    try {
        const ach = await import('../achievements.js');
        ach.clearAchievementCache();
        const uid = String(state.user?.id || '');
        const items = (await ach.loadAchievementCollections([uid]))[uid] || [];
        const item = items.find(i => i.id === badge.id);
        if (item) lg(`хоф: значок «${item.title}»${badge.count > 1 ? ` ×${badge.count}` : ''}`);
        return item ? { item, owned: items.length } : null;
    } catch (e) { return null; }
}

function openSession(mode = 'guided') {
    const personal = mode === 'personal';
    const ov = document.createElement('div');
    ov.className = 'hof-ov hof-run';
    ov.innerHTML = `
        <div class="hof-round" id="hofRound">приготовься</div>
        <div class="hof-center">
            <div class="hof-rings">
                <div class="r r1"></div><div class="r r2"></div>
                <svg class="hof-arc" viewBox="0 0 270 270" aria-hidden="true"><circle class="trk" cx="135" cy="135" r="124"/><circle class="bar" id="hofArc" cx="135" cy="135" r="124" pathLength="1000"/></svg>
                <div class="hof-core" id="hofCore"></div>
                <div class="hof-num"><b id="hofBig"></b><small id="hofSmall"></small></div>
            </div>
            <div class="hof-phase" id="hofPhase">слушай инструкцию</div>
            <div class="hof-hint" id="hofHint"></div>
            <div class="hof-hist" id="hofHist"></div>
        </div>
        <div class="hof-ctrl">
            <button class="hof-c" id="hofPause" aria-label="пауза">❚❚</button>
            <button class="hof-c hof-c-go" id="hofBreathe" style="display:none">перейти к вдоху</button>
            <button class="hof-c hof-c-x" id="hofClose" aria-label="выйти">✕</button>
        </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-in'));
    const audio = new Audio('assets/hof/voice.m4a');
    audio.preload = 'auto';
    const $ = id => ov.querySelector('#' + id);
    const tracker = createHoldTracker(mode);
    const holds = tracker.holds;
    const completed = new Set();
    const startedAt = performance.now();
    let pauseStarted = null, pausedMs = 0;
    const sessionDuration = () => Math.round((performance.now() - startedAt - pausedMs - (pauseStarted === null ? 0 : performance.now() - pauseStarted)) / 1000);
    const before = (sessions || []).slice(); // сессии до этой, для «лучшая задержка / в прошлый раз»
    let raf = 0, finished = false, lastPhaseKey = '', saveStarted = false;
    try { window.Telegram?.WebApp?.disableVerticalSwipes?.(); } catch (e) {}
    let wake = null;
    try { navigator.wakeLock?.request('screen').then(w => { wake = w; }).catch(() => {}); } catch (e) {}

    audio.addEventListener('timeupdate', () => {
        if (finished || !personal) return;
        const phase = phaseAt(audio.currentTime);
        if (phase.kind === 'hold') { tracker.begin(phase.round); audio.pause(); }
    });
    const paint = () => {
        const t = audio.currentTime;
        const p = phaseAt(t);
        TIMELINE.filter(x => x.kind === 'recover' && x.end <= t).forEach(x => completed.add(x.round));
        const key = `${p.kind}${p.round || ''}`;
        const core = $('hofCore');
        if (key !== lastPhaseKey) {
            lastPhaseKey = key;
            if (p.kind === 'hold') {
                tracker.begin(p.round);
                if (personal) audio.pause();
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('soft'); } catch (e) {}
            } else tracker.discard();
            $('hofPause').style.display = personal && p.kind === 'hold' ? 'none' : '';
            $('hofBreathe').style.display = p.kind === 'hold' ? '' : 'none';
            $('hofHint').textContent = p.kind === 'hold' ? (personal ? 'готов вдохнуть, нажми кнопку' : 'следующая фаза начнётся сама') : '';
            ov.dataset.phase = p.kind;
            $('hofRound').textContent = p.round ? `раунд ${p.round} из 3` : (p.kind === 'end' ? 'раунд 3 из 3 завершаем' : 'приготовься');
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
            core.style.transform = 'scale(0.86)';
            const held = tracker.elapsed();
            // шкала между кольцами: полный круг – минута, следующая минута идёт поверх другим цветом
            const lap = Math.floor(held / 60), arc = $('hofArc');
            arc.style.strokeDashoffset = String(1000 - Math.round((held % 60) / 60 * 1000));
            if (arc.dataset.lap !== String(lap)) {
                arc.dataset.lap = String(lap);
                ov.querySelector('.hof-arc').dataset.lap = String(Math.min(lap, 3));
                if (lap > 0) { try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (e) {} }
            }
            $('hofBig').textContent = mmss(personal ? held : Math.max(0, Math.ceil(p.skipTo - t)));
            $('hofSmall').textContent = personal ? 'задержка на выдохе' : 'до следующей фазы';
            $('hofPhase').textContent = personal ? 'голос ждёт тебя' : 'следуй голосу';
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
            $('hofPhase').textContent = p.kind === 'end' ? 'пусть дыхание нормализуется' : (p.label || 'слушай инструкцию');
            if (p.kind === 'end') $('hofHist').innerHTML = '<span data-app-copy="copy_2e5e08682fca50e48a72">пошевели пальцами рук и ног, не торопись вставать</span>';
        }
        if (!finished) raf = requestAnimationFrame(paint);
    };
    const renderHist = () => {
        $('hofHist').innerHTML = holds.map((h, i) => h ? `<span>раунд ${i + 1} ${mmss(h)}</span>` : '').join('');
    };
    const save = done => {
        const list = holds.filter(Boolean);
        if (saveStarted || (!done && !completed.size && !list.length)) return;
        saveStarted = true;
        api({ op: 'save', mode, duration: sessionDuration(), rounds: completed.size, holds: list, done }).then(j => {
            sessions = j.sessions || sessions; const b = document.getElementById('hofBlock'); if (b) paintBlock(b);
            if (done) onSaved(j.badge || null);
        }).catch(() => {
            const summary = ov.querySelector('.hof-sum');
            if (summary) { const notice = document.createElement('div'); notice.className = 'hs-note'; notice.textContent = 'не удалось сохранить сессию'; summary.appendChild(notice); }
        });
        lg(done ? `хоф: сессия завершена ${personal ? 'в своём темпе' : 'тренировка'}${list.length ? ' ' + list.map(mmss).join(' / ') : ''}` : `хоф: вышел на раунде ${list.length + 1}`);
    };
    // итоги сессии: задержки по раундам, лучшая задержка, сравнение с прошлым разом; значок – по кнопке
    let badgeInfo = null, summaryShown = false;
    const showSummary = () => {
        summaryShown = true;
        const list = holds.filter(Boolean), best = Math.max(0, ...list);
        const prevDone = before.filter(x => x && x.done && (x.rounds || 0) >= 3);
        const prevPersonalDone = personalHofSessions(prevDone);
        const prevHolds = personalHofSessions(before).flatMap(x => Array.isArray(x.holds) ? x.holds : []);
        const record = Math.max(0, ...prevHolds), last = prevPersonalDone.length ? Math.max(0, ...(prevPersonalDone[prevPersonalDone.length - 1].holds || [0])) : 0;
        const nth = prevDone.length + 1, top = Math.max(best, record, 60);
        const isRecord = best > 0 && best > record && prevHolds.length > 0;
        const dur = sessionDuration();
        const rows = list.map((h, i) => `<div class="hs-row"><span>раунд ${i + 1}</span><div class="hs-bar"><b style="width:${Math.max(6, Math.round(h / top * 100))}%"></b></div><em>${mmss(h)}</em></div>`).join('');
        const compare = !prevHolds.length ? '<div data-app-copy="copy_8e85a54ed08954c06c4a" class="hs-note">первый личный результат</div>'
            : `<div class="hs-rec"><div>лучшая задержка<b${isRecord ? ' class="is-new"' : ''}>${mmss(best)}${isRecord ? ' рекорд' : ''}</b></div><div class="r">${isRecord ? 'в прошлый раз' : 'твой рекорд'}<b>${mmss(isRecord ? last || record : record)}</b></div></div>`;
        ov.querySelector('.hof-center').innerHTML = `<div class="hof-sum">
            <div class="hs-chk">✓</div>
            <div data-app-copy="copy_95110b1b0bf7c97dffde" class="hs-t1">три раунда пройдены</div>
            <div class="hs-t2">${Math.floor(dur / 60)} мин ${dur % 60} с<br>${nth}-я сессия</div>
            ${personal && rows ? `<div class="hs-card">${rows}${compare}</div>` : '<div class="hs-note">тренировка завершена<br>личное время не записывали</div>'}
        </div>`;
        ov.querySelector('.hof-ctrl').innerHTML = `<div class="hs-actions">
            <button type="button" class="hs-badge" id="hsBadge" disabled><i></i><span data-app-copy="copy_23d39ccf3a3950788d22">сохраняю…</span></button>
            <button type="button" class="hs-close" id="hsClose">закрыть</button></div>`;
        ov.querySelector('#hsClose').addEventListener('click', () => { haptic(); close(); });
        ov.querySelector('#hsBadge').addEventListener('click', async () => {
            if (!badgeInfo?.item) return;
            haptic();
            lg(`хоф: забрал значок${badgeInfo.count > 1 ? ` ×${badgeInfo.count}` : ''}`);
            close();
            setTimeout(() => import('./achievements-popup.js').then(m => m.openAchievementsPopup([badgeInfo.item], { fresh: true, source: 'дыхание по Хофу', owned: badgeInfo.owned })).catch(() => {}), 300);
        });
        if (badgeInfo) paintBadgeBtn();
        else setTimeout(() => { if (!badgeInfo) { badgeInfo = {}; paintBadgeBtn(); } }, 9000);
    };
    const paintBadgeBtn = () => {
        const b = ov.querySelector('#hsBadge'); if (!b) return;
        if (!badgeInfo?.item) { b.remove(); return; }
        b.disabled = false;
        b.querySelector('i').style.backgroundImage = `url('${badgeInfo.item.medal?.imageUrl || ''}')`;
        b.querySelector('span').textContent = `забрать значок${badgeInfo.count > 1 ? ` ×${badgeInfo.count}` : ''}`;
    };
    const onSaved = async badge => {
        if (!badge?.id) { badgeInfo = {}; if (summaryShown) paintBadgeBtn(); return; }
        const item = await findBadge(badge);
        badgeInfo = item ? { ...item, count: badge.count } : {};
        if (summaryShown) paintBadgeBtn();
    };
    const close = () => {
        finished = true; cancelAnimationFrame(raf); audio.pause();
        try { wake?.release(); } catch (e) {}
        ov.classList.remove('is-in'); setTimeout(() => ov.remove(), 250);
    };
    audio.addEventListener('ended', () => {
        if (finished) return;
        tracker.discard();
        TIMELINE.filter(x => x.kind === 'recover' && x.end <= audio.currentTime).forEach(x => completed.add(x.round));
        finished = true; cancelAnimationFrame(raf);
        save(completed.size === 3);
        ov.dataset.phase = 'end';
        $('hofRound').textContent = 'готово';
        showSummary();
    });
    $('hofPause').addEventListener('click', () => {
        haptic();
        if (personal && phaseAt(audio.currentTime).kind === 'hold') return;
        if (audio.paused) {
            audio.play().then(() => {
                if (pauseStarted !== null) { pausedMs += performance.now() - pauseStarted; pauseStarted = null; }
                $('hofPause').textContent = '❚❚';
            }).catch(() => {});
        } else { audio.pause(); pauseStarted = performance.now(); $('hofPause').textContent = '▶'; }
    });
    $('hofBreathe').addEventListener('click', () => {
        haptic();
        const p = phaseAt(audio.currentTime);
        if (finished || p.kind !== 'hold' || !p.skipTo) return;
        tracker.confirm();
        audio.currentTime = p.skipTo;
        renderHist();
        if (pauseStarted !== null) { pausedMs += performance.now() - pauseStarted; pauseStarted = null; }
        audio.play().then(() => { $('hofPause').textContent = '❚❚'; }).catch(() => { $('hofPause').textContent = '▶'; });
    });
    $('hofClose').addEventListener('click', () => { haptic(); if (!audio.ended) save(false); close(); });
    audio.play().then(() => { raf = requestAnimationFrame(paint); }).catch(() => {
        $('hofPhase').textContent = 'нажми ▶, чтобы включить голос';
        $('hofPause').textContent = '▶';
        raf = requestAnimationFrame(paint);
    });
}
