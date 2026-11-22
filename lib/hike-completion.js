const yes = value => value === true || ['yes', 'true'].includes(String(value).toLowerCase());

function completedClubHike(date, hike, now = Date.now()) {
    return !!(hike && /^\d{4}-\d{2}-\d{2}$/.test(date) && String(hike.title || '').trim()
        && !yes(hike.cancelled) && !yes(hike.city) && !yes(hike.book_club) && !/🌧/.test(hike.emoji || '')
        && now >= Date.parse(date + 'T18:00:00+03:00'));
}

// Keys change exactly at 18:00 MSK, so a warm instance cannot keep pre-completion results.
function completionKey(now) {
    return new Date(now - 15 * 3600000).toISOString().slice(0, 10);
}

module.exports = { completedClubHike, completionKey };
