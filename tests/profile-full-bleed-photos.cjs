const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('./_playwright.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.route('**/*',r=>r.abort());
  const photo='data:image/webp;base64,'+fs.readFileSync('assets/teaser/ayudag-1.webp').toString('base64');
  const card=(image)=>`<div class="profile-card"><div class="profile-avatar-wrap">${image?`<img class="profile-avatar" src="${photo}" alt="">`:'<div class="profile-avatar-placeholder">А</div>'}</div><div class="profile-name-status"><span class="profile-name">Анна</span><div class="profile-status-tags"><span class="status-tag">дружба</span></div></div><div class="profile-section-title">увлечения</div><div class="profile-section-text">горы и фотография</div><div class="profile-section-title">профессия</div><div class="profile-section-text">дизайнер</div><div class="profile-contact-row"><button class="profile-contact-btn">💬</button></div></div>`;
  await page.setContent(`<html class="v2"><body><main style="max-width:520px;margin:auto"><div class="card-container"><div class="profiles-two-columns"><div class="profiles-column">${card(true)}</div><div class="profiles-column">${card(false)}</div></div></div></main></body></html>`);
  await page.addStyleTag({content:fs.readFileSync('style.css','utf8')});
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  for(const width of [320,390,600,900]){
   await page.setViewportSize({width,height:900});
   for(const el of await page.locator('.profile-card').all()){
    const box=await el.evaluate(c=>{const card=c.getBoundingClientRect(),photo=c.querySelector('.profile-avatar-wrap').getBoundingClientRect(),name=c.querySelector('.profile-name-status').getBoundingClientRect();return{left:photo.left-card.left,right:card.right-photo.right,top:photo.top-card.top,ratio:photo.width/photo.height,padding:name.left-card.left,overflow:c.scrollWidth>c.clientWidth+1}});
    assert.ok(Math.abs(box.left-1)<1&&Math.abs(box.right-1)<1,'Photo reaches both card edges');assert.ok(Math.abs(box.top-1)<1,'Photo starts at the card top');assert.ok(Math.abs(box.ratio-1)<.01);assert.equal(box.padding,13,'Text padding unchanged');assert.equal(box.overflow,false);
   }
   if(width===390)await page.screenshot({path:'/private/tmp/profiles-wide-photos-390.png',fullPage:true});
  }
  console.log('Profile photos: full-width square photo/fallback, unchanged text padding, no overflow at 320/390/600/900: PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
