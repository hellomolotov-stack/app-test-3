import { mountAchievementNotify } from './achievements-notify.js';
// js/ui/admin.js – админка клуба: хайки (создание, правка, GPX-трек, участники) и рассылки.
// Кнопку видят только ADMIN_USERNAMES, но это лишь удобство: каждое действие сервер
// (Apps Script, handleAdmin) проверяет по подписи Telegram initData.
import { state } from '../state.js';
import { haptic, tg } from '../utils.js';
import { REGISTRATION_API_URL } from '../config.js';
import { renderAnalytics } from './admin-analytics.js';
import { loadAllParticipants } from '../firebase.js';
import { previewHikeTrack, findCatalogRoute, catalogRouteTrack, fetchGoingFromServer, capacityFor } from './calendar.js';
import { isRedesign } from '../redesign.js';
import { loadClubContent, applyClubContent, saveClubContent } from '../club-content.js';
import { renderAdmissionAdmin } from './admission-admin.js';
import { renderAchievementsAdmin } from './achievements-admin.js';
import { fetchWithTimeout } from '../net.js';
import { isAdminUser } from './admin-entry.js';
export { isAdminUser };

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
let mmDraft = null;
let homepageBusy = false;


export function openAdmin(tab) {
    if (!isAdminUser()) return;
    closeAdmin();
    // новый дизайн открывается обзором «сегодня»
    view = { tab: tab || (isRedesign() ? 'today' : 'hikes') };
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
    const tabs = [...(isRedesign() ? [['today', 'сегодня']] : []), ['hikes', '🏔 хайки'], ['achievements', 'ачивки'], ['analytics', 'аналитика'], ['broadcast', '📨 рассылка'], ['flows', '🔗 цепочки'], ['newcomers', '💳 продажа карты'], ['plus1', '🤝 +1'], ['pass', '🔑 место'], ['stories', '📸 сторис'], ['surveys', '📋 опросы'], ['home', 'главная'], ['admissions', 'заявки']];
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
    else if (view.tab === 'today') renderToday(body);
    else if (view.tab === 'analytics') { if (isRedesign()) renderRdAnalytics(body); else renderAnalytics(body, adminCall); }
    else if (view.tab === 'broadcast') renderBroadcast(body);
    else if (view.tab === 'flows') renderFlows(body);
    else if (view.tab === 'newcomers') renderNewcomers(body);
    else if (view.tab === 'plus1') renderPlus1(body);
    else if (view.tab === 'pass') renderPass(body);
    else if (view.tab === 'stories') renderStoriesAdmin(body);
    else if (view.tab === 'surveys') renderSurveysAdmin(body);
    else if (view.tab === 'home') renderHomepage(body);
    else if (view.tab === 'admissions') renderAdmissionAdmin(body);
    else if (view.tab === 'achievements') { const achHike = view.achHike; delete view.achHike; renderAchievementsAdmin(body, { hikeDate: achHike }); }
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

// ---------- новый дизайн: обзор «сегодня» ----------
// что сделать сегодня: ближайшее событие и действия по нему, дела после прошедших, разделы
const RD_ICON = {
    send: '<path d="M22 3L11 14"/><path d="M22 3l-7 19-4-8-8-4z"/>',
    rain: '<path d="M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 6a4.5 4.5 0 0 1-.5 9z"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    medal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    flows: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="12" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8.5 6h3a3 3 0 0 1 3 3v.5M8.5 18h3a3 3 0 0 0 3-3v-.5"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
    plus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>',
    hike: '<path d="M3 20l6-16 4 9 3-5 5 12z"/>',
    home: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 13h8M8 16h5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
    form: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
};
const rdIcon = (k, color = 'currentColor') => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RD_ICON[k]}</svg>`;

function renderToday(body) {
    const today = todayStr();
    const titled = allHikes().filter(h => h.title && h.title.trim() && !isYes(h.cancelled));
    const next = titled.find(h => h.date >= today);
    // в таблице часто стоят будущие даты без названия – их тоже показываем, чтобы было что заполнить
    const slot = next ? null : allHikes().find(h => h.date >= today && !isYes(h.cancelled));
    const lastHike = titled.filter(h => h.date < today && !isYes(h.city)).pop();
    const lastAny = titled.filter(h => h.date < today).pop();
    const kind = next ? (/🌧/.test(next.emoji || '') ? 'rain' : isYes(next.city) ? 'city' : isYes(next.woman) ? 'woman' : 'hike') : 'hike';
    const row = (key, icon, color, title, sub) => `<button type="button" class="rd-adm-row" data-rd-go="${key}"><span class="rd-adm-ico" style="color:${color};background:${color}22">${rdIcon(icon)}</span><span class="rd-adm-row-main"><b>${title}</b><small>${sub}</small></span><i>›</i></button>`;
    const tile = (key, icon, color, title, sub) => `<button type="button" class="rd-adm-tile" data-rd-go="${key}" style="background:radial-gradient(120% 100% at 100% 0%, ${color}33 0%, #15181D 70%)">${rdIcon(icon, color)}<span><b>${title}</b><small>${sub}</small></span></button>`;
    body.innerHTML = `
        ${next ? `<div class="rd-adm-next is-${kind}">
            <span class="rd-adm-when"><i></i>${esc(dateLabel(next.date))}${next.start_time ? ' · ' + esc(next.start_time) : ''}</span>
            <div class="rd-adm-next-top"><b>${esc(next.title)}</b><span id="rdAdmCount"></span></div>
            <div class="rd-adm-bar"><span id="rdAdmBar" style="width:0%"></span></div>
            <small id="rdAdmLast">смотрю записи…</small>
            <div class="rd-adm-acts">
                <button type="button" class="rd-adm-act is-main" data-rd-go="write">${rdIcon('send')}написать идущим</button>
                <button type="button" class="rd-adm-act" data-rd-go="edit">${rdIcon('rain', '#8FCBF0')}перенести</button>
                <button type="button" class="rd-adm-act" data-rd-go="edit">${rdIcon('edit')}изменить</button>
            </div>
            <small class="rd-adm-note">перенос – в карточке хайка: «дата перенесена» сама запустит цепочку и бот спросит у записавшихся, как им удобнее</small>
        </div>` : slot ? `<button type="button" class="rd-adm-slot" data-rd-go="slot"><span class="rd-adm-when"><i></i>${esc(dateLabel(slot.date))}${slot.start_time ? ' · ' + esc(slot.start_time) : ''}</span><b>впереди дата без названия</b><small>заполни карточку – и хайк появится в приложении</small><span class="rd-adm-slot-cta">заполнить ›</span></button>` : '<div class="adm-muted rd-adm-empty">впереди пока нет событий – добавь хайк во вкладке «хайки»</div>'}
        ${lastHike || lastAny ? `<div class="rd-adm-sec">ждёт тебя</div><div class="rd-adm-list">
            ${lastHike ? row('badges', 'medal', '#C7B8E6', `значки за ${esc(lastHike.title.replace(/^хайк\s+(на|по|в)\s+/i, ''))}`, `${esc(dateLabel(lastHike.date))} · отметь, кто пришёл`) : ''}
            ${lastAny ? row('feedback', 'chat', '#6FC1F5', `отзывы: ${esc(lastAny.title)}`, 'кнопка в сообщении ведёт в общий чат') : ''}
        </div>` : ''}
        <div class="rd-adm-sec">связь с людьми</div>
        <div class="rd-adm-tiles">
            ${tile('broadcast', 'send', '#D9FD19', 'рассылка', '25 сегментов, шаблоны, отложенная отправка')}
            ${tile('flows', 'flows', '#C7B8E6', 'цепочки', 'сценарии бота с кнопками и автозапуском')}
            ${tile('newcomers', 'card', '#6FA8DC', 'продажа карты', 'личная цена с учётом оплаченных билетов')}
            ${tile('plus1', 'plus', '#F38CC6', '+1', 'приглашения друзей владельцев карты')}
        </div>
        <div class="rd-adm-sec">клуб</div>
        <div class="rd-adm-list">
            ${row('hikes', 'hike', '#D9FD19', 'хайки и события', 'новый хайк, трек из GPX, обложка, места')}
            ${row('achievements', 'medal', '#C7B8E6', 'значки', 'выдача пачкой, редкость, гравировка')}
            ${row('home', 'home', '#F5F5F7', 'главная приложения', 'обновления, саммари, цифры клуба')}
            ${row('analytics', 'chart', '#F6B26B', 'аналитика', 'воронка до оплаты · дайджест в 20:30')}
            ${row('admissions', 'form', '#93C47D', 'заявки', 'анкеты вступления')}
            ${row('pass', 'key', '#A3A8AE', 'место', 'ручная запись на хайк')}
        </div>`;
    body.querySelectorAll('[data-rd-go]').forEach(b => b.addEventListener('click', () => {
        haptic();
        const go = b.dataset.rdGo;
        if (go === 'write' && next) {
            bc = { ...newBroadcast(), segment: 'hike', extra: [], hikeDate: next.date, kind: 'important', btnType: 'app', section: 'hike', btnHike: next.date, btnText: 'детали хайка' };
            view = { tab: 'broadcast' }; render(); refreshAudience(true); return;
        }
        if (go === 'edit' && next) { openEditor(next.date); return; }
        if (go === 'slot' && slot) { openEditor(slot.date); return; }
        if (go === 'badges' && lastHike) { view = { tab: 'achievements', achHike: lastHike.date }; render(); return; }
        if (go === 'feedback' && lastAny) {
            bc = { ...newBroadcast() };
            applyFeedbackPreset(lastAny);
            view = { tab: 'broadcast' }; render(); refreshAudience(true); return;
        }
        view = { tab: go }; render();
    }));
    if (next) fetchGoingFromServer([next.date], true).then(g => {
        const list = (g && g[next.date]) || [];
        if (!root || view.tab !== 'today') return;
        const cap = capacityFor(next);
        const n = list.length;
        const cnt = root.querySelector('#rdAdmCount');
        if (cnt) cnt.innerHTML = `${n}<small> / ${cap}</small>`;
        const bar = root.querySelector('#rdAdmBar');
        if (bar) bar.style.width = Math.min(100, Math.round(n / cap * 100)) + '%';
        const last = list.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        const lastEl = root.querySelector('#rdAdmLast');
        if (lastEl) {
            if (last?.timestamp) {
                const h = Math.max(1, Math.floor((Date.now() - last.timestamp) / 3600000));
                lastEl.textContent = `последняя запись – ${last.name || 'участник'}, ${h < 24 ? h + ' ч' : Math.floor(h / 24) + ' дн.'} назад`;
            } else lastEl.textContent = n ? '' : 'пока никто не записался';
        }
    }).catch(() => { const el = root?.querySelector('#rdAdmLast'); if (el) el.textContent = ''; });
}

// ---------- главная: ручные цифры и журнал обновлений ----------
function loadHomepage() {
    if (homepageLoading) return;
    homepageLoading = true;
    loadClubContent().then(data => {
        homepage = { ...data, metrics: { ...data.metrics }, updates: data.updates.map(item => ({ ...item })), masterminds: (data.masterminds || []).map(item => ({ ...item })) };
        applyClubContent(data);
    }).catch(error => { homepage = { error: error.message }; })
        .finally(() => { homepageLoading = false; if (root && view.tab === 'home') render(); });
}

// ---------- аналитика в новом дизайне ----------
// сверху – живые записи на ближайшие события (из /api/going), ниже – серверная воронка как была
const RD_AN_COLORS = ['#D9FD19', '#6FC1F5', '#F38CC6'];
const RD_WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function renderRdAnalytics(body) {
    const today = todayStr();
    const events = allHikes().filter(h => h.title && h.title.trim() && !isYes(h.cancelled) && h.date >= today).slice(0, 3);
    const m = state.metrics || {};
    body.innerHTML = `
        <div class="rd-adm-sec">записи на ближайшие события</div>
        <div id="rdAnLive">${events.length ? '<div class="adm-muted rd-adm-empty">смотрю записи…</div>' : '<div class="adm-muted rd-adm-empty">впереди нет событий с названием</div>'}</div>
        <div class="rd-adm-sec">путь гостя до оплаты</div>
        <div id="rdAnSrv"></div>
        <div class="rd-an-digest"><span class="rd-adm-ico" style="color:#F6B26B;background:#F6B26B22">${rdIcon('chart')}</span><span class="rd-adm-row-main"><b>дайджест около 20:30</b><small>каждый вечер график и цифры приходят в бот</small></span></div>
        ${Number(m.hikes) > 0 ? `<div class="rd-adm-sec">клуб за всё время</div>
        <div class="rd-an-club">${[['hikes', 'хайков'], ['kilometers', 'км'], ['locations', 'локаций'], ['meetings', 'знакомств']].map(([k, l]) => `<div><b>${esc(m[k])}</b><span>${l}</span></div>`).join('')}</div>` : ''}`;
    renderAnalytics(body.querySelector('#rdAnSrv'), adminCall);
    if (!events.length) return;
    fetchGoingFromServer(events.map(h => h.date), true).then(g => {
        const box = root?.querySelector('#rdAnLive');
        if (!box || view.tab !== 'analytics') return;
        if (!g) { box.innerHTML = '<div class="adm-error-inline">не удалось получить записи – попробуй открыть вкладку ещё раз</div>'; return; }
        const days = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d.getTime()); }
        const dayIdx = ts => { const t = new Date(ts); t.setHours(0, 0, 0, 0); return days.indexOf(t.getTime()); };
        const per = events.map(h => {
            const list = g[h.date] || [];
            const byDay = days.map(() => 0);
            list.forEach(p => { const i = p.timestamp ? dayIdx(p.timestamp) : -1; if (i >= 0) byDay[i]++; });
            return { h, n: list.length, byDay, cap: capacityFor(h) };
        });
        const sumDay = i => per.reduce((s, e) => s + e.byDay[i], 0);
        const total = days.reduce((s, _, i) => s + sumDay(i), 0);
        const max = Math.max(1, ...days.map((_, i) => sumDay(i)));
        box.innerHTML = `<div class="rd-an-card">
            <div class="rd-an-big"><b>${total}</b><span>${total === 1 ? 'новая запись' : 'новых записей'} за 7 дней</span></div>
            <div class="rd-an-chart">${days.map((d, i) => `<div class="rd-an-col"><small>${sumDay(i) || ''}</small><div class="rd-an-stack">${per.map((e, k) => e.byDay[i] ? `<i style="height:${e.byDay[i] / max * 100}%;background:${RD_AN_COLORS[k]}"></i>` : '').join('')}</div><span${i === 6 ? ' class="is-today"' : ''}>${i === 6 ? 'сег' : RD_WD[new Date(d).getDay()]}</span></div>`).join('')}</div>
            <div class="rd-an-legend">${per.map((e, k) => `<span><i style="background:${RD_AN_COLORS[k]}"></i>${esc(e.h.title)}</span>`).join('')}</div>
            <small class="rd-an-note">считаются те, кто записан сейчас – отменившие запись сюда не попадают</small>
        </div>
        <div class="rd-an-card">
            <div class="rd-an-card-h">заполненность</div>
            ${per.map((e, k) => `<div class="rd-an-fill"><div class="rd-an-fill-top"><span><b>${esc(e.h.title)}</b><small>${esc(dateLabel(e.h.date))}</small></span><em${e.n >= e.cap ? ' class="is-full"' : ''}>${e.n} / ${e.cap}${e.n >= e.cap ? ' · полный' : ''}</em></div>
                <div class="rd-adm-bar"><span style="width:${Math.min(100, Math.round(e.n / e.cap * 100))}%;background:${RD_AN_COLORS[k]}"></span></div></div>`).join('')}
        </div>`;
    }).catch(() => {});
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
    mmDraft = mmDraft || { index: null, date: todayStr(), title: '', link: '' };
    const fields = [['hikes', 'хайков'], ['locations', 'локаций'], ['kilometers', 'километров'], ['meetings', 'знакомств']];
    body.innerHTML = `
        <div class="adm-label">клуб в цифрах</div>
        <form id="admMetricsForm">
            <div class="adm-metrics-fields">${fields.map(([key, label]) => `<label class="adm-field"><span>${label}</span><input name="${key}" data-metric-key="${key}" type="number" min="0" max="1000000000" step="${key === 'kilometers' ? 'any' : '1'}" inputmode="${key === 'kilometers' ? 'decimal' : 'numeric'}" value="${esc(homepage.metrics[key])}"${homepage.metricsMode === 'automatic' && key !== 'locations' ? ' readonly' : ''} required></label>`).join('')}</div>
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
            </div>`).join('') : '<div class="adm-empty">пока нет обновлений</div>'}</div>
        <div class="adm-label">🧠 мастермайнды</div>
        <form id="admMmForm">
            <label class="adm-field"><span>дата</span><input id="admMmDate" type="date" value="${esc(mmDraft.date)}" required></label>
            <label class="adm-field"><span>название</span><input id="admMmTitle" type="text" maxlength="300" value="${esc(mmDraft.title)}" placeholder="о чём говорили" required></label>
            <label class="adm-field"><span>ссылка на саммари</span><input id="admMmLink" type="url" maxlength="2000" value="${esc(mmDraft.link)}" placeholder="https://…" required></label>
            <button type="submit" class="btn btn-yellow adm-primary">${mmDraft.index === null ? 'добавить мастермайнд' : 'сохранить мастермайнд'}</button>
            ${mmDraft.index !== null ? '<button type="button" class="adm-link" id="admMmCancel">отменить редактирование</button>' : ''}
        </form>
        <div class="adm-content-updates">${homepage.masterminds.length ? homepage.masterminds.map((item, index) => `
            <div class="adm-content-update">
                <div class="adm-content-update-date">${esc(dateLabel(item.date))} · ${esc(item.date.slice(0, 4))}</div>
                <div class="adm-content-update-text"><b>${esc(item.title)}</b><br><a href="${esc(item.link)}" target="_blank" rel="noopener" style="word-break:break-all;opacity:.7">${esc(item.link.length > 60 ? item.link.slice(0, 60) + '…' : item.link)}</a></div>
                <div class="adm-content-update-actions"><button class="adm-link" data-edit-mm="${index}">редактировать</button><button class="adm-link is-danger" data-remove-mm="${index}">убрать</button></div>
            </div>`).join('') : '<div class="adm-empty">пока нет мастермайндов</div>'}</div>`;
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
    body.querySelector('#admMmDate').addEventListener('input', event => { mmDraft.date = event.target.value; });
    body.querySelector('#admMmTitle').addEventListener('input', event => { mmDraft.title = event.target.value; });
    body.querySelector('#admMmLink').addEventListener('input', event => { mmDraft.link = event.target.value; });
    body.querySelector('#admMmForm').addEventListener('submit', event => {
        event.preventDefault();
        const item = { date: mmDraft.date, title: mmDraft.title.trim(), link: mmDraft.link.trim() };
        if (!item.title) return toast('напиши название', true);
        if (!/^https?:\/\//.test(item.link)) return toast('ссылка должна начинаться с https://', true);
        const items = homepage.masterminds.slice();
        if (mmDraft.index === null) items.unshift(item);
        else items[mmDraft.index] = item;
        saveHomepageSection('masterminds', items);
    });
    body.querySelector('#admMmCancel')?.addEventListener('click', () => { mmDraft = null; render(); });
    body.querySelectorAll('[data-edit-mm]').forEach(button => button.addEventListener('click', () => {
        mmDraft = { index: Number(button.dataset.editMm), ...homepage.masterminds[Number(button.dataset.editMm)] };
        render();
        root.querySelector('#admMmTitle')?.focus();
    }));
    body.querySelectorAll('[data-remove-mm]').forEach(button => button.addEventListener('click', async () => {
        if (!await confirmAsync('Убрать этот мастермайнд с главной?')) return;
        await saveHomepageSection('masterminds', homepage.masterminds.filter((_, index) => index !== Number(button.dataset.removeMm)));
    }));
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
    const mmToRestore = mmDraft;
    homepageBusy = true;
    render();
    try {
        const saved = await saveClubContent(section, value, editing.revisions[section], tg?.initData || '');
        editing[section] = saved;
        if (section === 'updates') updateDraft = null;
        if (section === 'masterminds') mmDraft = null;
        // Refresh only the saved section's version, preserving other unsaved fields.
        try {
            const fresh = await loadClubContent();
            editing[section] = fresh[section];
            editing.revisions[section] = fresh.revisions[section];
        } catch {
            homepage = { error: 'сохранено, но не удалось обновить редактор — загрузи данные ещё раз' };
        }
        toast(section === 'metrics' ? 'цифры сохранены' : section === 'masterminds' ? 'мастермайнды сохранены' : 'обновления сохранены');
        haptic();
    } catch (error) {
        updateDraft = draftToRestore;
        mmDraft = mmToRestore;
        toast(error.message, true);
    } finally {
        homepageBusy = false;
        if (root && view.tab === 'home') render();
    }
}

// ---------- сторис клуба (lib/club-stories.js, js/ui/club-stories.js) ----------
// список: сверху черновики (автоматические – новый владелец карты, саммари, значки за хайк), ниже опубликованные
let storiesAdm = null, storyDraft = null, storiesBusy = false;
const ST_TYPES = [['member', '🎉 новый член клуба'], ['app', '✨ новое в приложении'], ['event', '📅 событие'], ['summary', '🧠 саммари'], ['letter', '✉️ письмо Макса'], ['badges', '🏅 значки'], ['custom', '✍️ свой']];
const ST_ACTIONS = [['', 'без кнопки'], ['hike', 'записаться на хайк'], ['card', 'карта интеллигента'], ['badges', 'твои значки'], ['calendar', 'календарь'], ['circle', 'твои связи'], ['url', 'ссылка…']];
async function storiesCall(action, story = null) {
    const r = await fetch('/api/club-content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ action, story, initData: tg?.initData || '' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'не удалось');
    return d;
}
function loadStoriesAdm() {
    storiesCall('stories').then(d => { storiesAdm = d; if (d.created) toast(`новых автоматических сторис: ${d.created}`); })
        .catch(e => { storiesAdm = { error: e.message }; })
        .finally(() => { if (root && view.tab === 'stories') render(); });
}
function storyFromDraft() {
    const a = storyDraft.action === 'url' ? (storyDraft.url ? 'url:' + storyDraft.url.trim() : '') : storyDraft.action;
    return { id: storyDraft.id || '', type: storyDraft.type, title: storyDraft.title, text: storyDraft.text, image: storyDraft.image.trim(),
        button: a ? { label: storyDraft.label || ST_ACTIONS.find(x => x[0] === storyDraft.action)?.[1] || 'подробнее', action: a } : null,
        days: storyDraft.days, pinned: storyDraft.pinned };
}
function editStory(s) {
    const act = s?.button?.action || '';
    storyDraft = { id: s?.id || '', type: s?.type || 'app', title: s?.title || '', text: s?.text || '', image: s?.image || '',
        action: act.startsWith('url:') ? 'url' : act.startsWith('mm:') ? act : act, url: act.startsWith('url:') ? act.slice(4) : '',
        label: s?.button?.label || '', days: s?.days || 7, pinned: !!s?.pinned, status: s?.status || 'new' };
}
async function saveStory(op) {
    if (storiesBusy) return;
    if (!storyDraft.title.trim()) return toast('напиши заголовок', true);
    storiesBusy = true; render();
    try {
        storiesAdm = await storiesCall('story_save', { ...storyFromDraft(), op });
        toast(op === 'publish' ? 'сторис опубликована' : op === 'hide' ? 'сторис убрана' : 'сохранено'); haptic();
        storyDraft = null;
    } catch (e) { toast(e.message, true); }
    finally { storiesBusy = false; if (root && view.tab === 'stories') render(); }
}
function renderStoriesAdmin(body) {
    if (!storiesAdm) { body.innerHTML = '<div class="adm-muted" style="padding:12px 2px">загружаю сторис и ищу новые события…</div>'; loadStoriesAdm(); return; }
    if (storiesAdm.error) { body.innerHTML = `<div class="adm-empty">${esc(storiesAdm.error)}</div><button class="adm-link" id="admStRetry">ещё раз</button>`; body.querySelector('#admStRetry').addEventListener('click', () => { storiesAdm = null; render(); }); return; }
    const list = storiesAdm.stories || [];
    const drafts = list.filter(s => s.status === 'draft'), live = list.filter(s => s.status === 'published');
    const item = s => `<div class="adm-content-update">
        <div class="adm-content-update-date">${s.status === 'draft' ? (s.source === 'auto' ? '🤖 автоматический черновик' : '📝 черновик') : s.expired ? '⌛ срок вышел' : s.pinned ? '📌 закреплена' : `в ленте ещё ${s.days} дн.`}${s.status === 'published' ? ` · 👀 ${s.views}` : ''} · ${esc(ST_TYPES.find(t => t[0] === s.type)?.[1] || s.type)}</div>
        <div class="adm-content-update-text"><b>${esc(s.title)}</b>${s.text ? '<br>' + esc(s.text.slice(0, 160)) : ''}</div>
        <div class="adm-content-update-actions">${s.status === 'draft' ? `<button class="adm-link" data-st-pub="${esc(s.id)}">опубликовать</button>` : ''}<button class="adm-link" data-st-view="${esc(s.id)}">посмотреть</button><button class="adm-link" data-st-edit="${esc(s.id)}">изменить</button><button class="adm-link is-danger" data-st-hide="${esc(s.id)}">${s.status === 'draft' ? 'не публиковать' : 'убрать'}</button></div>
    </div>`;
    const d = storyDraft;
    body.innerHTML = `
        ${d ? `<form class="adm-content-form" id="admStForm">
            <div class="adm-label">${d.id ? 'сторис' : 'новая сторис'}</div>
            <label class="adm-field"><span>тип</span><select id="admStType">${ST_TYPES.map(([k, l]) => `<option value="${k}"${d.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="adm-field"><span>заголовок</span><input id="admStTitle" maxlength="120" value="${esc(d.title)}" placeholder="коротко и крупно" required></label>
            <label class="adm-field"><span>текст</span><textarea id="admStText" rows="4" maxlength="600">${esc(d.text)}</textarea></label>
            <label class="adm-field"><span>картинка – ссылка https:// (для «нового члена клуба» – карта, для «значков» – значок, для «нового в приложении» – скриншот). можно пусто</span><input id="admStImage" value="${esc(d.image)}" placeholder="https://…"></label>
            <label class="adm-field"><span>кнопка</span><select id="admStAction">${(d.action.startsWith('mm:') || d.action.startsWith('letter:') ? [[d.action, d.action.startsWith('letter:') ? 'читать письмо Макса' : 'читать саммари'], ...ST_ACTIONS] : ST_ACTIONS).map(([k, l]) => `<option value="${esc(k)}"${d.action === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${d.action === 'url' ? `<label class="adm-field"><span>ссылка для кнопки</span><input id="admStUrl" value="${esc(d.url)}" placeholder="https://…"></label>` : ''}
            ${d.action ? `<label class="adm-field"><span>текст кнопки</span><input id="admStLabel" maxlength="40" value="${esc(d.label)}" placeholder="${esc(ST_ACTIONS.find(x => x[0] === d.action)?.[1] || 'подробнее')}"></label>` : ''}
            <label class="adm-field"><span>сколько дней в ленте</span><input id="admStDays" type="number" min="1" max="60" value="${esc(d.days)}"></label>
            <label class="adm-field" style="flex-direction:row;align-items:center;gap:8px"><input id="admStPin" type="checkbox"${d.pinned ? ' checked' : ''} style="width:auto"><span>закрепить первой и не убирать по сроку</span></label>
            <div class="adm-row2"><button type="button" class="adm-ghost" id="admStPreview">предпросмотр</button><button type="button" class="adm-ghost" id="admStDraft">${d.status === 'published' ? 'сохранить' : 'в черновики'}</button></div>
            ${d.status === 'published' ? '' : `<button type="submit" class="btn btn-yellow adm-primary"${storiesBusy ? ' disabled' : ''}>опубликовать</button>`}
            <button type="button" class="adm-link" id="admStCancel">отменить</button>
        </form>` : `<button class="btn btn-yellow adm-primary" id="admStNew">＋ новая сторис</button>
        <div class="adm-muted" style="margin:8px 2px 0">сторис видны всем на главной. автоматические публикуются сами, сразу для всех: новый владелец карты, саммари мастермайнда, значки за хайк</div>`}
        ${drafts.length ? `<div class="adm-label">черновики · ${drafts.length}</div><div class="adm-content-updates">${drafts.map(item).join('')}</div>` : ''}
        <div class="adm-label">в ленте · ${live.length}</div>
        <div class="adm-content-updates">${live.length ? live.map(item).join('') : '<div class="adm-empty">пока ничего не опубликовано</div>'}</div>`;
    const byId = id => list.find(s => s.id === id);
    const preview = s => import('./club-stories.js').then(m => m.openStories([s], 0, null, { preview: true }));
    body.querySelector('#admStNew')?.addEventListener('click', () => { haptic(); editStory(null); render(); });
    body.querySelectorAll('[data-st-edit]').forEach(b => b.addEventListener('click', () => { editStory(byId(b.dataset.stEdit)); render(); root.scrollTop = 0; }));
    body.querySelectorAll('[data-st-view]').forEach(b => b.addEventListener('click', () => preview(byId(b.dataset.stView))));
    body.querySelectorAll('[data-st-pub]').forEach(b => b.addEventListener('click', () => { editStory(byId(b.dataset.stPub)); saveStory('publish'); }));
    body.querySelectorAll('[data-st-hide]').forEach(b => b.addEventListener('click', async () => {
        if (!await confirmAsync('Убрать эту сторис?')) return;
        editStory(byId(b.dataset.stHide)); saveStory('hide');
    }));
    if (!d) return;
    const bind = (sel, key, ev = 'input', rer = false) => body.querySelector(sel)?.addEventListener(ev, e => { d[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; if (rer) render(); });
    bind('#admStType', 'type', 'change'); bind('#admStTitle', 'title'); bind('#admStText', 'text'); bind('#admStImage', 'image');
    bind('#admStAction', 'action', 'change', true); bind('#admStUrl', 'url'); bind('#admStLabel', 'label'); bind('#admStDays', 'days'); bind('#admStPin', 'pinned', 'change');
    body.querySelector('#admStCancel').addEventListener('click', () => { storyDraft = null; render(); });
    body.querySelector('#admStPreview').addEventListener('click', () => { const s = storyFromDraft(); preview({ ...s, date: Date.now() }); });
    body.querySelector('#admStDraft').addEventListener('click', () => saveStory(d.status === 'published' ? 'save' : 'draft'));
    body.querySelector('#admStForm').addEventListener('submit', e => { e.preventDefault(); saveStory('publish'); });
}

// ---------- опросы (lib/survey.js → api/club-content action surveys) ----------
// ответы по сегментам: по людям и по вопросам, тестовые (🧪) можно скрыть; выгрузка json и csv (csv открывается в Google Таблицах)
let svAdm = null, svSeg = 'D', svMode = 'people', svTests = false, svOpen = null; // тестовые по умолчанию скрыты, чтобы не мешать статистике
function loadSurveysAdm() {
    storiesCall('surveys').then(d => { svAdm = d; }).catch(e => { svAdm = { error: e.message }; })
        .finally(() => { if (root && view.tab === 'surveys') render(); });
}
const svAns = a => !a ? '' : a.skip ? '(пропуск)' : Array.isArray(a.a) ? a.a.join('; ') : String(a.a ?? '');
const svWhen = ts => ts ? new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '';
function svDownload(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function svExport(kind) {
    const rows = [];
    Object.entries(svAdm.segments).forEach(([seg, g]) => g.people.filter(p => svTests || !p.test).forEach(p => g.questions.forEach(q => {
        const a = p.answers[q.id]; if (!a) return;
        rows.push({ segment: seg, test: p.test ? 'тест' : '', id: p.id, name: p.name, username: p.username, done: p.done ? 'да' : '', run: p.run || '',
            question_id: q.id, question: q.title, answer: svAns(a), skipped: a.skip ? 'да' : '', at: a.at ? new Date(a.at).toISOString() : '',
            quote_ok: svAdm.consent?.[p.id]?.quote || '', talk_ok: svAdm.consent?.[p.id]?.talk || '' });
    })));
    const day = new Date().toISOString().slice(0, 10);
    if (kind === 'json') return svDownload(`опросы-${day}.json`, JSON.stringify(rows, null, 2), 'application/json');
    const cols = Object.keys(rows[0] || { segment: '' });
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    svDownload(`опросы-${day}.csv`, '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n'), 'text/csv');
}
function renderSurveysAdmin(body) {
    if (!svAdm) { body.innerHTML = '<div class="adm-muted" style="padding:12px 2px">загружаю ответы…</div>'; loadSurveysAdm(); return; }
    if (svAdm.error) { body.innerHTML = `<div class="adm-empty">не загрузилось: ${esc(svAdm.error)}</div><button class="btn btn-yellow adm-primary" id="admSvRetry">повторить</button>`; body.querySelector('#admSvRetry').addEventListener('click', () => { svAdm = null; render(); }); return; }
    const segs = svAdm.segments, g = segs[svSeg] || segs.D;
    const vis = list => list.filter(p => svTests || !p.test);
    const people = vis(g.people);
    const doneN = people.filter(p => p.done).length;
    const tests = Object.values(segs).reduce((n, v) => n + v.people.filter(p => p.test).length, 0);
    const chips = Object.entries(segs).map(([k, v]) => `<button type="button" class="svadm-chip${k === svSeg ? ' is-on' : ''}" data-sv-seg="${k}"><b>${k}</b><span>${vis(v.people).length}</span></button>`).join('');
    const who = p => esc(p.name || (p.username ? '@' + p.username : p.id));
    let content;
    if (svMode === 'people') {
        content = people.length ? people.map(p => {
            const key = `${p.id}:${p.run}`, open = svOpen === key;
            return `<div class="svadm-card${open ? ' is-open' : ''}">
                <button type="button" class="svadm-head" data-sv-open="${key}">
                    <span class="svadm-name">${p.test ? '<i class="svadm-test">тест</i>' : ''}${who(p)}</span>
                    <span class="svadm-state${p.done ? ' is-done' : ''}">${p.done ? 'прошёл' : 'в процессе'}</span>
                    <span class="svadm-meta">отвечено ${p.answered} из ${g.questions.length}${p.skipped ? ` · пропущено ${p.skipped}` : ''} · ${svWhen(p.run || p.last)}</span>
                </button>
                ${open ? `<div class="svadm-ans">${g.questions.map(q => { const a = p.answers[q.id]; return a ? `<div class="svadm-qa"><small>${esc(q.id)} · ${esc(q.title)}</small><div class="${a.skip ? 'is-skip' : ''}">${esc(svAns(a))}</div></div>` : ''; }).join('')}
                    ${svAdm.consent?.[p.id] ? `<div class="svadm-consent">цитировать: <b>${esc(svAdm.consent[p.id].quote || '–')}</b> · разговор: <b>${esc(svAdm.consent[p.id].talk || '–')}</b></div>` : ''}</div>` : ''}
            </div>`; }).join('') : '<div class="adm-empty">пока никто не отвечал в этом сегменте</div>';
    } else {
        content = g.questions.map(q => {
            const vals = people.map(p => p.answers[q.id]).filter(a => a && !a.skip);
            if (q.type === 'text') return `<div class="svadm-card"><div class="svadm-qh"><b>${esc(q.id)}</b><span>${esc(q.title)}</span></div>
                ${vals.length ? vals.map(a => `<div class="svadm-text">${esc(svAns(a))}</div>`).join('') : '<div class="svadm-none">ответов нет</div>'}</div>`;
            const cnt = {};
            vals.forEach(a => (Array.isArray(a.a) ? a.a : [a.a]).forEach(o => { const k = /^другое: /.test(o) ? 'другое' : o; cnt[k] = (cnt[k] || 0) + 1; }));
            const rows = Object.entries(cnt).sort((x, y) => y[1] - x[1]);
            return `<div class="svadm-card"><div class="svadm-qh"><b>${esc(q.id)}</b><span>${esc(q.title)}</span></div><div class="svadm-none">ответили: ${vals.length}</div>
                ${rows.map(([o, n]) => `<div class="svadm-bar"><div class="svadm-bar-t"><span>${esc(o)}</span><b>${n}</b></div><i><u style="width:${Math.round(n / vals.length * 100)}%"></u></i></div>`).join('')}</div>`;
        }).join('');
    }
    body.innerHTML = `
        <div class="svadm-chips">${chips}</div>
        <div class="svadm-title">${esc(g.title)}</div>
        <div class="svadm-sum"><span><b>${people.length}</b> прохождений</span><span><b>${doneN}</b> до конца</span><span><b>${people.length - doneN}</b> в процессе</span></div>
        <div class="svadm-ctl">
            <div class="svadm-seg"><button type="button" class="${svMode === 'people' ? 'is-on' : ''}" data-sv-mode="people">по людям</button><button type="button" class="${svMode === 'q' ? 'is-on' : ''}" data-sv-mode="q">по вопросам</button></div>
            <button type="button" class="svadm-tog${svTests ? ' is-on' : ''}" id="admSvTests">тестовые${tests ? ` · ${tests}` : ''}</button>
        </div>
        <div class="svadm-list">${content}</div>
        <div class="svadm-dl"><button type="button" class="btn btn-yellow-outline" id="admSvCsv">csv для Таблиц</button><button type="button" class="btn btn-yellow-outline" id="admSvJson">json</button></div>
        <button type="button" class="svadm-refresh" id="admSvRefresh">обновить</button>`;
    body.querySelectorAll('[data-sv-seg]').forEach(b => b.addEventListener('click', () => { svSeg = b.dataset.svSeg; svOpen = null; render(); }));
    body.querySelectorAll('[data-sv-mode]').forEach(b => b.addEventListener('click', () => { svMode = b.dataset.svMode; render(); }));
    body.querySelectorAll('[data-sv-open]').forEach(b => b.addEventListener('click', () => { svOpen = svOpen === b.dataset.svOpen ? null : b.dataset.svOpen; render(); }));
    body.querySelector('#admSvTests').addEventListener('click', () => { svTests = !svTests; render(); });
    body.querySelector('#admSvCsv').addEventListener('click', () => svExport('csv'));
    body.querySelector('#admSvJson').addEventListener('click', () => svExport('json'));
    body.querySelector('#admSvRefresh').addEventListener('click', () => { svAdm = null; render(); });
}

// ---------- обложка хайка (api/club-content action hike_photo → hikePhotos/<дата>, раздаёт /api/hikes?photo=) ----------
const hikePhotoV = {}; // дата → версия (после загрузки в этой сессии), null – убрали
function hikePhotoVersion(date) {
    if (date in hikePhotoV) return hikePhotoV[date];
    return state.hikePhotos?.[date] || null;
}
function hikePhotoHtml(date) {
    const v = hikePhotoVersion(date);
    return `${v ? `<img class="adm-hphoto-img" src="/api/hikes?photo=${date}&v=${v}" alt="">` : '<div class="adm-hphoto-empty">фото пока нет</div>'}
        <div class="adm-row2"><label class="adm-ghost adm-hphoto-pick">${v ? 'заменить фото' : '📷 добавить фото'}<input type="file" accept="image/*" hidden></label>${v ? '<button type="button" class="adm-ghost" data-hphoto-del>убрать</button>' : ''}</div>`;
}
// фото уменьшаем на телефоне: длинная сторона 1400 px, JPEG ~0.82 – обычно 200–400 КБ
function shrinkPhoto(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            let q = .82, out = c.toDataURL('image/jpeg', q);
            while (out.length > 900000 && q > .5) { q -= .08; out = c.toDataURL('image/jpeg', q); }
            resolve(out);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('не удалось прочитать фото')); };
        img.src = url;
    });
}
async function saveHikePhoto(date, data) {
    const r = await fetch('/api/club-content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ action: 'hike_photo', date, data, initData: tg?.initData || '' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'не удалось сохранить фото');
    hikePhotoV[date] = j.v;
    state.hikePhotos = { ...(state.hikePhotos || {}) };
    if (j.v) state.hikePhotos[date] = j.v; else delete state.hikePhotos[date];
}
function wireHikePhoto(box, date) {
    if (!box) return;
    const rewire = () => { box.innerHTML = hikePhotoHtml(date); wireHikePhoto(box, date); };
    box.querySelector('input[type=file]')?.addEventListener('change', async e => {
        const f = e.target.files?.[0]; if (!f) return;
        box.querySelector('.adm-hphoto-pick').firstChild.textContent = 'загружаю…';
        try { await saveHikePhoto(date, await shrinkPhoto(f)); toast('фото на обложке'); haptic(); }
        catch (err) { toast(err.message, true); }
        rewire();
    });
    box.querySelector('[data-hphoto-del]')?.addEventListener('click', async () => {
        if (!await confirmAsync('Убрать фото с обложки?')) return;
        try { await saveHikePhoto(date, null); toast('фото убрано'); } catch (err) { toast(err.message, true); }
        rewire();
    });
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

        ${d.original ? `<div class="adm-label">фото на обложку</div>
            <div class="adm-hphoto" id="admHikePhoto">${hikePhotoHtml(d.original)}</div>
            <div class="adm-hint">одно фото с хайка – станет обложкой дня в календаре. сохраняется сразу, без кнопки «сохранить»</div>` : ''}

        <button class="btn btn-yellow adm-primary adm-save" id="admSave">сохранить</button>
        <div class="adm-error" id="admSaveError" hidden></div>
        ${d.original && d.original <= todayStr() && !d.city && !d.book_club ? '<button class="adm-ghost adm-ach-grant" id="admAchGrant">🏅 выдать ачивку участникам</button>' : ''}
        ${d.original ? `<div class="adm-label">участники</div><div id="admPeople" class="adm-hint">загружаю…</div>
            <button class="adm-delete" id="admDelete">🗑 удалить событие полностью</button>` : ''}`;

    body.querySelector('.adm-back').addEventListener('click', () => { haptic(); view = { tab: 'hikes' }; render(); });
    if (d.original) wireHikePhoto(body.querySelector('#admHikePhoto'), d.original);
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
    // новая ачивка за этот хайк: участники уже отмечены (кто был, иначе – кто записан)
    body.querySelector('#admAchGrant')?.addEventListener('click', () => { haptic(); view = { tab: 'achievements', achHike: d.original }; render(); });
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
        const r = await fetchWithTimeout('/api/story', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg?.initData || '', date: d.date || 'cover', img }) }, 60000);
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
        const r = await fetchWithTimeout('/api/story', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg?.initData || '', date: draft?.date || 'cover', img: c.toDataURL('image/png') }) }, 60000);
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
        window.dispatchEvent(new Event('club:metrics-refresh'));
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
const CIRCLE_TEXT = 'мы рады знакомству с тобой, [имя]!\n\nхотим, чтобы для тебя были открыты все хайки без билетов и события в гостях у членов клуба. вот как мы недавно собирались на пирог к нам. считаем, искренние отношения не должны быть коммерческими. поэтому мы подумали и решили учесть все твои уже купленные билеты в стоимость карты интеллигента. для тебя бессрочная карта теперь стоит [цена], вместо 7 500 ₽. у нашего решения нет сроков, это не акция. просто с тобой классно и мы хотим видеть тебя в нашем близком кругу\n\n[ближайший хайк]';
// строка про ближайший хайк: «кстати, уже завтра идём на Аю-Даг, будем очень рады тебя видеть!»
function circleHikeLine() {
    const h = nearestTitledHike();
    if (!h) return '';
    const days = Math.round((new Date(h.date + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400000);
    const d = new Date(h.date + 'T12:00:00');
    const when = days <= 0 ? 'уже сегодня' : days === 1 ? 'уже завтра' : days < 7 ? `в ${['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'][d.getDay()]}` : `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`;
    const what = h.title.trim().replace(/^хайк\s+/i, '');
    return `кстати, ${when} идём ${what}, будем очень рады тебя видеть!`;
}
const circleText = () => CIRCLE_TEXT.replace('[ближайший хайк]', circleHikeLine()).replace(/\n\n$/, '');

let nc = null;
const RD_NC_GRADS = [['#6FA8DC', '#2E5C8A'], ['#C7B8E6', '#6B5A9A'], ['#F38CC6', '#8A3A68'], ['#93C47D', '#3E6B2E'], ['#F6B26B', '#8A5A26'], ['#8FCBF0', '#2F6A8F']];
function ncTickets(n) {
    const a = n % 10, b = n % 100;
    return `${n} ${a === 1 && b !== 11 ? 'билет' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'билета' : 'билетов'}`;
}
function ncRub(n) { return `${Math.round(n).toLocaleString('ru-RU')} ₽`; }
function circleMessage(p) {
    const name = String(p?.name || 'друг').split(' ')[0];
    return circleText().replace(/\[имя\]/gi, name).replace(/\[билеты\]/gi, ncTickets(p.tickets_count || 0))
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
        if (o && o.kind === 'circle' && o.sent_at && !o.notified) out.push('<span class="adm-badge is-off">бот не смог написать</span>');
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
    const row = p => {
        const name = esc(p.name || 'без имени') + (p.username ? ` <span class="adm-muted">@${esc(p.username)}</span>` : '');
        const n = p.hikes.length;
        const hk = `${n} ${n === 1 ? 'хайк' : n < 5 ? 'хайка' : 'хайков'} · последний ${dateLabel(p.last)}${p.hikes[p.hikes.length - 1].title ? ' – ' + esc(p.hikes[p.hikes.length - 1].title) : ''}`;
        const invited = p.offer && p.offer.kind === 'circle' && !p.offer.closed_at && !p.offer.used_at && p.offer.expires_at * 1000 > Date.now();
        let act = '';
        if (!p.tickets_count) act = '<div class="adm-nc-acts"><span class="adm-nc-note">билетов не оплачивал – засчитывать нечего</span></div>';
        else if (p.can_message === false) act = '<div class="adm-nc-acts"><span class="adm-nc-note">бот не может ему писать</span></div>';
        else if (!invited) act = `<div class="adm-nc-acts"><button type="button" class="adm-ghost adm-nc-act" data-circle="${esc(p.id)}">🤝 пригласить в круг</button></div>`;
        const tk = p.tickets_count ? `<div class="adm-nc-sub">оплатил ${ncTickets(p.tickets_count)} на ${ncRub(p.tickets_sum)} → карта для него ${ncRub(p.circle_price)}</div>` : '';
        return `<div class="adm-nc-person">
            <div class="adm-nc-info"><div class="adm-nc-name">${name}</div><div class="adm-nc-sub">${hk}</div>${tk}
            <div class="adm-nc-badges">${ncBadges(p)}</div>${act}</div>
        </div>`;
    };
    const preview = circleMessage(all.find(x => x.tickets_count) || { name: 'Аня', tickets_count: 3, tickets_sum: 4500, circle_price: 3000 });
    if (isRedesign()) {
        const canInvite = p => p.tickets_count && p.can_message !== false && !(p.offer && p.offer.kind === 'circle' && !p.offer.closed_at && !p.offer.used_at && p.offer.expires_at * 1000 > Date.now());
        const ready = list.filter(canInvite).length;
        const rdRow = (p, i) => {
            const g = RD_NC_GRADS[i % RD_NC_GRADS.length];
            const first = String(p.name || '').trim() || 'без имени';
            const n = p.hikes.length;
            const lastT = p.hikes[p.hikes.length - 1].title;
            const invited = p.offer && p.offer.kind === 'circle' && !p.offer.closed_at && !p.offer.used_at && p.offer.expires_at * 1000 > Date.now();
            let act = '';
            if (!p.tickets_count) act = '<span class="adm-nc-note">билетов не оплачивал – засчитывать нечего</span>';
            else if (p.can_message === false) act = ''; // плашка «бот не может писать» уже стоит в бейджах
            else if (!invited) act = `<button type="button" class="rd-nc-invite" data-circle="${esc(p.id)}">пригласить в круг</button>`;
            return `<div class="rd-nc-person${canInvite(p) ? ' is-ready' : ''}">
                <div class="rd-nc-top"><span class="rd-sg-av" style="background:linear-gradient(135deg,${g[0]},${g[1]})">${esc(first[0]).toUpperCase()}</span>
                    <span class="rd-nc-who"><b>${esc(first)}${p.username ? ` <small>@${esc(p.username)}</small>` : ''}</b><small>${n} ${n === 1 ? 'хайк' : n < 5 ? 'хайка' : 'хайков'} · последний ${esc(dateLabel(p.last))}${lastT ? ' – ' + esc(lastT) : ''}</small></span></div>
                ${p.tickets_count ? `<div class="rd-nc-price"><span><small>оплачено ${ncTickets(p.tickets_count)}</small><b>${ncRub(p.tickets_sum)}</b></span><span class="rd-nc-arrow">→</span><span class="is-card"><small>личная цена карты</small><b>${ncRub(p.circle_price)}</b></span></div>` : ''}
                <div class="adm-nc-badges">${ncBadges(p)}</div>
                ${act ? `<div class="rd-nc-act">${act}</div>` : ''}
            </div>`;
        };
        body.innerHTML = `
        <div class="rd-nc-hero">
            <div class="rd-nc-hero-h"><b>билеты засчитываются в карту</b><small>приглашение в близкий круг с личной ценой</small></div>
            <div class="rd-nc-formula"><span><b>7 500 ₽</b><small>бессрочная</small></span><i>−</i><span><b>билеты</b><small>уже оплачены</small></span><i>=</i><span class="is-res"><b>цена</b><small>1 500 – 5 500 ₽</small></span></div>
            <small class="rd-nc-hero-note">выбери тех, кого хочешь видеть в близком кругу – бот напишет приглашение. оно действует 30 дней, срок человеку не показываем</small>
        </div>
        <div class="rd-nc-seg">
            <button type="button" class="${nc.filter === 'recent' ? 'is-on' : ''}" data-f="recent">ходили за 2 недели <em>${recent.length}</em></button>
            <button type="button" class="${nc.filter === 'all' ? 'is-on' : ''}" data-f="all">все, кто ходил <em>${all.length}</em></button>
        </div>
        ${list.length ? `<div class="rd-adm-note rd-nc-ready">можно пригласить сейчас: <b>${ready}</b> из ${list.length}</div>` : ''}
        <div class="rd-nc-list">${list.length ? list.map(rdRow).join('') : '<div class="adm-muted rd-adm-empty">пока никого</div>'}</div>
        <div class="rd-adm-sec">так напишет бот</div>
        <div class="adm-preview rd-nc-preview"><div class="rd-nc-bot">хайкинг интеллигенция</div><div class="adm-bubble">${esc(preview).replace(/\n/g, '<br>')}</div><div class="adm-bubble-btn">посмотреть карту</div></div>`;
    } else body.innerHTML = `
        <div class="adm-hint" style="margin-top:0">выбери тех, кого хочешь видеть в близком кругу. бот напишет приглашение, а все оплаченные билеты засчитаются в бессрочную карту: 7 500 − билеты, но не дороже 5 500 и не дешевле 1 500. приглашение действует 30 дней, срок человеку не показываем</div>
        <div class="adm-chips">
            <button class="adm-chip${nc.filter === 'recent' ? ' is-on' : ''}" data-f="recent">ходили за 2 недели · ${recent.length}</button>
            <button class="adm-chip${nc.filter === 'all' ? ' is-on' : ''}" data-f="all">все, кто ходил · ${all.length}</button>
        </div>
        <div class="adm-nc-list">${list.length ? list.map(row).join('') : '<div class="adm-muted" style="padding:12px 4px">пока никого</div>'}</div>
        <div class="adm-label">так напишет бот</div>
        <div class="adm-preview"><div class="adm-bubble">${esc(preview).replace(/\n/g, '<br>')}</div><div class="adm-bubble-btn">посмотреть карту</div></div>`;
    body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { haptic(); nc.filter = b.dataset.f; render(); }));
    body.querySelectorAll('[data-circle]').forEach(b => b.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); haptic();
        inviteCircle(all.find(x => x.id === b.dataset.circle));
    }));
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
        const res = await adminCall('adminInviteCircle', { user_ids: JSON.stringify([p.id]), names: JSON.stringify({ [p.id]: p.name || '' }), text: circleText() });
        toast(res.sent ? 'приглашение отправлено 🤝' : 'приглашение открыто, но бот не смог написать');
        await loadNewcomers(true);
    } catch (e) {
        toast(e.message, true);
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
    const rd = isRedesign();
    return `<div class="fl-node">
        <div class="fl-msg"><div class="fl-text">${text}</div>
            <div class="fl-pills"><span>ушло ${sent}</span>${btns.length ? `<span>не нажали ${Math.max(0, sent - totalClicks)}</span>` : ''}</div></div>
        ${btns.length ? `<div class="fl-branches" style="grid-template-columns:repeat(${btns.length},minmax(0,1fr))">${btns.map((b, i) => `<div class="fl-branch">
            <div class="fl-line"></div><div class="fl-btn" style="--p:${sent ? Math.round(clicks[i] / sent * 100) : 0}%">${esc(b.label)}<small>нажали ${clicks[i]}${pct(clicks[i])}</small>${rd && !b.next ? '<em>отмечает выбор</em>' : ''}</div>
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
    const rdState = x => (x.flow.enabled === false ? ['выкл', ' is-off'] : x.flow.trigger === 'postpone' ? ['авто', ' is-auto'] : ['вручную', '']);
    if (!f && isRedesign()) {
        body.innerHTML = `<div class="rd-adm-note rd-fl-intro">несколько сообщений в боте: первое уходит само по событию или вручную из рассылки, кнопки ведут к следующим. здесь видно, как каждая отработала</div>
            ${d.list.length ? `<div class="rd-adm-list">${d.list.map(x => {
                const auto = x.flow.trigger === 'postpone';
                const c = auto ? '#8FCBF0' : '#C7B8E6';
                const [st, cls] = rdState(x);
                return `<button type="button" class="rd-adm-row" data-flow="${esc(x.id)}"><span class="rd-adm-ico" style="color:${c};background:${c}22">${rdIcon(auto ? 'rain' : 'flows')}</span><span class="rd-adm-row-main"><b>${esc(x.flow.title || x.id)}</b><small>${esc(x.flow.trigger_text || 'вручную из рассылки')}</small><small>получили ${x.people} · запусков ${x.runs}</small></span><em class="rd-fl-state${cls}">${st}</em><i>›</i></button>`;
            }).join('')}</div>` : '<div class="adm-muted rd-adm-empty">цепочек пока нет</div>'}
            <button class="fl-new" id="flNew">+ новая цепочка</button>
            <button class="adm-link" id="flReload">обновить цифры</button>`;
    } else if (!f) {
        body.innerHTML = `<div class="adm-hint">цепочка – несколько сообщений в боте: первое уходит само по событию, кнопки ведут к следующим. здесь видно, как каждая отработала</div>
            ${d.list.map(x => `<button class="fl-item" data-flow="${esc(x.id)}"><b>${esc(x.flow.title || x.id)} <span class="fl-state${x.flow.enabled === false ? ' is-off' : ''}">${x.flow.enabled === false ? 'выключена' : 'включена'}</span></b>
                <small>${esc(x.flow.trigger_text || '')}</small><small>получили ${x.people} чел. · запусков ${x.runs}</small></button>`).join('') || '<div class="adm-muted">цепочек пока нет</div>'}
            <button class="fl-new" id="flNew">+ новая цепочка</button>
            <button class="adm-link" id="flReload">обновить цифры</button>`;
    }
    if (!f) {
        body.querySelector('#flNew').addEventListener('click', () => {
            haptic();
            flowEdit = { id: '', title: '', enabled: true, start: 'n1', trigger: 'manual', nodes: { n1: { text: '', buttons: [] } } };
            renderFlows(body);
        });
        body.querySelectorAll('[data-flow]').forEach(b => b.addEventListener('click', () => { haptic(); flowOpen = b.dataset.flow; renderFlows(body); }));
        body.querySelector('#flReload').addEventListener('click', () => { haptic(); loadFlows(body); });
        return;
    }
    if (isRedesign()) {
        const presses = Object.values(f.stats || {}).reduce((s, st) => s + (st.clicks || []).reduce((a, b) => a + Number(b || 0), 0), 0);
        const [st, cls] = rdState(f);
        body.innerHTML = `<button class="adm-back" id="flBack">‹ все цепочки</button>
        <div class="rd-fl-head"><b>${esc(f.flow.title || f.id)}</b><em class="rd-fl-state${cls}">${st}</em></div>
        <div class="fl-trigger">⚡ <b>запуск:</b> ${esc(f.flow.trigger_text || f.flow.trigger || 'вручную из рассылки')}</div>
        <div class="rd-fl-stats"><div><b>${f.people}</b><span>получили</span></div><div><b>${presses}</b><span>нажатий на кнопки</span></div><div><b>${f.runs}</b><span>запусков</span></div></div>
        <div class="rd-adm-sec">как отработала</div>
        <div class="fl-map">${flowNodeHtml(f, f.flow.start, 0, new Set())}</div>
        <div class="rd-bc-actions is-static">${f.flow.enabled !== false ? '<button class="btn btn-yellow adm-primary" id="rdFlRun">запустить из рассылки</button>' : ''}<button class="adm-ghost" id="flEdit">✎ изменить цепочку</button></div>
        <button class="adm-link" id="flReload">обновить цифры</button>`;
        body.querySelector('#rdFlRun')?.addEventListener('click', () => {
            haptic();
            // по умолчанию – участники подходящего хайка, а не «всем»: перенос – ближайший, остальное – прошедший
            const today = todayStr();
            const titled = allHikes().filter(h => h.title && h.title.trim() && !isYes(h.cancelled));
            const h = f.flow.trigger === 'postpone' ? titled.find(x => x.date >= today) : titled.filter(x => x.date < today).pop();
            bc = { ...newBroadcast(), mode: 'flow', flowId: f.id, ...(h ? { segment: 'hike', extra: [], hikeDate: h.date } : {}) };
            view = { tab: 'broadcast' }; render(); refreshAudience(true);
        });
    } else body.innerHTML = `<button class="adm-back" id="flBack">‹ все цепочки</button>
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
const DRAFT_FIELDS = ['via', 'tpl', 'segment', 'extra', 'add', 'hikeDate', 'waitDate', 'excl', 'off', 'kind', 'btnType', 'section', 'btnHike', 'url', 'btnText', 'when', 'sendAt'];
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

    const P = {
        top: `<div id="admStats" class="adm-drafts-box"></div>
        <div id="admSched" class="adm-drafts-box"></div>
        <div id="admDrafts" class="adm-drafts-box"></div>
        ${recent[0] ? `<button class="adm-quick" id="admFeedback">📝 собрать отзывы о хайке<small>${esc(dateLabel(recent[0].date))} – ${esc(recent[0].title)} · кнопка в общий чат</small></button>` : ''}
        <div id="admAchNotify"></div>
        ${bc.draftId ? '<div class="adm-hint">открыт черновик – «сохранить черновик» обновит его</div>' : ''}
        `,
        mid: `<div class="adm-label">кому</div>
        `,
        segs: `${SEGMENT_GROUPS.map(([group, list]) => `<div class="adm-seg-group">${group}</div>
            <div class="adm-chips">${list.map(([k, l]) => chip(k, l, 'data-seg', bcHas(k))).join('')}</div>`).join('')}
        <div class="adm-hint">можно выбрать несколько сегментов – люди сложатся; повторное нажатие снимает сегмент</div>
        ${bcHas('hike') ? `<label class="adm-field"><span>хайк</span><select id="admBcHike">${hikeOptions(bc.hikeDate)}</select></label>` : ''}
        ${bcHas('waitlist_date') ? waitlistDateHtml() : ''}

        `,
        segsRd: `<div class="rd-bc-groups">${SEGMENT_GROUPS.map(([group, list]) => `<details class="rd-bc-group"${list.some(([k]) => bcHas(k)) ? ' open' : ''}><summary><span>${group}</span><small>${list.filter(([k]) => bcHas(k)).map(([, l]) => l).join(', ') || list.length + ' ' + (list.length < 5 ? 'сегмента' : 'сегментов')}</small></summary>
            <div class="adm-chips">${list.map(([k, l]) => chip(k, l, 'data-seg', bcHas(k))).join('')}</div></details>`).join('')}</div>
        <div class="adm-hint">можно выбрать несколько сегментов – люди сложатся; повторное нажатие снимает сегмент</div>
        ${bcHas('hike') ? `<label class="adm-field"><span>хайк</span><select id="admBcHike">${hikeOptions(bc.hikeDate)}</select></label>` : ''}
        ${bcHas('waitlist_date') ? waitlistDateHtml() : ''}

        `,
        excl: `<div class="adm-label">кроме</div>
        <div class="adm-excl">
            ${bc.excl.map(k => `<button class="adm-pill" data-unexcl="${k}">${esc(SEG_LABEL[k] || k)} <b>×</b></button>`).join('')}
            <button class="adm-link" id="admExclToggle">${bc.showExcl ? 'готово' : '+ исключить сегмент'}</button>
        </div>
        ${bc.showExcl ? `<div class="adm-excl-pick">${SEGMENT_GROUPS.map(([group, list]) => {
            const items = list.filter(([k]) => !bcHas(k) && k !== 'hike' && k !== 'all');
            return items.length ? `<div class="adm-seg-group">${group}</div><div class="adm-chips">${items.map(([k, l]) => chip(k, l, 'data-excl', bc.excl.includes(k))).join('')}</div>` : '';
        }).join('')}</div>` : ''}

        `,
        kind: `<div class="adm-label">тип сообщения</div>
        <div class="adm-chips">${KINDS.map(([k, l]) => `<button class="adm-chip${bc.kind === k ? ' is-on' : ''}" data-kind="${k}">${l}</button>`).join('')}</div>
        <div class="adm-hint">кто попросил писать реже, получит только «важное» или «анонс хайка» – смотря что выбрал</div>

        `,
        summ: `<div class="adm-sum" id="admSum">считаю получателей…</div>
        <div id="admUnreach"></div>
        `,
        add: `<div class="adm-label">добавить вручную</div>
        <input class="adm-people-search" id="admAddQ" placeholder="найти человека по имени или @username" value="${esc(bc.addQ || '')}" autocomplete="off">
        <div id="admAddRes"></div>
        <div class="adm-excl" id="admAdded"></div>
        <button class="adm-people-toggle" id="admPeopleToggle">${bc.showPeople ? 'скрыть список' : 'показать людей'} <span id="admPeopleN"></span></button>
        ${bc.showPeople ? `<input class="adm-people-search" id="admPeopleQ" placeholder="поиск по имени или @username" value="${esc(bc.q)}">
            <div class="adm-people" id="admPeople"></div>` : ''}

        `,
        what: `<div class="adm-label">что отправить</div>
        <div class="adm-chips"><button class="adm-chip${bc.mode !== 'flow' ? ' is-on' : ''}" data-mode="msg">сообщение</button><button class="adm-chip${bc.mode === 'flow' ? ' is-on' : ''}" data-mode="flow">🔗 цепочку</button></div>
        ${bc.mode === 'flow' ? bcFlowPickHtml() : ''}
        <div id="admMsgPart"${bc.mode === 'flow' ? ' hidden' : ''}>
        ${tip ? `<div class="adm-tip"><div class="adm-tip-goal"><b>что лучше написать:</b> ${esc(tip.goal)}</div>
            <div class="adm-tip-text">${esc(fillTemplate(tip.text))}</div>
            <div class="adm-tip-meta">кнопка: «${esc(tip.btn.text)}»</div>
            <button class="adm-link" id="admTipApply">${bc.tipApplied === bc.segment ? 'вставить шаблон заново' : 'вставить шаблон'}</button></div>` : ''}
        <div class="adm-label">шаблоны</div>
        <div class="adm-chips"><button class="adm-chip${bc.tpl === 'circle' ? ' is-on' : ''}" data-bc-tpl="circle">💳 билеты в счёт карты</button></div>
        ${bc.tpl === 'circle' ? `<div class="adm-hint">[цена] – личная цена карты за вычетом его билетов, [билеты] и [сумма] – сколько оплатил. ${nc?.people ? `цены знаем для ${nc.people.length} чел.` : 'загружаю цены…'} от бота такое сообщение откроет человеку спеццену</div>` : ''}
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
        `,
        when: `<div${bc.mode === 'flow' ? ' hidden' : ''}>
        <div class="adm-label">когда отправить</div>
        <div class="adm-chips"><button class="adm-chip${bc.when !== 'later' ? ' is-on' : ''}" data-when="now">сейчас</button><button class="adm-chip${bc.when === 'later' ? ' is-on' : ''}" data-when="later">⏰ запланировать</button></div>
        ${bc.when === 'later' ? `<label class="adm-field"><span>дата и время (по времени телефона)</span><input type="datetime-local" id="admBcAt" value="${esc(bc.sendAt)}" min="${localInputValue(new Date(Date.now() + 5 * 60000))}"></label>
            <div class="adm-hint">список получателей фиксируется сейчас. уйдёт в течение 5 минут после выбранного времени, в бот придёт отчёт</div>` : ''}
        </div>

        `,
        acts: `${bc.mode !== 'flow' ? `<div class="adm-label">от кого</div>
        <div class="adm-chips"><button class="adm-chip${bc.via !== 'self' ? ' is-on' : ''}" data-via="bot">🤖 от бота</button><button class="adm-chip${bc.via === 'self' ? ' is-on' : ''}" data-via="self">✍️ от себя</button></div>` : ''}
        ${bc.via === 'self' && bc.mode !== 'flow' ? `<div class="adm-hint">пишешь сам со своего аккаунта: у каждого человека свой готовый текст – «скопировать», затем «открыть чат» и вставить. исключённые выше сюда не попадают</div>
        <div id="admSelfList" class="adm-self-list"></div>
        <div class="adm-row2"><button class="adm-ghost" id="admBcDraft">сохранить черновик</button><button class="adm-ghost" id="admSelfReset">сбросить отметки</button></div>` : `<div class="adm-row2"><button class="adm-ghost" id="admBcDraft">сохранить черновик</button><button class="adm-ghost" id="admBcTest">отправить себе</button></div>
        <button class="btn btn-yellow adm-primary" id="admBcSend">отправить</button>`}`,
    };
    if (isRedesign()) {
        // новый дизайн: три шага – кому, что, когда; история и черновики внизу
        const segLabels = bcSegs().map(k => SEG_LABEL[k] || k);
        const hikeTitle = bcHas('hike') ? (allHikes().find(h => h.date === bc.hikeDate)?.title || '') : '';
        const step = (n, t) => `<div class="rd-bc-step"><span>${n}</span><b>${t}</b></div>`;
        body.innerHTML = `
            ${bc.draftId ? '<div class="adm-hint">открыт черновик – «сохранить черновик» обновит его</div>' : ''}
            ${step(1, 'кому')}
            <div class="rd-bc-sel"><span class="rd-bc-sel-main"><b>${esc(segLabels.join(' + ') || 'выбери сегмент')}</b>${hikeTitle ? `<small>${esc(hikeTitle)} · ${esc(dateLabel(bc.hikeDate))}</small>` : ''}</span><span class="rd-bc-count" id="rdBcCount">…</span></div>
            ${P.summ}
            ${P.segsRd}
            ${P.excl}
            ${P.add}
            ${step(2, 'что')}
            ${P.kind}
            ${P.what}
            ${step(3, 'когда')}
            ${P.when}
            <div class="rd-bc-actions">${P.acts}</div>
            <div class="rd-bc-step is-soft"><b>история и черновики</b></div>
            ${P.top}`;
    } else {
        body.innerHTML = `
        ` + P.top + P.mid + P.segs + P.excl + P.kind + P.summ + P.add + P.what + P.when + P.acts;
    }

    mountAchievementNotify(body.querySelector('#admAchNotify'));
    const update = () => { renderPreview(); updateSendLabel(); renderSelfList(); };
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
    body.querySelector('#admBcTest')?.addEventListener('click', () => sendBroadcast(true));
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
    body.querySelector('#admBcSend')?.addEventListener('click', () => sendBroadcast(false));
    body.querySelectorAll('[data-bc-tpl]').forEach(b => b.addEventListener('click', async () => {
        haptic();
        if (bc.text.trim() && bc.tpl !== 'circle' && !(await confirmAsync('Заменить текст сообщения шаблоном?'))) return;
        bc.tpl = 'circle';
        bc.text = circleText();
        bc.btnType = 'none';
        render();
        if (!nc?.people) loadNewcomers().then(() => { if (root && view.tab === 'broadcast') render(); });
    }));
    body.querySelectorAll('[data-via]').forEach(b => b.addEventListener('click', () => {
        haptic();
        bc.via = b.dataset.via;
        if (bc.via === 'self' && /\[(цена|билеты|сумма)\]/i.test(bc.text) && !nc?.people) loadNewcomers().then(() => { if (root && view.tab === 'broadcast') render(); });
        render();
    }));
    body.querySelector('#admSelfReset')?.addEventListener('click', () => { haptic(); bc.selfDone = {}; renderSelfList(); });
    renderSelfList();
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
    const rdCount = root.querySelector('#rdBcCount');
    if (rdCount) rdCount.textContent = String(r.final.length);
    renderSelfList();
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

// личный текст для человека: имя + цена карты за вычетом его билетов (из «продажи карты»)
function ncById(id) { return (nc?.people || []).find(x => String(x.id) === String(id)); }
function bcPersonText(id) {
    const pp = audience?.people?.[id] || {};
    const p = ncById(id) || {};
    const name = String(p.name || pp.n || 'друг').split(' ')[0];
    const price = p.circle_price || (nc?.people ? 7500 : 0);
    let t = bc.text.trim().replace(/\[имя\]/gi, name);
    if (nc?.people) t = t.replace(/\[билеты\]/gi, ncTickets(p.tickets_count || 0)).replace(/\[сумма\]/gi, ncRub(p.tickets_sum || 0)).replace(/\[цена\]/gi, ncRub(price));
    // в личке теги не работают – убираем разметку
    return t.replace(/<a href="([^"]*)">([^<]*)<\/a>/g, '$2 ($1)').replace(/<\/?(b|i|u|s|code)>/g, '');
}
function renderSelfList() {
    const el = root?.querySelector('#admSelfList');
    if (!el || bc.via !== 'self') return;
    if (!audience) { el.innerHTML = '<div class="adm-muted">считаю получателей…</div>'; return; }
    if (!bc.text.trim()) { el.innerHTML = '<div class="adm-muted">сначала напиши текст или выбери шаблон</div>'; return; }
    const ids = bcRecipients().final;
    if (!ids.length) { el.innerHTML = '<div class="adm-muted">никого не выбрано</div>'; return; }
    bc.selfDone = bc.selfDone || {};
    const done = ids.filter(id => bc.selfDone[id]).length;
    const people = audience.people || {};
    el.innerHTML = `<div class="adm-self-sum">написал <b>${done}</b> из ${ids.length}</div>` + ids.slice(0, 200).map(id => {
        const pp = people[id] || {};
        const p = ncById(id);
        const sub = [pp.u ? '@' + pp.u : 'нет username', p && p.tickets_count ? `${ncTickets(p.tickets_count)} → ${ncRub(p.circle_price)}` : ''].filter(Boolean).join(' · ');
        return `<div class="adm-self-row${bc.selfDone[id] ? ' is-done' : ''}" data-self="${esc(id)}">
            <div class="adm-self-head"><b>${bc.selfDone[id] ? '✓ ' : ''}${esc(pp.n || p?.name || id)}</b><small>${esc(sub)}</small></div>
            <div class="adm-self-text">${esc(bcPersonText(id)).replace(/\n/g, '<br>')}</div>
            <div class="adm-row2"><button class="adm-ghost" data-self-copy>скопировать</button><button class="adm-ghost" data-self-open${pp.u ? '' : ' disabled'}>${pp.u ? 'открыть чат' : 'найди вручную'}</button></div>
        </div>`;
    }).join('');
    el.querySelectorAll('[data-self]').forEach(row => {
        const id = row.dataset.self;
        row.querySelector('[data-self-copy]').addEventListener('click', async e => {
            haptic();
            const text = bcPersonText(id);
            let ok = false;
            try { await navigator.clipboard.writeText(text); ok = true; } catch (err) {
                const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
                try { ok = document.execCommand('copy'); } catch (e2) {} ta.remove();
            }
            e.target.textContent = ok ? 'скопировано ✓' : 'не вышло';
        });
        row.querySelector('[data-self-open]').addEventListener('click', () => {
            const u = (audience.people || {})[id]?.u;
            if (!u) return;
            haptic();
            bc.selfDone[id] = true;
            const url = 'https://t.me/' + encodeURIComponent(u);
            if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
            setTimeout(renderSelfList, 300);
        });
    });
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
    if (!test && /\[цена\]/i.test(bc.text)) return sendCircleBroadcast();
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

// шаблон с [цена] от бота: каждому – его цена, и у него открывается спеццена на карту
async function sendCircleBroadcast() {
    const r = audience ? bcRecipients() : null;
    if (!r) return toast('ещё считаю получателей', true);
    if (!r.final.length) return toast('некому отправлять', true);
    if (bc.when === 'later') return toast('с личной ценой – только «сейчас»', true);
    if (!(await confirmAsync(`Бот напишет ${r.final.length} чел. с личной ценой карты и откроет им спеццену. Отменить будет нельзя.`))) return;
    const el = root.querySelector('#admBcSend');
    const label = el.textContent;
    el.disabled = true;
    el.textContent = 'отправляю… не закрывайте';
    const people = audience.people || {};
    const names = {};
    r.final.forEach(id => { names[id] = ncById(id)?.name || people[id]?.n || ''; });
    try {
        const res = await adminCall('adminInviteCircle', { user_ids: JSON.stringify(r.final), names: JSON.stringify(names), text: bc.text.trim() });
        haptic();
        toast(`доставлено ${res.sent || 0} из ${r.final.length}${res.skipped ? ` · ${res.skipped} не пускают бота – напиши им «от себя»` : ''}`);
        audience = null;
        bc = { ...newBroadcast(), count: null };
        nc = null;
        render();
        return;
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
