// Рассылки → «🏅 новые ачивки»: кому недавно выдали ачивки, отправляли ли им сообщение, и отправка через бота.
// Отправляет сервер (/api/achievements, notify_send) и сам отмечает, кому сообщение ушло.
import { achievementRequest } from '../achievements.js';
import { haptic } from '../utils.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ddmm = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const DEFAULT_TEXT = '[имя], у тебя новая ачивка в клубе 🏅\n\n<b>[ачивки]</b>\n\nзагляни – там твоя медаль, её можно посмотреть и поделиться в сторис';

const ui = { open: false, people: null, picked: new Set(), text: DEFAULT_TEXT, busy: false, note: '', error: '' };

export function mountAchievementNotify(host) {
    if (!host) return;
    const paint = () => {
        if (!host.isConnected) return;
        const people = ui.people || [];
        const waiting = people.filter(p => p.items.some(i => !i.notifiedAt));
        host.innerHTML = `<button class="adm-quick" data-an-toggle>🏅 новые ачивки<small>${ui.people == null ? 'кому недавно выдали ачивки и отправляли ли сообщение'
            : waiting.length ? `ждут сообщения: ${waiting.length} чел.` : 'всем уже отправили'}</small></button>
            ${ui.open ? panel(people) : ''}`;
        host.querySelector('[data-an-toggle]').onclick = () => {
            haptic(); ui.open = !ui.open;
            if (ui.open && ui.people == null) load(); else paint();
        };
        if (!ui.open || ui.people == null) return;
        host.querySelectorAll('[data-an-pick]').forEach(input => input.onchange = () => {
            input.checked ? ui.picked.add(input.dataset.anPick) : ui.picked.delete(input.dataset.anPick); paint();
        });
        host.querySelector('[data-an-all]')?.addEventListener('click', () => { people.forEach(p => ui.picked.add(p.userId)); paint(); });
        host.querySelector('[data-an-new]')?.addEventListener('click', () => { ui.picked = new Set(waiting.map(p => p.userId)); paint(); });
        host.querySelector('[data-an-none]')?.addEventListener('click', () => { ui.picked.clear(); paint(); });
        host.querySelector('[data-an-text]').oninput = e => { ui.text = e.target.value; };
        host.querySelector('[data-an-reset]').onclick = () => { ui.text = DEFAULT_TEXT; paint(); };
        host.querySelector('[data-an-test]').onclick = () => send(true);
        host.querySelector('[data-an-send]').onclick = () => send(false);
    };
    const panel = people => `<div class="an-panel">
        ${ui.error ? `<p class="adm-error-inline" role="alert">${esc(ui.error)}</p>` : ''}
        ${!people.length ? '<p class="adm-muted">за последние 45 дней новых ачивок нет</p>' : `
        <div class="an-tools"><button class="adm-link" data-an-new>только кому не отправляли</button><button class="adm-link" data-an-all>всех</button><button class="adm-link" data-an-none>снять</button></div>
        <div class="an-list">${people.map(p => {
            const fresh = p.items.filter(i => !i.notifiedAt);
            const last = Math.max(...p.items.map(i => i.notifiedAt || 0));
            return `<label class="an-row"><input type="checkbox" data-an-pick="${esc(p.userId)}" ${ui.picked.has(p.userId) ? 'checked' : ''}>
                <span><b>${esc(p.name)}</b>${p.username ? ` <small>@${esc(p.username)}</small>` : ''}
                <em>${p.items.map(i => `${i.notifiedAt ? '' : '🆕 '}${esc(i.title)}`).join(' · ')}</em></span>
                <span class="an-status${fresh.length ? ' is-new' : ''}">${fresh.length ? 'не отправляли' : `✓ ушло ${ddmm(last)}`}</span></label>`;
        }).join('')}</div>`}
        <label class="adm-field"><span>текст · [имя] – имя, [ачивки] – названия новых ачивок</span><textarea rows="6" data-an-text>${esc(ui.text)}</textarea></label>
        <div class="adm-hint">под сообщением кнопка «🏅 посмотреть ачивки» – откроет приложение сразу на поп-апе с медалями. повторно человеку уходят только ачивки, о которых ещё не писали</div>
        <button class="adm-link" data-an-reset>вернуть текст по умолчанию</button>
        ${ui.note ? `<p class="adm-hint an-note" role="status">${esc(ui.note)}</p>` : ''}
        <div class="adm-row2"><button class="adm-ghost" data-an-test ${ui.busy || !ui.picked.size ? 'disabled' : ''}>отправить себе</button>
        <button class="btn btn-yellow adm-primary" data-an-send ${ui.busy || !ui.picked.size ? 'disabled' : ''}>${ui.busy ? 'отправляю…' : `отправить · ${ui.picked.size}`}</button></div>
    </div>`;
    async function load() {
        ui.error = ''; paint();
        try {
            const data = await achievementRequest('notify_list');
            ui.people = data.people;
            ui.picked = new Set(ui.people.filter(p => p.items.some(i => !i.notifiedAt)).map(p => p.userId));
        } catch (error) { ui.people = []; ui.error = error.message; }
        paint();
    }
    async function send(test) {
        if (ui.busy || !ui.picked.size) return;
        if (!test && !confirm(`отправить сообщение об ачивках: ${ui.picked.size} чел.?`)) return;
        haptic(); ui.busy = true; ui.note = ''; ui.error = ''; paint();
        try {
            const r = await achievementRequest('notify_send', { userIds: [...ui.picked], text: ui.text, test });
            ui.note = test ? (r.sent ? 'отправил тебе пример – проверь бота' : 'не получилось отправить тебе')
                : `отправлено ${r.sent} из ${r.total}${r.failed?.length ? ` · не дошло: ${r.failed.length} (бот заблокирован или нет новых ачивок)` : ''}`;
            if (!test) { ui.people = null; ui.busy = false; await load(); return; }
        } catch (error) { ui.error = error.message; }
        ui.busy = false; paint();
    }
    ui.people == null && ui.open ? load() : paint();
}
