// Экран «значки» – как «Награды» в Apple:
//   • «вперёд!» – ближайшая цель по хайкам (владельцам карты, у них точный счётчик);
//   • «последний значок» крупно + стопка и «и ещё N · показать все» (слайдер);
//   • разделы карточками по два в ряд: последний значок раздела, стопка, «N из M · все»;
//   • тап по разделу – все его значки по 3 в ряд; тап по полученному – слайдер, по не полученному – «как получить».
// Без карты интеллигента: базовые – полностью, легендарные и эпические «ждут активации» (в цвете, свечение, замок),
// значки «только с картой» – серые с плашкой; внизу – что откроет карта.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_CATEGORIES, EXTRA_CATEGORY, categoryOf, catalogByTitle } from '../achievements-catalog.js';
import { medalForTitle, medalSrc } from '../achievements-medals.js';
import { openAchievementsPopup } from './achievements-popup.js';
import { rarityShare, rarityLabel, achievementMeta, sortByValue, isWaiting, metalOf, isCardOnly } from '../achievements.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const isCardMember = () => state.userCard?.status === 'active';
// все полученные видны всегда; без карты легендарные и эпические – «ждут активации»
export const visibleEarned = items => items;

function openCard(source) {
    import('./card-sheet.js').then(m => m.openCardSheet({ source })).catch(() => {});
}

const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
const ddmmyyyy = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '';
const byDate = list => [...list].sort((a, b) => (b.grant?.issuedAt || 0) - (a.grant?.issuedAt || 0));
const HIKE_GOALS = [[5, '5 хайков'], [10, '10 хайков'], [20, '20 хайков'], [30, '30 хайков'], [50, '50 хайков']];

export function openAchievementsCollection(items = []) {
    document.querySelector('.acol-overlay')?.remove();
    const member = isCardMember();
    const waiting = items.filter(isWaiting);
    log(`значки: все значки (${items.length})`, !member, state.user);

    // разделы: полученные (видимые и скрытые) + не полученные из каталога
    const ownedTitles = new Set(items.map(a => a.title));
    const cats = [...ACHIEVEMENT_CATEGORIES, EXTRA_CATEGORY].map(cat => {
        const earned = items.filter(a => categoryOf(a.title) === cat.key);
        const catalog = cat.ids ? ACHIEVEMENT_CATALOG.filter(c => cat.ids(c.id)) : [];
        const missing = catalog.filter(c => !earned.some(a => catalogByTitle(a.title)?.id === c.id));
        // у маршрутов итоговый «все 18 маршрутов» в счёт не входит – «пройдено 12 из 18»
        const finalOpen = cat.key === 'routes' && missing.some(m => m.id === 'all-routes') ? 1 : 0;
        return { ...cat, earned, missing, total: missing.length + earned.length - finalOpen };
    }).filter(c => c.key !== 'extra' || c.earned.length);
    // разделы, где уже что-то есть, – выше
    cats.sort((a, b) => (b.earned.length > 0) - (a.earned.length > 0));
    const totalAll = cats.reduce((n, c) => n + c.total, 0);

    // ждущий активации – в цвете со свечением своего металла и замком
    const img = (a, cls = '', size = 'thumbs') => {
        const tag = `<img ${medalSrc(a.medal.imageUrl, size)} alt="" loading="lazy" class="${cls}">`;
        return isWaiting(a) ? `<span class="wait-pic is-${metalOf(a)}">${tag}<b class="wait-lock">🔒</b></span>` : tag;
    };
    const stackHtml = list => `<span class="bdg-stack">${list.slice(0, 4).map(a => `<img ${medalSrc(a.medal.imageUrl)} alt="" loading="lazy" class="${isWaiting(a) ? `is-glow-${metalOf(a)}` : ''}">`).join('')}</span>`;
    const dateOrWait = a => isWaiting(a) ? `<em class="is-wait-${metalOf(a)}">ждёт активации</em>` : `<em>${esc(ddmmyyyy(a.grant?.date))}</em>`;

    // «вперёд!» – ближайшая цель по хайкам
    const progress = achievementMeta().progress;
    const goal = progress?.member ? HIKE_GOALS.find(([min, t]) => min > progress.hikes && !ownedTitles.has(t)) : null;
    const goalHtml = goal ? (() => {
        const [min, title] = goal, art = medalForTitle(title);
        return `<div class="bdg-card bdg-goal">${art ? `<img ${medalSrc(art.imageUrl)} alt="" class="is-gray">` : '<i class="acol-blank">?</i>'}
            <div><b>вперёд!</b><span>${esc(title)} с клубом</span><small>${progress.hikes} из ${min}</small><i class="bdg-bar"><i style="width:${Math.round(progress.hikes / min * 100)}%"></i></i></div></div>`;
    })() : '';

    // последний полученный (из видимых)
    const latest = byDate(items)[0];
    const restForStack = sortByValue(items.filter(a => a !== latest));
    const featHtml = latest ? `<div class="bdg-card bdg-feat">
        <h3>последний значок</h3>
        <button type="button" class="bdg-feat-pic" data-open="${esc(latest.id)}">${img(latest, '', 'md')}</button>
        <div class="bdg-t">${esc(latest.title)}</div><div class="bdg-d">${esc([isWaiting(latest) ? 'ждёт активации' : ddmmyyyy(latest.grant?.date), rarityLabel(latest.rarity)].filter(Boolean).join(' · '))}</div>
        ${items.length > 1 ? `<button type="button" class="bdg-foot" data-open-all>${stackHtml(restForStack)}<span class="bdg-more">и ещё ${items.length - 1}<b>показать все</b></span></button>` : ''}
    </div>` : '';

    const catCard = c => {
        const top = byDate(c.earned)[0];
        const others = sortByValue(c.earned.filter(a => a !== top));
        // пустой раздел: значки раздела серым – видно, что можно собрать
        if (!c.earned.length) {
            const arts = c.missing.map(m => medalForTitle(m.title)).filter(Boolean);
            const gray = (m, cls = 'is-gray') => `<img ${medalSrc(m.imageUrl)} alt="" loading="lazy" class="${cls}">`;
            return `<button type="button" class="bdg-cat is-empty" data-cat="${c.key}"><h4>${esc(c.title)}</h4>
            ${arts[0] ? `<span class="bdg-cat-pic">${gray(arts[0])}</span>` : '<i class="acol-blank">?</i>'}<span class="bdg-hint">${esc(c.hint)}</span>
            ${arts.length > 1 ? `<span class="bdg-foot"><span class="bdg-stack">${arts.slice(1, 5).map(m => gray(m)).join('')}</span><span class="bdg-more">0 из ${c.total}<b>все</b></span></span>` : ''}</button>`;
        }
        return `<button type="button" class="bdg-cat" data-cat="${c.key}"><h4>${esc(c.title)}</h4>
            <span class="bdg-cat-pic">${img(top)}</span><span class="bdg-t">${esc(top.title)}</span><span class="bdg-d">${isWaiting(top) ? 'ждёт активации' : esc(ddmmyyyy(top.grant?.date))}</span>
            <span class="bdg-foot">${stackHtml(others)}<span class="bdg-more">${c.earned.length} из ${c.total}<b>все</b></span></span></button>`;
    };

    // что откроет карта: свои ждущие значки + значки только для владельцев карты
    const cardOnlyLeft = ACHIEVEMENT_CATALOG.filter(c => isCardOnly(c.id) && !items.some(a => catalogByTitle(a.title)?.id === c.id)).length;
    const cardCta = () => (waiting.length || cardOnlyLeft) ? `<button type="button" class="acol-cta" data-card><b>с картой интеллигента</b> – ${[
        waiting.length ? `активируются твои ${waiting.length} ${plural(waiting.length, 'значок', 'значка', 'значков')}` : '',
        cardOnlyLeft ? `откроются ещё ${cardOnlyLeft} ${plural(cardOnlyLeft, 'значок', 'значка', 'значков')} клуба` : ''].filter(Boolean).join(' и ')} ›</button>` : '';

    const overlay = document.createElement('div');
    overlay.className = 'acol-overlay';
    overlay.innerHTML = `<div class="acol-sheet bdg-sheet" role="dialog" aria-modal="true" aria-label="значки">
        <div class="cs-grab acol-grab" aria-hidden="true"></div>
        <div class="acol-top"><h2>значки</h2><button type="button" class="acol-close" aria-label="закрыть">✕</button></div>
        <div class="acol-scroll" data-view="main">
            <div class="acol-sub">собрано <b>${items.length} из ${totalAll}</b></div>
            ${goalHtml}${featHtml}
            <div class="bdg-grid">${cats.map(catCard).join('')}</div>
            ${member ? '' : cardCta()}
        </div>
        <div class="acol-scroll" data-view="cat" hidden></div>
        <div class="acol-how" hidden></div>
    </div>`;
    // в полноэкранном Телеграме сверху системные кнопки – шторка начинается ниже них
    const tgw = window.Telegram?.WebApp;
    const inset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
    overlay.style.setProperty('--acol-top', `${Math.max(40, inset + 8)}px`);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));

    const main = overlay.querySelector('[data-view="main"]');
    const catView = overlay.querySelector('[data-view="cat"]');
    const titleEl = overlay.querySelector('.acol-top h2');
    const how = overlay.querySelector('.acol-how');
    const close = () => {
        overlay.classList.remove('is-on');
        setTimeout(() => { overlay.remove(); if (!document.querySelector('.bottom-sheet.visible, .cs-overlay, .ach-overlay')) document.body.style.overflow = ''; }, 280);
    };
    const slider = (list, id, source) => {
        haptic(); how.hidden = true;
        const shown = list;
        if (!shown.length) return;
        openAchievementsPopup(shown, { fresh: false, source, initialIndex: Math.max(0, shown.findIndex(a => a.id === id)) });
    };
    const wireCard = root => root.querySelectorAll('[data-card]').forEach(b => b.onclick = e => {
        e.stopPropagation(); haptic(); log('значки: открыть все – карта', true, state.user); close(); openCard('значки');
    });

    const back = () => { how.hidden = true; catView.hidden = true; main.hidden = false; titleEl.textContent = 'значки'; };
    // свайп вниз внутри раздела – назад к значкам, а не закрыть всё
    overlay.querySelector('.acol-sheet').onDragBack = () => { if (catView.hidden) return false; back(); return true; };
    // раздел целиком
    const openCat = key => {
        const c = cats.find(x => x.key === key);
        if (!c) return;
        haptic(); how.hidden = true;
        const earned = sortByValue([...c.earned]);
        catView.innerHTML = `<button type="button" class="bdg-back" data-back>‹ значки</button>
            <div class="acol-sub">${c.key === 'routes' ? 'пройдено' : 'получено'} <b>${c.earned.length} из ${c.total}</b></div>
            <div class="bdg-g3">${earned.map(a => `<button type="button" class="bdg-it" data-open="${esc(a.id)}">${img(a)}<span>${esc(a.title)}</span>${dateOrWait(a)}</button>`).join('')}
            ${c.missing.map(m => { const art = medalForTitle(m.title), only = !member && isCardOnly(m.id);
                return `<button type="button" class="bdg-it is-missing" data-how="${esc(m.id)}"><span class="wait-pic">${art ? `<img ${medalSrc(art.imageUrl)} alt="" loading="lazy" class="is-gray">` : '<i class="acol-blank">?</i>'}${only ? '<b class="card-only">с картой</b>' : ''}</span><span>${esc(m.title)}</span>${only ? '<em class="is-card">только с картой</em>' : ''}</button>`; }).join('')}</div>
            ${member ? '' : cardCta()}`;
        titleEl.textContent = c.title;
        main.hidden = true; catView.hidden = false; catView.scrollTop = 0;
        catView.querySelector('[data-back]').onclick = () => { haptic(); back(); };
        catView.querySelectorAll('[data-open]').forEach(b => b.onclick = () => slider(earned, b.dataset.open, `значки: ${c.title}`));
        catView.querySelectorAll('[data-how]').forEach(b => b.onclick = () => {
            haptic();
            const m = ACHIEVEMENT_CATALOG.find(x => x.id === b.dataset.how);
            catView.querySelectorAll('.bdg-it').forEach(x => x.classList.toggle('is-picked', x === b));
            how.hidden = false;
            how.innerHTML = `<button type="button" class="acol-how-x" aria-label="скрыть">✕</button><b>${esc(m.title)}</b><small>${esc(m.description)}</small><em>${!member && isCardOnly(m.id) ? 'доступен владельцам карты интеллигента' : esc(rarityShare(m.title))}</em>`;
            how.querySelector('.acol-how-x').onclick = () => { how.hidden = true; catView.querySelectorAll('.bdg-it').forEach(x => x.classList.remove('is-picked')); };
        });
        wireCard(catView);
        log(`значки: раздел ${c.title}`, !member, state.user);
    };

    overlay.querySelector('.acol-close').onclick = () => { haptic(); close(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    const allSorted = sortByValue([...items]);
    main.querySelectorAll('[data-open]').forEach(b => b.onclick = () => slider(allSorted, b.dataset.open, 'значки: последний'));
    main.querySelector('[data-open-all]')?.addEventListener('click', () => slider(allSorted, allSorted[0]?.id, 'значки: показать все'));
    main.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => openCat(b.dataset.cat));
    wireCard(main);
}
