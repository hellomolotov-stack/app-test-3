import { state } from '../state.js';
import { hikeTiming } from '../hike-timing.js';

const enabled = hike => ![hike.cancelled, hike.city, hike.book_club].some(v =>
    v === true || ['true', 'yes'].includes(String(v).toLowerCase())) && !/🌧/.test(hike.emoji || '');

export function completedPhotoHike(hike, now = new Date()) {
    const timing = hikeTiming(hike, now);
    return enabled(hike) && (timing.isPast || timing.isCompletedToday);
}

const dismissed = new Set();
const keyFor = hike => `shared-hike-photo:${state.user?.id}:${hike.date}`;

export function hidePhotoBanner(hike) {
    const key = keyFor(hike);
    dismissed.add(key);
    try { localStorage.setItem(key, '1'); } catch {}
    const banner = document.querySelector('.post-hike-story-banner');
    if (banner?.dataset.storyHike === hike.date) banner.remove();
}

export function photoBannerHtml(hasTrack) {
    if (!state.user?.id) return '';
    const hikes = state.hikesWithTitle || [];
    const hike = hikes.filter(item => enabled(item) && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!hike || !completedPhotoHike(hike) || !hasTrack(hike)) return '';
    const registered = state._userRegs
        ? state._userRegs[hike.date] === true
        : state.hikeBookingStatus[hikes.indexOf(hike)] === true;
    if (!registered) return '';
    const key = keyFor(hike);
    if (dismissed.has(key)) return '';
    try { if (localStorage.getItem(key)) return ''; } catch {}
    return `<button type="button" class="post-hike-story-banner" data-story-hike="${hike.date}">
        <span><strong>сделать<br>сторис <i aria-hidden="true">↗</i></strong><small>фото с треком и высотой</small></span>
        <img src="/assets/post-hike-story.webp" alt="" width="92" height="163">
    </button>`;
}

export function openPhotoStoryFor(hike) {
    if (!hike || !completedPhotoHike(hike)) return;
    import('./post-hike-story.js').then(module => module.openPhotoStory(hike, () => hidePhotoBanner(hike)));
}
