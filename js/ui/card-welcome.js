// js/ui/card-welcome.js – экран «карта твоя»: карта человека и все привилегии, как в шторке покупки.
// Показывается один раз новому владельцу карты (решает сервер: /api/me card_welcome, оплата за 30 дней).
import { state } from '../state.js';
import { meCall } from '../net.js';
import { log } from '../api.js';
import { haptic, showConfetti } from '../utils.js';

const DONE_KEY = 'card_welcome_done';
const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PERKS = [
    ['🥾', 'все хайки клуба', 'без билетов и оплат – просто записываешься'],
    ['🎟️', 'запись даже когда мест нет', 'набор закрыт для всех, но не для тебя – место найдётся'],
    ['🤝', 'свой +1 на хайк', 'бери с собой друга, если он ещё ни разу не был с нами'],
    ['🍕', 'события в городе', 'домашняя пицца в гостях, пикники, встречи в заведениях'],
    ['🏷️', 'привилегии в городе и онлайне', 'скидки по карте в лучших местах и магазинах – покажи QR на кассе'],
    ['🧠', 'мастермайнды на вершинах', 'бронируй свой запрос и получай саммари каждой встречи'],
    ['🫆', 'профили интеллигентов', 'заранее узнаёшь, кто идёт: профессии, увлечения, с кем обсудить идею'],
    ['🛡️', 'свободный интернет', 'наше приложение, чтобы телеграм и весь интернет работали как раньше'],
];

function hikesWord(n) {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? 'хайк' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'хайка' : 'хайков';
}

export function showCardWelcome({ name = '', cardUrl = '', plan = 'permanent', hikes = 0 } = {}) {
    document.querySelector('.cw-overlay')?.remove();
    const el = document.createElement('div');
    el.className = 'cw-overlay';
    const conf = Array.from({ length: 18 }, (_, i) => `<i class="cw-conf" style="left:${i % 2 ? Math.random() * 14 : 86 + Math.random() * 12}%;top:${10 + Math.random() * 330}px;background:${['#D9FD19', '#fff', '#7fd0ff', '#ff8fb8', '#ffd34d'][i % 5]};transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
    el.innerHTML = `
        <div class="cw-scroll">${conf}
            <div class="cw-k">добро пожаловать в клуб</div>
            <h1>${name ? esc(name) + ', карта твоя' : 'карта твоя'} 🎉</h1>
            <div class="cw-sub">теперь ты член хайкинг-клуба интеллигенции. вот что у тебя есть с этой минуты</div>
            ${cardUrl ? `<div class="cw-stage"><div class="cw-card"><img src="${esc(cardUrl)}" alt="карта интеллигента"></div></div>` : ''}
            <div class="cw-meta"><span>${plan === 'season' ? 'на год' : 'бессрочная'}</span>${hikes > 0 ? `<span>пройдено: <b>${hikes}</b> ${hikesWord(hikes)}</span>` : ''}</div>
            <div class="cs-sec">твои привилегии</div>
            ${PERKS.map(([e, t, d]) => `<div class="cs-ben"><div class="cs-e">${e}</div><div><b>${t}</b><span>${d}</span></div></div>`).join('')}
            <div style="height:96px"></div>
        </div>
        <div class="cw-foot"><button class="btn btn-yellow cw-go">выбрать следующий хайк</button></div>`;
    document.body.appendChild(el);
    try { showConfetti(); } catch (e) {}
    el.querySelector('.cw-go').addEventListener('click', () => {
        haptic();
        log('карта твоя: выбрать хайк', false, state.user);
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 250);
        setTimeout(() => document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    });
}

function markSeen() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
    meCall('card_welcome_seen').catch(() => {});
}

// при запуске: владельцу карты, которому экран ещё не показывали, – спросить сервер
export async function maybeShowCardWelcome() {
    // 14.11: всплывашки выключены для всех (Макс) – вернуть: убрать эту строку
    return;
    try {
        if (state.userCard?.status !== 'active') return;
        try { if (localStorage.getItem(DONE_KEY)) return; } catch (e) {}
        if (document.querySelector('.card-payment-overlay, .cw-overlay')) return;
        const r = await meCall('card_welcome', {}, 8000);
        if (!r?.show) { if (r && !r.wait) try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {} return; }
        log('карта твоя: экран показан', false, state.user);
        showCardWelcome(r);
        markSeen();
    } catch (e) { /* сеть – попробуем при следующем запуске */ }
}

// сразу после оплаты (payment-return.js): карта уже с картинкой – экран «карта твоя»;
// картинки ещё нет – короткая плашка, а экран и значок придут, когда Макс добавит карту
export function showCardWelcomeNow() {
    meCall('card_welcome', {}, 8000).then(r => {
        if (r?.show) { showCardWelcome(r); markSeen(); } else showCardPaid();
    }).catch(() => showCardPaid());
}

function showCardPaid() {
    document.querySelector('.cw-paid')?.remove();
    const el = document.createElement('div');
    el.className = 'modal-overlay cw-paid';
    el.innerHTML = `<div class="modal-content" style="max-width:340px;text-align:center">
        <div style="font-size:44px;line-height:1">🎉</div>
        <h2 style="margin:10px 0 6px">оплата прошла – карта твоя</h2>
        <p style="margin:0 0 16px;opacity:.75;line-height:1.4">привилегии уже работают. саму карту с твоим номером мы нарисуем и добавим в приложение – обычно в течение дня</p>
        <button class="btn btn-yellow" data-close style="width:100%">отлично</button></div>`;
    document.body.appendChild(el);
    try { showConfetti(); } catch (e) {}
    log('карта оплачена: ждём картинку', false, state.user);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) { haptic(); el.remove(); } });
}
