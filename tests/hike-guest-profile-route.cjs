const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('js/ui/calendar.js', 'utf8');
const start = src.indexOf('let currentDropdownHikeDate = null;');
const end = src.indexOf('let currentLeaderDropdown = null;', start);
assert.ok(start > 0 && end > start);
const items = [], navigations = [];
function element() {
    return {
        style: {}, dataset: {}, isConnected: true, scrollTop: 0, children: [],
        classList: { add() {}, remove() {} },
        addEventListener(name, cb) { this.events ||= {}; this.events[name] = cb; },
        appendChild(child) { this.children.push(child); if (child.dataset?.userId) items.push(child); },
        getBoundingClientRect() { return { top: 0, bottom: 40, right: 300 }; },
        querySelectorAll() { return []; },
    };
}
const container = element();
const counter = { isConnected: true, offsetWidth: 190, closest: () => container,
    getBoundingClientRect: () => ({ top: 5, bottom: 40, right: 240 }) };
const profiles = {
    '101': { name: 'Guest profile', guest: true },
    '102': { name: 'Card holder', guest: false },
    '103': { name: 'Unknown membership', guest: null },
};
const people = Object.keys(profiles).map(userId => ({ userId, name: profiles[userId].name }));
const context = vm.createContext({
    state: { user: { id: 999 }, userCard: { status: 'inactive' }, profiles, pendingProfileClick: null },
    document: { body: container, querySelector: () => null, createElement: element, addEventListener() {}, removeEventListener() {} },
    fetchGoingFromServer: async () => [people], loadAllParticipants: async () => people,
    haptic() {}, log() {}, closeBottomSheet() {},
    renderProfiles() { navigations.push(context.state.pendingProfileClick); },
    setTimeout() {}, console, Promise,
});
vm.runInContext(src.slice(start, end).replace(/export /g, ''), context);
(async () => {
    await context.toggleParticipantDropdown(counter, '2099-01-01');
    assert.equal(items.length, 3);
    const choose = id => {
        context.state.pendingProfileClick = null;
        items.find(item => item.dataset.userId === id).events.click({ stopPropagation() {} });
        return navigations.at(-1);
    };
    assert.equal(choose('101'), null, 'Guest profile click opens only the profiles page, not a paid member preview');
    assert.equal(choose('103'), null, 'Unknown membership must never be presented as a confirmed card holder');
    assert.equal(choose('102').userId, '102', 'Card holder keeps the existing selected-profile route');
    context.state.userCard.status = 'active';
    assert.equal(choose('101'), null, 'Guest target still opens directory even for a card-holding viewer');
    console.log('Hike participant routing regression test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
