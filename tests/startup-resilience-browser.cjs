const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve('dist');
const date = '2099-01-10';
const hikes = { [date]: { title: 'Тестовый маршрут', start_time: '10:00', location: 'Ялта' } };
const held = [];
let hangApi = false;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
        if (hangApi) { held.push(res); return; }
        res.setHeader('Content-Type', 'application/json');
        if (url.pathname === '/api/hikes') return res.end(JSON.stringify(hikes));
        if (url.pathname === '/api/me') return res.end(JSON.stringify({ uid: 123, card: { status: 'inactive' }, regs: {} }));
        if (url.pathname === '/api/going') return res.end(JSON.stringify({ going: { [date]: [] } }));
        return res.end('{}');
    }
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(404); res.end(); return; }
    try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(file)); }
    catch { res.writeHead(404); res.end(); }
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const contexts = [];
    try {
        async function context(stalledDatabase = false, unavailableTelegram = false) {
            const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
            contexts.push(ctx);
            await ctx.addInitScript(({ stalledDatabase, unavailableTelegram }) => {
                if (!unavailableTelegram) window.Telegram = { WebApp: { initData: 'test-only', initDataUnsafe: { user: { id: 123, username: 'StartupPreview', first_name: 'Макс' } },
                    HapticFeedback: { impactOccurred() {}, notificationOccurred() {} }, BackButton: { hide() {}, show() {}, onClick() {}, offClick() {} },
                    onEvent() {}, offEvent() {}, expand() {}, disableVerticalSwipes() {}, openLink() {}, openTelegramLink() {},
                } };
                if (stalledDatabase) window.firebase = { initializeApp() {},
                    auth: () => ({ currentUser: {} }),
                    database: () => ({ ref: () => ({ once: () => new Promise(() => {}), on() {}, off() {} }) }),
                };
            }, { stalledDatabase, unavailableTelegram });
            await ctx.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
            return ctx;
        }
        const ctx = await context();
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.locator('.ef-tk-title').filter({ hasText: 'Тестовый маршрут' }).waitFor();
        await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
        await page.locator('#initial-loader').waitFor({ state: 'hidden' });
        await page.evaluate(async () => { await navigator.serviceWorker.ready; });
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        const keys = await page.evaluate(async () => {
            const cache = await caches.open((await caches.keys()).find(name => name.startsWith('club-shell-')));
            return (await cache.keys()).map(request => request.url);
        });
        assert.ok(keys.some(key => /\/js\/b\/app-/.test(key)));
        assert.ok(keys.every(key => !key.includes('/api/') && !key.includes('tgWebAppData') && !key.includes('test-only')), 'No API or Telegram credentials in the shell cache');
        await ctx.setOffline(true);
        await page.goto(base + '/?startapp=calendar', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
        await page.locator('#initial-loader').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.ef-tk-title').textContent(), 'Тестовый маршрут', 'Repeat opening works with the network disconnected');
        assert.equal(await page.locator('#connection-notice').isVisible(), true);
        assert.equal(await page.evaluate(() => fetch('/api/me', { method: 'POST', body: 'private' }).then(() => false, () => true)), true, 'Private API never falls back to cache');
        await page.screenshot({ path: '/tmp/club-offline-startup-390.png' });

        const failContext = await context();
        await failContext.route('**/js/b/**', route => route.abort());
        const failed = await failContext.newPage();
        await failed.goto(base, { waitUntil: 'domcontentloaded' });
        await failed.locator('.il-retry').waitFor({ state: 'visible' });
        assert.equal(await failed.locator('#startup-message').textContent(), 'не удалось загрузить приложение', 'A missing bundle has a recovery button, not an endless spinner');

        const sdkContext = await context(false, true);
        await sdkContext.route('https://telegram.org/js/telegram-web-app.js', () => {});
        const sdkPage = await sdkContext.newPage();
        const sdkErrors = [];
        sdkPage.on('pageerror', error => sdkErrors.push(error.message));
        await sdkPage.goto(base, { waitUntil: 'domcontentloaded' });
        await sdkPage.locator('#initial-loader').waitFor({ state: 'hidden', timeout: 12000 });
        assert.equal(await sdkPage.locator('#connection-notice').isVisible(), true);
        assert.deepEqual(sdkErrors, [], 'An unavailable Telegram SDK cannot prevent public startup');

        hangApi = true;
        const stalledContext = await context(true);
        const stalled = await stalledContext.newPage();
        await stalled.goto(base, { waitUntil: 'domcontentloaded' });
        await stalled.waitForFunction(() => document.documentElement.classList.contains('app-ready'), null, { timeout: 15000 });
        await stalled.locator('#initial-loader').waitFor({ state: 'hidden' });
        assert.ok((await stalled.locator('#mainContent').textContent()).length > 100, 'Unresponsive data sources cannot hold the entire screen');
        assert.equal(await stalled.locator('#connection-notice').isVisible(), true);
        await stalled.setViewportSize({ width: 320, height: 844 });
        assert.equal(await stalled.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await stalled.screenshot({ path: '/tmp/club-stalled-startup-320.png' });
        assert.deepEqual(errors, [], 'No unhandled exceptions during online/offline startup');
        console.log('Startup browser passed: offline repeat navigation, coherent public shell, no private API cache, bundle failure recovery, stalled backend fallback, 320/390px');
    } finally {
        for (const ctx of contexts) await ctx.close();
        await browser.close();
        held.forEach(response => response.destroy());
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
