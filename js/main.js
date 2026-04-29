// js/main.js
import { haptic, openLink, normalizeDate, formatDateForDisplay, parseLinks, mainDiv, subtitle, tg, scrollToElement } from './utils.js';
import { state, loadCachedState, saveCachedState, loadBookingStatusFromLocal, saveBookingStatusToLocal } from './state.js';
import { initFirebase, getDatabase, subscribeToHikes, loadUserData, loadMetrics, loadFaq, loadPrivileges, loadGuestPrivileges, loadPassInfo, loadGiftContent, loadRandomPhrases, loadLeaders, loadRegistrationsPopup, loadPopupConfig, loadUserRegistrations, loadUpdates, loadMastermindSummaries, loadGuestAllowMessages } from './firebase.js';
import { log, syncGuestAllowMessages } from './api.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from './config.js';
import { showAnimatedLoader, hideAnimatedLoader, showBottomNav, setUserInteracted, setManualNav, updateActiveNav, setActiveNav, resetNavActive, cleanupProfileOverlays } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderNewcomerPage, renderGuestPrivileges, renderPriv, renderGift, renderPassPage } from './ui/privileges.js';
import { renderProfiles } from './ui/profiles.js';
import { showBottomSheet } from './ui/calendar.js';

window.userInteracted = false;
window.isPrivPage = false;
window.isMenuActive = false;

function getCurrentTopOffset() {
    if (!tg) return 76;
    const safeTop = tg.contentSafeAreaInset?.top || 0;
    return safeTop + 60;
}

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
        cleanupProfileOverlays();
        renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' });
        log('glavnaya_click', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
    });
    navHikesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('hikes');
        cleanupProfileOverlays();
        renderHome();
        setTimeout(() => {
            const calendar = document.getElementById('calendarContainer');
            if (calendar) {
                const topOffset = getCurrentTopOffset();
                const rect = calendar.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const targetY = rect.top + scrollTop - topOffset;
                window.scrollTo({ top: targetY, behavior: 'smooth' });
            }
        }, 150);
        log('kalendar_click', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
    });
    navProfilesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('profiles');
        cleanupProfileOverlays();
        renderProfiles();
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

import { uiActions } from './ui/common.js';
uiActions.setupBottomNav = setupBottomNav;

// Функция для добавления свечения элементу
function highlightElement(el) {
    if (!el) return;
    el.style.transition = 'box-shadow 0.5s';
    el.style.boxShadow = '0 0 20px 5px rgba(255,255,255,0.7)';
    setTimeout(() => { el.style.boxShadow = ''; }, 2000);
}

// Обработка диплинков
function handleDeepLink(startParam) {
    if (!startParam) return;
    if (startParam.startsWith('hike_')) {
        const targetDate = normalizeDate(startParam.substring(5));
        console.log('Deep link hike target:', targetDate);

        const tryShow = () => {
            const targetIndex = state.hikesList.findIndex(h => h.date === targetDate);
            if (targetIndex !== -1) {
                setTimeout(() => showBottomSheet(targetIndex), 200);
                return true;
            }
            return false;
        };

        if (tryShow()) return;

        const unsub = subscribeToHikes((newList) => {
            state.hikesList = newList;
            state.hikesData = Object.fromEntries(newList.map(h => [h.date, h]));
            saveCachedState();
            if (tryShow()) {
                unsub();
            }
        });

        setTimeout(() => {
            tryShow();
            unsub();
        }, 10000);
        return;
    }

    const isGuest = state.userCard.status !== 'active';
    switch (startParam) {
        case 'calendar':
            setTimeout(() => {
                const el = document.getElementById('calendarContainer');
                if (el) {
                    scrollToElement(el, getCurrentTopOffset());
                    highlightElement(el);
                } else {
                    const check = setInterval(() => {
                        const cal = document.getElementById('calendarContainer');
                        if (cal) { clearInterval(check); scrollToElement(cal, getCurrentTopOffset()); highlightElement(cal); }
                    }, 100);
                }
            }, 300);
            break;
        case 'updates':
            setTimeout(() => {
                const el = document.querySelector('.updates-container');
                if (el) {
                    scrollToElement(el, getCurrentTopOffset());
                    highlightElement(el);
                } else {
                    const check = setInterval(() => {
                        const upd = document.querySelector('.updates-container');
                        if (upd) { clearInterval(check); scrollToElement(upd, getCurrentTopOffset()); highlightElement(upd); }
                    }, 100);
                }
            }, 300);
            break;
        case 'summary':
            setTimeout(() => {
                const el = document.getElementById('mastermindSummariesCard');
                if (el) {
                    scrollToElement(el, getCurrentTopOffset());
                    highlightElement(el);
                } else {
                    const check = setInterval(() => {
                        const card = document.getElementById('mastermindSummariesCard');
                        if (card) { clearInterval(check); scrollToElement(card, getCurrentTopOffset()); highlightElement(card); }
                    }, 100);
                }
            }, 300);
            break;
        case 'card':
            setTimeout(() => {
                const el = document.querySelector('.card-container'); // первая карточка
                if (el) {
                    scrollToElement(el, getCurrentTopOffset());
                    highlightElement(el);
                } else {
                    const check = setInterval(() => {
                        const card = document.querySelector('.card-container');
                        if (card) { clearInterval(check); scrollToElement(card, getCurrentTopOffset()); highlightElement(card); }
                    }, 100);
                }
            }, 300);
            break;
        case 'bookings':
            setTimeout(() => {
                const el = document.getElementById('userBookingsCard');
                if (el) {
                    scrollToElement(el, getCurrentTopOffset());
                    highlightElement(el);
                } else {
                    const check = setInterval(() => {
                        const bookings = document.getElementById('userBookingsCard');
                        if (bookings) { clearInterval(check); scrollToElement(bookings, getCurrentTopOffset()); highlightElement(bookings); }
                    }, 100);
                }
            }, 300);
            break;
        case 'newcomer':
            setTimeout(() => {
                const el = document.querySelector('.btn-newcomer')?.closest('.card-container');
                if (el) {
                    scrollToElement(el, getCurrentTopOffset());
                    highlightElement(el);
                } else {
                    const check = setInterval(() => {
                        const newcomer = document.querySelector('.btn-newcomer')?.closest('.card-container');
                        if (newcomer) { clearInterval(check); scrollToElement(newcomer, getCurrentTopOffset()); highlightElement(newcomer); }
                    }, 100);
                }
            }, 300);
            break;
        case 'privileges':
            if (isGuest) renderGuestPrivileges();
            else renderPriv();
            break;
        case 'profiles':
            renderProfiles();
            break;
        case 'pass':
            renderPassPage(isGuest);
            break;
        case 'gift':
            renderGift(isGuest);
            break;
    }
}

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
                saveCachedState();
            });
        }

        const [metrics, faq, privileges, guestPrivileges, passInfo, giftContent, randomPhrases, leaders, updates, mastermindSummaries] = await Promise.all([
            loadMetrics(), loadFaq(), loadPrivileges(), loadGuestPrivileges(),
            loadPassInfo(), loadGiftContent(), loadRandomPhrases(), loadLeaders(),
            loadUpdates(), loadMastermindSummaries()
        ]);
        
        if (metrics) state.metrics = metrics;
        if (faq) state.faq = faq;
        if (privileges) state.privileges = privileges;
        if (guestPrivileges) state.guestPrivileges = guestPrivileges;
        if (passInfo) state.passInfo = passInfo;
        if (giftContent) state.giftContent = giftContent;
        if (randomPhrases) state.randomPhrases = randomPhrases;
        if (leaders) state.leaders = leaders;
        if (updates) state.updates = updates;
        if (mastermindSummaries) state.mastermindSummaries = mastermindSummaries;

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

        // Запрос разрешения на уведомления
        const hasAsked = localStorage.getItem('asked_write_access');
        if (!hasAsked) {
            const allowed = await loadGuestAllowMessages(state.user?.id).catch(() => false);
            if (!allowed && tg?.requestWriteAccess) {
                try {
                    const granted = await tg.requestWriteAccess();
                    if (granted) {
                        syncGuestAllowMessages(state.user.id, true);
                    } else {
                        syncGuestAllowMessages(state.user.id, false);
                    }
                    localStorage.setItem('asked_write_access', 'true');
                } catch (err) {
                    console.warn('requestWriteAccess failed:', err);
                }
            } else {
                localStorage.setItem('asked_write_access', 'true');
            }
        }

        if (tg) {
            tg.expand();
            if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        }
        
        renderHome();

        const startParam = tg?.initDataUnsafe?.start_param || tg?.initData?.start_param || '';
        if (startParam) {
            setTimeout(() => handleDeepLink(startParam), 100);
        }
    } catch (e) {
        console.error('Unhandled error in loadData:', e);
        renderHome();
    } finally {
        hideAnimatedLoader();
    }
}

window.addEventListener('load', () => {
    state.user = tg?.initDataUnsafe?.user;
    loadAppData();
});
