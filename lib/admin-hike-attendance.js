const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const yes = value => value === true || ['yes', 'true', '1'].includes(String(value).trim().toLowerCase());

function newcomerAttendance(data, today) {
    const { hikes, hikeVisitsBefore, hikeParticipants, noShows, app_users, members, pending_payments, card_offers } = data;
    const cardholders = new Set(Object.keys(members));
    for (const payment of Object.values(pending_payments)) {
        if (payment?.completed === true && payment.user_id && payment.card_type !== 'ticket') {
            cardholders.add(String(payment.user_id));
        }
    }

    const people = new Map();
    const dates = [...new Set([...Object.keys(hikeVisitsBefore), ...Object.keys(hikeParticipants)])].sort();
    for (const date of dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) continue;
        const history = hikeVisitsBefore[date];
        const current = hikes[date];
        const hike = String(current?.title || '').trim() ? current : history;
        const title = String(hike?.title || '').trim();
        if (!title || yes(hike.city) || yes(hike.book_club) || yes(hike.cancelled) || /🌧|🏄/.test(hike.emoji || '')) continue;

        const participants = hikeParticipants[date] || {};
        const ids = new Set([...Object.keys(history?.people || {}), ...Object.keys(participants)]);
        for (const id of ids) {
            if (cardholders.has(id) || Object.hasOwn(noShows[date] || {}, id)) continue;
            const user = app_users[id];
            const name = participants[id]?.name || history?.people?.[id] || user?.first_name || '';
            const offer = card_offers[id];
            const person = people.get(id) || {
                id, name, username: user?.username || '', can_message: user?.can_message ?? null,
                offer: offer ? { kind: offer.kind, price: offer.price, sent_at: offer.sent_at, expires_at: offer.expires_at, closed_at: offer.closed_at, used_at: offer.used_at, notified: offer.notified } : null,
                hikes: [],
            };
            person.name = name || person.name;
            person.hikes.push({ date, title });
            person.last = date;
            people.set(id, person);
        }
    }
    return [...people.values()].sort((a, b) => b.last.localeCompare(a.last));
}

async function loadNewcomerAttendance(token) {
    const sections = ['hikes', 'hikeVisitsBefore', 'hikeParticipants', 'noShows', 'app_users', 'members', 'pending_payments', 'card_offers'];
    const entries = await Promise.all(sections.map(async section => {
        const response = await fetch(`${DB}/${section}.json`, {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`${section}: ${response.status}`);
        return [section, (await response.json()) || {}];
    }));
    const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    return newcomerAttendance(Object.fromEntries(entries), today);
}

module.exports = { loadNewcomerAttendance, newcomerAttendance };
