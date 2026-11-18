// js/ui/profiles.js
import { haptic, openLink, mainDiv, subtitle, tg, formatDateForDisplay, normalizeDate } from '../utils.js';
import { state } from '../state.js';
import { log, syncProfileToSheet, syncProfileDeleteToSheet } from '../api.js';
import {
    loadAllProfiles, loadMyProfile, saveProfile, deleteProfile, loadHikeParticipantIds, loadRouteFavorites,
} from '../firebase.js';
import { getFavoriteRoutesForUser, setIntelligentsiaRouteFavorites } from './intelligentsia-routes.js';
import { showBottomNav, setupBottomNav, setActiveNav, resetNavActive, hideBack, scrollPageToTop } from './common.js';
import { renderGuestPrivileges } from './privileges.js';
import { showGuestBookingPopup, showBottomSheet, fetchGoingFromServer } from './calendar.js';
import { isRedesign, setRdGlow } from '../redesign.js';
import { mountCircle } from './circle.js';
import { renderPersonalRoutesMap, isPersonalMapPilotUser } from './personal-routes-map.js';
import { loadAchievementCollections, achievementsVisible } from '../achievements.js';
import { medalStripHtml, wireMedalStrip } from './medals.js';
import { showProfileAwardAfterSave } from './profile-award.js';

let profiles = {};
let myProfile = null;
let nextHikesByUser = new Map();
let participantsLoadFailed = false;
let nearestHikeDate = null;
let previewResizeObserver = null;
let medalsByUser = {};
let profileRenderId = 0;
let pendingGuestPreviewTimer = null;

async function loadProfilesData() {
    const [allProfiles, myProf, routeFavorites] = await Promise.all([
        loadAllProfiles(), loadMyProfile(state.user?.id), loadRouteFavorites(),
    ]);
    profiles = allProfiles; myProfile = myProf;
    state.profiles = profiles; state.myProfile = myProfile; state.routeFavorites = routeFavorites;
    setIntelligentsiaRouteFavorites(routeFavorites);
    // Participant lists are shared; personal registration statuses are private.
    nextHikesByUser = new Map();
    participantsLoadFailed = false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const future = state.hikesWithTitle
        .filter(h => !h.cancelled && new Date(`${normalizeDate(h.date)}T00:00:00`) >= today)
        .slice().sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
    nearestHikeDate = future[0]?.date || null;
    const results = await Promise.all(future.map(async hike => {
        try { return { hike, userIds: await loadHikeParticipantIds(hike.date) }; }
        catch (error) {
            participantsLoadFailed = true;
            console.error('Profile hike participants:', error);
            return { hike, userIds: [] };
        }
    }));
    results.forEach(({ hike, userIds }) => userIds.forEach(userId => {
        if (!nextHikesByUser.has(String(userId))) nextHikesByUser.set(String(userId), hike);
    }));
}

async function getNextHikeForUser(userId) {
    return nextHikesByUser.get(String(userId)) || null;
}

async function renderProfileCard(profile, isBlurred = false) {
    const initial = escapeHtml((profile.name?.charAt(0) || '?').toUpperCase());
    const guestBadge = profile.guest === true && !isBlurred ? '<span class="profile-guest-badge">гость</span>' : '';
    const avatarHtml = profile.avatarUrl
        ? `<div class="profile-avatar-wrap"><img src="${escapeHtml(profile.avatarUrl)}" alt="" class="profile-avatar" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><div class="profile-avatar-placeholder" hidden>${initial}</div>${guestBadge}</div>`
        : `<div class="profile-avatar-wrap"><div class="profile-avatar-placeholder">${initial}</div>${guestBadge}</div>`;
    const statusTags = (profile.friendshipStatuses||[]).map(s => {
        let cls = ''; if (s==='дружба') cls='status-tag-friendship'; else if (s==='отношения') cls='status-tag-romance'; else if (s==='бизнес') cls='status-tag-business';
        return `<span class="status-tag ${cls}">${s}</span>`;
    }).join('');
    let nextHikeHtml = '';
    if (!isBlurred && profile.userId) {
        const next = await getNextHikeForUser(profile.userId);
        if (next) nextHikeHtml = `<div class="profile-section-title" style="color:var(--yellow);">идёт на хайк</div><a href="#" class="profile-hike-link" data-hike-date="${next.date}">${formatDateForDisplay(next.date)} · ${next.title}</a>`;
        else nextHikeHtml = `<div class="profile-section-title" style="color:var(--yellow);">идёт на хайк</div><span style="color:rgba(255,255,255,0.6);font-size:14px;">${participantsLoadFailed ? 'не удалось загрузить записи' : 'пока нет записей'}</span>`;
    } else if (!isBlurred) nextHikeHtml = `<div class="profile-section-title" style="color:var(--yellow);">идёт на хайк</div><span style="color:rgba(255,255,255,0.6);font-size:14px;">скоро узнаем</span>`;

    const favoriteRoutes = !isBlurred && profile.userId ? getFavoriteRoutesForUser(profile.userId) : [];
    const favoritesHtml = favoriteRoutes.length
        ? `<div class="profile-section-title" style="color:var(--yellow);">любимые маршруты</div><div class="profile-section-text">${favoriteRoutes.map(route => escapeHtml(route.title)).join(' · ')}</div>`
        : '';

    const contactButtons = (!isBlurred && profile.userId) ? `
        <div class="profile-contact-row">
            ${profile.allowMessages !== false ? `<button class="profile-contact-btn" data-action="chat" data-username="${profile.username || profile.userId}">💬</button>` : ''}
            ${profile.customLink ? `<button class="profile-contact-btn" data-action="link" data-url="${escapeHtml(profile.customLink)}">🔗</button>` : ''}
        </div>
    ` : '';

    const medals = !isBlurred && achievementsVisible() ? medalsByUser[String(profile.userId)] || [] : [];
    // в карточке – три последние медали и «+N»: повод заговорить («ты тоже промок на Демерджи?»)
    const medalsHtml = medals.length ? `<div class="profile-section-title">${medals.length} ${medals.length % 10 === 1 && medals.length % 100 !== 11 ? 'значок' : medals.length % 10 >= 2 && medals.length % 10 <= 4 && (medals.length % 100 < 10 || medals.length % 100 >= 20) ? 'значка' : 'значков'}</div>${medalStripHtml(medals.slice(0, 3), true).replace(/<\/div>$/, medals.length > 3 ? `<button type="button" class="medal-miniature medal-more" data-medal="3" aria-label="все значки"><b>+${medals.length - 3}</b><span>ещё</span></button></div>` : '</div>')}` : '';
    const html = `<div class="profile-card ${isBlurred?'profile-preview-card':''}" data-user-id="${profile.userId}">${avatarHtml}<div class="profile-name-status"><span class="profile-name">${profile.name||'Участник'}</span><div class="profile-status-tags">${statusTags||'<span class="status-tag status-tag-friendship">дружба</span>'}</div></div><div class="profile-section-title" style="color:var(--yellow);">увлечения</div><div class="profile-section-text">${profile.hobbies||'—'}</div><div class="profile-section-title" style="color:var(--yellow);">профессия</div><div class="profile-section-text">${profile.profession||'—'}</div>${nextHikeHtml}${favoritesHtml}${medalsHtml}${contactButtons}</div>`;

    // Грубая оценка высоты карточки для балансировки колонок в шахматном порядке –
    // без неё карточки просто чередуются по индексу и «падают» не туда, где есть место.
    const weight = 220
        + (profile.hobbies || '—').length * 1.1
        + (profile.profession || '—').length * 1.1
        + statusTags.length * 0.4
        + (nextHikeHtml ? 60 : 0)
        + (favoritesHtml ? 40 : 0)
        + (medalsHtml ? 74 : 0)
        + (contactButtons ? 40 : 0);

    return { html, weight };
}

function getRandomProfile() {
    const profileEntries = Object.entries(profiles);
    if (profileEntries.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * profileEntries.length);
    return profileEntries[randomIndex][1];
}

function cleanupProfileOverlays() {
    previewResizeObserver?.disconnect();
    previewResizeObserver = null;
    document.querySelector('.profile-blur-overlay')?.remove();
    document.querySelector('.guest-center-btn')?.remove();
    document.querySelector('.center-floating-btn')?.remove();
    document.querySelector('.profile-preview-banner')?.remove();
    document.querySelector('.profile-edit-fab')?.remove();
    document.getElementById('profileActionBtn')?.parentElement?.remove();
    document.body.style.overflow = '';
}

function wireProfileCardActions(container) {
    container.querySelectorAll('.profile-card:not(.profile-preview-card)').forEach(card => {
        const items = medalsByUser[String(card.dataset.userId)] || [];
        const mine = String(card.dataset.userId) === String(state.user?.id || '');
        if (items.length) wireMedalStrip(card, items, null, mine ? '' : card.querySelector('.profile-name')?.textContent || 'Участник');
    });
    container.querySelectorAll('.profile-hike-link').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const index = state.hikesWithTitle.findIndex(h => normalizeDate(h.date) === normalizeDate(link.dataset.hikeDate));
            if (index < 0) return;
            haptic();
            log('хайк из профиля', state.userCard.status !== 'active', state.user, { hike_date: link.dataset.hikeDate });
            showBottomSheet(index);
        });
    });
    container.querySelectorAll('.profile-contact-btn').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            haptic();
            if (btn.dataset.action === 'chat' && btn.dataset.username) {
                openLink(`https://t.me/${btn.dataset.username}`, 'написать участнику', false);
            } else if (btn.dataset.action === 'link' && btn.dataset.url) {
                openLink(btn.dataset.url, 'ссылка участника', false);
            }
        });
    });
}

function renderProfilesColumns(cards) {
    const leftCards = [], rightCards = [];
    let leftWeight = 0, rightWeight = 0;
    cards.forEach(({ html, weight }) => {
        if (leftWeight <= rightWeight) { leftCards.push(html); leftWeight += weight; }
        else { rightCards.push(html); rightWeight += weight; }
    });
    return `<div class="profiles-two-columns"><div class="profiles-column">${leftCards.join('')}</div><div class="profiles-column">${rightCards.join('')}</div></div>`;
}

export async function renderProfiles() {
    const renderId = ++profileRenderId;
    if (pendingGuestPreviewTimer) clearTimeout(pendingGuestPreviewTimer);
    pendingGuestPreviewTimer = null;
    cleanupProfileOverlays();
    document.getElementById('floatingCardBtn')?.remove();   // ← удаление кнопки

    window.isPrivPage = true; window.isMenuActive = false; resetNavActive(); setActiveNav('navProfiles');
    subtitle().textContent = `члены клуба`; hideBack(); haptic(); log('раздел профили', state.userCard.status!=='active', state.user);
    showBottomNav(true); setupBottomNav();
    mainDiv().innerHTML = '<div class="loader" style="display:flex;justify-content:center;padding:40px 0;"></div>';
    await loadProfilesData();
    if (renderId !== profileRenderId) return;

    const isCardHolder = state.userCard.status === 'active';
    if (!isCardHolder) { renderGuestPeople(renderId); return; }
    const hasMyProfile = !!myProfile;
    const placeholderCount = 6;
    const shouldAnimate = !(isCardHolder && hasMyProfile);

    const sorted = Object.entries(profiles).map(([id, profile]) => [id, { ...profile, userId: profile.userId || id }])
        .sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
    medalsByUser = {};
    if (!shouldAnimate && achievementsVisible()) {
        try { medalsByUser = await loadAchievementCollections(sorted.map(([, p]) => String(p.userId))); }
        catch { /* Unavailable medals must not hide otherwise accessible member profiles. */ }
    }
    const allCards = await Promise.all(sorted.map(async ([,p]) => ({
        ...await renderProfileCard(p, shouldAnimate),
        hikeDate: nextHikesByUser.get(String(p.userId))?.date || null,
        guest: p.guest === true,
        statuses: Array.isArray(p.friendshipStatuses) && p.friendshipStatuses.length ? p.friendshipStatuses : ['дружба'],
    })));


    function wrapInfiniteScroll(content) {
        const scrollWrapperHeight = Math.max(320, window.innerHeight - 160);
        return `
            <div class="infinite-scroll-container" style="--profiles-preview-height: ${scrollWrapperHeight}px;" aria-hidden="true" inert>
                <div class="infinite-scroll-wrapper">
                    ${content}
                    ${content}
                </div>
            </div>
        `;
    }

    let html = '';

    if (allCards.length === 0) {
        const placeholders = await Promise.all(Array.from({ length: placeholderCount }, () =>
            renderProfileCard({ name: 'Участник', hobbies: 'путешествия и знакомства', profession: 'своё дело' }, true)));
        html = shouldAnimate ? wrapInfiniteScroll(renderProfilesColumns(placeholders))
            : '<div class="profiles-empty" role="status">пока нет профилей</div>';
    } else {
        const twoColumnsHtml = renderProfilesColumns(allCards);
        html = shouldAnimate ? wrapInfiniteScroll(twoColumnsHtml) : `<div class="card-container">${twoColumnsHtml}</div>`;
    }

    const canFilter = isCardHolder && hasMyProfile;
    const filtersHtml = canFilter ? `<div class="profiles-filters" role="group" aria-label="фильтр профилей">
        <button type="button" class="profiles-filter" data-profile-filter="all" aria-pressed="true">все</button>
        <button type="button" class="profiles-filter" data-profile-filter="nearest" aria-pressed="false">ближайший хайк</button>
        <button type="button" class="profiles-filter" data-profile-filter="guests" aria-pressed="false">гости</button>
        <span class="profiles-filter-break" aria-hidden="true"></span>
        <button type="button" class="profiles-filter" data-profile-filter="friendship" aria-pressed="false">дружба</button>
        <button type="button" class="profiles-filter" data-profile-filter="business" aria-pressed="false">общее дело</button>
        <button type="button" class="profiles-filter" data-profile-filter="romance" aria-pressed="false">отношения</button>
    </div>` : '';
    // новый дизайн: заголовок, «на ближайший хайк с тобой» и твои связи над сеткой профилей
    const rd = isRedesign();
    if (rd) { subtitle().textContent = ''; setRdGlow('people'); }
    const rdTop = rd ? `<div class="rd-people-head"><span class="rd-page-title">люди клуба</span></div>
        <div id="rdPeopleNext"></div><div id="rdPeopleCircle"></div>` : '';
    mainDiv().innerHTML = `${rdTop}${filtersHtml}<div id="profilesResults" aria-live="polite">${html}</div>`;
    wireProfileCardActions(mainDiv());
    if (rd) {
        mountCircle(document.getElementById('rdPeopleCircle'));
        rdPeopleNext(document.getElementById('rdPeopleNext'));
    }

    mainDiv().querySelectorAll('[data-profile-filter]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.getAttribute('aria-pressed') === 'true') return;
            haptic();
            const filter = button.dataset.profileFilter;
            const status = { friendship: 'дружба', business: 'бизнес', romance: 'отношения' }[filter];
            const cards = allCards.filter(card => filter === 'all'
                || (filter === 'nearest' && nearestHikeDate && card.hikeDate === nearestHikeDate)
                || (filter === 'guests' && card.guest)
                || (status && card.statuses.includes(status)));
            const results = document.getElementById('profilesResults');
            const emptyText = participantsLoadFailed ? 'не удалось загрузить записи на хайк'
                : !nearestHikeDate ? 'пока нет предстоящих хайков'
                : 'пока никто не записался на ближайший хайк';
            results.innerHTML = cards.length ? `<div class="card-container">${renderProfilesColumns(cards)}</div>`
                : `<div class="profiles-empty" role="status">${filter === 'nearest' ? emptyText : filter === 'guests' ? (Object.values(profiles).some(p => p.guest == null) ? 'не удалось проверить статус гостей' : 'пока нет анкет гостей') : filter === 'all' ? 'пока нет профилей' : 'пока нет анкет с таким статусом'}</div>`;
            mainDiv().querySelectorAll('[data-profile-filter]').forEach(item => {
                item.setAttribute('aria-pressed', String(item === button));
            });
            wireProfileCardActions(results);
            log('фильтр профилей', false, state.user, { filter, hike_date: filter === 'nearest' ? nearestHikeDate : null });
        });
    });

    // «Мой Крым» — личная карта маршрутов с туманом (пока только пилотный аккаунт).
    if (isCardHolder && hasMyProfile && isPersonalMapPilotUser(state.user)) {
        const personalMapHost = document.createElement('div');
        personalMapHost.id = 'personalMapContainer';
        mainDiv().prepend(personalMapHost);
        renderPersonalRoutesMap(personalMapHost).catch(error => console.error('Мой Крым:', error));
    }

    if (shouldAnimate) {
        const wrapper = mainDiv().querySelector('.infinite-scroll-wrapper');
        const group = wrapper?.firstElementChild;
        if (wrapper && group) {
            const setSpeed = () => {
                // ~35 px/с: движение заметно, но спокойно (20 px/с на длинной ленте выглядело как «стоит»)
                wrapper.style.animationDuration = `${Math.max(30, group.offsetHeight / 35)}s`;
            };
            setSpeed();
            if (window.ResizeObserver) {
                previewResizeObserver = new ResizeObserver(setSpeed);
                previewResizeObserver.observe(group);
            }
        }
    }

    if (isCardHolder && hasMyProfile) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'profile-edit-fab';
        btnContainer.innerHTML = `<button class="btn btn-yellow" id="editProfileBtn" style="width: auto; margin: 0; padding: 12px 20px; border-radius: 40px; box-shadow: none; animation: none;">✍🏻 мой профиль</button>`;
        document.body.appendChild(btnContainer);
        document.getElementById('editProfileBtn')?.addEventListener('click',()=>{
            haptic();
            log('редактировать профиль', false, state.user);
            renderEditProfile();
        });
        return;
    }

    const blurOverlay = document.createElement('div');
    blurOverlay.className = 'profile-blur-overlay';
    document.body.appendChild(blurOverlay);

    showCenterButtonWithPreview(isCardHolder, hasMyProfile);
}

function showCenterButtonWithPreview(isCardHolder, hasMyProfile) {
    const oldBtn = document.getElementById('profileActionBtn')?.parentElement;
    if (oldBtn) oldBtn.remove();

    const centerBtn = document.createElement('div');
    centerBtn.className = isCardHolder ? 'center-floating-btn' : 'guest-center-btn';
    centerBtn.innerHTML = `<button class="btn btn-yellow profile-action-btn" id="profileActionBtn">🔒 создать профиль</button>`;
    centerBtn.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 520px; display: flex; flex-direction: column; align-items: center; gap: 16px; z-index: 100; pointer-events: auto;';
    document.body.appendChild(centerBtn);

    const actionBtn = document.getElementById('profileActionBtn');
    actionBtn.style.cssText = 'padding: 12px 24px !important; font-size: 16px !important; white-space: nowrap; border-radius: 40px !important; width: auto !important; min-width: 200px;';
    if (isCardHolder) {
        actionBtn.addEventListener('click', () => {
            haptic();
            log('создать профиль', false, state.user);
            renderEditProfile();
        });
    } else {
        actionBtn.addEventListener('click', () => {
            haptic();
            log('создать профиль', true, state.user);
            showGuestProfilePopup();
        });
    }

    let previewProfile = null;
    if (state.pendingProfileClick) {
        previewProfile = state.pendingProfileClick;
        state.pendingProfileClick = null;
    } else {
        const randomProf = getRandomProfile();
        if (randomProf) {
            previewProfile = {
                userId: randomProf.userId,
                name: randomProf.name,
                photoUrl: randomProf.avatarUrl || null
            };
        }
    }

    if (previewProfile) {
        const banner = document.createElement('div');
        banner.className = 'profile-preview-banner';
        banner.style.cssText = 'width: 100%; pointer-events: none; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 28px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.15); padding: 16px; display: flex; align-items: center; gap: 14px; box-sizing: border-box;';

        const avatarContainer = document.createElement('div');
        avatarContainer.style.cssText = 'flex-shrink: 0; width: 56px; height: 56px;';
        if (previewProfile.photoUrl) {
            const img = document.createElement('img');
            img.src = previewProfile.photoUrl;
            img.className = 'preview-avatar-img';
            img.style.cssText = 'width: 100% !important; height: 100% !important; border-radius: 50% !important; object-fit: cover !important;';
            img.onerror = function() {
                const placeholder = document.createElement('div');
                placeholder.className = 'preview-avatar-placeholder';
                placeholder.style.cssText = 'width: 100% !important; height: 100% !important; border-radius: 50% !important; background: #40a7e3 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 24px !important; color: white !important;';
                placeholder.textContent = (previewProfile.name?.charAt(0)||'?').toUpperCase();
                this.parentNode.replaceChild(placeholder, this);
            };
            avatarContainer.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'preview-avatar-placeholder';
            placeholder.style.cssText = 'width: 100% !important; height: 100% !important; border-radius: 50% !important; background: #40a7e3 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 24px !important; color: white !important;';
            placeholder.textContent = (previewProfile.name?.charAt(0)||'?').toUpperCase();
            avatarContainer.appendChild(placeholder);
        }

        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'flex: 1; font-size: 14px; color: #fff; line-height: 1.4; word-break: break-word;';
        textDiv.innerHTML = `<span style="font-weight: 700; color: var(--yellow);">${escapeHtml(previewProfile.name)}</span> – и другие члены клуба уже создали профиль интеллигента. создай свой, чтобы вывести здоровые знакомства на новый уровень`;

        banner.appendChild(avatarContainer);
        banner.appendChild(textDiv);
        centerBtn.prepend(banner);
    }
}

function showGuestProfilePopup() {
    showGuestBookingPopup(null, null, null, 'profiles');
}

async function renderEditProfile() {
    cleanupProfileOverlays();
    document.getElementById('floatingCardBtn')?.remove();   // ← удаление кнопки
    window.isPrivPage = true; window.isMenuActive = false; resetNavActive(); setActiveNav('navProfiles');
    subtitle().textContent = `🎩 мой профиль`; hideBack();
    showBottomNav(true); setupBottomNav();
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) bottomNav.style.display = 'flex';

    mainDiv().innerHTML = '<div class="loader" style="display:flex;justify-content:center;padding:40px 0;"></div>';
    const fresh = await loadMyProfile(state.user?.id);
    const currentName = fresh?.name || state.user?.first_name || '';
    const currentStatuses = fresh?.friendshipStatuses || [];
    const currentHobbies = fresh?.hobbies || '';
    const currentProfession = fresh?.profession || '';
    const currentAllowMessages = fresh?.allowMessages !== false;
    const currentCustomLink = fresh?.customLink || '';

    const statusColors = {
        'дружба': '#D9FD19',
        'отношения': '#FB5EB0',
        'бизнес': '#5E9FC5'
    };
    const statusesHtml = ['дружба', 'отношения', 'бизнес'].map(s => 
        `<label><input type="checkbox" value="${s}" ${currentStatuses.includes(s) ? 'checked' : ''} style="accent-color: ${statusColors[s]}"> ${s}</label>`
    ).join('');

    mainDiv().innerHTML = `<div class="card-container" style="padding-top:12px; padding-bottom:8px;"><form id="editProfileForm" class="edit-form">
        <div class="profile-field"><label>👋🏻 имя</label><input type="text" id="profileName" value="${escapeHtml(currentName)}"><div class="field-hint">заполнено автоматически, как у тебя в телеграм, но ты можешь поменять</div></div>
        <div class="profile-field"><label>👀 статус знакомств</label><div class="checkbox-group">${statusesHtml}</div><div class="field-hint">выбери к чему ты открыт на хайках</div></div>
        <div class="profile-field"><label>✨ увлечения</label><textarea id="profileHobbies" rows="3">${escapeHtml(currentHobbies)}</textarea><div class="field-hint">перечисли через запятую то, что тебя вдохновляет</div></div>
        <div class="profile-field"><label>💼 профессия</label><textarea id="profileProfession" rows="2">${escapeHtml(currentProfession)}</textarea><div class="field-hint">в какой сфере у тебя больше всего опыта?</div></div>
        <div class="profile-field">
            <label>💬 личные сообщения</label>
            <div class="checkbox-row">
                <input type="checkbox" id="allowMessagesCheck" ${currentAllowMessages?'checked':''}>
                <span id="allowMessagesLabel">${currentAllowMessages?'разрешено писать в телеграм':'запрещено писать в телеграм'}</span>
            </div>
        </div>
        <div class="profile-field"><label>🔗 ссылка</label><input type="text" id="customLinkInput" placeholder="https://..." value="${escapeHtml(currentCustomLink)}"><div class="field-hint">ссылка на твой сайт, блог, портфолио или соцсеть</div></div>
        <button type="submit" class="btn btn-yellow" id="saveProfileBtn" style="margin-top:24px;">сохранить профиль</button>
        ${fresh?'<button type="button" class="delete-profile-btn" id="deleteProfileBtn" style="margin-top:8px;">снять с публикации</button>':''}
    </form></div>`;

    const allowCheck = document.getElementById('allowMessagesCheck');
    const allowLabel = document.getElementById('allowMessagesLabel');
    allowCheck.addEventListener('change', ()=> allowLabel.textContent = allowCheck.checked ? 'разрешено писать в телеграм' : 'запрещено писать в телеграм');

    const backHandler = ()=>{ if(bottomNav) bottomNav.style.display='flex'; showBottomNav(true); setupBottomNav(); renderProfiles(); };
    tg.BackButton.onClick(backHandler); tg.BackButton.show();
    document.getElementById('profileName').placeholder = '';
    document.getElementById('profileHobbies').placeholder = '';
    document.getElementById('profileProfession').placeholder = '';

    document.getElementById('editProfileForm').addEventListener('submit', async (e)=>{
        e.preventDefault(); haptic();
        const name = document.getElementById('profileName').value.trim();
        if(!name) { alert('Укажите имя'); return; }
        const selected = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb=>cb.value);
        const hobbies = document.getElementById('profileHobbies').value.trim();
        const profession = document.getElementById('profileProfession').value.trim();
        const allowMessages = document.getElementById('allowMessagesCheck').checked;
        let customLink = document.getElementById('customLinkInput').value.trim();
        if (customLink && !customLink.match(/^https?:\/\//i)) customLink = 'https://' + customLink;

        const data = { name, friendshipStatuses: selected, hobbies, profession, allowMessages, customLink, username: state.user?.username || '', avatarUrl: fresh?.avatarUrl || state.user?.photo_url || null, avatarUpdatedAt: fresh?.avatarUpdatedAt || Date.now(), userId: state.user?.id, guest: state.userCard.status !== 'active' };
        await saveProfile(state.user?.id, data);
        syncProfileToSheet(data, state.user).catch(console.error);
        log('сохранить профиль', false, state.user);
        tg.BackButton.offClick(backHandler);
        if(bottomNav) bottomNav.style.display='flex';
        showBottomNav(true); setupBottomNav(); setActiveNav('navProfiles');
        cleanupProfileOverlays();
        const rendering = renderProfiles().catch(error => console.warn('Profile list unavailable:', error));
        try { await showProfileAwardAfterSave(); }
        catch (error) { console.warn('Profile award unavailable:', error); }
        await rendering;
    });

    if(document.getElementById('deleteProfileBtn')){
        document.getElementById('deleteProfileBtn').addEventListener('click', async ()=>{
            haptic();
            if(confirm('Снять профиль с публикации?')){
                await deleteProfile(state.user?.id);
                syncProfileDeleteToSheet(state.user?.id).catch(console.error);
                log('удалить профиль', false, state.user);
                tg.BackButton.offClick(backHandler);
                if(bottomNav) bottomNav.style.display='flex';
                showBottomNav(true); setupBottomNav(); setActiveNav('navProfiles');
                cleanupProfileOverlays();
                renderProfiles();
            }
        });
    }
}

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' })[m]); }

// ---------- новый дизайн: кто идёт на ближайшее событие ----------
const RD_GRADS = [['#F6B26B', '#E06666'], ['#6FA8DC', '#3D85C6'], ['#93C47D', '#38761D'], ['#C27BA0', '#741B47'], ['#FFD966', '#BF9000'], ['#8E7CC3', '#351C75']];
async function rdPeopleNext(box) {
    if (!box || !nearestHikeDate) { box?.remove(); return; }
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const index = (state.hikesWithTitle || []).findIndex(h => h.date === nearestHikeDate);
    const hike = state.hikesWithTitle[index];
    let list = null;
    try { [list] = await fetchGoingFromServer([nearestHikeDate]); } catch (e) { list = null; }
    const me = String(state.user?.id || '');
    const people = (Array.isArray(list) ? list : []).filter(p => p && p.userId && String(p.userId) !== me);
    if (!box.isConnected || !hike || !people.length) { box.remove(); return; }
    const iAmIn = (Array.isArray(list) ? list : []).some(p => String(p.userId) === me);
    const title = String(hike.title || '').replace(/^хайк\s+/i, '');
    box.innerHTML = `<div class="rd-pnext">
        <div class="rd-pnext-head"><span>${iAmIn ? `на ${esc(title)} с тобой` : `идут на ${esc(title)}`}</span><button type="button" id="rdPeopleNextOpen">открыть ›</button></div>
        <div class="rd-pnext-row">${people.slice(0, 12).map((p, i) => {
            const g = RD_GRADS[i % RD_GRADS.length];
            const name = String(p.name || '').trim().split(/\s+/)[0] || 'участник';
            const photo = String(p.photoUrl || '');
            return `<div class="rd-pnext-cell"><span class="rd-sg-av" style="background:linear-gradient(135deg,${g[0]},${g[1]})">${photo ? `<img src="${esc(photo)}" alt="" onerror="this.remove()">` : ''}${esc(name[0] || '?').toUpperCase()}</span><span>${esc(name)}</span></div>`;
        }).join('')}</div>
    </div>`;
    box.querySelector('#rdPeopleNextOpen')?.addEventListener('click', () => { haptic(); if (index !== -1) showBottomSheet(index); });
}

// 16.11: «перейти в профиль» из шторки «твои связи»: открываем «интеллигентов» и плавно доезжаем до карточки человека
// с лаймовым свечением. Без карты (или без своего профиля) раздел сам показывает размытую ленту и баннер про карту.
export async function openProfileOf(userId, info = {}) {
    const id = String(userId || '');
    // без карты (или без своего профиля) раздел размыт – в плашке «… уже создали профиль» показываем именно этого человека
    if (!(state.userCard.status === 'active' && state.myProfile)) {
        const p = state.profiles?.[id] || Object.values(state.profiles || {}).find(x => String(x?.userId) === id) || {};
        state.pendingProfileClick = { userId: id, name: p.name || info.name || 'участник', photoUrl: p.avatarUrl || info.photo || null };
    }
    await renderProfiles();
    let tries = 0;
    const find = () => {
        const card = mainDiv().querySelector(`#profilesResults .profile-card[data-user-id="${CSS.escape(id)}"]`);
        if (!card) { if (++tries < 15) setTimeout(find, 150); return; }
        const r = card.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, r.top + window.pageYOffset - Math.max(80, (window.innerHeight - r.height) / 2)), behavior: 'smooth' });
        setTimeout(() => { card.classList.remove('profile-link-glow'); void card.offsetWidth; card.classList.add('profile-link-glow'); setTimeout(() => card.classList.remove('profile-link-glow'), 4200); }, 700);
    };
    if (state.userCard.status === 'active') setTimeout(find, 200);
}


// 16.11: «Интеллигенты» без карты. Сверху – свой профиль (создать бесплатно / редактировать), ниже – профили членов клуба:
// фото, имя и профессия видны, увлечения размыты, замочек. Нажатие – превью человека и «открыть с картой».
// Профили гостей (без карты) видят только члены клуба, в этой витрине их нет.
const GP_CSS = `
.gp-mine { margin: 4px 0 6px; padding: 16px; border-radius: 22px; background: #101418; box-shadow: inset 0 -46px 56px -26px rgba(217,253,25,.38), inset 0 0 0 1px rgba(217,253,25,.26); color: #fff; }
.gp-mine b { display: block; font-size: 17px; font-weight: 800; }
.gp-mine p { margin: 6px 0 0; font-size: 13.5px; line-height: 1.45; color: rgba(255,255,255,.65); }
.gp-mine .btn { width: 100%; margin: 14px 0 0; }
.gp-sec { display: flex; justify-content: space-between; align-items: baseline; margin: 20px 4px 10px; color: #fff; }
.gp-sec b { font-size: 17px; font-weight: 800; } .gp-sec span { font-size: 13px; color: var(--yellow); font-weight: 700; }
.gp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.gp-card { position: relative; min-width: 0; width: 100%; margin: 0; box-sizing: border-box; padding: 12px; border: 0; border-radius: 18px; background: #14181d; color: #fff; font: inherit; text-align: left; cursor: pointer; }
.gp-card .lk { position: absolute; right: 10px; top: 10px; font-size: 12px; opacity: .55; }
.gp-av { width: 48px; height: 48px; border-radius: 50%; background: #40a7e3 center/cover no-repeat; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 800; color: #fff; margin-bottom: 8px; }
.gp-card b { display: block; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gp-card small { display: block; margin-top: 2px; font-size: 12.5px; color: rgba(255,255,255,.6); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gp-card i { display: block; margin-top: 6px; font-style: normal; font-size: 12px; color: rgba(255,255,255,.55); filter: blur(3.5px); white-space: nowrap; overflow: hidden; }
.gp-more { margin: 12px 0 0; text-align: center; font-size: 13px; color: rgba(255,255,255,.5); }
.gp-ov { position: fixed; inset: 0; z-index: 2200; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,0); transition: background .3s ease; }
.gp-ov.is-on { background: rgba(0,0,0,.6); }
.gp-sheet { width: calc(100% - 20px); max-width: 580px; margin-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); padding: 20px 18px 18px; box-sizing: border-box; border-radius: 32px;
  background: #12151b; border: 1px solid rgba(255,255,255,.16); color: #fff; transform: translateY(calc(100% + 60px)); transition: transform .36s cubic-bezier(.2,.9,.25,1); }
.gp-ov.is-on .gp-sheet { transform: none; }
.gp-who { display: flex; align-items: center; gap: 14px; } .gp-who .gp-av { width: 60px; height: 60px; margin: 0; font-size: 23px; flex: none; }
.gp-who b { display: block; font-size: 19px; font-weight: 800; } .gp-who small { display: block; margin-top: 2px; font-size: 13.5px; color: rgba(255,255,255,.6); }
.gp-blur { overflow: hidden; margin-top: 14px; padding: 12px; border-radius: 16px; background: rgba(255,255,255,.05); font-size: 14px; line-height: 1.5; }
.gp-blur span { filter: blur(4px); color: rgba(255,255,255,.75); user-select: none; }
.gp-why { margin: 16px 0 0; font-size: 15px; line-height: 1.45; } .gp-why em { font-style: normal; color: var(--yellow); }
.gp-sheet .btn { width: 100%; margin: 14px 0 0; }
.gp-free { display: block; width: 100%; margin-top: 12px; padding: 6px; border: 0; background: none; color: rgba(255,255,255,.65); font: inherit; font-size: 14px; cursor: pointer; }
`;
function gpAv(p) {
    const ph = p?.avatarUrl;
    return `<span class="gp-av"${ph ? ` style="background-image:url('${escapeHtml(ph)}')"` : ''}>${ph ? '' : escapeHtml((p?.name || '?').charAt(0).toUpperCase())}</span>`;
}
function renderGuestPeople(renderId = profileRenderId) {
    if (!document.getElementById('gpCss')) { const st = document.createElement('style'); st.id = 'gpCss'; st.textContent = GP_CSS; document.head.appendChild(st); }
    const me = String(state.user?.id || '');
    const list = Object.entries(profiles).map(([id, p]) => ({ ...p, userId: String(p.userId || id) }))
        .filter(p => p.userId !== me && p.guest === false && p.name)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    // 8 случайных членов клуба с профилем (каждый заход – новые лица), остальные – числом
    const shown = list.slice().sort(() => Math.random() - .5).slice(0, 8);
    const mine = myProfile
        ? `<div class="gp-mine"><b>твой профиль готов</b><p>его видят члены клуба – повод заговорить на тропе</p><button type="button" class="btn btn-outline" id="gpEdit">редактировать профиль</button></div>`
        : `<div class="gp-mine"><b>твой профиль интеллигента</b><p>создай бесплатно – увлечения и профессия, чтобы на хайке было о чём поговорить</p><button type="button" class="btn btn-yellow" id="gpEdit">создать свой профиль</button></div>`;
    mainDiv().innerHTML = `<div class="gp-wrap">${mine}
        <div class="gp-sec"><b>профили членов клуба</b><span>🔒 с картой</span></div>
        <div class="gp-grid">${shown.map(p => `<button type="button" class="gp-card" data-uid="${escapeHtml(p.userId)}"><span class="lk">🔒</span>${gpAv(p)}<b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.profession || 'член клуба')}</small><i>${escapeHtml(p.hobbies || 'горы, люди, разговоры')}</i></button>`).join('')}</div>
        ${list.length > shown.length ? `<div class="gp-more">и ещё ${list.length - shown.length} ${plural(list.length - shown.length, 'профиль', 'профиля', 'профилей')} членов клуба – с картой</div>` : ''}</div>`;
    mainDiv().querySelector('#gpEdit')?.addEventListener('click', () => { haptic(); log(myProfile ? 'гость: редактировать профиль' : 'гость: создать профиль', true, state.user); renderEditProfile(); });
    mainDiv().querySelectorAll('.gp-card').forEach(c => c.addEventListener('click', () => {
        haptic();
        const p = list.find(x => x.userId === c.dataset.uid);
        if (p) openGuestPreview(p, list.length);
    }));
    // Переход из другого раздела открывает платное превью только для подтверждённого владельца карты.
    const pend = state.pendingProfileClick;
    state.pendingProfileClick = null;
    if (pend) {
        const p = list.find(x => x.userId === String(pend.userId));
        if (p) pendingGuestPreviewTimer = setTimeout(() => {
            pendingGuestPreviewTimer = null;
            if (renderId === profileRenderId) openGuestPreview(p, list.length);
        }, 250);
    }
}
function openGuestPreview(p, total) {
    document.querySelector('.gp-ov')?.remove();
    log('гость: превью профиля', true, state.user, { id: p.userId });
    const first = String(p.name || '').trim().split(/\s+/)[0] || 'участника';
    const ov = document.createElement('div');
    ov.className = 'gp-ov';
    ov.innerHTML = `<div class="gp-sheet" role="dialog" aria-label="профиль ${escapeHtml(first)}">
        <div class="gp-who">${gpAv(p)}<div><b>${escapeHtml(p.name || 'участник')}</b><small>${escapeHtml(p.profession || 'член клуба')}</small></div></div>
        <div class="gp-blur"><span>${escapeHtml([p.hobbies, (p.friendshipStatuses || []).join(', ')].filter(Boolean).join(' · ') || 'увлечения, любимые маршруты, с кем ходит на хайки')}</span></div>
        <div class="gp-why">этот профиль${total > 1 ? ` и ещё ${total - 1} членов клуба` : ''} <em>${total > 1 ? 'открываются' : 'открывается'} с картой</em></div>
        <button type="button" class="btn btn-yellow" data-gp-card>открыть с картой интеллигента</button>
        <button type="button" class="gp-free" data-gp-free>${myProfile ? 'твой профиль уже создан ›' : 'а свой профиль можно создать бесплатно ›'}</button>
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-on'));
    const close = () => { ov.classList.remove('is-on'); setTimeout(() => ov.remove(), 320); };
    ov.addEventListener('click', async e => {
        if (e.target === ov) { close(); return; }
        if (e.target.closest('[data-gp-card]')) {
            haptic(); close();
            const { openCardSheet } = await import('./card-sheet.js');
            setTimeout(() => openCardSheet({ source: 'интеллигенты: профиль' }), 330);
            return;
        }
        if (e.target.closest('[data-gp-free]')) { haptic(); close(); setTimeout(renderEditProfile, 330); }
    });
}


// ---------- члены клуба без профиля: «предложить создать профиль» (api/me profile_people / profile_nudge) ----------
function meCall(action, data = {}) {
    return fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ initData: window.Telegram?.WebApp?.initData || '', action, ...data }) }).then(r => (r.ok ? r.json() : null));
}
let peopleReq = null;
function loadProfilePeople() {
    if (!window.Telegram?.WebApp?.initData) return Promise.resolve({ missing: [], nudged: new Set() });
    return (peopleReq ||= meCall('profile_people').then(j => ({ missing: j?.missing || [], nudged: new Set(j?.nudged || []) }))
        .catch(() => { peopleReq = null; return { missing: [], nudged: new Set() }; }));
}
function ghostCardHtml(m, done) {
    return `<div class="profile-card profile-ghost" data-user-id="${escapeHtml(m.id)}"><div class="profile-avatar-wrap"><div class="profile-avatar-placeholder pg-q">?</div></div>
        <div class="profile-name-status"><span class="profile-name">${escapeHtml(m.name)}</span></div>
        <div class="pg-note">профиль интеллигента ещё не создан</div>
        <button type="button" class="pg-nudge${done ? ' is-done' : ''}" data-nudge="${escapeHtml(m.id)}"${done ? ' disabled' : ''}>${done ? '✓ предложили' : 'предложить создать'}</button></div>`;
}
function wireNudges(root) {
    root.querySelectorAll('.pg-nudge:not(.is-done)').forEach(b => b.addEventListener('click', async e => {
        e.stopPropagation();
        if (b.disabled) return;
        haptic(); b.disabled = true; b.textContent = 'отправляю…';
        const j = await meCall('profile_nudge', { to: b.dataset.nudge }).catch(() => null);
        if (j?.ok) {
            b.classList.add('is-done'); b.textContent = '✓ предложили';
            peopleReq?.then(pp => pp.nudged.add(b.dataset.nudge));
            log('предложил создать профиль', state.userCard.status !== 'active', state.user, { to: b.dataset.nudge });
        } else { b.disabled = false; b.textContent = 'предложить создать'; }
    }));
}

// человеку, которому предложили создать профиль: карточка сверху при заходе (пока не создал профиль или не закрыл)
export async function checkProfileNudges() {
    if (!window.Telegram?.WebApp?.initData || document.querySelector('.pn-card')) return;
    const j = await meCall('profile_nudges').catch(() => null);
    if (!j?.names?.length) return;
    let seen = 0; try { seen = Number(localStorage.getItem('pnSeen')) || 0; } catch (e) {}
    if (seen >= j.last) return;
    const first = n => String(n || '').trim().split(/\s+/)[0];
    const who = j.names.length > 1 ? `${escapeHtml(first(j.names[0]))} и ещё ${j.names.length - 1}` : escapeHtml(first(j.names[0]));
    const tw = window.Telegram?.WebApp, inset = (tw?.safeAreaInset?.top || 0) + (tw?.contentSafeAreaInset?.top || 0);
    const el = document.createElement('div');
    el.className = 'pn-card';
    el.style.top = `${inset ? inset + 8 : 12}px`;
    el.innerHTML = `<div class="pn-ic">🎩</div><div class="pn-tx"><b>${who} ${j.names.length > 1 ? 'предлагают' : 'предлагает'} тебе создать профиль интеллигента</b><span>чтобы на хайке было о чём поговорить</span></div>
        <button type="button" class="pn-go">создать</button><button type="button" class="pn-x" aria-label="закрыть">✕</button>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    log('увидел: предлагают создать профиль', state.userCard.status !== 'active', state.user, { n: j.names.length });
    const done = () => { try { localStorage.setItem('pnSeen', String(j.last)); } catch (e) {} el.classList.remove('is-on'); setTimeout(() => el.remove(), 300); meCall('profile_nudge_seen').catch(() => {}); };
    el.querySelector('.pn-go').addEventListener('click', () => { haptic(); done(); log('создать профиль (по предложению)', state.userCard.status !== 'active', state.user); renderEditProfile(); });
    el.querySelector('.pn-x').addEventListener('click', () => { haptic(); done(); });
}

function plural(n, one, few, many) { return n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many; }
