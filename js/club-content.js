import { state, saveCachedState } from './state.js';

let pending = null;

export function loadClubContent() {
    if (!pending) {
        pending = fetch('/api/club-content', { cache: 'no-store', signal: AbortSignal.timeout(12000) })
            .then(async response => {
                if (!response.ok) throw new Error('не удалось загрузить данные главной');
                return response.json();
            }).finally(() => { pending = null; });
    }
    return pending;
}

export function applyClubContent(content) {
    if (content.metrics) state.metrics = content.metrics;
    if (content.updates) state.updates = content.updates;
    saveCachedState();
    window.dispatchEvent(new CustomEvent('club:content-updated'));
}

export async function saveClubContent(section, value, revision, initData) {
    const response = await fetch('/api/club-content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000), body: JSON.stringify({ section, value, revision, initData }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'не удалось сохранить');
    applyClubContent({ [section]: data.value });
    return data.value;
}
