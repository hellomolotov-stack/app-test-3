// js/ui/scroll-lock.js – пока открыта любая шторка/окно, страница под ней не прокручивается (12.11).
// На iPhone в Telegram `overflow: hidden` у body не работает, поэтому фиксируем body на месте (position: fixed
// со сдвигом на текущую прокрутку) и возвращаем прокрутку при закрытии. Прокрутка внутри самих шторок не трогается.
const OPEN = [
    '.bottom-sheet-overlay', '.modal-overlay', '.inv-overlay', '.zp-overlay', '.sv-overlay', '.sa-overlay',
    '.reg-ticket-overlay', '.rd-story-overlay', '.pv-ov', '.mmr-overlay', '.hb-overlay', '.cw-overlay', '.csv-overlay',
    '.cs2-overlay', '.cq-overlay', '.city-ticket-overlay', '.admission-overlay', '.acol-overlay', '.ach-overlay',
    '.cs-overlay', '.nav-popup.show', '.adm', '.hof-ov',
].join(',');

let locked = false, savedY = 0, raf = 0;

function isOpen() {
    for (const el of document.querySelectorAll(OPEN)) {
        if (el.hidden || !el.isConnected) continue;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        return true;
    }
    return false;
}

function lock() {
    if (locked) return;
    locked = true;
    savedY = window.scrollY || document.documentElement.scrollTop || 0;
    const b = document.body.style;
    b.position = 'fixed'; b.top = `-${savedY}px`; b.left = '0'; b.right = '0'; b.width = '100%';
    document.documentElement.classList.add('sheet-lock');
}

function unlock() {
    if (!locked) return;
    locked = false;
    const b = document.body.style;
    b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
    document.documentElement.classList.remove('sheet-lock');
    const html = document.documentElement, prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, savedY);
    html.style.scrollBehavior = prev;
}

function check() {
    raf = 0;
    if (isOpen()) lock(); else unlock();
}

export function initScrollLock() {
    if (window.__scrollLockInit) return;
    window.__scrollLockInit = true;
    new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(check); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    // протяжка по затемнению вокруг шторки не должна доходить до страницы
    document.addEventListener('touchmove', e => {
        if (!locked) return;
        const t = e.target;
        if (t && t.matches && t.matches(OPEN)) e.preventDefault();
    }, { passive: false });
    check();
}
