// js/ui/privileges.js
import { haptic, openLink, mainDiv, subtitle, parseLinks, tg } from '../utils.js';
import { state } from '../state.js';
import { log } from '../api.js';
import { SEASON_CARD_LINK, PERMANENT_CARD_LINK } from '../config.js';
import { openOnboardingChat } from './onboarding-chat.js';
import { showBottomNav, setupBottomNav, showBack, setUserInteracted, resetNavActive, scrollPageToTop, cleanupProfileOverlays } from './common.js';
import { renderHome } from './home.js';

export function renderNewcomerPage(isGuest = false) {
    cleanupProfileOverlays();
    window.toggleShareButton && window.toggleShareButton(true);
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = `🗺️ как всё устроено`;
    showBack(() => {
        window.toggleShareButton && window.toggleShareButton(false);
        renderHome();
    });
    haptic();
    log('страница новичкам', isGuest, state.user);
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
                <button id="talkToBotBtn" class="btn btn-yellow" style="margin:0 16px;">💬 поговорить с ботом</button>
                <a href="https://t.me/hellointelligent" onclick="event.preventDefault(); openLink(this.href, 'задать вопрос', ${isGuest}); return false;" class="btn btn-outline" style="margin:0 16px;">задать вопрос</a>
                <button id="goHomeStatic" class="btn btn-outline" style="width:calc(100% - 32px); margin:0 16px;">&lt; на главную</button>
            </div>
        </div>
    `;
    document.getElementById('talkToBotBtn')?.addEventListener('click', () => {
        haptic();
        log('поговорить с ботом', isGuest, state.user);
        openOnboardingChat();
    });
    document.getElementById('goHomeStatic')?.addEventListener('click', () => {
        haptic();
        setUserInteracted();
        window.toggleShareButton && window.toggleShareButton(false);
        renderHome();
    });
}

export function renderGuestPrivileges() {
    cleanupProfileOverlays();
    // Убираем плавающую кнопку, если она уже есть
    document.getElementById('floatingCardBtn')?.remove();

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

    const CHECK = `<svg width="14" height="11" viewBox="0 0 14 11" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 5.5l3.5 4 8.5-9" stroke="#27ae60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    mainDiv().innerHTML = `
        <div class="card-container">
            <ul class="guest-club-perks">
                <li>хайкинг каждые выходные${CHECK}</li>
                <li>новые знакомства${CHECK}</li>
                <li>события в городе с членами клуба${CHECK}</li>
                <li>безлимитный VPN${CHECK}</li>
                <li>привилегии у партнёров в городе и онлайне${CHECK}</li>
            </ul>
        </div>
        <div class="card-container">
            <h2 class="section-title" style="font-style: italic;">в клубе</h2>
            ${clubHtml}
            <h2 class="section-title second" style="font-style: italic;">в городе</h2>
            ${cityHtml}
        </div>
    `;

    // Добавляем плавающую кнопку «выпускайте мою карту»
    addFloatingCardButton();
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
                    <a href="${SEASON_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'подарить сезонную', ${isGuest}); return false;" class="btn btn-outline">сезонная</a>
                    <a href="${PERMANENT_CARD_LINK}" onclick="event.preventDefault(); openLink(this.href, 'подарить бессрочную', ${isGuest}); return false;" class="btn btn-outline">бессрочная</a>
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
            openLink(buttonLink, 'кнопка пропуска', isGuest);
        });
    }
}

export function renderSafetyPage(isGuest = false) {
    cleanupProfileOverlays();
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    subtitle().textContent = (state.safety && state.safety.page_title) || `🆘 на случай ЧП`;
    showBack(renderHome);
    showBottomNav(true);
    setupBottomNav();
    scrollPageToTop();

    const safety = state.safety || { intro: '', items: [] };
    // ссылки [текст](url), жирный **текст**, переносы строк
    const fmt = (t) => parseLinks(t || '', isGuest)
        .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    const intro = safety.intro
        ? `<div class="card-container"><div class="safety-intro">${fmt(safety.intro)}</div></div>`
        : '';

    const renderBullet = (b) => {
        if (!b || (!b.text && !b.link)) return '';
        const text = fmt(b.text || '');
        let linkHtml = '';
        if (b.link) {
            const label = b.link_text || b.text || 'открыть';
            // если есть отдельный текст — ссылка идёт отдельной строкой; иначе сама строка-ссылка
            linkHtml = `<a href="#" data-url="${b.link}" data-guest="${isGuest}" class="dynamic-link safety-link">${b.text ? (b.link_text || 'открыть') : label}</a>`;
        }
        const textHtml = b.text ? `<span>${text}</span>` : '';
        return `<li>${textHtml}${textHtml && linkHtml ? ' ' : ''}${linkHtml}</li>`;
    };

    let catsHtml = '';
    (safety.items || []).forEach(cat => {
        if (!cat) return;
        // поддержка двух форматов: { title, bullets:[...] } или одиночный { title, text, link }
        const bullets = Array.isArray(cat.bullets) ? cat.bullets
                      : (cat.text || cat.link) ? [{ text: cat.text, link: cat.link, link_text: cat.link_text }] : [];
        const lis = bullets.map(renderBullet).join('');
        if (!cat.title && !lis) return;
        catsHtml += `
            <div class="safety-cat">
                ${cat.title ? `<div class="safety-cat-title">${cat.title}</div>` : ''}
                ${lis ? `<ul class="safety-list">${lis}</ul>` : ''}
            </div>
        `;
    });
    if (!catsHtml) catsHtml = '<div class="partner-item"><p>информация скоро появится</p></div>';

    mainDiv().innerHTML = `
        ${intro}
        <div class="card-container">
            ${catsHtml}
        </div>
    `;

    addSafetyShareButton(isGuest);
}

function addSafetyShareButton(isGuest) {
    document.getElementById('safetyShareBtn')?.remove();
    const btn = document.createElement('button');
    btn.id = 'safetyShareBtn';
    btn.className = 'floating-share-btn';
    btn.textContent = '🔗 поделиться чек-листом';
    btn.addEventListener('click', () => {
        haptic();
        log('поделиться чеклистом ЧП', isGuest, state.user);
        const url = 'https://t.me/yaltahiking_bot?startapp=safety';
        const text = 'на случай ЧП в Крыму — чек-лист, как быть наготове';
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
        else window.open(shareUrl, '_blank');
    });
    document.body.appendChild(btn);
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
            log('развернуть', isGuest, state.user);
            dropdown.classList.toggle('show');
        });
    }
}

// Новая функция: добавляет плавающую кнопку «выпускайте мою карту» для гостей
function addFloatingCardButton() {
    // Удаляем старую кнопку, если есть
    const oldBtn = document.getElementById('floatingCardBtn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'floatingCardBtn';
    btn.textContent = '🔫 выпускайте мою карту';
    btn.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 16px;
        max-width: calc(100% - 32px);
        width: auto;
        padding: 12px 20px;
        background-color: #D9FD19;
        color: #000000;
        border: none;
        border-radius: 40px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        z-index: 101;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        white-space: nowrap;
    `;

    btn.addEventListener('click', () => {
        haptic();
        log('выпускайте мою карту', true, state.user);
        // Возвращаемся на главную
        renderHome();
        // Через 300 мс прокручиваем к блоку с картой и раскрываем аккордеон, если он есть
        setTimeout(() => {
            const cardBlock = document.getElementById('cardBlock');
            if (cardBlock) {
                cardBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Подсветка белой рамкой на 2 секунды
                cardBlock.style.transition = 'box-shadow 0.5s';
                cardBlock.style.boxShadow = '0 0 20px 5px white';
                setTimeout(() => {
                    cardBlock.style.boxShadow = '';
                }, 2000);

                // Автоматически раскрываем аккордеон гостевой карты
                const guestAccordion = document.querySelector('#cardAccordionGuest .dropdown-menu');
                if (guestAccordion && !guestAccordion.classList.contains('show')) {
                    guestAccordion.classList.add('show');
                }
            }
        }, 300);
    });

    document.body.appendChild(btn);
}
