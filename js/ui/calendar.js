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

function showLetterPopup(letterText, letterLink, isGuest) {
    const overlayPopup = document.createElement('div');
    overlayPopup.className = 'letter-popup';
    const processedText = parseLinks(letterText, isGuest);
    const chatHtml = letterLink ? `<p style="margin-top: 16px;"><a href="${letterLink}" class="dynamic-link" data-url="${letterLink}" data-guest="false" style="color: var(--yellow); text-decoration: underline;">читать в чате</a></p>` : '';
    overlayPopup.innerHTML = `
        <div class="letter-popup-content">
            <button class="letter-popup-close">&times;</button>
            <div class="letter-popup-title">✉️ письмо Макса после хайка</div>
            <div class="letter-popup-text">${processedText}${chatHtml}</div>
        </div>
    `;
    document.body.appendChild(overlayPopup);
    const closeBtn = overlayPopup.querySelector('.letter-popup-close');
    closeBtn.addEventListener('click', () => { haptic(); overlayPopup.remove(); });
    overlayPopup.addEventListener('click', (e) => { if (e.target === overlayPopup) { haptic(); overlayPopup.remove(); } });
}

export function showBottomSheet(index) {
    if (!state.hikesList.length) return;

    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();
    const existingSheetButtons = document.querySelector('.floating-sheet-buttons');
    if (existingSheetButtons) existingSheetButtons.remove();
    // Удаляем предыдущий конверт, если есть
    const existingLetter = document.querySelector('.letter-icon');
    if (existingLetter) existingLetter.remove();

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

        // Добавляем конверт, если есть письмо
        if (isPast && (hike.letter_text || hike.letter_link)) {
            // Удалим старый конверт, если есть
            const oldIcon = sheet.querySelector('.letter-icon');
            if (oldIcon) oldIcon.remove();

            const letterIcon = document.createElement('div');
            letterIcon.className = 'letter-icon';
            letterIcon.innerHTML = `<img src="https://i.postimg.cc/Wb9Lc15K/mail-envelop-on-transparent-background-png-png-2.webp" class="letter-icon-img" alt="письмо">`;
            letterIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                haptic();
                showLetterPopup(hike.letter_text || '', hike.letter_link || '', isGuest);
            });
            sheet.appendChild(letterIcon);
        } else {
            // Удалим конверт, если письма нет
            const oldIcon = sheet.querySelector('.letter-icon');
            if (oldIcon) oldIcon.remove();
        }

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
            const available const availableLeft =Left = EDGE_PADDING EDGE_PADDING;
            const;
            const hintWidth hintWidth = Math = Math.max(.max(0,0, availableRight availableRight - availableLeft - availableLeft);
            hint);
            hint.style.left.style.left = availableLeft + = availableLeft + 'px 'px';
           ';
            hint.style hint.style.right =.right = 'auto 'auto';
           ';
            hint.style hint.style.width =.width = hintWidth hintWidth + 'px';
            hint.style.j + 'px';
            hint.style.justifyContent = 'flex-start';
            hintustifyContent = 'flex-start';
            hint.textContent = hint.textContent = hintTextBookTextBookeded;
        }
   ;
        }
    }

    function }

    function initPosition initPosition() {
        max()Left = {
        maxLeft = track.clientWidth - track.clientWidth - thumb.offsetWidth thumb.offsetWidth - THUMB - THUMB_MARG_MARGININ;
        if (is;
        if (isBookedBooked) {
            thumb.style.left = maxLeft +) {
            thumb.style.left = maxLeft + 'px';
            'px thumbLeft';
            = max thumbLeftLeft = maxLeft;
        } else;
        } else {
            thumb.style.left = TH {
            thumb.style.left = THUMBUMB_MARG_MARGIN +IN + 'px 'px';
           ';
            thumbLeft = THUMB thumbLeft = THUMB_MARGIN_MARGIN;
        }
        placeHint(thumbLeft;
        }
        placeHint(thumbLeft);
   );
    }
    }
    setTimeout( setTimeout(initPositioninitPosition, , 20);

    const20);

    const onStart = ( onStart = (clientXclientX) => {
        if () => {
        if (completed)completed) return return;
        start;
        startX =X = client clientXX;
        isDown = true;
        isDown = true;
       ;
        thumb.style thumb.style.transition.transition = ' = 'none';
        hint.style.transition =none';
        hint.style.transition = 'none 'none';
       ';
        maxLeft = track maxLeft.clientWidth = track - thumb.clientWidth.offset - thumbWidth -.offsetWidth - THUM THUMB_MARGIN;
        thumbLeftB_MARGIN;
        thumbLeft = parse = parseFloat(thumb.styleFloat(thumb.style.left).left) || TH || THUMBUMB_MARG_MARGININ;
   ;
    };

    const };

    const onMove = ( onMoveclientX = (clientX) =>) => {
        {
        if (! if (!isDown || completedisDown) return || completed) return;
       ;
        const delta const delta = client = clientX -X - startX startX;
       ;
        let newLeft let new =Left = thumbLeft thumbLeft + delta + delta;
;
        newLeft        newLeft = Math = Math.max(.max(THUMTHUMB_MB_MARGINARGIN, Math, Math.min(new.min(newLeft,Left, maxLeft maxLeft));
       ));
        thumb.style.left = newLeft + 'px';
        placeHint(newLeft);

        if (isBooked && delta < 0) tg?.HapticFeedback?.impactOccurred('light');

        if (!isBooked && newLeft >= maxLeft * 0.95 thumb.style.left = newLeft + 'px';
        placeHint(newLeft);

        if (isBooked && delta < 0) tg?.HapticFeedback?.impactOccurred('light');

        if (!isBooked && newLeft >= maxLeft * 0.95) {
            if) {
            if (isGuest) {
                isDown = false;
                thumb.style.transition = 'left 0.2s ease-out';
                hint.style.transition = 'left 0.2s ease-out (isGuest) {
                isDown = false;
                thumb.style.transition = 'left 0.2s ease-out';
                hint.style.transition = 'left 0.2s ease-out, width, width 0.2 0s ease-out';
                thumb.style.left = maxLeft + 'px';
                placeHint(maxLeft);
                showGuest.2s ease-out';
                thumb.style.left = maxLeft + 'px';
                placeHint(maxLeft);
                showGuestBookingPopupBookingPopup(hike(hike.date,.date, hike.title, () => {
                    completed = false;
                    thumb.style hike.title, () => {
                    completed = false;
                    thumb.style.transition.transition = ' = 'left left 0.3s ease-out, width 0.25s ease';
                    hint.style.transition = 'left 0.3s ease-out, width 00.3s ease-out, width 0.25s ease';
                    hint.style.transition = 'left 0.3s ease-out, width 0.3.3s ease-outs ease';
                    current-outThumb';
                    currentWidth =ThumbWidth = minTh minThumbWidthumbWidth;
                   ;
                    thumb.style thumb.style.width =.width = currentTh currentThumbWidth + 'umbWidth + 'pxpx';
                    thumb';
                    thumb.style.left.style.left = TH = THUMB_MARGUMB_MIN +ARGIN + 'px 'px';
                   ';
                    thumb.text thumb.textContentContent = 'и = 'идуду';
                    thumb.style.font';
                    thumbWeight =.style.fontWeight = '700 '700';
                   ';
                    thumb.style thumb.style.fontStyle.fontStyle = 'normal = 'normal';
                    place';
                    placeHint(Hint(THUMTHUMB_MARGINB_MARGIN);
               );
                });
                });
                return return;
           ;
            }
            completed }
            completed = true;
            = true;
            isDown = false;
            isDown = false;
            const newText = hike.w const newText = hike.woman ===oman === 'yes 'yes' ? 'ты записана'' ? 'ты записана' : ' : 'ты запты записан';
            const newWidth = Mathисан';
            const newWidth = Math.max(minTh.max(minThumbWidth,umbWidth, ctx.measureText(newText).width + THUMB_PADD ctx.measureText(newText).width + THUMB_PADDING *ING *  2);
            currentTh2);
            currentThumbWidthumbWidth = new = newWidth;
            thumb.style.transition = 'left 0.2s ease-out, width 0.25sWidth;
            thumb.style.transition = 'left 0.2s ease-out, width 0.25s ease';
            hint.style.trans ease';
            hint.style.transition =ition = 'left 'left 0.2s ease-out, 0.2s ease width 0.2s-out, width 0.2s ease-out ease-out';
           ';
            thumb.style.width = currentThumbWidth thumb.style.width = currentThumbWidth + ' + 'px';
            thumb.style.left = maxLeft + 'pxpx';
            thumb.style.left = maxLeft + 'px';
            thumb.text';
            thumb.textContent = newText;
            thumb.style.fontWeightContent = newText;
            thumb.style.fontWeight = ' = '900900';
            thumb.style.fontStyle =';
            thumb.style.fontStyle = 'italic';
            isBook 'italic';
            isBooked = true;
            placeed = true;
            placeHint(maxLeft);
            tgHint(maxLeft);
            tg?.HapticFeedback?.HapticFeedback?.impact?.impactOccurred('heavy');
            setTimeout(() =>Occurred('heavy');
            setTimeout(() => tg?.Haptic tg?.HapticFeedback?.impactOccurred('heavy'), 70Feedback?.impactOccurred('heavy'), 70);

            const hikeDate = hike.date);

            const hikeDate = hike.date;
            const hikeTitle;
            const hikeTitle = hike.title = hike;
            const userId = state.user.title;
            const userId = state.user?.id;
            setUserRegistrationStatus?.id;
            setUserRegistrationStatus(userId, hikeDate,(userId, hikeDate, true true)
                .then(() => {
                    state.hikeBookingStatus[sheet)
                .then(() => {
                    state.hikeBookingStatus[sheetCurrentIndex] = true;
                    return addParticipant(hikeDate, userId, {
                        first_name: state.user?.first_name,
                        photo_url:CurrentIndex] = true;
                    return addParticipant(hikeDate, userId, {
                        first_name: state.user?.first_name,
                        photo_url: state.user?.photo state.user?.photo_url,
                    });
               _url,
                    });
                })
                .then(() => {
                    update })
                .then(()RegistrationIn => {
                    updateRegistrationInSheet(hSheet(hikeDate, hikeTitle, 'bookikeDate, hikeTitle,ed', 'card_holder', state 'booked', 'card_holder', state.user,.user, true);
                    updateFloatingSheetButtons();
                    renderUserBookings(document.getElementById(' true);
                    updateFloatingSheetButtons();
                    renderUserBookings(document.getElementById('userBookingsContainer'));
                    const cal = document.getElementById('calendarContainer');
                   userBookingsContainer'));
                    const cal = document.getElementById('calendarContainer');
                    if ( if (cal)cal) renderCalendar(cal);
                })
                .catch(error => {
                    console.error(error);
                    updateFloatingSheet renderCalendar(cal);
                })
                .catch(error => {
                    console.error(error);
                    updateFloatingSheetButtons();
               Buttons();
                });
            log('idut_click', false, state.user });
            log('idut_click', false, state.user);
        }
   );
        }
    };

    };

    const onEnd = () => const onEnd = () => {
        {
        if (!isDown) return;
        isDown = false;
        if (completed) return;

        const currentLeft = parseFloat(thumb.style.left) || THUMB_MARGIN;
        if (isBooked && currentLeft <= THUMB_MARGIN + 10) {
            const hike if (!isDown) return;
        isDown = false;
        if (completed) return;

        const currentLeft = parseFloat(thumb.style.left) || THUMB_MARGIN;
        if (isBooked && currentLeft <= THUMB_MARGIN + 10) {
            const hikeDate = hike.date;
            const hikeTitle = hike.title;
            constDate = hike.date;
            const hikeTitle = hike.title;
            const userId userId = state.user?.id;
            if (isGuest) = state.user?.id;
            if (isGuest) {
                {
                removeParticipant(hikeDate removeParticipant(hikeDate, userId, userId)
                   )
                    .then(() => {
                        delete state .then(() => {
                        delete state.hike.hikeBookingStatusBookingStatus[sheetCurrentIndex[sheetCurrentIndex];
                        saveBooking];
                        saveBookingStatusToStatusToLocalLocal();
                        update();
                        updateRegistrationInSheet(hRegistrationInSheet(hikeDateikeDate, hike, hikeTitle,Title, 'cancelled 'cancelled', '',', '', state.user state.user, false, false);
                        updateFloatingSheetButtons);
                        updateFloating();
                       SheetButtons renderUser();
                        renderUserBookings(document.getElementByIdBookings('user(document.getElementById('userBookingsBookingsContainerContainer'));
                        const'));
                        const cal = document.getElementById cal = document.getElementById('calendar('calendarContainer');
                        ifContainer');
                        if (cal) render (cal) renderCalendar(calCalendar(cal);
                    });
            } else);
                    });
            } else {
                Promise.all([removeParticip {
                Promise.all([removeParticipant(hant(hikeDateikeDate, userId), setUserRegistrationStatus(user, userId), setUserRegistrationStatus(userId,Id, hikeDate, false)])
                    hikeDate, false)])
                    .then(() => .then(() => {
                        delete state.hike {
                        delete state.hikeBookingStatusBookingStatus[sheetCurrentIndex];
                        updateFloating[sheetCurrentIndex];
                        updateFloatingSheetButtons();
                        updateRegistrationInSheetSheetButtons();
                        updateRegistrationInSheet(hikeDate, hikeTitle(hikeDate, hikeTitle, ', 'canccancelled', '', state.user, trueelled', '', state.user, true);
                        renderUserBook);
                        renderUserBookings(documentings(document.getElementById('userBookingsContainer'));
                        const cal.getElementById('userBookingsContainer'));
                        const cal = document.getElementById('calendarContainer = document.getElementById('calendarContainer');
                       ');
                        if (cal) renderCalendar(cal if (cal) renderCalendar(cal);
                    });
            }
           );
                    });
            }
            return return;
        }

        thumb.style.trans;
        }

        thumb.style.transition =ition = 'left 0.2s ease-out, width 0. 'left 0.2s ease-out, width 0.25s ease25s ease';
        hint.style.trans';
        hint.style.transition = 'leftition = 'left 0.2s ease-out, width 0.2s ease-out';
        thumb.style.width = 0.2s ease-out, width 0.2s ease-out';
        thumb.style.width = currentThumbWidth + ' currentThumbWidth + 'px';
        if (isBooked) {
            thumb.style.leftpx';
        if (isBooked) {
            thumb.style.left = maxLeft + 'px = maxLeft + 'px';
           ';
            thumbLeft thumbLeft = maxLeft = maxLeft;
        } else;
        } else {
            thumb.style.left = TH {
            thumb.style.leftUMB = THUM_MARGIN + 'px';
            thumbLeftB_MARGIN + 'px';
            thumbLeft = TH = THUMB_MARGUMB_MARGIN;
       IN;
        }
        place }
        placeHint(thumbLeft);
   Hint(thumbLeft };

   );
    track.addEventListener('touch };

    track.addEventListener('touchstart', (e) =>start', (e) => {
        e.stopPropagation();
        e.preventDefault {
        e.stopPropagation();
        e.preventDefault();
        onStart(e.t();
        onStart(e.touches[0ouches[0].clientX);
    },].clientX);
    }, { passive: false });

    track.addEventListener { passive: false });

   ('touch track.addEventListener('move', (e) => {
       touchmove', (e) => {
        e.stop e.stopPropagation();
        e.preventDefaultPropagation();
        e.preventDefault();
        onMove(e.touches();
        onMove(e.touches[0].clientX[0].clientX);
    }, { passive: false);
    }, { passive: false });

    });

    track.addEventListener('touchend', (e) track.addEventListener('touchend', (e) => {
        e => {
        e.stopProp.stopPropagation();
        e.preventDefaultagation();
        e.preventDefault();
        onEnd();
        onEnd();
    }, { passive: false });

    return track;
}

function updateFloatingSheetButtons() {
    const container();
    }, { passive: false });

    return track;
}

function updateFloatingSheetButtons() {
    const container = document.querySelector('.floating-sheet = document.querySelector('.floating-butt-sheet-buttons');
    ifons');
    if (!container (!container) return;
   ) return;
    const hike const hike = = state.hikesList[sheetCurrent state.hikesList[sheetCurrentIndex];
    ifIndex];
    if (!h (!hike) return;

    const isWike) return;

    const isWoman = hike.woman === 'yesoman = hike.woman === 'yes';
    const accentColor =';
    const accentColor = isWoman ? isWoman ? '#FB5EB '#FB5EB0' : '#0' : '#D9FD19';
   D9FD19';
    const is const isBookedBooked = state = state.hike.hikeBookingStatus[sheetCurrentIndex] ||BookingStatus[sheetCurrentIndex] || false false;
    const;
    const hikeDate = new Date(h hikeDate = new Date(hike.dateike.date);
    const today);
    const today = new = new Date();
    today Date();
    today.setHours.setHours(0, (0, 0, 0, 0, 0, 0);
    const0);
    const isPast = hikeDate < isPast = hikeDate < today;
    const today;
    const isGuest = state.userCard isGuest = state.userCard.status !== 'active';

    container.innerHTML = '';

    if (isPast) {
        const row = document.createElement('div');
        row.style.status !==.display = 'flex 'active';

    container.innerHTML = '';

    if (isPast) {
        const row = document.createElement('div');
        row.style.display = 'flex';
       ';
        row.style row.style.gap = '12px';
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
                e.gap = '12px';
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
                e.stopPropagation.stopProp();
                haagation();
                hapticptic();
                const();
                const url = hike.re url = hike.report_linkport_link.trim.trim();
                if();
                if (url) open (url) openLink(urlLink(url, 'report_click',, 'report_click', state.user state.userCard.statusCard.status !== ' !== 'activeactive');
                return false;
           ');
                return false;
            });
            row });
            row.appendChild(re.appendChild(reportBtnportBtn);
       );
        }
        }
        container.appendChild container.appendChild(row(row);
       );
        container container.style.pointer.style.pointerEvents =Events = 'none 'none';
        return';
        return;
   ;
    }

    const }

    const swipeControl swipeControl = render = renderSwipeControl({ isSwipeControl({ isBookedBooked, is, isGuest,Guest, hike, hike, accentColor accentColor });
    });
    if ( if (swipeswipeControl) {
        container.appendChild(swipeControl);
        container.styleControl) {
        container.appendChild(swipeControl);
        container.style.po.pointerEvents = 'interEvents = 'auto';
        returnauto';
        return;
   ;
    }

    container.style.pointerEvents = ' }

    container.style.pointerEvents = 'autoauto';
    if';
    if (is (isBookedBooked)) {
        const {
        const row = row = document.createElement document.createElement('div');
       ('div');
        row.style row.style.display = 'flex';
        row.style.gap.display = 'flex';
        row.style.gap = ' = '12px12px';
       ';
        row.style row.style.just.justifyContent = 'ifyContent = 'centercenter';
        row';
        row.style.width.style.width = ' = '100%100%';

       ';

        const cancel const cancelBtn = document.createElement('a');
        cancelBtn.href = '#Btn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn';
        cancelBtn.className.className = ' = 'btn btnbtn btn-outline';
       -outline';
        cancelBtn cancelBtn.textContent.textContent = ' = 'отменитьотменить';
       ';
        cancelBtn cancelBtn.addEventListener('.addEventListener('click',click', e => {
            e.preventDefault();
            e => {
            e.preventDefault const userId();
            = state const userId = state.user?..user?.id;
            const hikeDateid;
            const hikeDate = hike = hike.date;
            const hikeTitle = hike.title.date;
            const hikeTitle = hike.title;
            if;
            if (is (isGuest)Guest) {
                removeParticip {
                removeParticipant(hant(hikeDateikeDate, userId, userId)
                    .then)
                   (() => .then(() => {
                        {
                        delete state.hikeBookingStatus[sheet delete state.hikeBookingStatus[sheetCurrentIndexCurrentIndex];
                       ];
                        saveBooking saveBookingStatusToStatusToLocalLocal();
                        update();
                        updateRegistrationInRegistrationInSheet(hSheet(hikeDateikeDate, hike, hikeTitleTitle,, 'cancelled 'cancelled', '',', '', state.user state.user, false);
                        updateF, false);
                        updateFloatingloatingSheetButtonsSheetButtons();
                        renderUserBookings(document.getElementById('userBookings();
                        renderUserBookings(document.getElementById('userContainerBookingsContainer'));
                        const'));
                        const cal = cal = document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal document.getElementById('calendarContainer');
                        if (cal) renderCalendar(cal);
                   );
                    });
            } });
            } else else {
                Promise.all([removeParticipant(hikeDate, userId {
                Promise.all([removeParticipant(hikeDate, userId), set), setUserRegistrationUserRegistrationStatus(userStatus(userId,Id, hikeDate, false)])
                    .then hikeDate, false)])
                   (() => .then {
                       (() => delete state {
                       .hike delete state.hikeBookingStatusBookingStatus[sheet[sheetCurrentIndexCurrentIndex];
                       ];
                        update updateFloatingFloatingSheetButtonsSheetButtons();
                       ();
                        updateRegistration updateRegistrationInSheet(hikeDate, hikeTitle, 'InSheet(hikeDate, hikeTitle, 'canccancelled',elled', '', state '', state.user, true.user, true);
                        renderUserBookings(document);
                        renderUserBookings(document.getElementById('.getElementById('userBookingsContaineruserBookingsContainer'));
                       '));
                        const cal = document.getElementById('calendarContainer const cal = document.getElementById('calendarContainer');
                       ');
                        if ( if (cal) renderCalendarcal) renderCalendar(cal(cal);
                   );
                    });
            });
            }
            }
            log('cancel_ log('cancel_click',click', false, false, state.user state.user);
       );
        });
        });
        row.appendChild row.appendChild(cancel(cancelBtnBtn);

        const goBtn);

        const goBtn = document = document.createElement('.createElement('aa');
        go');
        goBtn.hBtn.href =ref = '#';
        goBtn.className = 'btn btn-y '#';
        goBtn.className = 'btn btn-yellowellow';
        goBtn.text';
        goBtn.textContent =Content = 'ты 'ты записан';
        записан';
        goBtn goBtn.style.p.style.pointerointerEvents =Events = 'none 'none';
';
               row.appendChild(go row.appendChild(goBtnBtn);
        container);
        container.appendChild(row.appendChild(row);
        return;
   );
        return;
    }

    if }

    if (is (isGuest) {
       Guest) {
        const row const row = document = document.createElement('.createElement('div');
        rowdiv');
        row.style.display.style.display = 'flex';
        row = 'flex';
        row.style.g.style.gap =ap = '12px '12px';
        row';
        row.style.j.style.justifyustifyContent = 'center';
Content = 'center';
        row.style.width = '100%';

        const questionBtn =        row.style.width = '100%';

        const questionBtn = document.createElement('a document.createElement('a');
        questionBtn.h');
        questionBtn.href =ref = '# '#';
        question';
        questionBtn.classBtn.className =Name = 'btn btn-outline';
        question 'btn btn-outlineBtn.text';
        questionBtn.textContent =Content = 'за 'задать вопросдать вопрос';
        questionBtn';
        questionBtn.addEventListener('.addEventListener('click',click', e => e => {
            e.preventDefault {
            e.preventDefault();
           ();
            openLink openLink('https('https://t://t.me/helloint.me/hellointelligent', 'question_click', trueelligent', 'question_click', true);
       );
        });
        });
        row.appendChild row.appendChild(question(questionBtnBtn);

        const goBtn);

        const goBtn = document = document.createElement('a');
        go.createElement('a');
        goBtn.hBtn.href = '#ref = '#';
        go';
        goBtn.classBtn.className =Name = 'btn btn-y 'btn btn-yellow btn-glowellow btn-glow';
       ';
        goBtn goBtn.textContent = 'иду';
        goBtn.addEventListener('click',.textContent = 'иду';
        goBtn.addEventListener('click', e => e => {
            {
            e.preventDefault();
            showGuest e.preventDefault();
            showGuestBookingPopupBookingPopup(hike(hike.date,.date, hike.title);
        hike.title);
        });
        });
        row.appendChild(go row.appendChild(goBtn);
        container.appendChild(row);
        returnBtn);
        container.appendChild(row);
        return;
   ;
    }

    const }

    const row = row = document.createElement document.createElement('div');
    row.style.display = 'flex('div');
    row.style.display = 'flex';
   ';
    row.style row.style.gap.gap = '12px';
    = '12px';
    row.style row.style.just.justifyContent = 'center';
    row.style.width = '100%ifyContent = 'center';
    row.style.width = '';

   100% const go';

    const goBtn =Btn = document.createElement('a');
    goBtn.href = '#';
    document.createElement('a');
    goBtn.href = '#';
    goBtn goBtn.className.className = 'btn btn = 'btn btn-yellow-yellow btn-g btn-glowlow';
    goBtn.text';
    goContent =Btn.textContent = 'и 'иду';
    goду';
    goBtn.addEventListenerBtn.addEventListener('click('click',', e => {
        e.preventDefault e => {
        e.preventDefault();
        const();
        const userId = userId = state.user?.id;
        state.user?.id;
        const hike const hikeDate = hike.date;
        constDate = hike.date;
        const hike hikeTitle =Title = hike.title hike.title;
       ;
        setUser setUserRegistrationRegistrationStatus(userIdStatus(userId, hikeDate, true)
            .then(() =>, hikeDate, true)
            .then(() => {
                state {
                state.hikeBookingStatus.hikeBookingStatus[sheet[sheetCurrentIndex] = true;
                return addParticipant(hikeDateCurrentIndex] = true;
                return addParticipant(hikeDate, userId, userId,, {
                    first {
                    first_name:_name: state.user?.first state.user?.first_name,
                    photo_url: state.user_name,
                    photo_url: state.user?.photo_url?.photo_url,
               ,
                });
            });
            })
            . })
            .then(() =>then(() => {
                updateRegistrationInSheet(hikeDate, hikeTitle, {
                updateRegistrationInSheet(hikeDate, hikeTitle, 'book 'booked',ed', 'card_holder', state.user, true);
                updateFloatingSheetButtons();
                renderUserBook 'card_holder', state.user, true);
                updateFloatingSheetButtons();
                renderUserBookings(documentings(document.getElementById('.getElementById('userBookuserBookingsContaineringsContainer'));
                const cal = document.getElementById('calendarContainer');
                if ('));
                const cal = document.getElementById('calendarContainer');
                if (cal)cal) renderCalendar(cal);
            })
            .catch(error => {
                console.error(error);
                updateFloatingSheet renderCalendar(cal);
            })
            .catch(error => {
                console.error(error);
                updateFloatingSheetButtonsButtons();
           ();
            });
        log });
        log('id('idut_click', false, state.user);
    });
    row.appendChild(gout_click', false, state.user);
    });
    row.appendChild(goBtnBtn);
    container.appendChild(row);
}

function show);
    container.appendChild(row);
}

function showGuestBookingGuestBookingPopup(hikeDate, hikeTitle, onClose) {
    haPopup(hikeDate, hikeTitle, onClose) {
    hapticptic();
   ();
    const bookingPopup = ( const bookingPopup = (state.popstate.popups &&ups && state.pop state.popups.gups.guest_uest_booking_popbooking_popup) || null;
    const config = state.popupConfig;

    const popupup) || null;
    const config = state.popupConfig;

    const popupText =Text = bookingPopup bookingPopup ? bookingPopup.text : config.text;
    const popupTitle = ? bookingPopup.text : config.text;
    const popupTitle = bookingPopup bookingPopup ? booking ? bookingPopup.titlePopup.title : ' : 'регистрарегистрация на хайкция на хайк';

    const overlay =';

    const overlay = document.createElement('div document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestBooking = 'guestBookingPopup';
    overlayPopup';
    overlay.innerHTML = `
        <div class=".innerHTML = `
        <div class="modal-content" style="maxmodal-content" style-width: 500px;="max-width: 500px; padding: padding: 20 20px;">
            <button classpx;">
            <button class="modal-close="modal-close" id" id="closePopup">&times;</="closePopup">&times;</buttonbutton>
           >
            <div class <div class="modal="modal-title">${popupTitle}</div>
            <div class="modal-text-title">${popupTitle}</div>
            <div class="modal-text" style="margin-bottom: 20" style="margin-bottom: 20px;">px;">${popupText${popupText}</div>
            <div}</div>
            <div style=" style="display: flex; flex-directiondisplay: flex; flex-direction: column; gap: 12px: column; gap: 12px; width: 100%;; width: ">
                <button class="100%;">
                <button class="btn btnbtn btn-yellow" id="buyTicketBtn" style-yellow" id="buyTicketBtn" style="width: ="width: 100%; margin:100%; margin: 0 0;">купить билет 🎟️ · ${config.ticketPrice} ₽</button>
                <div id="cardAccordion;">купить билет 🎟️ · ${config.ticketPrice} ₽</button>
                <div id="cardAccordionPopup" style="width:Popup" style="width: 100 100%;%;">
                   ">
                    <button class <button class="btn btn-outline" id="showCardOptionsBtn" style="width: 100%; margin:="btn btn-outline" id="showCardOptionsBtn" style="width: 100%; margin: 0; box-sizing: 0; box-sizing: border-box border-box;">оформить карту;">оформить карту 💳</button>
                    <div id="cardOptions" style="display: none; margin 💳</button>
                    <div id="cardOptions" style="display: none; margin-top:-top: 12px;">
                        <div style="display: flex; flex-direction: row; 12px;">
                        <div style="display: flex; flex-direction: row; gap: 8px; gap: 8px; width: 100%;">
                            <button class width: 100%;">
                            <="btn btn-outline"button class="btn btn-outline" id="buySeasonCardBtn id="buySeason" style="flex: CardBtn" style="flex: 1;1; margin: margin: 0; box-sizing: border-box 0; box-sizing: border-box;">се;">сезонная</button>
                            <button class="зонная</button>
                            <button class="btn btnbtn btn-outline" id="buyPermanent-outline" id="buyPermanentCardBtn" styleCardBtn" style="flex="flex: 1; margin:: 1; 0; box-sizing: margin: 0; box-sizing: border-box;">бессро border-box;">бессрочная</button>
                        </div>
                        <div style="display: flex; flex-direction:чная</button>
                        </div>
                        <div style="display: flex; flex-direction: row; row; gap: 8px; margin-top: 4px gap: 8px; margin-top: 4px; width; width: : 100%; text-align100%; text-align: center; color: center; color: rgba(255,255,255,0.7); font-size: 12px;">
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
                if (calendarContainer) renderCalendar(calendarContainer: rgba(255,255,255,0.7); font-size: 12px;">
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
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', purchaseType, state.user, false);
                open);
                openLink(link, `purchase_${purchaseType}`, trueLink(link, `purchase_${purchaseType}`, true);
                overlay);
                overlay.remove();
            })
            .catch(error.remove();
            })
            .catch(error => {
                console.error(error);
                alert('Ошибка при регистрации. Попробуйте => {
                console.error(error);
                alert('Ошибка при регистрации. ещё раз Попробуйте ещё раз.');
            });
    };

   .');
            });
    };

    document.getElementById('buyTicketBtn').add document.getElementById('buyTicketBtn').addEventListener('EventListener('click', e =>click', e => {
        e.preventDefault {
        e.preventDefault();
        if (();
        if (e.targete.target.dataset.dataset.processing.processing === ' === 'true')true') return return;
        e;
        e.target.dat.target.dataset.proaset.processing =cessing = 'true';
        'true';
        handlePurchase handlePurchase('ticket',('ticket', config.ticketLink config.t || ROBicketLink || ROBOKASOKASSA_LSA_LINKINK);
   );
    });

    const });

    const showCardOptionsBtn = document.getElementById('showCardOptionsBtn');
    showCardOptionsBtn = document.getElementById('showCardOptionsBtn');
    const card const cardOptions =Options = document.getElementById document.getElementById('cardOptions');
    show('cardOptions');
    showCardOptionsBtn.addEventListenerCardOptionsBtn.addEventListener('click('click', e', e => => {
        e.preventDefault {
        e.preventDefault();
        ha();
        hapticptic();
        if();
        if (card (cardOptions.styleOptions.style.display ===.display === 'none 'none' ||' || cardOptions cardOptions.style.display === '.style.display === '')
           ')
            cardOptions cardOptions.style.display = '.style.display = 'blockblock';
        else cardOptions.style.display = 'none';
        else cardOptions.style.display = 'none';
    });

    document';
    });

    document.getElementById('buySeason.getElementById('buySeasonCardBtn').addCardBtn').addEventListener('click', e => {
        e.preventDefaultEventListener('click', e =>();
        if (e.target {
        e.preventDefault();
        if (e.target.dataset.processing === '.dataset.processingtrue') return === 'true');
        e.target.dataset.processing = return;
        e.target.dataset.processing = 'true 'true';
        handlePurchase';
        handlePurchase('season_card', config.seasonCard('season_card', config.seLink || SEASONasonCardLink || SEASON_CARD_LINK);
   _CARD_LINK);
    });

    document.getElementById('buyPermanentCardBtn').addEventListener(' });

    document.getElementById('buyPermanentCardBtn').addEventListener('click',click', e => {
        e.preventDefault();
        e => {
        e.preventDefault();
        if ( if (e.target.datasete.target.dataset.processing === 'true').processing === 'true') return;
        e.target.dataset.pro return;
        e.target.dataset.processing = 'truecessing = 'true';
       ';
        handlePurchase handlePurchase('per('permanent_card', config.permanentCardLink || PERMANENT_CARD_LINK);
   manent_card', config.permanentCardLink || PERMANENT_CARD_LINK);
    });
}

let currentDropdownH });
}

let currentDropdownHikeDate = nullikeDate = null;
export function closeParticipantDropdown();
export function closeParticipant {
    const existingDropdown() {
    const existing = document.querySelector('.participant-dropdown = document.querySelector('.participant-dropdown.show');
    if (existing) {
        existing.remove.show');
    if (existing) {
        existing.remove();
        currentDropdownH();
        currentDropdownHikeDateikeDate = null;
    }
}

export async function toggleParticipant = null;
    }
}

export async function toggleParticipantDropdown(cDropdown(counterElementounterElement, hikeDate) {
    const existing = document, hikeDate) {
    const existing = document.querySelector('.participant-dropdown.querySelector('.participant-dropdown.show.show');
    if (existing');
    if (existing && currentDropdownHikeDate && currentDropdownHikeDate === hike === hikeDate)Date) {
        closeParticipantDropdown {
        closeParticipantDropdown();
        return();
        return;
   ;
    }
    closeParticipantDropdown();
    haptic();

    if (Object.keys(state.profiles).length === 0) }
    closeParticipantDropdown();
    haptic();

    if (Object.keys(state.profiles).length === 0) {
        {
        try try {
            const profiles = await load {
            const profiles = await loadAllProfAllProfiles();
            stateiles();
            state.profiles = profiles.profiles = profiles;
        } catch (e) {
            console.error(';
        } catch (e) {
            console.error('Failed toFailed to load profiles load profiles', e);
        }
   ', e);
        }
    }

    }

    const participants = await loadAllParticipants(hikeDate);
    const dropdown const participants = await loadAllParticipants(hikeDate);
    const dropdown = document = document.createElement('div');
    dropdown.className = 'participant.createElement('div');
    dropdown.className = 'participant-dropdown';
   -dropdown';
    dropdown.style dropdown.style.maxHeight.maxHeight = ' = '250px';
   250px';
    dropdown.style dropdown.style.overflowY = 'auto';

    dropdown.addEventListener('wheel', (e) => e.stopPropagation());
    dropdown.addEventListener('touchstart', (.overflowY = 'auto';

    dropdown.addEventListener('wheel', (e) => e.stopPropagation());
    dropdown.addEventListener('touchstart', (e) => e.stopPrope) => e.stopPropagationagation());
    dropdown.addEventListener('touchmove', (e) => e.stopProp());
    dropdown.addEventListener('touchmove', (e) => e.stopPropagation());

    if (participants.lengthagation());

    if (participants.length === 0 === )0) {
        dropdown.innerHTML = '<div class="participant-drop {
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
                   down-item" style="justify-content:center;">Пока никого нет</div>';
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
                    closeBottomSheet closeBottomSheet();
                    state.pendingProfileClick = {
                        userId: p.userId,
                        name: name,
                        photoUrl: p.photoUrl || null
                    };
                    renderProf();
                    state.pendingProfileClick = {
                        userId: p.userId,
                        name: name,
                        photoUrl: p.photoUrl || null
                    };
                    renderProfiles();
                    setTimeout(() => {
                       iles();
                    setTimeout(() => {
                        const profile const profileCard =Card = document.querySelector(`.profile-card[data-user-id="${p.userId}"] document.querySelector(`.profile-card[data-user-id="${p.userId}"]`);
                       `);
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
        <div style="position: relative; padding: 0 20px;"><button class="leader-close-btn" style="position: absolute; top: -12px; right: 12px; background: none; border: none; if (profileCard) {
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
        <div style="position: relative; padding: 0 20px;"><button class="leader-close-btn" style="position: absolute; top: -12px; right: 12px; background: none; border: none; color: #aaa; font-size: 28px; cursor: pointer; z-index: 10000; line-height: 1;">&times;</button color: #aaa; font-size: 28px; cursor: pointer; z-index: 10000; line-height: 1;">&times;</button></div>
        <div style="display: flex; flex-direction: column; gap: 12px; padding: 0 20></div>
        <div style="display: flex; flex-direction: column; gap: 12px; padding: 0 20px 16px;">
           px 16px;">
            <div style=" <div style="display:display: flex; align-items flex; align-items: center: center; gap; gap: 12px;">${avatarHtml}<span style=": 12px;">${avatarHtml}<span style="font-weightfont-weight: 600; color: white;">${leaderData.name}</span></div>
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
    const link = e.target.closest('.dynamic-link, .nav-popup a, .btn-newcomer, .accordion-btn, .bottom-sheet-nav-arrow, .btn, .participant-counter, .booking-detail-btn, .bookings-calendar-link, .booking-go-btn,: 600; color: white;">${leaderData.name}</span></div>
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
    const link = e.target.closest('.dynamic-link, .nav-popup a, .btn-newcomer, .accordion-btn, .bottom-sheet-nav-arrow, .btn, .participant-counter, .booking-detail-btn, .bookings-calendar-link, .booking-go-btn, .leader-name, .leader-name, .pop .popup-linkup-link, .profile-hike-link, .profile-contact-btn');
    if, .profile-hike-link, .profile-contact-btn');
    if (!link (!link) return;

   ) return;

    if (link.classList.contains(' if (link.classList.contains('profile-contactprofile-contact-btn'))-btn')) {
        {
        e.preventDefault e.preventDefault();
        haptic();
       ();
        haptic();
        const action const action = link = link.dataset.action.dataset.action;
        if;
        if (action (action === ' === 'chat')chat') {
            {
            const username = link const username = link.dataset.dataset.username;
            if (username.username;
            if (username) {
                const) {
                const cleanUsername = username.replace(/^@/, '');
                cleanUsername = username.replace(/^@/, '');
                if (tg && if (tg && tg.open tg.openTelegramTelegramLink)Link) tg.open tg.openTelegramLink(`https://t.me/${cleanUsername}`);
                elseTelegramLink(`https://t.me/${cleanUsername}`);
                else openLink openLink(`https(`https://t.me/${cleanUsername}`, 'profile://t.me/${cleanUsername}`, 'profile_chat_chat_click_click', false', false);
           );
            }
        } else if (action === }
        } else if (action === ' 'linklink') {
            let url = link.dataset.url;
            if (url) {
                if (!url.match(/^https?:\/\//i') {
            let url = link.dataset.url;
            if (url) {
                if (!url.match(/^https?:\/\//i)) url = 'https://' + url;
                openLink(url)) url = 'https://' + url;
                open, 'Link(url, 'profile_linkprofile_link_click_click', false', false);
            }
        }
        return;
    }

    if (link.classList.contains('profile);
            }
        }
        return;
    }

    if (link.classList.contains('profile-hike-hike-link'))-link')) {
        {
        e.preventDefault();
        haptic();
        e.preventDefault();
        haptic();
        const hikeDate = link.dataset.hikeDate const hikeDate = link.dataset.hikeDate;
        if (hikeDate);
        if (hikeDate) {
            {
            log('profile_hike_click', state.userCard.status !== 'active', state.user, { log('profile_hike_click', state.userCard.status !== 'active', state.user, { hikeDate hikeDate });
            });
            const index = state.hikesList.findIndex(h => h const index = state.hikesList.findIndex(h => h.date ===.date === hikeDate);
            if (index !== -1) showBottomSheet(index hikeDate);
            if (index !== -1) showBottomSheet(index);
       );
        }
        return }
        return;
    }

    if (link.classList.contains('leader-name;
    }

    if (link.classList.contains('leader-name')) {
        e.preventDefault();')) {
        e.preventDefault(); e.stopPropagation();
        const username e.stopPropagation();
        const username = link = link.dataset.leaderUsername;
        if.dataset.leaderUsername (username;
        if (username) {
            haptic(); closeLeader) {
            haptic(); closeLeaderDropdown();
            if (state.leadersDropdown();
            if (state.leaders[username]) showLeader[username])Dropdown( showLeaderDropdown(link,link, state.leaders[username state.leaders[username]);
           ]);
            else openLink(`https://t.me else openLink(`https://t.me/${username/${username}`,}`, 'leader_click', state.userCard 'leader_click', state.userCard.status !== 'active.status !== 'active');
           ');
            log('leader_click', state.user log('leader_click', state.userCardCard.status.status !== 'active', state.user);
        !== 'active', state.user);
        }
        }
        return;
    }
    if (link.classList.contains return;
    }
    if (link.classList.contains('pop('popup-linkup-link'))')) {
        e.preventDefault(); e.stopPropagation(); haptic {
        e.preventDefault(); e.stopPropagation(); haptic();
        const();
        const url = url = link.dataset.url;
        if ( link.dataset.url;
        if (url &&url && url.trim url.trim() !== '') openLink(url, 'pop() !== '') openLink(url, 'popup_linkup_link_click_click', state.userCard.status !==', state.userCard 'active.status !== 'active');
       ');
        return return;
   ;
    }
    if }
    if (link (link.classList.contains.classList.contains('dynamic-link')) {
       ('dynamic-link')) {
        e.preventDefault e.preventDefault();
       ();
        const url const url = link = link.dataset.dataset.url.url;
        const;
        const isGuest isGuest = link = link.dataset.dataset.guest.guest === ' === 'true';
        openLink(urltrue';
        openLink(url, ', 'link_link_click',click', isGuest isGuest);
        return);
        return;
   ;
    }
    if }
    if (link (link.closest('.nav.closest('.nav-popup-popup'))')) {
        e {
        e.preventDefault.preventDefault();
        const();
        const href = link.get href = link.getAttribute('hrefAttribute('href');
        if');
        if (href (href && href && href !== '# !== '#')') {
            if (link {
            if (link.id ===.id === 'pop 'popupNewupNewcomercomer') { const is') { const isGuest =Guest = state.user state.userCard.statusCard.status !== 'active'; !== 'active'; renderNew renderNewcomercomerPage(isGuest); }
            else if (link.id ===Page(isGuest); }
            else if (link.id === 'pop 'popupGupGift') { const isGuestift') { const = state.userCard.status !== isGuest = state.userCard.status !== 'active 'active'; renderGift(isGuest); }
            else if (link.id'; renderGift(isGuest); }
            else if (link.id === === ' 'popuppopupPass') { constPass') { const isGuest isGuest = state.userCard = state.userCard.status !== 'active.status !== 'active'; renderPassPage(isGuest);'; renderPassPage(isGuest); }
            else }
            else if ( if (link.id === 'popuplink.idQuestion') === 'popupQuestion') { const { const isGuest = state isGuest = state.userCard.userCard.status !==.status !== 'active 'active'; openLink('https://'; openLink('https://t.met.me/hellointelligent', '/hellointelligent', 'question_question_click',click', isGuest); }
            else openLink(href isGuest); }
            else openLink(href, ', 'nav_popnav_popup_up_click', falseclick', false);
        }
        return);
        }
        return;
   ;
    }
    }
    if ( if (link.classList.contains('link.classList.contains('btnbtn-new-newcomer'))comer {
        e')).preventDefault(); {
        e.preventDefault(); haptic haptic();
        const is();
        const isGuest =Guest = link link.id.id === ' === 'newcomnewcomerBtnerBtnGuestGuest';
       ';
        render renderNewcomNewcomerPage(isGuesterPage(isGuest);
       );
        return return;
   ;
    }
   if }
   if (link.classList.contains (link.classList.contains('particip('participant-counter'))ant-counter')) {
    e.preventDefault(); {
    e.preventDefault(); e.stop e.stopPropagation();
   Propagation();
    const hike const hikeDate =Date = link.dat link.dataset.haset.hikeDate;
    if (!ikeDate;
   hike if (!Date)hikeDate) return;
    const return;
    const index = state.h index =ikesList.findIndex state.hikesList.findIndex(h =>(h => h.date h.date === hikeDate === hikeDate);
    const);
    const hike hike = state.h = state.hikesList[index];
    const isWoman = hike && hike.woman === 'yes';
    const accentikesList[index];
    const isWoman = hike && hike.woman === 'yes';
    const accentColor =Color = isWoman ? '#FB5EB0' isWoman ? '#FB5EB0' : ' : 'var(--var(--yellow)yellow)';
    if (';
    if (state.userstate.userCard.statusCard.status !== ' !== 'active')active') {
        {
        const popupData const popupData = ( = (state.popups &&state.popups && state.pop state.popups.gups.guest_uchastniki_popup) || {
            titleuest_uchastniki_popup) || {
            title: 'недоступно: 'недоступно',
            text: 'чтобы прос',
            text: 'чматриватьтобы просматривать участников участников, нужна карта интеллигента. с ней ты сможешь видеть, кто идёт на хайк, даже если не записан на него',
            button_text: 'пон, нужна карта интеллигента. с ней ты сможешь видеть, кто идёт на хайк, даже если не записан на него',
            button_text: 'понятноятно'
       '
        };
        const msg = document };
        const msg = document.createElement('.createElement('divdiv');
        msg.className = 'modal-overlay');
        msg.className = 'modal-overlay';
        msg.innerHTML = `
           ';
        msg.innerHTML = `
            <div <div class="modal-content class="modal-content" style" style="max="max-width: 300px;">
               -width: 300px;">
                <div class <div class="modal="modal-title"-title" style=" style="color:color: ${ac ${accentColor};">centColor};">${pop${popupDataupData.title}</.title}</div>
               div>
                <div class <div class="modal="modal-text">-text">${pop${popupDataupData.text}</.text}</divdiv>
                <div class>
                <div class="modal="modal-butt-buttons"ons" style=" style="margin-topmargin-top: 20px;">
                    <button class="btn" style=": 20px;">
                    <button class="btn" style="background-colorbackground-color: ${accentColor}; color: #000000; width: 100%; margin: 0; padding: 12px; border-radius: 12px; font-weight: 600; border: ${accentColor}; color: #000000; width: 100%; margin: 0; padding: 12px; border-radius: 12px; font-weight: 600: none; border: none; cursor; cursor: pointer;">${popupData.button_text}</: pointer;">${popupData.button_text}</button>
                </button>
                </div>
            </div>
        `;
        document.body.appendChild(msg);
        const closeBtn = msg.querySelector('.btn');
        closeBtn.addEventListener('click',div>
            </div>
        `;
        document.body.appendChild(msg);
        const closeBtn = msg.querySelector('.btn');
        closeBtn.addEventListener('click', () => () => msg.remove());
        setTimeout(() msg.remove());
        setTimeout(() => { => { msg.addEventListener('click msg.addEventListener('click', (', (e)e) => => { if (e.target === msg) msg.remove(); }); }, 0);
        log { if (e.target === msg) msg.remove(); }); }, 0);
        log('uch('uchastnikiastniki_no_card_no_card', true', true, state, state.user.user);
    });
    } else {
        toggleParticipantDropdown( else {
        togglelink,ParticipantDropdown( hikeDatelink, hikeDate);
   );
    }
    }
    return return;
}
    if (link.classList.contains('booking-detail-btn;
}
    if (link.classList.contains('booking-detail-btn')) {
        e.preventDefault();
        const')) {
        e.preventDefault();
        const index = index = link.dat link.dataset.indexaset.index;
        if (;
        if (index !==index !== undefined) undefined) {
            {
            log('booking_detail log('booking_detail_click_click', state.userCard.status !==', state.userCard.status !== 'active', state 'active', state.user,.user, { index { index });
            showBottomSheet( });
            showBottomparseIntSheet(parseInt(index(index));
       ));
        }
        return }
        return;
   ;
    }
    }
    if (link.classList.contains('booking-go-btn')) {
        if (link.classList.contains('booking-go-btn')) {
        e.preventDefault(); ha e.preventDefault(); haptic();
        log('random_phrase_clickptic();
        log('random_phrase_click', state', state.userCard.userCard.status !== 'active', state.status !== 'active', state.user.user);
        document.getElementById('calendarContainer);
        document.getElementById('calendarContainer')?.')?.scrollIntoscrollIntoView({ behavior: 'smooth', block: 'start' });
        returnView({ behavior: 'smooth', block: 'start' });
        return;
   ;
    }
    if (link.classList }
    if (link.classList.contains('bookings-calendar.contains('bookings-calendar-link')) {
       -link')) {
        e.preventDefault(); ha e.preventDefault(); haptic();
        log('moi_zapisiptic();
        log('moi_zapisi_kal_kalendar_click',endar_click', state.user state.userCard.status !== 'Card.status !== 'active',active', state.user state.user);
       );
        document.getElementById document.getElementById('calendar('calendarContainer')Container')?.scroll?.scrollIntoViewIntoView({ behavior({ behavior: ': 'smoothsmooth', block', block: ': 'start' });
       start' });
        return return;
   ;
    }
});
