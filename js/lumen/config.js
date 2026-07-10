// Конфигурация Люмена: тексты и переходы меняются здесь, без правок компонента.
export const LUMEN_SCENARIOS = {
    first_visit: { message: 'Кажется, ты здесь впервые. Показать, что здесь происходит?', next: 'welcome' },
    home: { message: 'Не знаешь, с чего начать?', next: 'welcome' },
    route: { message: 'Это твой первый хайк? Проверим, подойдёт ли он тебе', next: 'doubts' },
    after_booking: { message: 'Готово. Первый шаг уже сделан', next: 'welcome_back' },
};

export const LUMEN_POSES = {
    home: 'standing',
    route: 'sitting',
    first_visit: 'waving',
    default: 'compact',
};

export function getLumenScenario(context = {}) {
    if (context.scenario && LUMEN_SCENARIOS[context.scenario]) return LUMEN_SCENARIOS[context.scenario];
    return LUMEN_SCENARIOS[context.screen === 'route' ? 'route' : 'home'];
}
