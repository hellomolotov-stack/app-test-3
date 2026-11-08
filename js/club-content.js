import { state, saveCachedState } from './state.js';

let pending = null;
let metricsPending = null;
export function refreshClubMetrics() {
    if (!metricsPending) metricsPending = fetch('/api/club-content?metrics=1', { cache: 'no-store', signal: AbortSignal.timeout(12000) })
        .then(r => { if (!r.ok) throw new Error('цифры клуба недоступны'); return r.json(); })
        .then(data => {
            if (data.metrics && JSON.stringify(data.metrics) !== JSON.stringify(state.metrics)) {
                state.metrics = data.metrics; saveCachedState();
                window.dispatchEvent(new Event('club:metrics-updated'));
            }
            return data.metrics;
        })
        .finally(() => { metricsPending = null; });
    return metricsPending;
}
let metricsStarted = false, refreshTimer;
export function startClubMetricsRefresh() {
    if (metricsStarted) return;
    metricsStarted = true;
    const refresh = () => {
        if (document.visibilityState !== 'hidden') refreshClubMetrics().catch(e => console.warn('metrics refresh:', e.message));
    };
    const schedule = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 400); };
    window.addEventListener('club:hikes-updated', schedule);
    window.addEventListener('club:metrics-refresh', schedule);
    document.addEventListener('visibilitychange', refresh);
    setInterval(refresh, 60000);
    refresh();
}

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
    if (content.masterminds) state.mastermindSummaries = content.masterminds;
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
