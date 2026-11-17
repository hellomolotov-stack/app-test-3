let active = null;
let generation = 0;
export const hofLinkActive = () => active !== null;
export const hofLinkGeneration = () => generation;

export function deferHofHomeRender(render) {
    if (!active || active.phase === 'waiting' || active.allowRender) return false;
    active.render = render;
    return true;
}

export function cancelHofLinkScroll() { active?.finish(false); }

export function startHofLinkScroll({ getTarget, getTopOffset, ready = Promise.resolve(), isReady = () => true,
    duration = 1300, timeout = 12000, glow = 'hof-link-glow' }) {
    cancelHofLinkScroll();
    generation++;
    return new Promise(resolve => {
        const job = { phase: 'waiting', render: null, allowRender: false };
        active = job;
        const started = performance.now();
        const html = document.documentElement, body = document.body;
        const saved = { behavior: html.style.scrollBehavior, htmlAnchor: html.style.overflowAnchor, bodyAnchor: body.style.overflowAnchor };
        let readyDone = false, raf = 0, root = null, minHeight = '', segment = null, lastFrame = 0;
        let stableSince = 0, signature = '', movingSince = 0, missingSince = 0, finishing = false;
        Promise.resolve(ready).catch(() => {}).then(() => { readyDone = true; });
        const targetY = () => {
            const el = getTarget();
            if (!el?.isConnected) return null;
            const rect = el.getBoundingClientRect();
            return Math.max(0, Math.min(rect.top + window.scrollY - Math.max(getTopOffset(), (window.innerHeight - rect.height) / 2),
                document.documentElement.scrollHeight - window.innerHeight));
        };
        const flush = () => {
            const render = job.render; job.render = null;
            if (!render) return;
            job.allowRender = true;
            try { render(); } catch (error) { console.warn('hof link render:', error.message); }
            finally { job.allowRender = false; }
        };
        const restoreHeight = () => { if (root) root.style.minHeight = minHeight; };
        const input = () => job.finish(false);
        const key = e => { if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key)) input(); };
        job.finish = arrived => {
            if (finishing) return;
            finishing = true;
            cancelAnimationFrame(raf);
            window.removeEventListener('touchstart', input);
            window.removeEventListener('pointerdown', input);
            window.removeEventListener('wheel', input);
            window.removeEventListener('keydown', key);
            // При отмене данные всё равно применяются; никаких последующих scrollTo.
            const hadRender = !!job.render;
            flush();
            if (hadRender) requestAnimationFrame(() => requestAnimationFrame(restoreHeight)); else restoreHeight();
            html.style.scrollBehavior = saved.behavior;
            html.style.overflowAnchor = saved.htmlAnchor;
            body.style.overflowAnchor = saved.bodyAnchor;
            if (active === job) active = null;
            generation++;
            const el = getTarget();
            if (arrived && el && glow) {
                el.classList.remove(glow); void el.offsetWidth; el.classList.add(glow);
                setTimeout(() => el.classList.remove(glow), 4200);
            }
            resolve(arrived);
        };
        window.addEventListener('touchstart', input, { passive: true });
        window.addEventListener('pointerdown', input, { passive: true });
        window.addEventListener('wheel', input, { passive: true });
        window.addEventListener('keydown', key);
        const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const tick = now => {
            if (active !== job || finishing) return;
            const y = targetY();
            if (job.phase === 'waiting') {
                if (now - started > timeout) return job.finish(false);
                if (!readyDone || !isReady() || y === null) { stableSince = 0; signature = ''; raf = requestAnimationFrame(tick); return; }
                const next = `${Math.round(y)}:${html.scrollHeight}:${window.innerHeight}:${getTopOffset()}`;
                if (next !== signature) { signature = next; stableSince = now; }
                if (!stableSince || now - stableSince < 500) { raf = requestAnimationFrame(tick); return; }
                job.phase = 'moving'; movingSince = now; lastFrame = now;
                root = document.getElementById('mainContent');
                if (root) { minHeight = root.style.minHeight; root.style.minHeight = `${root.getBoundingClientRect().height}px`; }
                html.style.scrollBehavior = 'auto';
                html.style.overflowAnchor = 'none'; body.style.overflowAnchor = 'none';
            }
            if (now - movingSince > 8000) return job.finish(false);
            if (y === null) {
                missingSince ||= now;
                if (now - missingSince > 1500) return job.finish(false);
                lastFrame = now; raf = requestAnimationFrame(tick); return;
            }
            missingSince = 0;
            const dt = Math.min(32, Math.max(0, now - lastFrame)); lastFrame = now;
            // Новая геометрия начинает новый отрезок от текущего экрана, не от старого y0.
            if (!segment || Math.abs(y - segment.to) > 3) {
                segment = { from: window.scrollY, to: y, elapsed: 0,
                    duration: segment ? Math.max(450, Math.min(duration, Math.abs(y - window.scrollY) * .8)) : duration };
                stableSince = now;
            }
            segment.elapsed += dt;
            const t = Math.min(1, segment.elapsed / segment.duration);
            window.scrollTo({ top: segment.from + (segment.to - segment.from) * ease(t), behavior: 'instant' });
            if (t === 1) {
                if (job.render) {
                    job.phase = 'settling'; flush(); segment = null; stableSince = now;
                } else if (now - stableSince >= 450) {
                    job.phase = 'settling';
                    restoreHeight();
                    const finalY = targetY();
                    if (finalY !== null && Math.abs(finalY - window.scrollY) <= 3) return job.finish(true);
                    segment = null; stableSince = now;
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
    });
}
