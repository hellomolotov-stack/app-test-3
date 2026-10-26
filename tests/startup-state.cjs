const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storage = new Map();
let blocked = false;
const context = vm.createContext({ Date, localStorage: {
    getItem: key => { if (blocked) throw new Error('blocked'); return storage.get(key) || null; },
    setItem: (key, value) => { if (blocked) throw new Error('blocked'); storage.set(key, value); },
} });
vm.runInContext(fs.readFileSync('js/state.js', 'utf8').replace(/export /g, '') + '\nglobalThis.state = state;', context);
const date = '2099-01-10';
context.state.user = { id: 123 };
context.state.hikesWithTitle = context.state.hikesList = [{ date, title: 'Test' }];
context.state.hikesData = { [date]: context.state.hikesList[0] };
context.state.userCard = { status: 'active', cardUrl: 'private-card' };
context.state.hikeBookingStatus = { 0: true };
context.saveCachedState();
context.saveBookingStatusToLocal();
assert.equal(context.loadBookingStatusFromLocal()[0], true);
context.state.user = { id: 456 };
context.state.userCard = { status: 'loading' };
context.loadCachedState();
assert.equal(context.state.userCard.status, 'loading', 'Do not restore another person card offline');
assert.equal(Object.keys(context.loadBookingStatusFromLocal()).length, 0, 'Do not restore another person bookings');
assert.equal(context.state.hikesWithTitle.length, 1, 'Public routes can still be restored');
context.state.user = { id: 123 };
context.loadCachedState();
assert.equal(context.state.userCard.status, 'active');
blocked = true;
assert.doesNotThrow(() => context.saveBookingStatusToLocal());
assert.equal(Object.keys(context.loadBookingStatusFromLocal()).length, 0);
assert.doesNotThrow(() => context.loadCachedState());
console.log('Startup state passed: account-bound private cache, public fallback and blocked storage');
