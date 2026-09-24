// js/ui/personal-routes-map.js
// «Мой Крым»: личная 3D-панорама южного берега. Три категории маршрутов: был (жёлтый, облака над ним
// разошлись), идём (дата ближайшего хайка, по нажатию — слайдер с записью), в облаках (не был).
// Кнопка «в сторис» собирает картинку 1080×1920. Пока показывается только пилотному аккаунту (см. PILOT_USERNAMES).
import { haptic } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { loadUserRegistrations } from '../firebase.js';

const PILOT_USERNAMES = new Set(['maxmolotov']);
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

// Камера «панорама вдоль берега»: от Балаклавы на северо-восток, весь южный берег уходит к горизонту.
const OVERVIEW = { center: [33.97, 44.555], zoom: 8.8, pitch: 66, bearing: 37 };

// Облака считаем в пикселях web-mercator на z9 (~220 м/пиксель: облака мягкие, а сборка в 4 раза быстрее, чем на z10) и только над полосой южного берега —
// там, где лежат все маршруты. Остальной Крым — фон, облака на него не тратим.
const FOG_Z = 9, TILE = 256, WORLD = TILE * 2 ** FOG_Z;
const lonToX = lon => ((lon + 180) / 360) * WORLD;
const latToY = lat => {
    const s = Math.sin((lat * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD;
};
const FOG_BBOX = [33.36, 44.25, 34.72, 44.97];
const FX0 = Math.floor(lonToX(FOG_BBOX[0])), FX1 = Math.ceil(lonToX(FOG_BBOX[2]));
const FY0 = Math.floor(latToY(FOG_BBOX[3])), FY1 = Math.ceil(latToY(FOG_BBOX[1]));
const FW = FX1 - FX0, FH = FY1 - FY0;
const PX_PER_KM = 1000 / ((156543.03 * Math.cos((44.6 * Math.PI) / 180)) / 2 ** FOG_Z);

// Высоты нужны, чтобы облака лежали на горах, а побережье и море оставались открытыми.
async function loadElevation() {
    const tx0 = Math.floor(FX0 / TILE), tx1 = Math.floor((FX1 - 1) / TILE);
    const ty0 = Math.floor(FY0 / TILE), ty1 = Math.floor((FY1 - 1) / TILE);
    const cw = (tx1 - tx0 + 1) * TILE, ch = (ty1 - ty0 + 1) * TILE;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const jobs = [];
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) {
        jobs.push(new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { ctx.drawImage(img, (x - tx0) * TILE, (y - ty0) * TILE); resolve(); };
            img.onerror = reject;
            img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${FOG_Z}/${x}/${y}.png`;
        }));
    }
    await Promise.all(jobs);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    const out = new Float32Array(FW * FH);
    const ox = FX0 - tx0 * TILE, oy = FY0 - ty0 * TILE;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const i = ((y + oy) * cw + (x + ox)) * 4;
        out[y * FW + x] = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
    }
    return out;
}

const makeFieldCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = FW;
    canvas.height = FH;
    return canvas;
};
const supportsCanvasFilter = (() => {
    try { return typeof document.createElement('canvas').getContext('2d').filter === 'string'; } catch (e) { return false; }
})();

// Мягкое поле «близость к маршрутам»: размытая обводка. Где нет ctx.filter (старый iOS) — серия
// обводок разной ширины даёт похожий спад.
function strokeField(list, widthKm, blurKm, gain) {
    const canvas = makeFieldCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const draw = () => list.forEach(route => route.segments.forEach(segment => {
        ctx.beginPath();
        segment.forEach(([lat, lon], i) => {
            const x = lonToX(lon) - FX0, y = latToY(lat) - FY0;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
    }));
    const width = Math.max(1, widthKm * PX_PER_KM), blur = blurKm * PX_PER_KM;
    if (supportsCanvasFilter) {
        ctx.filter = `blur(${blur.toFixed(1)}px)`;
        ctx.lineWidth = width;
        draw();
    } else {
        const passes = 8;
        ctx.globalAlpha = 1 / passes * 1.3;
        for (let k = 0; k < passes; k++) { ctx.lineWidth = width + (4 * blur * k) / passes; draw(); }
    }
    const d = ctx.getImageData(0, 0, FW, FH).data;
    const out = new Float32Array(FW * FH);
    for (let i = 0; i < out.length; i++) out[i] = Math.min(1, (d[i * 4 + 3] / 255) * gain);
    return out;
}

function blurField(arr, radiusPx) {
    if (!supportsCanvasFilter) return arr;
    const src = makeFieldCanvas();
    const sctx = src.getContext('2d');
    const img = sctx.createImageData(FW, FH);
    for (let i = 0; i < arr.length; i++) img.data[i * 4 + 3] = Math.round(arr[i] * 255);
    sctx.putImageData(img, 0, 0);
    const dst = makeFieldCanvas();
    const dctx = dst.getContext('2d', { willReadFrequently: true });
    dctx.filter = `blur(${radiusPx}px)`;
    dctx.drawImage(src, 0, 0);
    const d = dctx.getImageData(0, 0, FW, FH).data;
    const out = new Float32Array(FW * FH);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] / 255;
    return out;
}

// Шум на хэшированной решётке: нет массивов — нет и выхода за их границы.
function hash(ix, iy, seed) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, seed, octaves) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * vnoise(x * freq, y * freq, seed + o * 17);
        norm += amp; amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Облака: сплошная шапка над горным поясом клуба. Там, где человек был, облака расходятся — и
// расходятся по форме самих облаков (тонкие места первыми), а не кругом. Над непройденными держатся.
// Возвращает три картинки: итоговые облака, «всё закрыто» (для анимации открытия) и тень на земле.
const cloudCache = new Map();
async function buildClouds(routes, visitedIds) {
    const key = routes.map(route => route.id + (visitedIds.has(route.id) ? '+' : '-')).join('|');
    if (cloudCache.has(key)) return cloudCache.get(key);

    let elev;
    try { elev = await loadElevation(); } catch (error) {
        console.warn('Мой Крым: нет рельефа, облака без учёта высот', error);
        elev = new Float32Array(FW * FH).fill(400);
    }
    const walked = routes.filter(route => visitedIds.has(route.id));
    const unwalked = routes.filter(route => !visitedIds.has(route.id));
    const land = blurField(elev.map(e => (e > 2 ? 1 : 0)), 1.5);
    const belt = strokeField(routes, 10, 5, 1.7);
    const reveal = strokeField(walked, 1.8, 1.9, 2.3);
    const core = strokeField(walked, 0.9, 0.35, 1.8);
    const keep = strokeField(unwalked, 1.4, 1.1, 2.0);

    const fog = makeFieldCanvas(), full = makeFieldCanvas(), shadowSrc = makeFieldCanvas();
    const fogImg = fog.getContext('2d').createImageData(FW, FH);
    const fullImg = full.getContext('2d').createImageData(FW, FH);
    const shImg = shadowSrc.getContext('2d').createImageData(FW, FH);
    const period = 5 * PX_PER_KM;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const i = y * FW + x, k = i * 4;
        // Сплошная полоса над горами клуба; у самой воды облака редеют, над морем их нет.
        const cover = Math.max(belt[i] * (0.35 + 0.65 * sstep(20, 380, elev[i])), keep[i] * 0.95) * land[i];
        const u = x / period, v = y / period;
        const qx = fbm(u * 0.7, v * 0.7, 11, 3), qy = fbm(u * 0.7 + 5.2, v * 0.7 + 1.3, 12, 3);
        const wu = u + 0.55 * qx, wv = v + 0.55 * qy;
        const n = sstep(0.28, 0.78, fbm(wu, wv, 3, 5));
        const nl = sstep(0.28, 0.78, fbm(wu + 0.05, wv - 0.05, 3, 5)); // сдвиг к свету — объём
        const base = cover * 1.12 + (n - 0.5) * 0.95;
        const edgeX = Math.min(x, FW - 1 - x) / (FW * 0.05), edgeY = Math.min(y, FH - 1 - y) / (FH * 0.05);
        const edge = Math.min(1, edgeX, edgeY);
        const aFull = sstep(0.30, 0.64, base + keep[i] * 0.45 * land[i]) * edge;
        const aOpen = sstep(0.30, 0.64, base - reveal[i] * 1.55 - core[i] * 2.2 + keep[i] * 0.45 * land[i]) * edge;
        const density = 0.8 + 0.14 * n; // облако не бывает совсем глухим — сквозь него чуть видно рельеф
        // Лёгкий голубовато-серый оттенок в тени, чтобы облака не читались как снег.
        const shade = Math.min(1, Math.max(0, 0.6 + (n - nl) * 2.6));
        const r = 170 + 80 * shade, g = 182 + 71 * shade, b = 200 + 55 * shade;
        fogImg.data[k] = fullImg.data[k] = r;
        fogImg.data[k + 1] = fullImg.data[k + 1] = g;
        fogImg.data[k + 2] = fullImg.data[k + 2] = b;
        fogImg.data[k + 3] = Math.round(aOpen * density * 255);
        fullImg.data[k + 3] = Math.round(aFull * density * 255);
        shImg.data[k] = 16; shImg.data[k + 1] = 24; shImg.data[k + 2] = 36;
        shImg.data[k + 3] = Math.round(aOpen * 0.55 * 255);
    }
    fog.getContext('2d').putImageData(fogImg, 0, 0);
    full.getContext('2d').putImageData(fullImg, 0, 0);
    shadowSrc.getContext('2d').putImageData(shImg, 0, 0);
    // Тень смещена на юго-восток и размыта: облако «висит» над землёй, а не лежит на ней как снег.
    const shadow = makeFieldCanvas();
    const shctx = shadow.getContext('2d');
    if (supportsCanvasFilter) shctx.filter = 'blur(3px)';
    shctx.drawImage(shadowSrc, 3, 4);

    const result = { fog, full, shadow };
    cloudCache.set(key, result);
    return result;
}

// Облака отдаём карте растровыми тайлами через свой протокол: image-источник MapLibre при включённом
// 3D-рельефе не рисуется, а тайловые слои ложатся на рельеф.
const cloudLayers = {};
let cloudProtocolRegistered = false;
function registerCloudProtocol() {
    if (cloudProtocolRegistered) return;
    cloudProtocolRegistered = true;
    maplibregl.addProtocol('pmapcloud', async params => {
        const match = /pmapcloud:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
        const tile = document.createElement('canvas');
        tile.width = tile.height = TILE;
        const source = match && cloudLayers[match[1]];
        if (source) {
            const z = Number(match[2]), x = Number(match[3]), y = Number(match[4]);
            const scale = 2 ** (FOG_Z - z);
            const tctx = tile.getContext('2d');
            tctx.imageSmoothingEnabled = true;
            tctx.imageSmoothingQuality = 'high';
            tctx.drawImage(source, x * TILE * scale - FX0, y * TILE * scale - FY0, TILE * scale, TILE * scale, 0, 0, TILE, TILE);
        }
        const blob = await new Promise(resolve => tile.toBlob(resolve, 'image/png'));
        return { data: await blob.arrayBuffer() };
    });
}

function isCloudyAt(lngLat) {
    const fog = cloudLayers.fog;
    if (!fog) return false;
    const x = Math.round(lonToX(lngLat.lng) - FX0), y = Math.round(latToY(lngLat.lat) - FY0);
    if (x < 0 || y < 0 || x >= FW || y >= FH) return false;
    return fog.getContext('2d').getImageData(x, y, 1, 1).data[3] > 90;
}

// ───────────────────────── ближайшие хайки по маршрутам ─────────────────────────

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function shortDate(date) {
    const [y, m, d] = String(date).split('-').map(Number);
    const day = new Date(y, m - 1, d);
    return `${WEEKDAYS[day.getDay()]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

// Для каждого маршрута — ближайший будущий хайк по нему (для категории «идём»).
function upcomingHikesByRoute(routes, hikes, today = new Date()) {
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);
    const byRoute = new Map();
    (hikes || [])
        .filter(hike => hike?.date && hike.title && hike.cancelled !== true && hike.city !== true && hike.city !== 'yes' && hike.book_club !== true)
        .filter(hike => !(new Date(hike.date) < startOfToday))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .forEach(hike => {
            const route = getRouteForHikeTitle(routes, hike.title);
            if (route && !byRoute.has(route.id)) byRoute.set(route.id, hike);
        });
    return byRoute;
}

function isBookedOn(date) {
    const index = (state.hikesWithTitle || []).findIndex(hike => hike.date === date);
    return index >= 0 && Boolean(state.hikeBookingStatus?.[index]);
}

// Открывает слайдер хайка с записью. calendar.js подключаем по требованию: он сам импортирует
// профили, и статический импорт отсюда замкнул бы круг.
async function openHikeSheet(date) {
    const index = (state.hikesWithTitle || []).findIndex(hike => hike.date === date);
    if (index < 0) return;
    const { showBottomSheet } = await import('./calendar.js');
    showBottomSheet(index);
}

function routesFeatureCollection(routes, visitedIds, plannedIds) {
    return {
        type: 'FeatureCollection',
        features: routes.map(route => ({
            type: 'Feature',
            properties: { id: route.id, title: route.title, walked: visitedIds.has(route.id), planned: plannedIds.has(route.id) },
            geometry: {
                type: 'MultiLineString',
                coordinates: route.segments.map(segment => segment.map(([lat, lon]) => [lon, lat]))
            }
        }))
    };
}

function labelPoint(route) {
    const segment = route.segments.reduce((a, b) => (b.length > a.length ? b : a));
    const point = segment[Math.floor(segment.length / 2)];
    return [point[1], point[0]];
}

function boundsOf(routes) {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    routes.forEach(route => route.segments.forEach(segment => segment.forEach(([lat, lon]) => {
        west = Math.min(west, lon); east = Math.max(east, lon);
        south = Math.min(south, lat); north = Math.max(north, lat);
    })));
    return [[west, south], [east, north]];
}

// ───────────────────────── картинка для сторис ─────────────────────────

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
    ctx.fillText('вершин вышло из облаков', W / 2, 1570);

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 58px ${font}`;
    ctx.fillText(name || 'участник клуба', W / 2, 1712);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `400 34px ${font}`;
    ctx.fillText(`открыто ${percent}% гор`, W / 2, 1766);

    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = `400 30px ${font}`;
    ctx.fillText('а где был ты? открой свою карту → t.me/yaltahiking_bot', W / 2, 1852);
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
        .pmap-card { padding: 18px 0 16px; margin-bottom: 14px; }
        .pmap-head { display: flex; align-items: flex-end; justify-content: space-between; margin: 0 18px; }
        .pmap-head .section-title { margin: 0 !important; line-height: 1; }
        .pmap-count { font-size: 30px; font-weight: 800; color: ${YELLOW}; line-height: .9; text-shadow: 0 0 18px rgba(217,253,25,.35); }
        .pmap-count small { font-size: 15px; color: rgba(255,255,255,.42); font-weight: 600; text-shadow: none; }
        .pmap-sub { margin: 7px 18px 11px; font-size: 12.5px; color: rgba(255,255,255,.58); }
        .pmap-bar { height: 4px; margin: 0 18px 12px; border-radius: 4px; background: rgba(255,255,255,.1); overflow: hidden; }
        .pmap-bar i { display: block; height: 100%; background: ${YELLOW}; box-shadow: 0 0 10px ${YELLOW}; border-radius: 4px; }
        .pmap-chips { display: flex; gap: 6px; margin: 0 12px 10px; flex-wrap: wrap; }
        .pmap-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 20px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: rgba(255,255,255,.85); font: 600 12px/1 inherit; font-family: inherit; }
        .pmap-chip.is-active { border-color: ${YELLOW}; background: rgba(217,253,25,.12); }
        .pmap-chip i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
        .pmap-chip .w { background: ${YELLOW}; box-shadow: 0 0 6px ${YELLOW}; }
        .pmap-chip .p { background: #fff; box-shadow: inset 0 0 0 2px ${YELLOW}; }
        .pmap-chip .c { background: rgba(215,225,238,.9); }
        .pmap-wrap { position: relative; aspect-ratio: 1 / 1.12; margin: 0 12px; border-radius: 18px; overflow: hidden; border: 1px solid rgba(255,255,255,.12); background: #0A0B09; }
        .pmap-wrap.pmap-complete { border-color: rgba(217,253,25,.55); box-shadow: 0 0 26px rgba(217,253,25,.22); }
        .pmap-wrap .pmap-map { position: absolute !important; inset: 0; width: 100%; height: 100%; }
        .pmap-map .maplibregl-ctrl-bottom-left, .pmap-map .maplibregl-ctrl-bottom-right { display: none; }
        .pmap-share { position: absolute; top: 10px; right: 10px; z-index: 3; padding: 7px 11px; border: 0; border-radius: 20px; font: 700 12px/1 inherit; font-family: inherit; color: #0A0B09; background: rgba(255,255,255,.92); box-shadow: 0 4px 14px rgba(0,0,0,.25); }
        .pmap-share[disabled] { opacity: .6; }
        .pmap-hint { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; padding: 26px 12px 9px; text-align: center; font-size: 12px; color: rgba(255,255,255,.88); background: linear-gradient(transparent, rgba(6,9,14,.82)); pointer-events: none; opacity: 0; transition: opacity .8s ease; }
        .pmap-hint.is-visible { opacity: 1; }
        .pmap-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.6); font-size: 13px; z-index: 1; pointer-events: none; }
        .pmap-label { font: 600 10.5px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: nowrap; padding: 5px 8px; border-radius: 10px; cursor: pointer; }
        .pmap-label.w { color: #0A0B09; background: rgba(217,253,25,.92); box-shadow: 0 2px 8px rgba(0,0,0,.25); }
        .pmap-label.c { color: #3a4654; background: rgba(255,255,255,.78); border: 1px solid rgba(255,255,255,.9); box-shadow: 0 2px 8px rgba(0,0,0,.18); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
        .pmap-label.p { color: #0A0B09; background: ${YELLOW}; font-weight: 800; padding: 6px 9px; box-shadow: 0 0 0 4px rgba(217,253,25,.28), 0 4px 14px rgba(0,0,0,.3); animation: pmapPulse 2.2s ease-in-out infinite; }
        @keyframes pmapPulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(217,253,25,.28), 0 4px 14px rgba(0,0,0,.3); } 50% { box-shadow: 0 0 0 8px rgba(217,253,25,.1), 0 4px 14px rgba(0,0,0,.3); } }
        .pmap-next { display: flex; align-items: center; gap: 12px; margin: 12px 12px 0; padding: 12px 12px 12px 14px; border-radius: 16px; background: rgba(217,253,25,.08); border: 1px solid rgba(217,253,25,.28); }
        .pmap-next-text { flex: 1; min-width: 0; }
        .pmap-next-kicker { font-size: 11px; color: rgba(217,253,25,.85); font-weight: 700; }
        .pmap-next-title { margin-top: 3px; font-size: 14.5px; font-weight: 700; color: #fff; }
        .pmap-next-meta { margin-top: 2px; font-size: 12px; color: rgba(255,255,255,.55); }
        .pmap-next .btn { width: auto !important; margin: 0 !important; padding: 10px 14px !important; border-radius: 30px !important; font-size: 13px !important; white-space: nowrap; }
        .pmap-popup .maplibregl-popup-content { padding: 10px 12px; border-radius: 12px; background: rgba(14,16,14,.92); color: #fff; font-size: 12.5px; line-height: 1.4; max-width: 230px; box-shadow: 0 6px 20px rgba(0,0,0,.35); }
        .pmap-popup .maplibregl-popup-tip { display: none; }
        .pmap-popup b { color: ${YELLOW}; }
        .pmap-modal .pmap-modal-content { max-width: 340px; padding: 16px; background: rgba(10,11,9,0.94); text-align: center; }
        .pmap-poster { display: block; width: 100%; height: auto; border-radius: 14px; margin-bottom: 10px; }
        .pmap-modal-hint { font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 12px; }
        .pmap-modal-share { width: 100%; }
    `;
    document.head.appendChild(style);
}

const SEEN_KEY = 'pmapCloudsSeen';
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch]);

let currentMap = null;

// Подписи не должны наезжать друг на друга: сначала «идём», потом «был», потом «в облаках».
function declutter(map) {
    const priority = el => (el.classList.contains('p') ? 3 : el.classList.contains('w') ? 2 : 1);
    const labels = [...map.getContainer().querySelectorAll('.pmap-label')].sort((a, b) => priority(b) - priority(a));
    labels.forEach(el => { el.style.visibility = 'visible'; });
    // В общем виде пройденные видны по свечению, их названия появляются при приближении.
    const zoomedIn = map.getZoom() >= 9.8;
    const placed = [];
    const box = map.getContainer().getBoundingClientRect();
    labels.forEach(el => {
        const r = el.getBoundingClientRect();
        const outside = r.left < box.left + 2 || r.right > box.right - 2 || r.top < box.top + 44 || r.bottom > box.bottom - 30;
        const hit = placed.some(p => !(r.right + 3 < p.left || r.left - 3 > p.right || r.bottom + 2 < p.top || r.top - 2 > p.bottom));
        if ((el.classList.contains('w') && !zoomedIn) || outside || hit) el.style.visibility = 'hidden'; else placed.push(r);
    });
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
    const upcoming = upcomingHikesByRoute(routes, state.hikesList || []);
    const planned = new Set(upcoming.keys());
    const walkedRoutes = routes.filter(route => visited.has(route.id));
    const cloudRoutes = routes.filter(route => !visited.has(route.id) && !planned.has(route.id));
    const plannedRoutes = routes.filter(route => planned.has(route.id));
    const total = routes.length, count = walkedRoutes.length;
    const percent = Math.round((count / total) * 100);
    const complete = count === total;

    // Главный призыв: ближайший хайк, лучше — туда, где человек ещё не был.
    const nextEntries = [...upcoming.entries()].sort((a, b) => String(a[1].date).localeCompare(String(b[1].date)));
    const nextEntry = nextEntries.find(([id]) => !visited.has(id)) || nextEntries[0];
    const nextRoute = nextEntry && routes.find(route => route.id === nextEntry[0]);
    const nextHike = nextEntry && nextEntry[1];

    container.innerHTML = `
        <div class="card-container pmap-card">
            <div class="pmap-head">
                <h2 class="section-title">🗺 мой Крым</h2>
                <div class="pmap-count">${count}<small> / ${total}</small></div>
            </div>
            <div class="pmap-sub">${complete ? 'весь южный берег открыт' : `маршрутов пройдено · открыто ${percent}% гор`}</div>
            <div class="pmap-bar"><i style="width:${percent}%"></i></div>
            <div class="pmap-chips">
                <button class="pmap-chip" data-cat="walked" type="button"><i class="w"></i>был · ${count}</button>
                ${plannedRoutes.length ? `<button class="pmap-chip" data-cat="planned" type="button"><i class="p"></i>идём · ${plannedRoutes.length}</button>` : ''}
                ${cloudRoutes.length ? `<button class="pmap-chip" data-cat="clouds" type="button"><i class="c"></i>в облаках · ${cloudRoutes.length}</button>` : ''}
            </div>
            <div class="pmap-wrap ${complete ? 'pmap-complete' : ''}">
                <div class="pmap-map" id="personalRoutesMap"></div>
                <div class="pmap-loading">облака собираются…</div>
                <button class="pmap-share" id="personalMapShare" type="button">↗ в сторис</button>
                <div class="pmap-hint">${complete ? 'весь южный берег открыт' : 'облака расходятся там, где ты уже был'}</div>
            </div>
            ${nextHike && nextRoute ? `
            <div class="pmap-next">
                <div class="pmap-next-text">
                    <div class="pmap-next-kicker">${visited.has(nextRoute.id) ? 'идём снова' : 'ещё в облаках'}</div>
                    <div class="pmap-next-title">${escapeHtml(nextRoute.title)}</div>
                    <div class="pmap-next-meta">${shortDate(nextHike.date)} · ${isBookedOn(nextHike.date) ? 'ты записан' : visited.has(nextRoute.id) ? 'ты тут уже был' : 'ты тут ещё не был'}</div>
                </div>
                <button class="btn btn-yellow" id="personalMapNext" type="button">${isBookedOn(nextHike.date) ? 'открыть' : 'иду'}</button>
            </div>` : ''}
        </div>`;

    log('мой Крым: показан', false, state.user, { visited: count, total, planned: plannedRoutes.length });

    container.querySelector('#personalMapNext')?.addEventListener('click', () => {
        haptic();
        log('мой Крым: иду', false, state.user, { hike_date: nextHike.date, route_id: nextRoute.id });
        openHikeSheet(nextHike.date);
    });

    const hint = container.querySelector('.pmap-hint');
    const loading = container.querySelector('.pmap-loading');
    try {
        await ensureMapLibre();
    } catch (error) {
        loading.textContent = 'карта временно недоступна';
        return;
    }
    const el = container.querySelector('#personalRoutesMap');
    if (!el) return;
    try { currentMap?.remove(); } catch (error) { /* карта уже удалена */ }

    registerCloudProtocol();
    const cloudsReady = complete ? Promise.resolve(null) : buildClouds(routes, visited);

    const map = new maplibregl.Map({
        container: el,
        style: {
            version: 8,
            sources: {
                satellite: {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256,
                    maxzoom: 18
                }
            },
            // Эта карта — единственная цветная в приложении: на чёрно-белом рельефе облака не читаются.
            layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite', paint: { 'raster-saturation': 0.12, 'raster-contrast': 0.06 } }]
        },
        ...OVERVIEW,
        maxPitch: 75,
        minZoom: 7.5,
        maxZoom: 14,
        maxBounds: [[32.2, 43.8], [36.4, 46.0]],
        attributionControl: false,
        keyboard: false,
        doubleClickZoom: false,
        preserveDrawingBuffer: true // нужен, чтобы снять картинку для сторис
    });
    currentMap = map;

    const markers = [];
    const addLabel = (route, className, text, onClick) => {
        const label = document.createElement('div');
        label.className = `pmap-label ${className}`;
        label.textContent = text;
        label.addEventListener('click', event => { event.stopPropagation(); haptic(); onClick(label); });
        markers.push(new maplibregl.Marker({ element: label, anchor: 'bottom', offset: [0, -8] }).setLngLat(labelPoint(route)).addTo(map));
    };
    let popup = null;
    const showPopup = (lngLat, html) => {
        popup?.remove();
        popup = new maplibregl.Popup({ className: 'pmap-popup', closeButton: false, offset: 12, maxWidth: '240px' }).setLngLat(lngLat).setHTML(html).addTo(map);
    };

    map.on('load', async () => {
        map.addSource('dem', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256,
            encoding: 'terrarium',
            maxzoom: 14
        });
        map.setTerrain({ source: 'dem', exaggeration: 1.7 });
        map.setSky({ 'sky-color': '#7fb0dd', 'horizon-color': '#e6eef4', 'fog-color': '#dfe7ee', 'sky-horizon-blend': 0.55, 'horizon-fog-blend': 0.65, 'fog-ground-blend': 0.2 });

        const clouds = await cloudsReady;
        const animate = Boolean(clouds) && (() => {
            const key = [...visited].sort().join(',');
            try {
                if (localStorage.getItem(SEEN_KEY) === key) return false;
                localStorage.setItem(SEEN_KEY, key);
            } catch (error) { /* без хранилища — просто без анимации повторно не узнаем */ }
            return true;
        })();
        if (clouds) {
            Object.assign(cloudLayers, clouds);
            const cloudSource = name => ({ type: 'raster', tiles: [`pmapcloud://${name}/{z}/{x}/{y}`], tileSize: 256, bounds: FOG_BBOX, minzoom: 5, maxzoom: 12 });
            map.addSource('cloud-shadow', cloudSource('shadow'));
            map.addSource('clouds', cloudSource('fog'));
            map.addLayer({ id: 'cloud-shadow', type: 'raster', source: 'cloud-shadow', paint: { 'raster-opacity': 0.7, 'raster-fade-duration': 0 } });
            map.addLayer({ id: 'clouds', type: 'raster', source: 'clouds', paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 } });
            if (animate) {
                // Открытие: сначала закрыто всё, потом облака расходятся над пройденными маршрутами.
                map.addSource('clouds-full', cloudSource('full'));
                map.addLayer({ id: 'clouds-full', type: 'raster', source: 'clouds-full', paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-opacity-transition': { duration: 2200, delay: 0 } } });
            }
        }
        loading.remove();

        map.addSource('personal-routes', { type: 'geojson', data: routesFeatureCollection(routes, visited, planned) });
        map.addLayer({
            id: 'pr-walked-glow', type: 'line', source: 'personal-routes', filter: ['==', ['get', 'walked'], true],
            paint: { 'line-color': YELLOW, 'line-width': 10, 'line-opacity': 0.55, 'line-blur': 5 }
        });
        map.addLayer({
            id: 'pr-walked', type: 'line', source: 'personal-routes', filter: ['==', ['get', 'walked'], true],
            layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': YELLOW, 'line-width': 3 }
        });
        // «Идём»: маршрут поверх облаков — белая подложка и жёлтый пунктир, путь, который предстоит пройти.
        // Пунктир статичный: анимация через setPaintProperty не даёт карте успокоиться (ломает idle).
        map.addLayer({
            id: 'pr-planned-base', type: 'line', source: 'personal-routes', filter: ['all', ['==', ['get', 'planned'], true], ['==', ['get', 'walked'], false]],
            layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.95 }
        });
        map.addLayer({
            id: 'pr-planned-dash', type: 'line', source: 'personal-routes', filter: ['==', ['get', 'planned'], true],
            layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#b6d600', 'line-width': 3, 'line-dasharray': [1.4, 1.2] }
        });
        // Подписи трёх категорий.
        routes.forEach(route => {
            const hike = upcoming.get(route.id);
            if (hike) {
                addLabel(route, 'p', `${shortDate(hike.date)} · ${route.title}`, () => {
                    log('мой Крым: подпись хайка', false, state.user, { hike_date: hike.date, route_id: route.id });
                    openHikeSheet(hike.date);
                });
            } else if (visited.has(route.id)) {
                addLabel(route, 'w', `✓ ${route.title}`, () => showPopup(labelPoint(route), `<b>✓ ${escapeHtml(route.title)}</b><br>ты был здесь`));
            } else {
                addLabel(route, 'c', `☁ ${route.title}`, () => {
                    const text = String(route.description || '').slice(0, 140);
                    showPopup(labelPoint(route), `<b>☁ ${escapeHtml(route.title)}</b><br>${escapeHtml(text)}${text.length === 140 ? '…' : ''}<br><span style="opacity:.6">пока не в расписании — следи за анонсами</span>`);
                });
            }
        });

        // Нажатие на облако объясняет механику.
        map.on('click', event => {
            if (event.defaultPrevented) return;
            if (!isCloudyAt(event.lngLat)) { popup?.remove(); return; }
            showPopup(event.lngLat, `☁ здесь ты ещё не был<br><span style="opacity:.7">${cloudRoutes.length + plannedRoutes.filter(route => !visited.has(route.id)).length} маршрутов в облаках</span>`);
        });

        // Нажатие на жёлтую линию — название пройденного маршрута.
        map.on('click', 'pr-walked-glow', event => {
            const title = event.features?.[0]?.properties?.title;
            if (title) { event.preventDefault(); showPopup(event.lngLat, `<b>✓ ${escapeHtml(title)}</b><br>ты был здесь`); }
        });
        map.on('idle', () => declutter(map));
        map.once('idle', () => {
            if (animate && map.getLayer('clouds-full')) {
                window.setTimeout(() => {
                    map.setPaintProperty('clouds-full', 'raster-opacity', 0);
                    window.setTimeout(() => hint.classList.add('is-visible'), 900);
                    window.setTimeout(() => hint.classList.remove('is-visible'), 6500);
                }, 500);
            } else {
                hint.classList.add('is-visible');
                window.setTimeout(() => hint.classList.remove('is-visible'), 4500);
            }
        });
    });

    // Счётчики-легенда: подсвечивают свою категорию — камера облетает её маршруты.
    const categories = { walked: walkedRoutes, planned: plannedRoutes, clouds: cloudRoutes };
    container.querySelectorAll('.pmap-chip').forEach(chip => chip.addEventListener('click', () => {
        haptic();
        const wasActive = chip.classList.contains('is-active');
        container.querySelectorAll('.pmap-chip').forEach(c => c.classList.remove('is-active'));
        log('мой Крым: легенда', false, state.user, { category: chip.dataset.cat });
        if (wasActive) { map.flyTo({ ...OVERVIEW, duration: 1400, essential: true }); return; }
        chip.classList.add('is-active');
        const list = categories[chip.dataset.cat] || [];
        if (!list.length) return;
        const camera = map.cameraForBounds(boundsOf(list), { padding: 50, bearing: OVERVIEW.bearing, maxZoom: 11.5 });
        if (camera) map.flyTo({ center: camera.center, zoom: Math.max(8.4, (camera.zoom || 9) - 0.5), bearing: OVERVIEW.bearing, pitch: 58, duration: 1600, essential: true });
    }));

    const shareButton = container.querySelector('#personalMapShare');
    shareButton?.addEventListener('click', async () => {
        haptic();
        if (shareButton.disabled) return;
        shareButton.disabled = true;
        const originalText = shareButton.textContent;
        shareButton.textContent = 'готовлю…';
        log('мой Крым: поделиться', false, state.user, { visited: count, total });
        try {
            const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
            map.jumpTo(OVERVIEW);
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

