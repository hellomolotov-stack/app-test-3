// js/ui/maplibre-loader.js – один загрузчик библиотеки карт на всё приложение.
// Раньше было три копии (шторка хайка, маршруты, личная карта): две вкладки могли скачать ~800 КБ дважды,
// а после одной ошибки карта не пробовала снова до перезапуска. Библиотека лежит на нашем домене
// (build.js кладёт её в /assets/vendor) – unpkg.com из России часто медленный; он остаётся запасным.
const VERSION = '4.7.1';
const SOURCES = [
    `/assets/vendor/maplibre-gl-${VERSION}/maplibre-gl`,
    `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl`
];
const SCRIPT_MS = 20000;
let loading = null;

function addCss(href) {
    if (document.querySelector(`link[data-maplibre="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.maplibre = href;
    document.head.appendChild(link);
}

function addScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => { script.remove(); reject(new Error('карты: нет ответа')); }, SCRIPT_MS);
        script.src = src;
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('карты: не загрузились')); };
        document.head.appendChild(script);
    });
}

export function ensureMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
        let lastError = null;
        for (const base of SOURCES) {
            try {
                addCss(`${base}.css`);
                await addScript(`${base}.js`);
                if (window.maplibregl) return;
            } catch (error) { lastError = error; }
        }
        throw lastError || new Error('карты: не загрузились');
    })().catch(error => {
        loading = null; // следующая попытка – заново, а не тот же отказ
        throw error;
    });
    return loading;
}
