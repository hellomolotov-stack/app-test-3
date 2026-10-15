// js/ui/hiking-box.js – hiking box от партнёра (dietcakes.ru): плашка в шторке хайка над слайдером «иду»
// и шторка «что внутри», которая вырастает прямо из плашки. Покупка – на сайте партнёра.
// Пока тест: показываем только @hellointelligent (по числовому id Telegram).
import { state } from '../state.js';
import { haptic, openLink } from '../utils.js';
import { log } from '../api.js';

export const HIKING_BOX_TEST_IDS = ['7845375334']; // @hellointelligent
const SHOP_URL = 'https://dietcakes.ru';



// 854 ₽ = сэндвич с песто 318 + коктейль 143 + вафли 112 + печенье 102 + палочки 129 + вода 50 (цены сайта на 15.10.2026)
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
}

// шторка вырастает из плашки: стартует ровно в её прямоугольнике и разворачивается вверх на весь экран
export function openHikingBox(fromEl, hike, isGuest) {
    if (!document.getElementById('caveatFont')) {
        const l = document.createElement('link');
        l.id = 'caveatFont'; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap';
        document.head.appendChild(l);
    }
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
                <div class="hb-collage-wrap"><div class="hb-collage">
                    <img class="hc-sandwich" src="assets/box/cut/pesto.png" alt="">
                    <img class="hc-shake" src="assets/box/cut/shake.png" alt="">
                    <img class="hc-water" src="assets/box/cut/water.png" alt="">
                    <img class="hc-sticks" src="assets/box/cut/sticks.png" alt="">
                    <img class="hc-wafers" src="assets/box/cut/wafers.png" alt="">
                    <img class="hc-cookie" src="assets/box/cut/cookie.png" alt="">
                    <div class="hc-note" style="left:24px; top:16px;">сэндвич<small>сытный обед</small></div>
                    <div class="hc-note" style="left:176px; top:16px;">коктейль<small>24 г белка</small></div>
                    <div class="hc-note is-r" style="right:24px; top:40px;">вода<small>минералы</small></div>
                    <div class="hc-note" style="left:24px; top:404px;">вафли<small>без сахара</small></div>
                    <div class="hc-note is-r" style="right:24px; top:404px;">палочки<small>солёное с белком</small></div>
                    <div class="hc-note" style="left:140px; top:452px;">печенье<small>сладкое без сахара</small></div>
                    <svg class="hc-arrows" viewBox="0 0 375 500">
                        <defs><marker id="hcHd" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M2 2 L9.5 6 L2.5 10.5" /></marker></defs>
                        <path marker-end="url(#hcHd)" d="M52 56 C 54 76, 60 96, 72 116" />
                        <path marker-end="url(#hcHd)" d="M196 58 C 200 70, 204 80, 206 92" />
                        <path marker-end="url(#hcHd)" d="M322 82 C 318 94, 312 104, 304 116" />
                        <path marker-end="url(#hcHd)" d="M44 400 C 46 384, 56 370, 70 358" />
                        <path marker-end="url(#hcHd)" d="M322 400 C 320 384, 312 368, 300 356" />
                        <path marker-end="url(#hcHd)" d="M150 450 C 148 440, 152 432, 160 424" />
                    </svg>
                </div></div>
                <div class="hb-label">как получить</div>
                <div class="hb-ways">
                    <div class="hb-way"><span>🚚</span><b>доставка по Ялте</b><small>накануне</small></div>
                    <div class="hb-way"><span>🏪</span><b>самовывоз</b><small>из магазина</small></div>
                    <div class="hb-way is-hl"><span>🏔</span><b>на хайк</b><small>на точке сбора</small></div>
                </div>
                <div class="hb-price"><span class="hb-price-k">весь бокс</span><b>854 ₽</b><small>шесть продуктов по ценам dietcakes.ru</small></div>
                <div class="hb-partner">продукты и сборка – <b>dietcakes.ru</b></div>
            </div>
            <div class="hb-bar"><button type="button" class="btn btn-yellow hb-buy">взять бокс с собой</button><button type="button" class="btn hb-buy hb-custom">настроить свой бокс</button></div>
        </div>`;
    const sheet = overlay.querySelector('.hb-sheet');
    const fitCollage = () => {
        const wrap = overlay.querySelector('.hb-collage-wrap');
        if (!wrap) return;
        const k = Math.min(1.15, window.innerWidth / 375); // шторка во всю ширину экрана
        wrap.style.setProperty('--hc-k', k.toFixed(3));
    };
    // старт – в рамке плашки
    Object.assign(sheet.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: '22px' });
    document.body.appendChild(overlay);
    fitCollage();
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
    overlay.querySelectorAll('.hb-buy').forEach(btn => btn.addEventListener('click', () => {
        haptic();
        const custom = btn.classList.contains('hb-custom');
        openLink(SHOP_URL, `hiking box: ${custom ? 'настроить свой' : 'взять'} – ${hike.title}`, isGuest);
    }));
}
