// js/ui/home.js
import { haptic, openLink, parseLinks, formatDateForDisplay, mainDiv, subtitle, tg, showConfetti } from '../utils.js';
import { state, saveBookingStatusToLocal } from '../state.js';
import { log, updateRegistrationInSheet } from '../api.js';
import { getDatabase, addParticipant, removeParticipant, setUserRegistrationStatus, loadPopups, loadAllProfiles } from '../firebase.js';
import { SEASON_CARD_LINK, PERMANENT_CARD_LINK } from '../config.js';
import { showBottomNav, setupBottomNav, setUserInteracted, showBack, hideBack, cleanupProfileOverlays } from './common.js';
import { renderCalendar, showBottomSheet, showGuestBookingPopup } from './calendar.js';
import { renderNewcomerPage, renderPriv, renderGuestPrivileges } from './privileges.js';
import { renderProfiles } from './profiles.js';
import { renderWeatherBlock, initWeatherBlock } from './weather.js';
import { openOnboardingChat } from './onboarding-chat.js';

export function removeStickyHikeCta() {
    document.getElementById('stickyHikeCta')?.remove();
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
        const accentColor = isCity ? '#41B5ED' : (isWoman ? '#FB5EB0' : 'var(--yellow)');
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
        if (isCity) {
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
    const popup = (state.popups && state.popups.guest_mastermind_popup) || {
        title: '🧠 саммари мастермайнда',
        text: 'чтобы получить доступ к разделу саммари, тебе понадобится карта интеллигента. с ней в клубе можно всё: не нужно покупать билеты на хайкинг, можно получать скидки в городе, читать саммари, подключить наши три буквы и... короче, хочешь обо всём узнать?',
        button_text: 'расскажите скорее'
    };
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 360px;">
            <div class="modal-title">${popup.title}</div>
            <div class="modal-text" style="font-size: 14px;">${popup.text}</div>
            <img src="${state.appBanners?.guest_card_banner || ''}" class="guest-card-banner" onerror="this.style.display='none'">
            <button class="btn btn-yellow" id="goToPrivilegesFromMastermindBtn" style="margin-top: 16px;">${popup.button_text}</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); overlay.remove(); } });
    document.getElementById('goToPrivilegesFromMastermindBtn').addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        overlay.remove();
        renderGuestPrivileges();
    });
}

function renderGuestHome() {
    cleanupProfileOverlays();
    const firstName = state.user?.first_name || 'друг';
    subtitle().textContent = '\u{1F44B}\u{1F3FB} привет, ' + firstName + '!';
    subtitle().classList.add('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();

    // ближайший предстоящий хайк (не city, не cancelled)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let nextHikeIndex = -1;
    for (let i = 0; i < (state.hikesWithTitle || []).length; i++) {
        const h = state.hikesWithTitle[i];
        if (new Date(h.date) >= today && !h.cancelled && h.city !== true && h.city !== 'yes') {
            nextHikeIndex = i;
            break;
        }
    }
    const nextHike = nextHikeIndex !== -1 ? state.hikesWithTitle[nextHikeIndex] : null;
    const formattedNextDate = nextHike ? formatDateForDisplay(nextHike.date) : '';
    const membersText = state.popupConfig?.membersText || '20+';

    const heroHtml = nextHike ? `
        <div class="card-container guest-hero-card" id="cardBlock">
            <div class="guest-hero-image-wrap">
                ${nextHike.image
                    ? `<img src="${nextHike.image}" class="guest-hero-image" alt="${nextHike.title}" onerror="this.style.display='none'">`
                    : ''}
                <div class="guest-hero-overlay"></div>
                <div class="guest-hero-info">
                    <div class="guest-hero-date">${formattedNextDate}</div>
                    <div class="guest-hero-title">${nextHike.title}</div>
                </div>
            </div>
            <div class="guest-hero-actions">
                <button class="btn btn-yellow guest-hero-btn" id="guestHeroRegBtn">записаться на хайк</button>
            </div>
        </div>
    ` : `
        <div class="card-container" id="cardBlock">
            <img src="https://i.postimg.cc/J0GyF5Nw/fwvsvfw.png" alt="карта заглушка" class="card-image" id="guestCardImage">
            <div class="hike-counter"><span>⛰️ пройдено хайков</span><span class="counter-number">?</span></div>
        </div>
    `;

    main.innerHTML = `
        ${heroHtml}
        <div id="userBookingsContainer"></div>
        <div class="card-container">
            <h2 class="section-title">🫖 для новичков</h2>
            <div class="btn-newcomer" id="newcomerBtnGuest"><span class="newcomer-text">как всё устроено</span><img src="https://i.postimg.cc/hjdtPQgV/sdvsd.png" alt="новичкам" class="newcomer-image"></div>
        </div>
        <div class="card-container guest-club-card" id="guestClubBlock">
            <div class="guest-club-proof">
                <div class="guest-club-avatars" id="guestClubAvatars"></div>
                <div class="guest-club-members"><strong>${membersText} человек</strong> уже в клубе</div>
            </div>
            <ul class="guest-club-perks">
                <li><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#27ae60"/><path d="M4.5 8.5l2 2 5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>хайкинг каждые выходные</li>
                <li><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#27ae60"/><path d="M4.5 8.5l2 2 5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>новые знакомства</li>
                <li><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#27ae60"/><path d="M4.5 8.5l2 2 5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>события в городе с членами клуба</li>
                <li><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#27ae60"/><path d="M4.5 8.5l2 2 5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>безлимитный VPN</li>
                <li><svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="#27ae60"/><path d="M4.5 8.5l2 2 5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>привилегии у партнёров в городе и онлайне</li>
            </ul>
            <div class="guest-club-actions">
                <button class="btn btn-outline" id="guestPrivilegesBtn">узнать о привилегиях 💳</button>
                <button class="btn btn-yellow" id="guestJoinClubBtn">вступить в клуб</button>
            </div>
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
        <div id="mastermindSummariesContainer">${renderMastermindSummaries()}</div>
        ${renderUpdatesBlock()}
    `;

    // hero: кнопка "записаться"
    if (nextHike) {
        document.getElementById('guestHeroRegBtn')?.addEventListener('click', () => {
            haptic();
            log('hero записаться', true, state.user);
            showGuestBookingPopup(nextHike.date, nextHike.title);
        });
    } else {
        document.getElementById('guestCardImage')?.addEventListener('click', () => { haptic(); showGuestPopup(); });
    }

    // новичкам
    document.getElementById('newcomerBtnGuest')?.addEventListener('click', () => {
        haptic(); setUserInteracted();
        log('новичкам', true, state.user);
        openOnboardingChat();
    });

    // клуб-блок
    document.getElementById('guestPrivilegesBtn')?.addEventListener('click', (e) => {
        e.preventDefault(); haptic();
        log('привилегии из главной', true, state.user);
        renderGuestPrivileges();
    });
    document.getElementById('guestJoinClubBtn')?.addEventListener('click', (e) => {
        e.preventDefault(); haptic();
        log('вступить в клуб из главной', true, state.user);
        if (nextHike) {
            showGuestBookingPopup(nextHike.date, nextHike.title);
        } else {
            renderGuestPrivileges();
        }
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
    mountStickyHikeCta();

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
    const popup = (state.popups && state.popups.guest_card_popup) || {
        title: '💳 карта интеллигента',
        text: 'как её получить? тебе нужно быть готовым к большим переменам. почему? если ты станешь частью клуба интеллигенции, твои выходные уже не будут прежними. впечатления, знакомства, юмор, свежий воздух, продуктивный отдых и привилегии в городе. это лишь малая часть того, что тебя ждёт в клубе.',
        button_text: 'узнать о привилегиях'
    };
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'guestPopup';
    overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">${popup.title}</div>
            <div class="modal-text">${popup.text}</div>
            <img src="${state.appBanners?.guest_card_banner || ''}" class="guest-card-banner" onerror="this.style.display='none'">
            <div style="text-align: center; margin-top: 20px;"><button class="btn btn-yellow" id="popupPrivilegesBtn">${popup.button_text}</button></div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { haptic(); overlay.remove(); } });
    document.getElementById('popupPrivilegesBtn')?.addEventListener('click', () => { haptic(); overlay.remove(); renderGuestPrivileges(); });
    log('попап гостя', true, state.user);
}

function renderOwnerHome() {
    cleanupProfileOverlays();
    const user = state.user;
    const firstName = user?.first_name || 'друг';
    subtitle().textContent = `💳 твоя карта, ${firstName}`;
    subtitle().classList.remove('subtitle-guest');
    showBottomNav(true);
    const main = mainDiv();
    main.innerHTML = `
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
