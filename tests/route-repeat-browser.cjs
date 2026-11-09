const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');const {chromium}=require('./_playwright.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {outputFiles}=await build({bundle:true,write:false,format:'iife',stdin:{resolveDir:root,contents:`
 import {state} from './js/state.js';import {openAchievementsPopup} from './js/ui/achievements-popup.js';
 import {medalStripHtml} from './js/ui/medals.js';
 state.user={id:163665735};state.userCard={status:'active'};
 const a={id:'118f668a-5578-4f83-b07a-9143995d28d5',title:'хайк на Аю-Даг',kind:'route',rarity:'common',description:'на спину Медведь-горы',medal:{imageUrl:'/assets/achievements/badges/route-ayudag-v1.png'},grant:{date:'2026-11-08',dates:['2025-11-23','2026-06-07','2026-11-08'],count:3,issuedAt:10}};
 document.getElementById('strip').innerHTML=medalStripHtml([a]);openAchievementsPopup([a],{fresh:false});`}});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [320,390,900]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="strip"></div>'});const f=path.join(root,u.pathname);if(u.pathname.startsWith('/assets/')&&fs.existsSync(f))return route.fulfill({path:f});return route.fulfill({json:{status:'ok',people:[]}});});
  await page.goto('https://repeat-test.local');await page.addStyleTag({content:fs.readFileSync(path.join(root,'style.css'),'utf8')});await page.addScriptTag({content:outputFiles[0].text});
  await page.locator('.ach-slide.is-on .route-repeat').waitFor();
  assert.equal(await page.locator('.ach-slide .route-repeat').textContent(),'×3');assert.equal(await page.locator('#strip .route-repeat').textContent(),'×3');
  const dates=await page.locator('.ach-meta').textContent();for(const date of ['23 ноября 2025','7 июня 2026','8 ноября 2026'])assert.ok(dates.includes(date));
  assert.equal(await page.locator('.ach-sheet').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.waitForTimeout(600);await page.screenshot({path:'/private/tmp/route-repeat-'+width+'.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }console.log('Repeat badges UI: ×3 on badge and profile, all visit dates, no overflow at 320/390/900: PASS');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
