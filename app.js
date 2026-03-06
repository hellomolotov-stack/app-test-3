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
            .sort((a, b) => b.timestamp - a.timestamp) // новые -> старые
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
                    <path d="M15 7 L9
