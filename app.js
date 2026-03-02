// Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();

// Функция тактильного отклика
function haptic() {
    tg.HapticFeedback?.impactOccurred('light');
}
window.haptic = haptic;

// Универсальная функция открытия ссылок
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

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = { status: 'loading', hikes: 0, cardUrl: '' };
let metrics = { hikes: '19', kilometers: '150+', locations: '13', meetings: '130+' };
let hikesData = {};
let hikesList = [];

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

// Улучшенный парсинг строки CSV
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

// Загрузка данных пользователя
async function loadUserData() {
    if (!userId) {
        userCard.status = 'inactive';
        return;
    }
    try {
        const resp = await fetch(`${CSV_URL}&t=${Date.now()}`);
        const text = await resp.text();
        const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.trim()));
        if (rows.length < 2) throw new Error('Нет данных');
        const headers = rows[0];
        for (let row of rows.slice(1)) {
            if (row[0] === String(userId)) {
                let data = {};
                headers.forEach((k, i) => data[k] = row[i]);
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

// Загрузка метрик
async function loadMetrics() {
    try {
        const resp = await fetch(`${METRICS_CSV_URL}&t=${Date.now()}`, { cache: 'no-cache' });
        const text = await resp.text();
        const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.trim()));
        if (rows.length < 2) throw new Error('Нет данных метрик');
        const headers = rows[0];
        const dataRow = rows[1];
        const data = {};
        headers.forEach((k, i) => data[k] = dataRow[i]);
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

// Загрузка расписания хайков (с исправленным парсингом)
async function loadHikes() {
    try {
        const resp = await fetch(`${HIKES_CSV_URL}&t=${Date.now()}`, { cache: 'no-cache' });
        const text = await resp.text();
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
                description: data.description || 'Описание появится позже',
                image: data.image_url || '',
                date: date,
                tags: tags
            };
        }
        hikesList = Object.values(hikesData).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) {
        console.error('Ошибка загрузки расписания хайков (некритично):', e);
    }
}

async function loadData() {
    await Promise.allSettled([loadUserData(), loadMetrics(), loadHikes()]);
    log('visit', userCard.status !== 'active');
    renderHome();
    const loader = document.getElementById('initial-loader');
    if (loader) loader.style.display = 'none';
}

// ----- Массив партнёров -----
const partners = [ /* ... */ ]; // полный массив (здесь не повторяем для краткости, он должен быть таким же, как в предыдущих версиях)

// ----- Аккордеон -----
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

// ----- Конфетти -----
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
function showBottomSheet(index) {
    if (!hikesList.length) return;

    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();

    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `
        <div class="bottom-sheet" id="hikeBottomSheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bottom-sheet-content-wrapper" id="bottomSheetContent">
                <!-- контент будет обновляться через JS -->
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const sheet = document.getElementById('hikeBottomSheet');
    const contentDiv = document.getElementById('bottomSheetContent');

    let currentIndex = index;
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let isInteractive = false;

    function updateContent() {
        const hike = hikesList[currentIndex];
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

        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < hikesList.length - 1;

        let tagsHtml = '';
        if (hike.tags && hike.tags.length > 0) {
            tagsHtml = '<div class="bottom-sheet-tags">';
            hike.tags.forEach(tag => {
                tagsHtml += `<span class="bottom-sheet-tag">${tag}</span>`;
            });
            tagsHtml += '</div>';
        }

        contentDiv.innerHTML = `
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
            ${hike.image ? `<img src="${hike.image}" class="bottom-sheet-image" onerror="this.style.display='none'">` : ''}
            <div class="bottom-sheet-description">${hike.description.replace(/\n/g, '<br>')}</div>
            <div class="bottom-sheet-buttons">
                <a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'hike_book_click', false); return false;" class="btn btn-yellow bottom-sheet-btn">забронировать место</a>
                <a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'hike_question_click', false); return false;" class="btn btn-white-outline bottom-sheet-btn">задать вопрос</a>
            </div>
        `;

        document.getElementById('prevHike')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                currentIndex--;
                updateContent();
                haptic();
                log('hike_swipe_prev', false);
            }
        });

        document.getElementById('nextHike')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentIndex < hikesList.length - 1) {
                currentIndex++;
                updateContent();
                haptic();
                log('hike_swipe_next', false);
            }
        });
    }

    updateContent();

    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 10);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeBottomSheet();
        }
    });

    const onTouchStart = (e) => {
        const target = e.target;
        const isInteractiveElement = target.closest('.bottom-sheet-nav-arrow') || target.closest('a') || target.closest('.btn') || target.closest('.bottom-sheet-handle');
        if (isInteractiveElement) {
            isInteractive = true;
            return;
        }
        isInteractive = false;
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        sheet.classList.add('dragging');
        e.preventDefault();
    };

    const onTouchMove = (e) => {
        if (isInteractive || !isDragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta > 0) {
            sheet.style.transform = `translateY(${delta}px)`;
        }
        e.preventDefault();
    };

    const onTouchEnd = (e) => {
        if (isInteractive) {
            isInteractive = false;
            return;
        }
        if (!isDragging) return;
        isDragging = false;
        sheet.classList.remove('dragging');
        const delta = currentY - startY;
        if (delta > 80) {
            closeBottomSheet();
        } else {
            sheet.style.transform = '';
        }
        e.preventDefault();
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
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

// ----- Рендер календаря -----
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
        <h2 class="section-title">🔧 раздел в разработке</h2>
        <div class="calendar-item">
            <div class="calendar-header">
                <h3>${monthNames[currentMonth]} ${currentYear}</h3>
                <div class="calendar-nav">
                    <span id="prevMonth">←</span>
                    <span id="nextMonth">→</span>
                </div>
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
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (hasHike) classes += ' hike-day';
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

    document.getElementById('prevMonth')?.addEventListener('click', () => {
        haptic();
        alert('Переключение между месяцами будет добавлено позже');
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
        haptic();
        alert('Переключение между месяцами будет добавлено позже');
    });
}

// ----- Страница для новичков (FAQ) -----
function renderNewcomerPage(isGuest = false) {
    // ... (полный код из предыдущей версии, без изменений)
}

// ----- Страница привилегий для владельцев карты -----
function renderPriv() {
    // ... (полный код из предыдущей версии)
}

// ----- Страница привилегий для гостей -----
function renderGuestPriv() {
    // ... (полный код из предыдущей версии)
}

// ----- Страница подарка -----
function renderGift(isGuest = false) {
    // ... (полный код из предыдущей версии)
}

// ----- Попап для гостей -----
function showGuestPopup() {
    // ... (полный код из предыдущей версии)
}

// ----- Главная для гостей -----
function renderGuestHome() {
    // ... (полный код из предыдущей версии)
}

// ----- Главная для владельцев карты -----
function renderHome() {
    // ... (полный код из предыдущей версии)
}

function buyCard() {
    haptic();
    if (!userId) return;
    log('buy_card_click', true);
    openLink('https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g', null, true);
}

window.addEventListener('load', loadData);
