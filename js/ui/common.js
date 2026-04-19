import { haptic, openLink } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';

// Нижнее меню и попап
export let isMenuActive = false;
export let manualNavClick = null;
export let manualNavTimer = null;

export function setManualNav(target) {
    if (manualNavTimer) clearTimeout(manualNavTimer);
    manualNavClick = target;
    manualNavTimer = setTimeout(() => { manualNavClick = null; }, 2000);
}

export function setActiveNav(activeId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (activeId) document.getElementById(activeId)?.classList.add('active');
}

export function resetNavActive() {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
}

export function updateActiveNav() {
    if (isMenuActive) return;
    if (manualNavClick) {
        setActiveNav(manualNavClick === 'home' ? 'navHome' : manualNavClick === 'hikes' ? 'navHikes' : 'navProfiles');
        return;
    }
    if (!window.userInteracted) {
        setActiveNav('navHome');
        return;
    }
    const isProfilesPage = document.getElementById('profilesGrid') !== null;
    const isEditProfilePage = document.getElementById('editProfileForm') !== null;
    if (isProfilesPage || isEditProfilePage) {
        setActiveNav('navProfiles');
        return;
    }
    const calendarContainer = document.getElementById('calendarContainer');
    if (!calendarContainer) {
        setActiveNav('navHome');
        return;
    }
    const rect = calendarContainer.getBoundingClientRect();
    const isCalendarVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (isCalendarVisible) setActiveNav('navHikes');
    else setActiveNav('navHome');
}

export function setupBottomNav() {
    // Эта функция будет определена позже с учетом зависимостей от renderHome и т.д.
    // Пока оставим заглушку, реальная реализация будет в main.js после импорта всех частей
    console.log('setupBottomNav called - implement in main');
}

export function showBottomNav(show = true) {
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) {
        if (show) bottomNav.classList.remove('hidden');
        else bottomNav.classList.add('hidden');
    }
}

// Анимированный лоадер
let loaderInterval = null, loaderMessageTimer = null;
export function showAnimatedLoader() {
    const loader = document.getElementById('initial-loader');
    if (!loader) return;
    loader.innerHTML = `
        <div class="loader-animation">
            <div class="loader-emoji" id="loaderEmoji">⛰️</div>
            <div class="loader-text" id="loaderText">выбираем вершину</div>
        </div>
        <div class="loader-message" id="loaderMessage" style="display: none;">⚡️ для работы приложения включи три буквы</div>
    `;
    loader.style.display = 'flex';
    loader.classList.remove('fade-out');
    const steps = [
        { emoji: '⛰️', text: 'выбираем вершину' },
        { emoji: '🥾', text: 'завязываем шнурки' },
        { emoji: '🗺️', text: 'прокладываем маршрут' },
        { emoji: '✨', text: 'наполняемся красотой' }
    ];
    let index = 0;
    const emojiEl = document.getElementById('loaderEmoji');
    const textEl = document.getElementById('loaderText');
    const messageEl = document.getElementById('loaderMessage');
    if (!emojiEl || !textEl || !messageEl) return;
    loaderInterval = setInterval(() => {
        index = (index + 1) % steps.length;
        emojiEl.textContent = steps[index].emoji;
        textEl.textContent = steps[index].text;
    }, 1500);
    loaderMessageTimer = setTimeout(() => {
        if (loader.style.display !== 'none' && !loader.classList.contains('fade-out')) {
            messageEl.style.display = 'block';
        }
    }, 3000);
}

export function hideAnimatedLoader() {
    if (loaderInterval) clearInterval(loaderInterval);
    if (loaderMessageTimer) clearTimeout(loaderMessageTimer);
    const loader = document.getElementById('initial-loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => { loader.style.display = 'none'; loader.innerHTML = ''; }, 300);
    }
}

// Back button
export function showBack(callback) {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    const backButton = tg.BackButton;
    backButton.offClick();
    backButton.onClick(() => { haptic(); callback(); });
    backButton.show();
}

export function hideBack() {
    window.Telegram?.WebApp?.BackButton?.hide();
}

// Глобальные переменные для UI
export let userInteracted = false;
export function setUserInteracted() { userInteracted = true; }
