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

    const contactButtons = (!isBlurred && profile.userId) ? `
        <div class="profile-contact-row">
            ${profile.allowMessages !== false ? `<button class="profile-contact-btn" data-action="chat" data-username="${profile.username || profile.userId}">💬</button>` : ''}
            ${profile.customLink ? `<button class="profile-contact-btn" data-action="link" data-url="${escapeHtml(profile.customLink)}">🔗</button>` : ''}
        </div>
    ` : '';

    return `<div class="profile-card ${isBlurred?'blurred':''}">${avatarHtml}<div class="profile-name-status"><span class="profile-name">${profile.name||'Участник'}</span><div class="profile-status-tags">${statusTags||'<span class="status-tag status-tag-friendship">дружба</span>'}</div></div><div class="profile-section-title" style="color:var(--yellow);">увлечения</div><div class="profile-section-text">${profile.hobbies||'—'}</div><div class="profile-section-title" style="color:var(--yellow);">профессия</div><div class="profile-section-text">${profile.profession||'—'}</div>${nextHikeHtml}${contactButtons}</div>`;
}

export async function renderProfiles() {
    document.querySelector('.profile-edit-fab')?.remove();
    document.querySelector('.profile-blur-overlay')?.remove();

    window.isPrivPage = true; window.isMenuActive = false; resetNavActive(); setActiveNav('navProfiles');
    subtitle().textContent = `🎩 члены клуба`; hideBack(); haptic(); log('profiles_page_opened', state.userCard.status!=='active', state.user);
    showBottomNav(true); setupBottomNav();
    mainDiv().innerHTML = '<div class="loader" style="display:flex;justify-content:center;padding:40px 0;"></div>';
    await loadProfilesData();

    const isCardHolder = state.userCard.status === 'active';
    const hasMyProfile = !!myProfile;

    // Всегда показываем реальные профили (если есть хоть один)
    const sorted = Object.entries(profiles).sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0));
    const allCards = await Promise.all(sorted.map(([,p])=>renderProfileCard(p, false)));

    if (allCards.length === 0) {
        // Если вообще нет профилей, показываем заглушки (как раньше)
        let ph = ''; for (let i=0;i<6;i++) ph += `<div class="profile-card blurred"><div class="profile-avatar-placeholder" style="background:rgba(255,255,255,0.1);">?</div><div class="profile-name-status"><span class="profile-name" style="color:rgba(255,255,255,0.3);">???</span><div class="profile-status-tags"><span class="status-tag status-tag-friendship" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);">дружба</span></div></div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">увлечения</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div><div class="profile-section-title" style="color:rgba(255,255,255,0.3);">профессия</div><div class="profile-section-text" style="color:rgba(255,255,255,0.3);">———</div></div>`;
        mainDiv().innerHTML = `<div class="card-container"><div class="profiles-grid" id="profilesGrid">${ph}</div></div>`;
        if (!isCardHolder) {
            // Гость без профилей
            const guestBtn = document.createElement('div');
            guestBtn.className = 'guest-center-btn';
            guestBtn.innerHTML = `<button class="btn btn-yellow btn-glow" id="guestViewProfilesBtn">👀 смотреть профили</button><div id="guestMessage" style="color:#fff; font-size:14px; display:none; text-align:center; margin-top:12px;"></div>`;
            document.body.appendChild(guestBtn);
            document.getElementById('guestViewProfilesBtn')?.addEventListener('click',()=>{
                haptic();
                const msg = document.getElementById('guestMessage');
                msg.style.display = 'block';
                msg.textContent = 'просмотр профилей и публикация своего профиля доступна владельцам карт интеллигента';
            });
        } else if (!hasMyProfile) {
            // Владелец карты без своего профиля
            const createBtn = document.createElement('div');
            createBtn.className = 'center-floating-btn';
            createBtn.innerHTML = `<button class="btn btn-yellow btn-glow" id="createProfileBtn">💬 создать профиль</button>`;
            document.body.appendChild(createBtn);
            document.getElementById('createProfileBtn')?.addEventListener('click',()=>{ haptic(); renderEditProfile(); });
        } else {
            // Владелец карты с профилем – добавляем кнопку «Мой профиль»
            const btnContainer = document.createElement('div');
            btnContainer.className = 'profile-edit-fab';
            btnContainer.innerHTML = `<button class="btn btn-outline" id="editProfileBtn">📝 мой профиль</button>`;
            document.body.appendChild(btnContainer);
            document.getElementById('editProfileBtn')?.addEventListener('click',()=>{ haptic(); renderEditProfile(); });
        }
        return;
    }

    // Есть реальные профили – показываем их
    const cardsHtml = allCards.join('');
    mainDiv().innerHTML = `
        <div class="card-container">
            <div class="profiles-grid" id="profilesGrid">${cardsHtml}</div>
        </div>
    `;

    // Вычисляем, сколько профилей помещается в верхнюю половину экрана
    const profileCards = document.querySelectorAll('.profile-card');
    let visibleCount = 0;
    let cumulativeHeight = 0;
    const halfScreen = window.innerHeight * 0.5;
    for (let i = 0; i < profileCards.length; i++) {
        const card = profileCards[i];
        const rect = card.getBoundingClientRect();
        if (rect.top + rect.height > halfScreen) break;
        cumulativeHeight += rect.height;
        visibleCount = i + 1;
        if (cumulativeHeight >= halfScreen) break;
    }

    // Если владелец карты и у него есть свой профиль – показываем всё без блюра
    if (isCardHolder && hasMyProfile) {
        // Добавляем кнопку «Мой профиль»
        const btnContainer = document.createElement('div');
        btnContainer.className = 'profile-edit-fab';
        btnContainer.innerHTML = `<button class="btn btn-outline" id="editProfileBtn">📝 мой профиль</button>`;
        document.body.appendChild(btnContainer);
        document.getElementById('editProfileBtn')?.addEventListener('click',()=>{ haptic(); renderEditProfile(); });
        // Разрешаем скролл
        document.body.style.overflow = '';
        return;
    }

    // Для гостей и владельцев без профиля – ограничиваем видимую часть
    const container = document.querySelector('.card-container');
    if (container) {
        container.style.maxHeight = halfScreen + 'px';
        container.style.overflow = 'hidden';
    }
    document.body.style.overflow = 'hidden';

    // Создаём блюр-оверлей
    const blurOverlay = document.createElement('div');
    blurOverlay.className = 'profile-blur-overlay';
    blurOverlay.style.position = 'absolute';
    blurOverlay.style.top = halfScreen + 'px';
    blurOverlay.style.left = '0';
    blurOverlay.style.width = '100%';
    blurOverlay.style.height = `calc(100% - ${halfScreen}px)`;
    blurOverlay.style.backdropFilter = 'blur(8px)';
    blurOverlay.style.webkitBackdropFilter = 'blur(8px)';
    blurOverlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
    blurOverlay.style.zIndex = '50';
    blurOverlay.style.pointerEvents = 'none';
    document.querySelector('.app')?.appendChild(blurOverlay);

    // Кнопка по центру
    const centerBtn = document.createElement('div');
    centerBtn.className = isCardHolder ? 'center-floating-btn' : 'guest-center-btn';
    if (isCardHolder) {
        centerBtn.innerHTML = `<button class="btn btn-yellow btn-glow" id="createProfileBtn">💬 создать профиль</button>`;
    } else {
        centerBtn.innerHTML = `<button class="btn btn-yellow btn-glow" id="guestViewProfilesBtn">👀 смотреть профили</button><div id="guestMessage" style="color:#fff; font-size:14px; display:none; text-align:center; margin-top:12px;"></div>`;
    }
    centerBtn.style.position = 'fixed';
    centerBtn.style.top = '50%';
    centerBtn.style.left = '50%';
    centerBtn.style.transform = 'translate(-50%, -50%)';
    centerBtn.style.zIndex = '100';
    centerBtn.style.pointerEvents = 'auto';
    document.body.appendChild(centerBtn);

    if (isCardHolder) {
        document.getElementById('createProfileBtn')?.addEventListener('click',()=>{ haptic(); renderEditProfile(); });
    } else {
        document.getElementById('guestViewProfilesBtn')?.addEventListener('click',()=>{
            haptic();
            const msg = document.getElementById('guestMessage');
            msg.style.display = 'block';
            msg.textContent = 'просмотр профилей и публикация своего профиля доступна владельцам карт интеллигента';
        });
    }
}

async function renderEditProfile() {
    document.querySelector('.profile-edit-fab')?.remove();
    document.querySelector('.profile-blur-overlay')?.remove();
    document.querySelector('.center-floating-btn')?.remove();
    document.querySelector('.guest-center-btn')?.remove();
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
