// js/ui/profiles.js
import { haptic, openLink, mainDiv, subtitle, tg, formatDateForDisplay } from '../utils.js';
import { state } from '../state.js';
import { log, syncProfileToSheet, syncProfileDeleteToSheet } from '../api.js';
import {
    loadAllProfiles, loadMyProfile, saveProfile, deleteProfile, loadUserRegistrations,
} from '../firebase.js';
import { showBottomNav, setupBottomNav, setActiveNav, resetNavActive, hideBack } from './common.js';
import { renderGuestPrivileges } from './privileges.js';

let profiles = {};
let myProfile = null;
const userHikesCache = {};

async function loadProfilesData() {
    const [allProfiles, myProf] = await Promise.all([loadAllProfiles(), loadMyProfile(state.user?.id)]);
    profiles = allProfiles; myProfile = myProf;
    state.profiles = profiles; state.myProfile = myProfile;
}

async function getNextHikeForUser(userId) {
    if (!userId) return null;
    if (userHikesCache[userId] !== undefined) return userHikesCache[userId];
    try {
        const registrations = await loadUserRegistrations(userId);
        if (!registrations) return null;
        const today = new Date(); today.setHours(0,0,0,0);
        const future = state.hikesList.filter(h => new Date(h.date) >= today && registrations[h.date] === true);
        if (!future.length) return null;
        future.sort((a,b) => new Date(a.date) - new Date(b.date));
        const next = future[0];
        userHikesCache[userId] = next;
        return next;
    } catch { return null; }
}

async function renderProfileCard(profile, isBlurred = false) {
    const avatarHtml = profile.avatarUrl
        ? `<img src="${profile.avatarUrl}" class="profile-avatar" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'profile-avatar-placeholder\'>${(profile.name?.charAt(0)||'?').toUpperCase()}</div>';">`
        : `<div class="profile-avatar-placeholder">${(profile.name?.charAt(0)||'?').toUpperCase()}</div>`;
    const statusTags = (profile.friendshipStatuses||[]).map(s => {
        let cls = ''; if (s==='дружба') cls='status-tag-friendship'; else if (s==='отношения') cls='status-tag-romance'; else if (s==='бизнес') cls='status-tag-business';
        return `<span class="status-tag ${cls}">${s}</span>`;
    }).join('');
    let nextHikeHtml = '';
    if (!isBlurred && profile.userId) {
        const next = await getNextHikeForUser(profile.userId);
        if (next) nextHikeHtml = `<div class="profile-section-title" style="color:var(--yellow);">идёт на хайк</div><a href="#" class="profile-hike-link" data-hike-date="${next.date}">${formatDateForDisplay(next.date)} · ${next.title}</a>`;
        else nextHikeHtml = `<div class="profile-section-title" style="color:var(--yellow);">идёт на хайк</div><span style="color:rgba(255,255,255,0.6);font-size:14px;">пока нет записей</span>`;
    } else if (!isBlurred) nextHikeHtml = `<div class="profile-section-title" style="color:var(--yellow);">идёт на хайк</div><span style="color:rgba(255,255,255,0.6);font-size:14px;">скоро узнаем</span>`;

    const contactButtons = (!isBlurred && profile.userId) ? `
        <div class="profile-contact-row">
            ${profile.allowMessages !== false ? `<button class="profile-contact-btn" data-action="chat" data-username="${profile.username || profile.userId}">💬</button>` : ''}
            ${profile.customLink ? `<button class="profile-contact-btn" data-action="link" data-url="${escapeHtml(profile.customLink)}">🔗</button>` : ''}
        </div>
    ` : '';

    return `<div class="profile-card ${isBlurred?'blurred':''}" data-user-id="${profile.userId}">${avatarHtml}<div class="profile-name-status"><span class="profile-name">${profile.name||'Участник'}</span><div class="profile-status-tags">${statusTags||'<span class="status-tag status-tag-friendship">дружба</span>'}</div></div><div class="profile-section-title" style="color:var(--yellow);">увлечения</div><div class="profile-section-text">${profile.hobbies||'—'}</div><div class="profile-section-title" style="color:var(--yellow);">профессия</div><div class="profile-section-text">${profile.profession||'—'}</div>${nextHikeHtml}${contactButtons}</div>`;
}

function getRandomProfile() {
    const profileEntries = Object.entries(profiles);
    if (profileEntries.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * profileEntries.length);
    return profileEntries[randomIndex][1];
}

function getUserStatuses(userId) {
    const profile = state.profiles[userId];
    if (!profile) return [];
    const statuses = profile.friendshipStatuses;
    if (!statuses) return [];
    
    if (Array.isArray(statuses)) {
        return statuses.filter(s => typeof s === 'string');
    }
    
    if (typeof statuses === 'object' && !Array.isArray(statuses)) {
        const result = [];
        for (const key in statuses) {
            if (statuses[key] === true || statuses[key] === 'да') {
                result.push(key);
            }
        }
        return result;
    }
    
    if (typeof statuses === 'string') {
        return statuses.split(',').map(s => s.trim());
    }
    
    return [];
}

function getAvatarGradient(userId) {
    const statuses = getUserStatuses(userId);
    const colorMap = {
        'дружба': '#D9FD19',
        'отношения': '#FB5EB0',
        'бизнес': '#5E9FC5'
    };
    const colors = statuses.map(s => colorMap[s]).filter(c => c);
    
    if (colors.length <= 1) return null;
    
    const stops = [];
    const step = 1 / colors.length;
    for (let i = 0; i < colors.length; i++) {
        const color1 = colors[i];
        const color2 = colors[(i + 1) % colors.length];
        const start = i * 100;
        const end = ((i + 1) % colors.length) * 100;
        stops.push(`${color1} ${start}%`);
        stops.push(`color-mix(in srgb, ${color1}, ${color2} 50%) ${start + 30}%`);
        stops.push(`color-mix(in srgb, ${color2}, ${color1} 50%) ${end - 30}%`);
    }
    
    return `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

export async function renderProfiles() {
    document.querySelector('.profile-edit-fab')?.remove();
    document.querySelector('.profile-blur-overlay')?.remove();
    document.querySelector('.center-floating-btn')?.remove();
    document.querySelector('.guest-center-btn')?.remove();
    document.querySelector('.profile-preview-banner')?.remove();
    document.body.style.overflow = '';

    window.isPrivPage = true; window.isMenuActive = false; resetNavActive(); setActiveNav('navProfiles');
    subtitle().textContent = `🎩 члены клуба`; hideBack(); haptic(); log('profiles_page_opened', state.userCard.status!=='active', state.user);
    showBottomNav(true); setupBottomNav();
    mainDiv().innerHTML = '<div class="loader" style="display:flex;justify-content:center;padding:40px 0;"></div>';
    await loadProfilesData();

    const isCardHolder = state.userCard.status === 'active';
    const hasMyProfile = !!myProfile;
    const placeholderCount = 6;

    const sorted = Object.entries(profiles).sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
    const allCards = await Promise.all(sorted.map(([,p])=>renderProfileCard(p, false)));

    if (allCards.length === 0) {
        let ph = ''; for (let i=0;i<placeholderCount;i++) ph += `<div class="profile-card blurred"><div class="profile-avatar-placeholder" style="background:rgba(255,255,255,0.1);">?</div><div class="profile-name-status"><span class="profile-name" style="color:rgba(255,255,255,0.3);">???</span><div class="profile-status-tags"><span class="status-tag status-tag-friendship" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);">дружба</span></div></div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">увлечения</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">профессия</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div></div>`;
        mainDiv().innerHTML = `<div class="card-container"><div class="profiles-two-columns" id="profilesGrid">${ph}</div></div>`;
        showCenterButtonWithPreview(isCardHolder, hasMyProfile);
        return;
    }

    const leftCards = [];
    const rightCards = [];
    allCards.forEach((card, index) => {
        if (index % 2 === 0) leftCards.push(card);
        else rightCards.push(card);
    });

    mainDiv().innerHTML = `
        <div class="card-container">
            <div class="profiles-two-columns">
                <div class="profiles-column">${leftCards.join('')}</div>
                <div class="profiles-column">${rightCards.join('')}</div>
            </div>
        </div>
    `;

    if (isCardHolder && hasMyProfile) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'profile-edit-fab';
        btnContainer.innerHTML = `<button class="btn btn-outline" id="editProfileBtn">📝 мой профиль</button>`;
        document.body.appendChild(btnContainer);
        document.getElementById('editProfileBtn')?.addEventListener('click',()=>{ haptic(); renderEditProfile(); });
        return;
    }

    const blurOverlay = document.createElement('div');
    blurOverlay.className = 'profile-blur-overlay';
    blurOverlay.style.position = 'fixed';
    blurOverlay.style.top = '0';
    blurOverlay.style.left = '0';
    blurOverlay.style.width = '100%';
    blurOverlay.style.height = '100%';
    blurOverlay.style.pointerEvents = 'none';
    blurOverlay.style.zIndex = '40';
    blurOverlay.style.background = 'rgba(0,0,0,0.5)'; // тёмный блюр
    blurOverlay.style.backdropFilter = 'blur(16px)';
    blurOverlay.style.webkitBackdropFilter = 'blur(16px)';
    document.body.appendChild(blurOverlay);

    showCenterButtonWithPreview(isCardHolder, hasMyProfile);
}

function showCenterButtonWithPreview(isCardHolder, hasMyProfile) {
    const centerBtn = document.createElement('div');
    centerBtn.className = isCardHolder ? 'center-floating-btn' : 'guest-center-btn';
    const btnText = '📝 создать профиль';
    centerBtn.innerHTML = `<button class="btn btn-yellow btn-glow profile-action-btn" id="profileActionBtn">${btnText}</button>`;
    centerBtn.style.cssText = `
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        z-index: 100 !important;
        pointer-events: auto !important;
    `;
    document.body.appendChild(centerBtn);

    const actionBtn = document.getElementById('profileActionBtn');
    if (isCardHolder) {
        actionBtn.addEventListener('click', () => { haptic(); renderEditProfile(); });
    } else {
        actionBtn.addEventListener('click', () => {
            haptic();
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
        const gradient = getAvatarGradient(previewProfile.userId);
        const banner = document.createElement('div');
        banner.className = 'profile-preview-banner';
        banner.style.cssText = `
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 90% !important;
            max-width: 520px !important;
            margin-top: -100px !important;
            z-index: 101 !important;
            pointer-events: none !important;
            background: rgba(255, 255, 255, 0.1) !important;
            border-radius: 28px !important;
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.15) !important;
            padding: 16px !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 14px !important;
            box-sizing: border-box !important;
        `;

        const avatarContainer = document.createElement('div');
        avatarContainer.style.cssText = 'flex-shrink: 0; width: 56px; height: 56px;';

        if (previewProfile.photoUrl) {
            const img = document.createElement('img');
            img.src = previewProfile.photoUrl;
            img.className = 'preview-avatar-img';
            img.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                border-radius: 50% !important;
                object-fit: cover !important;
            `;
            
            if (gradient) {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = `
                    position: relative;
                    width: 100%;
                    height: 100%;
                    display: inline-block;
                `;
                img.style.cssText += `
                    position: relative;
                    z-index: 2;
                    box-shadow: none !important;
                    border: none !important;
                `;
                const gradientRing = document.createElement('div');
                gradientRing.style.cssText = `
                    position: absolute;
                    top: -2px;
                    left: -2px;
                    right: -2px;
                    bottom: -2px;
                    border-radius: 50%;
                    background: ${gradient};
                    z-index: 1;
                `;
                wrapper.appendChild(gradientRing);
                wrapper.appendChild(img);
                avatarContainer.appendChild(wrapper);
            } else {
                const statuses = getUserStatuses(previewProfile.userId);
                const colorMap = {
                    'дружба': '#D9FD19',
                    'отношения': '#FB5EB0',
                    'бизнес': '#5E9FC5'
                };
                const colors = statuses.map(s => colorMap[s]).filter(c => c);
                img.style.boxShadow = colors.length === 1 
                    ? `0 0 0 2px ${colors[0]}` 
                    : '0 0 0 2px #D9FD19';
                img.style.border = 'none';
                avatarContainer.appendChild(img);
            }
            
            img.onerror = function() {
                const placeholder = document.createElement('div');
                placeholder.className = 'preview-avatar-placeholder';
                placeholder.style.cssText = `
                    width: 100% !important;
                    height: 100% !important;
                    border-radius: 50% !important;
                    background: #40a7e3 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 24px !important;
                    color: white !important;
                `;
                
                if (gradient) {
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = `
                        position: relative;
                        width: 100%;
                        height: 100%;
                        display: inline-block;
                    `;
                    placeholder.style.cssText += `
                        position: relative;
                        z-index: 2;
                        box-shadow: none !important;
                        border: none !important;
                    `;
                    const gradientRing = document.createElement('div');
                    gradientRing.style.cssText = `
                        position: absolute;
                        top: -2px;
                        left: -2px;
                        right: -2px;
                        bottom: -2px;
                        border-radius: 50%;
                        background: ${gradient};
                        z-index: 1;
                    `;
                    wrapper.appendChild(gradientRing);
                    wrapper.appendChild(placeholder);
                    avatarContainer.innerHTML = '';
                    avatarContainer.appendChild(wrapper);
                } else {
                    const statuses = getUserStatuses(previewProfile.userId);
                    const colorMap = {
                        'дружба': '#D9FD19',
                        'отношения': '#FB5EB0',
                        'бизнес': '#5E9FC5'
                    };
                    const colors = statuses.map(s => colorMap[s]).filter(c => c);
                    placeholder.style.boxShadow = colors.length === 1 
                        ? `0 0 0 2px ${colors[0]}` 
                        : '0 0 0 2px #D9FD19';
                    placeholder.style.border = 'none';
                }
                
                placeholder.textContent = (previewProfile.name?.charAt(0)||'?').toUpperCase();
                this.parentNode.replaceChild(placeholder, this);
            };
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'preview-avatar-placeholder';
            placeholder.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                border-radius: 50% !important;
                background: #40a7e3 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 24px !important;
                color: white !important;
            `;
            
            if (gradient) {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = `
                    position: relative;
                    width: 100%;
                    height: 100%;
                    display: inline-block;
                `;
                placeholder.style.cssText += `
                    position: relative;
                    z-index: 2;
                    box-shadow: none !important;
                    border: none !important;
                `;
                const gradientRing = document.createElement('div');
                gradientRing.style.cssText = `
                    position: absolute;
                    top: -2px;
                    left: -2px;
                    right: -2px;
                    bottom: -2px;
                    border-radius: 50%;
                    background: ${gradient};
                    z-index: 1;
                `;
                wrapper.appendChild(gradientRing);
                wrapper.appendChild(placeholder);
                avatarContainer.appendChild(wrapper);
            } else {
                const statuses = getUserStatuses(previewProfile.userId);
                const colorMap = {
                    'дружба': '#D9FD19',
                    'отношения': '#FB5EB0',
                    'бизнес': '#5E9FC5'
                };
                const colors = statuses.map(s => colorMap[s]).filter(c => c);
                placeholder.style.boxShadow = colors.length === 1 
                    ? `0 0 0 2px ${colors[0]}` 
                    : '0 0 0 2px #D9FD19';
                placeholder.style.border = 'none';
                placeholder.textContent = (previewProfile.name?.charAt(0)||'?').toUpperCase();
                avatarContainer.appendChild(placeholder);
            }
        }

        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'flex: 1; font-size: 14px; color: #fff; line-height: 1.4; word-break: break-word;';
        textDiv.innerHTML = `<span style="font-weight: 700; color: var(--yellow);">${escapeHtml(previewProfile.name)}</span> — и другие интеллигенты уже создали свой профиль. готов опубликовать свой, чтобы вывести знакомства на новый уровень?`;

        banner.appendChild(avatarContainer);
        banner.appendChild(textDiv);
        document.body.appendChild(banner);
    }
}

function showGuestProfilePopup() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 360px;">
            <div class="modal-title" style="font-size: 18px;">💳 карта интеллигента</div>
            <div class="modal-text" style="font-size: 14px;">
                для доступа к разделу знакомств тебе понадобится карта интеллигента, которая делает хайкинг бесплатным, а тебя – членом клуба со множеством привилегий. хочешь обо всём узнать?
            </div>
            <button class="btn btn-yellow" id="goToPrivilegesBtn" style="margin-top: 16px;">да, хочу узнать</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            haptic();
            overlay.remove();
        }
    });
    document.getElementById('goToPrivilegesBtn').addEventListener('click', (e) => {
        e.preventDefault();
        haptic();
        overlay.remove();
        document.querySelector('.profile-blur-overlay')?.remove();
        document.querySelector('.center-floating-btn')?.remove();
        document.querySelector('.guest-center-btn')?.remove();
        document.querySelector('.profile-edit-fab')?.remove();
        document.querySelector('.profile-preview-banner')?.remove();
        renderGuestPrivileges();
        log('guest_privileges_from_profile', true, state.user);
    });
}

async function renderEditProfile() {
    document.querySelector('.profile-edit-fab')?.remove();
    document.querySelector('.profile-blur-overlay')?.remove();
    document.querySelector('.center-floating-btn')?.remove();
    document.querySelector('.guest-center-btn')?.remove();
    document.querySelector('.profile-preview-banner')?.remove();
    document.body.style.overflow = '';

    window.isPrivPage = true; window.isMenuActive = false; resetNavActive(); setActiveNav('navProfiles');
    subtitle().textContent = `📝 мой профиль`; hideBack(); haptic(); log('edit_profile_opened',false,state.user);
    showBottomNav(true); setupBottomNav();
    const bottomNav = document.getElementById('bottomNav');
    if(bottomNav) bottomNav.style.display = 'flex';

    mainDiv().innerHTML = '<div class="loader" style="display:flex;justify-content:center;padding:40px 0;"></div>';
    const fresh = await loadMyProfile(state.user?.id);
    const currentName = fresh?.name || state.user?.first_name || '';
    const currentStatuses = fresh?.friendshipStatuses || [];
    const currentHobbies = fresh?.hobbies || '';
    const currentProfession = fresh?.profession || '';
    const currentAllowMessages = fresh?.allowMessages !== false;
    const currentCustomLink = fresh?.customLink || '';

    mainDiv().innerHTML = `<div class="card-container" style="padding-top:12px; padding-bottom:8px;"><form id="editProfileForm" class="edit-form">
        <div class="profile-field"><label>👋🏻 имя</label><input type="text" id="profileName" value="${escapeHtml(currentName)}"><div class="field-hint">заполнено автоматически, как у тебя в телеграм, но ты можешь поменять</div></div>
        <div class="profile-field"><label>👀 статус знакомств</label><div class="checkbox-group"><label><input type="checkbox" value="дружба" ${currentStatuses.includes('дружба')?'checked':''}> дружба</label><label><input type="checkbox" value="отношения" ${currentStatuses.includes('отношения')?'checked':''}> отношения</label><label><input type="checkbox" value="бизнес" ${currentStatuses.includes('бизнес')?'checked':''}> бизнес</label></div><div class="field-hint">выбери к чему ты открыт на хайках</div></div>
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
        if (customLink && !customLink.match(/^https?:\/\//i)) {
            customLink = 'https://' + customLink;
        }

        const data = {
            name, friendshipStatuses: selected, hobbies, profession,
            allowMessages, customLink,
            username: state.user?.username || '',
            avatarUrl: fresh?.avatarUrl || state.user?.photo_url || null,
            avatarUpdatedAt: fresh?.avatarUpdatedAt || Date.now(),
            userId: state.user?.id
        };
        await saveProfile(state.user?.id, data);
        syncProfileToSheet(data, state.user).catch(console.error);
        delete userHikesCache[state.user?.id];
        tg.BackButton.offClick(backHandler);
        if(bottomNav) bottomNav.style.display='flex';
        showBottomNav(true);
        setupBottomNav();
        setActiveNav('navProfiles');
        renderProfiles();
    });

    if(document.getElementById('deleteProfileBtn')){
        document.getElementById('deleteProfileBtn').addEventListener('click', async ()=>{
            haptic();
            if(confirm('Снять профиль с публикации?')){
                await deleteProfile(state.user?.id);
                syncProfileDeleteToSheet(state.user?.id).catch(console.error);
                delete userHikesCache[state.user?.id];
                tg.BackButton.offClick(backHandler);
                if(bottomNav) bottomNav.style.display='flex';
                showBottomNav(true);
                setupBottomNav();
                setActiveNav('navProfiles');
                renderProfiles();
            }
        });
    }
}

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' })[m]); }
