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
