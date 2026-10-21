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
.zp-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0, 0, 0, .55); opacity: 0; transition: opacity .25s ease; }
.zp-overlay.is-on { opacity: 1; }
.zp-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-width: 600px; margin: 0 auto; max-height: 92vh; overflow-y: auto; box-sizing: border-box;
    padding: 10px 20px calc(env(safe-area-inset-bottom, 0px) + 22px); border-radius: 28px 28px 0 0; background: #121a23; color: #fff;
    transform: translateY(100%); transition: transform .32s cubic-bezier(.2, .9, .25, 1); }
.zp-overlay.is-on .zp-sheet { transform: none; }
.zp-grab { width: 40px; height: 5px; margin: 0 auto 14px; border-radius: 3px; background: rgba(255, 255, 255, .25); }
.zp-x { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .1); color: #fff; font-size: 14px; cursor: pointer; }
.zp-h { margin: 6px 0 0; text-align: center; font-size: 22px; font-weight: 800; }
.zp-sub { margin: 6px auto 16px; max-width: 320px; text-align: center; font-size: 13.5px; line-height: 1.45; color: rgba(255, 255, 255, .62); }
.zp-local { margin: 0 0 14px; padding: 12px 14px; border-radius: 16px; background: var(--yellow, #d9fd19); color: #1d2200; font-size: 13.5px; line-height: 1.45; }
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
        <div class="zp-sheet" role="dialog" aria-label="пропуск в заповедник">
            <div class="zp-grab"></div>
            <button type="button" class="zp-x" aria-label="закрыть">✕</button>
            <div class="zp-h">пропуск в заповедник</div>
            <div class="zp-sub">большинство наших маршрутов проходит по Ялтинскому заповеднику – пропуск оформляется онлайн за 3 минуты</div>
            <div class="zp-local">🏡 <b>прописка в Ялте или Севастополе?</b> тебе достаточно показать постоянный пропуск местного жителя – его можно оформить там же, на сайте заповедника</div>
            <div class="zp-facts"><div><b>350 ₽</b>с человека</div><div><b>1 день</b>действует до заката</div><div><b>онлайн</b>придёт на почту</div></div>
            <ol class="zp-steps">${STEPS.map(([t, tip], i) =>
                `<li><span class="zp-n">${i + 1}</span><div class="zp-t">${t}${tip ? `<small>${tip}</small>` : ''}</div></li>`).join('')}</ol>
            <button type="button" class="zp-go">оформить пропуск ›</button>
        </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
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
    document.body.style.overflow = '';
    setTimeout(() => o.remove(), 320);
}
