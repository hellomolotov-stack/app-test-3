const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{chromium}=require('./_playwright.cjs');
const root=path.resolve(__dirname,'..');
const fixture={id:'118f668a-5578-4f83-b07a-9143995d28d5',title:'хайк на Аю-Даг',kind:'route',rarity:'common',medal:{imageUrl:'/assets/achievements/md/badges/route-ayudag-v1.webp'},grant:{date:'2026-11-08',count:3,name:'Макс'}};
(async()=>{
 const {outputFiles}=await build({bundle:true,write:false,format:'iife',stdin:{resolveDir:root,contents:`import {state} from './js/state.js';import {drawAchievementsStory,openAchievementsPopup} from './js/ui/achievements-popup.js';state.user={id:163665735};state.userCard={status:'active'};window.renderStory=async id=>{state.user.id=id;const c=await drawAchievementsStory([${JSON.stringify(fixture)}]);document.body.replaceChildren(c);c.style.width='360px';c.style.height='640px';return c.toDataURL('image/jpeg',.9).length;};window.testShare=()=>{state.user.id=163665735;openAchievementsPopup([${JSON.stringify(fixture)}],{fresh:false});};`}});
 const b=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await b.newPage({viewport:{width:390,height:700}});let contexts=0;const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{
  const u=new URL(r.request().url());
  if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<body style="margin:0">'});
  if(u.pathname==='/api/story')return r.fulfill({json:{url:'https://story-test.local/story/test.jpg'}});
  if(u.pathname==='/api/achievements'){
   const action=r.request().postDataJSON().action;
   if(action==='collection')return r.fulfill({json:{collections:{'163665735':Array.from({length:14},(_,i)=>({...fixture,id:i?`badge-${i}`:fixture.id}))}}});
   if(action==='story_context'){contexts++;return r.fulfill({json:{date:'2026-11-08',title:'хайк на Аю-Даг',people:[{name:'Егор'},{name:'Иван'},{name:'Ксения'}]}});}
  }
  const f=path.join(root,u.pathname);
  if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});
  return r.fulfill({json:{}});
 });
 await p.goto('https://story-test.local');await p.addScriptTag({content:'window.Telegram={WebApp:{initData:"fixture",isVersionAtLeast:()=>true,shareToStory:url=>window.shared=url}}'});await p.addScriptTag({content:outputFiles[0].text});
 assert.ok(await p.evaluate(()=>renderStory(163665735))>100000);assert.equal(contexts,1);await p.locator('canvas').screenshot({path:'/private/tmp/pilot-story-max.png'});
 const maxPixel=await p.locator('canvas').evaluate(c=>[...c.getContext('2d').getImageData(20,1500,1,1).data]);assert.ok(maxPixel[2]>maxPixel[0],'Blue sky background');
 await p.evaluate(()=>renderStory(999));assert.equal(contexts,2,'Every authenticated account gets the branded story');const otherPixel=await p.locator('canvas').evaluate(c=>[...c.getContext('2d').getImageData(20,1500,1,1).data]);assert.ok(otherPixel[2]>otherPixel[0],'Blue sky for other accounts');assert.deepEqual(errors,[]);
 await p.addStyleTag({path:path.join(root,'style.css')});await p.evaluate(()=>testShare());await p.locator('[data-share-one]').click();await p.waitForFunction(()=>window.shared==='https://story-test.local/story/test.jpg');assert.equal(await p.locator('[data-share-one]').getAttribute('data-busy'),null);
 console.log('Branded story: all accounts, collection count, companions, exportable canvas and button/upload/Telegram handoff: PASS');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
