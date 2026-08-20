// Ручная запись участника на хайк.
// Нужен, когда оплата прошла, а приложение не успело записать человека
// (например, Robokassa не вернула его в приложение по startapp=paid).
//
// Делает ровно то же, что делает приложение при успешной записи:
//   hikeParticipants/<дата>/<user_id>   – участник (счётчик и аватарки)
//   userRegistrations/<user_id>/<дата>  – статус записи
//   строка в Google-таблице             – status=booked, purchase_type=ticket
//
// Запуск (адреса берутся из js/config.js):
//   node scripts/register-participant.mjs <user_id> <ГГГГ-ММ-ДД> ["Имя"] ["username"]
// Например:
//   node scripts/register-participant.mjs 123456789 2026-08-23 "Аня" anya_tg

import { FIREBASE_CONFIG, REGISTRATION_API_URL } from '../js/config.js';

const [, , userId, hikeDate, firstName = '', username = ''] = process.argv;

if (!userId || !hikeDate) {
    console.error('Использование: node scripts/register-participant.mjs <user_id> <ГГГГ-ММ-ДД> ["Имя"] ["username"]');
    process.exit(1);
}
if (!/^\d+$/.test(userId)) {
    console.error(`user_id должен быть числом (Telegram id), получено: ${userId}`);
    process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(hikeDate)) {
    console.error(`дата должна быть в формате ГГГГ-ММ-ДД, получено: ${hikeDate}`);
    process.exit(1);
}

const DB = (FIREBASE_CONFIG?.databaseURL || '').replace(/\/$/, '');
if (!DB) {
    console.error('В js/config.js не заполнен FIREBASE_CONFIG.databaseURL. Сначала: node generate-config.js');
    process.exit(1);
}

async function getJson(path) {
    const res = await fetch(`${DB}/${path}.json`);
    if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
}

async function putJson(path, body) {
    const res = await fetch(`${DB}/${path}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`PUT ${path}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
}

const hike = await getJson(`hikes/${hikeDate}`);
if (!hike) {
    console.error(`В базе нет хайка на ${hikeDate}. Проверь дату.`);
    process.exit(1);
}
const hikeTitle = hike.title || '';
console.log(`Хайк: «${hikeTitle}» – ${hikeDate}`);

const existing = await getJson(`hikeParticipants/${hikeDate}/${userId}`);
if (existing) {
    console.log('Этот человек уже записан, ничего не меняю:', existing);
    process.exit(0);
}

await putJson(`hikeParticipants/${hikeDate}/${userId}`, {
    userId: Number(userId),
    name: firstName,
    photoUrl: null,
    timestamp: { '.sv': 'timestamp' }
});
await putJson(`userRegistrations/${userId}/${hikeDate}`, true);
console.log('Записан в Firebase.');

if (REGISTRATION_API_URL) {
    const params = new URLSearchParams({
        action: 'update',
        user_id: userId,
        first_name: firstName,
        last_name: '',
        username,
        profile_link: username ? `https://t.me/${username}` : '',
        hike_date: hikeDate,
        hike_title: hikeTitle,
        status: 'booked',
        has_card: 'нет',
        purchase_type: 'ticket'
    });
    const res = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params });
    console.log(res.ok ? 'Строка в таблицу отправлена.' : `Таблица ответила HTTP ${res.status}`);
} else {
    console.log('REGISTRATION_API_URL пуст – строку в таблицу не отправляю.');
}

const total = Object.keys((await getJson(`hikeParticipants/${hikeDate}`)) || {}).length;
console.log(`Готово. Участников на ${hikeDate}: ${total}`);
