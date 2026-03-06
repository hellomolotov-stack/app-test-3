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
const REGISTRATION_API_URL = 'https://script.google.com/macros/s/AKfycbxbtauKP7FO0quR0yktXfbnU-x_Vk6zOzKZlms-tgQSszVDQH1POGrREYdjPBzHqyUJFg/exec';
const APP_LINK = 'https://t.me/yaltahiking_bot/app'; // замените на актуальную ссылку

const CACHE_TTL = 600000; // 10 минут

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

// Firebase инициализация
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

// --- Функции для работы с аватаром пользователя ---
async function saveUserAvatar() {
    if (!database || !userId || !userPhotoUrl) return;
    try {
        await database.ref(`userAvatars/${userId}`).set({
            photoUrl: userPhotoUrl,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        console.log('User avatar saved');
    } catch (e) {
        console.error('Error saving user avatar:', e);
    }
}

// --- Firebase функции для данных ---
async function loadHikesFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('hikes').once('value');
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
            telegram_link: data.telegram_link || ''
        })).sort((a, b) => a.date.localeCompare(b.date));
        return { data: hikes, list };
    } catch (e) {
        console.error('Error loading hikes from Firebase:', e);
        return null;
    }
}

async function loadMetricsFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('metrics').once('value');
        return snapshot.val() || null;
    } catch (e) {
        console.error('Error loading metrics from Firebase:', e);
        return null;
    }
}

async function loadFaqFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('faq').once('value');
        return snapshot.val() || [];
    } catch (e) {
        console.error('Error loading faq from Firebase:', e);
        return null;
    }
}

async function loadPrivilegesFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('privileges').once('value');
        return snapshot.val() || { club: [], city: [] };
    } catch (e) {
        console.error('Error loading privileges from Firebase:', e);
        return null;
    }
}

async function loadGiftFromFirebase() {
    if (!database) return null;
    try {
        const snapshot = await database.ref('gift').once('value');
        return snapshot.val()?.content || '';
    } catch (e) {
        console.error('Error loading gift from Firebase:', e);
        return null;
    }
}

// --- Firebase функции для регистраций и участников ---
function subscribeToParticipantCount(hikeDate, callback) {
    if (!database) {
        callback(0, []);
        return () => {};
    }
    const participantsRef = database.ref('hikeParticipants/' + hikeDate);
    const listener = participantsRef.on('value', (snapshot) => {
        const participants = snapshot.val() || {};
        const count = Object.keys(participants).length;
        // Сортируем по убыванию timestamp (новые первыми)
        const sorted = Object.values(participants)
            .filter(p => p && p.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3); // берём три самых новых
        callback(count, sorted);
    });
    return () => participantsRef.off('value', listener);
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

function incrementParticipantCount(hikeDate) {
    return addParticipant(hikeDate);
}

function decrementParticipantCount(hikeDate) {
    return removeParticipant(hikeDate);
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

// --- Загрузка данных пользователя из CSV (пока не перенесено в Firebase) ---
function parseCSVLine(line) {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
            let field = line.substring(start, i).trim();
            if (field.startsWith('"') && field.endsWith('"')) {
                field = field.slice(1, -1);
            }
            result.push(field);
            start = i + 1;
        }
    }
    let field = line.substring(start).trim();
    if (field.startsWith('"') && field.endsWith('"')) {
        field = field.slice(1, -1);
    }
    result.push(field);
    return result;
}

async function fetchWithCache(key, url, ttl = CACHE_TTL) {
    const cached = localStorage.getItem(key);
    if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < ttl) {
            return data;
        }
    }
    const resp = await fetch(`${url}&t=${Date.now()}`, { cache: 'no-cache' });
    const text = await resp.text();
    const data = { text };
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    return data;
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
                let data = {};
                headers.forEach((key, idx) => {
                    data[key] = row[idx] || '';
                });
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

// --- Функции для гостей (старая система) ---
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
        } catch (e) {
            return {};
        }
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
            status: status,
            has_card: hasCard
        });
        fetch(REGISTRATION_API_URL, {
            method: 'POST',
            body: params,
            keepalive: true
        }).catch(e => console.error('Ошибка отправки запроса в Google Sheets:', e));
    } catch (e) {
        console.error('Ошибка в updateRegistrationInSheet:', e);
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

// --- Навигация ---
function setActiveNav(activeId) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    if (activeId) {
        const activeEl = document.getElementById(activeId);
        if (activeEl) activeEl.classList.add('active');
    }
}

function resetNavActive() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
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
    if (isCalendarVisible) {
        setActiveNav('navHikes');
    } else {
        setActiveNav('navHome');
    }
}

// --- Логирование ---
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

// --- Анимированная загрузка ---
let loaderInterval = null;

function showAnimatedLoader() {
    const loader = document.getElementById('initial-loader');
    if (!loader) return;
    loader.innerHTML = `
        <div class="loader-animation">
            <div class="loader-emoji" id="loaderEmoji">⛰️</div>
            <div class="loader-text" id="loaderText">выбираем вершину</div>
        </div>
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
    if (!emojiEl || !textEl) return;
    
    loaderInterval = setInterval(() => {
        index = (index + 1) % steps.length;
        emojiEl.textContent = steps[index].emoji;
        textEl.textContent = steps[index].text;
    }, 1500);
}

function hideAnimatedLoader() {
    if (loaderInterval) {
        clearInterval(loaderInterval);
        loaderInterval = null;
    }
    const loader = document.getElementById('initial-loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.style.display = 'none';
            loader.innerHTML = '';
        }, 300);
    }
}

// --- Основная загрузка с Firebase ---
async function loadData() {
    showAnimatedLoader();

    const loaderTimeout = setTimeout(() => {
        console.warn('loadData timeout – force hide loader');
        hideAnimatedLoader();
    }, 10000);

    try {
        if (database) {
            const hikesResult = await loadHikesFromFirebase();
            if (hikesResult) {
                hikesData = hikesResult.data;
                hikesList = hikesResult.list;
                console.log('Hikes loaded from Firebase');
            }
            const metricsData = await loadMetricsFromFirebase();
            if (metricsData) {
                metrics = metricsData;
                console.log('Metrics loaded from Firebase');
            }
            const faqData = await loadFaqFromFirebase();
            if (faqData) {
                faq = faqData;
                console.log('FAQ loaded from Firebase');
            }
            const privilegesData = await loadPrivilegesFromFirebase();
            if (privilegesData) {
                privileges = privilegesData;
                console.log('Privileges loaded from Firebase');
            }
            const giftData = await loadGiftFromFirebase();
            if (giftData) {
                giftContent = giftData;
                console.log('Gift content loaded from Firebase');
            }
        }

        await loadUserData();

        if (userCard.status === 'active' && database && userPhotoUrl) {
            await saveUserAvatar();
        }

        if (userCard.status === 'active' && database) {
            try {
                hikeBookingStatus = await loadUserRegistrationsFromFirebase();
            } catch (e) {
                console.error('Firebase load failed, using empty', e);
                hikeBookingStatus = {};
                hikesList.forEach((_, index) => hikeBookingStatus[index] = false);
            }
        } else {
            hikeBookingStatus = {};
            hikesList.forEach((_, index) => hikeBookingStatus[index] = false);
        }

        log('visit', userCard.status !== 'active');
        
        // Проверяем start_param из Telegram
        const startParam = tg.initDataUnsafe?.start_param;
        if (startParam && startParam.startsWith('hike_')) {
            const targetDate = startParam.substring(5);
            const targetIndex = hikesList.findIndex(h => h.date === targetDate);
            if (targetIndex !== -1) {
                // Откладываем открытие, чтобы DOM успел загрузиться
                setTimeout(() => {
                    showBottomSheet(targetIndex);
                }, 500);
            }
        }
        
        renderHome();
    } catch (e) {
        console.error('Unhandled error in loadData:', e);
        renderHome();
    } finally {
        clearTimeout(loaderTimeout);
        hideAnimatedLoader();
    }
}

function setupAccordion(containerId, isGuest) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const accordionBtn = container.querySelector('.accordion-btn');
    const arrow = accordionBtn?.querySelector('.arrow');
    const dropdown = container.querySelector('.dropdown-menu');

    if (accordionBtn && dropdown) {
        accordionBtn.addEventListener('click', (e) => {
            haptic();
            e.preventDefault();
            log('nav_toggle', isGuest);
            dropdown.classList.toggle('show');
            arrow.classList.toggle('arrow-down');
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
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

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
        if (frame > 120) {
            document.body.removeChild(canvas);
            return;
        }
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        frame++;
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

// Функция для преобразования markdown ссылок в HTML с data-атрибутами
function parseLinks(text, isGuest) {
    if (!text) return '';
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, linkText, url) {
        return `<a href="#" data-url="${url}" data-guest="${isGuest}" class="dynamic-link">${linkText}</a>`;
    });
}

// Глобальный обработчик кликов по ссылкам
document.addEventListener('click', function(e) {
    const link = e.target.closest('.dynamic-link, .nav-popup a, .btn-newcomer, .accordion-btn, .bottom-sheet-nav-arrow, .btn');
    if (!link) return;
    
    if (link.classList.contains('dynamic-link')) {
        e.preventDefault();
        const url = link.dataset.url;
        const isGuest = link.dataset.guest === 'true';
        openLink(url, 'dynamic_link_click', isGuest);
        return;
    }
    
    if (link.closest('.nav-popup')) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && href !== '#') {
            openLink(href, 'nav_popup_click', false);
        }
        return;
    }
    
    if (link.classList.contains('btn-newcomer')) {
        e.preventDefault();
        haptic();
        const isGuest = link.id === 'newcomerBtnGuest';
        renderNewcomerPage(isGuest);
        return;
    }
});

// ----- Bottom Sheet -----
let sheetCurrentIndex = 0;
let sheetScrollListener = null;
let dragStartY = 0;
let isDragging = false;
let currentUnsubscribe = null;

function showBottomSheet(index) {
    if (!hikesList.length) return;

    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();

    const existingSheetButtons = document.querySelector('.floating-sheet-buttons');
    if (existingSheetButtons) existingSheetButtons.remove();

    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `
        <div class="bottom-sheet" id="hikeBottomSheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bottom-sheet-content-wrapper" id="bottomSheetContent">
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const sheet = document.getElementById('hikeBottomSheet');
    const contentWrapper = document.getElementById('bottomSheetContent');

    const windowHeight = window.innerHeight;
    sheet.style.maxHeight = `${windowHeight * 0.9}px`;
    sheet.style.height = `${windowHeight * 0.9}px`;

    sheetCurrentIndex = index;
    const isGuest = userCard.status !== 'active';

    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }

    function updateContent() {
        const hike = hikesList[sheetCurrentIndex];
        if (!hike) return;

        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        let formattedDate = '';
        if (hike.date) {
            const parts = hike.date.split('-');
            if (parts.length === 3) {
                const day = parseInt(parts[2], 10);
                const month = parseInt(parts[1], 10) - 1;
                formattedDate = `${day} ${monthNames[month]}`;
            } else {
                formattedDate = hike.date;
            }
        }

        const hasPrev = sheetCurrentIndex > 0;
        const hasNext = sheetCurrentIndex < hikesList.length - 1;

        let tagsHtml = '';
        if (hike.tags && hike.tags.length > 0) {
            tagsHtml = '<div class="bottom-sheet-tags">';
            hike.tags.forEach(tag => {
                tagsHtml += `<span class="bottom-sheet-tag">${tag}</span>`;
            });
            tagsHtml += '</div>';
        }

        let sectionsHtml = '';

        if (hike.features && hike.features.trim() !== '') {
            let processedText = parseLinks(hike.features, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title">особенности</div>
                    <div class="bottom-sheet-section-content">${processedText}</div>
                </div>
            `;
        }

        if (hike.access && hike.access.trim() !== '') {
            let processedText = parseLinks(hike.access, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title">как добраться</div>
                    <div class="bottom-sheet-section-content">${processedText}</div>
                </div>
            `;
        }

        if (hike.details && hike.details.trim() !== '') {
            let processedText = parseLinks(hike.details, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title">детали</div>
                    <div class="bottom-sheet-section-content">${processedText}</div>
                </div>
            `;
        }

        const hikeDate = new Date(hike.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isPast = hikeDate < today;

        let imageHtml = '';
        if (hike.image) {
            if (!isGuest && !isPast) {
                imageHtml = `
                    <div class="image-container">
                        <img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'">
                        <div class="participant-counter" id="participantCounter">
                            <span class="participant-text">идут</span>
                            <span class="participant-count" id="participantCountValue">0</span>
                            <div class="participant-avatars" id="participantAvatars"></div>
                        </div>
                    </div>
                `;
            } else {
                imageHtml = `
                    <img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'">
                `;
            }
        }

        // Дополнительная информация (начало и точка сбора) – только для будущих хайков, с SVG иконками
        let extraInfoHtml = '';
        if (!isPast && (hike.start_time || hike.location_link)) {
            extraInfoHtml = '<div class="hike-extra-info">';
            if (hike.start_time) {
                extraInfoHtml += `
                    <div class="info-row">
                        <span class="info-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" fill="none"/>
                                <polyline points="12 6 12 12 16 14" stroke="currentColor" fill="none"/>
                            </svg>
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
                    <div class="info-row">
                        <span class="info-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" fill="none"/>
                                <circle cx="12" cy="10" r="3" stroke="currentColor" fill="none"/>
                            </svg>
                        </span>
                        <span><strong>точка сбора:</strong> ${locationHtml}</span>
                    </div>
                `;
            }
            extraInfoHtml += '</div>';
        }

        // Кнопки навигации без круга, стрелки по центру
        const prevArrow = hasPrev 
            ? `<div class="bottom-sheet-nav-arrow" id="prevHike">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 7 L9 12 L15 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
               </div>`
            : '<div class="bottom-sheet-nav-arrow hidden" id="prevHike"></div>';
        
        const nextArrow = hasNext
            ? `<div class="bottom-sheet-nav-arrow" id="nextHike">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 7 L15 12 L9 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
               </div>`
            : '<div class="bottom-sheet-nav-arrow hidden" id="nextHike"></div>';

        contentWrapper.innerHTML = `
            <div class="bottom-sheet-header-block">
                <div class="bottom-sheet-header">
                    <div class="bottom-sheet-header-left">
                        <div class="bottom-sheet-header-date">${formattedDate}</div>
                        <div class="bottom-sheet-header-title">${hike.title}</div>
                    </div>
                    <div class="bottom-sheet-nav">
                        ${prevArrow}
                        ${nextArrow}
                    </div>
                </div>
                ${tagsHtml}
            </div>
            <div>
                ${imageHtml}
                ${extraInfoHtml}
                ${sectionsHtml}
            </div>
        `;

        if (!isGuest && !isPast) {
            currentUnsubscribe = subscribeToParticipantCount(hike.date, (count, participants) => {
                const countEl = document.getElementById('participantCountValue');
                if (countEl) countEl.textContent = count;
                const avatarsEl = document.getElementById('participantAvatars');
                if (avatarsEl) {
                    avatarsEl.innerHTML = '';
                    // participants уже отсортированы по убыванию timestamp (новые первыми)
                    // Вставляем их в том же порядке – новый слева, старые правее
                    participants.forEach(p => {
                        if (p.photoUrl) {
                            const img = document.createElement('img');
                            img.src = p.photoUrl;
                            img.className = 'participant-avatar';
                            img.alt = p.name || '';
                            img.title = p.name || '';
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

        document.getElementById('prevHike')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sheetCurrentIndex > 0) {
                sheetCurrentIndex--;
                updateContent();
                updateFloatingSheetButtons();
                contentWrapper.scrollTop = 0;
                haptic();
                log('hike_swipe_prev', false);
            }
        });

        document.getElementById('nextHike')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sheetCurrentIndex < hikesList.length - 1) {
                sheetCurrentIndex++;
                updateContent();
                updateFloatingSheetButtons();
                contentWrapper.scrollTop = 0;
                haptic();
                log('hike_swipe_next', false);
            }
        });
    }

    updateContent();
    createFloatingButtons();

    function removeFloatingSheetButtons() {
        const btnContainer = document.querySelector('.floating-sheet-buttons');
        if (btnContainer) btnContainer.remove();
    }

    function updateFloatingSheetButtons() {
        const container = document.querySelector('.floating-sheet-buttons');
        if (!container) return;

        const hike = hikesList[sheetCurrentIndex];
        if (!hike) return;

        const isBooked = hikeBookingStatus[sheetCurrentIndex] || false;
        const hikeDate = new Date(hike.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isPast = hikeDate < today;

        container.innerHTML = '';

        if (isPast) {
            const completedBtn = document.createElement('a');
            completedBtn.href = '#';
            completedBtn.className = 'btn btn-outline';
            completedBtn.textContent = 'хайк завершен';
            completedBtn.style.pointerEvents = 'none';
            container.appendChild(completedBtn);
            return;
        }

        const isGuest = userCard.status !== 'active';

        if (isBooked) {
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
                    hikeBookingStatus[sheetCurrentIndex] = false;
                    saveStatusToLocalStorage();
                    updateRegistrationInSheet(hike.date, hike.title, 'cancelled');
                    updateFloatingSheetButtons();
                } else {
                    Promise.all([
                        removeParticipant(hike.date),
                        setUserRegistrationStatus(hike.date, false)
                    ]).then(() => {
                        hikeBookingStatus[sheetCurrentIndex] = false;
                        updateFloatingSheetButtons();
                        updateRegistrationInSheet(hike.date, hike.title, 'cancelled');
                    }).catch((error) => {
                        console.error('Error during cancellation:', error);
                        updateFloatingSheetButtons();
                    });
                }
                log('sheet_cancel_click', false);
            });
            container.appendChild(cancelBtn);

            // Кнопка "ты записан" с новым классом
            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow-outline';
            goBtn.id = 'sheetGoBtn';
            goBtn.textContent = 'ты записан';
            container.appendChild(goBtn);
        } else {
            const questionBtn = document.createElement('a');
            questionBtn.href = '#';
            questionBtn.className = 'btn btn-outline';
            questionBtn.id = 'sheetQuestionBtn';
            questionBtn.textContent = 'задать вопрос';
            questionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                haptic();
                openLink('https://t.me/hellointelligent', 'sheet_question_click', false);
            });
            container.appendChild(questionBtn);

            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow';
            goBtn.id = 'sheetGoBtn';
            goBtn.textContent = 'иду';
            goBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (goBtn.dataset.processing === 'true') return;
                goBtn.dataset.processing = 'true';
                
                haptic();

                if (isGuest) {
                    hikeBookingStatus[sheetCurrentIndex] = true;
                    saveStatusToLocalStorage();
                    updateRegistrationInSheet(hike.date, hike.title, 'booked');
                    updateFloatingSheetButtons();
                } else {
                    setUserRegistrationStatus(hike.date, true)
                        .then(() => {
                            hikeBookingStatus[sheetCurrentIndex] = true;
                            return incrementParticipantCount(hike.date);
                        })
                        .then(() => {
                            updateRegistrationInSheet(hike.date, hike.title, 'booked');
                            updateFloatingSheetButtons();
                        })
                        .catch((error) => {
                            console.error('Error during booking:', error);
                            updateFloatingSheetButtons();
                        });
                }
                log('sheet_go_click', false);
            });
            container.appendChild(goBtn);
        }
    }

    function createFloatingButtons() {
        removeFloatingSheetButtons();

        const container = document.createElement('div');
        container.className = 'floating-sheet-buttons';
        container.id = 'floatingSheetButtons';
        document.body.appendChild(container);

        updateFloatingSheetButtons();
    }

    function checkScroll() {
        const container = document.querySelector('.floating-sheet-buttons');
        if (!container) return;
        const scrollTop = contentWrapper.scrollTop;
        const scrollHeight = contentWrapper.scrollHeight;
        const clientHeight = contentWrapper.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return;
        const scrollPercentage = (scrollTop / maxScroll) * 100;
        if (scrollPercentage > 95) {
            container.classList.add('hidden');
        } else {
            container.classList.remove('hidden');
        }
    }

    if (sheetScrollListener) {
        contentWrapper.removeEventListener('scroll', sheetScrollListener);
    }
    sheetScrollListener = checkScroll;
    contentWrapper.addEventListener('scroll', sheetScrollListener);

    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 20);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeBottomSheet();
        }
    });

    const onTouchStart = (e) => {
        const target = e.target;
        const isInteractive = target.closest('.bottom-sheet-nav-arrow') || 
                            target.closest('a') || 
                            target.closest('.btn') ||
                            target.closest('.bottom-sheet-handle');
        if (isInteractive) {
            isDragging = false;
            return;
        }
        dragStartY = e.touches[0].clientY;
        isDragging = true;
        sheet.classList.add('dragging');
    };
    const onTouchMove = (e) => {
        if (!isDragging) return;
        if (contentWrapper.scrollTop > 0) {
            isDragging = false;
            sheet.classList.remove('dragging');
            return;
        }
        const deltaY = e.touches[0].clientY - dragStartY;
        if (deltaY > 0) {
            e.preventDefault();
            sheet.style.transform = `translateY(${deltaY}px)`;
        } else {
            isDragging = false;
            sheet.classList.remove('dragging');
        }
    };
    const onTouchEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        sheet.classList.remove('dragging');
        const deltaY = e.changedTouches[0].clientY - dragStartY;
        if (deltaY > 80) {
            closeBottomSheet();
        } else {
            sheet.style.transform = '';
        }
    };
    sheet.addEventListener('touchstart', onTouchStart, { passive: false });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: false });
    sheet.addEventListener('touchcancel', onTouchEnd, { passive: false });

    log('bottom_sheet_opened', false);
}

function closeBottomSheet() {
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }
    const overlay = document.querySelector('.bottom-sheet-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        const sheet = document.getElementById('hikeBottomSheet');
        if (sheet) {
            sheet.classList.remove('visible');
        }
        document.body.style.overflow = '';
        const sheetButtons = document.querySelector('.floating-sheet-buttons');
        if (sheetButtons) sheetButtons.remove();
        if (sheetScrollListener) {
            const contentWrapper = document.getElementById('bottomSheetContent');
            if (contentWrapper) contentWrapper.removeEventListener('scroll', sheetScrollListener);
            sheetScrollListener = null;
        }
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

// ----- Календарь -----
function renderCalendar(container) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

    let calendarHtml = `
        <h2 class="section-title">⚠️ раздел в разработке</h2>
        <div class="calendar-item">
            <div class="calendar-header">
                <h3>${monthNames[currentMonth]} ${currentYear}</h3>
            </div>
            <div class="weekdays">
                ${weekdays.map(d => `<span>${d}</span>`).join('')}
            </div>
            <div class="calendar-grid" id="calendarGrid">
    `;

    for (let i = 0; i < startOffset; i++) {
        calendarHtml += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = (day === currentDate);
        const hasHike = hikesData[dateStr] ? true : false;
        const isPast = new Date(dateStr) < new Date(currentYear, currentMonth, currentDate);
        
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (hasHike) {
            classes += ' hike-day';
            if (isPast) classes += ' past';
        }
        
        if (hasHike) {
            calendarHtml += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
        } else {
            calendarHtml += `<div class="${classes}">${day}</div>`;
        }
    }

    calendarHtml += `</div></div>`;

    container.innerHTML = calendarHtml;

    document.querySelectorAll('.calendar-day.hike-day').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            const index = hikesList.findIndex(h => h.date === date);
            if (index !== -1) {
                showBottomSheet(index);
            }
        });
    });
}

// ----- Обновление UI метрик -----
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

// ----- Настройка нижнего меню -----
function setupBottomNav() {
    const navHome = document.getElementById('navHome');
    const navHikes = document.getElementById('navHikes');
    const navMore = document.getElementById('navMore');
    const popup = document.getElementById('navPopup');
    const popupChat = document.getElementById('popupChat');
    const popupChannel = document.getElementById('popupChannel');
    const popupGift = document.getElementById('popupGift');

    if (!navHome || !navHikes || !navMore || !popup) return;

    const newNavHome = navHome.cloneNode(true);
    const newNavHikes = navHikes.cloneNode(true);
    const newNavMore = navMore.cloneNode(true);
    navHome.parentNode.replaceChild(newNavHome, navHome);
    navHikes.parentNode.replaceChild(newNavHikes, navHikes);
    navMore.parentNode.replaceChild(newNavMore, navMore);

    const navHomeNew = document.getElementById('navHome');
    const navHikesNew = document.getElementById('navHikes');
    const navMoreNew = document.getElementById('navMore');

    function scrollToCalendar() {
        setTimeout(() => {
            const calendarContainer = document.getElementById('calendarContainer');
            if (calendarContainer) {
                calendarContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }

    navHomeNew.addEventListener('click', () => {
        haptic();
        renderHome();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        log('nav_home_click');
        if (popup.classList.contains('show')) {
            popup.classList.remove('show');
        }
        isMenuActive = false;
    });

    navHikesNew.addEventListener('click', () => {
        haptic();
        renderHome();
        scrollToCalendar();
        log('nav_hikes_click');
        if (popup.classList.contains('show')) {
            popup.classList.remove('show');
        }
        isMenuActive = false;
    });

    navMoreNew.addEventListener('click', (e) => {
        e.stopPropagation();
        haptic();
        if (popup.classList.contains('show')) {
            popup.classList.remove('show');
            isMenuActive = false;
            updateActiveNav();
        } else {
            popup.classList.add('show');
            setActiveNav('navMore');
            isMenuActive = true;
        }
        log('nav_more_click');
    });

    popupChat.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        openLink('https://t.me/yaltahikingchat', 'popup_chat_click');
        popup.classList.remove('show');
        isMenuActive = false;
        updateActiveNav();
    });
    popupChannel.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        openLink('https://t.me/yaltahiking', 'popup_channel_click');
        popup.classList.remove('show');
        isMenuActive = false;
        updateActiveNav();
    });
    popupGift.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        renderGift(false);
        popup.classList.remove('show');
        isMenuActive = false;
        resetNavActive();
    });

    document.addEventListener('click', (e) => {
        if (popup.classList.contains('show') && !navMoreNew.contains(e.target) && !popup.contains(e.target)) {
            popup.classList.remove('show');
            isMenuActive = false;
            updateActiveNav();
        }
    });

    window.addEventListener('scroll', () => requestAnimationFrame(updateActiveNav));
    updateActiveNav();
}

function showBottomNav(show = true) {
    if (bottomNav) {
        if (show) {
            bottomNav.classList.remove('hidden');
        } else {
            bottomNav.classList.add('hidden');
        }
    }
}

// ----- Страница для новичков (FAQ) -----
function renderNewcomerPage(isGuest = false) {
    isPrivPage = true;
    isMenuActive = false;
    resetNavActive();

    subtitle.textContent = `всё, что нужно знать`;
    showBack(() => renderHome());
    haptic();
    log('newcomer_page_opened', isGuest);
    
    showBottomNav(!isGuest);

    let faqHtml = '';
    if (faq && faq.length) {
        faq.forEach(item => {
            let answer = item.a;
            answer = answer.replace(/\[@yaltahiking\]\(https:\/\/t\.me\/yaltahiking\)/g, '<a href="#" data-url="https://t.me/yaltahiking" data-guest="false" class="dynamic-link">@yaltahiking</a>');
            answer = answer.replace(/zapovedcrimea\.ru/g, '<a href="#" data-url="https://zapovedcrimea.ru/choose-pass" data-guest="false" class="dynamic-link">zapovedcrimea.ru</a>');
            faqHtml += `<div class="partner-item"><strong>${item.q}</strong><p>${answer}</p></div>`;
        });
    } else {
        faqHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    mainDiv.innerHTML = `
        <div class="card-container newcomer-page" style="margin-bottom: 0;">
            ${faqHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px; margin-bottom: 0;">
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'newcomer_support_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin:0 16px;">задать вопрос</a>
                <button id="goHomeStatic" class="btn btn-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;

    document.getElementById('goHomeStatic')?.addEventListener('click', () => {
        haptic();
        renderHome();
    });

    if (!isGuest) {
        setupBottomNav();
    }
}

// ----- Страница привилегий для владельцев карты -----
function renderPriv() {
    isPrivPage = true;
    isMenuActive = false;
    resetNavActive();

    subtitle.textContent = `🤘🏻твои привилегии, ${firstName}`;
    showBack(renderHome);
    showBottomNav(true);

    let clubHtml = '';
    if (privileges.club && privileges.club.length) {
        privileges.club.forEach(item => {
            let titleHtml = item.title;
            if (item.title.startsWith('новое:')) {
                titleHtml = `<span style="color: var(--yellow);">новое:</span> ${item.title.substring(6)}`;
            }
            clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) {
                clubHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            }
            clubHtml += `</div>`;
        });
    } else {
        clubHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    let cityHtml = '';
    if (privileges.city && privileges.city.length) {
        privileges.city.forEach(item => {
            cityHtml += `<div class="partner-item"><strong>${item.title}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) {
                cityHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            } else if (item.button_link) {
                let linkHtml = '';
                if (item.button_link.includes('[') && item.button_link.includes('](')) {
                    linkHtml = parseLinks(item.button_link, false);
                } else {
                    linkHtml = `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link">📍 ${item.button_link}</a>`;
                }
                cityHtml += `<p>📍 ${linkHtml}</p>`;
            }
            cityHtml += `</div>`;
        });
    } else {
        cityHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    mainDiv.innerHTML = `
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>${cityHtml}
        </div>
    `;

    setupBottomNav();
}

// ----- Страница привилегий для гостей -----
function renderGuestPriv() {
    isPrivPage = true;
    isMenuActive = false;
    resetNavActive();

    subtitle.textContent = `💳 привилегии с картой интеллигента`;
    showBack(renderHome);
    showBottomNav(true);

    let clubHtml = '';
    if (privileges.club && privileges.club.length) {
        privileges.club.forEach(item => {
            let titleHtml = item.title;
            if (item.title.startsWith('новое:')) {
                titleHtml = `<span style="color: var(--yellow);">новое:</span> ${item.title.substring(6)}`;
            }
            clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${item.description}</p></div>`;
        });
    } else {
        clubHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    let cityHtml = '';
    if (privileges.city && privileges.city.length) {
        privileges.city.forEach(item => {
            cityHtml += `<div class="partner-item"><strong>${item.title}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) {
                cityHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            } else if (item.button_link) {
                let linkHtml = '';
                if (item.button_link.includes('[') && item.button_link.includes('](')) {
                    linkHtml = parseLinks(item.button_link, false);
                } else {
                    linkHtml = `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link">📍 ${item.button_link}</a>`;
                }
                cityHtml += `<p>📍 ${linkHtml}</p>`;
            }
            cityHtml += `</div>`;
        });
    } else {
        cityHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    mainDiv.innerHTML = `
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>${cityHtml}
        </div>
    `;

    setupBottomNav();
}

// ----- Страница подарка -----
function renderGift(isGuest = false) {
    isPrivPage = true;
    isMenuActive = false;
    resetNavActive();

    subtitle.textContent = `подари новый опыт`;
    showBack(renderHome);
    showBottomNav(!isGuest);

    const giftText = giftContent || 'Информация о подарке временно недоступна.';

    mainDiv.innerHTML = `
        <div class="card-container">
            <div class="partner-item">
                <strong>как подарить карту интеллигента</strong>
                <p style="white-space: pre-line;">${giftText}</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                <a href="https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g" onclick="event.preventDefault(); openLink(this.href, 'gift_purchase_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin:0 16px;">купить в подарок</a>
            </div>
        </div>
    `;

    if (!isGuest) {
        setupBottomNav();
    }
}

// ----- Попап для гостей -----
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
            <div style="text-align: center; margin-top: 20px;">
                <a href="https://t.me/yaltahiking/197" onclick="event.preventDefault(); openLink(this.href, 'popup_learn_click', true); return false;" class="btn btn-yellow" id="popupLearnBtn">узнать о карте подробнее</a>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('closePopup')?.addEventListener('click', () => {
        haptic();
        overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            haptic();
            overlay.remove();
        }
    });
    log('guest_popup_opened', true);
}

// ----- Главная для гостей -----
function renderGuestHome() {
    const isGuest = true;
    subtitle.textContent = `💳 здесь будет твоя карта, ${firstName}`;
    subtitle.classList.add('subtitle-guest');
    showBottomNav(false);

    mainDiv.innerHTML = `
        <div class="card-container">
            <img src="https://i.postimg.cc/J0GyF5Nw/fwvsvfw.png" alt="карта заглушка" class="card-image" id="guestCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">?</span></div>
            <a href="https://t.me/yaltahiking/197" onclick="event.preventDefault(); openLink(this.href, 'buy_card_click', true); return false;" class="btn btn-yellow" id="buyBtn">узнать о карте</a>
            <div id="navAccordionGuest">
                <button class="accordion-btn">
                    навигация по клубу <span class="arrow">👀</span>
                </button>
                <div class="dropdown-menu">
                    <a href="https://t.me/yaltahiking/149" onclick="event.preventDefault(); openLink(this.href, 'nav_about', true); return false;" class="btn btn-outline">о клубе</a>
                    <a href="https://t.me/yaltahiking/170" onclick="event.preventDefault(); openLink(this.href, 'nav_philosophy', true); return false;" class="btn btn-outline">философия</a>
                    <a href="https://t.me/yaltahiking/246" onclick="event.preventDefault(); openLink(this.href, 'nav_hiking', true); return false;" class="btn btn-outline">о хайкинге</a>
                    <a href="https://t.me/yaltahiking/a/2" onclick="event.preventDefault(); openLink(this.href, 'nav_reviews', true); return false;" class="btn btn-outline">отзывы</a>
                </div>
            </div>
        </div>

        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest">
                <span class="newcomer-text">как всё устроено</span>
                <img src="https://i.postimg.cc/k533cR9Z/fv.png" alt="новичкам" class="newcomer-image">
            </div>
        </div>
        
        <div class="card-container">
            <div class="metrics-header">
                <h2 class="metrics-title">🌍 клуб в цифрах</h2>
                <a href="https://t.me/yaltahiking/148" onclick="event.preventDefault(); openLink(this.href, 'reports_click', true); return false;" class="metrics-link">смотреть отчёты &gt;</a>
            </div>
            <div class="metrics-grid">
                <div class="metric-item">
                    <div class="metric-label">хайков</div>
                    <div class="metric-value" data-metric="hikes">${metrics.hikes}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">локаций</div>
                    <div class="metric-value" data-metric="locations">${metrics.locations}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">километров</div>
                    <div class="metric-value" data-metric="kilometers">${metrics.kilometers}</div>
                </div>
                <div class="metric-item">
                    <div class="metric-label">знакомств</div>
                    <div class="metric-value" data-metric="meetings">${metrics.meetings}</div>
                </div>
            </div>
        </div>
        
        <div class="extra-links">
            <a href="https://t.me/yaltahiking" onclick="event.preventDefault(); openLink(this.href, 'channel_click', true); return false;" class="btn btn-outline">📰 открыть канал</a>
            <a href="https://t.me/yaltahikingchat" onclick="event.preventDefault(); openLink(this.href, 'chat_click', true); return false;" class="btn btn-outline">💬 открыть чат</a>
            <a href="#" class="btn btn-outline" id="giftBtn">🫂 подарить карту другу</a>
        </div>
    `;

    document.getElementById('guestCardImage')?.addEventListener('click', () => {
        haptic();
        showGuestPopup();
    });
    document.getElementById('buyBtn')?.addEventListener('click', () => { haptic(); log('buy_card_click', true); });
    document.getElementById('giftBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        log('gift_click', true);
        renderGift(true);
    });
    document.getElementById('newcomerBtnGuest')?.addEventListener('click', () => {
        haptic();
        log('newcomer_btn_click', true);
        renderNewcomerPage(true);
    });

    setupAccordion('navAccordionGuest', true);
}

// ----- Главная для владельцев карты -----
function renderHome() {
    isPrivPage = false;
    isMenuActive = false;

    if (window._floatingScrollHandler) {
        window.removeEventListener('scroll', window._floatingScrollHandler);
        window._floatingScrollHandler = null;
    }

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
                
                <div id="navAccordionOwner">
                    <button class="accordion-btn">
                        навигация по клубу <span class="arrow">👀</span>
                    </button>
                    <div class="dropdown-menu">
                        <a href="https://t.me/yaltahiking/149" onclick="event.preventDefault(); openLink(this.href, 'nav_about', false); return false;" class="btn btn-outline">о клубе</a>
                        <a href="https://t.me/yaltahiking/170" onclick="event.preventDefault(); openLink(this.href, 'nav_philosophy', false); return false;" class="btn btn-outline">философия</a>
                        <a href="https://t.me/yaltahiking/246" onclick="event.preventDefault(); openLink(this.href, 'nav_hiking', false); return false;" class="btn btn-outline">о хайкинге</a>
                        <a href="https://t.me/yaltahiking/a/2" onclick="event.preventDefault(); openLink(this.href, 'nav_reviews', false); return false;" class="btn btn-outline">отзывы</a>
                    </div>
                </div>
            </div>

            <div class="card-container">
                <h2 class="section-title">🫖 для новичков</h2>
                <div class="btn-newcomer" id="newcomerBtn">
                    <span class="newcomer-text">как всё устроено</span>
                    <img src="https://i.postimg.cc/k533cR9Z/fv.png" alt="новичкам" class="newcomer-image">
                </div>
            </div>
            
            <div class="card-container">
                <div class="metrics-header">
                    <h2 class="metrics-title">🌍 клуб в цифрах</h2>
                    <a href="https://t.me/yaltahiking/148" onclick="event.preventDefault(); openLink(this.href, 'reports_click', false); return false;" class="metrics-link">смотреть отчёты &gt;</a>
                </div>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-label">хайков</div>
                        <div class="metric-value" data-metric="hikes">${metrics.hikes}</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">локаций</div>
                        <div class="metric-value" data-metric="locations">${metrics.locations}</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">километров</div>
                        <div class="metric-value" data-metric="kilometers">${metrics.kilometers}</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">знакомств</div>
                        <div class="metric-value" data-metric="meetings">${metrics.meetings}</div>
                    </div>
                </div>
            </div>

            <div class="card-container" id="calendarContainer"></div>
        `;

        document.getElementById('ownerCardImage')?.addEventListener('click', () => {
            haptic();
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            showConfetti();
            log('card_click_celebration');
        });

        document.getElementById('privBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            log('privilege_click');
            renderPriv();
        });
        
        document.getElementById('supportBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            openLink('https://t.me/hellointelligent', 'support_click', false);
        });

        document.getElementById('newcomerBtn')?.addEventListener('click', () => {
            haptic();
            log('newcomer_btn_click', false);
            renderNewcomerPage(false);
        });

        setupAccordion('navAccordionOwner', false);

        const calendarContainer = document.getElementById('calendarContainer');
        if (calendarContainer) {
            renderCalendar(calendarContainer);
        }

        setupBottomNav();

    } else {
        renderGuestHome();
    }
}

function buyCard() {
    haptic();
    if (!userId) return;
    log('buy_card_click', true);
    openLink('https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g', null, true);
}

window.addEventListener('load', loadData);
