// Значок «хайкинг бокс»: выдаётся сразу, когда человек впервые оплатил бокс (webhook dietcakes → /api/dc-loyalty hike_order).
// Для всех – и с картой, и без. Повторные заказы ничего не меняют: у кого значок уже есть, его не трогаем.
// Запись значка – опубликованная «хайкинг бокс» с картинкой (clubAchievements/<id>), grants.<telegram id>.issuedBy = 'auto-box'.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const TITLE = 'хайкинг бокс';

async function grantBoxBadge(uid, name, { getToken, fetcher = fetch } = {}) {
    uid = String(uid || '');
    if (!/^\d{1,16}$/.test(uid)) return { granted: false, reason: 'no-user' };
    const token = await (getToken || require('../api/club-content').getAccessToken)();
    const auth = { Authorization: `Bearer ${token}` };
    const r = await fetcher(`${DB}/clubAchievements.json`, { headers: auth, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('clubAchievements ' + r.status);
    const all = (await r.json()) || {};
    const id = Object.entries(all)
        .filter(([, a]) => a?.title === TITLE && a.medal?.imageUrl && a.publicationStatus !== 'draft')
        .sort((a, b) => Object.keys(b[1].grants || {}).length - Object.keys(a[1].grants || {}).length)[0]?.[0];
    if (!id) return { granted: false, reason: 'no-badge' };
    for (let attempt = 0; attempt < 3; attempt++) {
        const g = await fetcher(`${DB}/clubAchievements/${id}.json`, { headers: { ...auth, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(10000) });
        const etag = g.headers.get('etag');
        const rec = await g.json();
        if (rec.grants?.[uid]?.issuedAt) return { granted: false, reason: 'already', id };
        const now = Date.now();
        const date = new Date(now + 3 * 3600 * 1000).toISOString().slice(0, 10);
        const entry = { userId: uid, name: String(name || uid).slice(0, 100), date };
        rec.recipients = { ...(rec.recipients || {}), [uid]: entry };
        rec.grants = { ...(rec.grants || {}), [uid]: { ...entry, issuedAt: now, issuedBy: 'auto-box' } };
        rec.updatedAt = now; rec.updatedBy = 'auto-box';
        rec.history = [...(rec.history || []), { action: 'auto_box', at: now, by: 'auto-box', added: [uid] }];
        const w = await fetcher(`${DB}/clubAchievements/${id}.json`, {
            method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json', 'If-Match': etag },
            body: JSON.stringify(rec), signal: AbortSignal.timeout(10000),
        });
        if (w.ok) return { granted: true, id };
        if (w.status !== 412 || attempt === 2) throw new Error(`clubAchievements/${id} ${w.status}`);
    }
}

module.exports = { grantBoxBadge };
