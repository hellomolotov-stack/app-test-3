// Готовые медали, которые уже лежат в приложении (assets/achievements). Если у ачивки есть медаль отсюда,
// админка сохраняет её сразу выданной – и уведомление можно отправлять сразу.
// Новую медаль добавлять сюда, когда её файл (прозрачный PNG/WebP) уже выложен в assets/achievements.
export const MEDAL_LIBRARY = [
    { title: 'залез в пещеру пауков', imageUrl: '/assets/achievements/spider-cave-transparent-v2.png' },
];

const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ').trim();
export const medalForTitle = title => MEDAL_LIBRARY.find(m => norm(m.title) === norm(title)) || null;
export const medalByUrl = url => MEDAL_LIBRARY.find(m => m.imageUrl === url) || null;
