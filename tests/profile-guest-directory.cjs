const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/ui/profiles.js', 'utf8');
const start = source.indexOf('function renderGuestPeople(');
const end = source.indexOf('function openGuestPreview(', start);
assert.ok(start > 0 && end > start);
const main = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
const opened = [];
const context = vm.createContext({
    profiles: {
        '101': { name: 'Confirmed member', guest: false },
        '102': { name: 'Confirmed guest', guest: true },
        '103': { name: 'Membership unavailable', guest: null },
    },
    myProfile: null, profileRenderId: 0, state: { user: { id: 999 }, pendingProfileClick: null },
    document: { getElementById: () => ({}), head: { appendChild() {} }, createElement: () => ({}) },
    mainDiv: () => main, gpAv: () => '<span></span>', escapeHtml: x => String(x), plural: () => 'профилей',
    openGuestPreview: profile => opened.push(profile.userId),
    Math, setTimeout(fn) { fn(); },
});
vm.runInContext(source.slice(start, end), context);
context.renderGuestPeople();
assert.ok(main.innerHTML.includes('Confirmed member'));
assert.ok(!main.innerHTML.includes('Confirmed guest'), 'Guest profiles are absent from member preview grid');
assert.ok(!main.innerHTML.includes('Membership unavailable'), 'Unknown membership is not advertised as a card holder');
context.state.pendingProfileClick = { userId: '102', name: 'Confirmed guest' };
context.renderGuestPeople();
assert.deepEqual(opened, [], 'A guest reached from another entry point cannot masquerade as a locked member');
context.state.pendingProfileClick = { userId: '103', name: 'Membership unavailable' };
context.renderGuestPeople();
assert.deepEqual(opened, [], 'Unknown membership cannot open paid member preview');
context.state.pendingProfileClick = { userId: '101', name: 'Confirmed member' };
context.renderGuestPeople();
assert.deepEqual(opened, ['101'], 'Member targets keep their preview');
console.log('Guest directory membership filter passed');
