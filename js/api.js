// js/api.js
import { GUEST_API_URL, REGISTRATION_API_URL } from './config.js';

/**
 * Логирование действий пользователя (отправка через Image beacon)
 */
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
    // Используем Image для гарантированной отправки без CORS
    new Image().src = `${GUEST_API_URL}?${params}`;
}

/**
 * Обновление информации о регистрации на хайк в Google Sheets
 */
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

/**
 * Синхронизация профиля пользователя с Google Sheets (создание/обновление)
 * Отправляет данные через URLSearchParams, как и регистрации
 */
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
        const response = await fetch(REGISTRATION_API_URL, {
            method: 'POST',
            body: params,
            keepalive: true
        });
        console.log('📤 syncProfileToSheet: запрос отправлен, статус:', response.status);
    } catch (e) {
        console.error('❌ syncProfileToSheet error:', e);
    }
}

/**
 * Удаление профиля пользователя из Google Sheets
 */
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
