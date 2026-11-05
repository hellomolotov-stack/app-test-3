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

// Кнопка «⚙️ админка» справа от приветствия, в одной строке с ним – только для админов.
export function mountAdminEntry() {
    const header = document.querySelector('.header');
    if (!header || !isAdminUser()) return;
    header.classList.add('has-adm');
    if (header.querySelector('.adm-entry')) return;
    const btn = document.createElement('button');
    btn.className = 'adm-entry';
    btn.textContent = '⚙️ админка';
    btn.addEventListener('click', () => { haptic(); openAdmin(); });
    header.appendChild(btn);
}
