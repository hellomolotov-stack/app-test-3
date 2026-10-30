// Поп-ап «у тебя новые ачивки» (макет А – карусель): медаль крупно в центре, соседние выглядывают по бокам,
// под медалью название, редкость и описание. Сторис – текущей медалью или всеми сразу.
// Открывается сам при первом заходе после выдачи и по ссылке из бота (startapp=ach).
import { state } from '../state.js';
import { tg, haptic, showConfetti } from '../utils.js';
import { log } from '../api.js';
import { ACHIEVEMENT_RARITIES, rarityLabel, achievementRequest, loadAchievementCollections, claimAchievements, achievementHolders, rarityShare, achievementsVisible, isWaiting, metalOf } from '../achievements.js';
import { medalSrc } from '../achievements-medals.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rarityName = key => rarityLabel(key);
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dateRu = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '';
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const isGuest = () => state.userCard?.status !== 'active';

let shown = false;
// уже показанные в этом запуске – чтобы один значок не всплыл дважды (например, после «открыто N значков»)
const shownIds = new Set();
let activeResizeObserver = null;

// Ворота для переходов по ссылке («календарь» и т.п.): сначала окно новых значков, потом прокрутка.
// Открываются, когда стало ясно, что новых значков нет, или когда окно с ними закрыли (не дольше timeout).
let gateOpen = null;
const gate = new Promise(r => { gateOpen = r; });
// Пока окно открыто – ждём его закрытия без ограничения. 'handled' – человек уже ушёл к хайку сам, прокручивать не нужно.
let autoPopupOpen = false;
export const afterNewAchievements = (timeout = 9000) => Promise.race([gate, new Promise(r => setTimeout(() => { if (!autoPopupOpen) r(); }, timeout))]);

// новые (ещё не показанные) ачивки – сами при заходе; по ссылке из бота – новые, а если их нет, последние
export async function maybeShowNewAchievements({ fromLink = false } = {}) {
    const userId = String(state.user?.id || '');
    if (!userId || shown || !achievementsVisible()) return gateOpen();
    try {
        await Promise.race([claimAchievements(), new Promise(r => setTimeout(r, 4000))]);
        const items = (await loadAchievementCollections([userId]))[userId] || [];
        if (String(state.user?.id || '') !== userId || shown) return gateOpen();
        const fresh = items.filter(i => !i.seenAt);
        const list = fresh.length ? fresh : fromLink ? items.slice(0, 6) : [];
        if (!list.length) return gateOpen();
        shown = true;
        // не поверх других шторок: подождём, пока закроются
        const open = () => {
            if (document.querySelector('.bottom-sheet.visible, .cs-overlay, .hb-overlay, .modal-overlay, .ach-overlay')) return setTimeout(open, 1500);
            const rest = list.filter(a => !shownIds.has(a.id));
            if (rest.length) autoPopupOpen = true;
            if (rest.length) openAchievementsPopup(rest, { fresh: fresh.length > 0, source: fromLink ? 'ссылка из бота' : 'заход в приложение', owned: items.length, onClose: gateOpen });
            else gateOpen();
        };
        setTimeout(open, fromLink ? 500 : 1200);
    } catch { gateOpen(); /* ачивки не мешают работе приложения */ }
}

// ачивка сразу после события: после записи на хайк и когда человек возвращается в приложение
// (счётчик хайков растёт на следующий день после хайка) – проверяем авто-ачивки и показываем новые
let lastCheck = Date.now();
async function recheckAchievements(source) {
    if (!state.user?.id || document.querySelector('.ach-overlay') || !achievementsVisible()) return;
    lastCheck = Date.now();
    const r = await claimAchievements(true);
    if (!r.granted?.length) return;
    shown = false;
    maybeShowNewAchievements();
    // блок на главной – заново, с новыми медалями
    if (document.getElementById('myAchievements')) { document.getElementById('myAchievements').remove(); import('./medals.js').then(m => m.mountMyAchievements()).catch(() => {}); }
    log(`значки: выданы сами – ${r.granted.map(t => `«${t}»`).join(', ')} (${source})`, isGuest(), state.user);
}
window.addEventListener('club:act', e => { if (e.detail?.type === 'hike_registered') setTimeout(() => recheckAchievements('запись на хайк'), 2500); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > 30 * 60000) recheckAchievements('вернулся в приложение');
});

export function openAchievementsPopup(items, { fresh = true, source = '', initialIndex = 0, owned = 0, title = '', all = null, onClose = null } = {}) {
    if (!items?.length) return;
    items.forEach(a => shownIds.add(a.id));
    activeResizeObserver?.disconnect();
    document.querySelector('.ach-overlay')?.remove();
    // в сводку действий человека: что получил (новые) или что открыл посмотреть
    const names = items.map(a => `«${a.title}»${isWaiting(a) ? ' (ждёт активации)' : ''}`);
    log(fresh ? `значки: получил ${names.join(', ')}` : `значки: смотрел ${names[Math.max(0, Math.min(items.length - 1, initialIndex))]}${items.length > 1 ? ` и ещё ${items.length - 1}` : ''}`, isGuest(), state.user);
    const n = items.length;
    // первый вход («добро пожаловать» среди новых): главная кнопка – записаться на ближайший хайк
    const firstVisit = fresh && items.some(a => a.title === 'добро пожаловать');
    const overlay = document.createElement('div');
    overlay.className = 'ach-overlay';
    overlay.innerHTML = `<div class="ach-sheet" role="dialog" aria-modal="true" aria-label="новые значки">
        <div class="cs-grab ach-grab" aria-hidden="true"></div>
        <button type="button" class="ach-close" aria-label="закрыть">✕</button>
        <h2 class="ach-title">${title ? title : fresh ? (n === 1 ? (items[0].title === 'добро пожаловать' ? 'твой <b>первый</b> значок' : 'у тебя <b>новый</b> значок') : `у тебя <b>${n} ${plural(n, 'новый', 'новых', 'новых')}</b> ${plural(n, 'значок', 'значка', 'значков')}`) : 'твои значки'}</h2>
        <p class="ach-sub">${n > 1 ? 'листай, чтобы посмотреть все' : 'значок клуба – только твой'}</p>
        <div class="ach-track">${items.map((a, i) => `<div class="ach-slide${isWaiting(a) ? ` is-wait is-${metalOf(a)}` : ''}" data-i="${i}"><img ${medalSrc(a.medal.imageUrl, 'md')} alt="${esc(a.title)}" draggable="false">${isWaiting(a) ? '<b class="wait-lock">🔒</b>' : ''}</div>`).join('')}</div>
        ${n > 1 ? `<div class="ach-dots">${Array.from({ length: Math.min(3, n) }, (_, i) => `<i data-dot="${i}"></i>`).join('')}</div>` : ''}
        <div class="ach-info" aria-live="polite"></div>
        <div class="ach-with" hidden></div>
        <p class="ach-why" hidden>легендарные и эпические значки <b>активируются с картой интеллигента</b> – он уже твой и будет ждать</p>
        ${firstVisit ? '<button type="button" class="btn btn-yellow ach-btn" data-first-hike>записаться на хайк</button>' : ''}
        <button type="button" class="btn ${firstVisit ? 'ach-btn-all' : 'btn-yellow'} ach-btn" data-share-one>поделиться в сторис</button>
        ${all && all.length > items.length ? `<button type="button" class="btn ach-btn ach-btn-all" data-all>смотреть все · ${all.length}</button>` : ''}

        <p class="ach-note" role="status"></p>
    </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('is-on'));
    // новые значки – конфетти на фоне, как при нажатии на карту
    if (fresh) setTimeout(() => overlay.isConnected && showConfetti({ into: overlay }), 250);

    const track = overlay.querySelector('.ach-track');
    const info = overlay.querySelector('.ach-info');
    const note = overlay.querySelector('.ach-note');
    const withBox = overlay.querySelector('.ach-with');
    let current = -1;
    const viewed = new Set();
    // кто ещё получил этот значок: имя и аватарка, тап – профиль
    const openWith = async a => {
        haptic();
        // повторное нажатие сворачивает список
        if (!withBox.hidden && withBox.dataset.for === a.id) { withBox.hidden = true; return; }
        withBox.dataset.for = a.id;
        withBox.hidden = false;
        withBox.innerHTML = '<small>загружаю…</small>';
        try {
            const r = await achievementHolders(a.id);
            const others = (r.people || []).filter(p => p.userId !== String(state.user?.id));
            if (!others.length) { withBox.innerHTML = '<small>пока больше ни у кого нет</small>'; return; }
            withBox.innerHTML = `<small>вместе с тобой «${esc(a.title)}» получили:</small><div class="ach-with-list">${others.map(p => {
                const name = p.name || 'участник клуба';
                const pic = p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="" loading="lazy">` : `<i>${esc(name.slice(0, 1).toUpperCase())}</i>`;
                return p.profile ? `<button type="button" class="ach-with-p" data-uid="${esc(p.userId)}">${pic}<span>${esc(name)}</span><b>›</b></button>`
                    : `<div class="ach-with-p is-off">${pic}<span>${esc(name)}</span></div>`; }).join('')}</div>`;
            withBox.querySelectorAll('[data-uid]').forEach(b => b.onclick = () => openProfile(b.dataset.uid, b.querySelector('span').textContent, b.querySelector('img')?.src));
            log(`значки: смотрел, кто ещё получил «${a.title}»`, isGuest(), state.user);
        } catch { withBox.innerHTML = '<small>не получилось загрузить – попробуй ещё раз</small>'; }
    };
    const centerSlide = (slide, behavior = 'instant') => {
        const s = slide.getBoundingClientRect(), t = track.getBoundingClientRect();
        track.scrollTo({ left: track.scrollLeft + s.left + s.width / 2 - t.left - t.width / 2, behavior });
    };
    const show = i => {
        if (i === current) return;
        current = i;
        viewed.add(i);
        const a = items[i];
        const wait = isWaiting(a);
        info.innerHTML = `${rarityName(a.rarity) ? `<span class="ach-rar is-${esc(a.rarity)}">${rarityName(a.rarity)}${wait ? ' · ждёт активации' : ''}</span>` : '<span class="ach-rar is-empty">&nbsp;</span>'}
            <div class="ach-name">${esc(a.title)}</div>
            <div class="ach-desc">${esc(a.description || '') || '&nbsp;'}</div>
            <div class="ach-meta">${a.grant?.date ? `<span>${esc(dateRu(a.grant.date))}</span>` : ''}${a.holders > 1 ? `<button type="button" data-with>вместе с ${a.holders - 1} ${a.holders - 1 === 1 ? 'интеллигентом' : 'интеллигентами'} ›</button>` : ''}<span>${esc(rarityShare(a.title))}</span></div>`;
        withBox.hidden = true;
        // ждёт активации: вместо «поделиться» – активировать с картой
        overlay.querySelector('.ach-why').hidden = !wait;
        const btn = overlay.querySelector('[data-share-one]');
        if (btn && !btn.dataset.busy) btn.textContent = wait ? 'активировать с картой' : 'поделиться в сторис';
        info.querySelector('[data-with]')?.addEventListener('click', () => openWith(a));
        overlay.querySelectorAll('.ach-slide').forEach((s, k) => s.classList.toggle('is-on', k === i));
        // точек максимум три: первая – начало, последняя – конец, средняя – всё между
        const dot = i === 0 ? 0 : i === n - 1 ? Math.min(2, n - 1) : 1;
        overlay.querySelectorAll('[data-dot]').forEach((d, k) => d.classList.toggle('is-on', k === dot));
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
    // левая точка – назад, правая – вперёд
    overlay.querySelectorAll('[data-dot]').forEach(d => d.addEventListener('click', () => {
        const k = Number(d.dataset.dot), step = k === 0 ? -1 : k === Math.min(2, n - 1) ? 1 : 0;
        track.querySelectorAll('.ach-slide')[Math.max(0, Math.min(n - 1, current + step))]?.click();
    }));
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

    // профиль из «вместе с тобой»: закрываем значки и открываем раздел профилей на этом человеке.
    // гостю раздел сам покажет превью и предложение карты – как при переходе из списка участников хайка
    const openProfile = (userId, name, photoUrl) => {
        haptic();
        log('значки: профиль из «вместе с тобой»', isGuest(), state.user);
        close();
        document.querySelector('.acol-overlay')?.remove();
        document.body.style.overflow = '';
        state.pendingProfileClick = { userId, name, photoUrl: photoUrl || null };
        Promise.all([import('./profiles.js'), import('./common.js')]).then(([m, nav]) => {
            nav.setManualNav?.('profiles'); nav.cleanupProfileOverlays?.();
            m.renderProfiles();
            nav.updateActiveNav?.();
            setTimeout(() => {
                const card = document.querySelector(`.profile-card[data-user-id="${CSS.escape(userId)}"]`);
                if (!card) return;
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('highlight-pulse');
                setTimeout(() => card.classList.remove('highlight-pulse'), 2000);
            }, 500);
        }).catch(() => {});
    };
    const close = () => {
        if (onClose) { const cb = onClose; onClose = null; setTimeout(cb, 320); }
        if (!overlay.dataset.closed) {
            overlay.dataset.closed = '1';
            log(`значки: закрыл окно${n > 1 ? ` (посмотрел ${viewed.size} из ${n})` : ''}`, isGuest(), state.user);
        }
        resizeObserver.disconnect();
        if (activeResizeObserver === resizeObserver) activeResizeObserver = null;
        overlay.classList.remove('is-on');
        setTimeout(() => { overlay.remove(); if (!document.querySelector('.bottom-sheet.visible, .cs-overlay, .acol-overlay')) document.body.style.overflow = ''; }, 300);
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
            log(`значки: поделился в сторис «${label}»`, isGuest(), state.user);
        } catch { note.textContent = 'не получилось – проверь интернет и попробуй ещё раз'; }
        btn.textContent = text; delete btn.dataset.busy;
    };
    // «смотреть все»: тот же слайдер, но по всем значкам человека, на текущем значке
    overlay.querySelector('[data-all]')?.addEventListener('click', () => {
        haptic(); const cur = items[current];
        close();
        setTimeout(() => openAchievementsPopup(all, { fresh: false, source: 'смотреть все', initialIndex: Math.max(0, all.findIndex(a => a.id === cur?.id)) }), 320);
    });
    overlay.querySelector('[data-first-hike]')?.addEventListener('click', () => {
        haptic(); log('значки: «записаться на хайк» из окна первого значка', isGuest(), state.user);
        onClose = null; close();
        // ближайший хайк (не городская встреча) – его шторка; нет такого – календарь
        const today = new Date().toISOString().slice(0, 10);
        const idx = (state.hikesWithTitle || []).findIndex(h => h.date >= today && h.cancelled !== true && h.city !== true && h.city !== 'yes' && h.book_club !== true);
        setTimeout(() => {
            if (idx >= 0) import('./calendar.js').then(m => m.showBottomSheet(idx)).catch(() => {});
            else document.getElementById('calendarContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            gateOpen('handled');
        }, 320);
    });
    const oneBtn = overlay.querySelector('[data-share-one]');
    oneBtn.onclick = () => {
        if (!isWaiting(items[current])) return share([items[current]], oneBtn, items[current].title);
        haptic(); log(`значки: нажал «активировать с картой» на «${items[current].title}»`, true, state.user); close();
        import('./card-sheet.js').then(m => m.openCardSheet({ source: 'значок ждёт активации' })).catch(() => {});
    };
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
    ctx.fillText(list.length === 1 ? 'мой новый значок' : 'мои значки', W / 2, 250);
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

// общая сторис: «мы получили «…»» – медаль крупно и имена всех, кто её получил
export async function drawGroupStory(a, names) {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16202b'); bg.addColorStop(1, '#0A0B09');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 640, 40, W / 2, 640, 560);
    glow.addColorStop(0, 'rgba(217,253,25,.22)'); glow.addColorStop(1, 'rgba(217,253,25,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `800 60px ${FONT}`;
    ctx.fillText(`нас ${names.length} – и у всех`, W / 2, 230);
    const img = await loadImg(a.medal.imageUrl);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
    ctx.drawImage(img, (W - 560) / 2, 300, 560, 560);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff'; ctx.font = `800 70px ${FONT}`;
    let y = 960;
    wrap(ctx, `«${a.title}»`, W - 160).slice(0, 2).forEach(l => { ctx.fillText(l, W / 2, y); y += 82; });
    // имена – плашками по строкам
    ctx.font = `600 36px ${FONT}`;
    const chips = names.slice(0, 24), padX = 26, h = 64, gap = 14;
    let line = [], lines = [], width = 0;
    chips.forEach(n => {
        const w = ctx.measureText(n).width + padX * 2;
        if (width + w > W - 140 && line.length) { lines.push(line); line = []; width = 0; }
        line.push([n, w]); width += w + gap;
    });
    if (line.length) lines.push(line);
    y += 40;
    lines.slice(0, 7).forEach(l => {
        const total = l.reduce((s, [, w]) => s + w, 0) + gap * (l.length - 1);
        let x = (W - total) / 2;
        l.forEach(([n, w]) => {
            ctx.fillStyle = 'rgba(255,255,255,.1)';
            ctx.beginPath(); ctx.roundRect(x, y, w, h, 32); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillText(n, x + w / 2, y + 44);
            x += w + gap;
        });
        y += h + gap;
    });
    if (names.length > 24) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(`и ещё ${names.length - 24}`, W / 2, y + 40); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#D9FD19'; ctx.font = `800 40px ${FONT}`;
    ctx.fillText('@yaltahiking', 80, H - 110);
    const hw = ctx.measureText('@yaltahiking').width;
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `500 34px ${FONT}`;
    ctx.fillText('хайкинг интеллигенция', 80 + hw + 24, H - 110);
    return c;
}
