import { REGISTRATION_API_URL } from './config.js';

const queue = [];
const session = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let timer;
let sending = false;
let started = false;
const once = new Set();

export function trackFunnel(event, date = '') {
    if (!window.Telegram?.WebApp?.initData || !REGISTRATION_API_URL) return;
    if (event !== 'app_open' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const key = `${event}:${date}`;
    if (once.has(key)) return;
    once.add(key);
    queue.push({ id: `${session}-${queue.length}-${Date.now()}-${event}`, session, event, date, at: Date.now() });
    clearTimeout(timer);
    timer = setTimeout(flush, event === 'booking_success' ? 0 : 1200);
}

async function flush() {
    if (sending || !queue.length) return;
    sending = true;
    const batch = queue.splice(0, 20);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(REGISTRATION_API_URL, {
            method: 'POST', keepalive: true,
            body: new URLSearchParams({ action: 'analyticsEvent', init_data: window.Telegram.WebApp.initData, events: JSON.stringify(batch) }),
            signal: controller.signal
        });
        const result = await response.json();
        if (result.status !== 'ok') throw new Error('analytics unavailable');
    } catch {
        // One bounded retry, with the same IDs; analytics never blocks booking.
        batch.forEach(item => { if (!item.retried) queue.push({ ...item, retried: true }); });
    } finally {
        clearTimeout(timeout);
        sending = false;
        if (queue.length) timer = setTimeout(flush, 4000);
    }
}

export function startAnalytics() {
    if (started) return;
    started = true;
    trackFunnel('app_open');
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
