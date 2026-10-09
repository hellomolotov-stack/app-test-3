const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const message = 'Привет, хочу учесть стоимость билета при оформлении карты';
const moduleSource = path => fs.readFileSync(path, 'utf8')
    .replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/export /g, '');
const chatSource = moduleSource('js/ui/onboarding-chat.js');
const cardSource = moduleSource('js/ui/card-sheet.js')
    .replace("await import('./onboarding-chat.js')", 'window.__chatModule');
const firebaseSource = fs.readFileSync('js/firebase.js', 'utf8');
const sendSource = firebaseSource.slice(firebaseSource.indexOf('export async function sendSupportMessage'), firebaseSource.indexOf('export function subscribeToAdminReplies')).replace('export ', '');
const css = fs.readFileSync('style.css', 'utf8');
const fixture = `
    window.fixture = { writes: [], links: [], historyReads: 0, participantReads: 0, fail: false, pending: false, replies: null };
    const state = { user: { id: 123, first_name: 'Тест', username: 'test' }, userCard: { status: 'inactive' }, popupConfig: {}, profiles: {}, metrics: {}, hikesWithTitle: [], _userRegs: {} };
    const tg = null;
    const haptic = () => {};
    const log = () => {};
    const openLink = url => window.fixture.links.push(url);
    const isAdmissionPilot = () => false;
    const requireAdmission = async () => true;
    const getCardOffer = async () => null;
    const authReady = async () => {};
    const database = { ref: path => ({ set: async value => {
        if (window.fixture.pending) await new Promise(resolve => window.fixture.release = resolve);
        if (window.fixture.fail) throw new Error('test: offline');
        window.fixture.writes.push({path, value});
    } }) };
    const subscribeToAdminReplies = (id, ts, callback) => { window.fixture.replies = callback; return () => { window.fixture.replies = null; }; };
    const markSupportMessageRead = () => {};
    const loadSupportMessages = async () => { window.fixture.historyReads++; return [{from:'admin',text:'старый ответ',read_by_user:false}]; };
    const loadAllParticipants = async () => { window.fixture.participantReads++; return []; };
    const isPersonalMapPilotUser = () => false;
    const formatDateForDisplay = date => date;
    const scrollToElement = () => {};
    const renderHome = () => {};
    const showBottomSheet = () => {};
    const showGuestBookingPopup = () => {};
`;

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 844 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent(`<style>${css}</style><main>тест окна покупки карты</main>`);
            await page.addScriptTag({ content: fixture + sendSource + chatSource + cardSource + ';window.__chatModule = { openOnboardingChat };' });
            await page.evaluate(() => openCardSheet());
            assert.match(await page.locator('#csSupport').textContent(), /зачтём его в стоимость карты/);
            await page.locator('#csSupport').evaluate(button => { button.click(); button.click(); });
            await page.locator('.chat-bubble.user').getByText(message, { exact: true }).waitFor();
            await page.getByRole('button', { name: 'ещё вопрос', exact: true }).waitFor();
            const result = await page.evaluate(() => ({
                writes: window.fixture.writes, links: window.fixture.links,
                historyReads: window.fixture.historyReads, participantReads: window.fixture.participantReads,
                chatZ: Number(getComputedStyle(document.querySelector('.bot-chat-overlay')).zIndex),
                cardZ: Number(getComputedStyle(document.querySelector('.cs-overlay')).zIndex),
                locked: document.body.style.overflow,
                overflow: document.documentElement.scrollWidth > innerWidth,
            }));
            assert.equal(result.writes.length, 1, 'Double click sends only once');
            assert.equal(result.writes[0].path.startsWith('support_messages/123/'), true);
            assert.equal(result.writes[0].value.text, message);
            assert.equal(result.writes[0].value.from, 'user');
            assert.equal(result.writes[0].value.forwarded, false, 'Normal support forwarding pipeline');
            assert.deepEqual(result.links, [], 'No external Telegram navigation');
            assert.equal(result.historyReads, 0, 'Unread replies do not intercept the request');
            assert.equal(result.participantReads, 0, 'No unrelated hike prefetch');
            assert.ok(result.chatZ > result.cardZ, 'Chat is above card purchase');
            assert.equal(result.locked, 'hidden');
            assert.equal(result.overflow, false);
            await page.evaluate(() => window.fixture.replies({ text: 'Пришли чек билета' }, 'reply'));
            await page.getByText('Пришли чек билета', { exact: true }).waitFor();
            await page.screenshot({ path: `/private/tmp/ticket-credit-chat-${width}.png` });
            await page.locator('.bot-chat-close').click();
            await page.waitForFunction(() => !document.querySelector('.bot-chat-overlay'));
            assert.equal(await page.locator('.cs-overlay.is-on').count(), 1, 'Purchase remains open after closing chat');

            if (width === 390) {
                await page.evaluate(() => { window.fixture.fail = true; });
                await page.locator('#csSupport').click();
                await page.getByText(/не получилось отправить/).waitFor();
                assert.equal(await page.locator('.chat-bubble.bot').filter({ hasText: 'передал' }).count(), 0);
                assert.equal(await page.evaluate(() => window.fixture.writes.length), 1);
                await page.locator('.bot-chat-close').click();
                await page.waitForFunction(() => !document.querySelector('.bot-chat-overlay'));
                await page.evaluate(() => { window.fixture.fail = false; window.fixture.pending = true; });
                await page.locator('#csSupport').click();
                await page.waitForFunction(() => window.fixture.release);
                await page.locator('.bot-chat-close').click();
                await page.waitForFunction(() => !document.querySelector('.bot-chat-overlay'));
                await page.evaluate(async () => {
                    window.fixture.pending = false;
                    const opened = openOnboardingChat();
                    window.fixture.release();
                    await opened;
                });
                await page.getByText('старый ответ', { exact: true }).waitFor();
                assert.equal(await page.locator('.chat-bubble.bot').filter({ hasText: 'передал' }).count(), 0, 'Late completion does not contaminate reopened chat');
                assert.equal(await page.locator('.chat-bubble.user').count(), 0);
            }
            assert.deepEqual(errors, [], `No runtime errors at ${width}px`);
            await page.close();
        }
        console.log('Ticket credit chat passed: 320/390/900px, exact message, single send, support write, layering, replies, failure, close/reopen');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
