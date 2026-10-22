// js/ui/offer-banner.js – баннер над нижним меню «спецпредложение карты».
// Показывается тем, кому админка (вкладка «новички») включила личное предложение: данные приходят в /api/me
// (или запросом cardOffer, если /api/me не ответил). Тап – шторка карты, где уже стоит спеццена.
// Крестик прячет баннер до следующего открытия приложения. Текст и цену задаёт админка:
// [цена], [было], [срок] подставляются здесь.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log, getCardOffer } from '../api.js';

let closedThisLaunch = false;
let timer = null;

const rub = n => `${Number(n).toLocaleString('ru-RU')} ₽`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// «2 дня», «5 ч», «40 мин» – сколько осталось до конца предложения
function leftText(expiresAt) {
    const ms = expiresAt * 1000 - Date.now();
    if (ms <= 0) return '';
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) {
        const n = d % 10, nn = d % 100;
        return `${d} ${n === 1 && nn !== 11 ? 'день' : n >= 2 && n <= 4 && (nn < 12 || nn > 14) ? 'дня' : 'дней'}`;
    }
    return h >= 1 ? `${h} ч` : `${Math.max(1, m)} мин`;
}

export function fillOfferText(tpl, offer) {
    return String(tpl || '')
        .replace(/\[цена\]/gi, rub(offer.price))
        .replace(/\[было\]/gi, rub(offer.full_price))
        .replace(/\[срок\]/gi, leftText(offer.expires_at) || 'совсем немного');
}

export function removeOfferBanner() {
    clearInterval(timer);
    timer = null;
    document.getElementById('offerBanner')?.remove();
}

// offer – { price, full_price, expires_at, title, text } (из /api/me); без него спрашиваем сервер сами.
export async function mountOfferBanner(offer) {
    if (closedThisLaunch || state.userCard?.status === 'active') return;
    if (!offer) {
        const r = await getCardOffer();
        if (!r?.active) return;
        offer = r;
    }
    if (!leftText(offer.expires_at) || document.getElementById('offerBanner')) return;

    const circle = offer.kind === 'circle';
    const el = document.createElement('div');
    el.id = 'offerBanner';
    el.className = 'offer-banner' + (circle ? ' is-circle' : '');
    const name = String(state.user?.first_name || '').trim().split(/\s+/)[0];
    const paint = () => {
        if (!leftText(offer.expires_at) || state.userCard?.status === 'active') { removeOfferBanner(); return; }
        // приглашение в близкий круг: без цены и срока – только суть
        if (circle) {
            el.innerHTML = `
            <button type="button" class="ob-main">
                <span class="ob-icon">🤝</span>
                <span class="ob-txt"><b>${name ? esc(name) + ', мы' : 'мы'} засчитали твои билеты в карту</b><small>приглашение в близкий круг клуба</small></span>
                <span class="ob-go">›</span>
            </button>
            <button type="button" class="ob-close" aria-label="скрыть">×</button>`;
            return;
        }
        el.innerHTML = `
            <button type="button" class="ob-main">
                <span class="ob-icon">🎁</span>
                <span class="ob-txt"><b>${esc(fillOfferText(offer.title, offer))}</b>${offer.text ? `<small>${esc(fillOfferText(offer.text, offer))}</small>` : ''}</span>
                <span class="ob-go">›</span>
            </button>
            <button type="button" class="ob-close" aria-label="скрыть">×</button>`;
    };
    paint();
    document.body.appendChild(el);
    timer = setInterval(paint, 60000);
    const what = circle ? 'приглашение в круг' : 'спецпредложение';
    log(`${what}: баннер показан`, true, state.user);
    getCardOffer({ seen: true }).catch(() => {}); // отметка «видел баннер» для админки

    el.addEventListener('click', e => {
        if (e.target.closest('.ob-close')) {
            haptic();
            closedThisLaunch = true;
            log(`${what}: баннер скрыт`, true, state.user);
            removeOfferBanner();
            return;
        }
        if (!e.target.closest('.ob-main')) return;
        haptic();
        log(`${what}: баннер нажат`, true, state.user);
        import('./card-sheet.js').then(m => m.openCardSheet({ source: circle ? 'баннер приглашения в круг' : 'баннер спецпредложения' }));
    });
}
