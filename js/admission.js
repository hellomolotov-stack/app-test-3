import { state } from './state.js';

export const RULES_VERSION = 'pilot-2026-10-09';
export const admission = { application: null, error: '', loading: false };
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
    const response = await fetch('/api/admission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, action, initData: window.Telegram?.WebApp?.initData || '' }),
        signal: AbortSignal.timeout(30000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('не удалось загрузить ответ клуба'); }
    if (!response.ok) throw new Error(data.error || 'не удалось связаться с клубом');
    return data;
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
