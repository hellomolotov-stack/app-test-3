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

// ----- Bottom Sheet с листанием и свайпом по всей области -----
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
    let isInteractive = false; // флаг, что начали свайп с интерактивного элемента

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

        // Определяем, есть ли предыдущий/следующий хайк
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < hikesList.length - 1;

        contentDiv.innerHTML = `
            <div class="bottom-sheet-header">
                <div class="bottom-sheet-title">${hike.title}</div>
                <div class="bottom-sheet-nav">
                    <div class="bottom-sheet-nav-arrow ${!hasPrev ? 'hidden' : ''}" id="prevHike">←</div>
                    <div class="bottom-sheet-nav-arrow ${!hasNext ? 'hidden' : ''}" id="nextHike">→</div>
                </div>
            </div>
            ${hike.image ? `<img src="${hike.image}" class="bottom-sheet-image" onerror="this.style.display='none'">` : ''}
            <div class="bottom-sheet-date">${formattedDate}</div>
            <div class="bottom-sheet-description">${hike.description.replace(/\n/g, '<br>')}</div>
            <div class="bottom-sheet-buttons">
                <a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'hike_book_click', false); return false;" class="btn btn-yellow bottom-sheet-btn">забронировать место</a>
                <a href="#" onclick="event.preventDefault(); openLink('https://t.me/hellointelligent', 'hike_question_click', false); return false;" class="btn btn-white-outline bottom-sheet-btn">задать вопрос</a>
            </div>
        `;

        // Назначаем обработчики на стрелки
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

    // Небольшая задержка для анимации, но фон уже задан
    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 10);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeBottomSheet();
        }
    });

    // Обработчики свайпа на всём bottom sheet
    const onTouchStart = (e) => {
        // Проверяем, не кликнули ли на интерактивный элемент (стрелки, кнопки, полоску)
        const target = e.target;
        const isInteractiveElement = target.closest('.bottom-sheet-nav-arrow') || target.closest('a') || target.closest('.btn') || target.closest('.bottom-sheet-handle');
        if (isInteractiveElement) {
            isInteractive = true;
            return; // не начинаем свайп
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
function renderNewcomerPage(isGuest = false) {
    if (window._floatingScrollHandler) {
        window.removeEventListener('scroll', window._floatingScrollHandler);
        window._floatingScrollHandler = null;
    }

    subtitle.textContent = `всё, что нужно знать`;
    showBack(() => renderHome());
    haptic();
    log('newcomer_page_opened', isGuest);

    const faq = [ /* ... полный массив FAQ ... */ ]; // здесь должен быть полный массив из предыдущих версий
    // Для краткости не повторяем, но он должен быть.

    let faqHtml = '';
    faq.forEach(item => {
        let answer = item.a;
        answer = answer.replace('@yaltahiking', '<a href="#" onclick="openLink(\'https://t.me/yaltahiking\', \'faq_channel_click\', false); return false;">@yaltahiking</a>');
        answer = answer.replace('zapovedcrimea.ru', '<a href="#" onclick="openLink(\'https://zapovedcrimea.ru/choose-pass\', \'faq_pass_click\', false); return false;">zapovedcrimea.ru</a>');
        answer = answer.replace(/\n/g, '<br>');
        faqHtml += `<div class="partner-item"><strong>${item.q}</strong><p>${answer}</p></div>`;
    });

    mainDiv.innerHTML = `
        <div class="card-container newcomer-page" style="margin-bottom: 0;">
            ${faqHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px; margin-bottom: 0;">
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'newcomer_support_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin:0 16px;">задать вопрос</a>
                <button id="goHomeStatic" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
        <div class="floating-btn-container" id="floatingBtnContainer">
            <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'floating_support_click', ${isGuest}); return false;" class="btn btn-yellow">задать вопрос</a>
            <a href="#" id="floatingGoHome" class="btn btn-white-outline">&lt; на главную</a>
        </div>
    `;

    const floatingContainer = document.getElementById('floatingBtnContainer');
    document.getElementById('floatingGoHome')?.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        renderHome();
    });
    document.getElementById('goHomeStatic')?.addEventListener('click', () => {
        haptic();
        renderHome();
    });

    function checkFloatingButton() {
        if (!floatingContainer) return;
        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const showThreshold = documentHeight * 0.1;
        const hideThreshold = documentHeight * 0.1;
        const remaining = documentHeight - (scrollY + windowHeight);

        if (scrollY > showThreshold && remaining > hideThreshold) {
            floatingContainer.classList.remove('hidden');
        } else {
            floatingContainer.classList.add('hidden');
        }
    }

    checkFloatingButton();
    const scrollHandler = () => requestAnimationFrame(checkFloatingButton);
    window.addEventListener('scroll', scrollHandler);
    window.addEventListener('resize', scrollHandler);
    window._floatingScrollHandler = scrollHandler;
}

// ----- Страница привилегий для владельцев карты -----
function renderPriv() {
    // ... полный код из предыдущих версий
}

// ----- Страница привилегий для гостей -----
function renderGuestPriv() {
    // ... полный код из предыдущих версий
}

// ----- Страница подарка -----
function renderGift(isGuest = false) {
    // ... полный код из предыдущих версий
}

// ----- Попап для гостей -----
function showGuestPopup() {
    // ... полный код из предыдущих версий
}

// ----- Главная для гостей -----
function renderGuestHome() {
    // ... полный код из предыдущих версий
}

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

function buyCard() {
    haptic();
    if (!userId) return;
    log('buy_card_click', true);
    openLink('https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g', null, true);
}

window.addEventListener('load', loadData);