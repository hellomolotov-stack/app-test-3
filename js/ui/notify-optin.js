// js/ui/notify-optin.js – подписка на сообщения от бота.
// Каждое открытие (раз в день) отмечаем в app_users. Разрешение на сообщения спрашиваем
// не системным окном на первом экране, а сначала своей карточкой с объяснением,
// и только после «да» показываем окно Telegram.
import { state } from '../state.js';
import { haptic, tg } from '../utils.js';
import { log, trackAppUser, registerWebAppUser } from '../api.js';

const K_PING = 'appUserPingDay';
const K_ASK = 'notifyOptin'; // { n, last, ok }
const MAX_ASKS = 3;
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

let pingDone = null;

function readAsk() {
    try { return JSON.parse(localStorage.getItem(K_ASK) || '{}') || {}; } catch (e) { return {}; }
}

function writeAsk(patch) {
    try { localStorage.setItem(K_ASK, JSON.stringify({ ...readAsk(), ...patch })); } catch (e) {}
}

function allowsFromInitData() {
    return tg?.initDataUnsafe?.user?.allows_write_to_pm === true;
}

// Раз в день сообщаем серверу, что человек открыл приложение. Ответ говорит,
// можно ли ему уже писать (например, он нажимал /start в боте) – тогда не спрашиваем.
export function pingAppUser() {
    if (pingDone) return pingDone;
    const user = state.user;
    if (!user?.id) return (pingDone = Promise.resolve());
    const allows = allowsFromInitData();
    if (allows) writeAsk({ ok: true });
    const day = new Date().toISOString().slice(0, 10);
    let sentToday = false;
    try { sentToday = localStorage.getItem(K_PING) === day; } catch (e) {}
    if (sentToday) return (pingDone = Promise.resolve());
    pingDone = trackAppUser(user, 'open', allows ? 'yes' : '').then(res => {
        try { localStorage.setItem(K_PING, day); } catch (e) {}
        if (res && res.can_message === true) writeAsk({ ok: true });
    });
    return pingDone;
}

function shouldAsk(reason) {
    if (!state.user?.id || !tg?.requestWriteAccess) return false;
    if (allowsFromInitData()) return false;
    const a = readAsk();
    if (a.ok) return false;
    if ((a.n || 0) >= MAX_ASKS) return false;
    // после записи на хайк спрашиваем даже если недавно отложили – это самый понятный момент
    if (reason !== 'booking' && a.last && Date.now() - a.last < SNOOZE_MS) return false;
    return true;
}

function requestAccess(reason) {
    const user = state.user;
    tg.requestWriteAccess(granted => {
        writeAsk(granted ? { ok: true } : {});
        trackAppUser(user, granted ? 'grant' : 'deny', granted ? 'yes' : 'no');
        if (granted) registerWebAppUser(user);
        log(granted ? 'сообщения: разрешил' : 'сообщения: отказал', state.userCard?.status !== 'active', user, { reason });
    });
}

const TEXTS = {
    home: {
        icon: '📬',
        title: 'присылать анонсы хайков?',
        text: 'напишем в бот, когда откроется запись на новый маршрут, и расскажем о событиях клуба. без спама – пара сообщений в неделю'
    },
    booking: {
        icon: '🔔',
        title: 'держать в курсе?',
        text: 'разреши боту писать тебе – пришлём, если по хайку что-то поменяется, и расскажем о новых маршрутах'
    }
};

// Показывает карточку с вопросом, если человеку ещё нельзя писать. reason: home | booking
export async function maybeAskNotifications(reason = 'home', delay = 0) {
    await pingAppUser();
    if (delay) await new Promise(r => setTimeout(r, delay));
    if (!shouldAsk(reason)) return;
    if (document.querySelector('.modal-overlay, .bottom-sheet-overlay.active, .bot-chat-overlay')) return;

    const t = TEXTS[reason] || TEXTS.home;
    const a = readAsk();
    writeAsk({ n: (a.n || 0) + 1, last: Date.now() });
    log('сообщения: показали вопрос', state.userCard?.status !== 'active', state.user, { reason });

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:360px; text-align:center;">
            <div style="font-size:52px; margin-bottom:12px;">${t.icon}</div>
            <div class="modal-title" style="text-align:center; font-size:20px; color: var(--yellow);">${t.title}</div>
            <div class="modal-text" style="text-align:center; margin-top:8px;">${t.text}</div>
            <button class="btn btn-yellow" data-optin="yes" style="margin:16px 0 0; width:100%;">да, присылать</button>
            <button data-optin="later" style="margin-top:12px; background:none; border:0; color:rgba(255,255,255,.6); font:inherit; font-size:14px; cursor:pointer;">не сейчас</button>
        </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => {
        if (e.target === overlay) { haptic(); close(); }
    });
    overlay.querySelector('[data-optin="yes"]').addEventListener('click', () => {
        haptic();
        close();
        requestAccess(reason);
    });
    overlay.querySelector('[data-optin="later"]').addEventListener('click', () => {
        haptic();
        close();
        log('сообщения: не сейчас', state.userCard?.status !== 'active', state.user, { reason });
    });
}

// Можно ли боту писать человеку; если неизвестно – сразу просим разрешение окном Telegram
// (без своей карточки: человек только что сам нажал «сообщить»). reason – для журнала.
export function ensureCanMessage(reason = 'waitlist') {
    if (allowsFromInitData() || readAsk().ok) return Promise.resolve(true);
    if (!state.user?.id || !tg?.requestWriteAccess) return Promise.resolve(false);
    return new Promise(resolve => {
        try {
            tg.requestWriteAccess(granted => {
                writeAsk(granted ? { ok: true } : {});
                trackAppUser(state.user, granted ? 'grant' : 'deny', granted ? 'yes' : 'no');
                if (granted) registerWebAppUser(state.user);
                log(granted ? 'сообщения: разрешил' : 'сообщения: отказал', state.userCard?.status !== 'active', state.user, { reason });
                resolve(!!granted);
            });
        } catch (e) {
            resolve(false);
        }
    });
}
