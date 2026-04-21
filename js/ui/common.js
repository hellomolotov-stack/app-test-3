// js/ui/common.js
import { haptic, mainDiv, subtitle, tg } from '../utils.js';
import { state } from '../state.js';
import { renderMainPage } from './main.js';
import { renderCalendar } from './calendar.js';
import { renderProfiles } from './profiles.js';
import { renderMore } from './more.js';

let bottomNavVisible = true;

export function showBottomNav(show) {
    const nav = document.getElementById('bottomNav');
    if (nav) nav.style.display = show ? 'flex' : 'none';
    bottomNavVisible = show;
}

export function setupBottomNav() {
    const navMain = document.getElementById('navMain');
    const navCalendar = document.getElementById('navCalendar');
    const navProfiles = document.getElementById('navProfiles');
    const navMore = document.getElementById('navMore');

    [navMain, navCalendar, navProfiles, navMore].forEach(nav => {
        if (!nav) return;
        nav.removeEventListener('click', handleNavClick);
        nav.addEventListener('click', handleNavClick);
    });
}

function handleNavClick(e) {
    const id = e.currentTarget.id;
    haptic();
    window.isPrivPage = false; // сбрасываем при ручном переходе
    switch (id) {
        case 'navMain': renderMainPage(); break;
        case 'navCalendar': renderCalendar(); break;
        case 'navProfiles': renderProfiles(); break;
        case 'navMore': renderMore(); break;
    }
    setActiveNav(id);
}

export function setActiveNav(id) {
    // ✅ Игнорируем переключение активного пункта на страницах профилей
    if (window.isPrivPage) return;

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

export function resetNavActive() {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
}

export function hideBack() {
    tg.BackButton.hide();
}

// Если у вас есть IntersectionObserver для автоопределения секций, добавьте его сюда с проверкой:
/*
const sectionObserver = new IntersectionObserver((entries) => {
    if (window.isPrivPage) return; // ✅ не переключаем на страницах профилей
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.id;
            if (id === 'mainSection') setActiveNav('navMain');
            else if (id === 'calendarSection') setActiveNav('navCalendar');
            // ...
        }
    });
}, { threshold: 0.3 });
// sectionObserver.observe(...)
*/
