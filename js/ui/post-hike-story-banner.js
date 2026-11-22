import { state } from '../state.js';
import { hikeTiming } from '../hike-timing.js';

const enabled = hike => ![hike.cancelled, hike.city, hike.book_club].some(v =>
    v === true || ['true', 'yes'].includes(String(v).toLowerCase())) && !/🌧/.test(hike.emoji || '');

export function completedPhotoHike(hike, now = new Date()) {
    const timing = hikeTiming(hike, now);
    return enabled(hike) && (timing.isPast || timing.isCompletedToday);
}

const bannerLifetimeMs = 48 * 60 * 60 * 1000;

export function photoBannerHtml(hasTrack, now = new Date()) {
    if (!state.user?.id) return '';
    const hikes = state.hikesWithTitle || [];
    const nowMs = now.getTime();
    const eligible = hikes.flatMap((hike, index) => {
        const registered = state._userRegs
            ? state._userRegs[hike.date] === true
            : state.hikeBookingStatus[index] === true;
        if (!registered || !enabled(hike)) return [];
        const { completedAt } = hikeTiming(hike, now);
        const expiresAt = completedAt + bannerLifetimeMs;
        if (!(nowMs >= completedAt && nowMs < expiresAt)) return [];
        return [{ hike, completedAt, expiresAt }];
    }).sort((a, b) => b.completedAt - a.completedAt);
    const offer = eligible.find(({ hike }) => hasTrack(hike));
    if (!offer) return '';
    const { hike, expiresAt } = offer;
    return `<button type="button" class="post-hike-story-banner" data-story-hike="${hike.date}" data-story-expires="${expiresAt}">
        <span><strong>сделать<br>сторис <i aria-hidden="true">↗</i></strong><small data-app-copy="copy_c78c35da87a1c67b2c2d">фото с треком и высотой</small></span>
        <img alt="" width="92" height="163">
    </button>`;
}

export function openPhotoStoryFor(hike) {
    if (!hike || !completedPhotoHike(hike)) return;
    import('./post-hike-story.js').then(module => module.openPhotoStory(hike));
}
