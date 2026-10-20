'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {transition,split,signCard,verifyCard,transact}=require('../../lib/dietcakes-loyalty/ledger');
const now=Date.parse('2026-10-20T12:00:00Z');
const command=(action,reference,gross)=>({action,reference,gross,source:'offline',actor:'163665735'});
test('crossing limit splits gross before discount',()=>assert.deepEqual(split(300000,200000),{gross:300000,highGross:200000,lowGross:100000,discount:25000,payable:275000}));
test('confirmation and refund are idempotent',()=>{
 let state=transition(null,command('reserve','sale1',1300000),now).state;
 state=transition(state,command('confirm','sale1'),now).state;
 state=transition(state,command('confirm','sale1'),now).state;
 assert.equal(transition(state,{action:'status'},now).value.usedGross,1300000);
 const refund={...command('refund','sale1',100000),refundReference:'refund1'};
 state=transition(state,refund,now).state;state=transition(state,refund,now).state;
 assert.equal(transition(state,{action:'status'},now).value.usedGross,1200000);
 assert.throws(()=>transition(state,{...refund,gross:200000},now),/idempotency_conflict/);
});
test('holds consume availability, expire and cannot confirm across months',()=>{
 const state=transition(null,command('reserve','sale1',1400000),now).state;
 assert.equal(transition(state,{action:'quote',gross:300000},now).value.highGross,100000);
 assert.equal(transition(state,{action:'quote',gross:300000},now+600001).value.highGross,300000);
 assert.throws(()=>transition(state,command('confirm','sale1'),now+600001),/reservation_expired/);
 const edge=Date.parse('2026-10-31T20:59:00Z');
 const s=transition(null,command('reserve','edge',10000),edge).state;
 assert.throws(()=>transition(s,command('confirm','edge'),edge+120000),/month_changed/);
});
test('concurrent reserves cannot both spend same remaining limit',async()=>{
 let value=null,version=0;
 const store={async read(){return {value:structuredClone(value),etag:version}},async compareAndSet(uid,etag,next){if(etag!==version)return false;value=next;version++;return true}};
 const quotes=await Promise.all([transact(store,'1',command('reserve','a',1000000),now),transact(store,'1',command('reserve','b',1000000),now)]);
 assert.equal(quotes.reduce((sum,q)=>sum+q.highGross,0),1500000);
});
test('signed QR detects tampering and fits Telegram start',()=>{
 const secret='x'.repeat(40), token=signCard('163665735',secret);
 assert.equal(verifyCard(token,secret),'163665735');assert.ok(token.length<=64);
 assert.throws(()=>verifyCard(token.replace('163665735','163665736'),secret),/invalid_card/);
});
test('unknown write timeout is never automatically retried',async()=>{
 let writes=0;const store={async read(){return {value:null,etag:1}},async compareAndSet(){writes++;throw new Error('timeout')}};
 await assert.rejects(transact(store,'1',command('reserve','a',10000),now),/timeout/);assert.equal(writes,1);
});
test('online and offline share gross usage, refund remains in original month',()=>{
 let s=transition(null,command('reserve','offline',1300000),now).state;
 s=transition(s,command('confirm','offline'),now).state;
 const online={action:'reserve',source:'online',actor:'dietcakes',reference:'web-order',gross:400000};
 const reserved=transition(s,online,now);assert.equal(reserved.value.highGross,200000);assert.equal(reserved.value.lowGross,200000);
 s=transition(reserved.state,{...online,action:'confirm'},now).state;
 assert.equal(transition(s,{action:'status'},now).value.usedGross,1700000);
 const nextMonth=Date.parse('2026-11-01T12:00:00Z');
 s=transition(s,{...command('refund','offline',100000),refundReference:'old-sale-return'},nextMonth).state;
 assert.equal(transition(s,{action:'status'},nextMonth).value.usedGross,0);
 assert.equal(transition(s,{action:'status'},now).value.usedGross,1600000);
});
