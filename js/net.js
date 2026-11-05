// js/net.js – общие правила сети: у каждого запроса есть предел по времени.
// На плохом интернете и VPN запрос без предела может висеть минутами, а кнопка – крутиться бесконечно.

// сигнал отмены через ms; AbortSignal.timeout есть не во всех WebView (iOS до 16)
export function timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
    if (typeof AbortController !== 'function') return undefined;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

// обещание с пределом: не успело за ms – ошибка с code 'TIMEOUT'
export function withTimeout(promise, ms, label = 'request') {
    let timer;
    const limit = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`${label}: нет ответа за ${Math.round(ms / 1000)} с`);
            error.code = 'TIMEOUT';
            reject(error);
        }, ms);
    });
    return Promise.race([Promise.resolve(promise), limit]).finally(() => clearTimeout(timer));
}

// fetch с пределом по времени (по умолчанию 10 с)
export function fetchWithTimeout(url, options = {}, ms = 10000) {
    return fetch(url, { ...options, signal: options.signal || timeoutSignal(ms) });
}

// Действия /api/me (наш сервер на Vercel): status – карта и записи, register / unregister – запись без оплаты.
// Ошибка несёт status (HTTP) и code сервера; status 0 – сеть или предел времени.
export async function meCall(action, payload = {}, ms = 8000) {
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) {
        const error = new Error('нет подписи Telegram');
        error.status = 401;
        error.code = 'NO_INIT';
        throw error;
    }
    let response;
    try {
        response = await fetchWithTimeout('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData, action, ...payload })
        }, ms);
    } catch (e) {
        const error = new Error('нет связи с сервером');
        error.status = 0;
        error.code = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
        throw error;
    }
    let data = null;
    try { data = await response.json(); } catch (e) { /* пустой ответ */ }
    if (!response.ok) {
        const error = new Error(data?.error || `ошибка сервера ${response.status}`);
        error.status = response.status;
        error.code = data?.code || '';
        throw error;
    }
    return data;
}

// Карта и записи человека с сервера: { card: { status, cardUrl }, regs } или null, если сервер не ответил.
export async function fetchServerStatus(ms = 6000) {
    try {
        const me = await meCall('status', {}, ms);
        const myId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
        if (!me || !me.card || (myId && String(me.uid) !== myId)) return null;
        return me;
    } catch (e) {
        return null;
    }
}
