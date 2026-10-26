import { state } from '../state.js';
import { ACHIEVEMENT_RARITIES, achievementRequest } from '../achievements.js';
import { MEDAL_LIBRARY, medalForTitle, medalByUrl } from '../achievements-medals.js';
import { DEFAULT_TEXT } from './achievements-notify.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const rarityName = key => ACHIEVEMENT_RARITIES.find(r => r[0] === key)?.[1] || key;
const yes = value => value === true || String(value).toLowerCase() === 'yes';
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.split('-').reverse().join('.') : '';
const count = a => Object.keys(a.recipients || {}).length;
const statusLabel = a => a.status !== 'ready' ? (medalForTitle(a.title) ? 'черновик · медаль есть – открой и сохрани, чтобы выдать' : 'черновик · ожидает медаль')
    : `выдана · ${a.notified ? `сообщение: ${a.notified} из ${Object.keys(a.grants || {}).length}` : 'сообщение не отправляли'}`;

export async function renderAchievementsAdmin(body) {
    const ui = { screen: 'list', filter: 'all', people: [], achievements: [], selected: new Map(),
        search: '', scope: 'all', busy: false, rosterLoading: false, error: '', success: '' };
    const hikes = Object.entries(state.hikesData || {}).map(([date, h]) => ({ ...h, date }))
        .filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.title?.trim() && !yes(h.city) && !yes(h.book_club) && !yes(h.cancelled))
        .sort((a, b) => b.date.localeCompare(a.date));
    let rosterVersion = 0;

    function dirty() { ui.requestId = null; ui.error = ''; ui.success = ''; }
    function setDate(value) {
        const previous = ui.draft.date;
        ui.draft.date = value;
        ui.selected.forEach(p => { if (p.date === previous) p.date = value; });
    }
    async function load() {
        body.innerHTML = '<p class="adm-muted" role="status">загружаю ачивки…</p>';
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
    async function roster() {
        const version = ++rosterVersion;
        ui.rosterLoading = true;
        paint();
        try {
            const data = await achievementRequest('roster', { hikeDate: ui.draft.hikeDate });
            if (version !== rosterVersion || !body.isConnected) return;
            ui.people = data.people;
        } catch (error) { if (version === rosterVersion) ui.error = error.message; }
        finally { if (version === rosterVersion) { ui.rosterLoading = false; paint(); } }
    }
    function startNew() {
        rosterVersion++;
        const hike = hikes.find(h => h.date <= today());
        ui.screen = 'edit'; ui.id = crypto.randomUUID(); ui.revision = 'null_etag'; ui.original = null;
        ui.draft = { title: '', description: '', rarity: 'common', kind: 'special', hikeDate: hike?.date || '', date: hike?.date || today(), medalUrl: '', medalAuto: true };
        ui.selected = new Map(); ui.search = ''; ui.scope = hike ? 'roster' : 'all'; ui.conflict = false; dirty();
        roster();
    }
    async function edit(id) {
        if (ui.busy) return;
        ui.busy = true; ui.error = ''; paint();
        try {
            const data = await achievementRequest('get', { id });
            if (!body.isConnected) return;
            const a = data.achievement;
            ui.screen = 'edit'; ui.id = id; ui.revision = data.revision; ui.original = a;
            ui.draft = { title: a.title, description: a.description || '', rarity: a.rarity, kind: a.kind, date: a.date, hikeDate: a.hikeDate || '',
                medalUrl: a.medal?.imageUrl || medalForTitle(a.title)?.imageUrl || '', medalAuto: !a.medal };
            ui.selected = new Map(Object.values(a.recipients).map(p => [p.userId, { ...p }]));
            ui.search = ''; ui.scope = a.hikeDate ? 'roster' : 'all'; dirty();
            await roster();
        } catch (error) { ui.error = error.message; }
        finally { ui.busy = false; paint(); }
    }
    // «был на хайке» хранится на сервере по дате хайка – отмечаешь один раз и пользуешься для всех ачивок этого хайка
    async function setAttended(ids, attended) {
        const hikeDate = ui.draft.hikeDate;
        if (!hikeDate || !ids.length) return;
        const before = new Map(ui.people.map(p => [p.userId, p.attended]));
        ui.people = ui.people.map(p => ids.includes(p.userId) ? { ...p, attended } : p);
        paintPeople();
        try { await achievementRequest('attendance', { hikeDate, userIds: ids, attended }); }
        catch (error) {
            ui.people = ui.people.map(p => ids.includes(p.userId) ? { ...p, attended: before.get(p.userId) } : p);
            ui.error = error.message; paint();
        }
    }
    function copyFrom(id) {
        const source = ui.achievements.find(a => a.id === id);
        if (!source) return;
        Object.values(source.recipients || {}).forEach(p => {
            if (!ui.selected.has(p.userId)) ui.selected.set(p.userId, { userId: p.userId, name: p.name, date: ui.draft.date });
        });
        dirty(); paintPeople(); paintSelected();
    }
    function saveLabel() {
        if (ui.draft.medalUrl) return ui.original?.status === 'ready' ? 'сохранить изменения' : 'выдать ачивку';
        return ui.original ? 'сохранить черновик' : 'сохранить черновик';
    }
    // медаль: готовая из библиотеки приложения → ачивка выдаётся при сохранении; нет → черновик
    function paintMedal() {
        const box = body.querySelector('#awMedal');
        if (!box) return;
        const d = ui.draft;
        const own = ui.original?.medal && !medalByUrl(ui.original.medal.imageUrl) ? ui.original.medal : null;
        const options = [...MEDAL_LIBRARY, ...(own ? [{ title: 'прикреплённая медаль', imageUrl: own.imageUrl }] : [])];
        box.innerHTML = `<div class="aw-medal-box${d.medalUrl ? ' is-ready' : ''}">
            ${d.medalUrl ? `<img src="${esc(d.medalUrl)}" alt="">` : '<span class="aw-medal-empty">🏅</span>'}
            <div><b>${d.medalUrl ? '✓ медаль есть' : 'медали пока нет'}</b>
            <small>${d.medalUrl ? 'после сохранения ачивка сразу выдаётся – можно отправить уведомление' : 'сохранится черновик. уведомление можно будет отправить, когда медаль прикрепят'}</small>
            <select id="awMedalPick" aria-label="медаль"><option value="">без медали – черновик</option>${options.map(m => `<option value="${esc(m.imageUrl)}" ${m.imageUrl === d.medalUrl ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></div></div>`;
        box.querySelector('#awMedalPick').onchange = e => { d.medalUrl = e.target.value; d.medalAuto = false; dirty(); paintMedal(); updateSave(); };
    }
    function updateSave() { const b = body.querySelector('#awSave'); if (b && !ui.busy) b.textContent = saveLabel(); }
    function visiblePeople() {
        const query = ui.search.trim().replace(/^@/, '').toLocaleLowerCase('ru');
        const people = new Map(ui.people.map(p => [p.userId, p]));
        ui.selected.forEach(p => { if (!people.has(p.userId)) people.set(p.userId, p); });
        return [...people.values()].filter(p => (ui.scope === 'all' || (ui.scope === 'attended' ? p.attended : p.registered))
            && (!query || `${p.name} ${p.username || ''} ${p.userId}`.toLocaleLowerCase('ru').includes(query)));
    }
    function paintPeople() {
        const container = body.querySelector('#awPeople');
        if (!container) return;
        const people = visiblePeople();
        container.innerHTML = ui.rosterLoading ? '<p class="adm-muted" role="status">загружаю участников…</p>'
            : people.length ? people.map(p => `<div class="aw-person-row"><label class="aw-person"><input type="checkbox" data-pick="${esc(p.userId)}" ${ui.selected.has(p.userId) ? 'checked' : ''}>
                <span><b>${esc(p.name)}</b><small>${p.username ? '@' + esc(p.username) + ' · ' : ''}${p.member ? 'карта клуба' : 'участник'}${p.registered ? ' · записан' : ''}</small></span></label>
                ${ui.draft.hikeDate ? `<button type="button" class="aw-att${p.attended ? ' is-on' : ''}" data-att="${esc(p.userId)}" aria-pressed="${p.attended ? 'true' : 'false'}" title="отметка сохраняется для всех ачивок этого хайка">${p.attended ? '✓ был' : 'был?'}</button>` : ''}</div>`).join('')
                : '<p class="adm-muted" role="status">никого не найдено</p>';
        container.querySelectorAll('[data-pick]').forEach(input => input.onchange = () => {
            const id = input.dataset.pick;
            if (input.checked) {
                const p = people.find(p => p.userId === id);
                ui.selected.set(id, { userId: id, name: p.name, date: ui.draft.date });
            } else ui.selected.delete(id);
            dirty(); paintSelected();
        });
        container.querySelectorAll('[data-att]').forEach(button => button.onclick = () => setAttended([button.dataset.att], button.getAttribute('aria-pressed') !== 'true'));
        body.querySelector('#awSelectVisible').disabled = ui.busy || ui.rosterLoading || !people.length;
    }
    function paintSelected() {
        const container = body.querySelector('#awSelected');
        if (!container) return;
        body.querySelector('#awSelectedCount').textContent = `выбрано: ${ui.selected.size}`;
        container.innerHTML = [...ui.selected.values()].map(p => `<div class="aw-recipient" data-recipient="${esc(p.userId)}">
            <label class="adm-field"><span>имя на медали · ${esc(p.userId)}</span><input data-name="${esc(p.userId)}" aria-label="имя на медали ${esc(p.name)}" maxlength="100" value="${esc(p.name)}" required></label>
            <label class="adm-field"><span>дата</span><input data-date="${esc(p.userId)}" aria-label="дата для ${esc(p.name)}" type="date" value="${esc(p.date)}" required></label>
            <button type="button" class="aw-remove" title="убрать получателя" aria-label="убрать ${esc(p.name)}" data-remove="${esc(p.userId)}">×</button></div>`).join('');
        container.querySelectorAll('[data-name]').forEach(input => input.oninput = () => { ui.selected.get(input.dataset.name).name = input.value; dirty(); });
        container.querySelectorAll('[data-date]').forEach(input => input.oninput = () => { ui.selected.get(input.dataset.date).date = input.value; dirty(); });
        container.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { ui.selected.delete(button.dataset.remove); dirty(); paintPeople(); paintSelected(); });
        body.querySelector('#awSave').disabled = ui.busy || ui.rosterLoading || !ui.selected.size;
    }
    function listHtml() {
        const items = ui.achievements.filter(a => ui.filter === 'all' || a.status === ui.filter);
        return `<div class="aw-toolbar"><h2>ачивки</h2><button class="adm-ghost" id="awNew">новая ачивка</button></div>
            <div class="aw-filters" role="group" aria-label="статус ачивки">${[['all', 'все'], ['draft', 'черновики'], ['ready', 'выданы']].map(([key, label]) => `<button class="aw-filter" data-filter="${key}" aria-pressed="${ui.filter === key}">${label}</button>`).join('')}</div>
            <div class="aw-list">${items.length ? items.map(a => `<button class="aw-award" data-edit="${a.id}">
                <span class="aw-award-main"><b>${esc(a.title)}</b><span>${esc(dateLabel(a.date))} · участников: ${count(a)}</span></span>
                <span class="aw-award-side"><span class="aw-rarity is-${a.rarity}">${rarityName(a.rarity)}</span><small>${statusLabel(a)}</small></span></button>`).join('')
                : '<p class="adm-empty">ачивок пока нет</p>'}</div>`;
    }
    function formHtml() {
        const d = ui.draft;
        const options = [...hikes];
        if (d.hikeDate && !options.some(h => h.date === d.hikeDate)) options.unshift({ date: d.hikeDate, title: 'сохранённый хайк' });
        return `<div class="aw-toolbar"><button class="adm-link" id="awBack">к списку</button><span class="adm-muted">${ui.original ? 'редактирование ачивки' : 'новая ачивка'}</span></div>
            <form id="awForm"><fieldset ${ui.busy ? 'disabled' : ''}>
            <label class="adm-field"><span>тип</span><select id="awKind"><option value="special" ${d.kind === 'special' ? 'selected' : ''}>особая ачивка</option><option value="route" ${d.kind === 'route' ? 'selected' : ''}>за пройденный маршрут</option></select></label>
            <label class="adm-field"><span>название ачивки</span><input id="awTitle" maxlength="120" value="${esc(d.title)}" autocomplete="off" required></label>
            <div id="awMedal"></div>
            <label class="adm-field"><span>описание · одна строка, её увидят в поп-апе и в сообщении</span><input id="awDescription" maxlength="200" value="${esc(d.description || '')}" placeholder="спустились туда, куда не ходят туристы" autocomplete="off"></label>
            <fieldset class="aw-rarities"><legend>редкость</legend>${ACHIEVEMENT_RARITIES.map(([key, label]) => `<label class="aw-rarity-option is-${key}"><input type="radio" name="awRarity" value="${key}" ${d.rarity === key ? 'checked' : ''}><span class="aw-swatch" aria-hidden="true"></span><span>${label}</span></label>`).join('')}</fieldset>
            <div class="aw-form-row"><label class="adm-field"><span>хайк</span><select id="awHike"><option value="">без привязки к хайку</option>${options.map(h => `<option value="${h.date}" ${h.date === d.hikeDate ? 'selected' : ''}>${dateLabel(h.date)} · ${esc(h.title)}</option>`).join('')}</select></label>
            <label class="adm-field"><span>дата ачивки</span><input id="awDate" type="date" value="${esc(d.date)}" required></label></div>
            <div class="adm-label">получатели</div>
            <div class="aw-form-row"><label class="adm-field"><span>поиск по имени или Telegram</span><input type="search" id="awSearch" value="${esc(ui.search)}" autocomplete="off"></label>
                <label class="adm-field"><span>список</span><select id="awScope"><option value="all" ${ui.scope === 'all' ? 'selected' : ''}>все участники</option>${d.hikeDate ? `<option value="attended" ${ui.scope === 'attended' ? 'selected' : ''}>были на хайке</option><option value="roster" ${ui.scope === 'roster' ? 'selected' : ''}>записаны на этот хайк</option>` : ''}</select></label></div>
            <div class="aw-pick-toolbar"><button type="button" class="adm-link" id="awSelectVisible">выбрать список</button><button type="button" class="adm-link" id="awClear">снять выбор</button></div>
            ${ui.achievements.some(a => a.id !== ui.id && count(a)) ? `<label class="adm-field"><span>добавить людей из другой ачивки</span><select id="awCopyFrom"><option value="">выбрать ачивку…</option>${ui.achievements.filter(a => a.id !== ui.id && count(a)).map(a => `<option value="${a.id}">${esc(a.title)} · ${esc(dateLabel(a.date))} · ${count(a)} чел.</option>`).join('')}</select></label>` : ''}
            ${d.hikeDate ? '<button type="button" class="adm-link" id="awMarkSelected">отметить выбранных: были на хайке</button>' : ''}
            <div class="aw-people" id="awPeople"></div><div class="adm-label" id="awSelectedCount"></div><div id="awSelected"></div>
            ${ui.original?.medal ? '<p class="adm-muted">при изменении названия, редкости или типа потребуется новая медаль</p>' : ''}
            <button type="submit" class="btn btn-yellow adm-primary" id="awSave">${ui.busy ? 'сохраняю…' : saveLabel()}</button>
            </fieldset></form>`;
    }
    function detailHtml() {
        const a = ui.result;
        return `<div class="aw-toolbar"><button class="adm-link" id="awBack">к списку</button><span class="aw-rarity is-${a.rarity}">${rarityName(a.rarity)}</span></div>
            <h2 class="aw-detail-title">${esc(a.title)}</h2>${a.description ? `<p class="aw-detail-desc">${esc(a.description)}</p>` : ''}<p class="adm-muted">${dateLabel(a.date)} · участников: ${count(a)} · ${statusLabel(a)}</p>
            ${a.medal ? `<img class="aw-medal-preview" src="${esc(a.medal.imageUrl)}" alt="${esc(a.title)}">` : ''}
            <div class="aw-saved-people">${Object.values(a.recipients).map(p => `<div><b>${esc(p.name)}</b><span>${dateLabel(p.date)}</span></div>`).join('')}</div>
            <div class="aw-detail-actions"><button class="adm-ghost" id="awEditSaved">редактировать</button><button class="adm-ghost" id="awCopy">скопировать задание для медали</button><button class="adm-ghost" id="awNew">ещё ачивка</button></div>
            ${notifyHtml(a)}
            <div id="awCopyFallback"></div><p class="adm-muted aw-record-id">ID: ${esc(a.id)}</p>`;
    }
    function notifyHtml(a) {
        if (a.status !== 'ready') return `<div class="aw-notify is-wait"><b>уведомление пока нельзя отправить</b><small>медали ещё нет – выбери готовую медаль в «редактировать» или прикрепи новую</small></div>`;
        const total = Object.keys(a.grants || {}).length, done = a.notified || 0;
        return `<div class="aw-notify"><b>🏅 уведомление в бот</b><small>${done ? `уже отправлено: ${done} из ${total}` : 'ещё не отправляли'} · текст и выбор людей – в «рассылки → 🏅 новые ачивки»</small>
            ${done < total ? `<button class="btn btn-yellow adm-primary" id="awNotify">${ui.notifyBusy ? 'отправляю…' : `отправить ${done ? 'остальным' : 'всем'} · ${total - done}`}</button>` : ''}</div>`;
    }
    async function notifyNow() {
        const a = ui.result;
        if (ui.notifyBusy || !a) return;
        if (!confirm(`отправить сообщение об ачивке «${a.title}» тем, кому ещё не писали?`)) return;
        ui.notifyBusy = true; ui.error = ''; paint();
        try {
            // только тем, кому об этой ачивке ещё не писали – повторно никто не получит
            const list = await achievementRequest('notify_list');
            const ids = list.people.filter(p => p.items.some(i => i.id === a.id && !i.notifiedAt)).map(p => p.userId);
            if (!ids.length) { ui.success = 'всем уже отправлено'; return; }
            const r = await achievementRequest('notify_send', { userIds: ids, text: DEFAULT_TEXT });
            ui.result = { ...a, notified: Math.min(Object.keys(a.grants || {}).length, (a.notified || 0) + r.sent) };
            ui.achievements = ui.achievements.map(x => x.id === a.id ? ui.result : x);
            ui.success = `отправлено ${r.sent}${r.failed?.length ? ` · не дошло: ${r.failed.length} (уже получили сообщение об этой ачивке или бот заблокирован)` : ''}`;
        } catch (error) { ui.error = error.message; }
        finally { ui.notifyBusy = false; paint(); }
    }
    function paint() {
        if (!body.isConnected) return;
        const scrollParent = body.closest('.adm');
        const scrollTop = scrollParent?.scrollTop;
        body.innerHTML = `<section class="aw-admin">${ui.screen === 'list' ? listHtml() : ui.screen === 'edit' ? formHtml() : detailHtml()}
            <p class="aw-error" id="awError" role="alert">${esc(ui.error)}</p><p class="aw-success" id="awSuccess" role="status">${esc(ui.success)}</p>
            ${ui.conflict ? '<button class="adm-link" id="awReload">загрузить сохранённую версию</button>' : ''}</section>`;
        body.querySelector('#awNew')?.addEventListener('click', startNew);
        body.querySelector('#awBack')?.addEventListener('click', () => { rosterVersion++; ui.screen = 'list'; ui.conflict = false; dirty(); paint(); });
        body.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { ui.filter = b.dataset.filter; paint(); });
        body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(b.dataset.edit));
        body.querySelector('#awReload')?.addEventListener('click', () => { ui.conflict = false; edit(ui.id); });
        if (ui.screen === 'edit') {
            paintPeople(); paintSelected();
            paintMedal();
            body.querySelector('#awTitle').oninput = e => {
                ui.draft.title = e.target.value; dirty();
                if (ui.draft.medalAuto) { const m = medalForTitle(ui.draft.title); if ((m?.imageUrl || '') !== ui.draft.medalUrl) { ui.draft.medalUrl = m?.imageUrl || ''; paintMedal(); updateSave(); } }
            };
            body.querySelector('#awDescription').oninput = e => { ui.draft.description = e.target.value; dirty(); };
            body.querySelector('#awCopyFrom')?.addEventListener('change', e => { copyFrom(e.target.value); e.target.value = ''; });
            body.querySelector('#awMarkSelected')?.addEventListener('click', () => setAttended([...ui.selected.keys()], true));
            body.querySelectorAll('[name="awRarity"]').forEach(input => input.onchange = () => { ui.draft.rarity = input.value; dirty(); });
            body.querySelector('#awKind').onchange = e => {
                ui.draft.kind = e.target.value;
                if (ui.draft.kind === 'route') { ui.draft.rarity = 'common'; if (!ui.draft.title) ui.draft.title = hikes.find(h => h.date === ui.draft.hikeDate)?.title || ''; }
                dirty(); paint();
            };
            body.querySelector('#awHike').onchange = e => {
                ui.draft.hikeDate = e.target.value;
                if (ui.draft.hikeDate) setDate(ui.draft.hikeDate);
                if (ui.draft.kind === 'route') ui.draft.title = hikes.find(h => h.date === ui.draft.hikeDate)?.title || ui.draft.title;
                ui.scope = ui.draft.hikeDate ? 'roster' : 'all'; dirty(); roster();
            };
            body.querySelector('#awDate').onchange = e => { setDate(e.target.value); dirty(); paintSelected(); };
            body.querySelector('#awSearch').oninput = e => { ui.search = e.target.value; paintPeople(); };
            body.querySelector('#awScope').onchange = e => { ui.scope = e.target.value; paintPeople(); };
            body.querySelector('#awSelectVisible').onclick = () => {
                visiblePeople().forEach(p => { if (!ui.selected.has(p.userId)) ui.selected.set(p.userId, { userId: p.userId, name: p.name, date: ui.draft.date }); });
                dirty(); paintPeople(); paintSelected();
            };
            body.querySelector('#awClear').onclick = () => { ui.selected.clear(); dirty(); paintPeople(); paintSelected(); };
            body.querySelector('#awForm').onsubmit = save;
        }
        body.querySelector('#awEditSaved')?.addEventListener('click', () => edit(ui.result.id));
        body.querySelector('#awCopy')?.addEventListener('click', copyTask);
        body.querySelector('#awNotify')?.addEventListener('click', notifyNow);
        if (ui.busy) body.querySelectorAll('button, input, select').forEach(el => { el.disabled = true; });
        if (scrollParent && scrollTop !== undefined) scrollParent.scrollTop = scrollTop;
    }
    async function save(event) {
        event.preventDefault();
        if (ui.busy || ui.rosterLoading || !ui.selected.size) return;
        ui.busy = true; ui.error = ''; ui.conflict = false;
        ui.requestId ||= crypto.randomUUID();
        paint();
        try {
            const data = await achievementRequest('save', { id: ui.id, revision: ui.revision, requestId: ui.requestId,
                draft: { ...ui.draft, recipients: [...ui.selected.values()].map(({ userId, name, date }) => ({ userId, name, date })) },
                ...(ui.draft.medalUrl ? { medal: { imageUrl: ui.draft.medalUrl } } : {}) });
            const a = data.achievement;
            ui.achievements = [a, ...ui.achievements.filter(item => item.id !== a.id)];
            ui.result = a; ui.screen = 'detail'; ui.success = a.status === 'ready' ? 'ачивка выдана – можно отправить уведомление' : 'черновик ачивки сохранён';
        } catch (error) { ui.error = error.message; ui.conflict = error.status === 409; }
        finally { ui.busy = false; paint(); }
    }
    async function copyTask() {
        const a = ui.result;
        const text = [`Медаль клуба. ID ачивки: ${a.id}`, `Название: ${a.title}`, `Редкость: ${rarityName(a.rarity)}`, ...(a.description ? [`Описание: ${a.description}`] : []),
            `Дата: ${a.date}`, 'Стиль: объёмный металл, цветная эмаль, встроенная нижняя подпись, лаймовый акцент #D9FD19',
            'Получатели:', ...Object.values(a.recipients).map(p => `${p.userId} | ${p.name} | ${p.date}`)].join('\n');
        try {
            await navigator.clipboard.writeText(text);
            ui.success = 'задание скопировано';
            const status = body.querySelector('#awSuccess');
            if (status?.isConnected) status.textContent = ui.success;
        }
        catch {
            const box = body.querySelector('#awCopyFallback');
            if (!box) return;
            box.innerHTML = '<label class="adm-field"><span>задание для медали</span><textarea rows="8" readonly></textarea></label>';
            box.querySelector('textarea').value = text;
            box.querySelector('textarea').select();
        }
    }
    await load();
}
