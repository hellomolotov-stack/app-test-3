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
// «твои связи»: владельцам карты – все связи, без карты – 5 самых близких; этим – всё (тест)
const CIRCLE_USERS = new Set(['maxmolotov']);

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
const FULL_PRICE = 7500;
async function offerFor(id, token) {
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

// значок «владелец карты интеллигента» – вместе с экраном «карта твоя» (когда у карты появилась картинка).
// Записей с этим названием бывает несколько – берём ту, у которой больше всего получателей.
async function grantCardOwnerBadge(uid, name, token) {
    const TITLE = 'владелец карты интеллигента';
    const all = (await read('clubAchievements', token)) || {};
    const list = Object.entries(all).filter(([, r]) => r?.title === TITLE && r.publicationStatus !== 'draft');
    if (list.some(([, r]) => r.grants?.[uid]?.issuedAt)) return;
    const id = list.sort((a, b) => Object.keys(b[1].grants || {}).length - Object.keys(a[1].grants || {}).length)[0]?.[0];
    if (!id) return;
    const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(`${DB}/clubAchievements/${id}.json`, { headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(6000) });
        const etag = r.headers.get('etag'); const rec = await r.json();
        if (rec?.grants?.[uid]?.issuedAt) return;
        const now = Date.now(), entry = { userId: uid, name: name.slice(0, 100), date: day };
        rec.recipients = { ...(rec.recipients || {}), [uid]: entry };
        rec.grants = { ...(rec.grants || {}), [uid]: { ...entry, issuedAt: now, issuedBy: 'auto-card' } };
        rec.updatedAt = now; rec.updatedBy = 'auto-card';
        rec.history = [...(rec.history || []), { action: 'auto_card', at: now, by: 'auto-card', added: [uid] }];
        const w = await fetch(`${DB}/clubAchievements/${id}.json`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(rec), signal: AbortSignal.timeout(6000) });
        if (w.ok || w.status !== 412) return;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(503).json({ error: 'not configured' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const user = verifyInitData(String((body && body.initData) || ''), botToken);
    if (!user || !user.id) return res.status(401).json({ error: 'bad initData' });

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
            return res.status(200).json({ notes: await notesFor(token, !!member?.user_id) });
        } catch (e) {
            console.error('me notes:', e.message);
            return res.status(502).json({ error: 'db unavailable' });
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
            await grantCardOwnerBadge(id, String(member.user_name || user.first_name || id), token).catch(e => console.error('card badge:', e.message));
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
