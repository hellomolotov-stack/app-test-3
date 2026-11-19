import { hikeTrackPoints } from './calendar.js';

function meetingUrl(value) {
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

const icon = (paths) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const pin = icon('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>');
const check = icon('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.3 2.3 4.7-5"/>');
const arrow = icon('<path d="M7 17 17 7M7 7h10v10"/>');
const ticket = icon('<path d="M4 6h16a1 1 0 0 1 1 1v2a3 3 0 0 0 0 6v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a3 3 0 0 0 0-6V7a1 1 0 0 1 1-1ZM13 6v2m0 3v2m0 3v2"/>');
// На карте Форосского выезда старт справа. Порядок точек и высот сохраняем.
const RIGHT_TO_LEFT_PROFILE_DATE = '2026-11-22';
const dateFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

export function boardingPassHtml(hike, esc) {
    const map = meetingUrl(hike.location_link);
    const day = new Date(hike.date + 'T12:00:00+03:00');
    const date = Number.isNaN(day.getTime()) ? hike.date : dateFormat.format(day).toLocaleLowerCase('ru-RU');
    const when = `${date}${hike.start_time ? ' · ' + hike.start_time : ''}`;
    const meeting = `<span class="rd-pass-pin">${pin}</span><span class="rd-pass-date"><small>${esc(when)}</small>${map ? '<strong>точка сбора</strong>' : ''}</span>`;
    return `<article class="rd-pass-card" aria-label="посадочный талон на хайк">
        <div class="rd-pass-front">
            <header class="rd-pass-head"><span>${check} <span data-app-copy="ticketStatus">ты в деле</span></span><strong>${esc(hike.title)}</strong></header>
            <div class="rd-pass-route">
                <div><b><span data-app-copy="ticketHomeTitle">дом</span></b><small><span data-app-copy="ticketHome">наблюдать жизнь</span></small></div><i aria-hidden="true"></i>
                <div><b><span data-app-copy="ticketHikeTitle">хайк</span></b><small><span data-app-copy="ticketHike">жить жизнь</span></small></div>
            </div>
            ${map ? `<button class="rd-pass-meeting" type="button" data-map="${esc(map)}" aria-label="точка сбора на карте">${meeting}<span class="rd-pass-map-action">карта ${arrow}</span></button>` : `<div class="rd-pass-meeting">${meeting}</div>`}
        </div>
        <div class="rd-pass-seam" aria-hidden="true"></div>
        <div class="rd-pass-stub">
            <div class="rd-pass-profile" hidden><span class="rd-pass-bars" dir="${hike.date === RIGHT_TO_LEFT_PROFILE_DATE ? 'rtl' : 'ltr'}" aria-hidden="true"></span><small><span data-app-copy="ticketRoute">силуэт маршрута</span></small></div>
            <button class="rd-pass-open" type="button" data-ticket="${esc(hike.date)}">${ticket} <span data-app-copy="ticketOpen">открыть мой билет</span> <span aria-hidden="true">›</span></button>
        </div>
    </article>`;
}

let lastProfile;

export async function mountBoardingPassProfile(hero, hike) {
    const points = hikeTrackPoints(hike);
    if (points.length < 2) return;
    const count = Math.min(35, points.length);
    const samples = Array.from({ length: count }, (_, i) => points[Math.round(i * (points.length - 1) / (count - 1))]);
    const key = JSON.stringify(samples);
    if (lastProfile?.key !== key) {
        const value = import('../track-elevation.js').then(m => m.loadTrackElevations(samples)).catch(() => null);
        lastProfile = { key, value };
        value.then(heights => {
            if (!heights && lastProfile?.value === value) lastProfile = undefined;
        });
    }
    const heights = await lastProfile.value;
    if (!heights || !hero.isConnected) return;
    const min = Math.min(...heights);
    const range = Math.max(1, Math.max(...heights) - min);
    const profile = hero.querySelector('.rd-pass-profile');
    profile.querySelector('.rd-pass-bars').innerHTML = heights.map(h => `<i style="height:${Math.round(4 + 20 * (h - min) / range)}px"></i>`).join('');
    profile.hidden = false;
}
