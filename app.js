// ... (весь предыдущий код до функции renderPrivilegesPage остаётся без изменений)

// ---------- Рендер страницы привилегий (с кнопками) ----------
function renderPrivilegesPage() {
    subtitleEl.textContent = `🤘🏻твои привилегии, ${firstName}`;

    // Блок 1: Привилегии в клубе
    const clubPrivileges = [
        {
            title: 'бесплатное участие',
            desc: 'один раз оформляешь карту – теперь ты не просто участник, а член клуба. математика простая: ты окупишь карту уже на шестой хайк. или раньше, с учётом скидок у партнёров. дальше все хайки для тебя бесплатны – ты в постоянном плюсе'
        },
        {
            title: 'гостевой хайк',
            desc: 'ты можешь взять с собой друга на его первый маршрут с клубом. ему не нужно будет покупать на него билет'
        },
        {
            title: 'приоритетный запрос на мастермайнд',
            desc: 'владельцы карт могут забронировать запрос на мастермайнд и на ближайшем хайке получить свежий взгляд, опыт и полезные контакты от десятка человек для своего проекта, идеи или задачи',
            button: 'забронировать запрос' // добавляем кнопку
        },
        {
            title: 'new: обход блокировок',
            desc: 'теперь ты можешь получить настройки, которые вновь вернут заблокированные ресурсы.',
            button: 'получить настройки' // добавляем кнопку
        }
    ];

    let clubHtml = '';
    clubPrivileges.forEach((p, index) => {
        clubHtml += `
            <div style="background-color: rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin: 0 16px 12px 16px; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(4px);">
                <strong style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 700; font-size: 14px;">${p.title}</strong>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.9; line-height: 1.5;">${p.desc}</p>
                ${p.button ? `
                    <a href="https://t.me/hellointelligent" target="_blank" style="display: block; background-color: #D9FD19; color: #000000; border: none; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 600; text-align: center; text-decoration: none; margin-top: 12px; width: 100%; box-sizing: border-box;">${p.button}</a>
                ` : ''}
            </div>
        `;
    });

    // Блок 2: Привилегии в городе (партнёры)
    let partnersHtml = '';
    partners.forEach(p => {
        let locationHtml = p.link 
            ? `<a href="${p.link}" target="_blank" style="color: #D9FD19; text-decoration: none;">${p.location}</a>`
            : p.location;
        
        partnersHtml += `
            <div style="background-color: rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin: 0 16px 12px 16px; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(4px);">
                <strong style="display: block; margin-bottom: 8px; color: #ffffff; font-weight: 700; font-size: 14px;">${p.name}</strong>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.9;">${p.privilege}</p>
                <p style="margin: 4px 0; font-size: 14px; opacity: 0.8;">📍 ${locationHtml}</p>
            </div>
        `;
    });

    mainContent.innerHTML = `
        <div class="card-container">
            <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 0 16px 16px 16px;">✨ твои привилегии в клубе</h2>
            ${clubHtml}
            
            <h2 style="color: #ffffff; font-size: 18px; font-weight: 700; margin: 24px 16px 16px 16px;">🏙️ твои привилегии в городе</h2>
            ${partnersHtml}
            
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                <button id="backToHomeBtn" class="btn-support" style="width: calc(100% - 32px); margin: 0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;

    document.getElementById('backToHomeBtn')?.addEventListener('click', renderHome);
}

// ... (остальной код app.js без изменений)