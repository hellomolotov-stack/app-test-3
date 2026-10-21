const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/ui/calendar.js', 'utf8');
const fragment = source.slice(source.indexOf('const feedGoingList = {}'), source.indexOf('function showLetterPopup(')).replace(/export /g, '');
const date = '2099-01-10';
const people = Array.from({ length: 5 }, (_, i) => ({ userId: i + 1, name: `Test ${i}`, timestamp: i + 1 }));
let server = people;
const painted = [];
const context = vm.createContext({
    state: { user: { id: 123, first_name: 'Test' } }, feedGoing: {},
    document: { getElementById: () => null },
    loadAllParticipants: async () => server,
    getDatabase: () => ({}), Date, Promise, setTimeout, console,
});
vm.runInContext(fragment, context);
context.date = date;
context.people = people;
context.paint = list => painted.push(list.length);
vm.runInContext('feedGoingWaiters[date] = [{ el: { isConnected: true }, paint }]; feedSetGoing(date, people, true); refreshFeedRegistration(date, true);', context);
assert.equal(painted.at(-1), 6, 'Immediately include a confirmed booking');
assert.equal(context.state._userRegs[date], true);
vm.runInContext('refreshFeedRegistration(date, true)', context);
assert.equal(painted.at(-1), 6, 'Do not count the same person twice');
vm.runInContext('refreshFeedRegistration(date, false)', context);
assert.equal(painted.at(-1), 5, 'Immediately remove a cancelled booking');
assert.equal(context.state._userRegs[date], false);
vm.runInContext('feedSetGoing(date, [], false)', context);
assert.equal(painted.at(-1), 5, 'Ignore stale CDN data after a mutation');

const firebase = fs.readFileSync('js/firebase.js', 'utf8');
const subscription = firebase.slice(firebase.indexOf('export function subscribeToParticipantCount'), firebase.indexOf('export async function loadAllParticipants')).replace('export ', '');
const snapshot = Object.fromEntries(people.map(p => [p.userId, p]));
const firebaseContext = vm.createContext({ database: { ref: () => ({ on: (_, callback) => callback({ val: () => snapshot }), off() {} }) } });
vm.runInContext(subscription, firebaseContext);
firebaseContext.subscribeToParticipantCount(date, (count, avatars, all) => {
    assert.equal(count, 5);
    assert.equal(avatars.length, 3, 'Keep the existing avatar limit');
    assert.equal(all.length, 5, 'Calendar cache gets the complete list, not just three avatars');
});

setImmediate(() => {
    assert.equal(painted.at(-1), 5, 'Older in-flight reads must not overwrite newer state');
    console.log('Calendar going tests passed: immediate booking/cancellation, no duplicates, stale cache protection, full count beyond 3 avatars');
});
