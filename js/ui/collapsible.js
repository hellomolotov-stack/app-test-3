// js/ui/collapsible.js – сворачиваемые блоки главной.
// У каждого блока (кроме карты интеллигента, помощника и календаря) справа от названия кнопка
// «свернуть»; свёрнутый блок – одна строка с названием и «раскрыть». Состояние помнится.
// Блоки перерисовываются сами по себе (погода, календарь, маршруты), поэтому следим за DOM
// и докручиваем кнопки к новым блокам, не трогая код каждого блока.
import { haptic } from '../utils.js';

const STORAGE_KEY = 'collapsedBlocks';
const EXCLUDED_IDS = new Set(['cardBlock', 'chatBlock', 'calendarContainer']);
const FLEX_HEADERS = '.metrics-header, .intelligentsia-routes-header, .weather-header';

let observer = null;
let scheduled = false;

function readCollapsed() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function writeCollapsed(key, collapsed) {
    const all = readCollapsed();
    if (collapsed) all[key] = true; else delete all[key];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) {}
}

// Шапка блока: готовая строка с названием (у карты хайков, цифр, погоды) или сам заголовок h2.
function findHead(card) {
    for (const child of card.children) {
        if (child.matches(FLEX_HEADERS) || child.classList.contains('blk-head')) return child;
        if (child.matches('h2, .section-title')) return child;
    }
    return null;
}

function blockKey(card, head) {
    if (card.id) return card.id;
    const title = (head.querySelector('h2, .section-title, .metrics-title, .weather-title') || head).textContent;
    return 'title:' + title.replace(/\s+/g, ' ').trim().slice(0, 40);
}

// «свернуть ˅» / «раскрыть ›»: шеврон смотрит вниз у раскрытого блока и вправо у свёрнутого
const CHEVRON = '<svg class="blk-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function setState(card, button, collapsed) {
    card.classList.toggle('is-collapsed', collapsed);
    button.innerHTML = `<span>${collapsed ? 'раскрыть' : 'свернуть'}</span>${CHEVRON}`;
    button.setAttribute('aria-expanded', String(!collapsed));
}

function enhance(card) {
    if (EXCLUDED_IDS.has(card.id) || card.closest('#calendarContainer')) return;
    let head = findHead(card);
    if (!head) return;
    if (head.querySelector(':scope > .blk-toggle')) return; // уже обработан

    // одиночный заголовок заворачиваем в строку «название + кнопка»
    if (head.matches('h2, .section-title') && !head.matches(FLEX_HEADERS)) {
        const wrap = document.createElement('div');
        wrap.className = 'blk-head';
        head.replaceWith(wrap);
        wrap.appendChild(head);
        head = wrap;
    }
    head.classList.add('blk-has-toggle');

    const key = blockKey(card, head);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'blk-toggle';
    button.addEventListener('click', e => {
        e.stopPropagation();
        haptic();
        const collapsed = !card.classList.contains('is-collapsed');
        setState(card, button, collapsed);
        writeCollapsed(key, collapsed);
        fitHead(head);
        // карты внутри блока (маршруты) должны пересчитать размер после раскрытия
        if (!collapsed) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    head.appendChild(button);
    setState(card, button, !!readCollapsed()[key]);
}

// Шапка должна уместиться в одну строку: сначала «свернуть» становится просто стрелкой,
// затем прячутся необязательные слова («смотреть отчёты» → «отчёты»).
function overflows(head) {
    if (head.scrollWidth > head.clientWidth + 1) return true;
    return [...head.children].some(c => c.scrollWidth > c.clientWidth + 1);
}

function fitHead(head) {
    head.classList.remove('blk-compact', 'blk-tight');
    if (!head.clientWidth || !overflows(head)) return;
    head.classList.add('blk-compact');
    if (overflows(head)) head.classList.add('blk-tight');
}

function fitAll() {
    document.querySelectorAll('#mainContent .blk-has-toggle').forEach(fitHead);
}

function scan() {
    scheduled = false;
    const main = document.getElementById('mainContent');
    // только главная: там всегда есть блок карты интеллигента
    if (!main || !main.querySelector('#cardBlock')) return;
    main.querySelectorAll('.card-container').forEach(enhance);
    fitAll();
}

export function initCollapsibleBlocks() {
    const main = document.getElementById('mainContent');
    if (!main || observer) return;
    observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    });
    observer.observe(main, { childList: true, subtree: true });
    window.addEventListener('resize', () => requestAnimationFrame(fitAll));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
    scan();
}
