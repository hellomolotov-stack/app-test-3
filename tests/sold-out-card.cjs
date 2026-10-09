const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const cardImage = 'data:image/jpeg;base64,' + fs.readFileSync('assets/card-front.jpg').toString('base64');
const cardSource = fs.readFileSync('js/ui/card-sheet.js', 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '').replace(/export /g, '')
    .replaceAll('assets/card-front.jpg', cardImage);
const calendarSource = fs.readFileSync('js/ui/calendar.js', 'utf8');
const floatingSource = calendarSource.slice(calendarSource.indexOf('function updateFloatingSheetButtons()'), calendarSource.indexOf('// «Возвращающийся»')).replaceAll('assets/card-front.jpg', cardImage);
const css = fs.readFileSync('style.css', 'utf8');
const fixture = `
    const state = { user: {id:123}, userCard: {status:'inactive'}, popupConfig: {}, profiles: {}, metrics: {}, _userRegs: {}, hikeBookingStatus: {}, hikesWithTitle: [{date:'2099-01-02',title:'Тестовый хайк'}] };
    const HIKE_CAPACITY = 10;
    const tg = null;
    const haptic = () => {};
    const log = () => {};
    const isAdmissionPilot = () => false;
    const requireAdmission = async () => true;
    const getCardOffer = async () => null;
    const fillPlus1Slot = () => {};
    const curSheetIndex = () => 0;
    const getPlaceWord = () => 'место';
    const renderSwipeControl = () => {const control=document.createElement('div');control.className='test-swipe';return control;};
`;

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 844 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent(`<style>${css}</style><main><h1>тестовый хайк</h1></main><div class="floating-sheet-buttons"></div>`);
            await page.addScriptTag({ content: fixture + cardSource + floatingSource });
            await page.evaluate(() => { window._participantCount=10;updateFloatingSheetButtons(); });
            assert.equal(await page.locator('.so-card-text b').textContent(), 'места закончились');
            assert.equal(await page.locator('.so-card-text span').textContent(), 'но владельцы карты могут прийти');
            await page.screenshot({ path: `/private/tmp/sold-out-plate-${width}.png` });
            await page.locator('.so-card-plate.is-link').click();
            await page.locator('.cs-overlay.is-on').waitFor();
            await page.waitForFunction(() => getComputedStyle(document.querySelector('.cs-sheet')).transform === 'none');
            assert.equal(await page.locator('#csTicket').count(), 0, 'No ticket offer from the sold-out plate');
            assert.equal(await page.locator('#csBuy').count(), 1, 'Card purchase remains available');
            const overflow = await page.locator('.so-card-text').evaluate(element => element.scrollWidth > element.clientWidth);
            assert.equal(overflow, false, `Sold-out label fits at ${width}px`);
            await page.screenshot({ path: `/private/tmp/sold-out-card-${width}.png` });
            await page.locator('.cs-grab').click();
            await page.waitForFunction(() => !document.querySelector('.cs-overlay'));
            await page.evaluate(() => {
                window._participantCount=9;updateFloatingSheetButtons();
                openCardSheet({source:'попап: хайк',hikeDate:state.hikesWithTitle[0].date,hikeTitle:state.hikesWithTitle[0].title});
            });
            assert.equal(await page.locator('.so-card-plate.is-link').count(), 0);
            assert.equal(await page.locator('#csTicket').count(), 1, 'Ticket option remains when seats are available');
            await page.locator('.cs-grab').click();
            await page.waitForFunction(() => !document.querySelector('.cs-overlay'));
            await page.evaluate(() => openCardSheet({gift:true}));
            assert.equal(await page.locator('#csTicket').count(), 0, 'Gift mode is unchanged');
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Sold-out card passed: 320/390/900px, new label, no ticket after sold-out plate, ticket with seats, gift unchanged');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
