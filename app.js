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
        window.open(url, '_blank');
        tg.close();
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
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?output=csv';
const GUEST_API_URL = 'https://script.google.com/macros/s/AKfycby0943sdi-neS00sFzcyT-rsmzQgPOD4vsOYMnnLYSK8XcEIQJynP1CGsSWP62gK1zxSw/exec';
const METRICS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?gid=0&single=true&output=csv';
const HIKES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?gid=1820108576&single=true&output=csv';
const REGISTRATION_API_URL = 'https://script.google.com/macros/s/AKfycbxbtauKP7FO0quR0yktXfbnU-x_Vk6zOzKZlms-tgQSszVDQH1POGrREYdjPBzHqyUJFg/exec';

const CACHE_TTL = 300000; // 5 минут

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = { status: 'loading', hikes: 0, cardUrl: '' };
let metrics = { hikes: '19', kilometers: '150+', locations: '13', meetings: '130+' };
let hikesData = {};
let hikesList = [];

// Firebase инициализация с проверкой
let database = null;
try {
    const firebaseConfig = {
        apiKey: "AIzaSyCv4v2CJxR1A-QkYWYjzFEF-kKWB1qUSQY",
        authDomain: "hiking-club-app-b6c7c.firebaseapp.com",
        databaseURL: "https://hiking-club-app-b6c7c-default-rtdb.firebaseio.com",
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

// --- Firebase функции (с проверкой) ---
function subscribeToParticipantCount(hikeDate, callback) {
    if (!database) {
        callback(0);
        return () => {};
    }
    const countRef = database.ref('participants/' + hikeDate);
    const listener = countRef.on('value', (snapshot) => {
        const count = snapshot.val() || 0;
        callback(count);
    });
    return () => countRef.off('value', listener);
}

function incrementParticipantCount(hikeDate) {
    if (!database) return Promise.resolve();
    const countRef = database.ref('participants/' + hikeDate);
    return countRef.set(firebase.database.ServerValue.increment(1));
}

function decrementParticipantCount(hikeDate) {
    if (!database) return Promise.resolve();
    const countRef = database.ref('participants/' + hikeDate);
    return countRef.transaction((current) => {
        if (current === null || current <= 0) return 0;
        return current - 1;
    });
}

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
        console.error('Error loading user registrations from Firebase:', e);
        return {};
    }
}

// --- Флаги интерфейса ---
let isPrivPage = false;
let isMenuActive = false;
let hikeBookingStatus = {};

const mainDiv = document.getElementById('mainContent');
const subtitle = document.getElementById('subtitle');
const bottomNav = document.getElementById('bottomNav');
const navPopup = document.getElementById('navPopup');

// --- Навигация (без изменений) ---
function setActiveNav(activeId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (activeId) document.getElementById(activeId)?.classList.add('active');
}
function resetNavActive() {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
}
function updateActiveNav() {
    if (isPrivPage || isMenuActive) return;
    const navHome = document.getElementById('navHome');
    const navHikes = document.getElementById('navHikes');
    if (!navHome || !navHikes) return;
    const calendarContainer = document.getElementById('calendarContainer');
    if (!calendarContainer) {
        setActiveNav('navHome');
        return;
    }
    const rect = calendarContainer.getBoundingClientRect();
    const isCalendarVisible = rect.top < window.innerHeight && rect.bottom > 0;
    setActiveNav(isCalendarVisible ? 'navHikes' : 'navHome');
}

// --- Логирование и загрузка данных ---
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

function parseCSVLine(line) {
    const result = [];
    let start = 0, inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === ',' && !inQuotes) {
            let field = line.substring(start, i).trim();
            if (field.startsWith('"') && field.endsWith('"')) field = field.slice(1, -1);
            result.push(field);
            start = i + 1;
        }
    }
    let field = line.substring(start).trim();
    if (field.startsWith('"') && field.endsWith('"')) field = field.slice(1, -1);
    result.push(field);
    return result;
}

async function fetchWithCache(key, url, ttl = CACHE_TTL) {
    const cached = localStorage.getItem(key);
    if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < ttl) return data;
    }
    const resp = await fetch(`${url}&t=${Date.now()}`, { cache: 'no-cache' });
    const text = await resp.text();
    const data = { text };
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    return data;
}

async function fetchWithoutCache(url) {
    const resp = await fetch(`${url}&t=${Date.now()}`, { cache: 'no-cache' });
    return await resp.text();
}

async function loadUserData() {
    if (!userId) {
        userCard.status = 'inactive';
        return;
    }
    try {
        const { text } = await fetchWithCache(`members_${userId}`, CSV_URL, CACHE_TTL);
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error('Нет данных');
        const headers = parseCSVLine(lines[0]);
        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row[0] === String(userId)) {
                const data = {};
                headers.forEach((key, idx) => data[key] = row[idx] || '');
                userCard = {
                    status: 'active',
                    hikes: parseInt(data.hikes_count) || 0,
                    cardUrl: data.card_image_url || ''
                };
                break;
            }
        }
        if (userCard.status !== 'active') userCard.status = 'inactive';
    } catch (e) {
        console.error('Ошибка загрузки members:', e);
        userCard.status = 'inactive';
    }
}

async function loadMetrics() {
    try {
        const text = await fetchWithoutCache(METRICS_CSV_URL);
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error('Нет данных метрик');
        const headers = parseCSVLine(lines[0]);
        const dataRow = parseCSVLine(lines[1]);
        const data = {};
        headers.forEach((key, idx) => data[key] = dataRow[idx] || '');
        metrics = {
            hikes: data.hikes || '19',
            kilometers: data.kilometers || '150+',
            locations: data.locations || '13',
            meetings: data.meetings || '130+'
        };
    } catch (e) {
        console.error('Ошибка загрузки метрик:', e);
    }
}

async function loadHikes() {
    try {
        const { text } = await fetchWithCache('hikes', HIKES_CSV_URL, CACHE_TTL);
        const lines = text.trim().split('\n');
        if (lines.length < 2) return;
        const headers = parseCSVLine(lines[0]);
        hikesData = {};
        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row.length < 4) continue;
            const data = {};
            headers.forEach((key, idx) => data[key] = row[idx] || '');
            const date = data.date;
            if (!date) continue;
            let tags = [];
            if (data.tags) {
                let tagsStr = data.tags;
                if (tagsStr.startsWith('"') && tagsStr.endsWith('"')) tagsStr = tagsStr.slice(1, -1);
                tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
            }
            hikesData[date] = {
                title: data.title || 'Хайк',
                features: data.features || data.description || '',
                access: data.access || '',
                details: data.details || '',
                image: data.image_url || '',
                date,
                tags
            };
        }
        hikesList = Object.values(hikesData).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) {
        console.error('Ошибка загрузки расписания хайков:', e);
    }
}

function updateRegistrationInSheet(hikeDate, hikeTitle, status) {
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
            status,
            has_card: hasCard
        });
        fetch(REGISTRATION_API_URL, { method: 'POST', body: params, keepalive: true })
            .catch(e => console.error('Ошибка отправки в Google Sheets:', e));
    } catch (e) {
        console.error('Ошибка в updateRegistrationInSheet:', e);
    }
}

// --- Основная загрузка с таймаутом ---
async function loadData() {
    // Таймер, который принудительно уберет лоадер через 5 секунд
    const loaderTimeout = setTimeout(() => {
        console.warn('loadData timeout – force hide loader');
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => loader.style.display = 'none', 300);
        }
    }, 5000);

    try {
        await Promise.allSettled([loadUserData(), loadMetrics(), loadHikes()]);

        if (userId && hikesList.length > 0) {
            try {
                hikeBookingStatus = await loadUserRegistrationsFromFirebase();
            } catch (e) {
                console.error('Firebase load failed, using defaults', e);
                hikeBookingStatus = {};
                hikesList.forEach((_, index) => hikeBookingStatus[index] = false);
            }
        } else {
            hikeBookingStatus = {};
            hikesList.forEach((_, index) => hikeBookingStatus[index] = false);
        }

        log('visit', userCard.status !== 'active');
        renderHome();
    } catch (e) {
        console.error('Unhandled error in loadData:', e);
        // Если произошла критическая ошибка, всё равно пытаемся отрендерить главную
        renderHome();
    } finally {
        clearTimeout(loaderTimeout);
        const loader = document.getElementById('initial-loader');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => loader.style.display = 'none', 300);
        }
    }
}

// ----- Массив партнёров (полный) -----
const partners = [ /* ... полный массив из предыдущего кода ... */ ];

// ----- Остальные функции (setupAccordion, showConfetti, parseLinks, showBottomSheet, closeBottomSheet, renderCalendar, updateMetricsUI, setupBottomNav, showBottomNav, renderNewcomerPage, renderPriv, renderGuestPriv, renderGift, showGuestPopup, renderGuestHome, renderHome, buyCard) -----
// Они остаются без изменений, просто скопируй их из предыдущего ответа.
// Я не буду дублировать их здесь, чтобы не загромождать ответ, но ты можешь взять их из предыдущего полного кода.
// Важно: в функциях, где используется increment/decrement, замени вызовы на наши обновлённые (с проверкой database).

window.addEventListener('load', loadData);