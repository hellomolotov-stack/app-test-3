// ----- Страница привилегий для владельцев карты (с кнопками, заголовки курсивом) -----
function renderPriv() {
    subtitle.textContent = `🤘🏻твои привилегии, ${firstName}`;
    showBack(renderHome);

    let club = [
        { t: 'бесплатное участие', d: 'один раз оформляешь карту – теперь ты член клуба. окупишь на шестом хайке. дальше бесплатно.' },
        { t: 'гостевой хайк', d: 'ты можешь взять с собой друга на его первый маршрут с клубом. ему не нужно покупать билет.' },
        { t: 'запрос на мастермайнд', d: 'владельцы карт могут забронировать запрос и на ближайшем хайке получить опыт и контакты.', btn: 'забронировать запрос' },
        { t: 'new: обход блокировок', d: 'получи настройки, которые вернут заблокированные ресурсы.', btn: 'получить настройки' }
    ];

    let clubHtml = '';
    club.forEach(c => {
        clubHtml += `<div class="partner-item"><strong>${c.t}</strong><p>${c.d}</p>${c.btn ? `<a href="https://t.me/hellointelligent" target="_blank" class="btn btn-yellow" style="margin-top:12px;">${c.btn}</a>` : ''}</div>`;
    });

    // Массив партнёров для владельцев карты (без изменений)
    let cityHtml = '';
    partners.forEach(p => {
        cityHtml += `<div class="partner-item">
            <strong>${p.name}</strong>
            <p>${p.privilege}</p>`;
        
        if (p.name === 'технологичная хайкинг-одежда Nothomme') {
            cityHtml += `<a href="${p.link}" target="_blank" class="btn btn-yellow" style="margin-top:12px;">в магазин</a>`;
        } else {
            cityHtml += `<p>📍 <a href="${p.link}" target="_blank" style="color:#D9FD19;">${p.location}</a></p>`;
        }
        
        cityHtml += `</div>`;
    });

    mainDiv.innerHTML = `
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>${cityHtml}
            <button id="goHome" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:20px 16px 0;">&lt; на главную</button>
        </div>`;
    document.getElementById('goHome')?.addEventListener('click', renderHome);
}

// ----- Страница привилегий для гостей (без кнопок, с изменённым текстом Nothomme, заголовки курсивом) -----
function renderGuestPriv() {
    subtitle.textContent = `🤘🏻привилегии, ${firstName}`;
    showBack(renderHome);

    let club = [
        { t: 'бесплатное участие', d: 'один раз оформляешь карту – теперь ты член клуба. окупишь на шестом хайке. дальше бесплатно.' },
        { t: 'гостевой хайк', d: 'ты можешь взять с собой друга на его первый маршрут с клубом. ему не нужно покупать билет.' },
        { t: 'запрос на мастермайнд', d: 'владельцы карт могут забронировать запрос и на ближайшем хайке получить опыт и контакты.' }, // без кнопки
        { t: 'new: обход блокировок', d: 'получи настройки, которые вернут заблокированные ресурсы.' } // без кнопки
    ];

    let clubHtml = '';
    club.forEach(c => {
        clubHtml += `<div class="partner-item"><strong>${c.t}</strong><p>${c.d}</p></div>`;
    });

    // Создаём копию массива partners для гостей и изменяем текст Nothomme
    const partnersGuest = partners.map(p => {
        if (p.name === 'технологичная хайкинг-одежда Nothomme') {
            return { ...p, privilege: '-7% по промокоду на сайте' };
        }
        return p;
    });

    let cityHtml = '';
    partnersGuest.forEach(p => {
        cityHtml += `<div class="partner-item">
            <strong>${p.name}</strong>
            <p>${p.privilege}</p>`;
        // Для гостей не добавляем кнопку "в магазин"
        cityHtml += `<p>📍 <a href="${p.link}" target="_blank" style="color:#D9FD19;">${p.location}</a></p>`;
        cityHtml += `</div>`;
    });

    mainDiv.innerHTML = `
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>${cityHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                <a href="https://auth.robokassa.ru/merchant/Invoice/VolsQzE1I0G-iHkIWVJ0eQ" target="_blank" class="btn btn-yellow" style="width:calc(100% - 32px); margin:0 16px;" id="guestBuyBtn">купить карту</a>
                <button id="goHome" class="btn btn-white-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>`;

    document.getElementById('goHome')?.addEventListener('click', renderHome);
    document.getElementById('guestBuyBtn')?.addEventListener('click', () => log('buy_card_click', true));
}