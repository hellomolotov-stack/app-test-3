// Вспомогательные функции
export function haptic() {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
}

export function openLink(url, action, isGuest) {
    haptic();
    if (action && window.log) window.log(action, isGuest);
    const tg = window.Telegram?.WebApp;
    if (!tg) return window.open(url, '_blank');
    if (url.startsWith('https://t.me/')) {
        tg.openTelegramLink(url);
        setTimeout(() => tg.close(), 100);
    } else {
        tg.openLink(url);
    }
}

export function normalizeDate(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const year = parts[0].padStart(4, '0');
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

export function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        const month = parseInt(parts[1], 10) - 1;
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        return `${day} ${monthNames[month]}`;
    }
    return dateStr;
}

export function parseLinks(text, isGuest) {
    if (!text) return '';
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, linkText, url) {
        url = url.replace(/\.$/, '');
        return `<a href="#" data-url="${url}" data-guest="${isGuest}" class="dynamic-link">${linkText}</a>`;
    });
}

// Глобальные ссылки на объекты Telegram и DOM
export const tg = window.Telegram?.WebApp;
export const mainDiv = () => document.getElementById('mainContent');
export const subtitle = () => document.getElementById('subtitle');
