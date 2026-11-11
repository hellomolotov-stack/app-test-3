// Опросы JTBD в приложении (js/ui/survey.js). Один вопрос на экране, ответы сохраняются сразу.
// Сегменты A–F по документу «Опросы JTBD»; показываем всем, у кого определился сегмент (выключатель – surveys/config/enabled).
// Firebase (читает и пишет только сервер, поэтому в Rules открывать ничего не нужно):
//   surveys/state/<id>           – { status: 'later'|'declined'|'done', until, done_at, segment }
//   surveys/answers/<сегмент>/<id>/<вопрос> – { a, skip, at }
//   surveys/consent/<id>         – { quote, talk, at } из финала Ф1 и Ф2
//   surveys/pending_badge/<id>   – значок за опрос ещё не нарисован: выдадим, когда он появится
const DB = 'https://hiking-club-app-b6c7c-default-rtdb.europe-west1.firebasedatabase.app';
const DAY = 86400000;
const SURVEY_USERS = new Set(['163665735', '7845375334']); // @maxmolotov, @hellointelligent
// тестовые аккаунты (Макс и @hellointelligent): опрос и баннер включены всегда (мимо «позже / отказаться / прошёл»),
// их ответы помечены test и не попадают в статистику
const TEST_USERS = new Set(['7845375334', '163665735']);
const FORCE_SEGMENT = { 163665735: 'D', 7845375334: 'D' }; // у тестовых по умолчанию D, остальные – ссылкой startapp=survey_X // для теста: Максу показываем D, даже если по данным он в другом сегменте
const BADGE_TITLE = 'поделился взглядом'; // легендарный значок за опрос

// пороги – в Firebase surveyConfig, чтобы менять без правки кода
const DEFAULTS = { dMinHikes: 3, dDays: 60, eDays: 45, bDays: 30, repeatDays: 60, laterDays: 3 };

const WHY = [
    'найти друзей в Ялте', 'познакомиться с интересными людьми', 'поговорить о важном, а не о погоде и работе',
    'выбраться в горы, которые давно хотелось увидеть', 'провести выходные не в одиночестве',
    'побыть в тишине и очистить голову', 'попробовать что-то новое', 'сменить круг общения',
    'познакомиться с кем-то для отношений', 'узнать, что за клуб такой',
];

const K1 = { id: 'K1', type: 'single', title: 'как ты связан с Ялтой?', options: ['переезд в Ялту был меньше года назад', 'переезд был больше года назад', 'я здесь всю жизнь', 'я здесь на сезон', 'я в гостях'] };
const K2 = { id: 'K2', type: 'multi', title: 'как у тебя было с горами до клуба?', shuffle: true,
    options: ['до клуба не получалось выбраться', 'один, без компании', 'с друзьями', 'с экскурсиями и турами', 'с чатиками и открытыми группами', 'с другими клубами'] };
const K3 = { id: 'K3', type: 'single', title: 'как тебе попался клуб?', shuffle: true, other: true,
    options: ['Threads', 'телеграм-канал', 'приложение знакомств', 'позвал друг или член клуба', 'встреча на тропе', 'поиск в интернете'] };
const WHO = [K1, K2, K3];

const FINAL = [
    { id: 'F1', type: 'single', title: 'можно ли использовать твои слова в постах без имени?', options: ['да', 'только пересказом', 'нет'] },
    { id: 'F2', type: 'single', title: 'хотим послушать твою историю подробнее: найдётся двадцать минут на голосовой разговор в удобное время?',
        options: ['да, напишите мне в телеграм', 'может быть позже', 'нет'] },
];


// id вопросов: буква сегмента + номер (в сегменте F вопросы называются FA1…, чтобы не пересекаться с финалом F1/F2)
const SEGMENTS = {
    A: {
        banner: { title: 'хочется тебя узнать', text: 'расскажи, чего не хватило в приложении, чтобы записаться на хайк. пара минут – и легендарный значок твой' },
        questions: [
            { id: 'A1', type: 'multi', title: 'что хотелось найти в приложении?', shuffle: true, other: true,
                options: ['узнать, что это за клуб', 'посмотреть, кто туда ходит', 'найти ближайший хайк', 'выбрать маршрут', 'посмотреть цену', 'просто любопытно'] },
            { id: 'A2', type: 'multi', title: 'что остановило тебя от записи?', shuffle: true, other: true,
                options: ['непонятно, что за люди ходят', 'страшно идти к незнакомым', 'казалось, что я не подойду по уровню', 'не подошла дата или время', 'не подошёл маршрут', 'цена', 'непонятно, как записаться', 'хочу сначала понаблюдать'] },
            { id: 'A3', type: 'text', title: 'что должно было быть на экране, чтобы запись состоялась?' },
            K1, ...FINAL,
        ],
    },
    B: {
        banner: { title: 'с тобой был классный хайк', text: 'хотим понять, чего не хватило, чтобы вернуться. расскажи честно – подарим за это легендарный значок' },
        questions: [
            { id: 'B1', type: 'text', title: 'вспомни день перед первым хайком: какие были ожидания?' },
            { id: 'B2', type: 'text', title: 'что оказалось не так, как ожидалось?' },
            { id: 'B3', type: 'single', title: 'остались ли связи с кем-то из группы?', options: ['да, с несколькими', 'с одним человеком', 'нет'] },
            { id: 'B4', type: 'single', title: 'какая фраза ближе всего к тому, что думалось после хайка?', shuffle: true, other: true,
                options: ['было здорово, но это не моё', 'хорошо, но не нашёлся повод пойти снова', 'люди приятные, но продолжения не случилось', 'было слишком шумно или многолюдно', 'было слишком тихо или слишком серьёзно', 'физически оказалось тяжело', 'не нашлось здесь своих', 'хочу снова, жду подходящего хайка'] },
            { id: 'B5', type: 'text', title: 'что должно было случиться после хайка, чтобы захотелось прийти снова?' },
            ...WHO, ...FINAL,
        ],
    },
    C: {
        banner: { title: 'ты уже часть наших хайков', text: 'ты ходишь с нами и без карты. расскажи, что для тебя главное, – подарим легендарный значок' },
        questions: [
            { id: 'C1', type: 'text', title: 'как ты объяснишь другу, что тебе дают хайки?' },
            { id: 'C2', type: 'multi', title: 'ради чего ты идёшь на очередной хайк?', shuffle: true, other: true, options: WHY },
            { id: 'C3', type: 'multi', title: 'что мешает взять карту?', shuffle: true, other: true,
                options: ['пока не ясно, буду ли ходить регулярно', 'разовый билет удобнее', 'цена', 'непонятно, что даёт карта', 'жду, когда понадобится', 'и так хожу с теми, кого уже знаю'] },
            { id: 'C4', type: 'text', title: 'что должно случиться, чтобы захотелось взять карту?' },
            { id: 'C5', type: 'single', title: 'видишься ли ты с кем-то из клуба вне хайков?', options: ['да, регулярно', 'пару раз было', 'нет'] },
            ...WHO, ...FINAL,
        ],
    },
    D: {
        banner: { title: 'рады, что ты с нами', text: 'ты ходишь часто, и нам важно понять, ради чего. ответь на несколько вопросов – подарим легендарный значок' },
        questions: [
            { id: 'D1', type: 'text', title: 'вспомни неделю перед покупкой карты: что тогда происходило и что помогло решиться?' },
            { id: 'D2', type: 'multi', title: 'ради чего ты ходишь на хайки?', shuffle: true, other: true, options: WHY },
            { id: 'D3', type: 'single', title: 'а если выбрать одно?', from: 'D2', note: 'из тех, что отмечены выше' },
            { id: 'D4', type: 'text', title: 'если бы клуба не было, чем были бы заняты твои выходные?' },
            { id: 'D5', type: 'text', title: 'как ты объясняешь друзьям, что это за клуб – своими словами, как есть?' },
            { id: 'D6', type: 'single', title: 'со сколькими людьми из клуба ты общаешься вне хайков?', options: ['ни с кем', 'с одним или двумя', 'с тремя–пятью', 'больше чем с пятью'] },
            { id: 'D7', type: 'text', title: 'чего тебе в клубе не хватает?' },
            ...WHO, ...FINAL,
        ],
    },
    E: {
        banner: { title: 'мы по тебе соскучились', text: 'карта есть, а на тропе тебя давно не видно. расскажи, что мешает, – подарим легендарный значок' },
        questions: [
            { id: 'E1', type: 'text', title: 'что хотелось получить от клуба в момент покупки карты?' },
            { id: 'E2', type: 'multi', title: 'что пошло не так?', shuffle: true, other: true,
                options: ['не хватило времени', 'не совпали даты', 'не подошли маршруты', 'не нашлось здесь своих', 'одному к незнакомым ходить неловко', 'не хватало напоминаний и приглашений', 'поменялась жизнь'] },
            { id: 'E3', type: 'text', title: 'что вернуло бы тебя на тропу?' },
            ...WHO, ...FINAL,
        ],
    },
    F: {
        banner: { title: 'мы ждали тебя на хайке', text: 'у тебя была запись на хайк, но не вышло. расскажи, что случилось, – подарим легендарный значок' },
        questions: [
            { id: 'FA1', type: 'single', title: 'что случилось в день хайка?', shuffle: true, other: true,
                options: ['поменялись планы', 'погода', 'в последний момент передумалось', 'не хватило смелости', 'не подошло время сбора', 'забылось', 'самочувствие или форс-мажор'] },
            { id: 'FA2', type: 'text', title: 'какое было настроение накануне хайка?' },
            { id: 'FA3', type: 'text', title: 'что помогло бы тебе прийти?' },
            K1, ...FINAL,
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

// данные для определения сегмента: общие для всех (5 минут на экземпляр функции)
let shared = null;
async function sharedData(token) {
    if (shared && Date.now() - shared.at < 5 * 60000) return shared;
    const [parts, hikes, ns] = await Promise.all([rd('hikeParticipants', token), rd('hikes', token), rd('noShows', token).catch(() => null)]);
    shared = { at: Date.now(), parts: parts || {}, hikes: hikes || {}, ns: ns || {} };
    return shared;
}
const real = h => h && String(h.title || '').trim() && h.cancelled !== true && h.city !== true && h.book_club !== true;

// порядок E, D, C, B, F, A. Данные: оплаченная карта, хайки через приложение (участник, дата прошла, не «не пришёл»),
// хайки до приложения (hikeHistory.before, без дат), записи (userRegistrations), открытия приложения (app_users)
async function detectSegment(uid, token, cfg) {
    const { parts, hikes, ns } = await sharedData(token);
    const [member, history, regs, appUser] = await Promise.all([
        rd(`members/${uid}`, token).catch(() => null), rd(`hikeHistory/${uid}`, token).catch(() => null),
        rd(`userRegistrations/${uid}`, token).catch(() => null), rd(`app_users/${uid}`, token).catch(() => null),
    ]);
    const card = !!(member && member.user_id);
    const today = moscowToday();
    const days = d => (Date.parse(today) - Date.parse(d)) / DAY;
    const attended = [];
    let noShow = false;
    for (const [d, list] of Object.entries(parts)) {
        if (!list || !list[uid] || d >= today || !real(hikes[d])) continue;
        if (ns[d] && ns[d][uid]) { noShow = true; continue; }
        attended.push(d);
    }
    const before = Number(history && history.before) || 0;
    const total = before + attended.length;
    const last = [...attended].sort().pop() || '';
    const within = n => attended.filter(d => days(d) <= n).length;
    if (card && within(cfg.eDays) === 0) return 'E';
    if (card && within(cfg.dDays) >= cfg.dMinHikes) return 'D';
    if (!card && total >= 2) return 'C';
    if (total === 1 && (!last || days(last) > cfg.bDays)) return 'B';
    if (noShow && total === 0) return 'F';
    const registered = Object.values(regs || {}).some(v => v === true);
    // новичку, который открыл приложение только что, опрос рано: ждём неделю, если в app_users есть время первого открытия
    const firstSeen = appUser ? Math.min(...Object.entries(appUser).filter(([k, v]) => /first|creat/i.test(k) && Number(v) > 1e9).map(([, v]) => (Number(v) < 1e12 ? Number(v) * 1000 : Number(v))), Infinity) : Infinity;
    const fresh = firstSeen !== Infinity && Date.now() - firstSeen < 7 * DAY;
    if (appUser && !registered && total === 0 && !noShow && !fresh) return 'A';
    return '';
}

async function segmentFor(uid, token, cfg, preview) {
    if (preview && SEGMENTS[preview] && SURVEY_USERS.has(uid)) return preview;
    if (FORCE_SEGMENT[uid]) return FORCE_SEGMENT[uid];
    return detectSegment(uid, token, cfg).catch(() => '');
}

// баннер + вопросы + уже данные ответы; null – показывать нечего
async function surveyFor(uid, token, preview = '') {
    uid = String(uid);
    const cfg = { ...DEFAULTS, ...((await rd('surveys/config', token).catch(() => null)) || {}) };
    if (cfg.enabled === false && !TEST_USERS.has(uid)) return null; // выключатель: surveys/config/enabled = false убирает опросы у всех, кроме тестовых
    const st = (await rd(`surveys/state/${uid}`, token).catch(() => null)) || {};
    const now = Date.now();
    // превью (startapp=survey_X) для теста: показываем баннер, не глядя на «позже / отказался / прошёл»
    const test = TEST_USERS.has(uid);
    if (!preview && !test) {
    if (st.status === 'declined') return null;
    if (st.status === 'done' && now < Number(st.done_at || 0) + cfg.repeatDays * DAY) return null;
    if (st.status === 'later' && now < Number(st.until || 0)) return null;
    }
    // значок, который не смогли выдать (записи ещё не было), выдаём, как только она появилась
    if (!test) await retryPendingBadge(uid, token).catch(() => {});
    const segment = await segmentFor(uid, token, cfg, preview);
    if (!segment || !SEGMENTS[segment]) return null;
    // повторный круг после 60 дней – ответы предыдущего круга не подставляем
    const answers = (await rd(`surveys/answers/${segment}/${uid}`, token).catch(() => null)) || {};
    const seg = SEGMENTS[segment];
    return { segment, test, banner: { ...seg.banner, resume: Object.keys(answers).length > 0 }, questions: seg.questions, answers };
}

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008]/g, '').trim().slice(0, n);

async function saveAnswer(uid, token, segment, qid, a, skip) {
    uid = String(uid);
    if (!SEGMENTS[segment]) throw new Error('forbidden');
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
    if (TEST_USERS.has(uid)) rec.test = true;
    await wr(`surveys/answers/${segment}/${uid}/${qid}`, token, rec);
    if (!skip && qid === 'F1') await wr(`surveys/consent/${uid}/quote`, token, value).catch(() => {});
    if (TEST_USERS.has(uid)) await wr(`surveys/consent/${uid}/test`, token, true).catch(() => {});
    if (!skip && qid === 'F2') await wr(`surveys/consent/${uid}/talk`, token, value).catch(() => {});
    return { ok: true };
}

async function setState(uid, token, op, segment) {
    uid = String(uid);
    if (TEST_USERS.has(uid)) return { test: true }; // у тестового баннер включён всегда
    const cfg = { ...DEFAULTS, ...((await rd('surveys/config', token).catch(() => null)) || {}) };
    const now = Date.now();
    const rec = op === 'later' ? { status: 'later', until: now + cfg.laterDays * DAY, segment, at: now }
        : op === 'declined' ? { status: 'declined', segment, at: now }
        : op === 'done' ? { status: 'done', done_at: now, segment, at: now } : null;
    if (!rec) throw new Error('bad op');
    await wr(`surveys/state/${uid}`, token, rec);
    return rec;
}

async function retryPendingBadge(uid, token) {
    if (!(await rd(`surveys/pending_badge/${uid}`, token))) return;
    const m = await rd(`members/${uid}`, token).catch(() => null);
    await grantBadge(uid, m?.user_name || uid, token);
}

// опрос пройден до конца: ответы уходят в архив прогонов (surveys/runs), текущий опрос снова пустой.
// Так повторный круг через 60 дней не смешивается со старыми ответами, а «прошёл» помнится отдельно по каждому сегменту
async function archiveRun(uid, token, segment) {
    if (!SEGMENTS[segment]) return;
    const cur = await rd(`surveys/answers/${segment}/${uid}`, token).catch(() => null);
    if (!cur) return;
    await wr(`surveys/runs/${segment}/${uid}/${Date.now()}`, token, cur);
    await wr(`surveys/answers/${segment}/${uid}`, token, null);
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

// для вкладки «📋 опросы» в админке: все ответы по сегментам, люди с именами, тестовые помечены
async function adminReport(token) {
    const [answers, runs, consent, members, appUsers] = await Promise.all(['surveys/answers', 'surveys/runs', 'surveys/consent', 'members', 'app_users']
        .map(p => rd(p, token).catch(() => null)));
    const nameOf = id => String(members?.[id]?.user_name || appUsers?.[id]?.name || appUsers?.[id]?.first_name || '').trim();
    const userOf = id => String(appUsers?.[id]?.username || members?.[id]?.username || '').replace(/^@/, '');
    const out = {};
    for (const [seg, def] of Object.entries(SEGMENTS)) {
        const people = [];
        // одна запись = одно прохождение: завершённые (из архива, done) и ещё не законченные (текущие ответы)
        const add = (id, ans, run) => {
            const keys = Object.keys(ans || {});
            if (!keys.length) return;
            const answered = keys.filter(k => !ans[k].skip).length;
            people.push({ id, name: nameOf(id), username: userOf(id), test: TEST_USERS.has(id) || keys.some(k => ans[k].test),
                done: !!run, run: run || 0, answered, skipped: keys.length - answered,
                last: Math.max(...keys.map(k => Number(ans[k].at) || 0)), answers: ans });
        };
        Object.entries((answers || {})[seg] || {}).forEach(([id, ans]) => add(id, ans, 0));
        Object.entries((runs || {})[seg] || {}).forEach(([id, byTs]) => Object.entries(byTs || {}).forEach(([ts, ans]) => add(id, ans, Number(ts))));
        people.sort((a, b) => b.last - a.last);
        out[seg] = { title: def.banner.title, questions: def.questions.map(q => ({ id: q.id, title: q.title, type: q.type })), people };
    }
    return { segments: out, consent: consent || {} };
}

module.exports = { adminReport, archiveRun, surveyFor, saveAnswer, setState, grantBadge, SEGMENTS, DEFAULTS, BADGE_TITLE, SURVEY_USERS, TEST_USERS };
