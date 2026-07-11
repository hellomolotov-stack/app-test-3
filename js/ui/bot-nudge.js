// Прежний постоянный язычок помощника для пользователей вне Lumen-пилота.
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
    'первый хайк – бесплатный. рассказать подробнее?',
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

export function unmountBotTab() {
    hideBubble();
    wrap?.remove();
    wrap = null;
    bubble = null;
}
