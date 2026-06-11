// js/ui/onboarding-chat.js
// Встроенный чат-онбординг для новичков — выезжающая снизу шторка.
// Сценарий перенесён из телеграм-бота @yaltahiking_bot (aiogram).
// Контент статичный, динамика (ближайший хайк, число карт, FAQ) берётся из state.

import { state } from '../state.js';
import { haptic, openLink, formatDateForDisplay } from '../utils.js';
import { log } from '../api.js';
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
    ['хайкинг вдохнул в меня жизнь новыми впечатлениями, когда это было так нужно. стало легче выходить за рамки, проще относиться к работе. хочется радоваться жизни)', '– участник, ставший соорганизатором'],
];

function randomReview() {
    const [text, author] = REVIEWS[Math.floor(Math.random() * REVIEWS.length)];
    return `💬 <i>«${text}»</i>\n\n<b>${author}</b>`;
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
function welcomeText() {
    const name = capName(state.user?.first_name);
    const hello = name ? `привет, ${name} 👋` : 'привет 👋';
    return `${hello}\n\nты в <b>хайкинг интеллигенции</b> – клубе молодых аутентичных людей из Ялты, которые проводят время стильно: ходят в горы, встречаются в городе и живут настоящую жизнь прямо сейчас, не откладывая на вечное завтра\n\nза пару минут расскажу, как здесь всё устроено. ну что – поехали?`;
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
    welcome: {
        msgs: [welcomeText],
        options: [{ label: 'поехали →', next: 'experience' }],
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
        options: [
            { label: 'записаться на хайк 🏔', action: 'book' },
            { label: 'а что ещё есть в клубе? →', next: 'card' },
            { label: 'ℹ️ как всё устроено', next: 'faq' },
            { label: 'честно – есть сомнения...', next: 'doubts' },
        ],
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
        options: [
            { label: 'записаться на хайк 🏔', action: 'book' },
            { label: 'а что ещё есть в клубе? →', next: 'card' },
        ],
    },
    card: {
        msgs: [cardText],
        options: [
            { label: 'стать своим – 7 500₽ (бессрочная)', href: PERMANENT_CARD_LINK, logName: 'купить бессрочную' },
            { label: 'стать своим – 5 500₽ (сезон 2026)', href: SEASON_CARD_LINK, logName: 'купить сезонную' },
            { label: 'сначала попробую хайк →', next: 'try_first' },
            { label: 'задать вопрос', href: SUPPORT, logName: 'задать вопрос' },
        ],
    },
    try_first: {
        msgs: [TEXT_TRY_FIRST],
        options: [
            { label: 'смотреть маршруты 🏔', action: 'book' },
            { label: 'канал клуба', href: CHANNEL, logName: 'канал клуба' },
            { label: 'задать вопрос', href: SUPPORT, logName: 'задать вопрос' },
        ],
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

function closeChat() {
    if (!overlay) return;
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
        if (cal) cal.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
}

// добавляет пузырь сообщения бота
function addBotBubble(html) {
    const b = document.createElement('div');
    b.className = 'chat-bubble bot';
    b.style.whiteSpace = 'pre-line';
    b.innerHTML = html;
    messagesEl.appendChild(b);
    scrollDown();
}

// добавляет пузырь выбора пользователя (справа)
function addUserBubble(text) {
    const b = document.createElement('div');
    b.className = 'chat-bubble user';
    b.textContent = text;
    messagesEl.appendChild(b);
    scrollDown();
}

function scrollDown() {
    const wrap = overlay?.querySelector('.bottom-sheet-content-wrapper');
    if (wrap) wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });
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

// строит кнопки-варианты для узла
function buildOptions(node, nodeId) {
    optionsEl.innerHTML = '';
    let opts = node.options || [];

    // динамический FAQ-список
    if (node.dynamic === 'faq_list') {
        const faq = (state.faq || []).filter(it => it && it.q && it.a);
        opts = faq.map((it, i) => ({ label: it.q, action: 'faq_item', idx: i }));
        opts.push({ label: 'записаться на хайк 🏔', action: 'book' });
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
    if (opt.action === 'book') {
        addUserBubble(opt.label);
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
            await streamMessages([`<b>${item.q}</b>\n\n${item.a}`]);
            buildOptions({ options: [
                { label: '← к темам', next: 'faq' },
                { label: 'записаться на хайк 🏔', action: 'book' },
            ] }, 'faq');
        }
        return;
    }

    if (opt.next) {
        log(`чат: ${opt.next}`, state.userCard.status !== 'active', state.user);
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

async function renderNode(nodeId) {
    const node = FLOW[nodeId];
    if (!node) return;
    await streamMessages(node.msgs || []);
    buildOptions(node, nodeId);
}

// ──────────────────────────────────────────────
// открытие шторки
// ──────────────────────────────────────────────
export function openOnboardingChat() {
    if (overlay) return;
    log('открыл чат с ботом', state.userCard.status !== 'active', state.user);

    overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `
        <div class="bottom-sheet bot-chat-sheet">
            <div class="bottom-sheet-handle"></div>
            <div class="bot-chat-header">
                <div class="bot-chat-avatar">🏔</div>
                <div class="bot-chat-title">
                    <div class="bot-chat-name">хайкинг интеллигенция</div>
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

    // свайп вниз по шапке/ручке закрывает
    let startY = 0, curY = 0, dragging = false;
    const dragZone = overlay.querySelector('.bottom-sheet-handle');
    const onStart = (e) => { dragging = true; startY = e.touches[0].clientY; sheet.classList.add('dragging'); };
    const onMove = (e) => {
        if (!dragging) return;
        curY = e.touches[0].clientY - startY;
        if (curY > 0) sheet.style.transform = `translateY(${curY}px)`;
    };
    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        sheet.classList.remove('dragging');
        if (curY > 120) closeChat();
        else sheet.style.transform = '';
        curY = 0;
    };
    dragZone.addEventListener('touchstart', onStart, { passive: true });
    dragZone.addEventListener('touchmove', onMove, { passive: true });
    dragZone.addEventListener('touchend', onEnd);

    requestAnimationFrame(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    });

    renderNode('welcome');
}
