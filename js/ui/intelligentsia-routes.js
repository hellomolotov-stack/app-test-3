import { haptic, openLink } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { INTELLIGENTSIA_ROUTES as ROUTE_DATA } from './intelligentsia-routes-data.js';

const CHERNAYA_RECHKA_COORDS = [[44.493100,33.793747],[44.492947,33.793114],[44.493314,33.792416],[44.493612,33.791515],[44.494240,33.790748],[44.494646,33.790179],[44.494879,33.790314],[44.495246,33.790249],[44.495467,33.789863],[44.495872,33.787240],[44.496335,33.786505],[44.496875,33.785909],[44.497047,33.784879],[44.496974,33.783436],[44.497097,33.782476],[44.497384,33.782320],[44.498751,33.782247],[44.499469,33.781852],[44.499645,33.781492],[44.499939,33.781256],[44.500261,33.780581],[44.501034,33.780328],[44.502006,33.780361],[44.502718,33.780310],[44.503282,33.780061],[44.503485,33.780050],[44.503944,33.779782],[44.504460,33.779723],[44.504904,33.779862],[44.505325,33.779905],[44.505176,33.779674],[44.504774,33.779278],[44.504246,33.779084],[44.504101,33.779208],[44.503875,33.779245],[44.503328,33.779412],[44.502880,33.779599],[44.502421,33.779680],[44.501855,33.779522],[44.501137,33.779351],[44.500678,33.779260],[44.500341,33.779400],[44.500019,33.779737],[44.499840,33.779802],[44.499748,33.780177],[44.499465,33.780725],[44.499105,33.781288],[44.498607,33.781768],[44.497857,33.781790],[44.497271,33.781795],[44.496927,33.781945],[44.496778,33.782294],[44.496736,33.783072],[44.496690,33.783839],[44.496736,33.784231],[44.496648,33.784542],[44.496544,33.785186],[44.496139,33.785615],[44.495446,33.786049],[44.495067,33.785990],[44.494712,33.786344],[44.494343,33.786779],[44.494170,33.787836],[44.493964,33.788179],[44.493773,33.788785],[44.493489,33.789316],[44.493145,33.789960],[44.492736,33.790690],[44.492292,33.791146],[44.491752,33.791559],[44.491626,33.791639],[44.492154,33.792337],[44.492311,33.792562],[44.492494,33.792868],[44.493099,33.793744]];
const INTELLIGENTSIA_ROUTES = ROUTE_DATA.map(route => route.id === 'chernaya-rechka'
    ? {
        ...route,
        segments: [CHERNAYA_RECHKA_COORDS],
        bounds: [[33.779084, 44.491626], [33.793747, 44.505325]],
        pointCount: CHERNAYA_RECHKA_COORDS.length
    }
    : route);

let maplibreLoading = null;
let currentMap = null;
let currentRouteIndex = 0;
let flightTimer = null;
let resizeTimer = null;
let mapResizeObserver = null;
let stylesInjected = false;

const ROUTE_REPORTS = {
    'biyuk-isar': [
        { date: '27.07.2025', url: 'https://t.me/yaltahiking/119' }
    ],
    'alupka-isar': [
        { date: '09.11.2025', url: 'https://t.me/yaltahiking/192' },
        { date: '25.05.2025', url: 'https://t.me/yaltahiking/45' }
    ],
    evrejskaya: [
        { date: '26.04.2026', url: 'https://t.me/yaltahiking/353' }
    ],
    'uch-kosh': [
        { date: '19.10.2025', url: 'https://t.me/yaltahiking/157' }
    ],
    massandra: [
        { date: '14.12.2025', url: 'https://t.me/yaltahiking/250' }
    ],
    biruzovoe: [
        { date: '25.06.2026', url: 'https://t.me/yaltahiking/399' }
    ],
    pallasa: [
        { date: '16.11.2025', url: 'https://t.me/yaltahiking/195' },
        { date: '22.06.2025', url: 'https://t.me/yaltahiking/75' }
    ]
};
const REPORT_KEYWORDS = {
    'biyuk-isar': ['биюк'],
    'alupka-isar': ['алупка', 'крестов'],
    evrejskaya: ['еврейск', 'жидовск'],
    'uch-kosh': ['уч-кош', 'уч кош'],
    massandra: ['массандр'],
    biruzovoe: ['бирюзов'],
    pallasa: ['паллас'],
    tsarskaya: ['царск'],
    'chernaya-rechka': ['черная реч', 'чёрная реч']
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
        .intelligentsia-routes-header .section-title { margin: 0 !important; line-height: 1.1; }
        .intelligentsia-routes-nav { display: inline-flex; gap: 8px; flex-shrink: 0; }
        .intelligentsia-route-map-wrap { position: relative; aspect-ratio: 1 / 1; margin: 0 16px; border-radius: 14px; overflow: hidden; background: #0A0B09; border: 1px solid rgba(255,255,255,0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 24px rgba(0,0,0,0.22); }
        .intelligentsia-route-map { width: 100%; height: 100%; background: #0A0B09; }
        .intelligentsia-route-map .maplibregl-ctrl-bottom-left, .intelligentsia-route-map .maplibregl-ctrl-bottom-right { display: none; }
        .intelligentsia-route-caption { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 2; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 12px; border-radius: 12px; background: rgba(10, 11, 9, 0.68); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(14px) saturate(120%); -webkit-backdrop-filter: blur(14px) saturate(120%); }
        .intelligentsia-route-meta { min-width: 0; }
        .intelligentsia-route-reports { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 5px; color: rgba(255,255,255,0.54); font-size: 12px; line-height: 1.25; }
        .intelligentsia-route-report { display: inline-block; color: rgba(255,255,255,0.78); text-decoration: underline; text-underline-offset: 2px; }
        .intelligentsia-route-report:active { opacity: 0.72; }
        .intelligentsia-route-no-reports { color: rgba(255,255,255,0.48); }
        .intelligentsia-route-title { color: #ffffff; font-size: 18px; line-height: 1.12; font-weight: 800; }
        .intelligentsia-route-counter { flex-shrink: 0; color: #0A0B09; background: #D9FD19; border-radius: 999px; padding: 5px 9px; font-size: 12px; line-height: 1; font-weight: 800; white-space: nowrap; }
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

function reportDateKey(value) {
    const date = String(value || '').trim();
    const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
    const displayMatch = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return displayMatch ? `${displayMatch[3]}${displayMatch[2]}${displayMatch[1]}` : '';
}

function formatReportDate(value) {
    const date = String(value || '').trim();
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : date;
}

function routeReports(route) {
    const keywords = REPORT_KEYWORDS[route.id] || [route.title];
    const normalizedKeywords = keywords.map(normalizeText).filter(Boolean);
    const dynamicReports = [...(state.hikesWithTitle || [])]
        .filter(item => /^(https?:\/\/|tg:\/\/|t\.me\/)/i.test(String(item.report_link || '').trim()))
        .filter(item => {
            const title = normalizeText(item.title);
            return normalizedKeywords.some(keyword => title.includes(keyword));
        })
        .map(item => ({ date: formatReportDate(item.date), url: normalizeReportUrl(item.report_link) }));
    const seen = new Set();
    return [...(ROUTE_REPORTS[route.id] || []), ...dynamicReports]
        .filter(report => {
            if (!report.url || seen.has(report.url)) return false;
            seen.add(report.url);
            return true;
        })
        .sort((a, b) => reportDateKey(b.date).localeCompare(reportDateKey(a.date)));
}

function updateRouteMeta(route, index) {
    const reportsContainer = document.getElementById('intelligentsiaRouteReports');
    const title = document.getElementById('intelligentsiaRouteTitle');
    const counter = document.getElementById('intelligentsiaRouteCounter');
    const reports = routeReports(route);
    if (title) title.textContent = route.title;
    if (reportsContainer) {
        reportsContainer.replaceChildren();
        if (reports.length) {
            const label = document.createElement('span');
            label.textContent = reports.length > 1 ? 'отчёты:' : 'отчёт:';
            reportsContainer.appendChild(label);
            reports.forEach(report => {
                const link = document.createElement('a');
                link.className = 'intelligentsia-route-report';
                link.href = report.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = report.date || 'открыть ↗';
                link.dataset.reportUrl = report.url;
                link.dataset.reportDate = report.date || '';
                link.setAttribute('aria-label', `${route.title}: отчёт за ${report.date || 'хайк'}`);
                reportsContainer.appendChild(link);
            });
        } else {
            const empty = document.createElement('span');
            empty.className = 'intelligentsia-route-no-reports';
            empty.textContent = 'заметки пока не опубликованы';
            reportsContainer.appendChild(empty);
        }
    }
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

function trackRouteSwitch(direction, fromIndex, toIndex) {
    const fromRoute = INTELLIGENTSIA_ROUTES[fromIndex];
    const toRoute = INTELLIGENTSIA_ROUTES[toIndex];
    const trackingTag = direction === 'previous'
        ? 'hike_map_route_previous'
        : 'hike_map_route_next';
    log(trackingTag, state.userCard.status !== 'active', state.user, {
        tracking_tag: trackingTag,
        block: 'hike_map',
        direction,
        from_route: fromRoute?.id || '',
        to_route: toRoute?.id || '',
        route_position: `${toIndex + 1}/${INTELLIGENTSIA_ROUTES.length}`
    });
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
                        <div id="intelligentsiaRouteReports" class="intelligentsia-route-reports"></div>
                    </div>
                    <div id="intelligentsiaRouteCounter" class="intelligentsia-route-counter"></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('prevIntelligentsiaRoute')?.addEventListener('click', () => {
        haptic();
        const fromIndex = currentRouteIndex;
        const toIndex = (fromIndex - 1 + INTELLIGENTSIA_ROUTES.length) % INTELLIGENTSIA_ROUTES.length;
        flyToRoute(toIndex);
        trackRouteSwitch('previous', fromIndex, toIndex);
    });
    document.getElementById('nextIntelligentsiaRoute')?.addEventListener('click', () => {
        haptic();
        const fromIndex = currentRouteIndex;
        const toIndex = (fromIndex + 1) % INTELLIGENTSIA_ROUTES.length;
        flyToRoute(toIndex);
        trackRouteSwitch('next', fromIndex, toIndex);
    });
    document.getElementById('intelligentsiaRouteReports')?.addEventListener('click', event => {
        const reportLink = event.target.closest('.intelligentsia-route-report');
        if (!reportLink) return;
        event.preventDefault();
        const route = INTELLIGENTSIA_ROUTES[currentRouteIndex];
        const reportUrl = reportLink.dataset.reportUrl;
        const reportDate = reportLink.dataset.reportDate;
        if (!reportUrl) return;
        openLink(reportUrl, `отчёт: ${route.title}`, state.userCard.status !== 'active');
        log('карта хайков отчёт', state.userCard.status !== 'active', state.user, {
            route: route.id,
            report_date: reportDate,
            report_url: reportUrl
        });
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
