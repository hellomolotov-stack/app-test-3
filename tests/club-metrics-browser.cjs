const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('./_playwright.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: root, contents: `
        import {state} from './js/state.js';import {renderHome} from './js/ui/home.js';
        import {startClubMetricsRefresh,refreshClubMetrics} from './js/club-content.js';
        state.user={id:123};state.userCard={status:'inactive'};state.hikesList=[];state.hikesWithTitle=[];state.hikesData={};state.mmNotes=[];
        state.metrics={hikes:'35',kilometers:'302',locations:'18',meetings:'1600'};
        window.toggleShareButton=()=>{};renderHome();startClubMetricsRefresh();
        window.refreshMetrics=refreshClubMetrics;
    ` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 844 } });
            const errors = []; page.on('pageerror', e => errors.push(e.message));
            let version = 301, requests = 0, failing = false;
            await page.route('**/*', route => {
                const u = new URL(route.request().url());
                if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html class="v2"><meta charset="utf-8"><header><div id="subtitle"></div></header><main id="mainContent" class="content"></main><div id="bottomNav"></div><div id="navPopup"></div></html>' });
                if (u.pathname === '/api/club-content' && u.searchParams.get('metrics') === '1') {
                    requests++;
                    return route.fulfill({ status: failing ? 502 : 200, json: { metrics: { hikes: '36', kilometers: String(version), locations: '18', meetings: '1685' } } });
                }
                const f = path.join(root, u.pathname);
                if (u.pathname.startsWith('/assets/') && fs.existsSync(f)) return route.fulfill({ path: f });
                return route.fulfill({ json: { status: 'ok', notes: [], stories: [], people: [], collections: {}, links: [], stats: {} } });
            });
            await page.goto('https://metrics-test.local');
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
            await page.addScriptTag({ content: outputFiles[0].text });
            await page.waitForFunction(() => document.querySelector('[data-metric="kilometers"]')?.textContent === '301');
            assert.equal(await page.locator('[data-metric="hikes"]').textContent(), '36');
            assert.equal(await page.locator('[data-metric="meetings"]').textContent(), '1685');
            await page.evaluate(() => { window.calendarBefore=document.getElementById('calendarContainer');window.scrollTo(0,200); });
            version = 304;
            await page.evaluate(() => window.dispatchEvent(new Event('club:hikes-updated')));
            await page.waitForFunction(() => document.querySelector('[data-metric="kilometers"]')?.textContent === '304');
            assert.equal(await page.evaluate(() => window.calendarBefore === document.getElementById('calendarContainer')), true, 'Do not rerender calendar during metrics refresh');
            assert.equal(await page.evaluate(() => scrollY), 200);
            const before = requests;
            await page.evaluate(() => Promise.all([refreshMetrics(),refreshMetrics(),refreshMetrics()]));
            assert.equal(requests, before + 1, 'Coalesce simultaneous refreshes');
            failing = true;
            await page.evaluate(() => refreshMetrics().catch(() => null));
            assert.equal(await page.locator('[data-metric="kilometers"]').textContent(), '304', 'Network failures preserve last known metrics');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Metrics UI: automatic refresh, edited distance, stable calendar/scroll, request coalescing and offline fallback: PASS');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
