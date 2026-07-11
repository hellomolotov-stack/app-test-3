const KEY = 'lumenStateV1';

const defaults = { disabled: false, seen: [], closed: [], sessionShown: false, visits: 0 };

function read() {
    try { return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; }
    catch { return { ...defaults }; }
}

function write(value) {
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch {}
    return value;
}

export function getLumenState() { return read(); }
export function isLumenDisabled() { return read().disabled; }
export function disableLumenPrompts() { const s = read(); s.disabled = true; write(s); }
export function markLumenSeen(id) { const s = read(); if (!s.seen.includes(id)) s.seen.push(id); s.sessionShown = true; write(s); }
export function markLumenClosed(id) { const s = read(); if (!s.closed.includes(id)) s.closed.push(id); write(s); }
export function canShowLumenPrompt(id) {
    const s = read();
    return !s.disabled && !s.sessionShown && !s.closed.includes(id) && s.visits < 4;
}
export function registerLumenVisit() { const s = read(); s.visits = Math.min(99, (s.visits || 0) + 1); s.sessionShown = false; write(s); }
