// api/boot.js – общие данные главной одним ответом с CDN Vercel (как /api/hikes).
// Новичку без кэша раньше приходилось ждать соединения телефона с Firebase (3–6 с, у части 10+),
// чтобы увидеть привилегии, вопросы, поп-апы, баннер ЧС и прочее. Здесь те же узлы базы
// (все открыты на чтение всем), сырыми – разбирает их клиент тем же кодом, что и ответы Firebase.
// Firebase в приложении потом всё равно приходит и обновляет данные – это только быстрый старт.
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';

const NODES = [
    'faq', 'privileges', 'guestPrivileges', 'passInfo', 'gift', 'safety', 'randomPhrases',
    'leaders', 'registrationsPopup', 'popupConfig', 'mastermindSummaries', 'testimonials', 'popups'
];

module.exports = async (req, res) => {
    try {
        const values = await Promise.all(NODES.map(async node => {
            const r = await fetch(`${DB}/${node}.json`, { signal: AbortSignal.timeout(6000) });
            if (!r.ok) throw new Error(`${node} ${r.status}`);
            return r.json();
        }));
        const out = Object.fromEntries(NODES.map((n, i) => [n, values[i]]));
        // мастермайнды, поправленные в админке, лежат в закрытом adminContent – подменяем ими лист таблицы
        try {
            const { getAccessToken, normalizeMasterminds } = require('./club-content');
            const token = await getAccessToken();
            const r = await fetch(`${DB}/adminContent/masterminds.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
            const o = r.ok ? await r.json() : null;
            if (o?.hasValue) { out.mastermindSummaries = normalizeMasterminds(o.value); out.mastermindAdmin = true; }
        } catch (e) { console.error('boot masterminds:', e.message); }
        // какие прошедшие хайки с обложкой: { 'YYYY-MM-DD': версия } (картинка – /api/hikes?photo=…)
        try {
            const { getAccessToken } = require('./club-content');
            const token = await getAccessToken();
            const r = await fetch(`${DB}/hikePhotoIndex.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
            out.hikePhotos = (r.ok ? await r.json() : null) || {};
        } catch (e) { console.error('boot hikePhotos:', e.message); }
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).send(JSON.stringify(out));
    } catch (e) {
        console.error('boot:', e.message);
        res.setHeader('Cache-Control', 'no-store');
        res.status(502).json({ error: 'boot unavailable' });
    }
};
