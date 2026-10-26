// Поп-ап «у тебя новые ачивки» (макет А – карусель): медаль крупно в центре, соседние выглядывают по бокам,
// под медалью название, редкость и описание. Сторис – текущей медалью или всеми сразу.
// Открывается сам при первом заходе после выдачи и по ссылке из бота (startapp=ach).
import { state } from '../state.js';
import { tg, haptic } from '../utils.js';
import { log } from '../api.js';
import { ACHIEVEMENT_RARITIES, rarityLabel, achievementRequest, loadAchievementCollections } from '../achievements.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rarityName = key => rarityLabel(key);
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dateRu = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '';
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const isGuest = () => state.userCard?.status !== 'active';

let shown = false;
let activeResizeObserver = null;

// новые (ещё не показанные) ачивки – сами при заходе; по ссылке из бота – новые, а если их нет, последние
export async function maybeShowNewAchievements({ fromLink = false } = {}) {
    const userId = String(state.user?.id || '');
    if (!userId || shown) return;
    try {
        const items = (await loadAchievementCollections([userId]))[userId] || [];
        if (String(state.user?.id || '') !== userId || shown) return;
        const fresh = items.filter(i => !i.seenAt);
        const list = fresh.length ? fresh : fromLink ? items.slice(0, 6) : [];
        if (!list.length) return;
        shown = true;
        // не поверх других шторок: подождём, пока закроются
        const open = () => document.querySelector('.bottom-sheet.visible, .cs-overlay, .hb-overlay, .modal-overlay')
            ? setTimeout(open, 1500) : openAchievementsPopup(list, { fresh: fresh.length > 0, source: fromLink ? 'ссылка из бота' : 'заход в приложение' });
        setTimeout(open, fromLink ? 500 : 1200);
    } catch { /* ачивки не мешают работе приложения */ }
}

export function openAchievementsPopup(items, { fresh = true, source = '', initialIndex = 0 } = {}) {
    if (!items?.length) return;
    activeResizeObserver?.disconnect();
    document.querySelector('.ach-overlay')?.remove();
    log(`ачивки: поп-ап (${items.length}) · ${source}`, isGuest(), state.user);
    const n = items.length;
    const overlay = document.createElement('div');
    overlay.className = 'ach-overlay';
    overlay.innerHTML = `<div class="ach-sheet" role="dialog" aria-modal="true" aria-label="новые ачивки">
        <button type="button" class="ach-close" aria-label="закрыть">✕</button>
        <h2 class="ach-title">${fresh ? (n === 1 ? 'у тебя <b>новая</b> ачивка' : `у тебя <b>${n} ${plural(n, 'новая', 'новые', 'новых')}</b> ачивки`) : 'твои ачивки'}</h2>
        <p class="ach-sub">${n > 1 ? 'листай, чтобы посмотреть все' : 'медаль клуба – только твоя'}</p>
        <div class="ach-track">${items.map((a, i) => `<div class="ach-slide" data-i="${i}"><img src="${esc(a.medal.imageUrl)}" alt="${esc(a.title)}" draggable="false"></div>`).join('')}</div>
        ${n > 1 ? `<div class="ach-dots">${items.map((_, i) => `<i data-dot="${i}"></i>`).join('')}</div>` : ''}
        <div class="ach-info" aria-live="polite"></div>
        <button type="button" class="btn btn-yellow ach-btn" data-share-one>поделиться в сторис</button>
        ${n > 1 ? `<button type="button" class="btn btn-outline ach-btn" data-share-all>все ${n} в одну сторис</button>` : ''}
        <p class="ach-note" role="status"></p>
    </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));

    const track = overlay.querySelector('.ach-track');
    const info = overlay.querySelector('.ach-info');
    const note = overlay.querySelector('.ach-note');
    let current = -1;
    const centerSlide = (slide, behavior = 'instant') => {
        const s = slide.getBoundingClientRect(), t = track.getBoundingClientRect();
        track.scrollTo({ left: track.scrollLeft + s.left + s.width / 2 - t.left - t.width / 2, behavior });
    };
    const show = i => {
        if (i === current) return;
        current = i;
        const a = items[i];
        info.innerHTML = `${rarityName(a.rarity) ? `<span class="ach-rar is-${esc(a.rarity)}">${rarityName(a.rarity)}</span>` : ''}
            <div class="ach-name">${esc(a.title)}</div>
            <div class="ach-desc">${esc([a.description, dateRu(a.grant?.date)].filter(Boolean).join(' · '))}</div>`;
        overlay.querySelectorAll('.ach-slide').forEach((s, k) => s.classList.toggle('is-on', k === i));
        overlay.querySelectorAll('[data-dot]').forEach((d, k) => d.classList.toggle('is-on', k === i));
    };
    // какая медаль ближе к центру – та и «текущая»
    const onScroll = () => {
        const rect = track.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        let best = 0, bestD = Infinity;
        track.querySelectorAll('.ach-slide').forEach((s, k) => {
            const r = s.getBoundingClientRect();
            const d = Math.abs(r.left + r.width / 2 - mid);
            if (d < bestD) { bestD = d; best = k; }
        });
        if (best !== current) haptic();
        show(best);
    };
    track.addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
    track.querySelectorAll('.ach-slide').forEach((s, k) => s.addEventListener('click', () => {
        if (k !== current) centerSlide(s, 'smooth');
    }));
    overlay.querySelectorAll('[data-dot]').forEach(d => d.addEventListener('click', () => track.querySelectorAll('.ach-slide')[Number(d.dataset.dot)].click()));
    const selected = Math.max(0, Math.min(n - 1, initialIndex));
    show(selected);
    // Percent padding uses the narrower parent, not the full-bleed track width.
    const fitTrack = () => {
        const slides = track.querySelectorAll('.ach-slide');
        track.style.setProperty('--ach-edge', Math.max(0, (track.clientWidth - slides[0].offsetWidth) / 2) + 'px');
        centerSlide(slides[Math.max(0, current)]);
    };
    fitTrack();
    const resizeObserver = new ResizeObserver(fitTrack);
    activeResizeObserver = resizeObserver;
    resizeObserver.observe(track);

    const close = () => {
        resizeObserver.disconnect();
        if (activeResizeObserver === resizeObserver) activeResizeObserver = null;
        overlay.classList.remove('is-on');
        setTimeout(() => { overlay.remove(); if (!document.querySelector('.bottom-sheet.visible, .cs-overlay')) document.body.style.overflow = ''; }, 300);
    };
    overlay.querySelector('.ach-close').onclick = () => { haptic(); close(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    // показали – больше сами не всплываем (в профиле ачивки остаются)
    if (fresh) achievementRequest('seen', { ids: items.map(a => a.id) }).catch(() => {});

    const share = async (list, btn, label) => {
        if (btn.dataset.busy) return;
        haptic();
        if (!tg?.shareToStory || !tg.isVersionAtLeast?.('7.8')) { note.textContent = 'в этой версии Telegram сторис из приложения недоступны – обнови Telegram'; return; }
        btn.dataset.busy = '1'; const text = btn.textContent; btn.textContent = 'рисуем сторис…'; note.textContent = '';
        try {
            const canvas = await drawAchievementsStory(list);
            const url = await upload(canvas.toDataURL('image/jpeg', 0.9));
            tg.shareToStory(url);
            log(`ачивки: сторис – ${label}`, isGuest(), state.user);
        } catch { note.textContent = 'не получилось – проверь интернет и попробуй ещё раз'; }
        btn.textContent = text; delete btn.dataset.busy;
    };
    const oneBtn = overlay.querySelector('[data-share-one]');
    oneBtn.onclick = () => share([items[current]], oneBtn, items[current].title);
    const allBtn = overlay.querySelector('[data-share-all]');
    if (allBtn) allBtn.onclick = () => share(items, allBtn, `все ${n}`);
}

async function upload(dataUrl) {
    const r = await fetch('/api/story', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg?.initData || '', date: 'ach', img: dataUrl.split(',')[1] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.error || 'upload failed');
    return j.url;
}

const loadImg = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });

function wrap(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/); const lines = []; let line = '';
    words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
}

// сторис 1080×1920: одна медаль крупно с названием и описанием или сетка из нескольких
export async function drawAchievementsStory(list) {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16202b'); bg.addColorStop(1, '#0A0B09');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 820, 40, W / 2, 820, 620);
    glow.addColorStop(0, 'rgba(217,253,25,.22)'); glow.addColorStop(1, 'rgba(217,253,25,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const imgs = await Promise.all(list.map(a => loadImg(a.medal.imageUrl)));
    const name = String(list[0]?.grant?.name || state.user?.first_name || '').trim();
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(list.length === 1 ? 'моя новая ачивка' : 'мои ачивки', W / 2, 250);
    if (name) { ctx.font = `600 40px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillText(name, W / 2, 318); }
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
    if (list.length === 1) {
        const size = 720;
        ctx.drawImage(imgs[0], (W - size) / 2, 440, size, size);
        ctx.shadowColor = 'transparent';
        const a = list[0];
        ctx.fillStyle = '#D9FD19'; ctx.font = `800 34px ${FONT}`;
        if (rarityName(a.rarity)) ctx.fillText(rarityName(a.rarity).toUpperCase(), W / 2, 1270);
        ctx.fillStyle = '#fff'; ctx.font = `800 72px ${FONT}`;
        let y = 1360;
        wrap(ctx, a.title, W - 160).slice(0, 2).forEach(l => { ctx.fillText(l, W / 2, y); y += 84; });
        ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = `500 40px ${FONT}`;
        wrap(ctx, [a.description, dateRu(a.grant?.date)].filter(Boolean).join(' · '), W - 200).slice(0, 3).forEach(l => { ctx.fillText(l, W / 2, y + 10); y += 54; });
    } else {
        const shown = list.slice(0, 6);
        const cols = shown.length <= 2 ? shown.length : shown.length <= 4 ? 2 : 3;
        const rows = Math.ceil(shown.length / cols);
        const size = cols === 3 ? 300 : 400, gapX = 40, cell = size + 80;
        const top = Math.max(400, (H - rows * (cell + 40)) / 2 - 40);
        shown.forEach((a, i) => {
            const r = Math.floor(i / cols), inRow = Math.min(cols, shown.length - r * cols), k = i - r * cols;
            const x = (W - inRow * size - (inRow - 1) * gapX) / 2 + k * (size + gapX);
            const y = top + r * (cell + 40);
            ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
            ctx.drawImage(imgs[i], x, y, size, size);
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = '#fff'; ctx.font = `700 ${cols === 3 ? 30 : 36}px ${FONT}`;
            wrap(ctx, a.title, size + 20).slice(0, 2).forEach((l, j) => ctx.fillText(l, x + size / 2, y + size + 46 + j * 38));
        });
        if (list.length > 6) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `600 36px ${FONT}`; ctx.fillText(`и ещё ${list.length - 6}`, W / 2, 1640); }
    }
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left'; ctx.fillStyle = '#D9FD19'; ctx.font = `800 40px ${FONT}`;
    ctx.fillText('@yaltahiking', 80, H - 110);
    const hw = ctx.measureText('@yaltahiking').width;
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `500 34px ${FONT}`;
    ctx.fillText('хайкинг интеллигенция', 80 + hw + 24, H - 110);
    return c;
}
