import {test} from "node:test";
import {strict as assert} from "node:assert";
import Matter from "matter-js";
import {Campaign,quote,type Command} from "../shared/campaign";
import {freightCatalog,placements,type Preset} from "../shared/catalog";
import {cargo,type Item} from "../shared/moving";

import {products} from "../shared/equipment";

const origin=10000;
function cmd(g:Campaign,type:Command["type"],time=origin,extra:Partial<Command>={}){
  return g.command("p",{token:g.token,op:crypto.randomUUID(),type,...extra},time);
}
function game(preset:Preset="short"){
  const g=new Campaign(preset);g.world.add("p");cmd(g,"new");cmd(g,"start");return g;
}
function place(g:Campaign,item:Item,x:number,y:number){
  const b=g.world.bodyFor(item);
  Matter.Body.setPosition(b,{x,y});Matter.Body.setVelocity(b,{x:0,y:0});
  Matter.Body.setAngle(b,0);Matter.Body.setAngularVelocity(b,0);
}
function park(g:Campaign){
  place(g,"sofa",574,605);place(g,"box",651,519);place(g,"plant",507,510);
  Matter.Body.setPosition(g.world.movers.get("p")!.body,{x:600,y:434});
}
test("逐实例账单、重复装卸、盆栽扣款和镜子品相",()=>{
  const g=game();park(g);
  const bill=()=>quote(g.world.snapshot(),g.terms);
  g.advance(origin+600);assert.equal(bill().net,20);
  g.world.spilled=true;assert.equal(bill().net,-5);
  place(g,"extra:lamp-1",598,511);g.advance(origin+1200);assert.equal(bill().actual,115);
  place(g,"extra:lamp-1",610,390);g.advance(origin+1250);assert.equal(bill().actual,95);
  place(g,"extra:lamp-1",598,511);g.advance(origin+1900);assert.equal(bill().actual,115);
  place(g,"extra:table-1",535,465);place(g,"extra:table-2",628,466);g.advance(origin+2500);
  assert.equal(bill().net,39);assert.equal(g.state.wallet,0);
  const mirror=g.world.extras.get("extra:mirror-1")!;
  place(g,"extra:mirror-1",80,194);Matter.Body.setVelocity(mirror.body,{x:-8,y:0});
  g.advance(origin+2900);assert.equal(mirror.damaged,true);
  mirror.signed=true;const result=bill();assert.equal(result.lines.find(x=>x.id===mirror.id)?.price,15);assert.equal(result.damage,25);
});
test("到点时先走最后一帧，可盈利、打平、缺件或亏损",()=>{
  for(const [preset,late,phase,net] of [
    ["short",0,"shop",20],["even",0,"shop",0],["short",1,"missing",0],
  ] as const){
    const g=game(preset),deadline=g.state.deadline;
    // Leave precisely 33 eligible physics ticks, or 32 for the late case.
    g.advance(deadline-550+late*17);park(g);
    const token=g.token;
    g.command("p",{type:"close",op:"at-cutoff",token},deadline);
    assert.equal(g.state.phase,phase);assert.equal(g.state.wallet,net);assert.equal(g.state.receipt?.reason,"deadline");
    g.advance(deadline+90000);assert.equal(g.state.posted.length,phase==="shop"?1:0);
  }
  const held=game();park(held);Matter.Body.setPosition(held.world.movers.get("p")!.body,held.world.box.position);
  held.act("p","grab",origin);held.advance(held.state.deadline);assert.ok(held.state.receipt?.missing.includes("books"));
});
test("未交齐和亏损提示、回执恢复、相反选择只能提交一次",()=>{
  const g=game();park(g);assert.match(cmd(g,"close"),/还缺/);
  g.world.spilled=true;g.advance(origin+600);assert.equal(cmd(g,"close",origin+600),"确认关门");
  g.advance(g.state.deadline);assert.equal(g.state.phase,"loss");assert.equal(g.state.wallet,0);
  for(const choice of ["accept","retry"] as const){
    const h=Campaign.restore(g.save()),token=h.token;
    cmd(h,choice,h.state.deadline);
    cmd(h,choice==="retry"?"accept":"retry",h.state.deadline,{token});
    assert.equal(h.state.wallet,choice==="accept"?-5:0);
    assert.equal(h.state.phase,choice==="accept"?"shop":"brief");
    if(choice==="accept"){cmd(h,"next");assert.equal(h.state.level,1);}
    else {assert.equal(h.state.level,0);assert.equal(h.world.spilled,false);assert.equal(h.state.start,0);}
    assert.equal(Campaign.restore(h.save()).state.wallet,h.state.wallet);
  }
  const final=game();park(final);place(final,"extra:lamp-1",598,511);
  final.advance(origin+700);cmd(final,"close",origin+700);cmd(final,"buy",origin+700,{product:"van"});
  cmd(final,"next",origin+700);cmd(final,"start",origin+800);park(final);final.world.spilled=true;
  final.advance(final.state.deadline);assert.equal(final.state.phase,"loss");
  const replay=Campaign.restore(final.save());cmd(replay,"retry");
  assert.equal(replay.state.level,1);assert.equal(replay.state.wallet,0);assert.equal(replay.state.stock.van,1);
  assert.equal(replay.world.width,322);assert.equal(replay.world.spilled,false);
  cmd(final,"accept");assert.equal(final.state.phase,"end");assert.equal(final.state.wallet,-5);
  assert.equal(final.view(origin).profit,35);
});
test("刷新在场订单保留物品、品相、在手货与截止，恢复后补算至到点",()=>{
  const g=game("rain");park(g);g.world.spilled=true;
  const player=g.world.movers.get("p")!;
  Matter.Body.setPosition(player.body,g.world.box.position);g.act("p","grab",origin);
  g.advance(origin+800);const saved=g.save(),h=Campaign.restore(saved);
  assert.equal(h.state.deadline,g.state.deadline);assert.equal(h.world.snapshot().people[0].held,"box");
  assert.deepEqual(h.world.signed,g.world.signed);assert.equal(h.world.spilled,true);
  h.advance(g.state.deadline+1000);assert.equal(h.state.phase,"missing");
  assert.equal(h.state.receipt?.reason,"deadline");
});
test("同样摆位仅宽车能签收最外侧落地灯，原已签收货在手也能到点交付",()=>{
  for(const wide of [false,true]){
    const g=game();
    // Earn 40 in the first order and use exactly the same loading positions in the second.
    park(g);place(g,"extra:lamp-1",598,511);g.advance(origin+700);cmd(g,"close",origin+700);
    if(wide)cmd(g,"buy",origin+700,{product:"van"});
    cmd(g,"next",origin+700);cmd(g,"start",origin+900);
    park(g);place(g,"extra:lamp-1",759,541);g.advance(origin+1700);
    assert.equal(g.world.snapshot().extras.find(e=>e.kind==="lamp")?.signed,wide);
    Matter.Body.setPosition(g.world.movers.get("p")!.body,g.world.box.position);
    g.act("p","grab",origin+1700);assert.equal(g.world.snapshot().people[0].held,"box");
    g.advance(g.state.deadline);
    assert.deepEqual(g.state.receipt?.missing,[]);
    assert.equal(g.state.receipt?.net,wide?40:20);
  }
});
test("相同雨时下的屋檐、防雨布、湿书转车与占位",()=>{
  for(const way of ["awning","tarp","transfer"]){
    const g=game("rain");
    const box=g.world.box;
    if(way==="awning")place(g,"box",135,430);
    if(way==="tarp"){
      g.world.options.tarp=true;
      Matter.Body.setPosition(g.world.movers.get("p")!.body,box.position);g.act("p","use",origin);
    }
    g.advance(origin+g.terms.rainAt!+100);
    assert.equal(g.world.books,way==="transfer"?"wet":"dry");
    if(way==="transfer"){
      place(g,"cart",335,464);Matter.Body.setPosition(g.world.movers.get("p")!.body,g.world.cart.position);
      g.act("p","grab",origin+35000);g.act("p","use",origin+35000);g.act("p","grab",origin+35000);
      assert.equal(g.world.books,"cart");assert.equal(g.world.tape,1);
      place(g,"cart",610,520);g.advance(origin+36000);assert.equal(g.world.signed.books,true);
      place(g,"extra:table-1",610,520);g.advance(origin+37000);
      const table=g.world.bodyFor("extra:table-1");assert.ok(Math.abs(table.position.y-520)>20);
    }
  }
});
test("纯配置货物与车辆、重复采购、存档装备、下一关扩容和新局重置",()=>{
  freightCatalog.stool={name:"测试折椅",w:22,h:20,price:8,art:"table",risk:"轻便"};
  placements.push({id:"chair-test",kind:"stool",x:191,y:335});
  products.testVan={name:"试验车型",price:21,limit:1,effect:"vehicle",width:350};
  try{
    const g=game();park(g);place(g,"extra:chair-test",570,470);g.advance(origin+700);cmd(g,"close",origin+700);
    assert.equal(g.state.wallet,28);
    assert.equal(cmd(g,"buy",origin+700,{product:"van"}),"余额不足");
    cmd(g,"buy",origin+700,{product:"testVan",op:"one"});cmd(g,"buy",origin+700,{product:"testVan",op:"one"});
    assert.equal(cmd(g,"buy",origin+700,{product:"testVan"}),"已达持有上限");assert.equal(g.state.wallet,7);
    cmd(g,"equip",origin+700,{product:""});cmd(g,"equip",origin+700,{product:"testVan"});
    const h=Campaign.restore(g.save());cmd(h,"next");assert.equal(h.world.width,350);
    assert.equal(h.world.zone.bounds.max.x,cargo.x+350);
    cmd(h,"start");park(h);h.advance(h.state.deadline);assert.equal(h.state.phase,"end");
    cmd(h,"new");assert.equal(h.state.wallet,0);assert.deepEqual(h.state.stock,{});assert.equal(h.state.level,0);
  }finally{placements.pop();delete products.testVan;delete freightCatalog.stool;}
});
