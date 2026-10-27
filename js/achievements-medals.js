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
];

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim();
export const medalForTitle = title => MEDAL_LIBRARY.find(m => norm(m.title) === norm(title)) || null;
export const medalByUrl = url => MEDAL_LIBRARY.find(m => m.imageUrl === url) || null;
