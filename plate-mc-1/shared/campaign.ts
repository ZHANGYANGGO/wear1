import { cargo, MoveWorld, type Action, type Controls, type Scenario, type Snapshot } from "./moving";
import { freightCatalog, order, placements, rules, type Preset } from "./catalog";

import {products,type Product} from "./equipment";

type Phase="menu"|"brief"|"moving"|"loss"|"missing"|"shop"|"end";
export type Command={type:"new"|"start"|"close"|"accept"|"retry"|"buy"|"equip"|"next"|"reset"|"wet";token:string;op:string;product?:string;confirm?:boolean};
export function price(e:Snapshot["extras"][number]) {
  const spec=freightCatalog[e.kind];
  return e.damaged ? spec.damagedPrice??spec.price : spec.price;
}
export function quote(f:Snapshot,terms:{base:number;cost:number}) {
  const lines=f.extras.filter(e=>e.signed).map(e=>({id:e.id,name:freightCatalog[e.kind].name,price:price(e),damaged:e.damaged}));
  const base=f.count===3?terms.base:0;
  const damage=f.spilled?rules.plantDamage:0;
  const actual=base+lines.reduce((n,line)=>n+line.price,0)-damage;
  return {base,lines,damage,actual,cost:terms.cost,net:actual-terms.cost,missing:Object.entries(f.signed).filter(([,v])=>!v).map(([k])=>k)};
}
type Receipt=ReturnType<typeof quote> & {reason:"manual"|"deadline";level:number;attempt:number};
export type RunState={
  version:1;id:string;preset:Preset;seed:number;phase:Phase;level:number;attempt:number;
  wallet:number;stock:Record<string,number>;vehicle:string;posted:Receipt[];receipt:Receipt|null;
  purchases:string[];start:number;deadline:number;ticks:number;scenario:Scenario;
};
export type RunView=ReturnType<Campaign["view"]>;
export type SavedRun={state:RunState;world:ReturnType<MoveWorld["save"]>};
export function operationId():string {
  // getRandomValues also works when two devices use a local HTTP address.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,"0")).join("");
}
function newRun(preset:Preset,seed:number):RunState {
  return {version:1,id:operationId(),preset,seed,phase:"menu",level:0,attempt:1,wallet:rules.initialWallet,
    stock:{...rules.initialStock},vehicle:rules.initialVehicle,posted:[],receipt:null,purchases:[],
    start:0,deadline:0,ticks:0,scenario:"dry"};
}
export function atDoor(f:Snapshot,id:string) {
  const p=f.people.find(m=>m.id===id);
  return !!p && Math.abs(p.y-cargo.y)<=38 && p.x>=cargo.x-12 && p.x<=cargo.x+f.width+12;
}
export class Campaign {
  state:RunState;
  world:MoveWorld;
  constructor(preset:Preset="normal",seed=7,readonly catalog:Record<string,Product>=products){
    this.state=newRun(preset,seed);
    this.world=this.makeWorld();
  }
  get terms(){return order(this.state.level,this.state.preset,this.state.seed);}
  get token(){const s=this.state;return [s.id,s.attempt,s.phase].join("/");}
  private makeWorld(){
    const s=this.state;
    const practice=s.preset==="practice";
    return new MoveWorld(s.attempt,s.scenario,{width:practice?cargo.w:this.catalog[s.vehicle]?.width??rules.standardWidth,
      extras:practice?[]:placements,outdoorBooks:!practice && this.terms.rainAt!==null,
      tarp:Object.keys(s.stock).some(id=>s.stock[id]>0 && this.catalog[id]?.effect==="cover")});
  }
  private rebuild(){
    const ids=[...this.world.movers.keys()];
    this.world=this.makeWorld();
    for(const id of ids)this.world.add(id);
  }
  private resetAttempt(){
    const s=this.state;s.attempt++;s.phase="brief";s.start=0;s.deadline=0;s.ticks=0;s.receipt=null;s.purchases=[];
    this.rebuild();
  }
  advance(now:number){
    const s=this.state;
    if(s.phase!=="moving")return;
    const end=Math.min(now,s.deadline);
    const target=Math.floor((end-s.start)*60/1000);
    const rainAt=this.terms.rainAt;
    while(s.ticks<target){
      s.ticks++;
      if(rainAt!==null && s.ticks>=rainAt*.06 && s.ticks<(rainAt+12000)*.06)this.world.rain();
      this.world.step();
    }
    if(now>=s.deadline)this.finish("deadline");
  }
  private finish(reason:Receipt["reason"]){
    const s=this.state;
    s.receipt={...quote(this.world.snapshot(),this.terms),reason,level:s.level,attempt:s.attempt};
    if(s.receipt.missing.length)s.phase="missing";
    else if(s.receipt.net<0)s.phase="loss";
    else this.post();
  }
  private post(){
    const s=this.state, r=s.receipt!;
    s.wallet+=r.net;s.posted.push(r);
    s.phase=s.level+1===rules.levels.length?"end":"shop";
  }
  input(id:string,v:Controls,now:number){this.advance(now);if(this.state.phase==="moving")this.world.input(id,v);}
  act(id:string,a:Action,now:number){this.advance(now);if(this.state.phase==="moving")this.world.action(id,a);}
  command(id:string,c:Command,now:number):string {
    this.advance(now);
    const s=this.state;
    if(c.token!==this.token)return "关卡状态已更新";
    switch(c.type){
      case "new":{
        if(s.phase!=="menu" && s.phase!=="end")break;
        this.state=newRun(s.preset,s.seed);
        this.state.phase="brief";this.rebuild();return "";
      }
      case "start":
        if(s.phase!=="brief")break;
        s.phase="moving";s.start=now;s.deadline=now+this.terms.seconds*1000;return "";
      case "close":{
        if(s.phase!=="moving")break;
        const f=this.world.snapshot();
        if(!atDoor(f,id))return "请到货车尾部坡板旁关门";
        const q=quote(f,this.terms);
        if(q.missing.length){
          const names:Record<string,string>={sofa:"长沙发",books:"书",plant:"盆栽"};
          return "还缺必搬货："+q.missing.map(k=>names[k]).join("、");
        }
        if(q.net<0 && !c.confirm)return "确认关门";
        this.finish("manual");return "";
      }
      case "accept":
        if(s.phase!=="loss")break;
        this.post();return "";
      case "retry":
        if(s.phase!=="loss" && s.phase!=="missing")break;
        this.resetAttempt();return "";
      case "buy":{
        if(s.phase!=="shop" || !c.op)break;
        if(s.purchases.includes(c.op))return "";
        const key=c.product??"", item=Object.hasOwn(this.catalog,key)?this.catalog[key]:null;
        if(!item)return "未知装备";
        if((s.stock[key]??0)>=item.limit)return "已达持有上限";
        if(s.wallet<item.price)return "余额不足";
        s.wallet-=item.price;s.stock[key]=(s.stock[key]??0)+1;s.purchases.push(c.op);
        if(item.effect==="vehicle")s.vehicle=key;
        return "";
      }
      case "equip":{
        const key=c.product??"";
        if(s.phase!=="shop" || (key && (!s.stock[key]||this.catalog[key]?.effect!=="vehicle")))break;
        s.vehicle=key;return "";
      }
      case "next":
        if(s.phase!=="shop")break;
        s.level++;s.scenario="dry";this.resetAttempt();return "";
      case "reset":case "wet":
        if(s.preset!=="practice" || s.phase!=="moving")break;
        if(c.type==="wet")s.scenario=s.scenario==="wet"?"dry":"wet";
        this.resetAttempt();return this.command(id,{...c,type:"start",token:this.token},now);
    }
    return "此操作当前不可用";
  }
  view(now:number){
    const s=this.state, terms=this.terms;
    const elapsed=s.ticks*1000/60;
    const rain=terms.rainAt;
    const weather=rain===null?"clear":elapsed>=rain+12000?"after":elapsed>=rain?"rain":elapsed>=rain-12000?"warning":"clear";
    return {token:this.token,phase:s.phase,level:s.level,levels:rules.levels.length,terms,preset:s.preset,
      wallet:s.wallet,stock:{...s.stock},vehicle:s.vehicle,receipt:s.receipt,profit:s.posted.reduce((n,r)=>n+r.net,0),
      remaining:s.phase==="moving"?Math.max(0,Math.ceil((s.deadline-now)/1000)):terms.seconds,weather};
  }
  save():SavedRun {return {state:structuredClone(this.state),world:this.world.save()};}
  static restore(save:SavedRun){
    const s=save.state;
    if(s.version!==1 || !rules.levels[s.level] || !Number.isFinite(s.wallet))throw Error("无效的本局存档");
    const run=new Campaign(s.preset,s.seed);
    run.state={...s,stock:{...s.stock},purchases:s.purchases??[]};
    run.world=run.makeWorld();run.world.restore(save.world);
    return run;
  }
}
