const assert=require('node:assert/strict');
const {grantHikeBadges}=require('../lib/hike-badges');
const date='2026-11-08',db={hikes:{[date]:{title:'хайк на Аю-Даг'}},hikeParticipants:{[date]:{'1':{name:'a'},'2':{name:'absent'},'7845375334':{name:'support'}}},noShows:{[date]:{'2':true}},clubAchievements:{r:{title:'хайк на Аю-Даг',kind:'route',medal:{imageUrl:'/a.png'},publicationStatus:'published',grants:{'1':{userId:'1',name:'a',date:'2025-11-23',issuedAt:1}},recipients:{}}}};
let writes=0,conflict=true;
const mock=async(url,opts={})=>{
 const p=new URL(url).pathname.replace(/^\//,'').replace(/\.json$/,'').split('/');
 let value=db;for(const k of p)value=value?.[k];
 if(opts.method==='PUT'){
  if(p[0]==='clubAchievements'&&conflict){conflict=false;return new Response('',{status:412});}
  let parent=db;for(const k of p.slice(0,-1))parent=parent[k]||= {};
  parent[p.at(-1)]=JSON.parse(opts.body);writes++;return Response.json(parent[p.at(-1)]);
 }
 return Response.json(value??null,{headers:{etag:'"test"'}});
};
(async()=>{
 const original=global.fetch;global.fetch=mock;
 try{
  const result=await grantHikeBadges(date,'test',{fetcher:mock});
  assert.equal(result.people.length,1);assert.equal(db.clubAchievements.r.grants['1'].count,2);
  assert.deepEqual(db.clubAchievements.r.grants['1'].dates,['2025-11-23',date]);
  assert.ok(db.clubAchievements.r.grants['1'].notificationAt>0);
  const n=writes;await grantHikeBadges(date,'test',{fetcher:mock});assert.equal(writes,n);
  console.log('Automatic route repeat: existing owner gets new date, CAS retry, no-shows/service excluded, rerun gives nothing twice: PASS');
 }finally{global.fetch=original;}
})().catch(e=>{console.error(e);process.exitCode=1});
