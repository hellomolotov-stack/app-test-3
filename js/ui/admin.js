// js/ui/admin.js – админка клуба: хайки (создание, правка, GPX-трек, участники) и рассылки.
// Кнопку видят только ADMIN_USERNAMES, но это лишь удобство: каждое действие сервер
// (Apps Script, handleAdmin) проверяет по подписи Telegram initData.
import { state } from '../state.js';
import { haptic, tg } from '../utils.js';
import { REGISTRATION_API_URL } from '../config.js';
import { loadAllParticipants } from '../firebase.js';
import { previewHikeTrack, findCatalogRoute, catalogRouteTrack } from './calendar.js';
import { loadClubContent, applyClubContent, saveClubContent } from '../club-content.js';
import { renderAdmissionAdmin } from './admission-admin.js';

const ADMIN_USERNAMES = new Set(['maxmolotov', 'hellointelligent']);
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const PLACEHOLDER_EMOJI = [
    ['⛰️', '⛰️ готовим хайк'],
    ['🌧️', '🌧️ дата перенесена'],
    ['🏄🏻‍♂️', '🏄🏻‍♂️ готовим событие']
];
// эмоджи городского события – видно в ленте календаря вместо 🥂
const CITY_EMOJI = ['🥂', '🍷', '🍕', '🥧', '🧁', '🍰', '🎂', '🍩', '🍪', '🥐', '🍫', '🍓', '🍎', '🍷', '🍸', '🍹', '🫖', '☕', '🍽️', '🍳', '🥗', '🍣', '🌮', '🍔', '🧀', '🍇', '🎬', '🎨', '🎤', '🎶', '🎸', '📚', '✍️', '🧘', '🏓', '🎲', '♟️', '🧩', '🔥', '💃', '🌊', '🏖️', '🌅', '🎭', '🧠', '🎉', '🕯️', '🌿'].filter((e, i, a) => a.indexOf(e) === i);
const APP_SECTIONS = [
    ['calendar', 'календарь'],
    ['hike', 'конкретный хайк'],
    ['card', 'карта интеллигента'],
    ['privileges', 'привилегии'],
    ['bookings', 'мои записи'],
    ['routes', 'маршруты на карте'],
    ['updates', 'обновления'],
    ['profiles', 'профили'],
    ['bot', 'чат-помощник'],
    ['buy_card', 'покупка карты'],
    ['card_offer', 'спецпредложение карты'],
    ['newcomer', 'как проходит первый хайк']
];

// Сегменты рассылки (считает сервер, см. computeSegments_ в Apps Script) и подсказки к ним:
// цель сообщения, рекомендуемая кнопка и шаблон текста. Шаблон – отправная точка, его правят перед отправкой.
const SEGMENT_GROUPS = [
    ['основные', [['all', 'всем'], ['guests', 'гостям'], ['members', 'владельцам карт'], ['hike', 'участникам хайка']]],
    ['по свежести', [['active7', 'заходили за 7 дней'], ['new7', 'новые за неделю'], ['cold14', 'не заходили 14–30 дней'], ['gone30', 'не заходили 30+ дней']]],
    ['по активности', [['frequent', 'часто заходят'], ['once', 'заглянули один раз'], ['engaged', 'активные'], ['skimmers', 'просто заскочили']]],
    ['путь к хайку', [['never_booked', 'ни разу не записывались'], ['viewed_hike7', 'смотрели хайк, не записались'], ['unpaid', 'начали оплату, не закончили'], ['one_and_gone', 'были раз и пропали'], ['regular_no_card', 'ходят без карты 2+ раз'], ['upcoming', 'записаны на хайк']]],
    ['карта', [['viewed_card', 'смотрели карту, не купили'], ['offer_unused', 'спецпредложение не использовали']]],
    ['служебные', [['waitlist_date', 'ждут запись на дату'], ['waitlist', 'в листе ожидания (все даты)'], ['admission', 'анкета: ждут ответа или одобрены']]],
];
const ASK_URL = 'https://t.me/hellointelligent';
const CHAT_URL = 'https://t.me/yaltahikingchat';   // общий чат клуба – кнопка «общий чат» и сбор отзывов
const SEGMENT_TIPS = {
    active7: { goal: 'позвать на ближайший хайк, пока интерес тёплый', btn: { type: 'app', section: 'hike', text: 'посмотреть хайк' },
        text: '[имя], привет 🤍 [дата] идём на [название хайка]. если давно хотел выбраться в горы – это хороший повод. детали и точка сбора по кнопке' },
    new7: { goal: 'мягко познакомить и снять страх первого раза', btn: { type: 'app', section: 'newcomer', text: 'как проходит первый хайк' },
        text: '[имя], рады, что ты заглянул 🤍 если интересно, как проходит первый хайк и что взять с собой – собрали всё в одном месте. никаких обязательств, просто посмотри' },
    cold14: { goal: 'вернуть через новость', btn: { type: 'app', section: 'calendar', text: 'открыть календарь' },
        text: '[имя], давно не виделись 🤍 за это время в календаре появились новые маршруты и пара событий в городе. загляни – может, что-то откликнется' },
    gone30: { goal: 'сильный повод вернуться', btn: { type: 'app', section: 'updates', text: 'что нового' },
        text: '[имя], привет! мы тут немного выросли: новые маршруты, мастермайнды на вершинах и клубные вечера. если горы всё ещё зовут – мы на месте 🤍' },
    frequent: { goal: 'превратить интерес в первый шаг', btn: { type: 'app', section: 'hike', text: 'записаться' },
        text: '[имя], видим, что ты часто заглядываешь 🤍 похоже, пора уже не смотреть, а идти. ближайший хайк – [название хайка], [дата]. мы подождём на старте' },
    once: { goal: 'дать второй шанс и коротко объяснить, кто мы', btn: { type: 'app', section: 'calendar', text: 'узнать о клубе' },
        text: '[имя], ты как-то заглядывал к нам. коротко: мы не про походы, а про знакомства – с деятельными и близкими по духу людьми, на вершинах южного берега. загляни ещё раз 🤍' },
    engaged: { goal: 'спросить, что мешает', btn: { type: 'url', url: ASK_URL, text: 'написать нам' },
        text: '[имя], ты уже хорошо изучил приложение 🙂 если что-то останавливает перед первым хайком – напиши, ответим лично. часто всё решается одним сообщением' },
    skimmers: { goal: 'одна простая причина зайти', btn: { type: 'app', section: 'hike', text: 'посмотреть ближайший хайк' },
        text: '[имя], [дата] идём на [название хайка]. тишина и люди, с которыми есть о чём поговорить. детали по кнопке 🤍' },
    never_booked: { goal: 'снять барьер первого раза', btn: { type: 'app', section: 'hike', text: 'записаться на хайк' },
        text: '[имя], первый хайк – самый волнительный. поэтому мы идём в темпе группы, ждём каждого и знакомим на старте. ближайший – [название хайка], [дата] 🤍' },
    viewed_hike7: { goal: 'дожать конкретный хайк', btn: { type: 'app', section: 'hike', text: 'вернуться к хайку' },
        text: '[имя], ты смотрел [название хайка]. места ещё есть – если хочешь пойти, запись по кнопке. если остались вопросы – просто ответь на это сообщение' },
    unpaid: { goal: 'помочь, если что-то сломалось при оплате', btn: { type: 'app', section: 'hike', text: 'завершить запись' },
        text: '[имя], видим, что ты начал оформлять запись, но не закончил. если что-то пошло не так с оплатой – напиши, поможем. а если просто отвлёкся – кнопка ниже 🤍' },
    one_and_gone: { goal: 'вернуть на второй хайк', btn: { type: 'app', section: 'calendar', text: 'выбрать хайк' },
        text: '[имя], как ты после хайка с нами? второй хайк обычно ещё лучше – ты уже знаешь людей. в календаре новые маршруты, загляни 🤍' },
    regular_no_card: { goal: 'предложить карту', btn: { type: 'app', section: 'buy_card', text: 'узнать о карте' },
        text: '[имя], ты уже не раз ходил с нами 🤍 с картой интеллигента все хайки сезона без билетов, закрытые события и свой +1 на хайк. посмотри – возможно, она уже выгоднее' },
    upcoming: { goal: 'напомнить и подготовить', btn: { type: 'app', section: 'bookings', text: 'детали хайка' },
        text: '[имя], до хайка на [название хайка] осталось совсем немного 🏔 старт в [время], точка сбора и что взять – по кнопке. до встречи на тропе' },
    members: { goal: 'новости для своих', btn: { type: 'app', section: 'privileges', text: 'привилегии' },
        text: '[имя], для своих новости 🤍 [что нового: событие, партнёр, мастермайнд]. всё по кнопке' },
    viewed_card: { goal: 'ответить на сомнения', btn: { type: 'url', url: ASK_URL, text: 'задать вопрос' },
        text: '[имя], ты смотрел карту интеллигента. если есть вопросы – что входит, окупится ли, можно ли подарить – напиши, расскажем лично' },
    offer_unused: { goal: 'мягко напомнить, без давления', btn: { type: 'app', section: 'card_offer', text: 'открыть предложение' },
        text: '[имя], напоминаем: твоё предложение на карту интеллигента ещё действует. если не сейчас – ничего страшного, мы всё равно рады тебе на тропе 🤍' },
    waitlist: { goal: 'сообщить, что запись открыта', btn: { type: 'app', section: 'hike', text: 'записаться' },
        text: '[имя], открыли запись на [название хайка], [дата] 🏔 ты просил сообщить – сообщаем. мест 10, запись по кнопке' },
    admission: { goal: 'довести до первой записи', btn: { type: 'app', section: 'hike', text: 'выбрать хайк' },
        text: '[имя], мы прочитали анкету – рады знакомству 🤍 ближайший хайк – [название хайка], [дата]. запись по кнопке' },
};
const RU_MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
// ближайший хайк для подстановки в шаблон
function nearestTitledHike() {
    const today = todayStr();
    return allHikes().filter(h => h.title && h.title.trim() && h.date >= today && !isYes(h.city) && !isYes(h.cancelled)).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}
function fillTemplate(text) {
    const h = nearestTitledHike();
    if (!h) return text;
    const d = new Date(h.date + 'T12:00:00');
    return text.replace(/\[название хайка\]/g, h.title.trim()).replace(/\[дата\]/g, `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`)
        .replace(/\[время\]/g, h.start_time || '[время]');
}
function applyTip(key) {
    const tip = SEGMENT_TIPS[key];
    if (!tip) return;
    bc.text = fillTemplate(tip.text);
    bc.btnType = tip.btn.type;
    bc.btnText = tip.btn.text;
    if (tip.btn.type === 'url') bc.url = tip.btn.url;
    if (tip.btn.type === 'app') {
        bc.section = tip.btn.section;
        if (bc.section === 'hike') bc.btnHike = nearestTitledHike()?.date || bc.btnHike;
    }
    bc.tipApplied = key;
}
const TRACK_MAX_POINTS = 400;

let root = null;
let view = { tab: 'hikes' };
let draft = null;       // редактируемый хайк
let bc = null;          // черновик рассылки
let pastLimit = 8;
let audience = null;     // { segments: {ключ: [id]}, people: {id: {n,u,lo,od,p,f,m}}, now, at, hikeDate }
let templates = null;    // route_templates с сервера: { route_id: {поля хайка} }
let templatesLoading = null;
let homepage = null;
let homepageLoading = false;
let updateDraft = null;
let homepageBusy = false;

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
    homepage = null;
    updateDraft = null;
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
    // запрос не должен висеть вечно (кнопка «сохраняю…» навсегда): через 45 с – понятная ошибка
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), 45000);
    let resp;
    try { resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params, signal: ctrl?.signal }); }
    catch (e) { throw new Error(e?.name === 'AbortError' ? 'сервер не ответил за 45 секунд – попробуй ещё раз' : 'нет связи с сервером: ' + (e?.message || e)); }
    finally { clearTimeout(timer); }
    let json;
    try { json = JSON.parse(await resp.text()); } catch (e) { throw new Error('сервер ответил не JSON (код ' + resp.status + ')'); }
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
// перерисовка того же экрана (нажали чип, галочку, кнопку) не должна сбрасывать прокрутку –
// наверх уводим только при переходе на другой экран (вкладка, карточка хайка)
let lastScreenKey = '';
function render() {
    if (!root) return;
    const screenKey = `${view.tab}|${view.sub || ''}|${view.sub === 'edit' ? (draft?.original || 'new') : ''}`;
    const sameScreen = screenKey === lastScreenKey;
    lastScreenKey = screenKey;
    const keepTop = sameScreen ? root.scrollTop : 0;
    // пока содержимое пересоздаётся, держим высоту – иначе браузер на миг «схлопывает» страницу и прокрутка скачет
    const prevBody = root.querySelector('.adm-body');
    const holdHeight = sameScreen && prevBody ? prevBody.offsetHeight : 0;
    const tabs = [['hikes', '🏔 хайки'], ['broadcast', '📨 рассылка'], ['flows', '🔗 цепочки'], ['newcomers', '💳 продажа карты'], ['plus1', '🤝 +1'], ['pass', '🔑 место'], ['home', 'главная'], ['admissions', 'заявки']];
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
    else if (view.tab === 'flows') renderFlows(body);
    else if (view.tab === 'newcomers') renderNewcomers(body);
    else if (view.tab === 'plus1') renderPlus1(body);
    else if (view.tab === 'pass') renderPass(body);
    else if (view.tab === 'home') renderHomepage(body);
    else if (view.tab === 'admissions') renderAdmissionAdmin(body);
    else renderHikeList(body);
    if (holdHeight) {
        body.style.minHeight = holdHeight + 'px';
        // асинхронные блоки (участники, статистика) дорисуются – потом отпускаем высоту
        setTimeout(() => { if (body.isConnected) body.style.minHeight = ''; }, 1500);
    }
    root.scrollTop = keepTop;
    if (keepTop) requestAnimationFrame(() => { if (root) root.scrollTop = keepTop; });
    root.querySelector('.adm-tab.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------- главная: ручные цифры и журнал обновлений ----------
function loadHomepage() {
    if (homepageLoading) return;
    homepageLoading = true;
    loadClubContent().then(data => {
        homepage = { ...data, metrics: { ...data.metrics }, updates: data.updates.map(item => ({ ...item })) };
        applyClubContent(data);
    }).catch(error => { homepage = { error: error.message }; })
        .finally(() => { homepageLoading = false; if (root && view.tab === 'home') render(); });
}

function renderHomepage(body) {
    if (!homepage) {
        body.innerHTML = '<div class="adm-muted" role="status">загружаю данные главной…</div>';
        loadHomepage();
        return;
    }
    if (homepage.error) {
        body.innerHTML = `<div class="adm-error-inline">${esc(homepage.error)}</div><button class="adm-ghost adm-wide" id="admContentRetry">загрузить ещё раз</button>`;
        body.querySelector('#admContentRetry').addEventListener('click', () => { homepage = null; render(); });
        return;
    }
    updateDraft = updateDraft || { index: null, date: todayStr(), update: '' };
    const fields = [['hikes', 'хайков'], ['locations', 'локаций'], ['kilometers', 'километров'], ['meetings', 'знакомств']];
    body.innerHTML = `
        <div class="adm-label">клуб в цифрах</div>
        <form id="admMetricsForm">
            <div class="adm-metrics-fields">${fields.map(([key, label]) => `<label class="adm-field"><span>${label}</span><input name="${key}" data-metric-key="${key}" type="number" min="0" max="1000000000" step="${key === 'kilometers' ? 'any' : '1'}" inputmode="${key === 'kilometers' ? 'decimal' : 'numeric'}" value="${esc(homepage.metrics[key])}" required></label>`).join('')}</div>
            <button type="submit" class="btn btn-yellow adm-primary">сохранить цифры</button>
        </form>
        <div class="adm-label">обновления</div>
        <form id="admUpdateForm">
            <label class="adm-field"><span>дата</span><input id="admUpdateDate" type="date" value="${esc(updateDraft.date)}" required></label>
            <label class="adm-field"><span>что обновилось</span><textarea id="admUpdateText" rows="4" maxlength="5000" required>${esc(updateDraft.update)}</textarea></label>
            <button type="submit" class="btn btn-yellow adm-primary">${updateDraft.index === null ? 'добавить обновление' : 'сохранить обновление'}</button>
            ${updateDraft.index !== null ? '<button type="button" class="adm-link" id="admUpdateCancel">отменить редактирование</button>' : ''}
        </form>
        <div class="adm-content-updates">${homepage.updates.length ? homepage.updates.map((item, index) => `
            <div class="adm-content-update">
                <div class="adm-content-update-date">${esc(dateLabel(item.date))} · ${esc(item.date.slice(0, 4))}</div>
                <div class="adm-content-update-text">${esc(item.update)}</div>
                <div class="adm-content-update-actions"><button class="adm-link" data-edit-update="${index}">редактировать</button><button class="adm-link is-danger" data-remove-update="${index}">убрать</button></div>
            </div>`).join('') : '<div class="adm-empty">пока нет обновлений</div>'}</div>`;
    body.querySelectorAll('[data-metric-key]').forEach(input => input.addEventListener('input', () => { homepage.metrics[input.dataset.metricKey] = input.value; }));
    body.querySelector('#admUpdateDate').addEventListener('input', event => { updateDraft.date = event.target.value; });
    body.querySelector('#admUpdateText').addEventListener('input', event => { updateDraft.update = event.target.value; });
    body.querySelector('#admMetricsForm').addEventListener('submit', event => {
        event.preventDefault();
        saveHomepageSection('metrics', { ...homepage.metrics });
    });
    body.querySelector('#admUpdateForm').addEventListener('submit', event => {
        event.preventDefault();
        if (!updateDraft.update.trim()) return toast('напиши, что обновилось', true);
        const items = homepage.updates.slice();
        const item = { date: updateDraft.date, update: updateDraft.update.trim() };
        if (updateDraft.index === null) items.unshift(item);
        else items[updateDraft.index] = item;
        saveHomepageSection('updates', items);
    });
    body.querySelector('#admUpdateCancel')?.addEventListener('click', () => { updateDraft = null; render(); });
    body.querySelectorAll('[data-edit-update]').forEach(button => button.addEventListener('click', () => {
        updateDraft = { index: Number(button.dataset.editUpdate), ...homepage.updates[Number(button.dataset.editUpdate)] };
        render();
        root.querySelector('#admUpdateText')?.focus();
    }));
    body.querySelectorAll('[data-remove-update]').forEach(button => button.addEventListener('click', async () => {
        if (!await confirmAsync('Убрать это обновление с главной?')) return;
        await saveHomepageSection('updates', homepage.updates.filter((_, index) => index !== Number(button.dataset.removeUpdate)));
    }));
    if (homepageBusy) body.querySelectorAll('input, textarea, button').forEach(element => { element.disabled = true; });
}

async function saveHomepageSection(section, value) {
    if (homepageBusy) return;
    const editing = homepage;
    const draftToRestore = updateDraft;
    homepageBusy = true;
    render();
    try {
        const saved = await saveClubContent(section, value, editing.revisions[section], tg?.initData || '');
        editing[section] = saved;
        if (section === 'updates') updateDraft = null;
        // Refresh only the saved section's version, preserving other unsaved fields.
        try {
            const fresh = await loadClubContent();
            editing[section] = fresh[section];
            editing.revisions[section] = fresh.revisions[section];
        } catch {
            homepage = { error: 'сохранено, но не удалось обновить редактор — загрузи данные ещё раз' };
        }
        toast(section === 'metrics' ? 'цифры сохранены' : 'обновления сохранены');
        haptic();
    } catch (error) {
        updateDraft = draftToRestore;
        toast(error.message, true);
    } finally {
        homepageBusy = false;
        if (root && view.tab === 'home') render();
    }
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
        if (h.letter_link) flags.push('<span class="adm-flag">✉️ письмо</span>');
        if (h.summary_link) flags.push('<span class="adm-flag">🧠 саммари</span>');
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
        letter_link: h.letter_link || '',
        summary_link: h.summary_link || '',
        summary_title: h.summary_title || '',
        capacity: h.capacity ? String(h.capacity) : '',
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
        features: '', access: '', details: '', location_link: '', report_link: '', letter_link: '', summary_link: '', summary_title: '', capacity: '',
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
        <div class="adm-hint">без названия событие показывается заглушкой. «🌧️ дата перенесена» работает и для хайка с названием – запись закрывается, в ленте дождик:</div>
        <div class="adm-chips">${PLACEHOLDER_EMOJI.map(([e, l]) => `<button class="adm-chip${d.emoji === e ? ' is-on' : ''}" data-emoji="${e}">${l}</button>`).join('')}</div>
        ${field('start_time', 'время старта', 'placeholder="12:00" inputmode="numeric"')}
        ${field('capacity', 'мест (пусто – 10)', 'placeholder="10" inputmode="numeric"')}
        ${field('tags', 'теги через запятую', 'placeholder="умеренно, 10 км, 4-5 часов, без пропуска"')}

        <div class="adm-label">🗺 трек маршрута</div>
        ${trackSectionHtml(d)}

        <div class="adm-label">описание</div>
        <label class="adm-upload">📷 загрузить картинку<input type="file" accept="image/*" id="admImgFile" hidden></label>
        <div class="adm-emoimg">
            <input id="admEmoImgText" placeholder="🫖🍕🎲" maxlength="24" inputmode="text">
            <button class="adm-ghost" id="admEmoImgMake">🎨 картинка из эмоджи</button>
        </div>
        <div class="adm-hint">до трёх эмоджи – получится картинка, как у прошлых событий: эмоджи в ряд на прозрачном фоне</div>
        ${field('image', 'картинка (ссылка)', 'placeholder="https://i.postimg.cc/…"')}
        ${d.image ? `<img class="adm-img" src="${esc(d.image)}" alt="">` : ''}
        ${area('features', 'о маршруте', 5)}
        ${area('access', 'как добраться', 4)}
        ${area('details', 'детали', 3)}
        ${field('location_link', 'точка сбора (ссылка на карту)')}
        ${field('report_link', 'отчёт (ссылка на пост)', 'placeholder="https://t.me/yaltahiking/…"')}
        ${field('letter_link', '✉️ письмо после хайка (ссылка на сообщение в чате)', 'placeholder="https://t.me/yaltahikingchat/…"')}
        <div class="adm-hint">у прошедшего хайка появится конверт «письмо Макса» – в ленте и в шторке хайка</div>
        ${field('summary_link', '🧠 саммари мастермайнда (ссылка)', 'placeholder="https://…"')}
        ${field('summary_title', 'название саммари', 'placeholder="как в блоке «саммари мастермайнда»"')}
        <div class="adm-hint">плашка «саммари мастермайнда» появится у прошедшего хайка, а запись – в блоке саммари на главной</div>
        <div class="adm-checks">${check('cancelled', 'отменён')}${check('woman', 'женский хайк')}${check('city', 'городское событие')}</div>
        ${d.city ? `<div class="adm-label">эмоджи события</div>
            <div class="adm-chips">${CITY_EMOJI.map(e => `<button class="adm-chip adm-emo${(d.emoji || '🥂') === e ? ' is-on' : ''}" data-city-emoji="${e}">${e}</button>`).join('')}</div>
            <div class="adm-hint">фоновая картинка события – «загрузить картинку» выше</div>` : ''}

        <button class="btn btn-yellow adm-primary adm-save" id="admSave">сохранить</button>
        <div class="adm-error" id="admSaveError" hidden></div>
        ${d.original ? `<div class="adm-label">участники</div><div id="admPeople" class="adm-hint">загружаю…</div>
            <button class="adm-delete" id="admDelete">🗑 удалить событие полностью</button>` : ''}`;

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
    body.querySelectorAll('[data-city-emoji]').forEach(b => b.addEventListener('click', () => { haptic(); d.emoji = b.dataset.cityEmoji; render(); }));
    // при переключении «городское событие» показываем выбор эмоджи
    body.querySelector('[data-k="city"]')?.addEventListener('change', () => render());
    body.querySelector('#admImgFile')?.addEventListener('change', e => uploadHikeImage(e.target.files && e.target.files[0]));
    body.querySelector('#admEmoImgMake')?.addEventListener('click', () => makeEmojiImage(body.querySelector('#admEmoImgText').value));
    body.querySelector('#admDelete')?.addEventListener('click', deleteHike);
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

// картинка с телефона: ужимаем до 1600 px и кладём через /api/story (публичная ссылка /story/<id>.jpg)
async function uploadHikeImage(file) {
    if (!file) return;
    const d = draft;
    const label = root?.querySelector('.adm-upload');
    if (label) label.firstChild.textContent = '⏳ загружаю…';
    try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const img = c.toDataURL('image/jpeg', 0.85);
        const r = await fetch('/api/story', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg?.initData || '', date: d.date || 'cover', img }) });
        const j = await r.json();
        if (!r.ok || !j.url) throw new Error(j.error || 'не загрузилось');
        d.image = j.url;
        toast('картинка загружена – не забудьте сохранить');
    } catch (e) {
        toast('не получилось загрузить: ' + e.message, true);
    }
    render();
}

// картинка события из 1–3 эмоджи: рисуем на телефоне (его эмоджи-шрифтом) 800×800, прозрачный фон,
// эмоджи в ряд по центру – как у «встречи в Капри» и «киновечера», и загружаем как обычную картинку
async function makeEmojiImage(raw) {
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(raw)].map(x => x.segment) : Array.from(raw);
    const emos = seg.filter(g => /\p{Extended_Pictographic}/u.test(g)).slice(0, 3);
    if (!emos.length) return toast('вставь от одного до трёх эмоджи', true);
    haptic();
    const c = document.createElement('canvas');
    c.width = c.height = 800;
    const ctx = c.getContext('2d');
    ctx.font = '135px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const step = 188;
    const x0 = 400 - step * (emos.length - 1) / 2;
    emos.forEach((e, i) => ctx.fillText(e, x0 + step * i, 405));
    const btn = root?.querySelector('#admEmoImgMake');
    if (btn) { btn.disabled = true; btn.textContent = 'загружаю…'; }
    try {
        const r = await fetch('/api/story', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg?.initData || '', date: draft?.date || 'cover', img: c.toDataURL('image/png') }) });
        const j = await r.json();
        if (!r.ok || !j.url) throw new Error(j.error || 'не загрузилось');
        draft.image = j.url;
        toast('картинка готова – не забудьте сохранить');
    } catch (e) {
        toast('не получилось: ' + e.message, true);
    }
    render();
}

async function deleteHike() {
    const d = draft;
    if (!d?.original) return;
    haptic();
    const name = d.title || 'заглушку';
    if (!(await confirmAsync(`Удалить «${name}» (${dateLabel(d.original)}) полностью? Событие пропадёт из календаря. Отменить нельзя.`))) return;
    const btn = root?.querySelector('#admDelete');
    if (btn) { btn.disabled = true; btn.textContent = 'удаляю…'; }
    try {
        await adminCall('adminDeleteHike', { date: d.original });
        toast('событие удалено');
        view = { tab: 'hikes' };
        render();
    } catch (e) {
        toast(e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = '🗑 удалить событие полностью'; }
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
        // эмоджи у события с названием храним для городских событий и для «🌧️ дата перенесена»
        emoji: (!d.title.trim() || d.city || /🌧/.test(d.emoji || '')) ? (d.emoji || '') : '',
        start_time: d.start_time.trim(),
        tags: d.tags.split(',').map(t => t.trim()).filter(Boolean),
        image: d.image.trim(),
        features: d.features,
        access: d.access,
        details: d.details,
        location_link: d.location_link.trim(),
        report_link: d.report_link.trim(),
        letter_link: (d.letter_link || '').trim(),
        summary_link: (d.summary_link || '').trim(),
        summary_title: (d.summary_title || '').trim(),
        capacity: String(d.capacity || '').replace(/\D/g, ''),
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
        toast(res.postponed ? `сохранено ✓ · о переносе написали: ${res.postponed}` : res.notified ? `сохранено ✓ · уведомили о записи: ${res.notified}` : 'сохранено ✓');
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
        const { participants, waitlist = [], carry = null } = await adminCall('adminParticipants', { date });
        if (!root || !el.isConnected) return;
        const booked = participants.filter(p => p.in_app || p.status === 'booked');
        const waiting = waitlist.filter(w => !w.notified);
        const carried = waitlist.filter(w => w.carried_from);
        // кто просил сообщить об открытии записи – для заглушки это главное; перенесённые с отменённой даты помечены
        const waitHtml = waitlist.length
            ? `<div class="adm-note">🔔 ждут открытия записи: <b>${waiting.length}</b>${carried.length ? ` · из них перенесены с других дат: ${carried.length}` : ''}${waitlist.length > waiting.length ? ` (уже уведомили: ${waitlist.length - waiting.length})` : ''}${waiting.length ? '<br>как только дадите название и сохраните, им придёт сообщение с кнопкой на этот хайк' : ''}
                ${carry?.to ? `<br>↪ при отмене перенесены на ${dateLabel(carry.to)}: ${carry.moved}` : carry?.pending ? '<br>↪ перенесём на следующий хайк, как только он появится в календаре' : ''}
                <div class="adm-wl">${waitlist.map(w => `<div class="adm-wl-row"><span>${esc(w.name || 'без имени')}${w.username ? ` <i>@${esc(w.username)}</i>` : ''}</span>${w.carried_from ? `<span class="adm-flag is-carry">↪ с ${dateLabel(w.carried_from)}</span>` : '<span class="adm-flag">сам</span>'}</div>`).join('')}</div></div>`
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

// ---------- продажа карты: спецпредложение тем, кто ходил ----------
// Само собой: на следующий день после хайка каждому, кто на нём был (и без карты), приложение 3 дня показывает
// баннер «бессрочная карта за 5 500 вместо 7 500» (Apps Script autoCardOfferFrom_, api/me.js). Здесь – ручная
// рассылка: бот пишет выбранным, и предложение открывается им ещё на 3 дня с момента отправки.
// Кому бот писать не может – кнопка «написать лично» с тем же текстом.
const OFFER_TEXT_DEFAULT = '[имя], спасибо, что ходишь с нами на хайки 🤍\n\nследующие 3 дня бессрочная карта интеллигента для тебя стоит 5 500 ₽ вместо 7 500 – один раз и навсегда:\n\n• все хайки без билетов и оплат\n• запись, даже когда мест уже нет\n• закрытые события клуба и привилегии у партнёров\n\nподробности и оформление – по кнопке ниже';
// приглашение в близкий круг: админ сам выбирает людей, бот пишет им это сообщение, в приложении – тёплая плашка.
// Цена = 7 500 − все оплаченные билеты (не дороже 5 500 и не дешевле 1 500), считает сервер.
const CIRCLE_TEXT = '[имя], мы рады знакомству с тобой и хотим видеть тебя в нашем близком кругу 🤍\n\nпоэтому засчитываем все твои билеты в карту интеллигента: [билеты] на [сумма] уже учтены, и бессрочная карта для тебя стоит [цена] вместо 7 500 ₽.\n\nнам хочется, чтобы хайки с нами были для тебя свободными, без билетов, а клуб стал твоей компанией';
let nc = null;
function ncTickets(n) {
    const a = n % 10, b = n % 100;
    return `${n} ${a === 1 && b !== 11 ? 'билет' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'билета' : 'билетов'}`;
}
function ncRub(n) { return `${Math.round(n).toLocaleString('ru-RU')} ₽`; }
function circleMessage(p) {
    const name = String(p?.name || 'друг').split(' ')[0];
    return CIRCLE_TEXT.replace(/\[имя\]/gi, name).replace(/\[билеты\]/gi, ncTickets(p.tickets_count || 0))
        .replace(/\[сумма\]/gi, ncRub(p.tickets_sum || 0)).replace(/\[цена\]/gi, ncRub(p.circle_price || 0));
}
function ncAgo(ts) {
    const h = Math.floor((Date.now() / 1000 - ts) / 3600);
    return h < 24 ? `${Math.max(1, h)} ч назад` : `${Math.floor(h / 24)} дн. назад`;
}
function ncUntil(ts) {
    const d = new Date(ts * 1000 - 1000); // конец окна – полночь: показываем последний день
    return `${d.getDate()} ${MS[d.getMonth()]}`;
}
// до какого момента у человека сейчас открыта спеццена (ручная рассылка или «после хайка»), 0 – нет
function ncActiveUntil(p) {
    const o = p.offer;
    if (o && o.used_at) return 0;
    const manual = o && o.sent_at && !o.closed_at && o.expires_at * 1000 > Date.now() ? o.expires_at : 0;
    return Math.max(manual, p.auto_until || 0);
}
function ncBadges(p) {
    const out = [];
    if (p.ticket) out.push('<span class="adm-badge">по билету</span>');
    if (p.can_message === true) out.push('<span class="adm-badge is-ok">бот напишет</span>');
    else if (p.can_message === false) out.push('<span class="adm-badge is-off">бот не может писать – только лично</span>');
    else out.push('<span class="adm-badge">бот – не знаем, дойдёт ли</span>');
    const o = p.offer;
    if (o && o.kind === 'circle' && !o.used_at && !o.closed_at) out.push(`<span class="adm-badge is-on">🤝 приглашён в круг ${ncAgo(o.sent_at)} · ${ncRub(o.price)}</span>`);
    if (o && o.used_at) out.push('<span class="adm-badge is-ok">купил по предложению</span>');
    else {
        const until = ncActiveUntil(p);
        if (until) out.push(`<span class="adm-badge is-on">спеццена до ${ncUntil(until)}${p.auto_until && until === p.auto_until ? ' · после хайка' : ''}</span>`);
        if (o && o.sent_at && o.notified) out.push(`<span class="adm-badge">бот писал ${ncAgo(o.sent_at)}</span>`);
    }
    return out.join('');
}
function ncMessage(p) {
    const name = String(p?.name || state.user?.first_name || 'друг').split(' ')[0];
    return String(nc.text || '').replace(/\[имя\]/gi, name);
}
async function loadNewcomers(force = false) {
    if (nc && nc.people && !force) return;
    nc = nc || { filter: 'recent', selected: new Set(), text: OFFER_TEXT_DEFAULT, people: null };
    nc.people = null;
    nc.error = '';
    try {
        const res = await adminCall('adminNewcomers');
        nc.people = res.people || [];
        nc.selected = new Set(); // выбирает админ сам
    } catch (e) {
        nc.error = e.message;
    }
    if (root && view.tab === 'newcomers') render();
}
function ncRecent(p) {
    return (Date.now() - new Date(p.last + 'T12:00:00').getTime()) / 86400000 <= 14;
}
function renderNewcomers(body) {
    if (!nc || (!nc.people && !nc.error)) {
        body.innerHTML = '<div class="adm-muted" style="padding:20px 4px">собираю тех, кто ходил с нами…</div>';
        if (!nc || !nc.loading) { nc = nc || { filter: 'recent', selected: new Set(), text: OFFER_TEXT_DEFAULT }; nc.loading = true; loadNewcomers(true).finally(() => { if (nc) nc.loading = false; }); }
        return;
    }
    if (nc.error) {
        body.innerHTML = `<div class="adm-muted" style="padding:20px 4px">не получилось загрузить: ${esc(nc.error)}</div><button class="adm-ghost adm-wide" id="ncRetry">ещё раз</button>`;
        body.querySelector('#ncRetry').addEventListener('click', () => { nc.error = ''; nc.people = null; render(); });
        return;
    }
    const all = nc.people.filter(p => !(p.offer && p.offer.used_at));
    const recent = all.filter(ncRecent);
    const list = nc.filter === 'recent' ? recent : all;
    const chosen = all.filter(p => nc.selected.has(p.id));
    const botCan = chosen.filter(p => p.can_message !== false);
    const row = p => {
        const name = esc(p.name || 'без имени') + (p.username ? ` <span class="adm-muted">@${esc(p.username)}</span>` : '');
        const n = p.hikes.length;
        const hk = `${n} ${n === 1 ? 'хайк' : n < 5 ? 'хайка' : 'хайков'} · последний ${dateLabel(p.last)}${p.hikes[p.hikes.length - 1].title ? ' – ' + esc(p.hikes[p.hikes.length - 1].title) : ''}`;
        const invited = p.offer && p.offer.kind === 'circle' && !p.offer.closed_at && !p.offer.used_at;
        const circle = p.tickets_count
            ? `<div class="adm-nc-sub">оплатил ${ncTickets(p.tickets_count)} на ${ncRub(p.tickets_sum)} → карта для него ${ncRub(p.circle_price)}</div>`
              + (invited || p.can_message === false ? '' : `<div class="adm-nc-acts"><button type="button" class="adm-ghost adm-nc-act" data-circle="${esc(p.id)}">🤝 пригласить в круг</button></div>`)
            : '';
        const personal = p.can_message !== true
            ? (p.username ? `<div class="adm-nc-acts"><button type="button" class="adm-ghost adm-nc-act" data-dm="${esc(p.id)}">написать лично</button></div>` : '<div class="adm-nc-acts"><span class="adm-nc-note">нет @username – найти в чате хайка</span></div>')
            : '';
        return `<label class="adm-nc-person${nc.selected.has(p.id) ? ' is-on' : ''}">
            <input type="checkbox" data-id="${esc(p.id)}" ${nc.selected.has(p.id) ? 'checked' : ''}>
            <div class="adm-nc-info"><div class="adm-nc-name">${name}</div><div class="adm-nc-sub">${hk}</div>
            ${circle}<div class="adm-nc-badges">${ncBadges(p)}</div>${personal}</div>
        </label>`;
    };
    body.innerHTML = `
        <div class="adm-hint" style="margin-top:0"><b>само собой:</b> на следующий день после хайка каждому, кто на нём был без карты, приложение 3 дня показывает баннер – бессрочная карта за 5 500 ₽ вместо 7 500.<br><b>здесь:</b> напиши через бота тем, кто ходил, – спеццена откроется им ещё на 3 дня с момента отправки</div>
        <div class="adm-chips">
            <button class="adm-chip${nc.filter === 'recent' ? ' is-on' : ''}" data-f="recent">ходили за 2 недели · ${recent.length}</button>
            <button class="adm-chip${nc.filter === 'all' ? ' is-on' : ''}" data-f="all">все, кто ходил · ${all.length}</button>
        </div>
        <div class="adm-row-btns"><button class="adm-ghost" id="ncAll">выбрать всех в списке</button><button class="adm-ghost" id="ncNone">снять выбор</button></div>
        <div class="adm-nc-list">${list.length ? list.map(row).join('') : '<div class="adm-muted" style="padding:12px 4px">пока никого</div>'}</div>
        <div class="adm-label">приглашение в круг – так напишет бот</div>
        <div class="adm-preview"><div class="adm-bubble">${esc(circleMessage(all.find(x => x.tickets_count) || { name: 'Аня', tickets_count: 3, tickets_sum: 4500, circle_price: 3000 })).replace(/\n/g, '<br>')}</div><div class="adm-bubble-btn">посмотреть карту</div></div>
        <div class="adm-hint">кнопка «🤝 пригласить в круг» – у каждого, кто оплачивал билеты. цена = 7 500 − все его билеты, но не дороже 5 500 и не дешевле 1 500. действует 30 дней, срок человеку не показываем</div>
        <label class="adm-field"><span>сообщение</span><textarea id="ncText" rows="10">${esc(nc.text)}</textarea></label>
        <div class="adm-hint">[имя] заменится именем. под сообщением – кнопка «посмотреть предложение»: откроется карта с ценой 5 500 ₽</div>
        <div class="adm-label">так увидят</div>
        <div class="adm-preview" id="ncPreview"></div>
        <button class="btn btn-yellow adm-primary" id="ncSend" ${chosen.length ? '' : 'disabled'}>${chosen.length ? `отправить · ${chosen.length} чел.` : 'выбери, кому отправить'}</button>
        ${chosen.length > botCan.length ? `<div class="adm-hint" style="margin-top:8px">${chosen.length - botCan.length} из выбранных бот написать не может – спеццена им всё равно откроется, а сообщение отправь сам кнопкой «написать лично»</div>` : ''}`;
    const preview = () => {
        body.querySelector('#ncPreview').innerHTML = `<div class="adm-bubble">${esc(ncMessage(chosen[0])).replace(/\n/g, '<br>')}</div><div class="adm-bubble-btn">посмотреть предложение</div>`;
    };
    body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { haptic(); nc.filter = b.dataset.f; render(); }));
    body.querySelector('#ncAll').addEventListener('click', () => { haptic(); list.forEach(p => nc.selected.add(p.id)); render(); });
    body.querySelector('#ncNone').addEventListener('click', () => { haptic(); nc.selected.clear(); render(); });
    body.querySelectorAll('.adm-nc-person input').forEach(cb => cb.addEventListener('change', () => {
        haptic();
        if (cb.checked) nc.selected.add(cb.dataset.id); else nc.selected.delete(cb.dataset.id);
        render();
    }));
    body.querySelectorAll('[data-dm]').forEach(b => b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); haptic();
        const p = all.find(x => x.id === b.dataset.dm);
        try { navigator.clipboard?.writeText(ncMessage(p)); } catch (err) {}
        toast('текст скопирован – вставь в чат');
        // чтобы обещанные в сообщении 3 дня по спеццене были правдой – открываем предложение и ему
        if (!(p.offer && p.offer.sent_at && !p.offer.closed_at && p.offer.expires_at * 1000 > Date.now())) {
            adminCall('adminOpenCardOffer', { user_ids: JSON.stringify([p.id]), days: 3, notify: 'no' })
                .then(() => loadNewcomers(true)).catch(err => toast(err.message, true));
        }
        const url = `https://t.me/${encodeURIComponent(p.username)}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    }));
    body.querySelectorAll('[data-circle]').forEach(b => b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); haptic();
        inviteCircle(all.find(x => x.id === b.dataset.circle));
    }));
    body.querySelector('#ncText').addEventListener('input', e => { nc.text = e.target.value; preview(); });
    body.querySelector('#ncSend').addEventListener('click', () => sendCardOffer(chosen));
    preview();
}
async function inviteCircle(p) {
    if (!p) return;
    const ok = await new Promise(res => {
        // у телеграма в окне подтверждения не больше 256 знаков – само сообщение видно в превью ниже
        const q = `пригласить ${String(p.name || '').split(' ')[0] || 'его'} в круг? бот напишет приглашение, карта для него – ${ncRub(p.circle_price)}`;
        if (tg?.showConfirm) { try { tg.showConfirm(q, r => res(!!r)); return; } catch (e) {} }
        res(window.confirm(q));
    });
    if (!ok) return;
    try {
        const res = await adminCall('adminInviteCircle', { user_ids: JSON.stringify([p.id]), names: JSON.stringify({ [p.id]: p.name || '' }), text: CIRCLE_TEXT });
        toast(res.sent ? 'приглашение отправлено 🤝' : 'приглашение открыто, но бот не смог написать');
        await loadNewcomers(true);
    } catch (e) {
        toast(e.message, true);
    }
}
async function sendCardOffer(people) {
    if (!people.length) return;
    const ok = await new Promise(res => {
        const bot = people.filter(p => p.can_message !== false).length;
        const q = `спеццена откроется ${people.length} чел. на 3 дня, бот напишет ${bot} из них. отправить?`;
        if (tg?.showConfirm) { try { tg.showConfirm(q, r => res(!!r)); return; } catch (e) {} }
        res(window.confirm(q));
    });
    if (!ok) return;
    const btn = root?.querySelector('#ncSend');
    if (btn) { btn.disabled = true; btn.textContent = 'отправляю…'; }
    try {
        const names = {};
        people.forEach(p => { names[p.id] = p.name || ''; });
        const res = await adminCall('adminOpenCardOffer', { user_ids: JSON.stringify(people.map(p => p.id)), names: JSON.stringify(names), days: 3, notify: 'yes', text: nc.text });
        toast(`спеццена открыта: ${res.opened} · бот написал: ${res.sent}${res.failed ? ` · не дошло: ${res.failed}` : ''}`);
        nc.selected.clear();
        await loadNewcomers(true);
    } catch (e) {
        toast(e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = `отправить · ${people.length} чел.`; }
    }
}
// ---------- цепочки сообщений ----------
// Дерево сообщений в боте (Firebase flows/, запускает Apps Script, кнопки обрабатывает бот).
// Здесь – карта цепочки с цифрами: сколько ушло на каждый шаг и сколько нажали каждую кнопку.
let flowsData = null; // { list, error, loading }
let flowOpen = '';
// рисуем в актуальный экран (пока шла загрузка, админка могла перерисоваться), ждём не дольше 30 с
async function loadFlows() {
    flowsData = { loading: true };
    const cur = root?.querySelector('.adm-body');
    if (cur && view.tab === 'flows' && !view.sub && !flowEdit) cur.innerHTML = '<div class="adm-muted" style="padding:12px 2px">загружаю цепочки…</div>';
    try {
        const res = await Promise.race([adminCall('adminFlows'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('сервер не ответил за 30 секунд')), 30000))]);
        flowsData = { list: res.flows || [] };
    } catch (e) { flowsData = { error: e.message }; }
    const b = root?.querySelector('.adm-body');
    if (b && view.tab === 'flows' && !view.sub) renderFlows(b);
}
function flowNodeHtml(f, nodeId, depth, seen) {
    const node = f.flow.nodes?.[nodeId];
    if (!node || seen.has(nodeId) || depth > 4) return '';
    seen.add(nodeId);
    const st = f.stats[nodeId] || {};
    const sent = Number(st.sent || 0);
    const clicks = (node.buttons || []).map((_, i) => Number(st.clicks?.[i] || 0));
    const totalClicks = clicks.reduce((a, b) => a + b, 0);
    const pct = n => (sent ? ` · ${Math.round(n / sent * 100)}%` : '');
    const text = esc(String(node.text || '')).replace(/\[имя\]/gi, '<i>[имя]</i>').replace(/\n/g, '<br>');
    const btns = node.buttons || [];
    return `<div class="fl-node">
        <div class="fl-msg"><div class="fl-text">${text}</div>
            <div class="fl-pills"><span>ушло ${sent}</span>${btns.length ? `<span>не нажали ${Math.max(0, sent - totalClicks)}</span>` : ''}</div></div>
        ${btns.length ? `<div class="fl-branches" style="grid-template-columns:repeat(${btns.length},minmax(0,1fr))">${btns.map((b, i) => `<div class="fl-branch">
            <div class="fl-line"></div><div class="fl-btn">${esc(b.label)}<small>нажали ${clicks[i]}${pct(clicks[i])}</small></div>
            ${b.next ? `<div class="fl-line"></div>${flowNodeHtml(f, b.next, depth + 1, seen)}` : ''}</div>`).join('')}</div>` : ''}
    </div>`;
}
// редактор: дерево правится на месте; новая кнопка сразу заводит своё следующее сообщение.
// Пустое следующее сообщение при сохранении отбрасывается – кнопка просто отмечает выбор.
let flowEdit = null; // { id, title, enabled, start, nodes, trigger }
const FLOW_MAX_DEPTH = 3;
function newNodeId(nodes) { let i = 1; while (nodes['n' + i]) i++; return 'n' + i; }
function dropSubtree(nodes, nid) {
    const n = nodes[nid];
    if (!n) return;
    (n.buttons || []).forEach(b => b.next && dropSubtree(nodes, b.next));
    delete nodes[nid];
}
function flowEditNodeHtml(nid, depth) {
    const n = flowEdit.nodes[nid];
    if (!n) return '';
    const btns = n.buttons || [];
    return `<div class="fl-node">
        <div class="fl-msg is-edit">
            <textarea class="fl-ta" data-ftext="${nid}" rows="${depth ? 3 : 5}" placeholder="${depth ? 'ответ бота на эту кнопку (можно оставить пустым)' : 'первое сообщение. [имя] заменится именем'}">${esc(n.text || '')}</textarea>
            ${depth < FLOW_MAX_DEPTH - 1 && btns.length < 3 ? `<button class="adm-link fl-addbtn" data-faddbtn="${nid}">+ кнопка</button>` : ''}
        </div>
        ${btns.length ? `<div class="fl-branches" style="grid-template-columns:repeat(${btns.length},minmax(0,1fr))">${btns.map((b, i) => `<div class="fl-branch">
            <div class="fl-line"></div>
            <div class="fl-btn is-edit"><input data-flabel="${nid}:${i}" value="${esc(b.label || '')}" placeholder="надпись кнопки" maxlength="40"><button class="fl-x" data-fdelbtn="${nid}:${i}" aria-label="удалить кнопку">×</button></div>
            ${b.next ? `<div class="fl-line"></div>${flowEditNodeHtml(b.next, depth + 1)}` : ''}</div>`).join('')}</div>` : ''}
    </div>`;
}
function renderFlowEditor(body) {
    body.innerHTML = `<button class="adm-back" id="flBack">‹ ${flowEdit.id ? 'к карте' : 'все цепочки'}</button>
        <div class="adm-h1">${flowEdit.id ? 'изменить цепочку' : 'новая цепочка'}</div>
        <label class="adm-field"><span>название</span><input id="flTitle" value="${esc(flowEdit.title || '')}" placeholder="например, «отзыв после хайка»" maxlength="60"></label>
        <label class="adm-check"><input type="checkbox" id="flEnabled" ${flowEdit.enabled !== false ? 'checked' : ''}><span>включена</span></label>
        <div class="fl-trigger">⚡ <b>запуск:</b> ${flowEdit.trigger === 'postpone' ? 'у события поставили «🌧️ дата перенесена»' : 'вручную – во вкладке «рассылка» выбираешь «🔗 цепочку» и людей'}</div>
        <div class="fl-line"></div>
        <div class="fl-map">${flowEditNodeHtml(flowEdit.start, 0)}</div>
        <div class="adm-hint">до 3 кнопок у сообщения и до 3 шагов в глубину. кнопка без ответа просто отмечает выбор – его видно на карте</div>
        <button class="btn btn-yellow adm-primary" id="flSave">сохранить цепочку</button>
        ${flowEdit.id && flowEdit.trigger !== 'postpone' ? '<button class="adm-delete" id="flDelete">🗑 удалить цепочку</button>' : ''}`;
    body.querySelector('#flBack').addEventListener('click', () => { haptic(); flowEdit = null; renderFlows(body); });
    body.querySelector('#flTitle').addEventListener('input', e => { flowEdit.title = e.target.value; });
    body.querySelector('#flEnabled').addEventListener('change', e => { flowEdit.enabled = e.target.checked; });
    body.querySelectorAll('[data-ftext]').forEach(t => t.addEventListener('input', () => { flowEdit.nodes[t.dataset.ftext].text = t.value; }));
    body.querySelectorAll('[data-flabel]').forEach(t => t.addEventListener('input', () => {
        const [nid, i] = t.dataset.flabel.split(':');
        flowEdit.nodes[nid].buttons[+i].label = t.value;
    }));
    body.querySelectorAll('[data-faddbtn]').forEach(b => b.addEventListener('click', () => {
        haptic();
        const n = flowEdit.nodes[b.dataset.faddbtn];
        const child = newNodeId(flowEdit.nodes);
        flowEdit.nodes[child] = { text: '' };
        (n.buttons ||= []).push({ label: '', next: child });
        renderFlowEditor(body);
    }));
    body.querySelectorAll('[data-fdelbtn]').forEach(b => b.addEventListener('click', () => {
        haptic();
        const [nid, i] = b.dataset.fdelbtn.split(':');
        const btn = flowEdit.nodes[nid].buttons[+i];
        if (btn.next) dropSubtree(flowEdit.nodes, btn.next);
        flowEdit.nodes[nid].buttons.splice(+i, 1);
        renderFlowEditor(body);
    }));
    body.querySelector('#flSave').addEventListener('click', async e => {
        haptic();
        // пустые ответы на кнопки отбрасываем – кнопка остаётся и просто считает выбор
        const nodes = JSON.parse(JSON.stringify(flowEdit.nodes));
        const prune = nid => {
            const n = nodes[nid];
            (n.buttons || []).forEach(btn => {
                if (!btn.next) return;
                if (!String(nodes[btn.next]?.text || '').trim()) { dropSubtree(nodes, btn.next); delete btn.next; }
                else prune(btn.next);
            });
        };
        if (!String(nodes[flowEdit.start]?.text || '').trim()) return toast('напиши первое сообщение', true);
        try { prune(flowEdit.start); } catch (err) { return toast('не получилось собрать цепочку: ' + err.message, true); }
        e.target.disabled = true;
        e.target.textContent = 'сохраняю…';
        try {
            const res = await adminCall('adminFlowSave', { id: flowEdit.id || '', flow: JSON.stringify({ title: flowEdit.title, enabled: flowEdit.enabled, start: flowEdit.start, nodes }) });
            toast('цепочка сохранена ✓');
            flowOpen = res.id;
            flowEdit = null;
            await loadFlows(body);
        } catch (err) {
            toast(err.message, true);
            e.target.disabled = false;
            e.target.textContent = 'сохранить цепочку';
        }
    });
    body.querySelector('#flDelete')?.addEventListener('click', async () => {
        if (!(await confirmAsync('Удалить цепочку? Цифры по ней тоже пропадут из списка.'))) return;
        try { await adminCall('adminFlowDelete', { id: flowEdit.id }); toast('удалено'); flowOpen = ''; flowEdit = null; await loadFlows(body); }
        catch (err) { toast(err.message, true); }
    });
}

function renderFlows(body) {
    if (flowEdit) return renderFlowEditor(body);
    if (!flowsData) { loadFlows(body); }
    const d = flowsData || { loading: true };
    if (d.loading) { body.innerHTML = '<div class="adm-muted" style="padding:12px 2px">загружаю цепочки…</div>'; return; }
    if (d.error) { body.innerHTML = `<div class="adm-error-inline">не удалось загрузить: ${esc(d.error)}</div><button class="adm-link" id="flRetry">ещё раз</button>`; body.querySelector('#flRetry').addEventListener('click', () => loadFlows(body)); return; }
    const f = d.list.find(x => x.id === flowOpen);
    if (!f) {
        body.innerHTML = `<div class="adm-hint">цепочка – несколько сообщений в боте: первое уходит само по событию, кнопки ведут к следующим. здесь видно, как каждая отработала</div>
            ${d.list.map(x => `<button class="fl-item" data-flow="${esc(x.id)}"><b>${esc(x.flow.title || x.id)} <span class="fl-state${x.flow.enabled === false ? ' is-off' : ''}">${x.flow.enabled === false ? 'выключена' : 'включена'}</span></b>
                <small>${esc(x.flow.trigger_text || '')}</small><small>получили ${x.people} чел. · запусков ${x.runs}</small></button>`).join('') || '<div class="adm-muted">цепочек пока нет</div>'}
            <button class="fl-new" id="flNew">+ новая цепочка</button>
            <button class="adm-link" id="flReload">обновить цифры</button>`;
        body.querySelector('#flNew').addEventListener('click', () => {
            haptic();
            flowEdit = { id: '', title: '', enabled: true, start: 'n1', trigger: 'manual', nodes: { n1: { text: '', buttons: [] } } };
            renderFlows(body);
        });
        body.querySelectorAll('[data-flow]').forEach(b => b.addEventListener('click', () => { haptic(); flowOpen = b.dataset.flow; renderFlows(body); }));
        body.querySelector('#flReload').addEventListener('click', () => { haptic(); loadFlows(body); });
        return;
    }
    body.innerHTML = `<button class="adm-back" id="flBack">‹ все цепочки</button>
        <div class="adm-h1">${esc(f.flow.title || f.id)}</div>
        <div class="fl-trigger">⚡ <b>запуск:</b> ${esc(f.flow.trigger_text || f.flow.trigger || '')}<br><small>получили ${f.people} чел. · запусков ${f.runs}</small></div>
        <div class="fl-line"></div>
        <div class="fl-map">${flowNodeHtml(f, f.flow.start, 0, new Set())}</div>
        <button class="btn btn-yellow adm-primary" id="flEdit">✎ изменить цепочку</button>
        <button class="adm-link" id="flReload">обновить цифры</button>`;
    body.querySelector('#flEdit').addEventListener('click', () => {
        haptic();
        // в редакторе у каждой кнопки есть своё следующее сообщение (пусть и пустое)
        const nodes = JSON.parse(JSON.stringify(f.flow.nodes || {}));
        Object.values(nodes).forEach(n => (n.buttons || []).forEach(b => { if (!b.next) { const c = newNodeId(nodes); nodes[c] = { text: '' }; b.next = c; } }));
        flowEdit = { id: f.id, title: f.flow.title, enabled: f.flow.enabled !== false, start: f.flow.start, trigger: f.flow.trigger, nodes };
        renderFlows(body);
    });
    body.querySelector('#flBack').addEventListener('click', () => { haptic(); flowOpen = ''; renderFlows(body); });
    body.querySelector('#flReload').addEventListener('click', () => { haptic(); loadFlows(body); });
}

// ---------- рассылка ----------
function newBroadcast() {
    return { segment: 'all', hikeDate: '', text: '', btnType: 'app', section: 'calendar', btnHike: '', url: '', btnText: '▶ открыть', count: null, excl: [], off: {}, showExcl: false, showPeople: false, q: '', peopleLimit: 100, kind: 'regular', when: 'now', sendAt: defaultSendAt() };
}
// завтра 10:00 по времени телефона – в формате <input type="datetime-local">
function defaultSendAt() {
    const d = new Date(Date.now() + 86400000);
    d.setHours(10, 0, 0, 0);
    return localInputValue(d);
}
function localInputValue(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
const sendAtTs = () => Math.floor(new Date(bc.sendAt).getTime() / 1000);
const fmtWhen = ts => new Date(ts * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// сбор отзывов: участникам прошедшего хайка, кнопка ведёт в общий чат
function applyFeedbackPreset(hike) {
    bc.segment = 'hike';
    bc.extra = [];
    bc.hikeDate = hike?.date || bc.hikeDate;
    bc.excl = [];
    bc.off = {};
    bc.kind = 'regular';
    bc.text = `[имя], спасибо, что был с нами${hike ? ` на «${hike.title.trim()}»` : ' на хайке'} 🤍\n\nподелись парой слов в общем чате клуба: как тебе маршрут, темп, люди? нам важно каждое мнение, а тем, кто только думает пойти с нами, – тем более`;
    bc.btnType = 'chat';
    bc.btnText = '💬 оставить отзыв в чате';
    bc.tipApplied = 'feedback';
}

// ---------- запланированные рассылки ----------
let bcSched = null; // { list, error, loading, at }
const SCHED_STATUS = { pending: 'ждёт', sending: 'отправляется', sent: 'ушла', cancelled: 'отменена', error: 'ошибка' };
function renderSchedBox(box) {
    if (!box) return;
    const list = (bcSched?.list || []);
    if (!list.length) { box.innerHTML = bcSched?.error ? `<div class="adm-error-inline">запланированные: ${esc(bcSched.error)}</div>` : ''; return; }
    const waiting = list.filter(x => x.status === 'pending').length;
    box.innerHTML = `<button class="adm-people-toggle" id="admSchedToggle">⏰ запланированные${waiting ? ` (${waiting})` : ''} ${bc.showSched ? '▴' : '▾'}</button>
        ${bc.showSched ? `<div class="adm-stats">${list.map(x => `<div class="adm-stat adm-sched is-${x.status}">
            <div class="adm-stat-top"><b>${esc(fmtWhen(x.send_at))}</b><small>${SCHED_STATUS[x.status] || x.status}</small></div>
            <div class="adm-stat-text">${esc(x.label.replace(/^⏰ /, ''))} · ${x.count} чел.</div>
            <div class="adm-stat-text">${esc(x.text.replace(/<[^>]+>/g, '').slice(0, 120))}${x.text.length > 120 ? '…' : ''}</div>
            ${x.status === 'sent' ? `<div class="adm-stat-nums"><span><b>${x.sent}</b>доставлено из ${x.total}</span></div>` : ''}
            ${x.status === 'error' ? `<div class="adm-error-inline">${esc(x.error)}</div>` : ''}
            ${x.status === 'pending' ? `<button class="adm-link" data-sched-cancel="${x.id}">отменить</button>` : ''}
        </div>`).join('')}</div>` : ''}`;
    box.querySelector('#admSchedToggle').addEventListener('click', () => { haptic(); bc.showSched = !bc.showSched; renderSchedBox(box); });
    box.querySelectorAll('[data-sched-cancel]').forEach(b => b.addEventListener('click', async () => {
        haptic();
        if (!(await confirmAsync('Отменить запланированную рассылку?'))) return;
        b.disabled = true;
        try { await adminCall('adminScheduledCancel', { id: b.dataset.schedCancel }); toast('отменена'); }
        catch (e) { toast(e.message, true); }
        loadSched(box);
    }));
}
async function loadSched(box) {
    try {
        const res = await adminCall('adminScheduledList');
        bcSched = { list: res.list || [], at: Date.now() };
    } catch (e) { bcSched = { list: [], error: e.message, at: Date.now() }; }
    if (box?.isConnected) renderSchedBox(box);
}

// ---------- приглашения +1 ----------
// Ссылка, по которой друг владельца карты записывается на хайк без билета (см. invite.js / handleInvite).
let p1 = null; // { members, error, member, date, result }

function renderPlus1(body) {
    if (!p1) {
        p1 = { members: null, member: '', date: '', result: null };
        adminCall('adminInviteMembers')
            .then(r => { p1.members = r.members || []; })
            .catch(e => { p1.error = e.message; })
            .finally(() => { if (root && view.tab === 'plus1') render(); });
    }
    if (!p1.members && !p1.error) { body.innerHTML = '<div class="adm-muted" style="padding:20px 4px">загружаю владельцев карт…</div>'; return; }
    if (p1.error) {
        body.innerHTML = `<div class="adm-muted" style="padding:20px 4px">не получилось загрузить: ${esc(p1.error)}</div><button class="adm-ghost adm-wide" id="p1Retry">ещё раз</button>`;
        body.querySelector('#p1Retry').addEventListener('click', () => { p1 = null; render(); });
        return;
    }
    const today = todayStr();
    const hikes = allHikes().filter(h => h.date >= today && h.title && !isYes(h.city) && !isYes(h.book_club) && !isYes(h.cancelled));
    const r = p1.result;
    body.innerHTML = `
        <div class="adm-muted" style="margin:4px 2px 14px">ссылка-приглашение: друг владельца карты откроет её, увидит «имя приглашает тебя на хайк» и запишется без билета. один +1 на хайк, только для тех, кто ещё не ходил с нами</div>
        <label class="adm-field"><span>владелец карты</span><select id="p1Member">
            <option value="">— выбери —</option>
            ${p1.members.map(m => `<option value="${esc(m.id)}"${m.id === p1.member ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select></label>
        <label class="adm-field"><span>хайк</span><select id="p1Hike">
            <option value="">— выбери —</option>
            ${hikes.map(h => `<option value="${h.date}"${h.date === p1.date ? ' selected' : ''}>${esc(dateLabel(h.date))} · ${esc(h.title)}</option>`).join('')}
        </select></label>
        <button class="btn btn-yellow adm-primary" id="p1Create">создать ссылку</button>
        ${r ? `
            <div class="adm-p1-result">
                <div style="font-weight:700;margin-bottom:6px">ссылка для ${esc(r.inviter_name || '')}</div>
                ${r.used ? `<div class="adm-muted" style="margin-bottom:8px">уже использована${r.friend ? ` – записался(ась) ${esc(r.friend)}` : ''}</div>` : ''}
                <label class="adm-field" style="margin:0"><input id="p1Link" readonly value="${esc(r.link)}"></label>
                <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="adm-ghost" id="p1Copy" style="flex:1">скопировать</button>
                    <button class="adm-ghost" id="p1Share" style="flex:1">отправить в Telegram</button>
                </div>
            </div>` : ''}`;
    body.querySelector('#p1Member').addEventListener('change', e => { p1.member = e.target.value; p1.result = null; });
    body.querySelector('#p1Hike').addEventListener('change', e => { p1.date = e.target.value; p1.result = null; });
    body.querySelector('#p1Create').addEventListener('click', async e => {
        if (!p1.member || !p1.date) return toast('выбери владельца карты и хайк', true);
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'создаю…';
        try {
            p1.result = await adminCall('adminInviteCreate', { user_id: p1.member, hike_date: p1.date });
        } catch (err) { toast(err.message, true); }
        render();
    });
    body.querySelector('#p1Copy')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(r.link); toast('скопировано'); }
        catch (e) { const i = body.querySelector('#p1Link'); i.select(); document.execCommand('copy'); toast('скопировано'); }
    });
    body.querySelector('#p1Share')?.addEventListener('click', () => {
        const url = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent('твоя ссылка-приглашение +1 – отправь её другу, он запишется на хайк без билета')}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    });
}

// ---------- ссылки «место сверх лимита» ----------
// Ссылка на хайк, по которой человек записывается даже без мест (билет или карта). Видно, кто открыл и кто купил.
let ps = null; // { links, error, date, note, result }

function psTime(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function renderPass(body) {
    if (!ps) {
        ps = { links: null, date: '', note: '', result: null };
        adminCall('adminPassList')
            .then(r => { ps.links = r.links || []; })
            .catch(e => { ps.error = e.message; })
            .finally(() => { if (root && view.tab === 'pass') render(); });
    }
    const today = todayStr();
    const hikes = allHikes().filter(h => h.date >= today && h.title && !isYes(h.cancelled));
    if (!ps.date && hikes[0]) ps.date = hikes[0].date;
    const r = ps.result;
    const person = p => `${esc(p.name || 'без имени')}${p.username ? ` <a href="https://t.me/${esc(p.username)}" target="_blank" class="adm-muted">@${esc(p.username)}</a>` : ''} <span class="adm-muted">· ${psTime(p.ts)}</span>`;
    const typeName = t => t === 'ticket' ? 'билет' : t === 'offer' ? 'карта (спецпредложение)' : 'карта';
    body.innerHTML = `
        <div class="adm-muted" style="margin:4px 2px 14px">личная ссылка на хайк: человек откроет её и сможет записаться, даже если мест нет – купить билет или карту. здесь видно, кто открыл и кто купил</div>
        <label class="adm-field"><span>хайк</span><select id="psHike">
            ${hikes.map(h => `<option value="${h.date}"${h.date === ps.date ? ' selected' : ''}>${esc(dateLabel(h.date))} · ${esc(h.title)}</option>`).join('')}
        </select></label>
        <label class="adm-field"><span>для кого (пометка, необязательно)</span><input id="psNote" maxlength="80" value="${esc(ps.note)}" placeholder="например: Аня из чата"></label>
        <button class="btn btn-yellow adm-primary" id="psCreate">создать ссылку</button>
        ${r ? `
            <div class="adm-p1-result">
                <div style="font-weight:700;margin-bottom:6px">ссылка на «${esc(r.hike_title)}»</div>
                <label class="adm-field" style="margin:0"><input id="psLink" readonly value="${esc(r.link)}"></label>
                <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="adm-ghost" id="psCopy" style="flex:1">скопировать</button>
                    <button class="adm-ghost" id="psShare" style="flex:1">отправить в Telegram</button>
                </div>
            </div>` : ''}
        <div class="adm-label" style="margin-top:22px">созданные ссылки</div>
        ${ps.error ? `<div class="adm-muted">не получилось загрузить: ${esc(ps.error)}</div>`
            : !ps.links ? '<div class="adm-muted">загружаю…</div>'
            : !ps.links.length ? '<div class="adm-muted">пока ни одной</div>'
            : ps.links.map(l => `
                <div class="adm-p1-result" style="margin-top:10px">
                    <div style="font-weight:700">${esc(dateLabel(l.hike_date))} · ${esc(l.hike_title || l.hike_date)}</div>
                    <div class="adm-muted" style="margin:2px 0 8px">${l.note ? esc(l.note) + ' · ' : ''}создана ${psTime(l.created_at)}</div>
                    <div style="font-size:13px;margin-bottom:4px"><b>купили (${l.buys.length})</b></div>
                    ${l.buys.length ? l.buys.map(b => `<div style="font-size:13px;margin:2px 0">✅ ${person(b)} <span class="adm-muted">· ${typeName(b.type)}${b.amount ? `, ${b.amount} ₽` : ''}</span></div>`).join('') : '<div class="adm-muted" style="font-size:13px">пока никто</div>'}
                    <div style="font-size:13px;margin:8px 0 4px"><b>открыли (${l.opens.length})</b></div>
                    ${l.opens.length ? l.opens.map(o => `<div style="font-size:13px;margin:2px 0">👀 ${person(o)}</div>`).join('') : '<div class="adm-muted" style="font-size:13px">пока никто</div>'}
                    <button class="adm-ghost" data-ps-copy="${esc(l.link)}" style="margin-top:10px;width:100%">скопировать ссылку</button>
                </div>`).join('')}`;
    body.querySelector('#psHike')?.addEventListener('change', e => { ps.date = e.target.value; ps.result = null; });
    body.querySelector('#psNote')?.addEventListener('input', e => { ps.note = e.target.value; });
    body.querySelector('#psCreate').addEventListener('click', async e => {
        if (!ps.date) return toast('выбери хайк', true);
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'создаю…';
        try {
            ps.result = await adminCall('adminPassCreate', { hike_date: ps.date, note: ps.note });
            ps.note = '';
            const list = await adminCall('adminPassList');
            ps.links = list.links || [];
        } catch (err) { toast(err.message, true); }
        render();
    });
    const copy = async (text, input) => {
        try { await navigator.clipboard.writeText(text); toast('скопировано'); }
        catch (e) { if (input) { input.select(); document.execCommand('copy'); } toast('скопировано'); }
    };
    body.querySelector('#psCopy')?.addEventListener('click', () => copy(r.link, body.querySelector('#psLink')));
    body.querySelector('#psShare')?.addEventListener('click', () => {
        const url = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent('держи ссылку – по ней можно записаться на хайк, даже если мест уже нет 🤍')}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    });
    body.querySelectorAll('[data-ps-copy]').forEach(b => b.addEventListener('click', () => copy(b.dataset.psCopy)));
}

const SEG_LABEL = Object.fromEntries(SEGMENT_GROUPS.flatMap(([, list]) => list));
// что человек выбрал в боте на вопрос «как часто писать» и тип рассылки
const PREF_LABEL = { all: 'писать обо всём', important: 'раз в неделю, самое важное', hikes: 'только анонсы хайков', none: 'не писать' };
const KINDS = [['regular', 'обычное'], ['important', 'важное'], ['hike', 'анонс хайка']];
// что мы знаем о человеке – коротко, для строки в списке
function personMeta(p, now) {
    const parts = [];
    if (p.lo) { const d = Math.floor((now - p.lo) / 86400); parts.push(d <= 0 ? 'заходил сегодня' : `заходил ${d} дн. назад`); }
    parts.push(p.p ? `хайков: ${p.p}` : 'хайков не было');
    if (p.f) parts.push('записан');
    if (p.m) parts.push('карта');
    return parts.join(' · ');
}
// итоговый список: сегмент минус сегменты-исключения минус снятые галочки
// несколько сегментов сразу: bc.segment – первый (по нему шаблон текста), bc.extra – остальные;
// bc.add – люди, добавленные вручную поиском по имени
const bcSegs = () => [bc.segment, ...(bc.extra || [])].filter(Boolean);
const bcHas = k => bcSegs().includes(k);
function bcRecipients() {
    const segs = audience?.segments || {};
    const base = [...new Set([...bcSegs().flatMap(k => segs[k] || []), ...Object.keys(bc.add || {})].map(String))];
    const exBy = {};
    bc.excl.forEach(k => (segs[k] || []).forEach(id => { if (!exBy[id]) exBy[id] = k; }));
    // настройка человека «как часто писать» (бот спрашивает после первой рассылки) против типа сообщения
    const people = audience?.people || {};
    const prefBlocks = id => {
        const p = people[id]?.mp;
        if (p === 'none') return true;
        if (p === 'hikes') return bc.kind !== 'hike';
        if (p === 'important') return bc.kind !== 'important';
        return false;
    };
    const final = [], bySeg = [], manual = [], byPref = [];
    base.forEach(id => {
        if (exBy[id]) bySeg.push(id);
        else if (prefBlocks(id)) byPref.push(id);
        else if (bc.off[id]) manual.push(id);
        else final.push(id);
    });
    return { base, final, bySeg, manual, byPref, exBy, prefBlocks };
}

// ---------- черновики рассылки ----------
// Храним в облаке Telegram (CloudStorage: привязано к аккаунту админа, видно с любого устройства),
// если его нет – в памяти устройства. Текст – отдельным ключом: у облака лимит 4096 символов на значение.
const DRAFT_FIELDS = ['segment', 'extra', 'add', 'hikeDate', 'waitDate', 'excl', 'off', 'kind', 'btnType', 'section', 'btnHike', 'url', 'btnText', 'when', 'sendAt'];
const cloud = {
    ok: () => !!(tg?.CloudStorage && tg.isVersionAtLeast?.('6.9')),
    get: keys => new Promise(res => {
        if (!cloud.ok()) { const o = {}; keys.forEach(k => { try { o[k] = localStorage.getItem(k) || ''; } catch (e) { o[k] = ''; } }); return res(o); }
        tg.CloudStorage.getItems(keys, (err, vals) => res(err ? {} : (vals || {})));
    }),
    set: (k, v) => new Promise(res => {
        if (!cloud.ok()) { try { localStorage.setItem(k, v); } catch (e) {} return res(true); }
        tg.CloudStorage.setItem(k, v, err => res(!err));
    }),
    del: keys => new Promise(res => {
        if (!cloud.ok()) { keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); return res(true); }
        tg.CloudStorage.removeItems(keys, () => res(true));
    }),
};
let drafts = null; // [{ id, title, savedAt }]
async function loadDrafts() {
    const { bc_drafts: raw } = await cloud.get(['bc_drafts']);
    try { drafts = JSON.parse(raw || '[]'); } catch (e) { drafts = []; }
    return drafts;
}
async function saveDraft() {
    const id = bc.draftId || String(Date.now());
    const data = {};
    DRAFT_FIELDS.forEach(k => { data[k] = bc[k]; });
    const title = (bc.text || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'без текста';
    const okMeta = await cloud.set('bcd_' + id, JSON.stringify(data).slice(0, 4096));
    const okText = await cloud.set('bct_' + id, (bc.text || '').slice(0, 4096));
    if (!okMeta || !okText) return toast('не удалось сохранить черновик', true);
    await loadDrafts();
    drafts = [{ id, title, seg: SEG_LABEL[bc.segment] || bc.segment, savedAt: Date.now() }, ...drafts.filter(d => d.id !== id)].slice(0, 30);
    await cloud.set('bc_drafts', JSON.stringify(drafts));
    bc.draftId = id;
    haptic();
    toast('черновик сохранён ✓');
    const box = root?.querySelector('#admDrafts');
    if (box) renderDraftsBox(box);
}
async function openDraft(id) {
    const vals = await cloud.get(['bcd_' + id, 'bct_' + id]);
    let data = {};
    try { data = JSON.parse(vals['bcd_' + id] || '{}'); } catch (e) {}
    bc = { ...newBroadcast(), ...data, text: vals['bct_' + id] || '', draftId: id, tipApplied: data.segment };
    audience = null;
    render();
    toast('черновик открыт');
}
async function deleteDraft(id) {
    if (!(await confirmAsync('Удалить черновик?'))) return;
    await cloud.del(['bcd_' + id, 'bct_' + id]);
    await loadDrafts();
    drafts = drafts.filter(d => d.id !== id);
    await cloud.set('bc_drafts', JSON.stringify(drafts));
    if (bc.draftId === id) bc.draftId = null;
    const box = root?.querySelector('#admDrafts');
    if (box) renderDraftsBox(box);
}
function renderDraftsBox(box) {
    const list = drafts || [];
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<button class="adm-people-toggle" id="admDraftsToggle">черновики (${list.length}) ${bc.showDrafts ? '▴' : '▾'}</button>
        ${bc.showDrafts ? `<div class="adm-drafts">${list.map(d => `<div class="adm-draft${bc.draftId === d.id ? ' is-on' : ''}">
            <button class="adm-draft-open" data-draft="${d.id}"><b>${esc(d.title)}</b><small>${esc(d.seg || '')} · ${new Date(d.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></button>
            <button class="adm-draft-del" data-draft-del="${d.id}" aria-label="удалить черновик">×</button></div>`).join('')}</div>` : ''}`;
    box.querySelector('#admDraftsToggle').addEventListener('click', () => { haptic(); bc.showDrafts = !bc.showDrafts; renderDraftsBox(box); });
    box.querySelectorAll('[data-draft]').forEach(b => b.addEventListener('click', () => { haptic(); openDraft(b.dataset.draft); }));
    box.querySelectorAll('[data-draft-del]').forEach(b => b.addEventListener('click', () => { haptic(); deleteDraft(b.dataset.draftDel); }));
}

// ---------- история рассылок ----------
// Telegram не сообщает ботам о прочтении, поэтому показываем честные цифры: доставлено, сколько из получателей
// зашли в приложение после рассылки, сколько нажали кнопку (уникальные люди; для кнопки-ссылки – все нажатия).
let bcStats = null; // { list, error, loading }
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
function renderStatsBox(box) {
    const open = bc.showStats;
    let inner = '';
    if (open) {
        if (!bcStats || bcStats.loading) inner = '<div class="adm-muted" style="padding:8px 2px">загружаю…</div>';
        else if (bcStats.error) inner = `<div class="adm-error-inline">не удалось загрузить: ${esc(bcStats.error)}</div>`;
        else if (!bcStats.list.length) inner = '<div class="adm-muted" style="padding:8px 2px">пока пусто – статистика появится у рассылок, отправленных после 10 октября</div>';
        else inner = `<div class="adm-stats">${bcStats.list.map(b => {
            const clicks = b.clicks + b.url_clicks;
            return `<div class="adm-stat">
                <div class="adm-stat-top"><b>${esc(b.label || 'рассылка')}</b><small>${new Date(b.at * 1000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
                <div class="adm-stat-text">${esc(b.text.replace(/<[^>]+>/g, '').slice(0, 120))}${b.text.length > 120 ? '…' : ''}</div>
                <div class="adm-stat-nums">
                    <span><b>${b.sent}</b>доставлено${b.failed ? ` · не дошло ${b.failed}` : ''}</span>
                    <span><b>${b.opened}</b>зашли в приложение · ${pct(b.opened, b.sent)}%</span>
                    ${b.btn ? `<span><b>${clicks}</b>нажали «${esc(b.btn)}» · ${pct(clicks, b.sent)}%</span>` : ''}
                </div></div>`;
        }).join('')}</div>`;
    }
    box.innerHTML = `<button class="adm-people-toggle" id="admStatsToggle">📊 история рассылок ${open ? '▴' : '▾'}</button>${inner}`;
    box.querySelector('#admStatsToggle').addEventListener('click', () => {
        haptic();
        bc.showStats = !bc.showStats;
        if (bc.showStats && (!bcStats || bcStats.error || Date.now() - (bcStats.at || 0) > 60000)) loadStats(box);
        renderStatsBox(box);
    });
}
async function loadStats(box) {
    bcStats = { loading: true };
    try {
        const res = await adminCall('adminBroadcastStats');
        bcStats = { list: (res.list || []).filter(b => b.at > 0 && b.sent >= 0 && b.label), at: Date.now() };
    } catch (e) { bcStats = { error: e.message }; }
    if (box.isConnected) renderStatsBox(box);
}

function renderBroadcast(body) {
    bc = { ...newBroadcast(), ...(bc || {}) };
    const today = todayStr();
    const titled = allHikes().filter(h => h.title && h.title.trim());
    const upcoming = titled.filter(h => h.date >= today);
    const recent = titled.filter(h => h.date < today).reverse().slice(0, 6);
    const hikeOptions = sel => [...upcoming, ...recent].map(h => `<option value="${h.date}" ${sel === h.date ? 'selected' : ''}>${dateLabel(h.date)} – ${esc(h.title)}</option>`).join('');
    if (bcHas('hike') && !bc.hikeDate) bc.hikeDate = (upcoming[0] || recent[0] || {}).date || '';
    if (bc.btnType === 'app' && bc.section === 'hike' && !bc.btnHike) bc.btnHike = (upcoming[0] || recent[0] || {}).date || '';
    const tip = SEGMENT_TIPS[bc.segment];
    const chip = (k, l, attr, on) => `<button class="adm-chip${on ? ' is-on' : ''}" ${attr}="${k}">${l} <span class="adm-chip-n" data-n="${k}"></span></button>`;

    body.innerHTML = `
        <div id="admStats" class="adm-drafts-box"></div>
        <div id="admSched" class="adm-drafts-box"></div>
        <div id="admDrafts" class="adm-drafts-box"></div>
        ${recent[0] ? `<button class="adm-quick" id="admFeedback">📝 собрать отзывы о хайке<small>${esc(dateLabel(recent[0].date))} – ${esc(recent[0].title)} · кнопка в общий чат</small></button>` : ''}
        ${bc.draftId ? '<div class="adm-hint">открыт черновик – «сохранить черновик» обновит его</div>' : ''}
        <div class="adm-label">кому</div>
        ${SEGMENT_GROUPS.map(([group, list]) => `<div class="adm-seg-group">${group}</div>
            <div class="adm-chips">${list.map(([k, l]) => chip(k, l, 'data-seg', bcHas(k))).join('')}</div>`).join('')}
        <div class="adm-hint">можно выбрать несколько сегментов – люди сложатся; повторное нажатие снимает сегмент</div>
        ${bcHas('hike') ? `<label class="adm-field"><span>хайк</span><select id="admBcHike">${hikeOptions(bc.hikeDate)}</select></label>` : ''}
        ${bcHas('waitlist_date') ? waitlistDateHtml() : ''}

        <div class="adm-label">кроме</div>
        <div class="adm-excl">
            ${bc.excl.map(k => `<button class="adm-pill" data-unexcl="${k}">${esc(SEG_LABEL[k] || k)} <b>×</b></button>`).join('')}
            <button class="adm-link" id="admExclToggle">${bc.showExcl ? 'готово' : '+ исключить сегмент'}</button>
        </div>
        ${bc.showExcl ? `<div class="adm-excl-pick">${SEGMENT_GROUPS.map(([group, list]) => {
            const items = list.filter(([k]) => !bcHas(k) && k !== 'hike' && k !== 'all');
            return items.length ? `<div class="adm-seg-group">${group}</div><div class="adm-chips">${items.map(([k, l]) => chip(k, l, 'data-excl', bc.excl.includes(k))).join('')}</div>` : '';
        }).join('')}</div>` : ''}

        <div class="adm-label">тип сообщения</div>
        <div class="adm-chips">${KINDS.map(([k, l]) => `<button class="adm-chip${bc.kind === k ? ' is-on' : ''}" data-kind="${k}">${l}</button>`).join('')}</div>
        <div class="adm-hint">кто попросил писать реже, получит только «важное» или «анонс хайка» – смотря что выбрал</div>

        <div class="adm-sum" id="admSum">считаю получателей…</div>
        <div id="admUnreach"></div>
        <div class="adm-label">добавить вручную</div>
        <input class="adm-people-search" id="admAddQ" placeholder="найти человека по имени или @username" value="${esc(bc.addQ || '')}" autocomplete="off">
        <div id="admAddRes"></div>
        <div class="adm-excl" id="admAdded"></div>
        <button class="adm-people-toggle" id="admPeopleToggle">${bc.showPeople ? 'скрыть список' : 'показать людей'} <span id="admPeopleN"></span></button>
        ${bc.showPeople ? `<input class="adm-people-search" id="admPeopleQ" placeholder="поиск по имени или @username" value="${esc(bc.q)}">
            <div class="adm-people" id="admPeople"></div>` : ''}

        <div class="adm-label">что отправить</div>
        <div class="adm-chips"><button class="adm-chip${bc.mode !== 'flow' ? ' is-on' : ''}" data-mode="msg">сообщение</button><button class="adm-chip${bc.mode === 'flow' ? ' is-on' : ''}" data-mode="flow">🔗 цепочку</button></div>
        ${bc.mode === 'flow' ? bcFlowPickHtml() : ''}
        <div id="admMsgPart"${bc.mode === 'flow' ? ' hidden' : ''}>
        ${tip ? `<div class="adm-tip"><div class="adm-tip-goal"><b>что лучше написать:</b> ${esc(tip.goal)}</div>
            <div class="adm-tip-text">${esc(fillTemplate(tip.text))}</div>
            <div class="adm-tip-meta">кнопка: «${esc(tip.btn.text)}»</div>
            <button class="adm-link" id="admTipApply">${bc.tipApplied === bc.segment ? 'вставить шаблон заново' : 'вставить шаблон'}</button></div>` : ''}
        <label class="adm-field"><span>текст</span><textarea id="admBcText" rows="7" placeholder="привет, [имя]! …">${esc(bc.text)}</textarea></label>
        <div class="adm-hint">[имя] заменится именем. можно &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;a href="…"&gt;ссылка&lt;/a&gt;</div>

        <div class="adm-label">кнопка под сообщением</div>
        <div class="adm-chips">${[['app', 'раздел приложения'], ['chat', 'общий чат'], ['url', 'ссылка / пост'], ['none', 'без кнопки']].map(([k, l]) => `<button class="adm-chip${bc.btnType === k ? ' is-on' : ''}" data-btn="${k}">${l}</button>`).join('')}</div>
        ${bc.btnType === 'app' ? `<label class="adm-field"><span>куда ведёт</span><select id="admBcSection">${APP_SECTIONS.map(([k, l]) => `<option value="${k}" ${bc.section === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${bc.section === 'hike' ? `<label class="adm-field"><span>какой хайк</span><select id="admBcBtnHike">${hikeOptions(bc.btnHike)}</select></label>` : ''}` : ''}
        ${bc.btnType === 'chat' ? `<div class="adm-hint">кнопка откроет общий чат клуба – t.me/yaltahikingchat</div>` : ''}
        ${bc.btnType === 'url' ? `<label class="adm-field"><span>ссылка</span><input id="admBcUrl" value="${esc(bc.url)}" placeholder="https://t.me/yaltahiking/450"></label>` : ''}
        ${bc.btnType !== 'none' ? `<label class="adm-field"><span>текст кнопки</span><input id="admBcBtnText" value="${esc(bc.btnText)}"></label>` : ''}

        <div class="adm-label">так увидят</div>
        <div class="adm-preview" id="admPreview"></div>
        </div>
        <div${bc.mode === 'flow' ? ' hidden' : ''}>
        <div class="adm-label">когда отправить</div>
        <div class="adm-chips"><button class="adm-chip${bc.when !== 'later' ? ' is-on' : ''}" data-when="now">сейчас</button><button class="adm-chip${bc.when === 'later' ? ' is-on' : ''}" data-when="later">⏰ запланировать</button></div>
        ${bc.when === 'later' ? `<label class="adm-field"><span>дата и время (по времени телефона)</span><input type="datetime-local" id="admBcAt" value="${esc(bc.sendAt)}" min="${localInputValue(new Date(Date.now() + 5 * 60000))}"></label>
            <div class="adm-hint">список получателей фиксируется сейчас. уйдёт в течение 5 минут после выбранного времени, в бот придёт отчёт</div>` : ''}
        </div>

        <div class="adm-row2"><button class="adm-ghost" id="admBcDraft">сохранить черновик</button><button class="adm-ghost" id="admBcTest">отправить себе</button></div>
        <button class="btn btn-yellow adm-primary" id="admBcSend">отправить</button>`;

    const update = () => { renderPreview(); updateSendLabel(); };
    body.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        haptic();
        bc.mode = b.dataset.mode;
        if (bc.mode === 'flow' && !flowsData) loadFlows(body).then(() => render());
        render();
    }));
    body.querySelectorAll('[data-bc-flow]').forEach(b => b.addEventListener('click', () => { haptic(); bc.flowId = b.dataset.bcFlow; render(); }));
    body.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => {
        haptic();
        const k = b.dataset.seg;
        const changedHike = (k === 'hike' || k === 'waitlist_date');
        if (bcHas(k)) {
            // сняли сегмент; если это был первый – первым становится следующий
            const rest = bcSegs().filter(x => x !== k);
            bc.segment = rest[0] || '';
            bc.extra = rest.slice(1);
        } else {
            if (!bc.segment) bc.segment = k; else bc.extra = [...(bc.extra || []), k];
            bc.excl = bc.excl.filter(x => x !== k);
            // пустое сообщение – сразу подставляем шаблон первого сегмента
            if (!bc.text.trim() && SEGMENT_TIPS[bc.segment]) applyTip(bc.segment);
        }
        bc.off = {};
        render();
        if (changedHike) refreshAudience(true);
    }));
    body.querySelectorAll('[data-excl]').forEach(b => b.addEventListener('click', () => {
        haptic();
        const k = b.dataset.excl;
        bc.excl = bc.excl.includes(k) ? bc.excl.filter(x => x !== k) : [...bc.excl, k];
        render();
    }));
    body.querySelectorAll('[data-unexcl]').forEach(b => b.addEventListener('click', () => { haptic(); bc.excl = bc.excl.filter(x => x !== b.dataset.unexcl); render(); }));
    body.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
        haptic();
        bc.kind = b.dataset.kind;
        body.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('is-on', x === b));
        updateAudienceViews(true);
    }));
    body.querySelector('#admExclToggle').addEventListener('click', () => { haptic(); bc.showExcl = !bc.showExcl; render(); });
    body.querySelector('#admPeopleToggle').addEventListener('click', () => { haptic(); bc.showPeople = !bc.showPeople; render(); });
    body.querySelector('#admPeopleQ')?.addEventListener('input', e => { bc.q = e.target.value; renderPeople(); });
    body.querySelector('#admPeople')?.addEventListener('change', e => {
        const id = e.target.dataset?.pid;
        if (!id) return;
        if (e.target.checked) delete bc.off[id]; else bc.off[id] = true;
        e.target.closest('.adm-person')?.classList.toggle('is-off', !e.target.checked);
        updateAudienceViews(false);
    });
    body.querySelectorAll('[data-btn]').forEach(b => b.addEventListener('click', () => { haptic(); bc.btnType = b.dataset.btn; render(); }));
    body.querySelector('#admBcHike')?.addEventListener('change', e => { bc.hikeDate = e.target.value; bc.off = {}; refreshAudience(true); });
    body.querySelector('#admBcWaitDate')?.addEventListener('change', e => { bc.waitDate = e.target.value; bc.off = {}; refreshAudience(true); });
    body.querySelector('#admAddQ')?.addEventListener('input', e => { bc.addQ = e.target.value; renderAddSearch(); });
    renderAddSearch();
    body.querySelector('#admBcSection')?.addEventListener('change', e => { bc.section = e.target.value; render(); });
    body.querySelector('#admBcBtnHike')?.addEventListener('change', e => { bc.btnHike = e.target.value; update(); });
    body.querySelector('#admBcText').addEventListener('input', e => { bc.text = e.target.value; update(); });
    body.querySelector('#admTipApply')?.addEventListener('click', async () => {
        haptic();
        if (bc.text.trim() && bc.tipApplied !== bc.segment && !(await confirmAsync('Заменить текст сообщения шаблоном?'))) return;
        applyTip(bc.segment);
        render();
    });
    body.querySelector('#admBcUrl')?.addEventListener('input', e => { bc.url = e.target.value; update(); });
    body.querySelector('#admBcBtnText')?.addEventListener('input', e => { bc.btnText = e.target.value; update(); });
    body.querySelector('#admBcTest').addEventListener('click', () => sendBroadcast(true));
    body.querySelectorAll('[data-when]').forEach(b => b.addEventListener('click', () => {
        haptic();
        bc.when = b.dataset.when;
        if (bc.when === 'later' && (!bc.sendAt || new Date(bc.sendAt) < new Date())) bc.sendAt = defaultSendAt();
        render();
    }));
    body.querySelector('#admBcAt')?.addEventListener('change', e => { bc.sendAt = e.target.value; updateSendLabel(); });
    body.querySelector('#admFeedback')?.addEventListener('click', async () => {
        haptic();
        if (bc.text.trim() && bc.tipApplied !== 'feedback' && !(await confirmAsync('Заменить текст сообщения шаблоном отзыва?'))) return;
        applyFeedbackPreset(recent[0]);
        render();
        refreshAudience(true);
    });
    const schedBox = body.querySelector('#admSched');
    if (bcSched && Date.now() - bcSched.at < 60000) renderSchedBox(schedBox); else loadSched(schedBox);
    body.querySelector('#admBcDraft').addEventListener('click', () => saveDraft());
    renderStatsBox(body.querySelector('#admStats'));
    const draftsBox = body.querySelector('#admDrafts');
    if (drafts) renderDraftsBox(draftsBox); else loadDrafts().then(() => { if (draftsBox.isConnected) renderDraftsBox(draftsBox); });
    body.querySelector('#admBcSend').addEventListener('click', () => sendBroadcast(false));
    update();
    if (audience) updateAudienceViews(true); else refreshAudience();
}

// Списки людей по сегментам грузим одним запросом и держим минуту. Для «участников хайка» – свой хайк.
let audSeq = 0;
// «ждут запись на дату»: даты листа ожидания с числом людей (приходят с сервера вместе с сегментами)
let waitlistDates = null;
function waitlistDateSelect() {
    const dates = Object.keys(waitlistDates || {}).sort();
    if (!dates.length) return `<select id="admBcWaitDate" disabled><option>${waitlistDates ? 'никто не ждёт' : 'загружаю даты…'}</option></select>`;
    return `<select id="admBcWaitDate">${dates.map(d => {
        const h = allHikes().find(x => x.date === d);
        const name = h && h.title && h.title.trim() ? h.title.trim() : (/🌧/.test(h?.emoji || '') ? '🌧️ перенесён' : 'готовим');
        return `<option value="${d}" ${bc.waitDate === d ? 'selected' : ''}>${dateLabel(d)} – ${esc(name)} · ждут ${waitlistDates[d]}</option>`;
    }).join('')}</select>`;
}
function waitlistDateHtml() {
    return `<label class="adm-field"><span>на какую дату ждут</span>${waitlistDateSelect()}</label>
        <div class="adm-hint">те, кто нажал «🔔 сообщить» на этой дате</div>`;
}

async function refreshAudience(force = false) {
    const seq = ++audSeq;
    const hikeDate = bcHas('hike') ? bc.hikeDate : '';
    const waitDate = bcHas('waitlist_date') ? (bc.waitDate || '') : '';
    if (!force && audience && Date.now() - audience.at < 60000 && audience.hikeDate === hikeDate && (audience.waitDate || '') === waitDate) return updateAudienceViews(true);
    const sum = root?.querySelector('#admSum');
    if (sum) sum.textContent = 'считаю получателей…';
    try {
        // для участников хайка – ещё полный список записавшихся: кому бот написать не может, покажем отдельно
        const [res, parts] = await Promise.all([
            adminCall('adminSegmentMembers', { hike_date: hikeDate, waitlist_date: waitDate }),
            hikeDate ? adminCall('adminParticipants', { date: hikeDate }).catch(() => null) : null,
        ]);
        if (seq !== audSeq) return;
        audience = { segments: res.segments || {}, people: res.people || {}, now: res.now || Math.floor(Date.now() / 1000), at: Date.now(), hikeDate, waitDate,
            hikeAll: parts?.participants || null };
        if (res.waitlist_dates) {
            waitlistDates = res.waitlist_dates;
            // первая дата с ожидающими – сразу выбрана
            if (bcHas('waitlist_date') && !bc.waitDate) {
                const first = Object.keys(waitlistDates).sort()[0];
                if (first) { bc.waitDate = first; render(); return refreshAudience(true); }
            }
            const sel = root?.querySelector('#admBcWaitDate');
            if (sel && bcHas('waitlist_date')) sel.outerHTML = waitlistDateSelect();
            root?.querySelector('#admBcWaitDate')?.addEventListener('change', e => { bc.waitDate = e.target.value; bc.off = {}; refreshAudience(true); });
        }
        updateAudienceViews(true);
    } catch (err) {
        if (seq !== audSeq) return;
        const el = root?.querySelector('#admSum');
        if (el) {
            el.innerHTML = `<span class="adm-error-inline">не удалось посчитать: ${esc(err.message)}</span> <button class="adm-link" id="admRecount">ещё раз</button>`;
            el.querySelector('#admRecount')?.addEventListener('click', () => refreshAudience(true));
        }
    }
}

// Обновляем цифры, итог и список на месте – без перерисовки формы (иначе поле теряет фокус и экран прыгает)
// участники хайка, которым бот написать не может (не запускали бота) – им писать лично
// ручное добавление адресатов: поиск по всем, кому бот может написать
function renderAddSearch() {
    const res = root?.querySelector('#admAddRes');
    const added = root?.querySelector('#admAdded');
    if (!res || !added) return;
    const people = audience?.people || {};
    const name = id => { const p = people[id] || {}; return (p.n || 'без имени') + (p.u ? ' @' + p.u : ''); };
    const ids = Object.keys(bc.add || {});
    added.innerHTML = ids.map(id => `<button class="adm-pill" data-unadd="${id}">${esc(name(id))} <b>×</b></button>`).join('');
    added.querySelectorAll('[data-unadd]').forEach(b => b.addEventListener('click', () => { haptic(); delete bc.add[b.dataset.unadd]; renderAddSearch(); updateAudienceViews(true); }));
    const q = String(bc.addQ || '').trim().toLowerCase().replace(/^@/, '');
    if (q.length < 2) { res.innerHTML = audience ? '' : '<div class="adm-muted" style="padding:6px 2px">загружаю людей…</div>'; return; }
    const hits = Object.keys(people).filter(id => !bc.add?.[id] && `${people[id].n || ''} ${people[id].u || ''}`.toLowerCase().includes(q)).slice(0, 8);
    res.innerHTML = hits.length ? `<div class="adm-add-res">${hits.map(id => `<button class="adm-add-hit" data-add="${id}"><span>${esc(name(id))}</span><b>+</b></button>`).join('')}</div>`
        : '<div class="adm-muted" style="padding:6px 2px">никого не нашёл (ищу среди тех, кому бот может написать)</div>';
    res.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
        haptic();
        bc.add = { ...(bc.add || {}), [b.dataset.add]: true };
        bc.addQ = '';
        const inp = root.querySelector('#admAddQ'); if (inp) inp.value = '';
        renderAddSearch();
        updateAudienceViews(true);
    }));
}

function renderUnreach() {
    const box = root?.querySelector('#admUnreach');
    if (!box) return;
    const all = bcHas('hike') && audience?.hikeDate === bc.hikeDate ? audience.hikeAll : null;
    if (!all) { box.innerHTML = ''; return; }
    const ok = new Set((audience.segments.hike || []).map(String));
    const list = all.filter(p => !ok.has(String(p.user_id)));
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="adm-unreach">
        <div class="adm-unreach-head">бот не может написать – ${list.length}</div>
        <div class="adm-hint">не запускали бота, Telegram не даёт написать им первым. напиши лично:</div>
        ${list.map(p => `<div class="adm-unreach-row"><span>${esc(p.name || 'без имени')}</span>${p.username
            ? `<button class="adm-link" data-tg-user="${esc(p.username)}">@${esc(p.username)}</button>` : '<small>нет username</small>'}</div>`).join('')}
    </div>`;
    box.querySelectorAll('[data-tg-user]').forEach(b => b.addEventListener('click', () => {
        haptic();
        const url = 'https://t.me/' + b.dataset.tgUser;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    }));
}

function updateAudienceViews(withList) {
    if (!root || !audience) return;
    const segs = audience.segments;
    root.querySelectorAll('[data-n]').forEach(el => { const l = segs[el.dataset.n]; el.textContent = l ? l.length : ''; });
    const r = bcRecipients();
    bc.count = r.final.length;
    renderUnreach();
    const sum = root.querySelector('#admSum');
    if (sum) sum.innerHTML = `получат <b>${r.final.length}</b>${r.manual.length ? ` · вручную −${r.manual.length}` : ''}${r.bySeg.length ? ` · сегментами −${r.bySeg.length}` : ''}${r.byPref.length ? ` · по их настройкам −${r.byPref.length}` : ''}`;
    const pn = root.querySelector('#admPeopleN');
    if (pn) pn.textContent = `(${r.base.length})`;
    if (withList) renderPeople();
    renderAddSearch();
    updateSendLabel();
}

function renderPeople() {
    const box = root?.querySelector('#admPeople');
    if (!box || !audience) return;
    const r = bcRecipients();
    const q = (bc.q || '').trim().toLowerCase().replace(/^@/, '');
    const people = audience.people;
    const list = r.base.filter(id => {
        if (!q) return true;
        const p = people[id] || {};
        return (p.n || '').toLowerCase().includes(q) || (p.u || '').toLowerCase().includes(q);
    });
    const shown = list.slice(0, bc.peopleLimit || 100);
    box.innerHTML = shown.length ? shown.map(id => {
        const p = people[id] || {};
        const exSeg = r.exBy[id];
        const byPref = !exSeg && r.prefBlocks(id);
        const locked = exSeg || byPref;
        return `<label class="adm-person${locked || bc.off[id] ? ' is-off' : ''}">
            <input type="checkbox" data-pid="${id}" ${locked ? 'disabled' : ''} ${!locked && !bc.off[id] ? 'checked' : ''}>
            <span class="adm-person-main"><b>${esc(p.n || 'без имени')}</b>${p.u ? ` <i>@${esc(p.u)}</i>` : ''}
                <small>${exSeg ? `исключён: ${esc(SEG_LABEL[exSeg] || exSeg)}` : byPref ? `попросил: ${esc(PREF_LABEL[p.mp] || p.mp)}` : esc(personMeta(p, audience.now))}</small></span>
        </label>`;
    }).join('') + (list.length > shown.length ? `<button class="adm-link adm-people-more" id="admPeopleMore">показать ещё ${Math.min(100, list.length - shown.length)}</button>` : '')
        : '<div class="adm-muted" style="padding:10px 4px">никого</div>';
    box.querySelector('#admPeopleMore')?.addEventListener('click', () => { bc.peopleLimit = (bc.peopleLimit || 100) + 100; renderPeople(); });
}

function buttonPayload() {
    if (bc.btnType === 'none') return null;
    const text = bc.btnText.trim() || '▶ открыть';
    if (bc.btnType === 'url') return { type: 'url', url: bc.url.trim(), text };
    if (bc.btnType === 'chat') return { type: 'url', url: CHAT_URL, text };
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
    if (!b) return;
    const n = bc.count ? ` (${bc.count} чел.)` : '';
    b.textContent = bc.when === 'later' && bc.sendAt ? `запланировать на ${fmtWhen(sendAtTs())}${n}` : `отправить${n}`;
}

// цепочка вместо одиночного сообщения: первый шаг уходит выбранным людям, дальше – по кнопкам
function bcFlowPickHtml() {
    if (!flowsData || flowsData.loading) return '<div class="adm-muted" style="padding:8px 2px">загружаю цепочки…</div>';
    if (flowsData.error) return `<div class="adm-error-inline">цепочки не загрузились: ${esc(flowsData.error)}</div>`;
    const list = (flowsData.list || []).filter(x => x.flow.enabled !== false);
    if (!list.length) return '<div class="adm-hint">включённых цепочек нет – создай или включи её во вкладке «🔗 цепочки»</div>';
    const cur = list.find(x => x.id === bc.flowId);
    const first = cur ? cur.flow.nodes?.[cur.flow.start] : null;
    return `<div class="adm-chips">${list.map(x => `<button class="adm-chip${bc.flowId === x.id ? ' is-on' : ''}" data-bc-flow="${esc(x.id)}">${esc(x.flow.title)}</button>`).join('')}</div>
        ${first ? `<div class="adm-label">первое сообщение</div><div class="adm-preview"><div class="adm-bubble">${esc(first.text).replace(/\n/g, '<br>')}</div>
            ${(first.buttons || []).map(b => `<div class="adm-bubble-btn">${esc(b.label)}</div>`).join('')}</div>
            ${cur.flow.trigger === 'postpone' ? '<div class="adm-hint">эта цепочка обычно уходит сама, когда ставишь «🌧️ дата перенесена». отсюда её можно отправить и вручную – выбранным людям</div>' : ''}
            <div class="adm-hint">дальше бот сам ведёт по кнопкам. результат – на карте во вкладке «🔗 цепочки»</div>` : '<div class="adm-hint">выбери цепочку</div>'}`;
}
async function sendFlowBroadcast(test) {
    if (!bc.flowId) return toast('выбери цепочку', true);
    const r = audience ? bcRecipients() : null;
    if (!test) {
        if (!r) return toast('ещё считаю получателей', true);
        if (!r.final.length) return toast('некому отправлять', true);
        if (!(await confirmAsync(`Запустить цепочку для ${r.final.length} чел.? Отменить будет нельзя.`))) return;
    }
    const el = root.querySelector(test ? '#admBcTest' : '#admBcSend');
    const label = el.textContent;
    el.disabled = true;
    el.textContent = 'отправляю…';
    try {
        const res = await adminCall('adminFlowSend', test ? { id: bc.flowId, test: 'yes' } : { id: bc.flowId, ids: JSON.stringify(r.final) });
        haptic();
        toast(test ? (res.sent ? 'пришло вам в бот ✓' : 'не дошло – откройте бота и нажмите /start') : `цепочка запущена: ${res.sent} из ${res.total}`, !res.sent);
        if (!test) flowsData = null;
    } catch (err) { toast(err.message, true); }
    el.disabled = false;
    el.textContent = label;
}

async function sendBroadcast(test) {
    if (bc.mode === 'flow') return sendFlowBroadcast(test);
    if (!bc.text.trim()) return toast('напишите текст', true);
    const btn = buttonPayload();
    if (btn && btn.type === 'url' && !/^https:\/\//.test(btn.url)) return toast('ссылка должна начинаться с https://', true);
    if (btn && btn.type === 'app' && !btn.startapp) return toast('выберите, куда ведёт кнопка', true);
    const r = audience ? bcRecipients() : null;
    const later = !test && bc.when === 'later';
    if (!test) {
        if (!r) return toast('ещё считаю получателей', true);
        if (!r.final.length) return toast('некому отправлять', true);
        const extra = [r.manual.length ? `вручную исключено ${r.manual.length}` : '', r.bySeg.length ? `сегментами исключено ${r.bySeg.length}` : ''].filter(Boolean).join(', ');
        if (later) {
            if (!bc.sendAt || sendAtTs() < Date.now() / 1000 + 120) return toast('выберите время хотя бы через пару минут', true);
            const ok = await confirmAsync(`Запланировать на ${fmtWhen(sendAtTs())}: ${r.final.length} чел.${extra ? ` (${extra})` : ''}? До отправки можно отменить.`);
            if (!ok) return;
        } else {
            const ok = await confirmAsync(`Отправить сообщение: ${r.final.length} чел.${extra ? ` (${extra})` : ''}? Отменить будет нельзя.`);
            if (!ok) return;
        }
    }
    const el = root.querySelector(test ? '#admBcTest' : '#admBcSend');
    const label = el.textContent;
    el.disabled = true;
    el.textContent = test ? 'отправляю…' : later ? 'планирую…' : 'отправляю… не закрывайте';
    const segLabel = [bcSegs().map(k => (SEG_LABEL[k] || k) + (k === 'hike' ? ' ' + bc.hikeDate : k === 'waitlist_date' ? ' ' + bc.waitDate : '')).join(' + '),
        Object.keys(bc.add || {}).length ? `+ ${Object.keys(bc.add).length} вручную` : '',
        ...bc.excl.map(k => '− ' + (SEG_LABEL[k] || k)), r && r.manual.length ? `− ${r.manual.length} вручную` : ''].filter(Boolean).join(' ');
    try {
        const res = await adminCall(later ? 'adminScheduleBroadcast' : 'adminBroadcast', test ? {
            segment: 'test', text: bc.text.trim(), button: JSON.stringify(btn)
        } : {
            segment: 'custom', ids: JSON.stringify(r.final), segment_label: segLabel, hike_date: bc.hikeDate, kind: bc.kind,
            text: bc.text.trim(), button: JSON.stringify(btn), ...(later ? { send_at: sendAtTs() } : {})
        });
        haptic();
        if (test) toast(res.sent ? 'пришло вам в бот ✓' : 'не дошло – откройте бота и нажмите /start', !res.sent);
        else {
            if (later) { toast(`запланировано на ${fmtWhen(sendAtTs())} ✓`); bcSched = null; }
            else toast(`доставлено ${res.sent} из ${res.total}`);
            // отправленный черновик больше не нужен
            if (bc.draftId) {
                const id = bc.draftId;
                cloud.del(['bcd_' + id, 'bct_' + id]).then(loadDrafts).then(list => cloud.set('bc_drafts', JSON.stringify(list.filter(d => d.id !== id)))).then(loadDrafts).catch(() => {});
            }
            audience = null;
            bc = { ...newBroadcast(), count: null, showSched: later };
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
