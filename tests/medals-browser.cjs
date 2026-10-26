const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const medal = { id: 'spider', title: 'залез в пещеру пауков', description: 'за смелость и любопытство', rarity: 'mythical',
    medal: { imageUrl: '/assets/achievements/spider-cave-transparent-v2.png' },
    grant: { userId: '163665735', name: 'Макс', date: '2026-10-25', issuedAt: 1 } };
// Fixture awards test the existing carousel without granting fake production awards.
const items = Array.from({ length: 5 }, (_, i) => ({ ...medal, id: 'fixture-'+i, title: i ? 'ачивка '+(i+1) : medal.title }));

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';
        import {initFirebase} from './js/firebase.js';
        import {renderProfiles} from './js/ui/profiles.js';
        import {mountMyAchievements,openMedal} from './js/ui/medals.js';
        state.user={id:163665735,username:'maxmolotov'};
        window.testMedals={single:()=>openMedal(${JSON.stringify(medal)}),profiles:async()=>{
            const profile={userId:'163665735',name:'Макс',hobbies:'хайкинг',profession:'клуб',updatedAt:1};
            const data={userProfiles:{'163665735':profile},'userProfiles/163665735':profile,routeFavorites:{}};
            window.firebase={initializeApp(){},database:()=>({ref:key=>({once:async()=>({val:()=>data[key]||null})})})};
            initFirebase();state.userCard={status:'active'};state.hikesWithTitle=[];await renderProfiles();
        }};
        mountMyAchievements();` } });
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
            await page.locator('#myAchievements:not([hidden])').waitFor();
            assert.equal(await page.locator('#cardBlock + #myAchievements').count(), 1, 'Keep the layout from the confirmed canonical folder');
            assert.equal(await page.locator('.card-medals').count(), 0, 'Do not overlay the abandoned layout proposal');
            await page.locator('#myAchievements [data-medal="3"]').click();
            await page.locator('.ach-overlay.is-on').waitFor();
            await page.locator('.ach-name').filter({hasText:'ачивка 4'}).waitFor();
            const assertCentered = async () => {
                await page.waitForTimeout(400);
                const delta = await page.locator('.ach-slide.is-on').evaluate(slide => {
                    const s=slide.getBoundingClientRect(),p=slide.closest('.ach-sheet').getBoundingClientRect();
                    return Math.abs(s.left+s.width/2-p.left-p.width/2);
                });
                assert.ok(delta < 1, `Medal is centered, offset ${delta}px at ${width}px`);
            };
            await assertCentered();
            assert.equal(await page.locator('.ach-slide').count(), 5);
            assert.equal(await page.locator('[data-share-one], [data-share-all]').count(), 2, 'Preserve both story controls');
            const glass = await page.locator('.ach-sheet').evaluate(el => ({bg:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter}));
            assert.equal(glass.bg, 'rgba(18, 26, 36, 0.72)');
            assert.ok(glass.blur.includes('blur(36px)'));
            await page.locator('.ach-slide[data-i="0"]').evaluate(slide => {
                const track=slide.parentElement,s=slide.getBoundingClientRect(),t=track.getBoundingClientRect();
                track.scrollTo({left:track.scrollLeft+s.left+s.width/2-t.left-t.width/2,behavior:'instant'});
            });
            await page.locator('.ach-name').filter({hasText:medal.title}).waitFor();
            await assertCentered();
            await page.locator('.ach-slide img').first().evaluate(img=>img.decode());
            await page.waitForTimeout(350);
            assert.ok((await page.locator('.ach-desc').textContent()).includes(medal.description));
            await page.screenshot({path:`/private/tmp/canonical-transparent-medal-${width}.png`});
            assert.equal(await page.locator('.ach-sheet').evaluate(el=>el.scrollWidth>el.clientWidth), false);
            await page.locator('[data-dot="4"]').click();
            await page.locator('.ach-name').filter({hasText:'ачивка 5'}).waitFor();
            await assertCentered();
            await page.setViewportSize({width:width+30,height:844});
            await assertCentered();
            await page.setViewportSize({width,height:844});
            await assertCentered();
            await page.locator('.ach-close').click();
            await page.locator('.ach-overlay').waitFor({state:'detached'});
            await page.evaluate(()=>testMedals.profiles());
            await page.locator('.profile-card .medal-miniature').first().waitFor();
            await page.locator('.profile-card [data-medal="2"]').click();
            await page.locator('.ach-name').filter({hasText:'ачивка 3'}).waitFor();
            await page.locator('.ach-close').click();
            await page.locator('.ach-overlay').waitFor({state:'detached'});
            await page.evaluate(()=>testMedals.single());
            await assertCentered();
            assert.equal(await page.locator('[data-share-all]').count(), 0);
            assert.equal(await page.locator('canvas').count(), 0);
            assert.equal(requests.some(url=>/\.glb|medal-runtime|manrope-cyrillic/.test(url)), false);
            await page.locator('.ach-close').click();
            await page.locator('.ach-overlay').waitFor({state:'detached'});
            assert.deepEqual(errors, []);
            await page.close();
            console.log('Canonical medal UI passed:',width,'px: original placements, existing carousel, selected medal, descriptions, stories, translucent glass, no 3D');
        }
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
