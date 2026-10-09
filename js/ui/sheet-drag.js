// js/ui/sheet-drag.js – общий свайп вниз для всех выезжающих шторок.
// Шторка едет за пальцем, полоска-ручка сверху ломается посерединке в «галочку» вниз
// (CSS берёт --pull 0…1), а отпущенная ниже порога – сворачивается через клик по своему оверлею:
// у каждой шторки он уже закрывает её штатным способом. Тянуть можно за ручку или за любое
// место, если содержимое прокручено в самый верх; по карте – с любой позиции прокрутки.
// Горизонтальные жесты и управление картой двумя пальцами не трогаем.
const SHEET = '.bottom-sheet, .cs-sheet, .inv-sheet';
const HANDLE = '.bottom-sheet-handle, .cs-grab';  // .inv-grab тоже несёт класс cs-grab
const SKIP = 'input, textarea, select, .swipe-track, .bottom-sheet-nav-arrow';
const CLOSE_DY = 110;     // столько протянуть – и шторка свернётся
const CLOSE_SPEED = 0.6;  // или смахнуть быстрее (px/мс)

let g = null;

function scrollerOf(target, sheet) {
    for (let el = target; el && el !== sheet; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
}

function setPull(v) {
    if (g.handle) g.handle.style.setProperty('--pull', v.toFixed(3));
}

function onStart(e) {
    if (e.touches.length !== 1) { onEnd({ type: 'touchcancel' }); return; }
    const sheet = e.target.closest?.(SHEET);
    if (!sheet || !sheet.querySelector(HANDLE)) return;
    if (e.target.closest(SKIP)) return;
    const t = e.touches[0];
    g = {
        sheet, handle: sheet.querySelector(HANDLE), overlay: sheet.parentElement,
        onHandle: !!e.target.closest(HANDLE), scroller: scrollerOf(e.target, sheet),
        onMap: !!e.target.closest('.hike-map-box'),
        x0: t.clientX, y0: t.clientY, dy: 0, on: false, last: [t.clientY, e.timeStamp], speed: 0
    };
}

function onMove(e) {
    if (!g) return;
    if (e.touches.length !== 1) { onEnd({ type: 'touchcancel' }); return; }
    const t = e.touches[0];
    const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (!g.on) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { g = null; return; }
        if (dy < -4) { g = null; return; }
        if (dy < 6) return;
        if (!g.onHandle && !g.onMap && g.scroller && g.scroller.scrollTop > 1) {
            // Keep following the same gesture until native scrolling reaches the top.
            g.y0 = t.clientY;
            g.last = [t.clientY, e.timeStamp];
            return;
        }
        if (g.scroller && !g.onMap) g.scroller.scrollTop = 0;
        g.on = true;
        g.sheet.style.transition = 'none';
        g.sheet.classList.add('is-dragging');
    }
    if (e.cancelable) e.preventDefault();
    if (g.onMap) e.stopPropagation();
    g.dy = Math.max(0, dy);
    const dt = e.timeStamp - g.last[1];
    if (dt > 0) g.speed = (t.clientY - g.last[0]) / dt;
    g.last = [t.clientY, e.timeStamp];
    g.sheet.style.transform = `translateY(${g.dy}px)`;
    setPull(Math.min(1, g.dy / CLOSE_DY));
}

function onEnd(e) {
    if (!g) return;
    const s = g;
    g = null;
    if (!s.on) return;
    s.sheet.classList.remove('is-dragging');
    s.sheet.style.transition = 'transform .32s cubic-bezier(.2, .9, .25, 1)';
    const recentSpeed = !e?.timeStamp || e.timeStamp - s.last[1] < 120 ? s.speed : 0;
    if (e?.type !== 'touchcancel' && (s.dy > CLOSE_DY || (recentSpeed > CLOSE_SPEED && s.dy > 30))) {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
        s.sheet.style.transform = 'translateY(100%)';
        s.overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } else {
        s.sheet.style.transform = '';
        if (s.handle) s.handle.style.setProperty('--pull', '0');
        setTimeout(() => { if (!s.sheet.classList.contains('is-dragging')) s.sheet.style.transition = ''; }, 340);
    }
}

export function initSheetDrag() {
    if (window.__sheetDrag) return;
    window.__sheetDrag = true;
    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    document.addEventListener('touchend', onEnd, { capture: true });
    document.addEventListener('touchcancel', onEnd, { capture: true });
}
