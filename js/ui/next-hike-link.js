import { state } from '../state.js';
import { isUpcomingHike, hikeTiming } from '../hike-timing.js';
import { log } from '../api.js';

let active = null;

export function nextUnopenedHike(hikes = state.hikesList, now = new Date()) {
    return (hikes || []).filter(h => h && !String(h.title || '').trim() && !/🏄/.test(h.emoji || '')
        && isUpcomingHike(h, now) && hikeTiming(h, now).startAt > Number(now))
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

// Сохраняем выбранную дату при повторном рендере главной из свежих данных.
export const nextHikeLinkActive = () => !!active;
export const nextHikeLinkDate = () => active ? nextUnopenedHike()?.date || '' : '';

export function focusNextUnopenedHike({ gate = Promise.resolve(), ready = () => true, topOffset = () => 76, timeout = 15000 } = {}) {
    active?.stop();
    let allowed = false, listening = false, frame = 0, started = 0, stableAt = 0, deadline = 0;
    let lastY = null, centered = null, flashed = null, flashAt = 0, finished = false, lastDate = '';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const inputEvents = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    const session = { stop };
    const root = document.documentElement;
    const previousAnchor = root.style.overflowAnchor, previousBehavior = root.style.scrollBehavior;
    const previousRestoration = history.scrollRestoration;
    root.style.overflowAnchor = 'none'; root.style.scrollBehavior = 'auto';
    history.scrollRestoration = 'manual';
    active = session;
    const interval = setInterval(tick, 80);
    Promise.resolve(gate).catch(() => null).then(result => {
        if (active !== session) return;
        if (result === 'handled') return stop();
        allowed = true; deadline = setTimeout(stop, timeout);
    });

    function stop() {
        clearInterval(interval); clearTimeout(deadline); cancelAnimationFrame(frame);
        inputEvents.forEach(type => window.removeEventListener(type, stop, true));
        document.querySelectorAll('.calendar-link-flash').forEach(el => el.classList.remove('calendar-link-flash'));
        if (active === session) active = null;
        root.style.overflowAnchor = previousAnchor; root.style.scrollBehavior = previousBehavior;
        history.scrollRestoration = previousRestoration;
    }
    function destination() {
        const cal = document.getElementById('calendarContainer');
        if (!cal) return null;
        const maxY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        return Math.min(maxY, Math.max(0, cal.getBoundingClientRect().top + scrollY - topOffset()));
    }
    function target(date = nextHikeLinkDate()) {
        const cal = document.getElementById('calendarContainer');
        return date ? cal?.querySelector(`.cf-card[data-date="${date}"]`) : cal?.querySelector('.cf-track') ? cal : null;
    }
    function flash() {
        const date = nextHikeLinkDate(), el = target(date);
        if (!el || !finished) return;
        if (flashAt && performance.now() - flashAt >= 2800) { flashed?.classList.remove('calendar-link-flash'); return; }
        if (!flashAt) {
            flashAt = performance.now();
            log('ссылка: ближайший хайк до открытия записи', state.userCard?.status !== 'active', state.user, { date, found: !!date });
        }
        if (el !== flashed && performance.now() - flashAt < 2800) {
            el.style.setProperty('--calendar-link-delay', `${-(performance.now() - flashAt)}ms`);
            el.classList.add('calendar-link-flash');
            flashed = el;
        }
    }
    function glide() {
        const from = scrollY;
        let elapsed = 0, previousFrame = null;
        const step = now => {
            if (active !== session) return;
            const y = destination();
            if (y === null) { frame = requestAnimationFrame(step); return; }
            // WebView может приостановить кадры при открытии из Telegram. Не перескакиваем
            // к концу анимации из-за времени, проведённого за заставкой или вне экрана.
            if (previousFrame !== null) elapsed += Math.min(40, now - previousFrame);
            previousFrame = now;
            const progress = reduced ? 1 : Math.min(1, elapsed / 1200);
            const ease = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
            window.scrollTo({ top: from + (y - from) * ease, behavior: 'instant' });
            if (progress < 1) frame = requestAnimationFrame(step);
            else { finished = true; flash(); }
        };
        frame = requestAnimationFrame(step);
    }
    function tick() {
        if (active !== session || !allowed) return;
        if (!listening) {
            listening = true;
            inputEvents.forEach(type => window.addEventListener(type, stop, { capture: true, passive: true }));
        }
        if (!started) window.scrollTo({ top: 0, behavior: 'instant' });
        if (!ready() || document.visibilityState === 'hidden') return;
        const date = nextHikeLinkDate(), el = target(date);
        if (!el) return;
        if (date !== lastDate) {
            flashed?.classList.remove('calendar-link-flash');
            flashAt = 0; flashed = null; lastDate = date;
        }
        let horizontalReady = true;
        if (el.matches('.cf-card') && el !== centered) {
            const track = el.parentElement;
            track.scrollTo({ left: el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2, behavior: started && !reduced ? 'smooth' : 'instant' });
            centered = el;
        }
        if (el.matches('.cf-card')) horizontalReady = Math.abs(el.parentElement.scrollLeft - el.offsetLeft + (el.parentElement.clientWidth - el.offsetWidth) / 2) < 1;
        const y = destination();
        if (lastY === null || Math.abs(y - lastY) > 1) { lastY = y; stableAt = performance.now(); }
        if ((!started || finished && Math.abs(scrollY - y) > 2) && horizontalReady && performance.now() - stableAt >= 600) {
            finished = false; started = performance.now(); glide();
        }
        if (horizontalReady) flash();
    }
    return stop;
}
