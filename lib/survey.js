// Опросы JTBD в приложении (js/ui/survey.js). Один вопрос на экране, ответы сохраняются сразу.
// Пока включён один сегмент – D («карта и ходят часто») и только тестовым людям (SURVEY_USERS).
// Firebase (читает и пишет только сервер, поэтому в Rules открывать ничего не нужно):
//   surveys/state/<id>           – { status: 'later'|'declined'|'done', until, done_at, segment }
//   surveys/answers/<сегмент>/<id>/<вопрос> – { a, skip, at }
//   surveys/consent/<id>         – { quote, talk, at } из финала Ф1 и Ф2
//   surveys/pending_badge/<id>   – значок за опрос ещё не нарисован: выдадим, когда он появится
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const DAY = 86400000;
const SURVEY_USERS = new Set(['163665735']); // @maxmolotov
const FORCE_SEGMENT = { 163665735: 'D' }; // для теста: Максу показываем D, даже если по данным он в другом сегменте
const BADGE_TITLE = 'поделился взглядом'; // легендарный значок за опрос

// пороги – в Firebase surveyConfig, чтобы менять без правки кода
const DEFAULTS = { dMinHikes: 3, dDays: 60, repeatDays: 60, laterDays: 3 };

const WHY = [
    'найти друзей в Ялте', 'познакомиться с интересными людьми', 'поговорить о важном, а не о погоде и работе',
    'выбраться в горы, которые давно хотелось увидеть', 'провести выходные не в одиночестве',
    'побыть в тишине и очистить голову', 'попробовать что-то новое', 'сменить круг общения',
    'познакомиться с кем-то для отношений', 'узнать, что за клуб такой',
];

const WHO = [
    { id: 'K1', type: 'single', title: 'как ты связан с Ялтой', options: ['переезд в Ялту был меньше года назад', 'переезд был больше года назад', 'я здесь всю жизнь', 'я здесь на сезон', 'я в гостях'] },
    { id: 'K2', type: 'multi', title: 'как у тебя было с горами до клуба', shuffle: true,
        options: ['до клуба не получалось выбраться', 'один, без компании', 'с друзьями', 'с экскурсиями и турами', 'с чатиками и открытыми группами', 'с другими клубами'] },
    { id: 'K3', type: 'single', title: 'как тебе попался клуб', shuffle: true, other: true,
        options: ['Threads', 'телеграм-канал', 'приложение знакомств', 'позвал друг или член клуба', 'встреча на тропе', 'поиск в интернете'] },
];

const FINAL = [
    { id: 'F1', type: 'single', title: 'можно ли использовать твои слова в постах без имени', options: ['да', 'только пересказом', 'нет'] },
    { id: 'F2', type: 'single', title: 'хотим послушать твою историю подробнее. найдётся двадцать минут на голосовой разговор в удобное время',
        options: ['да, напишите мне в телеграм', 'может быть позже', 'нет'] },
];

const SEGMENTS = {
    D: {
        letter: 'D',
        banner: { title: 'расскажи, зачем ты ходишь с нами', text: 'ответь на несколько вопросов – подарим легендарный значок «поделился взглядом»' },
        questions: [
            { id: 'D1', type: 'text', title: 'вспомни неделю перед покупкой карты. что тогда происходило и что помогло решиться' },
            { id: 'D2', type: 'multi', title: 'ради чего ты ходишь на хайки', shuffle: true, other: true, options: WHY },
            { id: 'D3', type: 'single', title: 'а если выбрать одно', from: 'D2', note: 'из тех, что ты отметил выше' },
            { id: 'D4', type: 'text', title: 'если бы клуба не было, чем были бы заняты твои выходные' },
            { id: 'D5', type: 'text', title: 'как ты объясняешь друзьям, что это за клуб. своими словами, как есть' },
            { id: 'D6', type: 'single', title: 'со сколькими людьми из клуба ты общаешься вне хайков', options: ['ни с кем', 'с одним или двумя', 'с тремя–пятью', 'больше чем с пятью'] },
            { id: 'D7', type: 'text', title: 'чего тебе в клубе не хватает' },
            ...WHO, ...FINAL,
        ],
    },
};

const allQuestions = seg => SEGMENTS[seg].questions;

async function rd(path, token) {
    const r = await fetch(`${DB}/${path}.json`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
}
async function wr(path, token, value, method = 'PUT') {
    const r = await fetch(`${DB}/${path}.json`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(value), signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) throw new Error(`write ${path} ${r.status}`);
}

const moscowToday = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

// D: есть карта и не меньше N хайков за последние M дней (по участию через приложение)
async function isSegmentD(uid, token, cfg) {
    const member = await rd(`members/${uid}`, token).catch(() => null);
    if (!member || !member.user_id) return false;
    const since = new Date(Date.now() + 3 * 3600000 - cfg.dDays * DAY).toISOString().slice(0, 10), today = moscowToday();
    const [parts, hikes] = await Promise.all([rd('hikeParticipants', token), rd('hikes', token)]);
    let n = 0;
    for (const [d, list] of Object.entries(parts || {})) {
        const h = hikes?.[d];
        if (d < since || d >= today || !h || !String(h.title || '').trim()) continue;
        if (list && list[uid]) n++;
    }
    return n >= cfg.dMinHikes;
}

async function segmentFor(uid, token, cfg) {
    if (FORCE_SEGMENT[uid]) return FORCE_SEGMENT[uid];
    if (await isSegmentD(uid, token, cfg).catch(() => false)) return 'D';
    return '';
}

// баннер + вопросы + уже данные ответы; null – показывать нечего
async function surveyFor(uid, token) {
    uid = String(uid);
    if (!SURVEY_USERS.has(uid)) return null;
    const cfg = { ...DEFAULTS, ...((await rd('surveys/config', token).catch(() => null)) || {}) };
    const st = (await rd(`surveys/state/${uid}`, token).catch(() => null)) || {};
    const now = Date.now();
    if (st.status === 'declined') return null;
    if (st.status === 'done' && now < Number(st.done_at || 0) + cfg.repeatDays * DAY) return null;
    if (st.status === 'later' && now < Number(st.until || 0)) return null;
    const segment = await segmentFor(uid, token, cfg);
    if (!segment || !SEGMENTS[segment]) return null;
    // повторный круг после 60 дней – ответы предыдущего круга не подставляем
    const answers = st.status === 'done' ? {} : ((await rd(`surveys/answers/${segment}/${uid}`, token).catch(() => null)) || {});
    const seg = SEGMENTS[segment];
    return { segment, banner: { ...seg.banner, resume: Object.keys(answers).length > 0 }, questions: seg.questions, answers };
}

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008]/g, '').trim().slice(0, n);

async function saveAnswer(uid, token, segment, qid, a, skip) {
    uid = String(uid);
    if (!SURVEY_USERS.has(uid) || !SEGMENTS[segment]) throw new Error('forbidden');
    const q = allQuestions(segment).find(x => x.id === qid);
    if (!q) throw new Error('bad question');
    let value = null;
    if (!skip) {
        if (q.type === 'text') value = clip(a, 2000);
        else if (q.type === 'single') value = clip(Array.isArray(a) ? a[0] : a, 300);
        else value = (Array.isArray(a) ? a : []).slice(0, 14).map(x => clip(x, 300)).filter(Boolean);
        if (!value || (Array.isArray(value) && !value.length)) skip = true;
    }
    const rec = skip ? { skip: true, at: Date.now() } : { a: value, at: Date.now() };
    await wr(`surveys/answers/${segment}/${uid}/${qid}`, token, rec);
    if (!skip && qid === 'F1') await wr(`surveys/consent/${uid}/quote`, token, value).catch(() => {});
    if (!skip && qid === 'F2') await wr(`surveys/consent/${uid}/talk`, token, value).catch(() => {});
    return { ok: true };
}

async function setState(uid, token, op, segment) {
    uid = String(uid);
    if (!SURVEY_USERS.has(uid)) throw new Error('forbidden');
    const cfg = { ...DEFAULTS, ...((await rd('surveys/config', token).catch(() => null)) || {}) };
    const now = Date.now();
    const rec = op === 'later' ? { status: 'later', until: now + cfg.laterDays * DAY, segment, at: now }
        : op === 'declined' ? { status: 'declined', segment, at: now }
        : op === 'done' ? { status: 'done', done_at: now, segment, at: now } : null;
    if (!rec) throw new Error('bad op');
    await wr(`surveys/state/${uid}`, token, rec);
    return rec;
}

// значок за опрос: опубликованная запись «голос клуба» с картинкой; пока её нет – ставим отметку «ждёт значка»
async function grantBadge(uid, name, token) {
    uid = String(uid);
    const all = (await rd('clubAchievements', token)) || {};
    const id = Object.entries(all).filter(([, a]) => a?.title === BADGE_TITLE && a.medal?.imageUrl && a.publicationStatus !== 'draft')[0]?.[0];
    if (!id) { await wr(`surveys/pending_badge/${uid}`, token, { at: Date.now() }); return { granted: false, reason: 'no-badge' }; }
    for (let attempt = 0; attempt < 3; attempt++) {
        const g = await fetch(`${DB}/clubAchievements/${id}.json`, { headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(8000) });
        const etag = g.headers.get('etag'); const rec = await g.json();
        if (rec.grants?.[uid]?.issuedAt) return { granted: false, reason: 'already' };
        const now = Date.now(), date = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
        const entry = { userId: uid, name: String(name || uid).slice(0, 100), date };
        rec.recipients = { ...(rec.recipients || {}), [uid]: entry };
        rec.grants = { ...(rec.grants || {}), [uid]: { ...entry, issuedAt: now, issuedBy: 'auto-survey' } };
        rec.updatedAt = now; rec.updatedBy = 'auto-survey';
        rec.history = [...(rec.history || []), { action: 'auto_survey', at: now, by: 'auto-survey', added: [uid] }];
        const w = await fetch(`${DB}/clubAchievements/${id}.json`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(rec), signal: AbortSignal.timeout(8000) });
        if (w.ok) { await wr(`surveys/pending_badge/${uid}`, token, null).catch(() => {}); return { granted: true, id }; }
        if (w.status !== 412 || attempt === 2) throw new Error(`badge ${w.status}`);
    }
}

module.exports = { surveyFor, saveAnswer, setState, grantBadge, SEGMENTS, DEFAULTS, BADGE_TITLE, SURVEY_USERS };
