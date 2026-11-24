import {catalog, dirs, itemName, hasProduct, canDiscard, orderInfo, recipeFixtures} from "./content.mjs";

const same=(a,b)=>a[0]===b[0] && a[1]===b[1];
export const front=f=>[f.x+dirs[f.dir][0],f.y+dirs[f.dir][1]];
const cellKey=p=>p.join(",");
const second=1000, step=20, walkPerStep=6.25*step/second, bodyRadius=.21;
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
function access(map,f,x,y,def){
  const edge=crossing(map,f.x,f.y,x,y);
  return (!edge || (edge.kind==="window" && def.action==="counter")) && (!def.frontOnly || same(front(f),[x,y]));
}
function canReach(p,f,book,map){
  const [x,y]=cellOf(p);
  return Math.abs(f.x-x)+Math.abs(f.y-y)===1 &&
    access(map,f,x,y,book.tools[f.kind]);
}
export function interactionTarget(s,p,book){
  const [x,y]=cellOf(p),[dx,dy]=dirs[p.dir];
  const ahead=s.fixtures.find(f=>f.x===x+dx && f.y===y+dy);
  const map=book.maps[s.map];
  if(ahead && canReach(p,ahead,book,map))return ahead;
  // Walking parallel to a worktop leaves the chef looking along the aisle.
  // Only consider a station whose operating cell the chef already occupies.
  let closest=null,best=Infinity;
  for(const f of s.fixtures){
    if(!canReach(p,f,book,map))continue;
    const options=verbs(s,p,f,book);
    const distance=Math.hypot(f.x-p.x,f.y-p.y)+(options.grab || options.work?0:2);
    if(distance<best){best=distance;closest=f;}
  }
  return closest;
}
function cookStep(recipe,def,input){
  return recipe.steps.find(a=>a.action==="cook" && a.inputs[0]===input &&
    (!a.station || a.station===def.appliance));
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
  if(p?.hand!=="plate" || !f || book.tools[f.kind].action!=="counter")return false;
  const item=s.stations[f.id].item;
  return !!item && book.recipes[s.recipe].steps.some(step=>
    step.action==="portion" && (step.inputs[0]===item || step.output===item));
}
export function verbs(s,p,f,book){
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
    canReach(p,f,book,book.maps[s.map]));
}

export class Kitchen {
  constructor(book=catalog,level="first"){
    this.book=book; this.levelId=level; this.level=book.levels[level];
    this.reset(false,this.level.map,this.level.maps?"select":"prep");
  }
  get map(){return this.book.maps[this.s.map];}
  reset(duo,map=this.s.map,phase="prep",recipe=this.s?.recipe ?? this.level.menu[0]){
    const run=(this.s?.run || 0)+1;
    this.remainder=0;
    this.s={run,level:this.levelId,map,recipe,phase,canCancel:false,practice:false,now:0,nextArrival:0,fixtures:structuredClone(recipeFixtures(this.book,this.book.maps[map],recipe)),
      stations:{},players:{},groups:[],returns:[],queue:[],variantCounts:{},stats:{tables:0,sold:0,revenue:0},reason:""};
    for(const f of this.s.fixtures){
      this.s.stations[f.id]={item:null,parts:[],job:null,heat:null,readyAt:0,washed:0,dirty:0,clean:0,plates:0,group:null,pending:null,formed:0};
    }
    const rack=this.s.fixtures.find(f=>this.def(f).action==="plates");
    this.s.stations[rack.id].plates=this.level.plates;
    this.addPlayer("host"); if(duo)this.addPlayer("guest");
  }
  addPlayer(id){
    const [x,y]=this.map.spawns[id];
    this.s.players[id]={x,y,dir:0,hand:null,path:[],target:null,dx:0,dy:0,scrub:null,form:null,notice:"",effect:null};
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
        if(!previous.has(key) && passable(...next) && !crossing(this.map,...at,...next)){previous.set(key,at);queue.push(next);}
      }
    }
    return null;
  }
  approaches(f){
    return dirs.map(([dx,dy])=>[f.x+dx,f.y+dy]).filter(([x,y])=>access(this.map,f,x,y,this.def(f)));
  }
  routeTo(start,f){
    return this.approaches(f).map(end=>this.path(start,end)).filter(Boolean).sort((a,b)=>a.length-b.length)[0];
  }
  validate(){
    const start=this.map.spawns.host;
    if(this.map.outside){
      let previous=this.map.entry;
      for(const [x,y] of this.map.queue){
        if(x<0 || x>=this.map.width || y!==this.map.height || Math.abs(x-previous[0])+Math.abs(y-previous[1])!==1)
          return "门外等位路线未连续接到入口，请检查队列格。";
        previous=[x,y];
      }
    }
    const required=this.map.outside?(this.map.passages || []):this.map.queue;
    for(const end of [this.map.spawns.guest,this.map.entry,...required,...Object.values(this.s.players).map(cellOf)])
      if(!this.path(start,end))return "通道被堵住了，请检查第 "+(end[0]+1)+" 列、第 "+(end[1]+1)+" 行。";
    for(const f of this.s.fixtures){
      if(!this.routeTo(start,f))return this.def(f).name+"（"+(f.x+1)+" 列 "+(f.y+1)+" 行）的操作面无法到达。";
      if(this.def(f).action==="table" && !this.path(this.map.entry,front(f),true))
        return "顾客从入口走不到 "+f.id.toUpperCase()+" 桌，请调整餐桌位置或朝向。";
    }
    return "";
  }
  place(f,x,y,dir){
    if(!f || !Number.isInteger(dir) || !dirs[dir])return "请选择设备。";
    if(!same([f.x,f.y],[x,y]) && (!this.ground(x,y) || Object.values(this.s.players).some(p=>
      Math.abs(p.x-x)<.5+bodyRadius && Math.abs(p.y-y)<.5+bodyRadius) ||
      [this.map.entry,...this.map.queue,...Object.values(this.map.spawns)].some(p=>same(p,[x,y]))))
      return "这里需要留给通行或其他设备。";
    Object.assign(f,{x,y,dir});
    return "";
  }
  command(id,c){
    const s=this.s,p=s.players[id]; if(!p || !c || c.run!==s.run)return;
    if(this.level.maps && id==="host"){
      if(c.type==="browse" && ["prep","won","lost"].includes(s.phase)){
        if(s.phase==="prep"){
          s.phase="select";s.canCancel=true;s.run++;
          for(const player of Object.values(s.players))Object.assign(player,{dx:0,dy:0,path:[],target:null});
        }else this.reset(!!s.players.guest,s.map,"select");
        return;
      }
      if(s.phase==="select" && c.type==="cancelMap" && s.canCancel){
        s.phase="prep";s.canCancel=false;s.run++;return;
      }
      if(s.phase==="select" && c.type==="choose" && this.level.maps.includes(c.map)){
        const recipe=c.recipe ?? s.recipe;
        if(!this.level.menu.includes(recipe))return;
        if(s.canCancel && c.map===s.map && recipe===s.recipe){s.phase="prep";s.canCancel=false;s.run++;}
        else this.reset(!!s.players.guest,c.map,"prep",recipe);
        return;
      }
    }
    if(s.phase==="select")return;
    if(c.type==="reset" && id==="host" && ["won","lost"].includes(s.phase)){this.reset(!!s.players.guest);return;}
    if(c.type==="release"){p.form=null;if(p.intent==="form")p.intent="walk";return;}
    if(c.type==="stop"){
      Object.assign(p,{dx:0,dy:0,path:[],target:null,scrub:null,form:null});return;
    }
    if(c.type==="endPractice" && id==="host" && s.practice){
      const duo=!!s.players.guest;this.reset(duo);
      this.s.fixtures=this.prepLayout;this.prepLayout=null;
      return;
    }
    if(c.type==="drive" && (s.phase==="open" || s.phase==="prep")){
      if(![c.x,c.y].every(v=>Number.isInteger(v) && Math.abs(v)<=1))return;
      p.dx=c.x;p.dy=c.y;
      if(c.x || c.y){p.dir=face(c.x,c.y);p.path=[];p.target=null;p.form=null;p.notice="";}
      return;
    }
    p.notice="";
    if(s.phase==="prep"){
      if(c.type==="place"){
        const f=this.fixture(c.id);
        if(f && c.from===cellKey([f.x,f.y,f.dir]))p.notice=this.place(f,c.x,c.y,c.dir);
      }
      if((c.type==="open" || c.type==="practice") && id==="host"){
        p.notice=this.validate();
        if(!p.notice){
          if(c.type==="practice"){
            this.prepLayout=structuredClone(s.fixtures);s.practice=true;s.run++;
            const rack=s.fixtures.find(f=>this.def(f).action==="plates");
            const capacity=this.def(s.fixtures.find(f=>this.def(f).action==="wash")).capacity;
            s.stations[rack.id].plates=Math.max(this.level.plates,capacity);
          }
          s.phase="open";
        }
      }
      return;
    }
    if(s.phase!=="open")return;
    if(c.type==="use" || c.type==="work"){
      if(p.target && p.path.length)return;
      const f=interactionTarget(s,p,this.book);
      if(f)this.approach(p,f,c.type==="work"?"work":c.intent==="portion"?"portion":"grab");
      else p.notice="走到工位旁，看到高亮后再操作。";
      return;
    }
    if(c.type==="go"){
      p.dx=0;p.dy=0;
      const f=this.at(c.x,c.y);
      if(f)this.approach(p,f,["form","portion"].includes(c.intent)?c.intent:"auto");
      else this.follow(p,this.path(cellOf(p),[c.x,c.y]),null);
    }
  }
  approach(p,f,intent){
    if((intent==="auto" || intent==="grab") && canPortion(this.s,p,f,this.book))intent="portion";
    p.intent=intent;p.form=null;
    if(p.scrub!==f.id)p.scrub=null;
    if(canReach(p,f,this.book,this.map)){
      p.path=[];p.target=f.id;
      this.arrive(p);
    }else{
      this.follow(p,this.routeTo(cellOf(p),f),f.id);
    }
  }
  follow(p,route,target){
    const start=cellOf(p);
    if(route && !same(start,[p.x,p.y]))route.unshift(start);
    p.dx=0;p.dy=0;p.scrub=null;p.form=null;p.path=route || [];p.target=route?target:null;
    if(!route)p.notice="这条路走不通。";
  }
  fits(x,y){
    const left=Math.round(x-bodyRadius),right=Math.round(x+bodyRadius);
    const top=Math.round(y-bodyRadius),bottom=Math.round(y+bodyRadius);
    for(let col=left;col<=right;col++)for(let row=top;row<=bottom;row++){
      if(!this.ground(col,row))return false;
      if(col<right && boundary(this.map,col,row,"right"))return false;
      if(row<bottom && boundary(this.map,col,row,"down"))return false;
    }
    return true;
  }
  walk(p,milliseconds=step){
    if(p.dx || p.dy){
      const distance=walkPerStep*milliseconds/step/Math.hypot(p.dx,p.dy);
      const x=p.x+p.dx*distance,y=p.y+p.dy*distance;
      if(this.fits(x,p.y))p.x=x;
      if(this.fits(p.x,y))p.y=y;
      return;
    }
    if(!p.path.length)return;
    const [x,y]=p.path[0],dx=x-p.x,dy=y-p.y,length=Math.hypot(dx,dy);
    p.dir=face(dx,dy);
    if(length<=walkPerStep){
      p.x=x;p.y=y;p.path.shift();if(!p.path.length)this.arrive(p);
    }else{
      p.x+=walkPerStep*dx/length;p.y+=walkPerStep*dy/length;
    }
  }
  predict(p,dx,dy,ms){
    if(!dx && !dy)return;
    p.dx=dx;p.dy=dy;p.dir=face(dx,dy);
    for(let left=ms;left>0;left-=step)this.walk(p,Math.min(left,step));
  }
  arrive(p){
    const f=this.fixture(p.target);p.target=null;
    if(!f || p.intent==="walk")return;
    const [x,y]=cellOf(p);
    p.dir=face(f.x-x,f.y-y);
    this.interact(p,f,p.intent);
  }
  advance(milliseconds){
    if(!Number.isFinite(milliseconds))return;
    if(this.s.phase==="prep"){
      this.remainder=(this.remainder || 0)+Math.min(250,Math.max(0,milliseconds));
      while(this.remainder>=step){this.remainder-=step;for(const p of Object.values(this.s.players))this.walk(p);}
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
      if(next){h.nextItem=next.item;st.readyAt+=next.seconds*second;}
      else {st.heat=null;st.readyAt=0;}
    }
    for(const p of Object.values(s.players)){
      this.walk(p);
      if(p.scrub && !canReach(p,this.fixture(p.scrub),this.book,this.map))p.scrub=null;
    }
    for(const f of s.fixtures){
      const st=s.stations[f.id];
      if(st.pending){
        if(Object.values(s.players).some(p=>p.form===f.id && canReach(p,f,this.book,this.map)))st.formed+=step;
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
    const arrivals=this.level.arrivals;
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
      if(s.now<g.due)continue;
      if(g.stage==="walk")this.stage(g,"browse",this.level.browse);
      else if(g.stage==="browse")this.stage(g,"order",this.level.patience.order);
      else if(g.stage==="eat"){
        this.leave(g);
      }else if(g.stage==="leave"){
        const st=s.stations[g.table];st.dirty=g.delivered;st.group=null;
        g.stage="done";if(!g.remaining.length)s.stats.tables++;
      }
    }
    this.seat();
    if(!s.practice && s.now>=this.level.duration*second && s.groups.every(g=>g.stage==="done")){
      s.phase="won";s.reason="今天的客人都已用餐离店";
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
      remaining:[...orders],served:[],delivered:0,route:[],since:s.now});s.queue.push(i+1);
  }
  leave(g){
    const cell=front(this.fixture(g.table));
    g.route=[cell,...this.path(cell,this.map.entry,true)];
    if(this.map.outside)g.route.push(this.map.queue[0]);
    this.stage(g,"leave",Math.max(.5,(g.route.length-1)*.25));
  }
  stage(g,stage,seconds){g.stage=stage;g.since=this.s.now;g.due=this.s.now+seconds*second;}
  seat(){
    const s=this.s;
    for(const id of [...s.queue]){
      const g=s.groups.find(v=>v.id===id);
      const table=s.fixtures.find(f=>this.def(f).action==="table" && this.def(f).seats>=g.size &&
        !s.stations[f.id].group && !s.stations[f.id].dirty);
      if(!table)continue;
      const outside=this.map.outside?this.map.queue.slice(0,s.queue.indexOf(id)+1).reverse():[];
      g.table=table.id;g.route=[...outside,this.map.entry,...this.path(this.map.entry,front(table),true)];
      s.stations[table.id].group=g.id;s.queue.splice(s.queue.indexOf(id),1);
      this.stage(g,"walk",Math.max(.5,(g.route.length-1)*.25));
    }
  }
  get recipe(){return this.book.recipes[this.s.recipe];}
  interact(p,f,intent){
    const def=this.def(f), st=this.s.stations[f.id],before=p.hand,phase=this.s.groups.find(g=>g.id===st.group)?.stage;
    if(intent==="portion" && !canPortion(this.s,p,f,this.book)){p.notice="这份已经被取走了。";return;}
    const choices=verbs(this.s,p,f,this.book);
    const work=intent==="work" || intent==="form" || (intent==="auto" && !choices.grab && !!choices.work &&
      !(def.action==="wash" && p.hand) && def.action!=="combine");
    if(work){
      if(def.action==="table" && phase==="order"){
        const g=this.s.groups.find(g=>g.id===st.group);
        this.stage(g,"food",this.level.patience.food);p.notice="已接下第 "+g.id+" 组的订单。";
      }else if(def.action==="wash" && choices.work){
        p.scrub=f.id;p.dx=0;p.dy=0;p.notice="正在刷盘。";
      }else if(def.action==="combine" && st.pending){
        p.form=f.id;p.dx=0;p.dy=0;p.notice="";
      }else if(def.action==="counter" && choices.work){
        st.item=p.hand.slice("plated:".length);p.hand="plate";p.notice="已撤盘，餐点留在台面。";
      }else p.notice="这里当前没有可做的工作。";
    }else p.notice=actions[def.action](this,p,st,def) || "";
    const handChanged=before!==p.hand;
    if(handChanged || (phase==="order" && this.s.groups.find(g=>g.id===st.group)?.stage==="food"))
      p.effect={at:this.s.now,fixture:f.id,item:handChanged?(p.hand || before):null,pickup:handChanged && !!p.hand};
  }
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
    if(st.job)return "还在加热，请等进度条走满。";
    if(!p.hand && st.item){take(p,st);st.heat=null;st.readyAt=0;return;}
    if(st.item)return "请腾出一只手，取出"+itemName(st.item,game.book)+"。";
    const recipe=cookStep(game.recipe,def,p.hand);
    if(!recipe)return "请按菜单把原料放进对应的锅。";
    const first=recipe.stages?.[0];
    st.heat={input:p.hand,index:0,since:game.s.now,nextItem:first?.item || recipe.output};
    st.job=first?.item || recipe.output;st.readyAt=game.s.now+(first?.seconds ?? def.seconds)*second;p.hand=null;
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
  table(game,p,st){
    const g=game.s.groups.find(v=>v.id===st.group);
    if(!g){
      if(st.dirty && !p.hand){st.dirty--;p.hand="dirty";return;}
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
    if(!g.remaining.length)game.stage(g,"eat",game.level.eat);
    return "已上菜一份。";
  },
};
