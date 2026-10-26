const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const medal = { id: 'spider', title: 'залез в пещеру пауков', rarity: 'mythical',
    medal: { imageUrl: '/assets/achievements/spider-cave-flat-v1.png' },
    grant: { userId: '163665735', name: 'Макс', date: '2026-10-25', issuedAt: 1 } };
// Five fixtures exercise overflow and paging without issuing fake production awards.
const items = Array.from({ length: 5 }, (_, i) => ({ ...medal, id: 'fixture-'+i, title: i ? 'ачивка '+(i+1) : medal.title }));

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';
        import {initFirebase} from './js/firebase.js';
        import {renderProfiles} from './js/ui/profiles.js';
        import {initSheetDrag} from './js/ui/sheet-drag.js';
        import {mountCardMedals,openMedals} from './js/ui/medals.js';
        state.user={id:163665735,username:'maxmolotov'};
        window.testMedals={single:()=>openMedals([${JSON.stringify(medal)}],0),
            profiles:async()=>{
                const profile={userId:'163665735',name:'Макс',hobbies:'хайкинг',profession:'клуб',updatedAt:1};
                const data={userProfiles:{'163665735':profile},'userProfiles/163665735':profile,routeFavorites:{}};
                window.firebase={initializeApp(){},database:()=>({ref:key=>({once:async()=>({val:()=>data[key]||null})})})};
                initFirebase();state.userCard={status:'active'};state.hikesWithTitle=[];await renderProfiles();
            }};
        initSheetDrag();mountCardMedals();` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
            const errors = [], requests = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', request => requests.push(request.url()));
            await page.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><h1 id="subtitle"></h1><main id="mainContent"><section id="cardBlock" class="card-container"><div style="height:190px;display:grid;place-items:center">карта интеллигента</div></section></main><nav id="bottomNav"></nav>' });
                if (url.pathname === '/api/achievements') return route.fulfill({ json: { collections: { '163665735': items } } });
                if (url.pathname.startsWith('/assets/achievements/')) return route.fulfill({ body: fs.readFileSync(path.join('.', url.pathname)), contentType: 'image/png' });
                return route.fulfill({ json: {} });
            });
            await page.goto('http://localhost:4183/');
            await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
            await page.addScriptTag({ content: 'window.Telegram={WebApp:{initData:"fixture",HapticFeedback:{impactOccurred(){}}}};' });
            await page.addScriptTag({ content: outputFiles[0].text });
            await page.locator('#cardBlock .card-medals:not([hidden])').waitFor();
            assert.equal(await page.locator('#myAchievements').count(), 0, 'No standalone achievements section');
            assert.equal(await page.locator('#cardBlock .medal-miniature').count(), 3);
            await page.screenshot({ path: `/private/tmp/flat-medals-card-${width}.png` });
            await page.locator('#cardBlock [data-medal-all]').click();
            await page.locator('.medals-overlay.is-on .medals-grid-item').first().waitFor();
            assert.equal(await page.locator('.medals-grid-item').count(), 5);
            await page.screenshot({ path: `/private/tmp/flat-medals-all-${width}.png` });
            await page.locator('[data-open-medal="4"]').click();
            assert.equal(await page.locator('.medals-pager span').textContent(), '5 / 5');
            await page.locator('[data-medal-move="1"]').click();
            assert.equal(await page.locator('.medals-pager span').textContent(), '1 / 5', 'Paging loops');
            await page.locator('.medal-large img').evaluate(img => img.decode());
            const artwork = await page.locator('.medal-large img').evaluate(img => {
                const r=img.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,parent:img.parentElement.getBoundingClientRect().toJSON()};
            });
            assert.ok(artwork.left >= 0 && artwork.right <= artwork.width, JSON.stringify(artwork));
            assert.equal(await page.locator('.medal-detail h3').textContent(), medal.title);
            assert.equal(await page.locator('.medal-detail p').textContent(), 'Макс · 25.10.2026');
            await page.screenshot({ path: `/private/tmp/flat-medal-detail-${width}.png` });
            await page.keyboard.press('ArrowRight');
            assert.equal(await page.locator('.medals-pager span').textContent(), '2 / 5');
            const content = page.locator('.medals-scroll');
            await content.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 250, clientY: 300 }] });
            await content.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 90, clientY: 310 }] });
            assert.equal(await page.locator('.medals-pager span').textContent(), '3 / 5', 'Swipe advances the large medal');
            assert.equal(await page.locator('.medals-sheet').evaluate(el => el.scrollWidth > el.clientWidth), false);
            await page.keyboard.press('Escape');
            await page.locator('.medals-overlay').waitFor({ state: 'detached' });
            assert.equal(await page.locator('#mainContent').evaluate(el => el.inert), false);
            await page.locator('#cardBlock [data-medal="1"]').click();
            assert.equal(await page.locator('.medals-pager span').textContent(), '2 / 5');
            const grab = page.locator('.medals-sheet .cs-grab');
            await grab.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 150, clientY: 90 }] });
            await grab.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: 150, clientY: 240 }] });
            await grab.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 150, clientY: 240 }] });
            await page.locator('.medals-overlay').waitFor({ state: 'detached' });
            await page.evaluate(() => testMedals.profiles());
            assert.equal(await page.locator('.profile-card .medal-miniature').count(), 3, 'Profiles show at most three medals');
            assert.equal(await page.locator('.profile-card .medal-more').textContent(), '+2');
            await page.screenshot({ path: `/private/tmp/flat-medals-profile-${width}.png` });
            await page.locator('.profile-card .medal-more').click();
            assert.equal(await page.locator('.medals-grid-item').count(), 5, 'Plus opens the entire collection');
            await page.locator('.medals-close').click();
            await page.locator('.medals-overlay').waitFor({ state: 'detached' });
            await page.evaluate(() => testMedals.single());
            assert.equal(await page.locator('.medals-pager').count(), 0, 'A single award has no dead navigation');
            assert.equal(await page.locator('canvas').count(), 0);
            assert.equal(requests.some(url => /\.glb|medal-runtime|manrope-cyrillic/.test(url)), false, 'No 3D resources requested');
            await page.locator('.medals-close').click();
            await page.locator('.medals-overlay').waitFor({ state: 'detached' });
            assert.deepEqual(errors, []);
            await page.close();
            console.log('Flat medals passed:', width, 'px: inside card, three + overflow, collection, paging/swipes, drag close, real profiles, no WebGL');
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
