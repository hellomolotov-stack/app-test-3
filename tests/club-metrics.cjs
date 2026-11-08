const assert = require('node:assert/strict');
const { calculateMetrics, distanceKm } = require('../lib/club-metrics');
const input = {
    baseline: { through: '2026-03-01', kilometers: 10, hikes: 1 }, locations: 18,
    before: { '2026-03-01': { title: 'исторический хайк', people: { a: 'А', b: 'Б' } } },
    hikes: {
        '2026-03-01': { title: '', emoji: '🌧️' },
        '2026-11-01': { title: 'хайк', tags: ['6 км'] },
        '2026-11-08': { title: 'новый хайк', start_time: '12:00', tags: ['6 км'] },
        '2026-11-09': { title: 'город', city: 'Yes', tags: ['30 км'] },
        '2026-11-10': { title: 'книжный', book_club: true, tags: ['30 км'] },
        '2026-11-11': { title: 'отмена', cancelled: true, tags: ['30 км'] },
        '2026-11-12': { title: '', tags: ['30 км'] },
    },
    participants: { '2026-11-01': { a: {}, b: {}, c: {}, 7845375334: {} }, '2026-11-08': { a: {}, c: {}, d: {} } },
    noShows: { '2026-11-01': { c: true } }, now: Date.parse('2026-11-08T13:59:59Z'),
};
let result = calculateMetrics(input);
assert.equal(result.hikes, '2');
assert.equal(result.kilometers, '16');
assert.equal(result.meetings, '3', 'Unique pairs; exclude absent and service accounts, include organizer');
input.now = Date.parse('2026-11-08T14:00:00Z');
result = calculateMetrics(input);
assert.equal(result.hikes, '3', 'Include hike exactly five hours after Moscow start');
assert.equal(result.kilometers, '22');
assert.equal(result.meetings, '8');
input.hikes['2026-11-01'].tags = ['9 км'];
assert.equal(calculateMetrics(input).kilometers, '25', 'Editing 6 to 9 adds exactly 3 km');
assert.deepEqual(calculateMetrics(input), calculateMetrics(input), 'Repeated reads are idempotent');
input.hikes['2026-11-08'].cancelled = true;
assert.equal(calculateMetrics(input).hikes, '2');
assert.equal(calculateMetrics(input).kilometers, '19');
input.hikes['2026-11-08'].cancelled = false;
input.hikes['2026-11-08'].tags = [];
assert.throws(() => calculateMetrics(input), /нет дистанции/);
assert.equal(distanceKm({ tags: ['легко', '6,5 км'] }), 6.5);
assert.equal(distanceKm({ tags: ['6–9 км'] }), null, 'Do not guess distance ranges');
assert.equal(distanceKm({ tags: ['5 часов'] }), null);
input.hikes['2026-11-08'].tags = ['6 км'];
input.now = Date.parse('2026-11-12T18:00:00Z');
assert.equal(calculateMetrics(input).hikes, '3', 'City/book/cancelled/untitled events never count');
console.log('Club metrics: history dedupe, completion boundary, distance edits, unique pairs, exclusions and idempotency: PASS');
