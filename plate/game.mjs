import {geometry,findRoute,edgeKey,doorCells,radius as bodyRadius} from "./geometry.mjs";
import {catalog, dirs, itemName, hasProduct, canDiscard, orderInfo, recipeFixtures, dashSettings, nextArrivals} from "./content.mjs";
import {newStore,restoreStore,stationState,settle,trade} from "./market.mjs";
import {isTray,options,useFitting,useTray} from "./equipment.mjs";

const same=(a,b)=>a[0]===b[0] && a[1]===b[1];
export const front=f=>[f.x+dirs[f.dir][0],f.y+dirs[f.dir][1]];
const cellKey=p=>p.join(",");
const second=1000, step=20, walkPerStep=6.25*step/second;
const cellOf=p=>[Math.round(p.x),Math.round(p.y)];
const face=(dx,dy)=>Math.abs(dx)>Math.abs(dy)?(dx>0?3:1):(dy>0?0:2);
const phaseNames={queue:"等位",order:"等接单",food:"等上菜"};
export const waitName=phase=>phaseNames[phase] || ({walk:"入座中",browse:"看菜单",eat:"用餐中",leave:"离店中"})[phase];
function boundary(map,x,y,side){
  return map.edges?.find(e=>e.x===x && e.y===y && e.side===side);
}
function crossing(map,x,y,nx,ny){
  return x!==nx?boundary(map,Math.min(x,nx),y,"right"):boundary(map,x,Math.min(y,ny),"down");
}
function canReach(s,p,f,book,limit=.8){
  return !!f && Number.isFinite(geometry(s,book.maps[s.map],book).reach(p,f,limit));
}
function aim(p,x,y){
  if(!x && !y)return;
  p.dir=face(x,y);p.aim=[x,y];
}
export function interactionTarget(s,p,book,action="grab"){
  if(!p)return null;
  const shape=geometry(s,book.maps[s.map],book);
  const [ax,ay]=p.aim && face(...p.aim)===p.dir?p.aim:dirs[p.dir];
  let best=null,score=-Infinity;
  for(const f of s.fixtures){
    const kept=p.focus?.[action]===f.id,d=shape.reach(p,f,kept ? .88 : .8);
    if(!Number.isFinite(d))continue;
    const dx=f.x-p.x,dy=f.y-p.y,cos=(dx*ax+dy*ay)/(Math.hypot(dx,dy)*Math.hypot(ax,ay) || 1);
    if(cos<-.18)continue;
    const def=book.tools[f.kind],direct=cos>.91;
    if(def.action==="discard" && !direct)continue;
    const choice=verbs(s,p,f,book)[action];
    const explicitTarget=direct && action==="grab" && (def.action==="discard" || def.action==="table" && !!p.hand);
    if(!choice && !direct)continue;
    const resume=action==="grab" && p.lastUsed===f.id && def.action==="cook" && !p.hand && s.stations[f.id].item;
    const rank=(choice?3:0)+(direct && choice?2:0)+(explicitTarget?7:0)+(resume?1.15:0)+cos*1.35-d+(kept ? .16 : 0)
      -(choice?.startsWith("放回") && !direct ? .7 : 0);
    if(rank>score){best=f;score=rank;}
  }
  return best;
}
function cookStep(recipe,def,input){
  return recipe.steps.find(a=>a.action==="cook" && a.inputs[0]===input &&
    (!a.station || def.appliance==="multi" || a.station===def.appliance));
}
function boardInputs(st){
  return st.parts.length?st.parts:st.item?[st.item]:[];
}
function boardOptions(recipe,parts){
  return recipe.steps.filter(a=>a.action==="combine" && subset(parts,a.inputs));
}
export function boardVerb(recipe,output){
  return recipe.steps.find(a=>a.action==="combine" && a.output===output)?.verb || "捏制";
}
function portionStep(recipe,item){
  return recipe.steps.find(a=>a.action==="portion" && a.inputs[0]===item);
}
export function canPortion(s,p,f,book){
  if(p?.hand!=="plate" || !f || f.fitting || book.tools[f.kind].action!=="counter")return false;
  const item=s.stations[f.id].item;
  return !!item && book.recipes[s.recipe].steps.some(step=>
    step.action==="portion" && (step.inputs[0]===item || step.output===item));
}
export function verbs(s,p,f,book){
  const device=options(s,p,f,book);if(device)return device;
  const def=book.tools[f.kind], st=s.stations[f.id], h=p.hand;
  const recipe=book.recipes[s.recipe],name=i=>itemName(i,book),dish=i=>hasProduct(recipe,i);
  let grab="",work="";
  switch(def.action){
    case "stock": grab=!h?"取"+name(def.item):h===def.item?"放回"+name(h):"";break;
    case "cook":
      if(!h && st.item)grab="取"+name(st.item);
      if(h && !st.heat && !st.item && cookStep(recipe,def,h))grab="放"+name(h)+"入锅";
      break;
    case "counter":
      if(!st.item && h?.startsWith("plated:"))work="撤盘";
      if(canPortion(s,p,f,book))grab="分一份装盘";
      else if(!h && st.item)grab="取"+name(st.item);
      else if(h && !st.item)grab="放下"+name(h);
      else if(h && st.item)grab=(h==="plate" && dish(st.item) || st.item==="plate" && dish(h))?"装盘":"交换台面物品";
      break;
    case "discard": if(canDiscard(h,book))grab="丢弃"+name(h);break;
    case "combine":
      if(st.pending)work="按住"+boardVerb(recipe,st.pending);
      if(h==="plate" && dish(st.item))grab="装盘";
      else if(!h && st.item)grab=(st.pending?"取回":"取")+name(st.item);
      else if(!dish(st.item) && h && boardOptions(recipe,[...boardInputs(st),h]).length)grab="放"+name(h);
      break;
    case "plates":
      if(!h && s.returns.length)grab="取回搭档物品";
      else if(h==="plate")grab="放回净盘";
      else if(!h && st.plates)grab="取净盘";
      else if(st.plates && dish(h))grab="装盘";
      break;
    case "wash":
      if(h==="dirty" && st.dirty<def.capacity)grab="放脏盘";
      if(!h && st.clean)grab="取一只净盘";
      if(st.dirty)work="连续刷盘";
      break;
    case "table":{
      const g=s.groups.find(v=>v.id===st.group);
      if(g?.stage==="order")work="接单";
      if(g?.stage==="food" && g.remaining.some(id=>h==="plated:"+orderInfo(id,book).product))grab="上菜";
      if(!g && st.dirty && !h)grab="收一只脏盘";
      break;
    }
  }
  return {grab,work};
}
export function isScrubbing(s,f,book){
  return Object.values(s.players).some(p=>p.scrub===f.id && !p.path.length &&
    canReach(s,p,f,book,.88));
}

export class Kitchen {
  constructor(book=catalog,level="first"){
    this.book=book; this.levelId=level; this.level=book.levels[level];
    this.reset(false,this.level.map,this.level.maps?"select":"prep");
  }
  get map(){return this.book.maps[this.s.map];}
  get plateSupply(){return this.level.plates+this.s.store.extraPlates;}
  restore(saved){
    if(!saved || saved.level!==this.levelId || !this.book.maps[saved.map] || !this.book.recipes[saved.recipe] ||
      !saved.players?.host || !Array.isArray(saved.fixtures) || !saved.stations || !saved.stats)return false;
    this.s=structuredClone(saved);
    const s=this.s;
    s.store=restoreStore(s.store);s.trays??={};s.tips??=0;s.round??=1;s.arrivals??=structuredClone(this.level.arrivals);
    for(const st of Object.values(s.stations))st.idleSince??=0;
    for(const [id,p] of Object.entries(s.players))Object.assign(p,{id,contact:null,bump:null,focus:{},dx:0,dy:0,path:[],target:null,scrub:null,form:null,dashHeld:false,slot:p.slot??0});
    if(s.players.guest)this.parkGuest();
    if(s.phase==="won")settle(s);
    this.refreshSeats();return true;
  }
  reset(duo,map=this.s.map,phase="prep",recipe=this.s?.recipe ?? this.level.menu[0],round=1,arrivals=this.level.arrivals.filter(([at])=>at<this.level.duration),layout=recipeFixtures(this.book,this.book.maps[map],recipe)){
    const run=(this.s?.run || 0)+1;
    this.remainder=0;
    const store=this.s?.store || newStore(),away=this.s?.players.guest?.away;
    this.s={run,store,trays:{},tips:0,level:this.levelId,map,recipe,phase,round,arrivals:structuredClone(arrivals),canCancel:false,practice:false,now:0,nextArrival:0,fixtures:structuredClone(layout),
      stations:{},players:{},groups:[],returns:[],queue:[],variantCounts:{},stats:{tables:0,sold:0,revenue:0},reason:""};
    for(const f of this.s.fixtures){
      this.s.stations[f.id]=stationState(f);
      if(f.fitting==="tray")this.s.trays[f.attachment]=[null,null];
    }
    const rack=this.s.fixtures.find(f=>this.def(f).action==="plates");
    this.s.stations[rack.id].plates=this.plateSupply;
    this.addPlayer("host"); if(duo)this.addPlayer("guest");
    if(duo && away)this.parkGuest();
    this.refreshSeats();
  }
  restartRound(advance){
    const s=this.s,round=s.round+Number(advance);
    const arrivals=advance?nextArrivals(s.arrivals,this.level.duration,round):s.arrivals;
    this.reset(!!s.players.guest,s.map,"prep",s.recipe,round,arrivals,s.fixtures);
  }
  addPlayer(id){
    const [x,y]=this.map.spawns[id];
    const p=this.s.players[id]??={id,x,y,dir:0,hand:null,slot:0,path:[],target:null,dx:0,dy:0,scrub:null,form:null,notice:"",effect:null,dashHeld:false,dashCooldown:0,dashes:0};
    p.away=false;
    const occupied=this.people(p);
    const room=(x,y)=>occupied.every(a=>Math.hypot(x-a.p.x,y-a.p.y)>=bodyRadius+a.r);
    if(this.fits(p.x,p.y) && !room(p.x,p.y)){
      const route=findRoute(this.shape,[p.x,p.y],[p.x,p.y],room);
      if(route?.length)[p.x,p.y]=route.at(-1);
    }
  }
  parkGuest(){
    const p=this.s.players.guest;
    if(p)Object.assign(p,{away:true,dx:0,dy:0,path:[],target:null,form:null,scrub:null,dashHeld:false});
  }
  reclaim(){
    const p=this.s.players.guest;
    if(p?.away && p.hand){this.s.returns.push(p.hand);p.hand=null;}
  }
  removeGuest(){
    const p=this.s.players.guest;
    if(p?.hand)this.s.returns.push(p.hand);
    delete this.s.players.guest;
  }
  def(f){return this.book.tools[f.kind];}
  fixture(id){return this.s.fixtures.find(f=>f.id===id);}
  at(x,y){return this.s.fixtures.find(f=>f.x===x && f.y===y);}
  ground(x,y){
    return Number.isInteger(x) && Number.isInteger(y) && x>=0 && x<this.map.width && y>=0 && y<this.map.height &&
      !this.map.walls.some(p=>same(p,[x,y])) && !this.map.planters?.some(p=>same(p,[x,y])) && !this.at(x,y);
  }
  inKitchen(x,y){
    if(!this.map.kitchen)return false;
    const [left,top,width,height]=this.map.kitchen;
    return x>=left && x<left+width && y>=top && y<top+height;
  }
  // Breadth-first routes serve customer seating, click-to-walk and layout validation.
  path(start,end,customer=false){
    const passable=(x,y)=>this.ground(x,y) && !(customer && this.inKitchen(x,y));
    if(!passable(...start) || !passable(...end))return null;
    const queue=[start], previous=new Map([[cellKey(start),null]]);
    for(let i=0;i<queue.length;i++){
      const at=queue[i];
      if(same(at,end)){
        const result=[];
        for(let p=at;previous.get(cellKey(p));p=previous.get(cellKey(p)))result.unshift(p);
        return result;
      }
      for(const [dx,dy] of dirs){
        const next=[at[0]+dx,at[1]+dy],key=cellKey(next);
        if(!previous.has(key) && passable(...next) && !this.barrier(...at,...next)){previous.set(key,at);queue.push(next);}
      }
    }
    return null;
  }
  barrier(x,y,nx,ny){
    const e=crossing(this.map,x,y,nx,ny);
    return e && (e.kind!=="door" || this.shape.doors[edgeKey(e)]?.window);
  }
  approaches(f){
    const cells=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const x=f.x+dx,y=f.y+dy;
      if(this.fits(x,y) && canReach(this.s,{x,y},f,this.book))cells.push([x,y]);
    }
    return cells;
  }
  routeTo(start,f,avoid){
    const shape=this.shape,b=shape.faces.get(f.id);
    const remaining=(x,y)=>Math.max(0,Math.hypot(Math.max(0,b.l-x,x-b.r),Math.max(0,b.t-y,y-b.b))-.8);
    return findRoute(shape,start,[f.x,f.y],(x,y)=>Number.isFinite(shape.reach({x,y},f)),avoid,remaining);
  }
  avoidPeople(p){
    const bodies=this.people(p);
    return (x,y)=>bodies.some(({p:other,r})=>{
      const separation=Math.hypot(x-other.x,y-other.y);
      const initial=Math.hypot(p.x-other.x,p.y-other.y);
      return separation<bodyRadius+r+.035 && separation<initial-1e-6;
    });
  }
  floorRoute(p,end,avoid){
    return findRoute(this.shape,[p.x,p.y],end,(x,y)=>same([x,y],end),avoid);
  }
  get shape(){return geometry(this.s,this.map,this.book);}
  refreshSeats(){
    this.s.layoutVersion=(this.s.layoutVersion || 0)+1;
    const doors={};
    for(const [id,def] of Object.entries(this.shape.doors))
      doors[id]={angle:0,jammed:false,...this.s.doors?.[id],...def};
    this.s.doors=doors;
    for(const f of this.s.fixtures){
      if(this.def(f).action!=="table")continue;
      this.s.stations[f.id].seats=dirs.map(([dx,dy],dir)=>{
        const cell=[f.x+dx,f.y+dy],side=(dir-f.dir+4)%4;
        const blocked=!this.ground(...cell) || !!this.barrier(f.x,f.y,...cell);
        const reachable=!blocked && !!this.path(this.map.entry,cell,true);
        const banned=!!((f.banned || 0)&(1<<side));
        return {cell,dir,side,blocked,reachable,banned,available:reachable && !banned};
      });
    }
  }
  validate(){
    this.refreshSeats();
    const start=this.map.spawns.host;
    if(this.map.outside){
      let previous=this.map.entry;
      for(const [x,y] of this.map.queue){
        if(x<0 || x>=this.map.width || y!==this.map.height || Math.abs(x-previous[0])+Math.abs(y-previous[1])!==1)
          return "门外等位路线未连续接到入口，请检查队列格。";
        previous=[x,y];
      }
    }
    const required=this.map.outside?(this.map.passages || []).filter(([x,y])=>!this.doorAt(x,y) || !this.at(x,y)):this.map.queue;
    for(const end of [this.map.spawns.guest,this.map.entry,...required,...Object.values(this.s.players).map(cellOf)])
      if(!this.path(start,end) && !findRoute(this.shape,start,end,(x,y)=>x===end[0] && y===end[1]))return "通道被堵住了，请检查第 "+(end[0]+1)+" 列、第 "+(end[1]+1)+" 行。";
    for(const f of this.s.fixtures){
      if(this.def(f).action==="table" && !this.s.stations[f.id].seats.some(seat=>seat.available))continue;
      if(!this.approaches(f).some(at=>this.path(start,at)) && !this.routeTo(start,f))return this.def(f).name+"（"+(f.x+1)+" 列 "+(f.y+1)+" 行）的操作面无法到达。";
    }
    const sizes=this.s.arrivals.map(a=>a[1]),needed=Math.max(1,...sizes);
    const tables=this.s.fixtures.filter(f=>this.def(f).action==="table");
    const counts=tables.map(f=>this.s.stations[f.id].seats.filter(seat=>seat.available).length);
    if(!counts.some(n=>n>=needed))return "本关有 "+needed+" 人客组。"+tables.map((f,i)=>f.id.toUpperCase()+" 桌可坐 "+counts[i]+" 人").join("、")+"。请解除禁坐或打通入口到桌边的通路。";
    return "";
  }
  doorAt(x,y){
    return this.map.edges?.find(e=>e.kind==="door" && doorCells(e).some(c=>same(c,[x,y])));
  }
  doorPlacementError(f,x,y,dir){
    if(!this.doorAt(x,y))return "";
    const trial=new Kitchen(this.book,this.levelId);
    trial.s=structuredClone(this.s);
    const moved=trial.fixture(f.id);
    if(moved)Object.assign(moved,{x,y,dir});
    else {trial.s.fixtures.push({...f,x,y,dir});trial.s.stations[f.id]=stationState(f);}
    const error=trial.validate();
    return error?"门口改窗会堵住路线（"+(x+1)+"列 "+(y+1)+"行）。"+error:"";
  }
  freePlacement(x,y){
    return this.ground(x,y) && !Object.values(this.s.players).some(p=>
      Math.abs(p.x-x)<.5+bodyRadius && Math.abs(p.y-y)<.5+bodyRadius) &&
      ![this.map.entry,...this.map.queue,...Object.values(this.map.spawns)].some(p=>same(p,[x,y]));
  }
  place(f,x,y,dir){
    if(!f || !Number.isInteger(dir) || !dirs[dir])return "请选择设备。";
    if(!same([f.x,f.y],[x,y]) && !this.freePlacement(x,y))
      return "这里需要留给通行或其他设备。";
    const error=this.doorPlacementError(f,x,y,dir);if(error)return error;
    Object.assign(f,{x,y,dir});
    this.refreshSeats();
    return "";
  }
  command(id,c){
    const s=this.s,p=s.players[id]; if(!p || p.away || !c || c.run!==s.run)return;
    if(id==="host"){
      if(c.type==="newStore" && s.phase!=="open"){
        s.store=newStore();this.reset(!!s.players.guest,this.level.map,this.level.maps?"select":"prep",this.level.menu[0]);return;
      }
      if(c.type==="reclaim"){this.reclaim();return;}
      if((s.phase==="won" && ["refresh","lock","buy","deploy"].includes(c.type)) || (s.phase==="prep" && c.type==="deploy")){
        p.notice=trade(this,c);return;
      }
    }
    if(this.level.maps && id==="host"){
      if(c.type==="browse" && ["prep","won","lost"].includes(s.phase)){
        s.previousPhase=s.phase;s.phase="select";s.canCancel=true;s.run++;
        for(const player of Object.values(s.players))Object.assign(player,{dx:0,dy:0,path:[],target:null});
        return;
      }
      if(s.phase==="select" && c.type==="cancelMap" && s.canCancel){
        s.phase=s.previousPhase || "prep";s.canCancel=false;s.run++;return;
      }
      if(s.phase==="select" && c.type==="choose" && this.level.maps.includes(c.map)){
        const recipe=c.recipe ?? s.recipe;
        if(!this.level.menu.includes(recipe))return;
        const phase=s.previousPhase==="won"?"won":"prep";
        if(s.canCancel && c.map===s.map && recipe===s.recipe && s.previousPhase!=="lost"){
          s.phase=phase;s.canCancel=false;s.run++;
        }else{
          const sameLayout=c.map===s.map && recipe===s.recipe;
          this.reset(!!s.players.guest,c.map,phase,recipe,s.round,s.arrivals,sameLayout?s.fixtures:undefined);
          if(phase==="won")Object.assign(this.s,{stats:s.stats,tips:s.tips,reason:s.reason});
        }
        return;
      }
    }
    if(s.phase==="select")return;
    if(c.type==="reset" && id==="host" && ["won","lost"].includes(s.phase)){this.restartRound(s.phase==="won");return;}
    if(c.type==="release"){p.form=null;if(p.intent==="form")p.intent="walk";return;}
    if(c.type==="stop"){
      Object.assign(p,{dx:0,dy:0,path:[],target:null,scrub:null,form:null,dashHeld:false});return;
    }
    if(c.type==="endPractice" && id==="host" && s.practice){
      this.restartRound(false);
      return;
    }
    if(c.type==="dashRelease"){p.dashHeld=false;return;}
    if(c.type==="dash" && ["prep","open"].includes(s.phase)){
      if(!p.dashHeld && !p.dashCooldown && (p.dx || p.dy))this.dash(p);
      p.dashHeld=true;return;
    }
    if(c.type==="drive" && (s.phase==="open" || s.phase==="prep")){
      if(![c.x,c.y].every(v=>Number.isInteger(v) && Math.abs(v)<=1))return;
      const releasingChord=p.dx && p.dy && (c.x===p.dx && !c.y || c.y===p.dy && !c.x);
      p.dx=c.x;p.dy=c.y;
      p.pendingAim=releasingChord;
      if(c.x || c.y){
        if(!releasingChord)aim(p,c.x,c.y);
        p.path=[];p.target=null;p.notice="";
      }
      return;
    }
    p.notice="";
    if(s.phase==="prep" || s.phase==="won" && id==="host"){
      if(c.type==="seat"){
        const f=this.fixture(c.id);
        if(f && this.def(f).action==="table" && c.from===[f.x,f.y,f.dir].join() &&
          Number.isInteger(c.side) && dirs[c.side] && typeof c.banned==="boolean"){
          const bit=1<<c.side;
          const mask=f.banned || 0;
          f.banned=c.banned?(mask|bit):(mask&~bit);
          this.refreshSeats();
        }
      }
      if(c.type==="place"){
        const f=this.fixture(c.id);
        if(id!=="host" && f && (f.attachment || s.store.assets.some(a=>a.id===f.id))){p.notice="已购设备由房主摆放。";return;}
        if(f && c.from===cellKey([f.x,f.y,f.dir]))p.notice=this.place(f,c.x,c.y,c.dir);
      }
      if(s.phase==="prep" && (c.type==="open" || c.type==="practice") && id==="host"){
        p.notice=this.validate();
        if(!p.notice){
          if(c.type==="practice"){
            s.practice=true;s.run++;
            const rack=s.fixtures.find(f=>this.def(f).action==="plates");
            const capacity=this.def(s.fixtures.find(f=>this.def(f).action==="wash")).capacity;
            s.stations[rack.id].plates=Math.max(this.plateSupply,capacity);
          }
          s.phase="open";
        }
      }
      return;
    }
    if(s.phase!=="open")return;
    if(c.type==="slot"){
      if(Number.isInteger(c.slot) && c.slot>=0 && c.slot<4)p.slot=c.slot;
      return;
    }
    if(c.type==="use" || c.type==="work"){
      if(p.target && p.path.length)return;
      const f=interactionTarget(s,p,this.book,c.type==="work"?"work":"grab");
      if(c.focus!==undefined && c.focus!==(f?.id ?? null)){p.notice="目标已变化，请重新操作。";return;}
      if(f)this.approach(p,f,c.type==="work"?"work":c.intent==="portion"?"portion":"grab",false);
      else p.notice="走到工位旁，看到高亮后再操作。";
      return;
    }
    if(c.type==="go"){
      p.dx=0;p.dy=0;
      const f=this.at(c.x,c.y);
      if(f)this.approach(p,f,["form","portion"].includes(c.intent)?c.intent:"auto");
      else if(Number.isInteger(c.x) && Number.isInteger(c.y) && this.fits(c.x,c.y)){
        p.intent="walk";p.destination=[c.x,c.y];
        this.follow(p,this.floorRoute(p,p.destination,this.avoidPeople(p)) ?? this.floorRoute(p,p.destination),null);
      }else this.follow(p,null,null);
    }
  }
  approach(p,f,intent,pointed=true){
    p.pointed=pointed;p.expected=null;
    if((intent==="auto" || intent==="grab") && canPortion(this.s,p,f,this.book))intent="portion";
    const choices=verbs(this.s,p,f,this.book);
    if(intent==="auto")intent=choices.work && !choices.grab && !["soak","combine"].includes(this.def(f).action) &&
      !(this.def(f).timer && this.s.stations[f.id].raw) && !(this.def(f).action==="wash" && p.hand)?"work":"grab";
    p.intent=intent;p.form=null;
    if(p.scrub!==f.id)p.scrub=null;
    if(canReach(this.s,p,f,this.book,p.focus?.grab===f.id || p.focus?.work===f.id ? .88 : .8)){
      p.path=[];p.target=f.id;
      this.arrive(p);
    }else{
      p.expected=this.expectedAction(p,f,intent);
      const start=[p.x,p.y];
      this.follow(p,this.routeTo(start,f,this.avoidPeople(p)) ?? this.routeTo(start,f),f.id);
    }
  }
  follow(p,route,target){
    p.stuck=0;
    p.dx=0;p.dy=0;p.scrub=null;p.form=null;p.path=route || [];p.target=route?target:null;
    if(!route)p.notice="这条路走不通。";
  }
  fits(x,y){return this.shape.fits(x,y);}
  people(except){
    const actors=[];
    for(const [id,p] of Object.entries(this.s.players)){
      if(p!==except && id!==except?.id && !p.away)actors.push({p,r:bodyRadius,mobile:true});
    }
    for(const g of this.s.groups){
      if(!g.table || g.stage==="done")continue;
      const travelling=g.stage==="walk" || g.stage==="leave";
      for(const [i,seat] of (g.seats || []).entries()){
        const [dx,dy]=dirs[seat.dir];
        const p=travelling?g.walkers?.[i]:{x:seat.cell[0]-dx*.24,y:seat.cell[1]-dy*.24};
        if(p && p!==except && p.y<this.map.height-.5)actors.push({p,r:.17,mobile:travelling,customer:true});
      }
    }
    return actors;
  }
  bump(p,token,dx,dy,strong){
    if(p.contact!==token || strong){
      const n=Math.hypot(dx,dy) || 1;
      p.bump={x:dx/n,y:dy/n,at:this.s.motionTime || 0,strong};
    }
    p.contact=token;
  }
  displace(p,dx,dy,{dash=false,predict=false,customer=false}={}){
    const x=p.x,y=p.y,shape=this.shape,clear=(tx,ty)=>shape.clear(x,y,tx,ty) &&
      (!customer || !this.inKitchen(Math.round(tx),Math.round(ty)));
    let tx=x+dx,ty=y+dy,hit="";
    if(!clear(tx,ty)){
      hit="wall";
      if(!dash && dx && dy && clear(tx,y))ty=y;
      else if(!dash && dx && dy && clear(x,ty))tx=x;
      else {
        let lo=0,hi=1;
        for(let i=0;i<9;i++){const t=(lo+hi)/2;if(clear(x+dx*t,y+dy*t))lo=t;else hi=t;}
        tx=x+dx*lo;ty=y+dy*lo;
      }
    }
    for(const e of this.map.edges || []){
      if(e.kind!=="door")continue;
      const state=this.s.doors[edgeKey(e)];
      if(!state || state.window || state.jammed || Math.abs(state.angle)>1.05)continue;
      const down=e.side==="down",plane=(down?e.y:e.x)+.5;
      const a=(down?y:x)-plane,b=(down?ty:tx)-plane;
      if(a*b<=0 && a!==b && Math.abs((down?tx:ty)-(down?e.x:e.y))<.5+bodyRadius){
        if(!predict && dash){state.sign=a<0?1:-1;state.angle=state.sign*1.48;}
        else {if(down)ty=y;else tx=x;hit="door";}
      }
    }
    const actors=this.people(p);
    for(const actor of actors){
      if(customer && actor.customer)continue;
      const q=actor.p,r=(customer ? .17 : bodyRadius)+actor.r;
      const vx=tx-q.x,vy=ty-q.y,d=Math.hypot(vx,vy),before=Math.hypot(x-q.x,y-q.y);
      if(d>=r || d>before+1e-7)continue;
      hit="person";
      const nx=d>1e-6?vx/d:-(dx || 1),ny=d>1e-6?vy/d:-dy;
      const push=actor.mobile?(r-d)*.48:0,px=q.x-nx*push,py=q.y-ny*push;
      let actual=0;
      if(push && shape.clear(q.x,q.y,px,py) && !(actor.customer && this.inKitchen(Math.round(px),Math.round(py))) &&
        !actors.some(other=>other!==actor && Math.hypot(other.p.x-px,other.p.y-py)<actor.r+other.r)){
        actual=push;
        if(!predict){q.x=px;q.y=py;if(!actor.customer)this.bump(q,"person",-nx,-ny,dash);}
      }
      const correction=Math.min(r-d,Math.max(0,before-d)) - actual;
      const cx=tx+nx*Math.max(0,correction),cy=ty+ny*Math.max(0,correction);
      if(clear(cx,cy)){tx=cx;ty=cy;}else {tx=x;ty=y;}
    }
    p.x=tx;p.y=ty;
    if(hit)this.bump(p,hit,dx,dy,dash);else p.contact=null;
    return hit;
  }
  walk(p,ms=step,predict=false){
    if(p.dx || p.dy){
      if(p.pendingAim){aim(p,p.dx,p.dy);p.pendingAim=false;}
      const distance=walkPerStep*ms/step/Math.hypot(p.dx,p.dy);
      this.displace(p,p.dx*distance,p.dy*distance,{predict});return;
    }
    if(!p.path.length)return;
    let budget=walkPerStep*ms/step;
    while(p.path.length && budget>1e-5){
      const [x,y]=p.path[0],dx=x-p.x,dy=y-p.y,length=Math.hypot(dx,dy);
      const cost=Math.min(budget,length);
      aim(p,dx,dy);
      const hit=length && this.displace(p,dx*cost/length,dy*cost/length,{predict});
      budget-=cost;
      if(Math.hypot(p.x-x,p.y-y)<1e-5){p.path.shift();p.stuck=0;}
      else if(hit){
        p.stuck=(p.stuck || 0)+ms;
        if(p.stuck>=160){
          const f=this.fixture(p.target),end=p.destination;
          const avoid=this.avoidPeople(p);
          const route=f?this.routeTo([p.x,p.y],f,avoid):end && this.floorRoute(p,end,avoid);
          if(route){p.path=route;p.stuck=0;}
          else if(p.stuck>=1000){p.path=[];p.target=null;p.notice="通道被挡住了，请让出通道后重试。";}
        }
        break;
      }else break;
    }
    if(!p.path.length && !predict)this.arrive(p);
  }
  dash(p){
    const len=Math.hypot(p.dx,p.dy),steps=Math.ceil(dashSettings.distance/(bodyRadius/3));
    const unit=dashSettings.distance/(steps*len);
    for(let i=0;i<steps;i++)if(this.displace(p,p.dx*unit,p.dy*unit,{dash:true}))break;
    p.dashCooldown=dashSettings.cooldownMs;p.dashes++;p.scrub=null;p.form=null;
  }
  movePlayers(){
    this.s.motionTime=(this.s.motionTime || 0)+step;
    for(const p of Object.values(this.s.players)){
      if(p.away)continue;
      p.dashCooldown=Math.max(0,p.dashCooldown-step);
      this.walk(p);
      for(const field of ["scrub","form"])
        if(p[field] && !canReach(this.s,p,this.fixture(p[field]),this.book,.88))p[field]=null;
      if(this.s.phase==="open")p.focus={grab:interactionTarget(this.s,p,this.book,"grab")?.id,work:interactionTarget(this.s,p,this.book,"work")?.id};
    }
    for(const e of this.map.edges || []){
      if(e.kind!=="door")continue;
      const state=this.s.doors[edgeKey(e)],down=e.side==="down";
      const cx=e.x+(down?0:.5),cy=e.y+(down ? .5 : 0);
      const near=this.people().map(a=>down?[a.p.y-cy,a.p.x-cx]:[a.p.x-cx,a.p.y-cy])
        .filter(([normal,along])=>Math.abs(normal)<.82 && Math.abs(along)<.59);
      if(!near.length || state.window){state.jammed=false;state.held=0;state.sign=0;}
      else{
        state.sign ||= near[0][0]<0?1:-1;
        state.held=near.some(([n])=>n<0) && near.some(([n])=>n>=0)?(state.held || 0)+step:0;
        if(state.held>=360)state.jammed=true;
      }
      const target=state.window?0:(state.sign || 0)*1.48;
      state.angle+=Math.sign(target-state.angle)*Math.min(.155,Math.abs(target-state.angle));
    }
  }
  predict(p,dx,dy,ms){
    if(!dx && !dy)return;
    p.dx=dx;p.dy=dy;aim(p,dx,dy);
    for(let left=ms;left>0;left-=step)this.walk(p,Math.min(left,step),true);
  }
  expectedAction(p,f,intent){
    const st=this.s.stations[f.id],v=verbs(this.s,p,f,this.book);
    return [intent==="work" || intent==="form"?v.work:v.grab,st.item,st.raw,st.group,p.slot,st.slots?.[p.slot%4]].join("|");
  }
  arrive(p){
    const f=this.fixture(p.target);p.target=null;
    if(!f || p.intent==="walk")return;
    if(!canReach(this.s,p,f,this.book,.88)){p.notice="这里够不到，请重新选择工位。";return;}
    if(p.pointed)aim(p,f.x-p.x,f.y-p.y);
    if(p.expected!=null && p.expected!==this.expectedAction(p,f,p.intent)){p.expected=null;p.notice="工位状态已变化，请重新操作。";return;}
    p.expected=null;
    p.lastUsed=f.id;this.interact(p,f,p.intent);
  }
  advance(milliseconds){
    if(!Number.isFinite(milliseconds))return;
    if(this.s.phase==="prep"){
      // A background tab may skip frames. Elapsed time still cools the dash.
      const skipped=Math.max(0,Math.floor((milliseconds-250)/step))*step;
      if(skipped)for(const p of Object.values(this.s.players))p.dashCooldown=Math.max(0,p.dashCooldown-skipped);
      this.remainder=(this.remainder || 0)+Math.max(0,milliseconds-skipped);
      while(this.remainder>=step){this.remainder-=step;this.movePlayers();}
      return;
    }
    this.remainder=(this.remainder || 0)+Math.max(0,milliseconds);
    while(this.remainder>=step && this.s.phase==="open"){
      this.remainder-=step; this.tick();
    }
    if(this.s.phase!=="open")this.remainder=0;
  }
  tick(){
    const s=this.s; s.now+=step;
    // Resolve heat deadlines before any queued pickup arriving on this tick.
    for(const f of s.fixtures){
      const st=s.stations[f.id];
      if(!st.heat || st.readyAt>s.now)continue;
      const h=st.heat,def=this.def(f),recipe=cookStep(this.recipe,def,h.input);
      const stages=recipe.stages || [{item:recipe.output}];
      st.item=stages[h.index].item;st.job=null;
      h.index++;h.since=st.readyAt;
      const next=stages[h.index];
      if(next && st.item!==h.target){h.nextItem=next.item;st.readyAt+=next.seconds*second/(def.speed || 1);}
      else {st.heat=null;st.readyAt=0;}
    }
    this.movePlayers();
    for(const f of s.fixtures){
      const st=s.stations[f.id];
      if(st.batchEnd && s.now>=st.batchEnd){
        st.clean=st.dirty;st.dirty=0;st.batchEnd=0;
      }
      if(st.pending){
        if(Object.values(s.players).some(p=>p.form===f.id && canReach(this.s,p,f,this.book,.88)))st.formed+=step;
        if(st.formed>=this.def(f).seconds*second){
          st.item=st.pending;st.pending=null;st.parts=[];st.formed=0;
          for(const p of Object.values(s.players))if(p.form===f.id)p.form=null;
        }
      }else if(this.def(f).action==="wash" && st.dirty){
        if(isScrubbing(s,f,this.book))st.washed+=step;
        if(st.washed>=this.def(f).seconds*second){
          st.dirty--;st.clean++;st.washed=0;
          if(!st.dirty)for(const p of Object.values(s.players))if(p.scrub===f.id){p.scrub=null;p.notice="盘子已洗净，空手按空格取一只。";}
        }
      }
    }
    const arrivals=s.arrivals;
    if(s.practice){
      s.groups=s.groups.filter(g=>g.stage!=="done");
      if(!s.groups.length)this.spawnGroup(Math.max(1,...arrivals.map(a=>a[1])));
    }else{
      while(s.nextArrival<arrivals.length && arrivals[s.nextArrival][0]*second<=s.now &&
            arrivals[s.nextArrival][0]<this.level.duration)this.spawnGroup(arrivals[s.nextArrival][1]);
    }
    for(const g of s.groups){
      if(phaseNames[g.stage] && s.now>=g.due){
        if(s.practice){
          if(g.table)this.leave(g);
          else {s.queue=s.queue.filter(id=>id!==g.id);g.stage="done";}
          continue;
        }
        s.phase="lost";s.reason="第 "+g.id+" 组在"+waitName(g.stage)+"时耗尽耐心";return;
      }
      if(g.stage==="walk" || g.stage==="leave"){
        if(!this.advanceCustomers(g) || s.now<g.due)continue;
      }else if(s.now<g.due)continue;
      if(g.stage==="walk")this.stage(g,"browse",this.level.browse*(this.def(this.fixture(g.table)).browseFactor || 1));
      else if(g.stage==="browse")this.stage(g,"order",this.level.patience.order);
      else if(g.stage==="eat"){
        const rate=this.def(this.fixture(g.table)).tip;
        if(rate && !s.practice)s.tips+=rate*g.served.reduce((sum,id)=>sum+orderInfo(id,this.book).price,0);
        this.leave(g);
      }else if(g.stage==="leave"){
        const st=s.stations[g.table];st.dirty=g.delivered;st.group=null;
        g.stage="done";if(!g.remaining.length)s.stats.tables++;
      }
    }
    this.seat();
    if(!s.practice && s.now>=this.level.duration*second && s.groups.every(g=>g.stage==="done")){
      s.phase="won";s.reason="今天的客人都已用餐离店";
      settle(s);
      for(const f of s.fixtures){
        s.stations[f.id]=stationState(f);
        if(f.fitting==="tray")s.trays[f.attachment]=[null,null];
        if(this.def(f).action==="plates")s.stations[f.id].plates=this.plateSupply;
      }
      for(const p of Object.values(s.players))Object.assign(p,{hand:null,path:[],target:null,dx:0,dy:0,scrub:null,form:null,effect:null});
      s.returns=[];this.refreshSeats();
    }
  }
  spawnGroup(size){
    const s=this.s,i=s.nextArrival++,orders=Array.from({length:size},()=>{
      const id=s.recipe,variants=this.recipe.variants;
      if(!variants)return id;
      const keys=Object.keys(variants),count=s.variantCounts[id] || 0;
      s.variantCounts[id]=count+1;
      return id+":"+keys[count%keys.length];
    });
    s.groups.push({id:i+1,size,stage:"queue",due:s.now+this.level.patience.queue*second,orders,
      remaining:[...orders],served:[],delivered:0,routes:[],seats:[],since:s.now});s.queue.push(i+1);
  }
  leave(g){
    g.routes=g.seats.map(({cell})=>[cell,...this.path(cell,this.map.entry,true),...(this.map.outside?[this.map.queue[0]]:[])]);
    this.travel(g,"leave");
  }
  advanceCustomers(g){
    if(!g.walkers){
      // Resume a journey saved before individual customer positions existed.
      const fraction=Math.max(0,Math.min(1,(this.s.now-g.since)/Math.max(1,g.due-g.since)));
      g.walkers=g.routes.map(route=>{
        const t=fraction*(route.length-1),i=Math.floor(t),a=route[i],b=route[i+1] || a;
        return {x:a[0]+(b[0]-a[0])*(t-i),y:a[1]+(b[1]-a[1])*(t-i),index:i+1};
      });
    }
    return g.walkers.map((p,i)=>{
      const route=g.routes[i];let budget=step*.004;
      while(budget>1e-7 && p.index<route.length){
        const [tx,ty]=route[p.index],dx=tx-p.x,dy=ty-p.y,len=Math.hypot(dx,dy);
        if(len<1e-5){p.index++;continue;}
        const d=Math.min(budget,len),vx=d*dx/len,vy=d*dy/len;
        if(ty>=this.map.height || p.y>this.map.height-.5-bodyRadius){p.x+=vx;p.y+=vy;}
        else {
          const oldX=p.x,oldY=p.y;
          this.displace(p,vx,vy,{customer:true});
          const progress=len-Math.hypot(tx-p.x,ty-p.y);
          p.stuck=progress<d*.18?(p.stuck || 0)+step:0;
          if(p.stuck>=320){
            const end=g.stage==="walk"?g.seats[i].cell:this.map.entry;
            const blockers=this.people(p).filter(a=>!a.customer);
            const detour=findRoute(this.shape,[p.x,p.y],end,(x,y)=>same([x,y],end),
              (x,y)=>this.inKitchen(Math.round(x),Math.round(y)) || blockers.some(a=>
                Math.hypot(x-a.p.x,y-a.p.y)<.38 && Math.hypot(x-a.p.x,y-a.p.y)<Math.hypot(oldX-a.p.x,oldY-a.p.y)+.001));
            if(detour){g.routes[i]=[[p.x,p.y],...detour,...(g.stage==="leave" && this.map.outside?[this.map.queue[0]]:[])];p.index=1;}
            p.stuck=0;break;
          }
        }
        budget-=d;
        if(Math.hypot(tx-p.x,ty-p.y)<1e-5)p.index++;
        else break;
      }
      return p.index===route.length;
    }).every(Boolean);
  }
  travel(g,stage){
    g.walkers=g.routes.map(route=>({x:route[0][0],y:route[0][1],index:1}));
    this.stage(g,stage,Math.max(.5,...g.routes.map(route=>(route.length-1)*.25)));
  }
  stage(g,stage,seconds){g.stage=stage;g.since=this.s.now;g.due=this.s.now+seconds*second;}
  seat(){
    const s=this.s;
    if(!s.queue.length)return;
    const occupied=new Set(s.groups.filter(g=>g.table && g.stage!=="done").flatMap(g=>g.seats.map(seat=>cellKey(seat.cell))));
    for(const id of [...s.queue]){
      const g=s.groups.find(v=>v.id===id);
      let table,available;
      for(const f of s.fixtures){
        const st=s.stations[f.id];
        if(!st.seats || st.group || st.dirty)continue;
        const seats=st.seats.filter(seat=>seat.available && !occupied.has(cellKey(seat.cell)));
        if(seats.length>=g.size && (!table || seats.length<available.length ||
          seats.length===available.length && st.idleSince<s.stations[table.id].idleSince)){table=f;available=seats;}
      }
      if(!table)continue;
      const outside=this.map.outside?this.map.queue.slice(0,s.queue.indexOf(id)+1).reverse():[];
      const options=available.map(seat=>({seat,path:this.path(this.map.entry,seat.cell,true)})).sort((a,b)=>a.path.length-b.path.length).slice(0,g.size);
      g.table=table.id;g.seats=options.map(o=>o.seat);
      for(const seat of g.seats)occupied.add(cellKey(seat.cell));
      g.routes=options.map(o=>[...outside,this.map.entry,...o.path]);
      s.stations[table.id].group=g.id;s.queue.splice(s.queue.indexOf(id),1);
      this.travel(g,"walk");
    }
  }
  get recipe(){return this.book.recipes[this.s.recipe];}
  interact(p,f,intent){
    const def=this.def(f), st=this.s.stations[f.id],before=p.hand,phase=this.s.groups.find(g=>g.id===st.group)?.stage;
    if(intent==="portion" && !canPortion(this.s,p,f,this.book)){p.notice="这份已经被取走了。";return;}
    const choices=verbs(this.s,p,f,this.book);
    const work=intent==="work" || intent==="form" || (intent==="auto" && def.action!=="soak" && !(def.timer && st.raw) && !choices.grab && !!choices.work &&
      !(def.action==="wash" && p.hand) && def.action!=="combine");
    if(work){
      if(def.timer && st.raw){
        startCooking(this,st,def,st.raw,p.slot%2?"steakWell":"steakMedium");st.raw=null;p.notice="已确认点火。";
      }else if(def.action==="soak"){
        if(st.dirty && !st.batchEnd){st.batchStart=this.s.now;st.batchEnd=this.s.now+2*this.book.tools.sink.seconds*second;p.notice="浸洗已启动，可以离开。";}
        else p.notice=st.batchEnd?"正在浸洗。":"请先放入脏盘。";
      }else if(def.action==="table" && phase==="order"){
        const g=this.s.groups.find(g=>g.id===st.group);
        this.stage(g,"food",this.level.patience.food);p.notice="已接下第 "+g.id+" 组的订单。";
      }else if(def.action==="wash" && choices.work){
        p.scrub=f.id;p.dx=0;p.dy=0;p.notice="正在刷盘。";
      }else if(def.action==="combine" && st.pending){
        p.form=f.id;p.dx=0;p.dy=0;p.notice="";
      }else if(def.action==="counter" && choices.work){
        st.item=p.hand.slice("plated:".length);p.hand="plate";p.notice="已撤盘，餐点留在台面。";
      }else p.notice="这里当前没有可做的工作。";
    }else if(f.fitting)p.notice=useFitting(this,p,f,st) || "";
    else if(isTray(p.hand))p.notice=useTray(this,p,st,def,actions) || "";
    else p.notice=actions[def.action](this,p,st,def) || "";
    const handChanged=before!==p.hand;
    if(handChanged || (phase==="order" && this.s.groups.find(g=>g.id===st.group)?.stage==="food"))
      p.effect={at:this.s.now,fixture:f.id,item:handChanged?(p.hand || before):null,pickup:handChanged && !!p.hand};
  }
}

function startCooking(game,st,def,input,target){
  const recipe=cookStep(game.recipe,def,input),first=recipe.stages?.[0];
  st.heat={input,index:0,since:game.s.now,nextItem:first?.item || recipe.output,target};
  st.job=st.heat.nextItem;st.readyAt=game.s.now+(first?.seconds ?? def.seconds)*second/(def.speed || 1);
}
function take(p,st){p.hand=st.item;st.item=null;st.parts=[];}
function isDish(game,item){return hasProduct(game.recipe,item);}
function exchange(game,p,st,def){
  if(def?.action==="counter" && p.hand==="plate"){
    const portion=portionStep(game.recipe,st.item);
    if(portion){p.hand="plated:"+portion.output;st.item=portion.output;return "已装一份，台面还剩一份。";}
  }
  if(!p.hand && st.item){take(p,st);return;}
  if(p.hand && !st.item){st.item=p.hand;p.hand=null;return;}
  if(p.hand==="plate" && isDish(game,st.item)){p.hand="plated:"+st.item;st.item=null;st.parts=[];return;}
  if(st.item==="plate" && isDish(game,p.hand)){p.hand="plated:"+p.hand;st.item=null;return;}
  if(def?.action==="counter" && p.hand && st.item){
    const held=p.hand;
    p.hand=st.item;st.item=held;
    return "已拿起"+itemName(p.hand,game.book)+"，"+itemName(held,game.book)+"留在传菜台。";
  }
  return st.item?"台面已占用，请先腾出手。":"台面是空的。";
}
function subset(parts,inputs){
  const rest=[...inputs];
  for(const part of parts){const i=rest.indexOf(part);if(i<0)return false;rest.splice(i,1);}
  return true;
}
// Each capability has a single host-side interaction handler, shared by both modes.
export const actions={
  stock(game,p,st,def){
    if(p.hand===def.item){p.hand=null;return;}
    if(p.hand)return "手里已有物品，请先放到传菜台。";
    p.hand=def.item;
  },
  cook(game,p,st,def){
    if(st.raw){
      if(!p.hand){p.hand=st.raw;st.raw=null;return;}
      return "锅里已有生牛排，请先选择熟度。";
    }
    if(st.job)return "还在加热，请等进度条走满。";
    if(!p.hand && st.item){take(p,st);st.heat=null;st.readyAt=0;return;}
    if(st.item)return "请腾出一只手，取出"+itemName(st.item,game.book)+"。";
    const recipe=cookStep(game.recipe,def,p.hand);
    if(!recipe)return "请按菜单把原料放进对应的锅。";
    if(def.timer && p.hand==="beef"){st.raw=p.hand;p.hand=null;return "选熟度后按 E 点火。";}
    startCooking(game,st,def,p.hand,def.timer?recipe.output:null);p.hand=null;
  },
  discard(game,p){
    if(!p.hand)return "丢弃的东西无法取回。";
    if(p.hand.startsWith("plated:"))return "先在空台面按 E 撤盘，再拿起餐点丢弃。";
    if(!canDiscard(p.hand,game.book))return "垃圾桶只收食材、未装盘的餐点和焦料。";
    const item=p.hand;p.hand=null;return "已丢弃"+itemName(item,game.book)+"。";
  },
  combine(game,p,st){
    if(isDish(game,st.item))return exchange(game,p,st);
    if(st.pending && Object.values(game.s.players).some(v=>v.form && game.s.stations[v.form]===st))
      return "配料已齐，按住 E "+boardVerb(game.recipe,st.pending)+"。";
    if(!p.hand){
      if(st.parts.length){
        p.hand=st.parts.pop();st.item=st.parts.at(-1) || null;st.formed=0;
        st.pending=boardOptions(game.recipe,st.parts).find(a=>a.inputs.length===st.parts.length)?.output || null;
      }
      else if(st.item)take(p,st);
      return;
    }
    const parts=[...boardInputs(st),p.hand], options=boardOptions(game.recipe,parts);
    if(!options.length)return "请按菜单放入配料。";
    const done=options.find(s=>s.inputs.length===parts.length);
    p.hand=null;st.parts=parts;st.item=parts.at(-1);st.pending=done?.output || null;st.formed=0;
  },
  counter:exchange,
  plates(game,p,st){
    if(!p.hand && game.s.returns.length){p.hand=game.s.returns.shift();return "已取回搭档留下的物品。";}
    if(p.hand==="plate"){p.hand=null;st.plates++;return;}
    if(p.hand && !isDish(game,p.hand))return "盘架只收干净盘，成品可在这里装盘。";
    if(!st.plates)return "干净盘用完了，去收桌洗盘。";
    st.plates--;p.hand=p.hand?"plated:"+p.hand:"plate";
  },
  wash(game,p,st,def){
    if(p.hand==="dirty"){
      if(st.dirty>=def.capacity)return "水池的脏盘已满，手里的盘子可以先放在传菜台。";
      p.hand=null;st.dirty++;return "已放入脏盘，点 E 连续刷。";
    }
    if(!p.hand && st.clean){st.clean--;p.hand="plate";return;}
    if(p.hand && st.clean)return "请空手取净盘，一次可取一只。";
    return st.dirty?"点 E 开始连续刷盘。":"把桌上收回的脏盘放进水池。";
  },
  soak(game,p,st){
    if(st.batchEnd)return "正在浸洗，本批完成后可取净盘。";
    if(st.clean){
      if(!p.hand){p.hand="plate";st.clean--;return;}
      return "请先逐只取空净盘。";
    }
    if(p.hand==="dirty" && st.dirty<3){p.hand=null;st.dirty++;return "已放脏盘，按 E 启动本批。";}
    return st.dirty===3?"本批已满，按 E 启动。":"先放入脏盘，再按 E 启动。";
  },
  table(game,p,st){
    const g=game.s.groups.find(v=>v.id===st.group);
    if(!g){
      if(st.dirty && !p.hand){st.dirty--;p.hand="dirty";if(!st.dirty)st.idleSince=game.s.now;return;}
      return st.dirty?"请空手收盘。":"这桌还没有客人。";
    }
    if(g.stage==="order")return "按 E 接单。";
    if(g.stage!=="food")return "这桌客人正在"+waitName(g.stage)+"。";
    const order=id=>orderInfo(id,game.book);
    const i=g.remaining.findIndex(id=>"plated:"+order(id).product===p.hand);
    if(i<0){
      if(g.remaining.some(id=>order(id).product===p.hand))return "这份"+itemName(p.hand,game.book)+"还没装盘。请到盘架装盘后上菜。";
      const wrongVariant=g.remaining.some(id=>order(id).variants && hasProduct(game.book.recipes[id.split(":")[0]],p.hand?.replace(/^plated:/,"")));
      return p.hand?(wrongVariant?"熟度不符，这桌需要 ":"这桌仍需要 ")+g.remaining.map(id=>order(id).name).join("、")+"，保留了手中物品。":"请送来已装盘的餐点。";
    }
    const [id]=g.remaining.splice(i,1);
    p.hand=null;g.served.push(id);g.delivered++;game.s.stats.sold++;game.s.stats.revenue+=order(id).price;
    if(!g.remaining.length)game.stage(g,"eat",game.level.eat*(game.def(game.fixture(g.table)).eatFactor || 1));
    return "已上菜一份。";
  },
};
