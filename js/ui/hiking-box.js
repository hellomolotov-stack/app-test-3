// js/ui/hiking-box.js – hiking box от партнёра (dietcakes.ru): плашка в шторке хайка над слайдером «иду»
// и шторка «что внутри», которая вырастает прямо из плашки. Покупка – на сайте партнёра.
// Пока тест: показываем только @hellointelligent (по числовому id Telegram).
import { state } from '../state.js';
import { haptic, openLink } from '../utils.js';
import { log } from '../api.js';

export const HIKING_BOX_TEST_IDS = ['7845375334']; // @hellointelligent
const SHOP_URL = 'https://dietcakes.ru';



// Два универсальных бокса – человек выбирает только «лёгкий» или «сытный», а начинку меняет уже в магазине.
// Коллаж нарисован на 375px: items – картинки (left/top/размер/поворот), notes – рукописные подписи, arrows – стрелки.
// Цены сайта на 15.10.2026:
//   лёгкий 446 ₽ = батончик Bombbar 139 + чипсы Bombbar 92 + Qwikler 88 + пастила Фрутилад 77 + вода 50
//   сытный 854 ₽ = сэндвич с песто 318 + коктейль 143 + вафли 112 + печенье 102 + палочки 129 + вода 50
const BOXES = {
    light: {
        tab: 'лёгкий', price: 446, count: 'пять продуктов', h: 470,
        items: [
            ['chips', 'height:190px; left:36px; top:66px; transform:rotate(-7deg); z-index:2'],
            ['water', 'height:162px; left:282px; top:62px; transform:rotate(6deg); z-index:1'],
            ['bar', 'width:226px; left:34px; top:240px; transform:rotate(-8deg); z-index:5'],
            ['qwikler', 'width:200px; left:158px; top:318px; transform:rotate(7deg); z-index:6'],
            ['frut', 'width:190px; left:16px; top:334px; transform:rotate(-4deg); z-index:7'],
        ],
        notes: [
            ['left:24px; top:16px', 'чипсы', 'хрустящие с белком'],
            ['right:24px; top:16px', 'вода', 'пол-литра', true],
            ['right:24px; top:236px', 'батончик', '20 г белка', true],
            ['left:24px; top:414px', 'пастила', 'яблоко и клюква'],
            ['right:24px; top:414px', 'Qwikler', 'орехи без сахара', true],
        ],
        arrows: ['M50 56 C 54 66, 60 74, 70 84', 'M322 56 C 318 62, 316 66, 312 72', 'M300 280 C 294 290, 284 294, 270 294',
            'M44 412 C 46 404, 50 398, 58 392', 'M322 412 C 320 402, 314 396, 306 390'],
        swaps: ['батончик → другой вкус', 'чипсы → палочки', 'пастила → печенье'],
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
            ['left:24px; top:16px', 'сэндвич', 'полноценный обед'],
            ['left:176px; top:16px', 'коктейль', '24 г белка'],
            ['right:24px; top:40px', 'вода', 'минералы', true],
            ['left:24px; top:404px', 'вафли', 'без сахара'],
            ['right:24px; top:404px', 'палочки', 'солёное с белком', true],
            ['left:140px; top:452px', 'печенье', 'сладкое без сахара'],
        ],
        arrows: ['M52 56 C 54 76, 60 96, 72 116', 'M196 58 C 200 70, 204 80, 206 92', 'M322 82 C 318 94, 312 104, 304 116',
            'M44 400 C 46 384, 56 370, 70 358', 'M322 400 C 320 384, 312 368, 300 356', 'M150 450 C 148 440, 152 432, 160 424'],
        swaps: ['коктейль → энергетик', 'сэндвич → ролл', 'печенье → батончик'],
        warn: 'сэндвич или ролл – заказ за 2 дня до хайка',
    },
};
const DEFAULT_BOX = 'optimal';
const CARD_DISCOUNT = 0.10; // скидка владельцам карты интеллигента
const rub = n => `${n.toLocaleString('ru-RU')} ₽`;
const cardPrice = n => Math.round(n * (1 - CARD_DISCOUNT));

function collageHtml(b) {
    return b.items.map(([n, st]) => `<img src="assets/box/cut/${n}.png" style="${st}" alt="">`).join('')
        + b.notes.map(([pos, t, s, r]) => `<div class="hc-note${r ? ' is-r' : ''}" style="${pos}">${t}<small>${s}</small></div>`).join('')
        + `<svg class="hc-arrows" viewBox="0 0 375 ${b.h}"><defs><marker id="hcHd" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M2 2 L9.5 6 L2.5 10.5" /></marker></defs>`
        + b.arrows.map(d => `<path marker-end="url(#hcHd)" d="${d}" />`).join('') + '</svg>';
}

export function hikingBoxEnabled() {
    return HIKING_BOX_TEST_IDS.includes(String(state.user?.id || ''));
}

// плашка над слайдером «иду» (контейнер .floating-sheet-buttons)
export function mountHikingBoxPlate(container, hike, isGuest) {
    const row = document.createElement('div');
    row.style.cssText = 'flex-basis: 100%; min-width: 0; max-width: 100%; display: flex; justify-content: center;';
    row.innerHTML = `<div class="letter-plate box-plate" role="button">
        <img class="box-plate-img" src="assets/hiking-box.png" alt="">
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
                <div class="hb-sub">еда и вода на весь хайк в одной коробке. получаешь перед стартом – и не думаешь, что взять с собой</div>
                <div class="hb-tabs" role="tablist">${Object.entries(BOXES).map(([k, b]) =>
                    `<button type="button" class="hb-tab" data-box="${k}" role="tab">${b.tab}<small>${rub(b.price)}</small></button>`).join('')}</div>
                <div class="hb-collage-wrap"><div class="hb-collage"></div></div>
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
                <div class="hb-fair"><b>без наценки</b> – по прямой цене магазина. самые заботливые цены по всей большой Ялте</div>
                <div class="hb-partner">продукты и сборка – <b>dietcakes.ru</b></div>
            </div>
            <div class="hb-bar">
                <button type="button" class="hb-card-hint"><img src="assets/card-front.jpg" alt=""><span><b></b> с картой интеллигента</span><em>оформить ›</em></button>
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
    // вкладки «лёгкий / сытный»: меняем коллаж, цену, замены и пометку про сэндвич
    let current = DEFAULT_BOX;
    const isMember = state.userCard?.status === 'active'; // владельцу карты цена на кнопке – сразу со скидкой
    // надпись на кнопке в одну строку: если не влезает (узкий экран, цена со скидкой) – чуть уменьшаем шрифт
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
        overlay.querySelector('.hb-price-k').textContent = `${b.tab} бокс`;
        overlay.querySelector('.hb-p-full b').textContent = rub(b.price);
        overlay.querySelector('.hb-p-card b').textContent = rub(cardPrice(b.price));
        overlay.querySelector('.hb-price-note').textContent = `${b.count} по ценам dietcakes.ru`;
        // на кнопке: без карты – полная цена; с картой – полная зачёркнута и цена со скидкой
        overlay.querySelector('.hb-card-hint b').textContent = rub(cardPrice(b.price));
        overlay.querySelector('.hb-buy-full').innerHTML = `взять бокс на хайк · `
            + (isMember ? `<s>${rub(b.price)}</s> ${rub(cardPrice(b.price))}` : rub(b.price));
        fitBuy();
    };
    showBox(DEFAULT_BOX);
    overlay.querySelectorAll('.hb-tab').forEach(t => t.addEventListener('click', () => {
        if (t.dataset.box === current) return;
        haptic();
        log(`hiking box: вкладка ${BOXES[t.dataset.box].tab} – ${hike.title}`, isGuest, state.user);
        showBox(t.dataset.box);
    }));
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
    const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.remove('is-on');
        sheet.style.transition = ''; // после свайпа sheet-drag оставляет свой transition
        sheet.style.transform = fromPlate();
        setTimeout(() => {
            overlay.remove();
            fromEl.style.visibility = '';
            if (!document.querySelector('.bottom-sheet.visible, .cs-overlay')) document.body.style.overflow = '';
        }, 360);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.hb-close').addEventListener('click', () => { haptic(); close(); });
    // «оформить карту» в плашке цен – только тем, у кого карты нет
    // и строка над кнопкой покупки: «с картой интеллигента – 401 ₽ · оформить карту ›»
    overlay.querySelectorAll('.hb-card-hint').forEach(el => {
        el.hidden = isMember;
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
        openLink(SHOP_URL, `hiking box: ${what} – ${hike.title}`, isGuest);
    }));
}
