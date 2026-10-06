// js/ui/invite.js – приглашение +1 от владельца карты (привилегия «свой +1 на хайк»).
// Владелец карты, записанный на хайк, получает личную ссылку t.me/<бот>?startapp=inv_<код> и шлёт другу.
// Друг видит «Имя приглашает тебя на хайк», конфетти, билет-карточку и кнопку «открыть хайк»:
// в шторке хайка (state.pendingInvite) он видит детали и записывается слайдером без билета.
// Все проверки (карта, первый раз, ссылка не занята) – на сервере (handleInvite).
import { state } from '../state.js';
import { haptic, tg, showConfetti } from '../utils.js';
import { log, inviteApi } from '../api.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dateRu = s => { const d = new Date(s + 'T12:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WD[d.getDay()]}`; };

function shareInvite(link, hikeTitle, hikeDate) {
    const text = `зову тебя на ${hikeTitle}, ${dateRu(hikeDate)} 🏔 по этой ссылке запишешься без билета – беру тебя как своего +1`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
}

// ==================== БЛОК «ТВОЙ +1» В ШТОРКЕ ХАЙКА ====================
export function renderPlus1Block(slot, hike) {
    if (!slot || !hike) return;
    slot.innerHTML = `
        <div class="plus1-box">
            <div class="plus1-head"><span class="plus1-ico">🤝</span><div><b>твой +1 на этот хайк</b><small>привилегия карты интеллигента</small></div></div>
            <p>можешь взять с собой друга, который ещё ни разу с нами не был. отправь ему ссылку – он увидит в приложении, что это ты его приглашаешь, и запишется без билета</p>
            <div class="plus1-status" hidden></div>
            <button type="button" class="btn btn-yellow plus1-btn">взять с собой +1</button>
        </div>`;
    const btn = slot.querySelector('.plus1-btn');
    const status = slot.querySelector('.plus1-status');
    btn.addEventListener('click', async () => {
        if (btn.dataset.busy) return;
        btn.dataset.busy = '1';
        haptic();
        const label = btn.textContent;
        btn.textContent = 'готовим ссылку…';
        try {
            const res = await inviteApi('inviteCreate', { hike_date: hike.date });
            log('+1: взял ссылку', false, state.user, { hike_date: hike.date });
            if (res.used) {
                status.hidden = false;
                status.textContent = `🤍 твой +1${res.friend ? ` – ${res.friend}` : ''} уже в списке участников`;
                btn.textContent = 'отправить ссылку ещё раз';
            } else {
                btn.textContent = label;
            }
            shareInvite(res.link, hike.title, hike.date);
        } catch (e) {
            btn.textContent = label;
            alert(e.message || 'не получилось создать ссылку, попробуй ещё раз');
        }
        delete btn.dataset.busy;
    });
}

// ==================== ЭКРАН ДЛЯ ДРУГА ПО ССЫЛКЕ ====================
export async function openInviteScreen(code) {
    log('+1: открыл приглашение', state.userCard?.status !== 'active', state.user, { code });
    document.querySelector('.inv-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay';
    overlay.innerHTML = `<div class="inv-sheet"><div class="inv-grab cs-grab"></div><div class="inv-loading">открываем приглашение…</div></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const sheet = overlay.querySelector('.inv-sheet');
    const close = () => { overlay.classList.remove('is-on'); setTimeout(() => overlay.remove(), 300); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    let info;
    try {
        info = await inviteApi('inviteInfo', { code });
    } catch (e) {
        sheet.innerHTML = `<div class="inv-msg">приглашение не найдено – возможно, ссылка скопировалась не целиком</div><button class="btn btn-outline inv-close">закрыть</button>`;
        sheet.querySelector('.inv-close').addEventListener('click', close);
        return;
    }

    const name = esc(info.inviter_name || 'член клуба');
    const openHike = () => {
        close();
        // список хайков мог ещё не прийти – ждём его до 10 секунд
        let tries = 0;
        const go = () => {
            const idx = state.hikesWithTitle.findIndex(h => h.date === info.hike_date);
            if (idx >= 0) return import('./calendar.js').then(m => m.showBottomSheet(idx));
            if (++tries < 50) setTimeout(go, 200);
        };
        go();
    };
    const d = new Date(info.hike_date + 'T12:00:00');
    const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const WDS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    // карточка-билет: дата | отрывная линия | название, старт, «+1 · без билета»
    const hikeCard = `
        <div class="inv-ticket">
            <div class="inv-ticket-date"><b>${d.getDate()}</b><small>${MON[d.getMonth()]}, ${WDS[d.getDay()]}</small></div>
            <div class="inv-ticket-cut"></div>
            <div class="inv-ticket-body">
                <b>${esc(info.hike_title || 'хайк')}</b>
                <small>${info.start_time ? `старт в ${esc(info.start_time)}` : dateRu(info.hike_date)}</small>
                <span class="inv-ticket-tag">+1 · без билета</span>
            </div>
        </div>`;

    // для кого и в каком состоянии ссылка
    let action = '';
    if (info.self) {
        action = `<div class="inv-msg">это твоё приглашение – отправь ссылку другу, и он запишется по ней без билета</div>`;
    } else if (info.used_by_me || info.registered) {
        action = `<div class="inv-msg is-ok">🤍 ты уже в списке участников</div><button class="btn btn-yellow inv-wide" data-open-hike>детали хайка</button>`;
    } else if (info.used) {
        action = `<div class="inv-msg">по этой ссылке уже записался другой человек. попроси у ${name} новое приглашение на другой хайк</div>`;
    } else if (!info.available) {
        action = `<div class="inv-msg">запись на этот хайк уже закрыта</div>`;
    } else if (!info.eligible) {
        action = `<div class="inv-msg">по приглашению приходят только в первый раз, а ты уже не новичок в клубе 🤍 на этот хайк можно записаться как обычно</div><button class="btn btn-yellow inv-wide" data-open-hike>посмотреть хайк</button>`;
    } else {
        action = `<button class="btn btn-yellow inv-wide" data-open-hike data-invite="1">открыть хайк</button>
            <div class="inv-note">в хайке – маршрут, точка сбора и время. там же и запишешься, без билета</div>`;
    }

    sheet.innerHTML = `
        <div class="inv-grab cs-grab"></div>
        <div class="inv-scroll">
            <div class="inv-emoji">🎉</div>
            <h2><span>${name}</span> приглашает тебя на хайк</h2>
            <p class="inv-sub">${name} – член клуба хайкинг интеллигенции. с картой интеллигента можно взять с собой друга, который ещё не был с нами – и сегодня это ты</p>
            <button type="button" class="inv-card-link" id="invCardLink">что такое карта интеллигента <span>›</span></button>
            ${hikeCard}
                        <div class="inv-action">${action}</div>
        </div>`;
    if (!info.self && !info.used && info.available) showConfetti();

    sheet.querySelector('#invCardLink').addEventListener('click', () => {
        haptic();
        log('+1: узнать о карте', true, state.user);
        import('./card-sheet.js').then(m => m.openCardSheet({ source: 'приглашение +1' }));
    });
    sheet.querySelectorAll('[data-open-hike]').forEach(b => b.addEventListener('click', () => {
        haptic();
        if (b.dataset.invite) {
            // шторка хайка увидит приглашение: плашка сверху и запись слайдером без билета
            state.pendingInvite = { code, date: info.hike_date, name: info.inviter_name || '' };
            log('+1: открыл хайк из приглашения', true, state.user, { hike_date: info.hike_date });
        }
        openHike();
    }));

}
