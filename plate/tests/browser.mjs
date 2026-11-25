import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {mkdtemp,writeFile,unlink,rmdir,copyFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {chromium} from "playwright-core";
import {bundlePage} from "../build.mjs";
import {catalog,recipeFixtures} from "../content.mjs";
import {Kitchen} from "../game.mjs";
import {goods,settle} from "../market.mjs";
import {signalingFixture} from "../../tests/signaling.mjs";

const flags=new Set(process.argv.slice(2)), live=flags.has("--public");
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","/usr/bin/chromium",
].find(existsSync),args:["--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
const temp=await mkdtemp(path.join(tmpdir(),"plate-browser-")),testFile=path.join(temp,"index.html");
const directory=fileURLToPath(new URL("../..",import.meta.url));
const isolated=await mkdtemp(path.join(tmpdir(),"plate-standalone-")),standalone=path.join(isolated,"kitchen.html");
const fixtureURL=pathToFileURL(testFile).href, signal=signalingFixture(),errors=[];
const tile=(p,id)=>p.locator('[data-fixture="'+id+'"]');
const cell=(p,x,y)=>p.locator('[data-x="'+x+'"][data-y="'+y+'"]');
const hand=p=>p.locator("#hand").innerText();
async function form(p,wait){
  await p.keyboard.down("e");await wait(600);await p.keyboard.up("e");
}
async function page(offline=false,touch=false){
  const context=await browser.newContext({offline,viewport:touch?{width:390,height:844}:{width:1260,height:850},hasTouch:touch,isMobile:touch});
  if(!offline && !live)await signal(context);
  const p=await context.newPage();p.setDefaultTimeout(7000);
  p.on("pageerror",e=>errors.push(e.message));
  if(offline)p.on("request",req=>{if(/^https?:/.test(req.url()))errors.push("离线流程联网 "+req.url());});
  return p;
}
async function choose(p,id,recipe){
  if(recipe)await p.locator("#recipeChoice").selectOption(recipe);
  await p.locator('[data-map="'+id+'"]').click();await p.locator("#chooseMap").click();
  assert.equal(await p.locator("#shopName").innerText(),catalog.maps[id].name);
}
async function prepareDish(p,go,wait,shape,dish,storedRice=false){
  const processBoard=async(stock,raw,processed)=>{
    await go(stock,raw);await go("board","空手");await shape();await go("board",processed);
  };
  if(dish==="海苔饭团" || dish==="黄瓜细卷"){
    if(storedRice)await go("pass","熟饭");
    else {await go("rice","生米");await go("pot","空手");await wait(5100);await go("pot","熟饭");}
    if(dish==="黄瓜细卷"){
      await go("pass","空手");await processBoard("cucumber","黄瓜","黄瓜条");await go("board","空手");await go("pass","熟饭");
    }
    await go("board","空手");await go("nori","海苔");await go("board","空手");await shape();await go("board",dish);
  }else if(dish==="厚蛋烧"){
    if(!(await tile(p,"counter").getAttribute("aria-label")).includes("份")){
      await processBoard("egg","鸡蛋","蛋液");await go("pan","空手");await wait(4100);await go("pan","整条厚蛋烧");await go("counter","空手");
    }
    await go("rack","干净盘");await go("counter",dish+"（已装盘）");return;
  }else{
    assert.ok(["五分熟牛排","全熟牛排"].includes(dish),dish);
    await go("beef","生牛排");await go("pan","空手");await wait(dish==="五分熟牛排"?4100:8100);await go("pan",dish);
  }
  await go("rack",dish+"（已装盘）");
}
async function offlineDay(mapId,recipeId,moveSink=false){
  const p=await page(true);
  if(mapId==="corner_diner" && recipeId==="onigiri")
    await p.addInitScript(()=>{Math.random=()=>0;});
  await p.clock.install();
  const url=pathToFileURL(standalone);
  p.on("request",r=>{
    const target=new URL(r.url());
    if(target.protocol==="file:" && target.pathname!==url.pathname)errors.push("读取了其他文件 "+target.pathname);
  });
  await p.goto(url.href);await p.reload();
  assert.equal(await p.locator("#stage, [data-switch-game]").count(),0);
  assert.equal(await p.locator("#previewName").innerText(),"街角小食堂");
  const maps=catalog.levels.first.maps;
  for(const id of [...maps,...[...maps].reverse()]){
    const m=catalog.maps[id],card=p.locator('[data-map="'+id+'"]');await card.click();
    assert.equal(await card.getAttribute("aria-pressed"),"true");
    assert.equal(await p.locator("#previewName").innerText(),m.name);
    assert.equal(await p.locator("#previewSize").innerText(),m.width+" × "+m.height);
    assert.equal(await p.locator("#chooseMap").innerText(),"选择"+m.name+"并进入准备");
    assert.deepEqual(await p.locator("#mapPreview").evaluate(c=>[c.width,c.height]),[m.width*64,(m.height+1)*64]);
  }
  const recipe=catalog.recipes[recipeId];
  assert.deepEqual(await p.locator("#recipeChoice option").evaluateAll(options=>options.map(o=>o.value)),catalog.levels.first.menu);
  await choose(p,mapId,recipeId);
  assert.equal(await p.locator("#todayMenu").innerText(),"今日供应 · "+recipe.name);
  assert.equal(await p.locator("#recipes details").count(),1);assert.match(await p.locator("#recipes summary").innerText(),new RegExp(recipe.name));
  const fixtures=recipeFixtures(catalog,catalog.maps[mapId],recipeId);
  assert.equal(await p.locator('#cells [data-fixture]:not([data-fixture=""])').count(),fixtures.length);
  for(const f of fixtures)assert.deepEqual(await tile(p,f.id).evaluate(b=>[+b.dataset.x,+b.dataset.y]),[f.x,f.y]);
  assert.deepEqual(await p.locator("#scene").evaluate(c=>[c.width,c.height]),await p.locator("#mapPreview").evaluate(c=>[c.width,c.height]));
  const bin=catalog.maps[mapId].fixtures.find(f=>f.id==="bin");
  await tile(p,"bin").click();await cell(p,0,0).click();assert.equal(await tile(p,"bin").getAttribute("data-x"),"0");
  if(!moveSink){await tile(p,"bin").click();await cell(p,bin.x,bin.y).click();assert.equal(await tile(p,"bin").getAttribute("data-x"),String(bin.x));}
  if(moveSink){
    await tile(p,"sink").click();await cell(p,4,5).click();await p.locator("#browseMaps").click();
    await p.locator('[data-map="island_diner"]').click();await p.locator("#chooseMap").click();
    await p.locator("#replaceLayout[open]").waitFor();await p.locator("#keepLayout").click();
    await p.locator("#cancelMap").click();assert.equal(await tile(p,"sink").getAttribute("data-x"),"4");
    await p.locator("#browseMaps").click();await choose(p,mapId);assert.equal(await tile(p,"sink").getAttribute("data-y"),"5");
  }
  assert.equal(await p.title(),"山间食堂 · 厨房营业");
  if(process.env.PLATE_SCREENSHOT)await p.screenshot({path:process.env.PLATE_SCREENSHOT});
  const wait=ms=>p.clock.fastForward(ms);
  async function go(id,expect){
    await tile(p,id).click();
    if(expect===undefined)await wait(3000);
    else for(let i=0;i<16 && await hand(p)!==expect;i++)await wait(250);
    if(expect!==undefined)assert.equal(await hand(p),expect,"走到 "+id+" 后手持；"+await p.locator("#hint").textContent()+"；"+await p.locator("#time").textContent()+"；"+await p.locator("#reason").textContent());
  }
  await tile(p,"a").click();const seatButton=p.locator('[data-seat-dir="1"]');
  await seatButton.click();assert.equal(await seatButton.getAttribute("aria-pressed"),"true");
  assert.equal(await p.locator("#roundPlan").innerText(),"第 1 关 · 4 组 / 6 人");
  await p.locator("#openShop").click();
  let storedRice=recipeId==="onigiri";
  if(storedRice){
    await go("nori","海苔");await go("bin","空手");await p.keyboard.press("Space");
    assert.equal(await hand(p),"空手");assert.match(await p.locator("#hint").innerText(),/无法取回/);
    await go("rice","生米");await go("pot","空手");await wait(5100);await go("pot","熟饭");await go("pass","空手");
    await go("rice","生米");await go("pot","空手");await wait(13100);
    assert.match(await tile(p,"pot").getAttribute("aria-label"),/已焦糊/);
    await go("pot","焦饭");await go("board");assert.equal(await hand(p),"焦饭");await go("bin","空手");
  }else if(recipeId==="omelet"){
    await go("egg","鸡蛋");await go("board","空手");await form(p,wait);await go("board","蛋液");
    await go("pan","空手");await wait(12100);assert.match(await tile(p,"pan").getAttribute("aria-label"),/已焦糊/);
    await go("pan","焦蛋烧");await go("rack");assert.equal(await hand(p),"焦蛋烧");await go("bin","空手");
  }else if(recipeId==="steak"){
    await go("beef","生牛排");await go("pan","空手");await wait(14100);
    assert.match(await tile(p,"pan").getAttribute("aria-label"),/已焦糊/);await go("pan","焦牛排");await go("bin","空手");
    await go("beef","生牛排");await go("pan","空手");await wait(8100);await go("pan","全熟牛排");
    await go("bin","空手");await p.keyboard.press("Space");assert.equal(await hand(p),"空手");
    assert.match(await p.locator("#hint").innerText(),/无法取回/);
  }else await wait(14000);
  assert.ok(await p.locator("#time").evaluate(b=>b.value>0 && b.value<b.max));
  assert.ok(await p.locator(".table progress").count());
  async function serveRound(groups,total){
    let partial=false,reused=false;
    const sold=[];
    for(let i=0;i<60 && !await p.locator("#result").isVisible();i++){
      const rows=await p.locator(".table").allInnerTexts();
      let index=rows.findIndex(t=>t.includes("等接单"));
      if(index>=0){await go(index?"b":"a");continue;}
      const dirty=rows.findIndex(t=>t.includes("待清桌"));
      const plates=await p.locator("#plateCount").innerText();
      const queued=!(await p.locator("#queue").innerText()).includes("暂无");
      if(dirty>=0 && (queued || (plates.includes("干净盘 0") && rows.some(t=>t.includes("等上菜"))))){
        await go(dirty?"b":"a","脏盘");await go("sink","空手");
        const clean=()=>p.locator("#plateCount").evaluate(n=>Number(n.textContent.match(/干净盘 (\d+)/)[1]));
        const before=await clean();
        if(!reused){await wait(3200);assert.match(await tile(p,"sink").getAttribute("aria-label"),/脏盘 1 .*净盘 0/);}
        await p.keyboard.press("e");await wait(3100);
        assert.match(await tile(p,"sink").getAttribute("aria-label"),/脏盘 0 .*净盘 1/);
        assert.equal(await clean(),before);await p.keyboard.press("Space");assert.equal(await hand(p),"干净盘");
        await go("rack","空手");assert.equal(await clean(),before+1);reused=true;continue;
      }
      const bars=await p.locator(".table").evaluateAll(nodes=>nodes.map(n=>n.querySelector("progress")?.value));
      const food=rows.map((t,k)=>({k,t,patience:bars[k]})).filter(v=>v.t.includes("等上菜")).sort((a,b)=>a.patience-b.patience);
      if(food.length && !plates.includes("干净盘 0")){
        const target=food[0],dish=target.t.match(/欠 (.+?) ×/)[1];
        await prepareDish(p,go,wait,()=>form(p,wait),dish,storedRice && dish==="海苔饭团");
        if(dish==="海苔饭团")storedRice=false;
        await go(target.k?"b":"a","空手");sold.push(dish);
        if(target.t.includes("、") || target.t.includes("×2")){assert.match(await p.locator(".table").nth(target.k).innerText(),/等上菜 · 欠 .+ ×1/);partial=true;}
        continue;
      }
      await wait(1800);
    }
    assert.equal(await p.locator("#outcome").textContent(),"成功打烊","失败原因 "+await p.locator("#reason").textContent());
    assert.deepEqual(await p.locator("#totals dd").allTextContents(),[groups+" 桌",total+" 份","¥"+total*recipe.price]);
    assert.ok(partial && reused);
    const expected=recipe.variants?Array.from({length:total},(_,i)=>Object.values(recipe.variants)[i%2].name):Array(total).fill(recipe.name);
    assert.deepEqual(sold.sort(),expected.sort());
  }
  await serveRound(4,6);
  if(mapId==="corner_diner" && recipeId==="onigiri"){
    const offer=p.locator('#shelf [data-sku="counter"]');
    await p.reload();await p.locator("#result[open]").waitFor();
    assert.match(await p.locator("#receipt").innerText(),/本关入账 ¥72.*可用 ¥72/);
    await offer.getByRole("button",{name:"锁货",exact:true}).click();
    await offer.getByRole("button",{name:"选位置"}).click();await tile(p,"rack").click();
    assert.equal(await p.locator("#commitPlace").isDisabled(),true);await p.locator("#cancelPlace").click();
    assert.equal(await offer.getAttribute("data-locked"),"true");assert.equal(await offer.getAttribute("data-sold"),"false");
    await offer.getByRole("button",{name:"选位置"}).click();await cell(p,4,6).click();
    await p.locator("#turnPreview").click();await p.locator("#commitPlace").click();
    await p.reload();await p.locator("#result[open]").waitFor();
    assert.equal(await offer.getAttribute("data-sold"),"true");assert.match(await p.locator("#receipt").innerText(),/可用 ¥57$/);
    await p.locator("#refreshShelf").click();const shelf=await p.locator("#shelf").innerText();
    await p.reload();await p.locator("#result[open]").waitFor();
    assert.equal(await p.locator("#shelf").innerText(),shelf);assert.match(await p.locator("#receipt").innerText(),/可用 ¥47$/);
    assert.equal(await p.locator("#refreshShelf").innerText(),"刷新 ¥20");
  }
  await p.locator("#again").click();assert.match(await p.locator("#plateCount").innerText(),/3 \/ 3.*¥0/);
  assert.equal(await p.locator("#roundPlan").innerText(),"第 2 关 · 5 组 / 7 人");
  await tile(p,"a").click();assert.equal(await seatButton.getAttribute("aria-pressed"),"true");
  await p.locator("#openShop").click();
  if(mapId==="corner_diner" && recipeId==="onigiri"){
    await go("nori","海苔");await go("buy-1","空手");await go("buy-1","海苔");await go("nori","空手");
  }
  await wait(14000);await serveRound(5,7);await p.locator("#again").click();
  assert.equal(await p.locator("#roundPlan").innerText(),"第 3 关 · 6 组 / 9 人");
  await p.locator("#openShop").click();await wait(200000);
  assert.equal(await p.locator("#again").innerText(),"重试本关");await p.locator("#again").click();
  assert.equal(await p.locator("#roundPlan").innerText(),"第 3 关 · 6 组 / 9 人");
  if(moveSink){
    assert.equal(await tile(p,"sink").getAttribute("data-x"),"4");
    await p.locator("#browseMaps").click();
    await p.locator('[data-map="island_diner"]').click();await p.locator("#chooseMap").click();await p.locator("#replaceMap").click();
    assert.equal(await p.locator("#shopName").innerText(),"中岛小馆");assert.equal(await tile(p,"sink").getAttribute("data-x"),"6");
  }
  await p.locator("#openShop").click();await wait(200000);
  assert.match(await p.locator("#reason").innerText(),/第 1 组.*等接单/);
  await p.locator("#resultMaps").click();await p.locator("#mapPicker").waitFor();await choose(p,mapId);
  console.log("PASS "+catalog.maps[mapId].name+" · "+recipe.name+"，连续经营 4 桌 6 人、5 桌 7 人；第 3 关失败重试，禁坐与摆位保留。");
  await p.context().close();
}
async function extension(){
  const p=await page(true);await p.clock.install();await p.goto(fixtureURL+"?level=extension");
  async function go(id){await tile(p,id).click();await p.clock.fastForward(1600);}
  await p.locator("#openShop").click();await p.clock.fastForward(3500);await go("a");
  assert.match(await p.locator("#tables").innerText(),/双米饭团/);
  for(let i=0;i<2;i++){await go("rice");await go("pot");await p.clock.fastForward(1100);await go("pot");assert.equal(await hand(p),"熟饭");await go("board");}
  await form(p,ms=>p.clock.fastForward(ms));
  await go("board");await go("rack");await cell(p,9,1).click();await p.clock.fastForward(1800);
  assert.equal(await hand(p),"双米饭团（已装盘）");await go("a");await p.clock.fastForward(5000);
  assert.equal(await p.locator("#outcome").innerText(),"成功打烊");assert.match(await p.locator("#totals").innerText(),/¥19/);
  console.log("PASS 测试配置快锅、双米饭团、移入口和餐桌地图变体在浏览器内出餐");
  await p.context().close();
}
async function steakService(){
  const p=await page(true);await p.clock.install();await p.goto(fixtureURL+"?level=steakService");
  const wait=ms=>p.clock.fastForward(ms);
  async function go(id,expected){
    await tile(p,id).click();await wait(3300);assert.equal(await hand(p),expected,id);
  }
  await p.locator("#openShop").click();await wait(7000);await go("a","空手");await go("b","空手");
  const tickets=await p.locator(".table").allInnerTexts();assert.match(tickets[0],/五分熟/);assert.match(tickets[1],/全熟/);
  await go("beef","生牛排");await go("pan","空手");await wait(6200);await go("pan","全熟牛排");
  await go("rack","全熟牛排（已装盘）");await go("bin","全熟牛排（已装盘）");
  assert.match(await p.locator("#hint").innerText(),/撤盘/);await go("a","全熟牛排（已装盘）");
  assert.match(await p.locator("#hint").innerText(),/熟度不符.*五分熟/);assert.match(await p.locator("#plateCount").innerText(),/¥0/);
  await go("b","空手");assert.match(await p.locator("#plateCount").innerText(),/¥18/);
  await go("beef","生牛排");await go("pan","空手");await wait(1700);await go("pan","五分熟牛排");
  await go("rack","五分熟牛排（已装盘）");await go("counter","空手");await p.keyboard.press("Space");
  await p.keyboard.press("e");assert.equal(await hand(p),"干净盘");assert.match(await tile(p,"counter").getAttribute("aria-label"),/五分熟牛排/);
  await p.keyboard.press("Space");await go("a","空手");await wait(12500);
  assert.equal(await p.locator("#outcome").textContent(),"成功打烊");assert.match(await p.locator("#totals").innerText(),/¥36/);
  console.log("PASS 双桌熟度订单，错熟保留原盘后交给另一桌、撤盘再装盘，¥36");
  await p.context().close();
}
async function heldInteractions(){
  const p=await page(true);await p.clock.install();
  await p.goto(pathToFileURL(standalone).href);
  await choose(p,"corner_diner");
  const wait=ms=>p.clock.fastForward(ms);
  async function go(id,item){
    await tile(p,id).click();await wait(3000);assert.equal(await hand(p),item,"操作 "+id);
  }
  const use=()=>p.keyboard.press("Space");
  await p.locator("#practice").click();await go("rack","干净盘");
  await cell(p,5,6).click();await wait(3000);
  await p.keyboard.down("d");await p.keyboard.press("Shift");await p.keyboard.up("d");
  assert.equal(await cell(p,6,6).getAttribute("aria-current"),"location");
  assert.equal(await hand(p),"干净盘");await p.locator("#practice").click();
  await p.locator("#openShop").click();await go("rice","生米");
  await cell(p,1,2).click();await wait(750);
  await p.keyboard.down("d");await wait(160);await p.keyboard.up("d");await use();
  assert.equal(await hand(p),"空手","沿柜台横移后投米");await wait(5100);await use();
  assert.equal(await hand(p),"熟饭");
  await go("pass","空手");await go("rack","干净盘");await go("pass","熟饭");
  // Start out of reach so the second keypress really occurs during travel.
  await cell(p,6,5).click();await wait(2800);
  await tile(p,"board").click();await use();await wait(1800);assert.equal(await hand(p),"空手");
  await go("nori","海苔");await go("board","空手");await form(p,wait);await use();assert.equal(await hand(p),"海苔饭团");
  await go("a","海苔饭团");await use();assert.match(await p.locator("#hint").innerText(),/还没装盘/);
  await go("pass","海苔饭团（已装盘）");await go("a","空手");
  assert.match(await p.locator("#plateCount").innerText(),/2 \/ 3.*¥12/);
  await go("rice","生米");await cell(p,2,0).click();await wait(1900);
  await p.keyboard.down("s");await wait(250);await p.keyboard.up("s");await use();await wait(1700);
  assert.equal(await hand(p),"空手","从锅后面就地投料");
  await wait(5200);await use();assert.equal(await hand(p),"熟饭");
  console.log("PASS 持物横移按空格、锅背面就地投料、传菜台交换、途中确认不取消、装盘和上菜");
  await p.context().close();
}
async function keyboardService(){
  const p=await page(true),g=new Kitchen();
  g.command("host",{type:"choose",map:"corner_diner",recipe:"steak",run:g.s.run});
  for(const [id,x,y] of [["beef",2,4],["pan",3,4],["rack",4,4],["a",4,6],["sink",3,6]])
    Object.assign(g.fixture(id),{x,y});
  g.fixture("a").dir=0;g.fixture("a").banned=14;g.fixture("b").banned=15;
  Object.assign(g.s.players.host,{x:2,y:5});g.s.arrivals=[[0,1]];g.refreshSeats();
  const url=pathToFileURL(standalone).href;
  await p.clock.install({time:new Date("2026-01-01T00:00:00Z")});await p.goto(url);
  await p.evaluate(s=>localStorage.setItem("mountain-kitchen.store.first",JSON.stringify({state:s})),g.s);
  await p.reload();await p.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await p.locator("#openShop").click();await p.clock.fastForward(7000);
  async function move(key,ms){await p.keyboard.down(key);await p.clock.runFor(ms);await p.keyboard.up(key);}
  async function grab(item){await p.keyboard.press("Space");assert.equal(await hand(p),item,await p.locator("#hint").innerText());}
  await move("w",20);await grab("生牛排");await move("d",160);await move("w",20);await grab("空手");
  await p.clock.fastForward(4200);await grab("五分熟牛排");await move("d",160);await move("w",20);await grab("五分熟牛排（已装盘）");
  await move("s",70);await p.keyboard.press("e");await grab("空手");
  await p.clock.fastForward(12500);await grab("脏盘");await move("a",160);await move("s",20);
  await grab("空手");await p.keyboard.press("e");await p.clock.fastForward(3300);await grab("干净盘");
  console.log("PASS 离线单文件只用 WASD、空格和 E 完成取料、烹饪、装盘、接单、上菜、收盘和手洗。");
  await p.context().close();
}
async function shopTouch(){
  const p=await page(true,true),g=new Kitchen();
  g.command("host",{type:"choose",map:"corner_diner",recipe:"steak",run:g.s.run});g.s.phase="won";g.s.stats.revenue=400;settle(g.s);
  g.s.store.shelf=["timer","soak","box","plates4","metal"].map(sku=>({sku,price:goods[sku].price,locked:false,sold:false}));
  await p.addInitScript(state=>{
    if(location.protocol==="file:")localStorage.setItem("mountain-kitchen.store.first",JSON.stringify({version:1,state}));
  },g.s);
  await p.clock.install();await p.goto(pathToFileURL(standalone).href);
  assert.match(await p.locator('#shelf [data-sku="soak"] strong').innerText(),/¥50$/);
  for(const [sku,x,y] of [["timer",0,0],["soak",0,2],["box",9,1]]){
    await p.locator('#shelf [data-sku="'+sku+'"]').getByText("选位置").tap();
    await cell(p,x,y).tap();assert.equal(await p.locator("#placementGhost canvas").isVisible(),true);
    await p.locator("#commitPlace").tap();
  }
  assert.match(await p.locator("#receipt").innerText(),/可用 ¥280$/);
  await p.locator("#again").tap();await p.locator("#practice").tap();
  const wait=ms=>p.clock.fastForward(ms);
  async function go(id,item){
    await tile(p,id).tap();
    if(item===undefined){await wait(4000);return;}
    for(let i=0;i<24;i++){
      await wait(200);
      if(await hand(p)===item)return;
    }
    assert.equal(await hand(p),item,id+" · "+await p.locator("#hint").innerText());
  }
  await wait(9000);await go("a");assert.match(await p.locator("#tables").innerText(),/等上菜/);
  for(const [i,name] of ["五分熟牛排","全熟牛排"].entries()){
    await go("beef","生牛排");await go("counter","空手");
    await p.locator("#slots button").nth(3).tap();await go("counter","空手");
    // Slot zero stores the first steak; the second retains the previous slot choice.
    const stored=p.locator("#slots button").filter({hasText:"生牛排"});
    await stored.tap();await go("counter","生牛排");await go("buy-1","空手");
    await p.locator("#slots button").nth(i).tap();await p.locator("#work").tap();await wait(15500);
    await go("buy-1",name);await go("rack",name+"（已装盘）");await go("a","空手");
  }
  await wait(11000);
  for(let i=0;i<2;i++){await go("a","脏盘");await go("buy-2","空手");}
  await wait(6100);assert.match(await tile(p,"buy-2").getAttribute("aria-label"),/脏盘 2.*可启动/);
  await p.locator("#work").tap();await wait(3100);assert.match(await tile(p,"buy-2").getAttribute("aria-label"),/浸洗中/);
  await wait(3100);await go("buy-2","干净盘");assert.match(await tile(p,"buy-2").getAttribute("aria-label"),/净盘 1/);
  await p.context().close();console.log("PASS 390px 离线触屏买设备、地图预览、备料盒选格，两种定时熟度上菜、浸洗一批逐盘取回。");
}
async function practiceBasin(){
  const p=await page(true,true);await p.clock.install();
  await p.goto(pathToFileURL(standalone).href);
  await choose(p,"corner_diner");
  const wait=ms=>p.clock.fastForward(ms);
  const go=async(id,expected)=>{
    await tile(p,id).tap();
    if(expected===undefined){await wait(4200);return;}
    for(let i=0;i<20 && await hand(p)!==expected;i++)await wait(250);
    assert.equal(await hand(p),expected,"触屏操作 "+id+" · "+await p.locator("#hint").innerText());
  };
  const water=()=>tile(p,"sink").getAttribute("aria-label");
  const touch=await p.context().newCDPSession(p);
  async function shape(){
    const board=tile(p,"board");await board.scrollIntoViewIfNeeded();const box=await board.boundingBox();
    assert.equal(await board.getAttribute("data-form"),"yes","捏制前配料状态 · "+await hand(p)+" · "+await p.locator("#hint").innerText());
    await touch.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
    await wait(650);assert.equal(await board.getAttribute("data-form"),"no","触屏按住后 · "+await p.locator("#hint").innerText());
    await touch.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  }
  await tile(p,"sink").tap();await cell(p,5,4).tap();await p.locator("#practice").tap();
  assert.equal(await p.locator("#phase").innerText(),"练习中");assert.equal(await p.locator("#time").isVisible(),false);
  for(const table of ["a","b"]){
    const ticket=p.locator(".table").nth(table==="a"?0:1);
    for(let n=0;n<24 && !(await ticket.innerText()).includes("等接单");n++)await wait(1000);
    assert.match(await ticket.innerText(),/等接单/);await go(table);
    for(let i=0;i<2;i++){
      const order=await ticket.innerText();assert.match(order,/欠 .+? ×/,table+" 桌 "+order);
      await prepareDish(p,go,wait,shape,order.match(/欠 (.+?) ×/)[1]);await go(table,"空手");
    }
    await wait(9000);
  }
  for(const table of ["a","a","b","b"]){await go(table);assert.equal(await hand(p),"脏盘");await go("sink");}
  assert.match(await water(),/脏盘 4 \/ 4 · 净盘 0/);
  await wait(3200);assert.match(await water(),/净盘 0/);
  await tile(p,"sink").tap();await wait(12100);assert.match(await water(),/脏盘 0 \/ 4 · 净盘 4/);
  await p.locator("#grab").tap();await p.locator("#grab").tap();assert.equal(await hand(p),"干净盘");
  assert.match(await water(),/净盘 3/);
  await p.locator("#practice").tap();assert.equal(await p.locator("#phase").innerText(),"营业准备");
  assert.match(await p.locator("#plateCount").innerText(),/3 \/ 3.*¥0/);
  assert.equal(await tile(p,"sink").getAttribute("data-x"),"5");
  console.log("PASS 390px 触屏练习：两桌四份、长按料理台、点一次水池刷完四盘、连点只取一只、退出恢复布局和正式库存");
  await p.context().close();
}
async function joinPair(url,prepareHost){
  const host=await page(),guest=await page();
  await Promise.all([host,guest].map(p=>p.goto(url)));
  if(prepareHost)await prepareHost(host);
  await host.locator("#roomButton").click();await host.locator("#createRoom").click();
  const code=host.locator("#roomCode");
  try{await code.waitFor({timeout:22000});}catch{throw Error("房主建房："+await host.locator("#network").innerText());}
  await guest.locator("#roomButton").click();await guest.locator("#code").fill(await code.innerText());await guest.locator("#joinRoom").click();
  try{await guest.waitForFunction(()=>document.querySelector("#connection").textContent.includes("2 / 2"),null,{timeout:22000});}
  catch{throw Error("搭档入房："+await guest.locator("#network").innerText()+" 房主："+await host.locator("#connection").textContent()+" "+errors.join(", "));}
  await host.getByRole("button",{name:"关闭",exact:true}).click();
  return {host,guest};
}
async function publicRelease(){
  const url=pathToFileURL(standalone).href;
  const {host,guest}=await joinPair(url);
  await choose(host,"corner_diner");
  await host.locator("#openShop").click();await guest.waitForFunction(()=>document.querySelector("#phase").textContent==="营业中");
  await tile(guest,"rice").click();await guest.waitForFunction(()=>document.querySelector("#hand").textContent==="生米");
  await tile(guest,"pass").click();await guest.waitForFunction(()=>document.querySelector("#hand").textContent==="空手");
  await tile(host,"pass").click();await host.waitForFunction(()=>document.querySelector("#hand").textContent==="生米");
  console.log("PASS 两份成品 HTML 经公共 PeerServer 实际建房、加入、开门和跨窗口传递生米");
  await Promise.all([host,guest].map(p=>p.context().close()));
}
async function doorwayRoom(){
  const url=pathToFileURL(standalone).href;
  const {host,guest}=await joinPair(url,async p=>{
    const g=new Kitchen();g.command("host",{type:"choose",map:"corner_diner",run:g.s.run});
    Object.assign(g.s.players.host,{x:8,y:3,hand:"plated:onigiri"});
    Object.assign(g.fixture("counter"),{x:9,y:5});g.s.stations.counter.item="plated:onigiri";
    g.s.stations.rack.plates=1;g.s.arrivals=[[50,1]];g.refreshSeats();
    await p.evaluate(s=>localStorage.setItem("mountain-kitchen.store.first",JSON.stringify({state:s})),g.s);
    await p.reload();
  });
  const reach=async(p,x,y)=>{
    await cell(p,x,y).click();
    await p.waitForFunction(([x,y])=>{const tile=document.querySelector('[aria-current="location"]');return +tile.dataset.x===x && +tile.dataset.y===y;},[x,y]);
    await p.waitForTimeout(190);
  };
  await host.locator("#openShop").click();await guest.waitForFunction(()=>document.querySelector("#phase").textContent==="营业中");
  await tile(guest,"counter").click();await guest.waitForFunction(()=>document.querySelector("#hand").textContent.includes("已装盘"));
  await reach(guest,8,4);
  await Promise.all([host.keyboard.down("s"),guest.keyboard.down("w")]);await host.waitForTimeout(600);
  await Promise.all([host.keyboard.up("s"),guest.keyboard.up("w")]);
  const read=()=>JSON.parse(localStorage.getItem("mountain-kitchen.store.first")).state;
  const s=await host.evaluate(read),h=s.players.host,k=s.players.guest;
  assert.ok(Math.hypot(h.x-k.x,h.y-k.y)>=.4199);
  assert.ok(s.doors["8,3,down"].jammed);assert.equal(h.hand,k.hand);
  for(const [p,other] of [[guest,h],[host,k]]){
    await p.waitForFunction(([x,y])=>document.querySelector("#connection").title.startsWith("队友在 "+x+" 列 "+y+" 行"),[Math.round(other.x)+1,Math.round(other.y)+1]);
    assert.equal(await hand(p),"海苔饭团（已装盘）");
  }
  await reach(guest,9,4);await reach(host,8,5);await reach(guest,8,3);
  await reach(guest,7,1);await host.waitForFunction(()=>!JSON.parse(localStorage.getItem("mountain-kitchen.store.first")).state.doors["8,3,down"].jammed);
  assert.equal(await hand(host),await hand(guest));
  await Promise.all([host,guest].map(p=>p.context().close()));
  console.log("PASS 双窗口端盘迎面推门、碰撞阻挡、卡门恢复、让道换侧，双方持物与房主坐标一致。");
}
async function marketRoom(){
  const url=pathToFileURL(standalone).href;
  const {host,guest}=await joinPair(url,async p=>{
    const game=new Kitchen();game.command("host",{run:game.s.run,type:"choose",map:"corner_diner",recipe:"steak"});
    const s=game.s;s.phase="won";s.stats.revenue=300;s.arrivals=[[0,1],[1,1]];settle(s);
    s.store.shelf=["tray","plates4","plates8","timer","soak"].map(sku=>({sku,price:goods[sku].price,sold:false,locked:false}));
    await p.evaluate(state=>localStorage.setItem("mountain-kitchen.store.first",JSON.stringify({version:1,state})),s);
    await p.reload();await p.locator("#hideMarket").click();
  });
  const code=await host.locator("#roomCode").textContent();
  async function reconnect(){
    await guest.reload();await host.waitForFunction(()=>document.querySelector("#connection").textContent.includes("1 / 2"));
    await guest.locator("#roomButton").click();await guest.locator("#code").fill(code);await guest.locator("#joinRoom").click();
    await guest.waitForFunction(()=>document.querySelector("#connection").textContent.includes("2 / 2"),null,{timeout:20000});
  }
  const card=(p,sku)=>p.locator('#shelf [data-sku="'+sku+'"]');
  await host.locator("#showMarket").click();await card(host,"timer").getByText("锁货",{exact:true}).click();
  assert.equal(await card(guest,"plates4").getByText("购买").isDisabled(),true);
  await card(host,"plates4").getByText("购买").dblclick({force:true});await card(host,"plates8").getByText("购买").click();
  await card(host,"tray").getByText("选位置").click();await tile(host,"counter").click();await host.locator("#commitPlace").click();
  await host.locator("#refreshShelf").click();await reconnect();
  assert.equal(await guest.locator("#receipt").innerText(),await host.locator("#receipt").innerText());
  assert.match(await guest.locator("#receipt").innerText(),/可用 ¥205/);assert.equal(await card(guest,"timer").getAttribute("data-locked"),"true");
  assert.equal(await guest.locator("#refreshShelf").innerText(),"刷新 ¥20");await host.locator("#again").click();
  await host.locator("#openShop").click();await guest.waitForFunction(()=>document.querySelector("#phase").textContent==="营业中");
  async function go(p,id,item){
    await tile(p,id).click();await p.waitForFunction(v=>document.querySelector("#hand").textContent===v,item);
  }
  for(const id of ["a","b"]){
    await guest.waitForFunction(id=>document.querySelectorAll(".table")[id==="a"?0:1].textContent.includes("等接单"),id);
    await tile(guest,id).click();await guest.waitForFunction(id=>document.querySelectorAll(".table")[id==="a"?0:1].textContent.includes("等上菜"),id);
  }
  for(const [i,dish] of ["五分熟牛排","全熟牛排"].entries()){
    await go(host,"beef","生牛排");await go(host,"pan","空手");
    await host.waitForFunction(d=>document.querySelector('[data-fixture="pan"]').title.includes(d+"可取"),dish,{timeout:11000});
    await go(host,"pan",dish);await go(host,"rack",dish+"（已装盘）");await go(host,"counter","空手");
    if(!i)await host.locator("#slots button").nth(1).click();
  }
  await go(guest,"counter","双盘托盘");await reconnect();assert.equal(await hand(guest),"双盘托盘");
  await guest.locator("#slots button").nth(1).click();await tile(guest,"a").click();
  await guest.waitForFunction(()=>document.querySelector("#hint").textContent.includes("熟度不符"));
  await guest.locator("#slots button").nth(0).click();await tile(guest,"a").click();
  await guest.waitForFunction(()=>document.querySelectorAll(".table")[0].textContent.includes("用餐中"));
  await guest.locator("#slots button").nth(1).click();await tile(guest,"b").click();
  await guest.waitForFunction(()=>document.querySelectorAll(".table")[1].textContent.includes("待清桌"),null,{timeout:14000});
  await tile(guest,"b").click();
  await guest.waitForFunction(()=>document.querySelectorAll("#slots button")[1].textContent.includes("脏盘"));
  await guest.locator("#slots button").nth(0).click();await tile(guest,"a").click();
  await guest.waitForFunction(()=>Array.from(document.querySelectorAll("#slots button")).every(b=>b.textContent.includes("脏盘")));
  await guest.reload();await host.locator("#reclaim").click();await reconnectAfterClaim();
  async function reconnectAfterClaim(){
    await guest.locator("#roomButton").click();await guest.locator("#code").fill(code);await guest.locator("#joinRoom").click();
    await guest.waitForFunction(()=>document.querySelector("#connection").textContent.includes("2 / 2"),null,{timeout:20000});
  }
  assert.equal(await hand(guest),"空手");await go(host,"rack","双盘托盘");
  assert.ok((await host.locator("#slots button").allTextContents()).every(v=>v.includes("脏盘")));
  assert.match(await host.locator("#plateCount").innerText(),/\/ 15/);
  console.log("PASS 双人购买去重、15 盘、锁货付费刷新、购物重连，托盘营业重连后按熟度分送、收双脏盘，房主收回原物。");
  await Promise.all([host,guest].map(p=>p.context().close()));
  const last=await joinPair(url,async p=>{
    const g=new Kitchen();g.command("host",{run:g.s.run,type:"choose",map:"corner_diner",recipe:"steak"});
    g.s.stations.rack.plates=1;g.s.stations.sink.dirty=2;
    await p.evaluate(state=>localStorage.setItem("mountain-kitchen.store.first",JSON.stringify({version:1,state})),g.s);
    await p.reload();
  });
  await last.host.locator("#openShop").click();
  for(const p of [last.host,last.guest]){
    await p.waitForFunction(()=>document.querySelector("#phase").textContent==="营业中");
    const y=p===last.host?1:3;await cell(p,6,y).click();await p.waitForFunction(y=>document.querySelector('[data-x="6"][data-y="'+y+'"]').getAttribute("aria-current")==="location",y);
  }
  await Promise.all([last.host,last.guest].map(p=>tile(p,"rack").click()));
  for(const p of [last.host,last.guest])await p.waitForFunction(()=>document.querySelector("#plateCount").textContent.includes("干净盘 0 / 3"));
  assert.deepEqual((await Promise.all([last.host,last.guest].map(hand))).sort(),["空手","干净盘"].sort());
  await Promise.all([last.host,last.guest].map(p=>p.context().close()));
  console.log("PASS 两端同时拿最后一只净盘，只有一人拿到，水槽另外两只脏盘保留。");
}
async function mapRooms(){
  const {host,guest}=await joinPair(fixtureURL+"?level=mapShift");
  const waitMap=(p,name)=>p.waitForFunction(n=>!document.querySelector("#kitchen").hidden && document.querySelector("#shopName").textContent===n,name);
  await guest.locator('[data-map="island_diner"]').click();
  assert.equal(await host.locator("#previewName").innerText(),"街角小食堂");
  assert.equal(await guest.locator("#chooseMap").isDisabled(),true);
  await choose(host,"courtyard_diner");await waitMap(guest,"双窗小院");
  await tile(guest,"a").click();await guest.locator('[data-seat-dir="1"]').click();
  await tile(host,"a").click();
  const seatIsBanned=()=>document.querySelector('[data-seat-dir="1"]').getAttribute("aria-pressed")==="true";
  await Promise.all([host,guest].map(p=>p.waitForFunction(seatIsBanned)));
  async function go(p,id,item){
    await tile(p,id).click();
    await p.waitForFunction(v=>document.querySelector("#hand").textContent===v,item);
  }
  await host.locator("#openShop").click();await go(host,"rice","生米");await go(host,"pot","空手");
  await guest.waitForFunction(()=>document.querySelector(".table").textContent.includes("等接单"));
  await tile(guest,"a").click();await guest.waitForFunction(()=>document.querySelector(".table").textContent.includes("等上菜"));
  await host.waitForTimeout(5100);await go(host,"pot","熟饭");await go(host,"board","空手");
  await go(host,"nori","海苔");await go(host,"board","空手");await form(host,ms=>host.waitForTimeout(ms));
  await go(host,"board","海苔饭团");await go(host,"rack","海苔饭团（已装盘）");
  await go(host,"pass","空手");await go(guest,"pass","海苔饭团（已装盘）");
  await cell(guest,2,4).click();
  await guest.waitForFunction(()=>document.querySelector('[data-x="2"][data-y="4"]').getAttribute("aria-current")==="location");
  await guest.keyboard.down("ArrowRight");await guest.keyboard.press("Shift");await guest.keyboard.up("ArrowRight");
  try{await guest.waitForFunction(()=>{const cell=document.querySelector('[aria-current="location"]');return cell.dataset.y==="4" && [3,4].includes(+cell.dataset.x);});}
  catch{throw Error("搭档端盘冲刺落点："+await host.locator("#connection").getAttribute("title")+"，搭档画面："+await guest.locator('[aria-current="location"]').getAttribute("aria-label")+"，"+await guest.locator("#phase").innerText()+"，"+errors.join("、"));}
  assert.equal(await hand(guest),"海苔饭团（已装盘）");
  await guest.waitForTimeout(200);
  const col=Number(await guest.locator('[aria-current="location"]').getAttribute("data-x"))+1;
  await host.waitForFunction(col=>document.querySelector("#connection").title==="队友在 "+col+" 列 5 行 · 海苔饭团（已装盘）",col);
  await go(guest,"a","空手");
  await guest.waitForFunction(()=>document.querySelector(".table").textContent.includes("待清桌"));
  await go(guest,"a","脏盘");await go(guest,"pass2","空手");await go(host,"pass2","脏盘");
  // From the kitchen, reaching the dining side requires the staff opening.
  await cell(host,8,4).click();await host.waitForFunction(()=>document.querySelector('[data-x="8"][data-y="4"]').getAttribute("aria-current")==="location");
  await host.keyboard.press("Space");assert.equal(await hand(host),"空手");
  await host.locator("#result[open]").waitFor({timeout:35000});
  assert.match(await guest.locator("#totals").innerText(),/¥12/);
  await host.locator("#again").click();await waitMap(guest,"双窗小院");
  await guest.locator("#result").waitFor({state:"hidden"});assert.match(await guest.locator("#plateCount").innerText(),/3 \/ 3.*¥0/);
  assert.equal(await guest.locator("#roundPlan").innerText(),await host.locator("#roundPlan").innerText());
  assert.match(await host.locator("#roundPlan").innerText(),/第 2 关/);
  for(const p of [host,guest]){await tile(p,"a").click();await p.waitForFunction(seatIsBanned);}
  await host.locator("#openShop").click();await host.locator("#result[open]").waitFor({timeout:18000});
  await host.locator("#resultMaps").click();await guest.locator("#mapPicker").waitFor();
  await choose(host,"island_diner");await waitMap(guest,"中岛小馆");
  await tile(guest,"sink").click();await cell(guest,10,8).click();
  await host.waitForFunction(()=>document.querySelector('[data-fixture="sink"]').dataset.y==="8");
  await Promise.all([host,guest].map(p=>p.context().close()));
  const late=await joinPair(pathToFileURL(standalone).href,async p=>{
    await choose(p,"island_diner","steak");await tile(p,"sink").click();await cell(p,10,8).click();
  });
  await waitMap(late.guest,"中岛小馆");assert.equal(await tile(late.guest,"sink").getAttribute("data-y"),"8");
  await tile(late.guest,"bin").click();await cell(late.guest,0,0).click();
  await late.host.waitForFunction(()=>document.querySelector('[data-fixture="bin"]').dataset.x==="0");
  assert.equal(await late.guest.locator("#todayMenu").innerText(),"今日供应 · 牛排");
  assert.equal(await tile(late.guest,"egg").count(),0);
  await late.host.locator("#practice").click();
  await late.guest.waitForFunction(()=>document.querySelector("#phase").textContent==="练习中");
  await go(late.host,"beef","生牛排");await go(late.host,"pan","空手");
  await tile(late.guest,"pan").click();
  const pair=[late.host,late.guest];
  for(const label of ["五分熟牛排可取","全熟牛排可取"]){
    await Promise.all(pair.map(p=>p.waitForFunction(label=>document.querySelector('[data-fixture="pan"]').title.includes(label),label)));
  }
  await Promise.all(pair.map(p=>tile(p,"pan").click()));
  await Promise.all(pair.map(p=>p.waitForFunction(()=>document.querySelector('[data-fixture="pan"]').title==="平底锅")));
  const hands=await Promise.all(pair.map(hand));assert.deepEqual([...hands].sort(),["全熟牛排","空手"].sort());
  const winner=hands.indexOf("全熟牛排"),other=1-winner;
  await go(pair[winner],"counter","空手");await go(pair[other],"counter","全熟牛排");await go(pair[other],"pass2","空手");
  await late.host.locator("#practice").click();await late.host.locator("#browseMaps").click();
  await late.guest.locator("#mapPicker").waitFor();assert.ok(await late.guest.locator("#recipeChoice").isDisabled());
  await late.host.locator("#recipeChoice").selectOption("omelet");await late.host.locator("#chooseMap").click();
  await late.host.locator("#replaceMap").click();
  await late.guest.waitForFunction(()=>document.querySelector("#todayMenu").textContent==="今日供应 · 厚蛋烧");
  assert.equal(await tile(late.guest,"beef").count(),0);
  await late.host.locator("#openShop").click();
  await go(late.host,"egg","鸡蛋");await go(late.host,"board","空手");
  await form(late.host,ms=>late.host.waitForTimeout(ms));await go(late.host,"board","蛋液");await go(late.host,"pan","空手");
  await late.guest.waitForFunction(()=>document.querySelector('[data-fixture="pan"]').title.includes("整条厚蛋烧可取"));
  await go(late.host,"pan","整条厚蛋烧");await go(late.host,"counter","空手");
  await go(late.host,"rack","干净盘");await go(late.host,"counter","厚蛋烧（已装盘）");await go(late.host,"pass","空手");
  await Promise.all(pair.map(p=>go(p,"rack","干净盘")));
  // Both players start their approach while they still see the same last serving.
  for(const [i,p] of pair.entries()){
    const x=7-i;await cell(p,x,5).click();
    try{await p.waitForFunction(x=>document.querySelector('[data-x="'+x+'"][data-y="5"]').getAttribute("aria-current")==="location",x);}
    catch(error){
      const state=await late.host.evaluate(()=>JSON.parse(localStorage.getItem("mountain-kitchen.store.first")).state.players);
      throw new Error("争最后一份前的站位 "+JSON.stringify(state),{cause:error});
    }
  }
  for(const p of pair)assert.match(await tile(p,"counter").getAttribute("aria-label"),/1 份/);
  await Promise.all(pair.map(p=>tile(p,"counter").click()));
  await Promise.all(pair.map(p=>p.waitForFunction(()=>document.querySelector('[data-fixture="counter"]').title==="备餐台")));
  assert.deepEqual((await Promise.all(pair.map(hand))).sort(),["厚蛋烧（已装盘）","干净盘"].sort());
  await Promise.all([late.host,late.guest].map(p=>p.context().close()));
  console.log("PASS 双窗口独立预览、双窗送餐回盘、晚加入和移动垃圾桶。两端看见相同牛排熟度，同时起锅只有一份；跨人交接和争最后一份蛋烧成功。");
}
async function shareSink(){
  const {host,guest}=await joinPair(fixtureURL+"?level=first");
  async function go(p,id,expected){
    await tile(p,id).click();await p.waitForFunction(v=>document.querySelector("#hand").textContent===v,expected);
  }
  await host.locator("#openShop").click();
  await go(host,"rice","生米");await go(host,"pot","空手");
  await guest.waitForFunction(()=>document.querySelector(".table").textContent.includes("等接单"));
  await tile(guest,"a").click();await guest.waitForFunction(()=>document.querySelector(".table").textContent.includes("等上菜"));
  await host.waitForTimeout(5200);
  await go(host,"pot","熟饭");await go(host,"board","空手");await go(host,"nori","海苔");
  await go(host,"board","空手");await form(host,ms=>host.waitForTimeout(ms));await go(host,"board","海苔饭团");await go(host,"rack","海苔饭团（已装盘）");
  await go(host,"a","空手");
  await host.waitForFunction(()=>document.querySelector(".table").textContent.includes("待清桌"),null,{timeout:12000});
  await go(host,"a","脏盘");await go(host,"sink","空手");
  await host.keyboard.press("e");await host.waitForTimeout(900);
  await cell(host,1,3).click();
  await host.waitForTimeout(3400);
  for(const p of [host,guest])assert.match(await tile(p,"sink").getAttribute("aria-label"),/脏盘 1 .*净盘 0/);
  await tile(guest,"sink").click();
  await guest.waitForFunction(()=>document.querySelector('[data-fixture="sink"]').title.includes("净盘 1"));
  await guest.keyboard.press("Space");await guest.waitForFunction(()=>document.querySelector("#hand").textContent==="干净盘");
  await go(guest,"rack","空手");
  for(const p of [host,guest])await p.waitForFunction(()=>document.querySelector("#plateCount").textContent.includes("干净盘 3 / 3"));
  await Promise.all([host,guest].map(p=>p.context().close()));
  console.log("PASS 两个浏览器合作接单做饭，房主半途停刷，搭档接手续刷，双方盘数同时恢复");
}
async function duo(){
  const {host,guest}=await joinPair(fixtureURL+"?level=duo");
  await tile(guest,"sink").click();await cell(guest,5,5).click();
  await host.waitForFunction(()=>document.querySelector('[data-fixture="sink"]').dataset.x==="5");
  await host.locator("#practice").click();await guest.waitForFunction(()=>document.querySelector("#phase").textContent==="练习中");
  await go(guest,"rice","生米");
  await host.locator("#practice").click();await guest.waitForFunction(()=>document.querySelector("#phase").textContent==="营业准备");
  assert.equal(await hand(guest),"空手");assert.equal(await tile(guest,"sink").getAttribute("data-x"),"5");
  await host.locator("#openShop").click();await guest.locator("#openShop").waitFor({state:"hidden"});
  // Walk from the guest spawn to the pass, then interact using the keyboard.
  await guest.waitForFunction(()=>document.querySelector("#phase").textContent==="营业中");
  await guest.keyboard.down("a");await guest.waitForTimeout(330);await guest.keyboard.up("a");
  await guest.keyboard.press("Space");
  await guest.waitForFunction(()=>document.querySelector("#hint").textContent.includes("台面是空的"));
  async function go(p,id,expected){
    await tile(p,id).click();
    if(expected!==undefined)await p.waitForFunction(v=>document.querySelector("#hand").textContent===v,expected);
  }
  async function rice(p){
    await go(p,"rice","生米");await go(p,"pot","空手");await p.waitForTimeout(5200);await go(p,"pot","熟饭");
  }
  async function finish(p){
    await go(p,"board","空手");await go(p,"nori","海苔");await go(p,"board","空手");await form(p,ms=>p.waitForTimeout(ms));await go(p,"board","海苔饭团");
  }
  await rice(host);await go(guest,"a");await guest.waitForFunction(()=>document.querySelector("#tables").textContent.includes("×2"));
  await go(host,"pass","空手");await go(guest,"pass","熟饭");await finish(guest);
  await go(guest,"rack","海苔饭团（已装盘）");await go(guest,"a","空手");
  assert.match(await guest.locator("#tables").innerText(),/×1/);
  await rice(guest);await finish(guest);await go(guest,"pass","空手");
  await Promise.all([host,guest].map(p=>tile(p,"pass").click()));await host.waitForTimeout(1800);
  const hands=await Promise.all([host,guest].map(hand));assert.deepEqual(hands.sort(),["海苔饭团","空手"].sort());
  if(await hand(guest)==="海苔饭团"){await go(guest,"pass","空手");await go(host,"pass","海苔饭团");}
  await go(host,"rack","海苔饭团（已装盘）");
  await rice(guest);await finish(guest);await go(guest,"rack","海苔饭团（已装盘）");
  await Promise.all([host,guest].map(p=>tile(p,"a").click()));
  for(const p of [host,guest])await p.waitForFunction(()=>document.querySelector("#tables").textContent.includes("用餐中"));
  assert.deepEqual((await Promise.all([host,guest].map(hand))).sort(),["空手","海苔饭团（已装盘）"].sort());
  for(const p of [host,guest]){
    await p.locator("#result[open]").waitFor();
    assert.match(await p.locator("#totals").innerText(),/¥24/);assert.equal(await p.locator("#outcome").innerText(),"成功打烊");
  }
  await host.locator("#again").click();await guest.locator("#result").waitFor({state:"hidden"});
  for(const p of [host,guest])assert.match(await p.locator("#plateCount").innerText(),/3 \/ 3.*¥0/);
  console.log("PASS 双独立窗口 WebRTC、摆位同步、两人换手、争同一物品、最后一盘只计一次、共享回执与同房重开；配对="+(live?"公共 PeerServer":"本机信令夹具"));
  await Promise.all([host,guest].map(p=>p.context().close()));
}
try{
  await copyFile(path.join(directory,"厨房营业-网页版.html"),standalone);
  await writeFile(testFile,await bundlePage(fileURLToPath(new URL("./browser-entry.mjs",import.meta.url))));
  if(flags.has("--keyboard-only")){await keyboardService();await heldInteractions();}
  else if(flags.has("--touch")){await practiceBasin();await shopTouch();}
  else if(!flags.has("--duo")){
    await offlineDay("corner_diner","onigiri");
    await offlineDay("island_diner","omelet");
    await offlineDay("courtyard_diner","steak");
    await offlineDay("corner_diner","cucumberRoll",true);
    await heldInteractions();await keyboardService();await extension();await steakService();await practiceBasin();await shopTouch();
  }
  if(live)await publicRelease();
  if(!flags.has("--offline") && !flags.has("--touch") && !flags.has("--keyboard-only")){
    await doorwayRoom();await marketRoom();
    if(!flags.has("--market-only")){await mapRooms();await duo();await shareSink();}
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();await unlink(testFile).catch(()=>{});await rmdir(temp);await unlink(standalone).catch(()=>{});await rmdir(isolated);}
