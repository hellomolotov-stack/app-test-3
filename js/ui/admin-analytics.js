const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function renderAnalytics(container, call) {
    let period = 'today';
    let date = '';
    let revision = 0;
    let choices = [];
    container.innerHTML = `<section class="analytics">
        <div class="analytics-controls">
            <div class="analytics-period" role="group" aria-label="Период аналитики">
                <button class="adm-tab is-on" data-period="today">сегодня</button>
                <button class="adm-tab" data-period="yesterday">вчера</button>
                <button class="adm-tab" data-period="7d">7 дней</button>
            </div>
            <label class="adm-field"><span>хайк</span><select aria-label="Хайк для аналитики"></select></label>
            <button class="adm-ghost analytics-refresh">обновить</button>
        </div><div class="analytics-result" aria-live="polite"></div>
    </section>`;
    const result = container.querySelector('.analytics-result');
    const select = container.querySelector('select');
    const refresh = container.querySelector('.analytics-refresh');
    const funnel = (title, labels, counts) => `<section class="analytics-funnel"><h3>${title}</h3><ol>${counts.map((n, i) => {
        const percentage = i && counts[i - 1] ? Math.round(n / counts[i - 1] * 100) + '% от предыдущего' : i ? 'нет предыдущих шагов' : 'уникальные люди';
        return `<li><div class="analytics-step"><span>${esc(labels[i])}</span><strong>${n}</strong></div><div class="analytics-track"><div style="width:${counts[0] ? n / counts[0] * 100 : 0}%"></div></div><small>${percentage}</small></li>`;
    }).join('')}</ol></section>`;
    async function load() {
        const current = ++revision;
        refresh.disabled = true;
        result.innerHTML = '<p class="adm-muted" role="status">собираю подтверждённые данные…</p>';
        try {
            const data = await call('adminAnalytics', { period, date });
            if (!container.isConnected || current !== revision) return;
            choices = data.choices || [];
            select.innerHTML = choices.map(h => `<option value="${esc(h.date)}">${esc(h.date)} · ${esc(h.title)}</option>`).join('');
            date = data.date || date;
            select.value = date;
            if (data.empty) { result.innerHTML = '<p class="adm-muted">нет опубликованного хайка для отчёта</p>'; return; }
            result.innerHTML = `<p class="analytics-coverage">${data.noCoverage ? 'Этот период был до начала достоверного сбора' : `${esc(time(data.from))} — ${esc(time(data.to))} МСК${data.partial ? ' · неполный период' : ''}`}</p>
                <div class="analytics-totals">${[['записаны сейчас', data.active], ['оплатили билет за период', data.paid], ['купили карту на этот хайк', data.cardPaid], ['ошибки оформления, чел.', data.errors]].map(([label, n]) => `<div><strong>${n}</strong><span>${label}</span></div>`).join('')}</div>
                ${funnel('без карты · билет', data.guestLabels, data.guest)}
                <p class="adm-muted">купили карту вместо билета: ${data.alternative}</p>
                ${funnel('с картой · прямая запись', data.memberLabels, data.member)}
                <section class="analytics-insights"><h3>на что обратить внимание</h3>${data.insights.map(t => `<p>${esc(t)}</p>`).join('')}</section>
                <p class="analytics-coverage">Когорта: открывшие приложение за выбранный период. Шаги учитываются последовательно, до текущего момента, не дольше 7 дней после открытия. Администраторы исключены. Сбор с ${esc(time(data.captureStart))} МСК. Оплата и запись проверяются на сервере; текущие записи могут включать людей до начала сбора.</p>`;
        } catch (error) {
            if (container.isConnected && current === revision) result.innerHTML = `<p class="adm-error-inline">${esc(error.message)}</p><p class="adm-muted">данные не подменены нулями</p>`;
        } finally { if (current === revision) refresh.disabled = false; }
    }
    container.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
        period = button.dataset.period;
        container.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('is-on', b === button));
        load();
    }));
    select.addEventListener('change', () => { date = select.value; load(); });
    refresh.addEventListener('click', load);
    load();
}
