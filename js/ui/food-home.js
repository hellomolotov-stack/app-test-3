// «продукты домой, на хайкинг и в зал»: блок в «привилегиях» – магазин «Жить здорово» (−10% по карте интеллигента).
// Всем владельцам карты (09.11): шапка, поиск, разделы сайта, счётчик экономии по карте. Нажатия логируются.
import { haptic, openLink } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { fetchWithTimeout } from '../net.js';

const SHOP = 'https://dietcakes.ru/';
// разделы магазина (адреса с сайта, 09.11.2026)
const TILES = [
    ['🍬', 'без сахара', 'proteinovye-bez-sahara', 1],
    ['💊', 'БАДы', 'bady-i-dobavki', 1],
    ['🍱', 'готовая еда', 'gotovaya-eda'],
    ['🍫', 'перекусы', 'poleznyj-perekus'],
    ['🥤', 'напитки', 'napitki'],
    ['❄️', 'заморозка', 'morozhenoe-i-zamorozka'],
    ['🌱', 'растительное', 'rastitelnye-produkty'],
    ['🌾', 'без глютена', 'bez-glyutena'],
];

// блок «продукты домой, на хайкинг и в зал» – всем владельцам карты (09.11)
export function foodHomeEnabled() {
    return state.userCard?.status === 'active';
}
// подписанный ID карты – для следующего шага (скидка в обычной корзине); пока только прикладываем к ссылке
let cardToken = '';
function prefetchCardToken() {
    if (cardToken || state.userCard?.status !== 'active') return;
    fetchWithTimeout('/api/dc-loyalty', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'app_card', initData: window.Telegram?.WebApp?.initData || '' }) })
        .then(r => r.ok ? r.json() : null)
        .then(b => { const m = /start=(dc1_\d{1,16}_[A-Za-z0-9_-]{28})$/.exec(b?.url || ''); if (m) cardToken = m[1]; })
        .catch(() => {});
}

function shopLink(path, params = {}) {
    // через наш переходник: Telegram может отбросить #card у внешней ссылки (09.11)
    const q = new URLSearchParams({ p: path, ...params, utm_source: 'intelligentsia', utm_medium: 'app', utm_campaign: 'food_home' });
    if (cardToken) q.set('c', cardToken);
    return `https://app-test-3-delta.vercel.app/assets/dc/go.html?${q}`;
}
// открыть магазин: если номер карты ещё не пришёл – подождать его (до 2,5 с), чтобы скидка не потерялась
async function openShop(path, params, action) {
    if (!cardToken && state.userCard?.status === 'active') {
        prefetchCardToken();
        for (let i = 0; i < 25 && !cardToken; i++) await new Promise(r => setTimeout(r, 100));
    }
    openLink(shopLink(path, params), action, false);
}

const rub = n => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
// шкала экономии без подписей: ступени 1 000 / 3 000 / 5 000 / 10 000 …, дошёл – новый круг
const STEPS = [1000, 3000, 5000, 10000, 20000, 50000];
function stepFill(sum) {
    let prev = 0;
    for (const s of STEPS) { if (sum < s) return (sum - prev) / (s - prev); prev = s; }
    return 1;
}

export function foodHomeHtml() {
    if (!foodHomeEnabled()) return '';
    return `<div class="fh2" id="fhBlock">
        <div class="fh2-head">
            <span class="fh2-tag">интеллигенция × жить здорово</span><span class="fh2-pct">−10%</span>
            <h3>продукты домой, на хайкинг и в зал</h3>
            <p>полезная еда, перекусы и БАДы со скидкой по карте</p>
        </div>
        <div class="fh2-in">
            <form class="fh2-search" id="fhSearch"><input type="search" id="fhQuery" placeholder="найди: творог, протеин, хлеб…" enterkeyhint="search" autocomplete="off" aria-label="найти продукт"><button type="submit" aria-label="найти">›</button></form>
            <div class="fh2-tiles">${TILES.map(([e, t, slug, hl]) => `<button type="button" class="fh2-tile${hl ? ' hl' : ''}" data-cat="${slug}" data-name="${t}"><i>${e}</i>${t}</button>`).join('')}</div>
            <div class="fh2-sav" id="fhSav" hidden><div class="fh2-sh"><span>сэкономил с картой</span><b id="fhSum">0 ₽</b></div><small>за твои заказы продуктов и хайкинг боксов</small><div class="fh2-bar"><u id="fhBar"></u></div></div>
            <button type="button" class="fh2-go" id="fhGo">открыть магазин</button>
        </div>
    </div>`;
}

export function bindFoodHome(root = document) {
    const block = root.querySelector('#fhBlock');
    if (!block) return;
    prefetchCardToken();
    log('еда домой: показал блок', false, state.user);
    block.querySelectorAll('.fh2-tile').forEach(btn => btn.addEventListener('click', () => {
        haptic();
        openShop(`product-category/${btn.dataset.cat}/`, {}, `еда домой: категория «${btn.dataset.name}»`);
    }));
    block.querySelector('#fhSearch')?.addEventListener('submit', e => {
        e.preventDefault();
        const text = block.querySelector('#fhQuery').value.trim().slice(0, 60);
        if (!text) return;
        haptic();
        openShop('', { s: text, post_type: 'product' }, `еда домой: поиск «${text}»`);
    });
    block.querySelector('#fhGo')?.addEventListener('click', () => { haptic(); openShop('', {}, 'еда домой: открыть магазин'); });
    // экономия по карте – с сервера (журнал кассы + заказы хайкинг боксов)
    fetchWithTimeout('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'food_savings', initData: window.Telegram?.WebApp?.initData || '' }) })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
            const sum = Number(d?.saved) || 0;
            const box = block.querySelector('#fhSav');
            if (!box || !block.isConnected) return;
            box.hidden = false;
            block.querySelector('#fhSum').textContent = rub(sum);
            const bar = block.querySelector('#fhBar');
            requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${Math.max(4, Math.round(stepFill(sum) * 100))}%`; }));
        }).catch(() => {});
}
