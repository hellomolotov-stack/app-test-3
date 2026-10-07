// js/ui/card-sheet.js – шторка «карта интеллигента»: карта крутится в 3D, что внутри, окупаемость,
// партнёры, клуб в цифрах и выбор карты. Открывается кнопкой «узнать» на главной.
import { state } from '../state.js';
import { haptic, openLink, tg } from '../utils.js';
import { log, initPayment, getCardOffer, paymentErrorText } from '../api.js';

const CARD_IMG = 'assets/card-front.jpg';
const TICKET_PRICE = 1000;
const PERMANENT_FULL_PRICE = 7500;

const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rub = n => `${Number(n).toLocaleString('ru-RU')} ₽`;

function partnersHtml() {
    // «на утро : на вечер» пока прячем – по ней непонятно, что за скидка
    const list = (state.guestPrivileges?.city || state.privileges?.city || []).filter(p => p && p.title && !/на утро/i.test(p.title));
    if (!list.length) return '';
    // «-10% по карте интеллигента» → «−10%», «+1000 бонусов …» → «+1000 бонусов»
    const perk = d => {
        const m = String(d || '').match(/[-−+]\s?\d+\s?(%|бонус[а-яё]*)/i);
        return m ? m[0].replace('-', '−').replace(/\s+/g, ' ') : '';
    };
    const shortName = t => String(t).replace(/^(магазин оригинальной обуви|экипировочный центр|технологичная хайкинг-одежда|кофейня|тематическое кафе|косметика и парфюмерия|конный клуб|маникюрный салон|барбершоп)\s+/i, '');
    const chips = list.slice(0, 9).map(p => `<span>${esc(shortName(p.title))}${perk(p.description) ? ` <b>${esc(perk(p.description))}</b>` : ''}</span>`).join('');
    const more = list.length > 9 ? `<span>+${list.length - 9}</span>` : '';
    return `<div class="cs-sec">скидки партнёров в Ялте и онлайне</div><div class="cs-parts">${chips}${more}</div>`;
}

// «уже 20+ владельцев карты» – с настоящими аватарками участников, если они загружены
function membersHtml() {
    const count = state.popupConfig?.membersText || '20+';
    const faces = Object.values(state.profiles || {}).filter(p => p && p.avatarUrl).slice(0, 4)
        .map(p => `<img src="${esc(p.avatarUrl)}" alt="" onerror="this.remove()">`).join('');
    const dots = faces || '<i></i><i></i><i></i>';
    return `<div class="cs-members"><span class="cs-faces">${dots}</span>уже ${esc(count)} владельцев карты</div>`;
}

function statsHtml() {
    const m = state.metrics || {};
    const items = [[m.hikes, 'хайков'], [m.kilometers, 'км вместе'], [m.meetings, 'встреч']].filter(([v]) => v);
    if (!items.length) return '';
    return `<div class="cs-sec">клуб в цифрах</div><div class="cs-stats">${items.map(([v, l]) => `<div><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>`;
}

// 3D: карта сама слегка покачивается, а под пальцем наклоняется за ним
function wireTilt(stage, card) {
    let raf = null;
    const set = (rx, ry) => { card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; card.style.setProperty('--shine', `${50 + ry * 3}%`); };
    const onMove = e => {
        const p = e.touches ? e.touches[0] : e;
        const r = stage.getBoundingClientRect();
        const x = (p.clientX - r.left) / r.width - 0.5;
        const y = (p.clientY - r.top) / r.height - 0.5;
        card.classList.add('is-held');
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => set(-y * 22, x * 28));
    };
    const onEnd = () => { card.classList.remove('is-held'); card.style.transform = ''; };
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('touchmove', onMove, { passive: true });
    stage.addEventListener('pointerleave', onEnd);
    stage.addEventListener('touchend', onEnd);
}

// gift: true – подарочный режим: «подари карту», одна цена, после оплаты дарителю приходит ссылка-подарок
export function openCardSheet({ source = 'главная', hikeDate = '', hikeTitle = '', gift = false } = {}) {
    let offerTimer = null;
    haptic();
    log(gift ? 'подарок: открыл шторку' : 'карта: что внутри', !gift, state.user, { source });
    document.querySelector('.cs-overlay')?.remove();

    const season = state.popupConfig?.seasonCardPrice || 5500;
    const isReturning = Object.keys(state._userRegs || {}).some(d => state._userRegs[d] === true && new Date(d) < new Date(new Date().toDateString()));

    const overlay = document.createElement('div');
    overlay.className = 'cs-overlay';
    overlay.innerHTML = `
        <div class="cs-sheet">
            <div class="cs-grab"></div>
            <div class="cs-scroll">
                <div class="cs-hero">
                    <div class="cs-stage"><div class="cs-card"><img src="${CARD_IMG}" alt="карта члена клуба хайкинг интеллигенции"></div></div>
                    <h2>${gift ? 'подари новый опыт' : 'стань интеллигентом'}</h2>
                    <div class="cs-club">в главном хайкинг-клубе большой Ялты</div>
                    <p>${gift ? 'подари другу то, что есть у тебя: все хайки сезона, закрытые события и людей, с которыми хочется идти дальше' : 'карта интеллигента – это все хайки сезона, закрытые события и люди, с которыми хочется идти дальше'}</p>
                    ${membersHtml()}
                </div>

                <div class="cs-sec">что внутри</div>
                <div class="cs-ben"><div class="cs-e">🥾</div><div><b>все хайки сезона</b><span>без билетов и оплат – просто записываешься. <em>обычно ${rub(TICKET_PRICE)} за хайк</em></span></div></div>
                <div class="cs-ben"><div class="cs-e">🤝</div><div><b>свой +1 на хайк</b><span>бери с собой друга, если он ещё ни разу не был с нами</span></div></div>
                <div class="cs-ben"><div class="cs-e">🥂</div><div><b>клубные события в городе и на море</b><span>вечера, книжный клуб, встречи – только для своих</span></div></div>
                <div class="cs-ben"><div class="cs-e">🧠</div><div><b>мастермайнды на вершинах</b><span>бронируй свой запрос и получай саммари каждой встречи</span></div></div>
                <div class="cs-ben"><div class="cs-e">🫆</div><div><b>профили интеллигентов</b><span>заранее узнаешь, кто идёт: профессии, увлечения, с кем обсудить идею</span></div></div>
                <div class="cs-ben"><div class="cs-e">🛡️</div><div><b>свободный интернет</b><span>наше приложение по обходу блокировок, чтобы телеграм и весь интернет работали как раньше</span></div></div>

                ${partnersHtml()}
                ${statsHtml()}

                ${gift ? `
                <div class="cs-sec">как подарить</div>
                <div class="cs-gift-steps">
                    <div><i>1</i><span>оплачиваешь карту</span></div>
                    <div><i>2</i><span>получаешь ссылку-подарок</span></div>
                    <div><i>3</i><span>друг открывает её и видит, что карта от тебя</span></div>
                </div>
                <div class="cs-gift-price">
                    <div><b>бессрочная карта</b><span>без продлений – клуб навсегда</span></div>
                    <div class="cs-gift-sum"><s>${rub(PERMANENT_FULL_PRICE)}</s><b>${rub(season)}</b></div>
                </div>
                <div class="cs-note">🕊 на время ЧС в Крыму карта интеллигента доступнее</div>
                ` : `
                <div class="cs-sec">выбери карту</div>
                <div class="cs-plans">
                    <button type="button" class="cs-plan is-on" data-plan="permanent">
                        <span class="cs-hit">навсегда</span>
                        <small>бессрочная</small>
                        <b><s>${rub(PERMANENT_FULL_PRICE)}</s> ${rub(season)}</b>
                        <span>один раз – и клуб твой без продлений</span>
                    </button>
                    <button type="button" class="cs-plan" data-plan="season">
                        <small>на сезон</small>
                        <b>${rub(season)}</b>
                        <span>все привилегии до конца 2026</span>
                    </button>
                </div>
                <div class="cs-note">🕊 на время ЧС в Крыму бессрочная карта – по цене сезонной: сильное окружение сейчас самый ценный ресурс</div>
                <button type="button" class="cs-support" id="csSupport">оплачивал билет и не успел сходить? напиши нам – зачтём его в карту</button>
                `}
            </div>
            <div class="cs-bar">
                <button type="button" class="btn btn-yellow cs-buy" id="csBuy">${gift ? `подарить карту <s>${rub(PERMANENT_FULL_PRICE).replace(' ₽', '')}</s> ${rub(season)}` : 'оформить навсегда'}</button>
                ${isReturning || gift ? '' : `<button type="button" class="cs-ticket" id="csTicket">сначала схожу по билету · ${rub(TICKET_PRICE)}</button>`}
            </div>
        </div>`;
    // верх шторки – ниже кнопок Telegram «Закрыть» и «•••» (в полноэкранном режиме они поверх приложения)
    const tgw = window.Telegram?.WebApp;
    const inset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
    overlay.querySelector('.cs-sheet').style.height = `calc(100% - ${inset ? inset + 14 : 40}px)`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    wireTilt(overlay.querySelector('.cs-stage'), overlay.querySelector('.cs-card'));

    const act = (type, d = {}) => window.dispatchEvent(new CustomEvent('club:act', { detail: { type, ...d } }));
    const openedAt = Date.now();
    let bought = false;
    act('card_sheet_open');
    const close = () => {
        clearInterval(offerTimer);
        act('card_sheet_close', { bought, ms: Date.now() - openedAt });
        overlay.classList.remove('is-on');
        document.body.style.overflow = '';
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // свайп вниз – общий для всех шторок (sheet-drag.js), тап по ручке тоже закрывает
    overlay.querySelector('.cs-grab').addEventListener('click', close);

    let plan = 'permanent';
    const buyBtn = overlay.querySelector('#csBuy');
    overlay.querySelectorAll('.cs-plan').forEach(btn => btn.addEventListener('click', () => {
        haptic();
        plan = btn.dataset.plan;
        overlay.querySelectorAll('.cs-plan').forEach(b => b.classList.toggle('is-on', b === btn));
        buyBtn.textContent = plan === 'permanent' ? 'оформить навсегда' : 'взять на сезон';
    }));

    buyBtn.addEventListener('click', async () => {
        if (buyBtn.dataset.busy) return;
        buyBtn.dataset.busy = '1';
        bought = true;
        act('card_buy');
        haptic();
        const label = buyBtn.innerHTML;
        buyBtn.textContent = 'открываем оплату…';
        log(gift ? 'подарок: клик оплатить' : (plan === 'permanent' ? 'клик бессрочная карта' : 'клик сезонная карта'), !gift, state.user, { source: 'шторка карты' });
        try {
            // на время ЧС бессрочная оформляется по цене и через оплату сезонной
            const { url } = await initPayment({
                userId: state.user?.id,
                firstName: state.user?.first_name,
                lastName: state.user?.last_name,
                username: state.user?.username,
                hikeDate: gift ? '' : hikeDate, hikeTitle: gift ? '' : hikeTitle,
                cardType: gift ? 'gift' : (plan === 'offer' ? 'offer' : 'season')
            });
            if (!gift) localStorage.setItem('pending_reg_celebration', JSON.stringify({ hikeDate, hikeTitle }));
            close();
            openLink(url, gift ? 'оплата подарочной карты' : plan === 'offer' ? 'оплата карты по спецпредложению' : (plan === 'permanent' ? 'оплата бессрочной карты' : 'оплата сезонной карты'), true);
        } catch (err) {
            console.error('initPayment error:', err);
            buyBtn.innerHTML = label;
            delete buyBtn.dataset.busy;
            alert(paymentErrorText(err, 'Не удалось открыть оплату. Проверь соединение и попробуй ещё раз.'));
        }
    });

    // личное спецпредложение: показываем, только если сервер подтвердил его для этого человека
    if (!gift && state.userCard?.status !== 'active') {
        getCardOffer().then(offer => {
            if (!offer?.active || !document.body.contains(overlay)) return;
            const price = offer.price || 5000, full = offer.full_price || 5500;
            const left = () => {
                const ms = offer.expires_at * 1000 - Date.now();
                if (ms <= 0) return null;
                const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
                return d ? `${d} дн. ${h} ч` : (h ? `${h} ч ${m % 60} мин` : `${m % 60} мин`);
            };
            if (!left()) return;
            log('карта: показали спецпредложение', true, state.user, { source });
            overlay.querySelector('.cs-members')?.insertAdjacentHTML('afterend', `
                <div class="cs-offer">
                    <div class="cs-offer-tag">🎁 спецпредложение для тебя</div>
                    <div class="cs-offer-price"><b>${rub(price)}</b> <s>${rub(full)}</s></div>
                    <div class="cs-offer-sub">бессрочная карта для тех, кто уже ходил с нами</div>
                    <div class="cs-offer-time">осталось <span id="csOfferLeft">${left()}</span></div>
                </div>`);
            const plans = overlay.querySelector('.cs-plans');
            if (plans) plans.outerHTML = `<div class="cs-plans is-offer"><div class="cs-plan is-on"><span class="cs-hit">−${rub(full - price)}</span><small>бессрочная · спецпредложение</small><b><s>${rub(full)}</s> ${rub(price)}</b><span>действует ещё <span class="cs-left2">${left()}</span></span></div></div>`;
            overlay.querySelector('.cs-note')?.remove();
            plan = 'offer';
            buyBtn.textContent = `оформить за ${rub(price)}`;
            offerTimer = setInterval(() => {
                const l = left();
                if (!l) { clearInterval(offerTimer); return; }
                overlay.querySelectorAll('#csOfferLeft, .cs-left2').forEach(el => { el.textContent = l; });
            }, 30000);
        });
    }

    overlay.querySelector('#csTicket')?.addEventListener('click', async () => {
        haptic();
        log('карта: сначала по билету', true, state.user);
        close();
        const { showBottomSheet } = await import('./calendar.js');
        const i = (state.hikesWithTitle || []).findIndex(h => h.date === hikeDate);
        if (i !== -1) setTimeout(() => showBottomSheet(i), 320);
    });
    overlay.querySelector('#csSupport')?.addEventListener('click', () => {
        haptic();
        openLink('https://t.me/hellointelligent', 'карта: зачесть билет', true);
    });

    tg?.HapticFeedback?.impactOccurred?.('light');
}
