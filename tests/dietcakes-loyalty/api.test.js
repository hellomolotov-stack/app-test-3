const test=require('node:test'), assert=require('node:assert/strict');
const {createHandler}=require('../../api/dc-loyalty'), {signCard}=require('../../lib/dietcakes-loyalty/ledger');
const key='a'.repeat(40), signing='b'.repeat(40), actor='163665735';
function setup(overrides={}) {
 let accesses=0, writes=0, value=null, revision=0;
 const deps={env:{DC_LOYALTY_MODE:'pilot',DC_CARD_SIGNING_KEY:signing,DC_CASHIER_BOT_KEY:key,...overrides},
 activeMember:async()=>{accesses++;return true}, now:()=>Date.parse('2026-10-20T12:00:00Z'),
 store:()=>({async read(){accesses++;return {value,etag:revision}},async compareAndSet(uid,etag,next){if(etag!==revision)return false;value=next;revision++;writes++;return true}})};
 const handler=createHandler(deps);
 return {deps,get accesses(){return accesses},get writes(){return writes}, async request(body,headers={'x-dc-bot-key':key}) { const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method:'POST',body:{mode:'pilot',...body},headers},res);return res }};
}
test('disabled and unauthorized do not read or write member data',async()=>{
 const off=setup({DC_LOYALTY_MODE:'off'});assert.equal((await off.request({action:'card',actor})).code,503);assert.equal(off.accesses,0);
 const api=setup();assert.equal((await api.request({action:'card',actor},{})).code,401);assert.equal(api.accesses,0);
 assert.equal((await api.request({action:'card',actor},{'x-dc-bot-key':'я'.repeat(40)})).code,401);
});
test('pilot denies arbitrary actors and cards; refund permission explicit',async()=>{
 const api=setup();assert.equal((await api.request({action:'status',actor:'123',card:signCard(actor,signing)})).code,403);
 assert.equal((await api.request({action:'status',actor,card:signCard('123',signing)})).code,403);
 assert.equal((await api.request({action:'refund',actor,card:signCard(actor,signing)})).code,403);assert.equal(api.accesses,0);
});
test('inactive member cannot reserve; historical confirmation still works',async()=>{
 const api=setup(), card=signCard(actor,signing), body={actor,card,reference:'test1',gross:100000};
 assert.equal((await api.request({...body,action:'reserve'})).code,200);
 api.deps.activeMember=async()=>false;
 assert.equal((await api.request({...body,reference:'other',action:'reserve'})).code,403);
 assert.equal((await api.request({...body,action:'confirm'})).code,200);
 assert.equal((await api.request({...body,action:'confirm'})).body.payable,90000);
});
test('online is disabled independently and store cannot mint cards',async()=>{
 const api=setup({DC_STORE_KEY:'c'.repeat(40)}), headers={'x-dc-store-key':'c'.repeat(40)};
 assert.equal((await api.request({action:'reserve',actor},headers)).body.error,'online_disabled');
 api.deps.env.DC_ONLINE_ENABLED='1';assert.equal((await api.request({action:'card',actor},headers)).code,403);assert.equal(api.accesses,0);
});
test('app_card: only verified Telegram user with an active card gets own QR',async()=>{
 const api=setup({DC_LOYALTY_MODE:'live'}); api.deps.verifyInitData=d=>d==='ok'?{id:Number(actor)}:null;
 const r=async(b)=>api.request({...b,mode:'live'},{});
 assert.equal((await r({action:'app_card',initData:'bad'})).code,401);
 const good=await r({action:'app_card',initData:'ok'}); assert.equal(good.code,200);
 assert.ok(good.body.url.endsWith(signCard(actor,signing))); assert.equal(api.writes,0);
 api.deps.activeMember=async()=>false; assert.equal((await r({action:'app_card',initData:'ok'})).body.error,'inactive_card');
 const pilot=setup(); pilot.deps.verifyInitData=()=>({id:123});
 assert.equal((await pilot.request({action:'app_card',initData:'x'},{})).body.error,'pilot_card_only');
});
test('hike_order: store key required, notifies organizer with totals; cron summary',async()=>{
 const sk='c'.repeat(40), sent=[], db={};
 const api=setup({DC_LOYALTY_MODE:'live',DC_STORE_KEY:sk,DC_ONLINE_ENABLED:'1',CRON_SECRET:'d'.repeat(40)});
 api.deps.notify=async t=>sent.push(t);
 api.deps.hikeOrders={async save(o){(db[o.date] ||= {})[o.number]=o;return db[o.date]},async read(d){return db[d]||{}}};
 const order=n=>({number:String(n),status:'paid',date:'2026-10-25',route:'Ай-Петри',name:'Анна',phone:'+7',items:[{name:'CHIKABAR',qty:1,total:11800}],total:120000,card_discount:0,ready_food:false});
 const r=b=>api.request({actor:'0',...b,mode:'live'},{'x-dc-store-key':sk});
 assert.equal((await api.request({actor:'0',action:'hike_order',order:order(1),mode:'live'},{})).code,401);
 assert.equal((await r({action:'hike_order',order:{bad:1}})).code,400);
 assert.equal((await r({action:'hike_order',order:order(101)})).code,200);
 assert.match(sent[0],/Бокс на хайк 25\.10/); assert.match(sent[0],/забираешь в магазине/);
 await r({action:'hike_order',order:order(102)});
 assert.match(sent[1],/2 заказа на 2[\s ]400 ₽ → 🚚 магазин везёт/);
 await r({action:'hike_order',order:{...order(102),status:'cancelled'}});
 assert.match(sent[2],/отменён/); assert.match(sent[2],/1 заказ на 1[\s ]200 ₽/);
 // cron
 const res={setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};
 const h=require('../../api/dc-loyalty').createHandler(api.deps);
 await h({method:'GET',headers:{authorization:'Bearer wrong'}},res); assert.equal(res.code,401);
 api.deps.now=()=>Date.parse('2026-10-24T14:05:00Z');
});
test('shop staff: owner invites, employee joins via code, becomes cashier; others cannot manage',async()=>{
 const api=setup({DC_LOYALTY_MODE:'live',DC_OWNER_IDS:'163665735'}); const db={members:{},invites:{}};
 api.deps.staff={async members(){return db.members},async add(u,n){db.members[u]={name:n}},async remove(u){delete db.members[u]},
  async invite(exp){db.invites.abcdef1234={exp};return 'abcdef1234'},async takeInvite(c){const i=db.invites[c];delete db.invites[c];return i}};
 const r=(b)=>api.request({...b,mode:'live'});
 assert.equal((await r({action:'staff_invite',actor:'555'})).body.error,'owner_only');
 const code=(await r({action:'staff_invite',actor:'163665735'})).body.code;
 assert.equal((await r({action:'status',actor:'777',card:signCard(actor,signing)})).body.error,'cashier_forbidden');
 assert.equal((await r({action:'staff_join',actor:'777',code,name:'Ольга'})).code,200);
 assert.equal((await r({action:'staff_join',actor:'888',code})).body.error,'invite_expired');
 assert.equal((await r({action:'status',actor:'777',card:signCard(actor,signing)})).code,200);
 assert.deepEqual((await r({action:'staff_ids',actor:'777'})).body.ids,['777']);
 await r({action:'staff_remove',actor:'163665735',uid:'777'});
 assert.equal((await r({action:'status',actor:'777',card:signCard(actor,signing)})).body.error,'cashier_forbidden');
});
