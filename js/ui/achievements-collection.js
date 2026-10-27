// Экран «все ачивки» (макет А): три уровня – базовые, легендарные, мифические – сеткой по 4 в ряд, у каждого полоса «N из M».
// Тап по полученной медали открывает слайдер (карусель) на ней – листаешь все свои вправо-влево.
// Не полученные – серые или «?», тап показывает внизу, как получить.
// Без карты интеллигента видны только три последние полученные ачивки, остальные полученные размыты –
// внизу плашка «чтобы увидеть все свои открытые ачивки, оформи карту интеллигента».
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { ACHIEVEMENT_TIERS, ACHIEVEMENT_CATALOG, catalogByTitle, tierOf } from '../achievements-catalog.js';
import { medalForTitle } from '../achievements-medals.js';
import { openAchievementsPopup } from './achievements-popup.js';
import { rarityShare, rarityLabel } from '../achievements.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const GUEST_VISIBLE = 3;
export const isCardMember = () => state.userCard?.status === 'active';

// какие из полученных видны: владельцу карты – все, без карты – три последние (items уже от новых к старым)
export function visibleEarned(items) {
    if (isCardMember()) return items;
    // без карты видны три последние по дате, показываем их в порядке ценности
    const latest = new Set([...items].sort((a, b) => (b.grant?.issuedAt || 0) - (a.grant?.issuedAt || 0)).slice(0, GUEST_VISIBLE).map(a => a.id));
    return items.filter(a => latest.has(a.id));
}

function openCard(source) {
    import('./card-sheet.js').then(m => m.openCardSheet({ source })).catch(() => {});
}

export function openAchievementsCollection(items = []) {
    document.querySelector('.acol-overlay')?.remove();
    const member = isCardMember();
    const visible = visibleEarned(items);
    const visibleIds = new Set(visible.map(a => a.id));
    log(`ачивки: все ачивки (${items.length})`, !member, state.user);

    // строим уровни: полученные (по дате) + не полученные из каталога
    const earnedByCatalog = new Map();
    items.forEach(a => { const c = catalogByTitle(a.title); if (c && !earnedByCatalog.has(c.id)) earnedByCatalog.set(c.id, a); });
    // сначала самые ценные уровни: мифические → легендарные → базовые
    const tiers = [...ACHIEVEMENT_TIERS].reverse().map(([key, label, about]) => {
        const earned = items.filter(a => tierOf(catalogByTitle(a.title)?.rarity || a.rarity) === key);
        const missing = ACHIEVEMENT_CATALOG.filter(c => c.tier === key && !earnedByCatalog.has(c.id));
        const total = ACHIEVEMENT_CATALOG.filter(c => c.tier === key).length + earned.filter(a => !catalogByTitle(a.title)).length;
        return { key, label, about, earned, missing, total };
    });
    const totalAll = tiers.reduce((n, t) => n + t.total, 0);

    const ddmm = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}` : '';
    const isRoute = t => (catalogByTitle(t)?.id || '').startsWith('route-');
    const tile = (inner, cls, attrs, name, nameOff, sub = '', route = false) => `<button type="button" class="acol-it ${cls}" ${attrs} data-route="${route ? 1 : 0}">
        <span class="acol-pic">${inner}</span><span class="acol-name${nameOff ? ' is-off' : ''}">${esc(name)}</span>${sub ? `<span class="acol-date">${esc(sub)}</span>` : ''}</button>`;
    const earnedTile = a => visibleIds.has(a.id)
        ? tile(`<img src="${esc(a.medal.imageUrl)}" alt="" loading="lazy">`, 'is-on', `data-open="${esc(a.id)}"`, a.title, false, '', isRoute(a.title))
        : tile(`<img src="${esc(a.medal.imageUrl)}" alt="" loading="lazy" class="is-blur"><b class="acol-lock">🔒</b>`, 'is-hidden', 'data-card', 'открыта с картой', true);
    const missingTile = c => {
        const art = medalForTitle(c.title);
        return tile(art ? `<img src="${esc(art.imageUrl)}" alt="" loading="lazy" class="is-gray">` : `<i class="acol-blank is-${c.tier}">?</i>`,
            'is-missing', `data-how="${esc(c.id)}"`, c.title, true, '', c.id.startsWith('route-'));
    };

    const overlay = document.createElement('div');
    overlay.className = 'acol-overlay';
    overlay.innerHTML = `<div class="acol-sheet" role="dialog" aria-modal="true" aria-label="все ачивки">
        <div class="acol-top"><h2>все ачивки</h2><button type="button" class="acol-close" aria-label="закрыть">✕</button></div>
        <div class="acol-sub">собрано <b>${items.length} из ${totalAll}</b></div>
        <div class="acol-filters" role="group" aria-label="фильтр">${[['all', 'все'], ['mine', 'мои'], ['todo', 'ещё не получены'], ['routes', 'маршруты']]
            .map(([k, l]) => `<button type="button" class="acol-filter${k === 'all' ? ' is-on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
        <div class="acol-scroll">
        ${tiers.map(t => `<section class="acol-tier is-${t.key}">
            <div class="acol-head"><b><i></i>${t.label}</b><small>${t.earned.length} из ${t.total}</small></div>
            <div class="acol-bar"><i style="width:${t.total ? Math.round(t.earned.length / t.total * 100) : 0}%"></i></div>
            <div class="acol-about">${esc(t.about)}</div>
            <div class="acol-grid">${t.earned.map(earnedTile).join('')}${t.missing.map(missingTile).join('')}</div>
        </section>`).join('')}
        </div>
        <div class="acol-how" hidden></div>
        ${member || items.length <= GUEST_VISIBLE ? '' : `<button type="button" class="acol-cta" data-card>открыто ${GUEST_VISIBLE} из ${items.length} твоих ачивок. <b>чтобы увидеть все свои открытые ачивки, оформи карту интеллигента</b> ›</button>`}
    </div>`;
    // в полноэкранном Телеграме сверху системные кнопки («закрыть», «⋯») – шторка начинается ниже них
    const tgw = window.Telegram?.WebApp;
    const inset = (tgw?.safeAreaInset?.top || 0) + (tgw?.contentSafeAreaInset?.top || 0);
    overlay.style.setProperty('--acol-top', `${Math.max(40, inset + 8)}px`);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));

    const close = () => {
        overlay.classList.remove('is-on');
        setTimeout(() => { overlay.remove(); if (!document.querySelector('.bottom-sheet.visible, .cs-overlay, .ach-overlay')) document.body.style.overflow = ''; }, 280);
    };
    const how = overlay.querySelector('.acol-how');
    overlay.querySelector('.acol-close').onclick = () => { haptic(); close(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    // тап по полученной – слайдер всех своих медалей, начиная с этой
    overlay.querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
        haptic();
        how.hidden = true;
        openAchievementsPopup(visible, { fresh: false, source: 'все ачивки', initialIndex: Math.max(0, visible.findIndex(a => a.id === b.dataset.open)) });
    });
    overlay.querySelectorAll('[data-card]').forEach(b => b.onclick = () => {
        haptic(); log('ачивки: открыть все – карта', true, state.user);
        close(); openCard('ачивки');
    });
    overlay.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => {
        haptic();
        const f = b.dataset.filter;
        overlay.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('is-on', x === b));
        overlay.querySelectorAll('.acol-tier').forEach(sec => {
            let shownN = 0;
            sec.querySelectorAll('.acol-it').forEach(it => {
                const earned = !it.classList.contains('is-missing');
                const ok = f === 'all' || (f === 'mine' && earned) || (f === 'todo' && !earned) || (f === 'routes' && it.dataset.route === '1');
                it.hidden = !ok; if (ok) shownN++;
            });
            sec.hidden = !shownN;
        });
        how.hidden = true;
        log(`ачивки: фильтр ${b.textContent}`, !member, state.user);
    });
    overlay.querySelectorAll('[data-how]').forEach(b => b.onclick = () => {
        haptic();
        const c = ACHIEVEMENT_CATALOG.find(x => x.id === b.dataset.how);
        if (!c) return;
        overlay.querySelectorAll('.acol-it').forEach(x => x.classList.toggle('is-picked', x === b));
        how.hidden = false;
        how.innerHTML = `<button type="button" class="acol-how-x" aria-label="скрыть">✕</button><b>${esc(c.title)}</b><small>${esc(c.description)}</small><em>${esc(rarityShare(c.title))}</em>`;
        how.querySelector('.acol-how-x').onclick = () => { how.hidden = true; overlay.querySelectorAll('.acol-it').forEach(x => x.classList.remove('is-picked')); };
    });
}
