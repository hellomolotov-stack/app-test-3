const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./_playwright.cjs');

const root = path.resolve(__dirname, '..');
const hikes = {
    '2026-11-08': { title: 'хайк на Аю-Даг', start_time: '11:00' },
    '2026-11-15': { title: '', emoji: '⛰️' },
    '2026-11-22': { title: '', emoji: '⛰️' },
};

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const member of [false, true]) {
            const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
            const errors = [], writes = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.addInitScript(({ hikes }) => {
                window.scrollFrames = [];
                const sample = () => { window.scrollFrames.push(scrollY); requestAnimationFrame(sample); };
                requestAnimationFrame(sample);
                const user = { id: 123, first_name: 'Аня', allows_write_to_pm: true };
                window.Telegram = { WebApp: { initData: 'test-only', initDataUnsafe: { user, start_param: 'next_hike' }, platform: 'tdesktop',
                    expand() {}, onEvent() {}, offEvent() {}, disableVerticalSwipes() {},
                    BackButton: { hide() {}, show() {}, onClick() {}, offClick() {} },
                    HapticFeedback: { impactOccurred() {}, selectionChanged() {} } } };
                window.firebase = { initializeApp() {}, database: () => ({ ref: p => ({
                    once: async () => ({ val: () => p === 'hikes' ? hikes : null }),
                    on: (e, cb) => setTimeout(() => cb({ val: () => p === 'hikes' ? hikes : null }), 2200), off() {},
                }) }), auth: () => ({ currentUser: { uid: '123' }, onAuthStateChanged(cb) { queueMicrotask(cb); return () => {}; } }) };
            }, { hikes });
            await page.route('**/*', async route => {
                const req = route.request(), u = new URL(req.url());
                if (u.origin === 'https://app-startup.local') {
                    if (u.pathname === '/api/hikes') return route.fulfill({ json: hikes });
                    if (u.pathname === '/api/me') return route.fulfill({ json: { uid: '123', card: { status: member ? 'active' : 'inactive', hikes: 0, cardUrl: '' }, regs: {}, notes: [], stories: [], collections: {}, people: [], links: [], stats: {} } });
                    if (u.pathname.startsWith('/api/')) return route.fulfill({ json: { metrics: { hikes: 34, kilometers: 420, locations: 20, meetings: 120 }, going: {}, collections: {}, created: 0 } });
                    const file = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
                    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file, ...(file.endsWith('.js') ? { contentType: 'application/javascript' } : {}) });
                }
                if (req.postData()?.includes('hikeWaitlist')) writes.push(req.postData());
                if (req.resourceType() === 'script') return route.fulfill({ contentType: 'application/javascript', body: '' });
                return route.fulfill({ json: { status: 'ok' } });
            });
            await page.clock.setFixedTime(new Date('2026-11-07T16:00:00Z'));
            await page.goto('https://app-startup.local/?startapp=next_hike');
            const card = page.locator('.cf-card[data-date="2026-11-15"]');
            await page.locator('.cf-card[data-date="2026-11-15"].calendar-link-flash').waitFor({ timeout: 20000 });
            const position = await card.evaluate(el => ({ top: document.getElementById('calendarContainer').getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
            assert.ok(Math.abs(position.top - 60) < 2, `Actual startup scroll top: ${position.top}`);
            assert.ok(position.bottom < 800);
            const frames = await page.evaluate(() => window.scrollFrames);
            const end = frames[frames.length - 1];
            assert.ok(frames.filter(y => y > 30 && y < end - 30).length >= 12, 'Startup shows intermediate animation frames');
            assert.ok(Math.max(...frames.slice(1).map((y, i) => Math.abs(y - frames[i]))) < 100, 'No one-frame jump during startup');
            assert.match(await card.textContent(), /сообщить\s+об\s+открытии/);
            assert.deepEqual(writes, [], 'Opening actual app must not set the bell automatically');
            assert.deepEqual(errors, [], 'Actual startup has no uncaught errors');
            if (process.env.CALENDAR_SCREENSHOTS) {
                await page.waitForTimeout(650);
                await page.screenshot({ path: path.join(process.env.CALENDAR_SCREENSHOTS, `startup-${member ? 'member' : 'guest'}.png`) });
            }
            await page.close();
        }
        console.log('Actual next_hike app startup: member and guest, delayed Firebase, centered calendar and no subscription: PASS');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
