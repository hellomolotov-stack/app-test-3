import { state } from '../state.js';
import { mainDiv, subtitle, haptic, openLink } from '../utils.js';
import { fetchWithTimeout } from '../net.js';
import { showBack, resetNavActive, scrollPageToTop, setUserInteracted } from './common.js';

const PILOT_ID = '163665735';
const SOURCE_CREDIT = 'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved';
const DIFFICULTIES = ['лёгкий', 'средний', 'сложный'];
const LOADER_TRACKS = [
    ["91.6,10.0 87.7,14.0 83.6,21.7 80.4,24.8 79.6,29.6 75.5,33.3 72.4,35.4 70.4,41.6 69.5,49.1 69.8,53.6 71.0,58.6 69.2,64.0 62.1,65.4 56.0,69.5 49.7,70.5 44.9,68.9 40.7,68.1 40.1,70.8 37.8,71.7 36.4,72.6 37.1,74.0"],
    ["65.7,10.0 62.9,14.9 59.6,18.8 60.4,23.9 62.3,27.4 62.3,30.4 62.2,32.0 61.4,35.3 59.9,35.9 62.5,38.8 62.6,42.7 63.0,44.8 62.7,47.8 61.8,49.8 60.5,51.6 61.4,53.6 63.1,56.7 64.0,58.9 64.6,60.5 64.2,63.0 65.0,65.4 66.1,68.3 66.9,70.8 68.6,74.0 68.7,73.9"],
    ["117.0,28.3 115.7,27.2 113.6,26.0 111.5,25.3 111.0,26.4 108.3,27.7 103.0,29.1 99.6,29.9 94.5,29.9 90.6,33.7 84.1,37.8 77.8,41.6 70.6,40.7 66.6,45.0 62.2,47.7 57.8,48.4 58.7,51.3 53.8,52.3 50.1,54.1 45.9,56.9 42.7,58.3 42.0,54.7 36.1,53.3 30.8,52.0 25.8,50.3 21.4,52.0 15.5,54.9 11.8,56.7 11.0,57.2"],
    ["88.9,60.5 90.8,54.2 89.8,49.0 85.2,50.9 81.4,53.1 77.8,50.7 75.0,45.2 71.4,40.5 68.2,36.3 62.8,32.3 60.3,24.3 57.7,19.5 53.0,15.8 45.6,11.7 42.1,11.7 37.1,14.6 38.2,19.8 41.8,25.2 45.7,30.1 44.2,37.3 40.6,40.2 39.1,52.3 53.9,58.2 66.7,65.8 70.6,73.7 75.2,68.1 81.6,66.4 85.4,63.3 89.0,60.3"]
];

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
    if (!route.profile?.length || !route.meters) return '<p class="solo-muted">профиль высот уточняется</p>';
    const forward = route.profile;
    const end = forward.at(-1).at(-1)[0];
    if (end <= 0) return '';
    const scale = (route.kind === 'linear' ? route.meters / 2 : route.meters) / end;
    const scaled = forward.map(part => part.map(([distance, height]) => [distance * scale, height]));
    const points = route.kind !== 'linear' ? scaled : [
        ...scaled,
        ...[...scaled].reverse().map(part => [...part].reverse().map(([distance, height]) => [route.meters - distance, height]))
    ];
    const heights = points.flat().map(([, height]) => height);
    const low = Math.floor(Math.min(...heights) / 20) * 20;
    const high = Math.max(low + 20, Math.ceil(Math.max(...heights) / 20) * 20);
    const gap = route.kind === 'parts' ? 5 : 0;
    const width = 276 - gap * (points.length - 1);
    const paths = points.map((part, index) => {
        const coords = part.map(([distance, height]) => [
            (2 + distance / route.meters * width + index * gap).toFixed(1),
            (65 - (height - low) / (high - low) * 58).toFixed(1)
        ]);
        const line = coords.map(point => point.join(',')).join(' ');
        return `<polygon points="${coords[0][0]},65 ${line} ${coords.at(-1)[0]},65" fill="currentColor" opacity=".13"/>
            <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const middle = route.kind === 'linear'
        ? '<line x1="140" x2="140" y1="7" y2="65" stroke-dasharray="3 3" class="solo-grid-line"/>' : '';
    return `<section class="solo-profile">
        <h3>профиль высот</h3>
        <div class="solo-plot">
            <div class="solo-axis"><span>${high} м</span><span>${low} м</span></div>
            <svg viewBox="0 0 280 72" preserveAspectRatio="none" role="img" aria-label="Профиль высот">
                <path d="M0 7H280 M0 36H280 M0 65H280" fill="none" class="solo-grid-line"/>${middle}${paths}
            </svg>
            <div class="solo-dist"><span>${route.kind === 'parts' ? '0 км' : 'старт'}</span>
              ${route.kind === 'linear' ? '<span>разворот</span>' : ''}
              <span>${route.kind === 'parts' ? `${route.km} км участков` : 'финиш'}</span>
            </div>
        </div>
        <div class="solo-elevation"><span>набор <b>≈ +${route.ascent} м</b></span><span>спуск <b>≈ −${route.descent} м</b></span></div>
    </section>`;
}

const chip = (group, key, label, value) =>
    `<button class="status-tag solo-chip" type="button" data-solo-${group}="${key}" aria-pressed="${key === value}">${label}</button>`;
const timeLabel = route => route.minutes === null ? 'время уточняется' : `≈ ${duration(route.minutes)}`;
const kmLabel = route => route.km === null ? 'дистанция уточняется' : `${route.km} км`;

function routeRow(route) {
    return `<button class="solo-row" type="button" data-solo-route="${route.id}">
        <span class="solo-thumb">${track(route)}</span>
        <span><b>${esc(route.title)}</b><small>${kmLabel(route)} · ${timeLabel(route)} · ${route.difficulty ?? 'сложность уточняется'}</small></span>
        <i aria-hidden="true">›</i>
    </button>`;
}

function timeGroup(route) {
    return route.minutes === null ? 'unknown' : route.minutes <= 180 ? 'short' : 'long';
}

function catalogRows(routes, time, difficulty) {
    const matches = routes.filter(route =>
        (difficulty === 'all' || route.difficulty === DIFFICULTIES[Number(difficulty)]) &&
        (time === 'all' || timeGroup(route) === time)
    );
    if (!matches.length) return '<p class="solo-muted">с этими фильтрами маршрутов нет</p>';
    return [['short', 'до 3 часов на тропе'], ['long', 'дольше 3 часов'], ['unknown', 'время уточняется']]
        .map(([group,label]) => {
            const rows = matches.filter(route => timeGroup(route) === group);
            return rows.length ? `<h3 class="solo-group">${label}</h3>${rows.map(routeRow).join('')}` : '';
        }).join('');
}

function guide(route) {
    const trip = {
        loop: 'кольцевой маршрут', linear: 'туда и обратно по одному треку',
        parts: 'GPX с отдельными участками', missing: 'трек уточняется'
    }[route.kind];
    return `<h2>${esc(route.title)}</h2><p class="solo-muted">${trip}</p>
        ${route.line.length ? `<div class="solo-cover">${track(route)}<span>форма трека</span></div>` : ''}
        <div class="solo-facts">
          <div><b>${route.km === null ? 'уточняется' : kmLabel(route)}</b><span>${route.kind === 'parts' ? 'сумма участков' : 'весь маршрут'}</span></div>
          <div><b>${route.minutes === null ? 'уточняется' : timeLabel(route)}</b><span>на тропе</span></div>
          <div><b>${route.difficulty ?? 'уточняется'}</b><span>сложность</span></div>
        </div>
        ${profile(route)}
        ${route.start || route.download ? `<section class="solo-links">
          <h3>полезные ссылки</h3>
          ${route.start ? '<button type="button" class="solo-link" data-solo-action="map"><span><b>точка старта в Яндекс Картах</b><small>как добраться до начала маршрута</small></span><i>↗</i></button>' : ''}
          ${route.download ? `<button type="button" class="solo-link" data-solo-action="gpx"><span><b>скачать GPX</b><small>${route.kind === 'parts' ? 'отдельные участки трека' : 'полный маршрут для офлайн-карты'}</small></span><i>↓</i></button>` : ''}
          <p class="solo-muted" role="status" data-solo-download-status></p>
        </section>` : ''}
        ${route.description || route.reference || route.kind === 'parts' ? `<details class="solo-notes" open>
          <summary>что важно на маршруте</summary>
          ${route.description ? `<p>${esc(route.description)}</p>` : ''}
          ${route.kind === 'parts' ? '<p>между участками нет связующего трека, время прохождения уточняется</p>' : ''}
          ${route.reference ? '<button class="solo-source" type="button" data-solo-action="reference">описание и условия маршрута ↗</button>' : ''}
        </details>` : ''}
        ${route.profile?.length ? `<p class="solo-credit">${SOURCE_CREDIT}</p>` : ''}`;
}

function askServer(action, routeId) {
    return fetchWithTimeout('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, routeId, initData: window.Telegram.WebApp.initData })
    }).then(response => {
        if (!response.ok) throw new Error('solo request failed');
        return response.json();
    });
}

function downloadGpx(url, id) {
    const tg = window.Telegram.WebApp;
    if (tg.downloadFile && tg.isVersionAtLeast?.('8.0')) {
        tg.downloadFile({ url: url.href, file_name: `${id}-solo.gpx` });
    } else {
        tg.openLink(url.href, { try_instant_view: false });
    }
}

function loader() {
    return `<div class="solo-loader" role="status"><div class="solo-loader-stage">
        <div class="solo-loader-tracks" aria-hidden="true">
            ${LOADER_TRACKS.map(line => track({ line })).join('')}
        </div>
        <span>Загружаем маршруты</span>
    </div></div>`;
}

const backHtml = '<button type="button" class="solo-back" data-solo-action="back" aria-label="назад">‹</button>';

async function openSoloHiking(back) {
    if (!isSoloHikingPilot()) return;
    const root = mainDiv();
    window.isPrivPage = false;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = 'соло хайкинг';
    root.innerHTML = `<div class="solo-page">${backHtml}${loader()}</div>`;
    const page = root.firstElementChild;
    let goBack = back;
    showBack(back);
    page.addEventListener('click', event => {
        if (event.target.closest('[data-solo-action="back"]')) {
            haptic();
            goBack();
        }
    });
    scrollPageToTop();
    let routes;
    try {
        ({ routes } = await askServer('soloRoutes'));
        if (!Array.isArray(routes) || !routes.length) throw new Error('empty routes');
    } catch {
        if (page.isConnected) {
            page.innerHTML = `${backHtml}<p class="solo-muted" role="status">не удалось загрузить маршруты</p><button class="solo-source" type="button">попробовать ещё раз</button>`;
            page.querySelector('.solo-source').onclick = () => openSoloHiking(back);
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
        goBack = back;
        showBack(back);
        const feature = routes.find(route => route.id === 'tsarskaya-tropa') || routes.find(route => route.line.length);
        page.innerHTML = `${backHtml}<h2>куда пойдём?</h2>
            ${feature ? `<button class="solo-feature" type="button" data-solo-route="${feature.id}">
              <span><small>из каталога клуба</small><b>${esc(feature.title)}</b><span>${kmLabel(feature)} · ${timeLabel(feature)}</span></span>
              <span>${track(feature)}</span>
            </button>` : ''}
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
        if (!button || button.dataset.soloAction === 'back') return;
        const { soloRoute, soloTime, soloLevel, soloAction } = button.dataset;
        haptic();
        if (soloRoute) {
            active = routes.find(route => route.id === soloRoute);
            if (!active) return;
            listScroll = window.scrollY;
            page.innerHTML = backHtml + guide(active);
            goBack = catalog;
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
            const route = active;
            const status = page.querySelector('[data-solo-download-status]');
            status.textContent = '';
            button.disabled = true;
            try {
                const url = new URL(route.download, window.location.origin);
                if (url.origin !== window.location.origin || url.protocol !== 'https:') throw new Error('invalid download URL');
                if (Number(url.searchParams.get('expires')) > Date.now() + 30000) {
                    downloadGpx(url, route.id);
                } else {
                    const { download } = await askServer('soloDownload', route.id);
                    if (!download) throw new Error('track unavailable');
                    route.download = download;
                    status.textContent = 'файл готов, нажми «скачать GPX»';
                }
            } catch {
                status.textContent = 'не удалось скачать GPX, попробуй ещё раз';
            } finally {
                button.disabled = false;
            }
        }
    });
    catalog();
}
