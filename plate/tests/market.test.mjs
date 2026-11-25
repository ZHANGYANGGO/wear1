import test from "node:test";
import assert from "node:assert/strict";
import {Kitchen} from "../game.mjs";
import {catalog,nextArrivals} from "../content.mjs";
import {goods,availableAssets,offerPrice,restock,settle} from "../market.mjs";

function shop(recipe="steak",map="corner_diner"){
  const game=new Kitchen(),cmd=(type,fields={},who="host")=>game.command(who,{type,run:game.s.run,...fields});
  cmd("choose",{map,recipe});game.s.phase="won";settle(game.s);
  function offers(...skus){
    game.s.store.shelf=skus.map(sku=>({sku,price:goods[sku].price,locked:false,sold:false}));
    game.s.store.revision++;
  }
  function request(type,index,extra={},who="host"){
    const store=game.s.store;
    cmd(type,{revision:store.revision,index,sku:store.shelf[index]?.sku,...extra},who);
  }
  function buy(sku,x,y){
    offers(sku);request("buy",0,{x,y,dir:0});assert.ok(game.s.store.shelf[0].sold,sku+" "+game.s.players.host.notice);
    return game.s.store.assets.at(-1)?.id;
  }
  return {game,cmd,offers,request,buy};
}
test("结算、五货位、免费锁货、两次刷新、售罄和旧请求只处理一次",()=>{
  const {game:g,cmd,offers,request}=shop(),s=g.s,store=s.store;
  store.wallet=170;offers("timer","plates4","metal","box","tray");
  request("lock",0,{locked:true});
  const order={revision:store.revision,index:1,sku:"plates4"};
  cmd("buy",order);cmd("buy",order);
  assert.deepEqual([store.wallet,s.stations.rack.plates,store.shelf[1].sold],[150,7,true]);
  for(const balance of [140,120]){
    const old=structuredClone(store.shelf);request("refresh");
    assert.equal(store.wallet,balance);assert.equal(new Set(store.shelf.map(v=>v.sku)).size,5);
    assert.deepEqual(store.shelf[0],old[0]);
    old.slice(1).forEach((v,i)=>{if(!v.sold)assert.notEqual(store.shelf[i+1].sku,v.sku);});
  }
  assert.equal(store.refreshes,2);cmd("buy",order);assert.equal(store.wallet,120);
  for(let i=1;i<5;i++)request("lock",i,{locked:true});
  request("refresh");assert.equal(store.wallet,120);
  for(let i=1;i<5;i++)request("lock",i,{locked:false});
  const saved=structuredClone(s),restored=new Kitchen();assert.ok(restored.restore(saved));assert.deepEqual(restored.s.store,store);
  s.round++;s.stats.revenue=15;s.tips=7.5;settle(s);settle(s);
  assert.equal(store.wallet,142.5);assert.equal(store.shelf[0].sku,"timer");assert.equal(store.refreshes,0);
  store.shelf.forEach(v=>Object.assign(v,{sold:true,locked:false}));request("refresh");
  assert.equal(store.wallet,132.5);assert.ok(store.shelf.every(v=>!v.sold));store.wallet=0;
  request("refresh");assert.equal(store.refreshes,1);
  for(let i=0;i<500;i++){restock(store);assert.equal(new Set(store.shelf.map(v=>v.sku)).size,5);}
});
test("十种商品首日不超过 50，跨关按首日价线性增长，锁货按原报价扣款",()=>{
  const {game:g,offers,request}=shop(),s=g.s,store=s.store;
  for(const [sku,item] of Object.entries(goods)){
    assert.ok(item.price>0 && item.price<=50);
    assert.equal(offerPrice(sku,1),item.price);
    assert.equal(offerPrice(sku,11),2*item.price);
  }
  assert.deepEqual([1,2,3,5].map(day=>offerPrice("soak",day)),[50,55,60,70]);
  store.wallet=100;offers("plates4","soak","tray","box","rapid");request("lock",0,{locked:true});
  s.round=3;settle(s);
  const check=()=>store.shelf.forEach((slot,i)=>assert.equal(slot.price,i===0?20:offerPrice(slot.sku,3)));
  check();request("refresh");check();
  request("buy",0);assert.equal(store.wallet,70);
  const i=store.shelf.findIndex(slot=>!slot.sold),{sku,price}=store.shelf[i];
  request("buy",i,{x:goods[sku].fitting?g.fixture("counter").x:0,y:goods[sku].fitting?g.fixture("counter").y:0,dir:0});
  assert.equal(store.wallet,70-price);
});
test("旧货架就地调价，锁货取较低报价，读档不再换货或结算",()=>{
  const {game:g,offers}=shop();offers("timer","plates4","soak");
  const saved=structuredClone(g.s),store=saved.store;
  delete store.pricingVersion;store.wallet=81;store.refreshes=2;
  store.shelf[0].price=150;store.shelf[0].locked=true;store.shelf[1].price=50;
  store.shelf[2].price=160;store.shelf[2].sold=true;
  assert.ok(g.restore(saved));
  const migrated=g.s.store;
  assert.deepEqual(migrated.shelf.map(slot=>slot.price),[45,20,50]);
  assert.ok(migrated.shelf[0].locked && migrated.shelf[2].sold);
  assert.deepEqual([migrated.wallet,migrated.refreshes,migrated.revision],[81,2,store.revision+1]);
  assert.ok(g.restore(g.s));assert.deepEqual(g.s.store,migrated);
  saved.round=store.settled=31;assert.ok(g.restore(saved));
  assert.equal(g.s.store.shelf[0].price,150);
});
test("三店购买、拒绝冲突、盘包永久计数、换图回库、重新摆放、旧存档",()=>{
  for(const map of catalog.levels.first.maps){
    const {game:g,cmd,offers,request,buy}=shop("steak",map),store=g.s.store;store.wallet=1200;g.addPlayer("guest");
    offers("counter");request("lock",0,{locked:true});const before=structuredClone(store);
    request("buy",0,{x:-1,y:1,dir:0});assert.deepEqual(store,before);
    request("buy",0,{x:0,y:0,dir:0},"guest");assert.deepEqual(store,before);
    const counter=buy("counter",0,0),box=buy("box",0,0);
    offers("tray");const balance=store.wallet;request("buy",0,{x:0,y:0,dir:0});assert.equal(store.wallet,balance);
    assert.equal(g.fixture(counter).attachment,box);
    buy("plates4");buy("plates8");assert.equal(g.plateSupply,15);assert.equal(g.s.stations.rack.plates,15);
    cmd("reset");assert.equal(g.s.round,2);assert.equal(g.validate(),"");
    cmd("open");g.advance(200000);assert.equal(g.s.phase,"lost");
    const shelf=structuredClone(store);cmd("reset");assert.deepEqual(g.s.store,shelf);assert.equal(g.s.stations.rack.plates,15);
    const next=catalog.levels.first.maps.find(id=>id!==map);
    cmd("browse");cmd("choose",{map:next,recipe:"steak"});
    assert.equal(g.s.round,2);assert.equal(g.s.stations.rack.plates,15);assert.deepEqual(g.s.store,shelf);
    assert.deepEqual(availableAssets(g.s).map(a=>a.id),[counter,box]);
    for(const asset of [counter,box])cmd("deploy",{asset,revision:store.revision,x:0,y:0,dir:1});
    cmd("deploy",{asset:counter,revision:store.revision,x:0,y:1,dir:1});
    assert.equal(store.wallet,shelf.wallet);assert.equal(g.s.fixtures.filter(f=>f.id===counter).length,1);assert.equal(g.fixture(counter).attachment,box);
    const old=structuredClone(g.s);delete old.store;delete old.trays;delete old.tips;
    const restored=new Kitchen();assert.equal(restored.restore(old),true);assert.equal(restored.s.round,2);assert.equal(restored.s.store.wallet,0);
    cmd("newStore");assert.equal(g.plateSupply,3);assert.equal(g.s.store.wallet,0);assert.equal(g.s.round,1);
  }
});
test("快速锅和安全锅使用当前菜谱的各段火候，蛋液入锅，牛排确认熟度",()=>{
  for(const [recipe,input,product,ms] of [["onigiri","rice","cooked",5000],["omelet","beatenEgg","omeletLog",4000],["steak","beef","steakMedium",4000]]){
    const {game:g,buy,cmd}=shop(recipe);g.s.store.wallet=1000;
    const fast=buy("rapid",0,0),timer=buy("timer",0,1);cmd("reset");cmd("open");
    const p=g.s.players.host,use=(id,act="grab")=>g.interact(p,g.fixture(id),act);
    if(recipe==="omelet"){p.hand="egg";use(timer);assert.equal(p.hand,"egg");}
    p.hand=input;use(fast);g.advance(Math.ceil(ms/1.5/20)*20-20);assert.equal(g.s.stations[fast].item,null);
    g.advance(20);assert.equal(g.s.stations[fast].item,product);
    if(recipe==="steak"){g.advance(2660);assert.equal(g.s.stations[fast].item,"steakWell");g.advance(4000);}
    else g.advance(5340);
    assert.match(g.s.stations[fast].item,/^burnt/);use(fast);use("bin");assert.equal(p.hand,null);
    p.hand=input;use(timer);
    if(recipe==="steak"){g.advance(10000);assert.equal(g.s.stations[timer].raw,"beef");p.slot=1;use(timer,"work");}
    g.advance(recipe==="steak"?8000:ms);const st=g.s.stations[timer];
    assert.equal(st.heat,null);assert.equal(st.item,recipe==="steak"?"steakWell":product);
    g.advance(15000);p.hand=input;use(timer);assert.equal(p.hand,input);p.hand=null;use(timer);assert.equal(p.hand,recipe==="steak"?"steakWell":product);
    if(recipe==="steak"){p.hand=input;use(timer);p.slot=0;use(timer,"work");g.advance(18000);assert.equal(st.item,"steakMedium");}
  }
});
test("餐桌等候排序、菜单和用餐时间、半金币小费、备料盒取指定格",()=>{
  const {game:g,buy,cmd}=shop("cucumberRoll");g.s.store.wallet=800;
  const metal=buy("metal",4,5),elegant=buy("elegant",4,7);buy("box",9,1);cmd("reset");cmd("open");
  const p=g.s.players.host,items=["cucumber","cucumberStrips","cooked","omeletLog"];
  for(const [i,item] of items.entries()){p.hand=item;p.slot=i;g.interact(p,g.fixture("counter"),"grab");assert.equal(p.hand,null);}
  for(const i of [3,1,0,2]){p.slot=i;g.interact(p,g.fixture("counter"),"grab");assert.equal(p.hand,items[i]);p.hand=null;}
  // Leave just the test table open; route and timing still use real customer states.
  for(const [id,eat,browse] of [[metal,4,3],[elegant,7.2,3.6]]){
    for(const f of g.s.fixtures.filter(f=>g.def(f).action==="table"))g.s.stations[f.id].dirty=Number(f.id!==id);
    g.s.arrivals=[];g.spawnGroup(1);g.seat();const group=g.s.groups.at(-1);
    assert.equal(group.table,id);g.advance(group.due-g.s.now);assert.equal(group.due-group.since,browse*1000);
    g.advance(browse*1000);g.interact(p,g.fixture(id),"work");p.hand="plated:cucumberRoll";g.interact(p,g.fixture(id),"grab");
    assert.equal(group.due-group.since,eat*1000);g.advance(eat*1000+3000);
  }
  assert.equal(g.s.tips,7.5);assert.equal(g.s.stats.revenue,30);
});
test("托盘逐盘核单、两人重连与收回、批量浸洗同时完成",()=>{
  const {game:g,cmd,buy}=shop();g.s.store.wallet=1000;
  const tray=buy("tray",9,1),sink=buy("soak",0,0);
  cmd("reset");g.addPlayer("guest");cmd("open");g.s.arrivals=[];
  const p=g.s.players.guest,use=(id,intent="grab")=>g.interact(p,g.fixture(id),intent);
  for(const i of [0,1]){g.spawnGroup(1);p.slot=i;p.hand="plated:"+["steakMedium","steakWell"][i];use("counter");}
  g.seat();g.advance(6500);use("a","work");use("b","work");use("counter");
  assert.equal(p.hand,"tray:"+tray);g.parkGuest();g.addPlayer("guest");assert.equal(p.hand,"tray:"+tray);
  p.slot=1;use("a");assert.deepEqual(g.s.trays[tray],["plated:steakMedium","plated:steakWell"]);
  use("b");p.slot=0;use("a");assert.equal(g.s.stats.sold,2);g.advance(10000);
  use("a");p.slot=1;use("b");assert.deepEqual(g.s.trays[tray],["dirty","dirty"]);
  g.parkGuest();cmd("reclaim");cmd("reclaim");assert.deepEqual(g.s.returns,["tray:"+tray]);assert.equal(p.hand,null);
  g.addPlayer("guest");use("rack");use(sink);p.slot=0;use(sink);use("counter");
  for(const n of [2,1,3]){
    const st=g.s.stations[sink];
    while(st.dirty<n){p.hand="dirty";use(sink);}
    g.advance(1000);assert.equal(st.clean,0);use(sink,"work");g.advance(3000);
    p.hand="dirty";use(sink);assert.equal(p.hand,"dirty");p.hand=null;use(sink);assert.equal(p.hand,null);
    g.advance(2980);assert.equal(st.clean,0);g.advance(20);assert.equal(st.clean,n);
    for(let i=0;i<n;i++){use(sink);assert.equal(p.hand,"plate");p.hand=null;}
  }
});
test("连续正式关卡按人数至少一半结伴",()=>{
  let arrivals=catalog.levels.first.arrivals;
  for(let round=1;round<=100;round++){
    assert.ok(arrivals.filter(a=>a[1]===2).length*4>=arrivals.reduce((sum,a)=>sum+a[1],0));
    arrivals=nextArrivals(arrivals,60,round+1);
  }
});

test("同容量时优先等得最久的干净桌，脏盘清空的瞬间才开始等位",()=>{
  const {game:g,buy,cmd}=shop();
  g.s.store.wallet=120;const id=buy("elegant",4,5);cmd("reset");cmd("open");g.s.arrivals=[];
  const s=g.s;assert.ok([id,"a","b"].every(t=>s.stations[t].seats.filter(seat=>seat.available).length===4));
  s.stations.b.group=99;s.stations.a.dirty=2;
  const p=s.players.host;g.advance(1000);g.interact(p,g.fixture("a"),"grab");assert.equal(s.stations.a.idleSince,0);
  g.advance(200);p.hand=null;g.interact(p,g.fixture("a"),"grab");assert.equal(s.stations.a.idleSince,1200);
  g.spawnGroup(1);g.seat();assert.equal(s.groups[0].table,id);
});

test("三张店面用新增台面、锅、槽与餐桌实际接一组双人客",()=>{
  for(const map of catalog.levels.first.maps){
    const {game:g,cmd,buy}=shop("steak",map);g.s.store.wallet=2000;
    const coords={corner_diner:[4,6],island_diner:[4,8],courtyard_diner:[3,6]};
    const table=buy("metal",...coords[map]),counter=buy("counter",0,0),pan=buy("rapid",1,0),sink=buy("soak",0,2);
    buy("box",0,0);cmd("reset");cmd("open");assert.equal(g.s.phase,"open",g.s.players.host.notice);
    const p=g.s.players.host,use=(id,intent="grab")=>g.interact(p,g.fixture(id),intent);
    for(const id of [table,counter,pan,sink])assert.ok(g.routeTo(g.map.spawns.host,g.fixture(id)));
    g.s.arrivals=[];
    use("beef");use(counter);use(counter);assert.equal(p.hand,"beef");use(pan);g.advance(2680);use(pan);use("rack");
    g.s.stations.a.dirty=g.s.stations.b.dirty=1;g.spawnGroup(2);g.seat();
    const group=g.s.groups.at(-1);assert.equal(group.table,table);assert.equal(group.seats.length,2);
    g.advance(7000);use(table,"work");
    use(table);assert.equal(p.hand,null);
    use("beef");use(pan);g.advance(5340);use(pan);use("rack");use(table);assert.equal(group.stage,"eat");
    g.advance(8500);use(table);use(sink);use(sink,"work");g.advance(6000);use(sink);assert.equal(p.hand,"plate");
  }
});

// Compare identical kitchens using the normal walking, cooking, queue and dish rules.
// Clean a plate only when stock or dirty storage actually runs out.
test("细卷与牛排的盘包经营对照，逐关记录实际清洗和翻台",t=>{
  for(const recipe of ["cucumberRoll","steak"])for(const pack of [null,"plates4","plates8"]){
    const {game:g,cmd,buy}=shop(recipe);
    // The shared front-of-house layout keeps the two tables, rack and wash area close.
    const layout={a:[1,6],b:[3,6],sink:[7,4],rack:[4,6],counter:[6,6],pass:[8,6],
      rice:[2,4],pot:[3,4],cucumber:[4,4],board:[5,4],nori:[6,4],beef:[2,4],pan:[3,4]};
    for(const [id,[x,y]] of Object.entries(layout)){
      if(g.fixture(id))assert.equal(g.place(g.fixture(id),x,y,id==="rack"?2:0),"",id);
    }
    g.s.store.wallet=6*catalog.recipes[recipe].price;
    if(pack)buy(pack);
    const records=[];
    while(g.s.round<5){
      cmd("reset");cmd("open");assert.equal(g.s.phase,"open",g.s.players.host.notice);
      const s=g.s,p=s.players.host;
      let washed=0,cleared=0,collected=0;
      function time(ms){
        const before=s.stations.sink.clean;g.advance(ms);
        if(s.phase==="open")washed+=Math.max(0,s.stations.sink.clean-before);
      }
      function visit(id,intent="grab"){
        g.approach(p,g.fixture(id),intent);
        while(p.path.length && s.phase==="open")time(20);
      }
      function form(){visit("board","work");time(500);p.form=null;}
      function takeDirty(id){
        const st=s.stations[id],last=st.dirty===1;
        visit(id);assert.equal(p.hand,"dirty",recipe+" "+pack+" 第"+s.round+"关 "+s.reason+" "+p.notice);
        collected++;if(last)cleared++;
      }
      function wash(){
        if(!s.stations.sink.dirty){
          const dirtyTable=["a","b"].find(id=>s.stations[id].dirty);
          if(dirtyTable)takeDirty(dirtyTable);
          else visit(["counter","pass"].find(id=>s.stations[id].item==="dirty"));
          visit("sink");
        }
        visit("sink","work");time(3000);visit("sink");assert.equal(p.hand,"plate");visit("rack");
      }
      function cook(order){
        if(recipe==="steak"){
          visit("beef");visit("pan");time(order.endsWith("well")?8000:4000);visit("pan");
        }else{
          visit("rice");visit("pot");visit("cucumber");visit("board");form();
          if(s.stations.pot.job)time(Math.max(0,s.stations.pot.readyAt-s.now));
          visit("pot");visit("board");visit("nori");visit("board");form();visit("board");
        }
        visit("rack");assert.match(p.hand,/^plated:/);
      }
      for(let turns=0;s.phase==="open" && turns<3000;turns++){
        const order=s.groups.find(group=>group.stage==="order");
        if(order){visit(order.table,"work");continue;}
        const dirty=["a","b"].find(id=>s.stations[id].dirty);
        if(dirty && s.queue.length){
          const space=["counter","pass"].find(id=>!s.stations[id].item);
          if(s.stations.sink.dirty===4 && !space){wash();continue;}
          takeDirty(dirty);visit(s.stations.sink.dirty<4?"sink":space);continue;
        }
        const food=s.groups.filter(group=>group.stage==="food").sort((a,b)=>a.due-b.due)[0];
        if(food){
          if(!s.stations.rack.plates){wash();continue;}
          cook(food.remaining[0]);visit(food.table);assert.equal(p.hand,null);continue;
        }
        time(100);
      }
      assert.equal(s.phase,"won",recipe+" "+pack+" 第"+s.round+"关 "+s.reason);
      records.push({round:s.round,washed,cleared,collected});
    }
    t.diagnostic(recipe+" "+(pack || "原配")+" "+JSON.stringify(records));
  }
});
