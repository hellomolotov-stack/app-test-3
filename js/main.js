// js/main.js
import { tg, haptic, openLink, mainDiv, subtitle } from './utils.js';
import { state, loadCachedState, saveCachedState, loadBookingStatusFromLocal, saveBookingStatusToLocal } from './state.js';
import { initFirebase, getDatabase, subscribeToHikes, loadUserData, loadMetrics, loadFaq, loadPrivileges, loadGuestPrivileges, loadPassInfo, loadGiftContent, loadRandomPhrases, loadLeaders, loadRegistrationsPopup, loadPopupConfig, loadUserRegistrations, saveUserAvatar } from './firebase.js';
import { log } from './api.js';
import { ROBOKASSA_LINK, SEASON_CARD_LINK, PERMANENT_CARD_LINK } from './config.js';
import { showAnimatedLoader, hideAnimatedLoader, showBottomNav, setupBottomNav, setUserInteracted, updateActiveNav, showBack, hideBack } from './ui/common.js';
import { renderHome } from './ui/home.js';
import { renderCalendar, showBottomSheet } from './ui/calendar.js';
import { renderProfiles } from './ui/profiles.js';
import { renderNewcomerPage, renderGift, renderPassPage } from './ui/privileges.js';

// Глобальные переменные для совместимости
window.userInteracted = false;
window.log = log;
window.openLink = openLink;
window.haptic = haptic;

// Инициализация Telegram WebApp
tg.ready();
tg.expand();

// Back button по умолчанию скрыт
hideBack();

// Функция загрузки всех данных
async function loadAppData() {
    showAnimatedLoader();
    const loaderTimeout = setTimeout(() => {
        console.warn('loadData timeout – force hide loader');
        hideAnimatedLoader();
    }, 10000);

    try {
        // Пробуем загрузить кэш
        loadCachedState();

        // Инициализируем Firebase
        const db = initFirebase();
        if (db) {
            // Подписка на хайки
            subscribeToHikes((newList) => {
                state.hikesList = newList;
                // Преобразуем в объект для быстрого доступа
                state.hikesData = {};
                newList.forEach(h => state.hikesData[h.date] = h);
                
                const calendarContainer = document.getElementById('calendarContainer');
                if (calendarContainer && !isPrivPage) renderCalendar(calendarContainer);
                const bookingsContainer = document.getElementById('userBookingsContainer');
                if (bookingsContainer) {
                    // renderUserBookings вызывается из home.js, здесь просто перерисовываем если нужно
                    if (typeof window.renderUserBookings === 'function') {
                        window.renderUserBookings(bookingsContainer);
                    }
                }
                saveCachedState();
            });

            // Параллельная загрузка остальных данных
            const [
                metrics, faq, privileges, guestPrivileges, passInfo,
                giftContent, randomPhrases, leaders, registrationsPopup, popupConfig
            ] = await Promise.all([
                loadMetrics(),
                loadFaq(),
                loadPrivileges(),
                loadGuestPrivileges(),
                loadPassInfo(),
                loadGiftContent(),
                loadRandomPhrases(),
                loadLeaders(),
                loadRegistrationsPopup(),
                loadPopupConfig()
            ]);

            if (metrics) state.metrics = metrics;
            if (faq) state.faq = faq;
            if (privileges) state.privileges = privileges;
            if (guestPrivileges) state.guestPrivileges = guestPrivileges;
            if (passInfo) state.passInfo = passInfo;
            if (giftContent) state.giftContent = giftContent;
            if (randomPhrases) state.randomPhrases = randomPhrases;
            if (leaders) state.leaders = leaders;
            if (registrationsPopup) state.registrationsPopup = registrationsPopup;
            if (popupConfig) state.popupConfig = { ...state.popupConfig, ...popupConfig };
        }

        // Данные пользователя
        const user = tg.initDataUnsafe?.user;
        state.user = user;
        if (user?.id) {
            const userData = await loadUserData(user.id);
            state.userCard = userData;
            if (userData.status === 'active' && user.photo_url) {
                await saveUserAvatar(user.id, user.photo_url);
            }

            // Загружаем статусы бронирования
            if (userData.status === 'active') {
                try {
                    const regs = await loadUserRegistrations(user.id);
                    state.hikeBookingStatus = {};
                    state.hikesList.forEach((hike, index) => {
                        state.hikeBookingStatus[index] = regs[hike.date] === true;
                    });
                } catch (e) {
                    console.error(e);
                    state.hikeBookingStatus = loadBookingStatusFromLocal();
                }
            } else {
                state.hikeBookingStatus = loadBookingStatusFromLocal();
            }
        } else {
            state.userCard = { status: 'inactive', hikes: 0, cardUrl: '' };
            state.hikeBookingStatus = loadBookingStatusFromLocal();
        }

        // Заполняем ссылки в popupConfig
        state.popupConfig.ticketLink = ROBOKASSA_LINK;
        state.popupConfig.seasonCardLink = SEASON_CARD_LINK;
        state.popupConfig.permanentCardLink = PERMANENT_CARD_LINK;

        saveCachedState();
        renderHome();
        setupBottomNav();

        // Обработка deep link (если перешли по ссылке на конкретный хайк)
        const urlParams = new URLSearchParams(window.location.search);
        const startParam = tg.initDataUnsafe?.start_param || urlParams.get('startapp') || urlParams.get('start');
        if (startParam && startParam.startsWith('hike_')) {
            const targetDate = normalizeDate(startParam.substring(5));
            let attempts = 0;
            const maxAttempts = 100;
            const interval = setInterval(() => {
                attempts++;
                const targetIndex = state.hikesList.findIndex(h => h.date === targetDate);
                if (targetIndex !== -1) {
                    clearInterval(interval);
                    setTimeout(() => {
                        try {
                            showBottomSheet(targetIndex);
                        } catch (e) {
                            console.error('Error in showBottomSheet:', e);
                        }
                    }, 200);
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                }
            }, 300);
        }

        // Проверка возврата с оплаты
        const paymentSuccess = urlParams.get('payment_success');
        const invId = urlParams.get('InvId');
        const hikeDate = urlParams.get('hike');
        if (paymentSuccess === '1' && invId && db) {
            const orderRef = db.ref(`orders/${invId}`);
            const snapshot = await orderRef.once('value');
            const order = snapshot.val();
            if (order && order.status === 'paid') {
                if (order.type === 'ticket' && order.hikeDate) {
                    const hikeIndex = state.hikesList.findIndex(h => h.date === order.hikeDate);
                    if (hikeIndex !== -1) {
                        state.hikeBookingStatus[hikeIndex] = true;
                        renderHome(); // обновим главную
                    }
                }
                const newUrl = window.location.pathname + (hikeDate ? `?hike=${hikeDate}` : '');
                window.history.replaceState({}, '', newUrl);
            }
        }

    } catch (e) {
        console.error('Unhandled error in loadData:', e);
        renderHome();
    } finally {
        clearTimeout(loaderTimeout);
        hideAnimatedLoader();
    }
}

// Запуск
loadAppData();

// Глобальные обработчики кликов для динамических ссылок и кнопок
document.addEventListener('click', function(e) {
    const link = e.target.closest('.dynamic-link, .nav-popup a, .btn-newcomer, .accordion-btn, .bottom-sheet-nav-arrow, .btn, .participant-counter, .booking-detail-btn, .bookings-calendar-link, .booking-go-btn, .leader-name, .popup-link, .profile-hike-link');
    if (!link) return;

    // Обработка уже реализована в соответствующих модулях через делегирование,
    // но некоторые нужно обработать здесь.
    if (link.classList.contains('dynamic-link')) {
        e.preventDefault();
        const url = link.dataset.url;
        const isGuest = link.dataset.guest === 'true';
        openLink(url, 'link_click', isGuest);
    }
    // ... остальные обработчики могут быть добавлены по мере необходимости
});

// Экспорт для использования в других модулях
export { loadAppData };
