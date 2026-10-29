// Счётчик пройденных хайков – один для всех (с картой и без):
//   хайки до приложения (опросы «регистрация на маршрут» в чате, с отметками «был») – hikeHistory/<id>.before
//   + хайки через приложение: человек остался в записи (hikeParticipants/<дата>/<id>) и дата хайка прошла.
// Городские встречи, книжный клуб, отменённые и перенесённые хайки (без названия) не считаются.
// Владельцам карты показываем большее из этого и счётчика в таблице (members/<id>/hikes_count), чтобы число не уменьшилось.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const yes = v => v === true || String(v).toLowerCase() === 'yes';
const moscowToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

let cache = null; // { at, day, byUser: Map<id, count> } – на 5 минут на экземпляр функции
async function appCounts(token, fetcher = fetch) {
    const day = moscowToday();
    if (cache && cache.day === day && Date.now() - cache.at < 5 * 60000) return cache.byUser;
    const get = async p => {
        const r = await fetcher(`${DB}/${p}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
        if (!r.ok) throw new Error(`${p} ${r.status}`);
        return r.json();
    };
    const [parts, hikes] = await Promise.all([get('hikeParticipants'), get('hikes')]);
    const byUser = new Map();
    for (const [d, list] of Object.entries(parts || {})) {
        const h = hikes?.[d];
        if (!h || d >= day || !String(h.title || '').trim() || yes(h.city) || yes(h.book_club) || yes(h.cancelled)) continue;
        for (const id of Object.keys(list || {})) byUser.set(id, (byUser.get(id) || 0) + 1);
    }
    cache = { at: Date.now(), day, byUser };
    return byUser;
}

async function hikeCount(userId, token, { member = null, fetcher = fetch } = {}) {
    const id = String(userId);
    const [byUser, history] = await Promise.all([
        appCounts(token, fetcher),
        fetcher(`${DB}/hikeHistory/${id}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) })
            .then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const total = (Number(history?.before) || 0) + (byUser.get(id) || 0);
    return Math.max(total, Number(member?.hikes_count) || 0);
}

module.exports = { hikeCount };
