import { state } from '../state.js';
import { haptic } from '../utils.js';
import { setUserInteracted } from './common.js';

function canOpenSoloHiking() {
    return state.userCard?.status === 'active'
        && Boolean(state.user?.id)
        && Boolean(window.Telegram?.WebApp?.initData);
}

export function soloHikingEntryHtml() {
    if (!canOpenSoloHiking()) return '';
    return `<button type="button" class="solo-entry" id="soloHikingEntry">
        <svg class="solo-entry-track" viewBox="0 0 128 84" aria-hidden="true">
            <path d="M21 56 L35 51 42 58 55 45 60 32 68 34 75 27 80 39 91 36 102 27"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="21" cy="56" r="2.5" fill="currentColor"/><circle cx="102" cy="27" r="2.5" fill="currentColor"/>
        </svg>
        <strong data-app-copy="copy_378061d5104acdfdc7c9">соло хайкинг</strong>
        <span data-app-copy="copy_0c8b91b2e9b347d4b40d">треки и гайды для самостоятельных хайков</span>
        <b>открыть маршруты <i aria-hidden="true">›</i></b>
    </button>`;
}

export function bindSoloHikingEntry(root, back) {
    const entry = root.querySelector('#soloHikingEntry');
    entry?.addEventListener('click', async () => {
        if (!canOpenSoloHiking() || entry.disabled) return;
        haptic();
        setUserInteracted();
        const scrollY = window.scrollY;
        const uid = String(state.user.id);
        entry.disabled = true;
        entry.setAttribute('aria-busy', 'true');
        try {
            const { openSoloHiking } = await import('./solo-hiking.js');
            if (!entry.isConnected || !canOpenSoloHiking() || String(state.user.id) !== uid) return;
            await openSoloHiking(uid, () => {
                back();
                requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
            });
        } catch (error) {
            console.error('Соло хайкинг:', error);
            if (entry.isConnected) entry.querySelector('b').textContent = 'попробовать ещё раз';
        } finally {
            entry.disabled = false;
            entry.removeAttribute('aria-busy');
        }
    });
}
