const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/main.js', 'utf8');
const start = source.indexOf('// Любое ручное действие');
const end = source.indexOf('window.isMenuActive = false;', start);
let now = 2000;
class Clock extends Date { static now() { return now; } }
const timers = [], frames = [], listeners = {}, positions = [];
const window = { scrollY: 200, addEventListener: (type, fn) => { listeners[type] = fn; }, scrollTo: (_, y) => { positions.push(y); window.scrollY = y; } };
const context = vm.createContext({
    window, Date: Clock, homeOnScreen: () => true,
    deferHofHomeRender: () => false, hofLinkGeneration: () => 0, hofLinkActive: () => false,
    renderHome: () => { window.scrollY = 0; },
    setTimeout: fn => timers.push(fn), requestAnimationFrame: fn => frames.push(fn),
});
vm.runInContext(source.slice(start, end), context);
function flush() { while (frames.length) frames.shift()(); while (timers.length) timers.shift()(); }
context.renderHomeKeep();
listeners.touchstart(); window.scrollY = 450;
flush();
assert.deepEqual(positions, [], 'Delayed restoration must not fight a user swipe');
assert.equal(window.scrollY, 450);
now += 1500; window.scrollY = 450;
context.renderHomeKeep(); flush();
assert.equal(window.scrollY, 450, 'Without input restore the original scroll position');
positions.length = 0;
context.renderHomeKeep();
listeners.wheel(); window.scrollY = 600; flush();
assert.deepEqual(positions, [], 'Wheel also cancels pending restoration');
context.homeOnScreen = () => false;
context.renderHomeKeep(); flush();
assert.deepEqual(positions, [], 'Do not move another page after navigation');
console.log('Home scroll restoration respects input and navigation');

const common = fs.readFileSync('js/ui/common.js', 'utf8');
const a = common.indexOf('export function setActiveNav('), b = common.indexOf('export function resetNavActive(', a);
let writes = 0;
const nodes = ['navHome', 'navHikes'].map(id => ({ id, active: id === 'navHome', classList: {
    contains() { return nodes.find(n => n.id === id).active; },
    toggle(_, value) { writes++; nodes.find(n => n.id === id).active = value; },
} }));
vm.runInNewContext(common.slice(a, b).replace('export ', '') + '\nsetActiveNav("navHome"); setActiveNav("navHome");', { document: { querySelectorAll: () => nodes } });
assert.equal(writes, 0, 'Scrolling in the same section must not mutate navigation classes');
console.log('Navigation selection is stable when unchanged');
