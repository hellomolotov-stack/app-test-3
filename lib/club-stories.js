// Сторис клуба на главной (кружки под приветствием). Firebase clubStories/<id>:
// { id, type, title, text, image, button: { label, action }, status: 'draft'|'published'|'hidden',
//   source: 'manual'|'auto', created_at, published_at, expires_at, pinned, views: { <uid>: ts } }
// Типы: member (новый член клуба – картинка = карта), badges (значки за хайк), summary (саммари мастермайнда),
// app (новое в приложении), event (событие), custom (свой).
// Автоматические сторис (новый владелец карты, саммари, значки за хайк) создаются черновиками, когда админ
// открывает вкладку «📸 сторис», и выходят только после «опубликовать».
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const TYPES = ['member', 'badges', 'summary', 'app', 'event', 'custom'];
const DAY = 86400000;
const AUTO_WINDOW = 7 * DAY;

async function rd(path, token) {
    const r = await fetch(`${DB}/${path}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
}
async function wr(path, token, value, method = 'PUT') {
    const r = await fetch(`${DB}/${path}.json`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(value), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`write ${path} ${r.status}`);
}

const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008]/g, '').trim().slice(0, max);
const plain = md => String(md || '').replace(/[#>*_`~\[\]]/g, '').replace(/\(https?:[^)]*\)/g, '').replace(/\s+/g, ' ').trim();

function validAction(a) {
    a = String(a || '');
    if (['', 'hike', 'card', 'badges', 'calendar', 'circle'].includes(a)) return a;
    if (/^mm:[A-Za-z0-9_]{1,80}$/.test(a)) return a;
    if (/^url:https:\/\/\S{3,500}$/.test(a)) return a;
    return '';
}

// дата события сторис (хайк, встреча, оплата карты) – по ней сортируем; публикация в любом порядке её не меняет
const dateOf = s => Number(s.event_at) || Number(s.published_at) || Number(s.created_at) || 0;

function publicView(s, uid = '') {
    return {
        id: s.id, type: s.type, title: s.title, text: s.text || '', image: s.image || '', visual: s.visual || '',
        button: s.button && s.button.action ? s.button : null,
        date: dateOf(s), pinned: !!s.pinned,
        seen: !!(uid && s.views && s.views[uid]),
    };
}

// для приложения: опубликованные и не просроченные, закреплённые – первыми, дальше свежие
async function storiesFor(token, uid, { all: everything = false } = {}) {
    const all = (await rd('clubStories', token)) || {};
    const now = Date.now();
    return Object.values(all)
        // лента – свежие (не просроченные); архив – все опубликованные
        .filter(s => s && s.status === 'published' && (everything || s.pinned || !s.expires_at || s.expires_at > now))
        .sort((a, b) => (everything ? 0 : (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || dateOf(b) - dateOf(a))
        .slice(0, everything ? 300 : 15)
        .map(s => publicView(s, uid));
}

async function markView(token, id, uid) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(id))) return;
    const s = await rd(`clubStories/${id}/status`, token);
    if (s !== 'published') return;
    await wr(`clubStories/${id}/views/${uid}`, token, Date.now());
}

// ---------- автоматические черновики ----------
async function autoScan(token) {
    const now = Date.now();
    const [existing, pays, notes, badgeDays, ach] = await Promise.all([
        rd('clubStories', token).then(v => v || {}),
        rd('pending_payments', token).then(v => v || {}).catch(() => ({})),
        rd('mmNotes', token).then(v => v || {}).catch(() => ({})),
        rd('hikeBadges', token).then(v => v || {}).catch(() => ({})),
        rd('clubAchievements', token).then(v => v || {}).catch(() => ({})),
    ]);
    const add = {};
    // автоматические сторис выходят сразу (живут в ленте 7 дней, дальше – в архиве)
    const put = (id, s) => { if (!existing[id] && !add[id]) add[id] = { id, source: 'auto', status: 'published', created_at: now, published_at: now, expires_at: now + AUTO_WINDOW, ...s }; };

    // новый владелец карты: оплаченная карта за 7 дней и человек уже в members
    const cardPays = Object.values(pays).filter(p => p && p.completed && ['permanent', 'season', 'offer'].includes(p.card_type)
        && Number(p.ts) * 1000 > now - AUTO_WINDOW);
    for (const p of cardPays) {
        const uid = String(p.user_id || '');
        if (!uid) continue;
        const m = await rd(`members/${uid}`, token).catch(() => null);
        if (!m || !m.user_id) continue;
        const name = String(m.user_name || p.first_name || '').split(' ')[0] || 'новый интеллигент';
        put(`auto_card_${uid}`, {
            type: 'member', title: `${name} – новый член клуба`,
            text: 'встречайте нового владельца карты интеллигента. увидитесь на ближайшем хайке – скажите привет 👋',
            image: m.card_image_url || '', button: { label: 'узнать о карте', action: 'card' }, event_at: Number(p.ts) * 1000,
        });
    }

    // саммари мастермайнда: опубликовано за 7 дней
    // (по дате самой встречи: updatedAt меняется, когда воскресная задача перевыкладывает всё разом)
    const mskToday = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
    const since = new Date(now + 3 * 3600000 - 14 * DAY).toISOString().slice(0, 10);
    Object.values(notes).filter(n => n && n.id && n.body && n.date >= since && n.date <= mskToday).forEach(n => {
        let t = plain(n.body);
        const q = t.search(/запрос\s/i);
        if (q >= 0) t = t.slice(q + 7).trim();
        put(`auto_mm_${n.id}`, {
            type: 'summary', title: n.title || 'саммари мастермайнда',
            text: t.length > 220 ? t.slice(0, 219).replace(/\s\S*$/, '') + '…' : t,
            image: '', button: { label: 'читать саммари', action: `mm:${n.id}` }, event_at: Date.parse(n.date + 'T12:00:00+03:00'),
        });
    });

    // значки за хайк: выдача прошла за 7 дней
    const imageOf = title => Object.values(ach).filter(r => r && r.title === title && r.medal && r.medal.imageUrl)
        .sort((a, b) => Object.keys(b.grants || {}).length - Object.keys(a.grants || {}).length)[0]?.medal.imageUrl || '';
    for (const [date, st] of Object.entries(badgeDays)) {
        const done = st && st.done;
        if (!done || !(Number(done.at) > now - AUTO_WINDOW)) continue;
        const people = (done.people || []).filter(p => p && p.badges && p.badges.length);
        if (!people.length) continue;
        const hike = await rd(`hikes/${date}`, token).catch(() => null);
        const counts = {};
        people.forEach(p => p.badges.forEach(b => { counts[b] = (counts[b] || 0) + 1; }));
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const n = people.length;
        put(`auto_badges_${date}`, {
            type: 'badges', title: 'выданы значки',
            text: `${n} ${plural(n, 'участник получил', 'участника получили', 'участников получили')} значки: ${top.slice(0, 4).map(([t]) => t).join(', ')}`,
            image: imageOf(top[0][0]), button: { label: 'твои значки', action: 'badges' }, event_at: Date.parse(date + 'T18:00:00+03:00'),
        });
    }
    if (Object.keys(add).length) await wr('clubStories', token, add, 'PATCH');
    return Object.keys(add).length;
}

// ---------- админка ----------
async function adminList(token) {
    let created = 0;
    try { created = await autoScan(token); } catch (e) { console.error('stories autoScan:', e.message); }
    const all = (await rd('clubStories', token)) || {};
    const now = Date.now();
    const list = Object.values(all).filter(s => s && s.id && s.status !== 'hidden')
        .map(s => ({ ...publicView(s), status: s.status, source: s.source, days: s.expires_at ? Math.max(0, Math.ceil((s.expires_at - now) / DAY)) : 0,
            expired: s.status === 'published' && !s.pinned && s.expires_at && s.expires_at <= now, views: Object.keys(s.views || {}).length }))
        .sort((a, b) => (a.status === 'draft' ? 0 : 1) - (b.status === 'draft' ? 0 : 1) || (b.date || 0) - (a.date || 0));

    return { stories: list, created };
}

async function adminSave(token, input, adminId) {
    const id = input.id ? String(input.id) : 'st_' + Date.now().toString(36);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('плохой id');
    const old = (await rd(`clubStories/${id}`, token)) || {};
    if (input.op === 'hide') { if (old.id) await wr(`clubStories/${id}/status`, token, 'hidden'); return { id }; }
    const type = TYPES.includes(input.type) ? input.type : 'custom';
    const title = clean(input.title, 120);
    if (!title) throw new Error('напиши заголовок');
    const image = clean(input.image, 600);
    if (image && !/^(https:\/\/|\/?assets\/)/.test(image)) throw new Error('картинка – ссылка https:// или файл из assets/');
    const action = validAction(input.button && input.button.action);
    const days = Math.min(60, Math.max(1, Number(input.days) || 7));
    const now = Date.now();
    const publish = input.op === 'publish' || (old.status === 'published' && input.op !== 'draft');
    const story = {
        ...old, id, type, title, text: clean(input.text, 600), image,
        button: action ? { label: clean(input.button.label, 40) || 'подробнее', action } : null,
        pinned: !!input.pinned, source: old.source || 'manual', created_at: old.created_at || now,
        status: publish ? 'published' : 'draft',
        published_at: publish ? (old.published_at || now) : null,
        expires_at: publish ? (old.published_at || now) + days * DAY : null,
        event_at: /^\d{4}-\d{2}-\d{2}$/.test(String(input.event_date || '')) ? Date.parse(input.event_date + 'T12:00:00+03:00') : (old.event_at || null),
        updated_at: now, updated_by: String(adminId),
    };
    await wr(`clubStories/${id}`, token, story);
    return { id };
}

module.exports = { storiesFor, markView, adminList, adminSave, autoScan };
