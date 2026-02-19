// ---------- Telegram WebApp ----------
const tg = window.Telegram.WebApp;
tg.ready();

// ---------- Тактильный отклик при открытии ----------
if (tg.HapticFeedback) {
    tg.HapticFeedback.impactOccurred('medium'); // лёгкая вибрация
}

// ---------- Параллакс эффект на фоне ----------
function initParallax() {
    const bg = document.body::before; // псевдоэлемент нельзя напрямую получить, но можно менять стили body
    // Будем менять трансформацию самого body::before через CSS переменную или через класс
    // Проще: добавим элемент <div class="parallax-bg">, но у нас фон через ::before.
    // Можно динамически менять transform для body::before через inline стили на body? Нельзя.
    // Создадим отдельный элемент для фона, если хотим управлять им.
    // Но чтобы не менять структуру, можно задать переменную и обновлять её.
    // Однако проще использовать JavaScript для изменения стилей псевдоэлемента? Нет.
    // Поэтому сделаем так: добавим отдельный div для фона, а старый уберём.
    // Но это изменение HTML. Чтобы не трогать HTML, можно использовать другой подход:
    // Будем менять позицию фона через свойство background-position.
    // Это будет работать плавно.
}

// Альтернатива: будем менять background-position при движении
let lastX = 0, lastY = 0;
let ticking = false;

function handleOrientation(event) {
    // gamma: наклон влево-вправо, beta: вперёд-назад
    const gamma = event.gamma || 0; // диапазон -90..90
    const beta = event.beta || 0;   // -180..180

    // Ограничим влияние, чтобы смещение было небольшим
    const shiftX = gamma * 0.3;  // макс около 27px при 90 градусах
    const shiftY = beta * 0.15;

    // Применяем смещение к фону body::before через изменение background-position
    document.body.style.backgroundPosition = `${50 + shiftX}% ${50 + shiftY}%`;
}

if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (event) => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                handleOrientation(event);
                ticking = false;
            });
            ticking = true;
        }
    });
}

// ---------- КОНФИГУРАЦИЯ ----------
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?output=csv';
const GUEST_API_URL = 'https://script.google.com/macros/s/AKfycbxhKL7aUQ5GQrNFlVBJvPc6osAhmK-t2WscsP9rEBkPj_d9TUmr7NzPnAa_Ten1JgiLCQ/exec';

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = {
    status: 'loading',
    hikesCompleted: 0,
    cardImageUrl: ''
};

const mainContent = document.getElementById('mainContent');
const subtitleEl = document.getElementById('subtitle');

// ---------- Логирование событий ----------
function logEvent(action) {
    if (!userId) return;
    if (!GUEST_API_URL.startsWith('https://')) return;

    const params = new URLSearchParams({
        user_id: userId,
        username: user?.username || '',
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        action: action
    });

    const img = new Image();
    img.src = `${GUEST_API_URL}?${params}`;
}

// ---------- Загрузка данных из CSV ----------
async function loadUserData() {
    if (!userId) {
        userCard.status = 'inactive';
        renderHome();
        return;
    }

    try {
        const response = await fetch(`${CSV_URL}&t=${Date.now()}`);
        const csvText = await response.text();
        const rows = csvText.trim().split('\n').map(row => row.split(',').map(cell => cell.trim()));

        if (rows.length < 2) throw new Error('Нет данных');

        const headers = rows[0];
        const dataRows = rows.slice(1);

        let found = false;
        for (const row of dataRows) {
            if (String(row[0]).trim() === String(userId)) {
                const userData = {};
                headers.forEach((key, idx) => { userData[key] = row[idx]?.trim(); });

                userCard = {
                    status: userData.card_status === 'active' ? 'active' : 'inactive',
                    hikesCompleted: parseInt(userData.hikes_count) || 0,
                    cardImageUrl: userData.card_image_url || ''
                };
                found = true;
                break;
            }
        }

        if (!found) userCard.status = 'inactive';
    } catch (error) {
        console.error('Ошибка загрузки CSV:', error);
        userCard.status = 'inactive';
    }

    logEvent('visit');
    renderHome();
}

// ---------- Рендер главного экрана ----------
function renderHome() {
    if (userCard.status === 'active') {
        subtitleEl.textContent = `💳 твоя карта, ${firstName}`;
    } else {
        subtitleEl.textContent = `👋🏻 добро пожаловать в клуб хайкинг интеллигенции, ${firstName}`;
    }

    if (userCard.status === 'loading') {
        mainContent.innerHTML = '<div class="loader"></div>';
        return;
    }

    if (userCard.status === 'active' && userCard.cardImageUrl) {
        mainContent.innerHTML = `
            <div class="card-container">
                <img src="${userCard.cardImageUrl}" alt="карта интеллигента" class="card-image">
                <div class="hike-counter">
                    <span>⛰️ пройдено хайков</span>
                    <span class="counter-number">${userCard.hikesCompleted}</span>
                </div>
                <a href="https://telegra.ph/karta-intelligenta-11-21-3" target="_blank" class="btn btn-outline">мои привилегии</a>
                <a href="https://t.me/hellointelligent" target="_blank" class="btn-support" id="supportBtn">написать в поддержку</a>
            </div>
        `;

        // Логирование клика по поддержке
        document.getElementById('supportBtn')?.addEventListener('click', () => {
            logEvent('support_click');
        });
    } else {
        mainContent.innerHTML = `
            <div class="btn-group">
                <button id="buyCardBtn" class="btn">💳 купить карту</button>
                <a href="https://t.me/yaltahiking/197" target="_blank" class="btn btn-outline">📖 подробнее о карте</a>
            </div>
        `;

        document.getElementById('buyCardBtn')?.addEventListener('click', buyCard);
    }
}

// ---------- Покупка карты ----------
function buyCard() {
    if (!userId) return;
    logEvent('buy_card_click');
    const robokassaUrl = 'https://auth.robokassa.ru/merchant/Invoice/VolsQzE1I0G-iHkIWVJ0eQ';
    tg.openLink(robokassaUrl);
}

// ---------- Инициализация ----------
window.addEventListener('load', async () => {
    await loadUserData();
});
