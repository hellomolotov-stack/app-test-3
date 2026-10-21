// js/ui/hiking-box.js – hiking box от партнёра (dietcakes.ru): плашка в шторке хайка над слайдером «иду»
// и шторка «что внутри», которая вырастает прямо из плашки. Покупка – на сайте партнёра.
// Запущено для всех 20.10.2026.
import { state } from '../state.js';
import { haptic, openLink } from '../utils.js';
import { log, logSeq } from '../api.js';

export const HIKING_BOX_TEST_IDS = ['7845375334', '163665735']; // @hellointelligent, @maxmolotov
const boxMember = () => state.userCard?.status === 'active';
const SHOP_URL = 'https://dietcakes.ru/hiking-intelligence/'; // наша страница на сайте «Жить здорово»
// онлайн-скидка по карте с месячным лимитом: ссылка несёт личный подписанный ID карты (тот же, что в QR для кассы).
let cardToken = '', tgRef = '';
function prefetchCardToken() {
    // подписанный Telegram ID – всем (бот напишет человеку о его заказе бокса)
    if (!tgRef && window.Telegram?.WebApp?.initData) fetch('/api/dc-loyalty', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'app_ref', initData: window.Telegram.WebApp.initData }) })
        .then(r => r.ok ? r.json() : null).then(b => { if (/^tg1_\d{1,16}_[A-Za-z0-9_-]{28}$/.test(b?.ref || '')) tgRef = b.ref; }).catch(() => {});
    if (cardToken || !boxMember()) return;
    fetch('/api/dc-loyalty', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'app_card', initData: window.Telegram?.WebApp?.initData || '' }) })
        .then(r => r.ok ? r.json() : null)
        .then(b => { const m = /start=(dc1_\d{1,16}_[A-Za-z0-9_-]{28})$/.exec(b?.url || ''); if (m) cardToken = m[1]; })
        .catch(() => {});
}

// ссылка на страницу бокса: бокс, дата и маршрут хайка; владельцу карты – card=1 (страница сама применит промокод INTELLIGENT)
function shopUrl(hike, boxKey, custom) {
    const q = new URLSearchParams();
    q.set('box', boxKey === 'light' ? 'light' : 'full');
    if (custom) q.set('custom', '1');
    let shopDate = hike?.date || '';
    const checkoutPilot = HIKING_BOX_TEST_IDS.includes(String(state.user?.id || ''));
    if (checkoutPilot) {
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
        // Только тестовая ссылка: прошедший/пустой хайк проверяем на дате через неделю.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(shopDate) || shopDate < today) {
            shopDate = new Date(Date.now() + 7 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
        }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(shopDate)) q.set('hike', shopDate);
    const route = String(hike?.title || '').replace(/^(хайк|маршрут|тропа)\s+/i, '').replace(/^на\s+/i, '').trim();
    if (route) q.set('route', route);
    if (boxMember()) q.set('card', '1');
    q.set('utm_source', 'intelligentsia');
    // имя – после #: эта часть ссылки не уходит на сервер магазина, страница сама склонит «для Макса»
    const name = String(state.user?.first_name || '').trim().split(/\s+/)[0].slice(0, 30);
    const hash = new URLSearchParams();
    if (name) hash.set('name', name);
    if (cardToken) hash.set('card', cardToken);
    if (tgRef) hash.set('tg', tgRef);
    return `${SHOP_URL}?${q}${hash.toString() ? '#' + hash : ''}`;
}



// Два универсальных бокса – человек выбирает только «лёгкий» или «сытный», а начинку меняет уже в магазине.
// Коллаж нарисован на 375px: items – картинки (left/top/размер/поворот), notes – рукописные подписи, arrows – стрелки.
// Ориентиры стоимости, а не актуальная цена магазина. Итог зависит от состава и наличия:
//   лёгкий 476 ₽ = CHIKABAR тирамису 118 + чипсы Bombbar «Стейк» 118 + гель Bombbar 92 + вафли Bombbar 98 + вода 50
//   сытный 854 ₽ = сэндвич с песто 318 + коктейль 143 + вафли 112 + печенье 102 + палочки 129 + вода 50
const BOXES = {
    light: {
        tab: 'лёгкий', price: 476, count: 'пять продуктов', h: 470,
        items: [
            ['steak', 'height:196px; left:22px; top:64px; transform:rotate(-7deg); z-index:3'],
            ['gel', 'height:150px; left:204px; top:66px; transform:rotate(8deg); z-index:4'],
            ['water', 'height:180px; left:272px; top:124px; transform:rotate(7deg); z-index:2'],
            ['chikabar', 'width:232px; left:14px; top:276px; transform:rotate(-6deg); z-index:5'],
            ['wafbm', 'width:204px; left:156px; top:330px; transform:rotate(6deg); z-index:6'],
        ],
        notes: [
            ['left:24px; top:16px', 'чипсы', 'возвращают соль', false, 'steak'],
            ['left:180px; top:12px', 'гель', 'быстрая энергия', false, 'gel'],
            ['right:20px; top:40px', 'вода', 'с минералами', true, 'water'],
            ['left:24px; top:414px', 'батончик', 'белок без сахара', false, 'chikabar'],
            ['right:24px; top:414px', 'вафли', 'хруст без сахара', true, 'wafbm'],
        ],
        arrows: ['M50 56 C 54 66, 60 74, 70 84', 'M196 52 C 200 60, 206 66, 216 72', 'M338 80 C 336 94, 330 106, 320 116',
            'M44 412 C 46 398, 52 388, 64 378', 'M322 412 C 320 402, 314 396, 306 390'],
        swaps: ['батончик → другой вкус', 'чипсы → палочки', 'гель → энергетический шот'],
    },
    optimal: {
        tab: 'сытный', price: 854, count: 'шесть продуктов', h: 500,
        items: [
            ['pesto', 'width:212px; left:8px; top:104px; transform:rotate(-10deg); z-index:3'],
            ['shake', 'height:168px; left:168px; top:78px; transform:rotate(6deg); z-index:4'],
            ['water', 'height:176px; left:268px; top:104px; transform:rotate(-6deg); z-index:2'],
            ['sticks', 'width:122px; left:214px; top:246px; transform:rotate(9deg); z-index:5'],
            ['wafers', 'width:188px; left:34px; top:288px; transform:rotate(-6deg); z-index:6'],
            ['cookie', 'width:108px; left:118px; top:350px; transform:rotate(7deg); z-index:7'],
        ],
        notes: [
            ['left:24px; top:16px', 'сэндвич', 'полноценный обед', false, 'pesto'],
            ['left:176px; top:16px', 'коктейль', '24 г белка', false, 'shake'],
            ['right:24px; top:40px', 'вода', 'минералы', true, 'water'],
            ['left:24px; top:404px', 'вафли', 'без сахара', false, 'wafers'],
            ['right:24px; top:404px', 'палочки', 'солёное с белком', true, 'sticks'],
            ['left:140px; top:452px', 'печенье', 'сладкое без сахара', false, 'cookie'],
        ],
        arrows: ['M52 56 C 54 76, 60 96, 72 116', 'M196 58 C 200 70, 204 80, 206 92', 'M322 82 C 318 94, 312 104, 304 116',
            'M44 400 C 46 384, 56 370, 70 358', 'M322 400 C 320 384, 312 368, 300 356', 'M150 450 C 148 440, 152 432, 160 424'],
        swaps: ['коктейль → энергетик', 'сэндвич → ролл', 'печенье → батончик'],
        warn: 'сэндвич или ролл – заказ за 2 дня до хайка',
    },
};
// карточка продукта по нажатию на него в коллаже: название, вес, цена (dietcakes.ru на 15.10.2026), зачем он на хайке, чем заменить
const PRODUCTS = {
    steak: { name: 'протеиновые чипсы Bombbar «Стейк на гриле»', w: '50 г', price: 118, why: 'солёное и хрустящее – возвращает соль, которую уносит пот', swap: 'другие вкусы, протеиновые палочки' },
    gel: { name: 'питьевой гель Bombbar «Ягодный микс»', w: '60 г', price: 92, why: 'быстрая энергия на крутом подъёме – пьётся на ходу', swap: 'энергетический шот, изотоник' },
    chikabar: { name: 'батончик CHIKABAR мини «Тирамису»', w: '45 г', price: 118, why: 'белок без сахара – держит сытость до привала', swap: 'Bombbar, ROCKET, другие вкусы CHIKABAR' },
    wafbm: { name: 'вафли Bombbar «Топлёное молоко»', w: '32 г', price: 98, why: '25% белка и хруст без сахара – к чаю на вершине', swap: 'вафли CHIKALAB, другие вкусы Bombbar' },
    chikers: { name: 'батончик CHIKA CHIKERS «Арахис и карамель»', w: '40 г', price: 77, why: 'арахис и белок – быстрый перекус без сахара', swap: 'Qwikler, Snaq Fabriq' },
    pesto: { name: 'сэндвич с песто', w: '1 шт', price: 318, why: 'полноценный обед на вершине – наедаешься и не тяжелеешь', swap: 'ролл с фалафелем, сэндвич с лососем, лаваш с тофу' },
    shake: { name: 'протеиновый коктейль Bombbar', w: '350 мл', price: 143, why: '24 г белка – мышцы восстанавливаются ещё на тропе', swap: 'энергетик, изотоник, лимонад без сахара' },
    water: { name: 'вода Bombbar', w: '0,5 л', price: 50, why: 'глоток на каждом привале – основу 1,5 л всё равно бери свою', swap: 'изотоник, лимонад без сахара' },
    sticks: { name: 'протеиновые палочки Bombbar', w: '60 г', price: 129, why: '15 г белка и соль, которую уносит пот', swap: 'протеиновые чипсы, нутсы' },
    wafers: { name: 'вафли CHIKALAB', w: '40 г', price: 112, why: 'хрустящее сладкое без сахара к чаю на вершине', swap: 'протеиновый батончик, вафли Bombbar' },
    cookie: { name: 'печенье Bombbar', w: '40 г', price: 102, why: 'сладкое без сахара – награда за подъём', swap: 'брауни, пастила, батончик' },
    bar: { name: 'протеиновый батончик Bombbar', w: '60 г', price: 139, why: '20 г белка – держит сытость на подъёме', swap: 'другие вкусы, CHIKABAR, ROCKET' },
    chips: { name: 'протеиновые чипсы Bombbar «Нежный сыр»', w: '50 г', price: 92, why: 'солёное и хрустящее – возвращает соль, которую уносит пот', swap: 'протеиновые палочки, цельнозерновые чипсы' },
    qwikler: { name: 'батончик Qwikler «Орех в карамели»', w: '40 г', price: 88, why: 'орехи без сахара – быстрая энергия на крутом участке', swap: 'другие вкусы Qwikler, фруктово-ореховый батончик' },
    frut: { name: 'пастила «Фрутилад» яблоко и клюква', w: '30 г', price: 77, why: 'лёгкое фруктовое сладкое, не тает в рюкзаке', swap: 'белёвская пастила, печенье' },
};
const DEFAULT_BOX = 'light';
const CARD_DISCOUNT = 0.10; // скидка владельцам карты интеллигента
const rub = n => `${n.toLocaleString('ru-RU')} ₽`;
const cardPrice = n => Math.round(n * (1 - CARD_DISCOUNT));

// мини-бенто для плашки и строк: голубой лоток – сэндвич в большой ячейке, печенье и палочки в маленьких
const bentoHtml = (cls = '') => `<span class="hb-bento ${cls}"><span class="hb-bento-tray">`
    + `<span class="hb-bento-cell is-big"><img src="assets/box/cut/pesto.png" alt=""></span>`
    + `<span class="hb-bento-cell"><img src="assets/box/cut/cookie.png" alt=""></span>`
    + `<span class="hb-bento-cell"><img src="assets/box/cut/sticks.png" alt=""></span></span></span>`;

function collageHtml(b) {
    return b.items.map(([n, st]) => `<img class="hc-p" data-p="${n}" src="assets/box/cut/${n}.png" style="${st}" alt="${PRODUCTS[n]?.name || ''}">`).join('')
        + b.notes.map(([pos, t, s, r, p]) => `<div class="hc-note${r ? ' is-r' : ''}" data-p="${p}" style="${pos}">${t}<span class="hc-i">i</span><small>${s}</small></div>`).join('')
        + `<svg class="hc-arrows" viewBox="0 0 375 ${b.h}"><defs><marker id="hcHd" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M2 2 L9.5 6 L2.5 10.5" /></marker></defs>`
        + b.arrows.map(d => `<path marker-end="url(#hcHd)" d="${d}" />`).join('') + '</svg>';
}

export function hikingBoxEnabled(date) {
    // тестовые аккаунты – на любом хайке, в том числе прошедшем;
    // остальным – только на предстоящих: плашка появится у всех с выходом нового хайка
    if (HIKING_BOX_TEST_IDS.includes(String(state.user?.id || ''))) return true;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
    return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && String(date) >= today;
}

// плашка над слайдером «иду» (контейнер .floating-sheet-buttons)
export function mountHikingBoxPlate(container, hike, isGuest) {
    const row = document.createElement('div');
    row.style.cssText = 'flex-basis: 100%; min-width: 0; max-width: 100%; display: flex; justify-content: center;';
    row.innerHTML = `<div class="letter-plate box-plate" role="button">
        <img class="hb-box-thumb" src="assets/box/hiking-box-top-plain-v1.webp" width="66" height="62" alt="" decoding="async">
        <span class="letter-plate-text"><b>хайкинг бокс</b><small>еда и вода на весь хайк в одной коробке</small></span>
        <button type="button" class="box-plate-btn">что внутри</button></div>`;
    const plate = row.querySelector('.box-plate');
    plate.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        haptic();
        log(`hiking box: что внутри – ${hike.title}`, isGuest, state.user);
        openHikingBox(plate, hike, isGuest);
    });
    container.appendChild(row);
    container.classList.add('has-plates');
    preloadHikingBox();
}

// шторка вырастает из плашки: стартует ровно в её прямоугольнике и разворачивается вверх на весь экран
// шрифт подписей и картинки коллажа грузим заранее, как только показали плашку –
// тогда шторка «что внутри» открывается сразу целиком, без поэтапной догрузки
const CUT = [...new Set(Object.values(BOXES).flatMap(b => b.items.map(i => i[0])))];
let preloaded = false;
function preloadHikingBox() {
    if (preloaded) return;
    preloaded = true;
    const l = document.createElement('link');
    l.id = 'caveatFont'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap';
    document.head.appendChild(l);
    l.onload = () => { try { document.fonts.load('700 20px Caveat'); document.fonts.load('500 16px Caveat'); } catch (e) {} };
    CUT.forEach(n => { const i = new Image(); i.decoding = 'async'; i.src = `assets/box/cut/${n}.png`; });
}

export function openHikingBox(fromEl, hike, isGuest) {
    prefetchCardToken(); // пока человек смотрит бокс, ID карты уже готов к переходу в магазин
    preloadHikingBox();
    document.querySelector('.hb-overlay')?.remove();
    const r = fromEl.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'hb-overlay';
    overlay.innerHTML = `
        <div class="hb-sheet">
            <div class="cs-grab hb-grab"></div>
            <button type="button" class="hb-close" aria-label="закрыть">✕</button>
            <div class="hb-scroll">
                <div class="hb-title">хайкинг бокс</div>
                <div class="hb-sub">получаешь перед стартом и не думаешь, что взять с собой</div>
                <div class="hb-tabs" role="tablist">${Object.entries(BOXES).map(([k, b]) =>
                    `<button type="button" class="hb-tab" data-box="${k}" role="tab">${b.tab}</button>`).join('')}</div>
                <div class="hb-collage-wrap"><div class="hb-collage"></div></div>
                <div class="hb-tap-hint">нажми на продукт – расскажем о нём</div>
                <div class="hb-warn"></div>
                <div class="hb-swaps"><span class="hb-swaps-k">в магазине можно заменить</span><div class="hb-swaps-list"></div></div>
                <div class="hb-label">как получить</div>
                <div class="hb-ways">
                    <div class="hb-way"><span>🚚</span><b>доставка по Ялте</b><small>накануне</small></div>
                    <div class="hb-way"><span>🏪</span><b>самовывоз</b><small>из магазина</small></div>
                    <div class="hb-way is-hl"><span>🏔</span><b>на хайк</b><small>на точке сбора</small></div>
                </div>
                <div class="hb-price">
                    <span class="hb-price-k"></span>
                    <div class="hb-price-row">
                        <div class="hb-p-full"><small>без карты</small><b></b></div>
                        <div class="hb-p-card"><span class="hb-p-badge">−10%</span><small>с картой интеллигента</small><b></b></div>
                    </div>
                    <small class="hb-price-note"></small>
                </div>
                <div class="hb-facts"><div><b>100+</b><span>продуктов на выбор – собери бокс под свои вкусы</span></div><div><b>0%</b><span>нашей наценки – по прямой цене магазина</span></div></div>
                <div class="hb-why"><span>почему мы это сделали</span><p>сами часто стояли в очередях перед хайком и брали что попало. поэтому нашли в Ялте магазин, где основатель подходит к каждому продукту с любовью: всё в нём – про полезную и при этом вкусную еду. это отлично совпадает с нашей философией хайкинга</p></div>
                <div class="hb-partner">продукты и сборка – <b>dietcakes.ru</b></div>
            </div>
            <div class="hb-pop" hidden></div>
            <div class="hb-bar">
                <button type="button" class="hb-card-hint"><img src="assets/card-front.jpg" alt=""><span><b>скидка 10%</b> с картой интеллигента</span><em>оформить ›</em></button>
                <button type="button" class="btn btn-yellow hb-buy hb-buy-full"></button>
                <button type="button" class="btn hb-buy hb-custom">настроить свой бокс</button>
            </div>
        </div>`;
    const sheet = overlay.querySelector('.hb-sheet');
    const tgw = window.Telegram?.WebApp;
    const inset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
    sheet.style.top = (inset ? inset + 14 : 40) + 'px';
    // коллаж свёрстан на 375px – масштабируем под ширину шторки один раз, до показа
    const k = Math.min(1.15, Math.min(window.innerWidth, 600) / 375);
    const wrap = overlay.querySelector('.hb-collage-wrap');
    wrap.style.setProperty('--hc-k', k.toFixed(3));
    // вкладки «лёгкий / сытный»: меняем коллаж, ориентир стоимости, замены и пометку про сэндвич
    let current = DEFAULT_BOX;
    const isMember = boxMember();
    // Подгоняем надпись кнопки под узкие экраны
    const fitBuy = () => {
        const btn = overlay.querySelector('.hb-buy-full');
        btn.style.fontSize = '';
        if (!btn.isConnected) return;
        for (let f = 15; f > 12 && btn.scrollWidth > btn.clientWidth; f -= .5) btn.style.fontSize = f + 'px';
    };
    const showBox = (key) => {
        current = key;
        const b = BOXES[key];
        overlay.querySelectorAll('.hb-tab').forEach(t => t.classList.toggle('is-on', t.dataset.box === key));
        wrap.style.setProperty('--hc-h', b.h + 'px');
        wrap.querySelector('.hb-collage').innerHTML = collageHtml(b);
        const warn = overlay.querySelector('.hb-warn');
        warn.textContent = b.warn || '';
        warn.hidden = !b.warn;
        overlay.querySelector('.hb-swaps-list').innerHTML = b.swaps.map(s => `<span>${s}</span>`).join('');
        overlay.querySelector('.hb-price-k').textContent = `${b.tab} бокс · примерная стоимость`;
        overlay.querySelector('.hb-p-full b').textContent = rub(b.price);
        overlay.querySelector('.hb-p-card b').textContent = rub(cardPrice(b.price));
        overlay.querySelector('.hb-price-note').textContent = 'итоговая цена зависит от состава и наличия в магазине';
        // На кнопке нет фиксированной суммы: актуальный состав и цену человек увидит в магазине.
        overlay.querySelector('.hb-buy-full').textContent = 'взять бокс на хайк';
        fitBuy();
    };
    showBox(DEFAULT_BOX);
    overlay.querySelectorAll('.hb-tab').forEach(t => t.addEventListener('click', () => {
        if (t.dataset.box === current) return;
        haptic();
        hidePop();
        log(`hiking box: вкладка ${BOXES[t.dataset.box].tab} – ${hike.title}`, isGuest, state.user);
        showBox(t.dataset.box);
        if (!hintedBoxes.has(current)) setTimeout(fingerHint, 450);
    }));
    // карточка продукта: нажал на продукт в коллаже – снизу всплывает, что это и чем заменить
    const pop = overlay.querySelector('.hb-pop');
    const unselect = () => wrap.querySelectorAll('.hc-p.is-sel').forEach(i => i.classList.remove('is-sel'));
    const hidePop = () => { unselect(); pop.classList.remove('is-on'); setTimeout(() => { if (!pop.classList.contains('is-on')) pop.hidden = true; }, 200); };
    let hinted = false;
    const hintedBoxes = new Set(); // «палец» показываем один раз на каждой вкладке
    wrap.addEventListener('click', e => {
        // нажать можно на сам продукт или на его подпись с «i»
        const note = e.target.closest('.hc-note');
        const img = note ? wrap.querySelector(`.hc-p[data-p="${note.dataset.p}"]`) : e.target.closest('.hc-p');
        const p = img && PRODUCTS[img.dataset.p];
        if (!p) { hidePop(); return; }
        e.stopPropagation();
        hinted = true;
        wrap.querySelector('.hb-finger')?.remove();
        unselect();
        img.classList.add('is-sel');
        haptic();
        log(`hiking box: продукт ${p.name}`, isGuest, state.user);
        pop.innerHTML = `<img src="assets/box/cut/${img.dataset.p}.png" alt="">
            <div class="hb-pop-t"><b>${p.name}</b><span>${p.w}</span><p>${p.why}</p><small>можно заменить: ${p.swap}</small></div>
            <button type="button" class="hb-pop-x" aria-label="закрыть">✕</button>`;
        pop.hidden = false;
        requestAnimationFrame(() => pop.classList.add('is-on'));
        img.classList.remove('is-tap'); void img.offsetWidth; img.classList.add('is-tap');
    });
    pop.addEventListener('click', e => { e.stopPropagation(); log(`hiking box: закрыл карточку продукта – ${hike.title}`, isGuest, state.user); hidePop(); });
    overlay.querySelector('.hb-scroll').addEventListener('scroll', () => { if (!pop.hidden) hidePop(); }, { passive: true });
    // подсказка как у карты: «палец» дважды тапает по продуктам, продукт подпрыгивает – видно, что на них можно нажимать
    const fingerHint = () => {
        if (hinted || !overlay.isConnected || hintedBoxes.has(current)) return;
        hintedBoxes.add(current);
        const imgs = [...wrap.querySelectorAll('.hc-p')];
        const seq = [imgs[0], imgs[Math.min(2, imgs.length - 1)]].filter(Boolean);
        const f = document.createElement('div');
        f.className = 'hb-finger';
        wrap.querySelector('.hb-collage').appendChild(f);
        seq.forEach((img, i) => setTimeout(() => {
            if (hinted || !img.isConnected) return f.remove();
            f.style.left = (img.offsetLeft + img.offsetWidth / 2) + 'px';
            f.style.top = (img.offsetTop + img.offsetHeight / 2) + 'px';
            f.classList.remove('is-tap'); void f.offsetWidth; f.classList.add('is-tap');
            setTimeout(() => { if (!hinted) { img.classList.remove('is-tap'); void img.offsetWidth; img.classList.add('is-tap'); } }, 380);
        }, i * 1100));
        setTimeout(() => f.remove(), seq.length * 1100 + 300);
    };
    setTimeout(fingerHint, 900);
    document.body.appendChild(overlay);
    fitBuy(); // при первом showBox шторки ещё нет в документе – подгоняем после вставки
    document.body.style.overflow = 'hidden';

    // трансформация «из плашки»: сдвиг + масштаб от прямоугольника плашки к итоговой шторке
    const fromPlate = () => {
        // размеры шторки – из раскладки (offset*), без учёта текущего transform (например, после свайпа)
        const f = { left: sheet.offsetLeft, top: sheet.offsetTop, width: sheet.offsetWidth, height: sheet.offsetHeight };
        const p = fromEl.isConnected ? fromEl.getBoundingClientRect() : r;
        return `translate(${p.left - f.left}px, ${p.top - f.top}px) scale(${p.width / f.width}, ${p.height / f.height})`;
    };
    sheet.style.transition = 'none';
    sheet.style.transform = fromPlate();
    fromEl.style.visibility = 'hidden';
    sheet.getBoundingClientRect(); // зафиксировать стартовое положение
    requestAnimationFrame(() => {
        sheet.style.transition = '';
        sheet.style.transform = '';
        overlay.classList.add('is-on');
    });

    let closed = false;
    const close = (reason) => {
        if (closed) return;
        closed = true;
        if (reason) log(`hiking box: закрыл (${reason}) – ${hike.title}`, isGuest, state.user);
        overlay.classList.remove('is-on');
        sheet.style.transition = ''; // после свайпа sheet-drag оставляет свой transition
        sheet.style.transform = fromPlate();
        setTimeout(() => {
            overlay.remove();
            fromEl.style.visibility = '';
            if (!document.querySelector('.bottom-sheet.visible, .cs-overlay')) document.body.style.overflow = '';
        }, 360);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close('тап мимо или свайп'); });
    overlay.querySelector('.hb-close').addEventListener('click', () => { haptic(); close('крестик'); });
    // каждое нажатие в шторке бокса – в лог (а оттуда в бота). Если у элемента свой лог уже был – не дублируем.
    overlay.addEventListener('click', e => {
        const before = logSeq;
        const el = e.target.closest('button, a, [role="button"], .hc-p, .hc-note, .hb-way, .hb-swaps span, .hb-facts > div, .hb-tab, .hb-card-hint, .hb-pop, .hb-collage, .hb-price, .hb-why, .hb-sub, .hb-title') || e.target;
        setTimeout(() => {
            if (logSeq !== before || !overlay.isConnected && e.target === overlay) return;
            const text = String(el.getAttribute?.('aria-label') || el.textContent || el.className || el.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            log(`hiking box: нажал «${text || 'пустое место'}» – ${hike.title}`, isGuest, state.user);
        }, 0);
    }, true);
    // «оформить карту» в плашке цен – только тем, у кого карты нет
    // и строка над кнопкой покупки: «скидка 10% с картой интеллигента · оформить ›»
    overlay.querySelectorAll('.hb-card-hint').forEach(el => {
        // владельцу карты – та же плашка, но без «оформить»: просто напоминание о его скидке
        if (isMember) {
            el.classList.add('is-member');
            el.querySelector('span').innerHTML = 'по твоей карте интеллигента – <b>скидка 10%</b>';
            el.querySelector('em').textContent = '✓';
            return;
        }
        el.addEventListener('click', () => {
            haptic();
            log(`hiking box: оформить карту – ${BOXES[current].tab}`, isGuest, state.user);
            close();
            import('./card-sheet.js').then(m => m.openCardSheet({ source: 'хайкинг бокс' })).catch(() => {});
        });
    });
    overlay.querySelectorAll('.hb-buy').forEach(btn => btn.addEventListener('click', () => {
        haptic();
        const tab = BOXES[current].tab;
        const what = btn.classList.contains('hb-custom') ? 'настроить свой'
            : `взять ${tab}${isMember ? ' с картой' : ''}`;
        openLink(shopUrl(hike, current, btn.classList.contains('hb-custom')), `hiking box: ${what} – ${hike.title}`, isGuest);
    }));
}

// 4. строка-приглашение там, где человек уже записан: «мои записи» на главной и окно «записали тебя»
export function hikingBoxRowHtml(cls = '') {
    return `<button type="button" class="hb-row ${cls}">${bentoHtml('is-sm')}`
        + `<span class="hb-row-t"><b>возьми хайкинг бокс</b><small>еда и вода на весь хайк</small></span><span class="hb-row-go">›</span></button>`;
}
export function bindHikingBoxRow(el, hikeDate, source, before) {
    if (!el) return;
    el.addEventListener('click', e => {
        e.stopPropagation();
        const hike = state.hikesWithTitle.find(h => h.date === hikeDate);
        if (!hike) return;
        const isGuest = state.userCard?.status !== 'active';
        haptic();
        log(`hiking box: из «${source}» – ${hike.title}`, isGuest, state.user);
        openHikingBox(el, hike, isGuest);
        before?.();
    });
    preloadHikingBox();
}
