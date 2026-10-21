// Шторка «пропуск в заповедник»: пошаговая инструкция, как оформить туристическое разрешение
// на zapovedcrimea.ru. Открывается из меню и по ссылке t.me/yaltahiking_bot?startapp=zapovednik
import { state } from '../state.js';
import { haptic, openLink } from '../utils.js';
import { log } from '../api.js';

const PASS_URL = 'https://zapovedcrimea.ru/choose-pass';

const STEPS = [
    ['открой сайт заповедника и выбери <b>туристическое разрешение</b>', 'детям до 17 лет включительно – льготное разрешение'],
    ['количество участников – <b>1</b>: оформляешь только на себя'],
    ['выбери <b>маршрут хайка</b>. если в описании хайка их несколько – добавь их в маршруты №2 и №3'],
    ['впиши <b>свои</b> ФИО полностью, почту и телефон – разрешение придёт на почту'],
    ['<b>дата посещения</b> – день хайка. иностранных граждан – <b>0</b>'],
    ['поставь галочку «руководитель подтверждает…» и нажми <b>оплатить</b>'],
    ['<b>сохрани разрешение</b> скриншотом или PDF в телефон – на маршруте может не быть связи'],
];

const CSS = `
.zp-overlay { position: fixed; inset: 0; z-index: 4200; background: rgba(0, 0, 0, .55); opacity: 0; transition: opacity .25s ease; overscroll-behavior: none; }
.zp-overlay.is-on { opacity: 1; }
.zp-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; max-height: 92vh; max-height: 92dvh; overflow: hidden; box-sizing: border-box; display: flex; flex-direction: column;
    padding: 10px 0 0; border-radius: 28px 28px 0 0; background: #121a23; color: #fff;
    transform: translateY(100%); transition: transform .32s cubic-bezier(.2, .9, .25, 1); }
.zp-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; -webkit-overflow-scrolling: touch; padding: 0 20px calc(env(safe-area-inset-bottom, 0px) + 22px); }
.zp-head { position: relative; flex: none; height: 40px; }
.zp-overlay.is-on .zp-sheet { transform: none; }
.zp-grab { width: 40px; height: 5px; margin: 0 auto 14px; border-radius: 3px; background: rgba(255, 255, 255, .25); }
.zp-x { position: absolute; top: 0; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .1); color: #fff; font-size: 14px; cursor: pointer; }
.zp-h { margin: 6px 0 0; text-align: center; font-size: 22px; font-weight: 800; }
.zp-sub { margin: 6px auto 16px; max-width: 320px; text-align: center; font-size: 13.5px; line-height: 1.45; color: rgba(255, 255, 255, .62); }
.zp-local { margin: 0 0 14px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 255, 255, .04); border: 1.5px dashed rgba(255, 255, 255, .28); color: rgba(255, 255, 255, .85); font-size: 13.5px; line-height: 1.45; }
.zp-local b { font-weight: 800; }
.zp-facts { display: flex; gap: 8px; margin-bottom: 20px; }
.zp-facts div { flex: 1; padding: 9px 6px; border-radius: 14px; background: rgba(255, 255, 255, .06); text-align: center; font-size: 12px; line-height: 1.35; color: rgba(255, 255, 255, .6); }
.zp-facts b { display: block; font-size: 17px; font-weight: 800; color: var(--yellow, #d9fd19); }
.zp-steps { position: relative; margin: 0; padding: 0; list-style: none; }
.zp-steps li { position: relative; display: flex; gap: 14px; padding-bottom: 18px; }
.zp-steps li:last-child { padding-bottom: 0; }
/* пунктир от кружка к следующему шагу */
.zp-steps li:not(:last-child)::after { content: ''; position: absolute; left: 13px; top: 30px; bottom: 2px; border-left: 2px dashed rgba(217, 253, 25, .45); }
.zp-n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--yellow, #d9fd19); color: #1d2200; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.zp-t { flex: 1; min-width: 0; padding-top: 4px; font-size: 14.5px; line-height: 1.45; color: rgba(255, 255, 255, .88); }
.zp-t b { color: #fff; font-weight: 700; }
.zp-t small { display: block; margin-top: 4px; font-size: 12.5px; color: rgba(255, 255, 255, .5); }
.zp-go { display: block; width: 100%; height: 52px; margin-top: 22px; border: 0; border-radius: 16px; background: var(--yellow, #d9fd19); color: #1d2200; font: inherit; font-size: 16px; font-weight: 800; cursor: pointer; }
`;

let overlay = null;
let restoreGuide = null;

export function openZapovednikGuide(source = 'меню') {
    if (overlay) return;
    if (!document.getElementById('zpCss')) {
        const st = document.createElement('style');
        st.id = 'zpCss';
        st.textContent = CSS;
        document.head.appendChild(st);
    }
    const isGuest = state.userCard?.status !== 'active';
    log(`пропуск в заповедник: открыл (${source})`, isGuest, state.user);
    overlay = document.createElement('div');
    overlay.className = 'zp-overlay';
    overlay.innerHTML = `
        <div class="zp-sheet" role="dialog" aria-modal="true" aria-label="пропуск в заповедник" tabindex="-1">
            <div class="zp-head"><div class="zp-grab cs-grab"></div>
            <button type="button" class="zp-x" aria-label="закрыть">✕</button></div>
            <div class="zp-scroll">
            <div class="zp-h">пропуск в заповедник</div>
            <div class="zp-sub">большинство наших маршрутов проходит по Ялтинскому заповеднику – пропуск оформляется онлайн за 3 минуты</div>
            <div class="zp-local">🏡 <b>прописка в Ялте или Севастополе?</b> тебе достаточно показать постоянный пропуск местного жителя – его можно оформить там же, на сайте заповедника</div>
            <div class="zp-facts"><div><b>350 ₽</b>с человека</div><div><b>1 день</b>действует до заката</div><div><b>онлайн</b>придёт на почту</div></div>
            <ol class="zp-steps">${STEPS.map(([t, tip], i) =>
                `<li><span class="zp-n">${i + 1}</span><div class="zp-t">${t}${tip ? `<small>${tip}</small>` : ''}</div></li>`).join('')}</ol>
            <button type="button" class="zp-go">оформить пропуск ›</button>
            </div>
        </div>`;
    const o = overlay;
    // высота – как у шторки хайка: не выше системных кнопок Telegram (верхний отступ + запас)
    const tgw = window.Telegram?.WebApp;
    const topInset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
    const topGap = topInset ? topInset + 14 : 40;
    const zsheet = o.querySelector('.zp-sheet');
    zsheet.style.maxHeight = `calc(100vh - ${topGap}px)`;
    zsheet.style.maxHeight = `calc(100dvh - ${topGap}px)`;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const background = [...document.body.children].filter(el => el !== o && el instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(el.tagName));
    const inertStates = background.map(el => [el, el.inert]);
    background.forEach(el => { el.inert = true; });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeZapovednikGuide(); }
        if (e.key === 'Tab') {
            const first = o.querySelector('.zp-x'), last = o.querySelector('.zp-go');
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };
    document.addEventListener('keydown', onKey, true);
    restoreGuide = () => {
        document.removeEventListener('keydown', onKey, true);
        inertStates.forEach(([el, inert]) => { el.inert = inert; });
        document.body.style.overflow = previousOverflow;
        if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    };
    requestAnimationFrame(() => { if (overlay === o) { o.classList.add('is-on'); o.querySelector('.zp-x').focus({ preventScroll: true }); } });
    overlay.addEventListener('click', (e) => {
        if (e.target.closest('.zp-go')) {
            haptic();
            log('пропуск в заповедник: перешёл на сайт', isGuest, state.user);
            openLink(PASS_URL);
            return;
        }
        if (e.target === overlay || e.target.closest('.zp-x')) { haptic(); closeZapovednikGuide(); }
    });
}

export function closeZapovednikGuide() {
    if (!overlay) return;
    const o = overlay;
    overlay = null;
    o.classList.remove('is-on');
    o.style.pointerEvents = 'none';
    restoreGuide?.();
    restoreGuide = null;
    setTimeout(() => o.remove(), 320);
}
