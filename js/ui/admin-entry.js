// js/ui/admin-entry.js – вход в админку. Сама админка (~210 КБ кода) нужна трём людям, поэтому
// она грузится отдельным файлом только по нажатию (import()), а не у каждого при запуске приложения.
import { state } from '../state.js';
import { haptic } from '../utils.js';

const ADMIN_USERNAMES = new Set(['maxmolotov', 'hellointelligent']);

export function isAdminUser() {
    return ADMIN_USERNAMES.has(String(state.user?.username || '').replace(/^@/, '').toLowerCase());
}

export function openAdmin(tab) {
    if (!isAdminUser()) return Promise.resolve();
    return import('./admin.js')
        .then(m => m.openAdmin(tab))
        .catch(error => {
            console.error('админка:', error);
            alert('Не получилось открыть админку. Проверь интернет и попробуй ещё раз');
        });
}

// 05.11: админка – пунктом в меню «⋯» (раздел «клуб»), а не кнопкой в шапке главной. Только для админов.
export function mountAdminEntry() {
    document.querySelector('.header')?.classList.remove('has-adm');
    document.querySelector('.header .adm-entry')?.remove();
    const list = document.querySelector('#navPopup .ns-list');
    if (!list || !isAdminUser() || document.getElementById('popupAdmin')) return;
    const item = document.createElement('a');
    item.href = '#'; item.id = 'popupAdmin'; item.className = 'popup-item';
    item.textContent = '⚙️ админка';
    item.addEventListener('click', e => {
        e.preventDefault(); haptic();
        document.getElementById('navPopup')?.classList.remove('show');
        window.isMenuActive = false;
        openAdmin();
    });
    list.prepend(item);
}
