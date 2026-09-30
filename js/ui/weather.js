// js/ui/weather.js
import { haptic } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';

const CITIES = [
    {
        name: 'Алушта',     dative: 'Алуште',
        coast:    { lat: 44.6764, lon: 34.4103, elev: 5 },
        mountain: { lat: 44.7833, lon: 34.3500, elev: 1240, label: 'Демерджи' },
    },
    {
        name: 'Партенит',   dative: 'Партените',
        coast:    { lat: 44.5567, lon: 34.3522, elev: 5 },
        mountain: { lat: 44.5417, lon: 34.3083, elev: 565,  label: 'Аю-Даг' },
    },
    {
        name: 'Перевальное', dative: 'Перевальном',
        coast:    { lat: 44.9178, lon: 34.2833, elev: 380 },
        mountain: { lat: 44.7333, lon: 34.2500, elev: 1527, label: 'Чатыр-Даг' },
    },
    {
        name: 'Ялта',       dative: 'Ялте',
        coast:    { lat: 44.4987, lon: 34.1598, elev: 5 },
        mountain: { lat: 44.4314, lon: 34.0644, elev: 1200, label: 'Ай-Петри' },
    },
    {
        name: 'Алупка',     dative: 'Алупке',
        coast:    { lat: 44.4119, lon: 34.0503, elev: 10 },
        mountain: { lat: 44.4314, lon: 34.0644, elev: 1200, label: 'Ай-Петри' },
    },
    {
        name: 'Симеиз',     dative: 'Симеизе',
        coast:    { lat: 44.3953, lon: 33.9939, elev: 20 },
        mountain: { lat: 44.4200, lon: 33.9800, elev: 900,  label: 'яйла' },
    },
    {
        name: 'Ласпи',      dative: 'Ласпи',
        coast:    { lat: 44.4103, lon: 33.7361, elev: 10 },
        mountain: { lat: 44.4400, lon: 33.7300, elev: 650,  label: 'перевал' },
    },
    {
        name: 'Форос',      dative: 'Форосе',
        coast:    { lat: 44.3972, lon: 33.7783, elev: 5 },
        mountain: { lat: 44.4200, lon: 33.7817, elev: 620,  label: 'Форосский кант' },
    },
    {
        name: 'Балаклава',  dative: 'Балаклаве',
        coast:    { lat: 44.4978, lon: 33.5986, elev: 5 },
        mountain: { lat: 44.4700, lon: 33.5700, elev: 350,  label: 'Фиолент' },
    },
    {
        name: 'Резервное',  dative: 'Резервном',
        coast:    { lat: 44.5067, lon: 33.4961, elev: 10 },
        mountain: { lat: 44.4800, lon: 33.4700, elev: 280,  label: 'мыс Фиолент' },
    },
];

const CITY_KEY  = 'weatherCity';
const CACHE_KEY = 'weatherCache3';
const CACHE_TTL = 60 * 60 * 1000;

const DAYS_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function wmoEmoji(code) {
    if (code === 0)                return '☀️';
    if (code === 1)                return '🌤️';
    if (code === 2)                return '🌥️';
    if (code === 3)                return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 55)  return '🌦️';
    if (code >= 61 && code <= 67)  return '🌧️';
    if (code >= 71 && code <= 77)  return '❄️';
    if (code >= 80 && code <= 82)  return '🌧️';
    if (code >= 85 && code <= 86)  return '❄️';
    if (code >= 95)                return '⛈️';
    return '🌡️';
}

function getCity() {
    const saved = localStorage.getItem(CITY_KEY);
    return CITIES.find(c => c.name === saved) || CITIES.find(c => c.name === 'Ялта');
}

function saveCity(name) {
    localStorage.setItem(CITY_KEY, name);
}

async function fetchZone(zone, withNow = false) {
    const url = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${zone.lat}&longitude=${zone.lon}&elevation=${zone.elev}`
        + `&daily=weathercode,temperature_2m_max,temperature_2m_min${withNow ? ',sunrise,sunset' : ''}`
        + (withNow ? `&current=temperature_2m,weathercode,cloudcover,windspeed_10m,winddirection_10m,windgusts_10m&windspeed_unit=ms` : '')
        + `&timezone=Europe%2FMoscow&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return withNow ? { ...json.daily, now: json.current } : json.daily;
}

async function fetchWeather(city) {
    const cacheRaw = localStorage.getItem(CACHE_KEY);
    if (cacheRaw) {
        try {
            const cache = JSON.parse(cacheRaw);
            if (cache.city === city.name && Date.now() - cache.ts < CACHE_TTL) {
                return cache.data;
            }
        } catch (_) {}
    }

    const [coast, mountain] = await Promise.all([
        fetchZone(city.coast, true),
        fetchZone(city.mountain),
    ]);

    const data = { coast, mountain };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ city: city.name, ts: Date.now(), data }));
    return data;
}


// ==================== НЕБО С ДУГОЙ СОЛНЦА ====================
// Солнце идёт по пунктирной дуге от восхода к закату; небо перекрашивается по высоте солнца.
// Ночью по той же дуге идёт луна. Время – крымское (UTC+3), независимо от часового пояса телефона.

const TZ = 'Europe/Moscow';
const DAY_MS = 24 * 60 * 60 * 1000;

function wmoText(code) {
    if (code === 0) return 'ясно';
    if (code === 1) return 'почти ясно';
    if (code === 2) return 'переменная облачность';
    if (code === 3) return 'пасмурно';
    if (code === 45 || code === 48) return 'туман';
    if (code >= 51 && code <= 57) return 'морось';
    if (code >= 61 && code <= 67) return 'дождь';
    if (code >= 71 && code <= 77) return 'снег';
    if (code >= 80 && code <= 82) return 'ливень';
    if (code >= 85 && code <= 86) return 'снегопад';
    if (code >= 95) return 'гроза';
    return '';
}

const WIND_DIRS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
function windDir(deg) { return WIND_DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }

function windWord(ms) {
    if (ms < 1) return 'штиль';
    if (ms < 4) return 'слабый';
    if (ms < 6) return 'лёгкий';
    if (ms < 8) return 'умеренный';
    if (ms < 11) return 'свежий';
    if (ms < 14) return 'сильный';
    return 'очень сильный';
}

function cloudWord(pct) {
    if (pct < 15) return 'чистое небо';
    if (pct < 40) return 'немного облаков';
    if (pct < 75) return 'облачно';
    return 'сплошные облака';
}

// «2026-09-30T06:48» из Open-Meteo – это крымское время
function parseLocal(str) { return new Date(str + ':00+03:00'); }

function fmtTime(date) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
function fmtDate(date) {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: TZ }).replace('.', '');
}
function fmtSpan(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(m / 60);
    return h ? `${h} ч ${m % 60} мин` : `${m} мин`;
}

// Восход и закат на сегодня/завтра по данным прогноза; до прихода данных – грубая оценка.
function sunTimes(coast, now) {
    const todayKey = now.toLocaleDateString('en-CA', { timeZone: TZ });
    if (coast?.sunrise && coast?.sunset) {
        const i = Math.max(0, coast.time.indexOf(todayKey));
        const rise = parseLocal(coast.sunrise[i]);
        const set = parseLocal(coast.sunset[i]);
        const nextRise = coast.sunrise[i + 1] ? parseLocal(coast.sunrise[i + 1]) : new Date(rise.getTime() + DAY_MS);
        const prevSet = coast.sunset[i - 1] ? parseLocal(coast.sunset[i - 1]) : new Date(set.getTime() - DAY_MS);
        return { rise, set, nextRise, prevSet };
    }
    const base = new Date(todayKey + 'T00:00:00+03:00').getTime();
    const rise = new Date(base + 6.8 * 3600e3), set = new Date(base + 18.6 * 3600e3);
    return { rise, set, nextRise: new Date(rise.getTime() + DAY_MS), prevSet: new Date(set.getTime() - DAY_MS) };
}

// Цвета неба по «высоте» солнца: -1 глубокая ночь … 0 горизонт … 1 полдень
const SKY_STOPS = [
    [-1,    [10, 19, 48],  [26, 37, 71]],
    [-0.35, [28, 38, 86],  [90, 74, 126]],
    [0,     [56, 60, 132], [255, 138, 88]],
    [0.12,  [72, 104, 180], [252, 178, 112]],
    [0.3,   [52, 124, 200], [246, 214, 160]],
    [0.5,   [35, 114, 196], [143, 198, 238]],
    [1,     [27, 103, 191], [127, 189, 240]],
];
function mix(a, b, t) { return a.map((v, k) => Math.round(v + (b[k] - v) * t)); }
function skyAt(h) {
    for (let k = 1; k < SKY_STOPS.length; k++) {
        const [h1, t1, b1] = SKY_STOPS[k];
        const [h0, t0, b0] = SKY_STOPS[k - 1];
        if (h <= h1) {
            const t = (h - h0) / (h1 - h0);
            return { top: mix(t0, t1, t), bottom: mix(b0, b1, t) };
        }
    }
    const last = SKY_STOPS[SKY_STOPS.length - 1];
    return { top: last[1], bottom: last[2] };
}
const rgb = c => `rgb(${c.join(',')})`;

// Дуга в координатах 0..320 × 0..150; горизонт – y = 128
const ARC_PATH = 'M -12 142 C 72 142, 98 60, 160 60 C 222 60, 248 142, 332 142';
const HORIZON_Y = 128;

function skyState(coast, now) {
    const { rise, set, nextRise, prevSet } = sunTimes(coast, now);
    const t = now.getTime();
    if (t >= rise && t <= set) {
        const p = (t - rise) / (set - rise);
        return { day: true, p, height: Math.sin(Math.PI * p), rise, set };
    }
    // ночь: от вчерашнего/сегодняшнего заката до ближайшего восхода
    const from = t > set ? set : prevSet;
    const to = t > set ? nextRise : rise;
    const p = (t - from) / (to - from);
    const nearest = Math.min(t - from, to - t);
    return { day: false, p, height: -Math.min(1, nearest / (90 * 60000)), rise, set, nextRise: to };
}

// точка на дуге: 10–90% длины пути, чтобы у горизонта светило не уходило за край
function placeOrb(sky, p) {
    const path = sky.querySelector('.wsky-arc path');
    const orb = sky.querySelector('.wsky-orb');
    if (!path || !orb) return;
    const pt = path.getPointAtLength(path.getTotalLength() * (0.1 + 0.8 * p));
    orb.style.left = (pt.x / 320 * 100) + '%';
    orb.style.top = (pt.y / 150 * 100) + '%';
}

function paintSky(root, coast, now) {
    const sky = root.querySelector('.wsky');
    if (!sky) return;
    const st = skyState(coast, now);
    const col = skyAt(st.height);
    sky.style.setProperty('--sky-top', rgb(col.top));
    sky.style.setProperty('--sky-bottom', rgb(col.bottom));
    sky.classList.toggle('is-night', !st.day);
    sky.style.setProperty('--stars', String(Math.max(0, Math.min(1, -st.height * 1.4 - 0.2))));

    const orb = sky.querySelector('.wsky-orb');
    orb.classList.toggle('is-moon', !st.day);
    // при первом показе светило выезжает по дуге от горизонта к своему месту
    if (!sky.dataset.shown) {
        sky.dataset.shown = '1';
        const t0 = performance.now(), dur = 1600;
        const step = now2 => {
            const k = Math.min(1, (now2 - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3);
            placeOrb(sky, (sky._orbP ?? st.p) * e);
            if (k < 1) requestAnimationFrame(step);
        };
        sky._orbP = st.p;
        requestAnimationFrame(step);
    } else {
        sky._orbP = st.p;
        placeOrb(sky, st.p);
    }
    // у горизонта солнце краснеет и теряет ореол
    sky.style.setProperty('--glow', st.day ? String(0.35 + 0.65 * st.height) : '0');
    sky.style.setProperty('--sun-warm', st.day ? String(1 - Math.min(1, st.height * 2.2)) : '0');

    sky.querySelector('.wsky-time').textContent = fmtTime(now);
    sky.querySelector('.wsky-date').textContent = fmtDate(now);

    // плашка светового дня
    const day = root.querySelector('.wday');
    if (day) {
        day.querySelector('.wday-rise').textContent = fmtTime(st.rise);
        day.querySelector('.wday-set').textContent = fmtTime(st.set);
        const passed = st.day ? st.p : (now > st.set ? 1 : 0);
        day.querySelector('.wday-fill').style.width = (passed * 100) + '%';
        day.querySelector('.wday-dot').style.left = (passed * 100) + '%';
        day.querySelector('.wday-sub').textContent = st.day
            ? `до заката ${fmtSpan(st.set - now)}`
            : `до восхода ${fmtSpan((st.nextRise || st.rise) - now)}`;
        day.querySelector('.wday-len').textContent = `световой день ${fmtSpan(st.set - st.rise)}`;
    }
}

function paintNow(root, coast) {
    const cur = coast?.now;
    if (!cur) return;
    root.querySelector('.wsky-temp').textContent = `${Math.round(cur.temperature_2m)}°`;
    root.querySelector('.wsky-desc').textContent = wmoText(cur.weathercode);
    const sky = root.querySelector('.wsky');
    if (sky) sky.style.setProperty('--clouds', String(Math.min(1, (cur.cloudcover || 0) / 100)));

    const cl = root.querySelector('.wstat--cloud');
    if (cl) {
        const pct = Math.round(cur.cloudcover || 0);
        cl.querySelector('.wstat-val').textContent = `${pct}%`;
        cl.querySelector('.wstat-sub').textContent = cloudWord(pct);
        cl.querySelector('.wstat-fill').style.width = `${Math.max(4, pct)}%`;
    }
    const wd = root.querySelector('.wstat--wind');
    if (wd) {
        const ms = cur.windspeed_10m || 0;
        const gust = Math.round(cur.windgusts_10m || 0);
        wd.querySelector('.wstat-val').innerHTML = `${Math.round(ms)}<small> м/с</small>`;
        const dir = windDir(cur.winddirection_10m || 0);
        wd.querySelector('.wstat-sub').textContent = gust >= ms + 2 ? `${dir} · порывы ${gust}` : `${windWord(ms)}, ${dir}`;
        // стрелка показывает, куда дует ветер (направление в прогнозе – откуда)
        wd.querySelector('.wstat-arrow').style.transform = `rotate(${(cur.winddirection_10m || 0) + 180}deg)`;
    }
}

let skyTimer = null;
let skyCoast = null;

function startSkyClock(root) {
    if (skyTimer) clearInterval(skyTimer);
    skyTimer = setInterval(() => {
        if (!document.body.contains(root)) { clearInterval(skyTimer); skyTimer = null; return; }
        paintSky(root, skyCoast, new Date());
    }, 60000);
}

function skyHtml(city) {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const stars = Array.from({ length: 26 }, (_, k) => {
        const x = (rnd() * 96 + 2).toFixed(1), y = (rnd() * 62 + 3).toFixed(1), r = rnd() > 0.7 ? 2 : 1.2;
        return `<i style="left:${x}%;top:${y}%;width:${r}px;height:${r}px;animation-delay:${(k % 7) * 0.6}s"></i>`;
    }).join('');
    return `
        <div class="wsky">
            <div class="wsky-stars">${stars}</div>
            <div class="wsky-cloud wsky-cloud--a"></div>
            <div class="wsky-cloud wsky-cloud--b"></div>
            <svg class="wsky-arc" viewBox="0 0 320 150" preserveAspectRatio="none" aria-hidden="true">
                <path d="${ARC_PATH}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.4" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"/>
                <line x1="0" x2="320" y1="${HORIZON_Y}" y2="${HORIZON_Y}" stroke="rgba(255,255,255,0.18)" stroke-width="1" vector-effect="non-scaling-stroke"/>
            </svg>
            <div class="wsky-orb"><div class="wsky-beam"></div><div class="wsky-body"></div></div>
            <button type="button" class="wsky-city" id="weatherCityBtn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
                <span>${city.name}</span>
            </button>
            <div class="wsky-now">
                <div class="wsky-temp">–°</div>
                <div class="wsky-desc">&nbsp;</div>
            </div>
            <div class="wsky-time"></div>
            <div class="wsky-date"></div>
        </div>
        <div class="wstats">
            <div class="wday">
                <div class="wstat-head"><span>восход · закат</span><span class="wday-len"></span></div>
                <div class="wday-row">
                    <span class="wday-rise">–</span>
                    <div class="wday-bar"><div class="wday-fill"></div><div class="wday-dot"></div></div>
                    <span class="wday-set">–</span>
                </div>
                <div class="wday-sub">&nbsp;</div>
            </div>
            <div class="wstat wstat--cloud">
                <div class="wstat-head"><span>облачность</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 1 0 6 16.9 3.5 3.5 0 0 0 7 19h10.5z"/></svg>
                </div>
                <div class="wstat-val">–</div>
                <div class="wstat-bottom"><span class="wstat-sub">&nbsp;</span><div class="wstat-bar"><div class="wstat-fill"></div></div></div>
            </div>
            <div class="wstat wstat--wind">
                <div class="wstat-head"><span>ветер</span>
                    <svg class="wstat-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
                </div>
                <div class="wstat-val">–</div>
                <div class="wstat-bottom"><span class="wstat-sub">&nbsp;</span></div>
            </div>
        </div>`;
}

function renderStrip(daily) {
    const { time, weathercode, temperature_2m_max, temperature_2m_min } = daily;
    const today = new Date().toISOString().slice(0, 10);

    return time.map((dateStr, i) => {
        const d = new Date(dateStr + 'T12:00:00');
        const dayName = DAYS_RU[d.getDay()];
        const isToday = dateStr === today;
        const emoji = wmoEmoji(weathercode[i]);
        const max = Math.round(temperature_2m_max[i]);
        const min = Math.round(temperature_2m_min[i]);

        return `
        <div class="weather-day${isToday ? ' weather-day--today' : ''}">
            <div class="weather-day-name">${dayName}</div>
            <div class="weather-day-icon">${emoji}</div>
            <div class="weather-day-temp">
                <span class="weather-temp-max">${max}°</span>
                <span class="weather-temp-min">${min}°</span>
            </div>
        </div>`;
    }).join('');
}

function showCityPicker(onSelect) {
    haptic();
    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `
        <div class="bottom-sheet" style="padding-bottom: 32px;">
            <div class="bottom-sheet-handle"></div>
            <div style="padding: 20px 20px 12px; font-size: 18px; font-weight: 600; color: #fff;">выбери город</div>
            ${CITIES.map(c => `
                <button class="city-picker-btn" data-city="${c.name}">${c.name}</button>
            `).join('')}
        </div>
    `;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('visible');
        overlay.querySelector('.bottom-sheet').classList.add('visible');
    });

    const close = () => {
        overlay.classList.remove('visible');
        overlay.querySelector('.bottom-sheet').style.transform = 'translateY(100%)';
        setTimeout(() => overlay.remove(), 350);
    };

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('.city-picker-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            haptic();
            close();
            onSelect(btn.dataset.city);
        });
    });
}

async function loadAndRender(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const coastEl    = container.querySelector('.weather-days--coast');
    const mountainEl = container.querySelector('.weather-days--mountain');
    if (!coastEl || !mountainEl) return;

    coastEl.innerHTML    = '<div class="weather-skeleton">загружаю...</div>';
    mountainEl.innerHTML = '<div class="weather-skeleton">загружаю...</div>';

    const city = getCity();
    const cityName = container.querySelector('.wsky-city span');
    if (cityName) cityName.textContent = city.name;
    paintSky(container, null, new Date());
    try {
        const { coast, mountain } = await fetchWeather(city);
        skyCoast = coast;
        paintSky(container, coast, new Date());
        paintNow(container, coast);
        coastEl.innerHTML    = renderStrip(coast);
        mountainEl.innerHTML = renderStrip(mountain);

        const mLabel = container.querySelector('.weather-mountain-label');
        if (mLabel) mLabel.textContent = city.mountain.label;
    } catch (e) {
        coastEl.innerHTML    = '<div class="weather-error">не удалось загрузить</div>';
        mountainEl.innerHTML = '';
    }
}

export function renderWeatherBlock() {
    const city = getCity();
    return `
    <div class="card-container" id="weatherBlock">
        <div class="weather-header">
            <span class="weather-title">☁️ погода</span>
        </div>
        ${skyHtml(city)}
        <div class="weather-zone-label">🌊 побережье</div>
        <div class="weather-days weather-days--coast"></div>
        <div class="weather-zone-label" style="margin-top: 12px;">⛰️ горы · <span class="weather-mountain-label">${city.mountain.label}</span></div>
        <div class="weather-days weather-days--mountain"></div>
    </div>`;
}

export function initWeatherBlock() {
    if (!document.getElementById('weatherBlock')) return;

    const root = document.getElementById('weatherBlock');
    loadAndRender('weatherBlock');
    startSkyClock(root);

    document.getElementById('weatherCityBtn')?.addEventListener('click', () => {
        log('выбор города погоды', false, state.user);
        showCityPicker(cityName => {
            saveCity(cityName);
            localStorage.removeItem(CACHE_KEY);
            loadAndRender('weatherBlock');
        });
    });
}
