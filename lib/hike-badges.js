// Значки за хайк – сами, в день хайка в 18:00 по Москве (Vercel Cron → /api/hike-badges).
// Участник = остался в записи (hikeParticipants/<дата>). Кого на хайке не было – убрать из записи до 18:00
// или вписать в hikeBadges/<дата>/skip/<id>.
//   первый раз (нет значка «первый хайк с интеллигенцией») – этот значок + «дыхание по Хофу» + значок маршрута;
//   уже ходил – значок маршрута за новую дату (повторное прохождение увеличивает счётчик).
// Городские встречи, книжный клуб, отменённые и хайки без названия пропускаем. Сообщений в бота нет.
// Итог пишется в hikeBadges/<дата>/done – повторный запуск ничего не выдаёт заново.
const fs = require('fs');
const path = require('path');
const { routeDates, addRouteDate } = require('./route-grants');
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const FIRST = 'первый хайк с интеллигенцией';
const HOF = 'дыхание по Хофу';
// значки за число пройденных хайков (счётчик – как в приложении, lib/hike-count.js)
const COUNT_BADGES = [[5, '5 хайков'], [10, '10 хайков'], [20, '20 хайков'], [30, '30 хайков'], [50, '50 хайков']];
const countTitles = n => COUNT_BADGES.filter(([min]) => n >= min).map(([, t]) => t);
const yes = v => v === true || String(v).toLowerCase() === 'yes';

// каталог значков – ES-модуль приложения: грузим из текста, чтобы не зависеть от типа модулей на сервере
let catalog = null;
// (на Vercel файл приходит уже переделанным в CommonJS – тогда хватает require)
function routeCatalog() {
    const file = path.join(__dirname, '..', 'js', 'achievements-catalog.js');
    try { const m = require(file); if (m?.routeBadgeForHike) return Promise.resolve(m); } catch (e) {}
    const code = fs.readFileSync(file, 'utf8');
    return (catalog ||= import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')));
}

async function grantHikeBadges(date, token, { skip = [], dryRun = false, fetcher = fetch } = {}) {
    const auth = { Authorization: `Bearer ${token}` };
    const get = async p => {
        const r = await fetcher(`${DB}/${p}.json`, { headers: auth, signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`${p} ${r.status}`);
        return r.json();
    };
    const [hike, parts, state, all, absent, attendance] = await Promise.all([get(`hikes/${date}`), get(`hikeParticipants/${date}`), get(`hikeBadges/${date}`), get('clubAchievements'), get(`noShows/${date}`), get(`hikeAttendance/${date}`)]);
    if (state?.done) return { date, skipped: 'уже выдано', done: state.done };
    if (!hike || !String(hike.title || '').trim() || yes(hike.city) || yes(hike.book_club) || yes(hike.cancelled)) return { date, skipped: 'не хайк' };
    const { routeBadgeForHike } = await routeCatalog();
    const routeTitle = routeBadgeForHike(hike.title);
    // запись значка – опубликованная, с картинкой; из одинаковых названий – та, у которой больше всего получателей
    const recordOf = title => Object.entries(all || {})
        .filter(([, r]) => r?.title === title && r.medal?.imageUrl && r.publicationStatus !== 'draft')
        .sort((a, b) => Object.keys(b[1].grants || {}).length - Object.keys(a[1].grants || {}).length)[0]?.[0] || null;
    const ids = { first: recordOf(FIRST), hof: recordOf(HOF), route: routeTitle ? recordOf(routeTitle) : null };
    const has = (id, uid) => !!(id && all[id]?.grants?.[uid]?.issuedAt);
    const { hikeCount } = require('./hike-count');
    const members = await get('members');
    const skipSet = new Set([...skip, ...Object.keys(state?.skip || {})].map(String));
    Object.entries(absent || {}).forEach(([id, value]) => { if (yes(value)) skipSet.add(id); });
    Object.entries(attendance || {}).forEach(([id, value]) => { if (value === false) skipSet.add(id); });
    skipSet.add('7845375334');

    const plan = {}; // recordId → [{ userId, name }]
    const people = [];
    for (const [uid, p] of Object.entries(parts || {})) {
        if (skipSet.has(uid)) continue;
        const name = String(p?.name || uid).slice(0, 100);
        const firstTime = !has(ids.first, uid);
        // сегодняшний хайк счётчик засчитает только завтра – прибавляем его сами
        const count = (await hikeCount(uid, token, { member: members?.[uid], fetcher })) + 1;
        const want = [...(firstTime ? [ids.first, ids.hof, ids.route] : [ids.route]), ...countTitles(count).map(recordOf)];
        const got = want.filter(id => id && (id === ids.route ? !routeDates(all[id]?.grants?.[uid]).includes(date) : !has(id, uid)));
        got.forEach(id => (plan[id] ||= []).push({ userId: uid, name }));
        people.push({ userId: uid, name, firstTime, count, badges: got.map(id => all[id].title) });
    }
    const result = { date, hike: hike.title, route: routeTitle, people, skippedIds: [...skipSet] };
    if (dryRun) return result;

    const now = Date.now();
    for (const [id, list] of Object.entries(plan)) {
        for (let attempt = 0; attempt < 3; attempt++) {
            const r = await fetcher(`${DB}/clubAchievements/${id}.json`, { headers: { ...auth, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(10000) });
            const etag = r.headers.get('etag');
            if (!r.ok || !etag) throw new Error(`clubAchievements/${id} read ${r.status}`);
            const rec = await r.json();
            const add = list.filter(p => id === ids.route ? !routeDates(rec.grants?.[p.userId]).includes(date) : !rec.grants?.[p.userId]?.issuedAt);
            if (!add.length) break;
            const entry = p => ({ userId: p.userId, name: p.name, date, hikeDate: date });
            rec.recipients = { ...(rec.recipients || {}), ...Object.fromEntries(add.map(p => [p.userId, entry(p)])) };
            rec.grants = { ...(rec.grants || {}), ...Object.fromEntries(add.map(p => [p.userId, id === ids.route
                ? addRouteDate(rec.grants?.[p.userId], entry(p), date, now, 'auto-hike')
                : { ...entry(p), issuedAt: now, issuedBy: 'auto-hike' }])) };
            rec.updatedAt = now; rec.updatedBy = 'auto-hike';
            rec.history = [...(rec.history || []), { action: 'auto_hike', at: now, by: 'auto-hike', hikeDate: date, added: add.map(p => p.userId) }];
            const w = await fetcher(`${DB}/clubAchievements/${id}.json`, {
                method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': etag },
                body: JSON.stringify(rec), signal: AbortSignal.timeout(10000),
            });
            if (w.ok) break;
            if (w.status !== 412 || attempt === 2) throw new Error(`clubAchievements/${id} ${w.status}`);
        }
    }
    const done = await fetcher(`${DB}/hikeBadges/${date}/done.json`, {
        method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ at: now, people: people.map(p => ({ userId: p.userId, name: p.name, badges: p.badges })) }),
        signal: AbortSignal.timeout(10000),
    });
    if (!done.ok) throw new Error(`hikeBadges/${date}/done ${done.status}`);
    return result;
}

module.exports = { grantHikeBadges, COUNT_BADGES, countTitles, routeCatalog };
