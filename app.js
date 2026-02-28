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
        // Для всех платформ: открываем и сворачиваем/закрываем приложение
        window.open(url, '_blank');
        tg.close();
    } else {
        // Внешние ссылки (Робокасса) открываем во встроенном браузере, не закрывая приложение
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

const user = tg.initDataUnsafe?.user;
const userId = user?.id;
const firstName = user?.first_name || 'друг';

let userCard = { status: 'loading', hikes: 0, cardUrl: '' };
let metrics = { hikes: '19', kilometers: '150+', locations: '13', meetings: '130+' };

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

// Загрузка метрик из отдельного листа (с запретом кэширования)
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

async function loadData() {
    await Promise.all([loadUserData(), loadMetrics()]);
    log('visit', userCard.status !== 'active');
    renderHome();
    // Скрываем начальный спиннер
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

// ----- Вспомогательная функция для конфетти -----
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
function renderPriv() {
    subtitle.textContent = `🤘🏻твои привилегии, ${firstName}`;
    showBack(renderHome);

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
            <button id="goHome" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:20px 16px 0;">&lt; на главную</button>
        </div>`;
    document.getElementById('goHome')?.addEventListener('click', () => { haptic(); renderHome(); });
}

// ----- Страница привилегий для гостей -----
function renderGuestPriv() {
    subtitle.textContent = `💳 привилегии с картой интеллигента`;
    showBack(renderHome);

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
            <p>${p.privilege}</p>`;
        cityHtml += `<p>📍 <a href="${p.link}" target="_blank" style="color:#D9FD19;">${p.location}</a></p>`;
        cityHtml += `</div>`;
    });

    mainDiv.innerHTML = `
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>${cityHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                <a href="https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g" onclick="event.preventDefault(); openLink(this.href, 'buy_card_click', true); return false;" class="btn btn-yellow" style="width:calc(100% - 32px); margin:0 16px;" id="guestBuyBtn">купить карту</a>
                <button id="goHome" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>`;

    document.getElementById('goHome')?.addEventListener('click', () => { haptic(); renderHome(); });
    document.getElementById('guestBuyBtn')?.addEventListener('click', () => { haptic(); log('buy_card_click', true); });
}

// ----- Страница подарка -----
function renderGift(isGuest = false) {
    subtitle.textContent = `💫 как подарить карту`;
    showBack(renderHome);

    mainDiv.innerHTML = `
        <div class="card-container">
            <div class="gift-text" style="padding:0 16px;">
                <p style="margin-bottom:16px;">хочешь подарить карту интеллигента другу? тогда пришли нам в поддержку имя друга, его фамилию, @username в телеграм и твой чек об оплате карты (приходит на почту после покупки). мы выпустим карту на имя друга.</p>
                <p style="margin-bottom:16px;">если хочешь подарить ему карту сам – напиши «отправлю карту сам». если хочешь, чтобы её прислали мы, но сказали, что от тебя, напиши «подарите вы».</p>
                <p style="margin-bottom:20px;">как только друг получит карту у него станет активным наше приложение и он сможет им пользоваться.</p>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px; margin-top:20px;">
                <a href="https://auth.robokassa.ru/merchant/Invoice/wXo6FJOA40u5uzL7K4_X9g" onclick="event.preventDefault(); openLink(this.href, 'gift_purchase_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin-bottom:0;" id="giftBuyBtn">купить в подарок</a>
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'support_click', ${isGuest}); return false;" class="btn btn-white-outline" style="margin-bottom:0;" id="giftSupportBtn">написать в поддержку</a>
                <button id="goHome" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
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

// ----- Страница для новичков (FAQ) -----
function renderNewcomerPage(isGuest = false) {
    // Удаляем предыдущий обработчик скролла, если был
    if (window._floatingScrollHandler) {
        window.removeEventListener('scroll', window._floatingScrollHandler);
        window._floatingScrollHandler = null;
    }

    subtitle.textContent = `всё, что нужно знать`;
    showBack(() => renderHome());
    haptic();
    log('newcomer_page_opened', isGuest);

    const faq = [
        {
            q: '⛰️ что такое хайкинг?',
            a: 'хайкинг – это прогулки. но не по улицам бетонного города, а по манящим свежестью просторам природы. не уставившись себе под ноги, а подняв голову созерцая богатство твоей планеты. без преодоления себя. без палаток и ночёвок. 3-5 часов лёгкого и среднего уровня ходьбы по обустроенным тропам и видовым местам. да ещё и в компании таких же интеллигентов, как и ты'
        },
        {
            q: '🥾 чем вы отличаетесь от обычных походов?',
            a: 'мы здесь не про походы. не про туризм. не про экскурсии. мы про активную позицию в жизни, про здоровый отдых, про новые знакомства и дружбу, про эмоции и впечатления. 80% наших хайков – люди и общение, 20% – природа как идеальный контекст'
        },
        {
            q: '📋 как попасть на хайк?',
            a: '1. подпишись на канал @yaltahiking.\n2. следи за анонсами актуальных маршрутов (выходят в середине недели).\n3. ставь «голос» в комментариях к анонсу, если точно пойдёшь.\n4. оформи билет (ссылка в анонсе) – 1500₽, если у тебя ещё нет карты интеллигента.\n5. до встречи на точке сбора (координаты и время – в анонсе)'
        },
        {
            q: '💵 сколько стоит участие?',
            a: 'билет на хайк стоит 1500 ₽. если у тебя есть карта интеллигента – хайки бесплатны, плюс привилегии в городе и приоритетный запрос на мастермайнд. карта стоит 7500₽ и окупается уже на шестой хайк'
        },
        {
            q: '🎒 что брать с собой?',
            a: 'кроссовки с цепкой подошвой + дышащие носки + влагоотводящая футболка = база комфортного хайка. также захвати: чистую воду, перекус в виде быстрых углеводов; защиту от солнца: панаму или кепку, санскрин; на всякий нанеси защиту от клещей; ну, и небольшой удобный рюкзак или поясную сумку. в прохладное время: термокофта + флис + ветровка, штаны из нейлона, непромокаемая обувь'
        },
        {
            q: '🧠 что такое мастермайнд?',
            a: 'это формат коллективного мышления, которым уже больше сотни лет пользуются президенты, предприниматели и главные инноваторы планеты. на хайках мы собираемся на вершине, где каждый может поделиться своим запросом во время сессии – получить свежий взгляд, поддержку, идеи и полезные контакты от десятка людей, идущих рядом. у тебя появляются союзники, для которых твой запрос так же ценен, как их собственный'
        },
        {
            q: '💳 что даёт карта интеллигента?',
            a: '– бесплатные хайки\n– привилегии и скидки у партнёров\n– приоритетный запрос на мастермайнд\n– один гостевой хайк для друга (ему билет не нужен)\n– эксклюзивные маршруты для владельцев карт\n– концентрат мастермайнда: структурированный документ с записью сессии и ключевыми тезисами\n– наш собственный из «трёх букв» сервер, для обхода любых блокировок в интернете'
        },
        {
            q: '🙌🏻 нужна ли специальная подготовка?',
            a: 'нет. мы ходим по тропам лёгкого и среднего уровня. никакого преодоления себя – только отдых и удовольствие. «без подготовки. без экипировки. просто жди когда анонсируем интересный маршрут, приезжай вовремя на точку и пошли вместе наслаждаться лучшей жизнью».'
        },
        {
            q: '🛡️ как обеспечивается безопасность?',
            a: 'каждый маршрут мы тщательно продумываем и предварительно ходим на разведку. на маршруте есть опытный гид, базовая аптечка, фонарики, иногда берём для всех дождевики. если погода совсем нелётная – переносим хайк'
        },
        {
            q: '⭐ зачем звёзды в чате?',
            a: 'одна звезда – один пройденный с нами маршрут. когда набираешь три звезды, у тебя появляется доступ в наш закрытый чат для более близкого общения и неформальных встреч'
        },
        {
            q: '🍷 можно ли с алкоголем?',
            a: 'на маршруте мы обходимся без алкоголя, но порой заходим всей компанией в Капри на набережной, а там – любые удовольствия'
        },
        {
            q: '🎟️ нужен ли пропуск в заповедник?',
            a: 'если маршрут проходит по заповеднику и у тебя прописка не в Ялте/Севастополе, нужно оформить туристический пропуск на сайте zapovedcrimea.ru (занимает 2 минуты). если местный – пропуск местного жителя. не забудь паспорт – покажешь лесникам. есть маршруты, где пропуск не нужен, это указываем в анонсе'
        }
    ];

    let faqHtml = '';
    faq.forEach(item => {
        let answer = item.a;
        // Заменяем @yaltahiking на ссылку
        answer = answer.replace('@yaltahiking', '<a href="#" onclick="openLink(\'https://t.me/yaltahiking\', \'faq_channel_click\', false); return false;">@yaltahiking</a>');
        // Заменяем zapovedcrimea.ru на ссылку
        answer = answer.replace('zapovedcrimea.ru', '<a href="#" onclick="openLink(\'https://zapovedcrimea.ru/choose-pass\', \'faq_pass_click\', false); return false;">zapovedcrimea.ru</a>');
        // Заменяем переносы строк на <br>
        answer = answer.replace(/\n/g, '<br>');
        faqHtml += `<div class="partner-item"><strong>${item.q}</strong><p>${answer}</p></div>`;
    });

    mainDiv.innerHTML = `
        <div class="card-container newcomer-page">
            ${faqHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px; margin-bottom: 10px;">
                <!-- статическая кнопка на случай отключения JS или для старых браузеров, но она будет перекрыта плавающей, оставим на всякий случай -->
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'newcomer_support_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin:0 16px;">задать вопрос</a>
                <button id="goHomeStatic" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
        <div class="floating-btn-container" id="floatingBtnContainer">
            <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'floating_support_click', ${isGuest}); return false;" class="btn btn-yellow">задать вопрос</a>
            <a href="#" id="floatingGoHome" class="btn btn-white-outline">на главную</a>
        </div>
    `;

    const floatingContainer = document.getElementById('floatingBtnContainer');
    const floatingGoHome = document.getElementById('floatingGoHome');
    if (floatingGoHome) {
        floatingGoHome.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            renderHome();
        });
    }

    // Обработчик для статической кнопки "на главную"
    document.getElementById('goHomeStatic')?.addEventListener('click', () => {
        haptic();
        renderHome();
    });

    function checkFloatingButton() {
        if (!floatingContainer) return;
        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        // если до конца документа осталось меньше 150px, скрываем плавающую кнопку
        if (documentHeight - (scrollY + windowHeight) < 150) {
            floatingContainer.classList.add('hidden');
        } else {
            floatingContainer.classList.remove('hidden');
        }
    }

    // запускаем сразу
    checkFloatingButton();

    const scrollHandler = () => {
        requestAnimationFrame(checkFloatingButton);
    };
    window.addEventListener('scroll', scrollHandler);
    window.addEventListener('resize', scrollHandler);

    // сохраняем обработчик для удаления при выходе
    window._floatingScrollHandler = scrollHandler;
}

// ----- Главная для гостей -----
function renderGuestHome() {
    const isGuest = true;
    subtitle.textContent = `💳 здесь будет твоя карта, ${firstName}`;
    subtitle.classList.add('subtitle-guest');

    mainDiv.innerHTML = `
        <div class="card-container">
            <img src="https://i.postimg.cc/J0GyF5Nw/fwvsvfw.png" alt="карта заглушка" class="card-image" id="guestCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">?</span></div>
            <a href="https://t.me/yaltahiking/197" onclick="event.preventDefault(); openLink(this.href, 'buy_card_click', true); return false;" class="btn btn-yellow" id="buyBtn">узнать о карте</a>
            <button class="btn btn-white-outline" id="guestPrivBtn">узнать о привилегиях</button>
            <div id="navAccordionGuest">
                <button class="accordion-btn">
                    навигация по клубу <span class="arrow">👀</span>
                </button>
                <div class="dropdown-menu">
                    <a href="https://t.me/yaltahiking/149" onclick="event.preventDefault(); openLink(this.href, 'nav_about', true); return false;" class="btn btn-white-outline">о клубе</a>
                    <a href="https://t.me/yaltahiking/170" onclick="event.preventDefault(); openLink(this.href, 'nav_philosophy', true); return false;" class="btn btn-white-outline">философия</a>
                    <a href="https://t.me/yaltahiking/246" onclick="event.preventDefault(); openLink(this.href, 'nav_hiking', true); return false;" class="btn btn-white-outline">о хайкинге</a>
                    <a href="https://t.me/yaltahiking/a/2" onclick="event.preventDefault(); openLink(this.href, 'nav_reviews', true); return false;" class="btn btn-white-outline">отзывы</a>
                </div>
            </div>
            <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'support_click', true); return false;" class="btn btn-white-outline" id="supportBtn">написать в поддержку</a>
        </div>

        <!-- Блок для новичков (для гостей) -->
        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest">
                <span class="newcomer-text">как всё устроено</span>
                <img src="https://i.postimg.cc/k533cR9Z/fv.png" alt="новичкам" class="newcomer-image">
            </div>
        </div>
        
        <!-- Блок метрик -->
        <div class="card-container">
            <div class="metrics-header">
                <h2 class="metrics-title">🌍 клуб в цифрах</h2>
                <a href="https://t.me/yaltahiking/148" onclick="event.preventDefault(); openLink(this.href, 'reports_click', true); return false;" class="metrics-link">смотреть отчёты &gt;</a>
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
            <a href="https://t.me/yaltahiking" onclick="event.preventDefault(); openLink(this.href, 'channel_click', true); return false;" class="btn btn-white-outline">📰 открыть канал</a>
            <a href="https://t.me/yaltahikingchat" onclick="event.preventDefault(); openLink(this.href, 'chat_click', true); return false;" class="btn btn-white-outline">💬 открыть чат</a>
            <a href="#" class="btn btn-white-outline" id="giftBtn">🫂 подарить карту другу</a>
        </div>
    `;

    document.getElementById('guestCardImage')?.addEventListener('click', () => {
        haptic();
        showGuestPopup();
    });
    document.getElementById('buyBtn')?.addEventListener('click', () => { haptic(); log('buy_card_click', true); });
    document.getElementById('guestPrivBtn')?.addEventListener('click', () => { haptic(); log('guest_priv_click', true); renderGuestPriv(); });
    document.getElementById('supportBtn')?.addEventListener('click', () => { haptic(); log('support_click', true); });
    document.getElementById('giftBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        log('gift_click', true);
        renderGift(true);
    });
    
    // Обработчик кнопки новичков для гостей
    document.getElementById('newcomerBtnGuest')?.addEventListener('click', () => {
        haptic();
        log('newcomer_btn_click', true);
        renderNewcomerPage(true); // isGuest = true
    });

    setupAccordion('navAccordionGuest', true);
}

// ----- Главная для владельцев карты (с блоком для новичков) -----
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

            <!-- Блок для новичков (обновлённый текст и картинка) -->
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
        
        // Обработчик новой кнопки
        document.getElementById('newcomerBtn')?.addEventListener('click', () => {
            haptic();
            log('newcomer_btn_click', false);
            renderNewcomerPage(false); // isGuest = false
        });

        setupAccordion('navAccordionOwner', false);
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
