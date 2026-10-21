const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: {
        resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';import {openHikingBox} from './js/ui/hiking-box.js';
        state.user=null;
        window.boxPreview={open(member){state.userCard={status:member?'active':'inactive'};openHikingBox(document.querySelector('#entry'),{date:'2099-01-10',title:'хайк на Ат-Баш'},!member);}};`
    } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 600]) {
            for (const member of [false, true]) {
                const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
                const errors = [];
                page.on('pageerror', e => errors.push(e.message));
                await page.route('**/*', route => {
                    const u = new URL(route.request().url());
                    if (u.host !== 'box.local') return route.abort();
                    if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><button id="entry">бокс</button>' });
                    if (u.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
                    if (u.pathname.startsWith('/assets/') && !u.pathname.includes('..')) {
                        const file = path.join(process.cwd(), u.pathname);
                        if (fs.existsSync(file)) return route.fulfill({ path: file });
                    }
                    return route.abort();
                });
                await page.goto('http://box.local/');
                await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
                await page.addScriptTag({ content: `window.links=[];window.Telegram={WebApp:{initData:'',HapticFeedback:{impactOccurred(){}},openLink:url=>links.push(url)}};` });
                await page.addScriptTag({ content: outputFiles[0].text });
                await page.evaluate(member => boxPreview.open(member), member);
                await page.waitForTimeout(500);
                for (const tab of ['light', 'optimal']) {
                    await page.locator('.hb-tab[data-box="' + tab + '"]').click();
                    const button = page.locator('.hb-bar .hb-buy');
                    assert.equal(await button.count(), 1);
                    assert.equal(await button.textContent(), 'Настроить свой бокс');
                    assert.equal(await button.evaluate(el => el.classList.contains('btn-yellow')), true);
                    assert.equal(await button.evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)');
                    assert.notEqual(await button.evaluate(el => getComputedStyle(el).backgroundImage), 'none');
                    assert.equal(await button.evaluate(el => el.scrollWidth > el.clientWidth), false);
                    await button.click();
                    const url = new URL(await page.evaluate(() => links.at(-1)));
                    assert.equal(url.hostname, 'dietcakes.ru');
                    assert.equal(url.searchParams.get('custom'), '1');
                    assert.equal(url.searchParams.get('box'), tab === 'light' ? 'light' : 'full');
                    assert.equal(url.searchParams.get('hike'), '2099-01-10');
                    assert.equal(url.searchParams.get('card'), member ? '1' : null);
                }
                await page.screenshot({ path: `/private/tmp/hiking-box-single-cta-${width}-${member ? 'member' : 'guest'}.png` });
                assert.deepEqual(errors, []);
                await page.close();
            }
        }
        console.log('Hiking box CTA passed at 320/390/600: one yellow custom button, stable label on both tabs, correct constructor/date/card URLs, no overflow or shop requests');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
