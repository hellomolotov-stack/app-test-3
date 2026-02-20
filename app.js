// Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();

const backButton = tg.BackButton;

function showBack(callback) {
    backButton.offClick();
    backButton.onClick(callback);
    backButton.show();
}

function hideBack() {
    backButton.hide();
}

// Конфигурация
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZVtOiVkMUUzwJbLgZ9qCqqkgPEbMcZv4DANnZdWQFkpSVXT6zMy4GRj9BfWay_e1Ta3WKh1HVXCqR/pub?output=csv';
const GUEST_API_URL = 'https://script.google.com/macros/s/AKfycby0943sdi-neS00sFzcyT-rsmzQgPOD4vsOYMnnLYSK8XcEIQJynP1CGsSWP62gK1zxSw/exec';

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = { status: 'loading', hikes: 0, cardUrl: '' };

const mainDiv = document.getElementById('mainContent');
const subtitle = document.getElementById('subtitle');

function log(action) {
    if (!userId) return;
    const params = new URLSearchParams({
        user_id: userId,
        username: user?.username || '',
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        action: action
    });
    new Image().src = `${GUEST_API_URL}?${params}`;
}

async function loadData() {
    if (!userId) { userCard.status = 'inactive'; renderHome(); return; }
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
        console.error(e);
        userCard.status = 'inactive';
    }
    log('visit');
    renderHome();
}

// ---------- ПОЛНЫЙ МАССИВ ПАРТНЁРОВ ----------
const partners = [
    {
        name: 'экипировочный центр Геккон',
        privilege: '-10% по карте интеллигента',
        location: 'Ялта, ул. Московская 8А',
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
        location: 'г. Ялта, ул. Свердлова, 13/2',
        link: 'https://yandex.ru/maps/org/vozmozhno_vsyo/154873148683?si=xvnyyrd9reydm8tbq186v5f82w'
    },
    {
        name: 'магазин косметики На Утро: На Вечер',
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

// ---------- Рендер страницы привилегий ----------
function renderPriv() {
    subtitle.textContent = `🤘🏻твои привилегии, ${firstName}`;
    showBack(renderHome);

    // Привилегии в клубе
    let club = [
        { t: 'бесплатное участие', d: 'один раз оформляешь карту – теперь ты член клуба. окупишь на шестом хайке. дальше бесплатно.' },
        { t: 'гостевой хайк', d: 'ты можешь взять с собой друга на его первый маршрут с клубом. ему не нужно покупать билет.' },
        { t: 'приоритетный запрос на мастермайнд', d: 'владельцы карт могут забронировать запрос и на ближайшем хайке получить опыт и контакты.', btn: 'забронировать запрос' },
        { t: 'new: обход блокировок', d: 'получи настройки, которые вернут заблокированные ресурсы.', btn: 'получить настройки' }
    ];

    let clubHtml = '';
    club.forEach(c => {
        clubHtml += `<div class="partner-item"><strong>${c.t}</strong><p>${c.d}</p>${c.btn ? `<a href="https://t.me/hellointelligent" target="_blank" class="btn btn-yellow" style="margin-top:12px;">${c.btn}</a>` : ''}</div>`;
    });

    // Привилегии в городе (партнёры)
    let cityHtml = '';
    partners.forEach(p => {
        cityHtml += `<div class="partner-item">
            <strong>${p.name}</strong>
            <p>привилегии: ${p.privilege}</p>
            <p>📍 <a href="${p.link}" target="_blank" style="color:#D9FD19;">${p.location}</a></p>
        </div>`;
    });

    mainDiv.innerHTML = `
        <div class="card-container">
            <h2 class="section-title">✨ в клубе</h2>${clubHtml}
            <h2 class="section-title second">🏙️ в городе</h2>${cityHtml}
            <button id="goHome" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:20px 16px 0;">&lt; на главную</button>
        </div>`;
    document.getElementById('goHome')?.addEventListener('click', renderHome);
}

// ---------- Страница подарка ----------
function renderGift() {
    subtitle.textContent = `🎁 подарить карту`;
    showBack(renderHome);
    mainDiv.innerHTML = `
        <div class="card-container">
            <div class="gift-text" style="padding:0 16px;">
                <p style="margin-bottom:16px;">Чтобы подарить карту другу, пришли в поддержку:</p>
                <ol style="margin-left:20px; margin-bottom:20px;">
                    <li>имя</li><li>фамилию</li><li>@username</li><li>чек о покупке</li>
                    <li>и напиши, хочешь отправить сам или чтобы мы написали, что это подарок</li>
                </ol>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:20px;">
                <a href="https://t.me/hellointelligent" target="_blank" class="btn btn-yellow" style="width:calc(100% - 32px); margin:0 16px;">написать в поддержку</a>
                <button id="goHome" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>`;
    document.getElementById('goHome')?.addEventListener('click', renderHome);
}

// ---------- Рендер главного экрана ----------
function renderHome() {
    hideBack();
    if (userCard.status === 'active') subtitle.textContent = `💳 твоя карта, ${firstName}`;
    else subtitle.textContent = `👋🏻 добро пожаловать в клуб хайкинг интеллигенции, ${firstName}`;

    if (userCard.status === 'loading') { mainDiv.innerHTML = '<div class="loader" style="display:flex; justify-content:center; padding:40px 0;">Загрузка...</div>'; return; }

    if (userCard.status === 'active' && userCard.cardUrl) {
        mainDiv.innerHTML = `
            <div class="card-container">
                <img src="${userCard.cardUrl}" alt="карта" class="card-image">
                <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">${userCard.hikes}</span></div>
                <a href="#" class="btn btn-yellow" id="privBtn">мои привилегии</a>
                <a href="https://t.me/hellointelligent" target="_blank" class="btn btn-white-outline" id="supportBtn">написать в поддержку</a>
            </div>
            <div class="extra-links">
                <a href="https://t.me/yaltahiking" target="_blank" class="btn btn-white-outline">📰 открыть канал клуба</a>
                <a href="https://t.me/yaltahikingchat" target="_blank" class="btn btn-white-outline">💬 открыть чат</a>
                <a href="#" class="btn btn-white-outline" id="giftBtn">🫂 подарить карту другу</a>
            </div>
        `;
        document.getElementById('privBtn')?.addEventListener('click', (e) => { e.preventDefault(); log('privilege_click'); renderPriv(); });
        document.getElementById('supportBtn')?.addEventListener('click', () => log('support_click'));
        document.getElementById('giftBtn')?.addEventListener('click', (e) => { e.preventDefault(); log('gift_click'); renderGift(); });
        document.querySelectorAll('.extra-links a')[0]?.addEventListener('click', () => log('channel_click'));
        document.querySelectorAll('.extra-links a')[1]?.addEventListener('click', () => log('chat_click'));
    } else {
        mainDiv.innerHTML = `
            <div style="padding:20px 0;">
                <button id="buyBtn" class="btn btn-blue">💳 купить карту</button>
                <a href="https://t.me/yaltahiking/197" target="_blank" class="btn btn-outline-blue">📖 подробнее о карте</a>
            </div>`;
        document.getElementById('buyBtn')?.addEventListener('click', buyCard);
    }
}

function buyCard() {
    if (!userId) return;
    log('buy_card_click');
    tg.openLink('https://auth.robokassa.ru/merchant/Invoice/VolsQzE1I0G-iHkIWVJ0eQ');
}

window.addEventListener('load', loadData);
