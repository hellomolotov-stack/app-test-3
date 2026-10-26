const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const achievement = { id: '6dcefa92-fff1-4a71-b1f6-ba3f77e9f3ec', title: 'залез в пещеру пауков', rarity: 'mythical',
    medal: { imageUrl: '/assets/achievements/spider-cave-v1.png', modelUrl: '/assets/achievements/spider-cave-v1.glb' },
    grant: { userId: '163665735', name: 'Макс', date: '2026-10-25', issuedAt: 1 } };

(async () => {
    await build({ entryPoints: ['js/medals/renderer.js'], bundle: true, format: 'esm', minify: true,
        outfile: 'dist/assets/achievements/medal-runtime-v1.js' });
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';
        import {initFirebase} from './js/firebase.js';
        import {renderProfiles} from './js/ui/profiles.js';
        import {mountMyAchievements,openMedal,medalStripHtml,wireMedalStrip} from './js/ui/medals.js';
        state.user={id:163665735,username:'maxmolotov'};
        const achievement=${JSON.stringify(achievement)};
        window.testMedals={open:()=>openMedal(achievement),
            profile:()=>{const host=document.getElementById('profile');host.innerHTML=medalStripHtml([achievement],true);wireMedalStrip(host,[achievement]);},
            realProfiles:async()=>{
                const profile={userId:'163665735',name:'Макс',hobbies:'хайкинг',profession:'клуб',updatedAt:1};
                const data={userProfiles:{'163665735':profile},'userProfiles/163665735':profile,routeFavorites:{}};
                window.firebase={initializeApp(){},database:()=>({ref:key=>({once:async()=>({val:()=>data[key]||null})})})};
                initFirebase();state.userCard={status:'active'};state.hikesWithTitle=[];await renderProfiles();
            }};
        mountMyAchievements();` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: width === 900 ? 900 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><h1 id="subtitle"></h1><main id="mainContent"><section id="cardBlock" style="height:150px">карта интеллигента</section><section id="profile"></section></main><nav id="bottomNav"></nav>' });
                if (url.pathname === '/api/achievements') return route.fulfill({ json: { collections: { '163665735': [achievement] } } });
                if (url.pathname.startsWith('/assets/achievements/')) {
                    const file = path.join(url.pathname.endsWith('.js') ? 'dist' : '.', url.pathname);
                    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
                    return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.png') ? 'image/png' : 'model/gltf-binary' });
                }
                return route.fulfill({ json: {} });
            });
            await page.goto('http://localhost:4183/');
            await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
            await page.addScriptTag({ content: 'window.Telegram={WebApp:{initData:"fixture",HapticFeedback:{impactOccurred(){}}}};' });
            await page.addScriptTag({ content: outputFiles[0].text });
            await page.locator('#myAchievements:not([hidden])').waitFor();
            assert.equal(await page.locator('#cardBlock + #myAchievements').count(), 1);
            await page.evaluate(() => testMedals.profile());
            assert.equal(await page.locator('#profile .is-compact .medal-miniature').count(), 1);
            await page.locator('#myAchievements .medal-miniature').click();
            await page.locator('.medal-stage canvas').waitFor({ timeout: 45000 });
            await page.waitForTimeout(400);
            assert.equal(await page.locator('.medal-render-error').count(), 0);
            assert.equal(await page.locator('#mainContent').evaluate(el => el.inert), true);
            assert.equal(await page.locator('.medal-viewer').evaluate(el => el.scrollWidth > el.clientWidth), false);
            await page.screenshot({ path: `/private/tmp/medal-front-${width}.png` });
            await page.locator('[data-side="back"]').click();
            await page.waitForTimeout(1100);
            await page.screenshot({ path: `/private/tmp/medal-back-${width}.png` });
            assert.equal(await page.locator('[data-side="back"]').getAttribute('aria-pressed'), 'true');
            await page.locator('[data-side="front"]').click();
            await page.waitForTimeout(1000);
            const bounds = await page.locator('canvas.medal-canvas').boundingBox();
            await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
            await page.mouse.down();
            await page.mouse.move(bounds.x + bounds.width * .9, bounds.y + bounds.height * .55, { steps: 12 });
            await page.mouse.up();
            await page.waitForTimeout(600);
            await page.screenshot({ path: `/private/tmp/medal-rotated-${width}.png` });
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.medal-viewer').count(), 0);
            assert.equal(await page.locator('#mainContent').evaluate(el => el.inert), false);
            await page.locator('#profile .medal-miniature').click();
            await page.locator('.medal-stage canvas').waitFor();
            await page.locator('.medal-close').click();
            assert.equal(await page.locator('.medal-viewer canvas').count(), 0);
            await page.evaluate(() => testMedals.realProfiles());
            await page.locator('.profile-card[data-user-id="163665735"] .medal-miniature').waitFor();
            assert.equal(await page.locator('.profile-card .medal-miniature').count(), 1);
            await page.screenshot({ path: `/private/tmp/medal-profile-${width}.png`, fullPage: true });
            await page.locator('.profile-card .medal-miniature').click();
            await page.locator('.medal-stage canvas').waitFor();
            await page.locator('.medal-close').click();
            // Capture a transparent thumbnail from the same actual mesh, not a painted approximation.
            if (width === 390) {
                const image = await page.evaluate(async achievement => {
                    const { mountMedalScene } = await import('/assets/achievements/medal-runtime-v1.js');
                    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;width:640px;height:640px'; document.body.appendChild(host);
                    const scene = await mountMedalScene(host, achievement, { snapshot: true });
                    scene.showSide('front', true);
                    const pixels = new Uint8Array(640*640*4);
                    const gl = scene.canvas.getContext('webgl2'); gl.readPixels(0,0,640,640,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                    let nonblank=0,edge=0;
                    for(let y=0;y<640;y++) for(let x=0;x<640;x++) if(pixels[(y*640+x)*4+3]) {nonblank++; if(x<8||y<8||x>631||y>631) edge++;}
                    const png=scene.canvas.toDataURL('image/png');
                    const meshCount=[]; scene.model.traverse(node=>{if(node.isMesh) meshCount.push(node.name);});
                    scene.dispose();host.remove();return {png,nonblank,edge,meshCount};
                }, achievement);
                assert.ok(image.nonblank > 40000, 'Canvas contains the actual medal');
                assert.equal(image.edge, 0, 'Medal is not cropped');
                assert.ok(image.meshCount.includes('spider-abdomen-brand-lime'));
                assert.ok(image.meshCount.length > 50, 'True mesh relief and rigid inscription glyphs');
                fs.writeFileSync('assets/achievements/spider-cave-v1.png', Buffer.from(image.png.split(',')[1], 'base64'));
                console.log('Thumbnail:', image.nonblank, 'visible pixels;', image.meshCount.length, 'meshes');
            }
            assert.deepEqual(errors, []);
            await page.close();
            console.log('Medal UI passed:', width, 'px, home/profile placement, true WebGL, reverse, rotation and cleanup');
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
