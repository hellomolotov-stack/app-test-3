const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = 'http://localhost:4185/?screen=profiles';

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const query of ['', '&regular', '&empty']) {
            await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.previewProfiles);
            await page.evaluate(async () => {
                const match = getComputedStyle(document.body, '::before').backgroundImage.match(/url\(["']?(.+?)["']?\)/);
                if (!match) throw new Error('Shared background is missing');
                const image = new Image();
                await new Promise((resolve, reject) => {
                    image.onload = resolve;
                    image.onerror = () => reject(new Error('Shared background failed to load'));
                    image.src = match[1];
                });
            });
            await page.waitForFunction(() => [...document.querySelectorAll('.profile-avatar')].every(image => image.complete));
            assert.equal(await page.locator('#personalMapContainer').count(), 0, 'No personal map behind the guest preview');
            assert.equal(await page.locator('.infinite-scroll-wrapper > .profiles-two-columns').count(), 2);
            assert.equal(await page.locator('.infinite-scroll-wrapper > .profiles-two-columns > .profiles-column').count(), 4, 'Fallback uses proper columns too');
            assert.equal(await page.locator('.infinite-scroll-container').getAttribute('aria-hidden'), 'true');
            assert.equal(await page.locator('.infinite-scroll-container').evaluate(el => el.inert), true);
            assert.equal(await page.locator('.profile-blur-overlay').evaluate(el => getComputedStyle(el).backdropFilter), 'none', 'No full-screen double blur');
            if (!query.includes('empty')) {
                const failed = page.locator('.profile-card[data-user-id="3"]').first();
                assert.equal(await failed.locator('.profile-name').textContent(), 'Мария', 'Broken photo keeps card content');
                assert.equal(await failed.locator('.profile-avatar-placeholder').isVisible(), true);
            }
            for (const width of [320, 390, 600, 1100]) {
                await page.setViewportSize({ width, height: 844 });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}`);
                const layout = await page.locator('.infinite-scroll-wrapper').evaluate(el => {
                    const groups = [...el.children].map(group => group.getBoundingClientRect());
                    const banner = document.querySelector('.profile-preview-banner')?.getBoundingClientRect();
                    const button = document.querySelector('#profileActionBtn').getBoundingClientRect();
                    return { equal: Math.abs(groups[0].height - groups[1].height) < 1, contiguous: Math.abs(groups[0].bottom - groups[1].top) < 1,
                        overlap: banner ? banner.bottom > button.top : false };
                });
                assert.equal(layout.equal && layout.contiguous, true, 'Two equal seamless animation groups');
                assert.equal(layout.overlap, false, 'Preview banner does not overlap the button');
                if (width === 320 && !query) await page.screenshot({ path: '/tmp/profiles-pilot-320.png' });
            }
            await page.setViewportSize({ width: 390, height: 844 });
            const motion = await page.locator('.infinite-scroll-wrapper').evaluate(el => {
                const animation = el.getAnimations()[0];
                const duration = animation.effect.getComputedTiming().duration;
                animation.pause();
                animation.currentTime = duration - 1;
                const end = new DOMMatrix(getComputedStyle(el).transform).m42;
                animation.currentTime = 1;
                const start = new DOMMatrix(getComputedStyle(el).transform).m42;
                animation.play();
                return { end, start, groupHeight: el.firstElementChild.offsetHeight };
            });
            assert.ok(Math.abs(motion.end + motion.groupHeight) < 1 && Math.abs(motion.start) < 1, 'Loop wraps exactly one group');
            const yBefore = await page.locator('.infinite-scroll-wrapper').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42);
            await page.waitForTimeout(300);
            const yAfter = await page.locator('.infinite-scroll-wrapper').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42);
            assert.ok(yAfter < yBefore, 'Profiles move upwards');
            await page.screenshot({ path: `/tmp/profiles-${query.includes('empty') ? 'empty' : query ? 'regular' : 'pilot'}-390.png` });
            await page.locator('#profileActionBtn').click();
            await page.locator('#guestBookingPopup .bpu-title').waitFor();
            assert.equal(await page.locator('#guestBookingPopup .bpu-title').textContent(), 'профили – это не тиндер');
            assert.equal(await page.locator('.admission-overlay').count(), 0, 'Profile info does not open admission form');
            assert.equal(await page.locator('#guestBookingPopup #joinClubBtn').isVisible(), true);
            await page.screenshot({ path: `/tmp/profiles-popup-${query.includes('empty') ? 'empty' : query ? 'regular' : 'pilot'}.png` });
            await page.locator('#closePopup').click();
            assert.equal(await page.locator('#guestBookingPopup').count(), 0);
        }
        await page.goto(BASE + '&regular&member', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.previewProfiles);
        assert.equal(await page.locator('.profiles-filters').count(), 1, 'Member filters preserved');
        assert.equal(await page.locator('.infinite-scroll-container, .profile-blur-overlay').count(), 0, 'Member list remains clear and static');
        assert.equal(await page.locator('.profile-card[data-user-id="3"] .profile-name').textContent(), 'Мария');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(BASE + '&regular', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.previewProfiles);
        assert.equal(await page.locator('.infinite-scroll-wrapper').evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.deepEqual(errors, [], 'No JavaScript exceptions');
        console.log('Profiles browser tests passed: guest/pilot popup, neat columns, empty fallback, broken avatar, upward seamless loop, 320/390/600/1100px, member filters, reduced motion');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
