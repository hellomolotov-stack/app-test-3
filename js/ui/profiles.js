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
    
    if (colors.length === 0) {
        return null;
    }
    if (colors.length === 1) {
        return `0 0 0 2px ${colors[0]}`;
    }
    
    const steps = colors.length;
    let gradientStr = 'conic-gradient(';
    colors.forEach((color, index) => {
        const startAngle = (index * 360) / steps;
        const endAngle = ((index + 1) * 360) / steps;
        gradientStr += `${color} ${startAngle}deg ${endAngle}deg`;
        if (index < steps - 1) {
            gradientStr += `, ${color} ${endAngle}deg`;
        }
    });
    gradientStr += ')';
    
    return gradientStr;
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
    blurOverlay.style.background = 'linear-gradient(to bottom, transparent 0%, rgba(73, 138, 176, 0.4) 50%, rgba(73, 138, 176, 0.6) 100%)';
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
            img.style.cssText = `
                width: 100% !important;
                height: 100% !important;
                border-radius: 50% !important;
                object-fit: cover !important;
                border: none !important;
            `;
            if (gradient) {
                if (gradient.startsWith('conic-gradient')) {
                    img.classList.add('avatar-multi-status');
                    img.style.setProperty('--avatar-gradient', gradient);
                } else {
                    img.style.boxShadow = gradient;
                }
            } else {
                img.style.boxShadow = '0 0 0 2px #D9FD19';
            }
            img.onerror = function() {
                const placeholder = document.createElement('div');
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
                    border: none !important;
                `;
                if (gradient) {
                    if (gradient.startsWith('conic-gradient')) {
                        placeholder.classList.add('avatar-multi-status');
                        placeholder.style.setProperty('--avatar-gradient', gradient);
                    } else {
                        placeholder.style.boxShadow = gradient;
                    }
                } else {
                    placeholder.style.boxShadow = '0 0 0 2px #D9FD19';
                }
                placeholder.textContent = (previewProfile.name?.charAt(0)||'?').toUpperCase();
                this.parentNode.replaceChild(placeholder, this);
            };
            avatarContainer.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
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
                border: none !important;
            `;
            if (gradient) {
                if (gradient.startsWith('conic-gradient')) {
                    placeholder.classList.add('avatar-multi-status');
                    placeholder.style.setProperty('--avatar-gradient', gradient);
                } else {
                    placeholder.style.boxShadow = gradient;
                }
            } else {
                placeholder.style.boxShadow = '0 0 0 2px #D9FD19';
            }
            placeholder.textContent = (previewProfile.name?.charAt(0)||'?').toUpperCase();
            avatarContainer.appendChild(placeholder);
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
                <span id="allowMessagesLabel">${currentAllowMessages?'разрешено писать в телеграм':'запрещено писать в телезапрещено писать в телеграмграм'}</'}</spanspan>
            </>
            </divdiv>
        </>
        </divdiv>
       >
        <div class="profile-field"><label> <div class="profile-field"><label>🔗🔗 ссылка ссылка</label</label><input><input type=" type="text"text" id=" id="customLinkcustomLinkInput"Input" placeholder=" placeholder="https://..." value="${escapehttps://..." value="${Html(currentescapeHtml(currentCustomLink)}CustomLink)}"><div class"><div class="field-hint="field-hint">ссы">ссылка налка на твой твой сайт, б сайт, блог,лог, порт портфолио или соцфолио илисеть соцсеть</div</div></div></div>
       >
        <button <button type="submit" class="btn btn-yellow" id type="submit" class="btn btn-yellow" id="save="saveProfileBtn" style="margin-top:ProfileBtn" style="margin-top:24px;">сохранить24px;">сохранить профиль профиль</button>
       </button>
        ${fresh ${fresh?'?'<button type="button<button type="button" class" class="delete="delete-profile-btn-profile-btn" id="deleteProfileBtn" id="deleteProfileBtn" style" style="margin="margin-top:8px;">с-top:8px;">снять с публинять ска публикации</button>ции</':''}
    </formbutton>':''}
    </form></div>></div>`;

    const`;

    const allowCheck allowCheck = document = document.getElementById('.getElementById('allowMessagesCheckallowMessagesCheck');
    const');
    const allowLabel allowLabel = document = document.getElementById('.getElementById('allowMessagesallowMessagesLabelLabel');
    allow');
    allowCheck.addEventListenerCheck.addEventListener('change('change', (', ()=> allowLabel.text)=> allowLabel.textContent =Content = allowCheck allowCheck.checked.checked ? 'разреш ? 'разрешено пено писать висать в телеграм' телеграм' : : ' 'запрещенозапрещено писать в теле писать в телеграмграм');

   ');

    const back const backHandler = ()=Handler = ()=>{ if>{ if(bottomNav) bottomNav.style.display(bottomNav) bottomNav.style.display='flex='flex'; showBottomNav(true); setupBottomNav(); renderProfiles();'; showBottomNav(true); setupBottomNav(); renderProfiles(); };
    tg.Back };
    tg.BackButton.onButton.onClick(Click(backHandler); tgbackHandler); tg.BackButton.BackButton.show.show();
    document.getElementById('profileName();
    document.getElementById('').placeholderprofileName =').placeholder '';
    document = '';
   .getElementById(' document.getElementById('profileHprofileHobbies').obbies').placeholder = '';
   placeholder = '';
    document.getElementById document.getElementById('profile('profileProfessionProfession').placeholder').placeholder = '';

    document = '.getElementById';

   ('edit document.getElementById('editProfileForm').addEventListener('ProfileForm').addEventListener('submit', async (submit', async (e)=>{
        ee)=>{
        e.preventDefault();.preventDefault(); haptic haptic();
       ();
        const name const name = document.getElementById('profileName').value.trim();
        if = document.getElementById('profileName').value.trim();
        if(!name(!name) { alert(') { alert('Укажите имяУкажите имя'); return;'); return; }
        const }
        const selected = selected = Array.from Array.from(document(document.querySelectorAll('..querySelectorAll('.checkbox-group input:checkbox-group input:checked')).checked')).map(cb=>cb.value);
map(cb=>cb.value);
        const hobbies        = document const hobbies = document.getElementById('.getElementById('profileHprofileHobbies').obbies').value.trim();
       value.trim const profession();
        const profession = document = document.getElementById('.getElementById('profileProfprofileProfession').ession').value.trimvalue.trim();
       ();
        const allow const allowMessagesMessages = document.getElementById('allow = document.getElementById('allowMessagesCheck').checkedMessagesCheck').checked;
       ;
        let custom let customLink =Link = document.getElementById document.getElementById('custom('customLinkInput').valueLinkInput').value.trim.trim();
        if();
        if (custom (customLink && !customLink && !customLink.matchLink.match(/^(/^https?:\/\//i))https?:\/\//i {
            custom)) {
            customLink =Link = 'https 'https://' + custom://' + customLinkLink;
        }

        const;
        }

        const data = data = {
            {
            name, friendshipStatus name,es: friendshipStatuses: selected, selected, hobbies, profession hobbies, profession,
            allowMessages,
            allow,Messages, customLink customLink,
           ,
            username: username: state.user state.user?.username?.username || || '',
            avatar '',
            avatarUrl:Url: fresh?. fresh?.avatarUrl || state.useravatarUrl || state.user?.?.photo_urlphoto_url || null,
            || null,
            avatarUpdatedAt: avatarUpdatedAt fresh?.: fresh?.avatarUpdatedavatarUpdatedAt || Date.nowAt || Date(),
            userId:.now(),
            userId: state.user state.user?.id?.id
       
        };
        };
        await save await saveProfile(state.user?.Profile(state.user?.id,id, data data);
        syncProfileToSheet(data);
        syncProfileTo, stateSheet(data, state.user).catch(.user).catch(console.errorconsole.error);
);
        delete userHikesCache        delete userHikesCache[state.user[state.user?.id?.id];
       ];
        tg.BackButton. tg.BackButton.offClickoffClick(back(backHandler);
        ifHandler);
        if(bottom(bottomNav)Nav) bottomNav.style.display bottomNav.style.display='flex='flex';
        showBottomNav(true';
        showBottom);
       Nav(true setupBottomNav);
        setupBottom();
        setNavActiveNav('navProfiles');
        renderProf();
        setActiveNav('navProfiles');
        renderProfilesiles();
    });

    if(document.getElementById('delete();
    });

    if(document.getElementById('deleteProfileBtn'ProfileBtn')){
        document)){
        document.getElementById('.getElementById('deleteProfileBtn').addEventListenerdeleteProfileBtn').addEventListener('click('click', async (', async ()=>{
            ha)=>{
            haptic();
            ifptic(confirm();
            if(confirm('С('Снять профинять профиль сль с публика публикации?'ции?')){
                await deleteProfile)){
                await deleteProfile(state(state.user?..user?.idid);
                sync);
                syncProfileDeleteProfileDeleteToSheetToSheet(state.user?.id(state.user?.id).catch).catch(console.error(console.error);
);
                delete                delete userH userHikesCacheikesCache[state.user?.[state.user?.id];
                tgid];
                tg.BackButton.BackButton.off.offClick(Click(backHandlerbackHandler);
               );
                if(bottomNav if(bottomNav) bottomNav.style) bottomNav.style.display='.display='flex';
                showflex';
                showBottomNavBottomNav(true(true);
                setup);
                setupBottomNavBottomNav();
               ();
                set setActiveActiveNav('Nav('navProfnavProfilesiles');
                render');
                renderProfiles();
           Profiles();
            }
        }
        });
    });
    }
 }
}

function escape}

function escapeHtml(strHtml(str) {) { if(!str) if(!str) return ''; return return ''; return str.replace str.replace(/(/[&<>[&<>]/g]/g, m, m=>(=>({{ ' '&':'&amp;','&':'&amp;','<':'<':'&lt&lt;',';','>':'>':'&gt;'&gt;' } })[m]); }
)[m]); }
