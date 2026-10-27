import { tg } from './utils.js';
import { state } from './state.js';

// три уровня: базовая – серебро, легендарная – золото, мифическая – фиолетовый металл
// Ачивки пока в тесте: всё, что с ними связано, видят только @maxmolotov и @hellointelligent (27.10.2026).
// Открыть всем – вернуть true из achievementsVisible().
export const ACHIEVEMENTS_TEST_IDS = ['163665735', '7845375334'];
export const achievementsVisible = () => ACHIEVEMENTS_TEST_IDS.includes(String(state.user?.id || ''));

export const ACHIEVEMENT_RARITIES = [
    ['common', 'базовая'], ['legendary', 'легендарная'], ['mythical', 'мифическая'],
];
// старое значение «rare» из ранних записей показываем как легендарную
export const rarityLabel = key => key === 'rare' ? 'легендарная' : (ACHIEVEMENT_RARITIES.find(r => r[0] === key)?.[1] || '');

export async function achievementRequest(action, data = {}) {
    const response = await fetch('/api/achievements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        signal: AbortSignal.timeout(25000), body: JSON.stringify({ ...data, action, initData: tg?.initData || '' }),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'не удалось загрузить ачивки'), { status: response.status });
    return result;
}

const collections = new Map();
const pendingCollections = new Map();
export async function loadAchievementCollections(userIds) {
    const ids = [...new Set(userIds.map(String))].sort();
    if (!tg?.initData || !ids.length) return {};
    const viewer = String(state.user?.id || '');
    const key = viewer + ':' + ids.join(',');
    const cached = collections.get(key);
    if (cached && Date.now() - cached.at < 15000) return cached.value;
    if (!pendingCollections.has(key)) {
        pendingCollections.set(key, achievementRequest('collection', { userIds: ids }).then(data => {
            if (String(state.user?.id || '') !== viewer) return {};
            collections.set(key, { at: Date.now(), value: data.collections });
            // своя коллекция: редкость (у скольких есть) и прогресс по хайкам
            if (data.stats) ownMeta = { stats: data.stats, clubSize: data.clubSize || 0, progress: data.progress || null };
            return data.collections;
        }).finally(() => pendingCollections.delete(key)));
    }
    return pendingCollections.get(key);
}

let ownMeta = { stats: {}, clubSize: 0, progress: null };
export const achievementMeta = () => ownMeta;
const titleKey = t => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'–—-]/g, ' ').replace(/\s+/g, ' ').trim();
// «есть у 4% клуба» / «есть у 3 человек»
export function rarityShare(title) {
    const n = ownMeta.stats?.[titleKey(title)] || 0;
    if (!n) return 'ещё ни у кого нет';
    const pct = ownMeta.clubSize ? n / ownMeta.clubSize * 100 : 0;
    const people = `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'человека' : 'человек'}`;
    return pct >= 1 ? `есть у ${Math.round(pct)}% клуба` : `есть у ${people}`;
}
export function clearAchievementCache() { collections.clear(); }

// авто-ачивки (по хайкам и карте): раз за запуск и после важных моментов – записи, покупки карты
let claimPromise = null;
export function claimAchievements(force = false) {
    if (!tg?.initData) return Promise.resolve({ granted: [] });
    if (claimPromise && !force) return claimPromise;
    claimPromise = achievementRequest('claim').then(r => { if (r.granted?.length) collections.clear(); return r; })
        .catch(() => ({ granted: [] }));
    return claimPromise;
}
const holdersCache = new Map();
export function achievementHolders(id) {
    if (!holdersCache.has(id)) holdersCache.set(id, achievementRequest('holders', { id }).catch(e => { holdersCache.delete(id); throw e; }));
    return holdersCache.get(id);
}
