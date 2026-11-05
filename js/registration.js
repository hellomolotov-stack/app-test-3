// js/registration.js – запись и отмена записи без оплаты (владелец карты, городские события).
// Основной путь – наш сервер (/api/me, действия register / unregister): он отвечает за доли секунды
// и не зависит от соединения телефона с Firebase. Firebase – запасной путь, только если сервер
// не ответил (сеть, сбой), и тоже с пределом по времени: зависшая запись не должна выглядеть успешной.
import { state } from './state.js';
import { meCall, withTimeout } from './net.js';
import { getDatabase, addParticipant, removeParticipant, setUserRegistrationStatus } from './firebase.js';

const LIMIT_MS = 8000;

// отказ сервера по существу (нет карты, запись закрыта) обходить через базу нельзя
const isServerRefusal = error => error && error.status >= 400 && error.status < 500 && error.status !== 401;

export async function bookHike(hikeDate) {
    const userId = state.user?.id;
    if (!userId) throw Object.assign(new Error('нет пользователя Telegram'), { code: 'NO_USER' });
    try {
        await meCall('register', { date: hikeDate }, LIMIT_MS);
        return 'server';
    } catch (error) {
        if (isServerRefusal(error) || !getDatabase()) throw error;
        await withTimeout(Promise.all([
            setUserRegistrationStatus(userId, hikeDate, true),
            addParticipant(hikeDate, userId, { first_name: state.user?.first_name, photo_url: state.user?.photo_url })
        ]), LIMIT_MS, 'запись');
        return 'firebase';
    }
}

// guest: отмена у гостя (записан по билету) – отметку о билете в userRegistrations не трогаем
export async function cancelHike(hikeDate, { guest = false } = {}) {
    const userId = state.user?.id;
    if (!userId) throw Object.assign(new Error('нет пользователя Telegram'), { code: 'NO_USER' });
    try {
        await meCall('unregister', { date: hikeDate }, LIMIT_MS);
        notifyBoxCancelled(hikeDate);
        return 'server';
    } catch (error) {
        if (isServerRefusal(error) || !getDatabase()) throw error;
        // removeParticipant сам предупреждает хайкинг бокс об отмене
        await withTimeout(guest
            ? removeParticipant(hikeDate, userId)
            : Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)]),
        LIMIT_MS, 'отмена записи');
        return 'firebase';
    }
}

// если у человека оплачен хайкинг бокс на эту дату – бот спросит, отменить заказ или забрать самому
function notifyBoxCancelled(hikeDate) {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    fetch('/api/dc-loyalty', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hike_cancelled', initData, date: hikeDate })
    }).catch(() => {});
}

export function bookingErrorText(error, cancel = false) {
    if (error?.code === 'CARD_REQUIRED') return 'Записаться без билета можно с картой интеллигента';
    if (error?.code === 'REGISTRATION_CLOSED') return 'Запись на это событие уже закрыта';
    if (error?.code === 'CANCELLED') return 'Это событие отменили';
    if (error?.code === 'NO_EVENT') return 'Событие не найдено – обнови приложение';
    if (error?.code === 'NO_USER' || error?.code === 'NO_INIT') return 'Открой приложение через бота @yaltahiking_bot и попробуй ещё раз';
    return cancel
        ? 'Не получилось отменить запись. Проверь интернет и попробуй ещё раз'
        : 'Не получилось записаться. Проверь интернет и попробуй ещё раз';
}
