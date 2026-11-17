const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('./_playwright.cjs');
const fs = require('node:fs');
(async () => {
    const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', stdin: { resolveDir: process.cwd(), contents: `
        import {startHofLinkScroll,cancelHofLinkScroll,deferHofHomeRender,hofLinkActive,hofLinkGeneration} from './js/ui/hof-link-scroll.js';
        window.controls={cancelHofLinkScroll,deferHofHomeRender,hofLinkActive,hofLinkGeneration};
        window.samples=[];window.writes=[];window.renders=0;window.ready=true;
        const original=window.scrollTo.bind(window);window.scrollTo=(...args)=>{writes.push(performance.now());original(...args);};
        function sample(){samples.push({t:performance.now(),y:scrollY});requestAnimationFrame(sample)}sample();
        window.start=options=>{window.result=null;return startHofLinkScroll({getTarget:()=>document.querySelector('#hofBlock .hof-card'),getTopOffset:()=>60,isReady:()=>window.ready,...options}).then(r=>{window.result=r;return r;});};
        window.queueRender=()=>{const render=()=>{window.renders++;const root=document.getElementById('mainContent');root.innerHTML='<div style="height:2300px"></div><div id="hofBlock"></div><div style="height:1200px"></div>';setTimeout(()=>{document.getElementById('hofBlock').innerHTML='<div class="hof-card" style="height:340px">дыхание</div>'},120);};if(!deferHofHomeRender(render))render();};
    ` } });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [390, 900]) {
            const page = await browser.newPage({ viewport: { width, height: 844 } });
            const errors=[];page.on('pageerror',e=>errors.push(e.message));
            const setup=async()=>{
                await page.goto('about:blank');
                await page.setContent('<style>html{scroll-behavior:smooth}body{margin:0}#mainContent{background:#10151b;color:white}.hof-card{background:#202b20}</style><main id="mainContent"><div id="above" style="height:1900px">главная</div><div id="hofBlock"><div class="hof-card" style="height:340px">дыхание</div></div><div style="height:1200px"></div></main>');
                await page.addScriptTag({content:outputFiles[0].text});
            };
            const arrived=async()=>{
                await page.waitForFunction(()=>window.result===true,{},{timeout:12000});
                const v=await page.evaluate(()=>{
                    const r=document.querySelector('.hof-card').getBoundingClientRect();
                    return {error:Math.abs(r.top-Math.max(60,(innerHeight-r.height)/2)),behavior:document.documentElement.style.scrollBehavior,height:document.getElementById('mainContent').style.minHeight,active:controls.hofLinkActive(),glow:document.querySelector('.hof-card').classList.contains('hof-link-glow'),step:Math.max(...samples.slice(1).map((p,i)=>Math.abs(p.y-samples[i].y)))};
                });
                assert.ok(v.error<=4,'Arrive centered');assert.ok(v.step<130,`No jump: ${JSON.stringify(v)}`);assert.equal(v.active,false);assert.equal(v.behavior,'');assert.equal(v.height,'');assert.equal(v.glow,true);
                return v;
            };
            await setup();await page.evaluate(()=>{window.ready=false;start();});await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>scrollY),0);await page.evaluate(()=>window.ready=true);await arrived();
            await setup();await page.evaluate(()=>{start();});await page.waitForFunction(()=>scrollY>150);
            await page.evaluate(()=>{document.getElementById('above').style.height='2300px';queueRender();queueRender();});
            await arrived();assert.equal(await page.evaluate(()=>renders),1,'Coalesce full home renders');
            if(width===390)await page.screenshot({path:'/private/tmp/hof-smooth-arrival.png'});
            await setup();await page.evaluate(()=>{start();});await page.waitForFunction(()=>scrollY>100);
            const cancelled=await page.evaluate(()=>{queueRender();dispatchEvent(new Event('touchstart'));return {n:writes.length,y:scrollY};});
            await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>writes.length),cancelled.n,'No late scroll after touch');assert.equal(await page.evaluate(()=>result),false);assert.equal(await page.evaluate(()=>controls.hofLinkActive()),false);
            await setup();await page.evaluate(()=>{start();});await page.waitForFunction(()=>scrollY>100);await page.evaluate(()=>{window.first=start();});await arrived();
            await setup();await page.evaluate(()=>{document.getElementById('hofBlock').remove();start({timeout:350});});await page.waitForFunction(()=>window.result===false);assert.equal(await page.evaluate(()=>controls.hofLinkActive()),false);
            assert.deepEqual(errors,[]);await page.close();
        }
        // Other deep links must retain their existing helper; only hof uses the new controller.
        const main=fs.readFileSync('js/main.js','utf8');
        assert.match(main,/case 'hof':[\s\S]*?startHofLinkScroll/);
        assert.match(main,/case 'calendar':[\s\S]*?scrollToWhenReady/);
        console.log('Hof link: readiness, 400px layout shift without jump, deferred/coalesced rerender, touch cancellation, repeated link, timeout, style cleanup and unchanged calendar path: PASS');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
