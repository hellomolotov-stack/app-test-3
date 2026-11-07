// Новый дизайн (редизайн 11.2026) – пока только для тех, чей Telegram id в списке.
// Включает класс html.rd: новые стили в style.css (раздел «РЕДИЗАЙН») и новую главную (ui/rd-home.js).
// Права – по числовому id, не по нику: ник можно сменить.
import { state } from './state.js';

// 05.11: новый дизайн из облачной сессии выключен – Макс вернулся к классическому (с правками v2 ниже)
const RD_USER_IDS = new Set([]);
// v2 – классический дизайн с правками (карта в углу, ближайший хайк, фото только в шапке, единые скругления)
const V2_USER_IDS = new Set(['163665735', '7845375334']); // @maxmolotov, @hellointelligent (тест версии для гостей)
// 07.11.2026: новая главная (v2) раскатана на всех пользователей; V2_USER_IDS оставлен для истории
export function isV2() { return true; }

function currentUserId() {
    return String(state.user?.id || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
}

// кому доступен новый дизайн (и переключатель в меню)
export function canUseRedesign() {
    return RD_USER_IDS.has(currentUserId());
}

// можно вернуться к старому дизайну – выбор хранится на телефоне
const OFF_KEY = 'rdOff';
function redesignOff() {
    try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; }
}

export function isRedesign() {
    return canUseRedesign() && !redesignOff();
}

export function applyRedesignFlag() {
    document.documentElement.classList.toggle('rd', isRedesign());
    document.documentElement.classList.toggle('v2', isV2());
    mountDesignToggle();
}

// пункт в меню «⋯»: «старый дизайн» / «новый дизайн» – только тем, кому доступен новый
function mountDesignToggle() {
    if (!canUseRedesign()) return;
    const list = document.querySelector('#navPopup .ns-list');
    if (!list) return;
    let item = document.getElementById('popupDesign');
    if (!item) {
        item = document.createElement('a');
        item.href = '#';
        item.id = 'popupDesign';
        item.className = 'popup-item';
        item.addEventListener('click', e => {
            e.preventDefault();
            try { localStorage.setItem(OFF_KEY, isRedesign() ? '1' : '0'); } catch (err) {}
            location.reload();
        });
        list.appendChild(item);
    }
    item.textContent = isRedesign() ? '🎨 вернуть старый дизайн' : '✨ включить новый дизайн';
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
