// ---------- Telegram WebApp ----------
const tg = window.Telegram.WebApp;
tg.ready();

// ---------- КОНФИГУРАЦИЯ ----------
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?output=csv';
const GUEST_API_URL = 'https://script.google.com/macros/s/AKfycby0943sdi-neS00sFzcyT-rsmzQgPOD4vsOYMnnLYSK8XcEIQJynP1CGsSWP62gK1zxSw/exec';

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
    if (userData.user_name && userData.user_name.trim() !== '') return;

    let fullName = user.first_name;
    if (user.last_name) fullName += ' ' + user.last_name;

    const params = new URLSearchParams({
        update_members: '1',
        user_id: userId,
        user_name: fullName
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
                    status: 'active',
                    hikesCompleted: parseInt(userData.hikes_count) || 0,
                    cardImageUrl: userData.card_image_url || ''
                };

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

// ---------- Данные партнёров ----------
const partners = [
    {
        name: 'экипировочный центр Геккон',
        privilege: '-10% по карте интеллигента',
        location: 'Ялта, ул. Московская 8А'
    },
    {
        name: 'технологичная хайкинг-одежда Nothomme',
        privilege: '-7% по промокоду на сайте',
        location: 'телеграм канал: t.me/nothomme_russia',
        link: 'https://t.me/nothomme_russia'
    },
    {
        name: 'кофейня Возможно всё',
        privilege: '-5% по карте интеллигента',
        location: 'г. Ялта, ул. Свердлова, 13/2'
    },
    {
        name: 'магазин косметики На Утро: На Вечер',
        privilege: '+1000 бонусов по карте интеллигента',
        location: 'г. Ялта, ул. Морская 3А'
    },
    {
        name: 'конный клуб Красный конь',
        privilege: '-5% по карте интеллигента',
        location: 'г. Алупка, Севастопольское шоссе'
    },
    {
        name: 'маникюрный салон Marvel studio',
        privilege: '-5% по карте интеллигента',
        location: 'г. Ялта, ул. Руданского 4'
    },
    {
        name: 'тематическое кафе Vinyl',
        privilege: '-10% по карте интеллигента',
        location: 'г. Ялта, пер. Черноморский 1А'
    },
    {
        name: 'барбершоп Скала',
        privilege: '-5% на второе посещение и далее',
        location: 'г. Ялта, ул. Свердлова 3'
    },
    {
        name: 'кофейня Deep Black',
        privilege: '-5% по карте интеллигента',
        location: 'п. г. т. Гаспра, Алупкинское ш., 5А'
    }
];

// ---------- Рендер страницы привилегий ----------
function renderPrivilegesPage() {
    subtitleEl.textContent = `🤘🏻твои привилегии, ${firstName}`;

    let partnersHtml = '';
    partners.forEach(p => {
        let locationHtml = p.link 
            ? `<a href="${p.link}" target="_blank" style="color: #D9FD19; text-decoration: none;">${p.location}</a>`
            : p.location;
        
        partnersHtml += `
            <div style="background-color: rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin-bottom: 12px; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(4px);">
                <strong style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 700; font-size: 14px;">${p.name}</strong>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.9;">${p.privilege}</p>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.8;">📍 ${locationHtml}</p>
            </div>
        `;
    });

    mainContent.innerHTML = `
        <div class="card-container" style="padding: 20px;">
            ${partnersHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                <button id="backToHomeBtn" class="btn-support" style="width: calc(100% - 32px); margin: 0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;

    document.getElementById('backToHomeBtn')?.addEventListener('click', renderHome);
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
                <img src="${userCard.cardImageUrl}" alt="карта интеллигента" class="card-image" style="width: calc(100% - 32px); margin: 0 16px 8px 16px; display: block;">
                <div class="hike-counter">
                    <span>⛰️ пройдено хайков</span>
                    <span class="counter-number">${userCard.hikesCompleted}</span>
                </div>
                <a href="#" class="btn btn-outline" id="privilegeBtn">мои привилегии</a>
                <a href="https://t.me/hellointelligent" target="_blank" class="btn-support" id="supportBtn">написать в поддержку</a>
            </div>
            <div class="extra-links">
                <a href="https://t.me/yaltahiking" target="_blank" class="btn-support" id="channelBtn">📰 открыть канал клуба</a>
                <a href="https://t.me/yaltahikingchat" target="_blank" class="btn-support" id="chatBtn">💬 открыть чат</a>
                <a href="#" class="btn-support" id="giftBtn">🫂 подарить карту другу</a>
            </div>
        `;

        document.getElementById('privilegeBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            logEvent('privilege_click');
            renderPrivilegesPage();
        });
        document.getElementById('supportBtn')?.addEventListener('click', () => logEvent('support_click'));
        document.getElementById('channelBtn')?.addEventListener('click', () => logEvent('channel_click'));
        document.getElementById('chatBtn')?.addEventListener('click', () => logEvent('chat_click'));
        document.getElementById('giftBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            logEvent('gift_click');
            renderGiftPage();
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

// ---------- Страница подарка ----------
function renderGiftPage() {
    subtitleEl.textContent = `🎁 подарить карту`;

    mainContent.innerHTML = `
        <div class="card-container" style="padding: 20px;">
            <p style="color: #ffffff; margin-bottom: 16px; font-size: 16px; line-height: 1.6;">
                Чтобы подарить карту интеллигента другу, пришли нам в поддержку:
            </p>
            <ol style="color: #ffffff; margin-left: 20px; margin-bottom: 20px; font-size: 15px;">
                <li style="margin-bottom: 8px;">имя</li>
                <li style="margin-bottom: 8px;">фамилию</li>
                <li style="margin-bottom: 8px;">@username</li>
                <li style="margin-bottom: 8px;">чек о покупке</li>
                <li style="margin-bottom: 8px;">и напиши, хочешь отправить ему карту сам или чтобы мы написали ему сами, что это подарок от тебя</li>
            </ol>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                <a href="https://t.me/hellointelligent" target="_blank" class="btn-support" style="background-color: #D9FD19; color: #000000; border: none; width: calc(100% - 32px); margin: 0 16px;">написать в поддержку</a>
                <button id="backToHomeBtn" class="btn-support" style="width: calc(100% - 32px); margin: 0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;

    document.getElementById('backToHomeBtn')?.addEventListener('click', renderHome);
}

// ---------- Покупка карты ----------
function buyCard() {
    if (!userId) return;
    logEvent('buy_card_click');
    const robokassaUrl = 'https://auth.robokassa.ru/merchant/Invoice/VolsQzE1I0G-iHkIWVJ0eQ';
    tg.openLink(robokassaUrl);
}

window.addEventListener('load', async () => {
    await loadUserData();
});