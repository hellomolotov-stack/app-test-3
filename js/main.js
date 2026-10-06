// js/main.js
import { haptic, openLink, normalizeDate, formatDateForDisplay, parseLinks, mainDiv, subtitle, tg, scrollToElement, showConfetti } from './utils.js';
import { state, loadCachedState, saveCachedState, loadBookingStatusFromLocal, saveBookingStatusToLocal } from './state.js';
import { initFirebase, getDatabase, hikesFromSnapshot, subscribeToHikes, subscribeToRoutes, subscribeToRouteFavorites, loadUserData, loadMetrics, loadFaq, loadPrivileges, loadGuestPrivileges, loadPassInfo, loadGiftContent, loadRandomPhrases, loadLeaders, loadRegistrationsPopup, loadPopupConfig, loadUserRegistrations, loadUpdates, loadMastermindSummaries, loadTestimonials, loadSafety, loadPopups } from './firebase.js';
import { log, logAutoSendClick, markPaymentSeen } from './api.js';
import { pingAppUser } from './ui/notify-optin.js';
import { openAdmin } from './ui/admin.js';
import { initClickLog } from './ui/click-log.js';
import { initSheetDrag } from './ui/sheet-drag.js';
import { initCollapsibleBlocks } from './ui/collapsible.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from './config.js';
import { showAnimatedLoader, hideAnimatedLoader, showBottomNav, setUserInteracted, setManualNav, updateActiveNav, setActiveNav, resetNavActive, cleanupProfileOverlays } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderNewcomerPage, renderGuestPrivileges, renderPriv, renderGift, renderPassPage, renderSafetyPage } from './ui/privileges.js';
import { renderProfiles } from './ui/profiles.js';
import { showBottomSheet, showGuestBookingPopup, showRegistrationSuccess, refreshBottomSheetIfOpen, completeTicketRegistration, confirmTicketPaymentReturn, offerPendingTicketRecovery, TICKET_PENDING_TTL } from './ui/calendar.js';
import { mountBotTab, showBotTabHint } from './ui/bot-nudge.js';
import { mountLumen, setLumenContext, setLumenEligibility } from './ui/lumen.js';
import { isLumenPilotUser } from './lumen/config.js';
import { openOnboardingChat } from './ui/onboarding-chat.js';
import { setIntelligentsiaRoutes, setIntelligentsiaRouteFavorites } from './ui/intelligentsia-routes.js';

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
                background: linear-gradient(180deg, #e8ff4a 0%, #c9ec00 100%);
                color: #000000;
                border: 1px solid rgba(0,0,0,0.07);
                border-radius: 40px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                z-index: 101;
                box-shadow:
                    inset 0 1px 0 rgba(255,255,255,0.55),
                    inset 0 -2px 0 rgba(0,0,0,0.10),
                    0 3px 10px rgba(0,0,0,0.22),
                    0 1px 2px rgba(0,0,0,0.12);
                transition: box-shadow 0.12s, transform 0.1s;
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

    // пункты шторки вешаем один раз: setupBottomNav вызывается при каждой перерисовке
    if (!popup.dataset.wired) {
        popup.dataset.wired = '1';
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

        // плитки разделов: прокрутка к блоку главной (свёрнутый блок раскрываем)
        const JUMP_TARGETS = {
            calendar: () => document.getElementById('calendarContainer'),
            bookings: () => document.getElementById('userBookingsCard'),
            weather: () => document.getElementById('weatherBlock'),
            mastermind: () => document.getElementById('mastermindSummariesCard'),
            metrics: () => document.querySelector('.metrics-header')?.closest('.card-container'),
            updates: () => document.querySelector('.updates-container'),
        };
        const closeMenu = () => { popup.classList.remove('show'); window.isMenuActive = false; updateActiveNav(); };
        popup.querySelectorAll('[data-jump]').forEach(tile => {
            tile.addEventListener('click', () => {
                haptic(); setUserInteracted();
                const key = tile.dataset.jump;
                log('меню: ' + tile.textContent.trim(), state.userCard.status !== 'active', state.user);
                closeMenu();
                window.toggleShareButton(false);
                const onHome = !!document.getElementById('cardBlock');
                if (!onHome) { cleanupProfileOverlays(); document.getElementById('floatingCardBtn')?.remove(); setManualNav('home'); renderHome(); updateActiveNav(); }
                scrollToWhenReady(() => {
                    const el = JUMP_TARGETS[key]?.();
                    if (el && el.classList.contains('is-collapsed')) el.querySelector('.blk-toggle')?.click();
                    return el;
                }, { delay: onHome ? 50 : 300 });
            });
        });
        // в меню показываем только разделы, которые есть на главной у этого человека
        const refreshTiles = () => popup.querySelectorAll('[data-jump]').forEach(tile => {
            const onHome = !!document.getElementById('cardBlock');
            tile.hidden = onHome && !JUMP_TARGETS[tile.dataset.jump]?.();
        });
        popup._refreshTiles = refreshTiles;
        popup.addEventListener('click', (e) => { if (e.target === popup) closeMenu(); });
    }
    navMoreNew.addEventListener('click', () => popup._refreshTiles?.());

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
    // Возврат из оплаты билета: paid_<дата хайка>. Дата приходит в самой ссылке, поэтому возврат
    // работает и без localStorage (другой webview, очищенный кэш). Запись делает сервер по ResultURL.
    // подарок: даритель вернулся после оплаты / получатель открыл ссылку-подарок
    if (startParam.startsWith('giftpaid_')) {
        const inv = startParam.substring(9).replace(/[^0-9]/g, '');
        setTimeout(() => import('./ui/gift.js').then(m => m.openGiftPaidScreen(inv)), 400);
        return;
    }
    if (startParam.startsWith('gift_')) {
        const code = startParam.substring(5).replace(/[^a-z0-9]/g, '');
        setTimeout(() => import('./ui/gift.js').then(m => m.openGiftReceiveScreen(code)), 400);
        return;
    }
    // приглашение +1 от владельца карты
    if (startParam.startsWith('inv_')) {
        const code = startParam.substring(4).replace(/[^a-z0-9]/g, '');
        setTimeout(() => import('./ui/invite.js').then(m => m.openInviteScreen(code)), 400);
        return;
    }
    if (startParam.startsWith('paid_')) {
        const paidDate = normalizeDate(startParam.substring(5));
        log('вернулась из оплаты билета', true, state.user, { hike_date: paidDate });
        const run = () => confirmTicketPaymentReturn(paidDate);
        // Нужен список хайков, чтобы найти название и обновить кнопки; ждём его как в card_/hike_
        if (state.hikesWithTitle.some(h => normalizeDate(h.date) === paidDate)) {
            setTimeout(run, 400);
            return;
        }
        let started = false;
        const start = () => { if (!started) { started = true; run(); } };
        const unsub = subscribeToHikes((newList) => {
            state.hikesList = newList;
            state.hikesData = Object.fromEntries(newList.map(h => [h.date, h]));
            state.hikesWithTitle = newList.filter(h => h.title && h.title.trim() !== '');
            saveCachedState();
            if (state.hikesWithTitle.some(h => normalizeDate(h.date) === paidDate)) {
                unsub();
                start();
            }
        });
        setTimeout(() => { unsub(); start(); }, 8000);
        return;
    }
    if (startParam.startsWith('hike_') && startParam !== 'hike_map') {
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
        case 'card_offer':
            // из рассылки «новичкам после хайка»: сразу шторка карты со спецпредложением
            log('открыл спецпредложение карты', true, state.user);
            setTimeout(() => import('./ui/card-sheet.js').then(m => m.openCardSheet({ source: 'рассылка' })), 600);
            break;
        case 'calendar':
            scrollToWhenReady(() => document.getElementById('calendarContainer'));
            break;
        case 'hike_map':
        case 'routes':
            // блока «карта хайков» на главной больше нет – ведём к календарю с картой ближайшего хайка
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
            scrollToWhenReady(() => document.getElementById('userBookingsCard') || (state.hikesWithTitle?.length ? document.getElementById('calendarContainer') : null));
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
        case 'support':
            // ответ организаторов в чате поддержки (ссылка из бота «прочитать 💬»)
            setTimeout(() => openOnboardingChat(), 600);
            break;
        case 'bot':
            // старые ссылки из постов («помощник»): раньше сразу открывали чат во весь экран –
            // люди закрывали его и уходили. Теперь главная и подсказка язычка помощника сбоку.
            setTimeout(() => { if (!showBotTabHint()) openOnboardingChat(); }, 1500);
            break;
        case 'admin':
            setTimeout(() => openAdmin(), 400);
            break;
        case 'paid':
            setTimeout(() => {
                let celebData = null;
                try {
                    const pending = localStorage.getItem('pending_reg_celebration');
                    if (pending) {
                        celebData = JSON.parse(pending);
                        // Билет держим в localStorage, пока сервер не подтвердил запись: если оплата
                        // ещё обрабатывается, следующий заход предложит подтвердить (offerPendingTicketRecovery).
                        if (celebData?.type !== 'ticket') localStorage.removeItem('pending_reg_celebration');
                    }
                } catch {}
                // Билет на хайк: запись делает сервер по ResultURL Robokassa. Ждём её и показываем экран успеха.
                const isFreshTicket = celebData?.type === 'ticket'
                    && celebData.hikeDate
                    && (!celebData.ts || Date.now() - celebData.ts < TICKET_PENDING_TTL);
                if (isFreshTicket) {
                    confirmTicketPaymentReturn(celebData.hikeDate);
                    return;
                }

                markPaymentSeen();
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

const APP_T0 = Date.now();

// Firebase SDK подгружаем сами, после старта приложения: раньше три его файла с серверов Google
// держали весь запуск (из Крыма без VPN – до 10+ секунд), теперь главная рисуется параллельно.
const FIREBASE_SDK = [
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-database-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js'
];
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}
let firebaseSdkPromise = null;
function loadFirebaseSdk() {
    if (window.firebase?.database && window.firebase?.auth) return Promise.resolve();
    // app – первым (остальные к нему цепляются), database и auth – параллельно
    firebaseSdkPromise ||= loadScript(FIREBASE_SDK[0])
        .then(() => Promise.all([loadScript(FIREBASE_SDK[1]), loadScript(FIREBASE_SDK[2])]))
        .catch(e => console.error('Firebase SDK load failed', e));
    return firebaseSdkPromise;
}
loadFirebaseSdk(); // стартуем загрузку сразу при запуске модуля

async function loadAppData() {
    showAnimatedLoader();
    try {
        loadCachedState();
        const hadCache = state.hikesWithTitle.length > 0;
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
        // deep link выполняем, когда подключилась база: ему нужны хайки и записи из Firebase
        let firebaseReady = false;
        const ensureDeepLink = () => {
            if (deepLinkHandled || !startParam || !firebaseReady) return;
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
            // сколько человек ждал главную: с открытия страницы, из кэша или с сети – для поиска тормозов
            setTimeout(() => {
                const sec = performance.now() / 1000;
                const bucket = sec < 2 ? 'до 2 с' : sec < 5 ? '2–5 с' : sec < 10 ? '5–10 с' : 'дольше 10 с';
                log(`загрузка: главная ${bucket} (${hadCache ? 'из кэша' : 'с сети'})`, state.userCard?.status !== 'active', state.user);
            }, 0);
            mountAssistant();
            firstRenderDone = true;
            ensureDeepLink();
        };

        let hikesFromFirebase = false;
        const applyHikes = (newList) => {
            state.hikesList = newList;
            state.hikesData = Object.fromEntries(newList.map(h => [h.date, h]));
            state.hikesWithTitle = newList.filter(h => h.title && h.title.trim() !== '');
            applyOwnerBookings(); // #5: переприменить записи владельца при обновлении хайков
            saveCachedState();
            earlyRenderHome(); // показать экран сразу, как пришли хайки (для тех, у кого нет кэша)
        };

        // Быстрый первый запуск: список хайков с CDN (/api/hikes), запрошен ещё в index.html.
        // Если Firebase успел раньше – ответ CDN просто игнорируем.
        window.__hikesBoot?.then(raw => {
            if (raw && !hikesFromFirebase && !state.hikesWithTitle.length) applyHikes(hikesFromSnapshot(raw));
        });

        // кэш есть – показываем главную сразу, не дожидаясь Firebase SDK
        earlyRenderHome();
        await loadFirebaseSdk();
        initFirebase();
        const database = getDatabase();
        firebaseReady = true;
        if (firstRenderDone) ensureDeepLink();

        if (database) {
            subscribeToHikes((newList) => {
                hikesFromFirebase = true;
                applyHikes(newList);
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

        // _userRegs (Firebase) нужен всем — по нему понятно, ходил ли человек уже на хайк (билет – только на первый).
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

        const isGuestNow = state.userCard.status !== 'active';
        log('открыл приложение', isGuestNow, state.user);
        // Лист guests хранит только текст действия, поэтому источник и медленную загрузку
        // пишем отдельными событиями – они попадут в ежечасный отчёт.
        const src = tg?.initDataUnsafe?.start_param || '';
        if (src) log(`пришёл по ссылке: ${src.replace(/^(hike|card|paid)_.*/, '$1_<дата>')}`, isGuestNow, state.user);
        const loadSec = Math.round((Date.now() - APP_T0) / 1000);
        if (loadSec >= 5) log(`долгая загрузка: ${loadSec >= 20 ? '20+' : loadSec >= 10 ? '10–20' : '5–10'} с`, isGuestNow, state.user);
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

        // отмечаем открытие в app_users. Разрешение на сообщения при входе не спрашиваем – это
        // перебивало первое впечатление (9 из 16 нажимали «не сейчас»). Спрашиваем после
        // просмотра хайка и после записи (calendar.js).
        pingAppUser();

        // Если оплата билета была, а возврата по startapp=paid не случилось —
        // предлагаем подтвердить оплату. Ждём, пока отработает deep link.
        setTimeout(() => {
            try { offerPendingTicketRecovery(); } catch (e) { console.error(e); }
        }, 2500);

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

// Стартуем, как только готов DOM, а не по 'load': тот ждёт фоновую картинку и библиотеку карт,
// и на медленном интернете приложение стояло пустым лишние 10+ секунд.
function startApp() {
    state.user = tg?.initDataUnsafe?.user;
    initCollapsibleBlocks();
    initClickLog();
    initSheetDrag();
    loadAppData();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp, { once: true });
else startApp();
