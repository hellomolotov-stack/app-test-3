// js/typograph.js – убирает «висящие» предлоги во всех текстах приложения.
// Короткие предлоги, союзы и частицы («в», «на», «не», «и», «с»…) приклеиваются к следующему слову
// неразрывным пробелом, а тире – к предыдущему: строка больше не обрывается на «в» или начинается с «–».
// Работает по живому DOM (MutationObserver), поэтому подхватывает и тексты из таблицы/админки, и всё,
// что рисуется позже. Поля ввода, код и редактируемые блоки не трогаем.
const NBSP = ' ';
const SHORT = 'а|и|но|да|или|в|во|к|ко|с|со|у|о|об|обо|от|до|на|не|ни|по|за|из|изо|без|для|под|над|при|про|из-за|из-под';
// слово целиком: в начале строки или после пробела/скобки/кавычки
const RE_SHORT = new RegExp(`(^|[\\s${NBSP}(«"„“'])(${SHORT})[ \\t]+(?=\\S)`, 'gi');
const RE_DASH = /([^\s ])[ \t]+([–—])(?=\s)/g;
const RE_RUB = /(\d)[ \t]+(₽)/g; // «902 ₽» не рвётся на две строки
const RE_THOUS = /(\d)[ \t](\d{3})(?!\d)/g; // «1 500» тоже
const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'NOSCRIPT']);

function fix(text) {
    if (text.length < 3 || !/\s/.test(text)) return text;
    // два прохода – для цепочек вроде «не в офисе»
    let out = text.replace(RE_SHORT, `$1$2${NBSP}`).replace(RE_SHORT, `$1$2${NBSP}`);
    return out.replace(RE_DASH, `$1${NBSP}$2`).replace(RE_RUB, `$1${NBSP}$2`).replace(RE_THOUS, `$1${NBSP}$2`);
}

function skip(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
        if (SKIP.has(e.tagName) || e.isContentEditable) return true;
    }
    return false;
}

function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
        if (!skip(root.parentElement)) {
            const v = fix(root.data);
            if (v !== root.data) root.data = v;
        }
        return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || skip(root)) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (skip(n.parentElement)) continue;
        const v = fix(n.data);
        if (v !== n.data) n.data = v; // characterData не наблюдаем – цикла нет
    }
}

export function initTypograph() {
    if (window.__typograph || typeof MutationObserver === 'undefined') return;
    window.__typograph = true;
    try {
        walk(document.body);
        new MutationObserver(list => {
            for (const m of list) m.addedNodes.forEach(walk);
        }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {
        console.error('typograph', e);
    }
}
