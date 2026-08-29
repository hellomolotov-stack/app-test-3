// Снять/поставить флаг «отменён» у хайка напрямую в Firebase.
// Полезно, когда при копировании строки в таблице «Отменён» случайно
// протянулся со старого хайка на новую дату.
//
// ВНИМАНИЕ: если хайки в таблице синхронизируются в Firebase по расписанию
// или скриптом, следующая синхронизация перезапишет это поле обратно тем
// значением, что стоит в таблице. Проверь и колонку «Отменён» в самой
// таблице — иначе флаг вернётся.
//
// Запуск (адреса берутся из js/config.js):
//   node scripts/set-hike-cancelled.mjs <ГГГГ-ММ-ДД> <true|false>
// Например:
//   node scripts/set-hike-cancelled.mjs 2026-09-13 false

import { FIREBASE_CONFIG } from '../js/config.js';

const [, , hikeDate, flagArg] = process.argv;

if (!hikeDate || !flagArg) {
    console.error('Использование: node scripts/set-hike-cancelled.mjs <ГГГГ-ММ-ДД> <true|false>');
    process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(hikeDate)) {
    console.error(`дата должна быть в формате ГГГГ-ММ-ДД, получено: ${hikeDate}`);
    process.exit(1);
}
if (!['true', 'false'].includes(flagArg)) {
    console.error(`второй аргумент должен быть true или false, получено: ${flagArg}`);
    process.exit(1);
}
const cancelled = flagArg === 'true';

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

const hike = await getJson(`hikes/${hikeDate}`);
if (!hike) {
    console.error(`В базе нет хайка на ${hikeDate}. Проверь дату.`);
    process.exit(1);
}
console.log(`Хайк: «${hike.title || '(без названия)'}» – ${hikeDate}`);
console.log(`Было cancelled: ${JSON.stringify(hike.cancelled ?? false)}`);

const res = await fetch(`${DB}/hikes/${hikeDate}/cancelled.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cancelled)
});
if (!res.ok) {
    console.error(`Не удалось обновить: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
}
console.log(`Стало cancelled: ${cancelled}`);
