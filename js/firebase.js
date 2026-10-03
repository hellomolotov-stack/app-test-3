// js/firebase.js
import { FIREBASE_CONFIG } from './config.js';

let database = null;
let authReadyPromise = Promise.resolve(false);

function isYes(value) {
    return value === true || String(value ?? '').trim().toLowerCase() === 'yes';
}

export function initFirebase() {
    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        database = firebase.database();
        console.log('Firebase initialized');
        signInWithTelegram();
        return database;
    } catch (e) {
        console.error('Firebase initialization failed:', e);
        return null;
    }
}

// Вход в базу по подписи Telegram: /api/tg-auth проверяет initData и выдаёт пропуск (custom token)
// с uid = Telegram id. Правила базы пускают человека только к его записям, чату, профилю.
// Firebase хранит сессию между запусками, поэтому сервер дёргаем, только если её нет.
export function signInWithTelegram() {
    const tgw = window.Telegram?.WebApp;
    const initData = tgw?.initData;
    const tgId = tgw?.initDataUnsafe?.user?.id;
    if (!initData || !tgId || typeof firebase === 'undefined' || !firebase.auth) {
        return (authReadyPromise = Promise.resolve(false));
    }
    authReadyPromise = (async () => {
        const auth = firebase.auth();
        await new Promise(resolve => { const off = auth.onAuthStateChanged(() => { off(); resolve(); }); });
        if (auth.currentUser && auth.currentUser.uid === String(tgId)) return true;
        const resp = await fetch('/api/tg-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData })
        });
        if (!resp.ok) return false;
        const { token } = await resp.json();
        await auth.signInWithCustomToken(token);
        return true;
    })().catch(err => {
        console.warn('tg-auth:', err);
        return false;
    });
    return authReadyPromise;
}

// Перед записью и чтением личного ждём вход, но не дольше 5 с – без входа приложение не зависает.
function authReady(ms = 5000) {
    return Promise.race([authReadyPromise, new Promise(resolve => setTimeout(() => resolve(false), ms))]);
}

export function getDatabase() {
    return database;
}

export function subscribeToHikes(callback) {
    if (!database) {
        callback([]);
        return () => {};
    }
    const hikesRef = database.ref('hikes');
    const listener = hikesRef.on('value', (snapshot) => {
        const hikes = snapshot.val() || {};
        const list = Object.entries(hikes).map(([date, data]) => ({
            date,
            title: data.title || '',
            features: data.features || '',
            access: data.access || '',
            details: data.details || '',
            image: data.image || data.image_url || '',
            tags: data.tags || [],
            start_time: data.start_time || '',
            location_link: data.location_link || '',
            telegram_link: data.telegram_link || '',
            report_link: data.report_link || '',
            feature_tags: data.feature_tags || [],
            woman: data.woman || '',
            leaders: data.leaders || [],
            letter_text: data.letter_text || '',
            letter_link: data.letter_link || '',
            half_image: data.half_image || '',
            cancelled: data.cancelled === true || data.cancelled === 'yes' || data.cancelled === '1',
            city: isYes(data.city),
            book_club: isYes(data.book_club),
            emoji: data.emoji || '',
            // маршрут из каталога и GPX-трек, заданные в админке, – для 3D-карты хайка
            route_id: data.route_id || '',
            track: data.track || null
        })).sort((a, b) => a.date.localeCompare(b.date));
        callback(list);
    });
    return () => hikesRef.off('value', listener);
}

export function subscribeToRoutes(callback) {
    if (!database) {
        callback([]);
        return () => {};
    }
    const routesRef = database.ref('routes');
    const listener = routesRef.on('value', (snapshot) => {
        const routes = snapshot.val() || {};
        callback(Array.isArray(routes) ? routes : Object.values(routes));
    });
    return () => routesRef.off('value', listener);
}

export function subscribeToRouteFavorites(callback) {
    if (!database) {
        callback({});
        return () => {};
    }
    const favoritesRef = database.ref('routeFavorites');
    const listener = favoritesRef.on('value', (snapshot) => {
        callback(snapshot.val() || {});
    }, () => callback({}));
    return () => favoritesRef.off('value', listener);
}

export async function loadRouteFavorites() {
    if (!database) return {};
    try {
        const snapshot = await database.ref('routeFavorites').once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Could not load route favorites', error);
        return {};
    }
}

export async function setRouteFavorite(routeId, userId, isFavorite) {
    if (!database || !routeId || !userId) return Promise.reject('No route or user');
    await authReady();
    const ref = database.ref(`routeFavorites/${routeId}/${userId}`);
    if (!isFavorite) return ref.remove();
    return ref.set({ addedAt: firebase.database.ServerValue.TIMESTAMP });
}

export async function loadUserData(userId) {
    if (!database || !userId) return { status: 'inactive', hikes: 0, cardUrl: '' };
    await authReady();
    try {
        const snapshot = await database.ref(`members/${userId}`).once('value');
        const data = snapshot.val();
        if (data && data.user_id) {
            return {
                status: 'active',
                hikes: data.hikes_count || 0,
                cardUrl: data.card_image_url || ''
            };
        } else {
            return { status: 'inactive', hikes: 0, cardUrl: '' };
        }
    } catch (e) {
        console.error('Error loading user data from Firebase:', e);
        return { status: 'inactive', hikes: 0, cardUrl: '' };
    }
}

export async function loadMetrics() {
    if (!database) return null;
    const snapshot = await database.ref('metrics').once('value');
    return snapshot.val() || { hikes: '0', kilometers: '0', locations: '0', meetings: '0' };
}

export async function loadFaq() {
    if (!database) return [];
    const snapshot = await database.ref('faq').once('value');
    return snapshot.val() || [];
}

export async function loadPrivileges() {
    if (!database) return { club: [], city: [] };
    const snapshot = await database.ref('privileges').once('value');
    return snapshot.val() || { club: [], city: [] };
}

export async function loadGuestPrivileges() {
    if (!database) return { club: [], city: [] };
    const snapshot = await database.ref('guestPrivileges').once('value');
    return snapshot.val() || { club: [], city: [] };
}

export async function loadPassInfo() {
    if (!database) return { content: '', buttonLink: '' };
    const snapshot = await database.ref('passInfo').once('value');
    return snapshot.val() || { content: '', buttonLink: '' };
}

export async function loadGiftContent() {
    if (!database) return '';
    const snapshot = await database.ref('gift').once('value');
    return snapshot.val()?.content || '';
}

export async function loadSafety() {
    const fallback = { active: false, banner: '', intro: '', page_title: '', items: [] };
    if (!database) return fallback;
    const snapshot = await database.ref('safety').once('value');
    const data = snapshot.val();
    if (!data) return fallback;
    const u = data.updates && typeof data.updates === 'object' ? data.updates : {};
    const updItems = Array.isArray(u.items) ? u.items.filter(Boolean)
                   : (u.items && typeof u.items === 'object' ? Object.values(u.items).filter(Boolean) : []);
    return {
        active: data.active === true || data.active === 'yes',
        banner: data.banner || '',
        intro: data.intro || '',
        page_title: data.page_title || '',
        items: Array.isArray(data.items) ? data.items.filter(Boolean)
             : (data.items && typeof data.items === 'object' ? Object.values(data.items) : []),
        updates: { title: u.title || '', desc: u.desc || '', items: updItems }
    };
}

export async function loadRandomPhrases() {
    if (!database) return [];
    const snapshot = await database.ref('randomPhrases').once('value');
    const data = snapshot.val();
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
}

export async function loadLeaders() {
    if (!database) return {};
    const snapshot = await database.ref('leaders').once('value');
    return snapshot.val() || {};
}

export async function loadRegistrationsPopup() {
    if (!database) return {};
    const snapshot = await database.ref('registrationsPopup').once('value');
    return snapshot.val() || {};
}

export async function loadPopupConfig() {
    if (!database) return null;
    const snapshot = await database.ref('popupConfig').once('value');
    return snapshot.val();
}

export async function loadUpdates() {
    if (!database) return [];
    const snapshot = await database.ref('updates').once('value');
    const data = snapshot.val();
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
}

export async function loadMastermindSummaries() {
    if (!database) return [];
    const snapshot = await database.ref('mastermindSummaries').once('value');
    const data = snapshot.val();
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
}

export async function loadTestimonials() {
    if (!database) return [];
    const snapshot = await database.ref('testimonials').once('value');
    const data = snapshot.val();
    if (Array.isArray(data)) return data.filter(Boolean);
    if (data && typeof data === 'object') return Object.values(data);
    return [];
}

export async function loadPopups() {
    if (!database) return {};
    try {
        const snapshot = await database.ref('popups').once('value');
        return snapshot.val() || {};
    } catch (e) {
        console.error('Ошибка загрузки попапов из Firebase:', e);
        return {};
    }
}

export function subscribeToParticipantCount(hikeDate, callback) {
    if (!database) {
        callback(0, []);
        return () => {};
    }
    const ref = database.ref('hikeParticipants/' + hikeDate);
    const listener = ref.on('value', (snapshot) => {
        const participants = snapshot.val() || {};
        const count = Object.keys(participants).length;
        const sorted = Object.values(participants)
            .filter(p => p && p.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);
        callback(count, sorted);
    });
    return () => ref.off('value', listener);
}

export async function loadAllParticipants(hikeDate) {
    if (!database) return [];
    const snapshot = await database.ref('hikeParticipants/' + hikeDate).once('value');
    const participants = snapshot.val() || {};
    return Object.values(participants)
        .filter(p => p && p.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp);
}

export async function addParticipant(hikeDate, userId, userData) {
    if (!database || !userId) return Promise.reject('No database or user');
    await authReady();
    const ref = database.ref(`hikeParticipants/${hikeDate}/${userId}`);
    const participantData = {
        userId: userId,
        name: userData.first_name || '',
        photoUrl: userData.photo_url || null,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    return ref.set(participantData);
}

export async function removeParticipant(hikeDate, userId) {
    if (!database || !userId) return Promise.reject('No database or user');
    await authReady();
    return database.ref(`hikeParticipants/${hikeDate}/${userId}`).remove();
}

export async function setUserRegistrationStatus(userId, hikeDate, status) {
    if (!database || !userId) return Promise.resolve();
    await authReady();
    return database.ref(`userRegistrations/${userId}/${hikeDate}`).set(status);
}

export async function loadUserRegistrations(userId) {
    if (!database || !userId) return {};
    await authReady();
    const snapshot = await database.ref(`userRegistrations/${userId}`).once('value');
    return snapshot.val() || {};
}

export async function loadAllProfiles() {
    if (!database) return {};
    const snapshot = await database.ref('userProfiles').once('value');
    return snapshot.val() || {};
}

export async function loadMyProfile(userId) {
    if (!database || !userId) return null;
    const snapshot = await database.ref(`userProfiles/${userId}`).once('value');
    return snapshot.val() || null;
}

export async function saveProfile(userId, profileData) {
    if (!database || !userId) return Promise.reject('No user');
    await authReady();
    const ref = database.ref(`userProfiles/${userId}`);
    const data = {
        ...profileData,
        userId: userId,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    await ref.set(data);
    return data;
}

export async function deleteProfile(userId) {
    if (!database || !userId) return Promise.reject('No user');
    await authReady();
    return database.ref(`userProfiles/${userId}`).remove();
}

export async function saveUserAvatar(userId, photoUrl) {
    if (!database || !userId || !photoUrl) return;
    await authReady();
    await database.ref(`userAvatars/${userId}`).set({
        photoUrl: photoUrl,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
}

export async function sendSupportMessage(user, text) {
    // Бросаем ошибку, а не тихо выходим: иначе чат пишет «передал», хотя сообщение никуда не ушло.
    if (!database || !user?.id) throw new Error('support: база недоступна');
    await authReady();
    const key = Date.now().toString();
    await database.ref(`support_messages/${user.id}/${key}`).set({
        from: 'user',
        text,
        ts: Math.floor(Date.now() / 1000),
        first_name: user.first_name || '',
        username: user.username || '',
        forwarded: false
    });
}

export function subscribeToAdminReplies(userId, afterTs, callback) {
    if (!database || !userId) return () => {};
    const r = database.ref(`support_messages/${userId}`).orderByChild('ts').startAt(afterTs);
    const handler = (snapshot) => {
        const msg = snapshot.val();
        if (msg && msg.from === 'admin') callback(msg, snapshot.key);
    };
    // чат читается только после входа – подписываемся, когда вход готов
    let stopped = false;
    authReady().then(() => { if (!stopped) r.on('child_added', handler); });
    return () => { stopped = true; r.off('child_added', handler); };
}

export async function markSupportMessageRead(userId, msgKey) {
    if (!database || !userId || !msgKey) return;
    await authReady();
    try { await database.ref(`support_messages/${userId}/${msgKey}/read_by_user`).set(true); } catch (e) {}
}

export async function loadSupportMessages(userId) {
    if (!database || !userId) return [];
    await authReady();
    try {
        const snapshot = await database.ref(`support_messages/${userId}`).orderByChild('ts').once('value');
        const data = snapshot.val();
        if (!data) return [];
        return Object.entries(data)
            .map(([key, msg]) => ({ key, ...msg }))
            .sort((a, b) => a.ts - b.ts);
    } catch (e) { return []; }
}
