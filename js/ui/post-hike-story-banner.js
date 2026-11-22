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
    return `<article class="post-hike-story-banner" data-story-hike="${hike.date}" data-story-expires="${expiresAt}">
        <div class="post-story-copy">
            <h2>сторис</h2>
            <p data-app-copy="copy_c78c35da87a1c67b2c2d">добавим к твоему фото<br>трек и высоту</p>
            <span class="post-story-button-size" data-reference-label="читать саммари">
                <button type="button" class="mmc-read post-story-pick">выбрать фото</button>
            </span>
        </div>
        <button type="button" class="post-story-phone" aria-label="открыть пример сторис с треком завершённого хайка">
            <span class="post-story-device"><span class="post-story-camera" aria-hidden="true"></span>
                <span class="post-story-screen"><img alt="" width="1080" height="1920"></span>
            </span>
        </button>
        <input type="file" accept="image/*" hidden>
    </article>`;
}

export function openPhotoStoryFor(hike, file) {
    if (!hike || !completedPhotoHike(hike)) return;
    import('./post-hike-story.js').then(module => module.openPhotoStory(hike, file));
}
