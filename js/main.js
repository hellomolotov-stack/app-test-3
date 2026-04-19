// js/main.js
import { haptic, openLink, normalizeDate, formatDateForDisplay, parseLinks, mainDiv, subtitle, tg } from './utils.js';
import { state, loadCachedState, saveCachedState, loadBookingStatusFromLocal, saveBookingStatusToLocal } from './state.js';
import { initFirebase, getDatabase, subscribeToHikes, loadUserData, loadMetrics, loadFaq, loadPrivileges, loadGuestPrivileges, loadPassInfo, loadGiftContent, loadRandomPhrases, loadLeaders, loadRegistrationsPopup, loadPopupConfig, loadUserRegistrations } from './firebase.js';
import { log } from './api.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from './config.js';
import { showAnimatedLoader, hideAnimatedLoader, showBottomNav, setupBottomNav as commonSetupBottomNav, setUserInteracted, setManualNav, updateActiveNav, setActiveNav, resetNavActive, uiActions } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderNewcomerPage, renderGuestPrivileges, renderPriv, renderGift, renderPassPage } from './ui/privileges.js';
import { renderProfiles } from './ui/profiles.js';
import { showBottomSheet, closeParticipantDropdown, closeLeaderDropdown, showLeaderDropdown, toggleParticipantDropdown } from './ui/calendar.js';

// Глобальные переменные UI
window.userInteracted = false;
window.isPrivPage = false;
window.isMenuActive = false;

// Реализация setupBottomNav
function setupBottomNav() {
    const navHome = document.getElementById('navHome');
    const navHikes = document.getElementById('navHikes');
    const navProfiles = document.getElementById('navProfiles');
    const navMore = document.getElementById('navMore');
    const popup = document.getElementById('navPopup');
    const popupChat = document.getElementById('popupChat');
    const popupChannel = document.getElementById('popupChannel');
    const popupGift = document.getElementById('popupGift');
    const popupNewcomer = document.getElementById('popupNewcomer');
    const popupPass = document.getElementById('popupPass');
    const popupQuestion = document.getElementById('popupQuestion');

    if (!navHome || !navHikes || !navMore || !popup) return;

    const newNavHome = navHome.cloneNode(true);
    const newNavHikes = navHikes.cloneNode(true);
    const newNavProfiles = navProfiles.cloneNode(true);
    const newNavMore = navMore.cloneNode(true);
    navHome.parentNode.replaceChild(newNavHome, navHome);
    navHikes.parentNode.replaceChild(newNavHikes, navHikes);
    navProfiles.parentNode.replaceChild(newNavProfiles, navProfiles);
    navMore.parentNode.replaceChild(newNavMore, navMore);

    const navHomeNew = document.getElementById('navHome');
    const navHikesNew = document.getElementById('navHikes');
    const navProfilesNew = document.getElementById('navProfiles');
    const navMoreNew = document.getElementById('navMore');

    navHomeNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('home');
        renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' });
        log('glavnaya_click', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
    });
    navHikesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('hikes');
        renderHome(); 
        setTimeout(() => document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        log('kalendar_click', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
    });
    navProfilesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('profiles');
        const allowedUsernames = ['maxmolotov', 'basokni'];
        const isAllowed = allowedUsernames.includes(state.user?.username);
        if (isAllowed) {
            renderProfiles();
        } else {
            alert('Скоро');
        }
        log('profiles_click', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
    });
    navMoreNew.addEventListener('click', (e) => {
        e.stopPropagation(); haptic();
        if (popup.classList.contains('show')) {
            popup.classList.remove('show');
            window.isMenuActive = false;
        } else {
            popup.classList.add('show');
            window.isMenuActive = true;
        }
        log('menu_click', state.userCard.status !== 'active', state.user);
        updateActiveNav();
    });

    popupChat.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahikingchat', 'chat_click', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); });
    popupChannel.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahiking', 'channel_click', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); });
    popupGift.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderGift(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); });
    popupNewcomer.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderNewcomerPage(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); });
    popupPass.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderPassPage(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); });
    if (popupQuestion) {
        popupQuestion.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/hellointelligent', 'question_click', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); });
    }

    document.addEventListener('click', (e) => {
        if (popup.classList.contains('show') && !navMoreNew.contains(e.target) && !popup.contains(e.target)) {
            popup.classList.remove('show');
            window.isMenuActive = false;
            updateActiveNav();
        }
    });
    window.addEventListener('scroll', () => {
        setUserInteracted();
        requestAnimationFrame(updateActiveNav);
    });
    updateActiveNav();
}

// Переопределяем действие в uiActions
uiActions.setupBottomNav = setupBottomNav;

// Глобальный делегированный обработчик кликов (как в старом app.js)
document.addEventListener('click', function(e) {
    const link = e.target.closest('.dynamic-link, .nav-popup a, .btn-newcomer, .accordion-btn, .bottom-sheet-nav-arrow, .btn, .participant-counter, .booking-detail-btn, .bookings-calendar-link, .booking-go-btn, .leader-name, .popup-link, .profile-hike-link');
    if (!link) return;
    
    if (link.classList.contains('profile-hike-link')) {
        e.preventDefault();
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
            if (link.id === 'popupNewcomer') { renderNewcomerPage(state.userCard.status !== 'active'); }
            else if (link.id === 'popupGift') { renderGift(state.userCard.status !== 'active'); }
            else if (link.id === 'popupPass') { renderPassPage(state.userCard.status !== 'active'); }
            else if (link.id === 'popupQuestion') { openLink('https://t.me/hellointelligent', 'question_click', state.userCard.status !== 'active'); }
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
            if (index !== -1 && state.hikeBookingStatus[index]) {
                toggleParticipantDropdown(link, hikeDate);
            } else {
                const msg = document.createElement('div');
                msg.className = 'modal-overlay';
                msg.innerHTML = `
                    <div class="modal-content" style="max-width: 300px;">
                        <div class="modal-title" style="color: ${isWoman ? '#FB5EB0' : 'var(--yellow)'};">доступ ограничен</div>
                        <div class="modal-text">просмотр участников доступен после регистрации на хайк</div>
                        <div class="modal-buttons" style="margin-top: 20px;"><button class="btn" style="background-color: ${isWoman ? '#FB5EB0' : 'var(--yellow)'}; color: #000000; width: 100%; margin: 0; padding: 12px; border-radius: 12px; font-weight: 600; border: none; cursor: pointer;">понятно</button></div>
                    </div>
                `;
                document.body.appendChild(msg);
                const closeBtn = msg.querySelector('.btn');
                closeBtn.addEventListener('click', () => msg.remove());
                msg.addEventListener('click', (e) => { if (e.target === msg) msg.remove(); });
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

// Инициализация приложения
async function loadAppData() {
    showAnimatedLoader();
    try {
        loadCachedState();
        
        initFirebase();
        const database = getDatabase();
        
        if (database) {
            subscribeToHikes((newList) => {
                state.hikesList = newList;
                state.hikesData = Object.fromEntries(newList.map(h => [h.date, h]));
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer && !window.isPrivPage) {
                    // renderCalendar будет вызван позже через renderHome
                }
                const bookingsContainer = document.getElementById('userBookingsContainer');
                if (bookingsContainer) {
                    // renderUserBookings будет вызван позже
                }
                saveCachedState();
            });
        }

        const [metrics, faq, privileges, guestPrivileges, passInfo, giftContent, randomPhrases, leaders] = await Promise.all([
            loadMetrics(), loadFaq(), loadPrivileges(), loadGuestPrivileges(),
            loadPassInfo(), loadGiftContent(), loadRandomPhrases(), loadLeaders()
        ]);
        
        if (metrics) state.metrics = metrics;
        if (faq) state.faq = faq;
        if (privileges) state.privileges = privileges;
        if (guestPrivileges) state.guestPrivileges = guestPrivileges;
        if (passInfo) state.passInfo = passInfo;
        if (giftContent) state.giftContent = giftContent;
        if (randomPhrases) state.randomPhrases = randomPhrases;
        if (leaders) state.leaders = leaders;

        await loadRegistrationsPopup().then(data => { if (data) state.registrationsPopup = data; });
        await loadPopupConfig().then(data => { if (data) state.popupConfig = { ...state.popupConfig, ...data }; });
        
        state.popupConfig.ticketLink = ROBOKASSA_LINK;
        state.popupConfig.seasonCardLink = SEASON_CARD_LINK;
        state.popupConfig.permanentCardLink = PERMANENT_CARD_LINK;

        const userData = await loadUserData(state.user?.id);
        state.userCard = userData;

        if (state.userCard.status === 'active') {
            const regs = await loadUserRegistrations(state.user?.id);
            state.hikesList.forEach((hike, index) => {
                state.hikeBookingStatus[index] = regs[hike.date] === true;
            });
        } else {
            state.hikeBookingStatus = loadBookingStatusFromLocal();
        }

        log('visit', state.userCard.status !== 'active', state.user);
        saveCachedState();
        
        renderHome();
        
        const urlParams = new URLSearchParams(window.location.search);
        const startParam = tg?.initDataUnsafe?.start_param || tg?.initData?.start_param || urlParams.get('startapp') || urlParams.get('start');
        if (startParam && startParam.startsWith('hike_')) {
            const targetDate = normalizeDate(startParam.substring(5));
            const interval = setInterval(() => {
                const targetIndex = state.hikesList.findIndex(h => h.date === targetDate);
                if (targetIndex !== -1) {
                    clearInterval(interval);
                    setTimeout(() => showBottomSheet(targetIndex), 200);
                }
            }, 300);
        }
    } catch (e) {
        console.error('Unhandled error in loadData:', e);
        renderHome();
    } finally {
        hideAnimatedLoader();
    }
}

// Запуск
window.addEventListener('load', () => {
    state.user = tg?.initDataUnsafe?.user;
    loadAppData();
});
