// «еда домой»: блок в разделе «привилегии» – поиск и категории магазина «Жить здорово» (−10% по карте интеллигента).
// Пока включён только для @maxmolotov. Нажатия ведут в каталог магазина; всё логируется (и уходит в бота).
import { haptic, openLink } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';

const FOOD_HOME_IDS = ['163665735']; // @maxmolotov
const SHOP = 'https://dietcakes.ru/';
// категории магазина (адреса – по каталогу dietcakes; открываются как ?product_cat=<slug>)
const TILES = [
    ['🍱', 'готовая еда', 'gotovaya-eda'],
    ['🥩', 'мясо и колбасы', 'myasnaya-produkcia'],
    ['🧀', 'сыры', 'siri'],
    ['❄️', 'заморозка', 'morozhenoe-i-zamorozka'],
    ['🍫', 'перекусы', 'poleznyj-perekus'],
    ['🥤', 'напитки', 'napitki'],
];

export function foodHomeEnabled() {
    return FOOD_HOME_IDS.includes(String(state.user?.id || ''));
}

// подписанный ID карты – для следующего шага (скидка в обычной корзине); пока только прикладываем к ссылке
let cardToken = '';
function prefetchCardToken() {
    if (cardToken || state.userCard?.status !== 'active') return;
    fetch('/api/dc-loyalty', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'app_card', initData: window.Telegram?.WebApp?.initData || '' }) })
        .then(r => r.ok ? r.json() : null)
        .then(b => { const m = /start=(dc1_\d{1,16}_[A-Za-z0-9_-]{28})$/.exec(b?.url || ''); if (m) cardToken = m[1]; })
        .catch(() => {});
}

function shopLink(params) {
    const q = new URLSearchParams({ ...params, utm_source: 'intelligentsia', utm_medium: 'app', utm_campaign: 'food_home' });
    return `${SHOP}?${q}${cardToken ? '#card=' + cardToken : ''}`;
}

export function foodHomeHtml() {
    if (!foodHomeEnabled()) return '';
    return `<div class="fh-block">
        <div class="fh-head"><b>🏠 еда домой</b><span class="fh-chip">−10% по карте</span></div>
        <div class="fh-sub">заказывай продукты «Жить здорово» с доставкой по Ялте – скидка по карте интеллигента</div>
        <form class="fh-search" id="fhSearch"><input type="search" id="fhQuery" placeholder="найти продукт" enterkeyhint="search" autocomplete="off" aria-label="найти продукт"><button type="submit" aria-label="найти">›</button></form>
        <div class="fh-tiles">${TILES.map(([e, t, slug]) => `<button type="button" class="fh-tile" data-cat="${slug}" data-name="${t}"><span>${e}</span>${t}</button>`).join('')}</div>
        <div class="fh-foot">доставка от 2 000 ₽ бесплатно · партнёр клуба «Жить здорово»</div>
    </div>`;
}

export function bindFoodHome(root = document) {
    const block = root.querySelector('.fh-block');
    if (!block) return;
    prefetchCardToken();
    log('еда домой: показал блок', false, state.user);
    block.querySelectorAll('.fh-tile').forEach(btn => btn.addEventListener('click', () => {
        haptic();
        openLink(shopLink({ product_cat: btn.dataset.cat, post_type: 'product' }), `еда домой: категория «${btn.dataset.name}»`, false);
    }));
    block.querySelector('#fhSearch')?.addEventListener('submit', e => {
        e.preventDefault();
        const text = block.querySelector('#fhQuery').value.trim().slice(0, 60);
        if (!text) return;
        haptic();
        openLink(shopLink({ s: text, post_type: 'product' }), `еда домой: поиск «${text}»`, false);
    });
}
