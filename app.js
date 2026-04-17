// Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();

function haptic() {
    tg.HapticFeedback?.impactOccurred('light');
}
window.haptic = haptic;

function openLink(url, action, isGuest) {
    haptic();
    if (action) log(action, isGuest);
    if (url.startsWith('https://t.me/')) {
        tg.openTelegramLink(url);
        setTimeout(() => tg.close(), 100);
    } else {
        tg.openLink(url);
    }
}
window.openLink = openLink;

const backButton = tg.BackButton;

function showBack(callback) {
    backButton.offClick();
    backButton.onClick(() => { haptic(); callback(); });
    backButton.show();
}

function hideBack() {
    backButton.hide();
}

// Конфигурация
const GUEST_API_URL = 'https://script.google.com/macros/s/AKfycby0943sdi-neS00sFzcyT-rsmzQgPOD4vsOYMnnLYSK8XcEIQJynP1CGsSWP62gK1zxSw/exec';
const REGISTRATION_API_URL = 'https://script.google.com/macros/s/AKfycbxbtauKP7FO0quR0yktXfbnU-x_Vk6zOzKZlms-tgQSszVDQH1POGrREYdjPBzHqyUJFg/exec';
const ROBOKASSA_LINK = 'https://auth.robokassa.ru/merchant/Invoice/1PA1-yY5CEO9FPrxJnvIJw';
const SEASON_CARD_LINK = 'https://auth.robokassa.ru/merchant/Invoice/l8qjTjiBi06GlZIPFgo4Ug';
const PERMANENT_CARD_LINK = 'https://auth.robokassa.ru/merchant/Invoice/Es0zC2xYmkaM9Q-TvYgw0A';

const CACHE_TTL = 600000;
const DATA_TIMEOUT = 10000;

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';
const userPhotoUrl = user?.photo_url;

let userCard = { status: 'loading', hikes: 0, cardUrl: '' };
let metrics = { hikes: '0', kilometers: '0', locations: '0', meetings: '0' };
let hikesData = {};
let hikesList = [];
let faq = [];
let privileges = { club: [], city: [] };
let giftContent = '';
let randomPhrases = [];
let leaders = {};
let guestPrivileges = { club: [], city: [] };
let passInfo = { content: '', buttonLink: '' };
let profiles = {};
let myProfile = null;

let registrationsPopup = {};
let popupConfig = {
    text: 'чтобы забронировать место на хайк нужно приобрести билет или карту интеллигента',
    ticketPrice: 1500,
    ticketLink: ROBOKASSA_LINK,
    seasonCardPrice: 5500,
    seasonCardLink: SEASON_CARD_LINK,
    permanentCardPrice: 7500,
    permanentCardLink: PERMANENT_CARD_LINK
};

let database = null;
try {
    const firebaseConfig = {
        apiKey: "AIzaSyCv4v2CJxR1A-QkYWYjzFEF-kKWB1qUSQY",
        authDomain: "hiking-club-app-b6c7c.firebaseapp.com",
        databaseURL: "https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "hiking-club-app-b6c7c",
        storageBucket: "hiking-club-app-b6c7c.firebasestorage.app",
        messagingSenderId: "507288460496",
        appId: "1:507288460496:web:5a3381866b95e9096492d5",
        measurementId: "G-2PBBHYD8JG"
    };
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log('Firebase initialized');
} catch (e) {
    console.error('Firebase initialization failed:', e);
    database = null;
}

// --- Кэширование данных ---
function loadCachedData() {
    try {
        const cached = localStorage.getItem('hikingAppCache');
        if (cached) {
            const data = JSON.parse(cached);
            if (data.hikesList) {
                hikesList = data.hikesList;
                hikesData = data.hikesData;
            }
            if (data.metrics) metrics = data.metrics;
            if (data.faq) faq = data.faq;
            if (data.privileges) privileges = data.privileges;
            if (data.guestPrivileges) guestPrivileges = data.guestPrivileges;
            if (data.passInfo) passInfo = data.passInfo;
            if (data.giftContent) giftContent = data.giftContent;
            if (data.randomPhrases) randomPhrases = data.randomPhrases;
            if (data.leaders) leaders = data.leaders;
            return true;
        }
    } catch (e) {}
    return false;
}

function saveCachedData() {
    try {
        const toCache = {
            hikesList, hikesData,
            metrics, faq, privileges, guestPrivileges,
            passInfo, giftContent, randomPhrases, leaders
        };
        localStorage.setItem('hikingAppCache', JSON.stringify(toCache));
    } catch (e) {}
}

// --- Загрузка данных пользователя из Firebase (вместо CSV) ---
async function loadUserDataFromFirebase() {
    if (!database || !userId) {
        userCard.status = 'inactive';
        return;
    }
    try {
        const snapshot = await database.ref(`members/${userId}`).once('value');
        const data = snapshot.val();
        if (data && data.user_id) {
            userCard = {
                status: 'active',
                hikes: data.hikes_count || 0,
                cardUrl: data.card_image_url || ''
            };
        } else {
            userCard.status = 'inactive';
        }
    } catch (e) {
        console.error('Error loading user data from Firebase:', e);
        userCard.status = 'inactive';
    }
}

// --- Загрузка всех профилей ---
async function loadAllProfiles() {
    if (!database) return;
    try {
        const snapshot = await database.ref('userProfiles').once('value');
        profiles = snapshot.val() || {};
        return profiles;
    } catch (e) {
        console.error('Error loading profiles:', e);
        profiles = {};
        return {};
    }
}

async function loadMyProfile() {
    if (!database || !userId) return null;
    try {
        const snapshot = await database.ref(`userProfiles/${userId}`).once('value');
        myProfile = snapshot.val() || null;
        return myProfile;
    } catch (e) {
        console.error('Error loading my profile:', e);
        return null;
    }
}

async function saveProfile(profileData) {
    if (!database || !userId) return Promise.reject('No user');
    const profileRef = database.ref(`userProfiles/${userId}`);
    const data = {
        ...profileData,
        userId: userId,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    await profileRef.set(data);
    myProfile = data;
    profiles[userId] = data;
    syncProfileToSheet(data);
    console.log('Profile saved to Firebase', data);
    return data;
}

async function deleteProfile() {
    if (!database || !userId) return Promise.reject('No user');
    const profileRef = database.ref(`userProfiles/${userId}`);
    await profileRef.remove();
    delete profiles[userId];
    myProfile = null;
    syncProfileDeleteToSheet(userId);
    console.log('Profile deleted');
}

function syncProfileToSheet(profile) {
    const url = 'ВАШ_НОВЫЙ_СКРИПТ'; // замените на реальный URL
    fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'syncProfile',
            user_id: profile.userId,
            name: profile.name,
            statuses: profile.friendshipStatuses,
            hobbies: profile.hobbies,
            profession: profile.profession,
            avatar_url: profile.avatarUrl,
            updated_at: new Date().toISOString()
        })
    }).catch(e => console.error('Profile sync error:', e));
}

function syncProfileDeleteToSheet(userId) {
    const url = 'ВАШ_НОВЫЙ_СКРИПТ';
    fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'deleteProfile',
            user_id: userId
        })
    }).catch(e => console.error('Profile delete sync error:', e));
}

async function updateAvatarIfNeeded() {
    if (!userId || !myProfile) return;
    const lastUpdated = myProfile.avatarUpdatedAt || 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    if (now - lastUpdated > oneDay && userPhotoUrl) {
        try {
            await database.ref(`userProfiles/${userId}/avatarUrl`).set(userPhotoUrl);
            await database.ref(`userProfiles/${userId}/avatarUpdatedAt`).set(firebase.database.ServerValue.TIMESTAMP);
            myProfile.avatarUrl = userPhotoUrl;
            myProfile.avatarUpdatedAt = Date.now();
            if (profiles[userId]) profiles[userId].avatarUrl = userPhotoUrl;
        } catch (e) {
            console.error('Error updating avatar:', e);
        }
    }
}

async function saveUserAvatar() {
    if (!database || !userId || !userPhotoUrl) return;
    try {
        await database.ref(`userAvatars/${userId}`).set({
            photoUrl: userPhotoUrl,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (e) {
        console.error('Error saving user avatar:', e);
    }
}

function subscribeToHikes(callback) {
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
        hikesList = list;
        hikesData = hikes;
        callback(list);
        saveCachedData();
    });
    return () => hikesRef.off('value', listener);
}

async function loadMetricsFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('metrics').once('value');
        return snapshot.val() || null;
    } catch (e) {
        console.error('Error loading metrics:', e);
        return null;
    }
}

async function loadFaqFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('faq').once('value');
        return snapshot.val() || [];
    } catch (e) {
        console.error('Error loading faq:', e);
        return null;
    }
}

async function loadPrivilegesFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('privileges').once('value');
        return snapshot.val() || { club: [], city: [] };
    } catch (e) {
        console.error('Error loading privileges:', e);
        return null;
    }
}

async function loadGuestPrivilegesFromFirebase() {
    if (!database) return { club: [], city: [] };
    try {
        const snapshot = await database.ref('guestPrivileges').once('value');
        return snapshot.val() || { club: [], city: [] };
    } catch (e) {
        console.error('Error loading guest privileges:', e);
        return { club: [], city: [] };
    }
}

async function loadPassInfoFromFirebase() {
    if (!database) return { content: '', buttonLink: '' };
    try {
        const snapshot = await database.ref('passInfo').once('value');
        return snapshot.val() || { content: '', buttonLink: '' };
    } catch (e) {
        console.error('Error loading pass info:', e);
        return { content: '', buttonLink: '' };
    }
}

async function loadGiftFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('gift').once('value');
        return snapshot.val()?.content || '';
    } catch (e) {
        console.error('Error loading gift:', e);
        return null;
    }
}

async function loadRandomPhrasesFromFirebase() {
    if (!database) return [];
    try {
        const snapshot = await database.ref('randomPhrases').once('value');
        const data = snapshot.val();
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') return Object.values(data);
        return [];
    } catch (e) {
        console.error('Error loading random phrases:', e);
        return [];
    }
}

async function loadLeadersFromFirebase() {
    if (!database) return {};
    try {
        const snapshot = await database.ref('leaders').once('value');
        return snapshot.val() || {};
    } catch (e) {
        console.error('Error loading leaders:', e);
        return {};
    }
}

async function loadRegistrationsPopup() {
    if (!database) return;
    try {
        const snapshot = await database.ref('registrationsPopup').once('value');
        registrationsPopup = snapshot.val() || {};
    } catch (e) {
        console.error('Error loading registrations popup:', e);
    }
}

async function loadPopupConfig() {
    if (!database) return;
    try {
        const snapshot = await database.ref('popupConfig').once('value');
        const data = snapshot.val();
        if (data) popupConfig = { ...popupConfig, ...data };
    } catch (e) {
        console.error('Error loading popup config:', e);
    }
}

function subscribeToParticipantCount(hikeDate, callback) {
    if (!database) {
        callback(0, []);
        return () => {};
    }
    const participantsRef = database.ref('hikeParticipants/' + hikeDate);
    const listener = participantsRef.on('value', (snapshot) => {
        const participants = snapshot.val() || {};
        const count = Object.keys(participants).length;
        const sorted = Object.values(participants)
            .filter(p => p && p.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);
        callback(count, sorted);
    });
    return () => participantsRef.off('value', listener);
}

async function loadAllParticipants(hikeDate) {
    if (!database) return [];
    try {
        const snapshot = await database.ref('hikeParticipants/' + hikeDate).once('value');
        const participants = snapshot.val() || {};
        return Object.values(participants)
            .filter(p => p && p.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
        console.error('Error loading all participants:', e);
        return [];
    }
}

async function addParticipant(hikeDate) {
    if (!database || !userId) return Promise.reject('No database or user');
    const participantRef = database.ref(`hikeParticipants/${hikeDate}/${userId}`);
    let photoUrl = userPhotoUrl;
    if (!photoUrl && database) {
        try {
            const snap = await database.ref(`userAvatars/${userId}`).once('value');
            photoUrl = snap.val()?.photoUrl;
        } catch (e) {}
    }
    const participantData = {
        userId: userId,
        name: user?.first_name || '',
        photoUrl: photoUrl || null,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    return participantRef.set(participantData);
}

async function removeParticipant(hikeDate) {
    if (!database || !userId) return Promise.reject('No database or user');
    const participantRef = database.ref(`hikeParticipants/${hikeDate}/${userId}`);
    return participantRef.remove();
}

function incrementParticipantCount(hikeDate) { return addParticipant(hikeDate); }
function decrementParticipantCount(hikeDate) { return removeParticipant(hikeDate); }

function setUserRegistrationStatus(hikeDate, status) {
    if (!database || !userId) return Promise.resolve();
    const statusRef = database.ref(`userRegistrations/${userId}/${hikeDate}`);
    return statusRef.set(status);
}

async function loadUserRegistrationsFromFirebase() {
    if (!database || !userId || !hikesList.length) return {};
    try {
        const userRef = database.ref(`userRegistrations/${userId}`);
        const snapshot = await userRef.once('value');
        const registrations = snapshot.val() || {};
        const statusMap = {};
        hikesList.forEach((hike, index) => {
            statusMap[index] = registrations[hike.date] === true;
        });
        return statusMap;
    } catch (e) {
        console.error('Error loading user registrations:', e);
        return {};
    }
}

function loadUserRegistrationsFromLocal() {
    const savedStatus = localStorage.getItem('hikeBookingStatus');
    if (savedStatus) {
        try {
            const parsed = JSON.parse(savedStatus);
            const statusMap = {};
            hikesList.forEach((hike, index) => {
                statusMap[index] = parsed[hike.date] || false;
            });
            return statusMap;
        } catch (e) { return {}; }
    }
    return {};
}

function saveStatusToLocalStorage() {
    if (!hikesList.length) return;
    const statusObj = {};
    hikesList.forEach((hike, index) => {
        statusObj[hike.date] = hikeBookingStatus[index] || false;
    });
    localStorage.setItem('hikeBookingStatus', JSON.stringify(statusObj));
}

function updateRegistrationInSheet(hikeDate, hikeTitle, status, purchaseType = '') {
    if (!userId || !REGISTRATION_API_URL) return;
    try {
        const hasCard = userCard.status === 'active' ? 'да' : 'нет';
        const profileLink = user?.username ? `https://t.me/${user.username}` : '';
        const params = new URLSearchParams({
            action: 'update',
            user_id: userId,
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            username: user?.username || '',
            profile_link: profileLink,
            hike_date: hikeDate,
            hike_title: hikeTitle,
            status: status,
            has_card: hasCard,
            purchase_type: purchaseType
        });
        fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true })
            .catch(e => console.error('Ошибка отправки запроса в Google Sheets:', e));
    } catch (e) {
        console.error('Ошибка в updateRegistrationInSheet:', e);
    }
}

let isPrivPage = false;
let isMenuActive = false;
let hikeBookingStatus = {};

const mainDiv = document.getElementById('mainContent');
const subtitle = document.getElementById('subtitle');
const bottomNav = document.getElementById('bottomNav');
const navPopup = document.getElementById('navPopup');

let userInteracted = false;
let manualNavClick = null;
let manualNavTimer = null;

function setUserInteracted() { userInteracted = true; }
function setManualNav(target) {
    if (manualNavTimer) clearTimeout(manualNavTimer);
    manualNavClick = target;
    manualNavTimer = setTimeout(() => { manualNavClick = null; }, 2000);
}
function setActiveNav(activeId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (activeId) document.getElementById(activeId)?.classList.add('active');
}
function resetNavActive() { document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active')); }

function updateActiveNav() {
    if (isPrivPage || isMenuActive) return;
    if (manualNavClick) {
        setActiveNav(manualNavClick === 'home' ? 'navHome' : 'navHikes');
        return;
    }
    if (!userInteracted) { setActiveNav('navHome'); return; }
    const navHome = document.getElementById('navHome');
    const navHikes = document.getElementById('navHikes');
    const navProfiles = document.getElementById('navProfiles');
    if (!navHome || !navHikes) return;
    const isProfilesPage = document.getElementById('profilesContainer') !== null || document.querySelector('.profiles-grid') !== null;
    if (isProfilesPage) {
        setActiveNav('navProfiles');
        return;
    }
    const calendarContainer = document.getElementById('calendarContainer');
    if (!calendarContainer) { setActiveNav('navHome'); return; }
    const rect = calendarContainer.getBoundingClientRect();
    const isCalendarVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (isCalendarVisible) setActiveNav('navHikes');
    else setActiveNav('navHome');
}

function log(action, isGuest = false) {
    if (!userId) return;
    const finalAction = isGuest ? `${action}_guest` : action;
    const params = new URLSearchParams({
        user_id: userId,
        username: user?.username || '',
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        action: finalAction
    });
    new Image().src = `${GUEST_API_URL}?${params}`;
}

let loaderInterval = null, loaderMessageTimer = null;
function showAnimatedLoader() {
    const loader = document.getElementById('initial-loader');
    if (!loader) return;
    loader.innerHTML = `
        <div class="loader-animation">
            <div class="loader-emoji" id="loaderEmoji">⛰️</div>
            <div class="loader-text" id="loaderText">выбираем вершину</div>
        </div>
        <div class="loader-message" id="loaderMessage" style="display: none;">⚡️ для работы приложения включи три буквы</div>
    `;
    loader.style.display = 'flex';
    loader.classList.remove('fade-out');
    const steps = [
        { emoji: '⛰️', text: 'выбираем вершину' },
        { emoji: '🥾', text: 'завязываем шнурки' },
        { emoji: '🗺️', text: 'прокладываем маршрут' },
        { emoji: '✨', text: 'наполняемся красотой' }
    ];
    let index = 0;
    const emojiEl = document.getElementById('loaderEmoji');
    const textEl = document.getElementById('loaderText');
    const messageEl = document.getElementById('loaderMessage');
    if (!emojiEl || !textEl || !messageEl) return;
    loaderInterval = setInterval(() => {
        index = (index + 1) % steps.length;
        emojiEl.textContent = steps[index].emoji;
        textEl.textContent = steps[index].text;
    }, 1500);
    loaderMessageTimer = setTimeout(() => {
        if (loader.style.display !== 'none' && !loader.classList.contains('fade-out')) {
            messageEl.style.display = 'block';
        }
    }, 3000);
}

function hideAnimatedLoader() {
    if (loaderInterval) clearInterval(loaderInterval);
    if (loaderMessageTimer) clearTimeout(loaderMessageTimer);
    const loader = document.getElementById('initial-loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => { loader.style.display = 'none'; loader.innerHTML = ''; }, 300);
    }
}

function normalizeDate(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = parts[0].padStart(4, '0');
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        const month = parseInt(parts[1], 10) - 1;
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        return `${day} ${monthNames[month]}`;
    }
    return dateStr;
}

function scrollToCalendar() {
    setUserInteracted();
    setTimeout(() => {
        const calendarContainer = document.getElementById('calendarContainer');
        if (calendarContainer) calendarContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function showGuestBookingPopup(hikeDate, hikeTitle, isGuest) {
    haptic();
    const config = popupConfig;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestBookingPopup';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 500px; padding: 20px;">
            <button class="modal-close" id="closePopup" style="background: rgba(255,255,255,0.2); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: none; color: rgba(255,255,255,0.7); font-size: 28px; cursor: pointer; line-height: 1; position: absolute; top: 16px; right: 16px; backdrop-filter: blur(4px);">&times;</button>
            <div class="modal-title">регистрация на хайк</div>
            <div class="modal-text" style="margin-bottom: 20px;">${config.text}</div>
            <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                <button class="btn btn-yellow" id="buyTicketBtn" style="width: 100%; margin: 0;">купить билет 🎟️ · ${config.ticketPrice} ₽</button>
                <div id="cardAccordionPopup" style="width: 100%;">
                    <button class="btn btn-outline" id="showCardOptionsBtn" style="width: 100%; margin: 0; box-sizing: border-box;">оформить карту 💳</button>
                    <div id="cardOptions" style="display: none; margin-top: 12px;">
                        <div style="display: flex; flex-direction: row; gap: 8px; width: 100%;">
                            <button class="btn btn-outline" id="buySeasonCardBtn" style="flex: 1; margin: 0; box-sizing: border-box;">сезонная</button>
                            <button class="btn btn-outline" id="buyPermanentCardBtn" style="flex: 1; margin: 0; box-sizing: border-box;">бессрочная</button>
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: rgba(255,255,255,0.7); font-size: 12px;">
                            <div style="flex: 1;">до конца 2026</div>
                            <div style: "flex: 1;">все сезоны</div>
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: #ffffff; font-size: 14px;">
                            <div style="flex: 1;">${config.seasonCardPrice} ₽</div>
                            <div style="flex: 1;">${config.permanentCardPrice} ₽</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('closePopup').addEventListener('click', () => { haptic(); overlay.remove(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); overlay.remove(); } });

    const handlePurchase = (purchaseType, link) => {
        addParticipant(hikeDate)
            .then(() => setUserRegistrationStatus(hikeDate, true))
            .then(() => {
                const hikeIndex = hikesList.findIndex(h => h.date === hikeDate);
                if (hikeIndex !== -1) hikeBookingStatus[hikeIndex] = true;
                if (userCard.status !== 'active') saveStatusToLocalStorage();
                updateFloatingSheetButtons();
                renderUserBookings();
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer) renderCalendar(calendarContainer);
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', purchaseType);
                openLink(link, `purchase_${purchaseType}`, isGuest);
                overlay.remove();
            })
            .catch(error => { console.error(error); alert('Ошибка при регистрации. Попробуйте ещё раз.'); });
    };

    document.getElementById('buyTicketBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        handlePurchase('ticket', config.ticketLink);
    });
    const showCardOptionsBtn = document.getElementById('showCardOptionsBtn');
    const cardOptions = document.getElementById('cardOptions');
    showCardOptionsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        if (cardOptions.style.display === 'none' || cardOptions.style.display === '') cardOptions.style.display = 'block';
        else cardOptions.style.display = 'none';
    });
    document.getElementById('buySeasonCardBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        handlePurchase('season_card', config.seasonCardLink);
    });
    document.getElementById('buyPermanentCardBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        handlePurchase('permanent_card', config.permanentCardLink);
    });
}

let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();

function hasHikesInMonth(year, month) {
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;
    return hikesList.some(hike => hike.date.startsWith(monthStr));
}

function renderCalendar(container) {
    const year = currentCalendarYear, month = currentCalendarMonth;
    const today = new Date();
    const currentYear = today.getFullYear(), currentMonth = today.getMonth(), currentDate = today.getDate();
    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const firstDay = new Date(year, month, 1).getDay();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
    const hasPrevMonth = hasHikesInMonth(year, month-1);
    const hasNextMonth = hasHikesInMonth(year, month+1);

    let calendarHtml = `
        <h2 class="section-title">🗓️ календарь хайков</h2>
        <div class="calendar-item">
            <div class="calendar-header-with-legend">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <h3 style="margin:0;">${monthNames[month]} ${year}</h3>
                    <div style="display: flex; gap: 8px;">
                        <button class="calendar-nav-arrow" id="prevMonthBtn" ${!hasPrevMonth ? 'disabled style="opacity:0.3; pointer-events:none;"' : ''}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <button class="calendar-nav-arrow" id="nextMonthBtn" ${!hasNextMonth ? 'disabled style="opacity:0.3; pointer-events:none;"' : ''}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>
                </div>
                <div class="calendar-legend">
                    <span class="legend-item"><span class="legend-emoji">📷</span> – отчёт</span>
                    <span class="legend-item"><span class="legend-emoji">🎫</span> – запись</span>
                </div>
            </div>
            <div class="weekdays">${weekdays.map(d => `<span>${d}</span>`).join('')}</div>
            <div class="calendar-grid" id="calendarGrid">
    `;

    for (let i = 0; i < startOffset; i++) calendarHtml += `<div class="calendar-day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = (year === currentYear && month === currentMonth && day === currentDate);
        const hasHike = hikesData[dateStr] ? true : false;
        const isPast = new Date(dateStr) < today;
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (hasHike) { classes += ' hike-day'; if (isPast) classes += ' past'; }
        let innerHtml = `${day}`;
        if (hasHike) {
            const hikeIndex = hikesList.findIndex(h => h.date === dateStr);
            const hike = hikesList[hikeIndex];
            const isWoman = hike && hike.woman === 'yes';
            if (isPast && hike && hike.report_link && hike.report_link.trim() !== '') innerHtml += `<span class="calendar-emoji">📷</span>`;
            if (!isPast && hikeIndex !== -1 && hikeBookingStatus[hikeIndex] === true) { innerHtml += `<span class="calendar-emoji">🎫</span>`; classes += ' booked-day'; }
            if (isWoman) classes += ' woman-hike';
        }
        if (hasHike) calendarHtml += `<div class="${classes}" data-date="${dateStr}">${innerHtml}</div>`;
        else calendarHtml += `<div class="${classes}">${day}</div>`;
    }
    calendarHtml += `</div></div>`;
    container.innerHTML = calendarHtml;

    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (hasPrevMonth) { currentCalendarMonth--; if (currentCalendarMonth < 0) { currentCalendarMonth = 11; currentCalendarYear--; } renderCalendar(container); } });
    if (nextBtn) nextBtn.addEventListener('click', () => { if (hasNextMonth) { currentCalendarMonth++; if (currentCalendarMonth > 11) { currentCalendarMonth = 0; currentCalendarYear++; } renderCalendar(container); } });
    document.querySelectorAll('.calendar-day.hike-day').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            const index = hikesList.findIndex(h => h.date === date);
            if (index !== -1) showBottomSheet(index);
        });
    });
}

let sheetCurrentIndex = 0, sheetScrollListener = null, dragStartY = 0, isDragging = false, currentUnsubscribe = null;

function showBottomSheet(index) {
    if (!hikesList.length) return;
    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();
    const existingSheetButtons = document.querySelector('.floating-sheet-buttons');
    if (existingSheetButtons) existingSheetButtons.remove();
    document.body.style.overflow = 'hidden';
    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `<div class="bottom-sheet" id="hikeBottomSheet"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-content-wrapper" id="bottomSheetContent"></div></div>`;
    document.body.appendChild(overlay);
    const sheet = document.getElementById('hikeBottomSheet');
    const contentWrapper = document.getElementById('bottomSheetContent');
    const windowHeight = window.innerHeight;
    sheet.style.maxHeight = `${windowHeight * 0.9}px`;
    sheet.style.height = `${windowHeight * 0.9}px`;
    sheetCurrentIndex = index;
    const isGuest = userCard.status !== 'active';
    if (currentUnsubscribe) { currentUnsubscribe(); currentUnsubscribe = null; }

    function updateContent() {
        const hike = hikesList[sheetCurrentIndex];
        if (!hike) return;
        const isWoman = hike.woman === 'yes';
        const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        let formattedDate = '';
        if (hike.date) {
            const parts = hike.date.split('-');
            if (parts.length === 3) {
                const day = parseInt(parts[2], 10);
                const month = parseInt(parts[1], 10) - 1;
                formattedDate = `${day} ${monthNames[month]}`;
            } else formattedDate = hike.date;
        }
        const hasPrev = sheetCurrentIndex > 0;
        const hasNext = sheetCurrentIndex < hikesList.length - 1;
        let tagsHtml = '';
        if (hike.tags && hike.tags.length > 0) {
            tagsHtml = '<div class="bottom-sheet-tags">';
            hike.tags.forEach(tag => { tagsHtml += `<span class="bottom-sheet-tag">${tag}</span>`; });
            tagsHtml += '</div>';
        }
        let sectionsHtml = '';
        if (hike.features && hike.features.trim() !== '') {
            let processedText = parseLinks(hike.features, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            let featureTagsHtml = '';
            if (hike.feature_tags && hike.feature_tags.length > 0) {
                featureTagsHtml = '<div class="feature-tags-container">';
                hike.feature_tags.forEach(tag => { featureTagsHtml += `<span class="feature-tag" style="background: ${accentColor};">${tag}</span>`; });
                featureTagsHtml += '</div>';
            }
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">особенности</div>
                    ${featureTagsHtml}
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }
        if (hike.access && hike.access.trim() !== '') {
            let processedText = parseLinks(hike.access, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">как добраться</div>
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }
        if (hike.details && hike.details.trim() !== '') {
            let processedText = parseLinks(hike.details, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">детали</div>
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }
        const hikeDate = new Date(hike.date);
        const today = new Date();
        today.setHours(0,0,0,0);
        const isPast = hikeDate < today;
        let imageHtml = '';
        if (hike.image) {
            if (!isPast) {
                imageHtml = `
                    <div class="image-container">
                        <img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'">
                        <div class="participant-counter" id="participantCounter" data-hike-date="${hike.date}" style="color: ${accentColor};">
                            <span class="participant-text" style="color: ${accentColor};">идут</span>
                            <span class="participant-count" id="participantCountValue" style="color: ${accentColor}; display: none;">0</span>
                            <div class="participant-avatars" id="participantAvatars"></div>
                        </div>
                    </div>
                `;
            } else {
                imageHtml = `<img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'">`;
            }
        }
        let extraInfoHtml = '';
        if (!isPast) {
            extraInfoHtml = '<div class="hike-extra-info">';
            if (hike.start_time) {
                extraInfoHtml += `
                    <div class="info-row" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </span>
                        <span><strong>начало:</strong> ${hike.start_time}</span>
                    </div>
                `;
            }
            if (hike.location_link) {
                let locationHtml = '';
                if (hike.location_link.includes('[') && hike.location_link.includes('](')) {
                    locationHtml = parseLinks(hike.location_link, isGuest);
                } else {
                    locationHtml = `<a href="#" data-url="${hike.location_link}" data-guest="${isGuest}" class="dynamic-link">открыть на карте</a>`;
                }
                extraInfoHtml += `
                    <div class="info-row" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </span>
                        <span><strong>точка сбора:</strong> ${locationHtml}</span>
                    </div>
                `;
            }
            if (hike.leaders && hike.leaders.length) {
                const leaderLinks = hike.leaders.map(leaderUsername => {
                    const leaderData = leaders[leaderUsername];
                    const displayName = leaderData ? leaderData.name.split(' ')[0] : leaderUsername;
                    return `<a href="#" class="leader-name dynamic-link" data-leader-username="${leaderUsername}">${displayName}</a>`;
                });
                let leaderText = '';
                const leaderVerb = hike.leaders.length === 1 ? 'ведёт' : 'ведут';
                if (leaderLinks.length === 1) leaderText = leaderLinks[0];
                else if (leaderLinks.length === 2) leaderText = `${leaderLinks[0]} <span style="color: white;">и</span> ${leaderLinks[1]}`;
                else { const last = leaderLinks.pop(); leaderText = `${leaderLinks.join(', ')} <span style="color: white;">и</span> ${last}`; }
                extraInfoHtml += `
                    <div class="info-row" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>
                        </span>
                        <span><strong>${leaderVerb}:</strong> ${leaderText}</span>
                    </div>
                `;
            }
            extraInfoHtml += '</div>';
        }
        const prevArrow = hasPrev ? `<div class="bottom-sheet-nav-arrow" id="prevHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 7 L9 12 L15 17" stroke="currentColor" stroke-width="2.2"/></svg></div>` : '<div class="bottom-sheet-nav-arrow hidden" id="prevHike"></div>';
        const nextArrow = hasNext ? `<div class="bottom-sheet-nav-arrow" id="nextHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 7 L15 12 L9 17" stroke="currentColor" stroke-width="2.2"/></svg></div>` : '<div class="bottom-sheet-nav-arrow hidden" id="nextHike"></div>';
        contentWrapper.innerHTML = `
            <div class="bottom-sheet-header-block">
                <div class="bottom-sheet-header">
                    <div class="bottom-sheet-header-left">
                        <div class="bottom-sheet-header-date" style="color: ${accentColor};">${formattedDate}</div>
                        <div class="bottom-sheet-header-title">${hike.title}</div>
                    </div>
                    <div class="bottom-sheet-nav">${prevArrow}${nextArrow}</div>
                </div>
                ${tagsHtml}
            </div>
            <div>${imageHtml}${extraInfoHtml}${sectionsHtml}</div>
        `;
        if (!isPast) {
            currentUnsubscribe = subscribeToParticipantCount(hike.date, (count, participants) => {
                const countEl = document.getElementById('participantCountValue');
                const avatarsEl = document.getElementById('participantAvatars');
                if (countEl) {
                    if (count === 0) { countEl.style.display = 'inline'; countEl.textContent = count; }
                    else countEl.style.display = 'none';
                }
                if (avatarsEl) {
                    avatarsEl.innerHTML = '';
                    participants.forEach(p => {
                        if (p.photoUrl) {
                            const img = document.createElement('img');
                            img.src = p.photoUrl;
                            img.className = 'participant-avatar';
                            img.alt = p.name || '';
                            img.title = p.name || '';
                            img.onerror = function() {
                                const placeholder = document.createElement('div');
                                placeholder.className = 'participant-avatar placeholder';
                                const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                                placeholder.textContent = initial;
                                this.parentNode.replaceChild(placeholder, this);
                            };
                            avatarsEl.appendChild(img);
                        } else {
                            const placeholder = document.createElement('div');
                            placeholder.className = 'participant-avatar placeholder';
                            const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                            placeholder.textContent = initial;
                            avatarsEl.appendChild(placeholder);
                        }
                    });
                }
            });
        }
        updateFloatingSheetButtons();
        document.getElementById('prevHike')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sheetCurrentIndex > 0) {
                closeParticipantDropdown(); closeLeaderDropdown();
                sheetCurrentIndex--;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
                log('slider_prev', false);
            }
        });
        document.getElementById('nextHike')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sheetCurrentIndex < hikesList.length - 1) {
                closeParticipantDropdown(); closeLeaderDropdown();
                sheetCurrentIndex++;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
                log('slider_next', false);
            }
        });
    }

    updateContent();
    function removeFloatingSheetButtons() { const btn = document.querySelector('.floating-sheet-buttons'); if (btn) btn.remove(); }
    function createFloatingButtons() {
        removeFloatingSheetButtons();
        const container = document.createElement('div');
        container.className = 'floating-sheet-buttons';
        container.id = 'floatingSheetButtons';
        document.body.appendChild(container);
        updateFloatingSheetButtons();
    }
    createFloatingButtons();
    function checkScroll() {
        const container = document.querySelector('.floating-sheet-buttons');
        if (!container) return;
        const scrollTop = contentWrapper.scrollTop;
        const scrollHeight = contentWrapper.scrollHeight;
        const clientHeight = contentWrapper.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return;
        const scrollPercentage = (scrollTop / maxScroll) * 100;
        if (scrollPercentage > 95) container.classList.add('hidden');
        else container.classList.remove('hidden');
    }
    if (sheetScrollListener) contentWrapper.removeEventListener('scroll', sheetScrollListener);
    sheetScrollListener = checkScroll;
    contentWrapper.addEventListener('scroll', sheetScrollListener);
    setTimeout(() => { overlay.classList.add('visible'); sheet.classList.add('visible'); }, 20);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeBottomSheet(); });
    const onTouchStart = (e) => {
        const target = e.target;
        const isInteractive = target.closest('.bottom-sheet-nav-arrow') || target.closest('a') || target.closest('.btn') || target.closest('.bottom-sheet-handle');
        if (isInteractive) { isDragging = false; return; }
        dragStartY = e.touches[0].clientY;
        isDragging = true;
        sheet.classList.add('dragging');
    };
    const onTouchMove = (e) => {
        if (!isDragging) return;
        if (contentWrapper.scrollTop > 0) { isDragging = false; sheet.classList.remove('dragging'); return; }
        const deltaY = e.touches[0].clientY - dragStartY;
        if (deltaY > 0) { e.preventDefault(); sheet.style.transform = `translateY(${deltaY}px)`; }
        else { isDragging = false; sheet.classList.remove('dragging'); }
    };
    const onTouchEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        sheet.classList.remove('dragging');
        const deltaY = e.changedTouches[0].clientY - dragStartY;
        if (deltaY > 80) closeBottomSheet();
        else sheet.style.transform = '';
    };
    sheet.addEventListener('touchstart', onTouchStart, { passive: false });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: false });
    sheet.addEventListener('touchcancel', onTouchEnd, { passive: false });
    log('slider_haikov_opened', false);
}

function closeBottomSheet() {
    closeParticipantDropdown();
    closeLeaderDropdown();
    if (currentUnsubscribe) { currentUnsubscribe(); currentUnsubscribe = null; }
    const overlay = document.querySelector('.bottom-sheet-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        const sheet = document.getElementById('hikeBottomSheet');
        if (sheet) sheet.classList.remove('visible');
        document.body.style.overflow = '';
        const sheetButtons = document.querySelector('.floating-sheet-buttons');
        if (sheetButtons) sheetButtons.remove();
        if (sheetScrollListener) {
            const contentWrapper = document.getElementById('bottomSheetContent');
            if (contentWrapper) contentWrapper.removeEventListener('scroll', sheetScrollListener);
            sheetScrollListener = null;
        }
        setTimeout(() => { overlay.remove(); }, 300);
    }
}

function updateFloatingSheetButtons() {
    const container = document.querySelector('.floating-sheet-buttons');
    if (!container) return;
    const hike = hikesList[sheetCurrentIndex];
    if (!hike) return;
    const isWoman = hike.woman === 'yes';
    const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
    const isBooked = hikeBookingStatus[sheetCurrentIndex] || false;
    const hikeDate = new Date(hike.date);
    const today = new Date(); today.setHours(0,0,0,0);
    const isPast = hikeDate < today;
    container.innerHTML = '';
    if (isPast) {
        const isGuest = userCard.status !== 'active';
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';
        const completedBtn = document.createElement('a');
        completedBtn.href = '#';
        completedBtn.className = 'btn btn-outline';
        completedBtn.textContent = 'хайк завершен';
        completedBtn.style.pointerEvents = 'none';
        row.appendChild(completedBtn);
        if (hike.report_link && hike.report_link.trim() !== '') {
            const reportBtn = document.createElement('a');
            reportBtn.href = '#';
            reportBtn.className = 'btn btn-yellow';
            if (isWoman) reportBtn.style.backgroundColor = '#FB5EB0';
            reportBtn.textContent = 'отчёт';
            reportBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation(); haptic();
                const url = hike.report_link.trim();
                if (url) openLink(url, 'report_click', isGuest);
                return false;
            });
            row.appendChild(reportBtn);
        }
        container.appendChild(row);
        return;
    }
    const isGuest = userCard.status !== 'active';
    if (userId) {
        const popupKey = `${userId}_${hike.date}`;
        const popupData = registrationsPopup[popupKey];
        if (popupData && popupData.popupText && popupData.popupLink) addPaymentPopup(container, popupData, isGuest);
    }
    if (isBooked) {
        const inviteRow = document.createElement('div');
        inviteRow.style.display = 'flex';
        inviteRow.style.justifyContent = 'center';
        inviteRow.style.width = '100%';
        inviteRow.style.marginBottom = '3px';
        const inviteBtn = document.createElement('a');
        inviteBtn.href = '#';
        inviteBtn.className = 'btn btn-yellow btn-glow' + (isWoman ? ' woman-glow' : '');
        if (isWoman) inviteBtn.style.backgroundColor = '#FB5EB0';
        inviteBtn.id = 'sheetInviteBtn';
        inviteBtn.textContent = isWoman ? 'пригласить подругу' : 'пригласить друга';
        inviteBtn.addEventListener('click', (e) => {
            e.preventDefault(); haptic();
            const link = `https://t.me/yaltahiking_bot?startapp=hike_${hike.date}`;
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}`;
            tg.openTelegramLink(shareUrl);
            log('invite_click', isGuest);
        });
        inviteRow.appendChild(inviteBtn);
        container.appendChild(inviteRow);
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';
        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'btn btn-outline';
        cancelBtn.id = 'sheetCancelBtn';
        cancelBtn.textContent = 'отменить';
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (cancelBtn.dataset.processing === 'true') return;
            cancelBtn.dataset.processing = 'true';
            haptic();
            if (isGuest) {
                removeParticipant(hike.date).then(() => {
                    delete hikeBookingStatus[sheetCurrentIndex];
                    saveStatusToLocalStorage();
                    updateRegistrationInSheet(hike.date, hike.title, 'cancelled', '');
                    updateFloatingSheetButtons();
                    renderUserBookings();
                    const calendarContainer = document.getElementById('calendarContainer');
                    if (calendarContainer) renderCalendar(calendarContainer);
                }).catch((error) => { console.error(error); updateFloatingSheetButtons(); });
            } else {
                Promise.all([removeParticipant(hike.date), setUserRegistrationStatus(hike.date, false)])
                    .then(() => {
                        delete hikeBookingStatus[sheetCurrentIndex];
                        updateFloatingSheetButtons();
                        updateRegistrationInSheet(hike.date, hike.title, 'cancelled', '');
                        renderUserBookings();
                        const calendarContainer = document.getElementById('calendarContainer');
                        if (calendarContainer) renderCalendar(calendarContainer);
                    }).catch((error) => { console.error(error); updateFloatingSheetButtons(); });
            }
            log('cancel_click', false);
        });
        row.appendChild(cancelBtn);
        const goBtn = document.createElement('a');
        goBtn.href = '#';
        goBtn.className = 'btn btn-yellow-outline';
        goBtn.id = 'sheetGoBtn';
        goBtn.textContent = isWoman ? 'ты записана' : 'ты записан';
        if (isWoman) goBtn.style.color = '#FB5EB0';
        row.appendChild(goBtn);
        container.appendChild(row);
    } else {
        if (isGuest) {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.justifyContent = 'center';
            row.style.width = '100%';
            const questionBtn = document.createElement('a');
            questionBtn.href = '#';
            questionBtn.className = 'btn btn-outline';
            questionBtn.id = 'sheetQuestionBtn';
            questionBtn.textContent = 'задать вопрос';
            questionBtn.addEventListener('click', (e) => {
                e.preventDefault(); haptic();
                openLink('https://t.me/hellointelligent', 'question_click', true);
            });
            row.appendChild(questionBtn);
            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow btn-glow' + (isWoman ? ' woman-glow' : '');
            if (isWoman) goBtn.style.backgroundColor = '#FB5EB0';
            goBtn.id = 'sheetGoBtn';
            goBtn.textContent = 'иду';
            goBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (goBtn.dataset.processing === 'true') return;
                goBtn.dataset.processing = 'true';
                haptic();
                showGuestBookingPopup(hike.date, hike.title, true);
                setTimeout(() => { goBtn.dataset.processing = 'false'; }, 1000);
            });
            row.appendChild(goBtn);
            container.appendChild(row);
        } else {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.justifyContent = 'center';
            row.style.width = '100%';
            const questionBtn = document.createElement('a');
            questionBtn.href = '#';
            questionBtn.className = 'btn btn-outline';
            questionBtn.id = 'sheetQuestionBtn';
            questionBtn.textContent = 'задать вопрос';
            questionBtn.addEventListener('click', (e) => {
                e.preventDefault(); haptic();
                openLink('https://t.me/hellointelligent', 'question_click', false);
            });
            row.appendChild(questionBtn);
            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow btn-glow' + (isWoman ? ' woman-glow' : '');
            if (isWoman) goBtn.style.backgroundColor = '#FB5EB0';
            goBtn.id = 'sheetGoBtn';
            goBtn.textContent = 'иду';
            goBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (goBtn.dataset.processing === 'true') return;
                goBtn.dataset.processing = 'true';
                haptic();
                setUserRegistrationStatus(hike.date, true)
                    .then(() => {
                        hikeBookingStatus[sheetCurrentIndex] = true;
                        return incrementParticipantCount(hike.date);
                    })
                    .then(() => {
                        updateRegistrationInSheet(hike.date, hike.title, 'booked', 'card_holder');
                        updateFloatingSheetButtons();
                        renderUserBookings();
                        const calendarContainer = document.getElementById('calendarContainer');
                        if (calendarContainer) renderCalendar(calendarContainer);
                    })
                    .catch((error) => { console.error(error); updateFloatingSheetButtons(); });
                log('idut_click', false);
            });
            row.appendChild(goBtn);
            container.appendChild(row);
        }
    }
}
function renderUserBookings() {
    const container = document.getElementById('userBookingsContainer');
    if (!container) return;
    const today = new Date();
    today.setHours(0,0,0,0);
    const bookings = [];
    hikesList.forEach((hike, index) => {
        if (hikeBookingStatus[index]) {
            const hikeDate = new Date(hike.date);
            if (hikeDate >= today) bookings.push({ ...hike, index });
        }
    });
    if (bookings.length === 0) {
        const phrase = randomPhrases.length > 0 ? randomPhrases[Math.floor(Math.random() * randomPhrases.length)] : 'смотреть 5 сезон глухаря или';
        const phraseParts = phrase.split(' или');
        const mainPart = phraseParts[0];
        const italicPart = phraseParts.length > 1 ? ' или' : '';
        container.style.display = 'block';
        container.innerHTML = `
            <div class="card-container" id="userBookingsCard">
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 0 16px 16px 16px;">
                    <h2 class="section-title" style="margin: 0;">🎫 мои записи</h2>
                    <a href="#" class="bookings-calendar-link" style="font-size: 14px; color: #ffffff; opacity: 0.8; text-decoration: none; font-weight: 500;">открыть календарь &gt;</a>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(4px);">
                    <div style="flex: 1; margin-right: 16px;">
                        <span style="color: #ffffff;">${mainPart}<em style="font-style: italic;">${italicPart}</em></span>
                    </div>
                    <button class="btn btn-yellow booking-go-btn" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0;">пойти на хайк</button>
                </div>
            </div>
        `;
        return;
    }
    container.style.display = 'block';
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    let html = `
        <div class="card-container" id="userBookingsCard">
            <div style="display: flex; justify-content: space-between; align-items: center; margin: 0 16px 16px 16px;">
                <h2 class="section-title" style="margin: 0;">🎫 мои записи</h2>
                <a href="#" class="bookings-calendar-link" style="font-size: 14px; color: #ffffff; opacity: 0.8; text-decoration: none; font-weight: 500;">открыть календарь &gt;</a>
            </div>
    `;
    bookings.forEach(booking => {
        const isWoman = booking.woman === 'yes';
        const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
        const dateParts = booking.date.split('-');
        const day = parseInt(dateParts[2], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const formattedDate = `${day} ${monthNames[month]}`;
        let title = booking.title;
        const prefixes = ['тропа на ', 'тропа ', 'маршрут ', 'гора ', 'ущелье ', 'путь на ', 'восхождение на '];
        let cleanedTitle = title;
        for (let prefix of prefixes) {
            if (cleanedTitle.toLowerCase().startsWith(prefix)) {
                cleanedTitle = cleanedTitle.substring(prefix.length);
                break;
            }
        }
        if (cleanedTitle.toLowerCase().startsWith('на ')) cleanedTitle = cleanedTitle.substring(3);
        cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
        html += `
            <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(4px);">
                <div style="flex: 1; margin-right: 16px;">
                    <span style="color: ${accentColor}; font-weight: 900; font-style: italic;">${formattedDate}</span>
                    <span style="color: #ffffff; margin-left: 8px;">${cleanedTitle}</span>
                </div>
                <button class="btn btn-yellow booking-detail-btn" data-index="${booking.index}" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0; background-color: ${accentColor};">детали</button>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function addPaymentPopup(container, popupData, isGuest) {
    const popupDiv = document.createElement('div');
    popupDiv.className = 'payment-popup';
    popupDiv.style.pointerEvents = 'auto';
    popupDiv.style.zIndex = '2000';
    let text = popupData.popupText;
    if (!text) return;
    if (!popupData.popupLink) {
        popupDiv.textContent = text;
        container.insertBefore(popupDiv, container.firstChild);
        return;
    }
    const linkRegex = /\[([^\]]+)\]/g;
    let lastIndex = 0, match;
    const fragments = [];
    while ((match = linkRegex.exec(text)) !== null) {
        if (match.index > lastIndex) fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        const link = document.createElement('span');
        link.className = 'popup-link';
        link.textContent = match[1];
        link.dataset.url = popupData.popupLink;
        link.setAttribute('role', 'link');
        link.setAttribute('tabindex', '0');
        link.style.cursor = 'pointer';
        link.style.pointerEvents = 'auto';
        link.style.color = '#D9FD19';
        link.style.textDecoration = 'underline';
        link.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation(); haptic();
            const url = this.dataset.url;
            if (url && url.trim() !== '') openLink(url, 'popup_link_click', userCard.status !== 'active');
        });
        fragments.push(link);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) fragments.push(document.createTextNode(text.substring(lastIndex)));
    fragments.forEach(fragment => popupDiv.appendChild(fragment));
    container.insertBefore(popupDiv, container.firstChild);
}

function setupAccordion(containerId, isGuest) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const accordionBtn = container.querySelector('.accordion-btn');
    const arrow = accordionBtn?.querySelector('.arrow');
    const dropdown = container.querySelector('.dropdown-menu');
    if (accordionBtn && dropdown) {
        accordionBtn.addEventListener('click', (e) => {
            haptic(); e.preventDefault();
            log('nav_toggle', isGuest);
            dropdown.classList.toggle('show');
            if (arrow) arrow.classList.toggle('arrow-down');
        });
    }
}

function showConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth, height = window.innerHeight;
    canvas.width = width; canvas.height = height;
    const particles = [];
    const colors = ['#D9FD19', '#40a7e3', '#ffffff', '#ff69b4', '#ffa500'];
    for (let i = 0; i < 80; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: Math.random() * 6 - 3,
            vy: Math.random() * -5 - 2,
            size: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    let frame = 0;
    function animate() {
        if (frame > 120) { document.body.removeChild(canvas); return; }
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.1;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        frame++;
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

function parseLinks(text, isGuest) {
    if (!text) return '';
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, linkText, url) {
        url = url.replace(/\.$/, '');
        return `<a href="#" data-url="${url}" data-guest="${isGuest}" class="dynamic-link">${linkText}</a>`;
    });
}

let currentLeaderDropdown = null;
function closeLeaderDropdown() { if (currentLeaderDropdown) { currentLeaderDropdown.remove(); currentLeaderDropdown = null; } }
function showLeaderDropdown(leaderElement, leaderData) {
    closeLeaderDropdown();
    const dropdown = document.createElement('div');
    dropdown.className = 'participant-dropdown';
    dropdown.style.width = '300px';
    dropdown.style.position = 'fixed';
    dropdown.style.top = '50%';
    dropdown.style.left = '50%';
    dropdown.style.transform = 'translate(-50%, -50%)';
    dropdown.style.zIndex = '9999';
    dropdown.style.backgroundColor = 'rgba(0,0,0,0.9)';
    dropdown.style.border = '1px solid rgba(255,255,255,0.2)';
    dropdown.style.borderRadius = '28px';
    dropdown.style.padding = '20px 0 12px 0';
    const photoUrl = leaderData.username ? `https://t.me/i/userpic/320/${leaderData.username}.jpg` : null;
    const avatarHtml = photoUrl ? `<img src="${photoUrl}" class="participant-dropdown-avatar" alt="${leaderData.name}" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'participant-dropdown-avatar placeholder\'>${leaderData.name.charAt(0).toUpperCase()}</div>';">` : `<div class="participant-dropdown-avatar placeholder">${leaderData.name.charAt(0).toUpperCase()}</div>`;
    const contactHtml = leaderData.username ? `<a href="#" data-url="https://t.me/${leaderData.username}" data-guest="false" class="dynamic-link" style="color: var(--yellow); text-decoration: none;">@${leaderData.username}</a>` : '';
    dropdown.innerHTML = `
        <div style="position: relative; padding: 0 20px;"><button class="leader-close-btn" style="position: absolute; top: -12px; right: 12px; background: none; border: none; color: #aaa; font-size: 28px; cursor: pointer; z-index: 10000; line-height: 1;">&times;</button></div>
        <div style="display: flex; flex-direction: column; gap: 12px; padding: 0 20px 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">${avatarHtml}<span style="font-weight: 600; color: white;">${leaderData.name}</span></div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.9);">${leaderData.bio || ''}</div>
            <div style="font-size: 14px;">${contactHtml}</div>
        </div>
    `;
    document.body.appendChild(dropdown);
    setTimeout(() => dropdown.classList.add('show'), 10);
    const closeBtn = dropdown.querySelector('.leader-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeLeaderDropdown(); });
    currentLeaderDropdown = dropdown;
    const closeHandler = (e) => { if (!dropdown.contains(e.target) && e.target !== leaderElement) { closeLeaderDropdown(); document.removeEventListener('click', closeHandler); } };
    setTimeout(() => { document.addEventListener('click', closeHandler); }, 0);
}

document.addEventListener('click', function(e) {
    const link = e.target.closest('.dynamic-link, .nav-popup a, .btn-newcomer, .accordion-btn, .bottom-sheet-nav-arrow, .btn, .participant-counter, .booking-detail-btn, .bookings-calendar-link, .booking-go-btn, .leader-name, .popup-link, .profile-hike-link');
    if (!link) return;
    
    if (link.classList.contains('profile-hike-link')) {
        e.preventDefault();
        const hikeDate = link.dataset.hikeDate;
        if (hikeDate) {
            const index = hikesList.findIndex(h => h.date === hikeDate);
            if (index !== -1) {
                showBottomSheet(index);
            }
        }
        return;
    }
    
    if (link.classList.contains('leader-name')) {
        e.preventDefault(); e.stopPropagation();
        const username = link.dataset.leaderUsername;
        if (username) {
            haptic(); closeLeaderDropdown();
            if (leaders[username]) showLeaderDropdown(link, leaders[username]);
            else openLink(`https://t.me/${username}`, 'leader_click', userCard.status !== 'active');
            log('leader_click', userCard.status !== 'active');
        }
        return;
    }
    if (link.classList.contains('popup-link')) {
        e.preventDefault(); e.stopPropagation(); haptic();
        const url = link.dataset.url;
        if (url && url.trim() !== '') openLink(url, 'popup_link_click', userCard.status !== 'active');
        return;
    }
    if (link.classList.contains('dynamic-link')) {
        e.preventDefault();
        const url = link.dataset.url;
        const isGuest = link.dataset.guest === 'true';
        openLink(url, 'link_click', isGuest);
        return;
    }
    if (link.closest('.nav-popup')) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && href !== '#') {
            if (link.id === 'popupNewcomer') { const isGuest = userCard.status !== 'active'; renderNewcomerPage(isGuest); }
            else if (link.id === 'popupGift') { const isGuest = userCard.status !== 'active'; renderGift(isGuest); }
            else if (link.id === 'popupPass') { const isGuest = userCard.status !== 'active'; renderPassPage(isGuest); }
            else if (link.id === 'popupQuestion') { const isGuest = userCard.status !== 'active'; openLink('https://t.me/hellointelligent', 'question_click', isGuest); }
            else openLink(href, 'nav_popup_click', false);
        }
        return;
    }
    if (link.classList.contains('btn-newcomer')) {
        e.preventDefault(); haptic();
        const isGuest = link.id === 'newcomerBtnGuest';
        renderNewcomerPage(isGuest);
        return;
    }
    if (link.classList.contains('participant-counter')) {
        e.preventDefault(); e.stopPropagation();
        const hikeDate = link.dataset.hikeDate;
        if (hikeDate) {
            const index = hikesList.findIndex(h => h.date === hikeDate);
            const hike = hikesList[index];
            const isWoman = hike && hike.woman === 'yes';
            const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
            if (index !== -1 && hikeBookingStatus[index]) toggleParticipantDropdown(link, hikeDate);
            else {
                const msg = document.createElement('div');
                msg.className = 'modal-overlay';
                msg.innerHTML = `
                    <div class="modal-content" style="max-width: 300px;">
                        <div class="modal-title" style="color: ${accentColor};">доступ ограничен</div>
                        <div class="modal-text">просмотр участников доступен после регистрации на хайк</div>
                        <div class="modal-buttons" style="margin-top: 20px;"><button class="btn" style="background-color: ${accentColor}; color: #000000; width: 100%; margin: 0; padding: 12px; border-radius: 12px; font-weight: 600; border: none; cursor: pointer;">понятно</button></div>
                    </div>
                `;
                document.body.appendChild(msg);
                const closeBtn = msg.querySelector('.btn');
                closeBtn.addEventListener('click', () => msg.remove());
                setTimeout(() => { msg.addEventListener('click', (e) => { if (e.target === msg) msg.remove(); }); }, 0);
                log('uchastniki_not_registered', userCard.status !== 'active');
            }
        }
        return;
    }
    if (link.classList.contains('booking-detail-btn')) {
        e.preventDefault();
        const index = link.dataset.index;
        if (index !== undefined) showBottomSheet(parseInt(index));
        return;
    }
    if (link.classList.contains('bookings-calendar-link') || link.classList.contains('booking-go-btn')) {
        e.preventDefault(); haptic(); scrollToCalendar();
        log('moi_zapisi_kalendar_click', userCard.status !== 'active');
        return;
    }
});

let currentDropdownHikeDate = null;
function closeParticipantDropdown() { const existing = document.querySelector('.participant-dropdown.show'); if (existing) { existing.remove(); currentDropdownHikeDate = null; } }
async function toggleParticipantDropdown(counterElement, hikeDate) {
    const existing = document.querySelector('.participant-dropdown.show');
    if (existing && currentDropdownHikeDate === hikeDate) { closeParticipantDropdown(); return; }
    closeParticipantDropdown();
    haptic();
    const participants = await loadAllParticipants(hikeDate);
    const dropdown = document.createElement('div');
    dropdown.className = 'participant-dropdown';
    dropdown.style.maxHeight = '250px';
    dropdown.style.overflowY = 'auto';
    if (participants.length === 0) dropdown.innerHTML = '<div class="participant-dropdown-item" style="justify-content:center;">Пока никого нет</div>';
    else {
        participants.forEach(p => {
            const name = p.name || 'Участник';
            const item = document.createElement('div');
            item.className = 'participant-dropdown-item';
            if (p.photoUrl) item.innerHTML = `<img src="${p.photoUrl}" class="participant-dropdown-avatar" alt="${name}" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'participant-dropdown-avatar placeholder\'>${name.charAt(0).toUpperCase()}</div>';">`;
            else item.innerHTML = `<div class="participant-dropdown-avatar placeholder">${name.charAt(0).toUpperCase()}</div>`;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'participant-dropdown-name';
            nameSpan.textContent = name;
            item.appendChild(nameSpan);
            dropdown.appendChild(item);
        });
    }
    const container = counterElement.closest('.bottom-sheet-content-wrapper') || document.body;
    const containerRect = container.getBoundingClientRect();
    const elementRect = counterElement.getBoundingClientRect();
    const top = elementRect.bottom - containerRect.top + container.scrollTop;
    const right = containerRect.right - elementRect.right;
    dropdown.style.position = 'absolute';
    dropdown.style.top = top + 'px';
    dropdown.style.right = right + 'px';
    dropdown.style.width = counterElement.offsetWidth + 'px';
    dropdown.style.zIndex = '1001';
    container.appendChild(dropdown);
    setTimeout(() => dropdown.classList.add('show'), 10);
    currentDropdownHikeDate = hikeDate;
    const closeHandler = (e) => { if (!dropdown.contains(e.target) && e.target !== counterElement) { closeParticipantDropdown(); document.removeEventListener('click', closeHandler); } };
    setTimeout(() => { document.addEventListener('click', closeHandler); }, 0);
    log('uchastniki_click', userCard.status !== 'active');
}

function renderNewcomerPage(isGuest = false) {
    isPrivPage = true; isMenuActive = false; resetNavActive();
    subtitle.textContent = `всё, что нужно знать`;
    showBack(() => renderHome()); haptic();
    log('novichkam_page_opened', isGuest);
    showBottomNav(true); setupBottomNav();
    let faqHtml = '';
    if (faq && faq.length) {
        faq.forEach(item => {
            let answer = item.a;
            answer = answer.replace(/\[@yaltahiking\]\(https:\/\/t\.me\/yaltahiking\)/g, '<a href="#" data-url="https://t.me/yaltahiking" data-guest="false" class="dynamic-link">@yaltahiking</a>');
            answer = answer.replace(/zapovedcrimea\.ru/g, '<a href="#" data-url="https://zapovedcrimea.ru/choose-pass" data-guest="false" class="dynamic-link">zapovedcrimea.ru</a>');
            faqHtml += `<div class="partner-item"><strong>${item.q}</strong><p>${answer}</p></div>`;
        });
    } else faqHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    mainDiv.innerHTML = `
        <div class="card-container newcomer-page" style="margin-bottom: 0;">
            ${faqHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px; margin-bottom: 0;">
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'support_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin:0 16px;">задать вопрос</a>
                <button id="goHomeStatic" class="btn btn-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;
    document.getElementById('goHomeStatic')?.addEventListener('click', () => { haptic(); setUserInteracted(); renderHome(); });
}

function renderGuestPrivileges() {
    isPrivPage = true; isMenuActive = false; resetNavActive();
    subtitle.textContent = `💳 привилегии с картой`;
    showBack(renderHome); showBottomNav(true); setupBottomNav();
    let clubHtml = '';
    if (guestPrivileges.club && guestPrivileges.club.length) {
        guestPrivileges.club.forEach(item => {
            let titleHtml = item.title;
            if (item.title.startsWith('новое:')) titleHtml = `<span style="color: var(--yellow);">новое:</span> ${item.title.substring(6)}`;
            clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) clubHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            clubHtml += `</div>`;
        });
    } else clubHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    let cityHtml = '';
    if (guestPrivileges.city && guestPrivileges.city.length) {
        guestPrivileges.city.forEach(item => {
            cityHtml += `<div class="partner-item"><strong>${item.title}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) cityHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            else if (item.button_link) {
                let linkHtml = '';
                if (item.button_link.includes('[') && item.button_link.includes('](')) linkHtml = parseLinks(item.button_link, false);
                else linkHtml = `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link">📍 ${item.button_link}</a>`;
                cityHtml += `<p>📍 ${linkHtml}</p>`;
            }
            cityHtml += `</div>`;
        });
    } else cityHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    mainDiv.innerHTML = `<div class="card-container"><h2 class="section-title" style="font-style: italic;">в клубе</h2>${clubHtml}<h2 class="section-title second" style="font-style: italic;">в городе</h2>${cityHtml}</div>`;
}

function renderPriv() {
    isPrivPage = true; isMenuActive = false; resetNavActive();
    subtitle.textContent = `🤘🏻твои привилегии, ${firstName}`;
    showBack(renderHome); showBottomNav(true); setupBottomNav();
    let clubHtml = '';
    if (privileges.club && privileges.club.length) {
        privileges.club.forEach(item => {
            let titleHtml = item.title;
            if (item.title.startsWith('новое:')) titleHtml = `<span style="color: var(--yellow);">новое:</span> ${item.title.substring(6)}`;
            clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) clubHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            clubHtml += `</div>`;
        });
    } else clubHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    let cityHtml = '';
    if (privileges.city && privileges.city.length) {
        privileges.city.forEach(item => {
            cityHtml += `<div class="partner-item"><strong>${item.title}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) cityHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            else if (item.button_link) {
                let linkHtml = '';
                if (item.button_link.includes('[') && item.button_link.includes('](')) linkHtml = parseLinks(item.button_link, false);
                else linkHtml = `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link">📍 ${item.button_link}</a>`;
                cityHtml += `<p>📍 ${linkHtml}</p>`;
            }
            cityHtml += `</div>`;
        });
    } else cityHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    mainDiv.innerHTML = `<div class="card-container"><h2 class="section-title" style="font-style: italic;">в клубе</h2>${clubHtml}<h2 class="section-title second" style="font-style: italic;">в городе</h2>${cityHtml}</div>`;
}

function renderGift(isGuest = false) {
    isPrivPage = true; isMenuActive = false; resetNavActive();
    subtitle.textContent = `подари новый опыт`;
    showBack(renderHome); showBottomNav(true); setupBottomNav();
    const giftText = giftContent || 'Информация о подарке временно недоступна.';
    mainDiv.innerHTML = `
        <div class="card-container">
            <div class="partner-item"><strong>как подарить карту интеллигента</strong><p style="white-space: pre-line;">${giftText}</p></div>
            <div id="giftAccordion" class="card-accordion">
                <button class="accordion-btn btn-yellow btn-glow">купить в подарок</button>
                <div class="dropdown-menu">
                    <a href="${SEASON_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'gift_season_click', ${isGuest}); return false;" class="btn btn-outline">сезонная</a>
                    <a href="${PERMANENT_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'gift_permanent_click', ${isGuest}); return false;" class="btn btn-outline">бессрочная</a>
                </div>
            </div>
        </div>
    `;
    setupAccordion('giftAccordion', isGuest);
}

function renderPassPage(isGuest = false) {
    isPrivPage = true; isMenuActive = false; resetNavActive();
    subtitle.textContent = `🪪 пропуск в заповедник`;
    showBack(renderHome); showBottomNav(true); setupBottomNav();
    const content = passInfo.content || 'Информация о пропуске временно недоступна.';
    const buttonLink = passInfo.buttonLink || '';
    mainDiv.innerHTML = `
        <div class="card-container">
            <div class="partner-item"><strong>как оформить пропуск</strong><p style="white-space: pre-line;">${content}</p></div>
            <div style="display: flex; justify-content: center; margin: 20px 16px 0;"><a href="#" class="btn btn-yellow" id="passButton" style="width: 100%;">оформить пропуск</a></div>
        </div>
    `;
    const passButton = document.getElementById('passButton');
    if (passButton && buttonLink) passButton.addEventListener('click', (e) => { e.preventDefault(); haptic(); openLink(buttonLink, 'pass_button_click', isGuest); });
}

function showGuestPopup() {
    haptic();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestPopup';
    overlay.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" id="closePopup">&times;</button>
            <div class="modal-title">карта интеллигента</div>
            <div class="modal-text">как её получить? тебе нужно быть готовым к большим переменам. почему? если ты станешь частью клуба интеллигенции, твои выходные уже не будут прежними. впечатления, знакомства, юмор, свежий воздух, продуктивный отдых и привилегии в городе. это лишь малая часть того, что тебя ждёт в клубе.</div>
            <div style="text-align: center; margin-top: 20px;"><button class="btn btn-yellow" id="popupPrivilegesBtn">узнать о привилегиях</button></div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('closePopup')?.addEventListener('click', () => { haptic(); overlay.remove(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); overlay.remove(); } });
    document.getElementById('popupPrivilegesBtn')?.addEventListener('click', () => { haptic(); overlay.remove(); renderGuestPrivileges(); });
    log('guest_popup_opened', true);
}

function renderGuestHome() {
    const isGuest = true;
    subtitle.textContent = `💳 здесь будет твоя карта, ${firstName}`;
    subtitle.classList.add('subtitle-guest');
    showBottomNav(true);
    mainDiv.innerHTML = `
        <div class="card-container">
            <img src="https://i.postimg.cc/J0GyF5Nw/fwvsvfw.png" alt="карта заглушка" class="card-image" id="guestCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">?</span></div>
            <div id="cardAccordionGuest" class="card-accordion">
                <button class="accordion-btn btn-yellow btn-glow">оформить карту</button>
                <div class="dropdown-menu">
                    <a href="#" class="btn btn-outline" id="guestPrivilegesBtn" style="margin-bottom: 8px;">узнать о привилегиях 💳</a>
                    <div style="display: flex; gap: 8px; width: 100%; flex-wrap: nowrap;">
                        <a href="${SEASON_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'season_card_click', true); return false;" class="btn btn-outline" style="flex: 1; margin: 0; padding: 16px 0; box-sizing: border-box; text-align: center; white-space: nowrap;">сезонная</a>
                        <a href="${PERMANENT_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'permanent_card_click', true); return false;" class="btn btn-outline" style="flex: 1; margin: 0; padding: 16px 0; box-sizing: border-box; text-align: center; white-space: nowrap;">бессрочная</a>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 8px; width: 100%; text-align: center; color: rgba(255,255,255,0.7); font-size: 12px;"><div style="flex: 1;">до конца 2026</div><div style="flex: 1;">все сезоны</div></div>
                    <div style="display: flex; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: #ffffff; font-size: 14px;"><div style="flex: 1;">${popupConfig.seasonCardPrice} ₽</div><div style="flex: 1;">${popupConfig.permanentCardPrice} ₽</div></div>
                </div>
            </div>
        </div>
        <div id="userBookingsContainer"></div>
        <div class="card-container" id="calendarContainer"></div>
        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest"><span class="newcomer-text">как всё устроено</span><img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image"></div>
        </div>
        <div class="card-container">
            <div class="metrics-header"><h2 class="metrics-title">🌍 клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" onclick="event.preventDefault(); openLink(this.href, 'reports_click', true); return false;" class="metrics-link">смотреть отчёты &gt;</a></div>
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${metrics.hikes}</div></div>
                <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${metrics.locations}</div></div>
                <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${metrics.kilometers}</div></div>
                <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${metrics.meetings}</div></div>
            </div>
        </div>
    `;
    setupAccordion('cardAccordionGuest', true);
    document.getElementById('guestCardImage')?.addEventListener('click', () => { haptic(); showGuestPopup(); });
    document.getElementById('newcomerBtnGuest')?.addEventListener('click', () => { haptic(); setUserInteracted(); log('novichkam_click', true); renderNewcomerPage(true); });
    document.getElementById('guestPrivilegesBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); renderGuestPrivileges(); log('privilegii_click', true); });
    renderUserBookings();
    const calendarContainer = document.getElementById('calendarContainer');
    if (calendarContainer) renderCalendar(calendarContainer);
    setupBottomNav();
}

function renderHome() {
    isPrivPage = false; isMenuActive = false;
    if (window._floatingScrollHandler) { window.removeEventListener('scroll', window._floatingScrollHandler); window._floatingScrollHandler = null; }
    hideBack();
    subtitle.classList.remove('subtitle-guest');
    const existingPopup = document.getElementById('guestPopup');
    if (existingPopup) existingPopup.remove();
    if (userCard.status === 'loading') {
        mainDiv.innerHTML = '<div class="loader" style="display:flex; justify-content:center; padding:40px 0;">Загрузка...</div>';
        showBottomNav(false);
        return;
    }
    updateMetricsUI();
    if (userCard.status === 'active' && userCard.cardUrl) {
        subtitle.textContent = `💳 твоя карта, ${firstName}`;
        showBottomNav(true);
        mainDiv.innerHTML = `
            <div class="card-container">
                <img src="${userCard.cardUrl}" alt="карта" class="card-image" id="ownerCardImage">
                <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">${userCard.hikes}</span></div>
                <div style="display: flex; gap: 12px; margin: 0 16px 12px 16px;">
                    <a href="#" class="btn btn-yellow" id="privBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">привилегии</a>
                    <a href="#" class="btn btn-outline" id="supportBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">поддержка</a>
                </div>
            </div>
            <div id="userBookingsContainer"></div>
            <div class="card-container" id="calendarContainer"></div>
            <div class="card-container">
                <h2 class="section-title">🫖 для новичков</h2>
                <div class="btn-newcomer" id="newcomerBtn"><span class="newcomer-text">как всё устроено</span><img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image"></div>
            </div>
            <div class="card-container">
                <div class="metrics-header"><h2 class="metrics-title">🌍 клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" onclick="event.preventDefault(); openLink(this.href, 'reports_click', false); return false;" class="metrics-link">смотреть отчёты &gt;</a></div>
                <div class="metrics-grid">
                    <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${metrics.hikes}</div></div>
                    <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${metrics.locations}</div></div>
                    <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${metrics.kilometers}</div></div>
                    <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${metrics.meetings}</div></div>
                </div>
            </div>
        `;
        document.getElementById('ownerCardImage')?.addEventListener('click', () => { haptic(); if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium'); showConfetti(); log('card_click', false); });
        document.getElementById('privBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); log('privilege_click', false); renderPriv(); });
        document.getElementById('supportBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/hellointelligent', 'support_click', false); });
        document.getElementById('newcomerBtn')?.addEventListener('click', () => { haptic(); setUserInteracted(); log('novichkam_click', false); renderNewcomerPage(false); });
        renderUserBookings();
        const calendarContainer = document.getElementById('calendarContainer');
        if (calendarContainer) renderCalendar(calendarContainer);
        setupBottomNav();
    } else renderGuestHome();
}

function buyCard() { haptic(); if (!userId) return; log('buy_card_click', true); openLink(PERMANENT_CARD_LINK, null, true); }

function setupBottomNav() {
    const navHome = document.getElementById('navHome');
    const navHikes = document.getElementById('navHikes');
    const navProfiles = document.getElementById('navProfiles');
    const navMore = document.getElementById('navMore');
    const popup = document.getElementById('navPopup');
    const popupChat = document.getElementById('popupChat');
    const popupChannel = document.getElementById('popupChannel');
    const popupGift = document.getElementById('popupGift');
    const popupNewcomer = document.getElementById('popupNewcomer');
    const popupPass = document.getElementById('popupPass');
    const popupQuestion = document.getElementById('popupQuestion');
    if (!navHome || !navHikes || !navMore || !popup) return;
    const newNavHome = navHome.cloneNode(true);
    const newNavHikes = navHikes.cloneNode(true);
    const newNavProfiles = navProfiles.cloneNode(true);
    const newNavMore = navMore.cloneNode(true);
    navHome.parentNode.replaceChild(newNavHome, navHome);
    navHikes.parentNode.replaceChild(newNavHikes, navHikes);
    navProfiles.parentNode.replaceChild(newNavProfiles, navProfiles);
    navMore.parentNode.replaceChild(newNavMore, navMore);
    const navHomeNew = document.getElementById('navHome');
    const navHikesNew = document.getElementById('navHikes');
    const navProfilesNew = document.getElementById('navProfiles');
    const navMoreNew = document.getElementById('navMore');

    const profilesLabel = navProfilesNew?.querySelector('.nav-label');
    if (profilesLabel) profilesLabel.textContent = 'интеллигенты';

    if (navProfilesNew && !navProfilesNew.querySelector('.nav-badge')) {
        const badge = document.createElement('span');
        badge.className = 'nav-badge';
        badge.textContent = 'скоро';
        navProfilesNew.style.position = 'relative';
        navProfilesNew.appendChild(badge);
    }

    navHomeNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('home'); setActiveNav('navHome');
        renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' });
        log('glavnaya_click', false);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        isMenuActive = false;
    });
    navHikesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('hikes'); setActiveNav('navHikes');
        renderHome(); scrollToCalendar();
        log('kalendar_click', false);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        isMenuActive = false;
    });
    navProfilesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('profiles'); setActiveNav('navProfiles');
        const isMaxMolotov = user?.username === 'maxmolotov';
        if (isMaxMolotov) {
            renderProfiles();
        } else {
            showProfilesComingSoonPopup();
        }
        log('profiles_click', false);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        isMenuActive = false;
    });
    navMoreNew.addEventListener('click', (e) => {
        e.stopPropagation(); haptic();
        if (popup.classList.contains('show')) { popup.classList.remove('show'); isMenuActive = false; updateActiveNav(); }
        else { popup.classList.add('show'); setActiveNav('navMore'); isMenuActive = true; }
        log('menu_click', false);
    });
    popupChat.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahikingchat', 'chat_click', false); popup.classList.remove('show'); isMenuActive = false; updateActiveNav(); });
    popupChannel.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahiking', 'channel_click', false); popup.classList.remove('show'); isMenuActive = false; updateActiveNav(); });
    popupGift.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); const isGuest = userCard.status !== 'active'; renderGift(isGuest); popup.classList.remove('show'); isMenuActive = false; resetNavActive(); });
    popupNewcomer.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); const isGuest = userCard.status !== 'active'; renderNewcomerPage(isGuest); popup.classList.remove('show'); isMenuActive = false; resetNavActive(); });
    popupPass.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); const isGuest = userCard.status !== 'active'; renderPassPage(isGuest); popup.classList.remove('show'); isMenuActive = false; resetNavActive(); });
    if (popupQuestion) {
        popupQuestion.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); const isGuest = userCard.status !== 'active'; openLink('https://t.me/hellointelligent', 'question_click', isGuest); popup.classList.remove('show'); isMenuActive = false; resetNavActive(); });
    }
    document.addEventListener('click', (e) => { if (popup.classList.contains('show') && !navMoreNew.contains(e.target) && !popup.contains(e.target)) { popup.classList.remove('show'); isMenuActive = false; updateActiveNav(); } });
    window.addEventListener('scroll', () => { setUserInteracted(); requestAnimationFrame(updateActiveNav); });
    updateActiveNav();
}

function showBottomNav(show = true) { if (bottomNav) { if (show) bottomNav.classList.remove('hidden'); else bottomNav.classList.add('hidden'); } }

function updateMetricsUI() {
    const hikesEl = document.querySelector('[data-metric="hikes"]');
    const locationsEl = document.querySelector('[data-metric="locations"]');
    const kilometersEl = document.querySelector('[data-metric="kilometers"]');
    const meetingsEl = document.querySelector('[data-metric="meetings"]');
    if (hikesEl) hikesEl.textContent = metrics.hikes;
    if (locationsEl) locationsEl.textContent = metrics.locations;
    if (kilometersEl) kilometersEl.textContent = metrics.kilometers;
    if (meetingsEl) meetingsEl.textContent = metrics.meetings;
}

function showProfilesComingSoonPopup() {
    haptic();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'comingSoonPopup';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 300px;">
            <button class="modal-close" id="closePopup">&times;</button>
            <div class="modal-title" style="color: var(--yellow);">новая функция</div>
            <div class="modal-text">скоро владельцы карт получат доступ к знакомствам, качество которых недоступно ни в одном другом сервисе</div>
            <div style="margin-top: 20px; text-align: center;">
                <button class="btn btn-yellow" id="comingSoonOkBtn" style="width: 100%;">воу, давайте скорее</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('closePopup')?.addEventListener('click', close);
    document.getElementById('comingSoonOkBtn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    log('profiles_coming_soon_popup', userCard.status !== 'active');
}

async function renderProfiles() {
    isPrivPage = true;
    isMenuActive = false;
    resetNavActive();
    subtitle.textContent = `интеллигенты`;
    showBack(() => renderHome());
    haptic();
    log('profiles_page_opened', userCard.status !== 'active');
    showBottomNav(true);
    setupBottomNav();

    const allProfiles = await loadAllProfiles();
    await loadMyProfile();
    await updateAvatarIfNeeded();

    const hasMyProfile = !!myProfile;
    const hasAnyProfile = Object.keys(allProfiles).length > 0;

    if (!hasMyProfile) {
        const placeholderCount = 6;
        let profilesHtml = '';
        for (let i = 0; i < placeholderCount; i++) {
            profilesHtml += `
                <div class="profile-card blurred">
                    <div class="profile-avatar-placeholder" style="background-color: rgba(255,255,255,0.1);">?</div>
                    <div class="profile-name-status">
                        <span class="profile-name" style="color: rgba(255,255,255,0.3);">???</span>
                        <div class="profile-status-tags"><span class="status-tag status-tag-friendship" style="background-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.3);">дружба</span></div>
                    </div>
                    <div class="profile-section-title" style="color: rgba(255,255,255,0.3);">увлечения</div>
                    <div class="profile-section-text" style="color: rgba(255,255,255,0.3);">———</div>
                    <div class="profile-section-title" style="color: rgba(255,255,255,0.3);">профессия</div>
                    <div class="profile-section-text" style="color: rgba(255,255,255,0.3);">———</div>
                </div>
            `;
        }
        mainDiv.innerHTML = `
            <div class="profiles-grid" id="profilesGrid">${profilesHtml}</div>
            <div class="center-floating-btn">
                <button class="btn btn-yellow btn-glow" id="createProfileBtn">создать профиль 👋🏻</button>
            </div>
        `;
        document.getElementById('createProfileBtn')?.addEventListener('click', () => {
            haptic();
            renderEditProfile();
        });
        return;
    }

    let profilesHtml = '';
    if (hasAnyProfile) {
        for (const [uid, profile] of Object.entries(allProfiles)) {
            profilesHtml += renderProfileCard(profile, false);
        }
    } else {
        for (let i = 0; i < 6; i++) {
            profilesHtml += `
                <div class="profile-card blurred">
                    <div class="profile-avatar-placeholder" style="background-color: rgba(255,255,255,0.1);">?</div>
                    <div class="profile-name-status">
                        <span class="profile-name" style="color: rgba(255,255,255,0.3);">???</span>
                        <div class="profile-status-tags"><span class="status-tag status-tag-friendship" style="background-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.3);">дружба</span></div>
                    </div>
                    <div class="profile-section-title" style="color: rgba(255,255,255,0.3);">увлечения</div>
                    <div class="profile-section-text" style="color: rgba(255,255,255,0.3);">———</div>
                    <div class="profile-section-title" style="color: rgba(255,255,255,0.3);">профессия</div>
                    <div class="profile-section-text" style="color: rgba(255,255,255,0.3);">———</div>
                </div>
            `;
        }
    }

    mainDiv.innerHTML = `
        <div class="profiles-grid" id="profilesGrid">${profilesHtml}</div>
        <div class="floating-edit-btn" id="editProfileBtnContainer">
            <button class="btn btn-outline" id="editProfileBtn" style="background-color: rgba(255,255,255,0.1); color: #ffffff; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.2); backdrop-filter: blur(4px);">мой профиль ✍🏻</button>
        </div>
    `;

    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
        haptic();
        renderEditProfile();
    });
}

function renderProfileCard(profile, isBlurred = false) {
    let nextHike = null;
    if (!isBlurred && hikesList.length) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const futureHikes = hikesList.filter(h => new Date(h.date) >= today);
        for (let hike of futureHikes) {
            const hikeIndex = hikesList.findIndex(h => h.date === hike.date);
            if (hikeIndex !== -1 && hikeBookingStatus[hikeIndex]) {
                nextHike = hike;
                break;
            }
        }
    }
    const nextHikeHtml = (nextHike && !isBlurred) ? `
        <div class="profile-section-title" style="color: var(--yellow);">идёт на хайк</div>
        <a href="#" class="profile-hike-link" data-hike-date="${nextHike.date}" data-hike-title="${nextHike.title}" style="color: #ffffff;">${nextHike.title}</a>
    ` : (isBlurred ? '' : `<div class="profile-section-title" style="color: var(--yellow);">идёт на хайк</div><span style="color: rgba(255,255,255,0.6); font-size: 14px;">скоро узнаем</span>`);

    const avatarHtml = profile.avatarUrl
        ? `<img src="${profile.avatarUrl}" class="profile-avatar" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'profile-avatar-placeholder\'>${(profile.name?.charAt(0) || '?').toUpperCase()}</div>';">`
        : `<div class="profile-avatar-placeholder">${(profile.name?.charAt(0) || '?').toUpperCase()}</div>`;

    const statusTags = (profile.friendshipStatuses || []).map(status => {
        let tagClass = '';
        if (status === 'дружба') tagClass = 'status-tag-friendship';
        else if (status === 'романтика') tagClass = 'status-tag-romance';
        else if (status === 'бизнес') tagClass = 'status-tag-business';
        return `<span class="status-tag ${tagClass}">${status}</span>`;
    }).join('');

    return `
        <div class="profile-card ${isBlurred ? 'blurred' : ''}">
            ${avatarHtml}
            <div class="profile-name-status">
                <span class="profile-name">${profile.name || 'Участник'}</span>
                <div class="profile-status-tags">${statusTags || '<span class="status-tag status-tag-friendship">дружба</span>'}</div>
            </div>
            <div class="profile-section-title" style="color: var(--yellow);">увлечения</div>
            <div class="profile-section-text">${profile.hobbies || '—'}</div>
            <div class="profile-section-title" style="color: var(--yellow);">профессия</div>
            <div class="profile-section-text">${profile.profession || '—'}</div>
            ${nextHikeHtml}
        </div>
    `;
}

async function renderEditProfile() {
    isPrivPage = true;
    isMenuActive = false;
    resetNavActive();
    subtitle.textContent = `мой профиль`;
    showBack(() => renderProfiles());
    haptic();
    log('edit_profile_opened', false);
    showBottomNav(false);

    await loadMyProfile();
    const currentName = myProfile?.name || firstName;
    const currentStatuses = myProfile?.friendshipStatuses || [];
    const currentHobbies = myProfile?.hobbies || '';
    const currentProfession = myProfile?.profession || '';

    mainDiv.innerHTML = `
        <div class="card-container">
            <form id="editProfileForm" class="edit-form">
                <div class="form-field">
                    <label>имя</label>
                    <input type="text" id="profileName" value="${escapeHtml(currentName)}" placeholder="как вас зовут">
                </div>
                <div class="form-field">
                    <label>статус знакомств</label>
                    <div class="checkbox-group">
                        <label><input type="checkbox" value="дружба" ${currentStatuses.includes('дружба') ? 'checked' : ''}> дружба</label>
                        <label><input type="checkbox" value="романтика" ${currentStatuses.includes('романтика') ? 'checked' : ''}> романтика</label>
                        <label><input type="checkbox" value="бизнес" ${currentStatuses.includes('бизнес') ? 'checked' : ''}> бизнес</label>
                    </div>
                </div>
                <div class="form-field">
                    <label>увлечения</label>
                    <textarea id="profileHobbies" rows="3" placeholder="что тебя вдохновляет?">${escapeHtml(currentHobbies)}</textarea>
                </div>
                <div class="form-field">
                    <label>профессия</label>
                    <textarea id="profileProfession" rows="2" placeholder="в какой сфере ты работаешь?">${escapeHtml(currentProfession)}</textarea>
                </div>
                <button type="submit" class="btn btn-yellow" id="saveProfileBtn" style="width: 100%; margin: 0;">сохранить профиль</button>
                ${myProfile ? `<button type="button" class="delete-profile-btn" id="deleteProfileBtn">снять с публикации</button>` : ''}
            </form>
        </div>
    `;

    const form = document.getElementById('editProfileForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        haptic();
        const name = document.getElementById('profileName').value.trim();
        if (!name) {
            alert('Пожалуйста, укажите имя');
            return;
        }
        const selectedStatuses = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb => cb.value);
        const hobbies = document.getElementById('profileHobbies').value.trim();
        const profession = document.getElementById('profileProfession').value.trim();

        const profileData = {
            name,
            friendshipStatuses: selectedStatuses,
            hobbies,
            profession,
            avatarUrl: myProfile?.avatarUrl || userPhotoUrl || null,
            avatarUpdatedAt: myProfile?.avatarUpdatedAt || Date.now(),
            userId: userId
        };
        await saveProfile(profileData);
        renderProfiles();
    });

    if (document.getElementById('deleteProfileBtn')) {
        document.getElementById('deleteProfileBtn').addEventListener('click', async () => {
            haptic();
            if (confirm('Вы уверены, что хотите снять профиль с публикации? Он перестанет быть виден другим участникам.')) {
                await deleteProfile();
                renderProfiles();
            }
        });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function loadData() {
    showAnimatedLoader();
    setupBottomNav();
    const loaderTimeout = setTimeout(() => {
        console.warn('loadData timeout – force hide loader');
        hideAnimatedLoader();
    }, 10000);
    try {
        loadCachedData();
        if (database) {
            subscribeToHikes((newList) => {
                hikesList = newList;
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer && !isPrivPage) renderCalendar(calendarContainer);
                const bookingsContainer = document.getElementById('userBookingsContainer');
                if (bookingsContainer) renderUserBookings();
                saveCachedData();
            });
        }
        const metricsPromise = loadMetricsFromFirebase();
        const faqPromise = loadFaqFromFirebase();
        const privilegesPromise = loadPrivilegesFromFirebase();
        const guestPrivilegesPromise = loadGuestPrivilegesFromFirebase();
        const passInfoPromise = loadPassInfoFromFirebase();
        const giftPromise = loadGiftFromFirebase();
        const phrasesPromise = loadRandomPhrasesFromFirebase();
        const leadersPromise = loadLeadersFromFirebase();
        const results = await Promise.allSettled([
            metricsPromise, faqPromise, privilegesPromise,
            guestPrivilegesPromise, passInfoPromise, giftPromise,
            phrasesPromise, leadersPromise
        ]);
        if (results[0].status === 'fulfilled' && results[0].value) metrics = results[0].value;
        if (results[1].status === 'fulfilled' && results[1].value) faq = results[1].value;
        if (results[2].status === 'fulfilled' && results[2].value) privileges = results[2].value;
        if (results[3].status === 'fulfilled' && results[3].value) guestPrivileges = results[3].value;
        if (results[4].status === 'fulfilled' && results[4].value) passInfo = results[4].value;
        if (results[5].status === 'fulfilled' && results[5].value) giftContent = results[5].value;
        if (results[6].status === 'fulfilled' && results[6].value) randomPhrases = results[6].value;
        if (results[7].status === 'fulfilled' && results[7].value) leaders = results[7].value;
        await loadRegistrationsPopup();
        await loadPopupConfig();
        await loadUserDataFromFirebase();
        if (userCard.status === 'active' && database && userPhotoUrl) await saveUserAvatar();
        if (userCard.status === 'active' && database) {
            try {
                hikeBookingStatus = await loadUserRegistrationsFromFirebase();
            } catch (e) {
                console.error(e);
                hikeBookingStatus = {};
                hikesList.forEach((_, index) => hikeBookingStatus[index] = false);
            }
        } else {
            hikeBookingStatus = loadUserRegistrationsFromLocal();
        }
        log('visit', userCard.status !== 'active');
        saveCachedData();
        renderHome();
        const urlParams = new URLSearchParams(window.location.search);
        const paymentSuccess = urlParams.get('payment_success');
        const invId = urlParams.get('InvId');
        const hikeDate = urlParams.get('hike');
        if (paymentSuccess === '1' && invId && database) {
            const orderRef = database.ref(`orders/${invId}`);
            const snapshot = await orderRef.once('value');
            const order = snapshot.val();
            if (order && order.status === 'paid') {
                if (order.type === 'ticket' && order.hikeDate) {
                    const hikeIndex = hikesList.findIndex(h => h.date === order.hikeDate);
                    if (hikeIndex !== -1) {
                        hikeBookingStatus[hikeIndex] = true;
                        renderUserBookings();
                        if (sheetCurrentIndex !== undefined && hikesList[sheetCurrentIndex]?.date === order.hikeDate) updateFloatingSheetButtons();
                        const calendarContainer = document.getElementById('calendarContainer');
                        if (calendarContainer) renderCalendar(calendarContainer);
                    }
                }
                const newUrl = window.location.pathname + (hikeDate ? `?hike=${hikeDate}` : '');
                window.history.replaceState({}, '', newUrl);
            }
        }
        const startParam = tg.initDataUnsafe?.start_param || tg.initData?.start_param;
        const urlStartParam = urlParams.get('startapp') || urlParams.get('start');
        const effectiveStartParam = startParam || urlStartParam;
        if (effectiveStartParam && effectiveStartParam.startsWith('hike_')) {
            const targetDate = normalizeDate(effectiveStartParam.substring(5));
            let attempts = 0;
            const maxAttempts = 100;
            const interval = setInterval(() => {
                attempts++;
                const targetIndex = hikesList.findIndex(h => h.date === targetDate);
                if (targetIndex !== -1) {
                    clearInterval(interval);
                    setTimeout(() => { try { showBottomSheet(targetIndex); } catch (e) { console.error('Error in showBottomSheet:', e); } }, 200);
                } else if (attempts >= maxAttempts) clearInterval(interval);
            }, 300);
        }
    } catch (e) { console.error('Unhandled error in loadData:', e); renderHome(); }
    finally { clearTimeout(loaderTimeout); hideAnimatedLoader(); }
}

window.addEventListener('load', loadData);