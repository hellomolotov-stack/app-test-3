// js/ui/bot-nudge.js
// Постоянный язычок-слайдер слева (чуть выше середины) — всегда висит для гостей.
// В стиле iOS-26 liquid glass + акценты приложения. Лёгкая анимация «выглядывает»
// вправо, намекая что активный. По тапу вылетает облачко с рандомной фразой,
// по тапу на облачко открывается встроенный чат с ботом.

import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { openOnboardingChat } from './onboarding-chat.js';

const BUBBLE_AUTO_HIDE_MS = 9000;   // облачко само прячется, если не нажали
const K_LAST_PHRASE = 'botNudge_lastPhrase';

// ── фразы (ротация без повтора, стиль клуба — строчными) ─────
const PHRASES = [
    'первый раз у нас? давай познакомлю с клубом',
    'загляни — расскажу про хайки и карту за пару минут',
    'привет 👋 хочешь, проведу по клубу?',
    'не знаешь, с чего начать? спроси меня',
    'первый хайк — бесплатный. рассказать подробнее?',
    'тут уютнее, чем кажется. показать, что внутри? 🤍',
    'пара вопросов — и поймёшь, твоё ли это место',
    'расскажу про клуб без воды — буквально за 2 минуты',
    'горы, события, свои люди. любопытно? загляни',
];

let wrap = null;
let bubble = null;
let autoHideTimer = null;

function pickPhrase() {
    const last = parseInt(localStorage.getItem(K_LAST_PHRASE) ?? '-1', 10);
    let idx = Math.floor(Math.random() * PHRASES.length);
    if (PHRASES.length > 1 && idx === last) idx = (idx + 1) % PHRASES.length;
    localStorage.setItem(K_LAST_PHRASE, String(idx));
    return PHRASES[idx];
}

function hideBubble() {
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
    bubble?.classList.remove('visible');
    wrap?.classList.remove('open');
}

function showBubble() {
    if (!bubble) return;
    bubble.querySelector('.bot-tab-bubble-text').textContent = pickPhrase();
    bubble.classList.add('visible');
    wrap.classList.add('open');
    log('язычок раскрыт', true, state.user);
    if (autoHideTimer) clearTimeout(autoHideTimer);
    autoHideTimer = setTimeout(hideBubble, BUBBLE_AUTO_HIDE_MS);
}

function toggleBubble() {
    if (bubble?.classList.contains('visible')) hideBubble();
    else showBubble();
}

export function mountBotTab() {
    // только гостям — владельцам карты онбординг-зов не нужен
    if (state.userCard?.status === 'active') return;
    if (document.querySelector('.bot-tab-wrap')) return;   // уже смонтирован

    wrap = document.createElement('div');
    wrap.className = 'bot-tab-wrap';
    wrap.innerHTML = `
        <button class="bot-tab" aria-label="помощник интеллигенции">
            <span class="bot-tab-emoji">💬</span>
            <span class="bot-tab-chevron">›</span>
        </button>
        <div class="bot-tab-bubble">
            <div class="bot-tab-bubble-avatar">💬</div>
            <div class="bot-tab-bubble-body">
                <div class="bot-tab-bubble-name">помощник интеллигенции</div>
                <div class="bot-tab-bubble-text"></div>
            </div>
            <button class="bot-tab-bubble-close" aria-label="закрыть">✕</button>
        </div>
    `;
    document.body.appendChild(wrap);

    bubble = wrap.querySelector('.bot-tab-bubble');

    wrap.querySelector('.bot-tab').addEventListener('click', () => { haptic(); toggleBubble(); });

    // тап по облачку (кроме крестика) — открываем чат
    bubble.addEventListener('click', (e) => {
        if (e.target.closest('.bot-tab-bubble-close')) return;
        haptic();
        log('язычок → чат с ботом', true, state.user);
        hideBubble();
        openOnboardingChat();
    });

    bubble.querySelector('.bot-tab-bubble-close').addEventListener('click', (e) => {
        e.stopPropagation();
        haptic();
        hideBubble();
    });
}

// убрать язычок (напр. если человек стал владельцем карты)
export function unmountBotTab() {
    wrap?.remove();
    wrap = null;
    bubble = null;
}
