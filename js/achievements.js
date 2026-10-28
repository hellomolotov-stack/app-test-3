import { tg } from './utils.js';
import { state } from './state.js';
import { catalogByTitle, tierOf } from './achievements-catalog.js';

// три уровня: базовая – серебро, легендарная – золото, эпическая (в базе – mythical) – фиолетовый металл
// Значки открыты всем с 27.10.2026. Скрыть снова – вернуть проверку по id в achievementsVisible().
export const achievementsVisible = () => true;

export const ACHIEVEMENT_RARITIES = [
    ['common', 'базовый'], ['legendary', 'легендарный'], ['mythical', 'эпический'],
];
// старое значение «rare» из ранних записей показываем как легендарную
export const rarityLabel = key => key === 'rare' ? 'легендарный' : (ACHIEVEMENT_RARITIES.find(r => r[0] === key)?.[1] || '');

export async function achievementRequest(action, data = {}) {
    const response = await fetch('/api/achievements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        signal: AbortSignal.timeout(25000), body: JSON.stringify({ ...data, action, initData: tg?.initData || '' }),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'не удалось загрузить значки'), { status: response.status });
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
            // везде сначала самые ценные: эпические → легендарные → базовые, внутри уровня – от новых к старым
            Object.values(data.collections || {}).forEach(sortByValue);
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
// редкость: «клуб» – кто хоть раз ходил с нами и владельцы карты (не все, кто открывал приложение).
// стартовый значок – без процентов; меньше 5 человек – числом («у 3 интеллигентов»), иначе – «у 17% клуба»
export function rarityShare(title) {
    if (titleKey(title) === 'добро пожаловать') return 'стартовый значок – есть у каждого в клубе';
    const n = ownMeta.stats?.[titleKey(title)] || 0;
    if (!n) return 'ещё ни у кого нет';
    const people = `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'интеллигента' : 'интеллигентов'}`;
    if (n < 5 || !ownMeta.clubSize) return `есть у ${people}`;
    return `есть у ${Math.min(100, Math.max(1, Math.round(n / ownMeta.clubSize * 100)))}% клуба`;
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

const TIER_RANK = { very: 0, rare: 1, common: 2 };
export const achievementValue = a => TIER_RANK[tierOf(catalogByTitle(a.title)?.rarity || a.rarity)] ?? 3;
export function sortByValue(items) {
    return items.sort((a, b) => achievementValue(a) - achievementValue(b) || (b.grant?.issuedAt || 0) - (a.grant?.issuedAt || 0));
}

// Без карты интеллигента: базовые значки – полностью; легендарные и эпические получены, но «ждут активации»
// (в цвете, со свечением металла и замком) – карта активирует их все разом. Часть значков – только с картой.
export const isCardHolder = () => state.userCard?.status === 'active';
export const CARD_ONLY_IDS = ['card-owner', 'plus-one', 'gift-card', 'hikes-10', 'hikes-20', 'hikes-30', 'hikes-50'];
export const metalOf = a => ({ rare: 'gold', very: 'vio' })[tierOf(catalogByTitle(a.title)?.rarity || a.rarity)] || '';
export const isWaiting = a => !isCardHolder() && !!metalOf(a);
export const isCardOnly = id => CARD_ONLY_IDS.includes(id);
