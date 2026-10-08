const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ui/profiles.js', 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/export /g, '');
const today = new Date();
const date = offset => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hikes = [
    { date: date(10), title: 'Demerdzhi' },
    { date: date(-1), title: 'Past' },
    { date: date(1), title: 'Cancelled', cancelled: true },
    { date: date(2), title: 'Kant' },
];
let participants = { [date(10)]: ['1', '2'], [date(2)]: ['2'] };
const reads = [], opened = [], links = [];
const main = {
    _html: '',
    set innerHTML(value) {
        this._html = value;
        links.length = 0;
        for (const match of value.matchAll(/class="profile-hike-link" data-hike-date="([^"]+)"/g)) {
            const link = { dataset: { hikeDate: match[1] } };
            link.addEventListener = (_, handler) => { link.click = handler; };
            links.push(link);
        }
    },
    get innerHTML() { return this._html; },
    querySelectorAll(selector) { return selector === '.profile-hike-link' ? links : []; },
};
const context = vm.createContext({
    console, Date, Map, Promise, setTimeout, clearTimeout,
    state: { user: { id: 1 }, userCard: { status: 'active' }, hikesWithTitle: hikes },
    window: {}, document: {
        querySelector: () => null, getElementById: () => null,
        body: { style: {}, appendChild() {} },
        createElement: () => ({ innerHTML: '', className: '' }),
    },
    loadAllProfiles: async () => ({ '1': { name: 'Max', userId: 1 }, '2': { name: 'Member' }, '3': { name: 'Not registered', userId: 3 } }),
    loadMyProfile: async () => ({ userId: 1 }), loadRouteFavorites: async () => ({}),
    loadHikeParticipantIds: async d => { reads.push(d); return participants[d] || []; },
    setIntelligentsiaRouteFavorites() {}, getFavoriteRoutesForUser: () => [],
    mainDiv: () => main, subtitle: () => ({}), normalizeDate: d => d,
    formatDateForDisplay: d => d, showBottomSheet: i => opened.push(i),
    isPersonalMapPilotUser: () => false, haptic() {}, log() {}, hideBack() {},
    resetNavActive() {}, setActiveNav() {}, showBottomNav() {}, setupBottomNav() {},
});
vm.runInContext(source, context);

(async () => {
    await context.renderProfiles();
    assert.deepEqual(reads.sort(), [date(2), date(10)].sort(), 'Read each upcoming non-cancelled hike once');
    assert.equal(links.length, 2, 'Both registered profiles have links, including profile without stored userId');
    assert.equal((await context.getNextHikeForUser(1)).title, 'Demerdzhi');
    assert.equal((await context.getNextHikeForUser('2')).title, 'Kant', 'Choose nearest hike, not source order');
    assert.equal(await context.getNextHikeForUser(3), null);
    const dem = links.find(link => link.dataset.hikeDate === date(10));
    let prevented = false;
    dem.click({ preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.ok(prevented);
    assert.deepEqual(opened, [0], 'Open correct slider index by date');
    participants = {};
    await context.renderProfiles();
    assert.equal(links.length, 0, 'Reload removes cancelled registrations without stale cache');
    context.loadHikeParticipantIds = async () => { throw new Error('test: offline'); };
    context.console = { error() {} };
    await context.renderProfiles();
    assert.ok(main.innerHTML.includes('не удалось загрузить записи'), 'Do not report no bookings on a network error');
    console.log('Profile hike regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
