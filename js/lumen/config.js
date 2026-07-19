// Конфигурация Люмена: тексты и переходы меняются здесь, без правок компонента.
export const LUMEN_SCENARIOS = {
    first_visit: { message: 'Кажется, ты здесь впервые. Показать, что здесь происходит?', next: 'welcome' },
    home: { message: 'Не знаешь, с чего начать?', next: 'welcome' },
    route: { message: 'Это твой первый хайк? Проверим, подойдёт ли он тебе', next: 'doubts' },
    after_booking: { message: 'Готово. Первый шаг уже сделан', next: 'welcome_back' },
};

// Приветствия по сегментам пользователя. Голос Люмена: коротко, тепло,
// без давления, без восторга по каждому поводу. Чередуются случайно.
export const LUMEN_GREETINGS = {
    // 1. Впервые в приложении — знакомство (интерактивное облачко с кнопками)
    first_time: [
        'привет! я Люмен. могу подсветить тебе путь по клубу.\nа тебя как зовут?',
        'о, кто-то новый. я Люмен — живу здесь и подсвечиваю дорогу.\nа тебя как зовут?',
        'привет. я Люмен. необязательно видеть весь путь — для начала просто познакомимся.\nкак тебя зовут?',
    ],
    // 2. Заходил в приложение, но на хайке ещё не был
    visited_no_hike: [
        'снова заглянул — это уже маленький шаг. хочешь, найдём тебе первый хайк?',
        'волнуешься перед первым хайком? это нормальная часть приключения',
        'первый хайк — бесплатно. давай подсвечу тот, что подойдёт именно тебе',
        'здесь можно не знать, с чего начать. я рядом — подсвечу следующий шаг',
    ],
    // 3. Был хотя бы на одном хайке, карты нет
    hiker: [
        'ты уже знаешь, каково это — идти рядом со своими. рад видеть снова',
        'с возвращением. горы никуда не делись — выберем следующий маршрут?',
        'ты уже ходил с нами — значит, свет уже заметил. что дальше?',
    ],
    // 4. Первый хайк пройден — следующий шаг: карта
    card_step: [
        'первый хайк пройден. кажется, самое время сделать следующий шаг — расскажу про карту?',
        'помнишь то ощущение на маршруте? с картой оно становится образом жизни',
        'ты уже был среди своих. карта — это когда ты больше не гость. рассказать?',
    ],
    // 5. Член клуба
    member: [
        'рад видеть тебя снова. что сегодня подсветить?',
        'привет. ты здесь свой — если что-то нужно, я рядом',
        'снова в путь? могу помочь с маршрутом или ответить на вопрос',
        'хорошо, что зашёл. посмотрим, что нового в клубе?',
    ],
};

// Определяет сегмент пользователя для приветствия
export function getLumenSegment({ status, hikesCount = 0, visits = 1 } = {}) {
    if (status === 'active') return 'member';
    if (hikesCount === 1) return 'card_step';
    if (hikesCount > 1) return 'hiker';
    return visits <= 1 ? 'first_time' : 'visited_no_hike';
}

export function getLumenGreeting(segmentOrStatus, firstHikePending) {
    // новый вызов: getLumenGreeting('visited_no_hike')
    let pool = LUMEN_GREETINGS[segmentOrStatus];
    // старый вызов: getLumenGreeting(status, firstHikePending)
    if (!pool) {
        if (segmentOrStatus === 'active') pool = LUMEN_GREETINGS.member;
        else if (firstHikePending) pool = LUMEN_GREETINGS.visited_no_hike;
        else pool = LUMEN_GREETINGS.hiker;
    }
    return pool[Math.floor(Math.random() * pool.length)];
}

// Сценарий чата для тех, кто без карты — рассказываем о клубе, не давим продажей
export function getLumenChatScenario(status, firstHikePending) {
    if (status === 'active') return 'welcome_back';
    if (firstHikePending) return 'welcome';
    return 'club_info';
}

export const LUMEN_POSES = {
    home: 'sitting',
    route: 'sitting',
    first_visit: 'sitting',
    corner: 'corner-peek-v2',
    top: 'top-drape-v2',
    lying: 'prone-v2',
    lotus: 'lotus-v2',
    pointing: 'pointing-v2',
    profiles: 'peek',
    menu: 'peek',
    default: 'peek',
};

const LUMEN_PILOT_USERNAMES = new Set(['hellointelligent']);
const ROUTE_FAVORITES_PILOT_USERNAMES = new Set(['hellointelligent', 'maxmolotov']);

function pilotUsername(user) {
    return String(user?.username || '').replace(/^@/, '').toLowerCase();
}

export function isLumenPilotUser(user) {
    return LUMEN_PILOT_USERNAMES.has(pilotUsername(user));
}

export function isRouteFavoritesPilotUser(user) {
    return ROUTE_FAVORITES_PILOT_USERNAMES.has(pilotUsername(user));
}

export function getLumenScenario(context = {}) {
    if (context.scenario && LUMEN_SCENARIOS[context.scenario]) return LUMEN_SCENARIOS[context.scenario];
    return LUMEN_SCENARIOS[context.screen === 'route' ? 'route' : 'home'];
}
