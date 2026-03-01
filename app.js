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
let hikesData = {}; // Ключ: дата в формате YYYY-MM-DD
let hikesList = []; // массив всех хайков, отсортированный по дате

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

// Загрузка расписания хайков
async function loadHikes() {
    try {
        const resp = await fetch(`${HIKES_CSV_URL}&t=${Date.now()}`, { cache: 'no-cache' });
        const text = await resp.text();
        const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.trim()));
        if (rows.length < 2) return;
        const headers = rows[0];
        hikesData = {};
        for (let row of rows.slice(1)) {
            if (row.length < 4) continue;
            let data = {};
            headers.forEach((k, i) => data[k] = row[i]);
            const date = data.date;
            hikesData[date] = {
                title: data.title || 'Хайк',
                description: data.description || 'Описание появится позже',
                image: data.image_url || '',
                date: date
            };
        }
        // Создаём отсортированный список хайков
        hikesList = Object.values(hikesData).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) {
        console.error('Ошибка загрузки расписания хайков (некритично):', e);
    }
}

// Общая загрузка данных
async function loadData() {
    await Promise.allSettled([loadUserData(), loadMetrics(), loadHikes()]);
    log('visit', userCard.status !== 'active');
    renderHome();
    const loader = document.getElementById('initial-loader');
    if (loader) loader.style.display = 'none';
}

// ----- Массив партнёров -----
const partners = [ /* ... */ ]; // полный массив остаётся без изменений

// ----- Аккордеон -----
function setupAccordion(containerId, isGuest) { /* без изменений */ }

// ----- Конфетти -----
function showConfetti() { /* без изменений */ }

// ----- Bottom Sheet с листанием -----
function showBottomSheet(index) {
    if (!hikesList.length) return;

    // Удаляем существующий bottom sheet, если есть
    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Запрещаем скролл фона
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `
        <div class="bottom-sheet" id="hikeBottomSheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bottom-sheet-content-wrapper">
                <div class="bottom-sheet-arrow left" id="prevHike">←</div>
                <div class="bottom-sheet-arrow right" id="nextHike">→</div>
                <div class="bottom-sheet-content" id="bottomSheetContent">
                    <!-- контент будет обновляться через JS -->
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const sheet = document.getElementById('hikeBottomSheet');
    const contentDiv = document.getElementById('bottomSheetContent');
    const prevBtn = document.getElementById('prevHike');
    const nextBtn = document.getElementById('nextHike');

    let currentIndex = index;
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    // Функция обновления контента
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

        contentDiv.innerHTML = `
            ${hike.image ? `<img src="${hike.image}" class="bottom-sheet-image" onerror="this.style.display='none'">` : ''}
            <div class="bottom-sheet-title">${hike.title}</div>
            <div class="bottom-sheet-date">${formattedDate}</div>
            <div class="bottom-sheet-description">${hike.description.replace(/\n/g, '<br>')}</div>
            <a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'hike_join_click', false); return false;" class="btn btn-yellow bottom-sheet-btn">я иду</a>
        `;

        // Показываем/скрываем стрелки
        prevBtn.classList.toggle('hidden', currentIndex === 0);
        nextBtn.classList.toggle('hidden', currentIndex === hikesList.length - 1);
    }

    // Обработчики стрелок
    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentIndex > 0) {
            currentIndex--;
            updateContent();
            haptic();
            log('hike_swipe_prev', false);
        }
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentIndex < hikesList.length - 1) {
            currentIndex++;
            updateContent();
            haptic();
            log('hike_swipe_next', false);
        }
    });

    updateContent();

    // Анимация появления
    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 10);

    // Закрытие по клику на overlay
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeBottomSheet();
        }
    });

    // Drag-to-close на хэндле
    const handle = sheet.querySelector('.bottom-sheet-handle');

    const onTouchStart = (e) => {
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        sheet.classList.add('dragging');
        e.preventDefault();
    };

    const onTouchMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta > 0) {
            sheet.style.transform = `translateY(${delta}px)`;
        }
        e.preventDefault();
    };

    const onTouchEnd = (e) => {
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

    handle.addEventListener('touchstart', onTouchStart, { passive: false });
    handle.addEventListener('touchmove', onTouchMove, { passive: false });
    handle.addEventListener('touchend', onTouchEnd, { passive: false });
    handle.addEventListener('touchcancel', onTouchEnd, { passive: false });

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
        <div class="calendar-item">
            <h2 class="section-title" style="margin-top:0; margin-bottom:16px;">🔧 раздел в разработке</h2>
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

    // При клике на день с хайком
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
function renderNewcomerPage(isGuest = false) { /* без изменений */ }

// ----- Главная для гостей -----
function renderGuestHome() { /* без изменений */ }

// ----- Главная для владельцев карты -----
function renderHome() {
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
        return;
    }

    if (userCard.status === 'active' && userCard.cardUrl) {
        subtitle.textContent = `💳 твоя карта, ${firstName}`;
        mainDiv.innerHTML = `
            <div class="card-container">
                <img src="${userCard.cardUrl}" alt="карта" class="card-image" id="ownerCardImage">
                <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">${userCard.hikes}</span></div>
                <a href="#" class="btn btn-yellow" id="privBtn">мои привилегии</a>
                <div id="navAccordionOwner">
                    <button class="accordion-btn">
                        навигация по клубу <span class="arrow">👀</span>
                    </button>
                    <div class="dropdown-menu">
                        <a href="https://t.me/yaltahiking/149" onclick="event.preventDefault(); openLink(this.href, 'nav_about', false); return false;" class="btn btn-white-outline">о клубе</a>
                        <a href="https://t.me/yaltahiking/170" onclick="event.preventDefault(); openLink(this.href, 'nav_philosophy', false); return false;" class="btn btn-white-outline">философия</a>
                        <a href="https://t.me/yaltahiking/246" onclick="event.preventDefault(); openLink(this.href, 'nav_hiking', false); return false;" class="btn btn-white-outline">о хайкинге</a>
                        <a href="https://t.me/yaltahiking/a/2" onclick="event.preventDefault(); openLink(this.href, 'nav_reviews', false); return false;" class="btn btn-white-outline">отзывы</a>
                    </div>
                </div>
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'support_click', false); return false;" class="btn btn-white-outline" id="supportBtn">написать в поддержку</a>
            </div>

            <!-- Блок для новичков -->
            <div class="card-container">
                <h2 class="section-title">🫖 для новичков</h2>
                <div class="btn-newcomer" id="newcomerBtn">
                    <span class="newcomer-text">как всё устроено</span>
                    <img src="https://i.postimg.cc/k533cR9Z/fv.png" alt="новичкам" class="newcomer-image">
                </div>
            </div>
            
            <!-- Блок метрик -->
            <div class="card-container">
                <div class="metrics-header">
                    <h2 class="metrics-title">🌍 клуб в цифрах</h2>
                    <a href="https://t.me/yaltahiking/148" onclick="event.preventDefault(); openLink(this.href, 'reports_click', false); return false;" class="metrics-link">смотреть отчёты &gt;</a>
                </div>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-label">хайков</div>
                        <div class="metric-value">${metrics.hikes}</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">локаций</div>
                        <div class="metric-value">${metrics.locations}</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">километров</div>
                        <div class="metric-value">${metrics.kilometers}</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-label">знакомств</div>
                        <div class="metric-value">${metrics.meetings}</div>
                    </div>
                </div>
            </div>
            
            <div class="extra-links">
                <a href="https://t.me/yaltahiking" onclick="event.preventDefault(); openLink(this.href, 'channel_click', false); return false;" class="btn btn-white-outline">📰 открыть канал</a>
                <a href="https://t.me/yaltahikingchat" onclick="event.preventDefault(); openLink(this.href, 'chat_click', false); return false;" class="btn btn-white-outline">💬 открыть чат</a>
                <a href="#" class="btn btn-white-outline" id="giftBtn">🫂 подарить карту другу</a>
            </div>

            <!-- Блок календаря -->
            <div class="card-container" id="calendarContainer"></div>
        `;

        // ... обработчики событий
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
        document.getElementById('giftBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            log('gift_click');
            renderGift(false);
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

    } else {
        renderGuestHome();
    }
}

// Функции renderPriv, renderGuestPriv, renderGift, showGuestPopup остаются без изменений (здесь не повторяем для краткости)

window.addEventListener('load', loadData);
