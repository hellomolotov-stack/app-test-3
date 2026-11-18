import { state } from '../state.js';
import { achievementRequest, clearAchievementCache, loadAchievementCollections } from '../achievements.js';

const shown = new Set();
// Одна и та же награда для бесплатной анкеты и анкеты владельца карты.
// Не показываем её, пока сервер не подтвердил выдачу и коллекция не содержит значок.
export async function showProfileAwardAfterSave() {
    const userId = String(state.user?.id || '');
    if (!userId) return false;
    const result = await achievementRequest('claim');
    clearAchievementCache();
    const collection = (await loadAchievementCollections([userId]))[userId] || [];
    if (String(state.user?.id || '') !== userId) return false;
    const badge = collection.find(item => item.title === 'показал себя клубу');
    if (!badge) return false;
    const key = `${userId}:${badge.id}:${badge.grant?.issuedAt || 0}`;
    if (shown.has(key) || (!result.granted?.includes('показал себя клубу') && badge.seenAt)) return false;
    const { openAchievementsPopup } = await import('./achievements-popup.js');
    openAchievementsPopup([badge], { fresh: true, source: 'сохранение профиля', owned: collection.length });
    shown.add(key);
    return true;
}
