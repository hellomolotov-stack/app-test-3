// js/firebase.js
import { FIREBASE_CONFIG } from './config.js';

let database = null;

export function initFirebase() {
    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        database = firebase.database();
        console.log('Firebase initialized');
        return database;
    } catch (e) {
        console.error('Firebase initialization failed:', e);
        return null;
    }
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
            title: data.title || 'Хайк',
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
            leaders: data.leaders || []
        })).sort((a, b) => a.date.localeCompare(b.date));
        callback(list);
    });
    return () => hikesRef.off('value', listener);
}

export async function loadUserData(userId) {
    if (!database || !userId) return { status: 'inactive', hikes: 0, cardUrl: '' };
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

export async function loadPopups() {
    if (!database) return {};
    try {
        const snapshot = await database.ref('popups').once('value');
        console.log('Firebase popups raw:', snapshot.val());
        return snapshot.val() || {};
    } catch (e) {
        console.error('Ошибка загрузки попапов из Firebase:', e);
        return {};
    }
}

export async function loadGuestAllowMessages(userId) {
    if (!database || !userId) return false;
    try {
        const snapshot = await database.ref(`guests/${userId}/allow_messages`).once('value');
        return snapshot.val() === 'yes';
    } catch (e) {
        console.error('Ошибка загрузки allow_messages:', e);
        return false;
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
    return database.ref(`hikeParticipants/${hikeDate}/${userId}`).remove();
}

export async function setUserRegistrationStatus(userId, hikeDate, status) {
    if (!database || !userId) return Promise.resolve();
    return database.ref(`userRegistrations/${userId}/${hikeDate}`).set(status);
}

export async function loadUserRegistrations(userId) {
    if (!database || !userId) return {};
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
    return database.ref(`userProfiles/${userId}`).remove();
}

export async function saveUserAvatar(userId, photoUrl) {
    if (!database || !userId || !photoUrl) return;
    await database.ref(`userAvatars/${userId}`).set({
        photoUrl: photoUrl,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
}
