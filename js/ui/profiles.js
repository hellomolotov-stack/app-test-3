// js/ui/profiles.js
import { haptic, openLink, mainDiv, subtitle, tg, showUnicornConfetti } from '../utils.js';
import { state } from '../state.js';
import { log, syncProfileToSheet, syncProfileDeleteToSheet } from '../api.js';
import { loadAllProfiles, loadMyProfile, saveProfile, deleteProfile, saveUserAvatar } from '../firebase.js';
import { showBottomNav, setupBottomNav, showBack, hideBack, setUserInteracted, resetNavActive, cleanupProfileOverlays } from './common.js';
import { renderHome } from './home.js';

let isEditing = false;
let currentMyProfile = null;

export async function renderProfiles() {
    cleanupProfileOverlays();
    showBack(renderHome);
    showBottomNav(true);
    setupBottomNav();
    resetNavActive();
    setUserInteracted();

    if (!state.profiles || Object.keys(state.profiles).length === 0) {
        try {
            state.profiles = await loadAllProfiles();
        } catch (e) {
            console.error('Failed to load profiles', e);
        }
    }

    const isGuest = state.userCard.status !== 'active';
    const profiles = Object.values(state.profiles).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // -------------------------------
    //  ГОСТЬ – бесконечная прокрутка
    // -------------------------------
    if (isGuest) {
        subtitle().textContent = '👥 интеллигенты';

        if (profiles.length === 0) {
            mainDiv().innerHTML = `
                <div style="height: 100vh; display: flex; align-items: center; justify-content: center;">
                    <div class="guest-center-btn">
                        <button class="btn btn-yellow btn-glow" id="guestGoToHome">
                            сначала нужна карта
                        </button>
                    </div>
                </div>
            `;
            document.getElementById('guestGoToHome').addEventListener('click', () => {
                haptic();
                renderHome();
            });
            return;
        }

        // Разделяем на две колонки (как было)
        const col1 = [];
        const col2 = [];
        profiles.forEach((profile, i) => {
            const card = buildProfileCard(profile, true);
            if (i % 2 === 0) col1.push(card);
            else col2.push(card);
        });

        const column1Html = col1.join('');
        const column2Html = col2.join('');

        // Дублируем для бесконечной анимации
        const duplicated = `
            <div class="profiles-two-columns">
                <div class="profiles-column">${column1Html}</div>
                <div class="profiles-column">${column2Html}</div>
            </div>
            <div class="profiles-two-columns">
                <div class="profiles-column">${column1Html}</div>
                <div class="profiles-column">${column2Html}</div>
            </div>
        `;

        mainDiv().innerHTML = `
            <div class="profiles-scroll-wrapper" style="height: 100vh; overflow: hidden;">
                <div class="profiles-scroll-animation">
                    ${duplicated}
                </div>
            </div>
            <div class="profile-blur-overlay"></div>
            <div class="guest-center-btn">
                <button class="btn btn-yellow btn-glow" id="guestGoToHome">
                    хочу такую карту
                </button>
            </div>
        `;

        document.getElementById('guestGoToHome').addEventListener('click', () => {
            haptic();
            renderHome();
        });

        log('profiles_guest_view', true, state.user);
        return;
    }

    // -------------------------------
    //  ВЛАДЕЛЕЦ КАРТЫ – полный доступ
    // -------------------------------
    subtitle().textContent = '👥 интеллигенты';
    const myUserId = state.user?.id;

    if (myUserId) {
        currentMyProfile = await loadMyProfile(myUserId);
    }

    const container = document.createElement('div');
    container.className = 'profiles-two-columns';

    const col1 = document.createElement('div');
    col1.className = 'profiles-column';
    const col2 = document.createElement('div');
    col2.className = 'profiles-column';

    let editButtonHtml = '';
    if (currentMyProfile) {
        editButtonHtml = `<div class="profile-edit-fab"><button class="btn" id="editMyProfileBtn">📝 мой профиль</button></div>`;
    } else {
        editButtonHtml = `<div class="profile-edit-fab"><button class="btn" id="createProfileBtn">✨ создать профиль</button></div>`;
    }

    profiles.forEach((profile, i) => {
        const card = buildProfileCard(profile, false);
        if (i % 2 === 0) col1.innerHTML += card;
        else col2.innerHTML += card;
    });

    container.appendChild(col1);
    container.appendChild(col2);
    mainDiv().innerHTML = '';
    mainDiv().appendChild(container);
    document.body.insertAdjacentHTML('beforeend', editButtonHtml);

    document.querySelectorAll('.profile-contact-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            haptic();
            const action = btn.dataset.action;
            const username = btn.dataset.username;
            const url = btn.dataset.url;
            if (action === 'chat' && username) {
                const clean = username.replace(/^@/, '');
                openLink(`https://t.me/${clean}`, 'profile_chat_click', false);
            } else if (action === 'link' && url) {
                let fixedUrl = url;
                if (!fixedUrl.match(/^https?:\/\//i)) fixedUrl = 'https://' + fixedUrl;
                openLink(fixedUrl, 'profile_link_click', false);
            }
        });
    });

    const editBtn = document.getElementById('editMyProfileBtn') || document.getElementById('createProfileBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            haptic();
            showProfileEditor();
        });
    }

    if (state.pendingProfileClick) {
        setTimeout(() => {
            const targetId = state.pendingProfileClick.userId;
            const targetCard = document.querySelector(`.profile-card[data-user-id="${targetId}"]`);
            if (targetCard) {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetCard.classList.add('highlight-pulse');
                setTimeout(() => targetCard.classList.remove('highlight-pulse'), 2000);
            }
            state.pendingProfileClick = null;
        }, 300);
    }

    log('profiles_owner_view', false, state.user);
}

function buildProfileCard(profile, isGuest) {
    const avatarHtml = profile.avatarUrl
        ? `<img src="${profile.avatarUrl}" class="profile-avatar" loading="lazy" onerror="this.style.display='none'; this.parentNode.querySelector('.profile-avatar-placeholder').style.display='flex';" />`
        : '';
    const placeholderInitial = profile.name ? profile.name.charAt(0).toUpperCase() : '?';
    const placeholderHtml = `<div class="profile-avatar-placeholder" style="${profile.avatarUrl ? 'display:none;' : ''}">${placeholderInitial}</div>`;

    const statusTags = (profile.friendshipStatuses || []).map(s => {
        let cls = '';
        if (s === 'дружба') cls = 'status-tag-friendship';
        else if (s === 'отношения') cls = 'status-tag-romance';
        else if (s === 'бизнес') cls = 'status-tag-business';
        return `<span class="status-tag ${cls}">${s}</span>`;
    }).join('');

    const contactButtons = [];
    if (!isGuest && profile.username) {
        contactButtons.push(`<button class="profile-contact-btn" data-action="chat" data-username="${profile.username}">✉️ чат</button>`);
    }
    if (!isGuest && profile.customLink) {
        contactButtons.push(`<button class="profile-contact-btn" data-action="link" data-url="${profile.customLink}">🔗 ссылка</button>`);
    }

    const hikeLink = profile.lastHikeDate
        ? `<div class="profile-hike-link" data-hike-date="${profile.lastHikeDate}">📅 последний хайк</div>`
        : '';

    return `
        <div class="profile-card" data-user-id="${profile.userId}">
            ${avatarHtml}
            ${placeholderHtml}
            <div class="profile-name-status">
                <div class="profile-name">${profile.name || 'Без имени'}</div>
                <div class="profile-status-tags">${statusTags}</div>
            </div>
            ${profile.hobbies ? `<div class="profile-section-title">увлечения</div><div class="profile-section-text">${profile.hobbies}</div>` : ''}
            ${profile.profession ? `<div class="profile-section-title">профессия</div><div class="profile-section-text">${profile.profession}</div>` : ''}
            ${hikeLink}
            <div class="profile-contact-row">${contactButtons.join('')}</div>
        </div>
    `;
}

function showProfileEditor() {
    isEditing = true;
    cleanupProfileOverlays();
    hideBack();

    const profile = currentMyProfile || {};
    const name = profile.name || '';
    const hobbies = profile.hobbies || '';
    const profession = profile.profession || '';
    const allowMessages = profile.allowMessages !== false;
    const customLink = profile.customLink || '';
    const friendshipStatuses = profile.friendshipStatuses || [];

    const check = (value) => friendshipStatuses.includes(value) ? 'checked' : '';

    mainDiv().innerHTML = `
        <div class="edit-form">
            <div class="profile-field">
                <label>имя</label>
                <input type="text" id="editName" value="${escapeHtml(name)}" placeholder="Как вас зовут?">
            </div>
            <div class="profile-field">
                <label>цель знакомства</label>
                <div class="checkbox-group">
                    <label><input type="checkbox" id="editFriend" value="дружба" ${check('дружба')}> дружба</label>
                    <label><input type="checkbox" id="editRomance" value="отношения" ${check('отношения')}> отношения</label>
                    <label><input type="checkbox" id="editBusiness" value="бизнес" ${check('бизнес')}> бизнес</label>
                </div>
            </div>
            <div class="profile-field">
                <label>интересы</label>
                <textarea id="editHobbies" placeholder="Чем увлекаетесь?">${escapeHtml(hobbies)}</textarea>
            </div>
            <div class="profile-field">
                <label>профессия</label>
                <input type="text" id="editProfession" value="${escapeHtml(profession)}" placeholder="Кем работаете?">
            </div>
            <div class="profile-field">
                <label>контакты</label>
                <input type="text" id="editCustomLink" value="${escapeHtml(customLink)}" placeholder="Ссылка (сайт, соцсеть)">
                <div class="field-hint">Укажите username, если хотите добавляться в Telegram</div>
            </div>
            <div class="profile-field">
                <div class="checkbox-row">
                    <input type="checkbox" id="editAllowMessages" ${allowMessages ? 'checked' : ''}>
                    <span>Разрешить сообщения от участников</span>
                </div>
            </div>
            <button class="btn btn-yellow" id="saveProfileBtn">сохранить</button>
            ${profile.userId ? '<button class="delete-profile-btn" id="deleteProfileBtn">удалить профиль</button>' : ''}
        </div>
    `;

    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
        haptic();
        const newProfile = {
            name: document.getElementById('editName').value.trim(),
            hobbies: document.getElementById('editHobbies').value.trim(),
            profession: document.getElementById('editProfession').value.trim(),
            customLink: document.getElementById('editCustomLink').value.trim(),
            allowMessages: document.getElementById('editAllowMessages').checked,
            friendshipStatuses: [],
            username: state.user?.username || ''
        };
        if (document.getElementById('editFriend').checked) newProfile.friendshipStatuses.push('дружба');
        if (document.getElementById('editRomance').checked) newProfile.friendshipStatuses.push('отношения');
        if (document.getElementById('editBusiness').checked) newProfile.friendshipStatuses.push('бизнес');

        if (state.user?.photo_url) {
            newProfile.avatarUrl = state.user.photo_url;
            saveUserAvatar(state.user.id, state.user.photo_url);
        }

        try {
            await saveProfile(state.user.id, newProfile);
            currentMyProfile = newProfile;
            state.myProfile = newProfile;
            syncProfileToSheet(newProfile, state.user);
            renderProfiles();
        } catch (err) {
            console.error(err);
            alert('Не удалось сохранить профиль');
        }
    });

    const deleteBtn = document.getElementById('deleteProfileBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (!confirm('Удалить профиль?')) return;
            haptic();
            try {
                await deleteProfile(state.user.id);
                currentMyProfile = null;
                state.myProfile = null;
                syncProfileDeleteToSheet(state.user.id);
                renderProfiles();
            } catch (err) {
                console.error(err);
            }
        });
    }

    log('profile_editor_opened', false, state.user);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}