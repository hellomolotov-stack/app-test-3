const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({ Date });
vm.runInContext(fs.readFileSync('js/hike-timing.js', 'utf8').replace(/export /g, ''), ctx);
const hike = { date: '2026-10-25', start_time: '11:00', title: 'Ат-Баш' };
for (const timezone of ['Europe/Moscow', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = timezone;
    assert.equal(ctx.hikeTiming(hike, new Date('2026-10-25T11:59:59+03:00')).isClosed, false);
    assert.equal(ctx.hikeTiming(hike, new Date('2026-10-25T12:00:00+03:00')).isClosed, true);
    assert.equal(ctx.hikeTiming(hike, new Date('2026-10-25T15:59:59+03:00')).isUnderway, true);
    assert.equal(ctx.hikeTiming(hike, new Date('2026-10-25T15:59:59+03:00')).isCompletedToday, false);
    assert.equal(ctx.hikeTiming(hike, new Date('2026-10-25T16:00:00+03:00')).isCompletedToday, true);
    assert.equal(ctx.hikeTiming(hike, new Date('2026-10-25T16:00:00+03:00')).isUnderway, false);
    assert.equal(ctx.hikeTiming({ ...hike, start_time: '16:00' }, new Date('2026-10-25T20:59:59+03:00')).isCompletedToday, false);
    assert.equal(ctx.hikeTiming(hike, new Date('2026-10-26T00:00:00+03:00')).isPast, true);
    assert.equal(ctx.moscowDateKey(new Date('2026-10-25T22:00:00Z')), '2026-10-26');
    assert.equal(ctx.isUpcomingHike(hike, new Date('2026-10-25T12:00:00+03:00')), false);
    assert.equal(ctx.isUpcomingHike({ ...hike, date: '2026-11-01' }, new Date('2026-10-25T19:00:00+03:00')), true);
    for (const fields of [{ city: 'Yes' }, { cancelled: true }, { emoji: '🌧️' }, { book_club: true }]) {
        assert.equal(ctx.isUpcomingHike({ ...hike, date: '2026-11-01', ...fields }, new Date('2026-10-25T19:00:00+03:00')), false);
    }
    assert.equal(ctx.hikeTiming({ ...hike, start_time: '' }, new Date('2026-10-25T20:00:00+03:00')).isClosed, true);
    assert.equal(ctx.hikeTiming({ ...hike, start_time: '11.30' }, new Date('2026-10-25T12:29:59+03:00')).isClosed, false);
}
console.log('Hike timing passed: exact one-hour boundary, evening, midnight, missing time, next month and three phone timezones');
