const fs = require('node:fs');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
    const bundle = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: process.cwd(), contents: `
        import {renderAnalytics} from './js/ui/admin-analytics.js';
        window.renderTest=(mode='data')=>renderAnalytics(document.querySelector('.adm-body'),async(action,params)=>{
            window.lastCall={action,params};
            if(mode==='error') throw new Error('Источник оплат недоступен');
            const now=Date.now();
            if(mode==='empty') return {status:'ok',empty:true,choices:[]};
            return {status:'ok',date:'2026-10-25',title:'Ат-Баш',choices:[{date:'2026-10-25',title:'Ат-Баш'},{date:'2026-11-01',title:'Балаклава'}],
                from:now-100000,to:now,captureStart:now-100000,partial:true,guest:[42,30,18,12,9,9],member:[10,8,6,6],
                guestLabels:['Открыли приложение','Посмотрели хайк','Решили записаться','Создан счёт за билет','Оплата подтверждена','Запись подтверждена'],
                memberLabels:['Открыли приложение','Посмотрели хайк','Решили записаться','Запись подтверждена'],
                active:18,paid:9,cardPaid:2,errors:1,alternative:2,insights:['Проверить этап создания счёта: это наблюдение, не причина','Ошибки оформления: 1 человек']};
        }); renderTest();` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [320, 390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="adm"><div class="adm-head"><div class="adm-title">админка · аналитика</div></div><div class="adm-body"></div></div>');
            await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
            await page.addScriptTag({ content: bundle.outputFiles[0].text });
            await page.getByText('без карты · билет', { exact: true }).waitFor();
            assert.equal(await page.locator('.analytics-funnel li').count(), 10);
            assert.equal(await page.locator('.analytics').evaluate(el => el.scrollWidth > el.clientWidth), false);
            await page.getByRole('button', { name: '7 дней', exact: true }).click();
            assert.equal((await page.evaluate(() => lastCall)).params.period, '7d');
            await page.getByRole('combobox').selectOption('2026-11-01');
            assert.equal((await page.evaluate(() => lastCall)).params.date, '2026-11-01');
            await page.screenshot({ path: `/private/tmp/club-analytics-${width}.png`, fullPage: true });
            await page.evaluate(() => renderTest('error'));
            await page.getByText('Источник оплат недоступен').waitFor();
            assert.equal(await page.locator('.analytics-totals').count(), 0);
            await page.evaluate(() => renderTest('empty'));
            await page.getByText('нет опубликованного хайка для отчёта').waitFor();
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally { await browser.close(); }
    console.log('analytics browser: 320/390/900, both funnels, period/route filters, error and empty states passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
