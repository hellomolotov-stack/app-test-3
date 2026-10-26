import { tg } from './utils.js';

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
