import { state } from './state.js';

export const RULES_VERSION = 'pilot-2026-10-09';
export const admission = { application: null, error: '', loading: false, serverOffset: 0 };
export const REVIEW_DURATION = 24 * 60 * 60 * 1000;
let loading = null;
let generation = 0;

export function isAdmissionPilot() {
    return !!state.user?.id && String(state.user.username || '').replace(/^@/, '').toLowerCase() === 'hellointelligent';
}

export function applyAdmissionVisitorMode() {
    if (!isAdmissionPilot() || state.userCard?._admissionPreview) return;
    state._admissionRealCard = state.userCard;
    state.userCard = { status: 'inactive', hikes: 0, cardUrl: '', _admissionPreview: true };
}

export async function admissionRequest(action, values = {}) {
    const startedAt = Date.now();
    const response = await fetch('/api/admission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, action, initData: window.Telegram?.WebApp?.initData || '' }),
        signal: AbortSignal.timeout(30000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('не удалось загрузить ответ клуба'); }
    if (!response.ok) throw new Error(data.error || 'не удалось связаться с клубом');
    if (Number.isFinite(data.serverNow)) admission.serverOffset = data.serverNow - (startedAt + Date.now()) / 2;
    return data;
}

export function reviewWindow(createdAt, now = Date.now() + admission.serverOffset) {
    const start = Number(createdAt);
    if (!Number.isFinite(start) || start <= 0) return null;
    const elapsed = Math.max(0, Math.min(REVIEW_DURATION, now - start));
    const seconds = Math.ceil((REVIEW_DURATION - elapsed) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return {
        elapsed, remaining: REVIEW_DURATION - elapsed, ratio: elapsed / REVIEW_DURATION,
        expired: now >= start + REVIEW_DURATION,
        countdown: [hours, minutes, seconds % 60].map(value => String(value).padStart(2, '0')).join(':'),
    };
}

export function setAdmission(data) {
    generation++;
    const changed = admission.error || JSON.stringify(admission.application) !== JSON.stringify(data.application);
    admission.application = data.application;
    admission.error = '';
    if (changed) window.dispatchEvent(new Event('club:admission-updated'));
}

export function loadAdmission() {
    if (!isAdmissionPilot()) return Promise.resolve(null);
    if (loading) return loading;
    admission.loading = true;
    const version = generation;
    loading = admissionRequest('status').then(data => {
        if (version === generation) setAdmission(data);
        return admission.application;
    }).catch(error => {
        admission.error = error.message;
        window.dispatchEvent(new Event('club:admission-updated'));
        throw error;
    }).finally(() => { loading = null; admission.loading = false; });
    return loading;
}

export function initAdmission() {
    if (!isAdmissionPilot()) return;
    loadAdmission().catch(() => {});
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) loadAdmission().catch(() => {});
    });
    setInterval(() => {
        if (!document.hidden && admission.application?.status === 'pending') loadAdmission().catch(() => {});
    }, 30000);
}
