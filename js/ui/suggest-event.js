// js/ui/suggest-event.js
import { haptic, mainDiv, subtitle, tg } from '../utils.js';
import { state } from '../state.js';
import { log, syncSuggestEventToSheet } from '../api.js';
import { showBottomNav, setupBottomNav, resetNavActive, setActiveNav, hideBack } from './common.js';
import { renderHome } from './home.js';

export function renderSuggestEvent() {
    window.isPrivPage = true;
    window.isMenuActive = false;
    resetNavActive();
    setActiveNav('navHikes');
    subtitle().textContent = '📨 предложить событие';
    hideBack();
    showBottomNav(true);
    setupBottomNav();

    mainDiv().innerHTML = `
        <div class="card-container">
            <form id="suggestEventForm" class="edit-form">
                <div class="profile-field">
                    <label data-app-copy="copy_bb637acccf98b91780f1">✍🏻 название</label>
                    <input type="text" id="eventTitle">
                    <div data-app-copy="copy_2bad2ce49a42e4730f8d" class="field-hint">например возлежание на пляже или встреча в Капри</div>
                </div>
                <div class="profile-field">
                    <label data-app-copy="copy_e1dfcd6af7e35cee5a7a">🗒️ описание</label>
                    <textarea id="eventDescription" rows="4"></textarea>
                    <div data-app-copy="copy_90eea395b753159f3e0c" class="field-hint">опиши ключевые детали события и почему интеллигентам стоит пойти</div>
                </div>
                <div class="profile-field">
                    <label data-app-copy="copy_cc09f2126a69ea758429">📆 дата и время</label>
                    <input data-app-copy-placeholder="copy_58a4a242599fe5f21081" type="text" id="eventDatetime" placeholder="например 15 июня в 18:00">
                    <div data-app-copy="copy_7435ad741e2a92e351af" class="field-hint">укажи предполагаемую дату и время</div>
                </div>
                <button data-app-copy="copy_ed7845e147602086166f" type="submit" class="btn btn-yellow" style="margin-top:24px;">предложить</button>
            </form>
        </div>
    `;

    const backHandler = () => {
        tg.BackButton.offClick(backHandler);
        tg.BackButton.hide();
        showBottomNav(true);
        setupBottomNav();
        renderHome();
    };
    tg.BackButton.onClick(backHandler);
    tg.BackButton.show();

    document.getElementById('suggestEventForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        haptic();

        const title = document.getElementById('eventTitle').value.trim();
        const description = document.getElementById('eventDescription').value.trim();
        const datetime = document.getElementById('eventDatetime').value;

        if (!title) return;

        const data = {
            title,
            description,
            datetime,
            userId: state.user?.id || '',
            username: state.user?.username || '',
        };

        syncSuggestEventToSheet(data).catch(console.error);
        log('отправил предложение события', state.userCard.status !== 'active', state.user);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:360px; text-align:center;">
                <div data-app-copy="copy_fb70b8a38b172955806a" style="font-size:52px; margin-bottom:16px;">📨</div>
                <div data-app-copy="copy_fba66133867b4dc3bfb9" class="modal-title" style="text-align:center; font-size:22px;">спасибо!</div>
                <div data-app-copy="copy_dcf9c033958c7441cd16" class="modal-text" style="text-align:center;">уже принимаем решение</div>
                <button class="btn btn-yellow" id="closeSuccessBtn" style="margin-top:16px;">отлично</button>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => {
            haptic();
            overlay.remove();
            tg.BackButton.offClick(backHandler);
            tg.BackButton.hide();
            showBottomNav(true);
            setupBottomNav();
            renderHome();
        };

        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
        document.getElementById('closeSuccessBtn').addEventListener('click', close);
    });
}
