// Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();

// Определяем платформу
const platform = tg.platform; // 'ios', 'android', 'macos', 'tdesktop', etc.

// Функция тактильного отклика
function haptic() {
    tg.HapticFeedback?.impactOccurred('light');
}
window.haptic = haptic;

// Универсальная функция открытия ссылок с учётом платформы
function openLink(url, action, isGuest) {
    haptic();
    if (action) log(action, isGuest);

    if (platform === 'android') {
        // Android: сворачиваем приложение в пузырёк
        window.open(url, '_blank');
        tg.close();
    } else if (platform === 'ios') {
        // iOS: открываем ссылку, не закрывая WebApp, чтобы можно было вернуться назад
        tg.openTelegramLink(url);
        // НЕ вызываем tg.close()
    } else {
        // Другие платформы (macos, tdesktop) – пробуем стандартный способ
        tg.openTelegramLink(url);
        // tg.close(); // можно добавить при необходимости
    }
}
window.openLink = openLink;

// ... остальной код (backButton, showBack, hideBack, конфигурация, log, loadData, setupAccordion, showConfetti, renderPriv, renderGuestPriv, renderGift, showGuestPopup, renderGuestHome, renderHome, buyCard) полностью идентичен последней версии из предыдущего ответа, за исключением того, что во всех местах, где ранее был вызов openLink, теперь используется эта новая функция.

// ВАЖНО: все вызовы openLink в коде остаются без изменений – они будут автоматически использовать новую логику.
