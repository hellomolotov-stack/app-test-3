// js/ui/payment-return.js – возврат после оплаты карты.
// Раньше экран «оплата прошла» показывался сразу, без проверки, статус карты в открытом приложении
// не обновлялся, а если банк не возвращал человека в приложение – не происходило ничего.
// Теперь как у билета: спрашиваем наш сервер (/api/me, действие status), пока карта не станет активной,
// а если человек сам вернулся в Telegram – тихо проверяем, когда приложение снова на экране.
import { state, saveBookingStatusToLocal, saveCachedState } from '../state.js';
import { fetchServerStatus } from '../net.js';
import { log, markPaymentSeen } from '../api.js';
import { haptic, showConfetti } from '../utils.js';

const PENDING_KEY = 'pending_card_payment';
const PENDING_TTL = 24 * 60 * 60 * 1000;   // сколько помним о неподтверждённой оплате карты
const FRESH_MS = 6 * 60 * 60 * 1000;        // в эти часы после оплаты показываем экран «карта твоя»
const WATCH_MS = 20 * 60 * 1000;            // тихая проверка при возвращении на экран
const RECOVERY_MS = 2 * 60 * 60 * 1000;      // при следующих запусках проверяем тихо, если оплата была недавно

function readPending() {
    try {
        const p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
        if (!p || !p.ts || Date.now() - p.ts > PENDING_TTL) return null;
        if (p.userId && String(p.userId) !== String(state.user?.id)) return null;
        return p;
    } catch (e) { return null; }
}
function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
}

// Перед открытием оплаты карты: запомнить, что ждём подтверждения. Хранилище может быть недоступно –
// это не повод не открывать оплату (раньше ошибка записи показывала «не удалось открыть оплату»).
export function rememberCardPayment({ hikeDate = '', hikeTitle = '', plan = '' } = {}) {
    const pending = { ts: Date.now(), userId: state.user?.id || '', hikeDate: hikeDate || '', hikeTitle: hikeTitle || '', plan };
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        localStorage.setItem('pending_reg_celebration', JSON.stringify({ hikeDate: pending.hikeDate, hikeTitle: pending.hikeTitle }));
    } catch (e) { /* без хранилища проверим по ссылке возврата */ }
    watchCardPayment();
}

// карта подтверждена сервером – обновляем приложение без перезапуска
async function applyActiveCard(me) {
    state.userCard = { ...(state.userCard || {}), ...me.card, hikes: Math.max(Number(state.userCard?.hikes) || 0, Number(me.card?.hikes) || 0) };
    state._userRegs = { ...(state._userRegs || {}), ...(me.regs || {}) };
    state.hikesWithTitle.forEach((hike, index) => {
        if (state._userRegs[hike.date] === true) state.hikeBookingStatus[index] = true;
    });
    try { saveBookingStatusToLocal(); saveCachedState(); } catch (e) {}
    try {
        const [{ renderHome }, { refreshBottomSheetIfOpen }] = await Promise.all([import('./home.js'), import('./calendar.js')]);
        if (!window._deepLinkPageChanged) renderHome();
        refreshBottomSheetIfOpen();
    } catch (e) { console.error('после оплаты карты:', e); }
}

function overlay(html) {
    document.querySelectorAll('.card-payment-overlay').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'modal-overlay card-payment-overlay';
    el.innerHTML = `<div class="modal-content" style="max-width:340px; text-align:center;">${html}</div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) { haptic(); el.remove(); } });
    return el;
}

async function showCardSuccess(pending, me) {
    clearPending();
    markPaymentSeen();
    await applyActiveCard(me);
    const hikeDate = pending?.hikeDate || '';
    if (hikeDate && me.regs?.[hikeDate] === true) {
        const { showRegistrationSuccess } = await import('./calendar.js');
        showRegistrationSuccess(hikeDate, pending.hikeTitle || state.hikesWithTitle.find(h => h.date === hikeDate)?.title || '');
        return;
    }
    showConfetti();
    overlay(`
        <div style="font-size:52px; margin-bottom:16px;">🎉</div>
        <div class="modal-title" style="text-align:center; color: var(--yellow);">карта твоя!</div>
        <div class="modal-text" style="text-align:center; margin-top:8px; line-height:1.5;">оплата прошла, карта интеллигента уже в приложении – записывайся на хайки без билетов</div>
        <button class="btn btn-yellow" data-close style="margin-top:20px; width:100%;">отлично!</button>`);
}

let watch = null;
// Тихая проверка: пока приложение на экране – раз в 8 с, плюс сразу при возвращении в приложение.
export function watchCardPayment() {
    if (watch || !readPending()) return;
    const started = Date.now();
    let busy = false;
    const check = async () => {
        if (busy || document.visibilityState !== 'visible') return;
        const pending = readPending();
        if (!pending || Date.now() - started > WATCH_MS) return stop();
        busy = true;
        const me = await fetchServerStatus(6000);
        busy = false;
        if (me?.card?.status === 'active') {
            stop();
            log('оплата карты подтверждена (без ссылки возврата)', true, state.user);
            if (Date.now() - pending.ts < FRESH_MS) showCardSuccess(pending, me);
            else { clearPending(); applyActiveCard(me); }
        }
    };
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, 8000);
    function stop() {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onShow);
        window.removeEventListener('focus', onShow);
        window.Telegram?.WebApp?.offEvent?.('activated', onShow);
        watch = null;
    }
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    window.Telegram?.WebApp?.onEvent?.('activated', onShow);
    watch = { stop };
}

// Возврат по ссылке startapp=paid (оплата карты). Ждём подтверждения сервера до ~25 с.
export async function confirmCardPaymentReturn(celebration = null) {
    watch?.stop();
    const pending = readPending() || (celebration ? { ts: Date.now(), hikeDate: celebration.hikeDate || '', hikeTitle: celebration.hikeTitle || '' } : { ts: Date.now() });
    log('вернулся из оплаты карты', true, state.user);
    if (state.userCard?.status === 'active') {
        const me = await fetchServerStatus(6000);
        if (me?.card?.status === 'active') return showCardSuccess(pending, me);
    }
    const wait = overlay(`
        <div style="font-size:44px; margin-bottom:12px;">💳</div>
        <div class="modal-title" style="text-align:center;">проверяем оплату…</div>
        <div class="modal-text" style="text-align:center; margin-top:8px; line-height:1.5;">обычно это занимает несколько секунд</div>`);
    const deadline = Date.now() + 25000;
    let me = null;
    while (Date.now() < deadline) {
        me = await fetchServerStatus(6000);
        if (me?.card?.status === 'active') break;
        await new Promise(r => setTimeout(r, 2500));
    }
    wait.remove();
    if (me?.card?.status === 'active') {
        log('оплата карты подтверждена сервером', true, state.user);
        return showCardSuccess(pending, me);
    }
    // ещё не подтвердилось: продолжаем проверять тихо, человека не пугаем и не записываем вслепую
    log('оплата карты пока не подтверждена', true, state.user);
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, userId: state.user?.id || '' })); } catch (e) {}
    watchCardPayment();
    overlay(`
        <div class="modal-title" style="text-align:center; color: var(--yellow);">оплату обрабатываем</div>
        <div class="modal-text" style="text-align:center; margin-top:8px; line-height:1.5;">как только платёжная система подтвердит оплату, карта появится в приложении сама. если её нет через 15 минут – напиши нам, разберёмся</div>
        <button class="btn btn-yellow" data-support style="margin-top:16px; width:100%;">написать в поддержку</button>
        <button class="btn btn-outline" data-close style="margin-top:10px; width:100%;">хорошо</button>`)
        .querySelector('[data-support]').addEventListener('click', e => {
            e.currentTarget.closest('.card-payment-overlay')?.remove();
            import('../utils.js').then(m => m.openLink('https://t.me/hellointelligent', 'оплата карты – написать в поддержку', true));
        });
}

// При запуске: оплатил карту, но подтверждения не дождался (банк не вернул, приложение закрыли).
export async function offerPendingCardRecovery() {
    const pending = readPending();
    if (!pending) return;
    if (state.userCard?.status === 'active') {
        const me = await fetchServerStatus(6000);
        if (me?.card?.status === 'active') {
            if (Date.now() - pending.ts < FRESH_MS && !document.querySelector('.modal-overlay')) showCardSuccess(pending, me);
            else clearPending();
            return;
        }
    }
    if (Date.now() - pending.ts < RECOVERY_MS) watchCardPayment();
}
