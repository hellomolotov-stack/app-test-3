const assert=require('node:assert/strict');
const {telegramUserpic,storyAvatar}=require('../lib/story-avatars');
(async()=>{
 const src='https://t.me/i/userpic/320/avatar.svg',calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url===src)return new Response('',{status:302,headers:{location:'https://cdn4.telesco.pe/file/avatar.jpg'}});
  return new Response(Buffer.from([1,2,3]),{headers:{'content-type':'image/jpeg'}});
 };
 assert.equal(await telegramUserpic(src,fetcher),'data:image/jpeg;base64,AQID');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.redirect==='manual'));
 let targets=[];
 assert.equal(await telegramUserpic(src,async u=>{targets.push(u);return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}})}),'');assert.equal(targets.length,1);
 assert.equal(await telegramUserpic('https://example.com/photo',fetcher),'');
 const bot=async(url,opts)=>{
  if(url.endsWith('/getChat'))return Response.json({ok:true,result:{photo:{small_file_id:'file'}}});
  if(url.endsWith('/getFile'))return Response.json({ok:true,result:{file_path:'photos/file_1.jpg'}});
  assert.ok(url.startsWith('https://api.telegram.org/file/botfixture/'));
  return new Response(Buffer.from([4,5]),{headers:{'content-type':'image/jpeg'}});
 };
 assert.equal(await storyAvatar('9991','','fixture',bot),'data:image/jpeg;base64,BAU=');
 const oversized=await telegramUserpic(src,async()=>new Response(new Uint8Array(320001),{headers:{'content-type':'image/jpeg'}}));assert.equal(oversized,'');
 console.log('Story avatars: Telegram CDN redirects, blocked untrusted targets, bot-photo fallback and bounded image size: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
