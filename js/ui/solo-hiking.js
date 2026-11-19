import { state } from '../state.js';
import { mainDiv, subtitle, haptic, openLink } from '../utils.js';
import { fetchWithTimeout } from '../net.js';
import { showBack, resetNavActive, scrollPageToTop, setUserInteracted } from './common.js';

const PILOT_ID = '163665735';
const SOURCE_CREDIT = 'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved';
const DIFFICULTIES = ['лёгкий', 'средний', 'сложный'];

export function isSoloHikingPilot() {
    return state.userCard?.status === 'active'
        && String(state.user?.id ?? '') === PILOT_ID
        && Boolean(window.Telegram?.WebApp?.initData);
}

export function soloHikingEntryHtml() {
    if (!isSoloHikingPilot()) return '';
    return `<button type="button" class="solo-entry" id="soloHikingEntry">
        <svg class="solo-entry-track" viewBox="0 0 128 84" aria-hidden="true">
            <path d="M21 56 L35 51 42 58 55 45 60 32 68 34 75 27 80 39 91 36 102 27"
                  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="21" cy="56" r="2.5" fill="currentColor"/><circle cx="102" cy="27" r="2.5" fill="currentColor"/>
        </svg>
        <strong>соло хайкинг</strong>
        <span>треки и гайды для самостоятельных хайков</span>
        <b>открыть маршруты <i aria-hidden="true">›</i></b>
    </button>`;
}

export function bindSoloHikingEntry(root, back) {
    const entry = root.querySelector('#soloHikingEntry');
    entry?.addEventListener('click', () => {
        haptic();
        setUserInteracted();
        const scrollY = window.scrollY;
        openSoloHiking(() => {
            back();
            requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
        });
    });
}

function duration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return [hours ? `${hours} ч` : '', remainder ? `${remainder} мин` : ''].filter(Boolean).join(' ');
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function track(route) {
    return `<svg viewBox="0 0 128 84" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
        ${route.line.map(line => `<polyline points="${esc(line)}"/>`).join('')}
    </svg>`;
}

function profile(route) {
    const forward = route.profile;
    const points = route.kind === 'loop' ? forward : [
        ...forward,
        ...forward.slice(0, -1).reverse().map(([distance, height]) => [route.meters - distance, height])
    ];
    const heights = points.map(([, height]) => height);
    const low = Math.floor(Math.min(...heights) / 20) * 20;
    const high = Math.max(low + 20, Math.ceil(Math.max(...heights) / 20) * 20);
    const line = points.map(([distance, height]) => {
        const x = 2 + distance / route.meters * 276;
        const y = 65 - (height - low) / (high - low) * 58;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const middle = route.kind === 'linear'
        ? '<line x1="140" x2="140" y1="7" y2="65" stroke-dasharray="3 3" class="solo-grid-line"/>' : '';
    return `<section class="solo-profile">
        <h3>профиль высот</h3>
        <div class="solo-plot">
            <div class="solo-axis"><span>${high} м</span><span>${low} м</span></div>
            <svg viewBox="0 0 280 72" preserveAspectRatio="none" role="img" aria-label="Профиль высот всего маршрута">
                <path d="M0 7H280 M0 36H280 M0 65H280" fill="none" class="solo-grid-line"/>
                ${middle}
                <polygon points="2,65 ${line} 278,65" fill="currentColor" opacity=".13"/>
                <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
            </svg>
            <div class="solo-dist"><span>старт</span>${route.kind === 'linear' ? '<span>разворот</span>' : ''}<span>финиш</span></div>
        </div>
        <div class="solo-elevation"><span>набор <b>≈ +${route.ascent} м</b></span><span>спуск <b>≈ −${route.descent} м</b></span></div>
    </section>`;
}

const chip = (group, key, label, value) =>
    `<button class="status-tag solo-chip" type="button" data-solo-${group}="${key}" aria-pressed="${key === value}">${label}</button>`;

function routeRow(route) {
    return `<button class="solo-row" type="button" data-solo-route="${route.id}">
        <span class="solo-thumb">${track(route)}</span>
        <span><b>${esc(route.title)}</b><small>${route.km} км · ≈ ${duration(route.minutes)} · ${route.difficulty}</small></span>
        <i aria-hidden="true">›</i>
    </button>`;
}

function catalogRows(routes, time, difficulty) {
    const matches = routes.filter(route =>
        (difficulty === 'all' || route.difficulty === DIFFICULTIES[Number(difficulty)]) &&
        (time === 'all' || (time === 'short' ? route.minutes <= 180 : route.minutes > 180))
    );
    if (!matches.length) return '<p class="solo-muted">с этими фильтрами маршрутов нет</p>';
    return [[true, 'до 3 часов на тропе'], [false, 'дольше 3 часов']].map(([short, label]) => {
        const rows = matches.filter(route => (route.minutes <= 180) === short);
        return rows.length ? `<h3 class="solo-group">${label}</h3>${rows.map(routeRow).join('')}` : '';
    }).join('');
}

function guide(route) {
    const trip = route.kind === 'loop' ? 'кольцевой маршрут' : 'туда и обратно по одному треку';
    return `<h2>${esc(route.title)}</h2><p class="solo-muted">${trip}</p>
        <div class="solo-cover">${track(route)}<span>форма трека</span></div>
        <div class="solo-facts">
          <div><b>${route.km} км</b><span>весь маршрут</span></div>
          <div><b>≈ ${duration(route.minutes)}</b><span>на тропе</span></div>
          <div><b>${route.difficulty}</b><span>сложность</span></div>
        </div>
        ${profile(route)}
        <section class="solo-links">
          <h3>полезные ссылки</h3>
          <button type="button" class="solo-link" data-solo-action="map"><span><b>точка старта в Яндекс Картах</b><small>как добраться до начала маршрута</small></span><i>↗</i></button>
          <button type="button" class="solo-link" data-solo-action="gpx"><span><b>скачать GPX</b><small>полный маршрут для офлайн-карты</small></span><i>↓</i></button>
          <p class="solo-muted" role="status" data-solo-download-status></p>
        </section>
        <details class="solo-notes" open>
          <summary>что важно на маршруте</summary>
          <p>${esc(route.description)}</p>
          <button class="solo-source" type="button" data-solo-action="reference">описание и условия маршрута ↗</button>
        </details>
        <p class="solo-credit">${SOURCE_CREDIT}</p>`;
}

async function downloadGpx(route) {
    const response = await fetchWithTimeout(route.gpx);
    if (!response.ok) throw new Error('gpx unavailable');
    const original = await response.text();
    const document = new DOMParser().parseFromString(original, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('invalid gpx');
    const geometry = element => Array.from(element.children).filter(child => ['trkpt', 'rtept'].includes(child.localName));
    const trackSegments = Array.from(document.getElementsByTagNameNS('*', 'trkseg')).filter(part => geometry(part).length);
    const routeSegments = Array.from(document.getElementsByTagNameNS('*', 'rte')).filter(part => geometry(part).length);
    const segments = trackSegments.length ? trackSegments : routeSegments;
    if (!segments.length) throw new Error('empty gpx');
    const sections = segments.map(segment => geometry(segment).map(point => {
        const lat = Number.parseFloat(point.getAttribute('lat'));
        const lon = Number.parseFloat(point.getAttribute('lon'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            throw new Error('invalid gpx coordinates');
        }
        return `<trkpt lat="${lat}" lon="${lon}"/>`;
    }));
    const ordered = route.kind === 'loop' ? sections : [
        ...sections, ...[...sections].reverse().map(points => [...points].reverse())
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ХАЙКИНГ КЛУБ" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${esc(route.title)}</name>${ordered.map(points => `<trkseg>${points.join('')}</trkseg>`).join('')}</trk>
</gpx>`;
    const blobUrl = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml' }));
    const anchor = window.document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = `${route.id}-solo.gpx`;
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

async function openSoloHiking(back) {
    if (!isSoloHikingPilot()) return;
    const root = mainDiv();
    window.isPrivPage = false;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = 'соло хайкинг';
    root.innerHTML = '<div class="solo-page"><p class="solo-muted" role="status">загружаем маршруты</p></div>';
    const page = root.firstElementChild;
    showBack(back);
    scrollPageToTop();
    let routes;
    try {
        const response = await fetchWithTimeout('/api/me', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'soloRoutes', initData: window.Telegram.WebApp.initData })
        });
        if (!response.ok) throw new Error('routes unavailable');
        ({ routes } = await response.json());
        if (!Array.isArray(routes) || !routes.length) throw new Error('empty routes');
    } catch {
        if (page.isConnected) {
            page.innerHTML = '<p class="solo-muted" role="status">не удалось загрузить маршруты</p><button class="solo-source" type="button">попробовать ещё раз</button>';
            page.querySelector('button').onclick = () => openSoloHiking(back);
        }
        return;
    }
    if (!page.isConnected) return;
    let time = 'all';
    let difficulty = 'all';
    let active = null;
    let listScroll = 0;
    const catalog = () => {
        active = null;
        showBack(back);
        const feature = routes[0];
        page.innerHTML = `<h2>куда пойдём?</h2>
            <button class="solo-feature" type="button" data-solo-route="${feature.id}">
              <span><small>из каталога клуба</small><b>${esc(feature.title)}</b><span>${feature.km} км · ≈ ${duration(feature.minutes)}</span></span>
              <span>${track(feature)}</span>
            </button>
            <fieldset class="solo-filters"><legend>время на тропе</legend>
              ${chip('time','all','любое',time)}${chip('time','short','до 3 ч',time)}${chip('time','long','дольше 3 ч',time)}
            </fieldset>
            <fieldset class="solo-filters"><legend>сложность</legend>
              ${chip('level','all','любая',difficulty)}${DIFFICULTIES.map((level,i) => chip('level',String(i),level,difficulty)).join('')}
            </fieldset>
            <div class="solo-results" aria-live="polite">${catalogRows(routes,time,difficulty)}</div>`;
        window.scrollTo({ top: listScroll, behavior: 'instant' });
    };
    page.addEventListener('click', async event => {
        const button = event.target.closest('button');
        if (!button) return;
        const { soloRoute, soloTime, soloLevel, soloAction } = button.dataset;
        haptic();
        if (soloRoute) {
            active = routes.find(route => route.id === soloRoute);
            if (!active) return;
            listScroll = window.scrollY;
            page.innerHTML = guide(active);
            showBack(catalog);
            scrollPageToTop();
        } else if (soloTime || soloLevel) {
            if (soloTime) time = soloTime;
            if (soloLevel) difficulty = soloLevel;
            for (const item of page.querySelectorAll('.solo-chip')) {
                const select = item.dataset.soloTime ? item.dataset.soloTime === time : item.dataset.soloLevel === difficulty;
                item.setAttribute('aria-pressed', String(select));
            }
            page.querySelector('.solo-results').innerHTML = catalogRows(routes,time,difficulty);
        } else if (active && soloAction === 'map') {
            const [lat,lon] = active.start;
            openLink(`https://yandex.ru/maps/?pt=${lon},${lat}&z=15&l=map`, 'соло хайкинг: точка старта', false);
        } else if (active && soloAction === 'reference') {
            openLink(active.reference, 'соло хайкинг: источник маршрута', false);
        } else if (active && soloAction === 'gpx') {
            const status = page.querySelector('[data-solo-download-status]');
            button.disabled = true;
            try { await downloadGpx(active); }
            catch { status.textContent = 'не удалось скачать GPX, попробуй ещё раз'; }
            finally { button.disabled = false; }
        }
    });
    catalog();
}
