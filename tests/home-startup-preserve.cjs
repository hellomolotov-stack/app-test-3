const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Проверяем реальную функцию фонового рендера без запуска приложения или браузера.
const source = fs.readFileSync('js/ui/home.js', 'utf8');
const render = source.slice(source.indexOf('export function renderHome(')).replace('export function renderHome(', 'function renderHome(');
const main = { dataset: {}, nodes: {}, querySelector(s) { return this.nodes[s.slice(1)] || null; } };
function node(id) {
    return { id, listener: Symbol(id), replaceWith(old) { main.nodes[id] = old; }, after(old) { main.nodes[old.id] = old; } };
}
function draw() {
    main.nodes = Object.fromEntries(['circleContainer', 'weatherBlock', 'rdMedalsAnchor'].map(id => [id, node(id)]));
}
let mountCount = 0;
const state = { user: { id: '1' }, userCard: { status: 'active', cardUrl: 'card' }, hikesWithTitle: [{ date: '2026-12-01' }] };
const context = vm.createContext({
    state, mainDiv: () => main, isRedesign: () => false, isV2: () => true,
    isUpcomingHike: () => true, deferHofHomeRender: () => false,
    renderOwnerHome: draw, renderGuestHome: draw, renderRdHome: draw,
    mountMyAchievements: () => { if (!main.nodes.myAchievements) { mountCount++; main.nodes.myAchievements = node('myAchievements'); } },
    document: { querySelector: () => null, getElementById: () => null }, window: {},
    localStorage: { getItem: () => null }, setLumenContext() {}, hideBack() {},
    showBottomNav() {}, updateMetricsUI() {}, loadPopups: async () => null,
    applyRedesignFlag() {}, mountAdminEntry() {}, mountAdmissionEntry() {}, maybeShowNewAchievements() {},
});
vm.runInContext(render, context);
context.renderHome();
const first = { ...main.nodes };
context.renderHome({ preserveLoadedBlocks: true });
assert.equal(main.nodes.circleContainer, first.circleContainer, 'Keep existing connections and click listeners');
assert.equal(main.nodes.myAchievements, first.myAchievements, 'Keep existing achievements and pending work');
assert.equal(main.nodes.weatherBlock, first.weatherBlock, 'Keep weather while the next hike is unchanged');
assert.equal(mountCount, 1, 'Do not mount achievements a second time');
state.hikesWithTitle = [{ date: '2026-12-08' }];
context.renderHome({ preserveLoadedBlocks: true });
assert.notEqual(main.nodes.weatherBlock, first.weatherBlock, 'Refresh weather when the highlighted hike changes');
assert.equal(main.nodes.circleContainer, first.circleContainer, 'Unrelated blocks remain mounted');
state.userCard = { status: 'inactive' };
context.renderHome({ preserveLoadedBlocks: true });
assert.notEqual(main.nodes.circleContainer, first.circleContainer, 'Do not carry private blocks across membership changes');
const guestCircle = main.nodes.circleContainer;
context.renderHome();
assert.notEqual(main.nodes.circleContainer, guestCircle, 'Ordinary navigation still creates a fresh home');
console.log('Home startup block preservation tests passed');
