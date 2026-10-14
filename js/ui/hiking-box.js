// js/ui/hiking-box.js – hiking box от партнёра (dietcakes.ru): плашка в шторке хайка над слайдером «иду»
// и шторка «что внутри», которая вырастает прямо из плашки. Покупка – на сайте партнёра.
// Пока тест: показываем только @hellointelligent (по числовому id Telegram).
import { state } from '../state.js';
import { haptic, openLink } from '../utils.js';
import { log } from '../api.js';

export const HIKING_BOX_TEST_IDS = ['7845375334']; // @hellointelligent
const SHOP_URL = 'https://dietcakes.ru';

// состав бокса – товары dietcakes.ru; «почему на хайк» – наш пересказ их описаний
const ITEMS = [
    { img: 'roll', name: 'ролл с креветками', meta: '200 г', why: 'настоящий обед на вершине: креветки, свежие овощи и сливочный соус в тортилье – сытно, но не тяжело на спуске' },
    { img: 'shake', name: 'протеиновый коктейль Bombbar', meta: 'ванильное мороженое · 350 мл', why: 'молочный белок в бутылке: пара глотков на привале – и мышцы начинают восстанавливаться ещё на тропе' },
    { img: 'wafers', name: 'вафли Chikalab', meta: 'кокос-миндаль · 40 г', why: '8 г белка и 183 ккал без сахара и глютена – хрустящая подзарядка на подъёме' },
    { img: 'cookie', name: 'протеиновое печенье Bombbar', meta: 'вишня · 40 г', why: 'четверть – белок, сахара нет: сладкое на привале без резкого спада сил через полчаса' },
    { img: 'sticks', name: 'протеиновые палочки Bombbar', meta: 'сметана и лук · 60 г', why: 'хрустят как чипсы, а белка 25% – солёное возвращает соль, которую теряешь с потом' },
    { img: 'water', name: 'вода Bombbar', meta: 'минеральная, без газа · 500 мл', why: 'восполняет воду и минералы, которые уходят с потом на подъёме под солнцем' },
];

export function hikingBoxEnabled() {
    return HIKING_BOX_TEST_IDS.includes(String(state.user?.id || ''));
}

// плашка над слайдером «иду» (контейнер .floating-sheet-buttons)
export function mountHikingBoxPlate(container, hike, isGuest) {
    const row = document.createElement('div');
    row.style.cssText = 'flex-basis: 100%; min-width: 0; max-width: 100%; display: flex; justify-content: center;';
    row.innerHTML = `<div class="letter-plate box-plate" role="button">
        <img class="box-plate-img" src="assets/hiking-box.png" alt="">
        <span class="letter-plate-text"><b>хайкинг бокс</b><small>обед на вершину</small></span>
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
}

// шторка вырастает из плашки: стартует ровно в её прямоугольнике и разворачивается вверх на весь экран
export function openHikingBox(fromEl, hike, isGuest) {
    document.querySelector('.hb-overlay')?.remove();
    const r = fromEl.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'hb-overlay';
    overlay.innerHTML = `
        <div class="hb-sheet">
            <div class="cs-grab hb-grab"></div>
            <button type="button" class="hb-close" aria-label="закрыть">✕</button>
            <div class="hb-scroll">
                <img class="hb-hero" src="assets/hiking-box.png" alt="">
                <div class="hb-title">хайкинг бокс</div>
                <div class="hb-sub">поднимаешься налегке – а на вершине уже ждёт обед, сладкое и вода. собираем к хайку: привезём или заберёшь сам</div>
                <div class="hb-label">что внутри</div>
                <div class="hb-list">${ITEMS.map(it => `
                    <div class="hb-item">
                        <div class="hb-pic"><img src="assets/box/${it.img}.png" alt="" loading="lazy"></div>
                        <div class="hb-txt"><b>${it.name}</b><small>${it.meta}</small><span>${it.why}</span></div>
                    </div>`).join('')}
                </div>
                <div class="hb-partner">продукты и сборка – <b>dietcakes.ru</b></div>
            </div>
            <div class="hb-bar"><button type="button" class="btn btn-yellow hb-buy">взять бокс с собой</button></div>
        </div>`;
    const sheet = overlay.querySelector('.hb-sheet');
    // старт – в рамке плашки
    Object.assign(sheet.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: '22px' });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    fromEl.style.visibility = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        overlay.classList.add('is-on');
        const tgw = window.Telegram?.WebApp;
        const inset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
        const top = inset ? inset + 14 : 40;
        Object.assign(sheet.style, { top: top + 'px', left: '0px', width: '100%', height: `calc(100% - ${top}px)`, borderRadius: '28px 28px 0 0' });
    }));

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.remove('is-on');
        sheet.style.transition = ''; // после свайпа sheet-drag оставляет свой transition
        const r2 = fromEl.isConnected ? fromEl.getBoundingClientRect() : r;
        sheet.style.transform = '';
        Object.assign(sheet.style, { top: r2.top + 'px', left: r2.left + 'px', width: r2.width + 'px', height: r2.height + 'px', borderRadius: '22px' });
        setTimeout(() => {
            overlay.remove();
            fromEl.style.visibility = '';
            if (!document.querySelector('.bottom-sheet.visible, .cs-overlay')) document.body.style.overflow = '';
        }, 380);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.hb-close').addEventListener('click', () => { haptic(); close(); });
    overlay.querySelector('.hb-buy').addEventListener('click', () => {
        haptic();
        openLink(SHOP_URL, `hiking box: взять – ${hike.title}`, isGuest);
    });
}
