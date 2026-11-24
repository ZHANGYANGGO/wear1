import {test} from "node:test";
import assert from "node:assert/strict";
import {Kitchen,front,verbs} from "../game.mjs";
import {catalog} from "../content.mjs";
import {testBook} from "./fixtures.mjs";

test("三店默认布局的来客、员工开口和可调整的收盘路线",()=>{
  const g=new Kitchen(),cmd=c=>g.command("host",{run:g.s.run,...c});
  g.advance(100000);assert.equal(g.s.now,0);assert.equal(g.s.phase,"select");
  for(const map of g.level.maps){
    cmd({type:"choose",map});assert.equal(g.validate(),"",map);
    for(const [x,y] of g.map.passages)assert.ok(g.path(g.map.spawns.host,[x,y]));
    for(const id of ["a","b"]){
      const route=g.path(g.map.entry,front(g.fixture(id)),true);
      assert.ok(route?.length);assert.ok(route.every(([x,y])=>!g.inKitchen(x,y)));
    }
    if(map==="corner_diner"){
      const table=front(g.fixture("a")),sink=g.fixture("sink"),before=g.routeTo(table,sink).length;
      assert.equal(g.place(sink,4,5,0),"");assert.ok(g.routeTo(table,sink).length<before);assert.equal(g.validate(),"");
      cmd({type:"browse"});cmd({type:"cancelMap"});assert.deepEqual([sink.x,sink.y],[4,5]);
      cmd({type:"practice"});cmd({type:"endPractice"});assert.equal(g.fixture("sink").x,4);
    }
    cmd({type:"browse"});
  }
});

test("双窗可双向传菜和回盘，搬走台面后窗仍挡人，实墙挡住拿放与 WASD",()=>{
  const g=new Kitchen(),cmd=(c,id="host")=>g.command(id,{run:g.s.run,...c});
  cmd({type:"choose",map:"courtyard_diner"});g.addPlayer("guest");
  const h=g.s.players.host,k=g.s.players.guest;cmd({type:"open"});
  Object.assign(h,{x:2,y:2,dir:0,hand:"plated:onigiri"});Object.assign(k,{x:2,y:4,dir:2});
  cmd({type:"use"});cmd({type:"use"},"guest");assert.equal(k.hand,"plated:onigiri");assert.equal(h.hand,null);
  Object.assign(k,{x:8,y:4,dir:2,hand:"dirty"});Object.assign(h,{x:8,y:2,dir:0});
  cmd({type:"use"},"guest");cmd({type:"use"});assert.equal(h.hand,"dirty");assert.equal(k.hand,null);
  cmd({type:"drive",x:0,y:-1},"guest");g.advance(500);assert.ok(k.y>3.5);
  const pass=g.fixture("pass");Object.assign(pass,{x:3,y:3});g.s.stations.pass.item="rice";
  Object.assign(k,{x:3,y:4,dir:2,dx:0,dy:0});cmd({type:"use"},"guest");assert.equal(k.hand,null);
  for(const x of [2,3]){Object.assign(k,{x,y:4});cmd({type:"drive",x:0,y:-1},"guest");g.advance(500);assert.ok(k.y>3.5);}
  Object.assign(k,{x:10,y:4});g.advance(400);assert.ok(k.y<3.5);
  assert.equal(g.ground(5,5),false);assert.equal(g.ground(6,5),false);
});

function countPlates(s){
  const count=item=>Number(item==="dirty" || item==="plate" || !!item?.startsWith("plated:"));
  return Object.values(s.stations).reduce((sum,v)=>sum+v.plates+v.dirty+v.clean+count(v.item),0)+
    s.groups.filter(g=>g.stage!=="done").reduce((sum,g)=>sum+g.delivered,0)+
    Object.values(s.players).reduce((sum,p)=>sum+count(p.hand),0)+s.returns.reduce((sum,i)=>sum+count(i),0);
}
function rig(level="rush",book=testBook()){
  const g=new Kitchen(book,level);
  const act=(c,id="host")=>g.command(id,{run:g.s.run,...c});
  const tick=(n=100)=>{
    for(let i=0;i<n;i+=100){g.advance(100);assert.equal(countPlates(g.s),g.s.practice?Math.max(4,g.level.plates):g.level.plates);}
  };
  const go=(id,who="host")=>{
    const f=g.fixture(id),p=g.s.players[who];
    act({type:"go",x:f.x,y:f.y},who);
    for(let n=0;p.path.length && n<100 && g.s.phase==="open";n++)tick();
    return p.hand;
  };
  function cook(){
    assert.equal(go("rice"),"rice");assert.equal(go("pot"),null);
    tick(g.def(g.fixture("pot")).seconds*1000);assert.equal(go("pot"),"cooked");
    assert.equal(go("board"),null);
  }
  const form=()=>{act({type:"work"});tick(500);act({type:"release"});};
  const dish=()=>{
    cook();go("nori");go("board");form();assert.equal(go("board"),"onigiri");
    assert.equal(go("rack"),"plated:onigiri");
  };
  return {g,act,tick,go,cook,dish,form,open:()=>act({type:"open"})};
}

function kitchenShift(map="corner_diner",book=catalog,recipe=book.levels.first.menu[0]){
  const r=rig("first",book);
  r.act({type:"choose",map,recipe});r.open();
  assert.equal(r.g.s.phase,"open");
  return r;
}

test("三张地图任选一道菜，练习和正式订单只用该菜，只有房主能确认更换",()=>{
  const equipment={onigiri:["rice","pot","nori","board"],cucumberRoll:["rice","pot","nori","board","cucumber"],
    omelet:["egg","board","pan"],steak:["beef","pan"]};
  for(const map of catalog.levels.first.maps)for(const [recipe,expected] of Object.entries(equipment)){
    const g=new Kitchen(),act=(type,fields={},who="host")=>g.command(who,{run:g.s.run,type,...fields});
    g.addPlayer("guest");act("choose",{map,recipe},"guest");assert.equal(g.s.phase,"select");
    act("choose",{map,recipe:"not-a-recipe"});assert.equal(g.s.phase,"select");
    act("choose",{map,recipe});assert.equal(g.validate(),"");assert.equal(g.s.recipe,recipe);
    assert.deepEqual(g.s.fixtures.filter(f=>["cook","combine","stock"].includes(g.def(f).action)).map(f=>f.id).sort(),[...expected].sort());
    act("practice");g.advance(100);assert.ok(g.s.groups[0].orders.every(id=>id.split(":")[0]===recipe));
    act("endPractice");act("browse");act("cancelMap");assert.equal(g.s.recipe,recipe);
    act("open");act("choose",{map,recipe:"steak"});g.advance(40500);
    const orders=g.s.groups.flatMap(group=>group.orders);assert.equal(orders.length,6);
    assert.ok(orders.every(id=>id.split(":")[0]===recipe));assert.equal(new Set(orders).size,recipe==="steak"?2:1);
  }
});

test("厨房火候临界点，离火定型，焦料占锅、清理和重做",()=>{
  const {g,act,go,form}=rig("first",catalog);
  act({type:"choose",map:"corner_diner",recipe:"steak"});act({type:"practice"});let pan=g.s.stations.pan;
  for(const [delay,food] of [[4000,"steakMedium"],[8000,"steakWell"],[14000,"burntSteak"]]){
    go("beef");go("pan");const start=pan.heat.since;
    g.advance(start+delay-20-g.s.now);
    assert.equal(pan.item,delay===4000?null:delay===8000?"steakMedium":"steakWell");
    g.advance(20);assert.equal(pan.item,food);assert.equal(go("pan"),food);assert.equal(pan.heat,null);
    if(food==="burntSteak"){
      assert.equal(go("rack"),food);assert.equal(g.fixture("board"),undefined);assert.equal(go("bin"),null);
    }else {go("counter");g.advance(15000);assert.equal(go("counter"),food);go("pass");}
    // Keep the counter free for the following steak. The two cooked steaks exchange on the pass.
    if(food==="steakWell")go("counter");
  }
  act({type:"endPractice"});act({type:"browse"});act({type:"choose",map:"corner_diner",recipe:"omelet"});act({type:"practice"});
  pan=g.s.stations.pan;
  go("egg");go("board");form();assert.equal(go("board"),"beatenEgg");go("pan");
  g.advance(4000);assert.equal(pan.item,"omeletLog");g.advance(8000);assert.equal(pan.item,"burntEgg");
  assert.equal(pan.heat,null);assert.equal(go("pan"),"burntEgg");go("bin");
  go("egg");go("board");form();go("board");go("pan");assert.equal(pan.heat.input,"beatenEgg");
});

test("三店可搬垃圾桶，误投保留手持，三锅米与双向传菜窗",()=>{
  for(const map of catalog.levels.first.maps){
    const {g,act,go,tick,form,open}=rig("first",catalog);
    act({type:"choose",map});const bin=g.fixture("bin");
    act({type:"place",id:"bin",from:[bin.x,bin.y,bin.dir].join(),x:0,y:0,dir:0});
    assert.deepEqual([bin.x,bin.y],[0,0]);assert.equal(g.validate(),"");
    for(const f of g.s.fixtures.filter(f=>f.kind==="pass")){
      assert.ok(g.approaches(f).filter(at=>g.path(g.map.spawns.host,at)).some(([x,y])=>g.inKitchen(x,y)));
      assert.ok(g.approaches(f).filter(at=>g.path(g.map.spawns.host,at)).some(([x,y])=>!g.inKitchen(x,y)));
    }
    open();go("rice");assert.equal(go("bin"),null);assert.equal(go("bin"),null);
    go("rice");go("pot");tick(5000);go("pot");go("counter");
    go("rice");go("pot");tick(13000);assert.equal(g.s.stations.pot.item,"burntRice");
    go("rice");assert.equal(go("pot"),"rice");go("rice");go("pot");
    assert.equal(go("board"),"burntRice");assert.equal(go("rack"),"burntRice");go("bin");assert.equal(go("bin"),null);
    assert.equal(go("counter"),"cooked");go("board");go("nori");go("board");form();go("board");go("rack");
    assert.equal(go("bin"),"plated:onigiri");go("a");assert.equal(go("a"),null);
    go("rice");go("pot");tick(5000);assert.equal(go("pot"),"cooked");go("board");go("nori");go("board");
    assert.equal(g.s.stations.board.pending,"onigiri");
    // Even a supplied off-menu ingredient cannot turn an onigiri order into a roll.
    const guest="guest";g.addPlayer(guest);
    g.s.players[guest].hand="cucumberStrips";go("board",guest);
    assert.equal(g.s.stations.board.pending,"onigiri");assert.equal(g.s.players[guest].hand,"cucumberStrips");
    form();assert.equal(go("board"),"onigiri");go("rack");go("b");assert.equal(go("b"),null);
    assert.equal(g.s.stats.revenue,24);assert.equal(countPlates(g.s),3);
  }
});

test("两人分同一条蛋烧，撤盘可回收盘子，最后一份只可装一次",()=>{
  const {g,act,go,form,tick}=kitchenShift("corner_diner",catalog,"omelet");g.addPlayer("guest");
  go("egg");go("board");form();go("board");go("pan");tick(4100);go("pan");go("counter");
  go("rack");go("rack","guest");assert.equal(go("counter"),"plated:omelet");
  assert.equal(g.s.stations.counter.item,"omelet");assert.equal(go("counter","guest"),"plated:omelet");
  assert.equal(g.s.stations.counter.item,null);
  go("pass");act({type:"use"});act({type:"work"});
  assert.equal(g.s.players.host.hand,"plate");assert.equal(g.s.stations.pass.item,"omelet");assert.equal(countPlates(g.s),3);
  assert.equal(go("bin"),"plate");go("rack");
  assert.equal(go("pass"),"omelet");go("rack");
  const h=g.s.players.host,k=g.s.players.guest,table=g.fixture("a");
  // Simultaneous serve attempts with only one portion on the ticket.
  go("a");assert.equal(g.s.groups.find(v=>v.table==="a").stage,"food");
  g.interact(h,table,"grab");g.interact(k,table,"grab");
  assert.equal(h.hand,null);assert.equal(k.hand,"plated:omelet");assert.equal(g.s.stats.revenue,10);assert.equal(countPlates(g.s),3);
});

test("同一份全熟牛排可从五分熟桌送至全熟桌，错单不动耐心、收入或盘数",()=>{
  const book=structuredClone(catalog);Object.assign(book.levels.first,{menu:["steak"],arrivals:[[0,1],[0,1]]});
  const {g,go,tick}=kitchenShift("corner_diner",book);
  tick(6500);go("a");go("b");go("beef");go("pan");tick(8100);go("pan");go("rack");
  const [medium,well]=g.s.groups;assert.deepEqual([medium.orders[0],well.orders[0]],["steak:medium","steak:well"]);
  const due=medium.due;assert.equal(go("a"),"plated:steakWell");assert.match(g.s.players.host.notice,/熟度不符.*五分熟/);
  assert.equal(medium.due,due);assert.equal(g.s.stats.sold,0);assert.equal(go("b"),null);
  assert.equal(g.s.stats.revenue,18);assert.equal(well.delivered,1);assert.equal(countPlates(g.s),3);
  go("beef");go("pan");g.reset(true,"island_diner");assert.equal(g.s.stations.pan.heat,null);
  assert.equal(g.s.stations.pan.item,null);assert.equal(g.s.players.guest.hand,null);assert.equal(g.s.stats.revenue,0);
});

test("空手、净盘、脏盘误投及两人清理同一锅焦料",()=>{
  const {g,go,act,tick}=kitchenShift();g.addPlayer("guest");
  const rack=g.s.stations.rack;
  assert.equal(go("bin"),null);assert.match(g.s.players.host.notice,/无法取回/);
  go("rack");assert.equal(go("bin"),"plate");go("rack");
  // Set one table up for clearing with one of the three physical plates.
  rack.plates--;g.s.stations.b.dirty=1;go("b");assert.equal(go("bin"),"dirty");go("sink");
  go("rice");go("pot");tick(13100);
  const pot=g.fixture("pot");for(const who of ["host","guest"])act({type:"go",x:pot.x,y:pot.y},who);
  tick(4000);
  assert.deepEqual(Object.values(g.s.players).map(p=>p.hand).sort(),["burntRice",null].sort());
  for(const who of ["host","guest"]){go("bin",who);go("bin",who);}
  assert.ok(Object.values(g.s.players).every(p=>!p.hand));assert.equal(g.s.stations.pot.item,null);assert.equal(countPlates(g.s),3);
});

test("垃圾桶的交互提示与实际丢弃规则一致，搭档空手取不到已丢弃的食物",()=>{
  const {g,go}=kitchenShift();g.addPlayer("guest");
  const bin=g.fixture("bin"),p=g.s.players.host;
  const foods=["rice","nori","cucumber","egg","beef","cooked","cucumberStrips","beatenEgg","omeletLog",
    "onigiri","cucumberRoll","omelet","steakMedium","steakWell","burntRice","burntEgg","burntSteak"];
  for(const food of foods){
    p.hand=food;
    assert.match(verbs(g.s,p,bin,g.book).grab,/丢弃/);
    assert.equal(go("bin"),null,food);assert.equal(go("bin","guest"),null);
    assert.equal(g.s.stations.bin.item,null);
  }
  for(const item of ["plate","dirty","plated:steakWell","pot","pan","unknown"]){
    p.hand=item;
    assert.equal(verbs(g.s,p,bin,g.book).grab,"");
    g.interact(p,bin,"grab");assert.equal(p.hand,item);
  }
});

test("摆位操作面、入口、出生点、通道和双人同时挪动由同一布局判定",()=>{
  const {g,act,open}=rig();g.addPlayer("guest");const f=g.fixture("rack"),from=[f.x,f.y,f.dir].join();
  act({type:"place",id:"rack",from,x:2,y:0,dir:2},"guest");
  act({type:"place",id:"rack",from,x:5,y:5,dir:0});
  open();assert.equal(g.s.phase,"prep");assert.match(g.s.players.host.notice,/盘架.*3 列 1 行/);
  for(const [x,y] of [g.map.entry,g.map.spawns.host,[1,1]]){
    act({type:"place",id:"rack",from:"2,0,2",x,y,dir:0});assert.equal(f.y,0);
  }
  act({type:"place",id:"rack",from:"2,0,2",x:2,y:0,dir:1});
  act({type:"open"},"guest");assert.equal(g.s.phase,"prep");open();assert.equal(g.s.phase,"open");
});
test("三只盘在两桌双人客间循环，截止后接完门外一组、清桌和洗盘可分开",()=>{
  const {g,open,tick,go,dish,act}=rig();
  open();tick(5500);assert.equal(g.s.queue.length,1);
  go("a");go("b");
  const first=g.s.groups[0],deadline=first.due;
  dish();go("a");assert.deepEqual(first.remaining,["onigiri"]);assert.equal(first.due,deadline);
  dish();go("b");assert.equal(g.s.groups[1].remaining.length,1);
  dish();go("a");assert.equal(first.stage,"eat");tick(5000);
  assert.equal(g.s.stations.a.dirty,2);assert.equal(g.s.stations.rack.plates,0);
  go("a");go("sink");go("a");tick();assert.equal(g.s.queue.length,0);assert.equal(g.s.players.host.hand,"dirty");
  go("pass");tick(3500);assert.equal(g.s.stations.rack.plates,0);
  go("sink");tick(3000);go("sink");go("rack");
  go("pass");go("sink");act({type:"work"});tick(3000);go("sink");go("rack");
  assert.equal(g.s.stations.rack.plates,2);go("a");
  dish();go("b");dish();go("a");tick(6000);
  assert.equal(g.s.phase,"won");assert.deepEqual(g.s.stats,{tables:3,sold:5,revenue:60});
  const result=JSON.stringify(g.s);tick(3000);assert.equal(JSON.stringify(g.s),result);
  const old=g.s.run;act({type:"reset"});g.command("host",{type:"open",run:old});
  assert.equal(g.s.phase,"prep");assert.equal(g.s.groups.length,0);assert.equal(g.s.stations.rack.plates,3);
});
test("双人桌部分上菜不续时，拒收错误菜保留物品，失败冻结营业额",()=>{
  const {g,open,tick,go,dish}=rig("duo");open();tick(5000);go("a");
  go("rice");go("a");assert.equal(g.s.players.host.hand,"rice");go("rice");
  const before=g.s.groups[0].due;dish();go("a");assert.equal(g.s.groups[0].due,before);
  tick(before-g.s.now);assert.equal(g.s.phase,"lost");assert.match(g.s.reason,/第 1 组.*等上菜/);
  assert.equal(g.s.stats.revenue,12);
});
test("等位和等接单分别失败，来客时钟前空厅继续、归零时空厅即打烊",()=>{
  for(const [kind,reason] of [["queue","第 3 组在等位"],["order","第 1 组在等接单"]]){
    const b=testBook();b.levels.rush.patience[kind]=2;
    const {g,open,tick}=rig("rush",b);open();tick(8000);
    assert.equal(g.s.phase,"lost");assert.ok(g.s.reason.includes(reason));
  }
  const b=testBook();b.levels.duo.arrivals=[[6,1]];const {g,open,tick}=rig("duo",b);
  open();tick(5900);assert.equal(g.s.phase,"open");tick();assert.equal(g.s.phase,"won");
  assert.equal(g.s.groups.length,0);
});
test("纯配置快锅、双米饭团与换入口移桌地图实际完成一单",()=>{
  assert.equal(catalog.tools.pot.seconds,5);
  const {g,open,tick,go,cook,form,act}=rig("extension");open();tick(100);
  const guest=g.s.groups[0];assert.deepEqual(guest.route[0],[11,0]);assert.deepEqual(guest.route.at(-1),front(g.fixture("a")));
  tick(4000);go("a");assert.deepEqual(guest.remaining,["doubleRice"]);
  go("rice");go("pot");tick(900);assert.equal(g.s.stations.pot.job,"cooked");tick(100);assert.equal(g.s.stations.pot.item,"cooked");
  go("pot");go("board");cook();form();assert.equal(go("board"),"doubleRice");go("rack");
  act({type:"go",x:9,y:1});tick(2000);assert.equal(g.s.players.host.hand,"plated:doubleRice");assert.equal(g.s.stats.sold,0);
  go("a");tick(5000);assert.equal(g.s.phase,"won");assert.equal(g.s.stats.revenue,19);
});
test("同一传菜台物品只有一人取得，离开时手持物可取回",()=>{
  const {g,open,tick,go,act}=rig();g.addPlayer("guest");open();
  go("rack");go("pass");const f=g.fixture("pass");
  for(const id of ["host","guest"])act({type:"go",x:f.x,y:f.y},id);
  tick(1000);const hands=Object.values(g.s.players).map(p=>p.hand);
  assert.equal(hands.filter(x=>x==="plate").length,1);
  if(g.s.players.host.hand){go("pass");go("pass","guest");}
  g.removeGuest();assert.deepEqual(g.s.returns,["plate"]);assert.equal(go("rack"),"plate");
  assert.equal(countPlates(g.s),3);
});

test("按住方向持续移动、斜向等速、松开停止、碰撞后仍可面向工位操作",()=>{
  const {g,open,act}=rig();const p=g.s.players.host;
  act({type:"drive",x:1,y:-1});g.advance(100);
  assert.ok(Math.abs(Math.hypot(p.x-3,p.y-3)-.625)<1e-8);assert.equal(g.s.now,0);
  act({type:"drive",x:-1,y:1});g.advance(100);
  open();act({type:"drive",x:0,y:-1});g.advance(2000);
  assert.ok(p.y>1.5 && p.y<2);assert.equal(p.dir,2);
  act({type:"drive",x:0,y:0});const y=p.y;g.advance(200);assert.equal(p.y,y);
  act({type:"use"});assert.equal(p.hand,"nori");
  act({type:"go",x:6,y:3});g.advance(1500);assert.equal(g.s.stations.pass.item,"nori");
});

test("拿放和工作在原地独立执行，错误操作面不寻路，两人桌保留第一盘",()=>{
  const {g,open,tick,act,dish,go}=rig("duo");open();tick(5000);
  const p=g.s.players.host,table=g.fixture("a"),group=g.s.groups[0];
  Object.assign(p,{x:table.x+1,y:table.y,dir:1});
  act({type:"work"});assert.equal(p.path.length,0);assert.equal(group.stage,"order");
  Object.assign(p,{x:table.x-1,dir:3,hand:"rice"});
  act({type:"use"});assert.equal(group.stage,"order");assert.equal(p.hand,"rice");
  act({type:"work"});assert.equal(group.stage,"food");assert.equal(p.hand,"rice");
  go("rice");dish();go("a");assert.deepEqual(group.served,["onigiri"]);
  assert.deepEqual(group.remaining,["onigiri"]);
  Object.assign(p,{x:2,y:0,dir:0,hand:"rice"});act({type:"use"});
  assert.equal(p.hand,null);assert.equal(p.path.length,0);assert.deepEqual([p.x,p.y],[2,0]);
});

test("搭档在等待快照时用同一移动速度和碰撞预测，手持和房主位置独立",()=>{
  const {g}=rig();g.addPlayer("guest");
  const authoritative=g.s.players.guest,pose={...authoritative};
  g.predict(pose,0,-1,80);assert.equal(pose.y,authoritative.y-.5);
  assert.deepEqual([authoritative.x,authoritative.y,authoritative.hand],[7,3,null]);
  Object.assign(pose,{x:3,y:2,hand:"plate"});g.predict(pose,0,-1,150);
  assert.ok(g.fits(pose.x,pose.y));assert.ok(pose.y>1.5);
  assert.equal(pose.hand,"plate");assert.equal(g.s.stations.nori.item,null);
});

test("四盘水池在第五只时保留手持，点一次连续刷，两人同刷同取守恒",()=>{
  const book=testBook();book.levels.rush.plates=5;
  const {g,open,act,tick}=rig("rush",book);g.addPlayer("guest");open();
  const {host,guest}=g.s.players,{sink,rack}=g.s.stations;
  Object.assign(host,{x:4,y:4,dir:0});Object.assign(guest,{x:3,y:5,dir:3});
  for(let i=0;i<5;i++){rack.plates--;host.hand="dirty";act({type:"use"});}
  assert.equal(host.hand,"dirty");assert.match(host.notice,/已满/);assert.equal(sink.dirty,4);
  tick(3500);assert.equal(sink.washed,0);
  act({type:"work"});act({type:"release"});tick(1000);assert.equal(sink.washed,1000);
  act({type:"drive",x:0,y:-1});tick(200);act({type:"drive",x:0,y:0});
  const partial=sink.washed;tick(3500);assert.equal(sink.washed,partial);
  assert.equal(host.scrub,null);
  Object.assign(host,{x:4,y:4,dir:0});tick(500);assert.equal(sink.washed,partial);
  act({type:"work"},"guest");act({type:"work"});tick(3000);
  assert.equal(sink.clean,1);assert.equal(sink.dirty,3);assert.equal(sink.washed,partial);
  act({type:"use"});assert.equal(host.hand,null);assert.equal(sink.dirty,4);
  act({type:"use"},"guest");act({type:"use"});assert.equal(guest.hand,"plate");assert.equal(host.hand,null);
  act({type:"stop"},"guest");tick(12000);
  assert.deepEqual([sink.dirty,sink.clean,sink.washed,host.scrub],[0,4,0,null]);
  act({type:"use"});act({type:"use"});assert.equal(host.hand,"plate");assert.equal(sink.clean,3);
  assert.equal(rack.plates,0);assert.equal(countPlates(g.s),5);
});

test("捏制在配齐后才可开始，松开暂停，完成后仍须取走",()=>{
  const {g,open,act,tick,go,cook}=rig();open();cook();go("nori");go("board");
  const board=g.s.stations.board;
  tick(2000);assert.equal(board.pending,"onigiri");assert.equal(board.formed,0);
  act({type:"work"});tick(200);act({type:"release"});tick(1000);assert.equal(board.formed,200);
  act({type:"work"});tick(300);assert.equal(board.item,"onigiri");assert.equal(g.s.players.host.hand,null);
  assert.equal(go("board"),"onigiri");
});

test("练习每次一组，超时可继续，退出恢复摆位和正式库存，隔离过期指令",()=>{
  const {g,act,tick,go,dish}=rig("duo");
  act({type:"place",id:"sink",from:"4,5,2",x:5,y:5,dir:2});g.addPlayer("guest");
  act({type:"practice"},"guest");assert.equal(g.s.phase,"prep");
  act({type:"practice"});const run=g.s.run;assert.equal(g.s.stations.rack.plates,4);
  tick(5000);go("a");dish();go("a");assert.equal(g.s.stats.revenue,12);
  tick(120000);assert.equal(g.s.phase,"open");assert.equal(g.s.groups.length,1);
  assert.equal(g.s.stations.a.dirty,1);
  act({type:"endPractice"},"guest");assert.equal(g.s.practice,true);
  act({type:"endPractice"});assert.equal(g.s.phase,"prep");assert.equal(g.s.practice,false);
  assert.deepEqual([g.fixture("sink").x,g.s.stations.rack.plates,g.s.stats.revenue,g.s.groups.length],[5,3,0,0]);
  g.command("host",{run,type:"open"});assert.equal(g.s.phase,"prep");
  act({type:"open"});assert.equal(g.s.phase,"open");assert.equal(countPlates(g.s),3);
});
