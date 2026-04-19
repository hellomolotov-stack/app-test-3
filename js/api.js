import { GUEST_API_URL, REGISTRATION_API_URL } from './config.js';
import { getDatabase } from './firebase.js';

// Логирование действий
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
    // Отправляем через Image beacon для надёжности
    new Image().src = `${GUEST_API_URL}?${params}`;
}

// Обновление регистрации в Google Sheets
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

// Синхронизация профиля с Google Sheets (через Apps Script)
export async function syncProfileToSheet(profile, user) {
    // URL вашего скрипта (замените на реальный)
    const SCRIPT_URL = 'ВАШ_НОВЫЙ_СКРИПТ';
    const payload = {
        action: 'syncProfile',
        user_id: user.id,
        name: profile.name,
        statuses: profile.friendshipStatuses,
        hobbies: profile.hobbies,
        profession: profile.profession,
        avatar_url: profile.avatarUrl,
        updated_at: new Date().toISOString()
    };
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error('Profile sync error:', e);
    }
}

export async function syncProfileDeleteToSheet(userId) {
    const SCRIPT_URL = 'ВАШ_НОВЫЙ_СКРИПТ';
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deleteProfile', user_id: userId })
        });
    } catch (e) {
        console.error('Profile delete sync error:', e);
    }
}
