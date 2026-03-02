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
let hikeBookingStatus = {};

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

// Улучшенный парсинг строки CSV с учётом кавычек
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

// Загрузка метрик
async function loadMetrics() {
    try {
        const resp = await fetch(`${METRICS_CSV_URL}&t=${Date.now()}`, { cache: 'no-cache' });
        const text = await resp.text();
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

// Загрузка расписания хайков
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

            // Для теста добавляем длинное описание, если его нет
            let description = data.description || 'Описание появится позже';
            if (description.length < 200) {
                description += ' '.repeat(10) + 'Это очень длинное описание, добавленное для проверки прокрутки. Здесь должно быть много текста, чтобы слайдер точно начал прокручиваться. Повторяем: это очень длинное описание, добавленное для проверки прокрутки. Здесь должно быть много текста, чтобы слайдер точно начал прокручиваться. И ещё немного текста для уверенности.';
            }

            hikesData[date] = {
                title: data.title || 'Хайк',
                description: description,
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
const partners = [ /* ... */ ]; // (полный массив, здесь не повторяем)

// ----- Аккордеон -----
function setupAccordion(containerId, isGuest) { /* ... */ }

// ----- Конфетти -----
function showConfetti() { /* ... */ }

// ----- Bottom Sheet -----
let sheetButtonsTimeout = null;
let sheetCurrentIndex = 0;
let sheetScrollListener = null;

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
                <!-- контент будет обновляться через JS -->
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const sheet = document.getElementById('hikeBottomSheet');
    const contentWrapper = document.getElementById('bottomSheetContent');

    sheetCurrentIndex = index;
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let isInteractive = false;

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
            <div class="bottom-sheet-sticky">
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

        const isBooked = hikeBookingStatus[sheetCurrentIndex];

        let goBtn = document.getElementById('sheetGoBtn');
        let questionBtn = document.getElementById('sheetQuestionBtn');
        let cancelBtn = document.getElementById('sheetCancelBtn');

        if (!goBtn || !questionBtn) {
            createFloatingButtons();
            return;
        }

        if (isBooked) {
            goBtn.classList.remove('btn-yellow');
            goBtn.classList.add('btn-green');
            goBtn.textContent = 'идёшь';

            if (!cancelBtn) {
                cancelBtn = document.createElement('a');
                cancelBtn.href = '#';
                cancelBtn.className = 'btn btn-red-outline';
                cancelBtn.id = 'sheetCancelBtn';
                cancelBtn.textContent = 'не пойду';
                cancelBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    haptic();
                    hikeBookingStatus[sheetCurrentIndex] = false;
                    updateFloatingSheetButtons();
                    log('sheet_cancel_click', false);
                });
                container.appendChild(cancelBtn);
            }
        } else {
            goBtn.classList.remove('btn-green');
            goBtn.classList.add('btn-yellow');
            goBtn.textContent = 'иду';

            if (cancelBtn) cancelBtn.remove();
        }
    }

    function createFloatingButtons() {
        removeFloatingSheetButtons();

        const container = document.createElement('div');
        container.className = 'floating-sheet-buttons';
        container.id = 'floatingSheetButtons';
        container.innerHTML = `
            <a href="#" class="btn btn-yellow" id="sheetGoBtn">иду</a>
            <a href="#" class="btn btn-white-outline" id="sheetQuestionBtn">у меня вопрос</a>
        `;
        document.body.appendChild(container);

        document.getElementById('sheetGoBtn').addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            hikeBookingStatus[sheetCurrentIndex] = true;
            updateFloatingSheetButtons();
            log('sheet_go_click', false);
        });

        document.getElementById('sheetQuestionBtn').addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            openLink('https://t.me/hellointelligent', 'sheet_question_click', false);
        });

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

    if (sheetButtonsTimeout) clearTimeout(sheetButtonsTimeout);
    sheetButtonsTimeout = setTimeout(() => {
        createFloatingButtons();
    }, 1000);

    const originalClose = closeBottomSheet;
    window.closeBottomSheet = function() {
        if (sheetButtonsTimeout) clearTimeout(sheetButtonsTimeout);
        if (sheetScrollListener) {
            contentWrapper.removeEventListener('scroll', sheetScrollListener);
            sheetScrollListener = null;
        }
        removeFloatingSheetButtons();
        originalClose();
    };

    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 10);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            window.closeBottomSheet();
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
            window.closeBottomSheet();
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
        const sheetButtons = document.querySelector('.floating-sheet-buttons');
        if (sheetButtons) sheetButtons.remove();
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

// ----- Рендер календаря -----
function renderCalendar(container) { /* ... */ }

// ----- Страница для новичков (FAQ) -----
function renderNewcomerPage(isGuest = false) { /* ... */ }

// ----- Страница привилегий для владельцев карты -----
function renderPriv() { /* ... */ }

// ----- Страница привилегий для гостей -----
function renderGuestPriv() { /* ... */ }

// ----- Страница подарка -----
function renderGift(isGuest = false) { /* ... */ }

// ----- Попап для гостей -----
function showGuestPopup() { /* ... */ }

// ----- Главная для гостей -----
function renderGuestHome() { /* ... */ }

// ----- Главная для владельцев карты -----
function renderHome() { /* ... */ }

function buyCard() { /* ... */ }

window.addEventListener('load', loadData);
