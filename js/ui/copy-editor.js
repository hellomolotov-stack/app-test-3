const selector = '[data-app-copy]';
const adminIds = new Set(['163665735', '7845375334']);
const endpoint = '/api/club-content?copy=1';

export function initCopyEditor(tg) {
    const defaults = new WeakMap();
    let saved = {}, draft = null, editing = false, canRestore = false;
    let button;
    function paint() {
        for (const node of document.querySelectorAll(selector)) {
            if (!defaults.has(node)) defaults.set(node, node.textContent);
            const key = node.dataset.appCopy;
            const text = draft?.key === key ? draft.text : typeof saved[key] === 'string' ? saved[key] : defaults.get(node);
            if (node.textContent !== text) node.textContent = text;
        }
    }
    async function read() {
        const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(9000) });
        if (!response.ok) throw new Error('не удалось загрузить тексты');
        const data = await response.json();
        saved = data.value || {};
        canRestore = data.canRestore;
        paint();
        return data.revision;
    }
    const refresh = () => { if (!draft && !document.hidden) read().catch(() => {}); };
    const watched = new MutationObserver(records => {
        if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches(selector) || n.querySelector(selector))))) paint();
    });
    watched.observe(document.body, { childList: true, subtree: true });
    refresh();
    document.addEventListener('visibilitychange', refresh);
    if (!tg?.initData || !adminIds.has(String(tg.initDataUnsafe?.user?.id))) return;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-pencil';
    button.textContent = '✎';
    button.setAttribute('aria-label', 'редактировать тексты');
    button.setAttribute('aria-pressed', 'false');
    document.body.append(button);
    const dialog = document.createElement('dialog');
    dialog.className = 'copy-dialog';
    dialog.innerHTML = `
      <form>
        <b>текст в приложении</b>
        <label>текст и эмоджи<input aria-label="текст и эмоджи" maxlength="240" required type="text"></label>
        <p>изменения видны только тебе до публикации</p>
        <div class="copy-error" role="status"></div>
        <div class="copy-actions">
          <button type="button" data-back>отмена</button>
          <button type="submit">опубликовать</button>
        </div>
        <button type="button" data-restore>вернуть предыдущую правку</button>
      </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form');
    const input = dialog.querySelector('input');
    const error = dialog.querySelector('.copy-error');
    const submit = dialog.querySelector('[type=submit]');
    const back = dialog.querySelector('[data-back]');
    const restore = dialog.querySelector('[data-restore]');
    let revision, busy = false;
    const setBusy = value => {
        busy = value;
        for (const el of [input, submit, back, restore]) el.disabled = value;
    };
    const stop = () => {
        editing = false;
        document.body.classList.remove('copy-editing');
        button.setAttribute('aria-pressed', 'false');
    };
    button.addEventListener('click', () => {
        if (editing) { stop(); return; }
        editing = true;
        paint();
        button.setAttribute('aria-pressed', 'true');
        document.body.classList.add('copy-editing');
    });
    document.addEventListener('click', e => {
        if (!editing || dialog.open || e.target === button) return;
        const target = e.target.closest?.(selector);
        if (!target) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        input.value = target.textContent;
        draft = { key: target.dataset.appCopy, text: input.value };
        error.textContent = '';
        restore.hidden = true;
        revision = null;
        dialog.showModal();
        setBusy(true);
        read().then(value => {
            revision = value;
            input.value = typeof saved[draft.key] === 'string' ? saved[draft.key] : defaults.get(target);
            draft.text = input.value;
            restore.hidden = !canRestore;
            paint();
        }).catch(() => { error.textContent = 'не удалось загрузить тексты, открой редактор снова'; })
          .finally(() => { setBusy(false); submit.disabled = !revision; input.focus(); });
    }, true);
    input.addEventListener('input', () => { draft.text = input.value; paint(); });
    back.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { draft = null; paint(); });
    async function publish(change) {
        if (!revision || busy) return;
        error.textContent = '';
        setBusy(true);
        try {
            const response = await fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ action: 'app_copy', initData: tg.initData, revision, ...change }),
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 409) revision = null;
                throw new Error(data.error || 'не удалось сохранить');
            }
            saved = data.value;
            draft = null;
            paint();
            dialog.close();
            stop();
        } catch (e) { error.textContent = e.message || 'не удалось сохранить'; }
        finally { setBusy(false); submit.disabled = restore.disabled = !revision; }
    }
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (draft) publish({ key: draft.key, text: input.value });
    });
    restore.addEventListener('click', () => {
        if (restore.dataset.confirm !== 'yes') {
            restore.dataset.confirm = 'yes';
            restore.textContent = 'подтвердить возврат для всех';
            return;
        }
        publish({ restore: true });
    });
    dialog.addEventListener('close', () => {
        delete restore.dataset.confirm;
        restore.textContent = 'вернуть предыдущую правку';
    });
}
