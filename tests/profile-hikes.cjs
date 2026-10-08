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
const reads = [], opened = [], links = [], filters = [];
const main = {
    _html: '',
    set innerHTML(value) {
        this._html = value;
        if (value.includes('id="profilesResults"')) {
            filters.length = 0;
            for (const match of value.matchAll(/data-profile-filter="([^"]+)" aria-pressed="([^"]+)"/g)) {
                const button = {
                    dataset: { profileFilter: match[1] }, pressed: match[2],
                    getAttribute() { return this.pressed; },
                    setAttribute(_, v) { this.pressed = v; },
                };
                button.addEventListener = (_, handler) => { button.click = handler; };
                filters.push(button);
            }
        }
        links.length = 0;
        for (const match of value.matchAll(/class="profile-hike-link" data-hike-date="([^"]+)"/g)) {
            const link = { dataset: { hikeDate: match[1] } };
            link.addEventListener = (_, handler) => { link.click = handler; };
            links.push(link);
        }
    },
    get innerHTML() { return this._html; },
    querySelectorAll(selector) {
        return selector === '.profile-hike-link' ? links : selector === '[data-profile-filter]' ? filters : [];
    },
};
const results = Object.create(main);
const context = vm.createContext({
    console, Date, Map, Promise, setTimeout, clearTimeout,
    state: { user: { id: 1 }, userCard: { status: 'active' }, hikesWithTitle: hikes },
    window: {}, document: {
        querySelector: () => null, getElementById: id => id === 'profilesResults' ? results : null,
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
    assert.equal(filters[0].pressed, 'true', 'All is selected initially');
    filters[1].click();
    assert.equal(filters[1].pressed, 'true');
    assert.equal(links.length, 1, 'Nearest filter excludes later bookings');
    assert.ok(results.innerHTML.includes('Member'));
    assert.ok(!results.innerHTML.includes('Max'));
    links[0].click({ preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(opened, [0, 3], 'Filtered cards still open their own hike');
    filters[0].click();
    assert.equal(links.length, 2, 'All restores the full set');
    filters[1].click();
    await context.renderProfiles();
    assert.equal(filters[0].pressed, 'true', 'Re-entering always resets to all');
    participants = {};
    await context.renderProfiles();
    assert.equal(links.length, 0, 'Reload removes cancelled registrations without stale cache');
    filters[1].click();
    assert.ok(results.innerHTML.includes('пока никто не записался'));
    context.loadHikeParticipantIds = async () => { throw new Error('test: offline'); };
    context.console = { error() {} };
    await context.renderProfiles();
    assert.ok(main.innerHTML.includes('не удалось загрузить записи'), 'Do not report no bookings on a network error');
    filters[1].click();
    assert.ok(results.innerHTML.includes('не удалось загрузить записи на хайк'));
    console.log('Profile hike regression tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
