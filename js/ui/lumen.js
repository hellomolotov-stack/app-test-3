import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { openOnboardingChat } from './onboarding-chat.js';
import { getLumenScenario, LUMEN_POSES } from '../lumen/config.js';
import { canShowLumenPrompt, disableLumenPrompts, markLumenClosed, markLumenSeen, registerLumenVisit, isLumenDisabled } from '../lumen/state.js';

let root = null;
let context = { screen: 'home', action: null, scenario: 'home' };
let promptTimer = null;
let observer = null;

function analytics(name, meta = {}) { log(name, state.userCard?.status !== 'active', state.user, meta); }

function currentContext() { return { ...context, route: context.route ? { ...context.route } : undefined }; }

function openChat() {
    const scenario = getLumenScenario(context);
    analytics('lumen_opened', { screen: context.screen || 'home', action: context.action || '' });
    hidePrompt();
    openOnboardingChat(scenario.next, currentContext());
    analytics('lumen_chat_opened', { screen: context.screen || 'home' });
}

function hidePrompt() {
    root?.querySelector('.lumen-prompt')?.classList.remove('is-visible');
}

function showPrompt() {
    if (!root || isLumenDisabled()) return;
    const scenarioKey = context.scenario || context.screen || 'home';
    if (!canShowLumenPrompt(scenarioKey)) return;
    const scenario = getLumenScenario(context);
    const prompt = root.querySelector('.lumen-prompt');
    prompt.querySelector('.lumen-prompt-text').textContent = scenario.message;
    prompt.classList.add('is-visible');
    markLumenSeen(scenarioKey);
    analytics('lumen_message_shown', { scenario: scenarioKey, screen: context.screen || 'home' });
    promptTimer = setTimeout(hidePrompt, 9000);
}

function setPose() {
    const pose = LUMEN_POSES[context.scenario] || LUMEN_POSES[context.screen] || LUMEN_POSES.default;
    const img = root?.querySelector('.lumen-image');
    if (img) { img.src = `assets/lumen/${pose}.png`; img.alt = 'Люмен'; }
}

export function setLumenContext(next = {}) {
    context = { screen: 'home', ...next };
    setPose();
}

export function mountLumen(initialContext = {}) {
    if (root) { setLumenContext(initialContext); return; }
    registerLumenVisit();
    context = { screen: 'home', ...initialContext };
    root = document.createElement('aside');
    root.className = 'lumen-root';
    root.setAttribute('aria-label', 'Люмен, помощник клуба');
    root.innerHTML = `
        <div class="lumen-prompt" role="status">
            <button class="lumen-prompt-close" aria-label="закрыть подсказку">×</button>
            <button class="lumen-prompt-open"><span class="lumen-prompt-text"></span></button>
            <button class="lumen-prompt-disable">не показывать подсказки</button>
        </div>
        <button class="lumen-character" aria-label="открыть чат с Люменом">
            <span class="lumen-glow"></span>
            <img class="lumen-image" src="assets/lumen/standing.png" alt="Люмен">
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
    promptTimer = setTimeout(showPrompt, 1400);
}

export function showLumenPrompt() { clearTimeout(promptTimer); promptTimer = setTimeout(showPrompt, 350); }
export function unmountLumen() { clearTimeout(promptTimer); observer?.disconnect(); observer = null; root?.remove(); root = null; }
