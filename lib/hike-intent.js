const { getAccessToken } = require('../api/club-content');

const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const PILOT_ID = '7845375334';
const CHOICES = new Set(['first-hike', 'meet', 'talk', 'adventure', 'walk', 'forest']);

async function databaseRequest(path, token, value) {
    const writing = value !== undefined;
    const response = await fetch(`${DB}/${path}.json`, {
        method: writing ? 'PUT' : 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: writing ? JSON.stringify(value) : undefined,
        signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    return response.json();
}

function pilotChoice(date, token) {
    return databaseRequest(`hikeIntentPilot/${PILOT_ID}/${date}`, token);
}

async function participantChoices(date, token) {
    const [participants, choices] = await Promise.all([
        databaseRequest(`hikeParticipants/${date}`, token),
        databaseRequest(`hikeIntents/${date}`, token),
    ]);
    const visible = {};
    for (const [id, participant] of Object.entries(participants || {})) {
        const choice = choices?.[id];
        if (participant?.timestamp && CHOICES.has(choice)) visible[id] = choice;
    }
    if (participants?.[PILOT_ID]?.timestamp && choices?.[PILOT_ID] == null) {
        const legacyChoice = await pilotChoice(date, token);
        if (CHOICES.has(legacyChoice)) visible[PILOT_ID] = legacyChoice;
    }
    return visible;
}

module.exports = async function hikeIntent(user, body, res) {
    const { date, choice } = body;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'invalid hike date' });
    }
    const listing = body.action === 'hike_intent_participants';
    const writing = Object.hasOwn(body, 'choice');
    if (writing && (listing || (choice !== null && !CHOICES.has(choice)))) {
        return res.status(400).json({ error: 'invalid choice' });
    }

    try {
        const token = await getAccessToken();
        if (listing) return res.status(200).json({ choices: await participantChoices(date, token) });

        const id = String(user.id);
        const path = `hikeIntents/${date}/${id}`;
        // A cleared pilot choice must stay cleared even if the old record is still present.
        const value = writing && id === PILOT_ID && choice === null ? false : choice;
        let saved = await databaseRequest(path, token, value);
        if (!writing && saved === null && id === PILOT_ID) saved = await pilotChoice(date, token);
        return res.status(200).json({ choice: CHOICES.has(saved) ? saved : null });
    } catch (error) {
        console.error('hike intent:', error.message);
        return res.status(502).json({ error: 'hike intent unavailable' });
    }
};
