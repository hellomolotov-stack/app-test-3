// js/ui/profiles.js
import { haptic, openLink, mainDiv, subtitle, tg, showUnicornConfetti, formatDateForDisplay } from '../utils.js';
import { state } from '../state.js';
import { log, syncProfileToSheet, syncProfileDeleteToSheet } from '../api.js';
import {
    getDatabase,
    loadAllProfiles,
    loadMyProfile,
    saveProfile,
    deleteProfile,
    saveUserAvatar,
    loadUserRegistrations,
} from '../firebase.js';
import { showBottomNav, setupBottomNav, setUserInteracted, setActiveNav, resetNavActive, hideBack } from './common.js';
import { renderHome } from './home.js';

let profiles = {};
let myProfile = null;
const userHikesCache = {};

async function loadProfilesData() {
    profiles = await loadAllProfiles();
    myProfile = await loadMyProfile(state.user?.id);
    state.profiles = profiles;
    state.myProfile = myProfile;
}

async function updateAvatarIfNeeded() {
    if (!state.user?.id || !myProfile) return;
    const lastUpdated = myProfile.avatarUpdatedAt || 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    if (now - lastUpdated > oneDay && state.user?.photo_url) {
        const db = getDatabase();
        if (!db) return;
        try {
            await db.ref(`userProfiles/${state.user.id}/avatarUrl`).set(state.user.photo_url);
            await db.ref(`userProfiles/${state.user.id}/avatarUpdatedAt`).set(firebase.database.ServerValue.TIMESTAMP);
            myProfile.avatarUrl = state.user.photo_url;
            myProfile.avatarUpdatedAt = Date.now();
            if (profiles[state.user.id]) profiles[state.user.id].avatarUrl = state.user.photo_url;
        } catch (e) {
            console.error('Error updating avatar:', e);
        }
    }
}

async function getNextHikeForUser(userId) {
    if (!userId) return null;
    if (userHikesCache[userId] !== undefined) return userHikesCache[userId];

    try {
        const registrations = await loadUserRegistrations(userId);
        if (!registrations) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureHikes = state.hikesList.filter(hike => {
            const hikeDate = new Date(hike.date);
            return hikeDate >= today && registrations[hike.date] === true;
        });
        if (futureHikes.length === 0) return null;

        futureHikes.sort((a, b) => new Date(a.date) - new Date(b.date));
        const nextHike = futureHikes[0];
        userHikesCache[userId] = nextHike;
        return nextHike;
    } catch (e) {
        console.error('Error loading user registrations for profile:', e);
        return null;
    }
}

async function renderProfileCard(profile, isBlurred = false) {
    const avatarHtml = profile.avatarUrl
        ? `<img src="${profile.avatarUrl}" class="profile-avatar" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\'profile-avatar-placeholder\'>${(profile.name?.charAt(0) || '?').toUpperCase()}</div>';">`
        : `<div class="profile-avatar-placeholder">${(profile.name?.charAt(0) || '?').toUpperCase()}</div>`;

    const statusTags = (profile.friendshipStatuses || []).map(status => {
        let tagClass = '';
        if (status === 'дружба') tagClass = 'status-tag-friendship';
        else if (status === 'отношения') tagClass = 'status-tag-romance';
        else if (status === 'бизнес') tagClass = 'status-tag-business';
        return `<span class="status-tag ${tagClass}">${status}</span>`;
    }).join('');

    let nextHikeHtml = '';
    if (!isBlurred && profile.userId) {
        const nextHike = await getNextHikeForUser(profile.userId);
        if (nextHike) {
            const formattedDate = formatDateForDisplay(nextHike.date);
            nextHikeHtml = `
                <div class="profile-section-title" style="color: var(--yellow);">идёт на хайк</div>
                <a href="#" class="profile-hike-link" data-hike-date="${nextHike.date}">${formattedDate} · ${nextHike.title}</a>
            `;
        } else {
            nextHikeHtml = `<div class="profile-section-title" style="color: var(--yellow);">идёт на хайк</div><span style="color: rgba(255,255,255,0.6); font-size: 14px;">пока нет записей</span>`;
        }
    } else if (isBlurred) {
        nextHikeHtml = '';
    } else {
        nextHikeHtml = `<div class="profile-section-title" style="color: var(--yellow);">идёт на хайк</div><span style="color: rgba(255,255,255,0.6); font-size: 14px;">скоро узнаем</span>`;
    }

    return `
        <div class="profile-card ${isBlurred ? 'blurred' : ''}">
            ${avatarHtml}
            <div class="profile-name-status">
                <span class="profile-name">${profile.name || 'Участник'}</span>
                <div class="profile-status-tags">${statusTags || '<span class="status-tag status-tag-friendship">дружба</span>'}</div>
            </div>
            <div class="profile-section-title" style="color: var(--yellow);">увлечения</div>
            <div class="profile-section-text">${profile.hobbies || '—'}</div>
            <div class="profile-section-title" style="color: var(--yellow);">профессия</div>
            <div class="profile-section-text">${profile.profession || '—'}</div>
            ${nextHikeHtml}
        </div>
    `;
}

export function showProfilesComingSoon() {
    haptic();
    showUnicornConfetti();
    log('profiles_coming_soon', true, state.user);
}

export async function renderProfiles() {
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    setActiveNav('navProfiles');
    subtitle().textContent = `👤 интеллигенты`;
    hideBack();
    haptic();
    log('profiles_page_opened', state.userCard.status !== 'active', state.user);
    showBottomNav(true);
    setupBottomNav();

    await loadProfilesData();
    await updateAvatarIfNeeded();

    const hasMyProfile = !!myProfile;
    const hasAnyProfile = Object.keys(profiles).length > 0;

    if (!hasMyProfile) {
        const placeholderCount = 6;
        let profilesHtml = '';
        for (let i = 0; i < placeholderCount; i++) {
            profilesHtml += `
                <div class="profile-card blurred">
                    <div class="profile-avatar-placeholder" style="background-color: rgba(255,255,255,0.1);">?</div>
                    <div class="profile-name-status">
                        <span class="profile-name" style="color: rgba(255,255,255,0.3);">???</span>
                        <div class="profile-status-tags"><span class="status-tag status-tag-friendship" style="background-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.3);">дружба</span></div>
                    </div>
                    <div class="profile-section-title" style="color: rgba(255,255,255,0.3);">увлечения</div>
                    <div class="profile-section-text" style="color: rgba(255,255,255,0.3);">———</div>
                    <div class="profile-section-title" style="color: rgba(255,255,255,0.3);">профессия</div>
                    <div class="profile-section-text" style="color: rgba(255,255,255,0.3);">———</div>
                </div>
            `;
        }
        mainDiv().innerHTML = `
            <div class="card-container">
                <div class="profiles-grid" id="profilesGrid">${profilesHtml}</div>
            </div>
            <div class="center-floating-btn">
                <button class="btn btn-yellow btn-glow" id="createProfileBtn">💬 создать профиль</button>
            </div>
        `;
        document.getElementById('createProfileBtn')?.addEventListener('click', () => {
            haptic();
            renderEditProfile();
        });
        return;
    }

    const sortedProfiles = Object.entries(profiles).sort((a, b) => {
        const dateA = a[1].updatedAt || 0;
        const dateB = b[1].updatedAt || 0;
        return dateB - dateA;
    });

    let profilesHtml = '';
    for (const [uid, profile] of sortedProfiles) {
        profilesHtml += await renderProfileCard(profile, false);
    }

    mainDiv().innerHTML = `
        <div class="card-container">
            <div class="profiles-grid" id="profilesGrid">${profilesHtml}</div>
        </div>
        <div class="floating-edit-btn" id="editProfileBtnContainer">
            <button class="btn btn-outline" id="editProfileBtn" style="background-color: rgba(255,255,255,0.1); color: #ffffff; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.2); backdrop-filter: blur(4px);">📝 мой профиль</button>
        </div>
    `;

    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
        haptic();
        renderEditProfile();
    });
}

async function renderEditProfile() {
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    setActiveNav('navProfiles');
    subtitle().textContent = `📝 мой профиль`;
    hideBack();
    haptic();
    log('edit_profile_opened', false, state.user);
    showBottomNav(false);

    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) bottomNav.style.display = 'none';

    await loadMyProfile(state.user?.id);
    const currentName = myProfile?.name || state.user?.first_name || '';
    const currentStatuses = myProfile?.friendshipStatuses || [];
    const currentHobbies = myProfile?.hobbies || '';
    const currentProfession = myProfile?.profession || '';

    mainDiv().innerHTML = `
        <div class="card-container">
            <form id="editProfileForm" class="edit-form">
                <div class="form-field">
                    <label>имя</label>
                    <input type="text" id="profileName" value="${escapeHtml(currentName)}" placeholder="">
                    <div class="field-hint" style="font-size: 14px; color: rgba(255,255,255,0.7); margin-top: 4px;">заполнено автоматически, как у тебя в телеграм, но ты можешь поменять</div>
                </div>
                <div class="form-field">
                    <label>статус знакомств</label>
                    <div class="checkbox-group">
                        <label><input type="checkbox" value="дружба" ${currentStatuses.includes('дружба') ? 'checked' : ''}> дружба</label>
                        <label><input type="checkbox" value="отношения" ${currentStatuses.includes('отношения') ? 'checked' : ''}> отношения</label>
                        <label><input type="checkbox" value="бизнес" ${currentStatuses.includes('бизнес') ? 'checked' : ''}> бизнес</label>
                    </div>
                    <div class="field-hint" style="font-size: 14px; color: rgba(255,255,255,0.7); margin-top: 4px;">выбери к чему ты открыт на хайках. просто общение и дружба, или тебе нужен бизнес-партнёр, человек в команду, инвестор или же ты хочешь встретить того, с кем можно поиграть в романтику?</div>
                </div>
                <div class="form-field">
                    <label>увлечения</label>
                    <textarea id="profileHobbies" rows="3" placeholder="">${escapeHtml(currentHobbies)}</textarea>
                    <div class="field-hint" style="font-size: 14px; color: rgba(255,255,255,0.7); margin-top: 4px;">перечисли через запятую то, что тебя вдохновляет, то без чего ты не можешь и то, о чём ты готов говорить часами</div>
                </div>
                <div class="form-field">
                    <label>профессия</label>
                    <textarea id="profileProfession" rows="2" placeholder="">${escapeHtml(currentProfession)}</textarea>
                    <div class="field-hint" style="font-size: 14px; color: rgba(255,255,255,0.7); margin-top: 4px;">в какой одной или нескольких сферах ты имеешь больше всего опыта?</div>
                </div>
                <button type="submit" class="btn btn-yellow" id="saveProfileBtn" style="width: 100%; margin: 0;">сохранить профиль</button>
                ${myProfile ? `<button type="button" class="delete-profile-btn" id="deleteProfileBtn">снять с публикации</button>` : ''}
            </form>
        </div>
    `;

    document.getElementById('profileName').placeholder = '';
    document.getElementById('profileHobbies').placeholder = '';
    document.getElementById('profileProfession').placeholder = '';

    const backHandler = () => {
        if (bottomNav) bottomNav.style.display = 'flex';
        showBottomNav(true);
        setupBottomNav();
        renderProfiles();
    };
    tg.BackButton.onClick(backHandler);
    tg.BackButton.show();

    const form = document.getElementById('editProfileForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        haptic();
        const name = document.getElementById('profileName').value.trim();
        if (!name) {
            alert('Пожалуйста, укажите имя');
            return;
        }
        const selectedStatuses = Array.from(document.querySelectorAll('.checkbox-group input:checked')).map(cb => cb.value);
        const hobbies = document.getElementById('profileHobbies').value.trim();
        const profession = document.getElementById('profileProfession').value.trim();

        const profileData = {
            name,
            friendshipStatuses: selectedStatuses,
            hobbies,
            profession,
            avatarUrl: myProfile?.avatarUrl || state.user?.photo_url || null,
            avatarUpdatedAt: myProfile?.avatarUpdatedAt || Date.now(),
            userId: state.user?.id
        };
        
        // Сначала сохраняем в Firebase (обязательно)
        await saveProfile(state.user?.id, profileData);
        
        // Синхронизация с Google Sheets в фоне (не блокирует интерфейс)
        syncProfileToSheet(profileData, state.user).catch(err => console.error('BG sync error:', err));

        tg.BackButton.offClick(backHandler);
        if (bottomNav) bottomNav.style.display = 'flex';
        showBottomNav(true);
        setupBottomNav();
        renderProfiles();
    });

    if (document.getElementById('deleteProfileBtn')) {
        document.getElementById('deleteProfileBtn').addEventListener('click', async () => {
            haptic();
            if (confirm('Вы уверены, что хотите снять профиль с публикации? Он перестанет быть виден другим участникам.')) {
                await deleteProfile(state.user?.id);
                syncProfileDeleteToSheet(state.user?.id).catch(err => console.error('BG delete sync error:', err));
                tg.BackButton.offClick(backHandler);
                if (bottomNav) bottomNav.style.display = 'flex';
                showBottomNav(true);
                setupBottomNav();
                renderProfiles();
            }
        });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
