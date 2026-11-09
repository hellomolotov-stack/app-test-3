const { routeDates } = require('./route-grants');
const yes = v => v === true || String(v).toLowerCase() === 'yes';
const MIGRATION = 'routes-36-2026-11-08-v1';
function planRouteHistory(data, routeBadgeForHike, { through, notifyDate, now }) {
    const all = data.clubAchievements || {}, expected = new Map(), hikes = [], missing = [];
    for (const date of [...new Set([...Object.keys(data.hikes || {}), ...Object.keys(data.hikeVisitsBefore || {})])].sort()) {
        if (date > through) continue;
        const current = data.hikes?.[date] || {}, historical = data.hikeVisitsBefore?.[date];
        const hike = String(current.title || '').trim() ? current : historical || current;
        if (!hike.title?.trim() || yes(hike.city) || yes(hike.book_club) || yes(hike.cancelled) || /🌧|🏄/.test(hike.emoji || '')) continue;
        const title = routeBadgeForHike(hike.title);
        const record = Object.values(all).filter(r => r.title === title && r.medal?.imageUrl && r.publicationStatus === 'published')
            .sort((a,b)=>Object.keys(b.grants || {}).length-Object.keys(a.grants || {}).length)[0];
        if (!record) { missing.push({ date, title: hike.title }); continue; }
        const roster = { ...Object.fromEntries(Object.entries(historical?.people || {}).map(([id, p]) => [id, { name: typeof p === 'string' ? p : p.name }])), ...data.hikeParticipants?.[date] };
        const present = Object.entries(roster).filter(([id]) => id !== '7845375334' && !yes(data.noShows?.[date]?.[id]) && !data.hikeBadges?.[date]?.skip?.[id] && data.hikeAttendance?.[date]?.[id] !== false);
        for (const [id, p] of present) {
            const people = expected.get(record.id) || new Map(); expected.set(record.id, people);
            const entry = people.get(id) || { name: p.name || id, dates: [] }; people.set(id, entry);
            entry.dates.push(date); entry.name = p.name || entry.name;
        }
        hikes.push({ date, title: hike.title, badge: title, participants: present.length });
    }
    if (missing.length) throw new Error('маршруты без готового значка: ' + JSON.stringify(missing));
    const changes = [], unverified = [], histogram = {}, notify = [], users = new Set();
    for (const [recordId, people] of expected) {
        const old = all[recordId];
        if (old.routeHistoryMigration === MIGRATION) continue;
        const record = structuredClone(old); record.kind = 'route';
        record.grants ||= {}; record.recipients ||= {};
        for (const [id, grant] of Object.entries(record.grants)) {
            // Не удаляем прежние ручные выдачи без подтверждающего списка посещений.
            if (!people.has(id)) { unverified.push({ badge: old.title, userId: id, date: grant.date }); grant.notificationAt = 0; }
        }
        for (const [id, p] of people) {
            const dates = [...new Set(p.dates)].sort(), date = dates.at(-1), previous = record.grants[id];
            const today = dates.includes(notifyDate);
            const person = { userId: id, name: String(p.name).slice(0,100), date, hikeDate: date };
            record.recipients[id] = { ...record.recipients[id], ...person };
            record.grants[id] = { ...previous, ...person, dates, count: dates.length,
                issuedAt: today ? now : previous?.issuedAt || Date.parse(date+'T18:00:00+03:00'),
                issuedBy: previous?.issuedBy || 'route-history', notificationAt: today ? now : 0 };
            histogram[dates.length] = (histogram[dates.length] || 0) + 1; users.add(id);
            if (today) notify.push({ userId: id, name: p.name, badge: old.title, count: dates.length });
        }
        record.routeHistoryMigration = MIGRATION;
        record.updatedAt = now; record.updatedBy = 'route-history';
        record.history = [...(record.history || []), { action: 'route_history', at: now, by: 'route-history', through, notifyDate }];
        changes.push({ id: recordId, old, record });
    }
    return { migration: MIGRATION, hikes, histogram, users: users.size, notify, unverified, changes };
}
module.exports = { planRouteHistory };
