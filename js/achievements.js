import { tg } from './utils.js';
import { state } from './state.js';

export const ACHIEVEMENT_RARITIES = [
    ['common', 'базовая'], ['rare', 'редкая'], ['legendary', 'легендарная'], ['mythical', 'мифическая'],
];

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
            return data.collections;
        }).finally(() => pendingCollections.delete(key)));
    }
    return pendingCollections.get(key);
}
