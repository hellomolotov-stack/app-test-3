const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: {
        resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';
        import {initFirebase} from './js/firebase.js';
        import {showBottomSheet} from './js/ui/calendar.js';
        const date='2099-01-10';
        const people=Object.fromEntries(Array.from({length:5},(_,i)=>[i,{userId:i+1,name:'участник '+(i+1),timestamp:i+1}]));
        window.firebase={initializeApp(){},database:()=>({ref:path=>({once:async()=>({val:()=>path.startsWith('hikeParticipants/')?people:null}),on:(event,fn)=>fn({val:()=>people}),off(){}})})};
        initFirebase();state.user=null;state.userCard={status:'inactive'};
        state.hikesWithTitle=[{date,title:'тестовый хайк',tags:['12 км'],image:'/assets/box/bg-rock.jpg',features:'описание маршрута '.repeat(180),leaders:[]}];
        state.hikesWithTitle.push({...state.hikesWithTitle[0],date:'2000-01-10'}, {...state.hikesWithTitle[0],date:'2099-01-17'});
        state.hikesList=state.hikesWithTitle;state.hikesData=Object.fromEntries(state.hikesWithTitle.map(h=>[h.date,h]));
        window.footerPreview={render(booked=false,index=0){state.hikeBookingStatus={[index]:booked};showBottomSheet(index);},setUser(id){state.user={id};}};
        footerPreview.render();`
    } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 600]) {
            const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', async route => {
                const u = new URL(route.request().url());
                if (u.host !== 'footer.local') return route.abort();
                if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><main id="mainContent"></main>' });
                if (u.pathname.startsWith('/assets/') && !u.pathname.includes('..')) {
                    const file = path.join(process.cwd(), u.pathname);
                    if (fs.existsSync(file)) return route.fulfill({ path: file });
                }
                return route.abort();
            });
            await page.goto('http://footer.local/');
            await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
            await page.addScriptTag({ content: `window.Telegram={WebApp:{initDataUnsafe:{},HapticFeedback:{impactOccurred(){}},BackButton:{hide(){},show(){},onClick(){},offClick(){}}}};window.toggleShareButton=()=>{};` });
            await page.addScriptTag({ content: outputFiles[0].text });
            for (const booked of [false, true]) {
                if (booked) await page.evaluate(() => footerPreview.render(true));
                await page.locator('.spots-counter-chip').filter({ hasText: 'уже идут' }).waitFor();
                await page.locator('.hb-box-thumb').evaluate(img => img.decode());
                await page.waitForTimeout(450);
                const chip = await page.locator('.floating-sheet-buttons .spots-counter-chip').boundingBox();
                const box = await page.locator('.floating-sheet-buttons .box-plate').boundingBox();
                const badge = page.locator('.box-plate .new-badge');
                assert.equal(await badge.textContent(), 'Новое');
                const badgeBox = await badge.boundingBox();
                assert.ok(badgeBox.x >= box.x && badgeBox.x + badgeBox.width <= box.x + box.width, 'New badge stays inside the plate width');
                assert.ok(badgeBox.y < box.y && badgeBox.y >= chip.y + chip.height, 'New badge sits on the top edge without touching the participant chip');
                const swipe = await page.locator('.floating-sheet-buttons .swipe-track').boundingBox();
                assert.ok(chip.y + chip.height <= box.y, 'Participant chip appears above the hiking box');
                assert.ok(box.y + box.height <= swipe.y, 'The hiking box stays above registration');
                for (const rect of [chip, box, swipe]) assert.ok(rect.x >= -1 && rect.x + rect.width <= width + 1);
                assert.ok(['none', 'normal', '""'].includes(await page.locator('.floating-sheet-buttons').evaluate(el => getComputedStyle(el, '::before').content)), 'No common footer backdrop');
                assert.equal(await page.locator('.box-plate').evaluate(el => el.scrollWidth > el.clientWidth), false);
                await page.screenshot({ path: `/private/tmp/hike-footer-${width}-${booked ? 'booked' : 'guest'}.png` });
            }
            for (const id of [7845375334, 163665735]) {
                await page.evaluate(id => footerPreview.setUser(id), id);
                for (const index of [1, 2]) {
                    await page.evaluate(index => footerPreview.render(false, index), index);
                    assert.equal(await page.locator('.box-plate').count(), 0, 'No box on past or later hikes, including administrators');
                }
                await page.evaluate(() => footerPreview.render(false, 0));
                assert.equal(await page.locator('.box-plate').count(), 1, 'Box stays on the current hike');
            }
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Hike footer passed at 320/390/600: current hike only, no past/later boxes for admins, layout and image intact, booked and unbooked');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
