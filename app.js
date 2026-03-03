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
        console.log('Metrics raw text:', text.substring(0, 200));
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
        console.log('Метрики загружены:', metrics);
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
        console.log('Список хайков загружен. Даты:', hikesList.map(h => h.date));
    } catch (e) {
        console.error('Ошибка загрузки расписания хайков:', e);
    }
}

async function loadUserRegistrations() {
    if (!userId || !REGISTRATION_API_URL || hikesList.length === 0) return;
    try {
        const url = `${REGISTRATION_API_URL}?action=get&user_id=${userId}&_=${Date.now()}`;
        console.log('Запрос регистраций:', url);
        const resp = await fetch(url);
        const data = await resp.json();
        console.log('Ответ сервера (регистрации):', data);
        if (data && Array.isArray(data.registrations)) {
            // Сначала загружаем из localStorage, если есть
            const savedStatus = localStorage.getItem('hikeBookingStatus');
            if (savedStatus) {
                try {
                    const parsed = JSON.parse(savedStatus);
                    // Сопоставляем с текущими индексами
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
                // Сбрасываем статусы
                for (let i = 0; i < hikesList.length; i++) {
                    hikeBookingStatus[i] = false;
                }
            }
            // Обновляем из данных сервера (приоритет сервера)
            data.registrations.forEach(reg => {
                const index = hikesList.findIndex(h => h.date === reg.hikeDate);
                if (index !== -1 && reg.status === 'booked') {
                    hikeBookingStatus[index] = true;
                }
            });
            console.log('Итоговый статус регистраций:', hikeBookingStatus);
            // Сохраняем в localStorage для надёжности
            saveStatusToLocalStorage();
        } else {
            console.warn('Неверный ответ от API регистраций:', data);
        }
    } catch (e) {
        console.error('Ошибка загрузки регистраций:', e);
    }
}

// Функция сохранения статуса в localStorage
function saveStatusToLocalStorage() {
    if (!hikesList.length) return;
    const statusObj = {};
    hikesList.forEach((hike, index) => {
        statusObj[hike.date] = hikeBookingStatus[index] || false;
    });
    localStorage.setItem('hikeBookingStatus', JSON.stringify(statusObj));
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
        console.log('Отправка запроса на обновление:', params.toString());
        fetch(REGISTRATION_API_URL, {
            method: 'POST',
            body: params,
            keepalive: true
        })
            .then(res => res.json())
            .then(result => {
                console.log('Ответ на обновление:', result);
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

// ----- Массив партнёров (полный) -----
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
                saveStatusToLocalStorage();
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
                saveStatusToLocalStorage();
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

    // Умный свайп вниз (без изменений)
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
    console.log('UI метрик обновлён');
}

// ----- Функции для нижнего меню -----
let popupVisible = false;

function setupBottomNav() {
    const navHome = document.getElementById('navHome');
    const navHikes = document.getElementById('navHikes');
    const navMore = document.getElementById('navMore');
    const popup = document.getElementById('navPopup');
    const popupChat = document.getElementById('popupChat');
    const popupChannel = document.getElementById('popupChannel');
    const popupGift = document.getElementById('popupGift');

    if (!navHome || !navHikes || !navMore || !popup) return;

    // Убираем все старые обработчики, чтобы не было дублирования
    const newNavHome = navHome.cloneNode(true);
    const newNavHikes = navHikes.cloneNode(true);
    const newNavMore = navMore.cloneNode(true);
    navHome.parentNode.replaceChild(newNavHome, navHome);
    navHikes.parentNode.replaceChild(newNavHikes, navHikes);
    navMore.parentNode.replaceChild(newNavMore, navMore);

    // Переназначаем переменные
    const navHomeNew = document.getElementById('navHome');
    const navHikesNew = document.getElementById('navHikes');
    const navMoreNew = document.getElementById('navMore');

    navHomeNew.addEventListener('click', () => {
        haptic();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        log('nav_home_click');
        // Скрываем попап, если открыт
        if (popupVisible) {
            popup.classList.remove('show');
            popupVisible = false;
        }
    });

    navHikesNew.addEventListener('click', () => {
        haptic();
        const calendarContainer = document.getElementById('calendarContainer');
        if (calendarContainer) {
            calendarContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        log('nav_hikes_click');
        if (popupVisible) {
            popup.classList.remove('show');
            popupVisible = false;
        }
    });

    navMoreNew.addEventListener('click', (e) => {
        e.stopPropagation();
        haptic();
        popupVisible = !popupVisible;
        if (popupVisible) {
            popup.classList.add('show');
        } else {
            popup.classList.remove('show');
        }
        log('nav_more_click');
    });

    // Обработчики для пунктов попап-меню
    popupChat.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        openLink('https://t.me/yaltahikingchat', 'popup_chat_click');
        popup.classList.remove('show');
        popupVisible = false;
    });
    popupChannel.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        openLink('https://t.me/yaltahiking', 'popup_channel_click');
        popup.classList.remove('show');
        popupVisible = false;
    });
    popupGift.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        renderGift(false); // для владельцев карты
        popup.classList.remove('show');
        popupVisible = false;
    });

    // Закрытие попапа при клике вне его
    document.addEventListener('click', (e) => {
        if (popupVisible && !navMoreNew.contains(e.target) && !popup.contains(e.target)) {
            popup.classList.remove('show');
            popupVisible = false;
        }
    });

    function updateActiveNav() {
        if (!navHomeNew || !navHikesNew) return;
        // На страницах, не являющихся главной (привилегии, новичок), не подсвечиваем ничего
        if (window.location.pathname.includes('priv') || window.location.pathname.includes('newcomer')) {
            navHomeNew.classList.remove('active');
            navHikesNew.classList.remove('active');
            return;
        }
        const calendarContainer = document.getElementById('calendarContainer');
        if (!calendarContainer) {
            navHomeNew.classList.add('active');
            navHikesNew.classList.remove('active');
            return;
        }
        const rect = calendarContainer.getBoundingClientRect();
        const isCalendarVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (isCalendarVisible) {
            navHikesNew.classList.add('active');
            navHomeNew.classList.remove('active');
        } else {
            navHomeNew.classList.add('active');
            navHikesNew.classList.remove('active');
        }
    }

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
    if (window._floatingScrollHandler) {
        window.removeEventListener('scroll', window._floatingScrollHandler);
        window._floatingScrollHandler = null;
    }

    subtitle.textContent = `всё, что нужно знать`;
    showBack(() => renderHome());
    haptic();
    log('newcomer_page_opened', isGuest);
    showBottomNav(false); // скрываем меню на других страницах

    const faq = [
        { q: 'что такое хайкинг?', a: 'хайкинг — это пешие прогулки по живописным местам. мы ходим 3–5 часов, без палаток и ночёвок, по оборудованным тропам. главное в наших хайках — люди и атмосфера.' },
        { q: 'кто может участвовать?', a: 'любой человек, готовый соблюдать правила клуба. нужна только удобная обувь и желание знакомиться.' },
        { q: 'сколько стоит участие?', a: 'билет на хайк — 1500₽. для владельцев карты интеллигента — бесплатно.' },
        { q: 'где проходят хайки?', a: 'в Ялте и вдоль всего южного берега Крыма. точное место сбора указывается в анонсе.' },
        { q: 'нужна ли специальная подготовка?', a: 'нет, маршруты рассчитаны на людей с любым уровнем физподготовки.' },
        { q: 'как записаться?', a: 'подпишись на канал @yaltahiking, следи за анонсами, ставь голос в комментариях и оформляй пропуск, если требуется.' },
        { q: 'что взять с собой?', a: 'удобную обувь, воду, перекус, защиту от солнца, хорошее настроение.' },
        { q: 'что такое карта интеллигента?', a: 'бессрочный абонемент на хайки и скидки у партнёров клуба. подробности в канале.' },
        { q: 'есть ли ограничения по возрасту?', a: 'участники обычно от 18 до 40 лет, но мы рады всем, кто разделяет наши ценности.' }
    ];

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
                <button id="goHomeStatic" class="btn btn-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
        <!-- Плавающие кнопки убраны -->
    `;

    document.getElementById('goHomeStatic')?.addEventListener('click', () => {
        haptic();
        renderHome();
    });
}

// ----- Страница привилегий для владельцев карты -----
function renderPriv() {
    subtitle.textContent = `🤘🏻твои привилегии, ${firstName}`;
    showBack(renderHome);
    showBottomNav(false); // скрываем меню

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
            <!-- Статические кнопки внизу убраны -->
        </div>
    `;
}

// ----- Страница привилегий для гостей -----
function renderGuestPriv() {
    subtitle.textContent = `💳 привилегии с картой интеллигента`;
    showBack(renderHome);
    showBottomNav(false);

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
            <!-- Статические кнопки внизу убраны -->
        </div>
    `;
}

// ----- Страница подарка -----
function renderGift(isGuest = false) {
    subtitle.textContent = `💫 как подарить карту`;
    showBack(renderHome);
    showBottomNav(false);

    mainDiv.innerHTML = `
        <div class="card-container">
            <div class="gift-text" style="padding:0 16px;">
                <p style="margin-bottom:16px;">хочешь подарить карту интеллигента другу? тогда пришли нам в поддержку имя друга, его фамилию, @username в телеграм и твой чек об оплате карты (приходит на почту после покупки). мы выпустим карту на имя друга.</p>
                <p style="margin-bottom:16px;">если хочешь подарить ему карту сам – напиши «отправлю карту сам». если хочешь, чтобы её прислали мы, но сказали, что от тебя, напиши «подарите вы».</p>
                <p style="margin-bottom:20px;">как только друг получит карту у него станет активным наше приложение и он сможет им пользоваться.</p>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:20px;">
                <a href="https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g" onclick="event.preventDefault(); openLink(this.href, 'gift_purchase_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin-bottom:0;" id="giftBuyBtn">купить в подарок</a>
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'support_click', ${isGuest}); return false;" class="btn btn-outline" style="margin-bottom:0;" id="giftSupportBtn">написать в поддержку</a>
                <button id="goHome" class="btn btn-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;

    document.getElementById('goHome')?.addEventListener('click', () => { haptic(); renderHome(); });
    document.getElementById('giftBuyBtn')?.addEventListener('click', () => { haptic(); log('gift_purchase_click', isGuest); });
    document.getElementById('giftSupportBtn')?.addEventListener('click', () => { haptic(); log('support_click', isGuest); });
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
    showBottomNav(false); // для гостей меню не показываем

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

        <!-- Блок для новичков (для гостей) -->
        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest">
                <span class="newcomer-text">как всё устроено</span>
                <img src="https://i.postimg.cc/k533cR9Z/fv.png" alt="новичкам" class="newcomer-image">
            </div>
        </div>
        
        <!-- Блок метрик с data-атрибутами -->
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

    // Фоновая загрузка свежих метрик и обновление UI
    loadMetrics().then(() => {
        updateMetricsUI();
    });

    if (userCard.status === 'active' && userCard.cardUrl) {
        subtitle.textContent = `💳 твоя карта, ${firstName}`;
        showBottomNav(true); // показываем меню

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
                        <a href="https://t.me/yaltahiking/149" onclick="event.preventDefault(); openLink(this.href, 'nav_about', false); return false;" class="btn btn-outline">о клубе</a>
                        <a href="https://t.me/yaltahiking/170" onclick="event.preventDefault(); openLink(this.href, 'nav_philosophy', false); return false;" class="btn btn-outline">философия</a>
                        <a href="https://t.me/yaltahiking/246" onclick="event.preventDefault(); openLink(this.href, 'nav_hiking', false); return false;" class="btn btn-outline">о хайкинге</a>
                        <a href="https://t.me/yaltahiking/a/2" onclick="event.preventDefault(); openLink(this.href, 'nav_reviews', false); return false;" class="btn btn-outline">отзывы</a>
                    </div>
                </div>
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'support_click', false); return false;" class="btn btn-outline" id="supportBtn">написать в поддержку</a>
            </div>

            <!-- Блок для новичков -->
            <div class="card-container">
                <h2 class="section-title">🫖 для новичков</h2>
                <div class="btn-newcomer" id="newcomerBtn">
                    <span class="newcomer-text">как всё устроено</span>
                    <img src="https://i.postimg.cc/k533cR9Z/fv.png" alt="новичкам" class="newcomer-image">
                </div>
            </div>
            
            <!-- Блок метрик с data-атрибутами -->
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
            
            <div class="extra-links">
                <a href="https://t.me/yaltahiking" onclick="event.preventDefault(); openLink(this.href, 'channel_click', false); return false;" class="btn btn-outline">📰 открыть канал</a>
                <a href="https://t.me/yaltahikingchat" onclick="event.preventDefault(); openLink(this.href, 'chat_click', false); return false;" class="btn btn-outline">💬 открыть чат</a>
                <a href="#" class="btn btn-outline" id="giftBtn">🫂 подарить карту другу</a>
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

        // Настраиваем нижнее меню
        setupBottomNav();

    } else {
        renderGuestHome();
        loadMetrics().then(() => {
            updateMetricsUI();
        });
        // Меню для гостей не показываем
    }
}

function buyCard() {
    haptic();
    if (!userId) return;
    log('buy_card_click', true);
    openLink('https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g', null, true);
}

window.addEventListener('load', loadData);