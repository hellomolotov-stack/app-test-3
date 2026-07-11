import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { openOnboardingChat } from './onboarding-chat.js';
import { getLumenGreeting, getLumenSegment } from '../lumen/config.js';
import { canShowLumenPrompt, disableLumenPrompts, markLumenClosed, markLumenSeen, registerLumenVisit, isLumenDisabled, getLumenState } from '../lumen/state.js';

let root = null;
let introBubble = null;
let context = { screen: 'home', action: null, scenario: 'home' };
let promptTimer = null;
let observer = null;
let firstHikePending = false;
let hikesCount = 0;
let promptReady = false;
let userStatus = 'inactive';

function analytics(name, meta = {}) { log(name, state.userCard?.status !== 'active', state.user, meta); }

function currentContext() { return { ...context, route: context.route ? { ...context.route } : undefined }; }

function openChatWithNode(node) {
    haptic();
    hideIntroBubble();
    hidePrompt();
    analytics('lumen_opened', { screen: context.screen || 'home', node });
    openOnboardingChat(node, currentContext(), true);
}

function openChat() {
    analytics('lumen_opened', { screen: context.screen || 'home', action: context.action || '' });
    hidePrompt();
    openOnboardingChat(null, currentContext(), true);
}

// ── обычный prompt (для повторных визитов) ──────────────────────────────────

function hidePrompt() {
    root?.querySelector('.lumen-prompt')?.classList.remove('is-visible');
}

function showPrompt() {
    if (!root || !promptReady || isLumenDisabled()) return;
    const scenarioKey = context.scenario || context.screen || 'home';
    if (!canShowLumenPrompt(scenarioKey)) return;
    const prompt = root.querySelector('.lumen-prompt');
    const segment = currentSegment();
    const greeting = getLumenGreeting(segment);
    prompt.querySelector('.lumen-prompt-text').textContent = greeting;
    prompt.classList.add('is-visible');
    markLumenSeen(scenarioKey);
    analytics('lumen_prompt_shown', { scenario: scenarioKey, segment });
    promptTimer = setTimeout(hidePrompt, 9000);
}

// ── сегмент пользователя ─────────────────────────────────────────────────────

function currentSegment() {
    return getLumenSegment({
        status: userStatus,
        hikesCount,
        visits: getLumenState().visits || 1,
    });
}

// Кнопки интро-облачка под каждый сегмент.
// node — узел FLOW чат-бота, который откроется по нажатию.
function introButtonsFor(segment) {
    const userName = state.user?.first_name?.trim();
    switch (segment) {
        case 'first_time':
            return [
                { label: userName || 'это я', node: 'lumen_greet_name' },
                { label: 'а ты кто?', node: 'lumen_about' },
            ];
        case 'visited_no_hike':
            return [
                { label: 'найти хайк', node: 'about' },
                { label: 'есть сомнения…', node: 'doubts' },
            ];
        case 'hiker':
            return [
                { label: 'выбрать маршрут', node: 'welcome_back' },
                { label: 'что даёт карта?', node: 'card' },
            ];
        case 'card_step':
            return [
                { label: 'расскажи про карту', node: 'card' },
                { label: 'пока просто хайк', node: 'welcome_back' },
            ];
        case 'member':
        default:
            return [
                { label: 'что мне доступно?', node: 'member_perks' },
                { label: 'задать вопрос', node: 'support' },
            ];
    }
}

// ── интро-облачко с кнопками ─────────────────────────────────────────────────

function hideIntroBubble() {
    introBubble?.classList.remove('is-visible');
    clearTimeout(promptTimer);
}

function showIntroBubble() {
    if (!root || isLumenDisabled()) return;

    const segment = currentSegment();
    const greeting = getLumenGreeting(segment);
    const buttons = introButtonsFor(segment);

    introBubble = document.createElement('div');
    introBubble.className = 'lumen-intro-bubble';
    introBubble.innerHTML = `
        <button class="lumen-intro-close" aria-label="закрыть">×</button>
        <p class="lumen-intro-text">${greeting.replace(/\n/g, '<br>')}</p>
        <div class="lumen-intro-btns">
            ${buttons.map((b, i) => `<button class="lumen-intro-btn" data-idx="${i}">${b.label}</button>`).join('')}
        </div>`;

    root.appendChild(introBubble);
    analytics('lumen_intro_shown', { segment });

    requestAnimationFrame(() => introBubble?.classList.add('is-visible'));

    introBubble.querySelector('.lumen-intro-close').addEventListener('click', (e) => {
        e.stopPropagation();
        hideIntroBubble();
        analytics('lumen_intro_closed', { segment });
    });

    introBubble.querySelectorAll('.lumen-intro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const b = buttons[Number(btn.dataset.idx)];
            if (!b) return;
            openChatWithNode(b.node);
            analytics('lumen_intro_btn_clicked', { segment, node: b.node });
        });
    });

    // автоскрытие через 20 секунд
    promptTimer = setTimeout(hideIntroBubble, 20000);
}

// ── поза ────────────────────────────────────────────────────────────────────

function setPose() {
    const img = root?.querySelector('.lumen-image');
    root?.classList.remove('lumen-peek');
    root?.classList.add('lumen-sitting');
    if (img) { img.src = 'assets/lumen/sitting.png'; img.alt = 'Люмен'; }
}

// ── публичные функции ────────────────────────────────────────────────────────

export function setLumenContext(next = {}) {
    context = { screen: 'home', ...next };
    setPose();
}

export function setLumenEligibility({ firstHikePending: pending = false, hikesCount: hikes = 0, status = 'inactive' } = {}) {
    firstHikePending = !!pending;
    hikesCount = hikes;
    userStatus = status;
    promptReady = true;
    clearTimeout(promptTimer);
    promptTimer = setTimeout(showIntroBubble, 2500);
}

export function mountLumen(initialContext = {}) {
    if (root) { setLumenContext(initialContext); return; }
    registerLumenVisit();
    context = { screen: 'home', ...initialContext };
    root = document.createElement('aside');
    root.className = 'lumen-root lumen-sitting';
    root.setAttribute('aria-label', 'Люмен, помощник клуба');
    root.innerHTML = `
        <div class="lumen-prompt" role="status">
            <button class="lumen-prompt-close" aria-label="закрыть подсказку">×</button>
            <button class="lumen-prompt-open"><span class="lumen-prompt-text"></span></button>
            <button class="lumen-prompt-disable">не показывать подсказки</button>
        </div>
        <button class="lumen-character" aria-label="открыть чат с Люменом">
            <span class="lumen-glow"></span>
            <img class="lumen-image" src="assets/lumen/sitting.png" alt="Люмен">
        </button>`;
    document.body.appendChild(root);
    observer = new MutationObserver(() => {
        root?.classList.toggle('lumen-muted', !!document.querySelector('.bottom-sheet-overlay'));
    });
    observer.observe(document.body, { childList: true });
    setPose();
    analytics('lumen_impression', { screen: context.screen || 'home' });
    root.querySelector('.lumen-character').addEventListener('click', () => { haptic(); openChat(); });
    root.querySelector('.lumen-prompt-open').addEventListener('click', () => { haptic(); openChat(); });
    root.querySelector('.lumen-prompt-close').addEventListener('click', (event) => {
        event.stopPropagation();
        const id = context.scenario || context.screen || 'home';
        markLumenClosed(id); hidePrompt(); analytics('lumen_message_closed', { scenario: id });
    });
    root.querySelector('.lumen-prompt-disable').addEventListener('click', (event) => {
        event.stopPropagation(); disableLumenPrompts(); hidePrompt(); analytics('lumen_prompt_disabled');
    });
}

export function showLumenPrompt() { clearTimeout(promptTimer); promptTimer = setTimeout(showPrompt, 350); }
export function unmountLumen() { clearTimeout(promptTimer); observer?.disconnect(); observer = null; root?.remove(); root = null; introBubble = null; }
