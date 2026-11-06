// js/ui/day-strip.js – календарь «события» (пока только для isV2(), вариант А: Luma + Apple Invites).
// Сверху ближайшее событие карточкой: фото (админка → «фото на обложку») или 3D-карта маршрута,
// фон – размытый цвет этой же картинки. Ниже компактный список: «позже» и «было» с квадратными фото.
// Нажатие: будущее – шторка хайка (запись и оплата как раньше), без маршрута – «сообщить об открытии»,
// прошедшее – читалка саммари или шторка хайка.
import { state } from '../state.js';
import { haptic } from '../utils.js';
import { log } from '../api.js';
import { showBottomSheet, snapshotHikeMap, fetchGoingFromServer, isWaitlisted, toggleTeaserNotify } from './calendar.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON3 = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WDF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const PAST_DAYS = 70;
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yes = v => v === true || String(v).toLowerCase() === 'yes' || String(v).toLowerCase() === 'true';
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const dt = d => new Date(d + 'T12:00:00');

function kind(h) {
    if (/пицц/i.test(h.title || '')) return 'pizza';
    if (yes(h.city) || (!(h.title && h.title.trim()) && /🏄/.test(h.emoji || ''))) return 'city';
    if (yes(h.book_club)) return 'city';
    if (/пицц/i.test(h.title || '')) return 'pizza';
    return 'hike';
}
const COLOR = { hike: '#D9FD19', city: '#5BB4E5', pizza: '#F28C28' };
const TAGS = { hike: ['хайк', '#D9FD19', '#111'], city: ['в городе', '#2F8FC4', '#fff'], pizza: ['в гостях', '#F28C28', '#fff'] };

function events() {
    const t = today(), from = new Date(Date.now() - PAST_DAYS * 86400000).toISOString().slice(0, 10);
    return (state.hikesList || [])
        .filter(h => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && !yes(h.cancelled))
        // прошедшие – только состоявшиеся (с названием), будущие – все запланированные
        .filter(h => (h.date < t ? h.date >= from && h.title && h.title.trim() : true))
        .sort((a, b) => a.date.localeCompare(b.date));
}
const photoUrl = h => { const v = state.hikePhotos?.[h.date]; return v ? `/api/hikes?photo=${h.date}&v=${v}` : ''; };
const titleOf = h => (h.title && h.title.trim()) || (kind(h) === 'city' ? 'вечер в городе · скоро' : 'хайк · маршрут скоро');

// 3D-снимок маршрута для карточки: в памяти и в localStorage (последние 6)
const SNAP_KEY = 'dsSnaps';
const snapMem = {};
function readSnap(date) { try { return (JSON.parse(localStorage.getItem(SNAP_KEY) || '{}'))[date] || null; } catch (e) { return null; } }
function saveSnap(date, url) {
    try {
        const all = JSON.parse(localStorage.getItem(SNAP_KEY) || '{}'); all[date] = url;
        const keys = Object.keys(all); while (keys.length > 6) delete all[keys.shift()];
        localStorage.setItem(SNAP_KEY, JSON.stringify(all));
    } catch (e) {}
}
async function mapSnap(h, w, hh) {
    if (snapMem[h.date]) return snapMem[h.date];
    const cached = readSnap(h.date); if (cached) return (snapMem[h.date] = cached);
    const c = await snapshotHikeMap(h, { width: w, height: hh, ratio: 2, timeout: 12000 }).catch(() => null);
    if (!c) return null;
    const url = c.toDataURL('image/jpeg', .78);
    snapMem[h.date] = url; saveSnap(h.date, url);
    return url;
}


const DAY = 86400000;
const TILE = { hike: 'linear-gradient(135deg,#3a4d16,#16200a)', city: 'linear-gradient(135deg,#1f4a66,#0d1d2a)', pizza: 'linear-gradient(135deg,#6a3a12,#2a160a)' };
const emojiOf = h => h.emoji || (kind(h) === 'hike' ? '⛰️' : kind(h) === 'pizza' ? '🍕' : '🏙');
const isTeaser = h => !(h.title && h.title.trim());
const plural = (n, a, b, c) => { const m = n % 10, x = n % 100; return m === 1 && x !== 11 ? a : m >= 2 && m <= 4 && (x < 12 || x > 14) ? b : c; };
function until(date) {
    const d = Math.round((dt(date) - dt(today())) / DAY);
    return d <= 0 ? 'сегодня' : d === 1 ? 'завтра' : `через ${d} ${plural(d, 'день', 'дня', 'дней')}`;
}
const dayShort = h => { const d = dt(h.date); return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const thumb = h => { const ph = photoUrl(h); return ph ? `<span class="ev-sq" style="background-image:url('${ph}')"></span>` : `<span class="ev-sq ev-emo" style="background:${TILE[kind(h)]}">${esc(emojiOf(h))}</span>`; };
const faces = lst => lst.filter(p => p.photoUrl).slice(0, 4).map(p => `<i style="background-image:url('${esc(p.photoUrl)}')"></i>`).join('');

async function openEvent(h) {
    haptic();
    const past = h.date < today();
    log(`события: ${past ? 'прошедшее' : 'будущее'}`, state.userCard?.status !== 'active', state.user, { date: h.date });
    if (past) {
        const note = (state.mmNotes || []).find(n => n.date === h.date);
        if (note) { const m = await import('./mm-reader.js'); return m.openMmReader(note.id); }
    }
    const i = (state.hikesWithTitle || []).findIndex(x => x.date === h.date);
    if (i !== -1) showBottomSheet(i);
}

export function renderDayStrip(container) {
    if (!container) return;
    const t = today(), all = events();
    const up = all.filter(h => h.date >= t), past = all.filter(h => h.date < t).reverse().slice(0, 4);
    if (!up.length && !past.length) { container.innerHTML = ''; return; }
    // главное – ближайшее с названием, если оно в ближайшие 2 недели; иначе просто ближайшее
    const titled = up.find(h => !isTeaser(h));
    const hero = titled && (dt(titled.date) - dt(t)) / DAY <= 14 ? titled : up[0];
    const rest = up.filter(h => h !== hero);
    // хайки без маршрута подряд – одной строкой «ещё 3 хайка · маршруты скоро»
    const teasers = rest.filter(isTeaser);
    const later = [...rest.filter(h => !isTeaser(h)).slice(0, 4), ...(teasers.length === 1 ? teasers : [])];
    const teaserRow = teasers.length > 1 ? `<button type="button" class="ev-row" data-evt>${`<span class="ev-sq ev-emo" style="background:${TILE.hike}">⛰️</span>`}<span class="ev-rm"><b>ещё ${teasers.length} ${plural(teasers.length, 'хайк', 'хайка', 'хайков')} · маршруты скоро</b><small>${teasers.map(h => dt(h.date).getDate()).join(', ')} ${MONTHS[dt(teasers[teasers.length - 1].date).getMonth()]}</small></span><span class="ev-bell${teasers.every(h => isWaitlisted(h.date)) ? ' is-on' : ''}" data-tbell>${teasers.every(h => isWaitlisted(h.date)) ? '✓' : '🔔'}</span></button>` : '';
    const row = (h, k) => `<button type="button" class="ev-row${h.date < t ? ' is-past' : ''}" data-ev="${k}">${thumb(h)}<span class="ev-rm"><b>${esc(titleOf(h))}</b><small>${h.date < t ? `${dt(h.date).getDate()} ${MONTHS[dt(h.date).getMonth()]}` : dayShort(h)}${h.date >= t && h.start_time && !isTeaser(h) ? ' · ' + esc(h.start_time) : ''}${kind(h) === 'city' ? ' · в городе' : ''}<span data-evc="${h.date}"></span></small></span>${h.date >= t && isTeaser(h) ? `<span class="ev-bell${isWaitlisted(h.date) ? ' is-on' : ''}" data-bell="${h.date}">${isWaitlisted(h.date) ? '✓' : '🔔'}</span>` : '<span class="ev-av" data-eva="' + h.date + '"></span>'}</button>`;
    const list = [...later, ...past];
    container.innerHTML = `<div class="ev">
        <div class="ev-hd"><h2 class="section-title">события</h2></div>
        ${hero ? heroHtml(hero) : ''}
        ${later.length || teaserRow ? `<div class="ev-grp"><b>позже</b></div>${later.map(h => row(h, list.indexOf(h))).join('')}${teaserRow}` : ''}
        ${past.length ? `<div class="ev-grp"><b>было</b><span id="evPastSum"></span></div>${past.map(h => row(h, list.indexOf(h))).join('')}` : ''}
    </div>`;
    container.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', async e => {
        const h = list[+b.dataset.ev]; if (!h) return;
        const bell = e.target.closest('[data-bell]');
        if (bell || (h.date >= t && isTeaser(h))) {
            haptic();
            const on = await toggleTeaserNotify(h.date).catch(() => isWaitlisted(h.date));
            const el = b.querySelector('[data-bell]'); if (el) { el.classList.toggle('is-on', !!on); el.textContent = on ? '✓' : '🔔'; }
            return;
        }
        openEvent(h);
    }));
    container.querySelector('[data-evt]')?.addEventListener('click', async () => {
        haptic();
        const want = !teasers.every(h => isWaitlisted(h.date));
        for (const h of teasers) if (isWaitlisted(h.date) !== want) await toggleTeaserNotify(h.date).catch(() => {});
        const el = container.querySelector('[data-tbell]'); if (el) { el.classList.toggle('is-on', want); el.textContent = want ? '✓' : '🔔'; }
    });
    if (hero) wireHero(container, hero);
    // кто идёт / сколько было
    const dates = [...(hero ? [hero.date] : []), ...list.map(h => h.date)];
    fetchGoingFromServer(dates).then(res => {
        if (!container.isConnected) return;
        let ppl = 0;
        dates.forEach((d, k) => {
            const lst = Array.isArray(res[k]) ? res[k] : [];
            const isPast = d < t;
            if (isPast) ppl += lst.length;
            const av = container.querySelector(`[data-eva="${d}"]`); if (av && lst.length) av.innerHTML = faces(lst.slice(0, 6)).split('</i>').filter(Boolean).slice(0, 2).map(x => x + '</i>').join('');
            const c = container.querySelector(`[data-evc="${d}"]`); if (c && lst.length) c.textContent = isPast ? ` · ${lst.length} ${plural(lst.length, 'был', 'были', 'были')}` : ` · идут ${lst.length}`;
            const ha = container.querySelector(`#evHeroAv`);
            if (hero && d === hero.date && ha) ha.innerHTML = lst.length ? `${faces(lst)}<span>идут ${lst.length}${Number(hero.capacity) > 0 ? ` · ${Math.max(0, Number(hero.capacity) - lst.length) ? 'осталось ' + Math.max(0, Number(hero.capacity) - lst.length) : 'мест нет'}` : ''}</span>` : '';
        });
        const sum = container.querySelector('#evPastSum');
        if (sum) sum.textContent = ` · ${past.length} ${plural(past.length, 'встреча', 'встречи', 'встреч')}${ppl ? `, ${ppl} ${plural(ppl, 'человек', 'человека', 'человек')}` : ''}`;
    }).catch(() => {});
    if (!state.mmNotes) import('./mm-reader.js').then(m => m.ensureMmNotes()).catch(() => {});
}

function heroHtml(h) {
    const ph = photoUrl(h), teaser = isTeaser(h), k = kind(h);
    const meta = [dayShort(h), !teaser && h.start_time && esc(h.start_time), h.distance && `${esc(h.distance)} км`, k === 'city' && 'в городе'].filter(Boolean).join(' · ');
    const btn = teaser ? (isWaitlisted(h.date) ? '✓ сообщим об открытии' : '🔔 сообщить об открытии') : (k === 'hike' ? 'записаться' : 'иду');
    return `<div class="ev-hero" id="evHero">
        <div class="ev-blur" id="evBlur" style="background:${ph ? `url('${ph}') center/cover` : TILE[k]}"></div>
        <div class="ev-img${ph ? '' : ' is-empty'}" id="evImg"${ph ? ` style="background-image:url('${ph}')"` : ` style="background:${TILE[k]}"`}>${ph ? '' : `<span class="ev-img-emo">${esc(emojiOf(h))}</span>`}<span class="ev-chip">${until(h.date)}</span></div>
        <h3>${esc(titleOf(h))}</h3>
        <p>${meta}</p>
        <div class="ev-hav" id="evHeroAv"></div>
        <button type="button" class="ev-go${teaser && isWaitlisted(h.date) ? ' is-on' : ''}" id="evGo">${btn}</button>
    </div>`;
}

function wireHero(container, h) {
    const go = container.querySelector('#evGo'), img = container.querySelector('#evImg');
    const act = async () => {
        if (isTeaser(h)) {
            haptic();
            const on = await toggleTeaserNotify(h.date).catch(() => isWaitlisted(h.date));
            go.textContent = on ? '✓ сообщим об открытии' : '🔔 сообщить об открытии';
            go.classList.toggle('is-on', !!on);
            return;
        }
        openEvent(h);
    };
    go?.addEventListener('click', act);
    img?.addEventListener('click', () => { if (!isTeaser(h)) openEvent(h); });
    if (photoUrl(h) || !img) return;
    // без фото – 3D-карта маршрута, и её же цвет – фоном карточки
    const r = img.getBoundingClientRect();
    mapSnap(h, Math.round(r.width) || 330, Math.round(r.height) || 200).then(url => {
        if (!url || !img.isConnected) return;
        img.style.background = `url('${url}') center/cover`;
        img.classList.remove('is-empty');
        img.querySelector('.ev-img-emo')?.remove();
        const bl = container.querySelector('#evBlur'); if (bl) bl.style.background = `url('${url}') center/cover`;
    });
}
