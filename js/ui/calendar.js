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
            if (index !== -1) showBottomSheet(index);
        });
    });
}

let sheetCurrentIndex = 0;
let sheetScrollListener = null;
let dragStartY = 0;
let isDragging = false;
let currentUnsubscribe = null;

// Универсальное извлечение статусов
function getUserStatuses(userId) {
    const profile = state.profiles[userId];
    if (!profile) return [];
    const statuses = profile.friendshipStatuses;
    if (!statuses) return [];
    if (Array.isArray(statuses)) return statuses;
    if (typeof statuses === 'object') return Object.values(statuses);
    return [];
}

// Возвращает строку box-shadow на основе статусов
function getAvatarBoxShadow(userId) {
    const statuses = getUserStatuses(userId);
    const colors = [];
    if (statuses.includes('дружба')) colors.push('#D9FD19');
    if (statuses.includes('отношения')) colors.push('#FB5EB0');
    if (statuses.includes('бизнес')) colors.push('#5E9FC5');
    
    if (colors.length === 0) {
        return '0 0 0 2px rgba(0,0,0,0.6)'; // без профиля — серая обводка
    } else if (colors.length === 1) {
        return `0 0 0 2px ${colors[0]}`;
    } else {
        return colors.map(c => `0 0 0 2px ${c}`).join(', ');
    }
}

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
    const windowHeight = window.innerHeight;
    sheet.style.maxHeight = `${windowHeight * 0.9}px`;
    sheet.style.height = `${windowHeight * 0.9}px`;
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
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        let formattedDate = '';
        if (hike.date) {
            const parts = hike.date.split('-');
            if (parts.length === 3) {
                const day = parseInt(parts[2], 10);
                const month = parseInt(parts[1], 10) - 1;
                formattedDate = `${day} ${monthNames[month]}`;
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isPast = hikeDate < today;

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
                        img.style.width = '28px';
                        img.style.height = '28px';
                        img.style.borderRadius = '50%';
                        img.style.objectFit = 'cover';
                        if (hasProfile) {
                            img.style.boxShadow = getAvatarBoxShadow(p.userId);
                        } else {
                            img.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.6)';
                        }
                        img.onerror = function () {
                            const placeholder = document.createElement('div');
                            placeholder.className = 'participant-avatar placeholder' + (hasProfile ? ' has-profile' : '');
                            placeholder.style.width = '28px';
                            placeholder.style.height = '28px';
                            placeholder.style.borderRadius = '50%';
                            placeholder.style.backgroundColor = '#40a7e3';
                            placeholder.style.display = 'flex';
                            placeholder.style.alignItems = 'center';
                            placeholder.style.justifyContent = 'center';
                            placeholder.style.fontWeight = 'bold';
                            placeholder.style.fontSize = '14px';
                            placeholder.style.color = 'white';
                            placeholder.style.textTransform = 'uppercase';
                            if (hasProfile) {
                                placeholder.style.boxShadow = getAvatarBoxShadow(p.userId);
                            } else {
                                placeholder.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.6)';
                            }
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

function updateFloatingSheetButtons() {
    const container = document.querySelector('.floating-sheet-buttons');
    if (!container) return;
    const hike = state.hikesList[sheetCurrentIndex];
    if (!hike) return;

    const isWoman = hike.woman === 'yes';
    const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
    const isBooked = state.hikeBookingStatus[sheetCurrentIndex] || false;
    const hikeDate = new Date(hike.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = hikeDate < today;

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
        return;
    }

    const isGuest = state.userCard.status !== 'active';

    if (state.user?.id) {
        const popupKey = `${state.user.id}_${hike.date}`;
        const popupData = state.registrationsPopup[popupKey];
        if (popupData && popupData.popupText && popupData.popupLink) {
            addPaymentPopup(container, popupData, isGuest);
        }
    }

    if (isBooked) {
        const inviteRow = document.createElement('div');
        inviteRow.style.display = 'flex';
        inviteRow.style.justifyContent = 'center';
        inviteRow.style.width = '100%';
        inviteRow.style.marginBottom = '3px';
        const inviteBtn = document.createElement('a');
        inviteBtn.href = '#';
        inviteBtn.className = 'btn btn-yellow btn-glow' + (isWoman ? ' woman-glow' : '');
        if (isWoman) inviteBtn.style.backgroundColor = '#FB5EB0';
        inviteBtn.id = 'sheetInviteBtn';
        inviteBtn.textContent = isWoman ? 'пригласить подругу' : 'пригласить друга';
        inviteBtn.addEventListener('click', e => {
            e.preventDefault();
            haptic();
            const link = `https://t.me/yaltahiking_bot?startapp=hike_${hike.date}`;
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}`;
            tg.openTelegramLink(shareUrl);
            log('invite_click', isGuest, state.user);
        });
        inviteRow.appendChild(inviteBtn);
        container.appendChild(inviteRow);

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'btn btn-outline';
        cancelBtn.id = 'sheetCancelBtn';
        cancelBtn.textContent = 'отменить';
        cancelBtn.addEventListener('click', e => {
            e.preventDefault();
            if (cancelBtn.dataset.processing === 'true') return;
            cancelBtn.dataset.processing = 'true';
            haptic();

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
                        const calendarContainer = document.getElementById('calendarContainer');
                        if (calendarContainer) renderCalendar(calendarContainer);
                    })
                    .catch(error => {
                        console.error(error);
                        updateFloatingSheetButtons();
                    });
            } else {
                Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)])
                    .then(() => {
                        delete state.hikeBookingStatus[sheetCurrentIndex];
                        updateFloatingSheetButtons();
                        updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, true);
                        renderUserBookings(document.getElementById('userBookingsContainer'));
                        const calendarContainer = document.getElementById('calendarContainer');
                        if (calendarContainer) renderCalendar(calendarContainer);
                    })
                    .catch(error => {
                        console.error(error);
                        updateFloatingSheetButtons();
                    });
            }
            log('cancel_click', false, state.user);
        });
        row.appendChild(cancelBtn);

        const goBtn = document.createElement('a');
        goBtn.href = '#';
        goBtn.className = 'btn btn-yellow-outline';
        goBtn.id = 'sheetGoBtn';
        goBtn.textContent = isWoman ? 'ты записана' : 'ты записан';
        if (isWoman) goBtn.style.color = '#FB5EB0';
        row.appendChild(goBtn);
        container.appendChild(row);
    } else {
        if (isGuest) {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.justifyContent = 'center';
            row.style.width = '100%';

            const questionBtn = document.createElement('a');
            questionBtn.href = '#';
            questionBtn.className = 'btn btn-outline';
            questionBtn.id = 'sheetQuestionBtn';
            questionBtn.textContent = 'задать вопрос';
            questionBtn.addEventListener('click', e => {
                e.preventDefault();
                haptic();
                openLink('https://t.me/hellointelligent', 'question_click', true);
            });
            row.appendChild(questionBtn);

            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow btn-glow' + (isWoman ? ' woman-glow' : '');
            if (isWoman) goBtn.style.backgroundColor = '#FB5EB0';
            goBtn.id = 'sheetGoBtn';
            goBtn.textContent = 'иду';
            goBtn.addEventListener('click', e => {
                e.preventDefault();
                if (goBtn.dataset.processing === 'true') return;
                goBtn.dataset.processing = 'true';
                haptic();
                showGuestBookingPopup(hike.date, hike.title);
                setTimeout(() => (goBtn.dataset.processing = 'false'), 1000);
            });
            row.appendChild(goBtn);
            container.appendChild(row);
        } else {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.justifyContent = 'center';
            row.style.width = '100%';

            const questionBtn = document.createElement('a');
            questionBtn.href = '#';
            questionBtn.className = 'btn btn-outline';
            questionBtn.id = 'sheetQuestionBtn';
            questionBtn.textContent = 'задать вопрос';
            questionBtn.addEventListener('click', e => {
                e.preventDefault();
                haptic();
                openLink('https://t.me/hellointelligent', 'question_click', false);
            });
            row.appendChild(questionBtn);

            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow btn-glow' + (isWoman ? ' woman-glow' : '');
            if (isWoman) goBtn.style.backgroundColor = '#FB5EB0';
            goBtn.id = 'sheetGoBtn';
            goBtn.textContent = 'иду';
            goBtn.addEventListener('click', e => {
                e.preventDefault();
                if (goBtn.dataset.processing === 'true') return;
                goBtn.dataset.processing = 'true';
                haptic();

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
                        const calendarContainer = document.getElementById('calendarContainer');
                        if (calendarContainer) renderCalendar(calendarContainer);
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
    }
}

function showGuestBookingPopup(hikeDate, hikeTitle) {
    haptic();
    const config = state.popupConfig;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestBookingPopup';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 500px; padding: 20px;">
            <button class="modal-close" id="closePopup" style="background: rgba(255,255,255,0.2); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: none; color: rgba(255,255,255,0.7); font-size: 28px; cursor: pointer; line-height: 1; position: absolute; top: 16px; right: 16px; backdrop-filter: blur(4px);">&times;</button>
            <div class="modal-title">регистрация на хайк</div>
            <div class="modal-text" style="margin-bottom: 20px;">${config.text}</div>
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
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            haptic();
            overlay.remove();
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

function addPaymentPopup(container, popupData, isGuest) {
    const popupDiv = document.createElement('div');
    popupDiv.className = 'payment-popup';
    popupDiv.style.pointerEvents = 'auto';
    popupDiv.style.zIndex = '2000';
    let text = popupData.popupText;
    if (!text) return;

    if (!popupData.popupLink) {
        popupDiv.textContent = text;
        container.insertBefore(popupDiv, container.firstChild);
        return;
    }

    const linkRegex = /\[([^\]]+)\]/g;
    let lastIndex = 0,
        match;
    const fragments = [];
    while ((match = linkRegex.exec(text)) !== null) {
        if (match.index > lastIndex) fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        const link = document.createElement('span');
        link.className = 'popup-link';
        link.textContent = match[1];
        link.dataset.url = popupData.popupLink;
        link.setAttribute('role', 'link');
        link.setAttribute('tabindex', '0');
        link.style.cursor = 'pointer';
        link.style.pointerEvents = 'auto';
        link.style.color = '#D9FD19';
        link.style.textDecoration = 'underline';
        link.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            haptic();
            const url = this.dataset.url;
            if (url && url.trim() !== '') openLink(url, 'popup_link_click', isGuest);
        });
        fragments.push(link);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) fragments.push(document.createTextNode(text.substring(lastIndex)));

    fragments.forEach(fragment => popupDiv.appendChild(fragment));
    container.insertBefore(popupDiv, container.firstChild);
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
            const boxShadow = hasProfile ? getAvatarBoxShadow(p.userId) : '0 0 0 2px rgba(255,255,255,0.3)';
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

            const avatarEl = item.querySelector('.participant-dropdown-avatar');
            if (avatarEl) {
                avatarEl.style.width = '30px';
                avatarEl.style.height = '30px';
                avatarEl.style.borderRadius = '50%';
                avatarEl.style.objectFit = 'cover';
                avatarEl.style.boxShadow = boxShadow;
            }

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

// Делегирование событий для динамических кнопок
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
        if (hikeDate) {
            const index = state.hikesList.findIndex(h => h.date === hikeDate);
            const hike = state.hikesList[index];
            const isWoman = hike && hike.woman === 'yes';
            const accentColor = isWoman ? '#FB5EB0' : 'var(--yellow)';
            if (index !== -1 && state.hikeBookingStatus[index]) toggleParticipantDropdown(link, hikeDate);
            else {
                const msg = document.createElement('div');
                msg.className = 'modal-overlay';
                msg.innerHTML = `
                    <div class="modal-content" style="max-width: 300px;">
                        <div class="modal-title" style="color: ${accentColor};">доступ ограничен</div>
                        <div class="modal-text">просмотр участников доступен после регистрации на хайк</div>
                        <div class="modal-buttons" style="margin-top: 20px;"><button class="btn" style="background-color: ${accentColor}; color: #000000; width: 100%; margin: 0; padding: 12px; border-radius: 12px; font-weight: 600; border: none; cursor: pointer;">понятно</button></div>
                    </div>
                `;
                document.body.appendChild(msg);
                const closeBtn = msg.querySelector('.btn');
                closeBtn.addEventListener('click', () => msg.remove());
                setTimeout(() => { msg.addEventListener('click', (e) => { if (e.target === msg) msg.remove(); }); }, 0);
                log('uchastniki_not_registered', state.userCard.status !== 'active', state.user);
            }
        }
        return;
    }
    if (link.classList.contains('booking-detail-btn')) {
        e.preventDefault();
        const index = link.dataset.index;
        if (index !== undefined) showBottomSheet(parseInt(index));
        return;
    }
    if (link.classList.contains('bookings-calendar-link') || link.classList.contains('booking-go-btn')) {
        e.preventDefault(); haptic();
        document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        log('moi_zapisi_kalendar_click', state.userCard.status !== 'active', state.user);
        return;
    }
});
