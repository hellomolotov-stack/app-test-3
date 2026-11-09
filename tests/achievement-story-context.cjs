const assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.TELEGRAM_BOT_TOKEN='story-context-test';
const {createHandler}=require('../api/achievements');
const id='118f668a-5578-4f83-b07a-9143995d28d5';
const data={
 [`clubAchievements/${id}`]:{title:'хайк на Аю-Даг',publicationStatus:'published',medal:{imageUrl:'/a.png'},grants:{'163665735':{date:'2026-11-08',issuedAt:1}}},
 'hikes/2026-11-08':{title:'хайк на Аю-Даг'},
 'hikeParticipants/2026-11-08':{'163665735':{name:'Макс'},'1':{name:'Егор',photoUrl:'https://t.me/i/userpic/320/photo.jpg'},'2':{name:'не пришёл'},'3':{name:'без фото',photoUrl:'https://private.example/avatar'},'7845375334':{name:'служебный'}},
 'noShows/2026-11-08':{'2':true},
};
const requested=[];
const handler=createHandler({getAccessToken:async()=> 'fixture',fetch:async(url)=>{
 requested.push(String(url));
 if(String(url).startsWith('https://t.me/'))return new Response(Buffer.from([1,2,3]),{headers:{'content-type':'image/jpeg'}});
 const key=new URL(url).pathname.slice(1).replace(/\.json$/,'');return Response.json(data[key]||null,{headers:{etag:'"test"'}});
}});
function signed(uid){const p=new URLSearchParams({user:JSON.stringify({id:uid}),auth_date:String(Math.floor(Date.now()/1000))});const secret=crypto.createHmac('sha256','WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',secret).update([...p].map(([k,v])=>`${k}=${v}`).sort().join('\n')).digest('hex'));return p.toString();}
async function call(uid,award=id){let status,body;await handler({method:'POST',body:{action:'story_context',id:award,initData:signed(uid)}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
(async()=>{
 assert.equal((await call(999)).status,403);assert.equal(requested.length,0);
 const r=await call(163665735);assert.equal(r.status,200);assert.deepEqual(r.body.people.map(p=>p.userId),['1','3']);assert.ok(r.body.people[0].image.startsWith('data:image/jpeg;'));assert.equal(r.body.people[1].image,'');assert.ok(!requested.some(u=>u.includes('private.example')));
 delete data[`clubAchievements/${id}`].grants['163665735'];assert.equal((await call(163665735)).status,404);
 console.log('Story context: Max-only, own-grant authorization, absent/self/service exclusions, trusted image source and safe initials fallback: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
