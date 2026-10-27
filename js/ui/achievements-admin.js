import { rarityLabel, achievementRequest } from '../achievements.js';
import { MEDAL_LIBRARY } from '../achievements-medals.js';
import { ACHIEVEMENT_CATEGORIES, catalogByTitle, categoryOf } from '../achievements-catalog.js';
import { DEFAULT_TEXT } from './achievements-notify.js';

// Админка → значки: сетка всех значков → тап по значку → кому (поиск по имени и @) и за какую дату → «выдать».
// Если такой значок уже выдавался, открывается та же запись: старые получатели на месте, новые добавляются к ним.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.split('-').reverse().join('.') : '';
const normT = t => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'–—-]/g, ' ').replace(/\s+/g, ' ').trim();
const EXTRA_RARITY = { 'залез в пещеру пауков': 'mythical', 'откусил волшебный гриб': 'legendary' };
const SEARCH_LIMIT = 8;

export async function renderAchievementsAdmin(body) {
    const ui = { screen: 'list', people: [], achievements: [], selected: new Map(), search: '', date: today(),
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
        return `<div class="aw-toolbar"><h2>значки</h2></div>
            <div class="aw-badges-head"><small>выбери значок – дальше кому и за какую дату</small></div>
            <div class="aw-badges">${badgeList().map(m => { const n = holders(m.title);
                return `<button type="button" class="aw-badge" data-badge="${esc(m.title)}"><img src="${esc(m.imageUrl)}" alt="" loading="lazy"><span>${esc(m.title)}</span><em>${n ? `у ${n} чел.` : 'ещё ни у кого'}</em></button>`; }).join('')}</div>`;
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
    function paint() {
        if (!body.isConnected) return;
        const scrollParent = body.closest('.adm');
        const scrollTop = scrollParent?.scrollTop;
        body.innerHTML = `<section class="aw-admin">${ui.screen === 'list' ? listHtml() : ui.screen === 'edit' ? formHtml() : doneHtml()}
            <p class="aw-error" role="alert">${esc(ui.error)}</p><p class="aw-success" role="status">${esc(ui.success)}</p></section>`;
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
