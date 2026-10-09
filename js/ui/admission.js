import { state } from '../state.js';
import { admission, admissionRequest, isAdmissionPilot, loadAdmission, setAdmission, RULES_VERSION } from '../admission.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let screen = null;
let draft = null;

function track(action) {
    import('../api.js').then(m => m.log(`анкета: ${action}`, true, state.user)).catch(() => {});
}

export function mountAdmissionEntry() {
    if (!isAdmissionPilot()) return;
    const calendar = document.getElementById('calendarContainer');
    if (!calendar) return;
    let block = document.getElementById('admissionEntry');
    if (!block) {
        block = document.createElement('section');
        block.id = 'admissionEntry';
        block.className = 'card-container admission-entry';
        calendar.after(block);
    }
    const application = admission.application;
    const status = application?.status || 'new';
    const copy = {
        new: ['давай познакомимся', 'в клуб можно попасть по приглашению участника или после короткой анкеты', 'заполнить анкету'],
        pending: ['анкета у нас', 'рассмотрим её в течение одного дня и напишем в боте', 'посмотреть заявку'],
        approved: ['тебя ждут в клубе', 'теперь можно оформить билет на хайк или карту интеллигента', 'продолжить'],
        rejected: ['по заявке есть ответ', 'спасибо за знакомство · посмотреть ответ можно здесь', 'посмотреть ответ'],
    }[status];
    block.innerHTML = `<div class="admission-entry-copy"><h3>${copy[0]}</h3><p>${copy[1]}</p></div><button type="button" class="admission-entry-button">${copy[2]}<span aria-hidden="true">↗</span></button>`;
    block.querySelector('button').addEventListener('click', () => openAdmission({ view: status === 'new' ? 'form' : 'status' }));
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
    render();
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
}

function render() {
    if (!screen) return;
    const root = screen.element;
    const application = admission.application;
    let content;
    let title;
    let subtitle;
    let action;
    const button = (label, id = 'admissionContinue') => `<button type="button" class="admission-primary" id="${id}">${label}</button>`;
    if (screen.view === 'form' && !admission.error) {
        draft ||= { name: state.user?.first_name || '', city: '', about: '', respect: false };
        title = 'давай познакомимся';
        subtitle = 'пара слов о тебе, чтобы знакомство началось ещё до первой встречи';
        content = `<form id="admissionForm">
            <label class="admission-field"><span>как тебя зовут</span><input name="name" autocomplete="given-name" minlength="2" maxlength="80" value="${esc(draft.name)}" required></label>
            <label class="admission-field"><span>в каком городе живёшь</span><input name="city" autocomplete="address-level2" minlength="2" maxlength="100" placeholder="например, Ялта" value="${esc(draft.city)}" required></label>
            <label class="admission-field"><span>что привело тебя к нам</span><textarea name="about" minlength="10" maxlength="800" rows="4" placeholder="что любишь, чем интересуешься и чего ждёшь от клуба" required>${esc(draft.about)}</textarea></label>
            <label class="admission-check"><input name="respect" type="checkbox" ${draft.respect ? 'checked' : ''} required><span>мне близко бережное отношение к людям, личным границам и природе</span></label>
            <p class="admission-fine">ответы увидят только администраторы клуба</p>
            <p class="admission-error" id="admissionError" role="alert"></p>
            <button class="admission-primary" type="submit">отправить анкету</button>
            <p class="admission-fine admission-centered">ответим в течение одного дня</p>
        </form>`;
    } else if (admission.error) {
        title = 'не получилось загрузить'; subtitle = admission.error;
        content = button('попробовать ещё раз');
        action = async () => { await loadAdmission(); screen.view = 'status'; render(); };
    } else if (!application) {
        title = 'секунду'; subtitle = 'загружаем твою заявку'; content = '<div class="admission-loading" role="status">загрузка…</div>';
    } else if (application.status === 'new') {
        title = 'давай познакомимся'; subtitle = 'в Интеллигенцию приходят по приглашению участника или после короткой анкеты';
        content = `<p class="admission-body-text">расскажи немного о себе · рассмотрим заявку в течение одного дня</p>${button('заполнить анкету')}<p class="admission-fine admission-centered">после одобрения можно будет оформить билет или карту клуба</p>`;
        action = () => { screen.view = 'form'; render(); };
    } else if (application.status === 'pending') {
        title = 'анкета у нас'; subtitle = 'спасибо, что рассказал о себе';
        content = `<div class="admission-status-line"><span class="admission-status-dot"></span>на рассмотрении</div><p class="admission-body-text">рассмотрим её в течение одного дня и пришлём ответ в боте</p><p class="admission-fine">пока можно выбрать маршрут и посмотреть ближайшие встречи</p>${application.notificationStatus === 'failed' ? '<p class="admission-fine">бот пока не может написать тебе · <a class="admission-bot-link" href="https://t.me/yaltahiking_bot" target="_blank" rel="noopener">открой его и нажми «начать»</a></p>' : ''}${button('к событиям')}<button class="admission-text-button" id="admissionRefresh">обновить статус</button>`;
        action = closeAdmission;
    } else if (application.status === 'rejected') {
        title = 'спасибо за знакомство'; subtitle = 'мы рассмотрели твою заявку и на данный момент не можем тебя принять';
        content = `<p class="admission-body-text">возможно, ты сможешь присоединиться по приглашению одного из членов клуба</p>${button('вернуться к событиям')}`;
        action = closeAdmission;
    } else {
        title = 'добро пожаловать\nв Интеллигенцию'; subtitle = 'твоя заявка одобрена · рады знакомству';
        const accepted = application.rulesVersion === RULES_VERSION;
        content = `<div class="admission-rules">
            <div><span>01</span><p>уважаем друг друга<small>бережно относимся к личным границам и разным мнениям</small></p></div>
            <div><span>02</span><p>бережём места встреч<small>не оставляем мусор и соблюдаем правила маршрута</small></p></div>
            <div><span>03</span><p>остаёмся на связи<small>предупреждаем, если планы поменялись и не получится прийти</small></p></div>
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
    root.innerHTML = `<section class="admission-screen"><header class="admission-head"><span>интеллигенция</span><button type="button" class="admission-close" aria-label="закрыть анкету">×</button></header><div class="admission-scroll"><div class="admission-kicker">знакомство с клубом</div><h2 id="admissionTitle" tabindex="-1">${esc(title).replace('\n', '<br>')}</h2><p class="admission-lead">${esc(subtitle)}</p>${content}</div></section>`;
    root.querySelector('.admission-close').addEventListener('click', closeAdmission);
    root.querySelector('#admissionTitle')?.focus({ preventScroll: true });
    root.querySelector('#admissionContinue')?.addEventListener('click', () => run(action));
    root.querySelector('#admissionRefresh')?.addEventListener('click', () => run(() => loadAdmission()));
    const form = root.querySelector('form');
    if (form) {
        form.addEventListener('input', () => { draft = { name: form.elements.name.value, city: form.elements.city.value, about: form.elements.about.value, respect: form.elements.respect.checked }; });
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
        if (!output) { output = document.createElement('p'); output.className = 'admission-error'; output.setAttribute('role', 'alert'); current.element.querySelector('.admission-scroll').append(output); }
        output.textContent = error.message || 'не получилось отправить, попробуй ещё раз';
    } finally {
        current.busy = false;
        current.element.removeAttribute('aria-busy');
        current.element.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
}
