// Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();

// Определяем платформу
const platform = tg.platform; // 'ios', 'android', 'macos', 'tdesktop', 'weba'

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
const HIKES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?gid=123456789&single=true&output=csv'; // Замените на реальный gid листа с хайками

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = { status: 'loading', hikes: 0, cardUrl: '' };
let metrics = { hikes: '19', kilometers: '150+', locations: '13', meetings: '130+' };
let hikesData = {}; // Объект: ключ - дата в формате YYYY-MM-DD, значение - объект с данными хайка

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

// Загрузка данных из CSV (members)
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

// Загрузка метрик из отдельного листа
async function loadMetrics() {
    if (!METRICS_CSV_URL) return;
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
    if (!HIKES_CSV_URL) return;
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
            const date = data.date; // ожидаем формат YYYY-MM-DD
            hikesData[date] = {
                title: data.title,
                description: data.description,
                image: data.image_url || '',
                date: date
            };
        }
    } catch (e) {
        console.error('Ошибка загрузки расписания хайков:', e);
    }
}

async function loadData() {
    await Promise.all([loadUserData(), loadMetrics(), loadHikes()]);
    log('visit', userCard.status !== 'active');
    renderHome();
    const loader = document.getElementById('initial-loader');
    if (loader) loader.style.display = 'none';
}

// ----- Массив партнёров -----
const partners = [ /* ... */ ]; // остаётся без изменений

// ----- Функция для обработки аккордеона -----
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

// ----- Страница привилегий для владельцев карты -----
function renderPriv() { /* без изменений */ }

// ----- Страница привилегий для гостей -----
function renderGuestPriv() { /* без изменений */ }

// ----- Страница подарка -----
function renderGift(isGuest = false) { /* без изменений */ }

// ----- Попап для гостей -----
function showGuestPopup() { /* без изменений */ }

// ----- Модальное окно с деталями хайка -----
function showHikeModal(hike) {
    haptic();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'hikeModal';
    overlay.innerHTML = `
        <div class="modal-content">
            <button class="modal-close" id="closeHikeModal">&times;</button>
            ${hike.image ? `<img src="${hike.image}" class="hike-modal-image">` : ''}
            <div class="hike-modal-title">${hike.title}</div>
            <div class="hike-modal-date">${hike.date}</div>
            <div class="hike-modal-description">${hike.description}</div>
            <a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'hike_join_click', false); return false;" class="btn btn-yellow hike-modal-btn">я иду</a>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('closeHikeModal')?.addEventListener('click', () => {
        haptic();
        overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            haptic();
            overlay.remove();
        }
    });
    log('hike_modal_opened', false);
}

// ----- Функция для рендера календаря -----
function renderCalendar(container) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const currentDate = now.getDate();

    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

    // Первый день месяца (0 = воскресенье, в России неделя с понедельника, поэтому корректируем)
    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 вс, 1 пн, ... 6 сб
    // Преобразуем: если воскресенье (0) то смещение 6, иначе firstDay-1
    let startOffset = firstDay === 0 ? 6 : firstDay - 1; // теперь 0 = пн

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

    let html = `
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

    // Пустые ячейки до первого дня
    for (let i = 0; i < startOffset; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    // Ячейки дней месяца
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = (day === currentDate);
        const hasHike = hikesData[dateStr] ? true : false;
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (hasHike) classes += ' hike-day';
        if (hasHike) {
            html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
        } else {
            html += `<div class="${classes}">${day}</div>`;
        }
    }

    html += `</div>`;

    container.innerHTML = html;

    // Обработчики для дней с хайками
    document.querySelectorAll('.calendar-day.hike-day').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            const hike = hikesData[date];
            if (hike) showHikeModal(hike);
        });
    });

    // Обработчики навигации по месяцам (можно реализовать позже)
    document.getElementById('prevMonth')?.addEventListener('click', () => {
        haptic();
        // Пока просто заглушка
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
        haptic();
        // Пока просто заглушка
    });
}

// ----- Страница для новичков (FAQ) -----
function renderNewcomerPage(isGuest = false) { /* без изменений */ }

// ----- Главная для гостей -----
function renderGuestHome() { /* без изменений */ }

// ----- Главная для владельцев карты (с календарём) -----
function renderHome() {
    // Удаляем обработчик плавающей кнопки, если он был
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
            <div class="card-container" id="calendarContainer">
                <!-- Календарь будет отрисован через JS -->
            </div>
        `;

        document.getElementById('ownerCardImage')?.addEventListener('click', () => {
            haptic();
            if (tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
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

        // Рендерим календарь
        const calendarContainer = document.getElementById('calendarContainer');
        if (calendarContainer) {
            renderCalendar(calendarContainer);
        }

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
