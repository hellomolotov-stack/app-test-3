// js/api.js
import { GUEST_API_URL, REGISTRATION_API_URL } from './config.js';

export function log(action, isGuest = false, user, meta = {}) {
    if (!user?.id) return;
    const finalAction = isGuest ? `${action}_guest` : action;
    const params = new URLSearchParams({
        user_id: user.id,
        username: user.username || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        action: finalAction,
        ...meta
    });
    new Image().src = `${GUEST_API_URL}?${params}`;
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

export function syncGuestAllowMessages(userId, allow) {
    if (!userId || !REGISTRATION_API_URL) return;
    const params = new URLSearchParams({
        action: 'syncGuestAllowMessages',
        user_id: userId,
        allow_messages: allow ? 'yes' : 'no'
    });
    fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true })
        .catch(e => console.error('syncGuestAllowMessages error:', e));
}
