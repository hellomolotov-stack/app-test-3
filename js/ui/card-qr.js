// «показать QR»: владелец карты показывает на кассе партнёра свой личный QR.
// QR подписан сервером (/api/dc-loyalty, action app_card) – личность берём только из данных Telegram.
// Кассир партнёра сканирует его камерой – открывается касса в боте клуба и считает скидку.
import { haptic } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';

// всем владельцам активной карты

export function cardQrEnabled() {
    return state.userCard?.status === 'active'; // всем владельцам активной карты
}

// партнёры, у которых работает карта; пока один
const PARTNERS = [{ key: 'dietcakes', name: 'жить здорово', emoji: '🧁', note: '−10% на покупки до 15 000 ₽ в месяц, сверх этого −5%' }];

let qrLib = null;
function loadQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (qrLib) return qrLib;
    qrLib = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'assets/vendor/qrcode-generator.js';
        s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('qr lib')));
        s.onerror = () => { qrLib = null; reject(new Error('qr lib')); };
        document.head.appendChild(s);
    });
    return qrLib;
}

let cardUrl = null; // подпись не меняется – запрашиваем один раз за сессию
async function fetchCardUrl() {
    if (cardUrl) return cardUrl;
    const r = await fetch('/api/dc-loyalty', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'app_card', initData: window.Telegram?.WebApp?.initData || '' })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.url) throw new Error(body.error || 'card');
    cardUrl = body.url;
    return cardUrl;
}

export function openCardQr() {
    if (document.querySelector('.cq-overlay')) return;
    haptic();
    log('показать QR: открыл', false, state.user);
    const overlay = document.createElement('div');
    overlay.className = 'cq-overlay';
    overlay.innerHTML = `<div class="cq-sheet" role="dialog" aria-label="покажи карту на кассе">
        <div class="cs-grab"></div>
        <button type="button" class="cq-x" aria-label="закрыть">✕</button>
        <div class="cq-body"></div></div>`;
    const body = overlay.querySelector('.cq-body');
    const close = () => { overlay.classList.remove('is-on'); document.body.style.overflow = ''; setTimeout(() => overlay.remove(), 250); };

    const showList = () => {
        body.innerHTML = `<div class="cq-emoji">🪪</div>
            <div class="cq-title">покажи карту на кассе</div>
            <div class="cq-sub">выбери, кому</div>
            <div class="cq-list">${PARTNERS.map(p => `<button type="button" class="cq-partner" data-p="${p.key}">
                <span class="cq-p-e">${p.emoji}</span><span class="cq-p-t"><b>${p.name}</b><small>${p.note}</small></span><span class="cq-p-go">›</span></button>`).join('')}</div>`;
    };
    const showQr = async (p) => {
        body.innerHTML = `<button type="button" class="cq-back">‹ назад</button>
            <div class="cq-title">${p.emoji} ${p.name}</div>
            <div class="cq-sub">кассир сканирует QR камерой телефона</div>
            <div class="cq-qr"><div class="cq-load">готовим QR…</div></div>
            <div class="cq-note">${p.note}</div>`;
        try {
            const [lib, url] = await Promise.all([loadQrLib(), fetchCardUrl()]);
            const q = lib(0, 'M'); q.addData(url); q.make();
            const box = body.querySelector('.cq-qr');
            if (box) box.innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
            log(`показать QR: ${p.name}`, false, state.user);
        } catch (e) {
            const box = body.querySelector('.cq-qr');
            const msg = e.message === 'inactive_card' ? 'карта сейчас неактивна' : 'не получилось загрузить QR – попробуй ещё раз';
            if (box) box.innerHTML = `<div class="cq-load">${msg}</div>`;
        }
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.cq-x')) { haptic(); close(); return; }
        if (e.target.closest('.cq-back')) { haptic(); showList(); return; }
        const pb = e.target.closest('.cq-partner');
        if (pb) { haptic(); showQr(PARTNERS.find(p => p.key === pb.dataset.p)); }
    });
    showList();
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
}
