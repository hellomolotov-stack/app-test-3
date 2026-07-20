// js/main.js
import { haptic, openLink, normalizeDate, formatDateForDisplay, parseLinks, mainDiv, subtitle, tg, scrollToElement, showConfetti } from './utils.js';
import { state, loadCachedState, saveCachedState, loadBookingStatusFromLocal, saveBookingStatusToLocal } from './state.js';
import { initFirebase, getDatabase, subscribeToHikes, subscribeToRoutes, subscribeToRouteFavorites, loadUserData, loadMetrics, loadFaq, loadPrivileges, loadGuestPrivileges, loadPassInfo, loadGiftContent, loadRandomPhrases, loadLeaders, loadRegistrationsPopup, loadPopupConfig, loadUserRegistrations, loadUpdates, loadMastermindSummaries, loadTestimonials, loadSafety, loadGuestAllowMessages, loadPopups } from './firebase.js';
import { log, syncGuestAllowMessages, logAutoSendClick } from './api.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from './config.js';
import { showAnimatedLoader, hideAnimatedLoader, showBottomNav, setUserInteracted, setManualNav, updateActiveNav, setActiveNav, resetNavActive, cleanupProfileOverlays } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderNewcomerPage, renderGuestPrivileges, renderPriv, renderGift, renderPassPage, renderSafetyPage } from './ui/privileges.js';
import { renderProfiles } from './ui/profiles.js';
import { showBottomSheet, showGuestBookingPopup, showRegistrationSuccess, refreshBottomSheetIfOpen } from './ui/calendar.js?v=20260622r';
import { mountBotTab } from './ui/bot-nudge.js';
import { mountLumen, setLumenContext, setLumenEligibility } from './ui/lumen.js';
import { isLumenPilotUser } from './lumen/config.js';
import { openOnboardingChat } from './ui/onboarding-chat.js';
import { setIntelligentsiaRoutes, setIntelligentsiaRouteFavorites } from './ui/intelligentsia-routes.js?v=20260719mono';

window.userInteracted = false;
window.isPrivPage = false;
window.isMenuActive = false;

function mountAssistant() {
    if (isLumenPilotUser(state.user)) mountLumen();
    else mountBotTab();
}

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
        setLumenContext({ screen: 'route', scenario: 'route' });
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
        setLumenContext({ screen: 'profiles', scenario: 'profiles' });
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
            setLumenContext({ screen: 'menu', scenario: 'menu' });
        }
        log('меню', state.userCard.status !== 'active', state.user);
        updateActiveNav();
    });

    popupChat.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahikingchat', 'чат клуба', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    popupChannel.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); openLink('https://t.me/yaltahiking', 'канал клуба', state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    popupGift.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderGift(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    popupNewcomer.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderNewcomerPage(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(true); });
    popupPass.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderPassPage(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    const popupSafety = document.getElementById('popupSafety');
    if (popupSafety) {
        popupSafety.addEventListener('click', (e) => { e.preventDefault(); haptic(); setUserInteracted(); renderSafetyPage(state.userCard.status !== 'active'); popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); window.toggleShareButton(false); });
    }
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

// Скролл к баннеру ЧП на главной + янтарная подсветка под его цвет.
// Ждём появления баннера (он есть только при safety.active), затем пульсируем.
function highlightSafetyBanner({ delay = 400, interval = 100, timeout = 6000 } = {}) {
    const flash = (el) => {
        // не скроллим — баннер вверху, экран не должен двигаться
        el.classList.remove('safety-banner-flash');
        void el.offsetWidth; // перезапуск анимации
        el.classList.add('safety-banner-flash');
        setTimeout(() => el.classList.remove('safety-banner-flash'), 2600);
    };
    setTimeout(() => {
        const el0 = document.getElementById('safetyBanner');
        if (el0) { flash(el0); return; }
        const t0 = Date.now();
        const iv = setInterval(() => {
            const el = document.getElementById('safetyBanner');
            if (el) { clearInterval(iv); flash(el); }
            else if (Date.now() - t0 > timeout) clearInterval(iv);
        }, interval);
    }, delay);
}

// Открываем страницу ЧП и подсвечиваем-мерцаем кнопку скачивания офлайн-чек-листа.
// Ждём, пока кнопка появится в DOM, скроллим к ней и запускаем пульс-анимацию.
function flashSafetyDownload({ delay = 450, interval = 100, timeout = 6000 } = {}) {
    const flash = (el) => {
        scrollToElement(el, getCurrentTopOffset());
        el.classList.remove('safety-download-flash');
        void el.offsetWidth; // перезапуск анимации
        el.classList.add('safety-download-flash');
        setTimeout(() => el.classList.remove('safety-download-flash'), 3400);
    };
    setTimeout(() => {
        const el0 = document.getElementById('safetyDownloadBtn');
        if (el0) { flash(el0); return; }
        const t0 = Date.now();
        const iv = setInterval(() => {
            const el = document.getElementById('safetyDownloadBtn');
            if (el) { clearInterval(iv); flash(el); }
            else if (Date.now() - t0 > timeout) clearInterval(iv);
        }, interval);
    }, delay);
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
    if (startParam.startsWith('nudge_')) {
        const keyMap = {
            nudge_firsthike: 'first_hike',
            nudge_day3: 'second_hike_day3',
            nudge_retention: 'retention_48h',
            nudge_payment: 'payment_incomplete',
        };
        const messageKey = keyMap[startParam] || startParam;
        logAutoSendClick(messageKey, state.user);
        log('клик по авто-сообщению', false, state.user, { message_key: messageKey });
        if (startParam === 'nudge_retention') {
            scrollToWhenReady(() => document.getElementById('calendarContainer'));
        } else {
            scrollToWhenReady(() => document.getElementById('cardBlock'));
        }
        return;
    }
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
        const targetDate = normalizeDate(decodeURIComponent(startParam.substring(5)).split('T')[0]);
        console.log('Deep link hike target:', targetDate);
        const tryShow = () => {
            const targetIndex = state.hikesWithTitle.findIndex(h => normalizeDate(h.date) === targetDate);
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
        case 'hike_map':
            scrollToWhenReady(() => document.querySelector('.intelligentsia-routes-card'));
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
        case 'safety':
            highlightSafetyBanner();
            break;
        case 'safety_download':
        case 'checklist':
            window._deepLinkPageChanged = true;
            renderSafetyPage(isGuest);
            flashSafetyDownload();
            break;
        case 'privileges':
            window._deepLinkPageChanged = true;
            if (isGuest) renderGuestPrivileges();
            else renderPriv();
            break;
        case 'profiles':
            window._deepLinkPageChanged = true;
            renderProfiles();
            break;
        case 'pass':
            window._deepLinkPageChanged = true;
            renderPassPage(isGuest);
            break;
        case 'gift':
            window._deepLinkPageChanged = true;
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
        // Отдельный мгновенный кэш safety — чтобы баннер ЧП рисовался на первом кадре
        try { const sc = localStorage.getItem('safetyCache'); if (sc) state.safety = JSON.parse(sc); } catch (e) {}

        // deep-link из поста Telegram — читаем сразу, чтобы выполнить как можно раньше
        const urlParams = new URLSearchParams(window.location.search);
        const startParam = tg?.initDataUnsafe?.start_param
            || tg?.initData?.start_param
            || urlParams.get('startapp')
            || urlParams.get('start_param')
            || '';
        let firstRenderDone = false;
        let deepLinkHandled = false;
        const ensureDeepLink = () => {
            if (deepLinkHandled || !startParam) return;
            deepLinkHandled = true;
            handleDeepLink(startParam);
        };
        // Ранний рендер главной: как только есть список хайков (из кэша или первого ответа Firebase) —
        // показываем экран и сразу выполняем deep-link, не дожидаясь всех сетевых запросов
        const earlyRenderHome = () => {
            if (firstRenderDone || !state.hikesWithTitle.length) return;
            if (!state.userCard || state.userCard.status === 'loading') {
                state.userCard = { status: 'inactive', hikes: 0, cardUrl: '' };
            }
            state.hikeBookingStatus = loadBookingStatusFromLocal();
            hideAnimatedLoader();
            renderHome();
            mountAssistant();
            firstRenderDone = true;
            ensureDeepLink();
        };

        initFirebase();
        const database = getDatabase();

        if (database) {
            subscribeToHikes((newList) => {
                state.hikesList = newList;
                state.hikesData = Object.fromEntries(newList.map(h => [h.date, h]));
                state.hikesWithTitle = newList.filter(h => h.title && h.title.trim() !== '');
                applyOwnerBookings(); // #5: переприменить записи владельца при обновлении хайков
                saveCachedState();
                earlyRenderHome(); // показать экран сразу, как пришли хайки (для тех, у кого нет кэша)
            });
            subscribeToRoutes(setIntelligentsiaRoutes);
            subscribeToRouteFavorites((favorites) => {
                state.routeFavorites = favorites;
                setIntelligentsiaRouteFavorites(favorites);
            });
        }

        // #2: если в кэше уже есть данные — показываем главную мгновенно, сеть обновит тихо
        earlyRenderHome();

        // #3: всё параллельно, включая userData
        const [metrics, faq, privileges, guestPrivileges, passInfo, giftContent,
               randomPhrases, leaders, updates, mastermindSummaries,
               regsPopup, popupConfig, popups, userData, testimonials, safety] = await Promise.all([
            loadMetrics(), loadFaq(), loadPrivileges(), loadGuestPrivileges(),
            loadPassInfo(), loadGiftContent(), loadRandomPhrases(), loadLeaders(),
            loadUpdates(), loadMastermindSummaries(),
            loadRegistrationsPopup(), loadPopupConfig(), loadPopups().catch(() => null),
            loadUserData(state.user?.id), loadTestimonials().catch(() => []),
            loadSafety().catch(() => null)
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
        if (safety) state.safety = safety;
        try { localStorage.setItem('safetyCache', JSON.stringify(state.safety)); } catch (e) {}
        const safetyMenuItem = document.getElementById('popupSafety');
        if (safetyMenuItem) safetyMenuItem.style.display = state.safety?.active ? '' : 'none';
        if (regsPopup) state.registrationsPopup = regsPopup;
        if (popupConfig) state.popupConfig = { ...state.popupConfig, ...popupConfig };
        if (popups) state.popups = popups;

        state.popupConfig.ticketLink = ROBOKASSA_LINK;
        state.popupConfig.seasonCardLink = SEASON_CARD_LINK;
        state.popupConfig.permanentCardLink = PERMANENT_CARD_LINK;

        state.userCard = userData;

        // _userRegs (Firebase) нужен всем — на нём держится определение «первый хайк бесплатно».
        // Серверный источник правды → админ может сбросить право, удалив userRegistrations.
        state._userRegs = await loadUserRegistrations(state.user?.id).catch(() => ({}));
        const lumenHikesCount = Object.values(state._userRegs || {}).filter(value => value === true).length;
        setLumenEligibility({
            firstHikePending: lumenHikesCount === 0,
            hikesCount: lumenHikesCount,
            status: state.userCard.status,
        });
        if (state.userCard.status === 'active') {
            applyOwnerBookings(); // #5
            saveBookingStatusToLocal(); // кэш на следующий запуск, чтобы ранний рендер видел корректный статус
            refreshBottomSheetIfOpen(); // обновить открытый шит если он уже был показан до загрузки _userRegs
        } else {
            state.hikeBookingStatus = loadBookingStatusFromLocal();
        }

        log('открыл приложение', state.userCard.status !== 'active', state.user);
        saveCachedState();

        if (tg) {
            tg.expand();
            if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        }

        // финальный рендер с актуальными данными — пропускаем, если диплинк увёл на другую страницу
        if (!window._deepLinkPageChanged) renderHome();
        window.toggleShareButton(false);
        if (!firstRenderDone) mountAssistant();

        // если ранний рендер не случился (нет кэша и Firebase не успел) — выполняем deep-link сейчас
        ensureDeepLink();

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
