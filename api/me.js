// api/me.js – статус карты и записи человека одним запросом с нашего домена.
// Замеры 08–10.10: Firebase SDK качается быстро, а первое соединение телефона с базой
// (Google, Европа) занимает 3–6 с, у каждого пятого 10+ с. Сервер Vercel ходит в базу
// за доли секунды, поэтому главная узнаёт «карта есть / нет» почти сразу.
// Firebase в приложении остаётся – для живых обновлений и как запасной путь, если тут ошибка.
const { verifyInitData } = require('./tg-auth');
const { getAccessToken } = require('./club-content');
const { hikeCount } = require('../lib/hike-count');
const { circleFor } = require('../lib/circle');
const { notesFor } = require('../lib/mm-notes');
const { storiesFor, markView } = require('../lib/club-stories');
const survey = require('../lib/survey');
const hikeIntent = require('../lib/hike-intent');
const { latestCardPurchase } = require('../lib/card-payment');
// «твои связи»: владельцам карты – все связи, без карты – 5 самых близких; этим – всё (тест)
const CIRCLE_USERS = new Set(['maxmolotov']);
// саммари мастермайндов целиком – и без карты (по нику Telegram, пока не знаем числовой id)
const NOTES_FULL_USERNAMES = new Set(['tatyanamolotova']);

const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';

async function read(path, token) {
    const r = await fetch(`${DB}/${path}.json`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
}

// Личные ссылки «место сверх лимита», которые человек уже открывал (passlinks/<код>/opens/<id>),
// на ещё не прошедшие хайки: { 'YYYY-MM-DD': код }. Так пропуск работает на любом устройстве,
// а не только там, где открыли ссылку. Сбой здесь не мешает главному ответу.
async function passesFor(id, token) {
    try {
        const all = (await read('passlinks', token)) || {};
        const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); // МСК
        const out = {};
        Object.entries(all).forEach(([code, p]) => {
            if (p && p.opens && p.opens[id] && /^\d{4}-\d{2}-\d{2}$/.test(p.hike_date || '') && p.hike_date >= today) {
                out[p.hike_date] = code;
            }
        });
        return out;
    } catch (e) {
        console.error('me passes:', e.message);
        return {};
    }
}

// Предложение карты (логика – как activeCardOffer_ в Apps Script). С 22.10.2026 оно только одно –
// личное приглашение в близкий круг из админки «💳 продажа карты»: card_offers/<id> с kind 'circle',
// личной ценой (карта минус оплаченные билеты) и сроком. Автоматической спеццены после хайка больше нет.
const CARD_OFFERS_ENABLED = false;
const FULL_PRICE = 15000;
async function offerFor(id, token) {
    if (!CARD_OFFERS_ENABLED) return null;
    try {
        const o = await read(`card_offers/${id}`, token);
        if (!o || o.used_at || o.closed_at || o.kind !== 'circle' || !o.price) return null;
        if (!(Number(o.expires_at) * 1000 > Date.now())) return null;
        return { kind: 'circle', price: Number(o.price), full_price: FULL_PRICE, expires_at: Number(o.expires_at),
            tickets_count: o.tickets_count || 0, tickets_sum: o.tickets_sum || 0 };
    } catch (e) {
        console.error('me offer:', e.message);
        return null;
    }
}

const yes = v => v === true || v === 'yes' || v === 'true' || v === '1';
const moscowToday = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

// Запись (register) и отмена (unregister) одним атомарным обновлением базы.
// Записаться без оплаты может владелец карты, на городское событие и книжный клуб – любой (как и в приложении).
// Отмена: владельцу карты снимаем и отметку в userRegistrations; гостю оставляем – по ней видно, что билет уже был.
async function registration(action, user, date, res) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date', code: 'BAD_DATE' });
    const id = String(user.id);
    try {
        const token = await getAccessToken();
        const [hike, member] = await Promise.all([read(`hikes/${date}`, token), read(`members/${id}`, token)]);
        const isMember = !!(member && member.user_id);
        let patch;
        if (action === 'register') {
            if (!hike || !String(hike.title || '').trim()) return res.status(404).json({ error: 'no such event', code: 'NO_EVENT' });
            if (yes(hike.cancelled)) return res.status(409).json({ error: 'event cancelled', code: 'CANCELLED' });
            if (date < moscowToday()) return res.status(409).json({ error: 'registration closed', code: 'REGISTRATION_CLOSED' });
            if (!isMember && !yes(hike.city) && !yes(hike.book_club)) return res.status(403).json({ error: 'card required', code: 'CARD_REQUIRED' });
            patch = {
                [`hikeParticipants/${date}/${id}`]: { userId: user.id, name: user.first_name || '', photoUrl: user.photo_url || null, timestamp: { '.sv': 'timestamp' } },
                [`userRegistrations/${id}/${date}`]: true,
            };
        } else {
            patch = { [`hikeParticipants/${date}/${id}`]: null };
            if (isMember) patch[`userRegistrations/${id}/${date}`] = false;
        }
        const r = await fetch(`${DB}/.json`, {
            method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(patch), signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) throw new Error(`patch ${r.status}`);
        return res.status(200).json({ ok: true, date, registered: action === 'register', member: isMember });
    } catch (e) {
        console.error(`me ${action}:`, e.message);
        return res.status(502).json({ error: 'db unavailable' });
    }
}

async function cardPaymentReceipt(user, res) {
    const uid = String(user.id);
    const token = await getAccessToken();
    const member = await read(`members/${uid}`, token);
    if (!member?.user_id) return res.status(200).json({ show: false });
    const purchase = latestCardPurchase(await read('pending_payments', token), uid);
    if (!purchase) return res.status(200).json({ show: false });
    const [invoice, payment] = purchase;
    const url = `${DB}/cardPaymentReceipts/${uid}/${encodeURIComponent(invoice)}.json`;
    const headers = { Authorization: `Bearer ${token}` };
    const receipt = await fetch(url, { headers: { ...headers, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(6000) });
    if (!receipt.ok) throw new Error(`card receipt read ${receipt.status}`);
    if (await receipt.json()) return res.status(200).json({ show: false });
    const etag = receipt.headers.get('etag');
    if (!etag) throw new Error('card receipt missing ETag');
    const write = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': etag },
        signal: AbortSignal.timeout(6000),
        body: JSON.stringify({ claimedAt: Date.now() })
    });
    if (write.status === 412) return res.status(200).json({ show: false });
    if (!write.ok) throw new Error(`card receipt write ${write.status}`);
    return res.status(200).json({
        show: true, name: String(member.user_name || user.first_name || '').split(' ')[0],
        cardUrl: member.card_image_url || '', plan: payment.card_type === 'season' ? 'season' : 'permanent'
    });
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (['GET', 'HEAD'].includes(req.method) && req.query?.soloGpx !== undefined) return serveSoloGpx(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(503).json({ error: 'not configured' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const user = verifyInitData(String((body && body.initData) || ''), botToken);
    if (!user || !user.id) return res.status(401).json({ error: 'bad initData' });

    if (body.action === 'hike_intent') return hikeIntent(user, body, res);

    if (body?.action === 'soloRoutes' || body?.action === 'soloDownload') {
        const id = String(user.id);
        try {
            const token = await getAccessToken();
            const member = await read(`members/${id}`, token);
            if (!member?.user_id) return res.status(403).json({ error: 'card required' });
            if (body.action === 'soloRoutes' && body.cached === true) {
                return res.status(200).json({ cached: true });
            }

            const solo = require('../lib/solo-hiking');
            const catalog = solo.readCatalog(await read('routes', token));
            if (body.action === 'soloDownload') {
                const route = catalog.find(item => item.id === body.routeId);
                if (!route?.segments.length) return res.status(404).json({ error: 'track unavailable' });
                return res.status(200).json({ download: solo.downloadPath(route.id, botToken) });
            }
            const routes = catalog.map(route => ({
                ...solo.describe(route),
                download: route.segments.length ? solo.downloadPath(route.id, botToken) : null
            }));
            return res.status(200).json({ routes });
        } catch (error) {
            console.error('me solo routes:', error.message);
            return res.status(502).json({ error: 'routes unavailable' });
        }
    }

    if (body?.action === 'card_payment_receipt') {
        try {
            return await cardPaymentReceipt(user, res);
        } catch (e) {
            console.error('me card payment receipt:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    // лёгкая проверка статуса – для возврата из оплаты: только карта и записи, без подсчёта хайков
    if (body && body.action === 'status') {
        try {
            const id = String(user.id);
            const token = await getAccessToken();
            const [member, regs] = await Promise.all([read(`members/${id}`, token), read(`userRegistrations/${id}`, token)]);
            const active = !!(member && member.user_id);
            return res.status(200).json({ uid: id, card: { status: active ? 'active' : 'inactive', cardUrl: active ? member.card_image_url || '' : '' }, regs: regs || {} });
        } catch (e) {
            console.error('me status:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    // запись и отмена записи без оплаты (владельцы карты, городские события) – через сервер, а не напрямую
    // в Firebase из телефона: у части людей соединение с базой не поднимается, и запись молча терялась
    if (body && (body.action === 'register' || body.action === 'unregister')) {
        return registration(body.action, user, String(body.date || ''), res);
    }

    // саммари мастермайндов для читалки: владельцу карты – целиком, гостю – начало
    if (body && body.action === 'notes') {
        try {
            const token = await getAccessToken();
            const member = await read(`members/${user.id}`, token).catch(() => null);
            const full = !!member?.user_id || NOTES_FULL_USERNAMES.has(String(user.username || '').toLowerCase());
            return res.status(200).json({ notes: await notesFor(token, full) });
        } catch (e) {
            console.error('me notes:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    // журнал действий для админки «активность» (12.11): приложение шлёт пачки событий, сервер пишет activity/<день>/<ключ>
    if (body && body.action === 'events') {
        try {
            const list = Array.isArray(body.events) ? body.events.slice(0, 60) : [];
            if (!list.length) return res.status(200).json({ ok: true, n: 0 });
            const token = await getAccessToken();
            const now = Date.now();
            const patch = {};
            list.forEach((e, i) => {
                const t = Math.min(now, Math.max(now - 3600000, Number(e?.t) || now));
                const day = new Date(t + 3 * 3600000).toISOString().slice(0, 10);
                const key = `${t.toString(36)}${i.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
                patch[`${day}/${key}`] = {
                    t, uid: String(user.id), n: String([user.first_name, user.last_name].filter(Boolean).join(' ')).slice(0, 60),
                    u: String(user.username || '').slice(0, 40), a: String(e?.a || '').slice(0, 160), g: e?.g ? 1 : 0,
                };
            });
            const r = await fetch(`${DB}/activity.json`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(patch), signal: AbortSignal.timeout(6000) });
            // раз в сутки на экземпляр – чистим дни старше 45
            if (!global.__actPruned || now - global.__actPruned > 86400000) {
                global.__actPruned = now;
                fetch(`${DB}/activity.json?shallow=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) })
                    .then(x => x.json()).then(days => {
                        const cut = new Date(now - 45 * 86400000).toISOString().slice(0, 10);
                        const old = Object.keys(days || {}).filter(d => d < cut);
                        if (old.length) return fetch(`${DB}/activity.json`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(old.map(d => [d, null]))) });
                    }).catch(() => {});
            }
            return res.status(200).json({ ok: r.ok, n: list.length });
        } catch (e) {
            console.error('me events:', e.message);
            return res.status(200).json({ ok: false });
        }
    }
    // 16.11: члены клуба без профиля интеллигента – пунктирные карточки во вкладке «Интеллигенты» и «предложить создать профиль».
    // profileNudges/<кому>/<от кого> = { name, at }; человек видит в приложении «… предлагает тебе создать профиль»
    if (body && ['profile_people', 'profile_nudge', 'profile_nudges', 'profile_nudge_seen'].includes(body.action)) {
        try {
            const token = await getAccessToken(), uid = String(user.id);
            const req = (path, method, data) => fetch(`${DB}/${path}.json`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(6000) });
            if (body.action === 'profile_people') {
                const [members, profs, mine] = await Promise.all([read('members', token), read('userProfiles', token), read(`profileNudgesSent/${uid}`, token)]);
                const has = new Set(Object.entries(profs || {}).map(([id, p]) => String(p?.userId || id)));
                const missing = Object.values(members || {}).filter(m => m && m.user_id && String(m.user_id) !== uid && !has.has(String(m.user_id)))
                    .map(m => ({ id: String(m.user_id), name: String(m.user_name || '').trim().slice(0, 40) })).filter(m => m.name);
                return res.status(200).json({ missing, nudged: Object.keys(mine || {}) });
            }
            if (body.action === 'profile_nudge') {
                const to = String(body.to || '');
                if (!/^\d+$/.test(to) || to === uid) return res.status(400).json({ error: 'bad user' });
                const [member, prof] = await Promise.all([read(`members/${to}`, token), read(`userProfiles/${to}`, token)]);
                if (!member?.user_id || prof) return res.status(200).json({ ok: false });
                const name = String(user.first_name || user.username || 'участник клуба').slice(0, 40), at = Date.now();
                await Promise.all([req(`profileNudges/${to}/${uid}`, 'PUT', { name, at }), req(`profileNudgesSent/${uid}/${to}`, 'PUT', at)]);
                return res.status(200).json({ ok: true });
            }
            if (body.action === 'profile_nudges') {
                const [list, prof] = await Promise.all([read(`profileNudges/${uid}`, token), read(`userProfiles/${uid}`, token)]);
                const items = prof ? [] : Object.values(list || {}).filter(x => x && x.name).sort((a, b) => b.at - a.at);
                return res.status(200).json({ names: items.map(x => x.name), last: items[0]?.at || 0 });
            }
            await req(`profileNudges/${uid}`, 'DELETE');
            return res.status(200).json({ ok: true });
        } catch (e) {
            console.error('me profile:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }
    // значок за полную сессию: запись clubAchievements (создана 15.11, картинка /assets/achievements/badges/hof-session.png)
    // 17.11: один значок с хайковым «дыхание по Хофу»: множитель = хайки (hikeN) + полные сессии в приложении (sessionN)
    const HOF_BADGE_ID = 'a30b6efc-346b-4f50-8c8c-f4bd34d1d183';
    // дыхание по Виму Хофу: hof/<uid>/<ключ-время> = { t, rounds, holds:[сек], done }
    if (body && body.action === 'hof') {
        try {
            const token = await getAccessToken();
            const uid = String(user.id);
            if (body.op === 'save') {
                const holds = (Array.isArray(body.holds) ? body.holds : []).slice(0, 8).map(x => Math.max(0, Math.min(900, Math.round(Number(x) || 0))));
                const mode = ['guided', 'personal'].includes(body.mode) ? body.mode : 'legacy';
                const rec = { t: Date.now(), mode, rounds: Math.max(0, Math.min(8, Number(body.rounds) || holds.length)), holds: mode === 'guided' ? [] : holds, done: !!body.done,
                    duration: Math.max(0, Math.min(86400, Math.round(Number(body.duration) || 0))) };
                await fetch(`${DB}/hof/${uid}/${rec.t.toString(36)}.json`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(rec), signal: AbortSignal.timeout(6000) });
            }
            const r = await fetch(`${DB}/hof/${uid}.json?orderBy="$key"&limitToLast=400`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
            const data = r.ok ? (await r.json()) || {} : {};
            const sessions = Object.values(data).sort((a, b) => a.t - b.t);
            // значок «три раунда по Хофу» (15.11): за каждую полную сессию – множитель = число полных сессий
            let badge = null;
            if (body.op === 'save' && body.done && (Number(body.rounds) || 0) >= 3) {
                try {
                    const sessionN = sessions.filter(x => x && x.done && (x.rounds || 0) >= 3).length;
                    const now = Date.now(), day = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
                    const name = String([user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || uid).slice(0, 100);
                    const ex = await read(`clubAchievements/${HOF_BADGE_ID}/grants/${uid}`, token).catch(() => null);
                    const hikeN = Number(ex?.hikeN) || (ex ? 1 : 0), count = hikeN + sessionN;
                    const grant = { ...(ex || {}), userId: uid, name: ex?.name || name, date: ex?.date || day, issuedAt: ex?.issuedAt || now, issuedBy: ex?.issuedBy || 'auto-hof', hikeN, sessionN, count, notificationAt: now };
                    const w = await fetch(`${DB}/clubAchievements/${HOF_BADGE_ID}.json`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ [`grants/${uid}`]: grant, [`recipients/${uid}`]: { userId: uid, name, date: day }, updatedAt: now, updatedBy: 'auto-hof' }), signal: AbortSignal.timeout(6000) });
                    if (w.ok) badge = { id: HOF_BADGE_ID, count };
                } catch (e) { console.error('me hof badge:', e.message); }
            }
            return res.status(200).json({ sessions, badge });
        } catch (e) {
            console.error('me hof:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }
    // лента «активность» для админки: только организаторы; since – отдавать события новее этой метки
    if (body && body.action === 'activity') {
        if (!['163665735', '7845375334'].includes(String(user.id))) return res.status(403).json({ error: 'forbidden' });
        try {
            const token = await getAccessToken();
            const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day || '')) ? body.day : new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
            // ключи событий начинаются с времени в base36 (одинаковой длины) – сортировка по ключу = по времени, индекс не нужен
            const since = /^[0-9a-z]{6,20}$/.test(String(body.since || '')) ? String(body.since) : '';
            const q = since ? `orderBy="$key"&startAt="${since}"` : `orderBy="$key"&limitToLast=400`;
            const r = await fetch(`${DB}/activity/${day}.json?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
            const data = r.ok ? (await r.json()) || {} : {};
            const events = Object.entries(data).filter(([k, v]) => v && k !== since).map(([k, v]) => ({ ...v, k })).sort((a, b) => (a.k < b.k ? -1 : 1));
            return res.status(200).json({ day, events, ok: r.ok, err: r.ok ? '' : r.status });
        } catch (e) {
            console.error('me activity:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    // кнопки под постом канала: правка через бота (менять кнопку может только бот, который выложил пост)
    if (body && body.action === 'post_button') {
        if (!['163665735', '7845375334'].includes(String(user.id))) return res.status(403).json({ error: 'forbidden' });
        const m = String(body.link || '').trim().match(/t\.me\/([A-Za-z0-9_]{4,})\/(\d+)/);
        if (!m) return res.status(400).json({ error: 'нужна ссылка вида t.me/канал/123' });
        const key = `${m[1]}_${m[2]}`;
        try {
            const token = await getAccessToken();
            if (body.op === 'load') {
                const r = await fetch(`${DB}/channelPosts/${key}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) });
                return res.status(200).json({ saved: r.ok ? await r.json() : null });
            }
            const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 8).map(row => (Array.isArray(row) ? row : []).slice(0, 4)
                .map(b => ({ text: String(b && b.text || '').trim().slice(0, 64), url: String(b && b.url || '').trim() }))
                .filter(b => b.text && /^(https?:\/\/|tg:\/\/)/.test(b.url))).filter(row => row.length);
            const tgr = await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
                body: JSON.stringify({ chat_id: '@' + m[1], message_id: Number(m[2]), reply_markup: { inline_keyboard: rows } })
            });
            const tj = await tgr.json().catch(() => ({}));
            const same = !tj.ok && /not modified/i.test(tj.description || '');
            if (tj.ok || same) {
                await fetch(`${DB}/channelPosts/${key}.json`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows, at: Date.now(), by: String(user.id) }), signal: AbortSignal.timeout(6000) }).catch(() => {});
            }
            return res.status(200).json({ ok: tj.ok || same, same, error: tj.ok || same ? '' : (tj.description || 'telegram error') });
        } catch (e) {
            console.error('me post_button:', e.message);
            return res.status(502).json({ error: 'сервер не ответил' });
        }
    }

    // сторис клуба на главной (lib/club-stories.js)
    if (body && (body.action === 'stories' || body.action === 'story_view')) {
        try {
            const token = await getAccessToken();
            if (body.action === 'story_view') { await markView(token, String(body.id || ''), String(user.id)); return res.status(200).json({ ok: true }); }
            return res.status(200).json({ stories: await storiesFor(token, String(user.id), { all: !!body.all }) });
        } catch (e) {
            console.error('me stories:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    // опросы JTBD (lib/survey.js): баннер и вопросы, ответы по одному, «позже / отказаться / готово»
    if (body && /^survey/.test(String(body.action || ''))) {
        try {
            const token = await getAccessToken();
            const uid = String(user.id), a = body.action;
            if (a === 'survey') return res.status(200).json({ survey: await survey.surveyFor(uid, token, String(body.preview || '').toUpperCase().slice(0, 1)) });
            if (a === 'survey_answer') return res.status(200).json(await survey.saveAnswer(uid, token, String(body.segment || ''), String(body.q || ''), body.a, !!body.skip));
            if (a === 'survey_state') { await survey.setState(uid, token, String(body.op || ''), String(body.segment || '')); return res.status(200).json({ ok: true }); }
            if (a === 'survey_finish') {
                await survey.setState(uid, token, 'done', String(body.segment || ''));
                await survey.archiveRun(uid, token, String(body.segment || '')).catch(e => console.error('survey archive:', e.message));
                const member = await read(`members/${uid}`, token).catch(() => null);
                const badge = await survey.grantBadge(uid, String(member?.user_name || user.first_name || uid), token).catch(e => { console.error('survey badge:', e.message); return { granted: false }; });
                return res.status(200).json({ ok: true, badge: !!badge.granted });
            }
            return res.status(400).json({ error: 'bad action' });
        } catch (e) {
            console.error('me survey:', e.message);
            return res.status(e.message === 'forbidden' ? 403 : 502).json({ error: e.message === 'forbidden' ? 'forbidden' : 'db unavailable' });
        }
    }

    // экран «карта твоя» с привилегиями – один раз новому владельцу карты (js/ui/card-welcome.js).
    // Новый = оплатил карту за последние 30 дней. Показ отмечается в cardWelcome/<id>, старым владельцам –
    // отметка skip при первой проверке, чтобы больше не читать список оплат.
    if (body && (body.action === 'card_welcome' || body.action === 'card_welcome_seen')) {
        try {
            const id = String(user.id);
            const token = await getAccessToken();
            const put = v => fetch(`${DB}/cardWelcome/${id}.json`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(v), signal: AbortSignal.timeout(6000) });
            if (body.action === 'card_welcome_seen') { await put({ seen_at: Date.now() }); return res.status(200).json({ ok: true }); }
            const [member, mark] = await Promise.all([read(`members/${id}`, token), read(`cardWelcome/${id}`, token)]);
            if (!member?.user_id || mark) return res.status(200).json({ show: false });
            // карта оплачена, но картинку Макс ещё не добавил – экран и значок ждут её (клиент спросит снова)
            if (!String(member.card_image_url || '').trim()) return res.status(200).json({ show: false, wait: true });
            const pays = (await read('pending_payments', token)) || {};
            const since = Date.now() / 1000 - 60 * 86400;
            const paid = Object.values(pays).filter(p => p && String(p.user_id) === id && p.completed && Number(p.ts) > since
                && ['permanent', 'season', 'offer'].includes(p.card_type)).sort((a, b) => b.ts - a.ts)[0];
            if (!paid) { await put({ skip: Date.now() }); return res.status(200).json({ show: false }); }
            const hikes = await hikeCount(id, token, { member }).catch(() => Number(member.hikes_count) || 0);
            return res.status(200).json({ show: true, name: String(member.user_name || '').split(' ')[0] || user.first_name || '',
                cardUrl: member.card_image_url || '', plan: paid.card_type === 'season' ? 'season' : 'permanent', hikes });
        } catch (e) {
            console.error('me card_welcome:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    // экономия по карте у «Жить здорово» (блок в привилегиях): журнал скидок (касса и сайт) + заказы хайкинг боксов.
    // Суммы в копейках. Заказ бокса, уже подтверждённый в журнале (ссылка wc<номер>), второй раз не считаем
    if (body && body.action === 'food_savings') {
        try {
            const token = await getAccessToken();
            const uid = String(user.id);
            const [card, orders] = await Promise.all([
                read(`dietcakesLoyalty/cards/${uid}`, token).catch(() => null),
                read('dcHikeOrders', token).catch(() => null),
            ]);
            let saved = 0;
            const refs = new Set();
            for (const m of Object.values(card?.months || {})) for (const op of Object.values(m?.operations || {})) {
                if (!op || op.state !== 'confirmed' || !op.quote) continue;
                const d = Number(op.quote.discount) || 0, g = Number(op.gross) || 0, back = Number(op.refundedGross) || 0;
                saved += (g ? d * Math.max(0, 1 - back / g) : d) / 100;
                if (op.reference) refs.add(String(op.reference));
            }
            for (const day of Object.values(orders || {})) for (const [num, o] of Object.entries(day || {})) {
                if (!o || o.status !== 'paid' || String(o.tg) !== uid || o.request === 'cancel') continue;
                if (refs.has('wc' + num) || refs.has(String(num))) continue;
                saved += (Number(o.card_discount) || 0) / 100; // копейки
            }
            return res.status(200).json({ saved: Math.round(saved) });
        } catch (e) {
            console.error('me food_savings:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    // «твои связи»: люди с общих хайков и связи между ними (lib/circle.js)
    if (body && body.action === 'circle') {
        try {
            const token = await getAccessToken();
            const full = CIRCLE_USERS.has(String(user.username || '').toLowerCase())
                || !!(await read(`members/${user.id}`, token).catch(() => null))?.user_id;
            const c = await circleFor(user.id, token);
            if (full) return res.status(200).json(c);
            // без карты: открыты люди с первого хайка; остальные знакомые и весь клуб – «?» без имён (их не отдаём)
            const open = new Set(c.firstIds);
            const opened = c.people.filter(p => open.has(p.id));
            const known = c.people.filter(p => !open.has(p.id)).map((p, i) => ({ id: 'k' + i, hidden: true, known: true, n: p.n }));
            const { firstIds, ...rest } = c;
            return res.status(200).json({
                ...rest, locked: true, open: opened.length, known: known.length,
                people: [...opened, ...known],
                links: c.links.filter(([a, b]) => open.has(a) && open.has(b)),
            });
        } catch (e) {
            console.error('me circle:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
        }
    }

    try {
        const id = String(user.id);
        const token = await getAccessToken();
        const regsP = read(`userRegistrations/${id}`, token);
        const [member, regs, passes, offer] = await Promise.all([
            read(`members/${id}`, token),
            regsP,
            passesFor(id, token),
            offerFor(id, token),
        ]);
        // тот же вид, что отдаёт loadUserData() в js/firebase.js
        // пройдено хайков – и с картой, и без: история до приложения + хайки через приложение
        const hikes = await hikeCount(id, token, { member }).catch(() => Number(member?.hikes_count) || 0);
        const card = member && member.user_id
            ? { status: 'active', hikes, cardUrl: member.card_image_url || '' }
            : { status: 'inactive', hikes, cardUrl: '' };
        return res.status(200).json({ uid: id, card, regs: regs || {}, passes, offer: card.status === 'active' ? null : offer });
    } catch (e) {
        console.error('me:', e.message);
        return res.status(502).json({ error: 'db unavailable' });
    }
};
