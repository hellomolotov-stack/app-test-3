export function moscowDateKey(now = new Date()) {
    return new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}

export function clubHikeCompletedAt(date) {
    return Date.parse(date + 'T18:00:00+03:00');
}

export function hikeTiming(hike, now = new Date()) {
    const date = String(hike?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { isPast: false, isClosed: true, closeAt: Infinity };
    const time = String(hike.start_time || '').match(/^\s*(\d{1,2})[:.](\d{2})(?:\D|$)/);
    const startAt = time && Number(time[1]) < 24 && Number(time[2]) < 60
        ? Date.parse(`${date}T${time[1].padStart(2, '0')}:${time[2]}:00+03:00`) : Infinity;
    const fallbackAt = Date.parse(`${date}T20:00:00+03:00`);
    const yes = value => value === true || ['yes', 'true'].includes(String(value).toLowerCase());
    const clubHike = !yes(hike.city) && !yes(hike.book_club);
    const completedAt = clubHike ? clubHikeCompletedAt(date)
        : Number.isFinite(startAt) ? startAt + 5 * 3600000 : fallbackAt;
    const closeAt = Math.min(Number.isFinite(startAt) ? startAt + 3600000 : fallbackAt, completedAt);
    const today = moscowDateKey(now);
    const isPast = date < today;
    const isClosed = isPast || new Date(now).getTime() >= closeAt;
    return { startAt, closeAt, completedAt, isPast, isClosed,
        isUnderway: date === today && isClosed && new Date(now).getTime() < completedAt,
        isCompletedToday: date === today && new Date(now).getTime() >= completedAt };
}

export function isUpcomingHike(hike, now = new Date()) {
    const yes = value => value === true || ['yes', 'true'].includes(String(value).toLowerCase());
    return !yes(hike.cancelled) && !yes(hike.city) && !yes(hike.book_club)
        && !/🌧/.test(hike.emoji || '') && !hikeTiming(hike, now).isClosed;
}
