// js/ui/chat-entry.js – вход в чат-помощник. Чат (~50 КБ кода) открывают не все и не сразу,
// поэтому он грузится отдельным файлом при первом открытии (import()).
let loading = null;

export function openOnboardingChat(...args) {
    loading ||= import('./onboarding-chat.js').catch(error => { loading = null; throw error; });
    return loading
        .then(m => m.openOnboardingChat(...args))
        .catch(error => {
            console.error('чат:', error);
            alert('Не получилось открыть чат. Проверь интернет и попробуй ещё раз');
        });
}
