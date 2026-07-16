import { haptic, openLink } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { INTELLIGENTSIA_ROUTES } from './intelligentsia-routes-data.js';

let maplibreLoading = null;
let currentMap = null;
let currentRouteIndex = 0;
let flightTimer = null;
let resizeTimer = null;
let mapResizeObserver = null;
let stylesInjected = false;

const ROUTE_REPORTS = {
    'biyuk-isar': 'https://t.me/yaltahiking/119',
    'alupka-isar': 'https://t.me/yaltahiking/192',
    evrejskaya: 'https://t.me/yaltahiking/353',
    'uch-kosh': 'https://t.me/yaltahiking/157',
    massandra: 'https://t.me/yaltahiking/250',
    biruzovoe: 'https://t.me/yaltahiking/399',
    pallasa: 'https://t.me/yaltahiking/195',
    'chernaya-rechka': 'https://t.me/yaltahiking/135'
};
const REPORT_KEYWORDS = {
    'biyuk-isar': ['биюк'],
    'alupka-isar': ['алупка'],
    evrejskaya: ['еврейск', 'жидовск'],
    'uch-kosh': ['уч-кош', 'уч кош'],
    massandra: ['массандр'],
    biruzovoe: ['бирюзов'],
    pallasa: ['паллас'],
    tsarskaya: ['царск'],
    'chernaya-rechka': ['чернореч', 'черная реч', 'чёрная реч', 'каньон']
};

function ensureMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (maplibreLoading) return maplibreLoading;
    maplibreLoading = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
        document.head.appendChild(css);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    return maplibreLoading;
}

function injectStyles() {
    if (stylesInjected || document.getElementById('intelligentsiaRoutesStyles')) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'intelligentsiaRoutesStyles';
    style.textContent = `
        .intelligentsia-routes-card { padding-bottom: 16px; }
        .intelligentsia-routes-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 16px 14px 16px; }
        .intelligentsia-routes-header .section-title { margin: 0; line-height: 1.1; }
        .intelligentsia-routes-nav { display: inline-flex; gap: 8px; flex-shrink: 0; }
        .intelligentsia-route-map-wrap { position: relative; aspect-ratio: 1 / 1; margin: 0 16px; border-radius: 14px; overflow: hidden; background: #0A0B09; border: 1px solid rgba(255,255,255,0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 24px rgba(0,0,0,0.22); }
        .intelligentsia-route-map { width: 100%; height: 100%; background: #0A0B09; }
        .intelligentsia-route-map .maplibregl-ctrl-bottom-left, .intelligentsia-route-map .maplibregl-ctrl-bottom-right { display: none; }
        .intelligentsia-route-caption { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 2; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 12px; border-radius: 12px; background: rgba(10, 11, 9, 0.68); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(14px) saturate(120%); -webkit-backdrop-filter: blur(14px) saturate(120%); }
        .intelligentsia-route-meta { min-width: 0; }
        .intelligentsia-route-report { display: inline-block; color: rgba(255,255,255,0.68); text-decoration: underline; text-underline-offset: 2px; }
        .intelligentsia-route-report:active { opacity: 0.72; }
        .intelligentsia-route-report[aria-disabled="true"] { color: rgba(255,255,255,0.48); text-decoration: none; pointer-events: none; }
        .intelligentsia-route-title { color: #ffffff; font-size: 18px; line-height: 1.12; font-weight: 800; }
        .intelligentsia-route-subtitle { font-size: 12px; line-height: 1.25; margin-top: 4px; }
        .intelligentsia-route-counter { color: #0A0B09; background: #D9FD19; border-radius: 999px; padding: 5px 9px; font-size: 12px; line-height: 1; font-weight: 800; white-space: nowrap; }
        .intelligentsia-map-fallback { height: 100%; min-height: 300px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.68); font-size: 14px; }
    `;
    document.head.appendChild(style);
}

function routeToFeature(route, active) {
    return {
        type: 'Feature',
        properties: { id: route.id, active },
        geometry: {
            type: 'MultiLineString',
            coordinates: route.segments.map(segment => segment.map(([lat, lon]) => [lon, lat]))
        }
    };
}

function routesFeatureCollection(activeIndex) {
    return {
        type: 'FeatureCollection',
        features: INTELLIGENTSIA_ROUTES.map((route, index) => routeToFeature(route, index === activeIndex))
    };
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^a-zа-я0-9]+/g, ' ')
        .trim();
}

function normalizeReportUrl(value) {
    const url = String(value || '').trim();
    return /^t\.me\//i.test(url) ? `https://${url}` : url;
}

function routeReport(route) {
    if (ROUTE_REPORTS[route.id]) {
        return { url: ROUTE_REPORTS[route.id], specific: true };
    }
    const keywords = REPORT_KEYWORDS[route.id] || [route.title];
    const normalizedKeywords = keywords.map(normalizeText).filter(Boolean);
    const hike = [...(state.hikesWithTitle || [])]
        .filter(item => /^(https?:\/\/|tg:\/\/|t\.me\/)/i.test(String(item.report_link || '').trim()))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .find(item => {
            const title = normalizeText(item.title);
            return normalizedKeywords.some(keyword => title.includes(keyword));
        });
    return hike ? { url: normalizeReportUrl(hike.report_link), specific: true } : null;
}

function updateRouteMeta(route, index) {
    const reportLink = document.getElementById('intelligentsiaRouteReport');
    const title = document.getElementById('intelligentsiaRouteTitle');
    const counter = document.getElementById('intelligentsiaRouteCounter');
    const report = routeReport(route);
    if (reportLink) {
        if (report) {
            reportLink.href = report.url;
            reportLink.removeAttribute('aria-disabled');
            reportLink.setAttribute('aria-label', `${route.title}: открыть отчёт`);
        } else {
            reportLink.removeAttribute('href');
            reportLink.setAttribute('aria-disabled', 'true');
            reportLink.removeAttribute('aria-label');
        }
    }
    if (title) title.textContent = route.title;
    if (reportLink) reportLink.textContent = report ? 'отчёт / заметки ↗' : 'заметки пока не опубликованы';
    if (counter) counter.textContent = `${index + 1} / ${INTELLIGENTSIA_ROUTES.length}`;
}

function cameraForRoute(map, route) {
    const mapHeight = map.getContainer?.().clientHeight || 360;
    const horizontalPadding = Math.max(28, Math.round(mapHeight * 0.09));
    const topPadding = Math.max(26, Math.round(mapHeight * 0.08));
    const bottomPadding = Math.max(124, Math.round(mapHeight * 0.38));
    const camera = map.cameraForBounds(route.bounds, {
        padding: {
            top: topPadding,
            right: horizontalPadding,
            bottom: bottomPadding,
            left: horizontalPadding
        },
        maxZoom: 14.2
    }) || {};
    return {
        center: camera.center || [
            (route.bounds[0][0] + route.bounds[1][0]) / 2,
            (route.bounds[0][1] + route.bounds[1][1]) / 2
        ],
        zoom: Math.min(camera.zoom || 12, 14.2),
        pitch: 52,
        bearing: 0
    };
}

function flyToRoute(index, instant = false) {
    if (!currentMap || !currentMap.isStyleLoaded()) return;
    const safeIndex = (index + INTELLIGENTSIA_ROUTES.length) % INTELLIGENTSIA_ROUTES.length;
    currentRouteIndex = safeIndex;
    const route = INTELLIGENTSIA_ROUTES[safeIndex];
    updateRouteMeta(route, safeIndex);

    const source = currentMap.getSource('intelligentsia-routes');
    if (source) source.setData(routesFeatureCollection(safeIndex));

    const target = cameraForRoute(currentMap, route);
    window.clearTimeout(flightTimer);
    if (instant) {
        currentMap.jumpTo(target);
        return;
    }

    const liftZoom = Math.max((currentMap.getZoom ? currentMap.getZoom() : target.zoom) - 1.05, 8.2);
    currentMap.easeTo({
        zoom: liftZoom,
        pitch: 28,
        bearing: 0,
        duration: 520,
        easing: t => t * (2 - t),
        essential: true
    });

    flightTimer = window.setTimeout(() => {
        currentMap.flyTo({
            ...target,
            duration: 1550,
            speed: 0.72,
            curve: 1.25,
            easing: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
            essential: true
        });
    }, 540);
}

export function renderIntelligentsiaRoutes(container) {
    if (!container || !INTELLIGENTSIA_ROUTES.length) return;
    injectStyles();
    currentRouteIndex = 0;
    container.innerHTML = `
        <div class="card-container intelligentsia-routes-card">
            <div class="intelligentsia-routes-header">
                <h2 class="section-title">🖇️ карта хайков</h2>
                <div class="intelligentsia-routes-nav">
                    <button class="calendar-nav-arrow" id="prevIntelligentsiaRoute" aria-label="предыдущий маршрут">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <button class="calendar-nav-arrow" id="nextIntelligentsiaRoute" aria-label="следующий маршрут">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                </div>
            </div>
            <div class="intelligentsia-route-map-wrap">
                <div id="intelligentsiaRoutesMap" class="intelligentsia-route-map"></div>
                <div class="intelligentsia-route-caption">
                    <div class="intelligentsia-route-meta">
                        <div id="intelligentsiaRouteTitle" class="intelligentsia-route-title"></div>
                        <a id="intelligentsiaRouteReport" class="intelligentsia-route-report intelligentsia-route-subtitle" target="_blank" rel="noopener noreferrer"></a>
                    </div>
                    <div id="intelligentsiaRouteCounter" class="intelligentsia-route-counter"></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('prevIntelligentsiaRoute')?.addEventListener('click', () => {
        haptic();
        flyToRoute(currentRouteIndex - 1);
        log('маршруты интеллигенции назад', state.userCard.status !== 'active', state.user);
    });
    document.getElementById('nextIntelligentsiaRoute')?.addEventListener('click', () => {
        haptic();
        flyToRoute(currentRouteIndex + 1);
        log('маршруты интеллигенции вперёд', state.userCard.status !== 'active', state.user);
    });
    document.getElementById('intelligentsiaRouteReport')?.addEventListener('click', event => {
        event.preventDefault();
        const route = INTELLIGENTSIA_ROUTES[currentRouteIndex];
        const report = routeReport(route);
        if (!report) return;
        openLink(report.url, `отчёт: ${route.title}`, state.userCard.status !== 'active');
        log('карта хайков отчёт', state.userCard.status !== 'active', state.user, { route: route.id, specific: true });
    });
    updateRouteMeta(INTELLIGENTSIA_ROUTES[0], 0);

    ensureMapLibre().then(() => {
        const el = document.getElementById('intelligentsiaRoutesMap');
        if (!el) return;
        mapResizeObserver?.disconnect();
        try { if (currentMap) currentMap.remove(); } catch (e) {}
        const first = INTELLIGENTSIA_ROUTES[0];
        const startCenter = [
            (first.bounds[0][0] + first.bounds[1][0]) / 2,
            (first.bounds[0][1] + first.bounds[1][1]) / 2
        ];

        currentMap = new maplibregl.Map({
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
                layers: [{
                    id: 'satellite-layer',
                    type: 'raster',
                    source: 'satellite',
                    paint: {
                        'raster-brightness-max': 0.58,
                        'raster-brightness-min': 0.02,
                        'raster-contrast': 0.12,
                        'raster-saturation': -1
                    }
                }]
            },
            center: startCenter,
            zoom: 10.8,
            pitch: 24,
            bearing: 0,
            maxPitch: 85,
            attributionControl: false,
            keyboard: false,
            doubleClickZoom: false
        });

        currentMap.on('load', () => {
            currentMap.addSource('dem', {
                type: 'raster-dem',
                tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                tileSize: 256,
                encoding: 'terrarium',
                maxzoom: 15
            });
            currentMap.setTerrain({ source: 'dem', exaggeration: 1.65 });
            currentMap.setSky({ 'sky-color': '#0A0B09', 'horizon-color': '#151515', 'fog-color': '#0A0B09' });
            currentMap.addSource('intelligentsia-routes', { type: 'geojson', data: routesFeatureCollection(0) });
            currentMap.addLayer({
                id: 'intelligentsia-routes-muted',
                type: 'line',
                source: 'intelligentsia-routes',
                filter: ['==', ['get', 'active'], false],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#FFFFFF', 'line-width': 1.5, 'line-opacity': 0.22 }
            });
            currentMap.addLayer({
                id: 'intelligentsia-route-glow',
                type: 'line',
                source: 'intelligentsia-routes',
                filter: ['==', ['get', 'active'], true],
                paint: { 'line-color': '#D9FD19', 'line-width': 8, 'line-opacity': 0.32, 'line-blur': 5 }
            });
            currentMap.addLayer({
                id: 'intelligentsia-route-line',
                type: 'line',
                source: 'intelligentsia-routes',
                filter: ['==', ['get', 'active'], true],
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#D9FD19', 'line-width': 3.2, 'line-opacity': 1 }
            });
            currentMap.once('idle', () => flyToRoute(0, true));
        });

        if (window.ResizeObserver) {
            mapResizeObserver = new ResizeObserver(() => {
                window.clearTimeout(resizeTimer);
                resizeTimer = window.setTimeout(() => {
                    if (!currentMap) return;
                    currentMap.resize();
                    flyToRoute(currentRouteIndex, true);
                }, 80);
            });
            mapResizeObserver.observe(el);
        }
    }).catch(() => {
        const el = document.getElementById('intelligentsiaRoutesMap');
        if (el) el.innerHTML = '<div class="intelligentsia-map-fallback">карта временно недоступна</div>';
    });
}
