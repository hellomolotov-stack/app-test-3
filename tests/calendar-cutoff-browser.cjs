const assert = require('node:assert/strict');
const fs = require('node:fs');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';
        import {initFirebase} from './js/firebase.js';
        import {renderCalendar,showBottomSheet,closeBottomSheet} from './js/ui/calendar.js';
        import {initPayment} from './js/api.js';
        const people=Object.fromEntries(Array.from({length:9},(_,i)=>[i,{userId:i+1,name:'участник '+(i+1),timestamp:i+1}]));
        window.firebase={initializeApp(){},database:()=>({ref:path=>({once:async()=>({val:()=>path.startsWith('hikeParticipants/')?people:null}),on:(event,fn)=>fn({val:()=>people}),off(){}})})};
        initFirebase();state.user=null;state.userCard={status:'inactive'};
        state.hikesWithTitle=[
            {date:'2026-10-18',title:'хайк на Парагильмен',start_time:'11:00'},
            {date:'2026-10-25',title:'хайк на Ат-Баш',start_time:'11:00'},
            {date:'2026-11-01',title:'хайк на Ильяс-Кая',start_time:'11:00'},
            {date:'2026-11-08',title:'хайк на Демерджи',start_time:'11:00'}
        ];state.hikesList=state.hikesWithTitle;state.hikesData=Object.fromEntries(state.hikesWithTitle.map(h=>[h.date,h]));
        window.calendarTest={render(){renderCalendar(document.getElementById('calendarContainer'));},open(index,member=false){state.userCard={status:member?'active':'inactive'};showBottomSheet(index);},close:closeBottomSheet,
            placeholder(){state.hikesWithTitle[2].title='';state.hikesWithTitle[2].emoji='⛰️';state.hikesData['2026-11-01']=state.hikesWithTitle[2];this.render();},
            async payment(){try{await initPayment({userId:'123',hikeDate:'2026-10-25',cardType:'ticket'});return 'unexpected';}catch(e){return e.code;}}}; calendarTest.render();` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId: 'America/Los_Angeles', hasTouch: true });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', route => route.request().url() === 'http://calendar.local/'
                ? route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><main id="mainContent"><div class="card-container" id="calendarContainer"></div></main>' }) : route.abort());
            await page.goto('http://calendar.local/');
            await page.clock.install({ time: new Date('2026-10-25T11:59:55+03:00') });
            await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
            await page.addScriptTag({ content: `window.Telegram={WebApp:{initDataUnsafe:{},HapticFeedback:{impactOccurred(){}},BackButton:{hide(){},show(){},onClick(){},offClick(){}}}};window.toggleShareButton=()=>{};` });
            await page.addScriptTag({ content: outputFiles[0].text });
            await page.getByText('осталось 1 место', { exact: true }).waitFor();
            assert.equal(await page.locator('.ef-label.is-soon').textContent(), 'ближайший хайк · 25 октября');
            await page.clock.fastForward(5200);
            await page.locator('.ef-next[data-open="2026-11-01"]').waitFor();
            assert.equal(await page.locator('.ef-label.is-soon').textContent(), 'ближайший хайк · 1 ноября');
            assert.equal(await page.locator('[data-seats-for="2026-10-25"]').count(), 0);
            assert.equal(await page.locator('.ef-next .ef-tk-go').textContent(), 'записаться');
            assert.equal(await page.locator('.ef-upcoming-month').count(), 0);
            assert.equal(await page.locator('.ef-list [data-open="2026-11-01"]').count(), 0, 'November never appears inside October history');
            assert.equal(await page.locator('.ef-list [data-open="2026-10-25"] .ef-near').textContent(), 'уже идём');
            assert.equal(await page.locator('.ef-month-title').textContent(), 'октябрь: 2 события');
            assert.equal(await page.evaluate(() => calendarTest.payment()), 'REGISTRATION_CLOSED');
            assert.equal(await page.locator('#calendarContainer').evaluate(el => el.scrollWidth > el.clientWidth), false);
            await page.screenshot({ path: '/private/tmp/calendar-cutoff-' + width + '.png', fullPage: true });
            for (const member of [false, true]) {
                await page.evaluate(member => calendarTest.open(1, member), member);
                assert.equal(await page.locator('.floating-sheet-buttons .swipe-track').count(), 0);
                assert.ok((await page.locator('.floating-sheet-buttons').textContent()).includes('запись закрыта'));
                await page.evaluate(() => calendarTest.close());
            }
            await page.clock.setSystemTime(new Date('2026-10-25T15:59:59+03:00'));
            await page.evaluate(() => calendarTest.render());
            assert.equal(await page.locator('.ef-list [data-open="2026-10-25"] .ef-near').textContent(), 'уже идём');
            await page.clock.fastForward(1200);
            assert.equal(await page.locator('.ef-label.is-soon').textContent(), 'ближайший хайк · 1 ноября');
            assert.equal(await page.locator('.ef-list [data-open="2026-10-25"] .ef-near').textContent(), 'хайк завершён');
            await page.evaluate(() => calendarTest.open(1));
            assert.ok((await page.locator('.floating-sheet-buttons').textContent()).includes('хайк завершён'));
            assert.equal(await page.locator('.floating-sheet-buttons .swipe-track').count(), 0);
            await page.evaluate(() => calendarTest.close());
            await page.locator('[data-month="2026-11"]').click();
            assert.equal(await page.locator('.ef-upcoming-month').count(), 0);
            assert.equal(await page.locator('.ef-list [data-open="2026-11-01"]').count(), 1);
            await page.clock.setSystemTime(new Date('2026-10-26T09:00:00+03:00'));
            await page.evaluate(() => calendarTest.render());
            assert.equal(await page.locator('.ef-label.is-soon').textContent(), 'ближайший хайк · 1 ноября');
            assert.equal(await page.locator('.ef-next').getAttribute('data-open'), '2026-11-01');
            await page.locator('[data-month="2026-10"]').click();
            assert.equal(await page.locator('.ef-list [data-open="2026-11-01"]').count(), 0);
            await page.evaluate(() => calendarTest.placeholder());
            assert.equal(await page.locator('.ef-next [data-notify="2026-11-01"]').count(), 1, 'unpublished November hike is promoted to the standalone card');
            assert.ok((await page.locator('.ef-next').textContent()).includes('готовим хайк'));
            await page.locator('[data-month="2026-10"]').click();
            assert.equal(await page.locator('.ef-list [data-notify="2026-11-01"]').count(), 0);
            await page.screenshot({ path: '/private/tmp/calendar-separated-' + width + '.png', fullPage: true });
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Calendar browser passed at 320/390/900: live Moscow cutoff, no seats or registration after cutoff, member/guest footer, next-month route, no duplicates and next-day promotion');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
