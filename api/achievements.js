const crypto = require('crypto');
const { verifyInitData, isAdminUser } = require('./tg-auth');
const { getAccessToken } = require('./club-content');

const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UID = /^[1-9]\d{0,15}$/;
const RARITIES = ['common', 'rare', 'legendary', 'mythical'];
const fail = (status, message) => Object.assign(new Error(message), { status });
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function text(value, max, label) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value)) {
        throw fail(400, `проверь ${label}`);
    }
    return value.trim();
}

function date(value) {
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw fail(400, 'проверь дату хайка');
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw fail(400, 'проверь дату хайка');
    return value;
}

function revision(value) {
    return typeof value === 'string' && value.length <= 256 && /^(?:[A-Za-z0-9_+/=-]+|"[A-Za-z0-9_+/=-]+")$/.test(value);
}

// appUser – запись из app_users (все, кто хоть раз открывал приложение): имя и @ из Telegram
function person(id, profile, member, participant, appUser) {
    if (!UID.test(id)) return null;
    const sources = [profile, member, participant, appUser].filter(object);
    if (!sources.length) return null;
    const name = sources.map(p => p.name || p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ')).find(Boolean);
    const username = sources.map(p => p.username).find(Boolean);
    return { userId: id, name: String(name || username || id).slice(0, 100),
        username: String(username || '').replace(/^@/, '').slice(0, 64), member: !!member?.user_id };
}

function normalizeDraft(input) {
    if (!object(input)) throw fail(400, 'проверь ачивку');
    const title = text(input.title, 120, 'название ачивки');
    if (!RARITIES.includes(input.rarity)) throw fail(400, 'выбери редкость');
    if (!['special', 'route'].includes(input.kind)) throw fail(400, 'выбери тип ачивки');
    const hikeDate = input.hikeDate ? date(input.hikeDate) : '';
    const awardDate = date(input.date);
    if (!Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length > 300) {
        throw fail(400, 'выбери от 1 до 300 участников');
    }
    const seen = new Set();
    const recipients = input.recipients.map(p => {
        const userId = String(p?.userId || '');
        if (!UID.test(userId) || seen.has(userId)) throw fail(400, 'проверь список участников');
        seen.add(userId);
        return { userId, name: text(p.name, 100, 'имя участника'), date: date(p.date || awardDate) };
    }).sort((a, b) => a.userId.localeCompare(b.userId));
    let description = '';
    if (input.description != null && String(input.description).trim()) {
        description = String(input.description).trim();
        if (description.length > 200 || /[\x00-\x1f\x7f]/.test(description)) throw fail(400, 'проверь описание ачивки');
    }
    return { title, description, rarity: input.rarity, kind: input.kind, hikeDate, date: awardDate, recipients };
}

function normalizeMedal(input) {
    if (!object(input)) throw fail(400, 'укажи медаль');
    const asset = (value, extensions) => {
        if (typeof value !== 'string' || value.length > 240 || !new RegExp(`^/assets/achievements/[a-zA-Z0-9_/-]+\\.(${extensions})$`).test(value)
            || value.includes('//') || value.includes('/../')) throw fail(400, 'медаль должна быть в assets/achievements приложения');
        return value;
    };
    return { imageUrl: asset(input.imageUrl, 'png|webp|jpg'),
        ...(input.modelUrl ? { modelUrl: asset(input.modelUrl, 'glb') } : {}) };
}

function plannedRecipients(record) {
    return Object.fromEntries(Object.entries(record.recipients || {}).map(([id, p]) => [id,
        { userId: id, name: p.name, date: p.date || record.date }]));
}

function isPublished(record) {
    return !!record?.medal && record.publicationStatus !== 'draft';
}

function grantsFor(record, recipients, userId, now) {
    return Object.fromEntries(Object.entries(recipients).map(([id, p]) => {
        // Only previously published grants can retain an issue date. Legacy drafts cannot.
        const previous = isPublished(record) ? record.grants?.[id] || (record.schemaVersion !== 2 ? record.recipients?.[id] : null) : null;
        return [id, { ...p, issuedAt: previous?.issuedAt || now, issuedBy: previous?.issuedBy || String(userId) }];
    }));
}

function publicRecord(record) {
    const { lastWrite, ...data } = record;
    const published = isPublished(record);
    const recipients = plannedRecipients(record);
    return { ...data, recipients, status: published ? 'ready' : 'draft',
        publicationStatus: published ? 'published' : 'draft',
        grants: published ? record.grants || grantsFor(record, recipients, record.updatedBy, record.medal.attachedAt) : {},
        publishedAt: published ? record.publishedAt || record.medal.attachedAt : null };
}

// Ачивки, которые выдаются сами (кнопка админа не нужна): по числу пройденных хайков и по карте.
// Работают только те, у которых уже есть значок (imageUrl). У владельца карты счётчик – members/<id>/hikes_count,
// у гостя – записи на прошедшие хайки (без городских событий и книжного клуба).
// Автовыдача выключена по решению Макса (27.10.2026): пока все ачивки выдаются вручную в админке.
// Включить (true), когда будут готовы все медали и стартовые счета ветеранов.
const AUTO_GRANT_ENABLED = false;
const AUTO_ACHIEVEMENTS = [
    // стартовый значок – единственный, который выдаётся сам и при выключенной автовыдаче: при первом входе в приложение.
    { key: 'welcome', title: 'добро пожаловать', rarity: 'common', always: true, imageUrl: '/assets/achievements/badges/welcome-v2.png',
        description: 'ты в клубе интеллигенции – дальше значки за хайки, маршруты и всё, что случится на тропе' },
    { key: 'first-hike', title: 'первый хайк с интеллигенцией', rarity: 'common', min: 1, imageUrl: null,
        description: 'первый раз вышел на тропу с клубом – дальше только выше' },
    { key: 'hikes-5', title: '5 хайков', rarity: 'common', min: 5, imageUrl: '/assets/achievements/badges/hikes-5-v2.png',
        description: 'пять раз выходили вместе – это уже привычка' },
    { key: 'hikes-10', title: '10 хайков', rarity: 'common', min: 10, imageUrl: '/assets/achievements/badges/hikes-10-v3.png',
        description: 'десять вершин с клубом' },
    { key: 'hikes-20', title: '20 хайков', rarity: 'legendary', min: 20, imageUrl: '/assets/achievements/badges/hikes-20-v2.png',
        description: 'двадцать хайков с клубом – тропа стала своей' },
    { key: 'hikes-30', title: '30 хайков', rarity: 'legendary', min: 30, imageUrl: '/assets/achievements/badges/hikes-30-v2.png',
        description: 'тридцать вершин – ты один из тех, на ком держится клуб' },
    { key: 'hikes-50', title: '50 хайков', rarity: 'mythical', min: 50, imageUrl: '/assets/achievements/badges/hikes-50-v3.png',
        description: 'полсотни хайков – легенда клуба' },
    { key: 'card-owner', title: 'владелец карты интеллигента', rarity: 'legendary', card: true, imageUrl: null,
        description: 'теперь ты – часть клуба, а клуб растёт вместе с тобой' },
];
const titleKey = t => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'–—-]/g, ' ').replace(/\s+/g, ' ').trim();
// постоянный номер записи для авто-ачивки: одна запись на всех получателей
function autoId(key) {
    const h = crypto.createHash('sha256').update('auto-achievement:' + key).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const moscowToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

function createHandler(deps = {}) {
    const fetcher = deps.fetch || ((...args) => fetch(...args));
    const accessToken = deps.getAccessToken || getAccessToken;
    async function read(path, token) {
        const response = await fetcher(`${DB}/${path}.json`, {
            headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw fail(502, 'не удалось загрузить данные клуба');
        return { value: await response.json(), revision: response.headers.get('etag') };
    }
    async function people(token, hikeDate = '') {
        const [profiles, members, roster, attendance, appUsers] = await Promise.all([
            read('userProfiles', token), read('members', token),
            hikeDate ? read(`hikeParticipants/${hikeDate}`, token) : Promise.resolve({ value: {} }),
            hikeDate ? read(`hikeAttendance/${hikeDate}`, token) : Promise.resolve({ value: {} }),
            read('app_users', token).catch(() => ({ value: {} })),
        ]);
        const p = profiles.value || {}, m = members.value || {}, r = roster.value || {}, att = attendance.value || {}, au = appUsers.value || {};
        const ids = new Set([...Object.keys(p), ...Object.keys(m), ...Object.keys(r), ...Object.keys(au)]);
        return [...ids].map(id => person(id, p[id], m[id], r[id], au[id])).filter(Boolean)
            .map(p => ({ ...p, registered: Object.hasOwn(r, p.userId), attended: att[p.userId] === true }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    async function patch(path, token, data) {
        const response = await fetcher(`${DB}/${path}.json`, {
            method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data), signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw fail(502, 'сохранение не подтверждено — повтори запрос');
    }
    async function sendBot(chatId, html, botToken) {
        const response = await fetcher(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
            body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true,
                reply_markup: { inline_keyboard: [[{ text: '🏅 посмотреть значки', url: 'https://t.me/yaltahiking_bot?startapp=ach' }]] } }),
        });
        const result = await response.json().catch(() => ({}));
        return !!result.ok;
    }
    // недавно выданные ачивки по людям: для рассылки «у тебя новая ачивка»
    async function recentGrants(token, days = 45) {
        const [snapshot, notices] = await Promise.all([read('clubAchievements', token), read('achievementNotices', token)]);
        const since = Date.now() - days * 86400000;
        const byUser = {};
        for (const record of Object.values(snapshot.value || {})) {
            if (!record?.medal || record.publicationStatus !== 'published') continue;
            for (const [id, grant] of Object.entries(record.grants || {})) {
                if (!grant?.issuedAt || grant.issuedAt < since) continue;
                (byUser[id] ||= []).push({ id: record.id, title: record.title, issuedAt: grant.issuedAt, name: grant.name,
                    notifiedAt: Number(notices.value?.[id]?.[record.id]) || null });
            }
        }
        return byUser;
    }
    async function hikeProgress(token, userId) {
        const member = (await read(`members/${userId}`, token)).value;
        if (member?.user_id) return { hikes: Number(member.hikes_count) || 0, member: true };
        const [regs, hikes] = await Promise.all([read(`userRegistrations/${userId}`, token), read('hikes', token)]);
        const today = moscowToday();
        const yes = v => v === true || String(v).toLowerCase() === 'yes';
        const count = Object.entries(regs.value || {}).filter(([d, on]) => on === true && d < today && hikes.value?.[d]
            && !yes(hikes.value[d].city) && !yes(hikes.value[d].book_club) && !yes(hikes.value[d].cancelled)).length;
        return { hikes: count, member: false };
    }
    async function claimAuto(token, user) {
        const userId = String(user.id);
        const progress = await hikeProgress(token, userId);
        const snapshot = (await read('clubAchievements', token)).value || {};
        const owned = new Set(Object.values(snapshot).filter(r => r?.grants?.[userId]?.issuedAt && r.publicationStatus === 'published').map(r => titleKey(r.title)));
        const due = AUTO_ACHIEVEMENTS.filter(a => a.imageUrl && !owned.has(titleKey(a.title))
            && (a.always || (AUTO_GRANT_ENABLED && (a.card ? progress.member : progress.hikes >= a.min))));
        const granted = [];
        const name = String([user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || userId).slice(0, 100);
        for (const a of due) {
            const id = autoId(a.key);
            for (let attempt = 0; attempt < 3; attempt++) {
                const current = await read(`clubAchievements/${id}`, token);
                const now = Date.now(), day = moscowToday();
                const old = current.value || { id, schemaVersion: 2, title: a.title, description: a.description, rarity: a.rarity, kind: 'auto',
                    hikeDate: '', date: day, recipients: {}, grants: {}, medal: { imageUrl: a.imageUrl, attachedAt: now, attachedBy: 'auto' },
                    publicationStatus: 'published', publishedAt: now, createdAt: now, createdBy: 'auto', history: [] };
                if (old.grants?.[userId]?.issuedAt) break;
                const record = { ...old, updatedAt: now, updatedBy: 'auto',
                    recipients: { ...(old.recipients || {}), [userId]: { userId, name, date: day } },
                    grants: { ...(old.grants || {}), [userId]: { userId, name, date: day, issuedAt: now, issuedBy: 'auto' } } };
                try { await write(id, token, current.revision, record); granted.push(a.title); break; }
                catch (error) { if (error.status !== 409) throw error; }
            }
        }
        return { granted, progress };
    }
    async function write(id, token, etag, record) {
        if (!revision(etag)) throw fail(502, 'не удалось проверить версию ачивки');
        const response = await fetcher(`${DB}/clubAchievements/${id}.json`, {
            method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': etag },
            body: JSON.stringify(record), signal: AbortSignal.timeout(10000),
        });
        if (response.status === 412) throw fail(409, 'ачивка уже изменена — обнови её перед сохранением');
        if (!response.ok) throw fail(502, 'сохранение не подтверждено — повтори запрос');
    }
    return async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'POST') return res.status(405).json({ error: 'метод не поддерживается' });
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) return res.status(503).json({ error: 'сервер не настроен' });
        try {
            let body = req.body;
            if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw fail(400, 'неверный запрос'); } }
            if (!object(body)) throw fail(400, 'неверный запрос');
            const user = verifyInitData(String(body.initData || ''), botToken);
            if (!user?.id) throw fail(401, 'открой админку внутри Telegram');
            const collection = body.action === 'collection';
            // «посмотрел ачивки» – любой участник, только про себя
            if (body.action === 'seen') {
                const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string' && UUID.test(id)).slice(0, 100) : [];
                if (!ids.length) throw fail(400, 'нет ачивок');
                const now = Date.now();
                await patch(`achievementSeen/${user.id}`, await accessToken(), Object.fromEntries(ids.map(id => [id, now])));
                return res.status(200).json({ ok: true });
            }
            // сами себе: авто-ачивки по хайкам и карте
            if (body.action === 'claim') {
                const result = await claimAuto(await accessToken(), user);
                return res.status(200).json(result);
            }
            // с кем вместе получена ачивка: имена – владельцам карты и админам, остальным – только число
            if (body.action === 'holders') {
                if (typeof body.id !== 'string' || !UUID.test(body.id)) throw fail(400, 'неверный номер ачивки');
                const token = await accessToken();
                const record = (await read(`clubAchievements/${body.id}`, token)).value;
                if (!record?.medal || record.publicationStatus !== 'published') throw fail(404, 'ачивка не найдена');
                const ids = Object.keys(record.grants || {}).filter(id => record.grants[id]?.issuedAt);
                // имена и аватарки видят все: тап ведёт в профили, а там гостя встречает предложение карты
                const profiles = (await read('userProfiles', token)).value || {};
                const avatar = id => { const u = String(profiles[id]?.avatarUrl || ''); return /^https:\/\//.test(u) ? u.slice(0, 500) : ''; };
                const people = ids.map(id => ({ userId: id, name: String(profiles[id]?.name || record.grants[id].name || '').slice(0, 64),
                    profile: !!profiles[id], avatarUrl: avatar(id) }));
                return res.status(200).json({ count: ids.length, people });
            }
            if (!collection && !isAdminUser(user)) throw fail(403, 'только для администраторов');
            if (body.action === 'attendance') {
                const day = date(body.hikeDate);
                const ids = Array.isArray(body.userIds) ? body.userIds.map(String).filter(id => UID.test(id)).slice(0, 300) : [];
                if (!ids.length) throw fail(400, 'проверь участников');
                await patch(`hikeAttendance/${day}`, await accessToken(), Object.fromEntries(ids.map(id => [id, body.attended ? true : null])));
                return res.status(200).json({ ok: true });
            }
            if (body.action === 'notify_list') {
                const token = await accessToken();
                const [byUser, list] = await Promise.all([recentGrants(token), people(token)]);
                const known = new Map(list.map(p => [p.userId, p]));
                const rows = Object.entries(byUser).map(([userId, items]) => ({ userId,
                    name: known.get(userId)?.name || items[0].name || userId, username: known.get(userId)?.username || '',
                    items: items.sort((a, b) => b.issuedAt - a.issuedAt) }))
                    .sort((a, b) => (a.items.every(i => i.notifiedAt) - b.items.every(i => i.notifiedAt)) || b.items[0].issuedAt - a.items[0].issuedAt);
                return res.status(200).json({ people: rows });
            }
            if (body.action === 'notify_send') {
                const ids = Array.isArray(body.userIds) ? [...new Set(body.userIds.map(String).filter(id => UID.test(id)))].slice(0, 300) : [];
                if (!ids.length) throw fail(400, 'выбери получателей');
                const template = typeof body.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 1500) : '';
                if (!template) throw fail(400, 'напиши текст сообщения');
                const token = await accessToken();
                const byUser = await recentGrants(token);
                const esc = v => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
                const compose = (userId, items) => {
                    const fresh = items.filter(i => !i.notifiedAt);
                    const list = (fresh.length ? fresh : items).map(i => `«${esc(i.title)}»`).join(', ');
                    const first = String(items[0]?.name || '').trim().split(/\s+/)[0];
                    // текст админа может содержать <b>/<i>; имя и названия экранируем
                    return template.replace(/\[имя\]/g, esc(first || 'друг')).replace(/\[(ачивки|значки)\]/g, list);
                };
                if (body.test) {
                    const sample = ids.find(id => byUser[id]) || ids[0];
                    const ok = await sendBot(user.id, compose(sample, byUser[sample] || [{ title: 'пример значка', name: 'друг' }]), botToken);
                    return res.status(200).json({ sent: ok ? 1 : 0, total: 1, test: true });
                }
                let sent = 0;
                const failed = [];
                for (const id of ids) {
                    const items = byUser[id];
                    if (!items?.length) { failed.push(id); continue; }
                    const ok = await sendBot(id, compose(id, items), botToken);
                    if (!ok) { failed.push(id); continue; }
                    sent++;
                    const now = Date.now();
                    await patch(`achievementNotices/${id}`, token, Object.fromEntries(items.map(i => [i.id, now]))).catch(() => {});
                    await new Promise(r => setTimeout(r, 60)); // лимиты Telegram
                }
                return res.status(200).json({ sent, total: ids.length, failed });
            }
            if (!['list', 'roster', 'get', 'save', 'set_medal', 'collection', 'seen', 'attendance', 'notify_list', 'notify_send', 'claim', 'holders'].includes(body.action)) throw fail(400, 'неизвестное действие');
            let targetIds;
            if (collection) {
                targetIds = body.userIds || [String(user.id)];
                if (!Array.isArray(targetIds) || !targetIds.length || targetIds.length > 200 || targetIds.some(id => typeof id !== 'string' || !UID.test(id))) throw fail(400, 'проверь участников');
                targetIds = [...new Set(targetIds)];
            }
            const hikeDate = body.action === 'roster' && body.hikeDate ? date(body.hikeDate) : '';
            if (['get', 'save', 'set_medal'].includes(body.action) && (typeof body.id !== 'string' || !UUID.test(body.id))) throw fail(400, 'неверный номер ачивки');
            let draft, medal;
            if (['save', 'set_medal'].includes(body.action)) {
                if (!revision(body.revision) || typeof body.requestId !== 'string' || !UUID.test(body.requestId)) throw fail(400, 'обнови редактор перед сохранением');
                if (body.action === 'save') {
                    draft = normalizeDraft(body.draft);
                    // готовая медаль из библиотеки приложения: ачивка выдаётся сразу при сохранении
                    if (body.medal) medal = normalizeMedal(body.medal);
                } else medal = normalizeMedal(body.medal);
            }
            const token = await accessToken();
            if (collection) {
                if (!isAdminUser(user) && targetIds.some(id => id !== String(user.id))) {
                    const [member, profile] = await Promise.all([read(`members/${user.id}`, token), read(`userProfiles/${user.id}`, token)]);
                    if (!member.value?.user_id || !profile.value) throw fail(403, 'профили доступны участникам клуба');
                }
                const own = targetIds.length === 1 && targetIds[0] === String(user.id);
                const [snapshot, seen, club, progress] = await Promise.all([read('clubAchievements', token),
                    own ? read(`achievementSeen/${user.id}`, token) : Promise.resolve({ value: {} }),
                    own ? fetcher(`${DB}/app_users.json?shallow=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) })
                        .then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
                    own ? hikeProgress(token, String(user.id)).catch(() => null) : Promise.resolve(null)]);
                // редкость: у скольких есть ачивка с таким названием (все записи вместе)
                const stats = {};
                if (own) Object.values(snapshot.value || {}).forEach(r => {
                    if (!r?.medal || r.publicationStatus !== 'published') return;
                    const k = titleKey(r.title);
                    Object.values(r.grants || {}).forEach(g => { if (g?.issuedAt) (stats[k] ||= new Set()).add(String(g.userId)); });
                });
                const clubSize = club && typeof club === 'object' ? Object.keys(club).length : 0;
                const collections = Object.fromEntries(targetIds.map(id => [id, []]));
                for (const record of Object.values(snapshot.value || {})) {
                    if (!record?.medal || record.publicationStatus !== 'published') continue;
                    for (const id of targetIds) {
                        const grant = record.grants?.[id];
                        if (!grant?.issuedAt) continue;
                        collections[id].push({ id: record.id, title: record.title, description: record.description || '', rarity: record.rarity, kind: record.kind,
                            ...(own ? { seenAt: Number(seen.value?.[record.id]) || null, holders: Object.values(record.grants || {}).filter(g => g?.issuedAt).length } : {}),
                            medal: { imageUrl: record.medal.imageUrl, ...(record.medal.modelUrl ? { modelUrl: record.medal.modelUrl } : {}) },
                            grant: { userId: id, name: grant.name, date: grant.date, issuedAt: grant.issuedAt } });
                    }
                }
                Object.values(collections).forEach(items => items.sort((a, b) => b.grant.issuedAt - a.grant.issuedAt));
                if (!own) return res.status(200).json({ collections });
                return res.status(200).json({ collections, progress, clubSize,
                    stats: Object.fromEntries(Object.entries(stats).map(([k, set]) => [k, set.size])) });
            }
            if (body.action === 'list') {
                const [snapshot, list, notices] = await Promise.all([read('clubAchievements', token), people(token), read('achievementNotices', token)]);
                const records = Object.values(snapshot.value || {}).filter(r => r && UUID.test(r.id || ''));
                const n = notices.value || {};
                const achievements = records.map(publicRecord).map(a => ({ ...a,
                    notified: Object.keys(a.grants || {}).filter(id => n[id]?.[a.id]).length }));
                return res.status(200).json({ achievements: achievements.sort((a, b) => b.createdAt - a.createdAt), people: list });
            }
            if (body.action === 'roster') return res.status(200).json({ people: await people(token, hikeDate), hikeDate });
            const current = await read(`clubAchievements/${body.id}`, token);
            const old = current.value;
            if (body.action === 'get') {
                if (!old) throw fail(404, 'ачивка не найдена');
                return res.status(200).json({ achievement: publicRecord(old), revision: current.revision });
            }
            const hash = crypto.createHash('sha256').update(JSON.stringify({ action: body.action, draft, medal })).digest('hex');
            // A retry after a lost response returns the same durable batch, not another award.
            if (old?.lastWrite?.id === body.requestId) {
                if (old.lastWrite.hash !== hash || old.lastWrite.by !== String(user.id)) throw fail(409, 'этот запрос уже использован');
                return res.status(200).json({ achievement: publicRecord(old), replayed: true });
            }
            if (body.revision !== current.revision) throw fail(409, 'ачивка уже изменена — обнови её перед сохранением');
            const now = Date.now();
            let record;
            if (body.action === 'set_medal') {
                if (!old) throw fail(404, 'сначала сохрани черновик ачивки');
                const recipients = plannedRecipients(old);
                record = { ...old, recipients, medal: { ...medal, attachedAt: now, attachedBy: String(user.id) },
                    publicationStatus: 'published', publishedAt: isPublished(old) ? old.publishedAt || old.medal.attachedAt : now,
                    grants: grantsFor(old, recipients, user.id, now) };
            } else {
                const known = new Set((await people(token, draft.hikeDate)).map(p => p.userId));
                const recipients = {};
                for (const p of draft.recipients) {
                    if (!known.has(p.userId) && !old?.recipients?.[p.userId]) throw fail(400, 'участник не найден — обнови список');
                    recipients[p.userId] = { ...p };
                }
                const changedDesign = old && ['title', 'rarity', 'kind'].some(key => old[key] !== draft[key]);
                record = { ...old, ...draft, recipients, id: body.id, medal: changedDesign ? null : old?.medal || null,
                    createdAt: old?.createdAt || now, createdBy: old?.createdBy || String(user.id) };
                const published = !!record.medal && isPublished(old);
                record.publicationStatus = published ? 'published' : 'draft';
                record.publishedAt = published ? old.publishedAt || old.medal.attachedAt : null;
                record.grants = published ? grantsFor(old, recipients, user.id, now) : {};
                if (medal) {
                    const keep = record.medal && record.medal.imageUrl === medal.imageUrl;
                    record.medal = keep ? record.medal : { ...medal, attachedAt: now, attachedBy: String(user.id) };
                    record.publicationStatus = 'published';
                    record.publishedAt = isPublished(old) ? old.publishedAt || old.medal.attachedAt : now;
                    record.grants = grantsFor(old, recipients, user.id, now);
                }
            }
            record.schemaVersion = 2;
            record.updatedAt = now;
            record.updatedBy = String(user.id);
            record.lastWrite = { id: body.requestId, hash, by: String(user.id) };
            record.history = [...(old?.history || []), { action: body.action, at: now, by: String(user.id),
                recipients: Object.keys(record.recipients).length }].slice(-30);
            await write(body.id, token, current.revision, record);
            return res.status(200).json({ achievement: publicRecord(record) });
        } catch (error) {
            if (!error.status) console.error('achievements: storage unavailable');
            return res.status(error.status || 502).json({ error: error.status ? error.message : 'нет связи с базой клуба — попробуй ещё раз' });
        }
    };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
