// js/pass-store.js – хайки, на которые человек открыл ссылку «место сверх лимита» (startapp=pass_<код>).
// Пока ссылка действует, запись на этот хайк открыта даже без мест, а код уходит в оплату,
// чтобы в админке было видно, кто купил по ссылке. Без импортов – чтобы брать отовсюду без циклов.
const K = 'passLinks';                    // { 'YYYY-MM-DD': { code, ts } }
const TTL = 7 * 24 * 60 * 60 * 1000;

function read() {
    try { return JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) { return {}; }
}

export function passCodeFor(date) {
    const p = date ? read()[date] : null;
    return p && Date.now() - p.ts < TTL ? p.code : '';
}

export function savePass(date, code) {
    const all = read();
    all[date] = { code, ts: Date.now() };
    try { localStorage.setItem(K, JSON.stringify(all)); } catch (e) {}
}
