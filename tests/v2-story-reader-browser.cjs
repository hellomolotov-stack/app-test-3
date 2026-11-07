const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('./_playwright.cjs');

const root = path.resolve(__dirname, '..');
const people = [
    { userId: '7845375334', name: 'Интеллигентная поддержка' },
    { userId: '1', name: 'Аня' }, { userId: '2', name: 'Борис' }, { userId: '3', name: 'Вера' },
    { userId: '4', name: 'Глеб' }, { userId: '5', name: 'Даша' }, { userId: '6', name: 'Егор' },
    { userId: '7', name: 'Интеллигентная поддержка 🤖' },
];

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: root, contents: `
        import {state} from './js/state.js';
        import {initFirebase} from './js/firebase.js';
        import {renderHome} from './js/ui/home.js';
        import {openMmReader} from './js/ui/mm-reader.js';
        import {openStories} from './js/ui/club-stories.js';
        import {initSheetDrag} from './js/ui/sheet-drag.js';
        const people=${JSON.stringify(people)};
        window.firebase={initializeApp(){},database:()=>({ref:p=>({once:async()=>({val:()=>p.startsWith('hikeParticipants/')?people:null}),on:(e,cb)=>cb({val:()=>null}),off(){}})})};
        initFirebase();initSheetDrag();
        state.user={id:'123',username:'reader_test',first_name:'Аня'};
        state.userCard={status:'inactive'};state.profiles={};state._userRegs={};
        state.hikesList=[];state.hikesWithTitle=[];state.hikesData={};
        state.mmNotes=[{id:'note',date:'2026-10-25',place:'Ат-Баш',title:'Как вернуть интерес к жизни',body:'## Запрос\\nХочу найти время для важного\\n\\n## Что прозвучало\\nНачать с малого',locked:true}];
        window.v2Test={
            home(member){state.userCard={status:member?'active':'inactive',cardUrl:'assets/card-front.jpg',hikes:7};renderHome();},
            reader(){state.userCard={status:'inactive'};return openMmReader('note');},
            story(member,summary=false){state.userCard={status:member?'active':'inactive'};openStories([{id:'test',type:summary?'summary':'member',title:'Новый владелец карты',image:'assets/card-front.jpg',date:Date.now(),button:{label:'записаться на хайк',action:summary?'mm:note':'hike'}}]);}
        };
    ` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    async function pageFor(width = 390) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => {
            const u = new URL(route.request().url());
            if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="ru" class="v2"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><header class="header"><h1 id="subtitle"></h1></header><main id="mainContent" class="content"></main><nav id="bottomNav"></nav><div id="navPopup"></div></html>' });
            if (u.pathname === '/api/going') return route.fulfill({ json: { going: Object.fromEntries((u.searchParams.get('d') || '').split(',').map(date => [date, people])) } });
            if (u.pathname.startsWith('/assets/')) {
                const f = path.join(root, u.pathname);
                if (fs.existsSync(f)) return route.fulfill({ path: f });
            }
            return route.fulfill({ json: { status: 'ok', going: {}, stories: [], collections: {}, people: [], links: [], stats: {} } });
        });
        await page.goto('https://v2-test.local');
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
        await page.addScriptTag({ content: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{},HapticFeedback:{impactOccurred(){},selectionChanged(){}},BackButton:{hide(){},show(){},onClick(){},offClick(){}}}};window.toggleShareButton=()=>{};' });
        await page.addScriptTag({ content: outputFiles[0].text });
        return page;
    }
    async function swipeUp(page) {
        const client = await page.context().newCDPSession(page);
        const x = page.viewportSize().width / 2;
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 480 }] });
        for (const y of [450, 410, 360, 300]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await client.detach();
    }
    try {
        for (const width of [320, 390, 600]) {
            const page = await pageFor(width);
            await page.evaluate(() => v2Test.home(true));
            await page.locator('.mst-chips').waitFor();
            assert.match(await page.locator('.mst-chips').textContent(), /20\+ владельцев карты/);
            assert.doesNotMatch(await page.locator('.mst-chips').textContent(), /в месяц/);
            if (process.env.V2_SCREENSHOTS) await page.locator('.mst-chips').locator('..').screenshot({ path: path.join(process.env.V2_SCREENSHOTS, `metrics-${width}.png`) });
            await page.evaluate(() => v2Test.reader());
            await page.locator('.mmr-ptxt').waitFor();
            assert.equal(await page.locator('.mmr-ptxt').textContent(), 'Аня, Борис, Вера и ещё 3');
            assert.equal(await page.locator('.mmr-ptxt small').count(), 0);
            assert.equal(await page.locator('.mmr-head .mmr-sub').count(), 0);
            assert.equal(await page.locator('.mmr-top .k').textContent(), '25 октября · саммари мастермайнда');
            assert.equal(await page.locator('.mmr-avs i').count(), 6);
            await page.locator('.mmr-overlay').evaluate(el => el.style.zIndex = '3600');
            for (let attempt = 0; attempt < 3; attempt++) {
                await page.locator('.mmr-btn[data-card]').tap();
                await page.locator('.cs-overlay.is-on').waitFor();
                await page.waitForTimeout(400);
                assert.equal(await page.locator('.cs-overlay').count(), 1);
                const layer = await page.locator('.cs-overlay').evaluate(el => ({ card: +getComputedStyle(el).zIndex, reader: +getComputedStyle(document.querySelector('.mmr-overlay')).zIndex }));
                assert.ok(layer.card > layer.reader);
                await page.locator('.cs-overlay .cs-grab').tap();
                await page.waitForTimeout(350);
                assert.equal(await page.locator('.cs-overlay').count(), 0);
                assert.equal(await page.locator('.mmr-overlay.is-on').count(), 1);
                assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
            }
            if (process.env.V2_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.V2_SCREENSHOTS, `reader-${width}.png`) });
            await page.close();
        }
        for (const member of [false, true]) for (const action of ['swipe', 'button']) {
            const page = await pageFor();
            await page.evaluate(member => v2Test.story(member), member);
            assert.equal(await page.locator('.csv-btn').textContent(), member ? 'подарить карту' : 'узнать о карте');
            if (process.env.V2_SCREENSHOTS && action === 'swipe') await page.screenshot({ path: path.join(process.env.V2_SCREENSHOTS, `story-${member ? 'member' : 'guest'}.png`) });
            if (action === 'swipe') await swipeUp(page); else await page.locator('.csv-btn').tap();
            await page.locator('.cs-overlay.is-on').waitFor();
            assert.match(await page.locator('.cs-hero h2').textContent(), member ? /подари новый опыт/ : /интеллигентное окружение/);
            assert.equal(await page.locator('.csv-overlay').count(), 0);
            await page.close();
        }
        const page = await pageFor();
        await page.evaluate(() => v2Test.story(false, true));
        await swipeUp(page);
        await page.locator('.mmr-overlay.is-on').waitFor();
        await page.locator('.mmr-btn[data-card]').tap();
        await page.locator('.cs-overlay.is-on').waitFor();
        await page.waitForTimeout(500);
        assert.equal(await page.locator('.csv-overlay').count(), 0);
        assert.equal(await page.locator('.cs-overlay').count(), 1);
        assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
        await page.close();
        assert.deepEqual(errors, []);
        console.log('V2 metrics, summary participants, card overlays and member-story actions: PASS');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
