const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.WEARMATE_PLAYWRIGHT || 'playwright');
const base=process.env.WEARMATE_PREVIEW || 'http://127.0.0.1:4173';
const folder=path.join(__dirname,'../stage4-evidence');
const record={scenarios:{}};

async function verify(browser) {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  const worn=()=>page.locator('#avatar [data-wearable]:not([hidden])').evaluateAll(rows=>[...new Set(rows.map(row=>row.dataset.wearable))].sort());
  const expected=(card)=>card.locator('img').evaluateAll(imgs=>imgs.map(i=>new URL(i.src).pathname.split('/').pop().replace('.webp','')).sort());
  const shot=async(name,fullPage=false)=>{
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(folder,name+'.png'),fullPage});
  };
  await page.goto(base);
  await page.locator('#today-entry').click();
  await page.locator('#weather-mode option[value=mild]').waitFor({state:'attached'});
  await page.waitForFunction(()=>!document.querySelector('#weather-summary').hidden ||
    document.querySelector('#weather-status').textContent.includes('失败'),{},{timeout:18000});
  record.live={source:await page.locator('#weather-source').textContent(),message:await page.locator('#weather-status').textContent()};
  if (record.live.source.includes('Open-Meteo') && !record.live.message) {
    record.live.weather=await page.locator('#weather-summary').innerText();
    await shot('weather-page');
  } else await shot('live-unavailable');
  const avatar=page.locator('#avatar');
  async function faceShot(name) {
    await avatar.screenshot({path:path.join(folder,'figure-'+name+'.png')});
  }
  await faceShot('before');
  if (record.live.weather) {
    await page.selectOption('#weather-city','北京');
    await page.locator('#weather-summary:visible #weather-condition').getByText('北京',{exact:false}).waitFor();
    record.secondCity=await page.locator('#weather-summary').innerText();
    await shot('live-beijing');
    await page.selectOption('#weather-city','上海');
  }
  for(const id of ['mild','cold','hot','rain']){
    await page.selectOption('#weather-mode',id);
    const cards=page.locator('.plan-card');
    assert.equal(await cards.count(),2);
    const plans=[];
    for(let i=0;i<2;i++) {
      const card=cards.nth(i);await card.locator('button').click();
      assert.deepEqual(await worn(),await expected(card));
      assert.equal(await page.locator('#avatar').getAttribute('data-profile'),'woman-bob');
      const members=await worn();
      if(id==='cold') assert.ok(members.includes('white-puffer'));
      if(id==='hot') assert.ok(!members.includes('white-puffer'));
      if(id==='rain') assert.ok(!members.includes('ivory-mary-janes'));
      plans.push(members);
      if(id==='mild') await faceShot(i?'mild-b':'mild-a');
      if(id==='mild'||i===1) await shot(id+'-'+(i?'b':'a'));
    }
    record.scenarios[id]=plans;
  }
  await page.selectOption('#weather-mode','mild');
  await page.locator('[data-plan=outfit-a] button').click();
  await page.locator('[data-plan=outfit-b] button').click();
  const selected=await worn();
  await page.locator('#look-title').fill('今日春日穿搭');await page.locator('#save-look-button').click();
  await page.locator('#saved-look-status').getByText('已保存',{exact:false}).waitFor();
  await page.getByRole('navigation').getByText('我的衣橱').click();
  await page.getByRole('navigation').getByText('穿搭工作台').click();
  await page.locator('#save-look-button:enabled').waitFor();
  assert.deepEqual(await worn(),selected);
  await page.reload();await page.locator('#save-look-button:enabled').waitFor();assert.deepEqual(await worn(),selected);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wearmate.saved-looks.v1')).looks[0]);
  assert.equal(saved.roleId,'woman-bob');assert.equal(saved.dress,'floral-maxi');assert.equal(saved.top,null);
  record.saved=saved;
  await page.locator('#today-entry').click();await page.locator('.plan-card').first().waitFor();
  await page.setViewportSize({width:390,height:844});
  for(const [idx,key] of ['a','b'].entries()) {
    await page.locator('.plan-card button').nth(idx).click();
    assert.deepEqual(await worn(),record.scenarios.mild[idx]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await shot('mobile-'+key,true);
  }
  await page.setViewportSize({width:1440,height:900});
  const route='https://api.open-meteo.com/**';let attempts=0;
  await page.route(route,r=>{attempts++;return r.abort()});
  await page.selectOption('#weather-mode','live');
  await page.locator('#weather-status').getByText('天气获取失败',{exact:false}).waitFor();
  await shot('weather-error');
  assert.equal(await page.locator('.plan-card').count(),0);
  await page.locator('#weather-retry').click();
  await page.locator('#weather-status').getByText('天气获取失败',{exact:false}).waitFor();
  assert.equal(attempts,2);
  await page.unroute(route);await page.locator('#weather-retry').click();
  await page.waitForFunction(()=>!document.querySelector('#weather-summary').hidden ||
    document.querySelector('#weather-status').textContent.includes('失败'));
  record.retryRecovered=await page.locator('#weather-summary').isVisible();
  await page.selectOption('#weather-mode','mild');
  await page.selectOption('#weather-city','纽约');
  assert.match(await page.locator('#weather-source').innerText(),/模拟天气.*America\/New_York/);
  await page.evaluate(async()=>{
    const {openPersonalWardrobe}=await import('/src/wardrobe/personal.mjs');
    const {store}=openPersonalWardrobe(localStorage,'woman-bob');
    for(const item of store.list().filter(i=>i.category==='top')) store.edit(item.id,{...item,availability:'washing'});
  });
  await page.reload();await page.locator('.plan-card').first().waitFor();
  assert.equal(await page.locator('.plan-card').count(),1);await shot('only-one');
  await page.locator('.adjust-link').click();
  await page.locator('[data-outfit=casual]:enabled').click();
  const previousLook=await worn();
  await page.locator('#today-entry').click();await page.locator('.plan-card').first().waitFor();
  await page.route('**/woman-bob/floral-maxi.webp',r=>r.abort());await page.reload();
  await page.locator('#weather-notes').getByText('加载失败',{exact:false}).waitFor();
  assert.equal(await page.locator('.plan-card').count(),0);await shot('insufficient');
  assert.deepEqual(await worn(),previousLook);
  assert.deepEqual(errors,[]);
  record.errors=errors;record.retries=attempts;record.chrome=browser.version();
  fs.writeFileSync(path.join(folder,'browser-results.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify(record));
}
(async()=>{
 fs.mkdirSync(folder,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {await verify(browser)} finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

