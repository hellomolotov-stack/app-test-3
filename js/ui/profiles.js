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
import { showGuestBookingPopup, showBottomSheet } from './calendar.js';
import { renderPersonalRoutesMap, isPersonalMapPilotUser } from './personal-routes-map.js';

let profiles = {};
let myProfile = null;
let nextHikesByUser = new Map();
let participantsLoadFailed = false;
let nearestHikeDate = null;
let previewResizeObserver = null;

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
    const avatarHtml = profile.avatarUrl
        ? `<div class="profile-avatar-wrap"><img src="${escapeHtml(profile.avatarUrl)}" alt="" class="profile-avatar" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><div class="profile-avatar-placeholder" hidden>${initial}</div></div>`
        : `<div class="profile-avatar-wrap"><div class="profile-avatar-placeholder">${initial}</div></div>`;
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

    const html = `<div class="profile-card ${isBlurred?'profile-preview-card':''}" data-user-id="${profile.userId}">${avatarHtml}<div class="profile-name-status"><span class="profile-name">${profile.name||'Участник'}</span><div class="profile-status-tags">${statusTags||'<span class="status-tag status-tag-friendship">дружба</span>'}</div></div><div class="profile-section-title" style="color:var(--yellow);">увлечения</div><div class="profile-section-text">${profile.hobbies||'—'}</div><div class="profile-section-title" style="color:var(--yellow);">профессия</div><div class="profile-section-text">${profile.profession||'—'}</div>${nextHikeHtml}${favoritesHtml}${contactButtons}</div>`;

    // Грубая оценка высоты карточки для балансировки колонок в шахматном порядке –
    // без неё карточки просто чередуются по индексу и «падают» не туда, где есть место.
    const weight = 220
        + (profile.hobbies || '—').length * 1.1
        + (profile.profession || '—').length * 1.1
        + statusTags.length * 0.4
        + (nextHikeHtml ? 60 : 0)
        + (favoritesHtml ? 40 : 0)
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
    cleanupProfileOverlays();
    document.getElementById('floatingCardBtn')?.remove();   // ← удаление кнопки

    window.isPrivPage = true; window.isMenuActive = false; resetNavActive(); setActiveNav('navProfiles');
    subtitle().textContent = `🫆 члены клуба`; hideBack(); haptic(); log('раздел профили', state.userCard.status!=='active', state.user);
    showBottomNav(true); setupBottomNav();
    mainDiv().innerHTML = '<div class="loader" style="display:flex;justify-content:center;padding:40px 0;"></div>';
    await loadProfilesData();

    const isCardHolder = state.userCard.status === 'active';
    const hasMyProfile = !!myProfile;
    const placeholderCount = 6;
    const shouldAnimate = !(isCardHolder && hasMyProfile);

    const sorted = Object.entries(profiles).map(([id, profile]) => [id, { ...profile, userId: profile.userId || id }])
        .sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
    const allCards = await Promise.all(sorted.map(async ([,p]) => ({
        ...await renderProfileCard(p, shouldAnimate),
        hikeDate: nextHikesByUser.get(String(p.userId))?.date || null,
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
        <button type="button" class="profiles-filter" data-profile-filter="nearest" aria-pressed="false">идут на ближайший хайк</button>
    </div>` : '';
    mainDiv().innerHTML = `${filtersHtml}<div id="profilesResults" aria-live="polite">${html}</div>`;
    wireProfileCardActions(mainDiv());

    mainDiv().querySelectorAll('[data-profile-filter]').forEach(button => {
        button.addEventListener('click', () => {
            if (button.getAttribute('aria-pressed') === 'true') return;
            haptic();
            const filter = button.dataset.profileFilter;
            const cards = filter === 'all' ? allCards : allCards.filter(card => nearestHikeDate && card.hikeDate === nearestHikeDate);
            const results = document.getElementById('profilesResults');
            const emptyText = participantsLoadFailed ? 'не удалось загрузить записи на хайк'
                : !nearestHikeDate ? 'пока нет предстоящих хайков'
                : 'пока никто не записался на ближайший хайк';
            results.innerHTML = cards.length ? `<div class="card-container">${renderProfilesColumns(cards)}</div>`
                : `<div class="profiles-empty" role="status">${filter === 'all' ? 'пока нет профилей' : emptyText}</div>`;
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

        const data = { name, friendshipStatuses: selected, hobbies, profession, allowMessages, customLink, username: state.user?.username || '', avatarUrl: fresh?.avatarUrl || state.user?.photo_url || null, avatarUpdatedAt: fresh?.avatarUpdatedAt || Date.now(), userId: state.user?.id };
        await saveProfile(state.user?.id, data);
        syncProfileToSheet(data, state.user).catch(console.error);
        log('сохранить профиль', false, state.user);
        tg.BackButton.offClick(backHandler);
        if(bottomNav) bottomNav.style.display='flex';
        showBottomNav(true); setupBottomNav(); setActiveNav('navProfiles');
        cleanupProfileOverlays();
        renderProfiles();
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
