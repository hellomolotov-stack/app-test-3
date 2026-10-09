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
        // Reset only the in-memory preview fixture, never production data.
        await page.evaluate(async () => {
            const { admissionRequest } = await import('/js/admission.js');
            const data = await admissionRequest('list');
            if (data.application.status !== 'new') await admissionRequest('reset', { revision: data.revision });
            await window.previewAdmission.loadAdmission();
        });
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
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#admissionEntry').getByText('анкета у нас', { exact: true }).waitFor();
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
        await page.locator('.admission-screen').getByRole('heading', { name: 'давай познакомимся' }).waitFor();
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
