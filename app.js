// Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();

const platform = tg.platform;

function haptic() {
    tg.HapticFeedback?.impactOccurred('light');
}
window.haptic = haptic;

function openLink(url, action, isGuest) {
    haptic();
    if (action) log(action, isGuest);

    if (platform === 'android') {
        window.open(url, '_blank');
        tg.close();
    } else if (platform === 'ios') {
        // iOS: открываем во встроенном браузере, чтобы можно было вернуться назад
        tg.openLink(url, { try_instant_view: false });
    } else {
        tg.openTelegramLink(url);
    }
}
window.openLink = openLink;

// ... весь остальной код (точно такой же, как в предыдущем полном ответе, без изменений)
