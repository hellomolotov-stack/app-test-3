// js/ui/onboarding-chat.js
// Встроенный чат-помощник — выезжающая снизу шторка.
// Первый экран — действие: карточка ближайшего хайка и короткие входы под того, кто пишет
// (новичок, вернувшийся гость, член клуба). Тексты нейтральны по роду: пола в профиле нет.
// Динамика (ближайший хайк, число записавшихся, FAQ, привилегии) берётся из state.

import { state } from '../state.js';
import { haptic, openLink, formatDateForDisplay, tg, scrollToElement } from '../utils.js';
import { log } from '../api.js';
import { sendSupportMessage, subscribeToAdminReplies, markSupportMessageRead, loadSupportMessages, loadAllParticipants } from '../firebase.js';
import { showBottomSheet, showGuestBookingPopup } from './calendar.js';
import { renderHome } from './home.js';
import { isPersonalMapPilotUser } from './personal-routes-map.js';

const SUPPORT = 'https://t.me/hellointelligent';
const CHANNEL = 'https://t.me/yaltahiking';

// Флаг режима Люмена — устанавливается при открытии чата (сейчас пилот Люмена выключен)
let lumenActive = false;

// ──────────────────────────────────────────────
// реальные отзывы участников (ротация)
// ──────────────────────────────────────────────
const REVIEWS = [
    ['момент, где совпало место, время и люди – чувствуется как настоящая жизнь. без шаблонов, без наигранной картинки в сети. я почувствовала человеческую связь, близость, возможность быть уязвимым – и получать поддержку', '– после хайка на Эклизи-Бурун'],
    ['давно хотела пойти на хайк и хорошо, что нашла вас) это был действительно незабываемый опыт. живописные виды, свежий воздух, хорошая компания – масса положительных эмоций. обязательно повторю 🌊', '– первый хайк'],
    ['это было уютно, дружно, глубоко, красиво', '– коротко и по делу'],
    ['ожидала, что будет как минимум интересное общение, но оказалось куда интереснее. сама компания и сопутствующий досуг сделали день ярким. рекомендую – это куда лучше, чем общаться по интернету', '– участница маршрута'],
    ['когда поднимаешься на вершину, рождается чёткое убеждение, что ты можешь подняться вообще куда угодно. а когда смотришь на эти виды – рождается желание увидеть весь мир', '– из отзыва девушки, впервые в Крыму'],
    ['хайкинг вдохнул в меня жизнь новыми впечатлениями, когда это было так нужно. стало легче выходить за рамки, проще относиться к работе. хочется радоваться жизни)', ''],
];

function randomReview() {
    const [text, author] = REVIEWS[Math.floor(Math.random() * REVIEWS.length)];
    return author ? `💬 <i>«${text}»</i>\n\n<b>${author}</b>` : `💬 <i>«${text}»</i>`;
}

// ──────────────────────────────────────────────
// динамические данные из приложения
// ──────────────────────────────────────────────
const isMember = () => state.userCard?.status === 'active';
const isGuestLog = () => !isMember();

function capName(n) {
    n = (n || '').trim();
    return n ? n[0].toUpperCase() + n.slice(1) : '';
}

// Ближайший хайк: без отменённых, городских событий и книжного клуба.
function getNextHike() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = (state.hikesWithTitle || [])
        .filter(h => h.date && !h.cancelled && h.city !== true && h.city !== 'yes' && h.book_club !== true)
        .map(h => ({ ...h, _d: new Date(h.date) }))
        .filter(h => !isNaN(h._d.getTime()) && h._d >= today)
        .sort((a, b) => a._d - b._d);
    return upcoming[0] || null;
}

function nextHikeLine() {
    const h = getNextHike();
    return h ? `${h.title} – ${formatDateForDisplay(h.date)}` : 'новый маршрут скоро появится в календаре';
}

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
function weekday(date) {
    const [y, m, d] = String(date).split('-').map(Number);
    return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}
function peopleWord(n) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return 'человек';
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'человека';
    return 'человек';
}

// Число записавшихся подгружаем при открытии чата, чтобы карточка показала его сразу.
let nextHikeGoing = null;
async function prefetchGoing() {
    nextHikeGoing = null;
    const h = getNextHike();
    if (!h) return;
    try {
        const list = await Promise.race([loadAllParticipants(h.date), new Promise(r => setTimeout(() => r(null), 1500))]);
        if (Array.isArray(list)) nextHikeGoing = list.length;
    } catch (e) { /* без счётчика карточка тоже работает */ }
}

// Карточка ближайшего хайка — первый экран чата. Нажатие открывает слайдер хайка с записью.
function hikeCardHtml(kicker = 'ближайший хайк') {
    const h = getNextHike();
    if (!h) {
        return `<div class="chat-hike-card is-empty"><div class="chk-kicker">${kicker}</div><div class="chk-title">скоро в календаре</div><div class="chk-meta">обычно анонсируем за неделю – свежие новости на канале клуба</div></div>`;
    }
    const going = nextHikeGoing ? ` · уже ${nextHikeGoing} ${peopleWord(nextHikeGoing)}` : '';
    const time = h.start_time ? ` · ${h.start_time}` : '';
    return `<div class="chat-hike-card" data-book="1"><div class="chk-kicker">${kicker}</div><div class="chk-title">${h.title}</div><div class="chk-meta">${weekday(h.date)}, ${formatDateForDisplay(h.date)}${time}${going}</div><div class="chk-cta">смотреть и записаться →</div></div>`;
}

// ──────────────────────────────────────────────
// тексты
// ──────────────────────────────────────────────
function welcomeText() {
    const name = capName(state.user?.first_name);
    return `${name ? `привет, ${name}` : 'привет'} 👋\n\nэто <b>хайкинг интеллигенция</b> – каждые выходные ходим в горы южного берега и знакомимся вживую, без экранов и масок\n\nвот куда идём дальше 👇`;
}

const WELCOME_BACK_VARIANTS = [
    name => `с возвращением${name ? ', ' + name : ''} 🤍\n\nгоры на месте, маршрут уже выбран 👇`,
    name => `снова здесь${name ? ', ' + name : ''} 🙌\n\nесли давно думаешь о хайке – это нормально. одна наша участница думала пять месяцев, а теперь ходит каждые выходные\n\nближайший маршрут 👇`,
    name => `привет${name ? ', ' + name : ''} ☀️\n\nвот куда идём дальше 👇`,
];
const K_LAST_WB = 'botLastWbIdx';
function welcomeBackText() {
    const name = capName(state.user?.first_name);
    let last = -1;
    try { last = parseInt(localStorage.getItem(K_LAST_WB) ?? '-1', 10); } catch (e) { /* без хранилища */ }
    let idx = Math.floor(Math.random() * WELCOME_BACK_VARIANTS.length);
    if (idx === last) idx = (idx + 1) % WELCOME_BACK_VARIANTS.length;
    try { localStorage.setItem(K_LAST_WB, String(idx)); } catch (e) { /* без хранилища */ }
    return WELCOME_BACK_VARIANTS[idx](name);
}

function memberHomeText() {
    const name = capName(state.user?.first_name);
    return `${name ? `${name}, привет` : 'привет'} 🤍\n\nты здесь не гость – всё открыто. куда идём в эти выходные 👇`;
}

function memberPerksText() {
    const club = (state.privileges?.club || []).filter(p => p.title);
    if (club.length > 0) {
        return `<b>что тебе доступно с картой:</b>\n\n${club.map(p => `🌟 <b>${p.title}</b>${p.description ? '\n' + p.description : ''}`).join('\n\n')}`;
    }
    return '<b>что тебе доступно с картой:</b>\n\n🌟 <b>все хайки и события</b> – просто приходишь, без доплат\n\n🌟 <b>закрытый чат</b> – свои люди, близкое общение, неформальные встречи\n\n🌟 <b>закрытые события</b> – ужины, пляжные пикники, сапы, мастермайнды\n\n🌟 <b>безлимитный VPN</b> для всех устройств\n\n🌟 <b>скидки у партнёров</b> в Ялте и онлайне';
}

function memberPartnersText() {
    const city = (state.privileges?.city || []).filter(p => p.title);
    if (city.length === 0) return null;
    const lines = city.map(p => {
        let block = `🤝 <span style="color:#fff;font-weight:600">${p.title}</span>`;
        if (p.description) block += `\n${p.description}`;
        if (p.button_link) {
            const md = p.button_link.match(/^\[(.+?)\]\((.+?)\)$/);
            if (md) block += `\n<a href="${md[2]}" style="color:#d9fd19;text-decoration:none">${md[1]}</a>`;
            else block += `\n<a href="${p.button_link}" style="color:#d9fd19;text-decoration:none">${p.button_text || 'перейти →'}</a>`;
        }
        return block;
    }).join('\n\n');
    return `<span style="color:#fff;font-weight:600">скидки у партнёров:</span>\n\n${lines}`;
}

function firstTimeText() {
    const price = isMember() ? 'с картой все хайки для тебя без доплат 🤍' : 'билет на хайк – <b>1000 ₽</b>, записаться можно прямо в приложении 🎟️';
    return `<b>как проходит первый хайк</b>\n\n📍 встречаемся на точке старта – адрес и время в карточке хайка\n\n🥾 идём 3–5 часов по готовым тропам южного берега, лёгкий или средний уровень. никто не торопит, остановок много\n\n🤝 по пути знакомимся, говорим, фотографируем. на вершине иногда собираемся в круг – мастермайнд\n\n🎒 нужны кроссовки с цепкой подошвой, вода и перекус. подготовка не нужна\n\n${price}`;
}

const CARD_MEMBERSHIP_LINE = 'карта интеллигента – это членство, а не билет. мы ограничиваем число новых членов каждый месяц, чтобы каждого заметили, а не растворили в толпе';
function cardText() {
    return `<b>карта интеллигента</b> – это когда ты больше не гость\n\nоформляешь один раз и становишься частью клуба:\n\n🌟 <b>все хайки и события</b> – просто приходишь, без доплат\n🌟 <b>закрытый чат</b> – свои люди, близкое общение, неформальные встречи\n🌟 <b>закрытые события</b> – ужины, пляжные пикники, сапы, мастермайнды\n🌟 <b>скидки у партнёров</b> в Ялте и онлайне\n🌟 <b>безлимитный VPN</b> для всех устройств\n\n<b>бессрочная – 7 500 ₽</b>, навсегда\n<b>сезонная – 5 500 ₽</b>, до конца 2026\n\n${CARD_MEMBERSHIP_LINE}`;
}

const TEXT_TRY_FIRST = 'отличный план 🏔\n\nсходи на хайк по билету за 1000 ₽ – а карту оформишь, когда почувствуешь, что это твоё\n\nесли что-то непонятно – напиши, ответим 🤍';

const DOUBTS_INTRO = 'это нормально – почти все сомневались перед первым хайком\n\nчто останавливает?';
const TEXTS_DOUBTS = {
    d_awkward: '<b>неловко в группе незнакомых людей</b>\n\nпервые 15 минут – да, бывает\n\nпотом неловкость уходит сама: общий путь, общие виды, общий ритм. через час кажется, что вышли погулять с давними друзьями – в этом и магия клуба',
    d_pace: '<b>вдруг будет тяжело и получится отстать</b>\n\nхайкинг – не про скорость и выносливость. мы не беговое сообщество и не клуб профессиональных туристов\n\nхайк – прогулка в удовольствие по проложенным тропам. с остановками, беседами и шутками про чихнувшую белку. темп общий, никого не оставляем',
    d_gear: '<b>нет подходящей обуви и одежды</b>\n\nкроссовки не с плоской подошвой и не жаркая одежда есть? этого достаточно\n\nостальное – детали. а когда влюбишься в это дело – побалуй себя хоками и альтрами 😉',
    d_shy: '<b>сложно знакомиться первым</b>\n\nи не нужно. формат всё сделает сам: общий маршрут, общие моменты – и разговор рождается естественно\n\nможно просто идти рядом и слушать. это тоже участие',
    d_ordinary: '<b>кажется, там все очень крутые</b>\n\nу нас правда встречаются предприниматели, специалисты, творческие люди и те, кто только ищет своё дело\n\nно в горах профессия не важна: важных себя оставляем внизу, в городе. наверх берём только человека',
};

const TEXTS_EXP = {
    exp_nature: 'горы южного берега – это что-то особенное\n\nвиды на море с высоты, аромат хвои, чистый воздух и 3–5 часов без экрана – именно это мы и делаем каждые выходные. подготовка не нужна 🙌',
    exp_social: 'знакомиться вживую, а не в приложениях – это по-нашему\n\nна хайке люди рядом, впечатления общие, разговоры настоящие. уже после первого маршрута кажется, что знакомы давно\n\nа с картой интеллигента открывается закрытый чат клуба 🤍',
    exp_curious: 'кратко: <b>хайкинг интеллигенция</b> – сообщество людей, которые решили жить интересно: горы, события, знакомства, смыслы\n\nклуб живёт с мая 2025 – больше 20 маршрутов и много событий в Ялте',
};

// ──────────────────────────────────────────────
// дерево диалога
// ──────────────────────────────────────────────
const START_NODES = new Set(['welcome', 'welcome_back', 'member_welcome']);
const TEXT_PACK = '<b>что взять на хайк</b>\n\n🎒 небольшой рюкзак – чтобы руки были свободны\n💧 вода – 1–1,5 л\n🥪 перекус: бутерброды, орехи, фрукты, шоколад\n👟 кроссовки или ботинки с цепкой подошвой и закрытым носком\n🧥 одежда слоями: футболка и лёгкая кофта или ветровка – на вершине ветрено\n🧢 головной убор и санскрин – солнце в горах сильнее\n🔋 заряженный телефон, лучше с пауэрбанком\n\nв прохладные месяцы добавь тёплый слой и шапку. остальное – по желанию: палки, термос с чаем, коврик посидеть на вершине';
const BOOK = { label: 'записаться на хайк 🏔', action: 'book' };
const QUESTION = { label: 'у меня вопрос 💬', next: 'support' };

const AFTER_DOUBT = [
    { label: 'отпустило 😮‍💨', next: 'relieved' },
    { label: 'есть ещё сомнение', next: 'doubts' },
    BOOK,
];

const FLOW = {
    // новичок: сразу карточка хайка и короткие входы, сомнения — на первом экране
    welcome: {
        msgs: [welcomeText, () => hikeCardHtml()],
        options: [
            BOOK,
            { label: 'первый раз – что меня ждёт?', next: 'first_time' },
            { label: 'честно – есть сомнения', next: 'doubts' },
            QUESTION,
        ],
    },
    welcome_back: {
        msgs: [welcomeBackText, () => hikeCardHtml()],
        options: [
            BOOK,
            { label: 'честно – есть сомнения', next: 'doubts' },
            { label: '🌟 карта интеллигента', next: 'card' },
            QUESTION,
        ],
    },
    // член клуба: своё меню
    member_welcome: {
        msgs: [memberHomeText, () => hikeCardHtml('в эти выходные')],
        options: () => [
            { label: 'открыть хайк 🏔', action: 'book' },
            ...(isPersonalMapPilotUser(state.user) ? [{ label: '🗺 мой Крым', action: 'my_crimea' }] : []),
            { label: 'привилегии и партнёры', next: 'member_perks' },
            { label: 'как всё устроено', next: 'faq' },
            QUESTION,
        ],
    },
    member_perks: {
        msgs: [memberPerksText],
        options: [
            { label: 'скидки у партнёров →', next: 'member_partners' },
            QUESTION,
        ],
    },
    member_partners: {
        msgs: [() => memberPartnersText() || 'скоро тут появятся новые партнёры 🤍'],
        options: [BOOK, QUESTION],
    },
    first_time: {
        msgs: [firstTimeText, randomReview],
        options: () => [
            BOOK,
            { label: 'честно – есть сомнения', next: 'doubts' },
            isMember() ? { label: 'привилегии участника →', next: 'member_perks' } : { label: 'а что за карта интеллигента?', next: 'card' },
            { label: 'все вопросы и ответы', next: 'faq' },
        ],
    },
    // старое имя узла: на него ссылаются снаружи и сценарий «о клубе»
    about: {
        msgs: [firstTimeText, randomReview],
        options: () => FLOW.first_time.options(),
    },
    experience: {
        msgs: ['расскажи – что тебя сюда привело?'],
        options: [
            { label: '🏔 горы и природа', next: 'exp_nature' },
            { label: '🤝 хочу знакомиться вживую', next: 'exp_social' },
            { label: '🔍 просто интересно, что за клуб', next: 'exp_curious' },
        ],
    },
    exp_nature: { msgs: [() => TEXTS_EXP.exp_nature], options: [{ label: 'как проходит хайк? →', next: 'first_time' }, BOOK] },
    exp_social: { msgs: [() => TEXTS_EXP.exp_social], options: [{ label: 'как проходит хайк? →', next: 'first_time' }, BOOK] },
    exp_curious: { msgs: [() => TEXTS_EXP.exp_curious], options: [{ label: 'как проходит хайк? →', next: 'first_time' }, BOOK] },
    doubts: {
        msgs: [DOUBTS_INTRO],
        options: [
            { label: '😬 будет неловко с незнакомыми', next: 'd_awkward' },
            { label: '😮‍💨 вдруг не выдержу темп', next: 'd_pace' },
            { label: '👟 нет подходящей обуви и одежды', next: 'd_gear' },
            { label: '🫣 сложно знакомиться первым', next: 'd_shy' },
            { label: '🤔 кажется, там все очень крутые', next: 'd_ordinary' },
        ],
    },
    d_awkward: { msgs: [() => TEXTS_DOUBTS.d_awkward], options: AFTER_DOUBT },
    d_pace: { msgs: [() => TEXTS_DOUBTS.d_pace], options: AFTER_DOUBT },
    d_gear: { msgs: [() => TEXTS_DOUBTS.d_gear], options: AFTER_DOUBT },
    // «собери рюкзак» с экрана после записи
    pack: { msgs: [() => TEXT_PACK], options: [{ label: 'как проходит хайк? →', next: 'first_time' }, QUESTION] },
    d_shy: { msgs: [() => TEXTS_DOUBTS.d_shy], options: AFTER_DOUBT },
    d_ordinary: { msgs: [() => TEXTS_DOUBTS.d_ordinary], options: AFTER_DOUBT },
    relieved: {
        msgs: [() => 'вот и славно 🤍 тогда не откладывай – выбери хайк и запишись', () => hikeCardHtml()],
        options: () => [
            BOOK,
            isMember() ? { label: 'привилегии участника →', next: 'member_perks' } : { label: 'а что за карта интеллигента?', next: 'card' },
        ],
    },
    card: {
        msgs: [cardText],
        options: [
            // Оплата только через попап приложения: там счёт создаётся на сервере и привязан к человеку.
            // Статичная ссылка Робокассы не давала ни записи, ни возврата в приложение.
            { label: 'стать своим – от 5 500₽', action: 'buy_card' },
            { label: 'сначала схожу на хайк →', next: 'try_first' },
            QUESTION,
        ],
    },
    try_first: {
        msgs: [TEXT_TRY_FIRST],
        options: [BOOK, { label: 'канал клуба', href: CHANNEL, logName: 'канал клуба' }],
    },
    support: {
        msgs: ['напиши вопрос – передам организаторам. как только ответят, покажу здесь 🤍'],
        dynamic: 'support_input',
    },
    safety_report: {
        msgs: ['спасибо, что делишься – это важно 🤍\n\nнапиши прямо сюда, я сразу передам организаторам'],
        dynamic: 'support_input',
    },
    // faq — динамический узел, options строятся в buildOptions
    faq: {
        msgs: ['<b>как всё устроено</b>\n\nвыбери тему 👇'],
        dynamic: 'faq_list',
    },

    // Люмен: знакомство по имени
    lumen_greet_name: {
        msgs: [() => {
            const name = capName(state.user?.first_name);
            return `рад знакомству${name ? `, ${name}` : ''}! 🤍\n\nдавай за пару минут расскажу, как здесь всё устроено`;
        }],
        options: [{ label: 'давай 👋', next: 'experience' }],
    },
    // Люмен: рассказывает о себе
    lumen_about: {
        msgs: ['я Люмен – не турист, не робот и не сказочный персонаж.\n\nэто художественное воплощение состояния, которое можно найти внутри клуба: живости, открытости, тепла и способности снова удивляться.\n\nмой свет не приходит извне – я просто подсвечиваю следующий шаг, когда это нужно 🌿'],
        options: [{ label: 'расскажи про клуб →', next: 'experience' }, BOOK],
    },
};

function startNodeFor() {
    if (isMember()) return 'member_welcome';
    try { if (localStorage.getItem(K_VISITED)) return 'welcome_back'; } catch (e) { /* без хранилища */ }
    return 'welcome';
}
const K_VISITED = 'chatOnboardingVisited';

const CHAT_STYLES_ID = 'botChatExtraStyles';
function injectChatStyles() {
    if (document.getElementById(CHAT_STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = CHAT_STYLES_ID;
    style.textContent = `
        .chat-bubble.bot.has-card { padding: 0; background: none; border: 0; box-shadow: none; max-width: 100%; width: 100%; }
        .chat-hike-card { padding: 14px 16px; border-radius: 18px; background: linear-gradient(135deg, rgba(217,253,25,.16), rgba(217,253,25,.05)); border: 1px solid rgba(217,253,25,.35); cursor: pointer; white-space: normal; }
        .chat-hike-card.is-empty { cursor: default; background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.12); }
        .chat-hike-card .chk-kicker { font-size: 11px; font-weight: 700; color: #D9FD19; letter-spacing: .02em; }
        .chat-hike-card.is-empty .chk-kicker { color: rgba(255,255,255,.55); }
        .chat-hike-card .chk-title { margin-top: 4px; font-size: 17px; font-weight: 800; color: #fff; line-height: 1.2; }
        .chat-hike-card .chk-meta { margin-top: 4px; font-size: 13px; color: rgba(255,255,255,.65); line-height: 1.35; }
        .chat-hike-card .chk-cta { margin-top: 10px; font-size: 13px; font-weight: 700; color: #D9FD19; }
        .chat-option-btn.is-home { opacity: .6; }
    `;
    document.head.appendChild(style);
}

// ──────────────────────────────────────────────
// состояние шторки
// ──────────────────────────────────────────────
let overlay = null;
let messagesEl = null;
let optionsEl = null;
let busy = false;
let unsubscribeReplies = null;

function closeChat() {
    if (!overlay) return;
    if (unsubscribeReplies) { unsubscribeReplies(); unsubscribeReplies = null; }
    const sheet = overlay.querySelector('.bottom-sheet');
    overlay.classList.remove('visible');
    if (sheet) sheet.style.transform = 'translateY(100%)';
    setTimeout(() => { overlay?.remove(); overlay = null; }, 400);
}

function goToCalendar() {
    log('из чата в календарь', state.userCard.status !== 'active', state.user);
    closeChat();
    renderHome();
    setTimeout(() => {
        const cal = document.getElementById('calendarContainer');
        if (!cal) return;
        const offset = (tg?.contentSafeAreaInset?.top || 0) + 60;
        scrollToElement(cal, offset);
        cal.style.transition = 'box-shadow 0.5s';
        cal.style.boxShadow = '0 0 20px 5px rgba(255,255,255,0.7)';
        setTimeout(() => { cal.style.boxShadow = ''; }, 2000);
    }, 300);
}

// добавляет пузырь сообщения бота
function addBotBubble(html) {
    const b = document.createElement('div');
    b.className = 'chat-bubble bot';
    b.style.whiteSpace = 'pre-line';
    b.innerHTML = html;
    const card = b.querySelector('.chat-hike-card[data-book]');
    if (card) {
        b.classList.add('has-card');
        card.addEventListener('click', () => { if (!busy) onOption({ label: 'смотреть хайк', action: 'book', fromCard: true }); });
    } else if (b.querySelector('.chat-hike-card')) {
        b.classList.add('has-card');
    }
    messagesEl.appendChild(b);
    scrollToTop(b);
}

// добавляет пузырь выбора пользователя (справа)
function addUserBubble(text) {
    const b = document.createElement('div');
    b.className = 'chat-bubble user';
    b.textContent = text;
    messagesEl.appendChild(b);
    scrollToTop(b);
}

function scrollToTop(el) {
    const wrap = overlay?.querySelector('.bottom-sheet-content-wrapper');
    if (!wrap || !el) return;
    const wrapRect = wrap.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = elRect.top - wrapRect.top - 16;
    wrap.scrollBy({ top: delta, behavior: 'smooth' });
}

function scrollDown() {
    const wrap = overlay?.querySelector('.bottom-sheet-content-wrapper');
    if (wrap) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'instant' });
}

function showTyping() {
    const t = document.createElement('div');
    t.className = 'chat-typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(t);
    scrollDown();
    return t;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// убирает эмодзи и стрелки из метки кнопки для читаемого лога
function cleanLabel(label) {
    return label
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}→←↑↓ℹ️]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// строит кнопки-варианты для узла
function buildOptions(node, nodeId) {
    optionsEl.innerHTML = '';
    let opts = (typeof node.options === 'function' ? node.options() : node.options) || [];

    // динамический FAQ-список
    if (node.dynamic === 'faq_list') {
        const faq = (state.faq || []).filter(it => it && it.q && it.a);
        opts = faq.map((it, i) => ({ label: it.q, action: 'faq_item', idx: i }));
        opts.push({ label: 'записаться на хайк 🏔', action: 'book' });
    }

    if (node.dynamic === 'support_input') {
        optionsEl.innerHTML = `
            <div style="display:flex;gap:8px;padding:8px 12px;align-items:flex-end">
                <textarea class="chat-textarea" placeholder="напиши вопрос..." rows="2" maxlength="500"
                    style="flex:1;border-radius:14px;border:1.5px solid var(--accent,#D9FD19);padding:10px 14px;
                           font-size:15px;resize:none;background:var(--bg-card,#1a1a1a);color:#ffffff;outline:none"></textarea>
                <button class="chat-send-btn" style="background:var(--accent,#D9FD19);color:#000;border:none;
                    border-radius:50%;width:44px;height:44px;font-size:20px;cursor:pointer;flex-shrink:0">↑</button>
            </div>`;
        const textarea = optionsEl.querySelector('.chat-textarea');
        const sendBtn  = optionsEl.querySelector('.chat-send-btn');
        setTimeout(() => textarea.focus(), 100);
        const doSend = () => onSupportSend(textarea.value.trim());
        sendBtn.addEventListener('click', doSend);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
        });
        return;
    }

    if (!START_NODES.has(nodeId)) opts = [...opts, { label: '↩ в начало', action: 'home' }];

    opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'chat-option-btn' + (opt.action === 'home' ? ' is-home' : '');
        btn.textContent = opt.label;
        if (opt.next) btn.dataset.next = opt.next;
        btn.addEventListener('click', () => onOption(opt, nodeId));
        optionsEl.appendChild(btn);
    });
}

async function onOption(opt, fromNodeId) {
    if (busy) return;
    haptic();

    // прямые ссылки — не двигаем диалог
    if (opt.href) {
        if (opt.logName) log(opt.logName, state.userCard.status !== 'active', state.user);
        openLink(opt.href, opt.logName || 'ссылка из чата', state.userCard.status !== 'active');
        return;
    }
    if (opt.action === 'close') {
        closeChat();
        return;
    }
    if (opt.action === 'home') {
        optionsEl.innerHTML = '';
        log('бот: в начало', isGuestLog(), state.user);
        await renderNode(startNodeFor());
        return;
    }
    if (opt.action === 'my_crimea') {
        addUserBubble(opt.label);
        log('бот: мой Крым', false, state.user);
        closeChat();
        setTimeout(async () => { const { renderProfiles } = await import('./profiles.js'); renderProfiles(); }, 450);
        return;
    }
    if (opt.action === 'buy_card') {
        addUserBubble(opt.label);
        log('бот: купить карту', true, state.user);
        closeChat();
        setTimeout(() => showGuestBookingPopup(null, null, null, 'generic'), 450);
        return;
    }
    if (opt.action === 'book') {
        if (!opt.fromCard) addUserBubble(opt.label);
        log(opt.fromCard ? 'бот: карточка хайка' : 'бот: записаться на хайк', isGuestLog(), state.user);
        const next = getNextHike();
        // В расписании пусто — раньше чат просто закрывался и ничего не происходило.
        if (!next) {
            optionsEl.innerHTML = '';
            await streamMessages(['новый хайк ещё не в расписании – обычно анонсируем за неделю 🏔\n\nсамые свежие анонсы – на канале клуба']);
            buildOptions({ options: [
                { label: 'канал клуба', href: CHANNEL, logName: 'канал клуба из пустого расписания' },
                { label: 'написать нам →', next: 'support' },
            ] }, 'no_hikes');
            return;
        }
        const idx = (state.hikesWithTitle || []).findIndex(h => h.date === next.date);
        closeChat();
        setTimeout(() => { if (idx >= 0) showBottomSheet(idx); else goToCalendar(); }, 450);
        return;
    }

    // эхо выбора пользователя
    addUserBubble(opt.label);
    optionsEl.innerHTML = '';

    if (opt.action === 'faq_item') {
        const faq = (state.faq || []).filter(it => it && it.q && it.a);
        const item = faq[opt.idx];
        if (item) {
            log(`бот: faq – ${item.q}`, state.userCard.status !== 'active', state.user);
            await streamMessages([`<b>${item.q}</b>\n\n${item.a}`]);
            buildOptions({ options: [
                { label: '← к темам', next: 'faq' },
                { label: 'записаться на хайк 🏔', action: 'book' },
            ] }, 'faq');
        }
        return;
    }

    if (opt.onSelect) opt.onSelect();

    if (opt.next) {
        log(`бот: ${cleanLabel(opt.label)}`, state.userCard.status !== 'active', state.user);
        await renderNode(opt.next);
    }
}

// показывает сообщения бота по очереди с индикатором «печатает»
async function streamMessages(msgs) {
    busy = true;
    for (const m of msgs) {
        const text = typeof m === 'function' ? m() : m;
        const typing = showTyping();
        await delay(Math.min(900, 400 + text.length * 4));
        typing.remove();
        addBotBubble(text);
        await delay(180);
    }
    busy = false;
}

async function showSupportHistory(history) {
    for (const msg of history) {
        if (msg.from === 'user') addUserBubble(msg.text);
        else if (msg.from === 'admin') {
            addBotBubble(msg.text);
            if (!msg.read_by_user) markSupportMessageRead(state.user?.id, msg.key);
        }
    }
    buildOptions({ options: [
        { label: 'написать ещё →', next: 'support' },
        { label: '↩ в начало', action: 'home' },
    ]}, 'support_history');
}

async function onSupportSend(text) {
    if (!text || busy) return;
    addUserBubble(text);
    optionsEl.innerHTML = '';
    try {
        if (!state.user?.id) throw new Error('нет пользователя');
        await sendSupportMessage(state.user, text);
    } catch (e) {
        console.error(e);
        log('бот: сообщение в поддержку не ушло', state.userCard.status !== 'active', state.user);
        await streamMessages(['не получилось отправить 😔\n\nнапиши нам напрямую – ответим в телеграме']);
        buildOptions({ options: [
            { label: 'написать @hellointelligent', href: SUPPORT, logName: 'поддержка после ошибки' },
            { label: 'закрыть', action: 'close' },
        ] }, 'support_failed');
        return;
    }
    await streamMessages([lumenActive ? 'передал 🤍\n\nкак только ответят – подсвечу здесь' : 'передал 🤍 как только ответят – покажу здесь']);
    buildOptions({ options: [
        { label: 'ещё вопрос', next: 'support' },
        { label: 'закрыть', action: 'close' },
    ]}, 'support_done');
}

async function renderNode(nodeId) {
    const node = FLOW[nodeId];
    if (!node) return;
    await streamMessages(node.msgs || []);
    buildOptions(node, nodeId);
}

// ──────────────────────────────────────────────
// открытие шторки
// ──────────────────────────────────────────────
export async function openOnboardingChat(autoNext = null, lumenContext = null, lumenMode = false) {
    // если ссылка зависла, но узла в DOM нет — сбрасываем, чтобы можно было открыть
    if (overlay && document.body.contains(overlay)) return;
    overlay = null;
    lumenActive = lumenMode;
    if (lumenContext) window.lumenChatContext = lumenContext;
    log('открыл чат с ботом', state.userCard.status !== 'active', state.user, lumenContext ? {
        lumen_screen: lumenContext.screen || '',
        lumen_action: lumenContext.action || '',
        lumen_route_id: lumenContext.route?.id || ''
    } : {});

    injectChatStyles();
    const goingReady = prefetchGoing();
    overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay bot-chat-overlay';
    if (lumenContext) overlay.dataset.lumenScreen = lumenContext.screen || '';
    overlay.innerHTML = `
        <div class="bottom-sheet bot-chat-sheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bot-chat-header">
                ${lumenMode
                    ? `<div class="bot-chat-avatar bot-chat-avatar-lumen"><img src="assets/lumen/sitting.png" alt="Lumen"></div>`
                    : `<div class="bot-chat-avatar">💬</div>`
                }
                <div class="bot-chat-title">
                    <div class="bot-chat-name">${lumenMode ? 'помощник Люмен' : 'интеллигентный помощник'}</div>
                    <div class="bot-chat-status">${lumenMode ? 'подсвечу следующий шаг' : 'помогу разобраться'}</div>
                </div>
                <button class="bot-chat-close" aria-label="закрыть">✕</button>
            </div>
            <div class="bottom-sheet-content-wrapper">
                <div class="bot-chat-messages"></div>
            </div>
            <div class="bot-chat-options"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const sheet = overlay.querySelector('.bottom-sheet');
    messagesEl = overlay.querySelector('.bot-chat-messages');
    optionsEl = overlay.querySelector('.bot-chat-options');

    overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); closeChat(); } });
    overlay.querySelector('.bot-chat-close').addEventListener('click', () => { haptic(); closeChat(); });

    // свайп вниз – общий для всех шторок, см. sheet-drag.js

    requestAnimationFrame(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    });

    // подписываемся на новые ответы от организаторов
    const subTs = Math.floor(Date.now() / 1000);
    if (state.user?.id) {
        unsubscribeReplies = subscribeToAdminReplies(state.user.id, subTs, (msg, key) => {
            markSupportMessageRead(state.user.id, key);
            addBotBubble(msg.text);
        });
    }

    // если есть непрочитанные ответы — показываем историю переписки, а не приветствие
    if (state.user?.id) {
        const history = await loadSupportMessages(state.user.id);
        const hasUnread = history.some(m => m.from === 'admin' && !m.read_by_user);
        if (hasUnread) {
            await showSupportHistory(history);
            return;
        }
    }

    await goingReady;
    const startNode = startNodeFor();
    try { localStorage.setItem(K_VISITED, '1'); } catch (e) { /* без хранилища */ }
    if (autoNext) {
        await renderNode(autoNext);
    } else {
        await renderNode(startNode);
    }
}
