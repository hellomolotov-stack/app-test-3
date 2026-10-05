// js/ui/card-sheet.js – шторка «карта интеллигента»: карта крутится в 3D, что внутри, окупаемость,
// партнёры, клуб в цифрах и выбор карты. Открывается кнопкой «узнать» на главной.
import { state } from '../state.js';
import { haptic, openLink, tg } from '../utils.js';
import { log, initPayment } from '../api.js';

const CARD_IMG = 'assets/card-front.jpg';
const TICKET_PRICE = 1000;
const PERMANENT_FULL_PRICE = 7500;

const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rub = n => `${Number(n).toLocaleString('ru-RU')} ₽`;

function partnersHtml() {
    const list = (state.guestPrivileges?.city || state.privileges?.city || []).filter(p => p && p.title);
    if (!list.length) return '';
    // «-10% по карте интеллигента» → «−10%», «+1000 бонусов …» → «+1000 бонусов»
    const perk = d => {
        const m = String(d || '').match(/[-−+]\s?\d+\s?(%|бонус\w*)/i);
        return m ? m[0].replace('-', '−').replace(/\s+/g, ' ') : '';
    };
    const shortName = t => String(t).replace(/^(магазин оригинальной обуви|экипировочный центр|технологичная хайкинг-одежда|кофейня|тематическое кафе|косметика и парфюмерия|конный клуб|маникюрный салон|барбершоп)\s+/i, '');
    const chips = list.slice(0, 9).map(p => `<span>${esc(shortName(p.title))}${perk(p.description) ? ` <b>${esc(perk(p.description))}</b>` : ''}</span>`).join('');
    const more = list.length > 9 ? `<span>+${list.length - 9}</span>` : '';
    return `<div class="cs-sec">скидки партнёров · ${list.length} мест</div><div class="cs-parts">${chips}${more}</div>`;
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

export function openCardSheet({ source = 'главная', hikeDate = '', hikeTitle = '' } = {}) {
    haptic();
    log('карта: что внутри', true, state.user, { source });
    document.querySelector('.cs-overlay')?.remove();

    const season = state.popupConfig?.seasonCardPrice || 5500;
    const payoffHikes = Math.ceil(season / TICKET_PRICE);
    const isReturning = Object.keys(state._userRegs || {}).some(d => state._userRegs[d] === true && new Date(d) < new Date(new Date().toDateString()));

    const overlay = document.createElement('div');
    overlay.className = 'cs-overlay';
    overlay.innerHTML = `
        <div class="cs-sheet">
            <div class="cs-grab"></div>
            <div class="cs-scroll">
                <div class="cs-hero">
                    <div class="cs-stage"><div class="cs-card"><img src="${CARD_IMG}" alt="карта члена клуба хайкинг интеллигенции"></div></div>
                    <h2>стань своим в клубе</h2>
                    <p>карта интеллигента – это все хайки сезона, закрытые события и люди, с которыми хочется идти дальше</p>
                </div>

                <div class="cs-sec">что внутри</div>
                <div class="cs-ben"><div class="cs-e">🥾</div><div><b>все хайки сезона</b><span>без билетов и оплат – просто записываешься. <em>обычно ${rub(TICKET_PRICE)} за хайк</em></span></div></div>
                <div class="cs-ben"><div class="cs-e">🥂</div><div><b>клубные события в городе и на море</b><span>вечера, книжный клуб, встречи – только для своих</span></div></div>
                <div class="cs-ben"><div class="cs-e">🧠</div><div><b>мастермайнды на вершинах</b><span>бронируй свой запрос и получай саммари каждой встречи</span></div></div>
                <div class="cs-ben"><div class="cs-e">🫆</div><div><b>профили интеллигентов</b><span>заранее узнаешь, кто идёт: профессии, увлечения, с кем обсудить идею</span></div></div>
                <div class="cs-ben"><div class="cs-e">🛡️</div><div><b>свободный интернет</b><span>наше приложение, чтобы телеграм работал как раньше</span></div></div>

                <div class="cs-sec">окупается за ${payoffHikes} хайков</div>
                <div class="cs-payoff">
                    <b>${rub(season)} = ${String(season / TICKET_PRICE).replace('.', ',')} разовых билета</b>
                    <p>дальше каждый хайк – уже без оплаты, а событий и скидок партнёров по билету нет вовсе</p>
                    <div class="cs-boots">${Array.from({ length: payoffHikes - 1 }, (_, i) => `<i>${i + 1}</i>`).join('')}<i class="on">${payoffHikes}+</i></div>
                </div>

                ${partnersHtml()}
                ${statsHtml()}

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
            </div>
            <div class="cs-bar">
                <button type="button" class="btn btn-yellow cs-buy" id="csBuy">оформить навсегда</button>
                ${isReturning ? '' : `<button type="button" class="cs-ticket" id="csTicket">сначала схожу по билету · ${rub(TICKET_PRICE)}</button>`}
            </div>
        </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    wireTilt(overlay.querySelector('.cs-stage'), overlay.querySelector('.cs-card'));

    const close = () => {
        overlay.classList.remove('is-on');
        document.body.style.overflow = '';
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // свайп вниз по ручке закрывает
    const grab = overlay.querySelector('.cs-grab');
    let y0 = null;
    grab.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    grab.addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 40) close(); y0 = null; });
    grab.addEventListener('click', close);

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
        haptic();
        const label = buyBtn.textContent;
        buyBtn.textContent = 'открываем оплату…';
        log(plan === 'permanent' ? 'клик бессрочная карта' : 'клик сезонная карта', true, state.user, { source: 'шторка карты' });
        try {
            // на время ЧС бессрочная оформляется по цене и через оплату сезонной
            const { url } = await initPayment({
                userId: state.user?.id,
                firstName: state.user?.first_name,
                lastName: state.user?.last_name,
                username: state.user?.username,
                hikeDate, hikeTitle, cardType: 'season'
            });
            localStorage.setItem('pending_reg_celebration', JSON.stringify({ hikeDate, hikeTitle }));
            close();
            openLink(url, plan === 'permanent' ? 'оплата бессрочной карты' : 'оплата сезонной карты', true);
        } catch (err) {
            console.error('initPayment error:', err);
            buyBtn.textContent = label;
            delete buyBtn.dataset.busy;
            alert('Не удалось открыть оплату. Проверь соединение и попробуй ещё раз.');
        }
    });

    overlay.querySelector('#csTicket')?.addEventListener('click', async () => {
        haptic();
        log('карта: сначала по билету', true, state.user);
        close();
        const { showBottomSheet } = await import('./calendar.js');
        const i = (state.hikesWithTitle || []).findIndex(h => h.date === hikeDate);
        if (i !== -1) setTimeout(() => showBottomSheet(i), 320);
    });
    overlay.querySelector('#csSupport').addEventListener('click', () => {
        haptic();
        openLink('https://t.me/hellointelligent', 'карта: зачесть билет', true);
    });

    tg?.HapticFeedback?.impactOccurred?.('light');
}
