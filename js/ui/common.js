// js/ui/common.js
// (замените весь файл на этот код)

import { haptic, openLink } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';

export let isPrivPage = false;
export let isMenuActive = false;
export let manualNavClick = null;
export let manualNavTimer = null;
export let userInteracted = false;

export const uiActions = {
    setupBottomNav: () => {
        console.log('setupBottomNav called - will be overridden in main');
    }
};

export function setupBottomNav() {
    uiActions.setupBottomNav();
}

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
    if (!userInteracted) {
        setActiveNav('navHome');
        return;
    }

    const isProfilesPage = document.querySelector('.profiles-two-columns') !== null || 
                           document.querySelector('.profiles-grid') !== null ||
                           document.querySelector('.profile-edit-fab') !== null;
    if (isProfilesPage) {
        setActiveNav('navProfiles');
        return;
    }

    const calendarContainer = document.getElementById('calendarContainer');
    if (calendarContainer) {
        const rect = calendarContainer.getBoundingClientRect();
        const isCalendarVisible = rect.top < window.innerHeight * 0.6 && rect.bottom > 150;
        if (isCalendarVisible) {
            setActiveNav('navHikes');
            return;
        }
    }

    setActiveNav('navHome');
}

export function showBottomNav(show = true) {
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) {
        if (show) bottomNav.classList.remove('hidden');
        else bottomNav.classList.add('hidden');
    }
}

let loaderInterval = null, loaderMessageTimer = null;
export function showAnimatedLoader() {
    const loader = document.getElementById('initial-loader');
    if (!loader) return;
    loader.innerHTML = `
        <div class="loader-animation">
            <div class="loader-emoji" id="loaderEmoji">🗺️</div>
            <div class="loader-text" id="loaderText">выбираем маршрут</div>
        </div>
        <div class="loader-message" id="loaderMessage" style="display: none;">⚡️ для работы приложения включи три буквы</div>
    `;
    loader.style.display = 'flex';
    loader.classList.remove('fade-out');
    const steps = [
        { emoji: '🗺️', text: 'выбираем маршрут' },
        { emoji: '🎩', text: 'собираем интеллигентов' },
        { emoji: '📷', text: 'заряжаем камеру' },
        { emoji: '💫', text: 'идём на хайк' }
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
    }, 1000);
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

export function setUserInteracted() { userInteracted = true; }

// Экспортируем функцию прокрутки страницы в начало
export function scrollPageToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.getElementById('mainContent');
    if (mainContent) mainContent.scrollTop = 0;
}
