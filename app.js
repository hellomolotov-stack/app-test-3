// ---------- Telegram WebApp ----------
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// ---------- КОНФИГУРАЦИЯ (ссылк� уже вставлены) ----------
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?output=csv';
const GUEST_API_URL = 'https://script.google.com/macros/s/AKfycbxhKL7aUQ5GQrNFlVBJvPc6osAhmK-t2WscsP9rEBkPj_d9TUmr7NzPnAa_Ten1JgiLCQ/exec';

// ---------- Данные пользователя ----------
const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = {
    status: 'loading', // 'loading', 'active', 'inactive', 'error'
    hikesCompleted: 0,
    cardImageUrl: ''
};

const mainContent = document.getElementById('mainContent');
const subtitleEl = document.getElementById('subtitle');

// ---------- Логирование событий в Google Sheets ----------
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
                <img src="${userCard.cardImageUrl}" alt="карта интеллигента" class="card-image" id="cardImage">
                <div class="hike-counter">
                    <span>⛰️ пройдено хайков</span>
                    <span class="counter-number">${userCard.hikesCompleted}</span>
                </div>
                <a href="https://telegra.ph/karta-intelligenta-11-21-3" target="_blank" class="btn btn-outline">мои привилегии</a>
            </div>
        `;

        document.getElementById('cardImage')?.addEventListener('click', () => {
            if (tg) {
                tg.openLink(userCard.cardImageUrl);
            } else {
                window.open(userCard.cardImageUrl, '_blank');
            }
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