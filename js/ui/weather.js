// js/ui/weather.js
import { haptic } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';

const CITIES = [
    {
        name: 'Ялта',      dative: 'Ялте',
        coast:    { lat: 44.4987, lon: 34.1598, elev: 5 },
        mountain: { lat: 44.4314, lon: 34.0644, elev: 1200, label: 'Ай-Петри' },
    },
    {
        name: 'Алупка',    dative: 'Алупке',
        coast:    { lat: 44.4119, lon: 34.0503, elev: 10 },
        mountain: { lat: 44.4314, lon: 34.0644, elev: 1200, label: 'Ай-Петри' },
    },
    {
        name: 'Симеиз',    dative: 'Симеизе',
        coast:    { lat: 44.3953, lon: 33.9939, elev: 20 },
        mountain: { lat: 44.4200, lon: 33.9800, elev: 900, label: 'яйла' },
    },
    {
        name: 'Ласпи',     dative: 'Ласпи',
        coast:    { lat: 44.4103, lon: 33.7361, elev: 10 },
        mountain: { lat: 44.4400, lon: 33.7300, elev: 650, label: 'перевал' },
    },
    {
        name: 'Балаклава', dative: 'Балаклаве',
        coast:    { lat: 44.4978, lon: 33.5986, elev: 5 },
        mountain: { lat: 44.4700, lon: 33.5700, elev: 350, label: 'Фиолент' },
    },
];

const CITY_KEY  = 'weatherCity';
const CACHE_KEY = 'weatherCache2';
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
    return CITIES.find(c => c.name === saved) || CITIES[0];
}

function saveCity(name) {
    localStorage.setItem(CITY_KEY, name);
}

async function fetchZone(zone) {
    const url = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${zone.lat}&longitude=${zone.lon}&elevation=${zone.elev}`
        + `&daily=weathercode,temperature_2m_max,temperature_2m_min`
        + `&timezone=Europe%2FMoscow&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.daily;
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
        fetchZone(city.coast),
        fetchZone(city.mountain),
    ]);

    const data = { coast, mountain };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ city: city.name, ts: Date.now(), data }));
    return data;
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
    try {
        const { coast, mountain } = await fetchWeather(city);
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
            <span class="weather-title">☁️ погода в</span>
            <button class="weather-city-btn" id="weatherCityBtn">${city.dative} ›</button>
        </div>
        <div class="weather-zone-label">🌊 побережье</div>
        <div class="weather-days weather-days--coast"></div>
        <div class="weather-zone-label" style="margin-top: 12px;">⛰️ горы · <span class="weather-mountain-label">${city.mountain.label}</span></div>
        <div class="weather-days weather-days--mountain"></div>
    </div>`;
}

export function initWeatherBlock() {
    if (!document.getElementById('weatherBlock')) return;

    loadAndRender('weatherBlock');

    document.getElementById('weatherCityBtn')?.addEventListener('click', () => {
        log('выбор города погоды', false, state.user);
        showCityPicker(cityName => {
            saveCity(cityName);
            localStorage.removeItem(CACHE_KEY);
            const btn = document.getElementById('weatherCityBtn');
            const found = CITIES.find(c => c.name === cityName);
            if (btn) btn.textContent = `${found?.dative || cityName} ›`;
            loadAndRender('weatherBlock');
        });
    });
}
