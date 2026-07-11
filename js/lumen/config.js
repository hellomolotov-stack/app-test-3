// Конфигурация Люмена: тексты и переходы меняются здесь, без правок компонента.
export const LUMEN_SCENARIOS = {
    first_visit: { message: 'Кажется, ты здесь впервые. Показать, что здесь происходит?', next: 'welcome' },
    home: { message: 'Не знаешь, с чего начать?', next: 'welcome' },
    route: { message: 'Это твой первый хайк? Проверим, подойдёт ли он тебе', next: 'doubts' },
    after_booking: { message: 'Готово. Первый шаг уже сделан', next: 'welcome_back' },
};

// Приветствия по статусу пользователя. Чередуются случайно при каждом визите.
export const LUMEN_GREETINGS = {
    // Есть карта — член клуба
    active: [
        'рад видеть тебя снова. что сегодня интересует?',
        'привет. могу помочь с маршрутом или ответить на вопрос',
        'снова здесь — значит, тебя тянет в горы. это хорошо',
    ],
    // Карты нет, хайков ещё не было
    newcomer: [
        'привет. первый хайк — бесплатно. давай найдём тот, что подойдёт',
        'здесь спокойно. можно не знать, с чего начать — я подсвечу следующий шаг',
        'волнуешься перед первым хайком? это нормальная часть приключения. нажми, расскажу',
    ],
    // Карты нет, но хайки уже были
    returner: [
        'ты уже знаешь, каково это — идти со своими. карта открывает следующий уровень',
        'кажется, первый шаг уже сделан. расскажу, что даёт карта',
        'ты уже ходил с нами. хочешь знать, как стать частью клуба?',
    ],
};

export function getLumenGreeting(status, firstHikePending) {
    let pool;
    if (status === 'active') pool = LUMEN_GREETINGS.active;
    else if (firstHikePending) pool = LUMEN_GREETINGS.newcomer;
    else pool = LUMEN_GREETINGS.returner;
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
    profiles: 'peek',
    menu: 'peek',
    default: 'peek',
};

const LUMEN_PILOT_USERNAME = 'hellointelligent';

export function isLumenPilotUser(user) {
    return String(user?.username || '').replace(/^@/, '').toLowerCase() === LUMEN_PILOT_USERNAME;
}

export function getLumenScenario(context = {}) {
    if (context.scenario && LUMEN_SCENARIOS[context.scenario]) return LUMEN_SCENARIOS[context.scenario];
    return LUMEN_SCENARIOS[context.screen === 'route' ? 'route' : 'home'];
}
