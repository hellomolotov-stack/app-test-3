import { haptic } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { setRouteFavorite } from '../firebase.js';
import { isRouteFavoritesPilotUser } from '../lumen/config.js';
import { INTELLIGENTSIA_ROUTES as ROUTE_DATA } from './intelligentsia-routes-data.js';
import { EXTRA_INTELLIGENTSIA_ROUTES } from './intelligentsia-routes-extra-data.js';
import { ROUTE_DESCRIPTIONS } from './intelligentsia-routes-catalog.js';

const CHERNAYA_RECHKA_COORDS = [[44.493100,33.793747],[44.492947,33.793114],[44.493314,33.792416],[44.493612,33.791515],[44.494240,33.790748],[44.494646,33.790179],[44.494879,33.790314],[44.495246,33.790249],[44.495467,33.789863],[44.495872,33.787240],[44.496335,33.786505],[44.496875,33.785909],[44.497047,33.784879],[44.496974,33.783436],[44.497097,33.782476],[44.497384,33.782320],[44.498751,33.782247],[44.499469,33.781852],[44.499645,33.781492],[44.499939,33.781256],[44.500261,33.780581],[44.501034,33.780328],[44.502006,33.780361],[44.502718,33.780310],[44.503282,33.780061],[44.503485,33.780050],[44.503944,33.779782],[44.504460,33.779723],[44.504904,33.779862],[44.505325,33.779905],[44.505176,33.779674],[44.504774,33.779278],[44.504246,33.779084],[44.504101,33.779208],[44.503875,33.779245],[44.503328,33.779412],[44.502880,33.779599],[44.502421,33.779680],[44.501855,33.779522],[44.501137,33.779351],[44.500678,33.779260],[44.500341,33.779400],[44.500019,33.779737],[44.499840,33.779802],[44.499748,33.780177],[44.499465,33.780725],[44.499105,33.781288],[44.498607,33.781768],[44.497857,33.781790],[44.497271,33.781795],[44.496927,33.781945],[44.496778,33.782294],[44.496736,33.783072],[44.496690,33.783839],[44.496736,33.784231],[44.496648,33.784542],[44.496544,33.785186],[44.496139,33.785615],[44.495446,33.786049],[44.495067,33.785990],[44.494712,33.786344],[44.494343,33.786779],[44.494170,33.787836],[44.493964,33.788179],[44.493773,33.788785],[44.493489,33.789316],[44.493145,33.789960],[44.492736,33.790690],[44.492292,33.791146],[44.491752,33.791559],[44.491626,33.791639],[44.492154,33.792337],[44.492311,33.792562],[44.492494,33.792868],[44.493099,33.793744]];
const ROUTE_ORDER = [
    'kush-kaya', 'ilyas-kaya', 'chernaya-rechka', 'foros-kant',
    'biyuk-isar', 'evrejskaya', 'alupka-isar', 'biruzovoe',
    'tsarskaya', 'uch-kosh', 'massandra', 'pallasa', 'ayu-dag', 'paragilmen'
];
const ROUTES_BY_ID = new Map([...ROUTE_DATA, ...EXTRA_INTELLIGENTSIA_ROUTES].map(route => [route.id, route]));
let INTELLIGENTSIA_ROUTES = ROUTE_ORDER.map(id => ROUTES_BY_ID.get(id)).filter(Boolean).map(route => {
    const routeWithExactTrack = route.id === 'chernaya-rechka'
        ? {
        ...route,
        segments: [CHERNAYA_RECHKA_COORDS],
        bounds: [[33.779084, 44.491626], [33.793747, 44.505325]],
        pointCount: CHERNAYA_RECHKA_COORDS.length
        }
        : route;
    return {
        ...routeWithExactTrack,
        description: ROUTE_DESCRIPTIONS[route.id] || route.description || route.subtitle || ''
    };
}).sort(sortRoutesWestToEast);

function routeCenterLongitude(route) {
    const bounds = route?.bounds;
    if (!Array.isArray(bounds) || bounds.length !== 2) return Number.POSITIVE_INFINITY;
    const west = Number(bounds[0]?.[0]);
    const east = Number(bounds[1]?.[0]);
    return Number.isFinite(west) && Number.isFinite(east) ? (west + east) / 2 : Number.POSITIVE_INFINITY;
}

function sortRoutesWestToEast(a, b) {
    const longitudeDifference = routeCenterLongitude(a) - routeCenterLongitude(b);
    if (Math.abs(longitudeDifference) > 0.0001) return longitudeDifference;
    return String(a?.title || '').localeCompare(String(b?.title || ''), 'ru');
}

function normaliseRoute(route) {
    if (!route || typeof route !== 'object' || !route.id || !route.title) return null;
    const segments = (Array.isArray(route.segments) ? route.segments : [])
        .map(segment => (Array.isArray(segment) ? segment : [])
            .map(point => Array.isArray(point) ? [Number(point[0]), Number(point[1])] : null)
            .filter(point => point && Number.isFinite(point[0]) && Number.isFinite(point[1])))
        .filter(segment => segment.length > 1);
    if (!segments.length) return null;

    const allPoints = segments.flat();
    const calculatedBounds = [
        [Math.min(...allPoints.map(point => point[1])), Math.min(...allPoints.map(point => point[0]))],
        [Math.max(...allPoints.map(point => point[1])), Math.max(...allPoints.map(point => point[0]))]
    ];
    const bounds = Array.isArray(route.bounds) && route.bounds.length === 2
        && route.bounds.every(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
        ? route.bounds.map(point => [Number(point[0]), Number(point[1])])
        : calculatedBounds;
    return {
        ...route,
        id: String(route.id),
        title: String(route.title),
        description: String(route.description || route.subtitle || ''),
        segments,
        bounds,
        pointCount: Number(route.pointCount) || allPoints.length,
        order: Number(route.order) || 0
    };
}

export function setIntelligentsiaRoutes(routes) {
    const syncedRoutes = (Array.isArray(routes) ? routes : [])
        .filter(route => route && route.active !== false && route.active !== 'false' && route.active !== 'no')
        .map(normaliseRoute)
        .filter(Boolean)
        .sort(sortRoutesWestToEast);

    // A failed or not-yet-configured sync must never make the card disappear.
    if (!syncedRoutes.length) return;
    INTELLIGENTSIA_ROUTES = syncedRoutes;
    const container = document.getElementById('intelligentsiaRoutesContainer');
    if (container) renderIntelligentsiaRoutes(container);
}

let maplibreLoading = null;
let currentMap = null;
let currentRouteIndex = 0;
let flightTimer = null;
let resizeTimer = null;
let mapResizeObserver = null;
let stylesInjected = false;
let routeFavorites = {};

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
        .intelligentsia-route-caption { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px; border-radius: 12px; background: rgba(10, 11, 9, 0.68); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(14px) saturate(120%); -webkit-backdrop-filter: blur(14px) saturate(120%); cursor: pointer; }
        .intelligentsia-route-caption:active { background: rgba(10, 11, 9, 0.84); }
        .intelligentsia-route-meta { min-width: 0; }
        .intelligentsia-route-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; margin-top: 7px; color: rgba(255,255,255,0.78); font-size: 12.5px; line-height: 1.36; mask-image: linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%); }
        .intelligentsia-route-title { color: #ffffff; font-size: 18px; line-height: 1.12; font-weight: 800; }
        .intelligentsia-route-counter { flex-shrink: 0; color: #0A0B09; background: #D9FD19; border-radius: 999px; padding: 5px 9px; font-size: 12px; line-height: 1; font-weight: 800; white-space: nowrap; }
        .intelligentsia-route-favorite-area { min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 16px 0; }
        .intelligentsia-route-favorite-button { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex: 0 0 38px; padding: 0; border: 1px solid rgba(217,253,25,0.62); border-radius: 50%; background: rgba(217,253,25,0.10); color: #D9FD19; font: inherit; cursor: pointer; }
        .intelligentsia-route-favorite-button.is-active { background: #D9FD19; color: #0A0B09; }
        .intelligentsia-route-favorite-button:disabled { opacity: 0.55; cursor: wait; }
        .intelligentsia-route-favorite-icon { font-size: 20px; line-height: 1; }
        .intelligentsia-route-fans { min-width: 0; display: flex; align-items: center; justify-content: flex-end; }
        .intelligentsia-route-fan-stack { display: flex; flex-direction: row-reverse; padding-left: 5px; }
        .intelligentsia-route-fan-avatar { box-sizing: border-box; width: 30px; height: 30px; margin-left: -6px; border: 2px solid #0A0B09; border-radius: 50%; background: #30342d; object-fit: cover; color: #D9FD19; font-size: 11px; font-weight: 800; line-height: 26px; text-align: center; }
        .intelligentsia-route-fan-avatar:first-child { margin-left: 0; }
        .intelligentsia-route-fan-count { margin-left: 8px; color: rgba(255,255,255,0.62); font-size: 12px; white-space: nowrap; }
        .intelligentsia-map-fallback { height: 100%; min-height: 300px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.68); font-size: 14px; }
        .intelligentsia-route-modal .modal-content { max-width: 420px; max-height: min(72vh, 560px); padding: 24px; background: rgba(10, 11, 9, 0.92); }
        .intelligentsia-route-modal .modal-title { padding-right: 40px; margin-bottom: 14px; color: #D9FD19; }
        .intelligentsia-route-modal .modal-text { margin: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; font-size: 15px; line-height: 1.5; }
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

function updateRouteMeta(route, index) {
    const title = document.getElementById('intelligentsiaRouteTitle');
    const preview = document.getElementById('intelligentsiaRoutePreview');
    const caption = document.getElementById('intelligentsiaRouteCaption');
    const counter = document.getElementById('intelligentsiaRouteCounter');
    if (title) title.textContent = route.title;
    if (preview) preview.textContent = route.description || '';
    if (caption) caption.setAttribute('aria-label', `${route.title}: открыть описание`);
    if (counter) counter.textContent = `${index + 1} / ${INTELLIGENTSIA_ROUTES.length}`;
    renderRouteFavorites(route);
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[char]);
}

function favoriteUserIds(routeId) {
    return Object.entries(routeFavorites?.[routeId] || {})
        .filter(([, favorite]) => favorite !== false && favorite !== null)
        .sort(([, a], [, b]) => (b?.addedAt || 0) - (a?.addedAt || 0))
        .map(([userId]) => userId);
}

function isFavoritesPilot() {
    return isRouteFavoritesPilotUser(state.user);
}

function renderRouteFavorites(route) {
    const area = document.getElementById('intelligentsiaRouteFavoriteArea');
    if (!area || !route || !isFavoritesPilot()) return;

    const userIds = favoriteUserIds(route.id);
    const currentUserId = String(state.user?.id || '');
    const isFavorite = Boolean(currentUserId && userIds.includes(currentUserId));
    const canFavorite = state.userCard?.status === 'active' && Boolean(currentUserId);
    const visibleUsers = userIds.slice(0, 4);
    const avatars = visibleUsers.map(userId => {
        const profile = state.profiles?.[userId] || {};
        const name = profile.name || 'участник клуба';
        const photoUrl = profile.avatarUrl || profile.photoUrl || '';
        const initial = escapeHtml(name.charAt(0).toUpperCase() || '•');
        return photoUrl
            ? `<img class="intelligentsia-route-fan-avatar" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" onerror="this.remove()">`
            : `<span class="intelligentsia-route-fan-avatar" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">${initial}</span>`;
    }).join('');
    const fans = `<div class="intelligentsia-route-fans" aria-label="${userIds.length} добавили маршрут в любимые">${avatars ? `<div class="intelligentsia-route-fan-stack">${avatars}</div>` : ''}<span class="intelligentsia-route-fan-count">${userIds.length}</span></div>`;
    const button = canFavorite
        ? `<button type="button" class="intelligentsia-route-favorite-button ${isFavorite ? 'is-active' : ''}" id="intelligentsiaRouteFavoriteButton" aria-label="${isFavorite ? 'убрать маршрут из любимых' : 'добавить маршрут в любимые'}" title="${isFavorite ? 'убрать из любимых' : 'добавить в любимые'}" aria-pressed="${isFavorite}"><span class="intelligentsia-route-favorite-icon" aria-hidden="true">${isFavorite ? '♥' : '♡'}</span></button>`
        : '';
    area.innerHTML = `${button}${fans}`;
    const favoriteButton = document.getElementById('intelligentsiaRouteFavoriteButton');
    favoriteButton?.addEventListener('click', async () => {
        const nextValue = !isFavorite;
        favoriteButton.disabled = true;
        const previousFavorites = routeFavorites;
        const nextFavorites = { ...routeFavorites, [route.id]: { ...(routeFavorites[route.id] || {}) } };
        if (nextValue) nextFavorites[route.id][currentUserId] = { addedAt: Date.now() };
        else delete nextFavorites[route.id][currentUserId];
        routeFavorites = nextFavorites;
        state.routeFavorites = nextFavorites;
        renderRouteFavorites(route);
        try {
            await setRouteFavorite(route.id, currentUserId, nextValue);
            haptic();
            const trackingTag = nextValue ? 'hike_map_route_favorite_add' : 'hike_map_route_favorite_remove';
            log(trackingTag, false, state.user, { tracking_tag: trackingTag, route_id: route.id });
        } catch (error) {
            routeFavorites = previousFavorites;
            state.routeFavorites = previousFavorites;
            renderRouteFavorites(route);
            console.error('Could not update route favorite', error);
        }
    });
}

export function setIntelligentsiaRouteFavorites(favorites) {
    routeFavorites = favorites && typeof favorites === 'object' ? favorites : {};
    state.routeFavorites = routeFavorites;
    renderRouteFavorites(INTELLIGENTSIA_ROUTES[currentRouteIndex]);
}

export function refreshIntelligentsiaRouteFavorites() {
    renderRouteFavorites(INTELLIGENTSIA_ROUTES[currentRouteIndex]);
}

export function getFavoriteRoutesForUser(userId) {
    const id = String(userId || '');
    if (!id) return [];
    return INTELLIGENTSIA_ROUTES.filter(route => favoriteUserIds(route.id).includes(id));
}

function cameraForRoute(map, route) {
    const mapHeight = map.getContainer?.().clientHeight || 360;
    const horizontalPadding = Math.max(28, Math.round(mapHeight * 0.08));
    const topPadding = Math.max(26, Math.round(mapHeight * 0.08));
    const captionHeight = document.querySelector('.intelligentsia-route-caption')?.offsetHeight || 112;
    const bottomPadding = Math.max(captionHeight + 28, Math.round(mapHeight * 0.42));
    const camera = map.cameraForBounds(route.bounds, {
        padding: {
            top: topPadding,
            right: horizontalPadding,
            bottom: bottomPadding,
            left: horizontalPadding
        },
        maxZoom: 13.8
    }) || {};
    return {
        center: camera.center || [
            (route.bounds[0][0] + route.bounds[1][0]) / 2,
            (route.bounds[0][1] + route.bounds[1][1]) / 2
        ],
        zoom: Math.min(camera.zoom || 12, 13.8),
        pitch: 46,
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

function openRouteDescription(route) {
    if (!route?.description) return;
    document.querySelector('.intelligentsia-route-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay animated intelligentsia-route-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Описание маршрута ${route.title}`);
    overlay.innerHTML = `
        <div class="modal-content animated">
            <button class="modal-close" type="button" aria-label="закрыть">&times;</button>
            <div class="modal-title"></div>
            <div class="modal-text"></div>
        </div>
    `;
    overlay.querySelector('.modal-title').textContent = route.title;
    overlay.querySelector('.modal-text').textContent = route.description;

    const close = () => {
        overlay.classList.remove('visible');
        window.setTimeout(() => overlay.remove(), 200);
        document.removeEventListener('keydown', onKeyDown);
    };
    const onKeyDown = event => {
        if (event.key === 'Escape') close();
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
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
                <div id="intelligentsiaRouteCaption" class="intelligentsia-route-caption" role="button" tabindex="0">
                    <div class="intelligentsia-route-meta">
                        <div id="intelligentsiaRouteTitle" class="intelligentsia-route-title"></div>
                        <div id="intelligentsiaRoutePreview" class="intelligentsia-route-preview"></div>
                    </div>
                    <div id="intelligentsiaRouteCounter" class="intelligentsia-route-counter"></div>
                </div>
            </div>
            <div id="intelligentsiaRouteFavoriteArea" class="intelligentsia-route-favorite-area"></div>
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
    const routeCaption = document.getElementById('intelligentsiaRouteCaption');
    routeCaption?.addEventListener('click', event => {
        openRouteDescription(INTELLIGENTSIA_ROUTES[currentRouteIndex]);
    });
    routeCaption?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openRouteDescription(INTELLIGENTSIA_ROUTES[currentRouteIndex]);
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
                        maxzoom: 14,
                        bounds: [32.15, 44.05, 36.85, 46.45]
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
            maxBounds: [[32.15, 44.05], [36.85, 46.45]],
            minZoom: 7.4,
            maxZoom: 14,
            maxPitch: 70,
            renderWorldCopies: false,
            attributionControl: false,
            keyboard: false,
            doubleClickZoom: false,
            antialias: false
        });

        currentMap.on('load', () => {
            currentMap.addSource('dem', {
                type: 'raster-dem',
                tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                tileSize: 256,
                encoding: 'terrarium',
                maxzoom: 14,
                bounds: [32.15, 44.05, 36.85, 46.45]
            });
            currentMap.setTerrain({ source: 'dem', exaggeration: 0.82 });
            currentMap.setSky({ 'sky-color': '#0A0B09', 'horizon-color': '#151515', 'fog-color': '#0A0B09' });
            currentMap.addLayer({
                id: 'terrain-hillshade',
                type: 'hillshade',
                source: 'dem',
                paint: {
                    'hillshade-exaggeration': 0.34,
                    'hillshade-shadow-color': '#111111',
                    'hillshade-highlight-color': '#bfc4bd'
                }
            });
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
