const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');const {chromium}=require('./_playwright.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {outputFiles}=await build({bundle:true,write:false,format:'iife',stdin:{resolveDir:root,contents:`
 import {state} from './js/state.js';import {openAchievementsPopup} from './js/ui/achievements-popup.js';
 import {medalStripHtml,mountMyAchievements} from './js/ui/medals.js';
 import {openAchievementsCollection} from './js/ui/achievements-collection.js';
 state.user={id:163665735};state.userCard={status:'active'};
 const a={id:'118f668a-5578-4f83-b07a-9143995d28d5',title:'хайк на Аю-Даг',kind:'route',rarity:'common',description:'на спину Медведь-горы',medal:{imageUrl:'/assets/achievements/badges/route-ayudag-v1.png'},grant:{date:'2026-11-08',dates:['2025-11-23','2026-06-07','2026-11-08'],count:3,issuedAt:10}};
 a.seenAt=null;window.fixture=a;
 window.testShelf=async v2=>{document.querySelector('.ach-overlay')?.remove();document.getElementById('myAchievements')?.remove();document.documentElement.classList.toggle('v2',v2);await mountMyAchievements();};
 window.testCollection=()=>openAchievementsCollection([a]);
 document.getElementById('strip').innerHTML=medalStripHtml([a]);openAchievementsPopup([a],{fresh:false});`}});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [320,390,900]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="strip"></div><div id="cardBlock"></div>'});const f=path.join(root,u.pathname);if(u.pathname.startsWith('/assets/')&&fs.existsSync(f))return route.fulfill({path:f});if(u.pathname==='/api/achievements'&&route.request().postDataJSON()?.action==='collection')return route.fulfill({json:{collections:{'163665735':[await page.evaluate(()=>window.fixture)]}}});return route.fulfill({json:{status:'ok',granted:[],people:[]}});});
  await page.goto('https://repeat-test.local');await page.addStyleTag({content:fs.readFileSync(path.join(root,'style.css'),'utf8')});await page.addScriptTag({content:'window.Telegram={WebApp:{initData:"fixture"}}'});await page.addScriptTag({content:outputFiles[0].text});
  await page.locator('.ach-slide.is-on .route-repeat').waitFor();
  assert.equal(await page.locator('.ach-slide .route-repeat').textContent(),'×3');assert.equal(await page.locator('#strip .route-repeat').textContent(),'×3');
  const dates=await page.locator('.ach-meta').textContent();for(const date of ['23 ноября 2025','7 июня 2026','8 ноября 2026'])assert.ok(dates.includes(date));
  assert.equal(await page.locator('.ach-sheet').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await page.waitForTimeout(600);await page.screenshot({path:'/private/tmp/route-repeat-'+width+'.png',fullPage:true});
  for(const v2 of [false,true]){await page.evaluate(v=>testShelf(v),v2);assert.equal(await page.locator('#myAchievements .mya-new, #myAchievements .vt-new').count(),0);assert.equal(await page.locator('#myAchievements .route-repeat').textContent(),'×3');const colors=await page.locator('#myAchievements .route-repeat').evaluate(e=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));assert.equal(colors.bg,'rgb(217, 253, 25)');assert.equal(colors.color,'rgb(20, 24, 0)');}
  await page.evaluate(()=>testCollection());assert.ok(await page.locator('.acol-overlay .route-repeat').count()>0);await page.locator('[data-cat="routes"]').click();assert.equal(await page.locator('.bdg-g3 .route-repeat').textContent(),'×3');
  assert.deepEqual(errors,[]);await page.close();
 }console.log('Repeat badges UI: ×3 on badge and profile, all visit dates, no overflow at 320/390/900: PASS');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
