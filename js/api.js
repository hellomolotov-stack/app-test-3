// js/api.js
import { GUEST_API_URL, REGISTRATION_API_URL } from './config.js';

export function log(action, isGuest = false, user) {
    if (!user?.id) return;
    const finalAction = isGuest ? `${action}_guest` : action;
    const params = new URLSearchParams({
        user_id: user.id,
        username: user.username || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        action: finalAction
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
    if (!user?.id || !REGISTRATION_API_URL) {
        console.warn('syncProfileToSheet: нет user.id или REGISTRATION_API_URL');
        return;
    }
    const params = new URLSearchParams({
        action: 'syncProfile',
        user_id: user.id,
        name: profile.name || '',
        statuses: (profile.friendshipStatuses || []).join(','),
        hobbies: profile.hobbies || '',
        profession: profile.profession || '',
        avatar_url: profile.avatarUrl || '',
        updated_at: new Date().toISOString()
    });
    try {
        console.log('📤 Отправка профиля на', REGISTRATION_API_URL);
        console.log('Параметры:', params.toString());
        const response = await fetch(REGISTRATION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString() // явно в строку
        });
        console.log('📤 syncProfileToSheet: статус', response.status);
        if (!response.ok) {
            const text = await response.text();
            console.error('Ответ сервера:', text);
        }
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
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });
    } catch (e) {
        console.error('Profile delete sync error:', e);
    }
}
