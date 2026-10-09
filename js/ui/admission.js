import { state } from '../state.js';
import { admission, admissionRequest, isAdmissionPilot, loadAdmission, setAdmission, reviewWindow, RULES_VERSION, YALTA_OPTIONS, VIEW_OPTIONS, formAnswers } from '../admission.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let screen = null;
let draft = null;
let reviewTimer = null;

function reviewMarkup(application) {
    const timing = reviewWindow(application.createdAt);
    if (!timing) return '<p class="admission-fine">читаем анкету – напишем тебе в боте</p>';
    return `<div class="admission-review" data-review-created="${Number(application.createdAt)}">
        <div class="admission-review-top"><span class="admission-status-tag">читаем анкету</span><span class="admission-review-time"><span data-review-prefix>${timing.expired ? 'срок прошёл' : 'ещё'}</span> <time data-review-countdown ${timing.expired ? 'hidden' : ''}>${timing.countdown}</time></span></div>
        <div class="admission-review-track" role="progressbar" aria-label="сколько прошло из суток на ответ" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(timing.ratio * 100)}"><span class="admission-review-fill" style="animation-delay:-${timing.elapsed}ms"></span></div>
        <div class="admission-review-labels"><span>анкета отправлена</span><span>ответ в течение суток</span></div>
        <p class="admission-review-overdue" ${timing.expired ? '' : 'hidden'}>ответ ещё готовится – напишем в боте</p>
    </div>`;
}

function updateReviewClocks(resume = false) {
    document.querySelectorAll('[data-review-created]').forEach(element => {
        const timing = reviewWindow(element.dataset.reviewCreated);
        if (!timing) return;
        element.querySelector('[data-review-countdown]').textContent = timing.countdown;
        element.querySelector('[data-review-countdown]').hidden = timing.expired;
        element.querySelector('[data-review-prefix]').textContent = timing.expired ? 'срок прошёл' : 'ещё';
        element.querySelector('.admission-review-overdue').hidden = !timing.expired;
        const track = element.querySelector('[role="progressbar"]');
        track.setAttribute('aria-valuenow', String(Math.round(timing.ratio * 100)));
        track.setAttribute('aria-valuetext', timing.expired ? 'сутки прошли, ожидаем ответ' : `осталось ${timing.countdown}`);
        if (resume) {
            const fill = element.querySelector('.admission-review-fill');
            const replacement = fill.cloneNode();
            replacement.style.animationDelay = `-${timing.elapsed}ms`;
            fill.replaceWith(replacement);
        }
    });
    if (!document.querySelector('[data-review-created]')) { clearInterval(reviewTimer); reviewTimer = null; }
}

function startReviewClocks() {
    updateReviewClocks();
    if (!reviewTimer && document.querySelector('[data-review-created]')) reviewTimer = setInterval(() => { if (!document.hidden) updateReviewClocks(); }, 1000);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) updateReviewClocks(true); });

function track(action) {
    import('../api.js').then(m => m.log(`анкета: ${action}`, true, state.user)).catch(() => {});
}

export function mountAdmissionEntry() {
    if (!isAdmissionPilot()) return;
    const card = document.getElementById('cardBlock');
    if (!card) return;
    document.getElementById('chatBlock')?.remove();
    let block = document.getElementById('admissionEntry');
    if (!block) {
        block = document.createElement('section');
        block.id = 'admissionEntry';
        block.className = 'card-container admission-entry';
        card.after(block);
    }
    const application = admission.application;
    const status = application?.status || 'new';
    const copy = {
        new: ['давай познакомимся', '', 'заполнить анкету'],
        pending: ['анкета у нас', 'спасибо! мы прочитаем её сами и напишем тебе в течение суток', 'посмотреть анкету'],
        approved: ['добро пожаловать в клуб', 'мы прочитали анкету – теперь можно записаться на хайк или оформить карту', 'продолжить'],
        rejected: ['ответ по анкете', 'сейчас не получится позвать тебя в клуб – подробности внутри', 'посмотреть ответ'],
    }[status];
    block.innerHTML = status === 'new' ? `<h2 class="section-title">🔑 как попасть в клуб</h2>
        <p class="adm-lead">в горы можно пойти с кем угодно – одному, с другом или с очередным походным чатом. к нам приходят не за маршрутом, а за людьми</p>
        <div class="calendar-item adm-inner">
            <div class="adm-paths" role="tablist">
                <button type="button" class="adm-path" role="tab" data-path="invite" aria-selected="false"><span class="adm-path-ico">🤝🏻</span><b>приглашение</b></button>
                <button type="button" class="adm-path is-on" role="tab" data-path="form" aria-selected="true"><span class="adm-path-ico">✍🏻</span><b>анкета</b></button>
            </div>
            <div class="adm-steps" data-for="form">
                <div><i>1</i><span>рассказываешь о себе</span></div>
                <div><i>2</i><span>мы читаем и пишем тебе в течение суток</span></div>
                <div><i>3</i><span>записываешься на хайк или оформляешь карту</span></div>
            </div>
            <div class="adm-steps" data-for="invite" hidden>
                <div><i>1</i><span>член клуба отправляет тебе ссылку-приглашение</span></div>
                <div><i>2</i><span>ты переходишь по ней в приложение</span></div>
                <div><i>3</i><span>мы сразу открываем тебе доступ – без анкеты</span></div>
            </div>
            <div data-for="form">
                <button type="button" class="btn btn-yellow admission-entry-button">заполнить анкету</button>
                <p class="adm-entry-note">меньше 20 секунд</p>
            </div>
            <p class="adm-entry-note adm-invite-note" data-for="invite" hidden>если тебя уже позвали – просто открой присланную ссылку</p>
        </div>
        <button type="button" class="adm-why-row" id="admissionWhy"><span>почему вход не для всех</span><b>узнать ›</b></button>` : `<h2 class="section-title">✍️ ${copy[0]}</h2><div class="admission-entry-copy"><p>${copy[1]}</p>
        ${status === 'pending' ? reviewMarkup(application) : ''}
        ${status === 'approved' ? '<span class="admission-status-tag is-approved">заявка одобрена</span>' : ''}
        ${status === 'rejected' ? '<span class="admission-status-tag">заявка рассмотрена</span>' : ''}
        </div><button type="button" class="btn btn-yellow admission-entry-button">${copy[2]}</button>`;
    block.querySelector('.btn').addEventListener('click', () => openAdmission({ view: status === 'new' ? 'form' : 'status' }));
    block.querySelector('#admissionWhy')?.addEventListener('click', openAdmissionWhy);
    // переключатель «приглашение / анкета»: по умолчанию анкета
    block.querySelectorAll('[data-path]').forEach(tab => tab.addEventListener('click', () => {
        const path = tab.dataset.path;
        block.querySelectorAll('[data-path]').forEach(t => { t.classList.toggle('is-on', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
        block.querySelectorAll('[data-for]').forEach(el => { el.hidden = el.dataset.for !== path; });
        track(path === 'invite' ? 'смотрит вход по приглашению' : 'смотрит вход по анкете');
    }));
    startReviewClocks();
}

window.addEventListener('club:admission-updated', () => {
    mountAdmissionEntry();
    if (screen?.view === 'status') render();
});

export async function requireAdmission(context = {}, onClose) {
    if (!isAdmissionPilot()) return true;
    try { await loadAdmission(); } catch { /* The status screen includes a retry action. */ }
    const application = admission.application;
    if (!admission.error && application?.status === 'approved' && application.rulesVersion === RULES_VERSION) return true;
    openAdmission({ context, onClose, view: application?.status === 'new' ? 'intro' : 'status' });
    return false;
}

export function openAdmission({ context = {}, view = 'status', onClose } = {}) {
    if (!isAdmissionPilot()) return;
    if (screen?.busy) return;
    closeAdmission();
    const element = document.createElement('div');
    element.className = 'admission-overlay';
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-labelledby', 'admissionTitle');
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.append(element);
    document.body.style.overflow = 'hidden';
    const inertElements = [...document.body.children].filter(item => item !== element && item instanceof HTMLElement).map(item => [item, item.inert]);
    inertElements.forEach(([item]) => { item.inert = true; });
    screen = { element, context, view, onClose, previousFocus, previousOverflow, inertElements, busy: false };
    element.style.setProperty('--admission-top', `${(window.Telegram?.WebApp?.safeAreaInset?.top || 0) + (window.Telegram?.WebApp?.contentSafeAreaInset?.top || 0)}px`);
    element.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeAdmission(); }
        if (event.key !== 'Tab') return;
        const items = [...element.querySelectorAll('button:not(:disabled), input, textarea, a[href]')];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    element.addEventListener('click', event => { if (event.target === element) closeAdmission(); });
    render();
    requestAnimationFrame(() => element.classList.add('is-on'));
    track('открыл');
    loadAdmission().then(() => {
        if (screen?.element === element && admission.application?.status !== 'new' && ['intro', 'form'].includes(screen.view)) {
            screen.view = 'status'; render();
        }
    }).catch(() => { if (screen?.element === element) { screen.view = 'status'; render(); } });
}

export function closeAdmission() {
    if (!screen || screen.busy) return;
    const previous = screen;
    screen = null;
    previous.element.remove();
    previous.inertElements.forEach(([item, inert]) => { item.inert = inert; });
    document.body.style.overflow = previous.previousOverflow;
    if (previous.previousFocus?.isConnected) previous.previousFocus.focus({ preventScroll: true });
    previous.onClose?.();
    startReviewClocks();
}

function render() {
    if (!screen) return;
    const root = screen.element;
    const application = admission.application;
    let content;
    let title;
    let subtitle;
    let action;
    const button = (label, id = 'admissionContinue') => `<button type="button" class="btn btn-yellow admission-primary" id="${id}">${label}</button>`;
    if (screen.view === 'form' && !admission.error) {
        draft ||= { name: [state.user?.first_name, state.user?.last_name].filter(Boolean).join(' '), yalta: '', views: [] };
        title = 'давай познакомимся';
        subtitle = 'это не экзамен – правильных ответов нет. смотрим только, совпадают ли наши взгляды';
        content = `<form id="admissionForm">
            <label class="admission-field"><span>как тебя зовут</span><input name="name" autocomplete="given-name" minlength="2" maxlength="80" value="${esc(draft.name)}" required></label>
            <fieldset class="admission-group"><legend>ты и Ялта</legend><div class="admission-chips">
                ${YALTA_OPTIONS.map(([key, label]) => `<label class="admission-chip"><input type="radio" name="yalta" value="${key}" ${draft.yalta === key ? 'checked' : ''} required><span>${esc(label)}</span></label>`).join('')}
            </div></fieldset>
            <fieldset class="admission-group"><legend>что про тебя – отмечай сколько угодно</legend>
                ${VIEW_OPTIONS.map(([key, label]) => `<label class="admission-check"><input type="checkbox" name="views" value="${key}" ${draft.views.includes(key) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}
            </fieldset>
            <p class="admission-error" id="admissionError" role="alert"></p>
            <button class="btn btn-yellow admission-primary" type="submit">отправить</button>
            <p class="admission-fine admission-centered">мы прочитаем анкету сами и напишем тебе в течение суток</p>
        </form>`;
    } else if (admission.error) {
        title = 'не получилось загрузить'; subtitle = admission.error;
        content = button('попробовать ещё раз');
        action = async () => { await loadAdmission(); screen.view = 'status'; render(); };
    } else if (!application) {
        title = 'секунду'; subtitle = 'загружаем твою заявку'; content = '<div class="admission-loading" role="status">загрузка…</div>';
    } else if (application.status === 'new') {
        title = 'как попасть в клуб'; subtitle = 'в клуб входят по приглашению или через короткую анкету';
        content = `<p class="admission-body-text">расскажи о себе – мы прочитаем и напишем тебе в течение суток</p>${button('заполнить анкету')}<p class="admission-fine admission-centered">меньше 20 секунд</p>`;
        action = () => { screen.view = 'form'; render(); };
    } else if (application.status === 'pending') {
        title = 'анкета у нас'; subtitle = 'спасибо! если отметил больше двух пунктов, ты уже примерно знаешь, с кем пойдёшь';
        content = `${reviewMarkup(application)}<p class="admission-body-text">пока можно выбрать маршрут и посмотреть ближайшие встречи</p>${application.notificationStatus === 'failed' ? '<p class="admission-fine">бот пока не может написать тебе – <a class="admission-bot-link" href="https://t.me/yaltahiking_bot" target="_blank" rel="noopener">открой его и нажми «начать»</a></p>' : ''}${button('к событиям')}<button class="admission-text-button" id="admissionRefresh">обновить статус</button>`;
        action = closeAdmission;
    } else if (application.status === 'rejected') {
        title = 'спасибо, что рассказал о себе'; subtitle = 'сейчас не получится позвать тебя в клуб';
        content = `<p class="admission-body-text">но в клуб входят и по приглашению – если кто-то из клуба захочет взять тебя с собой, будем рады</p>${button('вернуться к событиям')}`;
        action = closeAdmission;
    } else {
        title = 'добро пожаловать\nв Интеллигенцию'; subtitle = 'мы прочитали анкету – рады знакомству';
        const accepted = application.rulesVersion === RULES_VERSION;
        content = `<div class="admission-rules">
            <div><span aria-hidden="true">✓</span><p>уважаем друг друга<small>бережно относимся к личным границам и разным мнениям</small></p></div>
            <div><span aria-hidden="true">✓</span><p>бережём места встреч<small>не оставляем мусор и соблюдаем правила маршрута</small></p></div>
            <div><span aria-hidden="true">✓</span><p>остаёмся на связи<small>предупреждаем, если планы поменялись и не получится прийти</small></p></div>
        </div>
        <p class="admission-body-text">теперь можно оформить билет на хайк или карту члена клуба</p>
        <p class="admission-fine">карта и запись на события оформляются отдельно</p>
        ${accepted ? '' : '<label class="admission-check"><input id="admissionRules" type="checkbox"><span>ознакомился с правилами клуба</span></label>'}
        <p class="admission-error" id="admissionError" role="alert"></p>
        ${button(application.context?.hikeDate || screen.context.hikeDate ? 'вернуться к хайку' : 'выбрать событие')}`;
        action = async () => {
            if (!accepted) {
                if (!root.querySelector('#admissionRules')?.checked) throw new Error('сначала отметь, что ознакомился с правилами');
                const data = await admissionRequest('welcome', { accept: true });
                setAdmission(data);
            }
            const context = screen.context.hikeDate ? screen.context : application.context;
            screen.busy = false;
            closeAdmission();
            const index = state.hikesWithTitle.findIndex(h => h.date === context?.hikeDate);
            if (index >= 0) {
                const calendar = await import('./calendar.js');
                calendar.showBottomSheet(index);
            } else document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            track('ознакомился с правилами');
        };
    }
    const answers = application?.form && application.status !== 'new'
        ? `<section class="admission-card admission-answers" aria-label="твоя анкета"><dl>${formAnswers(application.form).map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>` : '';
    root.innerHTML = `<section class="admission-screen inv-sheet"><div class="inv-grab cs-grab" role="button" aria-label="закрыть анкету"></div><div class="admission-scroll"><section class="admission-card"><h2 id="admissionTitle" tabindex="-1">${esc(title).replace('\n', '<br>')}</h2><p class="admission-lead">${esc(subtitle)}</p>${content}</section>${answers}</div></section>`;
    root.querySelector('.inv-grab').addEventListener('click', closeAdmission);
    root.querySelector('#admissionTitle')?.focus({ preventScroll: true });
    root.querySelector('#admissionContinue')?.addEventListener('click', () => run(action));
    root.querySelector('#admissionRefresh')?.addEventListener('click', () => run(() => loadAdmission()));
    const form = root.querySelector('form');
    if (form) {
        const readForm = () => ({ name: form.elements.name.value, yalta: form.querySelector('[name="yalta"]:checked')?.value || '', views: [...form.querySelectorAll('[name="views"]:checked')].map(i => i.value) });
        form.addEventListener('input', () => { draft = readForm(); });
        form.addEventListener('change', () => { draft = readForm(); });
        form.addEventListener('submit', event => {
            event.preventDefault();
            run(async () => {
                const data = await admissionRequest('submit', { form: draft, context: screen.context });
                draft = null;
                screen.view = 'status';
                setAdmission(data);
                track('отправил');
                render();
            });
        });
    }
    startReviewClocks();
}

async function run(action) {
    if (!screen || screen.busy || !action) return;
    const current = screen;
    current.busy = true;
    current.element.setAttribute('aria-busy', 'true');
    current.element.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
        // Closing the screen is a synchronous action, not a network mutation.
        if (action === closeAdmission) current.busy = false;
        await action();
    } catch (error) {
        if (screen !== current) return;
        let output = current.element.querySelector('#admissionError');
        if (!output) { output = document.createElement('p'); output.className = 'admission-error'; output.setAttribute('role', 'alert'); current.element.querySelector('.admission-card').append(output); }
        output.textContent = error.message || 'не получилось отправить, попробуй ещё раз';
    } finally {
        current.busy = false;
        current.element.removeAttribute('aria-busy');
        current.element.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
}

// «почему вход не для всех»: шторка со смыслом входа в клуб (по документу «вход в клуб – философия»)
export function openAdmissionWhy() {
    document.querySelector('.adm-why-overlay')?.remove();
    track('почему вход не для всех');
    const overlay = document.createElement('div');
    overlay.className = 'inv-overlay adm-why-overlay';
    overlay.innerHTML = `<div class="inv-sheet"><div class="inv-grab cs-grab"></div><div class="inv-scroll adm-why">
        <h2>в Ялте в горы зовут все</h2>
        <p>чатики, каналы, туры. покупаешь билет, приходишь – и только на старте узнаёшь, с кем идёшь. иногда рядом колонка с чужим плейлистом на всю тропу</p>
        <p>мы не про походы. маршрут найти легко – сложно найти людей, с которыми хочется идти. а в горах, где вокруг только тишина, весь день сделан из тех, кто рядом</p>
        <p>поэтому мы сначала знакомимся. ты коротко рассказываешь о себе – и на старте приходишь к людям, которые тебя уже ждут</p>
        <div class="adm-why-two">
            <div><b>смотрим</b><span>близки ли нам твои взгляды</span></div>
            <div><b>не смотрим</b><span>работа, доход, фото, спортивная форма</span></div>
        </div>
        <p>в группе не больше 10 человек – так каждого видно и слышно, и никто не оказывается рядом случайно</p>
        <p>а если тебя позвал кто-то из клуба, анкета не нужна: тот, кто уже ходит с нами, знает тебя лучше любой анкеты</p>
        <p class="adm-why-last">если тебе это откликается – кажется, ты к нам</p>
        <button type="button" class="btn btn-yellow adm-why-btn">заполнить анкету</button>
    </div></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    const close = () => { overlay.classList.remove('is-on'); setTimeout(() => overlay.remove(), 300); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.inv-grab').addEventListener('click', close);
    overlay.querySelector('.adm-why-btn').addEventListener('click', () => { overlay.remove(); openAdmission({ view: 'form' }); });
}
