// js/ui/profiles.js
import { haptic, openLink, mainDiv, subtitle, tg, formatDateForDisplay } from '../utils.js';
import { state } from '../state.js';
import { log, syncProfileToSheet, syncProfileDeleteToSheet } from '../api.js';
import {
    loadAllProfiles, loadMyProfile, saveProfile, deleteProfile, loadUserRegistrations,
} from '../firebase.js';
import { showBottomNav, setupBottomNav, setActiveNav, resetNavActive, hideBack } from './common.js';

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

    const displayHobbies = (profile.hobbies || '').replace(/\+/g, ', ');
    const displayProfession = (profile.profession || '').replace(/\+/g, ', ');

    const contactButtons = (!isBlurred && profile.userId) ? `
        <div class="profile-contact-row">
            ${profile.allowMessages !== false ? `<a href="#" class="profile-contact-link" data-action="chat" data-username="${profile.username || profile.userId}" style="color: var(--yellow); text-decoration: none; font-size: 20px;">💬</a>` : ''}
            ${profile.customLink ? `<a href="#" class="profile-contact-link" data-action="link" data-url="${escapeHtml(profile.customLink)}" style="color: var(--yellow); text-decoration: none; font-size: 20px;">🔗</a>` : ''}
        </div>
    ` : '';

    return `<div class="profile-card ${isBlurred?'blurred':''}">${avatarHtml}<div class="profile-name-status"><span class="profile-name">${profile.name||'Участник'}</span><div class="profile-status-tags">${statusTags||'<span class="status-tag status-tag-friendship">дружба</span>'}</div></div><div class="profile-section-title" style="color:var(--yellow);">увлечения</div><div class="profile-section-text">${displayHobbies||'—'}</div><div class="profile-section-title" style="color:var(--yellow);">профессия</div><div class="profile-section-text">${displayProfession||'—'}</div>${nextHikeHtml}${contactButtons}</div>`;
}

export async function renderProfiles() {
    window.isPrivPage = true; window.isMenuActive = false; resetNavActive(); setActiveNav('navProfiles');
    subtitle().textContent = `🎩 члены клуба`; hideBack(); haptic(); log('profiles_page_opened', state.userCard.status!=='active', state.user);
    showBottomNav(true); setupBottomNav();
    mainDiv().innerHTML = '<div class="loader" style="display:flex;justify-content:center;padding:40px 0;"></div>';
    await loadProfilesData();

    const isCardHolder = state.userCard.status === 'active';
    const hasMyProfile = !!myProfile;
    const placeholderCount = 6;

    if (!isCardHolder) {
        let ph = ''; for (let i=0;i<placeholderCount;i++) ph += `<div class="profile-card blurred"><div class="profile-avatar-placeholder" style="background:rgba(255,255,255,0.1);">?</div><div class="profile-name-status"><span class="profile-name" style="color:rgba(255,255,255,0.3);">???</span><div class="profile-status-tags"><span class="status-tag status-tag-friendship" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);">дружба</span></div></div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">увлечения</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">профессия</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div></div>`;
        mainDiv().innerHTML = `
            <div class="card-container">
                <div class="profiles-grid" id="profilesGrid">${ph}</div>
            </div>
            <div class="guest-center-btn">
                <button class="btn btn-yellow btn-glow" id="guestViewProfilesBtn">👀 смотреть профили</button>
                <div id="guestMessage" style="color:#fff; font-size:14px; display:none; text-align:center; margin-top:12px;"></div>
            </div>
        `;
        document.getElementById('guestViewProfilesBtn')?.addEventListener('click',()=>{
            haptic();
            const msg = document.getElementById('guestMessage');
            msg.style.display = 'block';
            msg.textContent = 'просмотр профилей и публикация своего профиля доступна владельцам карт интеллигента';
        });
        return;
    }

    if (!hasMyProfile) {
        let ph = ''; for (let i=0;i<placeholderCount;i++) ph += `<div class="profile-card blurred"><div class="profile-avatar-placeholder" style="background:rgba(255,255,255,0.1);">?</div><div class="profile-name-status"><span class="profile-name" style="color:rgba(255,255,255,0.3);">???</span><div class="profile-status-tags"><span class="status-tag status-tag-friendship" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);">дружба</span></div></div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">увлечения</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">профессия</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div></div>`;
        mainDiv().innerHTML = `<div class="card-container"><div class="profiles-grid" id="profilesGrid">${ph}</div></div><div class="center-floating-btn"><button class="btn btn-yellow btn-glow" id="createProfileBtn">💬 создать профиль</button></div>`;
        document.getElementById('createProfileBtn')?.addEventListener('click',()=>{ haptic(); renderEditProfile(); });
        return;
    }

    const sorted = Object.entries(profiles).sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
    const cards = await Promise.all(sorted.map(([,p])=>renderProfileCard(p,false)));
    mainDiv().innerHTML = `
        <div class="card-container">
            <div class="profiles-grid" id="profilesGrid">${cards.join('')}</div>
        </div>
        <div style="display: flex; justify-content: flex-end; padding-right: 16px; margin-top: -10px; margin-bottom: 20px;">
            <button class="btn btn-outline" id="editProfileBtn" style="width: auto; padding: 12px 24px; background: rgba(255,255,255,0.1); color: #fff; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.2); backdrop-filter: blur(4px);">📝 мой профиль</button>
        </div>
    `;
    document.getElementById('editProfileBtn')?.addEventListener('click',()=>{ haptic(); renderEditProfile(); });
}

async function renderEditProfile() {
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
        showBottomNav(true); setupBottomNav();
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
                showBottomNav(true); setupBottomNav();
                renderProfiles();
            }
        });
    }
}

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;' })[m]); }
