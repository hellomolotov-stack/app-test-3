const assert = require('node:assert/strict');
const fs = require('node:fs');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function swipe(page, selector, delta) {
    const box = await page.locator(selector).boundingBox();
    const x = box.x + box.width / 2;
    const y = delta < 0 ? box.y + box.height * .8 : box.y + 3;
    const session = await page.context().newCDPSession(page);
    const send = (type, offset) => session.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: y + offset, id: 1 }]
    });
    await send('touchStart', 0);
    for (let i = 1; i <= 10; i++) { await send('touchMove', delta * i / 10); await page.waitForTimeout(20); }
    await send('touchEnd', delta);
    await session.detach();
}

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: {
        resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';
        import {openLink} from './js/utils.js';
        import {showBottomSheet} from './js/ui/calendar.js';
        import {initSheetDrag} from './js/ui/sheet-drag.js';
        import {openZapovednikGuide,closeZapovednikGuide} from './js/ui/zapovednik.js';
        state.userCard={status:'inactive'};
        state.hikesWithTitle=[{date:'2026-10-25',title:'хайк на Ат-Баш',tags:[],leaders:[],features:'описание маршрута '.repeat(140),details:'[как оформить пропуск](https://t.me/yaltahiking_bot?startapp=zapovednik)'}];
        initSheetDrag();showBottomSheet(0);
        window.guideTest={openLink,openZapovednikGuide,closeZapovednikGuide};`
    } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const [width, height] of [[320, 568], [390, 844], [600, 844]]) {
            const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', route => route.abort());
            await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync('style.css', 'utf8')}</style><div class="app"><main id="mainContent"></main></div><div id="alreadyInert" inert></div>`);
            await page.addScriptTag({ content: `window.externalCalls=[];window.Telegram={WebApp:{initDataUnsafe:{},HapticFeedback:{impactOccurred(){}},BackButton:{show(){},hide(){},onClick(){},offClick(){}},openLink:url=>externalCalls.push(url),openTelegramLink:url=>externalCalls.push(url)}};` });
            await page.addScriptTag({ content: outputFiles[0].text });
            const link = page.getByRole('link', { name: 'как оформить пропуск', exact: true });
            await link.scrollIntoViewIfNeeded();
            const before = await page.locator('#bottomSheetContent').evaluate(el => el.scrollTop);
            await link.click();
            await page.locator('.zp-overlay.is-on').waitFor();
            assert.deepEqual(await page.evaluate(() => externalCalls), [], 'An in-app guide link never opens Telegram');
            assert.equal(await page.locator('.bottom-sheet-overlay').evaluate(el => el.inert), true);
            assert.equal(await page.locator('.floating-sheet-buttons').evaluate(el => el.inert), true);
            const overflow = await page.locator('.zp-scroll').evaluate(el => el.scrollWidth > el.clientWidth);
            assert.equal(overflow, false);
            await page.waitForTimeout(350);
            await swipe(page, '.zp-scroll', -160);
            await page.waitForTimeout(150);
            assert.ok(await page.locator('.zp-scroll').evaluate(el => el.scrollHeight <= el.clientHeight + 1 || el.scrollTop > 0), 'Overflowing guide content scrolls with a real touch gesture');
            assert.equal(await page.locator('#bottomSheetContent').evaluate(el => el.scrollTop), before);
            await page.screenshot({ path: `/private/tmp/zapovednik-guide-${width}.png` });
            await page.locator('.zp-x').click();
            await page.waitForFunction(() => !document.querySelector('.zp-overlay'));
            assert.equal(await page.locator('#bottomSheetContent').evaluate(el => el.scrollTop), before);
            assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'The underlying hike keeps its scroll lock');
            assert.equal(await page.locator('.bottom-sheet-overlay').evaluate(el => el.inert), false);
            assert.equal(await page.locator('#alreadyInert').evaluate(el => el.inert), true);
            await link.click();
            await page.locator('.zp-overlay.is-on').waitFor();
            await page.waitForTimeout(350);
            await swipe(page, '.zp-grab', 155);
            await page.waitForFunction(() => !document.querySelector('.zp-overlay'));
            assert.equal(await page.locator('.bottom-sheet-overlay').count(), 1, 'Swiping the guide does not close the hike');
            await link.click();
            await page.locator('.zp-overlay.is-on').waitFor();
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.querySelector('.zp-overlay'));
            await page.evaluate(() => guideTest.openLink('https://t.me/yaltahiking_bot?startapp=nearest'));
            assert.deepEqual(await page.evaluate(() => externalCalls), ['https://t.me/yaltahiking_bot?startapp=nearest'], 'Other deep links keep their existing behavior');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Reserve guide passed at 320/390/600: real in-description link, no restart, native touch scroll, unchanged background, close/swipe/Escape and preserved locks');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
