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

export function showBottomSheet(index) {
    if (!state.hikesList.length) return;

    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();
    const existingSheetButtons = document.querySelector('.floating-sheet-buttons');
    if (existingSheetButtons) existingSheetButtons.remove();
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'bottom-sheet-overlay';
    overlay.innerHTML = `<div class="bottom-sheet" id="hikeBottomSheet"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-content-wrapper" id="bottomSheetContent"></div></div>`;
    document.body.appendChild(overlay);

    const sheet = document.getElementById('hikeBottomSheet');
    const contentWrapper = document.getElementById('bottomSheetContent');

    const safeTop = tg?.contentSafeAreaInset?.top || 0;
    const windowHeight = window.innerHeight;
    const availableHeight = windowHeight - safeTop - 40;
    const maxHeight = availableHeight * 0.95;
    sheet.style.maxHeight = `${maxHeight}px`;
    sheet.style.height = `${maxHeight}px`;
    overlay.style.paddingTop = safeTop + 'px';

    sheetCurrentIndex = index;
    const isGuest = state.userCard.status !== 'active';
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }

    if (Object.keys(state.profiles).length === 0) {
        loadAllProfiles().then(profiles => {
            state.profiles = profiles;
        }).catch(() => {});
    }

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
            hike.tags.forEach(tag => {
                tagsHtml += `<span class="bottom-sheet-tag">${tag}</span>`;
            });
            tagsHtml += '</div>';
        }

        let sectionsHtml = '';
        if (hike.features && hike.features.trim() !== '') {
            let processedText = parseLinks(hike.features, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            let featureTagsHtml = '';
            if (hike.feature_tags && hike.feature_tags.length > 0) {
                featureTagsHtml = '<div class="feature-tags-container">';
                hike.feature_tags.forEach(tag => {
                    featureTagsHtml += `<span class="feature-tag" style="background: ${accentColor};">${tag}</span>`;
                });
                featureTagsHtml += '</div>';
            }
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">особенности</div>
                    ${featureTagsHtml}
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }
        if (hike.access && hike.access.trim() !== '') {
            let processedText = parseLinks(hike.access, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">как добраться</div>
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }
        if (hike.details && hike.details.trim() !== '') {
            let processedText = parseLinks(hike.details, isGuest);
            processedText = processedText.replace(/\n/g, '<br>');
            sectionsHtml += `
                <div class="bottom-sheet-section">
                    <div class="bottom-sheet-section-title" style="color: ${accentColor};">детали</div>
                    <div class="bottom-sheet-section-content${isWoman ? ' woman-content' : ''}">${processedText}</div>
                </div>
            `;
        }

        const hikeDate = new Date(hike.date);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const isPast = hikeDate < todayDate;

        let imageHtml = '';
        if (hike.image) {
            if (!isPast) {
                imageHtml = `
                    <div class="image-container">
                        <img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'">
                        <div class="participant-counter" id="participantCounter" data-hike-date="${hike.date}" style="color: ${accentColor};">
                            <span class="participant-text" style="color: ${accentColor};">идут</span>
                            <span class="participant-count" id="participantCountValue" style="color: ${accentColor}; display: none;">0</span>
                            <div class="participant-avatars" id="participantAvatars"></div>
                        </div>
                    </div>
                `;
            } else {
                imageHtml = `<img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'">`;
            }
        }

        let extraInfoHtml = '';
        if (!isPast) {
            extraInfoHtml = '<div class="hike-extra-info">';
            if (hike.start_time) {
                extraInfoHtml += `
                    <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </span>
                        <span><strong>начало:</strong> ${hike.start_time}</span>
                    </div>
                `;
            }
            if (hike.location_link) {
                let locationHtml = '';
                if (hike.location_link.includes('[') && hike.location_link.includes('](')) {
                    locationHtml = parseLinks(hike.location_link, isGuest);
                } else {
                    locationHtml = `<a href="#" data-url="${hike.location_link}" data-guest="${isGuest}" class="dynamic-link">открыть на карте</a>`;
                }
                extraInfoHtml += `
                    <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </span>
                        <span><strong>точка сбора:</strong> ${locationHtml}</span>
                    </div>
                `;
            }
            if (hike.leaders && hike.leaders.length) {
                const leaderLinks = hike.leaders.map(leaderUsername => {
                    const leaderData = state.leaders[leaderUsername];
                    const displayName = leaderData ? leaderData.name.split(' ')[0] : leaderUsername;
                    return `<a href="#" class="leader-name dynamic-link" data-leader-username="${leaderUsername}">${displayName}</a>`;
                });
                let leaderText = '';
                const leaderVerb = hike.leaders.length === 1 ? 'ведёт' : 'ведут';
                if (leaderLinks.length === 1) leaderText = leaderLinks[0];
                else if (leaderLinks.length === 2) leaderText = `${leaderLinks[0]} <span style="color: white;">и</span> ${leaderLinks[1]}`;
                else {
                    const last = leaderLinks.pop();
                    leaderText = `${leaderLinks.join(', ')} <span style="color: white;">и</span> ${last}`;
                }
                extraInfoHtml += `
                    <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>
                        </span>
                        <span><strong>${leaderVerb}:</strong> ${leaderText}</span>
                    </div>
                `;
            }
            extraInfoHtml += '</div>';
        }

        const prevArrow = hasPrev
            ? `<div class="bottom-sheet-nav-arrow" id="prevHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15 7 L9 12 L15 17" stroke="currentColor" stroke-width="2.2"/></svg></div>`
            : '<div class="bottom-sheet-nav-arrow hidden" id="prevHike"></div>';
        const nextArrow = hasNext
            ? `<div class="bottom-sheet-nav-arrow" id="nextHike"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 7 L15 12 L9 17" stroke="currentColor" stroke-width="2.2"/></svg></div>`
            : '<div class="bottom-sheet-nav-arrow hidden" id="nextHike"></div>';

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
            <div>${imageHtml}${extraInfoHtml}${sectionsHtml}</div>
        `;

        if (!isPast) {
            currentUnsubscribe = subscribeToParticipantCount(hike.date, (count, participants) => {
                const countEl = document.getElementById('participantCountValue');
                const avatarsEl = document.getElementById('participantAvatars');
                if (countEl) {
                    if (count === 0) {
                        countEl.style.display = 'inline';
                        countEl.textContent = count;
                    } else countEl.style.display = 'none';
                }
                if (avatarsEl) {
                    avatarsEl.innerHTML = '';
                    participants.forEach(p => {
                        const hasProfile = !!state.profiles[p.userId];
                        const img = document.createElement('img');
                        img.src = p.photoUrl || '';
                        img.className = 'participant-avatar' + (hasProfile ? ' has-profile' : '');
                        img.alt = p.name || '';
                        img.title = p.name || '';
                        img.dataset.userId = p.userId;
                        img.style.cssText = `
                            width: 28px !important;
                            height: 28px !important;
                            border-radius: 50% !important;
                            object-fit: cover !important;
                        `;
                        img.onerror = function () {
                            const placeholder = document.createElement('div');
                            placeholder.className = 'participant-avatar placeholder' + (hasProfile ? ' has-profile' : '');
                            placeholder.style.cssText = `
                                width: 28px !important;
                                height: 28px !important;
                                border-radius: 50% !important;
                                background-color: #40a7e3 !important;
                                display: flex !important;
                                align-items: center !important;
                                justify-content: center !important;
                                font-weight: bold !important;
                                font-size: 14px !important;
                                color: white !important;
                                text-transform: uppercase !important;
                            `;
                            const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                            placeholder.textContent = initial;
                            placeholder.dataset.userId = p.userId;
                            this.parentNode.replaceChild(placeholder, this);
                        };
                        avatarsEl.appendChild(img);
                    });
                }
            });
        }

        updateFloatingSheetButtons();

        document.getElementById('prevHike')?.addEventListener('click', e => {
            e.stopPropagation();
            if (sheetCurrentIndex > 0) {
                closeParticipantDropdown();
                closeLeaderDropdown();
                sheetCurrentIndex--;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
                log('slider_prev', false, state.user);
            }
        });
        document.getElementById('nextHike')?.addEventListener('click', e => {
            e.stopPropagation();
            if (sheetCurrentIndex < state.hikesList.length - 1) {
                closeParticipantDropdown();
                closeLeaderDropdown();
                sheetCurrentIndex++;
                updateContent();
                contentWrapper.scrollTop = 0;
                haptic();
                log('slider_next', false, state.user);
            }
        });
    }

    updateContent();

    function removeFloatingSheetButtons() {
        const btn = document.querySelector('.floating-sheet-buttons');
        if (btn) btn.remove();
    }

    function createFloatingButtons() {
        removeFloatingSheetButtons();
        const container = document.createElement('div');
        container.className = 'floating-sheet-buttons';
        container.id = 'floatingSheetButtons';
        document.body.appendChild(container);
        updateFloatingSheetButtons();
    }
    createFloatingButtons();

    function checkScroll() {
        const container = document.querySelector('.floating-sheet-buttons');
        if (!container) return;
        const scrollTop = contentWrapper.scrollTop;
        const scrollHeight = contentWrapper.scrollHeight;
        const clientHeight = contentWrapper.clientHeight;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 0) return;
        const scrollPercentage = (scrollTop / maxScroll) * 100;
        if (scrollPercentage > 95) container.classList.add('hidden');
        else container.classList.remove('hidden');
    }

    if (sheetScrollListener) contentWrapper.removeEventListener('scroll', sheetScrollListener);
    sheetScrollListener = checkScroll;
    contentWrapper.addEventListener('scroll', sheetScrollListener);

    setTimeout(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    }, 20);

    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeBottomSheet();
    });

    const onTouchStart = e => {
        const target = e.target;
        const isInteractive =
            target.closest('.bottom-sheet-nav-arrow') ||
            target.closest('a') ||
            target.closest('.btn') ||
            target.closest('.swipe-track') ||
            target.closest('.bottom-sheet-handle');
        if (isInteractive) {
            isDragging = false;
            return;
        }
        dragStartY = e.touches[0].clientY;
        isDragging = true;
        sheet.classList.add('dragging');
    };
    const onTouchMove = e => {
        if (!isDragging) return;
        if (contentWrapper.scrollTop > 0) {
            isDragging = false;
            sheet.classList.remove('dragging');
            return;
        }
        const deltaY = e.touches[0].clientY - dragStartY;
        if (deltaY > 0) {
            e.preventDefault();
            sheet.style.transform = `translateY(${deltaY}px)`;
        } else {
            isDragging = false;
            sheet.classList.remove('dragging');
        }
    };
    const onTouchEnd = e => {
        if (!isDragging) return;
        isDragging = false;
        sheet.classList.remove('dragging');
        const deltaY = e.changedTouches[0].clientY - dragStartY;
        if (deltaY > 80) closeBottomSheet();
        else sheet.style.transform = '';
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: false });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: false });
    sheet.addEventListener('touchcancel', onTouchEnd, { passive: false });

    log('slider_haikov_opened', false, state.user);
}

function closeBottomSheet() {
    closeParticipantDropdown();
    closeLeaderDropdown();
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }
    const overlay = document.querySelector('.bottom-sheet-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        const sheet = document.getElementById('hikeBottomSheet');
        if (sheet) sheet.classList.remove('visible');
        document.body.style.overflow = '';
        const sheetButtons = document.querySelector('.floating-sheet-buttons');
        if (sheetButtons) sheetButtons.remove();
        if (sheetScrollListener) {
            const contentWrapper = document.getElementById('bottomSheetContent');
            if (contentWrapper) contentWrapper.removeEventListener('scroll', sheetScrollListener);
            sheetScrollListener = null;
        }
        setTimeout(() => overlay.remove(), 300);
    }
}

const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function renderSwipeControl({ isBooked, isGuest, hike, accentColor }) {
    if (!isTouchDevice()) return null;

    const thumbText = isBooked 
        ? (hike.woman === 'yes' ? 'ты записана' : 'ты записан')
        : 'иду';

    const hintTextBooked = '← потяни влево, для отмены';
    const hintTextUnbooked = '→ потяни, чтобы записаться';

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

    const TEXT_PADDING = 12; // отступ текста от краёв трека

    if (isBooked) {
        hint.style.left = TEXT_PADDING + 'px';
        hint.style.right = 'auto';
        hint.style.textAlign = 'left';
        hint.textContent = hintTextBooked;
    } else {
        hint.style.right = TEXT_PADDING + 'px';
        hint.style.left = 'auto';
        hint.style.textAlign = 'right';
        hint.textContent = hintTextUnbooked;
    }

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
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
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

    function initPosition() {
        maxLeft = track.clientWidth - thumb.offsetWidth - THUMB_MARGIN;
        if (isBooked) {
            thumb.style.left = maxLeft + 'px';
            thumbLeft = maxLeft;
        } else {
            thumb.style.left = THUMB_MARGIN + 'px';
            thumbLeft = THUMB_MARGIN;
        }
    }
    setTimeout(initPosition, 20);

    const onStart = (clientX) => {
        if (completed) return;
        startX = clientX;
        isDown = true;
        thumb.style.transition = 'none';
        maxLeft = track.clientWidth - thumb.offsetWidth - THUMB_MARGIN;
        thumbLeft = parseFloat(thumb.style.left) || THUMB_MARGIN;
    };

    const onMove = (clientX) => {
        if (!isDown || completed) return;
        const delta = clientX - startX;
        let newLeft = thumbLeft + delta;
        newLeft = Math.max(THUMB_MARGIN, Math.min(newLeft, maxLeft));
        thumb.style.left = newLeft + 'px';

        if (isBooked && delta < 0) tg?.HapticFeedback?.impactOccurred('light');

        if (!isBooked && newLeft >= maxLeft * 0.95) {
            if (isGuest) {
                isDown = false;
                thumb.style.transition = 'left 0.2s ease-out';
                thumb.style.left = maxLeft + 'px';
                showGuestBookingPopup(hike.date, hike.title, () => {
                    completed = false;
                    thumb.style.transition = 'left 0.3s ease-out, width 0.25s ease';
                    currentThumbWidth = minThumbWidth;
                    thumb.style.width = currentThumbWidth + 'px';
                    thumb.style.left = THUMB_MARGIN + 'px';
                    thumb.textContent = 'иду';
                    thumb.style.fontWeight = '700';
                    thumb.style.fontStyle = 'normal';
                    // возвращаем подсказку для незаписанного состояния
                    hint.textContent = hintTextUnbooked;
                    hint.style.right = TEXT_PADDING + 'px';
                    hint.style.left = 'auto';
                    hint.style.textAlign = 'right';
                });
                return;
            }
            // владелец карты – запись
            completed = true;
            isDown = false;
            const newText = hike.woman === 'yes' ? 'ты записана' : 'ты записан';
            const newWidth = Math.max(minThumbWidth, ctx.measureText(newText).width + THUMB_PADDING * 2);
            currentThumbWidth = newWidth;
            thumb.style.transition = 'left 0.2s ease-out, width 0.25s ease';
            thumb.style.width = currentThumbWidth + 'px';
            thumb.style.left = maxLeft + 'px';
            thumb.textContent = newText;
            thumb.style.fontWeight = '900';
            thumb.style.fontStyle = 'italic';
            // переключаем подсказку для записанного состояния
            hint.textContent = hintTextBooked;
            hint.style.left = TEXT_PADDING + 'px';
            hint.style.right = 'auto';
            hint.style.textAlign = 'left';
            isBooked = true;
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
        thumb.style.width = currentThumbWidth + 'px';
        if (isBooked) {
            thumb.style.left = maxLeft + 'px';
            thumbLeft = maxLeft;
        } else {
            thumb.style.left = THUMB_MARGIN + 'px';
            thumbLeft = THUMB_MARGIN;
        }
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

    // ПК (мышь) — старые кнопки
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

    // Владелец карты
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

    document.getElementById('closePopup').addEventListener('click', () => {
        haptic();
        overlay.remove();
        if (onClose) onClose();
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            haptic();
            overlay.remove();
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
                overlay.remove();
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
