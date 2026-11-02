// «Твои связи»: люди, с которыми человек был на хайках клуба, и связи между ними.
// Источники (только сервер, только чтение):
//   хайки до приложения – hikeVisitsBefore/<дата> = { title, people: { <id>: имя } } (из таблицы посещений, импорт вручную);
//   хайки через приложение – hikeParticipants/<дата>/<id> (человек остался в записи), дата прошла.
// Не считаем городские встречи, книжный клуб, отменённые и перенесённые хайки. Организаторы не входят в круг.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const ORGANIZERS = new Set(['163665735', '7191604791']); // Макс, Неля
const ALWAYS_THERE = ['163665735']; // организатор, который был на всех хайках клуба
const MAX_NODES = 250; // в шторке два слоя: 40 самых близких + остальные (до 250)
const yes = v => v === true || String(v).toLowerCase() === 'yes';
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

async function read(path, token) {
    const r = await fetch(`${DB}/${path}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
}

const okHike = h => h && String(h.title || '').trim() && !yes(h.city) && !yes(h.book_club) && !yes(h.cancelled);

// все прошедшие хайки клуба: дата → { title, people: Map<id, {name, photo}> }
let hikesCache = null; // { at, value } – на 5 минут на экземпляр функции: блок есть у каждого владельца карты на главной
async function allHikes(token) {
    if (hikesCache && Date.now() - hikesCache.at < 5 * 60000) return hikesCache.value;
    const value = await loadAllHikes(token);
    hikesCache = { at: Date.now(), value };
    return value;
}
async function loadAllHikes(token) {
    const [before, parts, hikes] = await Promise.all([
        read('hikeVisitsBefore', token).catch(() => null),
        read('hikeParticipants', token),
        read('hikes', token),
    ]);
    const day = today();
    const all = new Map();
    for (const [d, h] of Object.entries(before || {})) {
        const people = new Map(Object.entries(h?.people || {}).map(([id, name]) => [id, { name: String(name || ''), photo: '' }]));
        all.set(d, { title: String(h?.title || ''), people });
    }
    for (const [d, list] of Object.entries(parts || {})) {
        if (d >= day || !okHike(hikes?.[d])) continue;
        const e = all.get(d) || { title: String(hikes[d].title || ''), people: new Map() };
        for (const [id, p] of Object.entries(list || {})) {
            if (!p || typeof p !== 'object') continue;
            const prev = e.people.get(id) || {};
            e.people.set(id, { name: String(p.name || prev.name || ''), photo: String(p.photoUrl || prev.photo || '') });
        }
        all.set(d, e);
    }
    // Макс ведёт каждый хайк, но не всегда отмечался в опросе или записи (28.09.2025, 18.04.2026) – считаем его на всех
    for (const e of all.values()) for (const id of ALWAYS_THERE) if (!e.people.has(id)) e.people.set(id, { name: 'Макс', photo: '' });
    return { all, parts, hikes, day, before };
}

// «знакомств» в «клубе в цифрах»: сколько разных пар людей хоть раз были на одном хайке
let pairsCache = null;
async function clubPairs(token) {
    if (pairsCache && Date.now() - pairsCache.at < 10 * 60000) return pairsCache.n;
    const { all } = await allHikes(token);
    const pairs = new Set();
    for (const e of all.values()) {
        const ids = [...e.people.keys()].sort();
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.add(ids[i] + '|' + ids[j]);
    }
    pairsCache = { at: Date.now(), n: pairs.size };
    return pairs.size;
}

async function circleFor(userId, token) {
    const me = String(userId);
    const { all, parts, hikes, day, before } = await allHikes(token);
    const myDates = [...all.keys()].filter(d => all.get(d).people.has(me)).sort();
    const byId = new Map(); // id → { name, photo, dates[] }
    for (const d of myDates) {
        for (const [id, p] of all.get(d).people) {
            // организаторов в чужих связях не показываем (они есть у каждого), а друг у друга – показываем
            if (id === me || (ORGANIZERS.has(id) && !ORGANIZERS.has(me))) continue;
            const o = byId.get(id) || { name: '', photo: '', dates: [] };
            o.name = o.name || p.name; o.photo = o.photo || p.photo; o.dates.push(d);
            byId.set(id, o);
        }
    }
    // фото – у кого есть хоть в одной записи через приложение
    for (const e of all.values()) for (const [id, p] of e.people) if (byId.has(id) && !byId.get(id).photo && p.photo) byId.get(id).photo = p.photo;

    const people = [...byId.entries()].map(([id, o]) => ({
        id, name: o.name.slice(0, 40), photo: o.photo, n: o.dates.length, last: o.dates[o.dates.length - 1],
        routes: [...new Set(o.dates.slice().reverse().map(d => all.get(d).title))].slice(0, 3),
    })).sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
    const shown = people.slice(0, MAX_NODES);
    const ids = new Set(shown.map(p => p.id));
    // связи между людьми из круга: сколько раз они были вместе (на любых хайках клуба)
    const pair = new Map();
    for (const e of all.values()) {
        const inC = [...e.people.keys()].filter(id => ids.has(id));
        for (let i = 0; i < inC.length; i++) for (let j = i + 1; j < inC.length; j++) {
            const k = inC[i] < inC[j] ? inC[i] + '|' + inC[j] : inC[j] + '|' + inC[i];
            pair.set(k, (pair.get(k) || 0) + 1);
        }
    }
    const links = [...pair.entries()].map(([k, w]) => [...k.split('|'), w]);

    // ближайший хайк: кто из круга уже записан и сколько новых
    let next = null;
    const future = Object.keys(hikes || {}).filter(d => d >= day && okHike(hikes[d])).sort();
    for (const d of future) {
        const list = Object.entries(parts?.[d] || {}).filter(([id, p]) => p && typeof p === 'object' && id !== me && !ORGANIZERS.has(id));
        next = {
            date: d, title: String(hikes[d].title || ''),
            known: list.filter(([id]) => byId.has(id)).map(([id, p]) => ({ id, name: String(p.name || ''), photo: String(p.photoUrl || '') })).slice(0, 5),
            fresh: list.filter(([id]) => !byId.has(id)).map(([id, p]) => ({ id, name: String(p.name || ''), photo: String(p.photoUrl || '') })).slice(0, 8),
            freshCount: list.filter(([id]) => !byId.has(id)).length,
        };
        break;
    }
    return {
        total: people.length, strong: people.filter(p => p.n > 1).length, hikes: myDates.length,
        people: shown, more: people.length - shown.length, links, next, withHistory: !!before,
    };
}

module.exports = { circleFor, clubPairs };
