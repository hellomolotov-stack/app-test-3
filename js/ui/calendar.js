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
                    <span class="legend-item"><span class="legend-emoji">✉️</span> – письмо</span>
                </div>
            </div>
            <div class="weekdays">${weekdays.map(d => `<span>${d}</span>`).join('')}</div>
            <div class="calendar-grid" id="calendarGrid">
    `;

    for (let i = 0; i < startOffset; i++) calendarHtml += `<div class="calendar-day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = year === currentYear && month === currentMonth && day === currentDate;
        const hasHike = state.hikesData[dateStr] ? true : false;
        const isPast = new Date(dateStr) < today;
        let classes = 'calendar-day';
        if (isToday) classes += ' today';
        if (hasHike) {
            classes += ' hike-day';
            if (isPast) classes += ' past';
        }
        let innerHtml = `${day}`;
        if (hasHike) {
            const hikeIndex = state.hikesList.findIndex(h => h.date === dateStr);
            const hike = state.hikesList[hikeIndex];
            const isWoman = hike && hike.woman === 'yes';
            if (isWoman) classes += ' woman-hike';
            if (isPast && hike && hike.report_link && hike.report_link.trim() !== '')
                innerHtml += `<span class="calendar-emoji">📷</span>`;
            if (isPast && hike && (hike.letter_text || hike.letter_link))
                innerHtml += `<span class="calendar-emoji-letter">✉️</span>`;
            if (!isPast && hikeIndex !== -1 && state.hikeBookingStatus[hikeIndex] === true) {
                innerHtml += `<span class="calendar-emoji">🎟️</span>`;
                classes += ' booked-day';
            }
        }
        if (hasHike) calendarHtml += `<div class="${classes}" data-date="${dateStr}">${innerHtml}</div>`;
        else calendarHtml += `<div class="${classes}">${day}</div>`;
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

let sheetCurrentIndex = 0;
let sheetScrollListener = null;
let dragStartY = 0;
let isDragging = false;
let currentUnsubscribe = null;

function showLetterPopup(letterText, letterLink, isGuest) {
    const overlayPopup = document.createElement('div');
    overlayPopup.className = 'letter-popup';
    const processedText = parseLinks(letterText, isGuest);
    const chatHtml = letterLink ? `<p style="margin-top: 16px;"><a href="${letterLink}" class="dynamic-link" data-url="${letterLink}" data-guest="false" style="color: var(--yellow); text-decoration: underline;">открыть письмо в чате</a></p>` : '';
    overlayPopup.innerHTML = `
        <div class="letter-popup-content">
            <div class="letter-popup-header">
                <div class="letter-popup-title">✉️ письмо Макса после хайка</div>
                <button class="letter-popup-close">&times;</button>
            </div>
            <div class="letter-popup-text">${processedText}${chatHtml}</div>
        </div>
    `;
    document.body.appendChild(overlayPopup);
    const closeBtn = overlayPopup.querySelector('.letter-popup-close');
    closeBtn.addEventListener('click', () => { haptic(); overlayPopup.remove(); });
    overlayPopup.addEventListener('click', (e) => { if (e.target === overlayPopup) { haptic(); overlayPopup.remove(); } });
}

// НОВЫЙ ДВУХЭТАПНЫЙ СЛАЙДЕР
export function showBottomSheet(index) {
    if (!state.hikesList.length) return;

    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();
    const existingHalf = document.querySelector('.half-image-container');
    if (existingHalf) existingHalf.remove();
    const existingSheetButtons = document.querySelector('.floating-sheet-buttons');
    if (existingSheetButtons) existingSheetButtons.remove();
    const existingLetter = document.querySelector('.letter-icon');
    if (existingLetter) existingLetter.remove();

    document.body.style.overflow = 'hidden';

    const hike = state.hikesList[index];
    sheetCurrentIndex = index;
    const isGuest = state.userCard.status !== 'active';
    const isPast = new Date(hike.date) < new Date().setHours(0,0,0,0);

    // Контейнер с полуизображением
    const halfContainer = document.createElement('div');
    halfContainer.className = 'half-image-container';
    const imageUrl = hike.half_image || hike.image || '';
    if (imageUrl) {
        halfContainer.innerHTML = `<img src="${imageUrl}" class="half-image" onerror="this.style.display='none'">`;
    }
    document.body.appendChild(halfContainer);
    setTimeout(() => halfContainer.classList.add('visible'), 20);

    // Overlay и слайдер
    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `<div class="bottom-sheet" id="hikeBottomSheet"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-content-wrapper" id="bottomSheetContent"></div></div>`;
    document.body.appendChild(overlay);
    const sheet = document.getElementById('hikeBottomSheet');
    const contentWrapper = document.getElementById('bottomSheetContent');

    const safeTop = tg?.contentSafeAreaInset?.top || 0;
    const windowHeight = window.innerHeight;
    const halfHeight = windowHeight * 0.5;
    const fullHeight = windowHeight - safeTop - 40;

    sheet.style.maxHeight = `${fullHeight}px`;
    sheet.style.height = `${halfHeight}px`;
    sheet.style.transform = 'translateY(0)';
    overlay.classList.add('visible');
    sheet.classList.add('visible');

    let mode = 'half'; // half | full

    function updateContent() {
        const hike = state.hikesList[sheetCurrentIndex];
        if (!hike) return;
        const isWoman = hike.woman === 'yes';
        const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
        const monthNamesArr = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        let formattedDate = '';
        if (hike.date) {
            const parts = hike.date.split('-');
            if (parts.length === 3) {
                const day = parseInt(parts[2], 10);
                const month = parseInt(parts[1], 10) - 1;
                formattedDate = `${day} ${monthNamesArr[month]}`;
            } else formattedDate = hike.date;
        }

        const hasPrev = sheetCurrentIndex > 0;
        const hasNext = sheetCurrentIndex < state.hikesList.length - 1;

        let tagsHtml = '';
        if (hike.tags && hike.tags.length > 0) {
            tagsHtml = '<div class="bottom-sheet-tags">';
            hike.tags.forEach(tag => { tagsHtml += `<span class="bottom-sheet-tag">${tag}</span>`; });
            tagsHtml += '</div>';
        }

        let sectionsHtml = '';
        if (hike.features && hike.features.trim() !== '') {
            let processedText = parseLinks(hike.features, isGuest).replace(/\n/g, '<br>');
            sectionsHtml += `<div class="bottom-sheet-section"><div class="bottom-sheet-section-title" style="color: ${accentColor};">особенности</div><div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div></div>`;
        }
        if (hike.access && hike.access.trim() !== '') {
            let processedText = parseLinks(hike.access, isGuest).replace(/\n/g, '<br>');
            sectionsHtml += `<div class="bottom-sheet-section"><div class="bottom-sheet-section-title" style="color: ${accentColor};">как добраться</div><div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div></div>`;
        }
        if (hike.details && hike.details.trim() !== '') {
            let processedText = parseLinks(hike.details, isGuest).replace(/\n/g, '<br>');
            sectionsHtml += `<div class="bottom-sheet-section"><div class="bottom-sheet-section-title" style="color: ${accentColor};">детали</div><div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div></div>`;
        }

        const hikeDate = new Date(hike.date);
        const todayDate = new Date(); todayDate.setHours(0,0,0,0);
        const isPast = hikeDate < todayDate;

        const prevArrow = hasPrev ? `<div class="bottom-sheet-nav-arrow" id="prevHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 7 L9 12 L15 17" stroke="currentColor" stroke-width="2.2"/></svg></div>` : '<div class="bottom-sheet-nav-arrow hidden" id="prevHike"></div>';
        const nextArrow = hasNext ? `<div class="bottom-sheet-nav-arrow" id="nextHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 7 L15 12 L9 17" stroke="currentColor" stroke-width="2.2"/></svg></div>` : '<div class="bottom-sheet-nav-arrow hidden" id="nextHike"></div>';

        contentWrapper.innerHTML = `
            <div class="bottom-sheet-header-block">
                <div class="bottom-sheet-header">
                    <div class="bottom-sheet-header-left">
                        <div class="bottom-sheet-header-date" style="color: ${accentColor};">${formattedDate}</div>
                        <div class="bottom-sheet-header-title">${hike.title}</div>
                    </div>
                    <div class="bottom-sheet-nav">${prevArrow}${nextArrow}</div>
                </div>
                ${tagsHtml}
            </div>
            <div>${sectionsHtml}</div>
        `;

        // Управление стрелками
        document.getElementById('prevHike')?.addEventListener('click', e => {
            e.stopPropagation();
            if (sheetCurrentIndex > 0) {
                sheetCurrentIndex--;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
            }
        });
        document.getElementById('nextHike')?.addEventListener('click', e => {
            e.stopPropagation();
            if (sheetCurrentIndex < state.hikesList.length - 1) {
                sheetCurrentIndex++;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
            }
        });
    }

    updateContent();

    // Жесты
    const sheetEl = sheet;
    let initialY = 0, currentMode = 'half', transitioning = false;

    function setMode(newMode, animate = true) {
        if (!sheetEl || transitioning) return;
        transitioning = true;
        if (animate) sheetEl.style.transition = 'height 0.3s ease, transform 0.3s ease';
        else sheetEl.style.transition = 'none';

        if (newMode === 'full') {
            sheetEl.style.height = `${fullHeight}px`;
            sheetEl.style.transform = 'translateY(0)';
            if (halfContainer) halfContainer.style.transform = 'translateY(-100%)';
            updateFloatingSheetButtons();
            // письмо/конверт добавим в full
            const hike = state.hikesList[sheetCurrentIndex];
            if (hike && new Date(hike.date) < new Date().setHours(0,0,0,0) && (hike.letter_text || hike.letter_link)) {
                const oldIcon = document.querySelector('.letter-icon');
                if (oldIcon) oldIcon.remove();
                const letterIcon = document.createElement('div');
                letterIcon.className = 'letter-icon';
                letterIcon.innerHTML = `<img src="https://i.postimg.cc/Wb9Lc15K/mail-envelop-on-transparent-background-png-png-2.webp" class="letter-icon-img" alt="письмо">`;
                letterIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showLetterPopup(hike.letter_text || '', hike.letter_link || '', isGuest);
                });
                document.getElementById('hikeBottomSheet').appendChild(letterIcon);
            }
        } else if (newMode === 'half') {
            sheetEl.style.height = `${halfHeight}px`;
            sheetEl.style.transform = 'translateY(0)';
            if (halfContainer) halfContainer.style.transform = 'translateY(0)';
            document.querySelector('.floating-sheet-buttons')?.remove();
            document.querySelector('.letter-icon')?.remove();
        } else if (newMode === 'closed') {
            closeBottomSheet();
            return;
        }
        currentMode = newMode;
        setTimeout(() => { transitioning = false; }, 300);
    }

    sheetEl.addEventListener('touchstart', (e) => {
        initialY = e.touches[0].clientY;
        sheetEl.style.transition = 'none';
    }, { passive: true });

    sheetEl.addEventListener('touchmove', (e) => {
        const deltaY = e.touches[0].clientY - initialY;
        if (currentMode === 'half' && deltaY < -30) {
            setMode('full');
        } else if (currentMode === 'full' && deltaY > 50) {
            setMode('half');
        }
    }, { passive: true });

    sheetEl.addEventListener('touchend', (e) => {
        sheetEl.style.transition = 'height 0.3s ease, transform 0.3s ease';
    });

    // Свайп вниз по наполовину открытому слайдеру – закрыть
    overlay.addEventListener('click', (e) => {
        if (currentMode === 'half' || currentMode === 'full') {
            closeBottomSheet();
        }
    });

    // Инициализация кнопок только для full
    window.updateFloatingSheetButtons = updateFloatingSheetButtons;
    window.updateFloatingSheetButtons(); // при первом открытии не вызываем, только при переходе в full
}

function closeBottomSheet() {
    const overlay = document.querySelector('.bottom-sheet-overlay');
    const half = document.querySelector('.half-image-container');
    if (overlay) overlay.classList.remove('visible');
    if (half) half.classList.remove('visible');
    document.body.style.overflow = '';
    setTimeout(() => {
        overlay?.remove();
        half?.remove();
        document.querySelector('.floating-sheet-buttons')?.remove();
        document.querySelector('.letter-icon')?.remove();
    }, 300);
}

// Остальной код (renderSwipeControl, updateFloatingSheetButtons, showGuestBookingPopup) – без изменений
// ... (вставьте их из предыдущего полного calendar.js)
