// Записались через приложение, но на хайк не пришли – не считаем их участниками нигде:
// связи, «знакомств» в «клубе в цифрах», счётчик хайков, «клуб» для редкости значков.
// Список – в Firebase noShows/<дата>/<telegram id> = true (личные данные в репозиторий не кладём).
// Саму запись из hikeParticipants не удаляем.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
let cache = null; // { at, set } – на 5 минут
async function noShows(token) {
    if (cache && Date.now() - cache.at < 5 * 60000) return cache.set;
    const set = new Set();
    try {
        const r = await fetch(`${DB}/noShows.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
        const v = r.ok ? await r.json() : null;
        Object.entries(v || {}).forEach(([d, ids]) => Object.keys(ids || {}).forEach(id => set.add(d + '|' + id)));
    } catch (e) { /* без списка считаем как раньше */ }
    cache = { at: Date.now(), set };
    return set;
}
module.exports = { noShows };
