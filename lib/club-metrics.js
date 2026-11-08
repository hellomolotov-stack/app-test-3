const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
// До приложения сохранилась история посещений, но не дистанции по датам.
// Подтверждено 08.11.2026: 301 км = 179 км истории + 122 км из тегов 16 хайков.
const BASELINE = { through: '2026-03-01', kilometers: 179, hikes: 20 };
const yes = v => v === true || ['yes', 'true', '1'].includes(String(v || '').trim().toLowerCase());
const SERVICE_IDS = new Set(['7845375334']);

function completed(date, hike, now) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const day = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
    if (date < day) return true;
    if (date > day) return false;
    const time = String(hike.start_time || '').match(/^(\d{1,2})[:.](\d{2})/);
    const start = time && +time[1] < 24 && +time[2] < 60 ? Date.parse(`${date}T${time[1].padStart(2, '0')}:${time[2]}:00+03:00`) : null;
    return now >= (start === null ? Date.parse(`${date}T20:00:00+03:00`) : start + 5 * 3600000);
}
function distanceKm(hike) {
    const tags = Array.isArray(hike.tags) ? hike.tags : [String(hike.tags || '')];
    for (const tag of tags) {
        if (/\d\s*[-–—]\s*\d+(?:[.,]\d+)?\s*(?:км|km)/i.test(tag)) continue;
        const m = String(tag).match(/(\d+(?:[.,]\d+)?)\s*(?:км|km)(?![а-яa-z])/i);
        if (m) return Number(m[1].replace(',', '.'));
    }
    return null;
}
function calculateMetrics({ hikes = {}, before = {}, participants = {}, noShows = {}, baseline = BASELINE, locations = '0', now = Date.now() }) {
    hikes ||= {}; before ||= {}; participants ||= {}; noShows ||= {};
    now = Number(now);
    const dates = [...new Set([...Object.keys(before), ...Object.keys(hikes)])].sort();
    const pairs = new Set(), missingDistances = [];
    let count = 0, km = baseline.kilometers;
    for (const date of dates) {
        const current = hikes[date] || {}, history = before[date];
        // Подтверждённые посещения до приложения важнее оставшейся заглушки календаря.
        const source = String(current.title || '').trim() ? current : history || current;
        const hike = { ...source, start_time: source.start_time || current.start_time, title: String(source.title || '').trim() };
        if (!hike.title || yes(hike.city) || yes(hike.book_club) || yes(hike.cancelled) || /🌧|🏄/.test(hike.emoji || '') || !completed(date, hike, now)) continue;
        count++;
        if (date > baseline.through) {
            const distance = distanceKm(hike);
            if (distance === null) missingDistances.push(date); else km += distance;
        }
        const ids = new Set(Object.keys(history?.people || {}));
        for (const [id, p] of Object.entries(participants[date] || {})) if (p && typeof p === 'object') ids.add(id);
        ids.add('163665735'); // Макс вёл все хайки; исторически мог не отмечаться в записи.
        const people = [...ids].filter(id => !SERVICE_IDS.has(id) && !yes(noShows[date]?.[id])).sort();
        for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) pairs.add(`${people[i]}|${people[j]}`);
    }
    if (missingDistances.length) throw new Error('нет дистанции завершённых хайков: ' + missingDistances.join(', '));
    return { hikes: String(count), kilometers: String(Math.round(km * 100) / 100), locations: String(locations), meetings: String(pairs.size) };
}
async function getClubMetrics(token, fallback) {
    const read = async node => {
        const r = await fetch(`${DB}/${node}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`metrics ${node}: ${r.status}`);
        return (await r.json()) || {};
    };
    const [hikes, before, participants, noShows] = await Promise.all(['hikes', 'hikeVisitsBefore', 'hikeParticipants', 'noShows'].map(read));
    if (Object.keys(before).filter(date => date <= BASELINE.through).length < BASELINE.hikes) throw new Error('неполная история хайков');
    return calculateMetrics({ hikes, before, participants, noShows, locations: fallback.locations });
}
module.exports = { calculateMetrics, getClubMetrics, distanceKm };
