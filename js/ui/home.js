// js/ui/home.js
import { haptic, openLink, formatDateForDisplay, parseLinks, mainDiv, subtitle, tg, showConfetti } from '../utils.js';
import { state, saveBookingStatusToLocal } from '../state.js';
import { log, updateRegistrationInSheet } from '../api.js';
import { getDatabase, addParticipant, removeParticipant, setUserRegistrationStatus } from '../firebase.js';
import { SEASON_CARD_LINK, PERMANENT_CARD_LINK } from '../config.js';
import { showBottomNav, setupBottomNav, setUserInteracted, showBack, hideBack, cleanupProfileOverlays } from './common.js';
import { renderCalendar } from './calendar.js';
import { renderNewcomerPage, renderPriv, renderGuestPrivileges } from './privileges.js';
import { renderProfiles } from './profiles.js';

function updateMetricsUI() {
    const hikesEl = document.querySelector('[data-metric="hikes"]');
    const locationsEl = document.querySelector('[data-metric="locations"]');
    const kilometersEl = document.querySelector('[data-metric="kilometers"]');
    const meetingsEl = document.querySelector('[data-metric="meetings"]');
    if (hikesEl) hikesEl.textContent = state.metrics.hikes;
    if (locationsEl) locationsEl.textContent = state.metrics.locations;
    if (kilometersEl) kilometersEl.textContent = state.metrics.kilometers;
    if (meetingsEl) meetingsEl.textContent = state.metrics.meetings;
}

export function renderUserBookings(container) {
    if (!container) return;
    const today = new Date();
    today.setHours(0,0,0,0);
    const bookings = [];
    state.hikesList.forEach((hike, index) => {
        if (state.hikeBookingStatus[index]) {
            const hikeDate = new Date(hike.date);
            if (hikeDate >= today) bookings.push({ ...hike, index });
        }
    });

    if (bookings.length === 0) {
        const phrase = state.randomPhrases.length > 0 
            ? state.randomPhrases[Math.floor(Math.random() * state.randomPhrases.length)] 
            : 'смотреть 5 сезон глухаря или';
        const phraseParts = phrase.split(' или');
        const mainPart = phraseParts[0];
        const italicPart = phraseParts.length > 1 ? ' или' : '';
        container.style.display = 'block';
        container.innerHTML = `
            <div class="card-container" id="userBookingsCard">
                <h2 class="section-title">🎫 мои записи</h2>
                <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(4px);">
                    <div style="flex: 1; margin-right: 16px;">
                        <span style="color: #ffffff;">${mainPart}<em style="font-style: italic;">${italicPart}</em></span>
                    </div>
                    <button class="btn btn-yellow booking-go-btn" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0;">пойти на хайк</button>
                </div>
            </div>
        `;
        return;
    }

    container.style.display = 'block';
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    let html = `
        <div class="card-container" id="userBookingsCard">
            <h2 class="section-title">🎫 мои записи</h2>
    `;
    bookings.forEach(booking => {
        const isWoman = booking.woman === 'yes';
        const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
        const dateParts = booking.date.split('-');
        const day = parseInt(dateParts[2], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const formattedDate = `${day} ${monthNames[month]}`;
        let title = booking.title;
        const prefixes = ['тропа на ', 'тропа ', 'маршрут ', 'гора ', 'ущелье ', 'путь на ', 'восхождение на '];
        let cleanedTitle = title;
        for (let prefix of prefixes) {
            if (cleanedTitle.toLowerCase().startsWith(prefix)) {
                cleanedTitle = cleanedTitle.substring(prefix.length);
                break;
            }
        }
        if (cleanedTitle.toLowerCase().startsWith('на ')) cleanedTitle = cleanedTitle.substring(3);
        cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
        html += `
            <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(4px);">
                <div style="flex: 1; margin-right: 16px;">
                    <span style="color: ${accentColor}; font-weight: 900; font-style: italic;">${formattedDate}</span>
                    <span style="color: #ffffff; margin-left: 8px;">${cleanedTitle}</span>
                </div>
                <button class="btn btn-yellow booking-detail-btn" data-index="${booking.index}" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0; background-color: ${accentColor};">детали</button>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// Новый блок «саммари мастермайнда»
function renderMastermindSummaries() {
    const summaries = state.mastermindSummaries || [];
    const isGuest = state.userCard.status !== 'active';
    const currentYear = new Date().getFullYear();
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    let innerHtml = '';
    if (summaries.length === 0) {
        innerHtml = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(4px);">
                <div style="flex: 1;">
                    <span style="color: #ffffff;">скоро здесь появится первая запись</span>
                </div>
            </div>
        `;
    } else {
        summaries.forEach(item => {
            let formattedDate = '';
            if (item.date) {
                // Поддерживаем оба формата: "2026-04-26" и "2026-04-25T21:00:00.000Z"
                const dateStr = item.date.split('T')[0]; // берём только дату
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                    const day = parseInt(parts[2], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const year = parseInt(parts[0], 10);
                    if (year === currentYear) {
                        formattedDate = `${day} ${monthNames[month]}`;
                    } else {
                        formattedDate = `${year}.${String(month+1).padStart(2,'0')}.${String(day).padStart(2,'0')}`;
                    }
                } else {
                    formattedDate = item.date;
                }
            }
            const readBtn = isGuest 
                ? `<button class="btn btn-yellow guest-read-btn" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0;">читать</button>`
                : `<a href="${item.link}" target="_blank" class="btn btn-yellow" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0; text-decoration: none;">читать</a>`;
            innerHtml += `
                <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(4px);">
                    <div style="flex: 1; margin-right: 16px;">
                        <span style="color: var(--yellow); font-weight: 900; font-style: italic;">${formattedDate}</span>
                        <span style="color: #ffffff; margin-left: 8px;">${item.title || 'Без названия'}</span>
                    </div>
                    ${readBtn}
                </div>
            `;
        });
    }

    return `
        <div class="card-container" id="mastermindSummariesCard">
            <div class="header-with-badge" style="margin: 0 16px 16px 16px; display: flex; align-items: center;">
                <h2 class="section-title" style="margin: 0;">🧠 саммари мастермайнда</h2>
                <span class="new-badge" style="position: relative; top: -8px; margin-left: 8px;">новое</span>
            </div>
            ${innerHtml}
        </div>
    `;
}

function showGuestPopup() {
    haptic();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestPopup';
    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">💳 карта интеллигента</div>
            <div class="modal-text">как её получить? тебе нужно быть готовым к большим переменам. почему? если ты станешь частью клуба интеллигенции, твои выходные уже не будут прежними. впечатления, знакомства, юмор, свежий воздух, продуктивный отдых и привилегии в городе. это лишь малая часть того, что тебя ждёт в клубе.</div>
            <div style="text-align: center; margin-top: 20px;"><button class="btn btn-yellow" id="popupPrivilegesBtn">узнать о привилегиях</button></div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); overlay.remove(); } });
    document.getElementById('popupPrivilegesBtn')?.addEventListener('click', () => { haptic(); overlay.remove(); renderGuestPrivileges(); });
    log('guest_popup_opened', true, state.user);
}

// Блок «обновления» с плашкой
function renderUpdatesBlock() {
    const updates = state.updates || [];
    if (!updates.length) return '';

    let itemsHtml = '';
    updates.forEach(item => {
        const formattedDate = formatDateForDisplay(item.date);
        let text = parseLinks(item.update, state.userCard.status !== 'active');
        itemsHtml += `
            <div class="update-item">
                <span class="update-date">${formattedDate}</span>
                <span class="update-text">${text}</span>
            </div>
        `;
    });

    return `
        <div class="card-container updates-container">
            <div class="header-with-badge" style="margin: 0 16px 16px 16px; display: flex; align-items: center;">
                <h2 class="section-title" style="margin: 0; padding-left: 0;">📨 обновления</h2>
                <span class="new-badge" style="position: relative; top: -8px; margin-left: 8px;">новое</span>
            </div>
            <div class="updates-scroll">${itemsHtml}</div>
        </div>
    `;
}

function renderGuestHome() {
    cleanupProfileOverlays();
    subtitle().textContent = `💳 здесь будет твоя карта, ${state.user?.first_name || 'друг'}`;
    subtitle().classList.add('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();
    main.innerHTML = `
        <div class="card-container">
            <img src="https://i.postimg.cc/J0GyF5Nw/fwvsvfw.png" alt="карта заглушка" class="card-image" id="guestCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">?</span></div>
            <div id="cardAccordionGuest" class="card-accordion">
                <button class="accordion-btn btn-yellow btn-glow">оформить карту</button>
                <div class="dropdown-menu">
                    <a href="#" class="btn btn-outline" id="guestPrivilegesBtn" style="margin-bottom: 8px;">узнать о привилегиях 💳</a>
                    <div style="display: flex; gap: 8px; width: 100%; flex-wrap: nowrap;">
                        <a href="${SEASON_CARD_LINK}" class="btn btn-outline season-card-btn" style="flex: 1; margin: 0; padding: 16px 0; box-sizing: border-box; text-align: center; white-space: nowrap;">сезонная</a>
                        <a href="${PERMANENT_CARD_LINK}" class="btn btn-outline permanent-card-btn" style="flex: 1; margin: 0; padding: 16px 0; box-sizing: border-box; text-align: center; white-space: nowrap;">бессрочная</a>
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 8px; width: 100%; text-align: center; color: rgba(255,255,255,0.7); font-size: 12px;"><div style="flex: 1;">до конца 2026</div><div style="flex: 1;">все сезоны</div></div>
                    <div style="display: flex; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: #ffffff; font-size: 14px;"><div style="flex: 1;">${state.popupConfig.seasonCardPrice} ₽</div><div style="flex: 1;">${state.popupConfig.permanentCardPrice} ₽</div></div>
                </div>
            </div>
        </div>
        <div id="userBookingsContainer"></div>
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
        <div class="card-container" id="calendarContainer"></div>
        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest"><span class="newcomer-text">как всё устроено</span><img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image"></div>
        </div>
        <div class="card-container">
            <div class="metrics-header"><h2 class="metrics-title">🌍 клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" class="metrics-link dynamic-link" data-url="https://t.me/yaltahiking/148" data-guest="true">смотреть отчёты &gt;</a></div>
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${state.metrics.hikes}</div></div>
                <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${state.metrics.locations}</div></div>
                <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${state.metrics.kilometers}</div></div>
                <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${state.metrics.meetings}</div></div>
            </div>
        </div>
        ${renderUpdatesBlock()}
    `;

    document.getElementById('guestCardImage')?.addEventListener('click', () => { haptic(); showGuestPopup(); });
    document.getElementById('newcomerBtnGuest')?.addEventListener('click', () => { haptic(); setUserInteracted(); log('novichkam_click', true, state.user); renderNewcomerPage(true); });
    document.getElementById('guestPrivilegesBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); renderGuestPrivileges(); log('privilegii_click', true, state.user); });
    document.querySelectorAll('.season-card-btn, .permanent-card-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const isSeason = btn.classList.contains('season-card-btn');
            openLink(isSeason ? SEASON_CARD_LINK : PERMANENT_CARD_LINK, isSeason ? 'season_card_click' : 'permanent_card_click', true);
        });
    });

    document.getElementById('updatesIdeaLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        openLink('https://t.me/hellointelligent', 'idea_click', true);
    });

    const accordionBtn = document.querySelector('#cardAccordionGuest .accordion-btn');
    const dropdown = document.querySelector('#cardAccordionGuest .dropdown-menu');
    if (accordionBtn && dropdown) {
        accordionBtn.addEventListener('click', (e) => {
            haptic(); e.preventDefault();
            log('nav_toggle', true, state.user);
            dropdown.classList.toggle('show');
        });
    }

    // Обработчик кликов на гостевых кнопках «читать» в саммари
    document.querySelectorAll('.guest-read-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            showGuestMastermindPopup();
        });
    });

    renderUserBookings(document.getElementById('userBookingsContainer'));
    renderCalendar(document.getElementById('calendarContainer'));
    setupBottomNav();
}

function showGuestMastermindPopup() {
    haptic();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 360px;">
            <div class="modal-title">🧠 саммари мастермайнда</div>
            <div class="modal-text" style="font-size: 14px;">
                чтобы получить доступ к разделу саммари, тебе понадобится карта интеллигента. с ней в клубе можно всё: не нужно покупать билеты на хайкинг, можно получать скидки в городе, читать саммари, подключить наши три буквы и... короче, хочешь обо всём узнать?
            </div>
            <button class="btn btn-yellow" id="goToPrivilegesFromMastermindBtn" style="margin-top: 16px;">расскажите скорее</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            haptic();
            overlay.remove();
        }
    });
    document.getElementById('goToPrivilegesFromMastermindBtn').addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        overlay.remove();
        renderGuestPrivileges();
    });
}

function renderOwnerHome() {
    cleanupProfileOverlays();
    const user = state.user;
    const firstName = user?.first_name || 'друг';
    subtitle().textContent = `💳 твоя карта, ${firstName}`;
    subtitle().classList.remove('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();
    main.innerHTML = `
        <div class="card-container">
            <img src="${state.userCard.cardUrl}" alt="карта" class="card-image" id="ownerCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">${state.userCard.hikes}</span></div>
            <div style="display: flex; gap: 12px; margin: 0 16px 12px 16px;">
                <a href="#" class="btn btn-yellow" id="privBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">привилегии</a>
                <a href="#" class="btn btn-outline" id="supportBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">поддержка</a>
            </div>
        </div>
        <div id="userBookingsContainer"></div>
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
        <div class="card-container" id="calendarContainer"></div>
        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtn"><span class="newcomer-text">как всё устроено</span><img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image"></div>
        </div>
        <div class="card-container">
            <div class="metrics-header"><h2 class="metrics-title">🌍 клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" class="metrics-link dynamic-link" data-url="https://t.me/yaltahiking/148" data-guest="false">смотреть отчёты &gt;</a></div>
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${state.metrics.hikes}</div></div>
                <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${state.metrics.locations}</div></div>
                <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${state.metrics.kilometers}</div></div>
                <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${state.metrics.meetings}</div></div>
            </div>
        </div>
        ${renderUpdatesBlock()}
    `;

    document.getElementById('ownerCardImage')?.addEventListener('click', () => {
        haptic();
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        showConfetti();
        log('card_click', false, user);
    });
    document.getElementById('privBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); log('privilege_click', false, user); renderPriv(); });
    document.getElementById('supportBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/hellointelligent', 'support_click', false); });
    document.getElementById('newcomerBtn')?.addEventListener('click', () => { haptic(); setUserInteracted(); log('novichkam_click', false, user); renderNewcomerPage(false); });

    document.getElementById('updatesIdeaLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        openLink('https://t.me/hellointelligent', 'idea_click', false);
    });

    renderUserBookings(document.getElementById('userBookingsContainer'));
    renderCalendar(document.getElementById('calendarContainer'));
    setupBottomNav();
}

export function renderHome() {
    document.querySelector('.profile-edit-fab')?.remove();
    hideBack();
    if (window._floatingScrollHandler) {
        window.removeEventListener('scroll', window._floatingScrollHandler);
        window._floatingScrollHandler = null;
    }
    const existingPopup = document.getElementById('guestPopup');
    if (existingPopup) existingPopup.remove();

    if (state.userCard.status === 'loading') {
        mainDiv().innerHTML = '<div class="loader" style="display:flex; justify-content:center; padding:40px 0;">Загрузка...</div>';
        showBottomNav(false);
        return;
    }

    updateMetricsUI();

    if (state.userCard.status === 'active' && state.userCard.cardUrl) {
        renderOwnerHome();
    } else {
        renderGuestHome();
    }
}
