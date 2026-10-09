import { admissionRequest, isAdmissionPilot, setAdmission, formAnswers } from '../admission.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const labels = { new: 'заявок пока нет', pending: 'на рассмотрении', approved: 'одобрена', rejected: 'отклонена' };

export async function renderAdmissionAdmin(body) {
    body.innerHTML = '<p class="adm-muted" role="status">загружаю заявки…</p>';
    let data;
    try { data = await admissionRequest('list'); }
    catch (error) {
        if (!body.isConnected) return;
        body.innerHTML = `<p class="adm-error-inline" role="alert">${esc(error.message)}</p><button class="adm-ghost" id="admissionAdminRetry">повторить</button>`;
        body.querySelector('button').onclick = () => renderAdmissionAdmin(body);
        return;
    }
    if (!body.isConnected) return;
    const application = data.application;
    const delivery = application.notificationStatus;
    body.innerHTML = `<div class="adm-label">заявки в клуб</div><p class="adm-muted">пилот · только @HelloIntelligent</p>
        <div class="admission-admin-status">${labels[application.status]}</div>
        ${application.form ? `<h3 class="admission-admin-name">${esc(application.form.name)}</h3><p class="adm-muted">@${esc(application.username)}</p>
        ${formAnswers(application.form).slice(1).map(([label, value]) => `<div class="admission-admin-answer"><span>${esc(label)}</span><p>${esc(value)}</p></div>`).join('')}
        <p class="adm-muted">отправлена ${esc(new Date(application.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }))}</p>
        ${application.context?.hikeTitle ? `<p class="adm-muted">интересует: ${esc(application.context.hikeTitle)}</p>` : ''}` : ''}
        ${application.status === 'pending' ? '<div class="admission-admin-actions"><button class="btn btn-yellow" data-action="approve">принять</button><button class="btn btn-outline" data-action="reject">отклонить</button></div>' : ''}
        ${application.status !== 'new' ? `<p class="adm-muted">${delivery === 'sent' ? 'уведомление отправлено в Telegram' : delivery === 'sending' ? 'уведомление отправляется' : delivery === 'uncertain' ? 'ответ Telegram не получен · сообщение могло прийти' : 'уведомление не доставлено · проверь, что бот запущен и не заблокирован'}</p>
        ${delivery !== 'sent' ? '<button class="adm-ghost" data-action="retry">повторить уведомление</button>' : ''}
        <button class="admission-text-button" data-action="reset">сбросить тестовую заявку</button><p class="adm-muted">сброс не меняет карту, оплаты и записи на события</p>` : ''}
        <div id="admissionAdminConfirm"></div><p class="adm-error-inline" id="admissionAdminError" role="alert"></p>
        <button class="adm-link" data-action="refresh">обновить</button>`;
    let busy = false;
    async function perform(action, decision) {
        if (busy) return;
        busy = true;
        body.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
            const result = await admissionRequest(action, { revision: data.revision, decision });
            if (isAdmissionPilot()) setAdmission(result);
            if (body.isConnected) await renderAdmissionAdmin(body);
        } catch (error) {
            if (body.isConnected) body.querySelector('#admissionAdminError').textContent = error.message;
        } finally { busy = false; body.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
    }
    body.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (action === 'refresh') return renderAdmissionAdmin(body);
        const confirm = body.querySelector('#admissionAdminConfirm');
        const text = { approve: 'одобрить заявку? человеку придёт сообщение, но карта автоматически не появится', reject: 'отклонить заявку? человеку придёт сообщение с ответом', reset: 'начать пилот заново? будет удалена только тестовая заявка', retry: 'отправить уведомление ещё раз? если оно уже пришло, появится повторное сообщение' }[action];
        confirm.innerHTML = `<div class="admission-admin-confirm"><p>${text}</p><div class="admission-admin-actions"><button class="adm-ghost" id="admissionConfirmYes">подтвердить</button><button class="adm-link" id="admissionConfirmNo">отмена</button></div></div>`;
        confirm.querySelector('#admissionConfirmNo').onclick = () => { confirm.innerHTML = ''; };
        confirm.querySelector('#admissionConfirmYes').onclick = () => perform(action === 'approve' || action === 'reject' ? 'decide' : action, action === 'approve' ? 'approved' : 'rejected');
        confirm.querySelector('button').focus();
    }));
}
