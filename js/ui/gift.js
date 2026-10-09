// js/ui/gift.js – подарок: карта интеллигента другу.
// Даритель оплачивает подарочную карту в шторке карты (openCardSheet({ gift: true })) и возвращается
// по startapp=giftpaid_<invId>: здесь он получает ссылку-подарок startapp=gift_<код> и отправляет её.
// Получатель открывает ссылку, видит «Имя дарит тебе карту» и принимает подарок (giftClaim) –
// заявка уходит организаторам, карту выпускают как обычно. Проверки – на сервере (handleGift).
import { state } from '../state.js';
import { haptic, tg, showConfetti } from '../utils.js';
import { log, inviteApi as serverCall } from '../api.js';

const CARD_IMG = 'assets/card-front.jpg';
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function openSheet() {
    document.querySelector('.inv-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-sheet"><div class="inv-grab cs-grab"></div><div class="inv-loading">открываем подарок…</div></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const close = () => { overlay.classList.remove('is-on'); setTimeout(() => overlay.remove(), 300); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    return { overlay, sheet: overlay.querySelector('.inv-sheet'), close };
}

function shareGift(link) {
    const text = 'дарю тебе карту интеллигента 🎁 все хайки сезона, закрытые события клуба и свои люди. открой ссылку и прими подарок';
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
}

// ==================== ДАРИТЕЛЬ: ПОСЛЕ ОПЛАТЫ ====================
export async function openGiftPaidScreen(inv) {
    log('подарок: вернулся после оплаты', false, state.user, { inv });
    const { sheet, close } = openSheet();
    // ResultURL от Robokassa может прийти чуть позже возврата – ждём ссылку до ~20 секунд
    let res = null;
    for (let i = 0; i < 10; i++) {
        try {
            res = await serverCall('giftStatus', { inv });
            if (res.ready) break;
        } catch (e) { res = { error: e.message }; break; }
        await new Promise(r => setTimeout(r, 2000));
    }
    if (!res || res.error || !res.ready) {
        sheet.innerHTML = `<div class="inv-grab cs-grab"></div><div class="inv-scroll">
            <div class="inv-emoji">🎁</div>
            <h2>оплату подарка обрабатываем</h2>
            <p class="inv-sub">обычно это занимает меньше минуты. ссылка-подарок придёт тебе в бот, как только оплата подтвердится</p>
            <button class="btn btn-outline inv-wide" data-close>хорошо</button></div>`;
        sheet.querySelector('[data-close]').addEventListener('click', close);
        return;
    }
    showConfetti();
    sheet.innerHTML = `<div class="inv-grab cs-grab"></div><div class="inv-scroll">
        <div class="gift-card"><img src="${CARD_IMG}" alt="карта интеллигента"></div>
        <h2>подарок готов!</h2>
        <p class="inv-sub">${res.gift_card_type === 'season' ? 'сезонная карта – действует начиная с текущего сезона плюс следующий' : 'бессрочная карта – без продлений'}</p>
        <p class="inv-sub">${res.claimed ? `🤍 подарок уже принят${res.claimed_name ? ` – ${esc(res.claimed_name)}` : ''}` : 'отправь эту ссылку тому, кому даришь карту – он откроет её, увидит, что карта от тебя, и примет подарок в приложении'}</p>
        <div class="gift-link-box"><span>${esc(res.link)}</span></div>
        <button class="btn btn-yellow inv-wide" data-share>отправить подарок</button>
        <button class="btn btn-outline inv-wide" data-copy>скопировать ссылку</button>
        <div class="inv-note">ссылка также придёт тебе в бот, чтобы не потерялась</div></div>`;
    sheet.querySelector('[data-share]').addEventListener('click', () => { haptic(); log('подарок: отправил ссылку', false, state.user); shareGift(res.link); });
    sheet.querySelector('[data-copy]').addEventListener('click', async e => {
        haptic();
        try { await navigator.clipboard.writeText(res.link); e.currentTarget.textContent = 'скопировано ✓'; }
        catch (err) { e.currentTarget.textContent = 'не получилось – выдели ссылку выше'; }
    });
}

// ==================== ПОЛУЧАТЕЛЬ ====================
export async function openGiftReceiveScreen(code) {
    log('подарок: открыл подарок', state.userCard?.status !== 'active', state.user, { code });
    const { sheet, close } = openSheet();
    let info;
    try {
        info = await serverCall('giftInfo', { code });
    } catch (e) {
        sheet.innerHTML = `<div class="inv-grab cs-grab"></div><div class="inv-scroll"><div class="inv-msg">подарок не найден – возможно, ссылка скопировалась не целиком</div><button class="btn btn-outline inv-wide" data-close>закрыть</button></div>`;
        sheet.querySelector('[data-close]').addEventListener('click', close);
        return;
    }
    const name = esc(info.from_name || 'член клуба');
    let action;
    if (info.self) action = `<div class="inv-msg">это твой подарок – отправь ссылку тому, кому даришь карту</div>`;
    else if (info.claimed_by_me) action = `<div class="inv-msg is-ok">🤍 подарок уже твой – организатор свяжется с тобой, чтобы выпустить карту</div>`;
    else if (info.claimed) action = `<div class="inv-msg">этот подарок уже принял другой человек</div>`;
    else if (info.has_card) action = `<div class="inv-msg">у тебя уже есть карта интеллигента 🤍 подарок лучше передать тому, у кого её ещё нет</div>`;
    else action = `<button class="btn btn-yellow inv-wide" data-claim>принять подарок</button>`;

    sheet.innerHTML = `<div class="inv-grab cs-grab"></div><div class="inv-scroll">
        <div class="gift-card"><img src="${CARD_IMG}" alt="карта интеллигента"></div>
        <h2><span>${name}</span> дарит тебе карту интеллигента</h2>
        <p class="inv-sub">${info.gift_card_type === 'season' ? 'сезонная' : 'бессрочная'} карта главного хайкинг-клуба большой Ялты: все хайки сезона, закрытые события и люди, с которыми хочется идти дальше${info.gift_card_type === 'season' ? '<br><br>действует начиная с текущего сезона плюс следующий' : ''}</p>
        <button type="button" class="inv-card-link" data-what>что даёт карта <span>›</span></button>
        <div class="inv-action">${action}</div></div>`;
    if (!info.self && !info.claimed && !info.has_card) showConfetti();

    sheet.querySelector('[data-what]').addEventListener('click', () => {
        haptic();
        import('./card-sheet.js').then(m => m.openCardSheet({ source: 'подарок' }));
    });
    const claimBtn = sheet.querySelector('[data-claim]');
    claimBtn?.addEventListener('click', async () => {
        if (claimBtn.dataset.busy) return;
        claimBtn.dataset.busy = '1';
        haptic();
        claimBtn.textContent = 'принимаем…';
        try {
            await serverCall('giftClaim', { code });
            log('подарок: принял', true, state.user);
            showConfetti();
            sheet.querySelector('.inv-action').innerHTML = `
                <div class="inv-msg is-ok">🎉 карта твоя!</div>
                <p class="inv-sub">организатор свяжется с тобой, чтобы выпустить карту. а пока загляни в календарь – там ближайшие хайки</p>
                <button class="btn btn-outline inv-wide" data-close>отлично</button>`;
            sheet.querySelector('[data-close]').addEventListener('click', close);
        } catch (e) {
            claimBtn.textContent = 'принять подарок';
            delete claimBtn.dataset.busy;
            alert(e.message || 'не получилось принять подарок, попробуй ещё раз');
        }
    });
}
