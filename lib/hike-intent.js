const { getAccessToken } = require('../api/club-content');

const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const PILOT_ID = '7845375334';
const CHOICES = new Set(['first-hike', 'meet', 'talk', 'adventure', 'walk', 'forest']);

module.exports = async function hikeIntent(user, body, res) {
    if (String(user.id) !== PILOT_ID) return res.status(403).json({ error: 'pilot only' });

    const { date, choice } = body;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'invalid hike date' });
    }
    const writing = Object.hasOwn(body, 'choice');
    if (writing && choice !== null && !CHOICES.has(choice)) {
        return res.status(400).json({ error: 'invalid choice' });
    }

    try {
        const token = await getAccessToken();
        const response = await fetch(`${DB}/hikeIntentPilot/${PILOT_ID}/${date}.json`, {
            method: writing ? 'PUT' : 'GET',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: writing ? JSON.stringify(choice) : undefined,
            signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) throw new Error(`Firebase ${response.status}`);
        const saved = await response.json();
        return res.status(200).json({ choice: CHOICES.has(saved) ? saved : null });
    } catch (error) {
        console.error('hike intent:', error.message);
        return res.status(502).json({ error: 'hike intent unavailable' });
    }
};
