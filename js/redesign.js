// Новый дизайн (редизайн 11.2026) – пока только для тех, чей Telegram id в списке.
// Включает класс html.rd: новые стили в style.css (раздел «РЕДИЗАЙН») и новую главную (ui/rd-home.js).
// Права – по числовому id, не по нику: ник можно сменить.
import { state } from './state.js';

const RD_USER_IDS = new Set(['163665735']); // @maxmolotov

function currentUserId() {
    return String(state.user?.id || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
}

export function isRedesign() {
    return RD_USER_IDS.has(currentUserId());
}

export function applyRedesignFlag() {
    document.documentElement.classList.toggle('rd', isRedesign());
}

// цвет свечения сверху экрана берётся у главного элемента экрана
export const RD_GLOW = {
    hike: '#1A2610',    // хайк – лайм
    city: '#0F2A3E',    // событие в городе – голубой
    woman: '#2E1426',   // женский хайк – розовый
    rain: '#1E2833',    // дата перенесена – серо-голубой
    card: '#1D3A55',    // карта интеллигента – синий карты
    people: '#10202E',  // люди – синий
    admin: '#1E1A2E',   // админка – фиолетовый
};

export function setRdGlow(key) {
    if (!isRedesign()) return;
    document.documentElement.style.setProperty('--rd-glow', RD_GLOW[key] || RD_GLOW.hike);
}
