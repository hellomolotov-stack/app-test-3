// Значки за хайк – сами, в день хайка в 18:00 по Москве (Vercel Cron → /api/hike-badges).
// Участник = остался в записи (hikeParticipants/<дата>). Кого на хайке не было – убрать из записи до 18:00
// или вписать в hikeBadges/<дата>/skip/<id>.
//   первый раз (нет значка «первый хайк с интеллигенцией») – этот значок + «дыхание по Хофу» + значок маршрута;
//   уже ходил – только значок маршрута, если его ещё нет.
// Городские встречи, книжный клуб, отменённые и хайки без названия пропускаем. Сообщений в бота нет.
// Итог пишется в hikeBadges/<дата>/done – повторный запуск ничего не выдаёт заново.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const FIRST = 'первый хайк с интеллигенцией';
const HOF = 'дыхание по Хофу';
const yes = v => v === true || String(v).toLowerCase() === 'yes';

async function grantHikeBadges(date, token, { skip = [], dryRun = false, fetcher = fetch } = {}) {
    const auth = { Authorization: `Bearer ${token}` };
    const get = async p => {
        const r = await fetcher(`${DB}/${p}.json`, { headers: auth, signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`${p} ${r.status}`);
        return r.json();
    };
    const [hike, parts, state, all] = await Promise.all([get(`hikes/${date}`), get(`hikeParticipants/${date}`), get(`hikeBadges/${date}`), get('clubAchievements')]);
    if (state?.done) return { date, skipped: 'уже выдано', done: state.done };
    if (!hike || !String(hike.title || '').trim() || yes(hike.city) || yes(hike.book_club) || yes(hike.cancelled)) return { date, skipped: 'не хайк' };
    const { routeBadgeForHike } = await import('../js/achievements-catalog.js');
    const routeTitle = routeBadgeForHike(hike.title);
    // запись значка – опубликованная, с картинкой; из одинаковых названий – та, у которой больше всего получателей
    const recordOf = title => Object.entries(all || {})
        .filter(([, r]) => r?.title === title && r.medal?.imageUrl && r.publicationStatus !== 'draft')
        .sort((a, b) => Object.keys(b[1].grants || {}).length - Object.keys(a[1].grants || {}).length)[0]?.[0] || null;
    const ids = { first: recordOf(FIRST), hof: recordOf(HOF), route: routeTitle ? recordOf(routeTitle) : null };
    const has = (id, uid) => !!(id && all[id]?.grants?.[uid]?.issuedAt);
    const skipSet = new Set([...skip, ...Object.keys(state?.skip || {})].map(String));

    const plan = {}; // recordId → [{ userId, name }]
    const people = [];
    for (const [uid, p] of Object.entries(parts || {})) {
        if (skipSet.has(uid)) continue;
        const name = String(p?.name || uid).slice(0, 100);
        const firstTime = !has(ids.first, uid);
        const want = firstTime ? [ids.first, ids.hof, ids.route] : [ids.route];
        const got = want.filter(id => id && !has(id, uid));
        got.forEach(id => (plan[id] ||= []).push({ userId: uid, name }));
        people.push({ userId: uid, name, firstTime, badges: got.map(id => all[id].title) });
    }
    const result = { date, hike: hike.title, route: routeTitle, people, skippedIds: [...skipSet] };
    if (dryRun) return result;

    const now = Date.now();
    for (const [id, list] of Object.entries(plan)) {
        for (let attempt = 0; attempt < 3; attempt++) {
            const r = await fetcher(`${DB}/clubAchievements/${id}.json`, { headers: { ...auth, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(10000) });
            const etag = r.headers.get('etag');
            const rec = await r.json();
            const add = list.filter(p => !rec.grants?.[p.userId]?.issuedAt);
            if (!add.length) break;
            const entry = p => ({ userId: p.userId, name: p.name, date, hikeDate: date });
            rec.recipients = { ...(rec.recipients || {}), ...Object.fromEntries(add.map(p => [p.userId, entry(p)])) };
            rec.grants = { ...(rec.grants || {}), ...Object.fromEntries(add.map(p => [p.userId, { ...entry(p), issuedAt: now, issuedBy: 'auto-hike' }])) };
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
    await fetcher(`${DB}/hikeBadges/${date}/done.json`, {
        method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ at: now, people: people.map(p => ({ userId: p.userId, name: p.name, badges: p.badges })) }),
        signal: AbortSignal.timeout(10000),
    });
    return result;
}

module.exports = { grantHikeBadges };
