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
                description: data.description || 'Описание появится позже.',
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

// Сохранение статусов в localStorage
function saveStatusToLocalStorage() {
    if (!userId) return;
    const key = `bookingStatus_${userId}`;
    localStorage.setItem(key, JSON.stringify(hikeBookingStatus));
}

// Загрузка статусов из localStorage
function loadStatusFromLocalStorage() {
    if (!userId) return false;
    const key = `bookingStatus_${userId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Проверяем, что parsed - объект с ключами-числами
            if (typeof parsed === 'object' && parsed !== null) {
                hikeBookingStatus = parsed;
                return true;
            }
        } catch (e) {
            console.error('Ошибка парсинга localStorage', e);
        }
    }
    return false;
}

async function loadUserRegistrations() {
    if (!userId || !REGISTRATION_API_URL || hikesList.length === 0) return;
    try {
        const url = `${REGISTRATION_API_URL}?action=get&user_id=${userId}&_=${Date.now()}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data && Array.isArray(data.registrations)) {
            // Сбрасываем статусы
            for (let i = 0; i < hikesList.length; i++) {
                hikeBookingStatus[i] = false;
            }
            // Устанавливаем статусы из данных
            data.registrations.forEach(reg => {
                const index = hikesList.findIndex(h => h.date === reg.hikeDate);
                if (index !== -1 && reg.status === 'booked') {
                    hikeBookingStatus[index] = true;
                }
            });
            // Сохраняем в localStorage
            saveStatusToLocalStorage();
        } else {
            console.warn('Неверный ответ от API регистраций:', data);
        }
    } catch (e) {
        console.error('Ошибка загрузки регистраций:', e);
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
        })
            .then(res => res.json())
            .then(result => {
                if (result.status !== 'ok') {
                    console.error('Ошибка обновления статуса:', result);
                }
            })
            .catch(e => console.error('Ошибка отправки запроса:', e));
    } catch (e) {
        console.error('Ошибка в updateRegistration:', e);
    }
}

async function loadData() {
    await Promise.allSettled([loadUserData(), loadMetrics(), loadHikes()]);
    if (userId && hikesList.length > 0) {
        // Сначала пробуем загрузить из localStorage
        const loaded = loadStatusFromLocalStorage();
        // Затем обновляем с сервера (и перезаписываем localStorage)
        await loadUserRegistrations();
        // Если из localStorage ничего не загрузилось, то статусы уже обновлены сервером
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

// ----- Массив партнёров (полный) -----
const partners = [ /* ... */ ]; // (здесь нужно вставить полный массив, но для краткости опущен, в реальном коде он есть)

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

// ----- Bottom Sheet -----
let sheetCurrentIndex = 0;
let sheetScrollListener = null;
let dragStartY = 0;
let isDragging = false;

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
                ${hike.image ? `<img src="${hike.image}" class="bottom-sheet-image" onerror="this.style.display='none'">` : ''}
                <div class="bottom-sheet-description">${hike.description.replace(/\n/g, '<br>')}</div>
            </div>
        `;

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
                // Мгновенно обновляем локальный статус
                hikeBookingStatus[sheetCurrentIndex] = false;
                saveStatusToLocalStorage(); // сохраняем в localStorage
                updateFloatingSheetButtons();
                // Отправляем на сервер в фоне
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
                // Мгновенно обновляем локальный статус
                hikeBookingStatus[sheetCurrentIndex] = true;
                saveStatusToLocalStorage(); // сохраняем в localStorage
                updateFloatingSheetButtons();
                // Отправляем на сервер в фоне
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

    // Умный свайп вниз
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

// ----- Обновление UI метрик с использованием data-атрибутов -----
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

// ----- Остальные страницы (renderNewcomerPage, renderPriv и т.д.) без изменений -----
// ... (здесь должны быть все остальные функции, но для краткости они не включены, в реальном коде они есть)

window.addEventListener('load', loadData);
