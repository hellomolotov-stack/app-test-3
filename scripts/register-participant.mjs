// Ручная запись участника на хайк.
// Нужен, когда оплата прошла, а приложение не успело записать человека
// (например, Robokassa не вернула его в приложение по startapp=paid).
//
// Делает ровно то же, что делает приложение при успешной записи:
//   hikeParticipants/<дата>/<user_id>   – участник (счётчик и аватарки)
//   userRegistrations/<user_id>/<дата>  – статус записи
//   строка в Google-таблице             – status=booked, purchase_type=ticket
//
// Первым аргументом можно передать либо числовой user_id, либо @username —
// тогда id ищется в userProfiles.
//
// Запуск (адреса берутся из js/config.js):
//   node scripts/register-participant.mjs <user_id|@username> <ГГГГ-ММ-ДД> ["Имя"]
// Например:
//   node scripts/register-participant.mjs @Dariakrandievskaya 2026-08-23
//   node scripts/register-participant.mjs 123456789 2026-08-23 "Аня"

import { FIREBASE_CONFIG, REGISTRATION_API_URL } from '../js/config.js';

const [, , who, hikeDate, firstNameArg = ''] = process.argv;

if (!who || !hikeDate) {
    console.error('Использование: node scripts/register-participant.mjs <user_id|@username> <ГГГГ-ММ-ДД> ["Имя"]');
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

// Ищем человека: либо уже дали id, либо находим его по username в профилях
let userId = who;
let username = '';
let firstName = firstNameArg;

if (!/^\d+$/.test(who)) {
    username = who.replace(/^@/, '');
    const profiles = (await getJson('userProfiles')) || {};
    const match = Object.entries(profiles).find(([, p]) =>
        String(p?.username || '').toLowerCase() === username.toLowerCase()
    );
    if (!match) {
        console.error(`Не нашёл @${username} в userProfiles (профиль мог быть не создан).`);
        console.error('Возьми user_id из логовой таблицы по username и передай его числом.');
        process.exit(1);
    }
    userId = match[0];
    if (!firstName) firstName = match[1]?.name || '';
    console.log(`@${username} → user_id ${userId}${firstName ? ` (${firstName})` : ''}`);
} else if (!username) {
    const profile = await getJson(`userProfiles/${userId}`);
    username = profile?.username || '';
    if (!firstName) firstName = profile?.name || '';
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
