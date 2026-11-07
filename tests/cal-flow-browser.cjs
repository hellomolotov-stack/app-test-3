const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('./_playwright.cjs');

const root = path.resolve(__dirname, '..');
const hikes = [
    { date: '2025-09-14', title: 'хайк в Чернореченский каньон' },
    { date: '2025-12-14', title: 'хайк по Массандровской тропе' },
    { date: '2026-06-04', title: 'встреча в городе', city: 'yes' },
    { date: '2026-11-08', title: 'хайк на Аю-Даг' },
];

(async () => {
    const { outputFiles } = await build({
        bundle: true, write: false, format: 'iife',
        stdin: { resolveDir: root, contents: `
            import { state } from './js/state.js';
            import { renderCalFlow } from './js/ui/cal-flow.js';
            state.user = { id: 163665735 };
            state.userCard = { status: 'active' };
            state.hikesList = ${JSON.stringify(hikes)};
            state.hikesWithTitle = state.hikesList;
            state.hikeBookingStatus = { 3: true };
            renderCalFlow(document.getElementById('calendarContainer'));
        ` },
    });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 650 }, hasTouch: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="ru" class="v2"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main class="app"><div id="calendarContainer"></div></main></html>' });
            if (url.pathname.endsWith('past-hikes.json')) return route.fulfill({ json: [] });
            if (url.pathname.startsWith('/assets/')) {
                const file = path.join(root, url.pathname);
                if (fs.existsSync(file)) return route.fulfill({ path: file });
            }
            return route.fulfill({ json: [] });
        });
        await page.goto('https://calendar-test.local');
        await page.evaluate(() => localStorage.setItem('cfHinted2', '1'));
        await page.clock.install({ time: new Date('2026-11-07T15:00:00Z') });
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
        await page.addScriptTag({ content: outputFiles[0].text });
        await page.waitForTimeout(100);
        assert.equal(await page.locator('.cf-tag.is-past').count(), 3);
        assert.equal(await page.locator('.cf-tag.is-booked').textContent(), '✓ ты записан');
        for (const width of [320, 390, 600]) {
            await page.setViewportSize({ width, height: 650 });
            for (let i = 0; i < hikes.length; i++) {
                const card = page.locator('.cf-card').nth(i);
                await card.evaluate(el => el.parentElement.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - el.parentElement.clientWidth / 2, behavior: 'instant' }));
                await page.waitForTimeout(80);
                const title = card.locator('.cf-title');
                assert.equal((await title.textContent()).replace(/\u00ad/g, ''), hikes[i].title);
                const box = await title.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
                assert.ok(box.scroll <= box.width, `${width}px: ${hikes[i].title} overflows`);
                const alignment = await page.locator('.cf-wheel').evaluate(el => {
                    const day = el.querySelector('.cf-d.is-on').getBoundingClientRect();
                    const lens = el.querySelector('.cf-lens').getBoundingClientRect();
                    return Math.abs(day.left + day.width / 2 - lens.left - lens.width / 2);
                });
                assert.ok(alignment < 0.75, `${width}px: selected date is off by ${alignment}px`);
                if (i < 3) assert.equal(await card.locator('.cf-tag').textContent(), i === 2 ? 'событие завершено' : 'хайк завершён');
                if (process.env.CALENDAR_SCREENSHOTS && i < 2) await page.screenshot({ path: path.join(process.env.CALENDAR_SCREENSHOTS, `title-${width}-${i}.png`) });
            }
            const layout = await page.locator('.app').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
            assert.ok(layout.scroll <= layout.width);
            const wheel = await page.locator('.cf-wheel').boundingBox();
            await page.mouse.move(wheel.x + wheel.width / 2, wheel.y + 22);
            await page.mouse.down();
            await page.mouse.move(wheel.x + wheel.width / 2 + 65, wheel.y + 22, { steps: 8 });
            await page.mouse.up();
            await page.waitForTimeout(500);
            const afterDrag = await page.locator('.cf-wheel').evaluate(el => {
                const day = el.querySelector('.cf-d.is-on').getBoundingClientRect();
                const lens = el.querySelector('.cf-lens').getBoundingClientRect();
                return Math.abs(day.left + day.width / 2 - lens.left - lens.width / 2);
            });
            assert.ok(afterDrag < 0.75, `${width}px: date did not snap after wheel drag (${afterDrag}px)`);
        }
        assert.deepEqual(errors, []);
        console.log('Calendar titles and completed labels: PASS (320/390/600px)');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
