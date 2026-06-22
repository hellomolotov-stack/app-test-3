// js/main.js
import { haptic, openLink, normalizeDate, formatDateForDisplay, parseLinks, mainDiv, subtitle, tg, scrollToElement, showConfetti } from './utils.js';
import { state, loadCachedState, saveCachedState, loadBookingStatusFromLocal, saveBookingStatusToLocal } from './state.js';
import { initFirebase, getDatabase, subscribeToHikes, loadUserData, loadMetrics, loadFaq, loadPrivileges, loadGuestPrivileges, loadPassInfo, loadGiftContent, loadRandomPhrases, loadLeaders, loadRegistrationsPopup, loadPopupConfig, loadUserRegistrations, loadUpdates, loadMastermindSummaries, loadTestimonials, loadGuestAllowMessages, loadPopups } from './firebase.js';
import { log, syncGuestAllowMessages } from './api.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from './config.js';
import { showAnimatedLoader, hideAnimatedLoader, showBottomNav, setUserInteracted, setManualNav, updateActiveNav, setActiveNav, resetNavActive, cleanupProfileOverlays } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderNewcomerPage, renderGuestPrivileges, renderPriv, renderGift, renderPassPage } from './ui/privileges.js';
import { renderProfiles } from './ui/profiles.js';
import { showBottomSheet, showGuestBookingPopup, showRegistrationSuccess } from './ui/calendar.js?v=20260622f';
import { mountBotTab } from './ui/bot-nudge.js';
import { openOnboardingChat } from './ui/onboarding-chat.js';

window.userInteracted = false;
window.isPrivPage = false;
window.isMenuActive = false;

function getCurrentTopOffset() {
    if (!tg) return 76;
    const safeTop = tg.contentSafeAreaInset?.top || 0;
    return safeTop + 60;
}

window.toggleShareButton = function(show) {
    let shareBtn = document.getElementById('floatingShareBtn');
    if (show) {
        if (!shareBtn) {
            shareBtn = document.createElement('button');
            shareBtn.id = 'floatingShareBtn';
            shareBtn.textContent = '🔗 отправить другу';
            shareBtn.style.cssText = `
                position: fixed;
                bottom: 90px;
                right: 16px;
                max-width: calc(100% - 32px);
                width: auto;
                padding: 12px 20px;
                background-color: #D9FD19;
                color: #000000;
                border: none;
                border-radius: 40px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                z-index: 101;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            `;
            shareBtn.addEventListener('click', () => {
                haptic();
                log('поделиться приглашением новичка', false, state.user);
                const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/yaltahiking_bot?startapp=newcomer')}`;
                tg?.openTelegramLink(shareUrl);
            });
            document.body.appendChild(shareBtn);
        }
        shareBtn.style.display = 'block';
    } else {
        if (shareBtn) shareBtn.style.display = 'none';
    }
};

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
        document.getElementById('floatingCardBtn')?.remove();
        renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' });
        log('главная', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
        window.toggleShareButton(false);
    });
    navHikesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('hikes');
        cleanupProfileOverlays();
        document.getElementById('floatingCardBtn')?.remove();
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
        log('календарь', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
        window.toggleShareButton(false);
    });
    navProfilesNew.addEventListener('click', () => {
        haptic(); setUserInteracted(); setManualNav('profiles');
        cleanupProfileOverlays();
        document.getElementById('floatingCardBtn')?.remove();
        renderProfiles();
        log('профили', state.userCard.status !== 'active', state.user);
        if (popup.classList.contains('show')) popup.classList.remove('show');
        window.isMenuActive = false;
        updateActiveNav();
        window.toggleShareButton(false);
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
        log('меню', state.userCard.status !== 'active', state.user);
        updateActiveNav();
    });

    popupChat.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahikingchat', 'чат клуба', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    popupChannel.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahiking', 'канал клуба', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    popupGift.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderGift(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    popupNewcomer.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderNewcomerPage(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(true); });
    popupPass.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderPassPage(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    if (popupQuestion) {
        popupQuestion.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/hellointelligent', 'написать организатору', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
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

function highlightElement(el) {
    if (!el) return;
    el.style.transition = 'box-shadow 0.5s';
    el.style.boxShadow = '0 0 20px 5px rgba(255,255,255,0.7)';
    setTimeout(() => { el.style.boxShadow = ''; }, 2000);
}

// Ждём появления элемента и скроллим к нему. С таймаутом — без вечного setInterval (#4)
function scrollToWhenReady(getter, { delay = 300, interval = 100, timeout = 6000 } = {}) {
    setTimeout(() => {
        const el0 = getter();
        if (el0) { scrollToElement(el0, getCurrentTopOffset()); highlightElement(el0); return; }
        const t0 = Date.now();
        const iv = setInterval(() => {
            const el = getter();
            if (el) { clearInterval(iv); scrollToElement(el, getCurrentTopOffset()); highlightElement(el); }
            else if (Date.now() - t0 > timeout) clearInterval(iv);
        }, interval);
    }, delay);
}

function handleDeepLink(startParam) {
    if (!startParam) return;
    if (startParam.startsWith('card_')) {
        const targetDate = normalizeDate(startParam.substring(5));
        console.log('Deep link card popup target:', targetDate);
        log('открыла попап карты по напоминанию', false, state.user, { hike_date: targetDate });
        const tryShow = () => {
            const hike = state.hikesWithTitle.find(h => h.date === targetDate);
            if (hike) {
                setTimeout(() => showGuestBookingPopup(hike.date, hike.title), 200);
                return true;
            }
            return false;
        };
        if (tryShow()) return;
        const unsub = subscribeToHikes((newList) => {
            state.hikesList = newList;
            state.hikesData = Object.fromEntries(newList.map(h => [h.date, h]));
            state.hikesWithTitle = newList.filter(h => h.title && h.title.trim() !== '');
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
    if (startParam.startsWith('hike_')) {
        const targetDate = normalizeDate(startParam.substring(5));
        console.log('Deep link hike target:', targetDate);
        const tryShow = () => {
            const targetIndex = state.hikesWithTitle.findIndex(h => h.date === targetDate);
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
            state.hikesWithTitle = newList.filter(h => h.title && h.title.trim() !== '');
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
            scrollToWhenReady(() => document.getElementById('calendarContainer'));
            break;
        case 'updates':
            scrollToWhenReady(() => document.querySelector('.updates-container'));
            break;
        case 'summary':
            scrollToWhenReady(() => document.getElementById('mastermindSummariesCard'));
            break;
        case 'card':
            scrollToWhenReady(() => document.getElementById('cardBlock'));
            break;
        case 'bookings':
            scrollToWhenReady(() => document.getElementById('userBookingsCard'));
            break;
        case 'newcomer':
            scrollToWhenReady(() => document.querySelector('.btn-newcomer')?.closest('.card-container'));
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
        case 'bot':
            setTimeout(() => openOnboardingChat(), 600);
            break;
        case 'paid':
            setTimeout(() => {
                let celebData = null;
                try {
                    const pending = localStorage.getItem('pending_reg_celebration');
                    if (pending) {
                        celebData = JSON.parse(pending);
                        localStorage.removeItem('pending_reg_celebration');
                    }
                } catch {}
                if (celebData?.hikeDate) {
                    showRegistrationSuccess(celebData.hikeDate, celebData.hikeTitle);
                } else {
                    const overlay = document.createElement('div');
                    overlay.className = 'modal-overlay';
                    overlay.innerHTML = `
                        <div class="modal-content" style="max-width:340px; text-align:center;">
                            <div style="font-size:52px; margin-bottom:16px;">🎉</div>
                            <div class="modal-title" style="text-align:center; color: var(--yellow);">оплата прошла!</div>
                            <div class="modal-text" style="text-align:center; margin-top:8px; line-height:1.5;">мы уже выпускаем твою карту интеллигента – скоро с тобой свяжется организатор</div>
                            <button class="btn btn-yellow" id="closePaymentSuccessBtn" style="margin-top:20px; width:100%;">отлично!</button>
                        </div>
                    `;
                    document.body.appendChild(overlay);
                    overlay.addEventListener('click', e => { if (e.target === overlay) { haptic(); overlay.remove(); } });
                    document.getElementById('closePaymentSuccessBtn')?.addEventListener('click', () => { haptic(); overlay.remove(); });
                }
            }, 800);
            break;
        case 'suggest':
            setTimeout(() => {
                const tryHighlight = () => {
                    const cal = document.getElementById('calendarContainer');
                    const btn = document.getElementById('suggestEventBtn');
                    if (cal && btn) {
                        scrollToElement(cal, getCurrentTopOffset());
                        highlightElement(btn);
                        return true;
                    }
                    return false;
                };
                if (!tryHighlight()) {
                    const check = setInterval(() => {
                        if (tryHighlight()) clearInterval(check);
                    }, 100);
                    setTimeout(() => clearInterval(check), 5000);
                }
            }, 300);
            break;
    }
}

// #5: проставить записи владельца карты по последнему снимку хайков
function applyOwnerBookings() {
    if (state.userCard?.status === 'active' && state._userRegs) {
        state.hikesWithTitle.forEach((hike, index) => {
            state.hikeBookingStatus[index] = state._userRegs[hike.date] === true;
        });
    }
}

// #1: запрос доступа к сообщениям — фоном, ПОСЛЕ показа приложения (не блокирует первый экран)
async function maybeRequestWriteAccess() {
    if (localStorage.getItem('asked_write_access')) return;
    try {
        const allowed = await loadGuestAllowMessages(state.user?.id).catch(() => false);
        if (!allowed && tg?.requestWriteAccess) {
            const granted = await tg.requestWriteAccess();
            syncGuestAllowMessages(state.user.id, !!granted);
        }
        localStorage.setItem('asked_write_access', 'true');
    } catch (err) {
        console.warn('requestWriteAccess failed:', err);
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
                state.hikesWithTitle = newList.filter(h => h.title && h.title.trim() !== '');
                applyOwnerBookings(); // #5: переприменить записи владельца при обновлении хайков
                saveCachedState();
            });
        }

        // #2: если в кэше уже есть данные — показываем главную мгновенно, сеть обновит тихо
        let renderedFromCache = false;
        if (state.hikesWithTitle.length && state.userCard?.status !== 'loading') {
            if (!state.userCard || state.userCard.status === 'loading') {
                state.userCard = { status: 'inactive', hikes: 0, cardUrl: '' };
            }
            if (state.userCard.status !== 'active') {
                state.hikeBookingStatus = loadBookingStatusFromLocal();
            }
            hideAnimatedLoader();
            renderHome();
            mountBotTab();
            renderedFromCache = true;
        }

        // #3: всё параллельно, включая userData
        const [metrics, faq, privileges, guestPrivileges, passInfo, giftContent,
               randomPhrases, leaders, updates, mastermindSummaries,
               regsPopup, popupConfig, popups, userData, testimonials] = await Promise.all([
            loadMetrics(), loadFaq(), loadPrivileges(), loadGuestPrivileges(),
            loadPassInfo(), loadGiftContent(), loadRandomPhrases(), loadLeaders(),
            loadUpdates(), loadMastermindSummaries(),
            loadRegistrationsPopup(), loadPopupConfig(), loadPopups().catch(() => null),
            loadUserData(state.user?.id), loadTestimonials().catch(() => [])
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
        if (testimonials) state.testimonials = testimonials;
        if (regsPopup) state.registrationsPopup = regsPopup;
        if (popupConfig) state.popupConfig = { ...state.popupConfig, ...popupConfig };
        if (popups) state.popups = popups;

        state.popupConfig.ticketLink = ROBOKASSA_LINK;
        state.popupConfig.seasonCardLink = SEASON_CARD_LINK;
        state.popupConfig.permanentCardLink = PERMANENT_CARD_LINK;

        state.userCard = userData;

        if (state.userCard.status === 'active') {
            state._userRegs = await loadUserRegistrations(state.user?.id);
            applyOwnerBookings(); // #5
        } else {
            state.hikeBookingStatus = loadBookingStatusFromLocal();
        }

        log('открыл приложение', state.userCard.status !== 'active', state.user);
        saveCachedState();

        if (tg) {
            tg.expand();
            if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        }

        renderHome(); // финальный рендер с актуальными данными (поверх кэшированного)
        window.toggleShareButton(false);
        if (!renderedFromCache) mountBotTab();

        const startParam = tg?.initDataUnsafe?.start_param || tg?.initData?.start_param || '';
        if (startParam) {
            setTimeout(() => handleDeepLink(startParam), 100);
        }

        // #1: спрашиваем доступ к сообщениям фоном, не блокируя первый экран
        maybeRequestWriteAccess();

        function updateNightBackground() {
            const now = new Date();
            const mskTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
            const mskHours = mskTime.getHours();
            if (mskHours >= 22 || mskHours < 5) {
                document.body.classList.add('night-mode');
            } else {
                document.body.classList.remove('night-mode');
            }
        }
        updateNightBackground();
        setInterval(updateNightBackground, 60000);

    } catch (e) {
        console.error('Unhandled error in loadData:', e);
        renderHome();
    } finally {
        hideAnimatedLoader();
    }
}

// Глобальное скрытие нижнего меню при появлении клавиатуры
// Работает для всех input/textarea во всём приложении
let _keyboardHideTimer = null;
document.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea')) {
        if (_keyboardHideTimer) { clearTimeout(_keyboardHideTimer); _keyboardHideTimer = null; }
        showBottomNav(false);
    }
});
document.addEventListener('focusout', (e) => {
    if (e.target.matches('input, textarea')) {
        _keyboardHideTimer = setTimeout(() => showBottomNav(true), 200);
    }
});

window.addEventListener('load', () => {
    state.user = tg?.initDataUnsafe?.user;
    loadAppData();
});
