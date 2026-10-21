const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/ui/hiking-box.js', 'utf8');
const fragment = source.slice(source.indexOf('export function hikingBoxEnabled'), source.indexOf('// плашка над слайдером')).replace('export ', '');
const state = { user: null, hikesWithTitle: [] };
const context = vm.createContext({ state, Date });
vm.runInContext(fragment, context);
const now = new Date('2026-10-21T12:00:00+03:00');
const hike = (date, values = {}) => ({ date, title: 'Хайк', start_time: '10:00', ...values });
state.hikesWithTitle = [hike('2026-11-01'), hike('2026-10-18'), hike('2026-10-25')];
for (const id of [null, 123, 7845375334, 163665735]) {
    state.user = id ? { id } : null;
    assert.equal(context.hikingBoxEnabled('2026-10-18', now), false, 'No test-account exception on past hikes');
    assert.equal(context.hikingBoxEnabled('2026-10-25', now), true);
    assert.equal(context.hikingBoxEnabled('2026-11-01', now), false, 'Not on every future hike');
}
for (const values of [{ cancelled: true }, { emoji: '🌧️' }, { city: true }, { city: 'Yes' }, { book_club: true }, { title: '' }]) {
    state.hikesWithTitle = [hike('2026-10-25', values), hike('2026-11-01')];
    assert.equal(context.hikingBoxEnabled('2026-10-25', now), false);
    assert.equal(context.hikingBoxEnabled('2026-11-01', now), true);
}
state.hikesWithTitle = [hike('2026-10-21'), hike('2026-10-25')];
assert.equal(context.hikingBoxEnabled('2026-10-21', new Date('2026-10-21T10:59:59+03:00')), true);
assert.equal(context.hikingBoxEnabled('2026-10-21', new Date('2026-10-21T11:00:00+03:00')), false, 'Registration closes one hour after start');
assert.equal(context.hikingBoxEnabled('2026-10-25', now), true);
state.hikesWithTitle = [];
assert.equal(context.hikingBoxEnabled('2026-10-25', now), false);
console.log('Box visibility passed: only nearest open hike, no past/future duplicates, no admin exceptions, cancelled/postponed/city/book/placeholder excluded, Moscow cutoff');
