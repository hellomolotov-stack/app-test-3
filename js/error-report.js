// js/error-report.js – ошибки приложения на телефонах попадают в журнал действий (тот же, что log()).
// Раньше они никуда не уходили, и о поломках мы узнавали только от людей.
// Не больше 5 разных ошибок за запуск; сетевые сбои и шум браузера не шлём – это не ошибки кода.
import { log } from './api.js';
import { state } from './state.js';

const MAX_PER_RUN = 5;
const IGNORE = /ResizeObserver loop|^Script error\.?$|Failed to fetch|Load failed|NetworkError|network error|aborted|AbortError|TimeoutError|нет ответа за|нет связи с сервером|Permission denied|PERMISSION_DENIED|client is offline/i;
const sent = new Set();

function bundleVersion() {
    const src = [...document.scripts].map(s => s.src).find(s => /\/js\/b\/app-/.test(s)) || '';
    return (src.match(/app-([A-Za-z0-9]+)\.js/) || [])[1] || 'dev';
}

function report(kind, message, where) {
    const text = String(message || '').trim();
    if (!text || IGNORE.test(text) || sent.size >= MAX_PER_RUN) return;
    const key = `${kind}:${text}`;
    if (sent.has(key)) return;
    sent.add(key);
    try {
        log(`ошибка приложения: ${text.slice(0, 140)}`, state.userCard?.status !== 'active', state.user, {
            where: String(where || '').slice(0, 140),
            kind,
            v: bundleVersion()
        });
    } catch (e) { /* журнал не должен ронять приложение */ }
}

export function initErrorReporting() {
    window.addEventListener('error', event => {
        // ошибки загрузки картинок и скриптов приходят с target-элементом – это не ошибка кода
        if (event.target && event.target !== window) return;
        const file = String(event.filename || '').split('/').pop();
        report('error', event.message, file ? `${file}:${event.lineno}:${event.colno}` : '');
    });
    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason;
        const message = reason?.message || (typeof reason === 'string' ? reason : '');
        const where = String(reason?.stack || '').split('\n').find(line => /\.js/.test(line)) || '';
        report('promise', message, where.trim());
    });
}
