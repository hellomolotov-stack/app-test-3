// js/ui/onboarding-chat.js
// Встроенный чат-онбординг для новичков — выезжающая снизу шторка.
// Сценарий перенесён из телеграм-бота @yaltahiking_bot (aiogram).
// Контент статичный, динамика (ближайший хайк, число карт, FAQ) берётся из state.

import { state } from '../state.js';
import { haptic, openLink, formatDateForDisplay, tg, scrollToElement } from '../utils.js';
import { log, registerWebAppUser } from '../api.js';
import { sendSupportMessage, subscribeToAdminReplies, markSupportMessageRead, loadSupportMessages } from '../firebase.js';
import { SEASON_CARD_LINK, PERMANENT_CARD_LINK } from '../config.js';
import { getAvailableCardsCount } from './calendar.js';
import { renderHome } from './home.js';

const SUPPORT = 'https://t.me/hellointelligent';
const CHANNEL = 'https://t.me/yaltahiking';

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
    return author
        ? `💬 <i>«${text}»</i>\n\n<b>${author}</b>`
        : `💬 <i>«${text}»</i>`;
}

// ──────────────────────────────────────────────
// динамические данные из приложения
// ──────────────────────────────────────────────
function capName(n) {
    n = (n || '').trim();
    return n ? n[0].toUpperCase() + n.slice(1) : '';
}

function getNextHike() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = (state.hikesWithTitle || [])
        .filter(h => h.date)
        .map(h => ({ ...h, _d: new Date(h.date) }))
        .filter(h => !isNaN(h._d.getTime()) && h._d >= today)
        .sort((a, b) => a._d - b._d);
    return upcoming[0] || null;
}

function nextHikeLine() {
    const h = getNextHike();
    if (h) return `${h.title} – ${formatDateForDisplay(h.date)}`;
    return 'точное место и время – в приложении';
}

// ──────────────────────────────────────────────
// тексты
// ──────────────────────────────────────────────
function memberWelcomeText() {
    const name = capName(state.user?.first_name);
    const hello = name ? `привет, ${name} 🤍` : 'привет 🤍';
    return `${hello}\n\nты член клуба – это значит, ты уже свой. могу провести по всему, что тебе доступно, или просто помочь с вопросом`;
}

function memberPerksText() {
    const club = (state.privileges?.club || []).filter(p => p.title);
    if (club.length > 0) {
        const lines = club.map(p => `🌟 <b>${p.title}</b>${p.description ? '\n' + p.description : ''}`).join('\n\n');
        return `<b>что тебе доступно с картой:</b>\n\n${lines}`;
    }
    return '<b>что тебе доступно с картой:</b>\n\n🌟 <b>все хайки и события</b> – просто приходишь, без доп. оплаты\n\n🌟 <b>закрытый чат</b> – свои люди, близкое общение, неформальные встречи\n\n🌟 <b>закрытые события</b> – ужины, пляжные пикники, сапы, мастермайнды\n\n🌟 <b>безлимитный VPN</b> для всех устройств\n\n🌟 <b>скидки у партнёров</b> в Ялте и онлайне';
}

function memberPartnersText() {
    const city = (state.privileges?.city || []).filter(p => p.title);
    if (city.length === 0) return null;
    const lines = city.map(p => {
        let block = `🤝 <span style="color:#fff;font-weight:600">${p.title}</span>`;
        if (p.description) block += `\n${p.description}`;
        if (p.button_link) {
            const md = p.button_link.match(/^\[(.+?)\]\((.+?)\)$/);
            if (md) {
                block += `\n<a href="${md[2]}" style="color:#d9fd19;text-decoration:none">${md[1]}</a>`;
            } else {
                const label = p.button_text || 'перейти →';
                block += `\n<a href="${p.button_link}" style="color:#d9fd19;text-decoration:none">${label}</a>`;
            }
        }
        return block;
    }).join('\n\n');
    return `<span style="color:#fff;font-weight:600">скидки у партнёров:</span>\n\n${lines}`;
}

function welcomeText() {
    const name = capName(state.user?.first_name);
    const hello = name ? `привет, ${name} 👋` : 'привет 👋';
    return `${hello}\n\nты в <b>хайкинг интеллигенции</b> – клубе молодых аутентичных личностей из Ялты, которые отдыхают продуктивно и знакомятся лично: мы ходим в горы, встречаемся в городе и живём настоящую жизнь прямо сейчас, не откладывая на вечное завтра\n\nза пару минут расскажу, как здесь всё устроено. ну что – идём?`;
}

function aboutText() {
    return `<b>как устроен хайк</b>\n\nкаждые выходные мы собираемся на точке и идём на новый маршрут – 3–5 часов по обустроенным тропам южного берега Крыма\n\nмаршруты лёгкого и среднего уровня – без особой подготовки и снаряжения. берёшь удобные кроссовки, воду, перекус – и вперёд\n\nпо пути знакомимся, говорим, фотографируем, дышим\n\n📍 <b>ближайший:</b> ${nextHikeLine()}\n\nпервый хайк – <b>бесплатно</b> 🎉`;
}

function cardText() {
    const left = getAvailableCardsCount();
    const total = 10;
    let scarcity = '';
    if (left > 0) scarcity = `\n\n🔥 в этом месяце осталось <b>${left} из ${total}</b> карт`;
    return `<b>карта интеллигента</b> – это когда ты больше не гость\n\nоформляешь один раз и становишься своим:\n\n🌟 <b>все хайки и события</b> – просто приходишь, без доп. оплаты\n🌟 <b>закрытый чат</b> – свои люди, близкое общение, неформальные встречи\n🌟 <b>закрытые события</b> – ужины, пляжные пикники, сапы, мастермайнды, посиделки у костра\n🌟 <b>скидки у партнёров</b> в Ялте и онлайне: HOKA, Геккон, Nothomme, кофейни, барбершоп и другие\n🌟 <b>безлимитный VPN</b> для всех устройств с поддержкой подключения\n🌟 привилегии растут вместе с клубом\n\n<b>бессрочная – 7 500₽</b> – действует всё время\n<b>сезонная – 5 500₽</b> – весь 2026 год${scarcity}`;
}

const TEXT_TRY_FIRST = 'отлично – первый хайк бесплатно, просто приходи 🏔\n\nсмотри актуальные анонсы на канале и записывайся на хайк или событие прямо в приложении\n\nесли появятся вопросы – напишем, ответим 🤍';

const K_VISITED = 'chatOnboardingVisited';

const WELCOME_BACK_VARIANTS = [
    name => `с возвращением${name ? ', ' + name : ''} 🤍\n\nвидимо, всё ещё думаешь. это нормально – наша участница думала пять месяцев, прежде чем пойти на первый хайк. теперь она в клубе\n\nчем займёмся?`,
    name => `снова здесь${name ? ', ' + name : ''} 🙌\n\nрад видеть. что-то зацепило – значит, место своё\n\nчем могу помочь?`,
    name => `привет${name ? ', ' + name : ''} 👋\n\nзаходишь не впервые – значит, что-то нравится. может, уже пора на хайк?\n\nчем займёмся?`,
    name => `о, ${name ? name + ', ' : ''}ты вернулся 🤍\n\nесли уже ходил с нами – здорово, рад тебя снова видеть. если ещё нет – самое время\n\nчем могу помочь?`,
    name => `с возвращением${name ? ', ' + name : ''} ☀️\n\nгоры никуда не делись – ближайший хайк уже скоро\n\nчем займёмся?`,
];

function welcomeBackText() {
    const name = capName(state.user?.first_name);
    const idx = Math.floor(Math.random() * WELCOME_BACK_VARIANTS.length);
    return WELCOME_BACK_VARIANTS[idx](name);
}

const DOUBTS_INTRO = 'это нормально – большинство так думали перед первым хайком\n\nчто останавливает?';

const TEXTS_DOUBTS = {
    d_awkward: '<b>буду чувствовать себя неловко в группе незнакомых людей</b>\n\nты прав – будет. первые 15 минут\n\nпосле – не заметишь, как ощутишь себя своим. как? в этом вся магия клуба. мы знаем, как создать такую атмосферу, будто ты вышел погулять с друзьями во дворе',
    d_pace: '<b>вдруг мне будет тяжело и я начну отставать</b>\n\nхайкинг – не про скорость и выносливость. это не беговое сообщество и вовсе не клуб профессиональных туристов, которым подавай десятки километров\n\nхайк – это прогулка в удовольствие по уже проложенным тропам. с остановками, беседами и юмором по поводу чихнувшей белки',
    d_gear: '<b>у меня нет правильной обуви и одежды</b>\n\nкроссовки не с плоской подошвой есть? а не жаркая одежда? ждём тебя\n\nостальное – изощрения. но вот когда влюбишься в это дело – обязательно побалуй себя хоками и альтрами 😉',
    d_shy: '<b>я стеснительный, мне тяжело знакомиться</b>\n\nтебе и не нужно. доверься процессу – сам формат всё сделает\n\nмягко, естественно и незаметно. хайк – миниатюра приключения, внутри которого всё случается само собой в лучший для этого момент',
    d_ordinary: '<b>все крутые, а я считаю себя обычным</b>\n\nу нас и правда можно встретить предпринимателей, специалистов, творческих личностей и новичков в профессии\n\nно хайк – не бизнес-встреча. здесь профессия не важна – в горах мы все равны, ведь оставляем важных себя внизу, в городе. а сюда, наверх, берём только своего внутреннего человека',
};

const TEXTS_EXP = {
    exp_nature: 'отличный выбор – горы южного берега Крыма это что-то особенное\n\nкрымские тропы, виды на море с высоты, аромат хвои, чистейший воздух и 3–5 часов настоящей жизни без экрана – именно это мы и делаем каждые выходные\n\nи кстати – никакой подготовки не нужно. берём всех 🙌',
    exp_social: 'вот это по-нашему – знакомиться вживую, а не в тиндере, чувствуя себя словно на рынке\n\nна хайке всё иначе: люди рядом, впечатления общие, разговоры настоящие. уже после первого маршрута – ощущение, что знал этих людей давно\n\nа с картой интеллигента открывается доступ в закрытый чат клуба 🤍',
    exp_curious: 'сейчас всё расскажу – кратко и по делу\n\n<b>хайкинг интеллигенция</b> – это не просто прогулки. это сообщество людей, которые решили жить интересно: горы, события, знакомства, смыслы\n\nсуществуем с мая 2025, уже сделали больше 20 маршрутов и кучу событий в Ялте',
};

// ──────────────────────────────────────────────
// дерево диалога
// ──────────────────────────────────────────────
const AFTER_DOUBT = [
    { label: 'отпустило 😮‍💨', next: 'relieved' },
    { label: 'ещё думаю', next: 'doubts' },
    { label: 'записаться на хайк 🏔', action: 'book' },
];

const FLOW = {
    member_welcome: {
        msgs: [memberWelcomeText],
        options: [
            { label: 'о клубе →', next: 'about' },
            { label: 'что мне доступно? →', next: 'member_perks' },
            { label: 'ℹ️ как всё устроено', next: 'faq' },
            { label: 'написать нам →', next: 'support' },
        ],
    },
    member_perks: {
        msgs: [memberPerksText],
        options: [
            { label: 'скидки у партнёров →', next: 'member_partners' },
            { label: 'написать нам →', next: 'support' },
        ],
    },
    member_partners: {
        msgs: [() => memberPartnersText() || 'скоро тут появятся новые партнёры 🤍'],
        options: [
            { label: 'записаться на хайк 🏔', action: 'book' },
            { label: 'написать нам →', next: 'support' },
        ],
    },
    welcome: {
        msgs: [welcomeText],
        options: [{ label: 'идём →', next: 'experience', onSelect: () => localStorage.setItem(K_VISITED, '1') }],
    },
    welcome_back: {
        msgs: [welcomeBackText],
        options: [
            { label: 'записаться на хайк 🏔', action: 'book' },
            { label: '🌟 карта интеллигента', next: 'card' },
            { label: 'ℹ️ как всё устроено', next: 'faq' },
            { label: 'написать нам →', next: 'support' },
        ],
    },
    experience: {
        msgs: ['расскажи – что тебя сюда привело?'],
        options: [
            { label: '🏔 горы и природа', next: 'exp_nature' },
            { label: '🤝 хочу познакомиться с людьми', next: 'exp_social' },
            { label: '🔍 просто интересно, что за клуб', next: 'exp_curious' },
        ],
    },
    exp_nature: { msgs: [() => TEXTS_EXP.exp_nature], options: [{ label: 'что происходит на хайке? →', next: 'about' }] },
    exp_social: { msgs: [() => TEXTS_EXP.exp_social], options: [{ label: 'что происходит на хайке? →', next: 'about' }] },
    exp_curious: { msgs: [() => TEXTS_EXP.exp_curious], options: [{ label: 'что происходит на хайке? →', next: 'about' }] },
    about: {
        msgs: [aboutText, randomReview],
        options: () => {
            const isMember = state.userCard?.status === 'active';
            return [
                { label: 'записаться на хайк 🏔', action: 'book' },
                isMember
                    ? { label: 'привилегии участника →', next: 'member_perks' }
                    : { label: 'а что ещё есть в клубе? →', next: 'card' },
                { label: 'ℹ️ как всё устроено', next: 'faq' },
                { label: 'честно – есть сомнения...', next: 'doubts' },
            ];
        },
    },
    doubts: {
        msgs: [DOUBTS_INTRO],
        options: [
            { label: '😬 буду чувствовать себя неловко', next: 'd_awkward' },
            { label: '😮‍💨 вдруг не смогу идти в темпе', next: 'd_pace' },
            { label: '👟 нет нужной обуви и одежды', next: 'd_gear' },
            { label: '🫣 я стеснительный', next: 'd_shy' },
            { label: '🤔 все крутые, а я – обычный', next: 'd_ordinary' },
        ],
    },
    d_awkward: { msgs: [() => TEXTS_DOUBTS.d_awkward], options: AFTER_DOUBT },
    d_pace: { msgs: [() => TEXTS_DOUBTS.d_pace], options: AFTER_DOUBT },
    d_gear: { msgs: [() => TEXTS_DOUBTS.d_gear], options: AFTER_DOUBT },
    d_shy: { msgs: [() => TEXTS_DOUBTS.d_shy], options: AFTER_DOUBT },
    d_ordinary: { msgs: [() => TEXTS_DOUBTS.d_ordinary], options: AFTER_DOUBT },
    relieved: {
        msgs: ['вот и славно 🤍 тогда не откладывай – первый хайк бесплатный'],
        options: () => {
            const isMember = state.userCard?.status === 'active';
            return [
                { label: 'записаться на хайк 🏔', action: 'book' },
                isMember
                    ? { label: 'привилегии участника →', next: 'member_perks' }
                    : { label: 'а что ещё есть в клубе? →', next: 'card' },
            ];
        },
    },
    card: {
        msgs: [cardText],
        options: [
            { label: 'стать своим – 7 500₽ (бессрочная)', href: PERMANENT_CARD_LINK, logName: 'купить бессрочную' },
            { label: 'стать своим – 5 500₽ (сезон 2026)', href: SEASON_CARD_LINK, logName: 'купить сезонную' },
            { label: 'сначала попробую хайк →', next: 'try_first' },
            { label: 'написать нам →', next: 'support' },
        ],
    },
    try_first: {
        msgs: [TEXT_TRY_FIRST],
        options: [
            { label: 'смотреть маршруты 🏔', action: 'book' },
            { label: 'канал клуба', href: CHANNEL, logName: 'канал клуба' },
            { label: 'написать нам →', next: 'support' },
        ],
    },
    support: {
        msgs: ['напиши вопрос – передам организаторам. как только ответят, покажу здесь 🤍'],
        dynamic: 'support_input',
    },
    // faq — динамический узел, options строятся в renderNode
    faq: {
        msgs: ['<b>как всё устроено</b>\n\nвыбери, что интересно – расскажу 👇'],
        dynamic: 'faq_list',
    },
};

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

    opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'chat-option-btn';
        btn.textContent = opt.label;
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
    if (opt.action === 'book') {
        addUserBubble(opt.label);
        log('бот: записаться на хайк', state.userCard.status !== 'active', state.user);
        goToCalendar();
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
        { label: 'к клубу →', next: 'welcome_back' },
    ]}, 'support_history');
}

async function onSupportSend(text) {
    if (!text || busy) return;
    addUserBubble(text);
    optionsEl.innerHTML = '';
    try { await sendSupportMessage(state.user, text); } catch (e) { console.error(e); }
    await streamMessages(['передал 🤍 как только ответят – покажу здесь']);
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
export async function openOnboardingChat() {
    // если ссылка зависла, но узла в DOM нет — сбрасываем, чтобы можно было открыть
    if (overlay && document.body.contains(overlay)) return;
    overlay = null;
    log('открыл чат с ботом', state.userCard.status !== 'active', state.user);

    overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `
        <div class="bottom-sheet bot-chat-sheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bot-chat-header">
                <div class="bot-chat-avatar">💬</div>
                <div class="bot-chat-title">
                    <div class="bot-chat-name">интеллигентный помощник</div>
                    <div class="bot-chat-status">помогу разобраться</div>
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

    // запрашиваем разрешение на отправку сообщений (один раз),
    // чтобы бот мог прислать напоминание, если пользователь уйдёт
    const WA_KEY = 'writeAccessRequested';
    if (!localStorage.getItem(WA_KEY)) {
        if (tg?.requestWriteAccess) {
            tg.requestWriteAccess((granted) => {
                localStorage.setItem(WA_KEY, '1');
                if (granted) registerWebAppUser(state.user);
            });
        }
    }

    // свайп вниз по шапке + ручке — плавное закрытие
    let startY = 0, curY = 0, dragging = false;
    const CLOSE_THRESHOLD = 100;

    const onStart = (e) => {
        dragging = true;
        startY = e.touches[0].clientY;
        curY = 0;
        sheet.style.transition = 'none';
        overlay.style.transition = 'none';
    };
    const onMove = (e) => {
        if (!dragging) return;
        curY = e.touches[0].clientY - startY;
        if (curY < 0) curY = 0;
        sheet.style.transform = `translateY(${curY}px)`;
        const progress = Math.min(curY / (sheet.offsetHeight || 500), 1);
        overlay.style.background = `rgba(0,0,0,${0.5 * (1 - progress)})`;
    };
    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        if (curY > CLOSE_THRESHOLD) {
            sheet.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            overlay.style.transition = 'background 0.3s ease';
            closeChat();
        } else {
            sheet.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
            overlay.style.transition = 'background 0.35s ease';
            sheet.style.transform = '';
            overlay.style.background = '';
        }
        curY = 0;
    };

    [overlay.querySelector('.bottom-sheet-handle'), overlay.querySelector('.bot-chat-header')].forEach(el => {
        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: true });
        el.addEventListener('touchend', onEnd);
    });

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

    const isMember = state.userCard?.status === 'active';
    let startNode;
    if (isMember) startNode = 'member_welcome';
    else if (localStorage.getItem(K_VISITED)) startNode = 'welcome_back';
    else startNode = 'welcome';
    renderNode(startNode);
}
