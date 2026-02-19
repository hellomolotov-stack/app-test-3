// ---------- Telegram WebApp ----------
const tg = window.Telegram.WebApp;
tg.ready();

// ---------- КОНФИГУРАЦИЯ ----------
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?output=csv';
const GUEST_API_URL = 'https://script.google.com/macros/s/AKfycbxhKL7aUQ5GQrNFlVBJvPc6osAhmK-t2WscsP9rEBkPj_d9TUmr7NzPnAa_Ten1JgiLCQ/exec'; // тот же URL, но теперь он умеет обновлять members

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

// ---------- Обновление user_name в members ----------
function updateUserNameIfNeeded(userData) {
    // Если user_name уже есть (не пустая строка) – ничего не делаем
    if (userData.user_name && userData.user_name.trim() !== '') return;

    // Формируем имя для записи: first_name + last_name (если есть)
    let fullName = user.first_name;
    if (user.last_name) fullName += ' ' + user.last_name;
    // Можно также добавить username в скобках, если нужно:
    // if (user.username) fullName += ` (@${user.username})`;

    // Отправляем запрос на обновление
    const params = new URLSearchParams({
        update_members: '1',
        user_id: userId,
        user_name: fullName
    });

    const img = new Image();
    img.src = `${GUEST_API_URL}?${params}`;
}

// ---------- Загрузка данных из CSV (members) ----------
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
                    status: 'active',
                    hikesCompleted: parseInt(userData.hikes_count) || 0,
                    cardImageUrl: userData.card_image_url || ''
                };

                // Проверяем и обновляем user_name при необходимости
                updateUserNameIfNeeded(userData);

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
                <a href="https://telegra.ph/karta-intelligenta-11-21-3" target="_blank" class="btn btn-outline" id="privilegeBtn">мои привилегии</a>
                <a href="https://t.me/hellointelligent" target="_blank" class="btn-support" id="supportBtn">написать в поддержку</a>
            </div>
            <div class="extra-links">
                <a href="https://t.me/yaltahiking" target="_blank" class="btn-support" id="channelBtn">📰 открыть канал клуба</a>
                <a href="https://t.me/yaltahikingchat" target="_blank" class="btn-support" id="chatBtn">💬 открыть чат</a>
                <a href="https://t.me/hellointelligent" target="_blank" class="btn-support" id="giftBtn">🫂 подарить карту другу</a>
            </div>
        `;

        document.getElementById('privilegeBtn')?.addEventListener('click', () => logEvent('privilege_click'));
        document.getElementById('supportBtn')?.addEventListener('click', () => logEvent('support_click'));
        document.getElementById('channelBtn')?.addEventListener('click', () => logEvent('channel_click'));
        document.getElementById('chatBtn')?.addEventListener('click', () => logEvent('chat_click'));
        document.getElementById('giftBtn')?.addEventListener('click', () => logEvent('gift_click'));
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

function buyCard() {
    if (!userId) return;
    logEvent('buy_card_click');
    const robokassaUrl = 'https://auth.robokassa.ru/merchant/Invoice/VolsQzE1I0G-iHkIWVJ0eQ';
    tg.openLink(robokassaUrl);
}

window.addEventListener('load', async () => {
    await loadUserData();
});
