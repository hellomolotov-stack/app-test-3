const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('./_playwright.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', plugins: [{name:'test-config',setup(b){b.onLoad({filter:/\/js\/config\.js$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace("REGISTRATION_API_URL = ''", "REGISTRATION_API_URL = 'https://waitlist-test.local/registration'")}));}}], stdin: { resolveDir: root, contents: `
        import {state} from './js/state.js';
        import {v2HomeTopHtml,wireRdHomeTop} from './js/ui/rd-home.js';
        import {renderCalFlow} from './js/ui/cal-flow.js';
        state.user={id:163665735};state.userCard={status:'active'};
        state.hikesList=[{date:'2099-11-15',title:''},{date:'2099-11-22',title:''}];
        state.hikesWithTitle=[];state.hikeBookingStatus=[];state.hikesData=Object.fromEntries(state.hikesList.map(h=>[h.date,h]));
        localStorage.setItem('notifyOptin',JSON.stringify({ok:true}));localStorage.setItem('cfHinted2','1');
        document.getElementById('top').innerHTML=v2HomeTopHtml();wireRdHomeTop();
        renderCalFlow(document.getElementById('calendar'));window.ready=true;
    ` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 844 } });
            let failing = false, requests = [];
            const errors = []; page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', async route => {
                const req = route.request(), url = new URL(req.url());
                if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><div id="top"></div><div id="calendar"></div>' });
                const params = new URLSearchParams(req.postData() || '');
                if (params.get('action') === 'hikeWaitlist') {
                    requests.push({ date: params.get('date'), on: params.get('on') });
                    await new Promise(r => setTimeout(r, 200));
                    return route.fulfill({ json: { status: failing ? 'error' : 'ok' } });
                }
                if (url.pathname.endsWith('past-hikes.json')) return route.fulfill({ json: [] });
                return route.fulfill({ json: { status: 'ok', stories: [], people: [], notes: [] } });
            });
            await page.goto('https://waitlist-test.local');
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
            await page.addScriptTag({ content: outputFiles[0].text });
            await page.waitForFunction(() => window.ready && document.getElementById('v2TeaserBtn'));
            const top = page.locator('#v2TeaserBtn');
            const card = page.locator('.cf-card[data-date="2099-11-15"]');
            const other = page.locator('.cf-card[data-date="2099-11-22"]');
            await page.evaluate(() => { window.cardBefore=document.querySelector('.cf-card'); window.trackBefore=document.querySelector('.cf-track'); });
            await top.click();
            await page.waitForFunction(() => document.querySelector('.cf-card[data-date="2099-11-15"]').classList.contains('is-on'));
            assert.equal(await other.getAttribute('aria-pressed'), 'false');
            await page.waitForFunction(() => !document.getElementById('v2TeaserBtn').disabled);
            assert.deepEqual(requests, [{date:'2099-11-15',on:'yes'}]);
            // Первый тап центрирует карточку, второй меняет подписку.
            await card.evaluate(c => c.click());
            await page.waitForTimeout(700);
            await card.evaluate(c => c.click());
            await page.waitForFunction(() => document.getElementById('v2TeaserBtn').getAttribute('aria-checked') === 'false');
            await page.waitForFunction(() => !document.querySelector('.cf-card[data-date="2099-11-15"]').disabled);
            assert.equal(await page.evaluate(() => localStorage.getItem('hikeAlertsOn')), '0');
            failing = true;
            await top.click();
            await page.waitForFunction(() => !document.getElementById('v2TeaserBtn').disabled);
            assert.equal(await top.getAttribute('aria-checked'), 'false');
            assert.equal(await card.getAttribute('aria-pressed'), 'false');
            assert.equal(await page.evaluate(() => cardBefore===document.querySelector('.cf-card') && trackBefore===document.querySelector('.cf-track')), true);
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Waitlist sync: home to calendar, calendar to home, date isolation, rollback and stable carousel: PASS');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
