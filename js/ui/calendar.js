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

function renderSwipeControl({ isBooked, isGuest, hike, accentColor }) {
    if (!isTouchDevice()) return null;

    const thumbText = isBooked 
        ? (hike.woman === 'yes' ? 'ты записана' : 'ты записан')
        : 'иду';

    const hintTextBooked = 'сдвинь для отмены ‹';
    const hintTextUnbooked = '› сдвинь, чтобы записаться';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '700 italic 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const thumbTextWidth = ctx.measureText(thumbText).width;
    const minThumbWidth = 80;
    const THUMB_PADDING = 18;
    let currentThumbWidth = isBooked ? Math.max(minThumbWidth, thumbTextWidth + THUMB_PADDING * 2) : minThumbWidth;

    const trackWidth = Math.min(400, Math.max(280, 
        (isBooked ? ctx.measureText(hintTextBooked).width : ctx.measureText(hintTextUnbooked).width) + currentThumbWidth + 64));

    const track = document.createElement('div');
    track.className = 'swipe-track';
    track.style.cssText = `
        width: ${trackWidth}px;
        margin: 0 auto;
        padding: 0 12px;
        box-sizing: border-box;
        height: 56px;
        border-radius: 40px;
        background: rgba(73, 138, 176, 0.15);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.2);
        position: relative;
        overflow: hidden;
        user-select: none;
        touch-action: none;
        -webkit-user-select: none;
        pointer-events: auto;
        z-index: 20;
    `;

    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.style.cssText = `
        position: absolute;
        top: 0; bottom: 0;
        display: flex; align-items: center;
        font-size: 14px; font-weight: 500;
        color: rgba(255,255,255,0.7);
        pointer-events: none;
        white-space: nowrap;
        overflow: hidden;
        z-index: 1;
    `;

    const thumb = document.createElement('div');
    thumb.className = 'swipe-thumb';
    thumb.style.cssText = `
        position: absolute;
        top: 50%; transform: translateY(-50%);
        height: 40px;
        border-radius: 40px;
        background: ${accentColor};
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; font-weight: 700;
        color: #000;
        transition: left 0.2s ease-out, width 0.25s ease;
        z-index: 2;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        width: ${currentThumbWidth}px;
    `;
    thumb.textContent = thumbText;
    if (isBooked) {
        thumb.style.fontWeight = '900';
        thumb.style.fontStyle = 'italic';
    } else {
        thumb.style.fontWeight = '700';
        thumb.style.fontStyle = 'normal';
    }

    track.appendChild(hint);
    track.appendChild(thumb);

    let startX = 0, thumbLeft = 0, maxLeft = 0, isDown = false, completed = false;
    const THUMB_MARGIN = 8;
    const EDGE_PADDING = 30;
    const GAP_BETWEEN = 0;

    function placeHint(thumbLeftPos) {
        const trackW = track.clientWidth;
        const thumbW = thumb.offsetWidth;

        if (!isBooked) {
            const availableLeft = thumbLeftPos + thumbW + GAP_BETWEEN;
            const availableRight = trackW - EDGE_PADDING;
            const hintWidth = Math.max(0, availableRight - availableLeft);
            hint.style.left = availableLeft + 'px';
            hint.style.right = 'auto';
            hint.style.width = hintWidth + 'px';
            hint.style.justifyContent = 'flex-end';
            hint.textContent = hintTextUnbooked;
        } else {
            const availableRight = thumbLeftPos - GAP_BETWEEN;
            const availableLeft = EDGE_PADDING;
            const hintWidth = Math.max(0, availableRight - availableLeft);
            hint.style.left = availableLeft + 'px';
            hint.style.right = 'auto';
            hint.style.width = hintWidth + 'px';
            hint.style.justifyContent = 'flex-start';
            hint.textContent = hintTextBooked;
        }
    }

    function initPosition() {
        maxLeft = track.clientWidth - thumb.offsetWidth - THUMB_MARGIN;
        if (isBooked) {
            thumb.style.left = maxLeft + 'px';
            thumbLeft = maxLeft;
        } else {
            thumb.style.left = THUMB_MARGIN + 'px';
            thumbLeft = THUMB_MARGIN;
        }
        placeHint(thumbLeft);
    }
    setTimeout(initPosition, 20);

    const onStart = (clientX) => {
        if (completed) return;
        startX = clientX;
        isDown = true;
        thumb.style.transition = 'none';
        hint.style.transition = 'none';
        maxLeft = track.clientWidth - thumb.offsetWidth - THUMB_MARGIN;
        thumbLeft = parseFloat(thumb.style.left) || THUMB_MARGIN;
    };

    const onMove = (clientX) => {
        if (!isDown || completed) return;
        const delta = clientX - startX;
        let newLeft = thumbLeft + delta;
        newLeft = Math.max(THUMB_MARGIN, Math.min(newLeft, maxLeft));
        thumb.style.left = newLeft + 'px';
        placeHint(newLeft);

        if (isBooked && delta < 0) tg?.HapticFeedback?.impactOccurred('light');

        if (!isBooked && newLeft >= maxLeft * 0.95) {
            if (isGuest) {
                isDown = false;
                thumb.style.transition = 'left 0.2s ease-out';
                hint.style.transition = 'left 0.2s ease-out, width 0.2s ease-out';
                thumb.style.left = maxLeft + 'px';
                placeHint(maxLeft);
                showGuestBookingPopup(hike.date, hike.title, () => {
                    completed = false;
                    thumb.style.transition = 'left 0.3s ease-out, width 0.25s ease';
                    hint.style.transition = 'left 0.3s ease-out, width 0.3s ease-out';
                    currentThumbWidth = minThumbWidth;
                    thumb.style.width = currentThumbWidth + 'px';
                    thumb.style.left = THUMB_MARGIN + 'px';
                    thumb.textContent = 'иду';
                    thumb.style.fontWeight = '700';
                    thumb.style.fontStyle = 'normal';
                    placeHint(THUMB_MARGIN);
                });
                return;
            }
            completed = true;
            isDown = false;
            const newText = hike.woman === 'yes' ? 'ты записана' : 'ты записан';
            const newWidth = Math.max(minThumbWidth, ctx.measureText(newText).width + THUMB_PADDING * 2);
            currentThumbWidth = newWidth;
            thumb.style.transition = 'left 0.2s ease-out, width 0.25s ease';
            hint.style.transition = 'left 0.2s ease-out, width 0.2s ease-out';
            thumb.style.width = currentThumbWidth + 'px';
            thumb.style.left = maxLeft + 'px';
            thumb.textContent = newText;
            thumb.style.fontWeight = '900';
            thumb.style.fontStyle = 'italic';
            isBooked = true;
            placeHint(maxLeft);
            tg?.HapticFeedback?.impactOccurred('heavy');
            setTimeout(() => tg?.HapticFeedback?.impactOccurred('heavy'), 70);

            const hikeDate = hike.date;
            const hikeTitle = hike.title;
            const userId = state.user?.id;
            setUserRegistrationStatus(userId, hikeDate, true)
                .then(() => {
                    state.hikeBookingStatus[sheetCurrentIndex] = true;
                    return addParticipant(hikeDate, userId, {
                        first_name: state.user?.first_name,
                        photo_url: state.user?.photo_url,
                    });
                })
                .then(() => {
                    updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'card_holder', state.user, true);
                    updateFloatingSheetButtons();
                    renderUserBookings(document.getElementById('userBookingsContainer'));
                    const cal = document.getElementById('calendarContainer');
                    if (cal) renderCalendar(cal);
                })
                .catch(error => {
                    console.error(error);
                    updateFloatingSheetButtons();
                });
            log('idut_click', false, state.user);
        }
    };

    const onEnd = () => {
        if (!isDown) return;
        isDown = false;
        if (completed) return;

        const currentLeft = parseFloat(thumb.style.left) || THUMB_MARGIN;
        if (isBooked && currentLeft <= THUMB_MARGIN + 10) {
            const hikeDate = hike.date;
            const hikeTitle = hike.title;
            const userId = state.user?.id;
            if (isGuest) {
                removeParticipant(hikeDate, userId)
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        saveBookingStatusToLocal();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, false);
                        updateFloatingSheetButtons();
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            } else {
                Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)])
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        updateFloatingSheetButtons();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, true);
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            }
            return;
        }

        thumb.style.transition = 'left 0.2s ease-out, width 0.25s ease';
        hint.style.transition = 'left 0.2s ease-out, width 0.2s ease-out';
        thumb.style.width = currentThumbWidth + 'px';
        if (isBooked) {
            thumb.style.left = maxLeft + 'px';
            thumbLeft = maxLeft;
        } else {
            thumb.style.left = THUMB_MARGIN + 'px';
            thumbLeft = THUMB_MARGIN;
        }
        placeHint(thumbLeft);
    };

    track.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onStart(e.touches[0].clientX);
    }, { passive: false });

    track.addEventListener('touchmove', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onMove(e.touches[0].clientX);
    }, { passive: false });

    track.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onEnd();
    }, { passive: false });

    return track;
}

function updateFloatingSheetButtons() {
    const container = document.querySelector('.floating-sheet-buttons');
    if (!container) return;
    const hike = state.hikesList[sheetCurrentIndex];
    if (!hike) return;

    const isWoman = hike.woman === 'yes';
    const accentColor = isWoman ? '#FB5EB0' : '#D9FD19';
    const isBooked = state.hikeBookingStatus[sheetCurrentIndex] || false;
    const hikeDate = new Date(hike.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = hikeDate < today;
    const isGuest = state.userCard.status !== 'active';

    container.innerHTML = '';

    if (isPast) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const completedBtn = document.createElement('a');
        completedBtn.href = '#';
        completedBtn.className = 'btn btn-outline';
        completedBtn.textContent = 'хайк завершен';
        completedBtn.style.pointerEvents = 'none';
        row.appendChild(completedBtn);

        if (hike.report_link && hike.report_link.trim() !== '') {
            const reportBtn = document.createElement('a');
            reportBtn.href = '#';
            reportBtn.className = 'btn btn-yellow';
            if (isWoman) reportBtn.style.backgroundColor = '#FB5EB0';
            reportBtn.textContent = 'отчёт';
            reportBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                haptic();
                const url = hike.report_link.trim();
                if (url) openLink(url, 'report_click', state.userCard.status !== 'active');
                return false;
            });
            row.appendChild(reportBtn);
        }
        container.appendChild(row);
        container.style.pointerEvents = 'none';
        return;
    }

    const swipeControl = renderSwipeControl({ isBooked, isGuest, hike, accentColor });
    if (swipeControl) {
        container.appendChild(swipeControl);
        container.style.pointerEvents = 'auto';
        return;
    }

    container.style.pointerEvents = 'auto';
    if (isBooked) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'btn btn-outline';
        cancelBtn.textContent = 'отменить';
        cancelBtn.addEventListener('click', e => {
            e.preventDefault();
            const userId = state.user?.id;
            const hikeDate = hike.date;
            const hikeTitle = hike.title;
            if (isGuest) {
                removeParticipant(hikeDate, userId)
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        saveBookingStatusToLocal();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, false);
                        updateFloatingSheetButtons();
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            } else {
                Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)])
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        updateFloatingSheetButtons();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, true);
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                    });
            }
            log('cancel_click', false, state.user);
        });
        row.appendChild(cancelBtn);

        const goBtn = document.createElement('a');
        goBtn.href = '#';
        goBtn.className = 'btn btn-yellow';
        goBtn.textContent = 'ты записан';
        goBtn.style.pointerEvents = 'none';
        row.appendChild(goBtn);
        container.appendChild(row);
        return;
    }

    if (isGuest) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const questionBtn = document.createElement('a');
        questionBtn.href = '#';
        questionBtn.className = 'btn btn-outline';
        questionBtn.textContent = 'задать вопрос';
        questionBtn.addEventListener('click', e => {
            e.preventDefault();
            openLink('https://t.me/hellointelligent', 'question_click', true);
        });
        row.appendChild(questionBtn);

        const goBtn = document.createElement('a');
        goBtn.href = '#';
        goBtn.className = 'btn btn-yellow btn-glow';
        goBtn.textContent = 'иду';
        goBtn.addEventListener('click', e => {
            e.preventDefault();
            showGuestBookingPopup(hike.date, hike.title);
        });
        row.appendChild(goBtn);
        container.appendChild(row);
        return;
    }

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '12px';
    row.style.justifyContent = 'center';
    row.style.width = '100%';

    const goBtn = document.createElement('a');
    goBtn.href = '#';
    goBtn.className = 'btn btn-yellow btn-glow';
    goBtn.textContent = 'иду';
    goBtn.addEventListener('click', e => {
        e.preventDefault();
        const userId = state.user?.id;
        const hikeDate = hike.date;
        const hikeTitle = hike.title;
        setUserRegistrationStatus(userId, hikeDate, true)
            .then(() => {
                state.hikeBookingStatus[sheetCurrentIndex] = true;
                return addParticipant(hikeDate, userId, {
                    first_name: state.user?.first_name,
                    photo_url: state.user?.photo_url,
                });
            })
            .then(() => {
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'card_holder', state.user, true);
                updateFloatingSheetButtons();
                renderUserBookings(document.getElementById('userBookingsContainer'));
                const cal = document.getElementById('calendarContainer');
                if (cal) renderCalendar(cal);
            })
            .catch(error => {
                console.error(error);
                updateFloatingSheetButtons();
            });
        log('idut_click', false, state.user);
    });
    row.appendChild(goBtn);
    container.appendChild(row);
}

function showGuestBookingPopup(hikeDate, hikeTitle, onClose) {
    haptic();
    const bookingPopup = (state.popups && state.popups.guest_booking_popup) || null;
    const config = state.popupConfig;

    const popupText = bookingPopup ? bookingPopup.text : config.text;
    const popupTitle = bookingPopup ? bookingPopup.title : 'регистрация на хайк';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestBookingPopup';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 500px; padding: 20px;">
            <button class="modal-close" id="closePopup">&times;</button>
            <div class="modal-title">${popupTitle}</div>
            <div class="modal-text" style="margin-bottom: 20px;">${popupText}</div>
            <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                <button class="btn btn-yellow" id="buyTicketBtn" style="width: 100%; margin: 0;">купить билет 🎟️ · ${config.ticketPrice} ₽</button>
                <div id="cardAccordionPopup" style="width: 100%;">
                    <button class="btn btn-outline" id="showCardOptionsBtn" style="width: 100%; margin: 0; box-sizing: border-box;">оформить карту 💳</button>
                    <div id="cardOptions" style="display: none; margin-top: 12px;">
                        <div style="display: flex; flex-direction: row; gap: 8px; width: 100%;">
                            <button class="btn btn-outline" id="buySeasonCardBtn" style="flex: 1; margin: 0; box-sizing: border-box;">сезонная</button>
                            <button class="btn btn-outline" id="buyPermanentCardBtn" style="flex: 1; margin: 0; box-sizing: border-box;">бессрочная</button>
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: rgba(255,255,255,0.7); font-size: 12px;">
                            <div style="flex: 1;">до конца 2026</div>
                            <div style="flex: 1;">все сезоны</div>
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: #ffffff; font-size: 14px;">
                            <div style="flex: 1;">${config.seasonCardPrice} ₽</div>
                            <div style="flex: 1;">${config.permanentCardPrice} ₽</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const closePopup = () => {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    };

    document.getElementById('closePopup').addEventListener('click', () => {
        haptic();
        closePopup();
        if (onClose) onClose();
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            haptic();
            closePopup();
            if (onClose) onClose();
        }
    });

    const handlePurchase = (purchaseType, link) => {
        const userId = state.user?.id;
        addParticipant(hikeDate, userId, {
            first_name: state.user?.first_name,
            photo_url: state.user?.photo_url,
        })
            .then(() => setUserRegistrationStatus(userId, hikeDate, true))
            .then(() => {
                const hikeIndex = state.hikesList.findIndex(h => h.date === hikeDate);
                if (hikeIndex !== -1) state.hikeBookingStatus[hikeIndex] = true;
                if (state.userCard.status !== 'active') saveBookingStatusToLocal();
                updateFloatingSheetButtons();
                renderUserBookings(document.getElementById('userBookingsContainer'));
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer) renderCalendar(calendarContainer);
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', purchaseType, state.user, false);
                openLink(link, `purchase_${purchaseType}`, true);
                closePopup();
            })
            .catch(error => {
                console.error(error);
                alert('Ошибка при регистрации. Попробуйте ещё раз.');
            });
    };

    document.getElementById('buyTicketBtn').addEventListener('click', e => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        handlePurchase('ticket', config.ticketLink || ROBOKASSA_LINK);
    });

    const showCardOptionsBtn = document.getElementById('showCardOptionsBtn');
    const cardOptions = document.getElementById('cardOptions');
    showCardOptionsBtn.addEventListener('click', e => {
        e.preventDefault();
        haptic();
        if (cardOptions.style.display === 'none' || cardOptions.style.display === '')
            cardOptions.style.display = 'block';
        else cardOptions.style.display = 'none';
    });

    document.getElementById('buySeasonCardBtn').addEventListener('click', e => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        handlePurchase('season_card', config.seasonCardLink || SEASON_CARD_LINK);
    });

    document.getElementById('buyPermanentCardBtn').addEventListener('click', e => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        handlePurchase('permanent_card', config.permanentCardLink || PERMANENT_CARD_LINK);
    });
}

let currentDropdownHikeDate = null;
export function closeParticipantDropdown() {
    const existing = document.querySelector('.participant-dropdown.show');
    if (existing) {
        existing.remove();
        currentDropdownHikeDate = null;
    }
}

export async function toggleParticipantDropdown(counterElement, hikeDate) {
    const existing = document.querySelector('.participant-dropdown.show');
    if (existing && currentDropdownHikeDate === hikeDate) {
        closeParticipantDropdown();
        return;
    }
    closeParticipantDropdown();
    haptic();

    if (Object.keys(state.profiles).length === 0) {
        try {
            const profiles = await loadAllProfiles();
            state.profiles = profiles;
        } catch (e) {
            console.error('Failed to load profiles', e);
        }
    }

    const participants = await loadAllParticipants(hikeDate);
    const dropdown = document.createElement('div');
    dropdown.className = 'participant-dropdown';
    dropdown.style.maxHeight = '250px';
    dropdown.style.overflowY = 'auto';

    dropdown.addEventListener('wheel', (e) => e.stopPropagation());
    dropdown.addEventListener('touchstart', (e) => e.stopPropagation());
    dropdown.addEventListener('touchmove', (e) => e.stopPropagation());

    if (participants.length === 0) {
        dropdown.innerHTML = '<div class="participant-dropdown-item" style="justify-content:center;">Пока никого нет</div>';
    } else {
        participants.forEach(p => {
            const name = p.name || 'Участник';
            const hasProfile = !!state.profiles[p.userId];
            const item = document.createElement('div');
            item.className = 'participant-dropdown-item';
            item.dataset.userId = p.userId;
            if (hasProfile) {
                item.classList.add('clickable-profile');
                item.style.cursor = 'pointer';
            }

            if (p.photoUrl) {
                item.innerHTML = `<img src="${p.photoUrl}" class="participant-dropdown-avatar${hasProfile ? ' has-profile' : ''}" alt="${name}" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'participant-dropdown-avatar placeholder${hasProfile ? ' has-profile' : ''}\'>${name.charAt(0).toUpperCase()}</div>';">`;
            } else {
                item.innerHTML = `<div class="participant-dropdown-avatar placeholder${hasProfile ? ' has-profile' : ''}">${name.charAt(0).toUpperCase()}</div>`;
            }
            const nameSpan = document.createElement('span');
            nameSpan.className = 'participant-dropdown-name';
            nameSpan.textContent = name;
            item.appendChild(nameSpan);

            if (hasProfile) {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeParticipantDropdown();
                    closeBottomSheet();
                    state.pendingProfileClick = {
                        userId: p.userId,
                        name: name,
                        photoUrl: p.photoUrl || null
                    };
                    renderProfiles();
                    setTimeout(() => {
                        const profileCard = document.querySelector(`.profile-card[data-user-id="${p.userId}"]`);
                        if (profileCard) {
                            profileCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            profileCard.classList.add('highlight-pulse');
                            setTimeout(() => profileCard.classList.remove('highlight-pulse'), 2000);
                        }
                    }, 500);
                });
            }

            dropdown.appendChild(item);
        });
    }

    const container = counterElement.closest('.bottom-sheet-content-wrapper') || document.body;
    const containerRect = container.getBoundingClientRect();
    const elementRect = counterElement.getBoundingClientRect();
    const top = elementRect.bottom - containerRect.top + container.scrollTop;
    const right = containerRect.right - elementRect.right;

    dropdown.style.position = 'absolute';
    dropdown.style.top = top + 'px';
    dropdown.style.right = right + 'px';
    dropdown.style.width = counterElement.offsetWidth + 'px';
    dropdown.style.zIndex = '1001';
    container.appendChild(dropdown);

    setTimeout(() => dropdown.classList.add('show'), 10);
    currentDropdownHikeDate = hikeDate;

    const closeHandler = e => {
        if (!dropdown.contains(e.target) && e.target !== counterElement) {
            closeParticipantDropdown();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    log('uchastniki_click', state.userCard.status !== 'active', state.user);
}

let currentLeaderDropdown = null;
export function closeLeaderDropdown() {
    if (currentLeaderDropdown) {
        currentLeaderDropdown.remove();
        currentLeaderDropdown = null;
    }
}

export function showLeaderDropdown(leaderElement, leaderData) {
    closeLeaderDropdown();
    const dropdown = document.createElement('div');
    dropdown.className = 'participant-dropdown';
    dropdown.style.width = '300px';
    dropdown.style.position = 'fixed';
    dropdown.style.top = '50%';
    dropdown.style.left = '50%';
    dropdown.style.transform = 'translate(-50%, -50%)';
    dropdown.style.zIndex = '9999';
    dropdown.style.backgroundColor = 'rgba(0,0,0,0.9)';
    dropdown.style.border = '1px solid rgba(255,255,255,0.2)';
    dropdown.style.borderRadius = '28px';
    dropdown.style.padding = '20px 0 12px 0';

    const photoUrl = leaderData.username ? `https://t.me/i/userpic/320/${leaderData.username}.jpg` : null;
    const avatarHtml = photoUrl
        ? `<img src="${photoUrl}" class="participant-dropdown-avatar" alt="${leaderData.name}" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'participant-dropdown-avatar placeholder\'>${leaderData.name.charAt(0).toUpperCase()}</div>';">`
        : `<div class="participant-dropdown-avatar placeholder">${leaderData.name.charAt(0).toUpperCase()}</div>`;

    const contactHtml = leaderData.username
        ? `<a href="#" data-url="https://t.me/${leaderData.username}" data-guest="false" class="dynamic-link" style="color: var(--yellow); text-decoration: none;">@${leaderData.username}</a>`
        : '';

    dropdown.innerHTML = `
        <div style="position: relative; padding: 0 20px;"><button class="leader-close-btn" style="position: absolute; top: -12px; right: 12px; background: none; border: none; color: #aaa; font-size: 28px; cursor: pointer; z-index: 10000; line-height: 1;">&times;</button></div>
        <div style="display: flex; flex-direction: column; gap: 12px; padding: 0 20px 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">${avatarHtml}<span style="font-weight: 600; color: white;">${leaderData.name}</span></div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.9);">${leaderData.bio || ''}</div>
            <div style="font-size: 14px;">${contactHtml}</div>
        </div>
    `;
    document.body.appendChild(dropdown);
    setTimeout(() => dropdown.classList.add('show'), 10);

    const closeBtn = dropdown.querySelector('.leader-close-btn');
    if (closeBtn)
        closeBtn.addEventListener('click', e => {
            e.stopPropagation();
            closeLeaderDropdown();
        });

    currentLeaderDropdown = dropdown;
    const closeHandler = e => {
        if (!dropdown.contains(e.target) && e.target !== leaderElement) {
            closeLeaderDropdown();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

document.addEventListener('click', function(e) {
    const link = e.target.closest('.dynamic-link, .nav-popup a, .btn-newcomer, .accordion-btn, .bottom-sheet-nav-arrow, .btn, .participant-counter, .booking-detail-btn, .bookings-calendar-link, .booking-go-btn, .leader-name, .popup-link, .profile-hike-link, .profile-contact-btn');
    if (!link) return;
// Добавить в начало:
if (link.dataset.processing === 'true') return;   // ← новая защита
link.dataset.processing = 'true';
setTimeout(() => { delete link.dataset.processing; }, 400);
    if (link.classList.contains('profile-contact-btn')) {
        e.preventDefault();
        haptic();
        const action = link.dataset.action;
        if (action === 'chat') {
            const username = link.dataset.username;
            if (username) {
                const cleanUsername = username.replace(/^@/, '');
                if (tg && tg.openTelegramLink) tg.openTelegramLink(`https://t.me/${cleanUsername}`);
                else openLink(`https://t.me/${cleanUsername}`, 'profile_chat_click', false);
            }
        } else if (action === 'link') {
            let url = link.dataset.url;
            if (url) {
                if (!url.match(/^https?:\/\//i)) url = 'https://' + url;
                openLink(url, 'profile_link_click', false);
            }
        }
        return;
    }

    if (link.classList.contains('profile-hike-link')) {
        e.preventDefault();
        haptic();
        const hikeDate = link.dataset.hikeDate;
        if (hikeDate) {
            log('profile_hike_click', state.userCard.status !== 'active', state.user, { hikeDate });
            const index = state.hikesList.findIndex(h => h.date === hikeDate);
            if (index !== -1) showBottomSheet(index);
        }
        return;
    }

    if (link.classList.contains('leader-name')) {
        e.preventDefault(); e.stopPropagation();
        const username = link.dataset.leaderUsername;
        if (username) {
            haptic(); closeLeaderDropdown();
            if (state.leaders[username]) showLeaderDropdown(link, state.leaders[username]);
            else openLink(`https://t.me/${username}`, 'leader_click', state.userCard.status !== 'active');
            log('leader_click', state.userCard.status !== 'active', state.user);
        }
        return;
    }
    if (link.classList.contains('popup-link')) {
        e.preventDefault(); e.stopPropagation(); haptic();
        const url = link.dataset.url;
        if (url && url.trim() !== '') openLink(url, 'popup_link_click', state.userCard.status !== 'active');
        return;
    }
    if (link.classList.contains('dynamic-link')) {
        e.preventDefault();
        const url = link.dataset.url;
        const isGuest = link.dataset.guest === 'true';
        openLink(url, 'link_click', isGuest);
        return;
    }
    if (link.closest('.nav-popup')) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href && href !== '#') {
            if (link.id === 'popupNewcomer') { const isGuest = state.userCard.status !== 'active'; renderNewcomerPage(isGuest); }
            else if (link.id === 'popupGift') { const isGuest = state.userCard.status !== 'active'; renderGift(isGuest); }
            else if (link.id === 'popupPass') { const isGuest = state.userCard.status !== 'active'; renderPassPage(isGuest); }
            else if (link.id === 'popupQuestion') { const isGuest = state.userCard.status !== 'active'; openLink('https://t.me/hellointelligent', 'question_click', isGuest); }
            else openLink(href, 'nav_popup_click', false);
        }
        return;
    }
    if (link.classList.contains('btn-newcomer')) {
        e.preventDefault(); haptic();
        const isGuest = link.id === 'newcomerBtnGuest';
        renderNewcomerPage(isGuest);
        return;
    }
   if (link.classList.contains('participant-counter')) {
    e.preventDefault(); e.stopPropagation();
    const hikeDate = link.dataset.hikeDate;
    if (!hikeDate) return;
    const index = state.hikesList.findIndex(h => h.date === hikeDate);
    const hike = state.hikesList[index];
    const isWoman = hike && hike.woman === 'yes';
    const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
    if (state.userCard.status !== 'active') {
        const popupData = (state.popups && state.popups.guest_uchastniki_popup) || {
            title: 'недоступно',
            text: 'чтобы просматривать участников, нужна карта интеллигента. с ней ты сможешь видеть, кто идёт на хайк, даже если не записан на него',
            button_text: 'понятно'
        };
        const msg = document.createElement('div');
        msg.className = 'modal-overlay';
        msg.innerHTML = `
            <div class="modal-content" style="max-width: 300px;">
                <div class="modal-title" style="color: ${accentColor};">${popupData.title}</div>
                <div class="modal-text">${popupData.text}</div>
                <div class="modal-buttons" style="margin-top: 20px;">
                    <button class="btn" style="background-color: ${accentColor}; color: #000000; width: 100%; margin: 0; padding: 12px; border-radius: 12px; font-weight: 600; border: none; cursor: pointer;">${popupData.button_text}</button>
                </div>
            </div>
        `;
        document.body.appendChild(msg);
        const closeBtn = msg.querySelector('.btn');
        closeBtn.addEventListener('click', () => msg.remove());
        setTimeout(() => { msg.addEventListener('click', (e) => { if (e.target === msg) msg.remove(); }); }, 0);
        log('uchastniki_no_card', true, state.user);
    } else {
        toggleParticipantDropdown(link, hikeDate);
    }
    return;
}
    if (link.classList.contains('booking-detail-btn')) {
        e.preventDefault();
        const index = link.dataset.index;
        if (index !== undefined) {
            log('booking_detail_click', state.userCard.status !== 'active', state.user, { index });
            showBottomSheet(parseInt(index));
        }
        return;
    }
    if (link.classList.contains('booking-go-btn')) {
        e.preventDefault(); haptic();
        log('random_phrase_click', state.userCard.status !== 'active', state.user);
        document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    if (link.classList.contains('bookings-calendar-link')) {
        e.preventDefault(); haptic();
        log('moi_zapisi_kalendar_click', state.userCard.status !== 'active', state.user);
        document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
});
