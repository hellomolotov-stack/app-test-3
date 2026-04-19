// js/main.js
import { haptic, openLink, normalizeDate, formatDateForDisplay, parseLinks, mainDiv, subtitle, tg, showUnicornConfetti } from './utils.js';
import { state, loadCachedState, saveCachedState, loadBookingStatusFromLocal, saveBookingStatusToLocal } from './state.js';
import { initFirebase, getDatabase, subscribeToHikes, loadUserData, loadMetrics, loadFaq, loadPrivileges, loadGuestPrivileges, loadPassInfo, loadGiftContent, loadRandomPhrases, loadLeaders, loadRegistrationsPopup, loadPopupConfig, loadUserRegistrations } from './firebase.js';
import { log } from './api.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from './config.js';
import { showAnimatedLoader, hideAnimatedLoader, showBottomNav, setupBottomNav as commonSetupBottomNav, setUserInteracted, setManualNav, updateActiveNav, setActiveNav, resetNavActive, uiActions } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderNewcomerPage, renderGuestPrivileges, renderPriv, renderGift, renderPassPage } from './ui/privileges.js';
import { renderProfiles, showProfilesComingSoon } from './ui/profiles.js';
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
            showProfilesComingSoon(); // анимация единорогов
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