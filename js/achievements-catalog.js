// Каталог базовых ачивок клуба – утверждённые 40 (Documents/ХАЙКИНГ КЛУБ/design/achievements/базовые-ачивки.md и РЕДКОСТЬ.md).
// Нужен экрану «все ачивки» и блоку на главной: уровни, «N из M», серые не полученные с описанием «как получить».
// Медали выдаются через админку (clubAchievements); связь с каталогом – по названию ачивки.
// Уровни ценности – три (правила значков, папка «значки»): базовые – серебро, легендарные – золото, мифические – фиолетовый металл.
export const ACHIEVEMENT_TIERS = [
    ['common', 'базовые', 'серебро · первые шаги, город и маршруты клуба'],
    ['rare', 'легендарные', 'золото · то, что выходит за рамки обычного хайка'],
    ['very', 'мифические', 'фиолетовый металл · большие вехи'],
];
// в базе 4 значения редкости; «rare» – старое, показывается как легендарная
export const tierOf = rarity => rarity === 'mythical' ? 'very' : rarity === 'rare' || rarity === 'legendary' ? 'rare' : 'common';

export const ACHIEVEMENT_CATALOG = [
    { id: "first-hike", title: "первый хайк с интеллигенцией", rarity: 'common', tier: 'common', description: "первый раз вышел на тропу с клубом – дальше только выше" },
    { id: "card-owner", title: "владелец карты интеллигента", rarity: 'legendary', tier: 'rare', description: "теперь ты – часть клуба, а клуб растёт вместе с тобой" },
    { id: "profile", title: "показал себя клубу", rarity: 'common', tier: 'common', description: "заполнил профиль – теперь тебя легко найти и позвать на хайк" },
    { id: "mastermind-request", title: "мой вопрос на мастермайнде", rarity: 'legendary', tier: 'rare', description: "вынес свой вопрос на вершину и услышал десять взглядов" },
    { id: "plus-one", title: "привёл своего +1", rarity: 'common', tier: 'common', description: "позвал друга в клуб – вас стало на одного больше" },
    { id: "gift-card", title: "подарил карту другу", rarity: 'legendary', tier: 'rare', description: "подарил кому-то целый сезон в горах" },
    { id: "honest-review", title: "искренний отзыв", rarity: 'legendary', tier: 'rare', description: "рассказал честно, как это было – так клуб становится лучше" },
    { id: "story", title: "показал горы в сторис", rarity: 'common', tier: 'common', description: "поделился маршрутом – пусть все видят, где мы были" },
    { id: "after-hike-drinks", title: "первый бухайкинг", rarity: 'common', tier: 'common', description: "после вершины – за стол: лучшие разговоры случаются именно тут" },
    { id: "first-city-event", title: "свои в городе", rarity: 'common', tier: 'common', description: "пришёл на встречу клуба в городе – пицца, пикник или вечер в заведении" },
    { id: "hiking-box", title: "хайкинг бокс", rarity: 'legendary', tier: 'rare', description: "взял хайкинг бокс – вершина вкуснее, когда не думаешь о еде" },
    { id: "headlamps", title: "спуск с фонариками", rarity: 'legendary', tier: 'rare', description: "спускались в темноте – и это был лучший кусок хайка" },
    { id: "rain", title: "промок, но дошёл", rarity: 'legendary', tier: 'rare', description: "дождь не остановил – промокли, посмеялись и дошли" },
    { id: "wim-hof", title: "дыхание по Хофу", rarity: 'common', tier: 'common', description: "дышали на вершине так, что закружилась голова – в хорошем смысле" },
    { id: "above-1500", title: "выше 1500 метров", rarity: 'legendary', tier: 'rare', description: "поднялся выше полутора километров – Крым под ногами" },
    { id: "swim", title: "нырнул после тропы", rarity: 'legendary', tier: 'rare', description: "искупался в море или горном озере сразу после хайка" },
    { id: "four-seasons", title: "четыре сезона в горах", rarity: 'mythical', tier: 'very', description: "ходил с клубом зимой, весной, летом и осенью" },
    { id: "all-routes", title: "все 18 маршрутов клуба", rarity: 'mythical', tier: 'very', description: "прошёл каждый маршрут клуба – ты знаешь эти горы лучше всех" },
    { id: "hikes-5", title: "5 хайков", rarity: 'common', tier: 'common', description: "пять раз выходили вместе – это уже привычка" },
    { id: "hikes-10", title: "10 хайков", rarity: 'legendary', tier: 'rare', description: "десять вершин с клубом" },
    { id: "hikes-25", title: "25 хайков", rarity: 'legendary', tier: 'rare', description: "четверть сотни троп – ты один из тех, на ком держится клуб" },
    { id: "hikes-50", title: "50 хайков", rarity: 'mythical', tier: 'very', description: "полсотни хайков – легенда клуба" },
    { id: "route-krestovaya", title: "хайк на Крестовую гору", rarity: 'common', tier: 'common', description: "Алупка сверху, Исар под ногами" },
    { id: "route-kant", title: "Форосский кант", rarity: 'common', tier: 'common', description: "прошёл кант над Форосом и Чёртовой лестницей" },
    { id: "route-pallasa", title: "тропа Палласа", rarity: 'common', tier: 'common', description: "по тропе, которую прокладывал сам Паллас" },
    { id: "route-eklizi", title: "хайк на Эклизи-Бурун", rarity: 'common', tier: 'common', description: "высшая точка Чатыр-Дага" },
    { id: "route-ilyas", title: "хайк на Ильяс-Каю", rarity: 'common', tier: 'common', description: "плато над морем и обрыв, от которого захватывает дух" },
    { id: "route-biuk", title: "хайк на Биюк-Исар", rarity: 'common', tier: 'common', description: "к развалинам крепости над Ялтой" },
    { id: "route-balaklava", title: "мыс Айя – Балаклава", rarity: 'common', tier: 'common', description: "от Балаклавы к мысу Айя вдоль моря" },
    { id: "route-kanyon", title: "Чернореченский каньон", rarity: 'common', tier: 'common', description: "вниз, к реке, в самый большой каньон Крыма" },
    { id: "route-demerdji", title: "Долина привидений", rarity: 'common', tier: 'common', description: "Демерджи и каменные великаны" },
    { id: "route-ushchelye", title: "ущелье Уч-Кош", rarity: 'common', tier: 'common', description: "вверх по ущелью к водопадам" },
    { id: "route-ayudag", title: "хайк на Аю-Даг", rarity: 'common', tier: 'common', description: "на спину Медведь-горы" },
    { id: "route-massandra", title: "Массандровская тропа", rarity: 'common', tier: 'common', description: "из парка – вверх по тропе к яйле" },
    { id: "route-paragilmen", title: "хайк на Парагильмен", rarity: 'common', tier: 'common', description: "на скалу над Алуштой" },
    { id: "route-kushkaya", title: "хайк на Куш-Каю", rarity: 'common', tier: 'common', description: "скала-птица над Ласпи" },
    { id: "route-evrejskaya", title: "Еврейская тропа", rarity: 'common', tier: 'common', description: "старой тропой через лес" },
    { id: "route-biruzovoe", title: "Бирюзовое озеро", rarity: 'common', tier: 'common', description: "к озеру, вода в котором и правда бирюзовая" },
    { id: "route-tsarskaya", title: "Царская тропа", rarity: 'common', tier: 'common', description: "по тропе, где гуляли императоры" },
    { id: "route-ai-yori", title: "хайк на Ай-Йори", rarity: 'common', tier: 'common', description: "скалы Ай-Йори и вид на всю долину" },
];
export const CLUB_ACHIEVEMENTS = ACHIEVEMENT_CATALOG.map(a => a.title);

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'–—-]/g, ' ').replace(/\s+/g, ' ').trim();
export const catalogByTitle = title => ACHIEVEMENT_CATALOG.find(a => norm(a.title) === norm(title)) || null;

// Разделы экрана «значки» (как «Награды» в Apple): карточка раздела – последний значок, стопка и «N из M».
export const ACHIEVEMENT_CATEGORIES = [
    { key: 'routes', title: 'маршруты', hint: 'пройди маршрут с клубом – за каждый свой значок',
        ids: id => id.startsWith('route-') || id === 'all-routes' },
    { key: 'moments', title: 'моменты на тропе', hint: 'дождь, фонарики, рассвет – то, что запоминается',
        ids: id => ['headlamps', 'rain', 'wim-hof', 'above-1500', 'swim', 'four-seasons'].includes(id) },
    { key: 'hikes', title: 'хайки с клубом', hint: '5, 10, 25 и 50 хайков с клубом',
        ids: id => id.startsWith('hikes-') },
    { key: 'city', title: 'после тропы и в городе', hint: 'бухайкинг, встречи в городе и хайкинг бокс',
        ids: id => ['after-hike-drinks', 'first-city-event', 'hiking-box'].includes(id) },
    { key: 'circle', title: 'знакомства и круг', hint: 'приведи своего +1, поделись отзывом или вынеси вопрос на мастермайнд',
        ids: id => ['mastermind-request', 'plus-one', 'gift-card', 'honest-review', 'story'].includes(id) },
    { key: 'first', title: 'первые шаги', hint: 'первый хайк, карта интеллигента и профиль в «интеллигентах»',
        ids: id => ['first-hike', 'card-owner', 'profile'].includes(id) },
];
// значки вне каталога (шуточные, особые) – свой раздел, только если такие есть
export const EXTRA_CATEGORY = { key: 'extra', title: 'особые', hint: '' };
export const categoryOf = title => {
    const c = catalogByTitle(title);
    return c ? (ACHIEVEMENT_CATEGORIES.find(k => k.ids(c.id))?.key || 'extra') : 'extra';
};
