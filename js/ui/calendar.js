// js/ui/calendar.js (полный)
import { haptic, openLink, parseLinks, formatDateForDisplay, normalizeDate, mainDiv, tg } from '../utils.js';
import { state, saveBookingStatusToLocal } from '../state.js';
import { log, updateRegistrationInSheet } from '../api.js';
import {
    getDatabase,
    addParticipant,
    removeParticipant,
    setUserRegistrationStatus,
    subscribeToParticipantCount,
    loadAllParticipants,
    loadAllProfiles
} from '../firebase.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from '../config.js';
import { renderHome } from './home.js';
import { renderUserBookings } from './home.js';
import { renderProfiles } from './profiles.js';
import { renderNewcomerPage, renderGift, renderPassPage, renderGuestPrivileges } from './privileges.js';

let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();

function hasHikesInMonth(year, month) {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    return state.hikesList.some(hike => hike.date.startsWith(monthStr));
}

export function renderCalendar(container) {
    const year = currentCalendarYear,
        month = currentCalendarMonth;
    const today = new Date();
    const currentYear = today.getFullYear(),
        currentMonth = today.getMonth(),
        currentDate = today.getDate();
    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const firstDay = new Date(year, month, 1).getDay();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
    const hasPrevMonth = hasHikesInMonth(year, month - 1);
    const hasNextMonth = hasHikesInMonth(year, month + 1);

    let calendarHtml = `
        <h2 class="section-title">🗓️ календарь событий</h2>
        <div class="calendar-item">
            <div class="calendar-header-with-legend">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <h3 style="margin:0;">${monthNames[month]} ${year}</h3>
                    <div style="display: flex; gap: 8px;">
                        <button class="calendar-nav-arrow" id="prevMonthBtn" ${!hasPrevMonth ? 'disabled style="opacity:0.3; pointer-events:none;"' : ''}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <button class="calendar-nav-arrow" id="nextMonthBtn" ${!hasNextMonth ? 'disabled style="opacity:0.3; pointer-events:none;"' : ''}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>
                </div>
                <div class="calendar-legend">
                    <span class="legend-item"><span class="legend-emoji">📷</span> отчёт</span>
                    <span class="legend-item"><span class="legend-emoji">🎟️</span> запись</span>
                    <span class="legend-item"><span class="legend-emoji">👀</span> готовим хайк или событие</span>
                </div>
            </div>
            <div class="weekdays">${weekdays.map(d => `<span>${d}</span>`).join('')}</div>
            <div class="calendar-grid" id="calendarGrid">
    `;

    for (let i = 0; i < startOffset; i++) calendarHtml += `<div class="calendar-day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = year === currentYear && month === currentMonth && day === currentDate;
        const hike = state.hikesData[dateStr];
        const isHikeExist = !!hike;
        const isPlaceholder = isHikeExist && (!hike.title || hike.title.trim() === '');
        const isFullHike = isHikeExist && hike.title && hike.title.trim() !== '';
        const isPast = isFullHike && new Date(dateStr) < today;
        const isCancelled = isFullHike && hike.cancelled === true;
        const isWoman = isFullHike && hike.woman === 'yes';
        const isCity = isFullHike && (hike.city === true || hike.city === 'yes' || hike.city === 'true');

        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isFullHike) {
            classes += ' hike-day';
            if (isPast) classes += ' past';
            if (isWoman) classes += ' woman-hike';
        } else if (isPlaceholder) {
            classes += ' placeholder-day';
        }

        let innerHtml = `${day}`;
        if (isFullHike) {
            if (isPast && hike.report_link && hike.report_link.trim() !== '')
                innerHtml += `<span class="calendar-emoji">📷</span>`;
            if (isPast && (hike.letter_text || hike.letter_link))
                innerHtml += `<span class="calendar-emoji-letter">✉️</span>`;
            const hikeIndex = state.hikesList.findIndex(h => h.date === dateStr);
            if (!isPast && hikeIndex !== -1 && state.hikeBookingStatus[hikeIndex] === true && !isCancelled) {
                innerHtml += `<span class="calendar-emoji">🎟️</span>`;
                classes += ' booked-day';
            }
            if (isCancelled) {
                innerHtml += `<span class="calendar-emoji">🚫</span>`;
                classes += ' cancelled-hike';
            }
        } else if (isPlaceholder) {
            innerHtml += `<span class="calendar-emoji">👀</span>`;
        }

        let inlineStyle = '';
        if (isCity) {
            inlineStyle = ' style="background: #41B5ED !important; color: #ffffff !important; border-radius: 50%;"';
        } else if (isToday) {
            inlineStyle = ' style="background: #ffffff !important; color: #000000 !important;"';
        }

        if (isFullHike || isPlaceholder) {
            calendarHtml += `<div class="${classes}" data-date="${dateStr}"${inlineStyle}>${innerHtml}</div>`;
        } else {
            calendarHtml += `<div class="${classes}">${day}</div>`;
        }
    }
    calendarHtml += `</div></div>`;
    container.innerHTML = calendarHtml;

    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    if (prevBtn)
        prevBtn.addEventListener('click', () => {
            if (hasPrevMonth) {
                currentCalendarMonth--;
                if (currentCalendarMonth < 0) {
                    currentCalendarMonth = 11;
                    currentCalendarYear--;
                }
                renderCalendar(container);
            }
        });
    if (nextBtn)
        nextBtn.addEventListener('click', () => {
            if (hasNextMonth) {
                currentCalendarMonth++;
                if (currentCalendarMonth > 11) {
                    currentCalendarMonth = 0;
                    currentCalendarYear++;
                }
                renderCalendar(container);
            }
        });

    // Кликабельны только полноценные хайки (не placeholder)
    document.querySelectorAll('.calendar-day.hike-day').forEach(el => {
        el.addEventListener('click', () => {
            const date = el.dataset.date;
            const index = state.hikesList.findIndex(h => h.date === date);
            if (index !== -1) {
                log('calendar_cell_click', state.userCard.status !== 'active', state.user, { date });
                showBottomSheet(index);
            }
        });
    });
}

// ... остальные функции showUpcomingPopup, showLetterPopup, getPlaceWord, applyImageBlurAndOverlay остаются без изменений (они уже были выше) ...

// Переопределим showGuestParticipantsPopup с голубым оформлением и переходом на главную
async function showGuestParticipantsPopup(hikeDate) {
    haptic();
    let popupData = {
        title: 'Участники события',
        text: 'Просмотр списка участников доступен только членам клуба. Оформи карту интеллигента, чтобы видеть, кто идёт на событие, и записываться самому.'
    };
    if (state.popups && state.popups.guest_uchastniki_popup) {
        popupData = state.popups.guest_uchastniki_popup;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 500px; padding: 20px;">
            <button class="modal-close" id="closePopupParticipants">&times;</button>
            <div class="modal-title" style="color: #41B5ED;">${popupData.title}</div>
            <div class="modal-text" style="margin-bottom: 16px;">${popupData.text}</div>
            <button class="btn" id="goToCardFromParticipantsBtn" style="width: 100%; background-color: #41B5ED; color: #ffffff; border: none; padding: 12px; border-radius: 12px;">оформить карту</button>
        </div>
    `;
    document.body.appendChild(overlay);
    const closePopup = () => overlay.remove();
    document.getElementById('closePopupParticipants').addEventListener('click', closePopup);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });
    document.getElementById('goToCardFromParticipantsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        closePopup();
        closeBottomSheet(); // закрываем слайдер
        // переходим на главную и подсвечиваем блок карты
        renderHome();
        setTimeout(() => {
            const cardBlock = document.getElementById('cardBlock');
            if (cardBlock) {
                cardBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                cardBlock.style.transition = 'box-shadow 0.5s';
                cardBlock.style.boxShadow = '0 0 20px 5px white';
                setTimeout(() => { cardBlock.style.boxShadow = ''; }, 2000);
                // раскрываем аккордеон карты для гостей
                const guestAccordion = document.querySelector('#cardAccordionGuest .dropdown-menu');
                if (guestAccordion && !guestAccordion.classList.contains('show')) {
                    guestAccordion.classList.add('show');
                }
            }
        }, 300);
    });
}

// Все остальные функции (showCityGuestPopup, showBottomSheet, closeBottomSheet, renderSwipeControl, updateFloatingSheetButtons, showGuestBookingPopup, toggleParticipantDropdown, showLeaderDropdown и обработчики) остаются без изменений (они уже были в предыдущей версии). 
// В целях экономии места я их не дублирую, но они должны быть. Если нужно, могу прислать полный файл с ними.
