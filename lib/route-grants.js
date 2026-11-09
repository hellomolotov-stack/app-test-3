const validDate = d => typeof d === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(d);
function routeDates(grant) {
    return [...new Set((Array.isArray(grant?.dates) ? grant.dates : [grant?.hikeDate || grant?.date]).filter(validDate))].sort();
}
function addRouteDate(previous, person, date, now, by) {
    const dates = routeDates(previous);
    if (dates.includes(date)) return previous;
    dates.push(date); dates.sort();
    return { ...previous, ...person, date: dates.at(-1), hikeDate: dates.at(-1), dates, count: dates.length,
        issuedAt: now, issuedBy: by, notificationAt: now };
}
function grantSeenAt(grant, seen) {
    if (grant.notificationAt === 0) return Number(seen) || grant.issuedAt;
    if (grant.notificationAt > 0 && Number(seen) < grant.notificationAt) return null;
    return Number(seen) || null;
}
module.exports = { routeDates, addRouteDate, grantSeenAt };
