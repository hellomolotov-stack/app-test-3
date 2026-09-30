// js/api.js
import { GUEST_API_URL, REGISTRATION_API_URL } from './config.js';

// Счётчик явных логов: общий логгер кликов (ui/click-log.js) не дублирует уже залогированное нажатие.
export let logSeq = 0;

export function log(action, isGuest = false, user, meta = {}) {
    if (!user?.id) return;
    logSeq++;
    const finalAction = isGuest ? `${action}_guest` : action;
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

export async function initPayment({ userId, firstName, lastName, username, hikeDate, hikeTitle, cardType }) {
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params, signal: controller.signal });
        clearTimeout(timer);
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('Сервер вернул неверный ответ'); }
        if (data.status !== 'ok') throw new Error(data.message || 'initPayment failed');
        return data;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
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
