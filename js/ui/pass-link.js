// js/ui/pass-link.js – вход по ссылке «место сверх лимита» из админки (startapp=pass_<код>).
// Сервер (passInfo) отдаёт хайк и отмечает, кто открыл; дальше запись на этот хайк открыта
// даже без мест: билет или карта, как обычно.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { REGISTRATION_API_URL } from '../config.js';
import { savePass } from '../pass-store.js';

async function passInfo(code) {
    const params = new URLSearchParams({ action: 'passInfo', code, init_data: window.Telegram?.WebApp?.initData || '' });
    const resp = await fetch(REGISTRATION_API_URL, { method: 'POST', body: params });
    const json = JSON.parse(await resp.text());
    if (json.status !== 'ok') throw new Error(json.message || 'ошибка');
    return json;
}

export async function openPassLink(code) {
    let info;
    try { info = await passInfo(code); }
    catch (e) {
        alert('Ссылка не найдена – попроси у организатора новую.');
        return;
    }
    if (!info.active) {
        log('место по ссылке: хайк уже прошёл', true, state.user);
        alert('Запись на этот хайк уже закрыта.');
        return;
    }
    savePass(info.hike_date, code);
    log('место по ссылке: открыл', state.userCard?.status !== 'active', state.user, { hike_date: info.hike_date });
    haptic();
    const idx = state.hikesWithTitle.findIndex(h => h.date === info.hike_date);
    if (idx >= 0) import('./calendar.js').then(m => m.showBottomSheet(idx));
}
