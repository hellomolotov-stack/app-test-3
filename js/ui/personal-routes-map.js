// js/ui/personal-routes-map.js
// «Мой Крым»: личная 3D-карта маршрутов. Пройденные маршруты светятся жёлтым, вокруг них карта
// открыта, всё остальное скрыто туманом. Прошёл все — тумана нет. Кнопка «поделиться» собирает
// картинку в формате сторис. Пока показывается только пилотному аккаунту (см. PILOT_USERNAMES).
import { haptic } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { loadUserRegistrations } from '../firebase.js';

const PILOT_USERNAMES = new Set(['maxmolotov']);
const MAP_BOUNDS = [32.15, 44.05, 36.85, 46.45]; // [запад, юг, восток, север] — как у остальных карт
const FOG_WIDTH_PX = 2048;
const YELLOW = '#D9FD19';

export function isPersonalMapPilotUser(user) {
    return PILOT_USERNAMES.has(String(user?.username || '').replace(/^@/, '').toLowerCase());
}

// ───────────────────────── какие маршруты пройдены ─────────────────────────

const STOP_WORDS = new Set([
    'хайк', 'на', 'по', 'в', 'во', 'к', 'до', 'тропа', 'тропе', 'тропу', 'тропы',
    'ущелье', 'ущелья', 'озеро', 'озера', 'озеру', 'гора', 'горе', 'гору'
]);
// Хайк называется иначе, чем маршрут в каталоге: хватает одного слова. Ключ — название маршрута
// в нижнем регистре: id в каталоге и в таблице маршрутов не совпадают, а названия одни и те же.
const ROUTE_ALIASES = {
    'форосский кант': ['кант']
};

// Хайки, которых уже нет в таблице hikes (строки после прохождения удаляют), но по которым люди
// были записаны. Нужны, пока прошедшие хайки не хранятся в таблице. Отменённые сюда не попадают.
const PAST_HIKE_TITLES = {
    '2026-06-28': 'тропа на Уч-Кош',
    '2026-09-06': 'хайк на Кант'
};

const norm = value => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е');
const significantWords = value => norm(value).split(/[^a-zа-я0-9]+/).filter(word => word && !STOP_WORDS.has(word));
// Обрезаем окончание, чтобы «Царская тропа» совпала с «по Царской тропе», «речка» с «речку».
const stem = word => (word.length <= 4 ? word : word.slice(0, 4));

function routeMatchesHike(route, hikeTitle) {
    const hikeStems = new Set(significantWords(hikeTitle).map(stem));
    if (!hikeStems.size) return false;

    const aliases = ROUTE_ALIASES[norm(route.title)];
    if (aliases && aliases.every(word => hikeStems.has(stem(norm(word))))) return true;

    const routeWords = significantWords(route.title);
    if (!routeWords.length) return false;
    if (routeWords.every(word => hikeStems.has(stem(word)))) return true;
    // «Эклизи-Бурун» ↔ «хайк на Эклизи»: достаточно длинного первого слова.
    return routeWords.length > 1 && routeWords[0].length >= 6 && hikeStems.has(stem(routeWords[0]));
}

export function getRouteForHikeTitle(routes, hikeTitle) {
    return routes.find(route => routeMatchesHike(route, hikeTitle)) || null;
}

// Пройденным считаем маршрут, если человек был записан на уже прошедший хайк по нему.
// Отметок «пришёл» у нас нет — это оценка по записям, точнее станет, когда появится ручная отметка.
export function computeVisitedRouteIds(routes, hikes, registrations, today = new Date()) {
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);
    const visited = new Set();
    const unmatched = [];
    const knownDates = new Set();

    const consider = (date, title) => {
        const route = getRouteForHikeTitle(routes, title);
        if (route) visited.add(route.id);
        else unmatched.push(`${date} ${title}`);
    };

    (hikes || []).forEach(hike => {
        if (!hike?.date) return;
        knownDates.add(hike.date);
        if (!hike.title || !String(hike.title).trim()) return;
        if (registrations?.[hike.date] !== true) return;
        if (hike.cancelled === true || hike.city === true || hike.city === 'yes' || hike.book_club === true) return;
        if (!(new Date(hike.date) < startOfToday)) return;
        consider(hike.date, hike.title);
    });

    Object.entries(PAST_HIKE_TITLES).forEach(([date, title]) => {
        if (knownDates.has(date) || registrations?.[date] !== true) return;
        if (!(new Date(date) < startOfToday)) return;
        consider(date, title);
    });
    return { visited, unmatched };
}

// ───────────────────────── карта ─────────────────────────

let maplibreLoading = null;
function ensureMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (maplibreLoading) return maplibreLoading;
    maplibreLoading = new Promise((resolve, reject) => {
        if (!document.querySelector('link[href*="maplibre-gl"]')) {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
            document.head.appendChild(css);
        }
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    return maplibreLoading;
}

const mercatorY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// Детерминированный «случайный» генератор — туман выглядит одинаково при каждом открытии.
function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6D2B79F5) >>> 0;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function routeBounds(routes) {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    routes.forEach(route => route.segments.forEach(segment => segment.forEach(([lat, lon]) => {
        west = Math.min(west, lon); east = Math.max(east, lon);
        south = Math.min(south, lat); north = Math.max(north, lat);
    })));
    return [[west, south], [east, north]];
}

// Рисуем туман картинкой в координатах карты: она ложится на рельеф вместе с тайлами, а мягкий
// край получаем многократной обводкой треков (ctx.filter в iOS Safari до 18 нет).
// Плотность тумана везде одинакова, а «открытость» считаем отдельным слоем-маской:
//   открытие = таяние вокруг пройденных × (1 − блок вокруг непройденных), плюс ядро пройденных.
// Так рядом лежащие пройденные зоны не сливаются в полосу вдоль берега, а над непройденными
// туман остаётся ровно той же плотности, что и вокруг (раньше слои тумана складывались друг на
// друга и там появлялись чёрные пятна). Туман тёмный, в тон карты, но не плоский прямоугольник:
// текстура из множества полупрозрачных пятен разного размера и тона (светлее и темнее базы) даёт
// эффект настоящей дымки, сквозь которую местами едва проступает рельеф.
const FOG_ALPHA = 0.8;
const FOG_RGB = '9, 10, 9'; // тон в цвет фона приложения (#0A0B09)

function buildFogImage(visitedRoutes, unvisitedRoutes) {
    const [west, south, east, north] = MAP_BOUNDS;
    const width = FOG_WIDTH_PX;
    const dy = mercatorY(north) - mercatorY(south);
    const dx = ((east - west) * Math.PI) / 180;
    const height = Math.round((width * dy) / dx);
    const pxPerKm = width / ((east - west) * 111.32 * Math.cos((44.9 * Math.PI) / 180));
    const toPx = (lon, lat) => [
        ((lon - west) / (east - west)) * width,
        ((mercatorY(north) - mercatorY(lat)) / dy) * height
    ];
    const makeLayer = () => {
        const layer = document.createElement('canvas');
        layer.width = width;
        layer.height = height;
        const layerCtx = layer.getContext('2d');
        layerCtx.lineCap = 'round';
        layerCtx.lineJoin = 'round';
        return { layer, layerCtx };
    };
    // Серия обводок от широкой к узкой: прозрачность накапливается к центру, край получается мягким.
    const soft = (layerCtx, routes, outerKm, innerKm, passes, alpha) => {
        layerCtx.strokeStyle = '#000';
        layerCtx.globalAlpha = alpha;
        const outer = 2 * outerKm * pxPerKm;
        const inner = 2 * innerKm * pxPerKm;
        for (let pass = 0; pass < passes; pass++) {
            layerCtx.lineWidth = outer - ((outer - inner) * pass) / (passes - 1);
            routes.forEach(route => route.segments.forEach(segment => {
                layerCtx.beginPath();
                segment.forEach(([lat, lon], index) => {
                    const [x, y] = toPx(lon, lat);
                    if (index === 0) layerCtx.moveTo(x, y); else layerCtx.lineTo(x, y);
                });
                layerCtx.stroke();
            }));
        }
        layerCtx.globalAlpha = 1;
    };

    // Открытие: таяние вокруг пройденных (радиус мягкого края ≈ 5.5 км, полностью открыто ≈ 1.8 км).
    const { layer: reveal, layerCtx: revealCtx } = makeLayer();
    soft(revealCtx, visitedRoutes, 5.5, 1.8, 14, 0.22);
    // Блок: вокруг непройденных открытие гасится (радиус ≈ 3.2 км, в центре гасится целиком).
    const { layer: block, layerCtx: blockCtx } = makeLayer();
    soft(blockCtx, unvisitedRoutes, 3.2, 1.2, 12, 0.3);
    revealCtx.globalCompositeOperation = 'destination-out';
    revealCtx.drawImage(block, 0, 0);
    revealCtx.globalCompositeOperation = 'source-over';
    // Ядро пройденных маршрутов — открыто целиком, даже если рядом непройденный.
    soft(revealCtx, visitedRoutes, 1.3, 0.7, 6, 0.6);

    // Сам туман: ровная плотная база + текстура клочьев (светлее и темнее базы вперемешку),
    // чтобы читался как дымка с движением, а не как залитый прямоугольник.
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgba(${FOG_RGB}, ${FOG_ALPHA})`;
    ctx.fillRect(0, 0, width, height);

    const random = seededRandom(20260922);
    // Крупные светлые клочья — «тело» дымки, разной плотности, чтобы не было ровного тона.
    for (let i = 0; i < 90; i++) {
        const x = random() * width;
        const y = random() * height;
        const radius = 140 + random() * 420;
        const alpha = 0.05 + random() * 0.1;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(150, 156, 148, ${alpha})`);
        gradient.addColorStop(1, 'rgba(150, 156, 148, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // Мелкая рябь поверх — добавляет ощущение глубины и лёгкого движения.
    for (let i = 0; i < 260; i++) {
        const x = random() * width;
        const y = random() * height;
        const radius = 30 + random() * 110;
        const alpha = 0.02 + random() * 0.045;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(170, 175, 165, ${alpha})`);
        gradient.addColorStop(1, 'rgba(170, 175, 165, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // Редкие тёмные проталины — рельеф едва проступает сквозь дымку неравномерно.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
        const x = random() * width;
        const y = random() * height;
        const radius = 60 + random() * 180;
        const alpha = 0.05 + random() * 0.09;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(reveal, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return canvas;
}

// Туман отдаём карте как растровые тайлы через свой протокол: image-источник MapLibre при включённом
// 3D-рельефе не рисуется, а обычные тайловые слои ложатся на рельеф. Тайл вырезаем из общей картинки тумана.
let fogCanvas = null;
let fogProtocolRegistered = false;
function registerFogProtocol() {
    if (fogProtocolRegistered) return;
    fogProtocolRegistered = true;
    maplibregl.addProtocol('pmapfog', async params => {
        const match = /pmapfog:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
        const tile = document.createElement('canvas');
        tile.width = 512;
        tile.height = 512;
        if (match && fogCanvas) {
            const z = Number(match[1]), x = Number(match[2]), y = Number(match[3]);
            const n = 2 ** z;
            const [west, south, east, north] = MAP_BOUNDS;
            const dy = mercatorY(north) - mercatorY(south);
            const lonLeft = (x / n) * 360 - 180;
            const lonRight = ((x + 1) / n) * 360 - 180;
            const yTop = Math.PI * (1 - (2 * y) / n);
            const yBottom = Math.PI * (1 - (2 * (y + 1)) / n);
            const sx = ((lonLeft - west) / (east - west)) * fogCanvas.width;
            const sw = ((lonRight - lonLeft) / (east - west)) * fogCanvas.width;
            const sy = ((mercatorY(north) - yTop) / dy) * fogCanvas.height;
            const sh = ((yTop - yBottom) / dy) * fogCanvas.height;
            tile.getContext('2d').drawImage(fogCanvas, sx, sy, sw, sh, 0, 0, 512, 512);
        }
        const blob = await new Promise(resolve => tile.toBlob(resolve, 'image/png'));
        return { data: await blob.arrayBuffer() };
    });
}

function routesFeatureCollection(routes, visitedIds) {
    return {
        type: 'FeatureCollection',
        features: routes.map(route => ({
            type: 'Feature',
            properties: { id: route.id, visited: visitedIds.has(route.id) },
            geometry: {
                type: 'MultiLineString',
                coordinates: route.segments.map(segment => segment.map(([lat, lon]) => [lon, lat]))
            }
        }))
    };
}

// ───────────────────────── картинка «поделиться» ─────────────────────────

function drawSpaced(ctx, text, centerX, y, spacing) {
    const chars = [...text];
    const widths = chars.map(char => ctx.measureText(char).width);
    const total = widths.reduce((sum, w) => sum + w, 0) + spacing * (chars.length - 1);
    let x = centerX - total / 2;
    const previousAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach((char, index) => { ctx.fillText(char, x, y); x += widths[index] + spacing; });
    ctx.textAlign = previousAlign;
}

function drawCover(ctx, image, x, y, w, h) {
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

function buildPoster({ mapCanvas, visitedCount, total, percent, name }) {
    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    const background = ctx.createRadialGradient(W / 2, H * 0.4, 100, W / 2, H * 0.4, H * 0.75);
    background.addColorStop(0, '#191a18');
    background.addColorStop(1, '#070807');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `600 30px ${font}`;
    drawSpaced(ctx, 'ХАЙКИНГ ИНТЕЛЛИГЕНЦИЯ', W / 2, 118, 7);

    // «мой Крым»
    ctx.font = 'italic 128px Georgia, "Times New Roman", serif';
    const first = 'мой ';
    const second = 'Крым';
    const firstWidth = ctx.measureText(first).width;
    const totalWidth = firstWidth + ctx.measureText(second).width;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(first, (W - totalWidth) / 2, 290);
    ctx.fillStyle = YELLOW;
    ctx.fillText(second, (W - totalWidth) / 2 + firstWidth, 290);

    // Карта с мягким растворением к фону сверху и снизу.
    const mapTop = 360, mapHeight = 940;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, mapTop, W, mapHeight);
    ctx.clip();
    drawCover(ctx, mapCanvas, 0, mapTop, W, mapHeight);
    ctx.restore();
    const fadeTop = ctx.createLinearGradient(0, mapTop, 0, mapTop + 170);
    fadeTop.addColorStop(0, '#0d0e0c');
    fadeTop.addColorStop(1, 'rgba(13,14,12,0)');
    ctx.fillStyle = fadeTop;
    ctx.fillRect(0, mapTop, W, 170);
    const fadeBottom = ctx.createLinearGradient(0, mapTop + mapHeight - 230, 0, mapTop + mapHeight);
    fadeBottom.addColorStop(0, 'rgba(8,9,8,0)');
    fadeBottom.addColorStop(1, '#080908');
    ctx.fillStyle = fadeBottom;
    ctx.fillRect(0, mapTop + mapHeight - 230, W, 230);

    // Цифры.
    ctx.textAlign = 'left';
    ctx.font = `800 230px ${font}`;
    const numberText = String(visitedCount);
    const numberWidth = ctx.measureText(numberText).width;
    ctx.font = `400 96px ${font}`;
    const totalText = ` / ${total}`;
    const totalTextWidth = ctx.measureText(totalText).width;
    const startX = (W - numberWidth - totalTextWidth) / 2;
    ctx.shadowColor = 'rgba(217,253,25,0.5)';
    ctx.shadowBlur = 50;
    ctx.fillStyle = YELLOW;
    ctx.font = `800 230px ${font}`;
    ctx.fillText(numberText, startX, 1500);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `400 96px ${font}`;
    ctx.fillText(totalText, startX + numberWidth, 1500);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `500 42px ${font}`;
    ctx.fillText('маршрутов пройдено', W / 2, 1570);

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 58px ${font}`;
    ctx.fillText(name || 'участник клуба', W / 2, 1712);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `400 34px ${font}`;
    ctx.fillText(`открыто ${percent}% гор`, W / 2, 1766);

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = `400 30px ${font}`;
    ctx.fillText('t.me/yaltahiking_bot', W / 2, 1852);
    return canvas;
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('empty image'))),
        'image/png'
    ));
}

function showPosterModal(blob, fileName) {
    document.querySelector('.pmap-modal')?.remove();
    const url = URL.createObjectURL(blob);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay animated pmap-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
        <div class="modal-content animated pmap-modal-content">
            <button class="modal-close" type="button" aria-label="закрыть">&times;</button>
            <img class="pmap-poster" alt="моя карта маршрутов" src="${url}">
            <div class="pmap-modal-hint">зажми картинку, чтобы сохранить, или поделись кнопкой</div>
            <button class="btn btn-yellow pmap-modal-share" type="button">поделиться</button>
        </div>`;
    const close = () => {
        overlay.classList.remove('visible');
        window.setTimeout(() => { overlay.remove(); URL.revokeObjectURL(url); }, 200);
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.pmap-modal-share').addEventListener('click', async () => {
        haptic();
        const file = new File([blob], fileName, { type: 'image/png' });
        try {
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], text: 'мой Крым — хайкинг интеллигенция' });
                log('мой Крым: поделился', false, state.user);
                return;
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
        }
        // Системного «поделиться» нет — отдаём файл на скачивание.
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

// ───────────────────────── блок на экране ─────────────────────────

let stylesInjected = false;
function injectStyles() {
    if (stylesInjected || document.getElementById('personalMapStyles')) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'personalMapStyles';
    style.textContent = `
        .pmap-card { padding: 4px 0 16px; margin-bottom: 14px; }
        .pmap-head { display: flex; align-items: baseline; justify-content: space-between; margin: 0 16px 8px; }
        .pmap-head .section-title { margin: 0 !important; line-height: 1.1; }
        .pmap-count { color: rgba(255,255,255,0.5); font-size: 13px; }
        .pmap-count b { color: ${YELLOW}; font-size: 22px; font-weight: 800; }
        .pmap-bar { height: 4px; margin: 0 16px 12px; border-radius: 4px; background: rgba(255,255,255,0.12); overflow: hidden; }
        .pmap-bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, ${YELLOW}, #b6dc00); box-shadow: 0 0 8px ${YELLOW}; transition: width .8s ease; }
        .pmap-wrap { position: relative; aspect-ratio: 1.25 / 1; margin: 0 16px; border-radius: 16px; overflow: hidden; background: #0A0B09; border: 1px solid rgba(255,255,255,0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 24px rgba(0,0,0,0.22); }
        .pmap-wrap.pmap-complete { border-color: rgba(217,253,25,0.55); box-shadow: 0 0 26px rgba(217,253,25,0.22); }
        .pmap-map { width: 100%; height: 100%; }
        .pmap-map .maplibregl-ctrl-bottom-left, .pmap-map .maplibregl-ctrl-bottom-right { display: none; }
        .pmap-hint { position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 12px 9px; text-align: center; font-size: 12px; color: rgba(255,255,255,0.78); background: linear-gradient(transparent, rgba(6,7,6,0.88)); pointer-events: none; }
        .pmap-complete .pmap-hint { color: ${YELLOW}; font-weight: 700; }
        .pmap-legend { display: flex; justify-content: center; gap: 18px; margin: 11px 16px 13px; font-size: 12px; color: rgba(255,255,255,0.6); }
        .pmap-legend i { display: inline-block; width: 16px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
        .pmap-legend .y { background: ${YELLOW}; box-shadow: 0 0 6px ${YELLOW}; }
        .pmap-legend .g { background: repeating-linear-gradient(90deg, rgba(199,208,220,.5) 0 3px, transparent 3px 6px); }
        .pmap-share { display: block; width: calc(100% - 32px); margin: 0 16px; }
        .pmap-share[disabled] { opacity: .6; }
        .pmap-fallback { height: 100%; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.68); font-size: 14px; }
        .pmap-modal .pmap-modal-content { max-width: 340px; padding: 16px; background: rgba(10,11,9,0.94); text-align: center; }
        .pmap-poster { display: block; width: 100%; height: auto; border-radius: 14px; margin-bottom: 10px; }
        .pmap-modal-hint { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 12px; }
        .pmap-modal-share { width: 100%; }
    `;
    document.head.appendChild(style);
}

let currentMap = null;

function cameraForRoutes(map, bounds) {
    const camera = map.cameraForBounds(bounds, { padding: { top: 26, right: 30, bottom: 44, left: 30 }, maxZoom: 11 }) || {};
    // Наклон «съедает» часть ширины кадра, поэтому отъезжаем на долю уровня.
    return { center: camera.center, zoom: (camera.zoom || 8.4) - 0.12, pitch: 32, bearing: 0 };
}

export async function renderPersonalRoutesMap(container, options = {}) {
    if (!container) return;
    injectStyles();
    const routes = (options.routes || state.intelligentsiaRoutes || []).filter(route => route?.segments?.length);
    if (!routes.length) { container.innerHTML = ''; return; }

    let visited = options.visitedIds ? new Set(options.visitedIds) : null;
    if (!visited) {
        let registrations = {};
        try { registrations = (await loadUserRegistrations(state.user?.id)) || {}; } catch (error) { console.error(error); }
        const result = computeVisitedRouteIds(routes, state.hikesList || [], registrations);
        visited = result.visited;
        if (result.unmatched.length) console.info('Мой Крым: хайки без маршрута в каталоге', result.unmatched);
    }
    const visitedRoutes = routes.filter(route => visited.has(route.id));
    const total = routes.length;
    const count = visitedRoutes.length;
    const percent = Math.round((count / total) * 100);
    const complete = count === total;

    container.innerHTML = `
        <div class="card-container pmap-card">
            <div class="pmap-head">
                <h2 class="section-title">🗺 мой Крым</h2>
                <div class="pmap-count"><b>${count}</b> / ${total}</div>
            </div>
            <div class="pmap-bar"><i style="width:${percent}%"></i></div>
            <div class="pmap-wrap ${complete ? 'pmap-complete' : ''}">
                <div class="pmap-map" id="personalRoutesMap"></div>
                <div class="pmap-hint">${complete ? 'весь Крым открыт' : 'туман скрывает то, где ты ещё не был'}</div>
            </div>
            <div class="pmap-legend">
                <span><i class="y"></i>пройден</span>
                ${complete ? '' : '<span><i class="g"></i>в тумане</span>'}
            </div>
            <button class="btn btn-yellow pmap-share" id="personalMapShare" type="button">поделиться картой</button>
        </div>`;

    log('мой Крым: показан', false, state.user, { visited: count, total });

    const bounds = routeBounds(routes);
    try {
        await ensureMapLibre();
    } catch (error) {
        const holder = container.querySelector('.pmap-map');
        if (holder) holder.innerHTML = '<div class="pmap-fallback">карта временно недоступна</div>';
        return;
    }

    const el = container.querySelector('#personalRoutesMap');
    if (!el) return;
    try { currentMap?.remove(); } catch (error) { /* карта уже удалена */ }

    const map = new maplibregl.Map({
        container: el,
        style: {
            version: 8,
            sources: {
                satellite: {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256,
                    maxzoom: 18,
                    bounds: MAP_BOUNDS
                }
            },
            layers: [{
                id: 'satellite-layer',
                type: 'raster',
                source: 'satellite',
                paint: { 'raster-brightness-max': 0.7, 'raster-contrast': 0.15, 'raster-saturation': -1, 'raster-resampling': 'linear' }
            }]
        },
        center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2],
        zoom: 8.6,
        pitch: 34,
        maxBounds: [[MAP_BOUNDS[0], MAP_BOUNDS[1]], [MAP_BOUNDS[2], MAP_BOUNDS[3]]],
        minZoom: 7.4,
        maxZoom: 14,
        maxPitch: 65,
        renderWorldCopies: false,
        attributionControl: false,
        keyboard: false,
        doubleClickZoom: false,
        antialias: false,
        preserveDrawingBuffer: true // нужен, чтобы снять картинку карты для «поделиться»
    });
    currentMap = map;
    container.__pmap = map; // для отладки и проверок в консоли

    map.on('load', () => {
        map.addSource('dem', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256,
            encoding: 'terrarium',
            maxzoom: 15,
            bounds: MAP_BOUNDS
        });
        map.setTerrain({ source: 'dem', exaggeration: 1.2 });
        map.setSky({ 'sky-color': '#0A0B09', 'horizon-color': '#151515', 'fog-color': '#0A0B09' });
        map.addLayer({
            id: 'terrain-hillshade',
            type: 'hillshade',
            source: 'dem',
            paint: { 'hillshade-exaggeration': 0.46, 'hillshade-shadow-color': '#111111', 'hillshade-highlight-color': '#bfc4bd' }
        });

        if (!complete) {
            registerFogProtocol();
            fogCanvas = buildFogImage(visitedRoutes, routes.filter(route => !visited.has(route.id)));
            container.__pmapFog = fogCanvas; // для проверок в консоли
            map.addSource('fog', {
                type: 'raster',
                tiles: ['pmapfog://{z}/{x}/{y}'],
                tileSize: 512,
                minzoom: 4,
                maxzoom: 12,
                bounds: MAP_BOUNDS
            });
            map.addLayer({
                id: 'fog-layer',
                type: 'raster',
                source: 'fog',
                paint: { 'raster-opacity': 1, 'raster-fade-duration': 500, 'raster-resampling': 'linear' }
            });
        }

        map.addSource('personal-routes', { type: 'geojson', data: routesFeatureCollection(routes, visited) });
        // Непройденные — едва заметный пунктир: подсказка, куда идти дальше.
        map.addLayer({
            id: 'pr-unvisited',
            type: 'line',
            source: 'personal-routes',
            filter: ['==', ['get', 'visited'], false],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#c7d0dc', 'line-width': 1.3, 'line-opacity': 0.34, 'line-dasharray': [2, 2.4] }
        });
        map.addLayer({
            id: 'pr-visited-glow',
            type: 'line',
            source: 'personal-routes',
            filter: ['==', ['get', 'visited'], true],
            paint: { 'line-color': YELLOW, 'line-width': 8, 'line-opacity': 0.5, 'line-blur': 5 }
        });
        map.addLayer({
            id: 'pr-visited',
            type: 'line',
            source: 'personal-routes',
            filter: ['==', ['get', 'visited'], true],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': YELLOW, 'line-width': 2.6, 'line-opacity': 1 }
        });
        // Рельеф подгружается позже первого кадра и сдвигает центр при наклоне — ставим камеру ещё раз.
        const camera = cameraForRoutes(map, bounds);
        map.jumpTo(camera);
        map.once('idle', () => map.jumpTo(camera));
    });

    const shareButton = container.querySelector('#personalMapShare');
    shareButton?.addEventListener('click', async () => {
        haptic();
        if (shareButton.disabled) return;
        shareButton.disabled = true;
        const originalText = shareButton.textContent;
        shareButton.textContent = 'готовлю картинку…';
        log('мой Крым: поделиться', false, state.user, { visited: count, total });
        try {
            const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
            map.jumpTo(cameraForRoutes(map, bounds));
            await new Promise(resolve => map.once('idle', resolve));
            const poster = buildPoster({
                mapCanvas: map.getCanvas(),
                visitedCount: count,
                total,
                percent,
                name: state.myProfile?.name || state.user?.first_name || ''
            });
            map.jumpTo(saved);
            showPosterModal(await canvasToBlob(poster), 'moy-krym.png');
        } catch (error) {
            console.error('Мой Крым: не удалось собрать картинку', error);
            alert('Не удалось собрать картинку. Попробуй ещё раз.');
        } finally {
            shareButton.disabled = false;
            shareButton.textContent = originalText;
        }
    });
}
