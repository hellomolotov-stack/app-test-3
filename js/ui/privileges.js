// js/ui/privileges.js
import { haptic, openLink, mainDiv, subtitle, parseLinks } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { SEASON_CARD_LINK, PERMANENT_CARD_LINK } from '../config.js';
import { showBottomNav, setupBottomNav, showBack, setUserInteracted, resetNavActive, scrollPageToTop, cleanupProfileOverlays } from './common.js';
import { renderHome } from './home.js';

export function renderNewcomerPage(isGuest = false) {
    cleanupProfileOverlays();
    window.toggleShareButton && window.toggleShareButton(true);
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
  subtitle().textContent = `🗺️ как всё устроено`;   // <-- новый заголовок
    showBack(() => {
        window.toggleShareButton && window.toggleShareButton(false);
        renderHome();
    });
    haptic();
    log('novichkam_page_opened', isGuest, state.user);
    showBottomNav(true);
    setupBottomNav();
    scrollPageToTop();

    let faqHtml = '';
    if (state.faq && state.faq.length) {
        state.faq.forEach(item => {
            let answer = item.a;
            answer = answer.replace(/\[@yaltahiking\]\(https:\/\/t\.me\/yaltahiking\)/g, '<a href="#" data-url="https://t.me/yaltahiking" data-guest="false" class="dynamic-link">@yaltahiking</a>');
            answer = answer.replace(/zapovedcrimea\.ru/g, '<a href="#" data-url="https://zapovedcrimea.ru/choose-pass" data-guest="false" class="dynamic-link">zapovedcrimea.ru</a>');
            faqHtml += `<div class="partner-item"><strong>${item.q}</strong><p>${answer}</p></div>`;
        });
    } else {
        faqHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    mainDiv().innerHTML = `
        <div class="card-container newcomer-page faq-page" style="margin-bottom: 0;">
            ${faqHtml}
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px; margin-bottom: 0;">
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'support_click', ${isGuest}); return false;" class="btn btn-yellow" style="margin:0 16px;">задать вопрос</a>
                <button id="goHomeStatic" class="btn btn-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;
    document.getElementById('goHomeStatic')?.addEventListener('click', () => {
        haptic();
        setUserInteracted();
        window.toggleShareButton && window.toggleShareButton(false);
        renderHome();
    });
}

export function renderGuestPrivileges() {
    cleanupProfileOverlays();
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = `💳 привилегии с картой`;
    showBack(renderHome);
    showBottomNav(true);
    setupBottomNav();
    scrollPageToTop();

    let clubHtml = '';
    if (state.guestPrivileges.club && state.guestPrivileges.club.length) {
        state.guestPrivileges.club.forEach(item => {
            let titleHtml = item.title;
            if (item.title.startsWith('новое:')) {
                titleHtml = `<span style="color: var(--yellow);">новое:</span> ${item.title.substring(6)}`;
            }
            clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) {
                clubHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            }
            clubHtml += `</div>`;
        });
    } else {
        clubHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    let cityHtml = '';
    if (state.guestPrivileges.city && state.guestPrivileges.city.length) {
        state.guestPrivileges.city.forEach(item => {
            cityHtml += `<div class="partner-item"><strong>${item.title}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) {
                cityHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            } else if (item.button_link) {
                let linkHtml = '';
                if (item.button_link.includes('[') && item.button_link.includes('](')) {
                    linkHtml = parseLinks(item.button_link, false);
                } else {
                    linkHtml = `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link">📍 ${item.button_link}</a>`;
                }
                cityHtml += `<p>📍 ${linkHtml}</p>`;
            }
            cityHtml += `</div>`;
        });
    } else {
        cityHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    mainDiv().innerHTML = `
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>
            ${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>
            ${cityHtml}
        </div>
    `;
}

export function renderPriv() {
    cleanupProfileOverlays();
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = `🤘🏻твои привилегии, ${state.user?.first_name || 'друг'}`;
    showBack(renderHome);
    showBottomNav(true);
    setupBottomNav();
    scrollPageToTop();

    let clubHtml = '';
    if (state.privileges.club && state.privileges.club.length) {
        state.privileges.club.forEach(item => {
            let titleHtml = item.title;
            if (item.title.startsWith('новое:')) {
                titleHtml = `<span style="color: var(--yellow);">новое:</span> ${item.title.substring(6)}`;
            }
            clubHtml += `<div class="partner-item"><strong>${titleHtml}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) {
                clubHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            }
            clubHtml += `</div>`;
        });
    } else {
        clubHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    let cityHtml = '';
    if (state.privileges.city && state.privileges.city.length) {
        state.privileges.city.forEach(item => {
            cityHtml += `<div class="partner-item"><strong>${item.title}</strong><p>${item.description}</p>`;
            if (item.button_text && item.button_link) {
                cityHtml += `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link btn btn-yellow" style="margin-top:12px;">${item.button_text}</a>`;
            } else if (item.button_link) {
                let linkHtml = '';
                if (item.button_link.includes('[') && item.button_link.includes('](')) {
                    linkHtml = parseLinks(item.button_link, false);
                } else {
                    linkHtml = `<a href="#" data-url="${item.button_link}" data-guest="false" class="dynamic-link">📍 ${item.button_link}</a>`;
                }
                cityHtml += `<p>📍 ${linkHtml}</p>`;
            }
            cityHtml += `</div>`;
        });
    } else {
        cityHtml = '<div class="partner-item"><p>Нет данных</p></div>';
    }

    mainDiv().innerHTML = `
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>
            ${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>
            ${cityHtml}
        </div>
    `;
}

export function renderGift(isGuest = false) {
    cleanupProfileOverlays();
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = `подари новый опыт`;
    showBack(renderHome);
    showBottomNav(true);
    setupBottomNav();
    scrollPageToTop();

    const giftText = state.giftContent || 'Информация о подарке временно недоступна.';
    mainDiv().innerHTML = `
        <div class="card-container">
            <div class="partner-item"><strong>как подарить карту интеллигента</strong><p style="white-space: pre-line;">${giftText}</p></div>
            <div id="giftAccordion" class="card-accordion">
                <button class="accordion-btn btn-yellow btn-glow">купить в подарок</button>
                <div class="dropdown-menu">
                    <a href="${SEASON_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'gift_season_click', ${isGuest}); return false;" class="btn btn-outline">сезонная</a>
                    <a href="${PERMANENT_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'gift_permanent_click', ${isGuest}); return false;" class="btn btn-outline">бессрочная</a>
                </div>
            </div>
        </div>
    `;
    setupAccordion('giftAccordion', isGuest);
}

export function renderPassPage(isGuest = false) {
    cleanupProfileOverlays();
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = `🪪 пропуск в заповедник`;
    showBack(renderHome);
    showBottomNav(true);
    setupBottomNav();
    scrollPageToTop();

    const content = state.passInfo.content || 'Информация о пропуске временно недоступна.';
    const buttonLink = state.passInfo.buttonLink || '';
    mainDiv().innerHTML = `
        <div class="card-container">
            <div class="partner-item"><strong>как оформить пропуск</strong><p style="white-space: pre-line;">${content}</p></div>
            <div style="display: flex; justify-content: center; margin: 20px 16px 0;"><a href="#" class="btn btn-yellow" id="passButton" style="width: 100%;">оформить пропуск</a></div>
        </div>
    `;
    const passButton = document.getElementById('passButton');
    if (passButton && buttonLink) {
        passButton.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            openLink(buttonLink, 'pass_button_click', isGuest);
        });
    }
}

function setupAccordion(containerId, isGuest) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const accordionBtn = container.querySelector('.accordion-btn');
    const dropdown = container.querySelector('.dropdown-menu');
    if (accordionBtn && dropdown) {
        accordionBtn.addEventListener('click', (e) => {
            haptic();
            e.preventDefault();
            log('nav_toggle', isGuest, state.user);
            dropdown.classList.toggle('show');
        });
    }
}
