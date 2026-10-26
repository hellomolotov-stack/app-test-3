const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createHandler } = require('../api/achievements');

process.env.TELEGRAM_BOT_TOKEN = 'browser-fixture-only';
const params = new URLSearchParams({ user: JSON.stringify({ id: 163665735, username: 'maxmolotov' }), auth_date: String(Math.floor(Date.now() / 1000)) });
const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
params.set('hash', crypto.createHmac('sha256', secret).update([...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n')).digest('hex'));
const initData = params.toString();
const people = { '101': { name: 'Анна', username: 'anna' }, '102': { name: 'Илья <script>alert(1)</script>', username: 'ilya' } };
const members = { '101': { user_id: '101' }, '103': { user_id: '103', first_name: 'Максим' } };
const roster = { '101': { name: 'Анна', timestamp: 1 }, '104': { name: 'Мария', timestamp: 2 } };
let records = {}, versions = {}, saves = 0, failList = false, failSave = false, conflict = false;
const clone = value => JSON.parse(JSON.stringify(value));
const handler = createHandler({ getAccessToken: async () => 'fixture', fetch: async (url, options = {}) => {
    const path = String(url).split('.app/')[1]?.replace(/\.json$/, '');
    if (path === 'userProfiles') return Response.json(people);
    if (path === 'members') return Response.json(members);
    if (path?.startsWith('hikeParticipants/')) return Response.json(roster);
    if (path === 'clubAchievements') return Response.json(records);
    const id = path?.replace('clubAchievements/', '');
    const revision = versions[id] ? `v_${versions[id]}` : 'null_etag';
    if (options.method === 'PUT') {
        if (conflict) { conflict = false; return new Response('', { status: 412 }); }
        if (options.headers['If-Match'] !== revision) return new Response('', { status: 412 });
        records[id] = JSON.parse(options.body); versions[id] = (versions[id] || 0) + 1; saves++;
        return Response.json(records[id]);
    }
    return Response.json(clone(records[id] || null), { headers: { etag: revision } });
} });

(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: process.cwd(), contents: `
        import {state} from './js/state.js';
        import {openAdmin} from './js/ui/admin.js';
        state.user={id:163665735,username:'maxmolotov'};
        state.hikesData={'2026-10-25':{title:'хайк на Ат-Баш'},'2026-11-01':{title:'хайк на Ильяс-Кая'},'2026-10-24':{title:'вечер клуба',city:'yes'}};
        window.testAdmin={open:()=>openAdmin('achievements'),guest:()=>{state.user={id:999,username:'visitor'};openAdmin('achievements');}};
        testAdmin.open();` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            records = {}; versions = {}; saves = 0; failList = true; failSave = false; conflict = false;
            const page = await browser.newPage({ viewport: { width, height: 1050 }, timezoneId: 'America/Los_Angeles', hasTouch: true });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><main id="mainContent"></main>' });
                if (url.pathname !== '/api/achievements') return route.fulfill({ contentType: 'application/json', body: '{"status":"ok","templates":{}}' });
                const body = route.request().postDataJSON();
                if (body.action === 'list' && failList) { failList = false; return route.fulfill({ status: 502, json: { error: 'тестовая ошибка связи' } }); }
                if (body.action === 'save' && failSave) { failSave = false; return route.fulfill({ status: 502, json: { error: 'не удалось сохранить — повтори' } }); }
                const response = { status: 200 };
                await handler({ method: 'POST', body }, { setHeader() {}, status(code) { response.status = code; return this; }, json(value) { response.value = value; return this; } });
                return route.fulfill({ status: response.status, json: response.value });
            });
            await page.goto('http://localhost:4182/');
            await page.clock.install({ time: new Date('2026-10-26T10:00:00+03:00') });
            await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
            await page.addScriptTag({ content: `window.Telegram={WebApp:{initData:${JSON.stringify(initData)},initDataUnsafe:{user:{id:163665735,username:'maxmolotov'}},HapticFeedback:{impactOccurred(){}},BackButton:{hide(){},show(){},onClick(){},offClick(){}}}};` });
            await page.addScriptTag({ content: outputFiles[0].text });
            await page.getByText('тестовая ошибка связи', { exact: true }).waitFor();
            await page.locator('#awRetry').click();
            await page.locator('#awNew').click();
            await page.locator('[data-pick="101"]').waitFor();
            assert.equal(await page.locator('#awHike').inputValue(), '2026-10-25');
            assert.equal(await page.locator('#awDate').inputValue(), '2026-10-25');
            assert.equal(await page.locator('#awSave').isDisabled(), true, 'No automatic attendance selection');
            await page.locator('#awTitle').fill('залез в пещеру пауков');
            await page.locator('[name="awRarity"][value="mythical"]').check();
            await page.locator('[data-pick="101"]').check();
            await page.locator('[data-pick="104"]').check();
            await page.locator('[data-name="104"]').fill('Мария на медали');
            await page.locator('[data-date="104"]').fill('2026-10-24');
            await page.locator('#awDate').fill('2026-10-26');
            await page.locator('#awDate').dispatchEvent('change');
            assert.equal(await page.locator('[data-date="101"]').inputValue(), '2026-10-26');
            assert.equal(await page.locator('[data-date="104"]').inputValue(), '2026-10-24', 'Date edits keep personal overrides');
            await page.locator('#awScope').selectOption('all');
            await page.locator('#awSearch').fill('@ilya');
            assert.equal(await page.locator('[data-pick]').count(), 1);
            assert.equal(await page.locator('.aw-people script').count(), 0, 'Profile text never becomes HTML');
            await page.locator('#awSearch').fill('');
            assert.equal(await page.locator('.aw-admin').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'No horizontal overflow');
            await page.screenshot({ path: '/private/tmp/achievements-admin-form-' + width + '.png', fullPage: true });
            failSave = true;
            await page.locator('#awSave').click();
            await page.locator('#awError').filter({ hasText: 'не удалось сохранить' }).waitFor();
            assert.equal(await page.locator('#awTitle').inputValue(), 'залез в пещеру пауков');
            assert.equal(await page.locator('[data-name="104"]').inputValue(), 'Мария на медали');
            await page.locator('#awSave').click();
            await page.getByText('ачивка сохранена', { exact: true }).waitFor();
            assert.equal(saves, 1);
            const id = Object.keys(records)[0];
            assert.deepEqual(Object.keys(records[id].recipients).sort(), ['101', '104']);
            assert.equal(records[id].medal, null);
            assert.equal(records[id].rarity, 'mythical');
            await page.screenshot({ path: '/private/tmp/achievements-admin-saved-' + width + '.png', fullPage: true });
            await page.locator('#awEditSaved').click();
            await page.locator('[data-name="104"]').waitFor();
            assert.equal(await page.locator('[data-name="104"]').inputValue(), 'Мария на медали');
            await page.locator('[data-remove="104"]').click();
            conflict = true;
            await page.locator('#awSave').click();
            await page.locator('#awReload').waitFor();
            assert.equal(await page.locator('[data-name="101"]').count(), 1);
            await page.locator('#awReload').click();
            await page.locator('[data-name="104"]').waitFor();
            await page.locator('[data-remove="104"]').click();
            await page.locator('#awSave').click();
            await page.getByText('ачивка сохранена', { exact: true }).waitFor();
            assert.deepEqual(Object.keys(records[id].recipients), ['101']);
            await page.locator('#awBack').click();
            await page.locator('[data-filter="ready"]').click();
            assert.equal(await page.locator('.aw-award').count(), 0);
            await page.locator('[data-filter="awaiting_medal"]').click();
            assert.equal(await page.locator('.aw-award').count(), 1);
            await page.locator('#awNew').click();
            await page.locator('[data-pick="101"]').waitFor();
            await page.locator('#awKind').selectOption('route');
            assert.equal(await page.locator('#awTitle').inputValue(), 'хайк на Ат-Баш');
            assert.equal(await page.locator('[name="awRarity"][value="common"]').isChecked(), true);
            await page.locator('.adm-close').click();
            await page.evaluate(() => testAdmin.open());
            await page.locator('.aw-award').waitFor();
            assert.equal(await page.locator('.aw-award').count(), 1, 'Awards survive reopening');
            await page.locator('.adm-close').click();
            await page.evaluate(() => testAdmin.guest());
            assert.equal(await page.locator('.adm').count(), 0, 'Visitors cannot open admin UI');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Achievements browser passed at 320/390/900: real admin tab, errors/retry, roster, explicit recipients, search/XSS, rarity, personal engraving/date, persisted grants, revocation, CAS recovery and guest gating');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
