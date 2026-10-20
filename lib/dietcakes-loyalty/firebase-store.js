'use strict';
const { LoyaltyError } = require('./ledger');
const DATABASE = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
function firebaseStore(getAccessToken, namespace, fetcher = fetch) {
    if (!['dietcakesLoyaltyPilot', 'dietcakesLoyalty'].includes(namespace)) throw new Error('invalid namespace');
    function url(uid) { if (!/^\d{1,16}$/.test(uid)) throw new Error('invalid uid'); return `${DATABASE}/${namespace}/cards/${uid}.json`; }
    return {
        async read(uid) {
            const token = await getAccessToken();
            const response = await fetcher(url(uid), { headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(8000) });
            const etag = response.headers.get('etag');
            if (!response.ok || !etag) throw new LoyaltyError('storage_unavailable', 503);
            return { value: await response.json(), etag };
        },
        async compareAndSet(uid, etag, value) {
            const token = await getAccessToken();
            const response = await fetcher(url(uid), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(value), signal: AbortSignal.timeout(8000) });
            if (response.status === 412) return false;
            if (!response.ok) throw new LoyaltyError('storage_write_unconfirmed', 503);
            return true;
        }
    };
}
module.exports = { DATABASE, firebaseStore };
