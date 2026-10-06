// js/ui/common.js
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
// Заставка с эмодзи лежит прямо в index.html (стили там же) – видна с первого кадра,
// ещё до загрузки скриптов и style.css. Здесь только «медленно? включи три буквы» и аккуратный уход.
const LOADER_MIN_MS = 3000; // заставку видно минимум 3 с (два эмодзи), даже если всё прогрузилось мгновенно

export function showAnimatedLoader() {
    const loader = document.getElementById('initial-loader');
    if (!loader) return;
    loader.style.display = 'flex';
    loader.classList.remove('fade-out');
    if (loaderMessageTimer) clearTimeout(loaderMessageTimer);
    loaderMessageTimer = setTimeout(() => loader.classList.add('is-slow'), 6000);
}

let loaderHiding = false;
export function hideAnimatedLoader() {
    const loader = document.getElementById('initial-loader');
    if (!loader || loaderHiding) return;
    loaderHiding = true;
    const cssReady = () => window.__cssReady || [...document.styleSheets].some(sh => /style\.css/.test(sh.href || ''));
    const go = () => {
        if (loaderInterval) clearInterval(loaderInterval);
        if (loaderMessageTimer) clearTimeout(loaderMessageTimer);
        loader.classList.add('fade-out');
        setTimeout(() => { loader.style.display = 'none'; loader.innerHTML = ''; }, 450);
    };
    const wait = () => {
        // не раньше минимума и не раньше, чем применились стили (иначе мелькнёт голая разметка)
        if (performance.now() < LOADER_MIN_MS || (!cssReady() && performance.now() < 10000)) return setTimeout(wait, 100);
        go();
    };
    wait();
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

export function scrollPageToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.getElementById('mainContent');
    if (mainContent) mainContent.scrollTop = 0;
}

// Очистка всех временных элементов (блюр, кнопки профиля и т.д.)
export function cleanupProfileOverlays() {
    document.querySelector('.profile-blur-overlay')?.remove();
    document.querySelector('.guest-center-btn')?.remove();
    document.querySelector('.center-floating-btn')?.remove();
    document.querySelector('.profile-preview-banner')?.remove();
    document.querySelector('.profile-edit-fab')?.remove();
    document.getElementById('stickyHikeCta')?.remove();
    document.getElementById('safetyShareBtn')?.remove();
    document.body.style.overflow = '';
}
