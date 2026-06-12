// js/ui/bot-nudge.js
// Облачко-спутник: вылетает снизу-слева с мотивирующим текстом и зовёт открыть
// чат с ботом. Спроектировано так, чтобы НЕ задёргивать пользователя.
//
// Логика антидокучливости (все пороги — в константах ниже):
//   • только гостям (у кого нет карты)
//   • один раз за сессию
//   • не чаще раза в SHOW_GAP_MS между визитами
//   • появляется через APPEAR_DELAY_MS после входа, только если экран чист
//   • само уезжает через AUTO_HIDE_MS, если не нажали
//   • закрыл крестиком → молчим DISMISS_BACKOFF_MS
//   • открыл чат хоть раз → больше никогда не показываем

import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { openOnboardingChat } from './onboarding-chat.js';

// ── настройки (подкрути при необходимости) ──────────────────
const APPEAR_DELAY_MS    = 15000;            // через сколько после входа показать
const AUTO_HIDE_MS       = 10000;            // сколько висит, если не трогают
const SHOW_GAP_MS        = 6 * 60 * 60 * 1000;   // минимум между показами (6 ч)
const DISMISS_BACKOFF_MS = 5 * 24 * 60 * 60 * 1000; // молчим после крестика (5 дней)

// ключи localStorage
const K_OPENED     = 'botNudge_opened';        // открыл чат — больше не показываем
const K_LAST_SHOWN = 'botNudge_lastShown';     // когда показывали в последний раз
const K_BACKOFF    = 'botNudge_backoffUntil';  // молчим до этого времени
const K_LAST_PHRASE = 'botNudge_lastPhrase';   // индекс прошлой фразы (без повторов)

// ── фразы (ротация, стиль клуба — строчными) ────────────────
const PHRASES = [
    'есть минутка? покажу, как тут всё устроено 🏔',
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

let shownThisSession = false;
let nudgeEl = null;
let autoHideTimer = null;

function pickPhrase() {
    const last = parseInt(localStorage.getItem(K_LAST_PHRASE) ?? '-1', 10);
    let idx = Math.floor(Math.random() * PHRASES.length);
    if (PHRASES.length > 1 && idx === last) idx = (idx + 1) % PHRASES.length;
    localStorage.setItem(K_LAST_PHRASE, String(idx));
    return PHRASES[idx];
}

function screenIsBusy() {
    // не мешаем, если открыта шторка, модалка, меню или оверлей профиля
    if (document.querySelector('.bottom-sheet-overlay')) return true;
    if (document.querySelector('.modal-overlay')) return true;
    if (document.querySelector('.profile-blur-overlay')) return true;
    if (document.querySelector('.center-floating-btn, .guest-center-btn')) return true;
    if (window.isMenuActive) return true;
    const popup = document.querySelector('.more-popup.show, #morePopup.show');
    if (popup) return true;
    return false;
}

function eligible() {
    if (shownThisSession) return false;
    if (!state.user?.id) return false;
    // только гостям — владельцам карты онбординг не нужен
    if (state.userCard?.status === 'active') return false;
    if (localStorage.getItem(K_OPENED) === '1') return false;

    const now = Date.now();
    const backoff = parseInt(localStorage.getItem(K_BACKOFF) ?? '0', 10);
    if (now < backoff) return false;
    const lastShown = parseInt(localStorage.getItem(K_LAST_SHOWN) ?? '0', 10);
    if (now - lastShown < SHOW_GAP_MS) return false;

    return true;
}

function removeNudge() {
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
    if (!nudgeEl) return;
    nudgeEl.classList.remove('visible');
    const el = nudgeEl;
    nudgeEl = null;
    setTimeout(() => el.remove(), 400);
}

function render(phrase) {
    nudgeEl = document.createElement('div');
    nudgeEl.className = 'bot-nudge';
    nudgeEl.innerHTML = `
        <div class="bot-nudge-avatar">🏔</div>
        <div class="bot-nudge-text">${phrase}</div>
        <button class="bot-nudge-close" aria-label="закрыть">✕</button>
    `;
    document.body.appendChild(nudgeEl);

    // тап по облачку (кроме крестика) — открываем чат
    nudgeEl.addEventListener('click', (e) => {
        if (e.target.closest('.bot-nudge-close')) return;
        haptic();
        localStorage.setItem(K_OPENED, '1');   // нашёл — больше не зовём
        log('облачко → чат с ботом', true, state.user);
        removeNudge();
        openOnboardingChat();
    });

    // крестик — отступаем надолго
    nudgeEl.querySelector('.bot-nudge-close').addEventListener('click', (e) => {
        e.stopPropagation();
        haptic();
        localStorage.setItem(K_BACKOFF, String(Date.now() + DISMISS_BACKOFF_MS));
        log('облачко закрыто', true, state.user);
        removeNudge();
    });

    requestAnimationFrame(() => nudgeEl?.classList.add('visible'));
    autoHideTimer = setTimeout(removeNudge, AUTO_HIDE_MS);
}

// планирует показ облачка с учётом всех правил
export function scheduleBotNudge() {
    setTimeout(() => {
        if (!eligible()) return;
        if (screenIsBusy()) return;   // экран занят — тихо пропускаем этот визит
        shownThisSession = true;
        localStorage.setItem(K_LAST_SHOWN, String(Date.now()));
        log('облачко показано', true, state.user);
        render(pickPhrase());
    }, APPEAR_DELAY_MS);
}
