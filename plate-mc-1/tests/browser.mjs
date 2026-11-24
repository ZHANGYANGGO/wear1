import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { signalingFixture } from "./signaling.mjs";

// Input uses the same DOM buttons and keys as a player. Only read confirmed poses
// from the running Vite module, to steer without changing the physics world.
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
const campaign=process.env.CAMPAIGN;
const executablePath = process.env.BROWSER_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium", "/usr/bin/google-chrome",
].find(existsSync);
const browser = await chromium.launch({ executablePath, args: [
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
] });
const errors = [];
const testSignal=signalingFixture();
async function player(options={}) {
  const context = await browser.newContext({viewport:{width:1280,height:850},...options});
  if(process.env.SIGNAL_FIXTURE==="1")await testSignal(context);
  const page = await context.newPage();
  if(campaign==="extension"){
    // Serve the same development module with one extra catalog row, including on reload.
    await page.route("**/shared/equipment.ts*",async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+'\nproducts.testVan={name:"试验车型",price:21,limit:1,effect:"vehicle",width:350};\n'});
    });
  }
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(campaign?base:base+"/?order=practice"); await page.waitForSelector("#stage canvas");
  await page.waitForFunction(()=>document.querySelector("#hint").textContent.length>0);
  await page.locator('[data-command="new"]').click();
  await page.locator('[data-command="start"]').click();
  return {page,context,held:new Set()};
}
async function read(p) {
  return p.page.evaluate(async () => {
    // Use the URL loaded by this page, including Vite's hot-update timestamp.
    const entry=performance.getEntriesByType("resource").find(r=>new URL(r.name).pathname==="/src/session.ts");
    const {session} = await import(entry.name);
    return {f:session.frame, id:session.id,r:session.run};
  });
}
async function hold(p, keys) {
  if(p.braced)keys=["q",...keys.filter(k=>k!=="q")];
  for(const k of p.held) if(!keys.includes(k)) {await p.page.keyboard.up(k);p.held.delete(k);}
  for(const k of keys) if(!p.held.has(k)) {await p.page.keyboard.down(k);p.held.add(k);}
}
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn, label, ms=4500) {
  const start=Date.now();while(Date.now()-start<ms){if(await fn())return;await sleep(40);}
  throw new Error(label);
}
async function moveTo(players,targets,{near=6,angle,angleItem,brace=false,timeout=12000}={}) {
  const start=Date.now();
  while(Date.now()-start<timeout){
    const all=await Promise.all(players.map(read));
    const desired=all.map(({f,id},i)=>{
      const me=f.people.find(p=>p.id===id);
      const [x,y]=targets[i],dx=x-me.x,dy=y-me.y;
      const keys=[];
      if(Math.abs(dx)>near)keys.push(dx>0?"d":"a");
      if(Math.abs(dy)>near)keys.push(dy>0?"s":"w");
      if(brace)keys.push("q");
      if(angle!==undefined){
        const pose=angleItem?f.extras.find(e=>e.id===angleItem):f.sofa;
        const err=Math.atan2(Math.sin(angle-pose.angle),Math.cos(angle-pose.angle));
        if(Math.abs(err)>.075)keys.push(err>0?"e":"q");
      }
      return keys;
    });
    await Promise.all(players.map((p,i)=>hold(p,desired[i])));
    if(desired.every(k=>k.every(key=>brace && key==="q"))){await Promise.all(players.map(p=>hold(p,[])));return;}
    // At 20 Hz the last authoritative sample can be behind several key steps.
    // Use short key taps on the final approach, then wait for the next snapshot.
    const closeOnline=all.every(({f,id},i)=>{
      const me=f.people.find(p=>p.id===id);
      return id!=="local" && Math.hypot(me.x-targets[i][0],me.y-targets[i][1])<55;
    });
    if(closeOnline){
      await sleep(28);await Promise.all(players.map(p=>hold(p,[])));await sleep(90);
    }else await sleep(32);
  }
  await Promise.all(players.map(p=>hold(p,[])));
  throw new Error(`达到目标失败 ${JSON.stringify(targets)} ${JSON.stringify(await read(players[0]))}`);
}
async function tap(p,key){await p.page.keyboard.press(key);await sleep(100);}
const hand=(_p,frame)=>frame.f.people.find(m=>m.id===frame.id)?.end;
const walk=(p,x,y,options)=>moveTo([p],[[x,y]],options);
const current=async(p)=>(await read(p)).f;
const selected=new Set((process.env.CASES || "A,B,C,D,E").split(","));
async function path(p,points){for(const [x,y] of points)await walk(p,x,y);}
async function grab(p,item){
  await tap(p,"Space");
  await until(async()=>{
    const {id,f}=await read(p);return f.people.find(v=>v.id===id)?.held===item;
  },"抓放同步 "+item);
}
async function signed(p,key,count){
  await until(async()=>{const f=await current(p);return f.signed[key] && f.count===count;},"签收 "+key);
  assert.equal(await p.page.locator("#count").innerText(),count+" / 3");
}
async function pick(p,item){
  const f=await current(p);
  await walk(p,f[item].x,f[item].y);await grab(p,item);
}
async function sofaHandle(p,end){
  const sofa=(await current(p)).sofa;
  const offset=end===0?-70:70;
  await walk(p,sofa.x+offset*Math.cos(sofa.angle),sofa.y+offset*Math.sin(sofa.angle));
}
async function sofaIndoor(p,x=560) {
  await sofaHandle(p,0);await tap(p,"f");await until(async()=>(await current(p)).board===0,"安装滑板 "+JSON.stringify(await read(p)));
  await sofaHandle(p,1);await grab(p,"sofa");assert.equal(hand(p,await read(p)),1);
  await walk(p,635,188,{angle:0});await walk(p,560,258,{angle:Math.PI/2});
  await walk(p,x,505,{angle:Math.PI/2});
  const partial=await current(p);assert.ok(partial.inside>0 && partial.inside<4 && !partial.signed.sofa);
  await walk(p,x,620,{angle:Math.PI/2});await grab(p,null);
}
const backIndoor=[[560,350],[560,188],[326,188]];
const backYard=[[680,406],[440,423],[134,435],[134,318]];
async function bringSmall(p,item,route,x,y){
  await pick(p,item);
  if(route==="inside")await path(p,[[336,188],[560,188],[560,353],[x,383]]);
  else {
    if(item==="plant")await path(p,[[96,120],[96,302]]);
    await path(p,[[134,312],[134,438],[424,431],[x,401]]);
  }
  await walk(p,x,y);await grab(p,null);
}
async function fresh(p,scenario){
  const before=await current(p);
  await p.page.locator(before.scenario===scenario?"#reset":"#scenario").click();
  await until(async()=>{const f=await current(p);return f.round>before.round && f.scenario===scenario && f.count===0;},"重开 "+scenario);
}
async function business(a,mode){
  let partner;
  const wantsLoss=["loss","lossduo","ledger"].includes(mode);
  if(mode==="duo" || mode==="lossduo" || mode==="deadline-duo"){
    await a.page.locator("#multi").click();await a.page.locator("#create").click();
    await a.page.waitForSelector("#online");await a.page.locator('[data-command="start"]').click();
    partner=await player();await partner.page.goto(a.page.url());
    await partner.page.waitForSelector("#online",{timeout:30000});
    await until(async()=>(await read(a)).f.people.length===2 && (await read(partner)).r.phase==="moving","两名搬运工加入");
    await a.page.bringToFront();
  }
  if(mode==="deadline-duo" || mode==="refresh"){
    const before=await read(a);
    await sleep(1100);await a.page.reload();await a.page.waitForSelector("#stage canvas");
    await until(async()=>(await read(a)).r.token===before.r.token,"刷新回到同一次尝试");
    assert.ok((await read(a)).r.remaining<before.r.remaining);
    await until(async()=>(await read(a)).r.phase==="missing","到点缺件",17000);
    if(partner){await until(async()=>(await read(partner)).r.phase==="missing","双方到点收工");}
    await a.page.reload();await a.page.waitForSelector('[data-command="retry"]');assert.equal((await read(a)).r.wallet,0);
    console.log("刷新保留截止时刻，到点回执一致，刷新回执仍可重试");return;
  }
  const started=Date.now();
  const move=async(points,brace=false)=>{for(const [x,y] of points)await walk(a,x,y,{brace});};
  const item=async(id)=>{
    const f=await current(a),pos=f.extras.find(e=>e.id===id)??f[id];
    await walk(a,pos.x,pos.y);await grab(a,id);
  };
  const drop=async()=>{await grab(a,null);a.braced=false;await hold(a,[]);await sleep(750);};
  const goHome=()=>move([[560,379],[560,188],[340,188]]);
  if(mode==="weather"){
    await move([[134,312],[134,442],[272,464]]);await item("box");await move([[150,425]]);await drop();
    await until(async()=>(await read(a)).r.weather==="rain","同种子首场雨",45000);
    assert.equal((await current(a)).books,"dry");
    a.page.once("dialog",d=>d.accept());await a.page.locator("#new-run").click();
    await a.page.locator('[data-command="start"]').click();
    await item("cart");await move([[134,318],[134,448],[328,464]]);
    await until(async()=>(await current(a)).books==="wet","第二次同刻淋湿",45000);
    await tap(a,"f");assert.equal((await current(a)).books,"cart");
    await move([[430,417],[613,406],[613,475]]);await drop();await signed(a,"books",1);
    const f=await current(a);assert.equal(f.tape,1);assert.ok(Math.abs(f.cart.y-475)<10);
    console.log("同种子对照：屋檐下书箱干燥，淋湿后转装推车，占用折叠桌的车尾位置");return;
  }
  const required=async(outside=false)=>{
    await sofaIndoor(a,530);await signed(a,"sofa",1);
    if(outside){
      await move([[530,400],[330,451],[272,464]]);await item("box");
      await move([[440,412],[656,404],[656,609]]);await drop();
    }else{
      await goHome();await item("box");
      await move([[337,188],[560,188],[560,377],[656,404],[656,609]]);await drop();
    }
    await signed(a,"books",2);await goHome();a.braced=!wantsLoss;await hold(a,[]);await item("plant");
    if(wantsLoss){
      for(const key of ["d","a","d","a"]){await hold(a,[key]);await sleep(110);}await hold(a,[]);
      assert.equal((await current(a)).spilled,true);
    }
    await move([[340,188],[560,188],[560,377],[613,403],[613,523]],true);
    await drop();await signed(a,"plant",3);
  };
  const carryExtra=async(id,x,y)=>{
    await goHome();await item(id);
    await move([[350,187],[560,187],[560,365],[x,385],[x,y]]);
    await drop();assert.ok((await current(a)).extras.find(e=>e.id===id).signed,id+" signed");
  };
  const close=async()=>{
    await move([[611,438]]);await a.page.locator("#close-order").click();
  };
  await required();
  console.log("必搬三件完成（自动键盘）",Math.round((Date.now()-started)/1000),"秒");
  if(mode==="packing"){
    await carryExtra("extra:table-2",613,475);
    const tablePay=await a.page.locator("#net-pay").innerText();assert.equal(tablePay,"+32");
    // The table fits along the rear lip. The mirror needs the middle lane.
    await item("extra:table-2");await move([[613,390],[745,385]]);await drop();
    await item("plant");await move([[661,482]],true);await drop();
    await goHome();await item("extra:mirror-1");
    await move([[220,280],[250,188]]);
    const rotate=(x,y,angle)=>walk(a,x,y,{angle,angleItem:"extra:mirror-1",near:8});
    await rotate(250,188,Math.PI/2);await rotate(550,188,Math.PI/2);
    await rotate(556,188,0);await rotate(557,375,0);await rotate(600,377,0);await rotate(600,552,0);
    await drop();
    const f=await current(a),mirror=f.extras.find(e=>e.kind==="mirror");
    assert.ok(mirror.signed);console.log("实搬桌与镜",tablePay,await a.page.locator("#net-pay").innerText(),JSON.stringify(f.plant));return;
  }
  if(mode==="ledger"){
    assert.equal(await a.page.locator("#net-pay").innerText(),"-5");
    await carryExtra("extra:lamp-1",658,509);
    assert.equal(await a.page.locator("#actual-pay").innerText(),"115");
    await item("extra:lamp-1");await move([[658,391]]);
    assert.equal(await a.page.locator("#actual-pay").innerText(),"95");
    await move([[658,509]]);await drop();
    assert.equal(await a.page.locator("#actual-pay").innerText(),"115");
    assert.equal(await a.page.locator("#net-pay").innerText(),"+15");
    assert.equal(await a.page.locator("#wallet").innerText(),"0");
    console.log("掉土后净亏 5，灯装卸三次实收为 115、95、115，未收工钱包为零");return;
  }
  if(wantsLoss){
    await close();await until(async()=>(await a.page.locator("#close-order").innerText())==="确认关门","亏损差额");
    await a.page.locator("#close-order").click();
    if(!partner){
      await a.page.waitForSelector('[data-command="accept"]');
      // Both tabs start at the identical locked receipt to exercise both choices.
      const copy=await a.page.evaluate(()=>Object.entries(sessionStorage));
      const retryPage=await a.context.newPage();
      await retryPage.addInitScript(data=>{
        if(!sessionStorage.length)for(const [key,value] of data)sessionStorage.setItem(key,value);
      },copy);
      await retryPage.goto(base);
      await retryPage.locator('[data-command="retry"]').click();await retryPage.reload();
      await retryPage.waitForSelector('[data-command="start"]');assert.equal(await retryPage.locator("#wallet").innerText(),"0");
      await a.page.reload();await a.page.locator('[data-command="accept"]').click();
      await a.page.waitForSelector('[data-command="next"]');await a.page.reload();await a.page.waitForSelector('[data-command="next"]');
      const r=(await read(a)).r;assert.equal(r.wallet,-5);assert.equal(r.profit,-5);
      console.log("同一亏损存档分别重试和接受，刷新后对应余额为 0 与 -5");return;
    }
    await partner.page.waitForSelector('[data-command="retry"]');
    await Promise.all([a.page.locator('[data-command="accept"]').evaluate(b=>b.click()),partner.page.locator('[data-command="retry"]').evaluate(b=>b.click())]);
    await sleep(300);const x=(await read(a)).r,y=(await read(partner)).r;
    assert.equal(x.token,y.token);assert.equal(x.wallet,y.wallet);assert.ok(["brief","shop"].includes(x.phase));
    assert.equal(x.wallet,x.phase==="shop"?-5:0);
    console.log("相反选择结果一致",x.phase,x.wallet);return;
  }
  if(partner){
    const lamp=(await current(partner)).extras.find(e=>e.kind==="lamp");
    await walk(partner,lamp.x,lamp.y);await grab(partner,lamp.id);
    await path(partner,[[350,187],[560,187],[560,365],[658,385],[658,509]]);
    await grab(partner,null);await until(async()=>(await current(a)).extras.find(e=>e.kind==="lamp").signed,"搭档送灯");
  }else await carryExtra("extra:lamp-1",658,509);
  assert.equal(await a.page.locator("#net-pay").innerText(),"+40");
  await close();await a.page.waitForSelector('[data-product="van"]');
  const pid=mode==="extension"?"testVan":mode==="tarp"?"tarp":"van";
  const buys=[a,...partner?[partner]:[]].map(p=>p.page.locator('[data-product="'+pid+'"]').evaluate(b=>b.click()));
  await Promise.all(buys);await sleep(200);
  let r=(await read(a)).r;assert.equal(r.wallet,pid==="testVan"?19:pid==="van"?0:25);assert.equal(r.stock[pid],1);
  if(partner){
    r=(await read(partner)).r;assert.equal(r.stock.van,1);assert.equal(r.wallet,0);
    const receipt=r.token;
    await a.page.reload();await a.page.waitForSelector('[data-command="next"]');
    await until(async()=>(await read(a)).f.people.length===2,"房主刷新后搭档重连",25000);
    for(const p of [a,partner]){
      const restored=(await read(p)).r;
      assert.equal(restored.token,receipt);assert.equal(restored.stock.van,1);assert.equal(restored.wallet,0);
    }
  }
  else{await a.page.reload();await a.page.waitForSelector('[data-command="next"]');assert.equal((await read(a)).r.stock[pid],1);}
  if(mode==="extension"){
    await a.page.getByRole("button",{name:"换回基础车"}).click();
    await a.page.getByRole("button",{name:"试验车型 · 装备"}).click();
  }
  await a.page.locator('[data-command="next"]').click();await a.page.locator('[data-command="start"]').click();await sleep(150);
  assert.equal((await current(a)).width,pid==="testVan"?350:pid==="van"?322:214);
  if(mode==="extension"){console.log("测试车型自动上架、购买、刷新、切换装备、下一关车宽 350");return;}
  if(partner){assert.equal((await current(partner)).width,322);console.log("团队 40 买一辆大车，两窗口同入第二关");return;}
  if(pid==="tarp"){
    await move([[135,300],[135,455],[272,464]]);await tap(a,"f");assert.ok((await current(a)).covered);
    await until(async()=>(await read(a)).r.weather==="rain","固定雨到来",45000);
    assert.equal((await current(a)).books,"dry");console.log("用首关收入购买雨布，露天书箱保持干燥");return;
  }
  // Put books under the awning before the rain. Afterwards use the extension lane.
  await move([[134,315],[134,443],[272,464]]);await item("box");await move([[150,425]]);await drop();
  await move([[134,309],[139,188]]);await sofaIndoor(a,530);await signed(a,"sofa",1);
  await move([[530,400],[150,425]]);await item("box");await move([[430,416],[665,392],[665,610]]);await drop();await signed(a,"books",2);
  await goHome();a.braced=mode!=="lossduo";await hold(a,[]);await item("plant");await move([[340,188],[560,188],[560,377],[613,403],[613,523]],true);await drop();await signed(a,"plant",3);
  await carryExtra("extra:lamp-1",759,541);
  assert.ok((await current(a)).extras.find(e=>e.kind==="lamp").x>691);
  await close();await a.page.waitForSelector('[data-command="new"]');
  r=(await read(a)).r;assert.equal(r.phase,"end");assert.equal(r.profit,40+r.receipt.net);assert.equal(r.wallet,r.receipt.net);
  await a.page.locator('[data-command="new"]').click();r=(await read(a)).r;assert.equal(r.level,0);assert.equal(r.wallet,0);assert.deepEqual(r.stock,{});
  console.log("两关完成、扩大区域实际装灯、累计收益核对、新局清零");
}

try {
  const a=await player();
  if(campaign){await business(a,campaign);assert.deepEqual(errors,[]);}
  else {
  if(selected.has("A")){
    await sofaIndoor(a);await signed(a,"sofa",1);
    await path(a,backIndoor);await bringSmall(a,"box","inside",677,598);await signed(a,"books",2);
    await path(a,backIndoor);await bringSmall(a,"plant","inside",625,520);await signed(a,"plant",3);
    console.log("PASS A 室内路线，沙发、书、盆栽依次签收 1/3、2/3、3/3");
  }
  if(selected.has("B")){
    await fresh(a,"dry");await bringSmall(a,"plant","yard",694,597);await signed(a,"plant",1);
    await path(a,backYard);await pick(a,"cart");await path(a,[[134,324],[134,385]]);
    await grab(a,null);const parked=(await current(a)).cart;
    await sofaHandle(a,0);await tap(a,"f");await sofaHandle(a,1);await grab(a,"sofa");
    await walk(a,134,262,{angle:Math.PI/2});await walk(a,134,338,{angle:Math.PI/2});
    await hold(a,["s"]);await sleep(900);await hold(a,[]);
    const jam=await current(a);assert.deepEqual(jam.cart,parked);
    assert.ok(jam.sofa.y<320 && jam.sofa.y>270,"推车挡住向南拖动的沙发");
    await grab(a,null);await pick(a,"cart");await path(a,[[134,535],[333,535]]);await grab(a,null);
    const stuck=(await current(a)).sofa;
    await walk(a,stuck.x+70*Math.cos(stuck.angle),stuck.y+70*Math.sin(stuck.angle));await grab(a,"sofa");
    await walk(a,134,494,{angle:Math.PI/2});
    await walk(a,253,440,{angle:0});await walk(a,435,433,{angle:0});await walk(a,585,410,{angle:0});
    await walk(a,560,470,{angle:Math.PI/2});await walk(a,560,620,{angle:Math.PI/2});
    await grab(a,null);await signed(a,"sofa",2);
    await path(a,backYard);await bringSmall(a,"box","yard",632,528);await signed(a,"books",3);
    console.log("PASS B 小院三件签收，推车实体堵门，单人清障后沙发通过");
  }
  if(selected.has("C") || selected.has("D")){
    await fresh(a,"wet");const initial=await current(a);
    await walk(a,initial.box.x,initial.box.y);await grab(a,null);
    await tap(a,"f");await tap(a,"f");
    assert.equal((await current(a)).books,"taped");assert.equal((await current(a)).tape,0);
    await bringSmall(a,"box","inside",680,582);await signed(a,"books",1);
    await fresh(a,"wet");const replay=await current(a);
    for(const key of ["sofa","box","cart","plant","tape","books"])assert.deepEqual(replay[key],initial[key]);
    await pick(a,"cart");await walk(a,282,298);await tap(a,"f");await tap(a,"f");
    assert.equal((await current(a)).books,"cart");assert.equal((await current(a)).tape,1);
    await path(a,[[366,298],[366,188],[558,188],[560,348],[677,389],[677,550]]);await grab(a,null);
    await signed(a,"books",1);assert.ok((await current(a)).box.x<400);
    console.log("PASS C 相同湿箱开局，贴胶带和转装各签收一份书，重复交互不复制或扣料");
    if(selected.has("D")){
      await path(a,backIndoor);await sofaIndoor(a);await signed(a,"sofa",2);
      await path(a,backIndoor);await bringSmall(a,"plant","inside",623,607);await signed(a,"plant",3);
      await pick(a,"cart");assert.equal((await current(a)).count,3);
      await walk(a,676,395);assert.equal((await current(a)).count,2);
      await walk(a,676,550);assert.equal((await current(a)).count,2);
      await grab(a,null);await signed(a,"books",3);
      await fresh(a,"wet");const f=await current(a);
      for(const key of ["cart","sofa","plant","box","books","board","tape","count","signed","spilled"])assert.deepEqual(f[key],initial[key]);
      assert.equal(f.people[0].held,null);
      console.log("PASS D 3/3 抓取、越界 2/3、回厢放稳 3/3，重开恢复");
    }
  }
  if(selected.has("E")){
  await a.page.locator("#multi").click();await a.page.locator("#create").click();
  await a.page.waitForSelector("#online",{timeout:30000});
  await a.page.locator('[data-command="start"]').click();
  const code=new URL(a.page.url()).searchParams.get("room");
  const b=await player();await b.page.locator("#multi").click();
  await b.page.locator("#code").fill(code);await b.page.locator("#join").click();
  await b.page.waitForSelector("#online",{timeout:30000});
  await until(async()=>(await read(a)).f.people.length===2,"双方入房");
  await moveTo([b],[[138,188]]);await Promise.all([tap(a,"Space"),tap(b,"Space")]);
  const race=(await read(a)).f.people;
  assert.deepEqual(race.map(p=>p.end).sort(),[-1,0]);
  // The host owns the world. Have the guest hold the contested grip before leaving.
  if(hand(a,await read(a))===0){await tap(a,"Space");await grab(b,"sofa");}
  const survivor=a;
  await b.context.close();
  await until(async()=>(await read(survivor)).f.people.length===1,"离开后释放");
  await tap(survivor,"Space");assert.equal(hand(survivor,await read(survivor)),0);
  console.log("PASS 房间号加入、同时抢点、离开后队友重新抓取");
  const other=await player();await other.page.goto(base+"/?room="+code);
  await other.page.waitForSelector("#online",{timeout:30000});
  await until(async()=>(await read(other)).f.people.length===2,"邀请链接加入");
  await survivor.page.locator("#reset").click();await sleep(180);
  const both=[survivor,other];
  const first=await read(both[0]);
  if(first.f.people.find(p=>p.id===first.id).slot!==0)both.reverse();
  await Promise.all(both.map(p=>tap(p,"Space")));
  assert.deepEqual((await read(both[0])).f.people.map(p=>p.end).sort(),[0,1]);
  await moveTo(both,[[481,188],[635,188]],{near:9});
  // Walk the front end around the turn while the rear end follows the arc.
  await moveTo(both,[[507,131],[612,244]],{near:10});
  await moveTo(both,[[560,111],[560,263]],{near:9});
  await moveTo(both,[[560,211],[560,363]],{near:9});
  await tap(both[0],"Space");
  await moveTo([both[1]],[[560,620]],{angle:Math.PI/2,near:6});
  await tap(both[1],"Space");
  await until(async()=>(await Promise.all(both.map(read))).every(({f})=>f.signed.sofa && f.count===1),"双人装车");
  for(const p of both)assert.equal(await p.page.locator("#row-sofa").innerText(),"✓ 已签收");
  const [left,right]=(await Promise.all(both.map(read))).map(v=>v.f.sofa);
  // Each client can be one snapshot apart while the released sofa settles.
  assert.ok(Math.hypot(left.x-right.x,left.y-right.y)<0.5 && Math.abs(left.angle-right.angle)<0.01);
  await both[1].page.locator("#reset").click();
  await until(async()=>(await Promise.all(both.map(read))).every(({f})=>f.count===0&&f.people.every(p=>p.end===-1)),"双方重开");
  console.log("PASS 邀请链接、合抬过弯、一人松手、另一人装车、双方朝向与货单一致、同步重开");
  const mobile=await player({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  assert.ok(await mobile.page.locator(".touch").isVisible());
  assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.page.locator('[data-act="use"]').tap();await sleep(80);assert.equal((await read(mobile)).f.board,0);
  await mobile.page.locator('[data-act="grab"]').tap();await sleep(80);assert.equal(hand(mobile,await read(mobile)),0);
  const touch=await mobile.context.newCDPSession(mobile.page);
  async function touchHold(key,ms) {
    const bounds=await mobile.page.locator('[data-key="'+key+'"]').boundingBox();
    assert.ok(bounds);
    await touch.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{
      x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,
    }]});
    await sleep(ms);
    await touch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await sleep(80);
  }
  const before=(await read(mobile)).f.sofa;
  await touchHold("ArrowLeft",280);
  assert.ok((await read(mobile)).f.sofa.x<before.x-5);
  await touchHold("KeyE",250);
  assert.ok((await read(mobile)).f.sofa.angle>before.angle+0.03);
  console.log("PASS 390px 窄屏布局与触屏垫滑板、抓取、移动和转向");
  }
  assert.deepEqual(errors,[]);
  }
} finally {await browser.close();}
