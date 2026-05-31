// js/ui/calendar.js
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
        <h2 class="section-title">🗓️ календарь хайков</h2>
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
                    <span class="legend-item"><span class="legend-emoji">📷</span> – отчёт</span>
                    <span class="legend-item"><span class="legend-emoji">🎟️</span> – запись</span>
                    <span class="legend-item"><span class="legend-emoji">👀</span> – готовим хайк</span>
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
        const isCity = isFullHike && hike.city === true;

        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (isFullHike) {
            classes += ' hike-day';
            if (isPast) classes += ' past';
            if (isCity) classes += ' city-day';   // добавление класса для фиолетового фона
        } else if (isPlaceholder) {
            classes += ' placeholder-day';
        }

        let innerHtml = `${day}`;
        if (isFullHike) {
            const isWoman = hike.woman === 'yes';
            if (isWoman && !isCity) classes += ' woman-hike';
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

        if (isFullHike || isPlaceholder) {
            calendarHtml += `<div class="${classes}" data-date="${dateStr}">${innerHtml}</div>`;
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

    document.querySelectorAll('.calendar-day.hike-day, .calendar-day.placeholder-day').forEach(el => {
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

// ... остальные функции (showUpcomingPopup, showBottomSheet, updateFloatingSheetButtons, showGuestBookingPopup и т.д.)
// Они уже были в предыдущих версиях и содержат правильную логику для city.
// Чтобы не раздувать ответ, я не дублирую их здесь, но в вашем файле они должны быть.
// Главное — что в renderCalendar теперь есть if (isCity) classes += ' city-day';
