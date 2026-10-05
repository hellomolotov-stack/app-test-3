// Прежний постоянный язычок помощника для пользователей вне Lumen-пилота.
// Кроме случайных фраз по нажатию, язычок сам реагирует на поведение (см. REACTIONS):
// экраны шлют window-событие 'club:act' {type, ...}, а здесь решаем, сказать ли что-то к месту.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { openOnboardingChat } from './onboarding-chat.js';

const BUBBLE_AUTO_HIDE_MS = 9000;
const K_LAST_PHRASE = 'botNudge_lastPhrase';

const PHRASES_GUEST = [
    'первый раз у нас? давай познакомлю с клубом',
    'загляни – расскажу про хайки и карту за пару минут',
    'привет 👋 хочешь, проведу по клубу?',
    'не знаешь, с чего начать? спроси меня',
    'первый хайк – по разовому билету за 1000 ₽. рассказать подробнее?',
    'тут уютнее, чем кажется. показать, что внутри? 🤍',
    'пара вопросов – и поймёшь, твоё ли это место',
    'расскажу про клуб без воды – буквально за 2 минуты',
    'горы, события, свои люди. любопытно? загляни',
];

const PHRASES_MEMBER = [
    'есть вопрос? напиши – организаторы ответят 🤍',
    'что-то нужно? просто напиши',
    'привет 👋 чем могу помочь?',
    'написать организаторам – здесь',
];

let wrap = null;
let bubble = null;
let autoHideTimer = null;
let bubbleAction = null;   // что сделать по нажатию на пузырь (по умолчанию – открыть чат)
let pending = null;        // отложенная реакция: { key, timer }

// ==================== РЕАКЦИИ НА ПОВЕДЕНИЕ ====================
const K_REACT = 'botNudge_react';          // { key: ts последнего показа }
const REACT_GAP_MS = 10 * 60 * 1000;       // не чаще одной реакции в 10 минут
const DAY = 24 * 3600 * 1000;

const isMember = () => state.userCard?.status === 'active';
const wentWithUs = () => Object.keys(state._userRegs || {}).some(d => state._userRegs[d] === true && new Date(d) < new Date(new Date().toDateString()));
const openCard = (source) => import('./card-sheet.js').then(m => m.openCardSheet({ source }));

// key: { text, action, cooldown, delay, when }
const REACTIONS = {
    // потёр карту до конца, но «узнать» так и не нажал
    scratched_idle: {
        text: 'интересно, что за картой? 👀 покажу, что она даёт',
        action: () => openCard('язычок: потёр карту'), cooldown: 3 * DAY, delay: 12000,
        when: () => !isMember()
    },
    // посмотрел карту и закрыл без покупки
    card_left: {
        text: 'остались вопросы по карте? напиши – отвечу как есть 🤍',
        action: null, cooldown: 2 * DAY, delay: 25000,
        when: () => !isMember()
    },
    // открыл хайк, закрыл и не записался
    hike_left: {
        text: 'присмотрел хайк? на первый можно по билету за 1000 ₽ – помогу записаться',
        action: null, cooldown: 2 * DAY, delay: 20000,
        when: () => !isMember() && !wentWithUs()
    },
    // уже ходил по билету, карты нет – один раз за визит, через паузу после входа
    returning_guest: {
        text: 'рады, что ты уже был с нами 🏔 рассказать, как ходить дальше без билетов?',
        action: () => openCard('язычок: уже ходил'), cooldown: 4 * DAY, delay: 7000,
        when: () => !isMember() && wentWithUs()
    },
};

function readReact() { try { return JSON.parse(localStorage.getItem(K_REACT) || '{}') || {}; } catch (e) { return {}; } }

function canReact(key) {
    const r = REACTIONS[key];
    if (!r || !wrap || !r.when()) return false;
    const seen = readReact();
    const now = Date.now();
    if (seen[key] && now - seen[key] < r.cooldown) return false;
    const lastAny = Math.max(0, ...Object.values(seen).map(Number).filter(Boolean));
    return now - lastAny >= REACT_GAP_MS;
}

// шторки и чат поверх – не перебиваем, ждём ещё
const busy = () => !!document.querySelector('.bottom-sheet-overlay, .cs-overlay, .modal.show, .popup-overlay.visible');

function schedule(key) {
    if (!canReact(key)) return;
    cancelPending();
    const r = REACTIONS[key];
    const fire = (tries) => {
        if (!canReact(key)) return;
        if (busy() || bubble?.classList.contains('visible')) {
            if (tries > 0) pending = { key, timer: setTimeout(() => fire(tries - 1), 8000) };
            return;
        }
        pending = null;
        const seen = readReact(); seen[key] = Date.now();
        try { localStorage.setItem(K_REACT, JSON.stringify(seen)); } catch (e) {}
        showBubble(r.text, r.action, key);
    };
    pending = { key, timer: setTimeout(() => fire(5), r.delay) };
}

function cancelPending(key) {
    if (!pending || (key && pending.key !== key)) return;
    clearTimeout(pending.timer);
    pending = null;
}

function onAct(e) {
    const { type, ...d } = e.detail || {};
    switch (type) {
        case 'card_scratched': schedule('scratched_idle'); break;
        case 'card_sheet_open': cancelPending('scratched_idle'); cancelPending('card_left'); break;
        case 'card_sheet_close': if (!d.bought && d.ms > 5000) schedule('card_left'); break;
        case 'card_buy': cancelPending(); break;
        case 'hike_open': cancelPending('hike_left'); break;
        case 'hike_close': if (d.ms > 6000 && !d.registered) schedule('hike_left'); break;
        case 'hike_registered': cancelPending(); break;
    }
}

function pickPhrase() {
    const phrases = state.userCard?.status === 'active' ? PHRASES_MEMBER : PHRASES_GUEST;
    const last = parseInt(localStorage.getItem(K_LAST_PHRASE) ?? '-1', 10);
    let idx = Math.floor(Math.random() * phrases.length);
    if (phrases.length > 1 && idx === last) idx = (idx + 1) % phrases.length;
    localStorage.setItem(K_LAST_PHRASE, String(idx));
    return phrases[idx];
}

function hideBubble() {
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
    bubbleAction = null;
    bubble?.classList.remove('visible');
    wrap?.classList.remove('open');
}

function showBubble(text, action = null, reaction = '') {
    if (!bubble) return;
    bubble.querySelector('.bot-tab-bubble-text').textContent = text || pickPhrase();
    bubbleAction = action ? { run: action, reaction } : (reaction ? { run: null, reaction } : null);
    bubble.classList.add('visible');
    wrap.classList.add('open');
    log(reaction ? `язычок: реакция ${reaction}` : 'язычок раскрыт', true, state.user);
    if (autoHideTimer) clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(hideBubble, BUBBLE_AUTO_HIDE_MS);
}

function toggleBubble() {
    if (bubble?.classList.contains('visible')) hideBubble();
    else showBubble();
}

export function mountBotTab() {
    if (document.querySelector('.bot-tab-wrap')) return;
    wrap = document.createElement('div');
    wrap.className = 'bot-tab-wrap';
    wrap.innerHTML = `
        <button class="bot-tab" aria-label="интеллигентный помощник">
            <span class="bot-tab-emoji">💬</span>
            <span class="bot-tab-chevron">›</span>
        </button>
        <div class="bot-tab-bubble">
            <div class="bot-tab-bubble-avatar">💬</div>
            <div class="bot-tab-bubble-body">
                <div class="bot-tab-bubble-name">интеллигентный помощник</div>
                <div class="bot-tab-bubble-text"></div>
            </div>
            <button class="bot-tab-bubble-close" aria-label="закрыть">✕</button>
        </div>`;
    document.body.appendChild(wrap);
    bubble = wrap.querySelector('.bot-tab-bubble');
    wrap.querySelector('.bot-tab').addEventListener('click', () => { haptic(); toggleBubble(); });
    bubble.addEventListener('click', (e) => {
        if (e.target.closest('.bot-tab-bubble-close')) return;
        haptic();
        const act = bubbleAction;
        hideBubble();
        if (act?.run) { log(`язычок: нажал реакцию ${act.reaction}`, true, state.user); act.run(); return; }
        log(act?.reaction ? `язычок: нажал реакцию ${act.reaction} → чат` : 'язычок → чат с ботом', true, state.user);
        openOnboardingChat();
    });
    bubble.querySelector('.bot-tab-bubble-close').addEventListener('click', (e) => {
        e.stopPropagation();
        haptic();
        if (bubbleAction?.reaction) log(`язычок: закрыл реакцию ${bubbleAction.reaction}`, true, state.user);
        hideBubble();
    });
    window.addEventListener('club:act', onAct);
    // данные о прошлых хайках приходят не сразу – проверяем чуть позже
    setTimeout(() => schedule('returning_guest'), 8000);
}

// Подсказка язычка без открытия чата (для входа по старой ссылке startapp=bot).
// false – язычка нет (например, Lumen-пилот), тогда вызывающий откроет чат сам.
export function showBotTabHint() {
    if (!wrap || !bubble) return false;
    // reaction 'bot_link' – в журнале «язычок: реакция bot_link», нажатие откроет чат
    showBubble('привет 👋 я помощник клуба – отвечу на вопросы про хайки и карту. нажми, чтобы начать', null, 'bot_link');
    return true;
}

export function unmountBotTab() {
    cancelPending();
    window.removeEventListener('club:act', onAct);
    hideBubble();
    wrap?.remove();
    wrap = null;
    bubble = null;
}
