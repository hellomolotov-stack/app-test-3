const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = 'http://localhost:4185';
(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.previewAdmission);
        await page.evaluate(async () => {
            const match = getComputedStyle(document.body, '::before').backgroundImage.match(/url\(["']?(.+?)["']?\)/);
            if (!match) throw new Error('Shared app photo is missing');
            const image = new Image();
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Shared app photo failed to load')); image.src = match[1]; });
        });
        // Reset only the in-memory preview fixture, never production data.
        await page.evaluate(async () => {
            const { admissionRequest } = await import('/js/admission.js');
            const data = await admissionRequest('list');
            if (data.application.status !== 'new') await admissionRequest('reset', { revision: data.revision });
            await window.previewAdmission.loadAdmission();
        });
        assert.equal(await page.locator('#cardBlock + #admissionEntry').count(), 1, 'Application immediately follows the card');
        assert.equal(await page.locator('#chatBlock').count(), 0, 'Pilot replaces the assistant block');
        assert.equal(await page.locator('#admissionEntry .blk-toggle').count(), 0, 'Status stays visible');
        await page.locator('#admissionEntry').scrollIntoViewIfNeeded();
        await page.screenshot({ path: '/tmp/admission-home-new.png' });
        await page.locator('#admissionEntry button').click();
        await page.locator('input[name="city"]').fill('Ялта');
        await page.locator('textarea[name="about"]').fill('Люблю горы, долгие прогулки и знакомство с новыми людьми');
        await page.locator('input[name="respect"]').check();
        await page.screenshot({ path: '/tmp/admission-form-390.png' });
        for (const width of [320, 390, 600, 1100]) {
            await page.setViewportSize({ width, height: 844 });
            const overflow = await page.locator('.admission-screen').evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return [...element.querySelectorAll('h2, p, input, textarea, button, label')].filter(item => {
                    const box = item.getBoundingClientRect();
                    return box.width > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1);
                }).map(item => item.tagName);
            });
            assert.deepEqual(overflow, [], `No text/control overflow at ${width}px`);
            if (width === 320) await page.screenshot({ path: '/tmp/admission-form-320.png' });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('button', { name: 'отправить анкету', exact: true }).click();
        await page.locator('.admission-screen').getByRole('heading', { name: 'анкета у нас' }).waitFor();
        await page.screenshot({ path: '/tmp/admission-pending.png' });
        await page.getByRole('button', { name: 'к событиям', exact: true }).click();
        assert.equal(await page.locator('.admission-overlay').count(), 0);
        const originalStart = await page.locator('#admissionEntry [data-review-created]').getAttribute('data-review-created');
        const before = await page.locator('#admissionEntry [data-review-countdown]').textContent();
        await page.waitForTimeout(1100);
        const after = await page.locator('#admissionEntry [data-review-countdown]').textContent();
        assert.notEqual(after, before, 'Countdown updates while the home block stays open');
        await page.locator('#admissionEntry').scrollIntoViewIfNeeded();
        await page.screenshot({ path: '/tmp/admission-home-pending.png' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#admissionEntry').getByRole('heading', { name: /анкета у нас/ }).waitFor();
        assert.equal(await page.locator('#admissionEntry [data-review-created]').getAttribute('data-review-created'), originalStart, 'Reload keeps the submission timestamp');
        const timing = await page.evaluate(async () => {
            const { reviewWindow, REVIEW_DURATION, setAdmission, admission } = await import('/js/admission.js');
            const now = Date.now();
            const start = now - REVIEW_DURATION / 2;
            const half = reviewWindow(start, now);
            const beginning = reviewWindow(now, now);
            const deadline = reviewWindow(now, now + REVIEW_DURATION);
            setAdmission({ application: { ...admission.application, createdAt: now + admission.serverOffset - REVIEW_DURATION / 2 } });
            return { half, beginning, deadline };
        });
        assert.equal(timing.beginning.countdown, '24:00:00');
        assert.equal(timing.half.countdown, '12:00:00');
        assert.equal(timing.half.ratio, 0.5);
        assert.equal(timing.deadline.countdown, '00:00:00');
        assert.equal(timing.deadline.expired, true);
        await page.waitForTimeout(100);
        const scale = await page.locator('#admissionEntry .admission-review-fill').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).a);
        assert.ok(scale > .499 && scale < .501, 'At twelve hours, the visible bar is half full');
        await page.screenshot({ path: '/tmp/admission-home-half.png' });
        const resumedScale = await page.evaluate(async () => {
            const { admission } = await import('/js/admission.js');
            const fill = document.querySelector('#admissionEntry .admission-review-fill');
            fill.getAnimations()[0].currentTime = 3600000;
            admission.serverOffset += 3600000;
            document.dispatchEvent(new Event('visibilitychange'));
            return new DOMMatrix(getComputedStyle(document.querySelector('#admissionEntry .admission-review-fill')).transform).a;
        });
        assert.ok(resumedScale > .541 && resumedScale < .542, 'Resuming does not count elapsed time twice');
        await page.evaluate(() => window.previewAdmission.loadAdmission());
        await page.evaluate(async () => {
            const { REVIEW_DURATION, setAdmission, admission } = await import('/js/admission.js');
            setAdmission({ application: { ...admission.application, createdAt: Date.now() + admission.serverOffset - REVIEW_DURATION - 1000 } });
        });
        await page.locator('#admissionEntry .admission-review-overdue').waitFor();
        assert.equal(await page.locator('#admissionEntry [role="progressbar"]').getAttribute('aria-valuenow'), '100');
        assert.equal(await page.locator('#admissionEntry [data-review-countdown]').isVisible(), false, 'The timer never becomes negative');
        await page.evaluate(() => window.previewAdmission.loadAdmission());
        await page.evaluate(() => window.previewAdmission.openAdmin('admissions'));
        await page.getByRole('button', { name: 'принять', exact: true }).click();
        await page.getByRole('button', { name: 'подтвердить', exact: true }).click();
        await page.locator('.admission-admin-status').filter({ hasText: 'одобрена' }).waitFor();
        await page.screenshot({ path: '/tmp/admission-admin.png' });
        await page.goto(`${BASE}/?startapp=admission`, { waitUntil: 'domcontentloaded' });
        await page.locator('.admission-screen').getByRole('heading', { name: 'добро пожаловать в Интеллигенцию' }).waitFor();
        await page.screenshot({ path: '/tmp/admission-welcome.png' });
        await page.getByRole('button', { name: 'выбрать событие', exact: true }).click();
        await page.getByText('сначала отметь, что ознакомился с правилами').waitFor();
        await page.locator('#admissionRules').check();
        await page.getByRole('button', { name: 'выбрать событие', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('.admission-overlay'));
        assert.equal(await page.evaluate(() => window.previewAdmission.state.userCard.status), 'inactive');
        assert.equal(await page.evaluate(() => window.previewAdmission.state._admissionRealCard.status), 'active', 'Real card preserved');
        await page.evaluate(() => window.previewAdmission.openAdmin('admissions'));
        await page.getByRole('button', { name: 'сбросить тестовую заявку' }).click();
        await page.getByRole('button', { name: 'подтвердить', exact: true }).click();
        await page.getByText('заявок пока нет', { exact: true }).waitFor();
        await page.locator('.adm-close').click();
        await page.evaluate(() => window.previewAdmission.showGuestBookingPopup('2026-10-18', 'Ай-Йори'));
        await page.locator('.admission-screen').getByRole('heading', { name: 'как попасть в клуб' }).waitFor();
        await page.locator('.admission-screen').getByRole('button', { name: 'заполнить анкету' }).click();
        await page.locator('input[name="city"]').fill('Севастополь');
        await page.locator('textarea[name="about"]').fill('Хочу найти компанию для походов и городских встреч');
        await page.locator('input[name="respect"]').check();
        await page.getByRole('button', { name: 'отправить анкету' }).click();
        await page.locator('.admission-screen').getByRole('heading', { name: 'анкета у нас' }).waitFor();
        await page.getByRole('button', { name: 'к событиям', exact: true }).click();
        await page.evaluate(() => window.previewAdmission.openAdmin('admissions'));
        await page.getByRole('button', { name: 'отклонить', exact: true }).click();
        await page.getByRole('button', { name: 'подтвердить', exact: true }).click();
        await page.locator('.admission-admin-status').filter({ hasText: 'отклонена' }).waitFor();
        await page.goto(`${BASE}/?startapp=admission`, { waitUntil: 'domcontentloaded' });
        await page.locator('.admission-screen').getByRole('heading', { name: 'спасибо за знакомство' }).waitFor();
        await page.screenshot({ path: '/tmp/admission-rejected.png' });
        const gates = await page.evaluate(async () => {
            const { isAdmissionPilot, applyAdmissionVisitorMode } = await import('/js/admission.js');
            const { state } = await import('/js/state.js');
            const result = {};
            for (const username of ['HelloIntelligent', 'hellointelligent', '@HelloIntelligent', 'MaxMolotov', 'visitor']) {
                state.user = { id: 123, username };
                state.userCard = { status: 'active', cardUrl: 'existing-card' };
                result[username] = isAdmissionPilot();
                applyAdmissionVisitorMode();
                if (!result[username] && state.userCard.status !== 'active') throw new Error('Changed a non-pilot card');
            }
            return result;
        });
        assert.deepEqual(gates, { HelloIntelligent: true, hellointelligent: true, '@HelloIntelligent': true, MaxMolotov: false, visitor: false });
        assert.deepEqual(errors, [], 'No browser exceptions');
        console.log('Browser tests passed: home, form, 320/390/600/1100px, submit, reload, admin approval, deep link, rules, guest identity, reset, hike gate, rejection');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
