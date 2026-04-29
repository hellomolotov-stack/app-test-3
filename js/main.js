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
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        summaries.forEach(item => {
            let formattedDate = '';
            if (item.date) {
                // item.date – строка ISO или просто дата. Убираем время и парсим как локальную дату
                const parts = item.date.split('T')[0].split('-');
                if (parts.length === 3) {
                    const day = parseInt(parts[2], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    formattedDate = `${day} ${monthNames[month]}`;
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
            <div class="header-with-badge" style="margin: 0 16px 16px 16px; display: flex; align-items: flex-start;">
                <h2 class="section-title" style="margin: 0;">🧠 саммари мастермайнда</h2>
                <span class="new-badge">новое</span>
            </div>
            ${innerHtml}
        </div>
    `;
}

// ... остальные функции (showGuestPopup, renderUpdatesBlock, renderGuestHome, renderOwnerHome, renderHome) без изменений ...
// (полный код был приведён ранее, я опускаю дублирование, вы можете взять последний полный файл home.js)
// Важно: в renderHome() добавить обработчик для диплинка summary не нужно – это делается в main.js
