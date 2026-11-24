import { strict as assert } from "node:assert";
import { test } from "node:test";
import Matter from "matter-js";
import { cargo, handleAt, idle, MoveWorld, REST_TICKS } from "../shared/moving";

test("同一端只能由一人占用，断线后可重新抓住", () => {
  const w=new MoveWorld(); w.add("甲");w.add("乙");
  Matter.Body.setPosition(w.movers.get("乙")!.body,{x:137,y:190});
  w.action("甲","grab");w.action("乙","grab");
  assert.deepEqual(w.snapshot().people.map(p=>p.end),[0,-1]);
  w.remove("甲");w.action("乙","grab");
  assert.equal(w.snapshot().people[0].end,0);
});

test("半入厢、尚未松手、尚未放稳均不能签收，重开恢复初始状态",()=>{
  const w=new MoveWorld();w.add("甲");w.action("甲","use");
  const settle=(n:number)=>{for(let i=0;i<n;i++)w.step();};
  Matter.Body.setPosition(w.sofa,{x:cargo.x+cargo.w/2,y:cargo.y});
  settle(80);assert.equal(w.inside,2);assert.equal(w.signed.sofa,false);
  Matter.Body.setPosition(w.sofa,{x:cargo.x+cargo.w/2,y:cargo.y+80});
  const end=handleAt(w.snapshot().sofa,0);
  Matter.Body.setPosition(w.movers.get("甲")!.body,{x:end.x-10,y:end.y});
  w.action("甲","grab");settle(80);assert.equal(w.inside,4);assert.equal(w.signed.sofa,false);
  w.action("甲","grab");settle(REST_TICKS-1);assert.equal(w.signed.sofa,false);
  settle(3);assert.equal(w.signed.sofa,true);
  w.action("甲","grab");settle(120);assert.equal(w.snapshot().count,1);
  const next=w.restart();assert.equal(next.round,2);assert.equal(next.snapshot().count,0);
  assert.equal(next.board,-1);assert.deepEqual(next.snapshot().people,[{id:"甲",slot:0,end:-1,held:null,x:139,y:188}]);
});

test("滑板改善单人拖行和转向，双人绕固定一端可转动沙发",()=>{
  function drag(board:boolean){
    const w=new MoveWorld();w.add("甲");
    if(board)w.action("甲","use");w.action("甲","grab");
    w.input("甲",{x:-1,y:0,turn:0});for(let i=0;i<28;i++)w.step();
    const distance=222-w.sofa.position.x;
    w.input("甲",{x:0,y:0,turn:1});for(let i=0;i<16;i++)w.step();
    return {distance,angle:Math.abs(w.sofa.angle)};
  }
  const withBoard=drag(true), without=drag(false);
  assert.ok(withBoard.distance>without.distance);assert.ok(withBoard.angle>without.angle);
  const w=new MoveWorld();w.add("甲");w.add("乙");w.action("甲","grab");w.action("乙","grab");
  w.input("甲",idle());w.input("乙",{x:0,y:1,turn:0});for(let i=0;i<23;i++)w.step();
  assert.ok(w.sofa.angle>0.2);w.action("乙","grab");assert.equal(w.snapshot().people[0].end,0);
});

test("三件共用车厢，载书推车可单人卸下再放稳",()=>{
  const w=new MoveWorld(1,"wet");w.add("甲");
  const person=w.movers.get("甲")!.body;
  const place=(b:Matter.Body,x:number,y:number)=>Matter.Body.setPosition(b,{x,y});
  const step=(n:number)=>{for(let i=0;i<n;i++)w.step();};
  place(w.cart,290,283);place(person,290,283);
  w.action("甲","grab");w.action("甲","use");w.action("甲","use");w.action("甲","grab");
  assert.equal(w.books,"cart");assert.equal(w.tape,1);
  place(w.sofa,535,545);Matter.Body.setAngle(w.sofa,Math.PI/2);
  place(w.plant,615,600);place(w.cart,670,505);place(person,670,505);
  step(60);assert.equal(w.snapshot().count,3);
  w.action("甲","grab");step(2);assert.equal(w.snapshot().count,3);
  w.input("甲",{x:0,y:-1,turn:0});step(48);assert.equal(w.snapshot().count,2);
  w.input("甲",{x:0,y:1,turn:0});step(50);assert.equal(w.snapshot().count,2);
  w.input("甲",idle());w.action("甲","grab");step(60);assert.equal(w.snapshot().count,3);
  const fresh=w.restart().snapshot();assert.equal(fresh.books,"wet");assert.equal(fresh.count,0);
  assert.equal(fresh.tape,1);assert.equal(fresh.people[0].held,null);
});

test("盆栽起步和普通转弯可以保土，连续急转会掉土，扶稳后可签收",()=>{
  const w=new MoveWorld();w.add("甲");
  const body=w.movers.get("甲")!.body;
  Matter.Body.setPosition(body,w.plant.position);w.action("甲","grab");
  const walk=(x:number,y:number,turn:number,n:number)=>{
    w.input("甲",{x,y,turn});for(let i=0;i<n;i++)w.step();
  };
  walk(1,0,0,12);walk(0,1,0,12);assert.equal(w.spilled,false);
  walk(0,-1,0,10);assert.equal(w.spilled,true);
  walk(0,0,1,60);assert.ok(w.tilt<.28);
  w.action("甲","grab");Matter.Body.setPosition(w.plant,{x:660,y:560});
  walk(0,0,0,60);assert.equal(w.signed.plant,true);
  assert.equal(w.restart().spilled,false);
});

test("书的签收跟随唯一载体，空箱与锁住的空推车均不算一份书",()=>{
  const w=new MoveWorld(1,"wet");w.add("甲");w.add("乙");
  Matter.Body.setPosition(w.cart,{x:287,y:283});
  const a=w.movers.get("甲")!.body, b=w.movers.get("乙")!.body;
  Matter.Body.setPosition(a,w.cart.position);Matter.Body.setPosition(b,w.box.position);
  w.action("甲","grab");w.action("甲","use");w.action("乙","use");w.action("甲","use");
  assert.equal(w.books,"cart");assert.equal(w.tape,1);
  w.action("甲","grab");
  Matter.Body.setPosition(w.box,{x:675,y:560});
  for(let i=0;i<65;i++)w.step();
  assert.equal(w.signed.books,false);
  const next=w.restart();
  Matter.Body.setPosition(next.movers.get("乙")!.body,next.box.position);
  next.action("乙","use");next.action("乙","use");
  Matter.Body.setPosition(next.cart,{x:675,y:560});
  for(let i=0;i<65;i++)next.step();
  assert.equal(next.books,"taped");assert.equal(next.tape,0);assert.equal(next.signed.books,false);
});
