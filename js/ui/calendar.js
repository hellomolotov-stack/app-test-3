// js/ui/calendar.js – финальная версия (городские события: запись для владельцев карт, баннеры для гостей)
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
import { renderSuggestEvent } from './suggest-event.js';

let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth();

function hasHikesInMonth(year, month) {
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    return state.hikesWithTitle.some(hike => hike.date.startsWith(monthStr));
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
        <h2 class="section-title" style="margin:0 16px 16px 16px;">🗓️ календарь событий</h2>
        <div class="calendar-item">
            <div class="calendar-header-with-legend">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 8px;">
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
                <div class="calendar-legend" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">📷 отчёт</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">🎟️ запись</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">💫 готовим хайк</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">🌧️ переносим дату</span>
                    <span class="bottom-sheet-tag" style="background: rgba(255,255,255,0.1); color: white;">🏄🏻‍♂️ готовим событие</span>
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
        const isCity = isFullHike && (hike.city === true || hike.city === 'yes');

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
            else if (isPast && (hike.letter_text || hike.letter_link))
                innerHtml += `<span class="calendar-emoji-letter">✉️</span>`;
            else if (hike.emoji && hike.emoji.trim() !== '')
                innerHtml += `<span class="calendar-emoji">${hike.emoji}</span>`;
            else {
                const hikeIndex = state.hikesWithTitle.findIndex(h => h.date === dateStr);
                if (!isPast && hikeIndex !== -1 && state.hikeBookingStatus[hikeIndex] === true && !isCancelled) {
                    innerHtml += `<span class="calendar-emoji">🎟️</span>`;
                    classes += ' booked-day';
                }
            }
            if (isCancelled) {
                innerHtml += `<span class="calendar-emoji">🚫</span>`;
                classes += ' cancelled-hike';
            }
        } else if (isPlaceholder) {
            if (hike.emoji && hike.emoji.trim() !== '')
                innerHtml += `<span class="calendar-emoji">${hike.emoji}</span>`;
            else
                innerHtml += `<span class="calendar-emoji">💫</span>`;
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
    calendarHtml += `</div>
            <div style="display: flex; justify-content: flex-end; padding: 8px 4px 4px 4px;">
                <button class="btn-suggest-event" id="suggestEventBtn">+ предложить событие</button>
            </div>
        </div>`;
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
            const index = state.hikesWithTitle.findIndex(h => h.date === date);
            if (index !== -1) {
                log('calendar_cell_click', state.userCard.status !== 'active', state.user, { date });
                showBottomSheet(index);
            }
        });
    });

    const suggestBtn = document.getElementById('suggestEventBtn');
    if (suggestBtn) {
        suggestBtn.addEventListener('click', () => {
            haptic();
            log('suggest_event_click', state.userCard.status !== 'active', state.user);
            const isGuest = state.userCard.status !== 'active';
            if (isGuest) {
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.innerHTML = `
                    <div class="modal-content" style="max-width:360px; text-align:center;">
                        <div style="font-size:52px; margin-bottom:16px;">🔒</div>
                        <div class="modal-title" style="text-align:center; font-size:20px;">члены клуба могут предлагать свои события</div>
                        <button class="btn btn-yellow" id="closeLockBtn" style="margin-top:16px;">понятно</button>
                    </div>
                `;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); overlay.remove(); } });
                document.getElementById('closeLockBtn').addEventListener('click', () => { haptic(); overlay.remove(); });
                return;
            }
            renderSuggestEvent();
        });
    }
}

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

function getPlaceWord(count) {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastDigit === 1 && lastTwoDigits !== 11) return 'место';
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) return 'места';
    return 'мест';
}

function applyImageBlurAndOverlay(container, shouldBlur, imageUrl, overlayImageUrl) {
    if (!container) return;
    const img = container.querySelector('#hikeMainImage');
    const overlayImg = container.querySelector('#soldOutOverlay');
    if (shouldBlur) {
        if (img) img.style.filter = 'blur(6px)';
        if (!overlayImg) {
            const newOverlay = document.createElement('img');
            newOverlay.id = 'soldOutOverlay';
            newOverlay.src = overlayImageUrl;
            newOverlay.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; max-width: 300px; z-index: 10; pointer-events: none;';
            container.style.position = 'relative';
            container.appendChild(newOverlay);
        }
    } else {
        if (img) img.style.filter = '';
        if (overlayImg) overlayImg.remove();
    }
}

let sheetCurrentIndex = 0;
let sheetScrollListener = null;
let dragStartY = 0;
let isDragging = false;
let currentUnsubscribe = null;

const avatarCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

async function getCachedAvatar(userId, photoUrl) {
    const now = Date.now();
    if (avatarCache.has(userId)) {
        const entry = avatarCache.get(userId);
        if (now - entry.timestamp < CACHE_TTL) return entry.url;
    }
    avatarCache.set(userId, { url: photoUrl, timestamp: now });
    return photoUrl;
}

function getAvailableCardsCount() {
    return 10;
}

export function showBottomSheet(index) {
    if (!state.hikesWithTitle.length) return;

    const existingOverlay = document.querySelector('.bottom-sheet-overlay');
    if (existingOverlay) existingOverlay.remove();
    const existingSheetButtons = document.querySelector('.floating-sheet-buttons');
    if (existingSheetButtons) existingSheetButtons.remove();
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
        const hike = state.hikesWithTitle[sheetCurrentIndex];
        if (!hike) return;

        const isWoman = hike.woman === 'yes';
        const isCity = hike.city === true || hike.city === 'yes';
        let accentColor;
        if (isCity) {
            accentColor = '#41B5ED';
        } else if (isWoman) {
            accentColor = '#FB5EB0';
        } else {
            accentColor = 'var(--yellow)';
        }

        if (isCity) {
            contentWrapper.classList.add('city-sheet');
        } else {
            contentWrapper.classList.remove('city-sheet');
        }

        const isCancelled = hike.cancelled === true;
        const isPlaceholder = !hike.title || hike.title.trim() === '';

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
        const hasNext = sheetCurrentIndex < state.hikesWithTitle.length - 1;

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
                    featureTagsHtml += `<span class="feature-tag" style="background: ${accentColor} !important;">${tag}</span>`;
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

        let shareButtonHtml = '';
        if (!isPlaceholder && !isCancelled) {
            let buttonColor, buttonTextColor, buttonText;
            if (isCity) {
                buttonColor = '#41B5ED';
                buttonTextColor = '#ffffff';
                buttonText = 'поделиться событием';
            } else {
                buttonColor = 'var(--yellow)';
                buttonTextColor = '#000000';
                buttonText = 'поделиться хайком';
            }
            shareButtonHtml = `
                <div style="margin-top: 20px; margin-bottom: 16px;">
                    <button class="btn btn-share" id="shareEventBtn" style="background-color: ${buttonColor} !important; color: ${buttonTextColor} !important; font-weight: 800; border-radius: 40px; padding: 12px 24px; width: auto; display: block; margin: 0 auto; border: none;">🔗 ${buttonText}</button>
                </div>
            `;
        }

        const hikeDateObj = new Date(hike.date);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const isPast = hikeDateObj < todayDate;

        let imageHtml = '';
        if (hike.image && !isPlaceholder) {
            const participantText = isPast ? (isCity ? 'были' : 'ходили') : (isCity ? 'будут' : 'идут');
            imageHtml = `
                <div class="image-container">
                    <img src="${hike.image}" class="bottom-sheet-image" loading="lazy" onerror="this.style.display='none'" id="hikeMainImage">
                    <div class="participant-counter" id="participantCounter" data-hike-date="${hike.date}" style="color: ${accentColor};">
                        <span class="participant-text" style="color: ${accentColor};">${participantText}</span>
                        <span class="participant-count" id="participantCountValue" style="color: ${accentColor}; display: none;">0</span>
                        <div class="participant-avatars" id="participantAvatars"></div>
                    </div>
                </div>
            `;
        }

        let extraInfoHtml = '';
        if (!isPast && !isCancelled && !isPlaceholder) {
            extraInfoHtml = '<div class="hike-extra-info">';
            if (hike.start_time) {
                if (isCity) {
                    if (!isGuest) {
                        extraInfoHtml += `
                            <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                                <span class="info-icon" style="color: ${accentColor};">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                </span>
                                <span><strong>начало:</strong> ${hike.start_time}</span>
                            </div>
                        `;
                    } else {
                        extraInfoHtml += `
                            <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                                <span class="info-icon" style="color: ${accentColor};">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                </span>
                                <span><strong>начало:</strong> 🔒</span>
                            </div>
                        `;
                    }
                } else {
                    extraInfoHtml += `
                        <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                            <span class="info-icon" style="color: ${accentColor};">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            </span>
                            <span><strong>начало:</strong> ${hike.start_time}</span>
                        </div>
                    `;
                }
            }
            if (hike.location_link) {
                let locationHtml = '';
                if (hike.location_link.includes('[') && hike.location_link.includes('](')) {
                    locationHtml = parseLinks(hike.location_link, isGuest);
                } else {
                    locationHtml = `<a href="#" data-url="${hike.location_link}" data-guest="${isGuest}" class="dynamic-link">открыть на карте</a>`;
                }
                const locationLabel = isCity ? 'локация' : 'точка сбора';
                extraInfoHtml += `
                    <div class="info-row ${isWoman ? 'woman-row' : ''}" style="color: ${accentColor};">
                        <span class="info-icon" style="color: ${accentColor};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </span>
                        <span><strong>${locationLabel}:</strong> ${locationHtml}</span>
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

        let inviteButtonHtml = '';

        contentWrapper.innerHTML = `
            <div class="bottom-sheet-header-block">
                <div class="bottom-sheet-header">
                    <div class="bottom-sheet-header-left">
                        <div class="bottom-sheet-header-date" style="color: ${accentColor};">${formattedDate}</div>
                        <div class="bottom-sheet-header-title">${isPlaceholder ? 'Готовим хайк' : hike.title}</div>
                    </div>
                    <div class="bottom-sheet-nav">${prevArrow}${nextArrow}</div>
                </div>
                ${tagsHtml}
            </div>
            ${imageHtml}
            ${extraInfoHtml}
            ${sectionsHtml}
            ${shareButtonHtml}
            ${inviteButtonHtml}
        `;

        const shareBtn = contentWrapper.querySelector('#shareEventBtn');
        if (shareBtn) {
            shareBtn.addEventListener('click', (e) => {
                e.preventDefault();
                haptic();
                const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/yaltahiking_bot?startapp=hike_${hike.date}`)}`;
                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink(shareUrl);
                } else {
                    window.open(shareUrl, '_blank');
                }
                log('share_event_click', isGuest, state.user, { hike_date: hike.date });
            });
        }

        if (!isCancelled && !isPlaceholder) {
            const updateAvatars = async (participants) => {
                const count = participants.length;
                const countEl = contentWrapper.querySelector('#participantCountValue');
                const avatarsEl = contentWrapper.querySelector('#participantAvatars');
                if (countEl) {
                    if (count === 0) {
                        countEl.style.display = 'inline';
                        countEl.textContent = count;
                    } else countEl.style.display = 'none';
                }
                if (avatarsEl) {
                    avatarsEl.innerHTML = '';
                    for (const p of participants.slice(0, 3)) {
                        const cachedUrl = await getCachedAvatar(p.userId, p.photoUrl);
                        const hasProfile = !!state.profiles[p.userId];
                        const img = document.createElement('img');
                        img.src = cachedUrl || '';
                        img.className = 'participant-avatar' + (hasProfile ? ' has-profile' : '');
                        img.alt = p.name || '';
                        img.title = p.name || '';
                        img.dataset.userId = p.userId;
                        img.style.cssText = `
                            width: 28px !important;
                            height: 28px !important;
                            border-radius: 50% !important;
                            object-fit: cover !important;
                            box-shadow: 0 0 0 2px rgba(255,255,255,0.3) !important;
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
                                box-shadow: 0 0 0 2px rgba(255,255,255,0.3) !important;
                            `;
                            const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
                            placeholder.textContent = initial;
                            placeholder.dataset.userId = p.userId;
                            this.parentNode.replaceChild(placeholder, this);
                        };
                        avatarsEl.appendChild(img);
                    }
                }
                const imageContainer = contentWrapper.querySelector('.image-container');
                const isSoldOut = count >= 15;
                applyImageBlurAndOverlay(imageContainer, isSoldOut, hike.image, 'https://i.postimg.cc/zGR0SStj/ilrmdosl-2.png');
                window._participantCount = count;
                updateFloatingSheetButtons();
            };

            if (isPast) {
                loadAllParticipants(hike.date).then(updateAvatars);
            } else {
                if (currentUnsubscribe) currentUnsubscribe();
                currentUnsubscribe = subscribeToParticipantCount(hike.date, (count, participants) => {
                    updateAvatars(participants);
                });
            }
        }

        updateFloatingSheetButtons();

        const imageContainer = contentWrapper.querySelector('.image-container');
        const isSoldOut = (window._participantCount || 0) >= 15 && !isPast;
        applyImageBlurAndOverlay(imageContainer, isSoldOut, hike.image, 'https://i.postimg.cc/zGR0SStj/ilrmdosl-2.png');

        const participantCounterEl = document.getElementById('participantCounter');
        if (participantCounterEl) {
            participantCounterEl.removeEventListener('click', participantCounterHandler);
            participantCounterEl.addEventListener('click', participantCounterHandler);
        }

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
            if (sheetCurrentIndex < state.hikesWithTitle.length - 1) {
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

    function participantCounterHandler(e) {
        e.stopPropagation();
        const hike = state.hikesWithTitle[sheetCurrentIndex];
        if (!hike) return;
        toggleParticipantDropdown(e.currentTarget, hike.date);
    }

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

export function closeBottomSheet() {
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
        font-size: 14px; font-weight: 900;
        color: #000;
        transition: left 0.2s ease-out, width 0.25s ease;
        z-index: 2;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        width: ${currentThumbWidth}px;
    `;
    thumb.textContent = thumbText;
    thumb.style.fontWeight = '900';
    if (isBooked) {
        thumb.style.fontStyle = 'italic';
    } else {
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
                    thumb.style.fontWeight = '900';
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
    const hike = state.hikesWithTitle[sheetCurrentIndex];
    if (!hike) return;

    const isPlaceholder = !hike.title || hike.title.trim() === '';
    const isCancelled = hike.cancelled === true;
    const isCity = (hike.city === true || hike.city === 'yes');
    const isGuest = state.userCard.status !== 'active';
    const isPast = new Date(hike.date) < new Date().setHours(0,0,0,0);

    container.innerHTML = '';

    // Городские события: для гостей – баннеры, для владельцев карт – свайп-контрол
    if (isCity && !isPast && !isCancelled && !isPlaceholder) {
        if (isGuest) {
            // Баннер "вход по карте"
            const infoMsg = document.createElement('div');
            infoMsg.className = 'availability-floating';
            infoMsg.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); text-align: center; color: #ffffff;';
            infoMsg.textContent = 'вход по карте интеллигента';
            container.appendChild(infoMsg);

            // Блок доступных карт
            const monthNamesGen = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
            const currentMonthName = monthNamesGen[new Date().getMonth()];
            const availableCards = getAvailableCardsCount();

            const cardsBlock = document.createElement('div');
            cardsBlock.className = 'availability-floating';
            cardsBlock.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); text-align: center;';
            cardsBlock.innerHTML = `
                <div style="font-size: 14px; line-height: 1.4;">
                    <strong style="color: #41B5ED; font-style: italic; font-weight: 800;">в ${currentMonthName} доступно</strong>
                    <span style="color: #ffffff; font-style: italic;"> ${availableCards} из 10 карт</span>
                </div>
                <button id="buyCardFromFloatingBtn" class="btn" style="margin-top: 10px; background-color: #41B5ED; color: #ffffff; font-weight: 800; border-radius: 40px; padding: 8px 20px; border: none; width: auto; display: inline-block;">купить</button>
            `;
            const buyBtn = cardsBlock.querySelector('#buyCardFromFloatingBtn');
            if (buyBtn) {
                buyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    haptic();
                    closeBottomSheet();
                    renderHome();
                    setTimeout(() => {
                        const cardBlock = document.getElementById('cardBlock');
                        if (cardBlock) {
                            cardBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            cardBlock.style.transition = 'box-shadow 0.5s';
                            cardBlock.style.boxShadow = '0 0 20px 5px white';
                            setTimeout(() => { cardBlock.style.boxShadow = ''; }, 2000);
                            const guestAccordion = document.querySelector('#cardAccordionGuest .dropdown-menu');
                            if (guestAccordion && !guestAccordion.classList.contains('show')) {
                                guestAccordion.classList.add('show');
                            }
                        }
                    }, 300);
                    log('buy_card_from_floating_click', true, state.user);
                });
            }
            container.appendChild(cardsBlock);
            return;
        } else {
            // Владельцы карт – показываем интерфейс записи (свайп-контрол)
            const isWoman = hike.woman === 'yes';
            const accentColor = isCity ? '#41B5ED' : (isWoman ? '#FB5EB0' : 'var(--yellow)');
            const isBooked = state.hikeBookingStatus[sheetCurrentIndex] || false;
            const swipeControl = renderSwipeControl({ isBooked, isGuest: false, hike, accentColor });
            if (swipeControl) {
                container.appendChild(swipeControl);
                container.style.pointerEvents = 'auto';
                return;
            }
            // fallback: кнопка "я иду" если свайп не поддерживается
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.justifyContent = 'center';
            row.style.width = '100%';
            const goBtn = document.createElement('a');
            goBtn.href = '#';
            goBtn.className = 'btn btn-yellow btn-glow';
            goBtn.textContent = isBooked ? 'ты записан' : 'я иду';
            goBtn.style.backgroundColor = accentColor;
            goBtn.style.color = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
            goBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const userId = state.user?.id;
                const hikeDate = hike.date;
                const hikeTitle = hike.title;
                if (isBooked) {
                    Promise.all([removeParticipant(hikeDate, userId), setUserRegistrationStatus(userId, hikeDate, false)])
                        .then(() => {
                            delete state.hikeBookingStatus[sheetCurrentIndex];
                            updateRegistrationInSheet(hikeDate, hikeTitle, 'cancelled', '', state.user, true);
                            updateFloatingSheetButtons();
                            renderUserBookings(document.getElementById('userBookingsContainer'));
                            const cal = document.getElementById('calendarContainer');
                            if (cal) renderCalendar(cal);
                        });
                } else {
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
                        });
                }
                log('city_event_action', false, state.user);
            });
            row.appendChild(goBtn);
            container.appendChild(row);
            container.style.pointerEvents = 'auto';
            return;
        }
    }

    // Далее – обычные хайки (не городские)
    if (isPlaceholder) {
        const placeholderMsg = document.createElement('div');
        placeholderMsg.className = 'availability-floating';
        placeholderMsg.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); text-align: center; color: #ffffff;';
        placeholderMsg.textContent = '💫 скоро появится';
        container.appendChild(placeholderMsg);
        return;
    }

    if (isCancelled) {
        const cancelledMsg = document.createElement('div');
        cancelledMsg.className = 'availability-floating';
        cancelledMsg.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 12px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); text-align: center; color: #ffffff;';
        cancelledMsg.textContent = '🚫 хайк отменён';
        container.appendChild(cancelledMsg);
        return;
    }

    const isWoman = hike.woman === 'yes';
    let accentColor;
    if (isCity) {
        accentColor = '#41B5ED';
    } else if (isWoman) {
        accentColor = '#FB5EB0';
    } else {
        accentColor = 'var(--yellow)';
    }
    const isBooked = state.hikeBookingStatus[sheetCurrentIndex] || false;
    const MAX_TICKETS = 15;
    const bookedCount = window._participantCount || 0;
    const available = Math.max(0, MAX_TICKETS - bookedCount);
    const isSoldOut = bookedCount >= MAX_TICKETS;
    const firstName = state.user?.first_name || 'друг';

    if (!isPast && available <= 5) {
        const ticketWord = available === 0 ? 'мест нет' : `${available} ${getPlaceWord(available)}`;
        const progressPercent = Math.round((available / MAX_TICKETS) * 100);
        const availBlock = document.createElement('div');
        availBlock.className = 'availability-floating';
        availBlock.style.cssText = 'margin: 0 auto 6px auto; width: auto; max-width: calc(100% - 32px); border-radius: 28px; padding: 8px 16px; background: rgba(73, 138, 176, 0.15); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 20px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;';

        if (available === 0) {
            if (isGuest) {
                const popupText = (state.popups && state.popups.guest_soldout_message && state.popups.guest_soldout_message.text) || '';
                let messageHtml = '';
                if (popupText.trim()) {
                    let text = popupText.replace(/\[имя\]/gi, firstName);
                    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="dynamic-link" style="color: #D9FD19 !important; text-decoration: none; font-weight: 700; font-style: italic;">$1</a>');
                    text = text.replace(/\n/g, '<br>');
                    messageHtml = text;
                } else {
                    messageHtml = `места закончились, ${firstName} 👀<br>мы собрали полную группу. если кто-то отменит – сможешь записаться.<br>чтобы не ждать случая, ты можешь выпустить именную <a href="#" class="dynamic-link" style="color: #D9FD19 !important; text-decoration: none; font-weight: 700; font-style: italic;" id="cardLinkFromAvailability">карту интеллигента</a> и ходить с нами на хайки даже если мест нет`;
                }
                availBlock.innerHTML = `
                    <div style="font-size: 14px; color: rgba(255,255,255,0.9); line-height: 1.4; text-align: center;">
                        ${messageHtml}
                    </div>
                `;
            } else {
                availBlock.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
                        <span style="font-size: 12px; font-weight: 900; font-style: italic; color: ${accentColor};">осталось:</span>
                        <span style="font-size: 14px; color: #ffffff;">🎟️ ${ticketWord}</span>
                    </div>
                    <div style="font-size: 14px; color: rgba(255,255,255,0.9); margin-top: 4px;">
                        у тебя карта интеллигента, ты можешь идти даже, когда места закончились
                    </div>
                `;
            }
        } else {
            availBlock.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px; white-space: nowrap;">
                        <span style="font-size: 12px; font-weight: 900; font-style: italic; color: ${accentColor};">осталось:</span>
                        <span style="font-size: 14px; color: #ffffff;">🎟️ ${ticketWord}</span>
                    </div>
                    <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${progressPercent}%; height: 100%; background: ${accentColor}; border-radius: 4px; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        }
        container.appendChild(availBlock);

        setTimeout(() => {
            const cardLink = document.getElementById('cardLinkFromAvailability');
            if (cardLink) {
                cardLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    renderHome();
                    setTimeout(() => {
                        const cardBlock = document.getElementById('cardBlock');
                        if (cardBlock) {
                            cardBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            cardBlock.style.transition = 'box-shadow 0.5s';
                            cardBlock.style.boxShadow = '0 0 20px 5px white';
                            setTimeout(() => { cardBlock.style.boxShadow = ''; }, 2000);
                        }
                    }, 300);
                });
            }
        }, 50);
    }

    if (isPast) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = 'center';
        row.style.width = '100%';

        const completedBtn = document.createElement('a');
        completedBtn.href = '#';
        completedBtn.className = 'btn btn-outline';
        completedBtn.textContent = isCity ? 'событие завершено' : 'хайк завершен';
        completedBtn.style.pointerEvents = 'none';
        row.appendChild(completedBtn);

        if (hike.report_link && hike.report_link.trim() !== '') {
            const reportBtn = document.createElement('a');
            reportBtn.href = '#';
            reportBtn.className = 'btn btn-yellow';
            if (isCity) reportBtn.style.backgroundColor = '#41B5ED';
            else if (isWoman) reportBtn.style.backgroundColor = '#FB5EB0';
            else reportBtn.style.backgroundColor = 'var(--yellow)';
            reportBtn.style.color = isCity ? '#ffffff' : '#000000';
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

    if (!isBooked && isSoldOut && isGuest) {
        const nextIndex = sheetCurrentIndex < state.hikesWithTitle.length - 1 ? sheetCurrentIndex + 1 : 0;
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-outline';
        nextBtn.style.cssText = 'width: calc(100% - 32px); margin: 0 16px; padding: 16px; border-radius: 40px; font-weight: 900; font-size: 16px;';
        nextBtn.textContent = 'следующий хайк ›';
        nextBtn.addEventListener('click', () => {
            haptic();
            closeParticipantDropdown();
            closeLeaderDropdown();
            sheetCurrentIndex = nextIndex;
            window._participantCount = 0;
            updateContent();
            contentWrapper.scrollTop = 0;
        });
        container.appendChild(nextBtn);
        container.style.pointerEvents = 'auto';
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
        goBtn.style.backgroundColor = accentColor;
        goBtn.style.color = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
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
        goBtn.style.fontWeight = '900';
        goBtn.style.backgroundColor = accentColor;
        goBtn.style.color = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
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
    goBtn.style.fontWeight = '900';
    goBtn.style.backgroundColor = accentColor;
    goBtn.style.color = accentColor === '#41B5ED' ? '#ffffff' : '#000000';
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

export function showGuestBookingPopup(hikeDate, hikeTitle, onClose) {
    haptic();
    const config = state.popupConfig;

    let popupText = 'чтобы забронировать место на хайк нужно приобрести билет или карту интеллигента';
    if (state.popups && state.popups.guest_booking_popup && state.popups.guest_booking_popup.text) {
        popupText = state.popups.guest_booking_popup.text;
    }

    window._bookingPopupHikeDate = hikeDate;
    window._bookingPopupHikeIndex = state.hikesWithTitle.findIndex(h => h.date === hikeDate);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestBookingPopup';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 500px; padding: 20px;">
            <button class="modal-close" id="closePopup">&times;</button>
            <div class="modal-title">регистрация на хайк</div>
            <div class="modal-text" style="margin-bottom: 16px;">${popupText}</div>
            
            <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                <button class="btn btn-yellow" id="buyCardBtn" style="width: 100%; margin: 0;">оформить карту</button>
                <div id="cardAccordionPopup" style="width: 100%;">
                    <div id="cardOptions" style="display: none; margin-top: 8px;">
                        <button class="btn btn-outline" id="goToPrivilegesPopupBtn" style="width: 100%; margin: 0 0 8px 0;">узнать о привилегиях</button>
                        <div style="display: flex; flex-direction: row; gap: 8px; width: 100%;">
                            <button class="btn btn-outline" id="buySeasonCardBtn" style="flex: 1; margin: 0; box-sizing: border-box;">сезонная</button>
                            <button class="btn btn-outline" id="buyPermanentCardBtn" style="flex: 1; margin: 0; box-sizing: border-box;">бессрочная</button>
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: rgba(255,255,255,0.7); font-size: 12px;">
                            <div style="flex: 1;">сезон 2026</div>
                            <div style="flex: 1;">навсегда</div>
                        </div>
                        <div style="display: flex; flex-direction: row; gap: 8px; margin-top: 4px; width: 100%; text-align: center; color: #ffffff; font-size: 14px;">
                            <div style="flex: 1;">${config.seasonCardPrice} ₽</div>
                            <div style="flex: 1;">${config.permanentCardPrice} ₽</div>
                        </div>
                    </div>
                </div>
                <button class="btn btn-outline" id="freeRegistrationBtn" style="width: 100%; margin: 0; padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.1); color: #ffffff; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.2); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); font-weight: 500; font-size: 16px;">иду впервые 🎟️</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const closePopup = () => {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (onClose) onClose();
    };

    document.getElementById('closePopup').addEventListener('click', () => {
        haptic();
        closePopup();
    });
    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            haptic();
            closePopup();
        }
    });

    document.getElementById('goToPrivilegesPopupBtn').addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        closePopup();
        closeBottomSheet();
        setTimeout(() => {
            renderGuestPrivileges(true);
        }, 150);
    });

    const buyCardBtn = document.getElementById('buyCardBtn');
    const cardOptions = document.getElementById('cardOptions');
    if (buyCardBtn && cardOptions) {
        buyCardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            if (cardOptions.style.display === 'none' || cardOptions.style.display === '')
                cardOptions.style.display = 'block';
            else
                cardOptions.style.display = 'none';
        });
    }

    document.getElementById('freeRegistrationBtn').addEventListener('click', e => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';

        haptic();
        tg?.HapticFeedback?.impactOccurred('heavy');
        setTimeout(() => tg?.HapticFeedback?.impactOccurred('heavy'), 70);

        const userId = state.user?.id;
        addParticipant(hikeDate, userId, {
            first_name: state.user?.first_name,
            photo_url: state.user?.photo_url,
        })
            .then(() => setUserRegistrationStatus(userId, hikeDate, true))
            .then(() => {
                const hikeIndex = state.hikesWithTitle.findIndex(h => h.date === hikeDate);
                if (hikeIndex !== -1) state.hikeBookingStatus[hikeIndex] = true;
                if (state.userCard.status !== 'active') saveBookingStatusToLocal();
                updateFloatingSheetButtons();
                renderUserBookings(document.getElementById('userBookingsContainer'));
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer) renderCalendar(calendarContainer);
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'free_first', state.user, false);
                closePopup();
            })
            .catch(error => {
                console.error(error);
                alert('Ошибка при регистрации. Попробуйте ещё раз.');
            });

        log('free_first_click', true, state.user);
    });

    document.getElementById('buySeasonCardBtn')?.addEventListener('click', e => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        const userId = state.user?.id;
        addParticipant(hikeDate, userId, {
            first_name: state.user?.first_name,
            photo_url: state.user?.photo_url,
        })
            .then(() => setUserRegistrationStatus(userId, hikeDate, true))
            .then(() => {
                const hikeIndex = state.hikesWithTitle.findIndex(h => h.date === hikeDate);
                if (hikeIndex !== -1) state.hikeBookingStatus[hikeIndex] = true;
                if (state.userCard.status !== 'active') saveBookingStatusToLocal();
                updateFloatingSheetButtons();
                renderUserBookings(document.getElementById('userBookingsContainer'));
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer) renderCalendar(calendarContainer);
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'season_card', state.user, false);
                openLink(SEASON_CARD_LINK, 'season_card_click', true);
                closePopup();
            })
            .catch(error => {
                console.error(error);
                alert('Ошибка при регистрации. Попробуйте ещё раз.');
            });
    });

    document.getElementById('buyPermanentCardBtn')?.addEventListener('click', e => {
        e.preventDefault();
        if (e.target.dataset.processing === 'true') return;
        e.target.dataset.processing = 'true';
        const userId = state.user?.id;
        addParticipant(hikeDate, userId, {
            first_name: state.user?.first_name,
            photo_url: state.user?.photo_url,
        })
            .then(() => setUserRegistrationStatus(userId, hikeDate, true))
            .then(() => {
                const hikeIndex = state.hikesWithTitle.findIndex(h => h.date === hikeDate);
                if (hikeIndex !== -1) state.hikeBookingStatus[hikeIndex] = true;
                if (state.userCard.status !== 'active') saveBookingStatusToLocal();
                updateFloatingSheetButtons();
                renderUserBookings(document.getElementById('userBookingsContainer'));
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer) renderCalendar(calendarContainer);
                updateRegistrationInSheet(hikeDate, hikeTitle, 'booked', 'permanent_card', state.user, false);
                openLink(PERMANENT_CARD_LINK, 'permanent_card_click', true);
                closePopup();
            })
            .catch(error => {
                console.error(error);
                alert('Ошибка при регистрации. Попробуйте ещё раз.');
            });
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

// ==================== ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ ССЫЛОК ====================
document.addEventListener('click', function(e) {
    const dynamicLink = e.target.closest('.dynamic-link');
    if (dynamicLink) {
        e.preventDefault();
        const url = dynamicLink.getAttribute('data-url');
        const isGuest = dynamicLink.getAttribute('data-guest') === 'true';
        if (url) {
            openLink(url, 'dynamic_link_click', isGuest);
        }
        return;
    }
});
