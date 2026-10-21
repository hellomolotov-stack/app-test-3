const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = process.env.PREVIEW_URL || 'http://localhost:4186/?screen=ticket';

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        let paymentCount = 0, failPayment = false, releasePayment;
        const errors = [], alerts = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => { alerts.push(dialog.message()); dialog.dismiss(); });
        await page.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body:
            fs.readFileSync('js/config.js', 'utf8').replace("REGISTRATION_API_URL = ''", "REGISTRATION_API_URL = '/api/test-payment'") }));
        await page.route('**/api/test-payment', async route => {
            const params = new URLSearchParams(route.request().postData());
            if (params.get('action') !== 'initPayment') return route.fulfill({ json: { status: 'ok' } });
            paymentCount++;
            await new Promise(resolve => { releasePayment = resolve; });
            if (failPayment) return route.fulfill({ json: { status: 'error', message: 'test offline' } });
            const url = new URL('https://auth.robokassa.ru/Merchant/Index.aspx');
            url.searchParams.set('OutSum', '1200');
            url.searchParams.set('InvId', 'test');
            url.searchParams.set('SignatureValue', 'test');
            url.searchParams.set('Receipt', encodeURIComponent(JSON.stringify({ items: [{ name: 'билет на хайк', quantity: 1, sum: 1200, tax: 'none' }] })));
            return route.fulfill({ json: { status: 'ok', card_type: 'ticket', amount: 1200, url: url.href } });
        });
        await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {} }));

        async function open(query = '') {
            await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.previewTicket);
            await page.locator('.swipe-thumb').waitFor();
            await page.waitForTimeout(100);
        }
        async function swipe(partial = false) {
            await page.locator('.swipe-thumb').evaluate(async thumb => {
                await Promise.all(thumb.getAnimations().map(animation => animation.finished.catch(() => {})));
            });
            await page.locator('.swipe-track').evaluate((el, partial) => {
                const rect = el.getBoundingClientRect();
                const thumb = el.querySelector('.swipe-thumb').getBoundingClientRect();
                const start = thumb.left + thumb.width / 2;
                const end = partial ? start + 35 : rect.right - 12;
                const send = (type, x) => {
                    const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: rect.top + rect.height / 2 });
                    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch] }));
                };
                send('touchstart', start);
                for (let i = 1; i <= 12; i++) send('touchmove', start + (end - start) * i / 12);
                send('touchend', end);
            }, partial);
        }
        async function atRight() {
            return page.locator('.swipe-track').evaluate(el => {
                const thumb = el.querySelector('.swipe-thumb');
                return Math.abs(parseFloat(thumb.style.left) - (el.clientWidth - thumb.offsetWidth - 8)) < 1;
            });
        }
        await open();
        await page.evaluate(() => { window.previewTicket.haptics.length = 0; });
        await swipe(true);
        assert.equal(await page.evaluate(() => window.previewTicket.haptics.length), 1, 'One haptic during a right drag');
        assert.equal(await page.locator('#choiceButBtn').count(), 0, 'Partial swipe does not book');
        await swipe();
        await page.locator('#choiceButBtn').waitFor();
        assert.equal(await page.evaluate(() => window.previewTicket.haptics.length), 2, 'One haptic per drag, not per move');
        assert.equal(await atRight(), true);
        await page.locator('.modal-overlay').tap({ position: { x: 4, y: 4 } });
        assert.equal(await atRight(), false, 'Dismissing the choice restores an available slider');
        await swipe();
        await page.locator('#choiceButBtn').waitFor();
        await page.locator('#choiceButBtn').click();
        await page.waitForFunction(() => document.querySelector('.swipe-track')?.dataset.paymentState === 'creating');
        assert.equal(await atRight(), true, 'Creating invoice never resets the thumb');
        await page.waitForFunction(() => window.previewTicket.links.length === 0);
        await page.waitForTimeout(100);
        releasePayment();
        await page.waitForFunction(() => window.previewTicket.links.length === 1);
        assert.equal(await page.locator('.swipe-track').getAttribute('data-payment-state'), 'waiting');
        assert.equal(await atRight(), true);
        assert.equal(await page.locator('.swipe-payment-dots i').count(), 3);
        assert.equal(await page.locator('.swipe-hint').textContent(), 'ожидаем оплату');
        assert.equal(await page.evaluate(() => window.previewTicket.writes.length), 0, 'No booking is written before payment');
        assert.equal(paymentCount, 1);
        await page.screenshot({ path: '/tmp/ticket-pending-390.png' });
        for (const width of [320, 390]) {
            await page.setViewportSize({ width, height: 844 });
            await page.evaluate(() => window.previewTicket.showBottomSheet(0));
            await page.waitForTimeout(100);
            assert.equal(await atRight(), true, 'Pending state survives sheet recreation');
            const fits = await page.locator('.swipe-track').evaluate(el => el.getBoundingClientRect().right <= innerWidth);
            assert.equal(fits, true, `Slider fits at ${width}`);
        }
        await open();
        assert.equal(await atRight(), true, 'Pending state survives app reload');
        assert.equal(await page.locator('.reg-ticket-overlay').count(), 0, 'No success for an unpaid invoice');
        await page.evaluate(() => {
            window.previewTicket.paid();
            window.dispatchEvent(new Event('focus'));
            window.previewTicket.confirm();
        });
        await page.locator('.reg-ticket-overlay').waitFor();
        assert.equal(await page.locator('.reg-ticket-overlay').count(), 1, 'Return and deep link do not duplicate success');
        assert.equal(await page.evaluate(() => window.previewTicket.state.hikeBookingStatus[0]), true);
        await page.waitForFunction(() => document.querySelector('.ef-tk-cap')?.textContent === '2 из 10');
        assert.equal(await page.locator('.ef-tk-bar i').evaluate(el => el.style.width), '20%');
        assert.equal(await page.locator('.ef-tk-go.is-in').textContent(), 'ты записан ✓');
        await page.evaluate(() => window.previewTicket.renderCalendar(document.getElementById('calendarContainer')));
        await page.waitForFunction(() => document.querySelector('.ef-tk-cap')?.textContent === '2 из 10');
        assert.equal(await page.evaluate(() => localStorage.getItem('pending_reg_celebration')), null);
        assert.equal(await page.locator('.swipe-payment-dots').count(), 0);
        assert.equal(await page.evaluate(() => window.previewTicket.writes.length), 0, 'Only server payment callback may register');
        await page.screenshot({ path: '/tmp/ticket-success-320.png' });
        await page.evaluate(() => { localStorage.clear(); });
        failPayment = true;
        await open();
        await swipe();
        await page.locator('#choiceButBtn').click();
        await page.waitForTimeout(100);
        releasePayment();
        await page.waitForFunction(() => !document.querySelector('.swipe-track')?.dataset.paymentState);
        assert.equal(await atRight(), false, 'Invoice error restores an available slider');
        assert.ok(alerts.length);

        failPayment = false;
        await open();
        await page.evaluate(() => {
            Storage.prototype.setItem = () => { throw new DOMException('storage blocked', 'SecurityError'); };
        });
        await swipe();
        await page.locator('#choiceButBtn').click();
        await page.waitForTimeout(100);
        releasePayment();
        await page.waitForFunction(() => window.previewTicket.links.length === 1);
        await page.evaluate(() => window.previewTicket.showBottomSheet(0));
        await page.waitForTimeout(100);
        assert.equal(await atRight(), true, 'Memory fallback keeps waiting when storage is blocked');
        await page.locator('.swipe-thumb').tap();
        await page.locator('#ticketPaidNoBtn').waitFor();
        await page.locator('#ticketPaidNoBtn').click();
        assert.equal(await atRight(), false, 'Explicit unpaid cancellation restores the slider');
        assert.equal(await page.evaluate(() => window.previewTicket.writes.length), 0);
        await page.evaluate(async () => {
            window.previewTicket.paid();
            await window.previewTicket.confirm();
        });
        assert.equal(await page.locator('.reg-ticket-overlay').count(), 1, 'Server-confirmed success works when storage is blocked');

        await page.evaluate(() => { localStorage.clear(); });
        await open('&member');
        await page.waitForFunction(() => document.querySelector('.ef-tk-cap')?.textContent === '1 из 10');
        await swipe();
        await page.locator('.reg-ticket-overlay').waitFor();
        await page.waitForFunction(() => document.querySelector('.ef-tk-cap')?.textContent === '2 из 10');
        await page.locator('#rtDone').click();
        await page.waitForTimeout(300);
        await page.locator('.swipe-track').evaluate(el => {
            const rect = el.getBoundingClientRect();
            const thumb = el.querySelector('.swipe-thumb').getBoundingClientRect();
            const send = (type, x) => {
                const touch = new Touch({ identifier: 2, target: el, clientX: x, clientY: rect.top + 25 });
                el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], changedTouches: [touch] }));
            };
            send('touchstart', thumb.left + thumb.width / 2);
            send('touchmove', rect.left);
            send('touchend', rect.left);
        });
        await page.waitForFunction(() => document.querySelector('.ef-tk-cap')?.textContent === '1 из 10');
        assert.equal(await page.locator('.ef-tk-bar i').evaluate(el => el.style.width), '10%');
        assert.equal(await page.locator('.ef-tk-go').textContent(), 'записаться');
        assert.deepEqual(errors, [], 'No browser exceptions');
        console.log('Ticket/calendar browser tests passed: payment states, immediate seats/progress/booking label, ticket and member booking, cancellation, stale-cache redraw, 320/390px');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
