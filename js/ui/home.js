// js/ui/home.js
import { haptic, openLink, parseLinks, formatDateForDisplay, mainDiv, subtitle, tg, showConfetti } from '../utils.js';
import { state, saveBookingStatusToLocal } from '../state.js';
import { log, updateRegistrationInSheet } from '../api.js';
import { getDatabase, addParticipant, removeParticipant, setUserRegistrationStatus, loadPopups, loadAllProfiles } from '../firebase.js';
import { SEASON_CARD_LINK, PERMANENT_CARD_LINK } from '../config.js';
import { showBottomNav, setupBottomNav, setUserInteracted, showBack, hideBack, cleanupProfileOverlays } from './common.js';
import { renderCalendar, showBottomSheet, showGuestBookingPopup, showHikePickerSheet, getAvailableCardsCount } from './calendar.js';
import { renderNewcomerPage, renderPriv, renderGuestPrivileges, renderSafetyPage } from './privileges.js';
import { renderProfiles } from './profiles.js';
import { renderWeatherBlock, initWeatherBlock } from './weather.js';
import { openOnboardingChat } from './onboarding-chat.js';

export function removeStickyHikeCta() {
    document.getElementById('stickyHikeCta')?.remove();
}

// Приветствие по времени суток (по локальному времени устройства)
function timeGreeting(firstName) {
    const h = new Date().getHours();
    let word, emoji;
    if (h >= 5 && h < 12) { word = 'доброе утро'; emoji = '🌤️'; }
    else if (h >= 12 && h < 18) { word = 'хорошего дня'; emoji = '☀️'; }
    else { word = 'доброй ночи'; emoji = '🌙'; }
    return `${emoji} ${word}, ${firstName}!`;
}

function mountStickyHikeCta() {
    removeStickyHikeCta();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let nextHikeIndex = -1;
    for (let i = 0; i < (state.hikesWithTitle || []).length; i++) {
        const h = state.hikesWithTitle[i];
        const d = new Date(h.date);
        if (d >= today && !h.cancelled && h.city !== true && h.city !== 'yes') {
            nextHikeIndex = i;
            break;
        }
    }
    if (nextHikeIndex === -1) return;
    const hike = state.hikesWithTitle[nextHikeIndex];
    const dateStr = formatDateForDisplay(hike.date);
    const cta = document.createElement('div');
    cta.id = 'stickyHikeCta';
    cta.className = 'sticky-hike-cta';
    cta.innerHTML = `<button class="btn btn-yellow sticky-hike-btn" id="stickyHikeBtn">записаться на хайк · ${dateStr}</button>`;
    document.body.appendChild(cta);
    document.getElementById('stickyHikeBtn').addEventListener('click', () => {
        haptic();
        log('sticky cta', true, state.user);
        showBottomSheet(nextHikeIndex);
    });
}

function getCurrentTopOffset() {
    if (!tg) return 76;
    const safeTop = tg.contentSafeAreaInset?.top || 0;
    return safeTop + 60;
}

function scrollToCalendarAndHighlight() {
    const calendar = document.getElementById('calendarContainer');
    if (!calendar) return;
    const offset = getCurrentTopOffset();
    const rect = calendar.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const targetY = rect.top + scrollTop - offset;
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    calendar.style.transition = 'box-shadow 0.5s';
    calendar.style.boxShadow = '0 0 20px 5px rgba(255,255,255,0.7)';
    setTimeout(() => { calendar.style.boxShadow = ''; }, 1500);
}

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
    state.hikesWithTitle.forEach((hike, index) => {
        if (state.hikeBookingStatus[index]) {
            const hikeDate = new Date(hike.date);
            if (hikeDate >= today) bookings.push({ ...hike, index });
        }
    });

    if (bookings.length === 0) {
        const isGuest = state.userCard?.status !== 'active';
        if (isGuest) {
            container.style.display = 'block';
            container.innerHTML = `
                <div class="card-container" id="userBookingsCard">
                    <h2 class="section-title">🎫 мои записи</h2>
                    <div style="margin: 0 16px 12px; padding: 14px; background: rgba(255,255,255,0.08); backdrop-filter: blur(16px) saturate(110%); -webkit-backdrop-filter: blur(16px) saturate(110%); border-radius: 14px; border: 1px solid rgba(255,255,255,0.18); box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);">
                        <span style="color: #ffffff; font-size: 14px;">здесь будут твои записи на хайки и события</span>
                    </div>
                </div>
            `;
            return;
        }
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
        const isCity = booking.city === true || booking.city === 'yes';
        const isBookClub = booking.book_club === true;
        const accentColor = isBookClub ? '#FFF1B2' : (isCity ? '#41B5ED' : (isWoman ? '#FB5EB0' : 'var(--yellow)'));
        const dateParts = booking.date.split('-');
        const day = parseInt(dateParts[2], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const formattedDate = `${day} ${monthNames[month]}`;
        let title = booking.title;
        const prefixes = ['тропа на ', 'тропа ', 'маршрут ', 'хайк на ', 'хайк ', 'гора ', 'ущелье ', 'путь на ', 'восхождение на '];
        let cleanedTitle = title;
        for (let prefix of prefixes) {
            if (cleanedTitle.toLowerCase().startsWith(prefix)) {
                cleanedTitle = cleanedTitle.substring(prefix.length);
                break;
            }
        }
        if (cleanedTitle.toLowerCase().startsWith('на ')) cleanedTitle = cleanedTitle.substring(3);
        cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
        
        let eventType, displayTitle;
        if (isBookClub) {
            displayTitle = booking.title;
        } else if (isCity) {
            eventType = 'событие';
            const lowerTitle = cleanedTitle.charAt(0).toLowerCase() + cleanedTitle.slice(1);
            displayTitle = `${eventType} ${lowerTitle}`;
        } else {
            eventType = 'хайк на';
            displayTitle = `${eventType} ${cleanedTitle}`;
        }
        
        // Для city-событий кнопка голубая с белым текстом
        let buttonColor, buttonTextColor;
        if (isCity) {
            buttonColor = '#41B5ED';
            buttonTextColor = '#ffffff';
        } else {
            buttonColor = accentColor;
            buttonTextColor = '#000000';
        }
        
        html += `
            <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 16px 12px 16px; padding: 12px; background-color: rgba(255,255,255,0.1); border-radius: 12px; backdrop-filter: blur(4px);">
                <div style="flex: 1; margin-right: 16px;">
                    <span style="color: ${accentColor}; font-weight: 900; font-style: italic;">${formattedDate}</span>
                    <span style="color: #ffffff; margin-left: 8px;">${displayTitle}</span>
                </div>
                <button class="btn btn-yellow booking-detail-btn" data-index="${booking.index}" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0; background-color: ${buttonColor}; color: ${buttonTextColor};">детали</button>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.booking-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            haptic();
            log('детали бронирования из главной', false, state.user);
            const index = parseInt(btn.dataset.index, 10);
            showBottomSheet(index);
        });
    });
}

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
                const dateStr = item.date.split('T')[0];
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
                ? `<button class="btn btn-outline guest-read-btn" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0;">🔒</button>`
                : `<a href="${item.link}" target="_blank" class="btn btn-yellow mastermind-read-link" style="width: auto; margin: 0; padding: 8px 16px; flex-shrink: 0; text-decoration: none;" data-date="${item.date}" data-title="${item.title || ''}">читать</a>`;
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
            <h2 class="section-title" style="margin: 0 16px 16px 16px;">
                🧠 саммари мастермайнда
                <span class="new-badge">новое</span>
            </h2>
            ${innerHtml}
        </div>
    `;
}

function renderSafetyBanner() {
    const s = state.safety;
    if (!s || !s.active) return '';
    const label = s.banner || '🆘 на случай ЧП — будь наготове';
    return `
        <div class="safety-banner" id="safetyBanner">
            <span class="safety-banner-text">${label}</span>
            <span class="safety-banner-arrow">›</span>
        </div>
    `;
}

function wireSafetyBanner() {
    document.getElementById('safetyBanner')?.addEventListener('click', () => {
        haptic();
        log('баннер ЧП', state.userCard.status !== 'active', state.user);
        renderSafetyPage(state.userCard.status !== 'active');
    });
}

function renderTestimonialsBlock() {
    const items = (state.testimonials || []).filter(t => t && (t.text || t.quote));
    if (!items.length) return '<div id="testimonialsContainer"></div>';

    let cards = '';
    items.forEach(t => {
        const text = t.text || t.quote || '';
        const name = t.name || '';
        const meta = t.meta || t.role || (t.hikes ? `${t.hikes} хайков в клубе` : '');
        const photo = t.photo || t.avatar || '';
        const avatar = photo
            ? `<img src="${photo}" class="tst-avatar" onerror="this.style.display='none'">`
            : `<div class="tst-avatar tst-avatar-ph">${(name.charAt(0) || '🙂').toUpperCase()}</div>`;
        cards += `
            <div class="tst-card">
                <div class="tst-quote">«${text}»</div>
                <div class="tst-author">
                    ${avatar}
                    <div class="tst-author-meta">
                        <div class="tst-name">${name}</div>
                        ${meta ? `<div class="tst-role">${meta}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    });

    return `
        <div class="card-container" id="testimonialsContainer">
            <h2 class="section-title" style="margin: 0 16px 16px 16px;">💬 почему остаются</h2>
            <div class="tst-scroller">${cards}</div>
        </div>
    `;
}

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
            <h2 class="section-title" style="margin: 0 16px 16px 16px;">
                📨 обновления
            </h2>
            <div class="updates-scroll">${itemsHtml}</div>
        </div>
    `;
}

function handleGuestRead(e) {
    e.preventDefault();
    log('мастермайнд', true, state.user);
    showGuestMastermindPopup();
}

async function showGuestMastermindPopup() {
    haptic();
    showGuestBookingPopup(null, null, null, 'mastermind');
}

let _hikePreviewUnsub = null;
let _ctaTimer = null;

const GUEST_QA = [
    { q: 'хочется выдохнуть?', btns: ['хочется', 'прямо сейчас'], a: 'горный воздух – лучший терапевт' },
    { q: 'когда последний раз делал что-то впервые?', btns: ['не помню…', 'давно'], a: 'первый хайк – бесплатно' },
    { q: 'надоело знакомиться через экран?', btns: ['надоело', 'а как?'], a: 'тропа знакомит честнее тиндера' },
    { q: 'хочется кружиться с раскинутыми руками?', btns: ['хочется!', 'а где?'], a: '500+ метров над Ялтой' },
    { q: 'не можешь найти своих людей?', btns: ['не могу', 'а где они?'], a: 'они уже здесь' },
];

function renderGuestHome() {
    if (_hikePreviewUnsub) { _hikePreviewUnsub(); _hikePreviewUnsub = null; }
    clearTimeout(_ctaTimer);
    cleanupProfileOverlays();
    const firstName = state.user?.first_name || 'друг';
    subtitle().textContent = timeGreeting(firstName);
    subtitle().classList.add('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextHikeIdx = (state.hikesWithTitle || []).findIndex(
        h => h.date && !h.cancelled && h.city !== true && h.city !== 'yes' && new Date(h.date) >= today
    );
    const nextHike = nextHikeIdx >= 0 ? state.hikesWithTitle[nextHikeIdx] : null;

    const cardsLeft = getAvailableCardsCount();
    const months = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
    let badgeText = '🔒 карта интеллигента';
    if (cardsLeft > 0) {
        const word = cardsLeft === 1 ? 'карта' : cardsLeft < 5 ? 'карты' : 'карт';
        badgeText = `🔒 осталось ${cardsLeft} ${word} в ${months[new Date().getMonth()]}`;
    }

    const cardHtml = `
        <div class="card-container" id="cardBlock">
            <div class="card-image-wrap">
                <img src="https://i.postimg.cc/J0GyF5Nw/fwvsvfw.png" alt="карта заглушка" class="card-image" id="guestCardImage">
                <div class="card-badge" id="cardBadge">
                    <span class="card-badge-label">${badgeText}</span>
                    <button class="card-badge-btn" id="cardBadgeBtn">как получить?</button>
                </div>
            </div>
        </div>
        <div class="card-container" id="chatBlock">
            <h2 class="section-title">💬 интеллигентный помощник</h2>
            <div class="guest-chat">
                <div class="gc-inner">
                    <div class="gc-viewport">
                        <div class="gc-thread" id="gcThread"></div>
                    </div>
                </div>
                <div class="gc-chips" id="gcChips"></div>
            </div>
        </div>
    `;

    main.innerHTML = `
        ${renderSafetyBanner()}
        ${cardHtml}
        <div id="userBookingsContainer"></div>
        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest"><span class="newcomer-text">как всё устроено</span><img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image"></div>
        </div>
        <div class="card-container" id="calendarContainer"></div>
        ${renderWeatherBlock()}
        <div class="card-container">
            <div class="metrics-header"><h2 class="metrics-title">🌍 клуб в цифрах</h2><a href="https://t.me/yaltahiking/148" class="metrics-link dynamic-link" data-url="https://t.me/yaltahiking/148" data-guest="true">смотреть отчёты &gt;</a></div>
            <div class="metrics-grid">
                <div class="metric-item"><div class="metric-label">хайков</div><div class="metric-value" data-metric="hikes">${state.metrics.hikes}</div></div>
                <div class="metric-item"><div class="metric-label">локаций</div><div class="metric-value" data-metric="locations">${state.metrics.locations}</div></div>
                <div class="metric-item"><div class="metric-label">километров</div><div class="metric-value" data-metric="kilometers">${state.metrics.kilometers}</div></div>
                <div class="metric-item"><div class="metric-label">знакомств</div><div class="metric-value" data-metric="meetings">${state.metrics.meetings}</div></div>
            </div>
        </div>
        ${renderTestimonialsBlock()}
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
        ${renderUpdatesBlock()}
    `;

    wireSafetyBanner();
    document.getElementById('guestCardImage')?.addEventListener('click', () => { haptic(); showGuestPopup(); });
    document.getElementById('cardBadgeBtn')?.addEventListener('click', () => {
        haptic();
        log('как получить карту', true, state.user);
        showGuestBookingPopup(nextHike?.date, nextHike?.title);
    });

    // Q&A диалог с кнопками-ответами
    const gcThread = document.getElementById('gcThread');
    const gcChips = document.getElementById('gcChips');

    if (gcThread && gcChips) {
        let qaIdx = Math.floor(Math.random() * GUEST_QA.length);
        let busy = false;

        const addBubble = (text, cls) => {
            const row = document.createElement('div');
            row.className = 'gc-row ' + (cls === 'gc-out' ? 'gc-row-out' : 'gc-row-in');
            const b = document.createElement('span');
            b.className = 'gc-bub ' + cls;
            if (cls === 'gc-typing') b.innerHTML = '<i></i><i></i><i></i>';
            else b.textContent = text;
            row.appendChild(b);
            gcThread.appendChild(row);
            return row;
        };

        const showChips = (labels, onPick) => {
            gcChips.innerHTML = '';

            const chatBtn = document.createElement('button');
            chatBtn.className = 'gc-chip-chat';
            chatBtn.textContent = 'в чат';
            chatBtn.addEventListener('click', () => {
                haptic();
                log('в чат из qa', true, state.user);
                openOnboardingChat();
            });
            gcChips.appendChild(chatBtn);

            const right = document.createElement('div');
            right.className = 'gc-chips-right';
            labels.forEach(label => {
                const chip = document.createElement('button');
                chip.className = 'gc-chip';
                chip.textContent = label;
                chip.addEventListener('click', () => { haptic(); onPick(label); });
                right.appendChild(chip);
            });
            gcChips.appendChild(right);
        };

        const showHikeChip = () => {
            if (!nextHike) return;
            const chip = document.createElement('button');
            chip.className = 'gc-chip gc-chip-hike';
            chip.textContent = 'пойти на хайк →';
            chip.addEventListener('click', () => {
                haptic();
                log('пойти на хайк из qa', true, state.user);
                showBottomSheet(nextHikeIdx);
            });
            gcChips.appendChild(chip);
        };

        const startRound = (i) => {
            clearTimeout(_ctaTimer);
            qaIdx = ((i % GUEST_QA.length) + GUEST_QA.length) % GUEST_QA.length;
            busy = false;
            const pair = GUEST_QA[qaIdx];

            gcThread.classList.add('gc-thread-exit');
            setTimeout(() => {
                gcThread.classList.remove('gc-thread-exit');
                gcThread.innerHTML = '';
                gcChips.innerHTML = '';
                addBubble(pair.q, 'gc-in');

                showChips(pair.btns, (picked) => {
                    if (busy) return;
                    busy = true;
                    gcChips.innerHTML = '';
                    addBubble(picked, 'gc-out');
                    log('qa ответ', true, state.user, { idx: String(qaIdx), btn: picked });

                    const typingRow = addBubble('', 'gc-typing');
                    setTimeout(() => {
                        typingRow.remove();
                        addBubble(pair.a, 'gc-in gc-answer');
                        showHikeChip();
                        _ctaTimer = setTimeout(() => startRound(qaIdx + 1), 5000);
                    }, 900);
                });
            }, 350);
        };

        // первый раунд без exit-анимации
        const pair = GUEST_QA[qaIdx];
        addBubble(pair.q, 'gc-in');
        showChips(pair.btns, (picked) => {
            if (busy) return;
            busy = true;
            gcChips.innerHTML = '';
            addBubble(picked, 'gc-out');
            log('qa ответ', true, state.user, { idx: String(qaIdx), btn: picked });
            const typingRow = addBubble('', 'gc-typing');
            setTimeout(() => {
                typingRow.remove();
                addBubble(pair.a, 'gc-in gc-answer');
                showHikeChip();
                _ctaTimer = setTimeout(() => startRound(qaIdx + 1), 5000);
            }, 900);
        });

    }

    // новичкам
    document.getElementById('newcomerBtnGuest')?.addEventListener('click', () => {
        haptic(); setUserInteracted();
        log('новичкам', true, state.user);
        openOnboardingChat('faq');
    });

    // аватарки членов клуба (лениво)
    loadAllProfiles().then(profiles => {
        state.profiles = profiles;
        const arr = Object.values(profiles || {}).filter(p => p && (p.avatarUrl || p.photoUrl));
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        const el = document.getElementById('guestClubAvatars');
        if (el) {
            el.innerHTML = arr.slice(0, 4).map(p =>
                `<img src="${p.avatarUrl || p.photoUrl}" class="guest-club-avatar" onerror="this.remove()">`
            ).join('');
        }
    }).catch(() => {});

    const readButtons = document.querySelectorAll('.guest-read-btn');
    readButtons.forEach(btn => {
        btn.removeEventListener('click', handleGuestRead);
        btn.addEventListener('click', handleGuestRead);
    });

    renderUserBookings(document.getElementById('userBookingsContainer'));
    renderCalendar(document.getElementById('calendarContainer'));
    initWeatherBlock();

    const goBtn = document.querySelector('.booking-go-btn');
    if (goBtn) {
        goBtn.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            scrollToCalendarAndHighlight();
            log('мне повезёт', true, state.user);
        });
    }

    setupBottomNav();
}

async function showGuestPopup() {
    haptic();
    log('попап гостя', true, state.user);
    showGuestBookingPopup(null, null, null, 'generic');
}

function renderOwnerHome() {
    cleanupProfileOverlays();
    const user = state.user;
    const firstName = user?.first_name || 'друг';
    subtitle().textContent = timeGreeting(firstName);
    subtitle().classList.remove('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();
    main.innerHTML = `
        ${renderSafetyBanner()}
        <div class="card-container" id="cardBlock">
            <img src="${state.userCard.cardUrl}" alt="карта" class="card-image" id="ownerCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">${state.userCard.hikes}</span></div>
            <div style="display: flex; gap: 12px; margin: 0 16px 12px 16px;">
                <a href="#" class="btn btn-yellow" id="privBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">привилегии</a>
                <a href="#" class="btn btn-outline" id="supportBtn" style="flex: 1; margin: 0; height: 52px; display: flex; align-items: center; justify-content: center;">поддержка</a>
            </div>
        </div>
        <div id="userBookingsContainer"></div>
        <div class="card-container" id="calendarContainer"></div>
        ${renderWeatherBlock()}
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
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

    wireSafetyBanner();
    document.getElementById('ownerCardImage')?.addEventListener('click', () => {
        haptic();
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        showConfetti();
        log('карта', false, user);
    });
    document.getElementById('privBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); log('привилегии', false, user); renderPriv(); });
    document.getElementById('supportBtn')?.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/hellointelligent', 'поддержка', false); });
    document.getElementById('newcomerBtn')?.addEventListener('click', () => { haptic(); setUserInteracted(); log('новичкам', false, user); renderNewcomerPage(false); });

    document.querySelectorAll('.mastermind-read-link').forEach(link => {
        link.addEventListener('click', () => {
            log('мастермайнд', false, state.user);
        });
    });

    renderUserBookings(document.getElementById('userBookingsContainer'));
    renderCalendar(document.getElementById('calendarContainer'));
    initWeatherBlock();

    const goBtn = document.querySelector('.booking-go-btn');
    if (goBtn) {
        goBtn.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            scrollToCalendarAndHighlight();
            log('мне повезёт', false, state.user);
        });
    }

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

    loadPopups().then(freshPopups => {
        if (freshPopups && Object.keys(freshPopups).length) {
            state.popups = freshPopups;
        }
    }).catch(err => {
        console.warn('Не удалось загрузить попапы при старте:', err);
    });

    if (state.userCard.status === 'active' && state.userCard.cardUrl) {
        renderOwnerHome();
    } else {
        renderGuestHome();
    }
}
