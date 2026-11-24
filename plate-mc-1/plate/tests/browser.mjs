import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {mkdtemp,writeFile,unlink,rmdir,copyFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {chromium} from "playwright-core";
import {bundlePage} from "../build.mjs";
import {catalog,recipeFixtures} from "../content.mjs";
import {signalingFixture} from "../../tests/signaling.mjs";

const flags=new Set(process.argv.slice(2)), live=flags.has("--public");
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","/usr/bin/chromium",
].find(existsSync),args:["--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
const temp=await mkdtemp(path.join(tmpdir(),"plate-browser-")),testFile=path.join(temp,"index.html");
const directory=fileURLToPath(new URL("../..",import.meta.url));
const isolated=await mkdtemp(path.join(tmpdir(),"plate-standalone-")),standalone=path.join(isolated,"kitchen.html");
const combinedDir=await mkdtemp(path.join(tmpdir(),"moving-standalone-")),combined=path.join(combinedDir,"搬家 试玩.html");
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
async function offlineDay(mapId,recipeId,fromMenu=false,moveSink=false){
  const p=await page(true);
  await p.clock.install();
  if(fromMenu){
    const url=pathToFileURL(combined);
    p.on("request",r=>{
      const target=new URL(r.url());
      if(target.protocol==="file:" && target.pathname!==url.pathname)errors.push("读取了其他文件 "+target.pathname);
    });
    await p.goto(url.href);await p.locator("#stage canvas").waitFor();
    await p.getByRole("link",{name:"厨房营业"}).click();
    assert.equal(new URL(p.url()).pathname,url.pathname);
    await p.reload();
  }else await p.goto(pathToFileURL(standalone).href);
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
  assert.match(await p.locator("#totals").innerText(),new RegExp("¥"+6*recipe.price));assert.ok(partial && reused);
  const expected=recipe.variants?Array.from({length:6},(_,i)=>Object.values(recipe.variants)[i%2].name):Array(6).fill(recipe.name);
  assert.deepEqual(sold.sort(),expected.sort());
  await p.locator("#again").click();assert.match(await p.locator("#plateCount").innerText(),/3 \/ 3.*¥0/);
  if(moveSink){
    assert.equal(await tile(p,"sink").getAttribute("data-x"),"7");
    await tile(p,"sink").click();await cell(p,4,5).click();await p.locator("#browseMaps").click();
    await p.locator('[data-map="island_diner"]').click();await p.locator("#chooseMap").click();await p.locator("#replaceMap").click();
    assert.equal(await p.locator("#shopName").innerText(),"中岛小馆");assert.equal(await tile(p,"sink").getAttribute("data-x"),"6");
  }
  await p.locator("#openShop").click();await wait(200000);
  assert.match(await p.locator("#reason").innerText(),/第 1 组.*等接单/);
  await p.locator("#resultMaps").click();await p.locator("#mapPicker").waitFor();await choose(p,mapId);
  console.log("PASS "+catalog.maps[mapId].name+" · "+recipe.name+"专营 · 4 桌 6 份 ¥"+6*recipe.price+"、洗盘、重开和重新选图");
  if(fromMenu){
    await p.getByRole("link",{name:"返回搬家日"}).click();await p.locator("#stage canvas").waitFor();
    assert.equal(p.url(),pathToFileURL(combined).href);
    await p.locator('[data-command="new"]').click();await p.locator('[data-command="start"]').click();
    await p.keyboard.press("f");await p.clock.runFor(300);
    assert.match(await p.locator("#tool-state").innerText(),/已垫/);
    console.log("PASS 空目录断网打开改名后的整合 HTML，原文件内切换厨房、刷新、返回搬家并使用滑板");
  }
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
  await p.goto(pathToFileURL(path.join(directory,"dist/plate/index.html")).href);
  await choose(p,"corner_diner");
  const wait=ms=>p.clock.fastForward(ms);
  async function go(id,item){
    await tile(p,id).click();await wait(3000);assert.equal(await hand(p),item,"操作 "+id);
  }
  const use=()=>p.keyboard.press("Space");
  await p.locator("#openShop").click();await go("rice","生米");
  await p.keyboard.down("d");await wait(160);await p.keyboard.up("d");await use();
  assert.equal(await hand(p),"空手","沿柜台横移后投米");await wait(5100);await use();
  assert.equal(await hand(p),"熟饭");
  await go("pass","空手");await go("rack","干净盘");await go("pass","熟饭");
  // Arrive once even if the player presses interact again while approaching.
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
async function practiceBasin(){
  const p=await page(true,true);await p.clock.install();
  await p.goto(pathToFileURL(path.join(directory,"dist/plate/index.html")).href);
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
  const url=pathToFileURL(combined).href+"?game=kitchen";
  const {host,guest}=await joinPair(url);
  await choose(host,"corner_diner");
  await host.locator("#openShop").click();await guest.waitForFunction(()=>document.querySelector("#phase").textContent==="营业中");
  await tile(guest,"rice").click();await guest.waitForFunction(()=>document.querySelector("#hand").textContent==="生米");
  await tile(guest,"pass").click();await guest.waitForFunction(()=>document.querySelector("#hand").textContent==="空手");
  await tile(host,"pass").click();await host.waitForFunction(()=>document.querySelector("#hand").textContent==="生米");
  console.log("PASS 两份成品 HTML 经公共 PeerServer 实际建房、加入、开门和跨窗口传递生米");
  await Promise.all([host,guest].map(p=>p.context().close()));
}
async function mapRooms(){
  const {host,guest}=await joinPair(fixtureURL+"?level=mapShift");
  const waitMap=(p,name)=>p.waitForFunction(n=>!document.querySelector("#kitchen").hidden && document.querySelector("#shopName").textContent===n,name);
  await guest.locator('[data-map="island_diner"]').click();
  assert.equal(await host.locator("#previewName").innerText(),"街角小食堂");
  assert.equal(await guest.locator("#chooseMap").isDisabled(),true);
  await choose(host,"courtyard_diner");await waitMap(guest,"双窗小院");
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
  await go(host,"pass","空手");await go(guest,"pass","海苔饭团（已装盘）");await go(guest,"a","空手");
  await guest.waitForFunction(()=>document.querySelector(".table").textContent.includes("待清桌"));
  await go(guest,"a","脏盘");await go(guest,"pass2","空手");await go(host,"pass2","脏盘");
  // From the kitchen, reaching the dining side requires the staff opening.
  await cell(host,8,4).click();await host.waitForFunction(()=>document.querySelector('[data-x="8"][data-y="4"]').getAttribute("aria-current")==="location");
  await host.keyboard.press("Space");assert.equal(await hand(host),"空手");
  await host.locator("#result[open]").waitFor({timeout:35000});
  assert.match(await guest.locator("#totals").innerText(),/¥12/);
  await host.locator("#again").click();await waitMap(guest,"双窗小院");
  await guest.locator("#result").waitFor({state:"hidden"});assert.match(await guest.locator("#plateCount").innerText(),/3 \/ 3.*¥0/);
  await host.locator("#openShop").click();await host.locator("#result[open]").waitFor({timeout:18000});
  await host.locator("#resultMaps").click();await guest.locator("#mapPicker").waitFor();
  await choose(host,"island_diner");await waitMap(guest,"中岛小馆");
  await tile(guest,"sink").click();await cell(guest,10,8).click();
  await host.waitForFunction(()=>document.querySelector('[data-fixture="sink"]').dataset.y==="8");
  await Promise.all([host,guest].map(p=>p.context().close()));
  const late=await joinPair(pathToFileURL(combined).href+"?game=kitchen",async p=>{
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
  for(const p of pair)await cell(p,7,5).click();
  await Promise.all(pair.map(p=>p.waitForFunction(()=>document.querySelector('[data-x="7"][data-y="5"]').getAttribute("aria-current")==="location")));
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
  await copyFile(path.join(directory,"搬家日-网页版.html"),combined);
  await copyFile(path.join(directory,"dist/plate/index.html"),standalone);
  await writeFile(testFile,await bundlePage(fileURLToPath(new URL("./browser-entry.mjs",import.meta.url))));
  if(flags.has("--touch"))await practiceBasin();
  else if(!flags.has("--duo")){
    await offlineDay("corner_diner","onigiri",true);
    await offlineDay("island_diner","omelet",true);
    await offlineDay("courtyard_diner","steak",true);
    await offlineDay("corner_diner","cucumberRoll",false,true);
    await heldInteractions();await extension();await steakService();await practiceBasin();
  }
  if(live)await publicRelease();
  if(!flags.has("--offline") && !flags.has("--touch")){await mapRooms();await duo();await shareSink();}
  assert.deepEqual(errors,[]);
}finally{await browser.close();await unlink(testFile).catch(()=>{});await rmdir(temp);await unlink(standalone).catch(()=>{});await rmdir(isolated);await unlink(combined).catch(()=>{});await rmdir(combinedDir);}
