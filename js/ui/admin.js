// js/ui/admin.js – админка клуба: хайки (создание, правка, GPX-трек, участники) и рассылки.
// Кнопку видят только ADMIN_USERNAMES, но это лишь удобство: каждое действие сервер
// (Apps Script, handleAdmin) проверяет по подписи Telegram initData.
import { state } from '../state.js';
import { haptic, tg } from '../utils.js';
import { REGISTRATION_API_URL } from '../config.js';
import { loadAllParticipants } from '../firebase.js';
import { previewHikeTrack, findCatalogRoute, catalogRouteTrack } from './calendar.js';

const ADMIN_USERNAMES = new Set(['maxmolotov', 'hellointelligent']);
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const PLACEHOLDER_EMOJI = [
    ['⛰️', '⛰️ готовим хайк'],
    ['🌧️', '🌧️ переносим дату'],
    ['🏄🏻‍♂️', '🏄🏻‍♂️ готовим событие']
];
const APP_SECTIONS = [
    ['calendar', 'календарь'],
    ['hike', 'конкретный хайк'],
    ['card', 'карта интеллигента'],
    ['privileges', 'привилегии'],
    ['bookings', 'мои записи'],
    ['routes', 'маршруты на карте'],
    ['updates', 'обновления'],
    ['profiles', 'профили'],
    ['bot', 'чат-помощник']
];
const TRACK_MAX_POINTS = 400;

let root = null;
let view = { tab: 'hikes' };
let draft = null;       // редактируемый хайк
let bc = null;          // черновик рассылки
let pastLimit = 8;
let audience = null;     // { counts: {all, guests, members}, at }
let templates = null;    // route_templates с сервера: { route_id: {поля хайка} }
let templatesLoading = null;

export function isAdminUser() {
    return ADMIN_USERNAMES.has(String(state.user?.username || '').replace(/^@/, '').toLowerCase());
}

// Полоска «⚙️ админка» сверху главной – только для админов.
// Кнопка «⚙️ админка» справа от приветствия, в одной строке с ним.
export function mountAdminEntry() {
    const header = document.querySelector('.header');
    if (!header || !isAdminUser()) return;
    header.classList.add('has-adm');
    if (header.querySelector('.adm-entry')) return;
    const btn = document.createElement('button');
    btn.className = 'adm-entry';
    btn.textContent = '⚙️ админка';
    btn.addEventListener('click', () => { haptic(); openAdmin(); });
    header.appendChild(btn);
}

export function openAdmin(tab = 'hikes') {
    if (!isAdminUser()) return;
    closeAdmin();
    view = { tab };
    loadTemplates().catch(() => {});
    root = document.createElement('div');
    root.className = 'adm';
    document.body.appendChild(root);
    document.body.classList.add('adm-open');
    render();
}

function closeAdmin() {
    root?.remove();
    root = null;
    document.body.classList.remove('adm-open');
}

// ---------- сервер ----------
async function adminCall(action, data = {}) {
    const params = new URLSearchParams({ action, init_data: tg?.initData || '', ...data });
    const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params });
    let json;
    try { json = JSON.parse(await resp.text()); } catch (e) { throw new Error('сервер ответил не JSON'); }
    if (json.status !== 'ok') throw new Error(json.message || 'ошибка сервера');
    return json;
}

// ---------- утилиты ----------
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const todayStr = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const dateLabel = s => {
    const d = new Date(s + 'T12:00:00');
    return `${WD[d.getDay()]}, ${d.getDate()} ${MS[d.getMonth()]}`;
};
const tagsText = h => Array.isArray(h.tags) ? h.tags.join(', ') : String(h.tags || '');
const isYes = v => v === true || v === 'yes' || v === 'true';

function toast(text, isError = false) {
    const el = document.createElement('div');
    el.className = 'adm-toast' + (isError ? ' is-error' : '');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 5000 : 2600);
}

function allHikes() {
    return Object.entries(state.hikesData || {})
        .map(([date, h]) => ({ ...h, date }))
        .filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h.date))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- каркас ----------
function render() {
    if (!root) return;
    const tabs = [['hikes', '🏔 хайки'], ['broadcast', '📨 рассылка']];
    root.innerHTML = `
        <div class="adm-head">
            <div class="adm-title">админка</div>
            <button class="adm-close" aria-label="закрыть">✕</button>
        </div>
        ${view.sub ? '' : `<div class="adm-tabs">${tabs.map(([k, l]) => `<button class="adm-tab${view.tab === k ? ' is-on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`}
        <div class="adm-body"></div>`;
    root.querySelector('.adm-close').addEventListener('click', () => { haptic(); closeAdmin(); });
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
        haptic();
        view = { tab: b.dataset.tab };
        render();
    }));
    const body = root.querySelector('.adm-body');
    if (view.sub === 'edit') renderEditor(body);
    else if (view.tab === 'broadcast') renderBroadcast(body);
    else renderHikeList(body);
    root.scrollTop = 0;
}

// ---------- список хайков ----------
function renderHikeList(body) {
    const today = todayStr();
    const hikes = allHikes();
    const upcoming = hikes.filter(h => h.date >= today);
    const past = hikes.filter(h => h.date < today).reverse();
    const row = h => {
        const title = h.title && h.title.trim() ? esc(h.title) : `<span class="adm-muted">${esc(h.emoji || '⛰️')} заглушка</span>`;
        const flags = [];
        if (isYes(h.cancelled)) flags.push('<span class="adm-flag is-off">отменён</span>');
        if (h.track && h.track.coords) flags.push('<span class="adm-flag">трек</span>');
        if (h.report_link) flags.push('<span class="adm-flag">отчёт</span>');
        if (isYes(h.city)) flags.push('<span class="adm-flag is-city">город</span>');
        return `<button class="adm-row" data-date="${h.date}">
            <span class="adm-row-date">${dateLabel(h.date)}</span>
            <span class="adm-row-main"><span class="adm-row-title">${title}</span><span class="adm-row-flags">${flags.join('')}<span class="adm-going" data-going="${h.date}"></span></span></span>
            <span class="adm-chev">›</span>
        </button>`;
    };
    body.innerHTML = `
        <button class="btn btn-yellow adm-primary" id="admNewHike">+ новый хайк</button>
        <div class="adm-label">впереди</div>
        ${upcoming.length ? upcoming.map(row).join('') : '<div class="adm-empty">ничего не запланировано</div>'}
        <div class="adm-label">прошедшие</div>
        ${past.slice(0, pastLimit).map(row).join('')}
        ${past.length > pastLimit ? '<button class="adm-link" id="admMorePast">показать ещё</button>' : ''}`;
    body.querySelector('#admNewHike').addEventListener('click', () => { haptic(); openEditor(null); });
    body.querySelector('#admMorePast')?.addEventListener('click', () => { pastLimit += 10; render(); });
    body.querySelectorAll('.adm-row').forEach(b => b.addEventListener('click', () => { haptic(); openEditor(b.dataset.date); }));
    body.querySelectorAll('[data-going]').forEach(el => {
        loadAllParticipants(el.dataset.going).then(list => {
            if (list && list.length) el.textContent = `👥 ${list.length}`;
        }).catch(() => {});
    });
}

// ---------- маршруты каталога и шаблоны ----------
function catalogRoutes() {
    return (state.intelligentsiaRoutes || []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru'));
}

function routeById(id) {
    return (state.intelligentsiaRoutes || []).find(r => String(r.id) === String(id)) || null;
}

function routeKm(route) {
    let m = 0;
    (route?.segments || []).forEach(seg => { for (let i = 1; i < seg.length; i++) m += haversine(seg[i - 1], seg[i]); });
    return m ? Math.round(m / 100) / 10 : null;
}

function loadTemplates(force = false) {
    if (templates && !force) return Promise.resolve(templates);
    if (!templatesLoading || force) {
        templatesLoading = adminCall('adminTemplates')
            .then(res => (templates = res.templates || {}))
            .finally(() => { templatesLoading = null; });
    }
    return templatesLoading;
}

// Последний хайк на этот маршрут (если шаблона ещё нет): по route_id или по названию.
function latestHikeFor(routeId) {
    return allHikes()
        .filter(h => h.title && String(h.title).trim() && findCatalogRoute(h)?.id === routeId)
        .pop() || null;
}

// Шаблон маршрута: сохранённый в админке → последний хайк на маршрут → данные каталога.
function templateFor(routeId) {
    const route = routeById(routeId);
    const saved = templates && templates[routeId];
    if (saved) return { source: 'шаблон', from: saved.from_date, data: saved };
    const last = latestHikeFor(routeId);
    if (last) return { source: 'прошлый хайк', from: last.date, data: last };
    const km = routeKm(route);
    return {
        source: 'каталог',
        data: { title: route ? `хайк на ${route.title}` : '', features: route?.description || '', tags: km ? [`${km} км`] : [], start_time: '12:00' }
    };
}

function applyTemplate(routeId) {
    const t = templateFor(routeId);
    const v = t.data || {};
    const d = draft;
    d.title = v.title || '';
    d.emoji = '';
    d.start_time = v.start_time || d.start_time || '12:00';
    d.tags = Array.isArray(v.tags) ? v.tags.join(', ') : String(v.tags || '');
    d.image = v.image || '';
    d.features = v.features || '';
    d.access = v.access || '';
    d.details = v.details || '';
    d.location_link = v.location_link || '';
    d.woman = isYes(v.woman);
    d.city = isYes(v.city);
    d.templateNote = t.source === 'каталог'
        ? 'подставлено из каталога маршрутов – это первый хайк на маршрут'
        : `подставлено: ${t.source}${t.from ? ' от ' + dateLabel(t.from) : ''}. после сохранения эти поля станут шаблоном маршрута`;
}

async function onRouteChange(value) {
    const d = draft;
    if (value === '__gpx') {
        d.routeMode = 'gpx';
        d.route_id = '';
        d.templateNote = '';
        return render();
    }
    if (!value) {
        d.routeMode = d.track ? 'gpx' : 'none';
        d.route_id = '';
        return render();
    }
    d.routeMode = 'catalog';
    d.route_id = value;
    if (d.track) { d.track = null; d.trackStats = null; d.trackChanged = true; } // трек возьмём из каталога
    // у нового хайка подставляем сразу; у существующего – спрашиваем, чтобы не затереть тексты
    const fill = !d.original || await confirmAsync('Подставить тексты и поля из шаблона этого маршрута? Текущие заменятся.');
    if (fill) {
        d.templateNote = 'загружаю шаблон…';
        render();
        try { await loadTemplates(); } catch (e) {}
        applyTemplate(value);
    }
    render();
}

function trackSectionHtml(d) {
    if (d.routeMode === 'catalog') {
        const route = routeById(d.route_id);
        const km = routeKm(route);
        return `<div class="adm-track">
            <div class="adm-track-stats"><b>${esc(route?.title || 'маршрут')}</b>${km ? ` · ${km} км` : ''} · трек из каталога</div>
            <div class="adm-map" id="admMap"></div>
            <div class="adm-hint">другой трек? выберите «свой маршрут (GPX)» в списке маршрутов</div>
        </div>`;
    }
    const stats = d.trackStats;
    return `<div class="adm-track">
        ${stats ? `<div class="adm-track-stats"><b>${stats.km ?? '–'} км</b>${stats.gain != null ? ` · набор ${stats.gain} м` : ''} · ${stats.points} точек${d.trackChanged ? ' · <span class="adm-new">новый, не сохранён</span>' : ''}</div>
            <div class="adm-map" id="admMap"></div>` : `<div class="adm-hint">${d.routeMode === 'gpx' ? 'загрузите GPX – в календаре и слайдере хайка появится 3D-карта' : 'выберите маршрут из списка выше или загрузите GPX нового маршрута'}</div>`}
        <div class="adm-track-actions">
            <label class="adm-ghost adm-file">${stats ? 'заменить GPX' : 'загрузить GPX'}<input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" id="admGpx" hidden></label>
            ${stats ? '<button class="adm-link is-danger" id="admTrackRemove">убрать трек</button>' : ''}
            ${stats && stats.km && !/\d\s*км/.test(d.tags) ? `<button class="adm-link" id="admKmTag">+ «${stats.km} км» в теги</button>` : ''}
        </div>
    </div>`;
}

// ---------- редактор хайка ----------
function openEditor(date) {
    const h = date ? { ...(state.hikesData[date] || {}), date } : null;
    draft = h ? {
        original: date,
        date,
        title: h.title || '',
        emoji: h.emoji || '',
        start_time: h.start_time || '',
        tags: tagsText(h),
        image: h.image || '',
        features: h.features || '',
        access: h.access || '',
        details: h.details || '',
        location_link: h.location_link || '',
        report_link: h.report_link || '',
        cancelled: isYes(h.cancelled),
        woman: isYes(h.woman),
        city: isYes(h.city),
        track: h.track || null,
        trackChanged: false,
        trackStats: h.track ? { km: h.track.km, gain: h.track.gain, points: h.track.coords.length } : null,
        // свой GPX важнее; иначе явный route_id или угаданный по названию маршрут каталога
        route_id: h.track ? '' : (h.route_id || findCatalogRoute(h)?.id || ''),
        routeMode: h.track ? 'gpx' : ((h.route_id || findCatalogRoute(h)) ? 'catalog' : 'none'),
        templateNote: ''
    } : {
        original: '', date: '', title: '', emoji: '', start_time: '12:00', tags: '', image: '',
        features: '', access: '', details: '', location_link: '', report_link: '',
        cancelled: false, woman: false, city: false, track: null, trackChanged: false, trackStats: null,
        route_id: '', routeMode: 'none', templateNote: ''
    };
    view = { tab: 'hikes', sub: 'edit' };
    render();
}

function renderEditor(body) {
    const d = draft;
    const field = (key, label, attrs = '') => `<label class="adm-field"><span>${label}</span><input data-k="${key}" value="${esc(d[key])}" ${attrs}></label>`;
    const area = (key, label, rows = 4) => `<label class="adm-field"><span>${label}</span><textarea data-k="${key}" rows="${rows}">${esc(d[key])}</textarea></label>`;
    const check = (key, label) => `<label class="adm-check"><input type="checkbox" data-k="${key}" ${d[key] ? 'checked' : ''}><span>${label}</span></label>`;
    const stats = d.trackStats;
    body.innerHTML = `
        <button class="adm-back">‹ все хайки</button>
        <div class="adm-h1">${d.original ? esc(d.title || 'заглушка ' + dateLabel(d.original)) : 'новый хайк'}</div>
        <label class="adm-field"><span>маршрут</span><select id="admRoute">
            <option value="">— выберите маршрут —</option>
            ${catalogRoutes().map(r => `<option value="${esc(r.id)}" ${d.routeMode === 'catalog' && String(d.route_id) === String(r.id) ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}
            <option value="__gpx" ${d.routeMode === 'gpx' ? 'selected' : ''}>свой маршрут (GPX)</option>
        </select></label>
        ${d.templateNote ? `<div class="adm-note">${esc(d.templateNote)}</div>` : ''}
        ${field('date', 'дата', 'type="date"')}
        <div id="admDateNote">${dateNoteHtml()}</div>
        ${field('title', 'название', 'placeholder="хайк на Ай-Петри"')}
        <div class="adm-hint">без названия событие показывается заглушкой:</div>
        <div class="adm-chips">${PLACEHOLDER_EMOJI.map(([e, l]) => `<button class="adm-chip${d.emoji === e ? ' is-on' : ''}" data-emoji="${e}">${l}</button>`).join('')}</div>
        ${field('start_time', 'время старта', 'placeholder="12:00" inputmode="numeric"')}
        ${field('tags', 'теги через запятую', 'placeholder="умеренно, 10 км, 4-5 часов, без пропуска"')}

        <div class="adm-label">🗺 трек маршрута</div>
        ${trackSectionHtml(d)}

        <div class="adm-label">описание</div>
        ${field('image', 'картинка (ссылка)', 'placeholder="https://i.postimg.cc/…"')}
        ${d.image ? `<img class="adm-img" src="${esc(d.image)}" alt="">` : ''}
        ${area('features', 'о маршруте', 5)}
        ${area('access', 'как добраться', 4)}
        ${area('details', 'детали', 3)}
        ${field('location_link', 'точка сбора (ссылка на карту)')}
        ${field('report_link', 'отчёт (ссылка на пост)', 'placeholder="https://t.me/yaltahiking/…"')}
        <div class="adm-checks">${check('cancelled', 'отменён')}${check('woman', 'женский хайк')}${check('city', 'городское событие')}</div>

        <button class="btn btn-yellow adm-primary adm-save" id="admSave">сохранить</button>
        <div class="adm-error" id="admSaveError" hidden></div>
        ${d.original ? `<div class="adm-label">участники</div><div id="admPeople" class="adm-hint">загружаю…</div>` : ''}`;

    body.querySelector('.adm-back').addEventListener('click', () => { haptic(); view = { tab: 'hikes' }; render(); });
    body.querySelectorAll('[data-k]').forEach(inp => {
        const k = inp.dataset.k;
        // iOS для даты шлёт только change, поэтому слушаем оба события
        const sync = () => {
            d[k] = inp.type === 'checkbox' ? inp.checked : inp.value;
            if (k === 'date') {
                const note = body.querySelector('#admDateNote');
                if (note) { note.innerHTML = dateNoteHtml(); bindDateNote(note); }
            }
        };
        inp.addEventListener('input', sync);
        inp.addEventListener('change', sync);
        if (k === 'image') inp.addEventListener('change', () => render());
    });
    bindDateNote(body.querySelector('#admDateNote'));
    body.querySelectorAll('[data-emoji]').forEach(b => b.addEventListener('click', () => {
        haptic();
        d.emoji = d.emoji === b.dataset.emoji ? '' : b.dataset.emoji;
        render();
    }));
    body.querySelector('#admRoute').addEventListener('change', e => onRouteChange(e.target.value));
    body.querySelector('#admGpx')?.addEventListener('change', e => onGpxFile(e.target.files && e.target.files[0]));
    body.querySelector('#admTrackRemove')?.addEventListener('click', () => {
        haptic();
        d.track = null; d.trackStats = null; d.trackChanged = true;
        render();
    });
    body.querySelector('#admKmTag')?.addEventListener('click', () => {
        haptic();
        const km = `${d.trackStats.km} км`;
        d.tags = d.tags.trim() ? d.tags.replace(/^([^,]*)(,|$)/, `$1, ${km}$2`) : km;
        render();
    });
    body.querySelector('#admSave').addEventListener('click', saveHike);
    const mapEl = body.querySelector('#admMap');
    const previewTrack = d.routeMode === 'catalog' ? catalogRouteTrack(routeById(d.route_id)) : d.track;
    if (mapEl && previewTrack) previewHikeTrack(mapEl, previewTrack).catch(() => { mapEl.textContent = 'карта не загрузилась'; });
    if (d.original) loadPeople(body.querySelector('#admPeople'), d.original);
}

// Что уже стоит на выбранной дате: заглушку новый хайк заменит, настоящий хайк – предлагаем открыть.
function dateNoteHtml() {
    const d = draft;
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || d.date === d.original) return '';
    const existing = state.hikesData && state.hikesData[d.date];
    if (!existing) return '';
    if (existing.title && String(existing.title).trim()) {
        return `<div class="adm-note is-warn">на эту дату уже есть «${esc(existing.title)}» <button class="adm-link" data-open-date="${d.date}">открыть его</button></div>`;
    }
    return `<div class="adm-note">на эту дату стоит заглушка ${esc(existing.emoji || '⛰️')} – хайк её заменит</div>`;
}

function bindDateNote(el) {
    el?.querySelector('[data-open-date]')?.addEventListener('click', e => {
        haptic();
        openEditor(e.currentTarget.dataset.openDate);
    });
}

function showSaveError(text) {
    const el = root?.querySelector('#admSaveError');
    if (!el) return toast(text, true);
    el.textContent = text;
    el.hidden = false;
}

async function onGpxFile(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const { track, stats } = parseGpx(text);
        draft.track = track;
        draft.trackStats = stats;
        draft.trackChanged = true;
        draft.routeMode = 'gpx';
        draft.route_id = '';
        haptic();
        render();
    } catch (err) {
        toast(err.message || 'не удалось прочитать GPX', true);
    }
}

async function saveHike() {
    const d = draft;
    const errEl = root.querySelector('#admSaveError');
    if (errEl) errEl.hidden = true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return showSaveError('укажите дату');
    if (d.start_time && !/^\d{1,2}:\d{2}$/.test(d.start_time.trim())) return showSaveError('время – в формате 12:00');
    const clash = state.hikesData && state.hikesData[d.date];
    if (d.date !== d.original && clash && clash.title && String(clash.title).trim()) {
        return showSaveError(`на ${dateLabel(d.date)} уже есть «${clash.title}» – откройте его из списка или выберите другую дату`);
    }
    const btn = root.querySelector('#admSave');
    btn.disabled = true;
    btn.textContent = 'сохраняю…';
    const fields = {
        title: d.title.trim(),
        emoji: d.title.trim() ? '' : d.emoji,
        start_time: d.start_time.trim(),
        tags: d.tags.split(',').map(t => t.trim()).filter(Boolean),
        image: d.image.trim(),
        features: d.features,
        access: d.access,
        details: d.details,
        location_link: d.location_link.trim(),
        report_link: d.report_link.trim(),
        cancelled: d.cancelled,
        woman: d.woman,
        city: d.city
    };
    fields.route_id = d.routeMode === 'catalog' ? String(d.route_id) : '';
    if (d.trackChanged) fields.track = d.routeMode === 'catalog' ? null : d.track;
    try {
        const res = await adminCall('adminSaveHike', { date: d.date, original_date: d.original, fields: JSON.stringify(fields) });
        // Firebase-подписка обновит хайки сама; подставляем локально, чтобы список сразу был свежим
        if (fields.route_id && templates) templates[fields.route_id] = { ...fields, from_date: d.date };
        const base = state.hikesData[d.original] || {};
        const local = { ...base, ...fields, track: d.trackChanged ? d.track : base.track };
        if (d.original && d.original !== d.date) delete state.hikesData[d.original];
        state.hikesData[d.date] = local;
        toast(res.notified ? `сохранено ✓ · уведомили о записи: ${res.notified}` : 'сохранено ✓');
        view = { tab: 'hikes' };
        render();
    } catch (err) {
        showSaveError('не сохранилось: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'сохранить';
    }
}

async function loadPeople(el, date) {
    if (!el) return;
    try {
        const { participants, waitlist = [] } = await adminCall('adminParticipants', { date });
        if (!root || !el.isConnected) return;
        const booked = participants.filter(p => p.in_app || p.status === 'booked');
        const waiting = waitlist.filter(w => !w.notified);
        // кто просил сообщить об открытии записи – для заглушки это главное
        const waitHtml = waitlist.length
            ? `<div class="adm-note">🔔 ждут открытия записи: <b>${waiting.length}</b>${waitlist.length > waiting.length ? ` (уже уведомили: ${waitlist.length - waiting.length})` : ''}${waiting.length ? '<br>как только дадите название и сохраните, им придёт сообщение с кнопкой на этот хайк' : ''}</div>`
            : '';
        if (!booked.length) { el.className = 'adm-people'; el.innerHTML = waitHtml + '<div class="adm-hint">пока никто не записался</div>'; return; }
        el.className = 'adm-people';
        el.innerHTML = waitHtml + `<div class="adm-hint">записались: ${booked.length}</div>` + booked.map(p => {
            const kind = /^(yes|true|да|1)$/i.test(String(p.has_card || '').trim()) || /card|карт/i.test(p.purchase) ? 'карта' : /ticket|билет/i.test(p.purchase) ? 'билет' : '';
            return `<div class="adm-person">
                <span class="adm-person-name">${esc(p.name || 'без имени')}${kind ? ` <span class="adm-flag">${kind}</span>` : ''}</span>
                ${p.username ? `<button class="adm-link" data-tg="${esc(p.username)}">@${esc(p.username)}</button>` : '<span class="adm-muted">нет username</span>'}
            </div>`;
        }).join('') + `<button class="adm-ghost adm-wide" id="admWriteHike">📨 написать участникам</button>`;
        el.querySelectorAll('[data-tg]').forEach(b => b.addEventListener('click', () => {
            const url = 'https://t.me/' + b.dataset.tg;
            if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
        }));
        el.querySelector('#admWriteHike').addEventListener('click', () => {
            haptic();
            bc = { ...(bc || newBroadcast()), segment: 'hike', hikeDate: date };
            view = { tab: 'broadcast' };
            render();
        });
    } catch (err) {
        el.textContent = 'не удалось загрузить: ' + err.message;
    }
}

// ---------- GPX ----------
function haversine(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

// Рамер–Дуглас–Пекер в метрах (локальная проекция), итеративно – без рекурсии на длинных треках.
function simplify(points, eps) {
    const lat0 = points[0][0] * Math.PI / 180;
    const xy = points.map(p => [p[1] * 111320 * Math.cos(lat0), p[0] * 110540]);
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop();
        const [x1, y1] = xy[s], [x2, y2] = xy[e];
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
        let maxD = 0, idx = -1;
        for (let i = s + 1; i < e; i++) {
            const dist = Math.abs(dy * xy[i][0] - dx * xy[i][1] + x2 * y1 - y2 * x1) / len;
            if (dist > maxD) { maxD = dist; idx = i; }
        }
        if (maxD > eps && idx !== -1) {
            keep[idx] = 1;
            stack.push([s, idx], [idx, e]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

export function parseGpx(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('файл не похож на GPX');
    let nodes = [...doc.getElementsByTagName('trkpt')];
    if (nodes.length < 2) nodes = [...doc.getElementsByTagName('rtept')];
    if (nodes.length < 2) throw new Error('в GPX нет точек трека');
    const raw = nodes.map(n => [
        parseFloat(n.getAttribute('lat')),
        parseFloat(n.getAttribute('lon')),
        parseFloat(n.getElementsByTagName('ele')[0]?.textContent)
    ]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (raw.length < 2) throw new Error('в GPX нет координат');

    let meters = 0;
    for (let i = 1; i < raw.length; i++) meters += haversine(raw[i - 1], raw[i]);
    // набор высоты с порогом 3 м, чтобы шум GPS не накручивал метры
    let gain = null;
    const eles = raw.map(p => p[2]).filter(Number.isFinite);
    if (eles.length > 1) {
        gain = 0;
        let base = eles[0];
        for (const e of eles) {
            if (e - base > 3) { gain += e - base; base = e; } else if (base - e > 3) base = e;
        }
        gain = Math.round(gain);
    }

    let pts = raw;
    let eps = 2;
    while (pts.length > TRACK_MAX_POINTS && eps < 500) {
        pts = simplify(raw, eps);
        eps *= 1.5;
    }
    const coords = pts.map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
    const km = Math.round(meters / 100) / 10;
    const closed = haversine(raw[0], raw[raw.length - 1]) < 250;
    return {
        track: { loop: true, closed, coords, km, gain, src: 'gpx' },
        stats: { km, gain, points: coords.length, raw: raw.length }
    };
}

// ---------- рассылка ----------
function newBroadcast() {
    return { segment: 'all', hikeDate: '', text: '', btnType: 'app', section: 'calendar', btnHike: '', url: '', btnText: '▶ открыть', count: null };
}

function renderBroadcast(body) {
    bc = bc || newBroadcast();
    const today = todayStr();
    const titled = allHikes().filter(h => h.title && h.title.trim());
    const upcoming = titled.filter(h => h.date >= today);
    const recent = titled.filter(h => h.date < today).reverse().slice(0, 6);
    const hikeOptions = sel => [...upcoming, ...recent].map(h => `<option value="${h.date}" ${sel === h.date ? 'selected' : ''}>${dateLabel(h.date)} – ${esc(h.title)}</option>`).join('');
    if (bc.segment === 'hike' && !bc.hikeDate) bc.hikeDate = (upcoming[0] || recent[0] || {}).date || '';
    if (bc.btnType === 'app' && bc.section === 'hike' && !bc.btnHike) bc.btnHike = (upcoming[0] || recent[0] || {}).date || '';
    const c = audience && audience.counts;
    const n = k => c ? ` · ${c[k]}` : '';
    const segs = [['all', 'всем' + n('all')], ['guests', 'гостям' + n('guests')], ['members', 'владельцам карт' + n('members')], ['hike', 'участникам хайка']];

    body.innerHTML = `
        <div class="adm-label">кому</div>
        <div class="adm-chips">${segs.map(([k, l]) => `<button class="adm-chip${bc.segment === k ? ' is-on' : ''}" data-seg="${k}">${l}</button>`).join('')}</div>
        ${bc.segment === 'hike' ? `<label class="adm-field"><span>хайк</span><select id="admBcHike">${hikeOptions(bc.hikeDate)}</select></label>` : ''}
        <div class="adm-count" id="admCount">${bc.count == null ? 'считаю получателей…' : `получат: <b>${bc.count}</b> чел.`}</div>

        <label class="adm-field"><span>текст</span><textarea id="admBcText" rows="7" placeholder="привет, [имя]! …">${esc(bc.text)}</textarea></label>
        <div class="adm-hint">[имя] заменится именем. можно &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;a href="…"&gt;ссылка&lt;/a&gt;</div>

        <div class="adm-label">кнопка под сообщением</div>
        <div class="adm-chips">${[['app', 'раздел приложения'], ['url', 'ссылка / пост'], ['none', 'без кнопки']].map(([k, l]) => `<button class="adm-chip${bc.btnType === k ? ' is-on' : ''}" data-btn="${k}">${l}</button>`).join('')}</div>
        ${bc.btnType === 'app' ? `<label class="adm-field"><span>куда ведёт</span><select id="admBcSection">${APP_SECTIONS.map(([k, l]) => `<option value="${k}" ${bc.section === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${bc.section === 'hike' ? `<label class="adm-field"><span>какой хайк</span><select id="admBcBtnHike">${hikeOptions(bc.btnHike)}</select></label>` : ''}` : ''}
        ${bc.btnType === 'url' ? `<label class="adm-field"><span>ссылка</span><input id="admBcUrl" value="${esc(bc.url)}" placeholder="https://t.me/yaltahiking/450"></label>` : ''}
        ${bc.btnType !== 'none' ? `<label class="adm-field"><span>текст кнопки</span><input id="admBcBtnText" value="${esc(bc.btnText)}"></label>` : ''}

        <div class="adm-label">так увидят</div>
        <div class="adm-preview" id="admPreview"></div>

        <button class="adm-ghost adm-wide" id="admBcTest">отправить себе</button>
        <button class="btn btn-yellow adm-primary" id="admBcSend">отправить</button>`;

    const update = () => { renderPreview(); updateSendLabel(); };
    body.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => {
        haptic();
        bc.segment = b.dataset.seg;
        bc.count = bc.segment !== 'hike' && audience ? audience.counts[bc.segment] : null;
        render();
    }));
    body.querySelectorAll('[data-btn]').forEach(b => b.addEventListener('click', () => { haptic(); bc.btnType = b.dataset.btn; render(); }));
    body.querySelector('#admBcHike')?.addEventListener('change', e => { bc.hikeDate = e.target.value; bc.count = null; render(); });
    body.querySelector('#admBcSection')?.addEventListener('change', e => { bc.section = e.target.value; render(); });
    body.querySelector('#admBcBtnHike')?.addEventListener('change', e => { bc.btnHike = e.target.value; update(); });
    body.querySelector('#admBcText').addEventListener('input', e => { bc.text = e.target.value; update(); });
    body.querySelector('#admBcUrl')?.addEventListener('input', e => { bc.url = e.target.value; update(); });
    body.querySelector('#admBcBtnText')?.addEventListener('input', e => { bc.btnText = e.target.value; update(); });
    body.querySelector('#admBcTest').addEventListener('click', () => sendBroadcast(true));
    body.querySelector('#admBcSend').addEventListener('click', () => sendBroadcast(false));
    update();
    if (bc.count == null) refreshCount();
}

// Цифры по группам грузим одним запросом и держим минуту – переключение групп мгновенное.
async function loadAudience(force = false) {
    if (!force && audience && Date.now() - audience.at < 60000) return audience.counts;
    const { counts } = await adminCall('adminAudience');
    audience = { counts, at: Date.now() };
    return counts;
}

function buttonPayload() {
    if (bc.btnType === 'none') return null;
    const text = bc.btnText.trim() || '▶ открыть';
    if (bc.btnType === 'url') return { type: 'url', url: bc.url.trim(), text };
    const startapp = bc.section === 'hike' ? (bc.btnHike ? 'hike_' + bc.btnHike : '') : bc.section;
    return { type: 'app', startapp, text };
}

function renderPreview() {
    const el = root?.querySelector('#admPreview');
    if (!el) return;
    const name = state.user?.first_name || 'друг';
    // превью: разрешаем только теги, которые понимает Telegram
    const html = esc(bc.text.replace(/\[имя\]/gi, name))
        .replace(/&lt;(\/?)(b|i|u|s|code)&gt;/g, '<$1$2>')
        .replace(/&lt;a href=&quot;([^"&]*)&quot;&gt;/g, '<a>').replace(/&lt;\/a&gt;/g, '</a>')
        .replace(/\n/g, '<br>');
    const btn = buttonPayload();
    el.innerHTML = `<div class="adm-bubble">${html || '<span class="adm-muted">текст сообщения</span>'}</div>${btn ? `<div class="adm-bubble-btn">${esc(btn.text)}</div>` : ''}`;
}

function updateSendLabel() {
    const b = root?.querySelector('#admBcSend');
    if (b) b.textContent = bc.count ? `отправить (${bc.count} чел.)` : 'отправить';
}

let countSeq = 0;
async function refreshCount() {
    const seq = ++countSeq;
    const hadAudience = !!audience;
    let failed = '';
    try {
        if (bc.segment === 'hike') {
            const { count } = await adminCall('adminBroadcastCount', { segment: 'hike', hike_date: bc.hikeDate });
            if (seq !== countSeq) return;
            bc.count = count;
        } else {
            const counts = await loadAudience();
            if (seq !== countSeq) return;
            bc.count = counts[bc.segment] ?? 0;
        }
    } catch (err) {
        if (seq !== countSeq) return;
        bc.count = null;
        failed = err.message;
    }
    // первая загрузка цифр – перерисуем, чтобы они появились и на кнопках групп
    if (!hadAudience && audience && root && view.tab === 'broadcast' && !view.sub) return render();
    const el = root?.querySelector('#admCount');
    if (el) el.innerHTML = failed
        ? `<span class="adm-error-inline">не удалось посчитать: ${esc(failed)}</span> <button class="adm-link" id="admRecount">ещё раз</button>`
        : `получат: <b>${bc.count}</b> чел.`;
    el?.querySelector('#admRecount')?.addEventListener('click', () => { el.textContent = 'считаю получателей…'; refreshCount(); });
    updateSendLabel();
}

async function sendBroadcast(test) {
    if (!bc.text.trim()) return toast('напишите текст', true);
    const btn = buttonPayload();
    if (btn && btn.type === 'url' && !/^https:\/\//.test(btn.url)) return toast('ссылка должна начинаться с https://', true);
    if (btn && btn.type === 'app' && !btn.startapp) return toast('выберите, куда ведёт кнопка', true);
    if (!test) {
        if (!bc.count) return toast('некому отправлять', true);
        const ok = await confirmAsync(`Отправить сообщение: ${bc.count} чел.? Отменить будет нельзя.`);
        if (!ok) return;
    }
    const el = root.querySelector(test ? '#admBcTest' : '#admBcSend');
    const label = el.textContent;
    el.disabled = true;
    el.textContent = test ? 'отправляю…' : 'отправляю… не закрывайте';
    try {
        const res = await adminCall('adminBroadcast', {
            segment: test ? 'test' : bc.segment,
            hike_date: bc.hikeDate,
            text: bc.text.trim(),
            button: JSON.stringify(btn)
        });
        haptic();
        if (test) toast(res.sent ? 'пришло вам в бот ✓' : 'не дошло – откройте бота и нажмите /start', !res.sent);
        else {
            toast(`доставлено ${res.sent} из ${res.total}`);
            audience = null;
            bc = { ...newBroadcast(), count: null };
            render();
            return;
        }
    } catch (err) {
        toast(err.message, true);
    }
    el.disabled = false;
    el.textContent = label;
}

function confirmAsync(text) {
    return new Promise(resolve => {
        if (tg?.showConfirm) {
            try { tg.showConfirm(text, ok => resolve(!!ok)); return; } catch (e) {}
        }
        resolve(window.confirm(text));
    });
}
