import { rarityLabel, achievementRequest } from '../achievements.js';
import { MEDAL_LIBRARY, medalSrc } from '../achievements-medals.js';
import { ACHIEVEMENT_CATEGORIES, catalogByTitle, categoryOf, routeBadgeForHike } from '../achievements-catalog.js';
import { state } from '../state.js';
import { DEFAULT_TEXT } from './achievements-notify.js';

// Админка → значки, три способа выдать:
// · по человеку – нашёл человека → отметил сразу несколько значков с датами → «выдать»;
// · по хайку – выбрал прошедший хайк → записанные на него отмечены, значок маршрута предложен сам → «выдать»;
// · по значку – сетка всех значков → тап → кому и за какую дату.
// Один значок = одна запись в базе: если он уже выдавался, новые люди добавляются в ту же запись.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.split('-').reverse().join('.') : '';
const normT = t => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'–—-]/g, ' ').replace(/\s+/g, ' ').trim();
const EXTRA_RARITY = { 'залез в пещеру пауков': 'mythical', 'откусил волшебный гриб': 'legendary' };
const SEARCH_LIMIT = 8;
const MODES = [['person', 'по человеку'], ['hike', 'по хайку'], ['list', 'по значку']];
const yes = v => v === true || String(v).toLowerCase() === 'yes';

export async function renderAchievementsAdmin(body) {
    const ui = { screen: 'person', who: null, hike: null, pick: new Map(), hikePeople: new Map(), roster: [], progress: '', people: [], achievements: [], selected: new Map(), search: '', date: today(),
        busy: false, error: '', success: '', badge: null, result: null };

    async function load() {
        body.innerHTML = '<p class="adm-muted" role="status">загружаю значки…</p>';
        try {
            const data = await achievementRequest('list');
            ui.people = data.people;
            ui.achievements = data.achievements;
            if (body.isConnected) paint();
        } catch (error) {
            if (!body.isConnected) return;
            body.innerHTML = `<p class="adm-error-inline" role="alert">${esc(error.message)}</p><button class="adm-ghost" id="awRetry">повторить</button>`;
            body.querySelector('button').onclick = load;
        }
    }
    const person = id => ui.people.find(p => p.userId === id);
    const tgOf = p => p?.username ? '@' + p.username : 'без @';
    function holders(title) {
        const ids = new Set();
        ui.achievements.filter(a => normT(a.title) === normT(title)).forEach(a => Object.keys(a.recipients || {}).forEach(id => ids.add(id)));
        return ids.size;
    }
    function badgeList() {
        const order = [...ACHIEVEMENT_CATEGORIES.map(c => c.key), 'extra'];
        return [...MEDAL_LIBRARY].sort((a, b) => order.indexOf(categoryOf(a.title)) - order.indexOf(categoryOf(b.title)));
    }

    async function pickBadge(title) {
        const m = MEDAL_LIBRARY.find(x => x.title === title);
        if (!m || ui.busy) return;
        const c = catalogByTitle(title);
        ui.badge = m; ui.search = ''; ui.date = today(); ui.error = ''; ui.success = ''; ui.requestId = null;
        ui.selected = new Map();
        const existing = ui.achievements.find(a => normT(a.title) === normT(title));
        if (!existing) {
            ui.id = crypto.randomUUID(); ui.revision = 'null_etag';
            ui.draft = { title: m.title, description: c?.description || '', rarity: c?.rarity || EXTRA_RARITY[normT(title)] || 'common',
                kind: categoryOf(title) === 'routes' ? 'route' : 'special', hikeDate: '', date: today(), medalUrl: m.imageUrl };
            ui.screen = 'edit'; paint();
            return;
        }
        ui.busy = true; paint();
        try {
            const data = await achievementRequest('get', { id: existing.id });
            const a = data.achievement;
            ui.id = existing.id; ui.revision = data.revision;
            ui.draft = { title: a.title, description: a.description || c?.description || '', rarity: a.rarity, kind: a.kind,
                hikeDate: a.hikeDate || '', date: a.date || today(), medalUrl: a.medal?.imageUrl || m.imageUrl };
            Object.values(a.recipients || {}).forEach(p => ui.selected.set(p.userId, { ...p, saved: true }));
            ui.screen = 'edit';
        } catch (error) { ui.error = error.message; }
        finally { ui.busy = false; paint(); }
    }

    function listHtml() {
        return `<div class="aw-badges-head"><small>выбери значок – дальше кому и за какую дату</small></div>
            <div class="aw-badges">${badgeList().map(m => { const n = holders(m.title);
                return `<button type="button" class="aw-badge" data-badge="${esc(m.title)}"><img ${medalSrc(m.imageUrl)} alt="" loading="lazy"><span>${esc(m.title)}</span><em>${n ? `у ${n} чел.` : 'ещё ни у кого'}</em></button>`; }).join('')}</div>`;
    }
    function formHtml() {
        const fresh = [...ui.selected.values()].filter(p => !p.saved).length;
        return `<div class="aw-toolbar"><button class="adm-link" id="awBack">‹ все значки</button></div>
            <div class="aw-pick-badge"><img src="${esc(ui.draft.medalUrl)}" alt=""><div><b>${esc(ui.draft.title)}</b><small>${esc(rarityLabel(ui.draft.rarity) || '')}${holders(ui.draft.title) ? ` · уже у ${holders(ui.draft.title)} чел.` : ''}</small></div></div>
            <form id="awForm"><fieldset ${ui.busy ? 'disabled' : ''}>
            <label class="adm-field"><span>за какую дату</span><input id="awDate" type="date" value="${esc(ui.date)}" required></label>
            <label class="adm-field"><span>кому · имя, фамилия или @телеграм</span><input type="search" id="awSearch" value="${esc(ui.search)}" placeholder="начни вводить…" autocomplete="off"></label>
            <div class="aw-found" id="awFound"></div>
            <div id="awSelected"></div>
            <button type="submit" class="btn btn-yellow adm-primary" id="awSave">${ui.busy ? 'сохраняю…' : `выдать значок${fresh ? ` · ${fresh}` : ''}`}</button>
            </fieldset></form>`;
    }
    function paintFound() {
        const box = body.querySelector('#awFound');
        if (!box) return;
        const q = ui.search.trim().replace(/^@/, '').toLocaleLowerCase('ru');
        if (!q) { box.innerHTML = ''; return; }
        const found = ui.people.filter(p => !ui.selected.has(p.userId) && `${p.name} ${p.username || ''}`.toLocaleLowerCase('ru').includes(q)).slice(0, SEARCH_LIMIT);
        box.innerHTML = found.length ? found.map(p => `<button type="button" class="aw-found-it" data-add="${esc(p.userId)}"><b>${esc(p.name)}</b><small>${esc(tgOf(p))}</small><i>+</i></button>`).join('')
            : '<p class="adm-muted">никого не нашёл</p>';
        box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
            const p = person(b.dataset.add);
            ui.selected.set(p.userId, { userId: p.userId, name: p.name, date: ui.date });
            ui.search = ''; ui.requestId = null;
            const input = body.querySelector('#awSearch'); input.value = ''; input.focus();
            paintFound(); paintSelected();
        });
    }
    function paintSelected() {
        const box = body.querySelector('#awSelected');
        if (!box) return;
        const list = [...ui.selected.values()].sort((a, b) => (a.saved ? 1 : 0) - (b.saved ? 1 : 0));
        box.innerHTML = list.length ? `<div class="adm-label">кому выдаём · ${list.length}</div>` + list.map(p => `<div class="aw-to">
            <div><b>${esc(person(p.userId)?.name || p.name)}</b><small>${esc(tgOf(person(p.userId)))}${p.saved ? ' · уже выдан' : ''}</small></div>
            <input type="date" data-date="${esc(p.userId)}" value="${esc(p.date)}" aria-label="дата" required>
            <button type="button" class="aw-remove" data-remove="${esc(p.userId)}" aria-label="убрать">×</button></div>`).join('') : '';
        box.querySelectorAll('[data-date]').forEach(i => i.onchange = () => { ui.selected.get(i.dataset.date).date = i.value; ui.requestId = null; });
        box.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
            const p = ui.selected.get(b.dataset.remove);
            if (p.saved && !confirm(`забрать значок у ${p.name}?`)) return;
            ui.selected.delete(b.dataset.remove); ui.requestId = null; paintSelected(); paintFound();
        });
        const fresh = list.filter(p => !p.saved).length;
        const save = body.querySelector('#awSave');
        if (save && !ui.busy) { save.textContent = `выдать значок${fresh ? ` · ${fresh}` : ''}`; save.disabled = !ui.selected.size; }
    }
    function doneHtml() {
        const a = ui.result;
        const total = Object.keys(a.grants || {}).length, sent = a.notified || 0;
        return `<div class="aw-toolbar"><button class="adm-link" id="awBack">‹ все значки</button></div>
            <div class="aw-pick-badge"><img src="${esc(a.medal?.imageUrl || ui.draft.medalUrl)}" alt=""><div><b>${esc(a.title)}</b><small>выдан · ${Object.keys(a.recipients || {}).length} чел.</small></div></div>
            <div class="aw-saved-people">${Object.values(a.recipients || {}).map(p => `<div><b>${esc(person(p.userId)?.name || p.name)} <small>${esc(tgOf(person(p.userId)))}</small></b><span>${dateLabel(p.date)}</span></div>`).join('')}</div>
            <div class="aw-notify"><b>🏅 сообщение в бот</b><small>${sent ? `уже отправлено: ${sent} из ${total}` : 'само не уходит – отправь, когда будешь готов'}</small>
            ${sent < total ? `<button class="btn btn-yellow adm-primary" id="awNotify">${ui.notifyBusy ? 'отправляю…' : `отправить ${sent ? 'остальным' : ''} · ${total - sent}`}</button>` : ''}</div>`;
    }
    async function notifyNow() {
        const a = ui.result;
        if (ui.notifyBusy || !a) return;
        if (!confirm(`отправить сообщение о значке «${a.title}» тем, кому ещё не писали?`)) return;
        ui.notifyBusy = true; ui.error = ''; paint();
        try {
            // только тем, кому об этом значке ещё не писали – повторно никто не получит
            const list = await achievementRequest('notify_list');
            const ids = list.people.filter(p => p.items.some(i => i.id === a.id && !i.notifiedAt)).map(p => p.userId);
            if (!ids.length) { ui.success = 'всем уже отправлено'; return; }
            const r = await achievementRequest('notify_send', { userIds: ids, text: DEFAULT_TEXT });
            ui.result = { ...a, notified: Math.min(Object.keys(a.grants || {}).length, (a.notified || 0) + r.sent) };
            ui.achievements = ui.achievements.map(x => x.id === a.id ? ui.result : x);
            ui.success = `отправлено ${r.sent}${r.failed?.length ? ` · не дошло: ${r.failed.length} (уже получили сообщение или бот заблокирован)` : ''}`;
        } catch (error) { ui.error = error.message; }
        finally { ui.notifyBusy = false; paint(); }
    }

    // ── общее: какие значки уже есть у человека и пакетная выдача ──
    function ownedBy(userId) {
        const map = new Map();
        ui.achievements.forEach(a => { const r = a.recipients?.[userId]; if (r) map.set(normT(a.title), r.date || a.date); });
        return map;
    }
    // добавить людей в значок: есть запись – дописываем к её получателям (уже выданным дату не трогаем), нет – создаём
    async function grant(title, recips) {
        const m = MEDAL_LIBRARY.find(x => x.title === title);
        const c = catalogByTitle(title);
        const existing = ui.achievements.find(a => normT(a.title) === normT(title));
        let id, revision, draft, medalUrl = m?.imageUrl;
        const recipients = {};
        if (existing) {
            const d = await achievementRequest('get', { id: existing.id });
            const a = d.achievement;
            id = existing.id; revision = d.revision; medalUrl = a.medal?.imageUrl || medalUrl;
            draft = { title: a.title, description: a.description || c?.description || '', rarity: a.rarity, kind: a.kind, hikeDate: a.hikeDate || '', date: a.date };
            Object.values(a.recipients || {}).forEach(p => { recipients[p.userId] = { userId: p.userId, name: p.name, date: p.date }; });
        } else {
            id = crypto.randomUUID(); revision = 'null_etag';
            draft = { title: m.title, description: c?.description || '', rarity: c?.rarity || EXTRA_RARITY[normT(title)] || 'common',
                kind: categoryOf(title) === 'routes' ? 'route' : 'special', hikeDate: '', date: today() };
        }
        let added = 0;
        recips.forEach(r => { if (!recipients[r.userId]) { recipients[r.userId] = r; added++; } });
        if (!added) return 0;
        const list = Object.values(recipients);
        const dates = list.map(r => r.date).sort();
        const data = await achievementRequest('save', { id, revision, requestId: crypto.randomUUID(),
            draft: { ...draft, date: dates[dates.length - 1], recipients: list }, medal: { imageUrl: medalUrl } });
        ui.achievements = [data.achievement, ...ui.achievements.filter(x => x.id !== data.achievement.id)];
        return added;
    }
    async function grantAll(jobs) {
        ui.busy = true; ui.error = ''; ui.success = ''; paint();
        let done = 0, people = 0;
        try {
            for (const [title, recips] of jobs) {
                ui.progress = `выдаю «${title}» · ${done + 1} из ${jobs.length}`; paint();
                people += await grant(title, recips); done++;
            }
            ui.success = `готово: значков – ${done}, новых выдач – ${people}. сообщение в бот – во вкладке «рассылки» → «🏅 новые значки»`;
            ui.pick = new Map();
        } catch (error) { ui.error = `${error.message}${done ? ` (успел выдать ${done} из ${jobs.length})` : ''}`; }
        finally { ui.busy = false; ui.progress = ''; paint(); }
    }
    const badgeTile = (m, { on = false, owned = '', attr = 'data-pick' } = {}) => `<button type="button" class="aw-badge${on ? ' is-on' : ''}${owned ? ' is-owned' : ''}" ${owned ? 'disabled' : `${attr}="${esc(m.title)}"`}>
        <img ${medalSrc(m.imageUrl)} alt="" loading="lazy"><span>${esc(m.title)}</span><em>${owned ? `✓ есть · ${esc(dateLabel(owned))}` : on ? '✓ выбран' : ''}</em></button>`;
    function searchHtml(placeholder) {
        return `<label class="adm-field"><span>${placeholder}</span><input type="search" id="awWho" value="${esc(ui.search)}" placeholder="имя, фамилия или @телеграм" autocomplete="off"></label><div class="aw-found" id="awFound"></div>`;
    }
    function paintWhoFound(onPick, exclude = new Set()) {
        const box = body.querySelector('#awFound');
        if (!box) return;
        const q = ui.search.trim().replace(/^@/, '').toLocaleLowerCase('ru');
        if (!q) { box.innerHTML = ''; return; }
        const found = ui.people.filter(p => !exclude.has(p.userId) && `${p.name} ${p.username || ''}`.toLocaleLowerCase('ru').includes(q)).slice(0, SEARCH_LIMIT);
        box.innerHTML = found.length ? found.map(p => `<button type="button" class="aw-found-it" data-who="${esc(p.userId)}"><b>${esc(p.name)}</b><small>${esc(tgOf(p))}</small><i>+</i></button>`).join('')
            : '<p class="adm-muted">никого не нашёл</p>';
        box.querySelectorAll('[data-who]').forEach(b => b.onclick = () => onPick(person(b.dataset.who)));
    }

    // ── по человеку ──
    function personHtml() {
        if (!ui.who) return `${searchHtml('кому выдаём значки')}<p class="adm-muted">найди человека – дальше отметишь все его значки разом</p>`;
        const owned = ownedBy(ui.who.userId);
        const picked = [...ui.pick.entries()];
        return `<div class="aw-who"><div><b>${esc(ui.who.name)}</b><small>${esc(tgOf(ui.who))} · значков: ${owned.size}</small></div><button class="adm-link" id="awWhoChange">сменить</button></div>
            <label class="adm-field"><span>дата для новых отметок</span><input id="awDate" type="date" value="${esc(ui.date)}"></label>
            <div class="aw-badges">${badgeList().map(m => badgeTile(m, { on: ui.pick.has(m.title), owned: owned.get(normT(m.title)) || '' })).join('')}</div>
            ${picked.length ? `<div class="adm-label">выдаём · ${picked.length}</div>${picked.map(([t, d]) => `<div class="aw-to"><div><b>${esc(t)}</b></div>
                <input type="date" data-pdate="${esc(t)}" value="${esc(d)}" aria-label="дата"><button type="button" class="aw-remove" data-punpick="${esc(t)}" aria-label="убрать">×</button></div>`).join('')}` : ''}
            <button type="button" class="btn btn-yellow adm-primary" id="awGrantPerson" ${picked.length ? '' : 'disabled'}>${ui.busy ? esc(ui.progress || 'выдаю…') : `выдать ${picked.length || ''} ${plural(picked.length)}`}</button>`;
    }
    const plural = n => n % 10 === 1 && n % 100 !== 11 ? 'значок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'значка' : 'значков';
    function wirePerson() {
        if (!ui.who) {
            body.querySelector('#awWho').oninput = e => { ui.search = e.target.value; paintWhoFound(p => { ui.who = p; ui.search = ''; ui.pick = new Map(); ui.success = ''; paint(); }); };
            paintWhoFound(p => { ui.who = p; ui.search = ''; ui.pick = new Map(); paint(); });
            body.querySelector('#awWho')?.focus();
            return;
        }
        body.querySelector('#awWhoChange').onclick = () => { ui.who = null; ui.pick = new Map(); ui.success = ''; paint(); };
        body.querySelector('#awDate').onchange = e => { const prev = ui.date; ui.date = e.target.value; ui.pick.forEach((d, t) => { if (d === prev) ui.pick.set(t, ui.date); }); paint(); };
        body.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const t = b.dataset.pick; ui.pick.has(t) ? ui.pick.delete(t) : ui.pick.set(t, ui.date); paint(); });
        body.querySelectorAll('[data-pdate]').forEach(i => i.onchange = () => ui.pick.set(i.dataset.pdate, i.value));
        body.querySelectorAll('[data-punpick]').forEach(b => b.onclick = () => { ui.pick.delete(b.dataset.punpick); paint(); });
        body.querySelector('#awGrantPerson').onclick = () => {
            const who = ui.who;
            grantAll([...ui.pick.entries()].map(([t, d]) => [t, [{ userId: who.userId, name: who.name, date: d }]]));
        };
    }

    // ── по хайку ──
    const pastHikes = () => Object.entries(state.hikesData || {}).map(([date, h]) => ({ ...h, date }))
        .filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.date <= today() && h.title?.trim() && !yes(h.city) && !yes(h.book_club) && !yes(h.cancelled))
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
    async function openHike(h) {
        ui.hike = h; ui.pick = new Map(); ui.hikePeople = new Map(); ui.roster = []; ui.success = ''; ui.error = '';
        const route = routeBadgeForHike(h.title);
        if (route && MEDAL_LIBRARY.some(m => m.title === route)) ui.pick.set(route, h.date);
        ui.busy = true; ui.progress = 'загружаю записанных…'; paint();
        try {
            const data = await achievementRequest('roster', { hikeDate: h.date });
            ui.roster = data.people.filter(p => p.registered || p.attended);
            // отмечены записанные; если отмечали «был на хайке» – только они
            const att = ui.roster.filter(p => p.attended);
            (att.length ? att : ui.roster).forEach(p => ui.hikePeople.set(p.userId, p));
        } catch (error) { ui.error = error.message; }
        finally { ui.busy = false; ui.progress = ''; paint(); }
    }
    function hikeHtml() {
        if (!ui.hike) {
            const list = pastHikes();
            return `<p class="adm-muted">выбери прошедший хайк – записанные на него отметятся сами, значок маршрута тоже</p>
                <div class="aw-hikes">${list.map(h => `<button type="button" class="aw-hike" data-hike="${esc(h.date)}"><b>${esc(dateLabel(h.date))}</b><span>${esc(h.title)}</span>${routeBadgeForHike(h.title) ? '<em>маршрут</em>' : ''}</button>`).join('') || '<p class="adm-muted">прошедших хайков нет</p>'}</div>`;
        }
        const extra = [...ui.hikePeople.values()].filter(p => !ui.roster.some(r => r.userId === p.userId));
        const people = [...ui.roster, ...extra];
        const n = ui.hikePeople.size, k = ui.pick.size;
        return `<div class="aw-who"><div><b>${esc(ui.hike.title)}</b><small>${esc(dateLabel(ui.hike.date))} · дата значков – дата хайка</small></div><button class="adm-link" id="awHikeChange">другой хайк</button></div>
            <div class="adm-label">какие значки · ${k}</div>
            <div class="aw-badges">${badgeList().map(m => badgeTile(m, { on: ui.pick.has(m.title) })).join('')}</div>
            <div class="adm-label">кому · ${n} из ${people.length}</div>
            <div class="aw-pick-toolbar"><button type="button" class="adm-link" id="awHikeAll">отметить всех</button><button type="button" class="adm-link" id="awHikeNone">снять всех</button></div>
            <div class="aw-hike-people">${people.map(p => `<label class="aw-person"><input type="checkbox" data-hp="${esc(p.userId)}" ${ui.hikePeople.has(p.userId) ? 'checked' : ''}>
                <span><b>${esc(p.name)}</b><small>${esc(tgOf(p))}${p.attended ? ' · был' : p.registered ? ' · записан' : ' · добавлен'}</small></span></label>`).join('') || '<p class="adm-muted">на этот хайк никто не записан – добавь людей поиском</p>'}</div>
            ${searchHtml('добавить того, кто был, но не записывался')}
            <button type="button" class="btn btn-yellow adm-primary" id="awGrantHike" ${n && k ? '' : 'disabled'}>${ui.busy ? esc(ui.progress || 'выдаю…') : `выдать ${k} ${plural(k)} · ${n} чел.`}</button>`;
    }
    function wireHike() {
        if (!ui.hike) {
            body.querySelectorAll('[data-hike]').forEach(b => b.onclick = () => openHike(pastHikes().find(h => h.date === b.dataset.hike)));
            return;
        }
        body.querySelector('#awHikeChange').onclick = () => { ui.hike = null; ui.success = ''; paint(); };
        body.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const t = b.dataset.pick; ui.pick.has(t) ? ui.pick.delete(t) : ui.pick.set(t, ui.hike.date); paint(); });
        body.querySelectorAll('[data-hp]').forEach(i => i.onchange = () => {
            const p = ui.roster.find(r => r.userId === i.dataset.hp) || ui.hikePeople.get(i.dataset.hp);
            i.checked ? ui.hikePeople.set(p.userId, p) : ui.hikePeople.delete(p.userId); paint();
        });
        body.querySelector('#awHikeAll').onclick = () => { ui.roster.forEach(p => ui.hikePeople.set(p.userId, p)); paint(); };
        body.querySelector('#awHikeNone').onclick = () => { ui.hikePeople.clear(); paint(); };
        const add = p => { ui.hikePeople.set(p.userId, p); ui.search = ''; paint(); };
        body.querySelector('#awWho').oninput = e => { ui.search = e.target.value; paintWhoFound(add, new Set(ui.hikePeople.keys())); };
        paintWhoFound(add, new Set(ui.hikePeople.keys()));
        body.querySelector('#awGrantHike').onclick = () => {
            const recips = [...ui.hikePeople.values()].map(p => ({ userId: p.userId, name: p.name, date: ui.hike.date }));
            grantAll([...ui.pick.keys()].map(t => [t, recips]));
        };
    }
    function modesHtml() {
        const mode = ['list', 'edit', 'done'].includes(ui.screen) ? 'list' : ui.screen;
        return `<div class="aw-modes" role="tablist">${MODES.map(([k, l]) => `<button type="button" class="aw-mode${k === mode ? ' is-on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>`;
    }
    function paint() {
        if (!body.isConnected) return;
        const scrollParent = body.closest('.adm');
        const scrollTop = scrollParent?.scrollTop;
        const screen = ui.screen === 'person' ? personHtml() : ui.screen === 'hike' ? hikeHtml() : ui.screen === 'list' ? listHtml() : ui.screen === 'edit' ? formHtml() : doneHtml();
        body.innerHTML = `<section class="aw-admin">${['person', 'hike', 'list'].includes(ui.screen) ? modesHtml() : ''}${screen}
            <p class="aw-error" role="alert">${esc(ui.error)}</p><p class="aw-success" role="status">${esc(ui.success)}</p></section>`;
        body.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (ui.busy) return; ui.screen = b.dataset.mode; ui.error = ''; ui.success = ''; ui.search = ''; ui.pick = new Map(); paint(); });
        if (ui.screen === 'person') wirePerson();
        if (ui.screen === 'hike') wireHike();
        body.querySelectorAll('[data-badge]').forEach(b => b.onclick = () => pickBadge(b.dataset.badge));
        body.querySelector('#awBack')?.addEventListener('click', () => { ui.screen = 'list'; ui.error = ''; ui.success = ''; paint(); });
        body.querySelector('#awNotify')?.addEventListener('click', notifyNow);
        if (ui.screen === 'edit') {
            paintFound(); paintSelected();
            body.querySelector('#awSearch').oninput = e => { ui.search = e.target.value; paintFound(); };
            // дата сверху – для тех, кого добавляешь; у уже добавленных новых людей меняется вместе с ней
            body.querySelector('#awDate').onchange = e => {
                const prev = ui.date; ui.date = e.target.value;
                ui.selected.forEach(p => { if (!p.saved && p.date === prev) p.date = ui.date; });
                ui.requestId = null; paintSelected();
            };
            body.querySelector('#awForm').onsubmit = save;
        }
        if (ui.busy) body.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
        if (scrollParent && scrollTop !== undefined) scrollParent.scrollTop = scrollTop;
    }
    async function save(event) {
        event.preventDefault();
        if (ui.busy || !ui.selected.size) return;
        ui.busy = true; ui.error = '';
        ui.requestId ||= crypto.randomUUID();
        paint();
        try {
            const recipients = [...ui.selected.values()].map(({ userId, name, date }) => ({ userId, name: person(userId)?.name || name, date }));
            const dates = recipients.map(r => r.date).sort();
            const data = await achievementRequest('save', { id: ui.id, revision: ui.revision, requestId: ui.requestId,
                draft: { ...ui.draft, date: dates[dates.length - 1] || ui.date, recipients }, medal: { imageUrl: ui.draft.medalUrl } });
            const a = data.achievement;
            ui.achievements = [a, ...ui.achievements.filter(item => item.id !== a.id)];
            ui.result = a; ui.screen = 'done'; ui.success = 'значок выдан';
        } catch (error) { ui.error = error.status === 409 ? 'значок только что изменили в другом окне – вернись к списку и открой его заново' : error.message; }
        finally { ui.busy = false; paint(); }
    }
    await load();
}
