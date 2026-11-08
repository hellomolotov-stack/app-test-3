const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('./_playwright.cjs');
const root = path.resolve(__dirname, '..');
const sample = '# как находить опору\n\nхайк, 8 ноября 2026\n\n## запрос\n\nОбщая тема встречи\n\n## взгляды\n\n' +
    ['Егор', 'Дима', 'Ксюша', 'Ваня', 'Дима'].map((name, i) => `### ${name} · тема ${i + 1}\n\nОтвет участника\n\n«Цитата участника»\n\n${name}: я бы попробовал другой подход.\n\nМакс отметил, что важно учитывать обстоятельства.`).join('\n\n') +
    '\n\n## что прозвучало\n\n' + Array.from({ length: 5 }, (_, i) => `- **Вывод ${i + 1}** – пояснение вывода.`).join('\n\n') + '\n\n## вопрос себе\n\nЧто помогает тебе?';
const body = process.env.MM_BODY ? fs.readFileSync(process.env.MM_BODY, 'utf8') : sample;
(async () => {
    const result = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: root, contents: `
        import {state} from './js/state.js';import {openMmReader} from './js/ui/mm-reader.js';
        state.user={id:123};state.userCard={status:'active'};state.mmNotes=[{id:'expanded',date:'2026-11-08',title:'как адаптироваться к неожиданностям и не сломаться',body:${JSON.stringify(body)},locked:false}];
        openMmReader('expanded');
    ` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 844 } });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', route => {
                const u = new URL(route.request().url());
                if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="ru" class="v2"><meta charset="utf-8"><body></body></html>' });
                const file = path.join(root, u.pathname);
                if (u.pathname.startsWith('/assets/') && fs.existsSync(file)) return route.fulfill({ path: file });
                return route.fulfill({ json: { going: {} } });
            });
            await page.goto('https://mm-test.local');
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'style.css'), 'utf8') });
            await page.addScriptTag({ content: result.outputFiles[0].text });
            await page.locator('.mmr-overlay.is-on').waitFor();
            assert.equal(await page.locator('.mmr-card').count(), 5);
            assert.equal(await page.locator('.mmr-moderator').count(), 5);
            assert.equal(await page.locator('.mmr-view').count(), 5);
            assert.equal(await page.locator('.mmr-th').count(), 5);
            assert.equal(await page.locator('.mmr-ask').count(), 1);
            assert.equal(await page.locator('.mmr-moderator .mmr-card').count(), 0);
            assert.equal(await page.locator('.mmr-scroll').evaluate(el => el.scrollWidth <= el.clientWidth), true);
            if (process.env.MM_SCREENSHOTS) {
                await page.waitForTimeout(400);
                await page.screenshot({ path: `${process.env.MM_SCREENSHOTS}/top-${width}.png` });
                await page.locator('.mmr-moderator').first().evaluate(el => el.scrollIntoView({ block: 'center' }));
                await page.screenshot({ path: `${process.env.MM_SCREENSHOTS}/comment-${width}.png` });
                await page.locator('.mmr-th').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
                await page.screenshot({ path: `${process.env.MM_SCREENSHOTS}/takeaways-${width}.png` });
            }
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('Expanded summary reader: five viewpoints, moderator comments, takeaways and responsive layout: PASS');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
