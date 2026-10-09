const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = fs.readFileSync('js/ui/card-sheet.js', 'utf8').replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '').replace(/export /g, '')
    .replaceAll('assets/card-front.jpg', 'data:image/jpeg;base64,' + fs.readFileSync('assets/card-front.jpg').toString('base64'));
const fixture = `
    const state={user:{id:123},popupConfig:{},profiles:{},metrics:{},userCard:{status:'active'},_userRegs:{}};
    const tg=null, haptic=()=>{},log=()=>{},isAdmissionPilot=()=>false,requireAdmission=async()=>true,getCardOffer=async()=>null;
    const paymentErrorText=()=>'';
    window.payments=[];
    const initPayment=async data=>{window.payments.push(data);return {url:'https://auth.robokassa.ru/test'};};
    const openLink=()=>{};
`;
(async()=>{
    const browser=await chromium.launch({channel:'chrome',headless:true});
    try {
        for(const width of [320,390,900]) {
            const page=await browser.newPage({viewport:{width,height:844}});
            const errors=[];page.on('pageerror',e=>errors.push(e.message));
            await page.setContent(`<style>${fs.readFileSync('style.css','utf8')}</style>`);
            await page.addScriptTag({content:fixture+source});
            for(const plan of ['permanent','season']) {
                await page.evaluate(()=>openCardSheet({gift:true}));
                assert.equal(await page.locator('.cs-plan').count(),2);
                assert.equal(await page.locator('#csTicket').count(),0);
                await page.locator(`[data-plan="${plan}"]`).click();
                assert.ok((await page.locator('#csBuy').textContent()).includes(plan==='season'?'5':'7'));
                const overflow=await page.locator('.cs-plan').evaluateAll(els=>els.some(e=>e.scrollWidth>e.clientWidth));
                assert.equal(overflow,false);
                await page.screenshot({path:`/private/tmp/gift-card-${plan}-${width}.png`});
                await page.locator('#csBuy').click();
                const payload=await page.evaluate(()=>window.payments.at(-1));
                assert.equal(payload.cardType,'gift');assert.equal(payload.giftCardType,plan);
                assert.equal(payload.expectedAmount,plan==='season'?5500:7500);
                assert.equal(payload.hikeDate,'');
                await page.waitForFunction(()=>!document.querySelector('.cs-overlay'));
            }
            await page.evaluate(()=>openCardSheet());
            assert.match(await page.locator('[data-plan="season"]').textContent(),/действует начиная с текущего сезона плюс следующий/);
            assert.deepEqual(errors,[]);await page.close();
        }
        console.log('Gift cards UI passed at 320/390/900: both choices, prices, payloads, no ticket, season note, no overflow');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
