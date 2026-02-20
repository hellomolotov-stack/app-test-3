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

// ---------- МАССИВ ПАРТНЁРОВ (С НОВЫМИ АДРЕСАМИ И ССЫЛКАМИ) ----------
const partners = [
    {
        name: 'экипировочный центр Геккон',
        privilege: '-10% по карте интеллигента',
        location: 'Московская ул., 8А, Ялта',
        link: 'https://yandex.ru/maps/org/gekkon/1189230227?si=xvnyyrd9reydm8tbq186v5f82w'
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
        location: 'ул. Свердлова, 13/2, Ялта',
        link: 'https://yandex.ru/maps/org/vozmozhno_vsyo/154873148683?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'магазин косметики На Утро: На Вечер',
        privilege: '+1000 бонусов по карте интеллигента',
        location: 'Морская ул., 3А, Ялта',
        link: 'https://yandex.ru/maps/org/na_utro_na_vecher_kosmetika_i_parfyumeriya/218833808391?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'конный клуб Красный конь',
        privilege: '-5% по карте интеллигента',
        location: 'Республика Крым, городской округ Ялта, Алупкинский территориальный орган',
        link: 'https://yandex.ru/maps/org/krasny_kon/244068367955?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'маникюрный салон Marvel studio',
        privilege: '-5% по карте интеллигента',
        location: 'ул. Руданского, 4, Ялта',
        link: 'https://yandex.ru/maps/org/marvel/39545501679?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'тематическое кафе Vinyl',
        privilege: '-10% по карте интеллигента',
        location: 'Черноморский пер., 1А, Ялта',
        link: 'https://yandex.ru/maps/org/vinyl/117631638288?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'барбершоп Скала',
        privilege: '-5% на второе посещение и далее',
        location: 'ул. Свердлова, 3, Ялта',
        link: 'https://yandex.ru/maps/org/skala/20728278796?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'кофейня Deep Black',
        privilege: '-5% по карте интеллигента',
        location: 'Алупкинское ш., 5А, п. г. т. Гаспра',
        link: 'https://yandex.ru/maps/org/deep_black/13540102561?si=xvnyyrd9reydm8tbq186v5f82w'
    }
];

// ---------- Рендер страницы привилегий ----------
function renderPrivilegesPage() {
    subtitleEl.textContent = `🤘🏻твои привилегии, ${firstName}`;

    // Блок 1: Привилегии в клубе
    const clubPrivileges = [
        {
            title: 'бесплатное участие',
            desc: 'один раз оформляешь карту – теперь ты не просто участник, а член клуба. математика простая: ты окупишь карту уже на шестой хайк. или раньше, с учётом скидок у партнёров. дальше все хайки для тебя бесплатны – ты в постоянном плюсе'
        },
        {
            title: 'гостевой хайк',
            desc: 'ты можешь взять с собой друга на его первый маршрут с клубом. ему не нужно будет покупать на него билет'
        },
        {
            title: 'приоритетный запрос на мастермайнд',
            desc: 'владельцы карт могут забронировать запрос на мастермайнд и на ближайшем хайке получить свежий взгляд, опыт и полезные контакты от десятка человек для своего проекта, идеи или задачи',
            button: 'забронировать запрос'
        },
        {
            title: 'new: обход блокировок',
            desc: 'теперь ты можешь получить настройки, которые вновь вернут заблокированные ресурсы.',
            button: 'получить настройки'
        }
    ];

    let clubHtml = '';
    clubPrivileges.forEach(p => {
        clubHtml += `
            <div style="background-color: rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin: 0 16px 12px 16px; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(4px);">
                <strong style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 700; font-size: 18px;">${p.title}</strong>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.9; line-height: 1.5;">${p.desc}</p>
                ${p.button ? `
                    <a href="https://t.me/hellointelligent" target="_blank" style="display: block; background-color: #D9FD19; color: #000000; border: none; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 600; text-align: center; text-decoration: none; margin-top: 12px; width: 100%; box-sizing: border-box;">${p.button}</a>
                ` : ''}
            </div>
        `;
    });

    // Блок 2: Привилегии в городе (партнёры)
    let partnersHtml = '';
    partners.forEach(p => {
        // Если есть прямая ссылка (link), используем её, иначе формируем ссылку на Яндекс Карты по адресу
        let locationHtml;
        if (p.link) {
            locationHtml = `<a href="${p.link}" target="_blank" style="color: #D9FD19; text-decoration: none;">${p.location}</a>`;
        } else {
            const yandexMapsUrl = `https://yandex.ru/maps/?text=${encodeURIComponent(p.location)}`;
            locationHtml = `<a href="${yandexMapsUrl}" target="_blank" style="color: #D9FD19; text-decoration: none;">${p.location}</a>`;
        }
        
        partnersHtml += `
            <div style="background-color: rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin: 0 16px 12px 16px; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(4px);">
                <strong style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 700; font-size: 18px;">${p.name}</strong>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.9;">${p.privilege}</p>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.8;">📍 ${locationHtml}</p>
            </div>
        `;
    });

    mainContent.innerHTML = `
        <div class="card-container">
            <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 16px 16px 16px;">✨ в клубе</h2>
            ${clubHtml}
            
            <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 24px 16px 16px 16px;">🏙️ в городе</h2>
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
            <div class="card-container" id="cardContainer">
                <img src="${userCard.cardImageUrl}" alt="карта интеллигента" class="card-image" id="cardImage" style="width: calc(100% - 32px); margin: 0 16px 8px 16px; display: block;">
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
        <div class="card-container">
            <div style="padding: 0 16px;">
                <p style="color: #ffffff; margin-bottom: 16px; font-size: 16px; line-height: 1.6;">
                    Чтобы подарить карту интеллигента другу, пришли нам в поддержку:
                </p>
                <ol style="color: #ffffff; margin-left: 20px; margin-bottom: 20px; font-size: 15px; padding-left: 0;">
                    <li style="margin-bottom: 8px;">имя</li>
                    <li style="margin-bottom: 8px;">фамилию</li>
                    <li style="margin-bottom: 8px;">@username</li>
                    <li style="margin-bottom: 8px;">чек о покупке</li>
                    <li style="margin-bottom: 8px;">и напиши, хочешь отправить ему карту сам или чтобы мы написали ему сами, что это подарок от тебя</li>
                </ol>
            </div>
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