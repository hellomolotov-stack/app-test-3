const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dragSource = fs.readFileSync('js/ui/sheet-drag.js', 'utf8').replace('export function', 'function');
const calendar = fs.readFileSync('js/ui/calendar.js', 'utf8');
const closeSource = calendar.slice(calendar.indexOf('export function closeBottomSheet()'), calendar.indexOf('const isTouchDevice')).replace('export function', 'function');
const css = fs.readFileSync('style.css', 'utf8');
const fixture = `
    let sheetActHike=null,currentUnsubscribe=null,sheetScrollListener=null;
    const closeParticipantDropdown=()=>{},closeLeaderDropdown=()=>{};
    window.eventWarnings=[];
    window.resetSheet=()=>{
        document.querySelector('.bottom-sheet-overlay')?.remove();
        document.querySelector('.floating-sheet-buttons')?.remove();
        document.body.insertAdjacentHTML('beforeend', '<div class="bottom-sheet-overlay visible"><div class="bottom-sheet visible" id="hikeBottomSheet" style="height:740px;max-height:90vh"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-content-wrapper" id="bottomSheetContent"><div class="bottom-sheet-header-block"><h2>хайк на Демерджи</h2></div><p id="touchTarget">описание маршрута</p><div style="height:1200px"></div><div class="hike-map-box" style="height:100px">карта</div><input aria-label="тест"></div></div></div><div class="floating-sheet-buttons"></div>');
        document.body.style.overflow='hidden';
        document.querySelector('.bottom-sheet-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeBottomSheet();});
    };
    window.touch=(type,y,x=100,cancelable=true,selector='#bottomSheetContent')=>{
        const target=document.querySelector(selector);
        const touches=type==='touchend'||type==='touchcancel'?[]:[new Touch({identifier:1,target,clientX:x,clientY:y})];
        target.dispatchEvent(new TouchEvent(type,{touches,changedTouches:touches,bubbles:true,cancelable}));
    };
    initSheetDrag();resetSheet();
`;
async function geometry(page) {
    return page.evaluate(()=>{
        const sheet=document.getElementById('hikeBottomSheet'), content=document.getElementById('bottomSheetContent');
        return {top:sheet.getBoundingClientRect().top,contentTop:content.getBoundingClientRect().top,
            scrollTop:content.scrollTop,transform:sheet.style.transform,dragging:sheet.classList.contains('is-dragging'),
            overscroll:getComputedStyle(content).overscrollBehaviorY};
    });
}
(async()=>{
    const browser=await chromium.launch({channel:'chrome',headless:true});
    try {
        for(const width of [320,390]) {
            const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true});
            const warnings=[];
            page.on('pageerror',e=>warnings.push(e.message));
            page.on('console',m=>{if(/preventDefault|passive event/i.test(m.text()))warnings.push(m.text());});
            await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style>');
            await page.addScriptTag({content:dragSource+closeSource+fixture});
            const before=await geometry(page);assert.equal(before.overscroll,'none');
            // One gesture starts in scrolled content and continues past its top edge.
            await page.evaluate(()=>{
                const content=document.getElementById('bottomSheetContent');content.scrollTop=180;
                touch('touchstart',200);touch('touchmove',220);
                content.scrollTop=60;touch('touchmove',340);
                content.scrollTop=0;touch('touchmove',380,100,false);
            });
            const during=await geometry(page);
            assert.equal(during.dragging,true);
            assert.equal(during.scrollTop,0);
            assert.ok(during.top>before.top+30);
            assert.ok(Math.abs((during.contentTop-during.top)-(before.contentTop-before.top))<1,'Header/content gap must not grow');
            await page.screenshot({path:`/private/tmp/hike-sheet-pull-${width}.png`});
            await page.evaluate(()=>{touch('touchmove',520);touch('touchend',520);});
            await page.waitForFunction(()=>!document.querySelector('.bottom-sheet-overlay'));
            assert.equal(await page.locator('.floating-sheet-buttons').count(),0);
            assert.equal(await page.evaluate(()=>document.body.style.overflow),'');

            await page.evaluate(()=>{resetSheet();touch('touchstart',200);touch('touchmove',360);touch('touchcancel',360);});
            assert.equal(await page.locator('.bottom-sheet.visible').count(),1,'Cancelled gesture must not close');
            assert.equal((await geometry(page)).transform,'');

            await page.evaluate(()=>{resetSheet();touch('touchstart',200,100);touch('touchmove',202,200);touch('touchend',202,200);});
            assert.equal((await geometry(page)).transform,'','Horizontal navigation must not drag down');

            await page.evaluate(()=>{resetSheet();touch('touchstart',200);touch('touchmove',240);});
            await page.waitForTimeout(160);
            await page.evaluate(()=>touch('touchend',240));
            assert.equal((await geometry(page)).transform,'','Short pull snaps back without closing');

            await page.evaluate(()=>{
                resetSheet();document.getElementById('bottomSheetContent').scrollTop=90;
                touch('touchstart',200);touch('touchmove',100);touch('touchend',100);
            });
            assert.equal((await geometry(page)).transform,'','Upward scroll does not dismiss');

            for(const selector of ['input']) {
                await page.evaluate(selector=>{resetSheet();touch('touchstart',200,100,true,selector);touch('touchmove',500,100,true,selector);touch('touchend',500,100,true,selector);},selector);
                assert.equal((await geometry(page)).transform,'','Input gestures are excluded');
            }

            await page.evaluate(()=>{
                resetSheet();document.getElementById('bottomSheetContent').scrollTop=80;
                touch('touchstart',200,100,true,'.hike-map-box');
                touch('touchmove',370,100,true,'.hike-map-box');
            });
            assert.equal((await geometry(page)).scrollTop,80,'Map pull must not jump content to the top');
            assert.equal((await geometry(page)).dragging,true);
            await page.evaluate(()=>touch('touchend',370,100,true,'.hike-map-box'));
            await page.waitForFunction(()=>!document.querySelector('.bottom-sheet-overlay'));

            await page.evaluate(()=>{
                resetSheet();document.querySelector('#bottomSheetContent > div[style]').remove();
                touch('touchstart',200);touch('touchmove',360);touch('touchend',360);
            });
            await page.waitForFunction(()=>!document.querySelector('.bottom-sheet-overlay'));

            // Actual browser touch input, including native scrolling before handoff.
            await page.evaluate(()=>{resetSheet();document.getElementById('bottomSheetContent').scrollTop=180;});
            const session=await page.context().newCDPSession(page);
            await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:210}]});
            for(let y=230;y<=650;y+=20){
                await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y}]});
                await page.waitForTimeout(20);
            }
            const real=await geometry(page);
            assert.equal(real.scrollTop,0);
            assert.equal(real.dragging,true,'Native scrolling must hand off to whole-sheet drag');
            assert.ok(real.top>before.top+110);
            assert.ok(Math.abs((real.contentTop-real.top)-(before.contentTop-before.top))<1);
            await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
            await page.waitForFunction(()=>!document.querySelector('.bottom-sheet-overlay'));
            for(const [overlayClass,sheetClass,scrollClass] of [['cs-overlay','cs-sheet','cs-scroll'],['inv-overlay','inv-sheet','inv-scroll']]) {
                await page.evaluate(({overlayClass,sheetClass,scrollClass})=>{
                    document.body.insertAdjacentHTML('beforeend', '<div class="'+overlayClass+' is-on"><div class="'+sheetClass+'"><div class="cs-grab"></div><div class="'+scrollClass+'">карта</div></div></div>');
                    const overlay=document.querySelector('.'+overlayClass);
                    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
                    touch('touchstart',200,100,true,'.'+scrollClass);
                    touch('touchmove',370,100,true,'.'+scrollClass);
                    touch('touchend',370,100,true,'.'+scrollClass);
                },{overlayClass,sheetClass,scrollClass});
                assert.equal(await page.locator('.'+overlayClass).count(),0,'Other shared sheets still dismiss');
            }
            assert.deepEqual(warnings,[]);
            await page.close();
        }
        console.log('Sheet drag passed at 320/390: scroll handoff, no gap, actual touch dismissal, map-area dismissal without content jump, short pull, cancel, horizontal/upward gestures, input exclusions, short content, cleanup');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
