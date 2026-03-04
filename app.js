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
const METRICS_TTL = 0; // всегда свежие

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = { status: 'loading', hikes: 0, cardUrl: '' };
let metrics = { hikes: '19', kilometers: '150+', locations: '13', meetings: '130+' };
let hikesData = {};
let hikesList = [];
let hikeBookingStatus = {}; // ключ: индекс в hikesList, значение: boolean (true - забронировано)

const mainDiv = document.getElementById('mainContent');
const subtitle = document.getElementById('subtitle');
const bottomNav = document.getElementById('bottomNav');
const navPopup = document.getElementById('navPopup');

// Флаги состояния интерфейса
let isPrivPage = false;      // находимся ли на странице привилегий или новичков
let isMenuActive = false;    // открыто ли меню (кнопка «меню» активна)

// ---------- Вспомогательные функции для навигации ----------
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

// ---------- Логирование и загрузка данных ----------
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

async function loadMetrics() {
    try {
        const text = await fetchWithoutCache(METRICS_CSV_URL);
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error('Нет данных метрик');
        const headers = parseCSVLine(lines[0]);
        const dataRow = parseCSVLine(lines[1]);
        const data = {};
        headers.forEach((key, idx) => {
            data[key] = dataRow[idx] || '';
        });
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

            let data = {};
            headers.forEach((key, idx) => {
                data[key] = row[idx] || '';
            });

            const date = data.date;
            if (!date) continue;

            let tags = [];
            if (data.tags) {
                let tagsStr = data.tags;
                if (tagsStr.startsWith('"') && tagsStr.endsWith('"')) {
                    tagsStr = tagsStr.slice(1, -1);
                }
                tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
            }

            hikesData[date] = {
                title: data.title || 'Хайк',
                features: data.features || data.description || '',
                access: data.access || '',
                details: data.details || '',
                image: data.image_url || '',
                date: date,
                tags: tags
            };
        }
        hikesList = Object.values(hikesData).sort((a, b) => a.date.localeCompare(b.date));
        for (let i = 0; i < hikesList.length; i++) {
            hikeBookingStatus[i] = false;
        }
    } catch (e) {
        console.error('Ошибка загрузки расписания хайков:', e);
    }
}

async function loadUserRegistrations() {
    if (!userId || !REGISTRATION_API_URL || hikesList.length === 0) return;
    try {
        const url = `${REGISTRATION_API_URL}?action=get&user_id=${userId}&_=${Date.now()}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data && Array.isArray(data.registrations)) {
            const savedStatus = localStorage.getItem('hikeBookingStatus');
            if (savedStatus) {
                try {
                    const parsed = JSON.parse(savedStatus);
                    for (let i = 0; i < hikesList.length; i++) {
                        const hike = hikesList[i];
                        if (parsed[hike.date] !== undefined) {
                            hikeBookingStatus[i] = parsed[hike.date];
                        } else {
                            hikeBookingStatus[i] = false;
                        }
                    }
                } catch (e) {}
            } else {
                for (let i = 0; i < hikesList.length; i++) {
                    hikeBookingStatus[i] = false;
                }
            }
            data.registrations.forEach(reg => {
                const index = hikesList.findIndex(h => h.date === reg.hikeDate);
                if (index !== -1 && reg.status === 'booked') {
                    hikeBookingStatus[index] = true;
                }
            });
            saveStatusToLocalStorage();
        }
    } catch (e) {
        console.error('Ошибка загрузки регистраций:', e);
    }
}

function saveStatusToLocalStorage() {
    if (!hikesList.length) return;
    const statusObj = {};
    hikesList.forEach((hike, index) => {
        statusObj[hike.date] = hikeBookingStatus[index] || false;
    });
    localStorage.setItem('hikeBookingStatus', JSON.stringify(statusObj));
}

async function fetchParticipantsCount(hikeDate) {
    if (!REGISTRATION_API_URL) return 0;
    try {
        const url = `${REGISTRATION_API_URL}?action=count&hike_date=${encodeURIComponent(hikeDate)}&_=${Date.now()}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.status === 'ok' && typeof data.count === 'number') {
            return data.count;
        } else {
            console.warn('Ошибка получения количества участников:', data);
            return 0;
        }
    } catch (e) {
        console.error('Ошибка запроса количества участников:', e);
        return 0;
    }
}

function updateRegistration(hikeDate, hikeTitle, status) {
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
        }).catch(e => console.error('Ошибка отправки запроса:', e));
    } catch (e) {
        console.error('Ошибка в updateRegistration:', e);
    }
}

async function loadData() {
    await Promise.allSettled([loadUserData(), loadMetrics(), loadHikes()]);
    if (userId && hikesList.length > 0) {
        await loadUserRegistrations();
    }
    log('visit', userCard.status !== 'active');
    renderHome();
    const loader = document.getElementById('initial-loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 300);
    }
}

// ----- Массив партнёров -----
const partners = [
    {
        name: 'экипировочный центр Геккон',
        privilege: '-10% по карте интеллигента',
        location: 'Ялта, ул. Московская 8А',
        link: 'https://yandex.ru/maps/org/gekkon/1189230227?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'технологичная хайкинг-одежда Nothomme',
        privilege: '-7% по промокоду INTELLIGENT на сайте',
        location: 'телеграм канал: t.me/nothomme_russia',
        link: 'https://t.me/nothomme_russia'
    },
    {
        name: 'кофейня Возможно всё',
        privilege: '-5% по карте интеллигента',
        location: 'г. Ялта, ул. Свердлова, 13/2',
        link: 'https://yandex.ru/maps/org/vozmozhno_vsyo/154873148683?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'косметика и парфюмерия на утро : на вечер',
        privilege: '+1000 бонусов по карте интеллигента',
        location: 'г. Ялта, ул. Морская 3А',
        link: 'https://yandex.ru/maps/org/na_utro_na_vecher_kosmetika_i_parfyumeriya/218833808391?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'конный клуб Красный конь',
        privilege: '-5% по карте интеллигента',
        location: 'г. Алупка, Севастопольское шоссе',
        link: 'https://yandex.ru/maps/org/krasny_kon/244068367955?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'маникюрный салон Marvel studio',
        privilege: '-5% по карте интеллигента',
        location: 'г. Ялта, ул. Руданского 4',
        link: 'https://yandex.ru/maps/org/marvel/39545501679?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'тематическое кафе Vinyl',
        privilege: '-10% по карте интеллигента',
        location: 'г. Ялта, пер. Черноморский 1А',
        link: 'https://yandex.ru/maps/org/vinyl/117631638288?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'барбершоп Скала',
        privilege: '-5% на второе посещение и далее',
        location: 'г. Ялта, ул. Свердлова 3',
        link: 'https://yandex.ru/maps/org/skala/20728278796?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'кофейня Deep Black',
        privilege: '-5% по карте интеллигента',
        location: 'п. г. т. Гаспра, Алупкинское ш., 5А',
        link: 'https://yandex.ru/maps/org/deep_black/13540102561?si=xvnyyrd9reydm8tbq186v5f82w'
    }
];

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

// ----- Функция для замены ссылок в тексте -----
function parseLinks(text, isGuest) {
    if (!text) return '';
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, linkText, url) {
        const safeUrl = JSON.stringify(url);
        return `<a href="#" onclick="openLink(${safeUrl}, 'hike_section_link', ${isGuest}); return false;">${linkText}</a>`;
    });
}

// ----- Bottom Sheet с секциями и счётчиком -----
let sheetCurrentIndex = 0;
let sheetScrollListener = null;
let dragStartY = 0;
let isDragging = false;
let currentParticipantsCount = 0; // текущее количество для отображения

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

    async function loadParticipantCount() {
        const hike = hikesList[sheetCurrentIndex];
        if (!hike) return;
        const count = await fetchParticipantsCount(hike.date);
        currentParticipantsCount = count;
        updateParticipantCounter();
    }

    function updateParticipantCounter() {
        const counterEl = document.getElementById('participantCounter');
        if (counterEl) {
            counterEl.textContent = `уже идут: ${currentParticipantsCount}`;
        }
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

        // Формируем секции
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

        // Изображение с контейнером для счётчика (начальное значение 0)
        const imageHtml = hike.image ? `
            <div class="image-container">
                <img src="${hike.image}" class="bottom-sheet-image" onerror="this.style.display='none'">
                <div class="participant-counter" id="participantCounter">уже идут: 0</div>
            </div>
        ` : '';

        contentWrapper.innerHTML = `
            <div class="bottom-sheet-header-block">
                <div class="bottom-sheet-header">
                    <div class="bottom-sheet-header-left">
                        <div class="bottom-sheet-header-date">${formattedDate}</div>
                        <div class="bottom-sheet-header-title">${hike.title}</div>
                    </div>
                    <div class="bottom-sheet-nav">
                        <div class="bottom-sheet-nav-arrow ${!hasPrev ? 'hidden' : ''}" id="prevHike">←</div>
                        <div class="bottom-sheet-nav-arrow ${!hasNext ? 'hidden' : ''}" id="nextHike">→</div>
                    </div>
                </div>
                ${tagsHtml}
            </div>
            <div>
                ${imageHtml}
                ${sectionsHtml}
            </div>
        `;

        // Устанавливаем обработчики для переключения хайков
        document.getElementById('prevHike')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (sheetCurrentIndex > 0) {
                sheetCurrentIndex--;
                currentParticipantsCount = 0;
                updateContent();
                // Сначала обновляем кнопки (с новым индексом, но счетчик 0)
                updateFloatingSheetButtons();
                // Затем загружаем реальный счетчик и обновляем его
                await loadParticipantCount();
                updateParticipantCounter();
                contentWrapper.scrollTop = 0;
                haptic();
                log('hike_swipe_prev', false);
            }
        });

        document.getElementById('nextHike')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (sheetCurrentIndex < hikesList.length - 1) {
                sheetCurrentIndex++;
                currentParticipantsCount = 0;
                updateContent();
                updateFloatingSheetButtons();
                await loadParticipantCount();
                updateParticipantCounter();
                contentWrapper.scrollTop = 0;
                haptic();
                log('hike_swipe_next', false);
            }
        });
    }

    // Первый рендер: сразу показываем контент со счётчиком 0, затем загружаем реальный счётчик
    updateContent();
    // Создаём кнопки (они используют текущий индекс)
    createFloatingButtons();
    loadParticipantCount().then(() => {
        updateParticipantCounter();
    });

    function removeFloatingSheetButtons() {
        const btnContainer = document.querySelector('.floating-sheet-buttons');
        if (btnContainer) btnContainer.remove();
    }

    function updateFloatingSheetButtons() {
        const container = document.querySelector('.floating-sheet-buttons');
        if (!container) return;

        const hike = hikesList[sheetCurrentIndex];
        if (!hike) return;

        const isBooked = hikeBookingStatus[sheetCurrentIndex];
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

        if (isBooked) {
            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-green';
            goBtn.id = 'sheetGoBtn';
            goBtn.textContent = 'ты записан';
            container.appendChild(goBtn);

            const cancelBtn = document.createElement('a');
            cancelBtn.href = '#';
            cancelBtn.className = 'btn btn-outline';
            cancelBtn.id = 'sheetCancelBtn';
            cancelBtn.textContent = 'отменить';
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                haptic();
                // Обновляем локальный статус
                hikeBookingStatus[sheetCurrentIndex] = false;
                saveStatusToLocalStorage();
                // Уменьшаем счётчик локально
                if (currentParticipantsCount > 0) {
                    currentParticipantsCount--;
                    updateParticipantCounter();
                }
                // Обновляем кнопки
                updateFloatingSheetButtons();
                // Отправляем на сервер
                updateRegistration(hike.date, hike.title, 'cancelled');
                log('sheet_cancel_click', false);
            });
            container.appendChild(cancelBtn);
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
                haptic();
                // Обновляем локальный статус
                hikeBookingStatus[sheetCurrentIndex] = true;
                saveStatusToLocalStorage();
                // Увеличиваем счётчик локально
                currentParticipantsCount++;
                updateParticipantCounter();
                // Обновляем кнопки
                updateFloatingSheetButtons();
                // Отправляем на сервер
                updateRegistration(hike.date, hike.title, 'booked');
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

    createFloatingButtons();

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

    const faq = [
        {
            q: '⛰️ что такое хайкинг?',
            a: 'хайкинг – это прогулки. но не по улицам бетонного города, а по манящим свежестью просторам природы. не уставившись себе под ноги, а подняв голову созерцая богатство твоей планеты. без преодоления себя. без палаток и ночёвок. 3-5 часов лёгкого и среднего уровня ходьбы по обустроенным тропам и видовым местам. да ещё и в компании таких же интеллигентов, как и ты'
        },
        {
            q: '🥾 чем вы отличаетесь от обычных походов?',
            a: 'мы здесь не про походы. не про туризм. не про экскурсии. мы про активную позицию в жизни, про здоровый отдых, про новые знакомства и дружбу, про эмоции и впечатления. 80% наших хайков – люди и общение, 20% – природа как идеальный контекст'
        },
        {
            q: '📋 как попасть на хайк?',
            a: '1. подпишись на канал [@yaltahiking](https://t.me/yaltahiking).  \n2. следи за анонсами актуальных маршрутов (выходят в середине недели).  \n3. ставь «голос» в комментариях к анонсу, если точно пойдёшь.  \n4. оформи билет (ссылка в анонсе) – 1500₽, если у тебя ещё нет карты интеллигента.  \n5. до встречи на точке сбора (координаты и время – в анонсе)'
        },
        {
            q: '💵 сколько стоит участие?',
            a: 'билет на хайк стоит 1500 ₽. если у тебя есть карта интеллигента – хайки бесплатны, плюс привилегии в городе и приоритетный запрос на мастермайнд. карта стоит 7500₽ и окупается уже на шестой хайк'
        },
        {
            q: '🎒 что брать с собой?',
            a: 'кроссовки с цепкой подошвой + дышащие носки + влагоотводящая футболка = база комфортного хайка. также захвати: чистую воду, перекус в виде быстрых углеводов; защиту от солнца: панаму или кепку, санскрин; на всякий нанеси защиту от клещей; ну, и небольшой удобный рюкзак или поясную сумку. в прохладное время: термокофта + флис + ветровка, штаны из нейлона, непромокаемая обувь'
        },
        {
            q: '🧠 что такое мастермайнд?',
            a: 'это формат коллективного мышления, которым уже больше сотни лет пользуются президенты, предприниматели и главные инноваторы планеты. на хайках мы собираемся на вершине, где каждый может поделиться своим запросом во время сессии – получить свежий взгляд, поддержку, идеи и полезные контакты от десятка людей, идущих рядом. у тебя появляются союзники, для которых твой запрос так же ценен, как их собственный'
        },
        {
            q: '💳 что даёт карта интеллигента?',
            a: '– бесплатные хайки  \n– привилегии и скидки у партнёров  \n– приоритетный запрос на мастермайнд  \n– один гостевой хайк для друга (ему билет не нужен)  \n– эксклюзивные маршруты для владельцев карт  \n– концентрат мастермайнда: структурированный документ с записью сессии и ключевыми тезисами  \n– наш собственный из «трёх букв» сервер, для обхода любых блокировок в интернете'
        },
        {
            q: '🙌🏻 нужна ли специальная подготовка?',
            a: 'нет. мы ходим по тропам лёгкого и среднего уровня. никакого преодоления себя – только отдых и удовольствие. «без подготовки. без экипировки. просто жди когда анонсируем интересный маршрут, приезжай вовремя на точку и пошли вместе наслаждаться лучшей жизнью».'
        },
        {
            q: '🛡️ как обеспечивается безопасность?',
            a: 'каждый маршрут мы тщательно продумываем и предварительно ходим на разведку. на маршруте есть опытный гид, базовая аптечка, фонарики, иногда берём для всех дождевики. если погода совсем нелётная – переносим хайк'
        },
        {
            q: '⭐ зачем звёзды в чате?',
            a: 'одна звезда – один пройденный с нами маршрут. когда набираешь три звезды, у тебя появляется доступ в наш закрытый чат для более близкого общения и неформальных встреч'
        },
        {
            q: '🍷 можно ли с алкоголем?',
            a: 'на маршруте мы обходимся без алкоголя, но порой заходим всей компанией в Капри на набережной, а там – любые удовольствия'
        },
        {
            q: '🎟️ нужен ли пропуск в заповедник?',
            a: 'если маршрут проходит по заповеднику и у тебя прописка не в Ялте/Севастополе, нужно оформить туристический пропуск на сайте zapovedcrimea.ru (занимает 2 минуты). если местный – пропуск местного жителя. не забудь паспорт – покажешь лесникам. есть маршруты, где пропуск не нужен, это указываем в анонсе'
        },
        {
            q: '📞 как задать вопрос, если не нашёл ответа?',
            a: 'нажимай кнопку внизу, отвечаем на любой вопрос о клубе и хайках в течение нескольких минут'
        }
    ];

    let faqHtml = '';
    faq.forEach(item => {
        let answer = item.a;
        answer = answer.replace(/\[@yaltahiking\]\(https:\/\/t\.me\/yaltahiking\)/g, '<a href="#" onclick="openLink(\'https://t.me/yaltahiking\', \'faq_channel_click\', false); return false;">@yaltahiking</a>');
        answer = answer.replace(/zapovedcrimea\.ru/g, '<a href="#" onclick="openLink(\'https://zapovedcrimea.ru/choose-pass\', \'faq_pass_click\', false); return false;">zapovedcrimea.ru</a>');
        answer = answer.replace(/\n/g, '<br>');
        faqHtml += `<div class="partner-item"><strong>${item.q}</strong><p>${answer}</p></div>`;
    });

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

    let club = [
        { 
            t: 'бесплатные хайки', 
            d: 'уже на шестой хайк твоя карта окупится и позволит ходить на хайки бесплатно. пока существует клуб или пока не прилетит метеорит' 
        },
        { 
            t: 'плюс один', 
            d: 'на каждый хайк ты можешь брать с собой одного нового друга, который ещё с нами не был. всё, что ему нужно – поставить голос в регистрации и оформить пропуск в заповедник. билет покупать не нужно' 
        },
        { 
            t: 'эксклюзивные маршруты', 
            d: 'ты можешь ходить по закрытым для большинства туристов локациям с нашим сертифицированным гидом' 
        },
        { 
            t: 'запрос на мастермайнд', 
            d: 'ты можешь заранее перед хайком забронировать запрос на мастермайнд, чтобы на хайке гарантировано участники поделились с тобой своим взглядом, опытом, ценными контактами',
            btn: 'забронировать запрос'
        },
        { 
            t: 'новое: обход блокировок', 
            d: 'с картой интеллигента тебе доступно приложение из трёх букв, которое помогает сделать интернет свободным и пользоваться телеграмом, как будто не было никаких блокировок',
            btn: 'получить настройки'
        }
    ];

    let clubHtml = '';
    club.forEach(c => {
        let titleHtml = c.t;
        if (c.t.startsWith('новое:')) {
            titleHtml = `<span style="color: var(--yellow);">новое:</span> ${c.t.substring(6)}`;
        }
        clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${c.d}</p>${c.btn ? `<a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'support_click', false); return false;" class="btn btn-yellow" style="margin-top:12px;">${c.btn}</a>` : ''}</div>`;
    });

    let cityHtml = '';
    partners.forEach(p => {
        cityHtml += `<div class="partner-item">
            <strong>${p.name}</strong>
            <p>${p.privilege}</p>`;
        
        if (p.name === 'технологичная хайкинг-одежда Nothomme') {
            cityHtml += `<a href="${p.link}" target="_blank" class="btn btn-yellow" style="margin-top:12px;">в магазин</a>`;
        } else {
            cityHtml += `<p>📍 <a href="${p.link}" target="_blank" style="color:#D9FD19;">${p.location}</a></p>`;
        }
        
        cityHtml += `</div>`;
    });

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

    let club = [
        { 
            t: 'бесплатные хайки', 
            d: 'уже на шестой хайк твоя карта окупится и позволит ходить на хайки бесплатно. пока существует клуб или пока не прилетит метеорит' 
        },
        { 
            t: 'плюс один', 
            d: 'на каждый хайк ты можешь брать с собой одного нового друга, который ещё с нами не был. всё, что ему нужно – поставить голос в регистрации и оформить пропуск в заповедник. билет покупать не нужно' 
        },
        { 
            t: 'эксклюзивные маршруты', 
            d: 'ты можешь ходить по закрытым для большинства туристов локациям с нашим сертифицированным гидом' 
        },
        { 
            t: 'запрос на мастермайнд', 
            d: 'ты можешь заранее перед хайком забронировать запрос на мастермайнд, чтобы на хайке гарантировано участники поделились с тобой своим взглядом, опытом, ценными контактами' 
        },
        { 
            t: 'новое: обход блокировок', 
            d: 'с картой интеллигента тебе доступно приложение из трёх букв, которое помогает сделать интернет свободным и пользоваться телеграмом, как будто не было никаких блокировок' 
        }
    ];

    let clubHtml = '';
    club.forEach(c => {
        let titleHtml = c.t;
        if (c.t.startsWith('новое:')) {
            titleHtml = `<span style="color: var(--yellow);">новое:</span> ${c.t.substring(6)}`;
        }
        clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${c.d}</p></div>`;
    });

    const partnersGuest = partners.map(p => {
        if (p.name === 'технологичная хайкинг-одежда Nothomme') {
            return { ...p, privilege: '-7% по промокоду на сайте' };
        }
        return p;
    });

    let cityHtml = '';
    partnersGuest.forEach(p => {
        cityHtml += `<div class="partner-item">
            <strong>${p.name}</strong>
            <p>${p.privilege}</p>
            <p>📍 <a href="${p.link}" target="_blank" style="color:#D9FD19;">${p.location}</a></p>
        </div>`;
    });

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

    mainDiv.innerHTML = `
        <div class="card-container">
            <div class="partner-item">
                <strong>как подарить карту интеллигента</strong>
                <p style="white-space: pre-line;">
хочешь подарить карту другу? тогда пришли нам в поддержку имя друга, его фамилию, @username в телеграм и твой чек об оплате карты (приходит на почту после покупки). мы выпустим карту на имя друга.

если хочешь подарить ему карту сам – напиши «отправлю карту сам». если хочешь, чтобы её прислали мы, но сказали, что от тебя, напиши «подарите вы».

как только друг получит карту, у него станет активным наше приложение и он сможет им пользоваться.
                </p>
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

    loadMetrics().then(() => updateMetricsUI());

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
        loadMetrics().then(() => updateMetricsUI());
    }
}

function buyCard() {
    haptic();
    if (!userId) return;
    log('buy_card_click', true);
    openLink('https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g', null, true);
}

window.addEventListener('load', loadData);
