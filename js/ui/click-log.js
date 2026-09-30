// js/ui/click-log.js – каждое нажатие в приложении уходит в лог (а оттуда – в бота).
// Кнопки со своим log(...) не дублируются: смотрим, был ли явный лог за время обработки клика.
import { state } from '../state.js';
import { log, logSeq } from '../api.js';

const CLICKABLE = [
    'button', 'a', '[role="button"]', 'summary', 'label', 'select', 'input[type="checkbox"]', 'input[type="radio"]',
    '.blk-has-toggle', '.ns-tile', '.ef-mcol', '.calendar-item', '.update-item', '.weather-day',
    '.popup-item', '.btn', '.btn-newcomer', '.nav-item', '[data-book]', '[data-notify]', '[data-url]', '[onclick]'
].join(',');

let last = { label: '', at: 0 };

const clean = t => String(t || '').replace(/\s+/g, ' ').trim();

function blockTitle(el) {
    const card = el.closest('.card-container, .bottom-sheet, .modal-content, .nav-sheet, .adm');
    if (!card) return '';
    if (card.classList.contains('bottom-sheet')) {
        return clean(card.querySelector('.sheet-title, h2, h3')?.textContent).slice(0, 40) || 'карточка хайка';
    }
    if (card.classList.contains('nav-sheet')) return 'меню';
    const h = card.querySelector('h2, .section-title, .metrics-title, .weather-title, .modal-title, .tg-leave-title, h3');
    return clean(h?.textContent).slice(0, 40);
}

function labelOf(el) {
    if (el.dataset.logLabel) return el.dataset.logLabel;
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    if (el.matches('.ef-mcol')) return 'месяц ' + clean(el.textContent);
    const text = clean(el.textContent);
    if (text) return text.length > 50 ? text.slice(0, 50) + '…' : text;
    if (el.title) return clean(el.title);
    if (el.querySelector('img[alt]')) return clean(el.querySelector('img[alt]').alt);
    return el.className ? '[' + String(el.className).split(' ')[0] + ']' : el.tagName.toLowerCase();
}

function screenName() {
    if (document.querySelector('.adm')) return 'админка';
    if (document.getElementById('cardBlock')) return 'главная';
    if (document.querySelector('.profiles-container, #profilesContainer, .profile-card')) return 'интеллигенты';
    return 'страница';
}

function send(label, el) {
    const now = Date.now();
    if (label === last.label && now - last.at < 800) return;   // двойной тап
    last = { label, at: now };
    const block = blockTitle(el);
    log(`клик: ${label}`, state.userCard?.status !== 'active', state.user, {
        block, screen: screenName()
    });
}

export function initClickLog() {
    document.addEventListener('click', e => {
        const el = e.target.closest?.(CLICKABLE);
        if (!el || el.closest('.adm')) return;          // админку не логируем
        const seqBefore = logSeq;
        const wasCollapsed = el.closest('.card-container')?.classList.contains('is-collapsed');
        // после всех обработчиков клика проверяем, залогировал ли кто-то это нажатие сам
        setTimeout(() => {
            if (logSeq !== seqBefore) return;
            if (el.matches('.blk-has-toggle') || el.closest('.blk-has-toggle')) {
                const title = blockTitle(el);
                send(`${wasCollapsed ? 'раскрыл' : 'свернул'} блок «${title}»`, el);
                return;
            }
            send(labelOf(el), el);
        }, 0);
    }, true);

    // первое касание 3D-карты в каждом блоке – «крутит карту»
    const touched = new WeakSet();
    document.addEventListener('touchstart', e => {
        const mapEl = e.target.closest?.('.maplibregl-map');
        if (!mapEl || touched.has(mapEl)) return;
        touched.add(mapEl);
        log('крутит 3D-карту', state.userCard?.status !== 'active', state.user, { block: blockTitle(mapEl), screen: screenName() });
    }, { capture: true, passive: true });
}
