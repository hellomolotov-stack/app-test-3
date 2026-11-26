const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const handler = require('../api/club-content');

const botToken = 'test-only-bot-token';
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.TELEGRAM_BOT_TOKEN = botToken;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'test@example.invalid',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
const base = {
    metrics: { hikes: '100', locations: '20', kilometers: '1200', meetings: '400' },
    updates: [{ date: '2026-10-01T21:00:00.000Z', update: 'старое обновление' }],
};
const attendance = {
    hikeVisitsBefore: { '2025-01-01': { title: 'Исторический маршрут', people: { 101: 'История', 104: 'Владелец карты' } } },
    hikes: { '2025-01-01': { title: '' }, '2025-01-02': { title: 'Хайк' }, '2025-01-03': { title: 'Перенос', cancelled: true }, '2025-01-05': { title: 'Город', city: true } },
    hikeParticipants: {
        '2025-01-01': { 101: { name: 'История' } },
        '2025-01-02': { 101: { name: 'История' }, 102: { name: 'Неявка' } },
        '2025-01-03': { 103: { name: 'Отмена' } },
        '2025-01-04': { 105: { name: 'Без хайка' } },
        '2025-01-05': { 106: { name: 'Город' } },
    },
    noShows: { '2025-01-02': { 102: true } },
    members: { 104: { user_id: 104 } },
    app_users: { 101: { username: 'test-hiker' } },
    pending_payments: {},
    card_offers: {},
};
let readingAttendance = false;
const overrides = {};
let writes = 0;
const booking = {};
let bookingWrites = [];
const revisionFor = section => overrides[section]
    ? crypto.createHash('sha1').update(`${section}-${overrides[section].version}`).digest('base64')
    : 'null_etag';
const realFetch = global.fetch;
global.fetch = async (url, options = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'test-token', expires_in: 3600 });
    const bookingPath = new URL(url).pathname.slice(1).replace(/\.json$/, '');
    if (bookingPath === '' && options.method === 'PATCH') {
        const update = JSON.parse(options.body);
        bookingWrites.push(update);
        Object.assign(booking, update);
        return Response.json(update);
    }
    if (/^booking_/.test(bookingPath)) return Response.json(booking[bookingPath] ?? null);
    const attendanceSection = String(url).match(/\/([^/]+)\.json$/)?.[1];
    if (readingAttendance && Object.hasOwn(attendance, attendanceSection)) {
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        return Response.json(attendance[attendanceSection]);
    }
    // мастермайнды и узлы для подсчёта знакомств (clubPairs) – добавились в api/club-content.js позже теста
    if (/\/(adminContent\/masterminds|mastermindSummaries|hikeParticipants|hikes|hikeVisitsBefore|noShows)\.json/.test(String(url))) return Response.json(null);
    const match = String(url).match(/\/(adminContent\/)?(metrics|updates)\.json$/);
    assert.ok(match, `Only fixed content paths are requested: ${url}`);
    const [, override, section] = match;
    if (options.method === 'PUT') {
        assert.ok(override);
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        if (options.headers['If-Match'] !== revisionFor(section)) return new Response('', { status: 412 });
        const data = JSON.parse(options.body);
        overrides[section] = { ...data, version: (overrides[section]?.version || 0) + 1 };
        writes++;
        return Response.json(data);
    }
    return Response.json(override ? overrides[section] || null : base[section], {
        headers: { etag: revisionFor(section) },
    });
};

function signedUser(username, age = 0) {
    const params = new URLSearchParams({
        user: JSON.stringify({ id: ({ maxmolotov: 163665735, hellointelligent: 7845375334 })[String(username).toLowerCase()] || 123, username }), // админа сервер узнаёт по id
        auth_date: String(Math.floor(Date.now() / 1000) - age),
    });
    const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
    return params.toString();
}

async function call(method, body) {
    const result = { headers: {} };
    const res = {
        setHeader(key, value) { result.headers[key] = value; },
        status(code) { result.status = code; return this; },
        json(value) { result.body = value; return this; },
    };
    await handler({ method, body }, res);
    return result;
}

(async () => {
    let response = await call('GET');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.metrics, base.metrics);
    assert.deepEqual({ metrics: response.body.revisions.metrics, updates: response.body.revisions.updates }, { metrics: 'null_etag', updates: 'null_etag' }, 'Empty Firebase nodes return unquoted null_etag');
    assert.equal(response.body.updates[0].date, '2026-10-01', 'Legacy spreadsheet dates fit the date editor without changing the displayed day');
    const data = {
        section: 'metrics', value: { hikes: 150, locations: 25, kilometers: 1550.5, meetings: 500 },
        revision: response.body.revisions.metrics,
    };
    assert.equal((await call('POST', data)).status, 401);
    assert.equal((await call('POST', { ...data, initData: signedUser('visitor') })).status, 403);
    assert.equal((await call('POST', { ...data, initData: signedUser('maxmolotov', 8 * 86400) })).status, 401);
    assert.equal(writes, 0, 'Unauthorized users never write');
    const initData = signedUser('MaxMolotov');
    assert.equal((await call('POST', { ...data, initData, value: { ...data.value, hikes: -1 } })).status, 400);
    assert.equal((await call('POST', { ...data, initData, value: { ...data.value, meetings: [] } })).status, 400);
    assert.equal((await call('POST', { ...data, initData, section: '../members' })).status, 400);
    for (const revision of [null, '', '*', '"*"', 'null_etag\r\nX-Test: injected', 'null_etag,other', ' null_etag', 'a'.repeat(257)]) {
        assert.equal((await call('POST', { ...data, initData, revision })).status, 400, `Reject invalid revision ${JSON.stringify(revision)}`);
    }
    assert.equal(writes, 0, 'Invalid revisions never write');
    response = await call('POST', { ...data, initData });
    assert.equal(response.status, 200, 'First metrics save accepts null_etag');
    assert.equal(writes, 1);
    assert.equal((await call('POST', { ...data, initData })).status, 409, 'Reject stale editor writes');
    base.metrics.hikes = '999';
    response = await call('GET');
    assert.equal(response.body.metrics.hikes, '150', 'Table synchronization cannot overwrite manual metrics');
    assert.ok(!JSON.stringify(response.body).includes('updatedBy'), 'Public response excludes audit identities');
    const updates = {
        section: 'updates', revision: response.body.revisions.updates, initData: signedUser('hellointelligent'),
        value: [{ date: '2026-10-01', update: 'старое обновление' }, { date: '2026-10-08', update: 'новое обновление' }],
    };
    assert.equal((await call('POST', { ...updates, value: [{ date: '2026-02-30', update: 'неверная дата' }] })).status, 400);
    assert.equal((await call('POST', { ...updates, value: [{ date: '2026-10-08', update: '  ' }] })).status, 400);
    assert.equal((await call('POST', updates)).status, 200, 'First updates save accepts null_etag');
    assert.equal((await call('POST', updates)).status, 409, 'Stale null_etag cannot overwrite saved updates');
    response = await call('GET');
    assert.equal(response.body.updates[0].date, '2026-10-08', 'Newest update first');
    assert.equal(response.body.updates.length, 2);
    assert.deepEqual(response.body.metrics, { hikes: '150', locations: '25', kilometers: '1550.5', meetings: '500' });
    const metricsRevision = response.body.revisions.metrics;
    assert.equal((await call('POST', { ...data, initData, revision: `"${metricsRevision}"` })).status, 409, 'Quoted revisions reach Firebase without normalization');
    assert.equal((await call('POST', { ...data, initData, revision: metricsRevision })).status, 200, 'Later metrics saves accept unquoted base64 ETags');
    assert.equal((await call('POST', { ...data, initData, revision: metricsRevision })).status, 409, 'Later saves still reject stale revisions');
    assert.equal((await call('POST', { ...updates, value: [], revision: response.body.revisions.updates })).status, 200);
    // Firebase represents an empty array by removing its property.
    delete overrides.updates.value;
    response = await call('GET');
    assert.deepEqual(response.body.updates, [], 'An empty manual list must not restore old table updates');
    const date = '2026-12-06';
    const original = '2026-12-05';
    const at = '2026-12-01T19:00:00+03:00';
    const settings = { action: 'booking_opens', date, original, at, text: 'Увидимся на тропе', button: 'иду в горы', initData };
    assert.equal((await call('POST', settings)).status, 200);
    assert.deepEqual(bookingWrites, [{
        [`booking_opens/${date}`]: at, [`booking_opens/${original}`]: null,
        [`booking_open_text/${date}`]: 'Увидимся на тропе', [`booking_open_text/${original}`]: null,
        [`booking_open_button/${date}`]: 'иду в горы', [`booking_open_button/${original}`]: null,
        [`booking_open_sent/${date}`]: null,
    }]);
    const readBooking = { action: 'booking_open_get', date, initData };
    const custom = (await call('POST', readBooking)).body;
    assert.equal(custom.text, 'Увидимся на тропе');
    assert.equal(custom.button, 'иду в горы');
    bookingWrites = [];
    assert.equal((await call('POST', { ...settings, original: date, text: '', button: '' })).status, 200);
    assert.ok(!Object.hasOwn(bookingWrites[0], `booking_open_sent/${date}`));
    const reset = (await call('POST', readBooking)).body;
    assert.equal(reset.text, '');
    assert.equal(reset.button, '');
    const msg = require('../lib/booking-open-message');
    assert.equal(msg.button(date, custom.button).inline_keyboard[0][0].text, 'иду в горы');
    assert.equal(msg.button(date, reset.button).inline_keyboard[0][0].url, `https://t.me/yaltahiking_bot?startapp=hike_${date}`);
    const attendanceRequest = { action: 'newcomer_attendance' };
    assert.equal((await call('POST', attendanceRequest)).status, 401);
    assert.equal((await call('POST', { ...attendanceRequest, initData: signedUser('visitor') })).status, 403);
    readingAttendance = true;
    const history = await call('POST', { ...attendanceRequest, initData });
    readingAttendance = false;
    assert.equal(history.status, 200);
    assert.equal(history.headers['Cache-Control'], 'no-store');
    assert.deepEqual(history.body.people, [{
        id: '101', name: 'История', username: 'test-hiker', can_message: null, offer: null, last: '2025-01-02',
        hikes: [{ date: '2025-01-01', title: 'Исторический маршрут' }, { date: '2025-01-02', title: 'Хайк' }],
    }], 'Attendance includes historical and current hikes once and excludes no-shows, cancellations and non-hikes');
    assert.equal((await call('DELETE')).status, 405);
    console.log('Club content tests passed: auth, validation, persistence, sync protection, concurrent edits');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = realFetch; });
