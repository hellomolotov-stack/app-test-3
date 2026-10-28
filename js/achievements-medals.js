// Готовые медали, которые уже лежат в приложении (assets/achievements). Если у ачивки есть медаль отсюда,
// админка сохраняет её сразу выданной – и уведомление можно отправлять сразу.
// Новую медаль добавлять сюда, когда её файл (прозрачный PNG/WebP) уже выложен в assets/achievements.
export const MEDAL_LIBRARY = [
    { title: 'из идеи в реальность', imageUrl: '/assets/achievements/badges/idea-to-reality-v1.png' },
    { title: 'читерский проспект', imageUrl: '/assets/achievements/badges/cheater-prospect-v1.png' },
    { title: 'добро пожаловать', imageUrl: '/assets/achievements/badges/welcome-v2.png' },
    { title: 'залез в пещеру пауков', imageUrl: '/assets/achievements/spider-cave-transparent-v2.png' },
    // значки из папки «значки» (26.10.2026): количество хайков, особые моменты, после тропы и город
    { title: 'выше 1500 метров', imageUrl: '/assets/achievements/badges/above-1500-v2.png' },
    { title: 'четыре сезона в горах', imageUrl: '/assets/achievements/badges/four-seasons.png' },
    { title: 'спуск с фонариком', imageUrl: '/assets/achievements/badges/headlamps-v2.png' },
    { title: 'промок, но дошёл', imageUrl: '/assets/achievements/badges/rain.png' },
    { title: 'нырнул после тропы', imageUrl: '/assets/achievements/badges/swim.png' },
    { title: 'дыхание по Хофу', imageUrl: '/assets/achievements/badges/wim-hof-v2.png' },
    { title: 'первый бухайкинг', imageUrl: '/assets/achievements/badges/after-hike-drinks-v2.png' },
    { title: 'свои в городе', imageUrl: '/assets/achievements/badges/first-city-event-v2.png' },
    { title: 'хайкинг бокс', imageUrl: '/assets/achievements/badges/hiking-box.png' },
    // маршруты – актуальные значки из «⛰️ интеллигенция/Передача-значков-2026-10-27/значки» (27.10.2026)
    { title: 'хайк на Крестовую гору', imageUrl: '/assets/achievements/badges/route-krestovaya-v4.png' },
    { title: 'Форосский кант', imageUrl: '/assets/achievements/badges/route-kant-v5.png' },
    { title: 'тропа Палласа', imageUrl: '/assets/achievements/badges/route-pallasa-v4.png' },
    { title: 'хайк на Эклизи-Бурун', imageUrl: '/assets/achievements/badges/route-eklizi-v1.png' },
    { title: 'хайк на Ильяс-Кая', imageUrl: '/assets/achievements/badges/route-ilyas-v2.png' },
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
    { title: 'запрос на мастермайнде', imageUrl: '/assets/achievements/badges/mastermind-v3.png' },
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
    // количество хайков – серия 5/10/20/30/50 (27.10.2026, фон убран)
    { title: '5 хайков', imageUrl: '/assets/achievements/badges/hikes-5-v2.png' },
    { title: '10 хайков', imageUrl: '/assets/achievements/badges/hikes-10-v3.png' },
    { title: '20 хайков', imageUrl: '/assets/achievements/badges/hikes-20-v2.png' },
    { title: '30 хайков', imageUrl: '/assets/achievements/badges/hikes-30-v2.png' },
    { title: '50 хайков', imageUrl: '/assets/achievements/badges/hikes-50-v3.png' },
];

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim();
export const medalForTitle = title => MEDAL_LIBRARY.find(m => norm(m.title) === norm(title)) || null;
export const medalByUrl = url => MEDAL_LIBRARY.find(m => m.imageUrl === url) || null;

// Лёгкие копии значков (WebP): thumbs – 256 px для сеток и полок, md – 512 px для слайдера.
// Делаются из PNG скриптом scripts/medal-thumbs.py; если копии нет – картинка сама откатывается на исходный PNG.
const variant = (url, dir) => typeof url === 'string' && url.startsWith('/assets/achievements/') && url.endsWith('.png')
    ? url.replace('/assets/achievements/', `/assets/achievements/${dir}/`).replace(/\.png$/, '.webp') : url;
export const medalThumb = url => variant(url, 'thumbs');
export const medalMd = url => variant(url, 'md');
// <img src=копия data-orig=исходник>: при ошибке загрузки подставляем исходник
export const medalSrc = (url, size = 'thumbs') => {
    const src = variant(url, size);
    const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    return src === url ? `src="${e(url)}"` : `src="${e(src)}" data-orig="${e(url)}" decoding="async"`;
};
if (typeof document !== 'undefined' && !window.__medalFallback) {
    window.__medalFallback = true;
    document.addEventListener('error', e => {
        const img = e.target;
        if (img?.tagName === 'IMG' && img.dataset.orig) { const orig = img.dataset.orig; delete img.dataset.orig; img.src = orig; }
    }, true);
}
