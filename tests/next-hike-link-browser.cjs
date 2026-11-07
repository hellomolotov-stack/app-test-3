const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('./_playwright.cjs');

const root = path.resolve(__dirname, '..');
const hikes = [
    { date: '2026-10-25', title: 'хайк на Ат-Баш' },
    { date: '2026-11-08', title: 'хайк на Аю-Даг' },
    { date: '2026-11-09', title: '', city: 'Yes' },
    { date: '2026-11-10', title: '', book_club: true },
    { date: '2026-11-11', title: '', cancelled: 'YES' },
    { date: '2026-11-12', title: '', emoji: '🌧️' },
    { date: '2026-11-13', title: '', emoji: '🏄🏻‍♂️' },
    { date: '2026-11-15', title: '', emoji: '⛰️' },
    { date: '2026-11-22', title: '', emoji: '⛰️' },
];

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', plugins: [{ name: 'test-config', setup(b) {
        b.onLoad({ filter: /\/js\/config\.js$/ }, () => ({ loader: 'js', contents: fs.readFileSync(path.join(root, 'js/config.template.js'), 'utf8').replace('REGISTRATION_API_URL_PLACEHOLDER', 'https://calendar-test.local/api/registration') }));
    } }], stdin: { resolveDir: root, contents: `
        import {state} from './js/state.js';
        import {renderCalFlow} from './js/ui/cal-flow.js';
        import {focusNextUnopenedHike,nextUnopenedHike,nextHikeLinkActive} from './js/ui/next-hike-link.js';
        state.user={id:123,first_name:'Аня'};state.userCard={status:'inactive'};state.hikesList=${JSON.stringify(hikes)};
        const apply=()=>{state.hikesWithTitle=state.hikesList.filter(h=>h.title);state.hikesData=Object.fromEntries(state.hikesList.map(h=>[h.date,h]));renderCalFlow(document.getElementById('calendarContainer'));};
        window.linkTest={
            start(member=false,empty=false){
                state.userCard.status=member?'active':'inactive';if(empty)state.hikesList=[];
                window.loaderReady=false;let release;const gate=new Promise(r=>release=r);
                window.releaseLink=()=>{window.loaderReady=true;release();};
                focusNextUnopenedHike({gate,ready:()=>window.loaderReady,topOffset:()=>76});apply();
            },
            render:apply,
            late(){document.getElementById('above').style.height='860px';apply();},
            load(){state.hikesList=${JSON.stringify(hikes)};apply();},
            publish(){state.hikesList.find(h=>h.date==='2026-11-15').title='хайк на Кант';apply();},
            noTeasers(){state.hikesList=state.hikesList.filter(h=>h.title);apply();},
            active:nextHikeLinkActive,
            selected:()=>nextUnopenedHike()?.date,
            choose:(list,now)=>nextUnopenedHike(list,new Date(now))?.date||null,
        };
    ` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    async function pageFor(width = 390, reducedMotion = 'no-preference') {
        const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 844 }, hasTouch: true, reducedMotion });
        const mutations = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => {
            const request = route.request(), url = new URL(request.url());
            if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="ru" class="v2"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main class="app"><div id="above" style="height:680px">главная</div><div id="calendarContainer"></div><div style="height:900px"></div></main></html>' });
            if (url.pathname === '/api/registration') {
                mutations.push(Object.fromEntries(new URLSearchParams(request.postData() || '')));
                return route.fulfill({ json: { status: 'ok' } });
            }
            if (url.pathname.endsWith('past-hikes.json')) return route.fulfill({ json: [] });
            if (url.pathname.startsWith('/assets/')) {
                const file = path.join(root, url.pathname);
                if (fs.existsSync(file)) return route.fulfill({ path: file });
            }
            return route.fulfill({ json: { status: 'ok', going: {} } });
        });
        await page.goto('https://calendar-test.local/?startapp=next_hike');
        await page.clock.setFixedTime(new Date('2026-11-07T16:00:00Z'));
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
        await page.addScriptTag({ content: 'window.Telegram={WebApp:{initData:"test-signature",initDataUnsafe:{user:{id:123,allows_write_to_pm:true}},HapticFeedback:{impactOccurred(){},selectionChanged(){}}}};' });
        await page.addScriptTag({ content: outputFiles[0].text });
        return { page, mutations };
    }
    async function assertTarget(page, date = '2026-11-15') {
        await page.locator(`.cf-card[data-date="${date}"].calendar-link-flash`).waitFor();
        const geometry = await page.locator(`.cf-card[data-date="${date}"]`).evaluate(el => {
            const track = el.parentElement.getBoundingClientRect(), card = el.getBoundingClientRect();
            const cal = document.getElementById('calendarContainer').getBoundingClientRect();
            return { alignment: Math.abs((card.left + card.right - track.left - track.right) / 2), top: cal.top, bottom: card.bottom };
        });
        assert.ok(geometry.alignment < 1, `Horizontal centering: ${geometry.alignment}`);
        assert.ok(Math.abs(geometry.top - 76) < 2, `Vertical scroll: ${geometry.top}`);
        assert.ok(geometry.bottom < page.viewportSize().height - 20, 'Bell card is fully visible');
    }
    try {
        for (const [width, member] of [[320, false], [390, true], [600, false]]) {
            const { page, mutations } = await pageFor(width);
            await page.evaluate(member => linkTest.start(member), member);
            assert.equal(await page.evaluate(() => linkTest.selected()), '2026-11-15');
            await page.waitForTimeout(400);
            assert.equal(await page.evaluate(() => scrollY), 0, 'Wait for loader and achievement gate');
            await page.evaluate(() => { releaseLink(); setTimeout(() => linkTest.late(), 600); });
            await assertTarget(page);
            assert.deepEqual(mutations, [], 'Deep link must not subscribe automatically');
            if (process.env.CALENDAR_SCREENSHOTS) {
                await page.waitForTimeout(650);
                await page.screenshot({ path: path.join(process.env.CALENDAR_SCREENSHOTS, `next-hike-${width}.png`) });
            }
            await page.evaluate(() => linkTest.render());
            await page.waitForTimeout(250);
            await assertTarget(page);
            await page.locator('.cf-card[data-date="2026-11-15"]').tap();
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('hikeWaitlist') || '{}')['2026-11-15'] === true);
            await page.waitForTimeout(100);
            assert.equal(mutations.length, 1);
            assert.equal(mutations[0].action, 'hikeWaitlist');
            assert.equal(mutations[0].date, '2026-11-15');
            assert.equal(await page.evaluate(() => linkTest.active()), false, 'Stop automatic navigation on touch');
            await page.close();
        }
        {
            const { page } = await pageFor();
            await page.evaluate(() => { linkTest.start(false, true); releaseLink(); setTimeout(() => linkTest.load(), 700); });
            await assertTarget(page);
            await page.evaluate(() => linkTest.publish());
            await assertTarget(page, '2026-11-22');
            await page.close();
        }
        {
            const { page } = await pageFor(390, 'reduce');
            assert.equal(await page.evaluate(h => linkTest.choose(h, '2026-11-07T16:00:00Z'), [...hikes].reverse()), '2026-11-15');
            assert.equal(await page.evaluate(() => linkTest.choose([{date:'2026-11-07',start_time:'11:00',title:''}], '2026-11-07T08:30:00Z')), null, 'Do not offer an already started hike');
            await page.evaluate(() => { linkTest.start(); releaseLink(); });
            await assertTarget(page);
            await page.waitForTimeout(2900);
            assert.equal(await page.locator('.calendar-link-flash').count(), 0, 'Temporary highlight clears');
            await page.close();
        }
        {
            const { page } = await pageFor();
            await page.evaluate(() => { linkTest.start(); linkTest.noTeasers(); releaseLink(); });
            await page.locator('#calendarContainer.calendar-link-flash').waitFor();
            await page.close();
        }
        {
            const { page } = await pageFor();
            await page.evaluate(() => { linkTest.start(); releaseLink(); });
            await page.waitForTimeout(500);
            await page.mouse.wheel(0, 50);
            await page.waitForFunction(() => !linkTest.active());
            await page.waitForTimeout(100);
            const y = await page.evaluate(() => scrollY);
            await page.waitForTimeout(500);
            assert.equal(await page.evaluate(() => scrollY), y, 'Do not fight user scrolling');
            await page.close();
        }
        assert.deepEqual(errors, []);
        console.log('Next-hike link: selection, loading, rerenders, bell, fallback, reduced motion and cancellation: PASS');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
