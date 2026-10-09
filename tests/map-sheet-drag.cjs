const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/maksmolotov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
// Use the application's pinned MapLibre version, downloaded from its existing CDN URLs.
async function pinnedAsset(path, url) {
    if (fs.existsSync(path)) return fs.readFileSync(path, 'utf8');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Unable to load pinned MapLibre asset: ' + response.status);
    return response.text();
}
const dragJs = fs.readFileSync('js/ui/sheet-drag.js', 'utf8').replace('export function', 'function');
const calendar = fs.readFileSync('js/ui/calendar.js', 'utf8');
const options = calendar.slice(calendar.indexOf('const MAP_TWO_FINGERS ='), calendar.indexOf('let _maplibreLoading'));
const fixture = `
    initSheetDrag();
    window.resetMapSheet=async()=>{
        window.testMap?.remove();document.querySelector('.bottom-sheet-overlay')?.remove();
        document.body.innerHTML='<div class="bottom-sheet-overlay visible"><div class="bottom-sheet visible" style="height:740px;max-height:90vh"><div class="bottom-sheet-handle"></div><div class="bottom-sheet-content-wrapper"><div class="bottom-sheet-header-block"><h2>маршрут</h2></div><div class="hike-map-box" id="testMap" style="height:280px;aspect-ratio:auto"></div><div style="height:1000px"></div></div></div></div>';
        document.querySelector('.bottom-sheet-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget){window.testMap.remove();e.currentTarget.remove();}});
        window.testMap=new maplibregl.Map({...MAP_TWO_FINGERS,container:'testMap',center:[34,44.5],zoom:10,
            preserveDrawingBuffer:true,attributionControl:false,style:{version:8,sources:{route:{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[33.98,44.48],[34.02,44.52]]}}}},
            layers:[{id:'bg',type:'background',paint:{'background-color':'#101820'}},{id:'route',type:'line',source:'route',paint:{'line-color':'#D9FD19','line-width':5}}]}});
        await new Promise(resolve=>testMap.once('idle',resolve));
    };
`;
async function touch(session,type,points) {
    await session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((point,id)=>({...point,id}))});
}
(async()=>{
    const mapJs = await pinnedAsset(process.env.MAPLIBRE_JS || '/private/tmp/club-maplibre-4.7.1.js', 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js');
    const mapCss = await pinnedAsset(process.env.MAPLIBRE_CSS || '/private/tmp/club-maplibre-4.7.1.css', 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css');
    const browser=await chromium.launch({channel:'chrome',headless:true});
    try {
        for(const width of [320,390]) {
            const page=await browser.newPage({viewport:{width,height:844},hasTouch:true,isMobile:true});
            const errors=[];page.on('pageerror',error=>errors.push(error.message));
            await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+mapCss+fs.readFileSync('style.css','utf8')+'</style>');
            await page.addScriptTag({content:mapJs});await page.addScriptTag({content:options+dragJs+fixture});
            await page.evaluate(()=>resetMapSheet());
            const rendered=await page.locator('canvas').evaluate(canvas=>{
                const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
                const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>100&&pixels[i+1]>100)lit++;
                return lit;
            });
            assert.ok(rendered>100,'Actual MapLibre route must render');
            const session=await page.context().newCDPSession(page);
            let box=await page.locator('#testMap').boundingBox();
            const y=box.y+100,x=width/2;
            // Horizontal single-finger movement never dismisses the sheet.
            await touch(session,'touchStart',[{x:x-70,y}]);
            await touch(session,'touchMove',[{x:x+70,y:y+2}]);
            await touch(session,'touchEnd',[]);
            assert.equal(await page.locator('.bottom-sheet').evaluate(el=>el.style.transform),'');
            // Pinch remains a real map operation, not a sheet operation.
            const zoom=await page.evaluate(()=>testMap.getZoom());
            await touch(session,'touchStart',[{x:x-25,y},{x:x+25,y}]);
            for(let spread=35;spread<=85;spread+=10){
                await touch(session,'touchMove',[{x:x-spread,y},{x:x+spread,y}]);await page.waitForTimeout(30);
            }
            await touch(session,'touchEnd',[]);await page.waitForTimeout(200);
            assert.ok(Math.abs(await page.evaluate(()=>testMap.getZoom())-zoom)>0.1,'Pinch zoom must still work');
            assert.equal(await page.locator('.bottom-sheet').evaluate(el=>el.style.transform),'');
            // Adding a second finger during a pull cancels dismissal and returns control to the map.
            await touch(session,'touchStart',[{x:x-25,y}]);
            await touch(session,'touchMove',[{x:x-25,y:y+40}]);
            await touch(session,'touchStart',[{x:x-25,y:y+40},{x:x+25,y:y+40}]);
            for(let spread=35;spread<=85;spread+=10){
                await touch(session,'touchMove',[{x:x-spread,y:y+40},{x:x+spread,y:y+40}]);await page.waitForTimeout(30);
            }
            await touch(session,'touchEnd',[]);
            assert.equal(await page.locator('.bottom-sheet').evaluate(el=>el.style.transform),'');
            assert.equal(await page.locator('.bottom-sheet-overlay').count(),1,'Switching to two fingers must not close');
            // Downward swipe from a partially scrolled map moves the whole sheet, not its content.
            await page.locator('.bottom-sheet-content-wrapper').evaluate(el=>{el.scrollTop=50;});
            box=await page.locator('#testMap').boundingBox();
            const startY=box.y+70;
            await touch(session,'touchStart',[{x,y:startY}]);
            for(let dy=20;dy<=180;dy+=20){
                await touch(session,'touchMove',[{x,y:startY+dy}]);await page.waitForTimeout(20);
            }
            assert.equal(await page.locator('.bottom-sheet-content-wrapper').evaluate(el=>el.scrollTop),50);
            assert.equal(await page.locator('.bottom-sheet.is-dragging').count(),1);
            await page.screenshot({path:`/private/tmp/map-sheet-swipe-${width}.png`});
            await touch(session,'touchEnd',[]);
            await page.waitForFunction(()=>!document.querySelector('.bottom-sheet-overlay'));
            assert.deepEqual(errors,[]);await page.close();
        }
        console.log('Real MapLibre touch tests passed at 320/390: rendered canvas, horizontal gesture, pinch zoom, map-area swipe dismissal without content jump');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
