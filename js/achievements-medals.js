// Готовые медали, которые уже лежат в приложении (assets/achievements). Если у ачивки есть медаль отсюда,
// админка сохраняет её сразу выданной – и уведомление можно отправлять сразу.
// Новую медаль добавлять сюда, когда её файл (прозрачный PNG/WebP) уже выложен в assets/achievements.
export const MEDAL_LIBRARY = [
    { title: 'залез в пещеру пауков', imageUrl: '/assets/achievements/spider-cave-transparent-v2.png' },
    // значки из папки «значки» (26.10.2026): количество хайков, особые моменты, после тропы и город
    { title: '5 хайков', imageUrl: '/assets/achievements/badges/hikes-5.png' },
    { title: '10 хайков', imageUrl: '/assets/achievements/badges/hikes-10.png' },
    { title: '25 хайков', imageUrl: '/assets/achievements/badges/hikes-25.png' },
    { title: '50 хайков', imageUrl: '/assets/achievements/badges/hikes-50.png' },
    { title: 'выше 1500 метров', imageUrl: '/assets/achievements/badges/above-1500.png' },
    { title: 'четыре сезона в горах', imageUrl: '/assets/achievements/badges/four-seasons.png' },
    { title: 'спуск с фонариками', imageUrl: '/assets/achievements/badges/headlamps.png' },
    { title: 'промок, но дошёл', imageUrl: '/assets/achievements/badges/rain.png' },
    { title: 'нырнул после тропы', imageUrl: '/assets/achievements/badges/swim.png' },
    { title: 'дыхание по Хофу', imageUrl: '/assets/achievements/badges/wim-hof.png' },
    { title: 'первый бухайкинг', imageUrl: '/assets/achievements/badges/after-hike-drinks.png' },
    { title: 'свои в городе', imageUrl: '/assets/achievements/badges/first-city-event.png' },
    { title: 'хайкинг бокс', imageUrl: '/assets/achievements/badges/hiking-box.png' },
    // маршруты – актуальные значки из «⛰️ интеллигенция/Передача-значков-2026-10-27/значки» (27.10.2026)
    { title: 'хайк на Крестовую гору', imageUrl: '/assets/achievements/badges/route-krestovaya-v4.png' },
    { title: 'Форосский кант', imageUrl: '/assets/achievements/badges/route-kant-v5.png' },
    { title: 'тропа Палласа', imageUrl: '/assets/achievements/badges/route-pallasa-v4.png' },
    { title: 'хайк на Эклизи-Бурун', imageUrl: '/assets/achievements/badges/route-eklizi-v1.png' },
    { title: 'хайк на Ильяс-Каю', imageUrl: '/assets/achievements/badges/route-ilyas-v1.png' },
    { title: 'хайк на Биюк-Исар', imageUrl: '/assets/achievements/badges/route-biuk-v1.png' },
    { title: 'мыс Айя – Балаклава', imageUrl: '/assets/achievements/badges/route-balaklava-v1.png' },
    { title: 'Чернореченский каньон', imageUrl: '/assets/achievements/badges/route-kanyon-v1.png' },
    { title: 'Долина привидений', imageUrl: '/assets/achievements/badges/route-demerdji-v1.png' },
    { title: 'ущелье Уч-Кош', imageUrl: '/assets/achievements/badges/route-ushchelye-v1.png' },
    { title: 'хайк на Аю-Даг', imageUrl: '/assets/achievements/badges/route-ayudag-v1.png' },
    { title: 'Массандровская тропа', imageUrl: '/assets/achievements/badges/route-massandra-v1.png' },
    // базовые 10 и маршруты 05–07 – «⛰️ интеллигенция/Передача-значков-2026-10-27/значки» (27.10.2026)
    { title: 'первый хайк с интеллигенцией', imageUrl: '/assets/achievements/badges/first-hike-v2.png' },
    { title: 'показал себя клубу', imageUrl: '/assets/achievements/badges/profile-v2.png' },
    { title: 'привёл своего +1', imageUrl: '/assets/achievements/badges/plus-one-v2.png' },
    { title: 'владелец карты интеллигента', imageUrl: '/assets/achievements/badges/card-owner-v2.png' },
    { title: 'подарил карту другу', imageUrl: '/assets/achievements/badges/gift-card-v1.png' },
    { title: 'мой вопрос на мастермайнде', imageUrl: '/assets/achievements/badges/mastermind-v1.png' },
    { title: 'искренний отзыв', imageUrl: '/assets/achievements/badges/honest-review-v1.png' },
    { title: 'показал горы в сторис', imageUrl: '/assets/achievements/badges/story-v2.png' },
    { title: 'промочил правую ногу', imageUrl: '/assets/achievements/badges/wet-boot-v2.png' },
    { title: 'откусил волшебный гриб', imageUrl: '/assets/achievements/badges/mushroom-v1.png' },
    { title: 'хайк на Парагильмен', imageUrl: '/assets/achievements/badges/route-paragilmen-v1.png' },
    { title: 'хайк на Куш-Каю', imageUrl: '/assets/achievements/badges/route-kushkaya-v1.png' },
    { title: 'Еврейская тропа', imageUrl: '/assets/achievements/badges/route-evrejskaya-v1.png' },
    { title: 'Бирюзовое озеро', imageUrl: '/assets/achievements/badges/route-biruzovoe-v1.png' },
    { title: 'Царская тропа', imageUrl: '/assets/achievements/badges/route-tsarskaya-v1.png' },
    { title: 'хайк на Ай-Йори', imageUrl: '/assets/achievements/badges/route-ai-yori-v1.png' },
    { title: 'хайк на Ат-Баш', imageUrl: '/assets/achievements/badges/route-at-bash-v2.png' },
];

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim();
export const medalForTitle = title => MEDAL_LIBRARY.find(m => norm(m.title) === norm(title)) || null;
export const medalByUrl = url => MEDAL_LIBRARY.find(m => m.imageUrl === url) || null;
