// js/ui/card-scratch.js – «потри карту» на главной: серые волны лежат на холсте поверх настоящей обложки.
// Сначала карта закрыта полностью и по волнам ходит кружок-палец; обложка проступает, только когда человек трёт.
// Вертикальная прокрутка страницы через карту работает (touch-action: pan-y), стирают движения в стороны.
import { haptic } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';

const GREY = 'assets/card-grey.png';
const FRONT = 'assets/card-front.jpg';
const REVEAL_ENOUGH = 0.3;

export function cardScratchHtml() {
    return `
        <div class="sc-card" id="scCard">
            <img class="sc-front" src="${FRONT}" alt="карта члена клуба хайкинг интеллигенции">
            <canvas class="sc-canvas"></canvas>
            <div class="sc-finger" aria-hidden="true"></div>
        </div>`;
}

export function mountCardScratch(root, { onOpen, onEnough } = {}) {
    const box = root.querySelector('#scCard');
    if (!box) return;
    const canvas = box.querySelector('.sc-canvas');
    const ctx = canvas.getContext('2d');
    const grey = new Image();
    let w = 0, h = 0, dpr = 1, ready = false, enough = false, touched = false;

    const size = () => {
        const r = box.getBoundingClientRect();
        if (!r.width) return false;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        w = r.width; h = r.height;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(grey, 0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-out';
        return true;
    };

    // «палец»: пятно с рваным краем из мелких мазков – стирается неровно, как настоящий
    const dab = (x, y, r) => {
        for (let i = 0; i < 7; i++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.55;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.45 + Math.random() * 0.35), 0, Math.PI * 2);
            ctx.fill();
        }
    };
    const stroke = (x0, y0, x1, y1, r) => {
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r * 0.35)));
        for (let i = 0; i <= n; i++) dab(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r);
    };


    const revealed = () => {
        try {
            const sw = 40, sh = 24, c = document.createElement('canvas');
            c.width = sw; c.height = sh;
            c.getContext('2d').drawImage(canvas, 0, 0, sw, sh);
            const px = c.getContext('2d').getImageData(0, 0, sw, sh).data;
            let clear = 0;
            for (let i = 3; i < px.length; i += 4) if (px[i] < 40) clear++;
            return clear / (sw * sh);
        } catch (e) { return 0; }
    };

    let last = null, moved = 0, checkTimer = null;
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', e => { last = pos(e); moved = 0; });
    canvas.addEventListener('pointermove', e => {
        if (!last || !ready) return;
        const p = pos(e);
        moved += Math.hypot(p[0] - last[0], p[1] - last[1]);
        stroke(last[0], last[1], p[0], p[1], h * 0.09);
        last = p;
        if (!touched && moved > 12) {
            touched = true;
            box.classList.add('is-touched');
            haptic();
            log('потёр карту интеллигента', true, state.user);
        }
        clearTimeout(checkTimer);
        checkTimer = setTimeout(() => {
            if (!enough && revealed() > REVEAL_ENOUGH) {
                enough = true;
                log('стёр карту интеллигента', true, state.user);
                window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success');
                onEnough?.();
            }
        }, 120);
    });
    const end = () => {
        // простое касание без стирания – сразу открываем, что внутри
        if (last && moved < 8) onOpen?.();
        last = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => { last = null; });
    canvas.addEventListener('pointerleave', () => { last = null; });

    grey.onload = () => {
        if (!size()) return;
        ready = true;
        // карта закрыта целиком: открывается только когда человек сам начинает тереть
        box.classList.add('is-ready');
    };
    grey.src = GREY;
}
