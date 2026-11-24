import Matter from "matter-js";
import { freightCatalog, type Placement } from "./catalog";

const { Engine, Bodies, Body, Composite, Constraint, Vector, Bounds } = Matter;
export const STEP = 1000 / 60;
export const WIDTH = 920, HEIGHT = 710;
export const LENGTH = 148, DEPTH = 52;
export const GRIP = 70, REACH = 38, REST_TICKS = 33;
export const cargo = { x: 477, y: 447, w: 262, h: 200 };
export const houseWalls = [
  [30,50,661,9], [30,50,9,340], [30,381,18,9], [220,381,203,9],
  [414,55,9,86], [414,235,9,150], [682,55,9,240],
  [417,286,95,9], [608,286,83,9],
];
export function truckRails(width:number) {
  return [[469,445,9,207],[cargo.x+width-1,445,9,207],[469,644,width+16,8]];
}
export const awning = { x:58,y:392,w:156,h:68 };
export function sheltered(p:Point,width:number) {
  return (p.x>=38 && p.x<=414 && p.y>=56 && p.y<=381)
    || (p.x>=416 && p.x<=684 && p.y>=56 && p.y<=287)
    || (p.x>=awning.x && p.x<=awning.x+awning.w && p.y>=awning.y && p.y<=awning.y+awning.h)
    || (p.x>=cargo.x && p.x<=cargo.x+width && p.y>=cargo.y && p.y<=cargo.y+cargo.h);
}
export type Point = { x: number; y: number };
export type Pose = Point & { angle: number };
export type Controls = { x: number; y: number; turn: number };
export type Action = "grab" | "use";
export type BaseItem = "sofa" | "box" | "plant" | "cart";
export type ExtraId = `extra:${string}`;
export type Item = BaseItem | ExtraId;
export type Freight = "sofa" | "books" | "plant";
export const manifest: Freight[] = ["sofa", "books", "plant"];
export const names = { sofa: "长沙发", box: "书箱", plant: "盆栽", cart: "推车" };
export type Scenario = "dry" | "wet";
export type Person = Point & { id: string; slot: number; end: number; held: Item | null };
export type Snapshot = Record<BaseItem, Pose> & {
  extras:ExtraState[]; width:number; covered:boolean;
  people: Person[]; board: number; inside: number; round: number;
  signed: Record<Freight, boolean>; count: number; scenario: Scenario;
  books: "dry" | "wet" | "taped" | "cart"; tape: number;
  tilt: number; spilled: boolean;
};
export type ExtraState = Pose & {id:ExtraId;kind:string;signed:boolean;damaged:boolean};
type Extra = {id:ExtraId;kind:string;body:Matter.Body;signed:boolean;damaged:boolean;rest:number};
export type WorldOptions = {width?:number; extras?:Placement[]; outdoorBooks?:boolean; tarp?:boolean};
export function itemName(f:Snapshot,item:Item) {
  const extra=f.extras.find(e=>e.id===item);
  return extra ? freightCatalog[extra.kind].name : names[item as BaseItem];
}
export const idle = (): Controls => ({ x: 0, y: 0, turn: 0 });
export function handleAt(sofa: Pose, end: number): Point {
  const offset = end === 0 ? -GRIP : GRIP;
  return { x: sofa.x + offset*Math.cos(sofa.angle), y: sofa.y + offset*Math.sin(sofa.angle) };
}
const distance = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
type Target = { item: Item; point: Point; end: number };
export function targetAt(f: Snapshot, p: Point): Target | undefined {
  const targets: Target[] = [0,1].map(end => ({item:"sofa", end, point:handleAt(f.sofa,end)}));
  for (const item of ["box","plant","cart"] as const) targets.push({item,end:-1,point:f[item]});
  for(const e of f.extras)targets.push({item:e.id,end:-1,point:e});
  return targets.filter(t=>distance(t.point,p)<=REACH).sort((a,b)=>distance(a.point,p)-distance(b.point,p))[0];
}
export function canTransfer(f: Snapshot) { return f.books==="wet" && distance(f.box,f.cart)<=84; }
const pose = (b: Matter.Body): Pose => ({...b.position,angle:b.angle});
type Mover = { body: Matter.Body; slot: number; end: number; held: Item | null; controls: Controls; tether?: Matter.Constraint };
const freightFilter = { category: 2, mask: 1 | 2 | 8 };
function smallItem(x:number,y:number,w:number,h:number,mass:number) {
  const body=Bodies.rectangle(x,y,w,h,{frictionAir:.23,friction:0,collisionFilter:freightFilter});
  Body.setMass(body,mass);
  Body.setInertia(body,Infinity);
  return body;
}
export class MoveWorld {
  readonly engine = Engine.create({ gravity:{x:0,y:0}, positionIterations:8, constraintIterations:4 });
  readonly sofa = Bodies.rectangle(222,188,LENGTH,DEPTH,{frictionAir:.16,friction:.02,collisionFilter:freightFilter});
  readonly box = smallItem(225,283,34,30,1.2);
  readonly plant = smallItem(355,122,30,32,1.4);
  readonly cart = smallItem(300,328,88,42,3.2);
  readonly zone:Matter.Body;
  readonly extras=new Map<Item,Extra>();
  readonly width:number;
  covered=false;
  readonly movers = new Map<string,Mover>();
  signed = { sofa:false, books:false, plant:false };
  private rest = { sofa:0, books:0, plant:0 };
  inside=0;
  board=-1;
  books: Snapshot["books"];
  tape=1;
  tilt=0;
  spilled=false;
  private plantGripTicks=0;
  constructor(public round=1,public scenario:Scenario="dry",readonly options:WorldOptions={}) {
    this.books=scenario;
    this.width=options.width??cargo.w;
    this.zone=Bodies.rectangle(cargo.x+this.width/2,cargo.y+cargo.h/2,this.width,cargo.h,
      {isStatic:true,isSensor:true,collisionFilter:{category:8,mask:2}});
    if(options.outdoorBooks)Body.setPosition(this.box,{x:272,y:464});
    for(const placement of options.extras??[]){
      const spec=freightCatalog[placement.kind];
      const id:ExtraId=`extra:${placement.id}`;
      const body=Bodies.rectangle(placement.x,placement.y,spec.w,spec.h,
        {frictionAir:.21,friction:0,collisionFilter:freightFilter});
      Body.setMass(body,2);
      this.extras.set(id,{id,kind:placement.kind,body,rest:0,signed:false,damaged:false});
      Composite.add(this.engine.world,body);
    }
    Matter.Events.on(this.engine,"collisionStart",event=>{
      for(const {bodyA,bodyB} of event.pairs){
        if(bodyA.isSensor || bodyB.isSensor)continue;
        for(const e of this.extras.values()){
          if(e.body!==bodyA && e.body!==bodyB)continue;
          const spec=freightCatalog[e.kind];
          if(spec.impact && distance(bodyA.velocity,bodyB.velocity)+Math.abs(e.body.angularVelocity)*spec.h/2>=spec.impact)e.damaged=true;
        }
      }
    });
    const edges=[[-10,-10,WIDTH+20,10],[-10,HEIGHT,WIDTH+20,10],[-10,0,10,HEIGHT],[WIDTH,0,10,HEIGHT]];
    const barriers=[...houseWalls,...truckRails(this.width),...edges].map(([x,y,w,h])=>Bodies.rectangle(x+w/2,y+h/2,w,h,
      {isStatic:true,friction:0,collisionFilter:{category:1}}));
    Composite.add(this.engine.world,[...barriers,this.sofa,this.box,this.plant,this.cart,this.zone]);
    Body.setMass(this.sofa,5);
    Body.setStatic(this.cart,true);
  }
  add(id:string) {
    if(this.movers.has(id)||this.movers.size===2)return;
    const slot=[...this.movers.values()].some(p=>p.slot===0)?1:0;
    const body=Bodies.circle(slot===0?139:305,188,12,{frictionAir:.04,friction:0,collisionFilter:{category:4,mask:1}});
    Body.setMass(body,8);
    Body.setInertia(body,Infinity);
    this.movers.set(id,{body,slot,end:-1,held:null,controls:idle()});
    Composite.add(this.engine.world,body);
  }
  private release(p:Mover) {
    if(p.tether)Composite.remove(this.engine.world,p.tether);
    if(p.held==="cart"){
      Body.setVelocity(this.cart,{x:0,y:0});
      Body.setStatic(this.cart,true);
    }
    p.tether=undefined;
    p.end=-1;
    p.held=null;
  }
  remove(id:string) {
    const p=this.movers.get(id);
    if(!p)return;
    this.release(p);
    Composite.remove(this.engine.world,p.body);
    this.movers.delete(id);
  }
  input(id:string,v:Controls){const p=this.movers.get(id);if(p)p.controls=v;}
  bodyFor(item:Item):Matter.Body {
    return this.extras.get(item)?.body ?? this[item as BaseItem];
  }
  rain() {
    if(this.books!=="dry" || this.covered || sheltered(this.box.position,this.width))return;
    for(const p of this.movers.values())if(p.held==="box")this.release(p);
    this.books="wet";
  }
  action(id:string,action:Action) {
    const p=this.movers.get(id);
    if(!p)return;
    if(action==="grab" && p.held){this.release(p);return;}
    const frame=this.snapshot();
    if(p.held==="cart" && action==="use" && canTransfer(frame)){
      this.books="cart";
      this.rest.books=0;
      return;
    }
    if(p.held)return;
    const t=targetAt(frame,p.body.position);
    if(!t || frame.people.some(m=>m.held===t.item && m.end===t.end))return;
    if(action==="use"){
      if(t.item==="sofa" && this.board<0)this.board=t.end;
      if(t.item==="box" && this.books==="dry" && this.options.tarp)this.covered=true;
      if(t.item==="box" && this.books==="wet" && this.tape>0){this.tape--;this.books="taped";}
      return;
    }
    if(t.item==="box" && this.books==="wet")return;
    this.attach(p,t);
  }
  private attach(p:Mover,t:Target) {
    const body=this.bodyFor(t.item);
    if(t.item==="cart")Body.setStatic(body,false);
    if(t.item==="plant")this.plantGripTicks=0;
    p.held=t.item;
    p.end=t.end;
    p.tether=Constraint.create({bodyA:p.body,bodyB:body,pointB:Vector.sub(t.point,body.position),
      length:t.item==="sofa"?10:0,stiffness:.65,damping:.22});
    Composite.add(this.engine.world,p.tether);
  }
  private checkDelivery(freight:Freight,item:Item) {
    const b=this.bodyFor(item);
    const corners=b.vertices.filter(v=>Bounds.contains(this.zone.bounds,v)).length;
    if(freight==="sofa")this.inside=corners;
    if(corners!==b.vertices.length || (freight==="books" && this.books==="wet")){
      this.signed[freight]=false;
      this.rest[freight]=0;
      return;
    }
    if(this.signed[freight])return;
    const free=![...this.movers.values()].some(p=>p.held===item);
    const stable=free && b.speed<.15 && b.angularSpeed<.003 && (item!=="plant" || this.tilt<.28);
    this.rest[freight]=stable?this.rest[freight]+1:0;
    if(this.rest[freight]>=REST_TICKS)this.signed[freight]=true;
  }
  step() {
    const movers=[...this.movers.values()];
    const grips=movers.filter(p=>p.held==="sofa").length;
    this.sofa.frictionAir = grips === 0 ? 0.20 : this.board >= 0 ? 0.06 : 0.16;
    const plantVelocity={...this.plant.velocity};
    for(const p of movers){
      const {x,y,turn}=p.controls;
      let speed=3.6;
      if(p.held==="sofa")speed=grips===2?2.95:this.board>=0?2.8:1.65;
      if(p.held==="cart")speed=2.9;
      if(p.held==="plant" && turn)speed=1.5;
      const scale=speed/Math.max(1,Math.hypot(x,y));
      Body.setVelocity(p.body,{x:x*scale,y:y*scale});
      if(p.held && this.extras.has(p.held) && turn)Body.setAngularVelocity(this.bodyFor(p.held),turn*.035);
      if(p.held==="sofa" && turn){
        const assist = this.board >= 0 || grips === 2 ? 0.014 : 0.008;
        Body.setAngularVelocity(this.sofa,Math.max(-.065,Math.min(.065,this.sofa.angularVelocity+turn*assist)));
      }
    }
    Engine.update(this.engine,STEP);
    // Pot sway is driven by changes in translation. Q/E braces it while walking.
    const carrier=movers.find(p=>p.held==="plant");
    const acceleration=distance(plantVelocity,this.plant.velocity);
    const sway = carrier && ++this.plantGripTicks>6 ? acceleration * (carrier.controls.turn ? 0.06 : 0.23) : 0;
    this.tilt=Math.min(1.4,this.tilt*.91 + sway);
    if(this.tilt>1.27)this.spilled=true;
    this.checkDelivery("sofa","sofa");
    this.checkDelivery("books",this.books==="cart"?"cart":"box");
    this.checkDelivery("plant","plant");
    for(const e of this.extras.values()){
      if(!e.body.vertices.every(v=>Bounds.contains(this.zone.bounds,v))){e.signed=false;e.rest=0;}
      else if(!e.signed){
        const free=!movers.some(p=>p.held===e.id);
        e.rest=free && e.body.speed<.15 && e.body.angularSpeed<.003 ? e.rest+1 : 0;
        if(e.rest>=REST_TICKS)e.signed=true;
      }
    }
  }
  snapshot():Snapshot {
    return {sofa:pose(this.sofa),box:pose(this.box),plant:pose(this.plant),cart:pose(this.cart),
      width:this.width,covered:this.covered,
      extras:[...this.extras.values()].map(e=>({id:e.id,kind:e.kind,signed:e.signed,damaged:e.damaged,...pose(e.body)})),
      people:[...this.movers].map(([id,p])=>({id,slot:p.slot,held:p.held,end:p.end,...p.body.position})),
      signed:{...this.signed},count:manifest.filter(k=>this.signed[k]).length, board:this.board, inside:this.inside,
      round:this.round, scenario:this.scenario,books:this.books,tape:this.tape,tilt:this.tilt,spilled:this.spilled};
  }
  save() {
    const motions:Record<string,{v:Point;spin:number;rest?:number}>={};
    for(const key of ["sofa","plant","box","cart",...this.extras.keys()] as Item[]){
      const body=this.bodyFor(key);
      motions[key]={v:{...body.velocity},spin:body.angularVelocity,rest:this.extras.get(key)?.rest};
    }
    return {frame:this.snapshot(),plantGripTicks:this.plantGripTicks,rest:{...this.rest},motions};
  }
  restore(saved:ReturnType<MoveWorld["save"]>) {
    const f=saved.frame;
    this.board=f.board;this.books=f.books;this.tape=f.tape;this.covered=f.covered;
    this.spilled=f.spilled;this.tilt=f.tilt;this.inside=f.inside;this.signed={...f.signed};this.rest={...saved.rest};
    for(const e of f.extras){
      const local=this.extras.get(e.id);
      if(local){local.signed=e.signed;local.damaged=e.damaged;local.rest=saved.motions[e.id]?.rest??0;}
    }
    for(const key of Object.keys(saved.motions) as Item[]){
      const position=f.extras.find(e=>e.id===key)??f[key as BaseItem];
      const body=this.bodyFor(key), motion=saved.motions[key];
      Body.setPosition(body,position);Body.setAngle(body,position.angle);
      Body.setVelocity(body,motion.v);Body.setAngularVelocity(body,motion.spin);
    }
    for(const person of f.people){
      this.add(person.id);
      const mover=this.movers.get(person.id)!;
      Body.setPosition(mover.body,person);
      if(person.held){
        const point=person.held==="sofa"?handleAt(f.sofa,person.end):this.bodyFor(person.held).position;
        this.attach(mover,{item:person.held,end:person.end,point});
      }
    }
    this.plantGripTicks=saved.plantGripTicks??0;
  }
  restart(scenario=this.scenario) {
    const next=new MoveWorld(this.round+1,scenario,this.options);
    for(const id of this.movers.keys())next.add(id);
    return next;
  }
}
