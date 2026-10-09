// js/api.js
import { isAdmissionPilot, admissionRequest } from './admission.js';
import { GUEST_API_URL, REGISTRATION_API_URL } from './config.js';

// Счётчик явных логов: общий логгер кликов (ui/click-log.js) не дублирует уже залогированное нажатие.
export let logSeq = 0;

export function log(action, isGuest = false, user, meta = {}) {
    if (!user?.id) return;
    logSeq++;
    // Google Таблица считает текст с «+ = - @» в начале формулой и пишет #ERROR!
    // («+1: взял ссылку»). Апостроф в начале – признак текста, в ячейке его не видно.
    const safeAction = /^[=+\-@]/.test(action) ? `'${action}` : action;
    const finalAction = isGuest ? `${safeAction}_guest` : safeAction;
    const params = new URLSearchParams({
        user_id: user.id,
        username: user.username || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        action: finalAction,
        ...meta
    });
    const url = `${GUEST_API_URL}?${params}`;
    // keepalive: запрос уходит, даже если приложение тут же свернётся (переход в Telegram)
    try {
        fetch(url, { mode: 'no-cors', keepalive: true, credentials: 'omit' }).catch(() => { new Image().src = url; });
    } catch (e) {
        new Image().src = url;
    }
}

// Привязка клика по авто-сообщению (auto_sends): шлёт в основной скрипт, тот ставит clicked_at.
export function logAutoSendClick(messageKey, user, clickSource = 'deeplink') {
    if (!user?.id || !REGISTRATION_API_URL || !messageKey) return;
    const params = new URLSearchParams({
        action: 'logClick',
        user_id: user.id,
        message_key: messageKey,
        click_source: clickSource
    });
    fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true })
        .catch(e => console.error('logAutoSendClick error:', e));
}

export function updateRegistrationInSheet(hikeDate, hikeTitle, status, purchaseType, user, hasCard) {
    if (!user?.id || !REGISTRATION_API_URL) return;
    try {
        const profileLink = user.username ? `https://t.me/${user.username}` : '';
        const params = new URLSearchParams({
            action: 'update',
            user_id: user.id,
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            username: user.username || '',
            profile_link: profileLink,
            hike_date: hikeDate,
            hike_title: hikeTitle,
            status: status,
            has_card: hasCard ? 'да' : 'нет',
            purchase_type: purchaseType
        });
        fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true })
            .catch(e => console.error('Ошибка отправки в Google Sheets:', e));
    } catch (e) {
        console.error('Ошибка в updateRegistrationInSheet:', e);
    }
}

export async function syncProfileToSheet(profile, user) {
    if (!user?.id || !REGISTRATION_API_URL) return;
    const params = new URLSearchParams();
    params.append('action', 'syncProfile');
    params.append('user_id', user.id);
    params.append('name', profile.name || '');
    params.append('statuses', (profile.friendshipStatuses || []).join(','));
    params.append('hobbies', profile.hobbies || '');
    params.append('profession', profile.profession || '');
    params.append('avatar_url', profile.avatarUrl || '');
    params.append('updated_at', new Date().toISOString());
    params.append('allow_messages', profile.allowMessages ? 'да' : 'нет');
    params.append('custom_link', profile.customLink || '');
    params.append('username', profile.username || '');

    console.log('📤 Отправка профиля. Параметры:', params.toString());

    try {
        const response = await fetch(REGISTRATION_API_URL, {
            method: 'POST',
            body: params,
            keepalive: true
        });
        console.log('📤 syncProfileToSheet: статус –', response.status);
    } catch (e) {
        console.error('❌ syncProfileToSheet error:', e);
    }
}

export async function syncProfileDeleteToSheet(userId) {
    if (!userId || !REGISTRATION_API_URL) return;
    const params = new URLSearchParams({
        action: 'deleteProfile',
        user_id: userId
    });
    try {
        await fetch(REGISTRATION_API_URL, {
            method: 'POST',
            body: params,
            keepalive: true
        });
    } catch (e) {
        console.error('Profile delete sync error:', e);
    }
}

export async function syncSuggestEventToSheet(data) {
    if (!REGISTRATION_API_URL) return;
    const params = new URLSearchParams();
    params.append('action', 'suggestEvent');
    params.append('user_id', data.userId);
    params.append('username', data.username);
    params.append('event_title', data.title);
    params.append('event_description', data.description);
    params.append('event_datetime', data.datetime);
    params.append('submitted_at', new Date().toISOString());
    try {
        await fetch(REGISTRATION_API_URL, {
            method: 'POST',
            body: params,
            keepalive: true
        });
    } catch (e) {
        console.error('syncSuggestEventToSheet error:', e);
    }
}

export function registerWebAppUser(user) {
    if (!user?.id || !REGISTRATION_API_URL) return;
    const params = new URLSearchParams({
        action: 'registerWebAppUser',
        user_id: user.id,
        first_name: user.first_name || '',
        username: user.username || ''
    });
    fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true })
        .catch(() => {});
}

// Без id из Telegram оплату не создаём: по такому счёту деньги придут ни к кому не привязанными
// (приложение открыто в обычном браузере или Telegram не передал пользователя).
const NO_USER_TEXT = 'Оплата работает только в приложении внутри Telegram. Открой его через бота @yaltahiking_bot и попробуй ещё раз.';

export function paymentErrorText(err, fallback) {
    if (err?.code === 'NO_USER') return NO_USER_TEXT;
    if (/предложение/.test(err?.message || '')) return 'Срок спецпредложения закончился – карта доступна по обычной цене.';
    return fallback;
}

export function validatePayment(data, { cardType, giftCardType, expectedAmount }) {
    const invalid = () => { throw new Error('Данные оплаты не совпадают с выбранной картой. Обнови приложение или напиши организатору.'); };
    if (data.card_type !== cardType || (cardType === 'gift' && data.gift_card_type !== giftCardType)) invalid();
    let url, receipt;
    try {
        url = new URL(data.url);
        receipt = JSON.parse(decodeURIComponent(url.searchParams.get('Receipt') || ''));
    } catch { invalid(); }
    const sum = Number(url.searchParams.get('OutSum'));
    if (url.origin !== 'https://auth.robokassa.ru' || !Number.isFinite(sum) || sum <= 0 || Number(data.amount) !== sum) invalid();
    if (expectedAmount != null && sum !== Number(expectedAmount)) invalid();
    if (!Array.isArray(receipt.items) || receipt.items.length !== 1) invalid();
    const item = receipt.items[0];
    if (item.quantity !== 1 || item.sum !== sum || !item.name || !item.tax) invalid();
    const permanent = cardType === 'permanent' || cardType === 'offer' || (cardType === 'gift' && giftCardType === 'permanent');
    const title = permanent ? 'бессрочная' : cardType === 'ticket' ? 'билет' : 'сезонная';
    if (!item.name.toLowerCase().includes(title) || !url.searchParams.get('SignatureValue')) invalid();
    return data;
}

export async function initPayment({ userId, firstName, lastName, username, hikeDate, hikeTitle, cardType, giftCardType, expectedAmount }) {
    expectedAmount ??= cardType === 'ticket' ? 1000 : cardType === 'permanent' ? 7500 : cardType === 'season' ? 5500 : cardType === 'gift' ? (giftCardType === 'permanent' ? 7500 : 5500) : undefined;
    if (isAdmissionPilot()) {
        const data = await admissionRequest('payment', { payment: { hikeDate, hikeTitle, cardType, giftCardType } });
        return validatePayment(data, { cardType, giftCardType, expectedAmount });
    }
    if (!/^\d+$/.test(String(userId || ''))) {
        log('оплата без пользователя Telegram – заблокирована', true, null, { card_type: cardType });
        const e = new Error(NO_USER_TEXT); e.code = 'NO_USER'; throw e;
    }
    const params = new URLSearchParams({
        action: 'initPayment',
        user_id: String(userId || ''),
        first_name: firstName || '',
        last_name: lastName || '',
        username: username || '',
        hike_date: hikeDate || '',
        hike_title: hikeTitle || '',
        card_type: cardType
    });
    if (cardType === 'gift') params.set('gift_card_type', giftCardType || '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params, signal: controller.signal });
        clearTimeout(timer);
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('Сервер вернул неверный ответ'); }
        if (data.status !== 'ok') throw new Error(data.message || 'initPayment failed');
        return validatePayment(data, { cardType, giftCardType, expectedAmount });
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

// Личное спецпредложение карты (после хайка по билету): сервер сверяет id по подписи Telegram.
export async function getCardOffer() {
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData || !REGISTRATION_API_URL) return { active: false };
    try {
        const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: new URLSearchParams({ action: 'cardOffer', init_data: initData }) });
        const data = JSON.parse(await resp.text());
        return data.status === 'ok' ? data : { active: false };
    } catch (e) { return { active: false }; }
}

// Приглашения +1 (inviteCreate / inviteInfo / inviteAccept): id человека сервер берёт из подписи Telegram.
export async function inviteApi(action, data = {}) {
    if (!REGISTRATION_API_URL) throw new Error('нет связи с сервером');
    const params = new URLSearchParams({ action, init_data: window.Telegram?.WebApp?.initData || '', ...data });
    const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params });
    let json;
    try { json = JSON.parse(await resp.text()); } catch (e) { throw new Error('сервер не ответил, попробуй ещё раз'); }
    if (json.status !== 'ok') throw new Error(json.message || 'ошибка сервера');
    return json;
}

// Человек увидел экран «оплата прошла / ты записан» – сервер не станет напоминать в боте (sendPaidReminders).
export function markPaymentSeen() {
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData || !REGISTRATION_API_URL) return;
    fetch(REGISTRATION_API_URL, { method: 'POST', keepalive: true, body: new URLSearchParams({ action: 'paymentSeen', init_data: initData }) }).catch(() => {});
}

export function sendBookingNotification(hikeDate, hikeTitle, user) {
    if (!user?.id || !REGISTRATION_API_URL) return;
    const params = new URLSearchParams({
        action: 'sendBookingNotification',
        user_id: String(user.id),
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        username: user.username || '',
        hike_date: hikeDate || '',
        hike_title: hikeTitle || ''
    });
    fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true })
        .catch(e => console.error('sendBookingNotification error:', e));
}

// Аудитория приложения (Firebase app_users): кто открывал и можно ли ему писать из бота.
// event: open | grant | deny; canMessage: 'yes' | 'no' | '' (неизвестно).
// Отвечает последним известным can_message (true/false/null), чтобы не спрашивать тех, кому уже можно писать.
export async function trackAppUser(user, event, canMessage = '') {
    if (!user?.id || !REGISTRATION_API_URL) return null;
    const params = new URLSearchParams({
        action: 'trackAppUser',
        // сервер берёт id только из подписанных данных Telegram
        init_data: window.Telegram?.WebApp?.initData || '',
        user_id: String(user.id),
        first_name: user.first_name || '',
        username: user.username || '',
        event,
        can_message: canMessage
    });
    try {
        const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true });
        const data = JSON.parse(await resp.text());
        return data && data.status === 'ok' ? data : null;
    } catch (e) {
        return null;
    }
}

// Лист ожидания «сообщить, когда откроется запись» на дату-заглушку. on=false – отписаться.
export async function setHikeWaitlist(hikeDate, on) {
    if (!REGISTRATION_API_URL) throw new Error('нет адреса сервера');
    const params = new URLSearchParams({
        action: 'hikeWaitlist',
        init_data: window.Telegram?.WebApp?.initData || '',
        date: hikeDate,
        on: on ? 'yes' : 'no'
    });
    const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params });
    const data = JSON.parse(await resp.text());
    if (data.status !== 'ok') throw new Error(data.message || 'не получилось');
    return data;
}
