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

function person(id, profile, member, participant) {
    if (!UID.test(id)) return null;
    const sources = [profile, member, participant].filter(object);
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
    return { title, rarity: input.rarity, kind: input.kind, hikeDate, date: awardDate, recipients };
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
        const [profiles, members, roster] = await Promise.all([
            read('userProfiles', token), read('members', token),
            hikeDate ? read(`hikeParticipants/${hikeDate}`, token) : Promise.resolve({ value: {} }),
        ]);
        const p = profiles.value || {}, m = members.value || {}, r = roster.value || {};
        const ids = new Set([...Object.keys(p), ...Object.keys(m), ...Object.keys(r)]);
        return [...ids].map(id => person(id, p[id], m[id], r[id])).filter(Boolean)
            .map(p => ({ ...p, registered: Object.hasOwn(r, p.userId) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
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
            if (!collection && !isAdminUser(user)) throw fail(403, 'только для администраторов');
            if (!['list', 'roster', 'get', 'save', 'set_medal', 'collection'].includes(body.action)) throw fail(400, 'неизвестное действие');
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
                if (body.action === 'save') draft = normalizeDraft(body.draft);
                else medal = normalizeMedal(body.medal);
            }
            const token = await accessToken();
            if (collection) {
                if (!isAdminUser(user) && targetIds.some(id => id !== String(user.id))) {
                    const [member, profile] = await Promise.all([read(`members/${user.id}`, token), read(`userProfiles/${user.id}`, token)]);
                    if (!member.value?.user_id || !profile.value) throw fail(403, 'профили доступны участникам клуба');
                }
                const snapshot = await read('clubAchievements', token);
                const collections = Object.fromEntries(targetIds.map(id => [id, []]));
                for (const record of Object.values(snapshot.value || {})) {
                    if (!record?.medal || record.publicationStatus !== 'published') continue;
                    for (const id of targetIds) {
                        const grant = record.grants?.[id];
                        if (!grant?.issuedAt) continue;
                        collections[id].push({ id: record.id, title: record.title, rarity: record.rarity, kind: record.kind,
                            medal: { imageUrl: record.medal.imageUrl, ...(record.medal.modelUrl ? { modelUrl: record.medal.modelUrl } : {}) },
                            grant: { userId: id, name: grant.name, date: grant.date, issuedAt: grant.issuedAt } });
                    }
                }
                Object.values(collections).forEach(items => items.sort((a, b) => b.grant.issuedAt - a.grant.issuedAt));
                return res.status(200).json({ collections });
            }
            if (body.action === 'list') {
                const [snapshot, list] = await Promise.all([read('clubAchievements', token), people(token)]);
                const records = Object.values(snapshot.value || {}).filter(r => r && UUID.test(r.id || ''));
                return res.status(200).json({ achievements: records.map(publicRecord).sort((a, b) => b.createdAt - a.createdAt), people: list });
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
