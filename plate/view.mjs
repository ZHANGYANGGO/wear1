import {drawDoor,drawFloor,drawFixture,drawItem,drawPerson,drawSign} from "./art.mjs";
import {itemName,dirs,orderInfo,isBurnt,hasProduct} from "./content.mjs";
import {waitName,interactionTarget,isScrubbing,verbs,boardVerb} from "./game.mjs";
import {trayContents} from "./equipment.mjs";
import {doorCells,edgeKey} from "./geometry.mjs";

const tile=64, midpoint=n=>(n+.5)*tile;
const clamp=n=>Math.max(0,Math.min(1,n));
const patience=(g,now)=>clamp((g.due-now)/(g.due-g.since));
const barColor=ratio=>ratio<.25?"#e37e53":ratio<.5?"#efbb65":"#a5cf8b";
function meter(label,ratio){
  return '<progress aria-label="'+label+'" max="100" value="'+Math.round(ratio*100)+'" style="--fill:'+barColor(ratio)+'"></progress>';
}
function drawMeter(ctx,x,y,ratio,color){
  ctx.fillStyle="#384338";ctx.beginPath();ctx.roundRect(x-25,y,50,8,4);ctx.fill();
  if(ratio>0){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x-23,y+2,46*clamp(ratio),4,2);ctx.fill();}
}
const el=id=>document.getElementById(id);
const put=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
export function createView(book,level,map,recipe,click,startForm,release,toggleSeat){
  const canvas=el("scene"),boardRows=map.height+Number(!!map.outside);
  canvas.width=map.width*tile;canvas.height=boardRows*tile;
  el("kitchen").style.setProperty("--board-ratio",map.width/boardRows);
  const floor=document.createElement("canvas");floor.width=canvas.width;floor.height=canvas.height;
  drawFloor(floor.getContext("2d"),map,false);
  const doors=(map.edges || []).filter(edge=>edge.kind==="door");
  const ctx=canvas.getContext("2d"),cells=el("cells"),buttons=[];
  cells.style.gridTemplateColumns="repeat("+map.width+",1fr)";
  cells.replaceChildren();cells.style.gridTemplateRows="repeat("+boardRows+",1fr)";
  let phase="prep",pointer=null,hovered=null;
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const b=document.createElement("button");b.type="button";b.dataset.x=x;b.dataset.y=y;
    b.onpointerenter=()=>{hovered=[x,y];};
    b.onpointerleave=()=>{hovered=null;};
    let handled=false;
    b.onpointerdown=e=>{
      handled=false;
      if(phase!=="open" || b.dataset.form!=="yes" || pointer!==null || e.button!==0)return;
      handled=true;pointer=e.pointerId;b.setPointerCapture(pointer);startForm(x,y);
    };
    const end=e=>{if(e.pointerId===pointer){pointer=null;release();}};
    b.onpointerup=end;b.onpointercancel=end;b.onlostpointercapture=end;
    b.onclick=e=>{if(!handled || e.detail===0)click(x,y);handled=false;};
    buttons.push(b);cells.append(b);
  }
  const name=f=>f.fitting==="box"?"四格备料盒":f.fitting==="tray"?"托盘架":f.kind==="table"?f.id.toUpperCase()+" 桌":book.tools[f.kind].name;
  const recipeName=id=>orderInfo(id,book).name;
  const stationFor=step=>step.station?book.tools[step.station]:map.fixtures.map(f=>book.tools[f.kind]).find(d=>d.action===step.action);
  function heatText(st){
    if(isBurnt(st.item))return "已焦糊";
    if(st.job)return "加热中";
    if(st.heat)return itemName(st.item,book)+"可取";
    if(st.raw)return "选熟度 · E 点火";
    if(st.item)return itemName(st.item,book)+" · 已停火";
    return "";
  }
  function orderText(list){
    const counts=new Map();
    for(const id of list)counts.set(id,(counts.get(id)||0)+1);
    return [...counts].map(([id,n])=>recipeName(id)+" ×"+n).join("、");
  }
  {
    const div=document.createElement("details"),h=document.createElement("summary"),p=document.createElement("p");
    h.textContent=recipe.name+"　¥"+recipe.price+" / 份";
    const steps=recipe.steps.map(s=>{
      const station=stationFor(s);
      if(s.action==="portion")return "整条起锅放台面，拿净盘按空格分取，共 "+s.servings+" 份";
      if(recipe.variants && s.stages)return station.name+"煎至"+Object.values(recipe.variants).map(v=>v.name).join("或")+"，按订单熟度起锅";
      return station.name+" · "+s.inputs.map(i=>itemName(i,book)).join(" + ")+(s.action==="combine"?"，按住 E "+(s.verb || "捏制")+" → ":" → ")+itemName(s.output,book);
    });
    p.textContent=steps.join("　/　")+(recipe.steps.some(s=>s.action==="portion")?"。":"。到盘架装盘。");
    div.append(h,p);el("recipes").replaceChildren(div);
  }
  const poses=new Map();
  function draw(s,selected,me,focus,predicted,workFocus,choices,pinned,previewDoor){
    const now=performance.now();
    ctx.drawImage(floor,0,0);
    for(const edge of doors){
      const door=s.doors?.[edgeKey(edge)];
      drawDoor(ctx,edge,edge===previewDoor?{window:true}:door);
    }
    for(const f of s.fixtures){
      if(f===focus || f===workFocus || f===pinned){
        ctx.save();
        if(f===pinned)ctx.setLineDash([6,3]);
        ctx.strokeStyle=f===focus && choices.grab?"#fff6a8":f===workFocus && choices.work?"#9ce4e8":"#bdbba8";ctx.lineWidth=3;ctx.beginPath();
        ctx.roundRect(f.x*tile+2,f.y*tile+1,tile-4,tile-3,8);ctx.stroke();
        ctx.restore();
      }
      drawFixture(ctx,f,s.stations[f.id],s,book.tools[f.kind]);
    }
    for(const g of s.groups){
      if(g.stage==="done")continue;
      if(g.stage==="queue"){
        const index=s.queue.indexOf(g.id);
        if(index>=map.queue.length)continue;
        const pos=map.queue[index],x=midpoint(pos[0]),y=midpoint(pos[1]);
        drawPerson(ctx,x-(g.size===2?11:0),y,"customer",0);
        if(g.size===2)drawPerson(ctx,x+11,y+3,"customer",1);
        const ratio=patience(g,s.now),extra=s.queue.length-map.queue.length;
        drawSign(ctx,x,y+25,index===map.queue.length-1 && extra>0?"另有 "+extra+" 组":"等位","#83573c");drawMeter(ctx,x,y-30,ratio,barColor(ratio));
        continue;
      }
      for(const [i,seat] of g.seats.entries()){
        const [dx,dy]=dirs[seat.dir],chair=[seat.cell[0]-dx*.24,seat.cell[1]-dy*.24];
        let [x,y]=chair;
        const walker=g.walkers?.[i],travelling=g.stage==="walk" || g.stage==="leave";
        let facing=(seat.dir+2)%4;
        if(travelling && walker){
          x=walker.x;y=walker.y;
          const next=g.routes[i]?.[walker.index];
          if(next){
            const mx=next[0]-x,my=next[1]-y;
            if(Math.hypot(mx,my)>.01)facing=Math.abs(mx)>Math.abs(my)?(mx>0?3:1):(my>0?0:2);
          }
          if(g.stage==="leave"){
            const shift=.24*(1-clamp((s.now-g.since)/140));
            x-=dx*shift;y-=dy*shift;
          }
        }else if(travelling){
          const route=g.routes[i],last=route.length-1,t=clamp((s.now-g.since)/(g.due-g.since))*last;
          const point=k=>(g.stage==="walk"?k===last:k===0)?chair:route[k];
          const a=point(Math.floor(t)),b=point(Math.ceil(t));
          x=a[0]+(b[0]-a[0])*(t%1);y=a[1]+(b[1]-a[1])*(t%1);
        }else if(g.stage==="browse"){
          const shift=.24*(1-clamp((s.now-g.since)/140));
          x+=dx*shift;y+=dy*shift;
        }
        drawPerson(ctx,midpoint(x),midpoint(y),"customer",facing);
      }
      if(g.table && ["food","eat","leave"].includes(g.stage)){
        const f=s.fixtures.find(v=>v.id===g.table),tx=midpoint(f.x),ty=midpoint(f.y);
        g.served.forEach((id,i)=>drawItem(ctx,tx+(i-(g.size-1)/2)*24,ty+2,"plated:"+orderInfo(id,book).product,23));
      }
    }
    for(const [id,authoritative] of Object.entries(s.players)){
      if(authoritative.away){poses.delete(id);continue;}
      const p=id===me && predicted?predicted:authoritative;
      let pose=poses.get(id);
      if(!pose || pose.run!==s.run || pose.dashes!==p.dashes){pose={x:p.x,y:p.y,at:now,gait:0,run:s.run,dashes:p.dashes};poses.set(id,pose);}
      const blend=1-Math.exp(-(now-pose.at)/(me==="guest"?33:13));
      const dx=(p.x-pose.x)*blend,dy=(p.y-pose.y)*blend;
      pose.x+=dx;pose.y+=dy;pose.at=now;
      pose.gait+=Math.hypot(dx,dy)*4;
      const stride=Math.hypot(pose.x-p.x,pose.y-p.y)>.006?Math.sin(pose.gait):0;
      const x=midpoint(pose.x),y=midpoint(pose.y);
      if(id===me){
        ctx.fillStyle="#faf1a0";ctx.beginPath();ctx.ellipse(x,y+14,19,7,0,0,Math.PI*2);ctx.fill();
      }
      const effect=p.effect, t=effect?clamp((s.now-effect.at)/110):1;
      const working=p.form || p.scrub;
      const reach=working?2+Math.sin(s.now/65)*1.8:t<1?Math.sin(Math.PI*t)*5:0;
      const target=s.fixtures.find(f=>f.id===(working || (t<1 && effect.fixture)));
      const length=target && Math.hypot(target.x-p.x,target.y-p.y);
      const facing=length?[(target.x-p.x)/length,(target.y-p.y)/length]:dirs[p.dir];
      // Use the confirmed contact event for both clients; prediction only supplies position.
      const bump=authoritative.bump,age=bump?(s.motionTime ?? s.now)-bump.at:Infinity;
      const recoil=age>=0 && age<180?Math.sin(Math.PI*age/180)*(bump.strong?5:3):0;
      const leanX=facing[0]*reach-(bump?.x || 0)*recoil,leanY=facing[1]*reach-(bump?.y || 0)*recoil;
      drawPerson(ctx,x,y,id,p.dir,stride,leanX,leanY);
      const hx=x+(facing[0] || 1)*13+leanX,hy=y+1+leanY;
      if(effect?.item && t<1){
        const f=s.fixtures.find(v=>v.id===effect.fixture), travel=effect.pickup?1-t:t;
        drawItem(ctx,hx+(midpoint(f.x)-hx)*travel,hy+(midpoint(f.y)-hy)*travel-Math.sin(Math.PI*t)*9,effect.item,21);
      }else if(p.hand){
        drawItem(ctx,hx,hy,p.hand,21);
        trayContents(s,p.hand)?.forEach((item,i)=>drawItem(ctx,hx+i*12-6,hy-3,item,14));
      }
    }
    for(const f of s.fixtures){
      const d=book.tools[f.kind],st=s.stations[f.id],x=midpoint(f.x),y=midpoint(f.y);
      let label=name(f),color="#405b4c";
      if(d.action==="table"){
        const g=s.groups.find(v=>v.id===st.group);
        if(st.dirty){label+=" · 收盘"+st.dirty;color="#845832";}
        if(g){
          label=g.stage==="food"?"欠 "+g.remaining.length+" 份":waitName(g.stage);
          if(level.patience[g.stage]){
            const ratio=patience(g,s.now),meterY=f.y===0?y+42:y-50;
            drawMeter(ctx,x,meterY,ratio,barColor(ratio));
            if(g.stage==="food"){
              const ticketY=f.y===0?meterY+20:meterY-13,width=10+g.remaining.length*20;
              ctx.fillStyle="#fff8df";ctx.strokeStyle="#886d4c";ctx.lineWidth=1.5;ctx.beginPath();
              ctx.roundRect(x-width/2,ticketY-11,width,22,5);ctx.fill();ctx.stroke();
              g.remaining.forEach((id,i)=>drawItem(ctx,x+(i-(g.remaining.length-1)/2)*20,ticketY+1,orderInfo(id,book).product,18));
            }
          }
          color=g.stage==="food" || g.stage==="order"?"#984b32":"#5d705e";
        }
      }
      const ratioHeat=st.heat?clamp((st.readyAt-s.now)/(st.readyAt-st.heat.since)):0;
      const nearBurn=st.heat && isBurnt(st.heat.nextItem) && ratioHeat<.35;
      if(d.action==="cook" && (st.item || st.heat)){
        const shortName={omeletLog:"蛋烧可取",steakMedium:"五分可取",steakWell:"全熟可取"};
        label=nearBurn?"快焦了！":shortName[st.item] || heatText(st);
        if(st.heat?.nextItem==="steakWell" && ratioHeat<.35)label="即将全熟";
        color=isBurnt(st.item)?"#463a36":nearBurn?"#a4311e":st.item?"#396142":"#866028";
      }
      if(d.action==="wash" && (st.dirty || st.clean)){
        label="脏 "+st.dirty+" · 净 "+st.clean;
        color=isScrubbing(s,f,book)?"#207477":"#405b4c";
      }
      if(st.pending){label="按住"+boardVerb(recipe,st.pending);color="#956331";}
      if(d.action==="counter" && (st.item==="omeletLog" || st.item==="omelet"))label="蛋烧 · "+(st.item==="omeletLog"?2:1)+" 份";
      if(d.action==="plates")label+=" ×"+st.plates;
      if(st.raw)label="选熟度 · E 点火";
      if(d.action==="soak"){
        label=st.clean?"净盘 ×"+st.clean:st.batchEnd?"浸洗中":st.dirty?"脏 "+st.dirty+" · 可启动":"浸洗槽 0/3";
        if(st.batchEnd)drawMeter(ctx,x,y-30,(s.now-st.batchStart)/(st.batchEnd-st.batchStart),"#84d7df");
      }
      drawSign(ctx,x,y+26,label,color,tile-2);
      const grab=f===focus && choices.grab,work=f===workFocus && choices.work;
      if(grab || work)drawSign(ctx,x,y+(st.heat || st.pending?-15:-21),
        grab && work?"空格 / E":grab?"空格":"E",grab?"#66531e":"#24646a",tile-6);
      if(st.heat || st.pending || (d.action==="wash" && st.dirty)){
        const elapsed=d.action==="wash"?st.washed:st.formed;
        const ratio=st.heat?(st.item?ratioHeat:1-ratioHeat):elapsed/(d.seconds*1000);
        drawMeter(ctx,x,y-30,ratio,d.action==="wash"?"#84d7df":nearBurn?"#ff7156":st.heat && st.item?"#a5cf8b":"#f4c565");
      }
      if(f.id===selected && ["prep","won"].includes(s.phase)){
        ctx.strokeStyle="#b74b24";ctx.lineWidth=4;ctx.strokeRect(f.x*tile+2,f.y*tile+2,tile-4,tile-4);
        const [dx,dy]=dirs[f.dir];
        if(d.frontOnly){ctx.fillStyle="#ba502c";ctx.beginPath();ctx.arc(x+dx*31,y+dy*31,5,0,Math.PI*2);ctx.fill();}
      }
    }
    if(previewDoor)drawSign(ctx,midpoint(previewDoor.x),midpoint(previewDoor.y)+18,"改为传菜窗","#365e57",92);
  }
  const seatControls=el("seatControls");
  const seatButtons=dirs.map((_,dir)=>{
    const button=document.createElement("button");button.type="button";button.dataset.seatDir=dir;
    return button;
  });
  seatControls.replaceChildren(...seatButtons);
  let lastLayout="",lastTables="",lastQueue="",chefCell=null,seatKey="";
  return (s,{me,selected,room,notice,predicted})=>{
    const p=s.players[me];if(!p)return;
    const cell=buttons[Math.round(p.y)*map.width+Math.round(p.x)];
    if(chefCell!==cell){
      chefCell?.removeAttribute("aria-current");cell?.setAttribute("aria-current","location");chefCell=cell;
    }
    const prep=s.phase==="prep",finished=["lost","won"].includes(s.phase), host=me==="host";
    const editing=prep || (host && s.phase==="won");
    const table=editing && s.fixtures.find(f=>f.id===selected && book.tools[f.kind].action==="table");
    const seats=table && s.stations[table.id].seats;
    const editorKey=table?[table.id,table.x,table.y,table.dir,...seats.map(v=>[v.banned,v.blocked,v.reachable].join())].join("|"):"";
    seatControls.hidden=!table;
    if(editorKey!==seatKey && table){
      for(const seat of seats){
        const b=seatButtons[seat.dir],[dx,dy]=dirs[seat.dir];
        b.style.left=((table.x+.5+dx*.43)/map.width*100)+"%";
        b.style.top=((table.y+.5+dy*.43)/boardRows*100)+"%";
        const condition=seat.blocked?"遮挡":!seat.reachable?"不可达":"";
        b.dataset.status=seat.banned?"banned":condition?"blocked":"available";
        b.textContent=seat.banned?(condition?"×▧":"×"):condition?"▧":"✓";
        b.title=table.id.toUpperCase()+" 桌"+["下","左","上","右"][seat.dir]+"侧 · "+(condition?condition+" · ":"")+(seat.banned?"已禁坐":"允许入座");
        b.setAttribute("aria-label",b.title);b.setAttribute("aria-pressed",String(seat.banned));
        b.onclick=()=>toggleSeat(table,seat.side,!seat.banned);
      }
    }
    seatKey=editorKey;
    const pinned=s.phase==="open" && s.fixtures.find(f=>f.id===p.target);
    const focus=s.phase==="open" && interactionTarget(s,p,book,"grab");
    const workFocus=s.phase==="open" && interactionTarget(s,p,book,"work");
    const choices={grab:focus && verbs(s,p,focus,book).grab,work:workFocus && verbs(s,p,workFocus,book).work};
    const previewDoor=editing && selected && hovered && !s.fixtures.some(f=>f.x===hovered[0] && f.y===hovered[1]) &&
      doors.find(edge=>doorCells(edge).some(([x,y])=>x===hovered[0] && y===hovered[1]));
    phase=s.phase;draw(s,selected,me,focus,predicted,workFocus,choices,pinned,previewDoor);
    const layout=s.fixtures.map(f=>[f.id,f.x,f.y,f.dir,f.fitting].join()).join("|");
    if(layout!==lastLayout){
      lastLayout=layout;
      for(const b of buttons){
        const x=Number(b.dataset.x),y=Number(b.dataset.y),f=s.fixtures.find(f=>f.x===x && f.y===y);
        const label=f?name(f):"地面 "+(x+1)+" 列 "+(y+1)+" 行";
        b.dataset.fixture=f?.id || "";b.dataset.action=f?book.tools[f.kind].action:"";delete b.dataset.form;b.setAttribute("aria-label",label);b.title=label;
      }
    }
    for(const f of s.fixtures){
      const b=buttons[f.y*map.width+f.x],st=s.stations[f.id];
      const action=book.tools[f.kind].action;
      if(action==="combine")b.dataset.form=st.pending && !p.hand?"yes":"no";
      if(action==="cook" || action==="counter"){
        const state=action==="cook"?heatText(st):st.item?itemName(st.item,book)+(st.item==="omeletLog"?" · 2 份":st.item==="omelet"?" · 1 份":""):"";
        const label=name(f)+(state?" · "+state:"");
        if(label!==b.title){b.title=label;b.setAttribute("aria-label",label);}
      }
      if(book.tools[f.kind].action==="wash"){
        const label=name(f)+" · 脏盘 "+st.dirty+" / "+book.tools[f.kind].capacity+" · 净盘 "+st.clean;
        if(b.title!==label){b.title=label;b.setAttribute("aria-label",label);}
      }
      if(action==="soak"){
        const label=name(f)+" · 脏盘 "+st.dirty+" / 3 · 净盘 "+st.clean+(st.batchEnd?" · 浸洗中":st.dirty?" · 可启动":"");
        if(label!==b.title){b.title=label;b.setAttribute("aria-label",label);}
      }
    }
    const end=level.duration*1000, stage=prep?"营业准备":s.practice?"练习中":finished?(s.phase==="won"?"成功打烊":"营业失败"):s.now>=end?"停止来客 · 继续服务":"营业中";
    put(el("phase"),stage);
    put(el("roundPlan"),"第 "+s.round+" 关 · "+s.arrivals.length+" 组 / "+s.arrivals.reduce((n,a)=>n+a[1],0)+" 人");
    const day=clamp(1-s.now/end),dayBar=el("time");
    dayBar.parentElement.hidden=s.practice;
    if(dayBar.value!==Math.round(day*1000))dayBar.value=Math.round(day*1000);
    dayBar.style.setProperty("--fill",barColor(day));
    put(el("hand"),itemName(p.hand,book));put(el("served"),"已服务 "+s.stats.tables+" 桌");
    const connection=el("connection"),partner=s.players[host?"guest":"host"];
    put(connection,room?.ready?(host?"房主":"搭档")+" · "+Object.values(s.players).filter(v=>!v.away).length+" / 2":"单人经营");
    const partnerInfo=partner?"队友在 "+(Math.round(partner.x)+1)+" 列 "+(Math.round(partner.y)+1)+" 行 · "+itemName(partner.hand,book):"";
    if(connection.title!==partnerInfo)connection.title=partnerInfo;
    el("openShop").hidden=!prep || !host;
    el("practice").hidden=!host || (!prep && !s.practice);put(el("practice"),s.practice?"结束练习":"练习");
    el("grab").hidden=el("work").hidden=s.phase!=="open";
    put(el("grab"),"空格 · "+(choices.grab?choices.grab+"（"+name(focus)+"）":"拿放"));
    put(el("work"),"E · "+(choices.work?choices.work+"（"+name(workFocus)+"）":"工作"));
    el("rotate").hidden=!editing || !s.fixtures.some(f=>f.id===selected && (book.tools[f.kind].frontOnly || book.tools[f.kind].rotatable));
    el("roomButton").disabled=false;
    const chosen=s.fixtures.find(f=>f.id===selected);
    const hint=previewDoor?"摆在门边会改为传菜窗。厨师和顾客需从其他入口通行。":prep?(chosen?"已选"+name(chosen)+"。点空地搬动。"+(chosen.kind==="rack"?"按 R 旋转盘架，四周均可取盘。":"四周露出的边角均可操作。"):"可直接开门，或点设备再点空地调整布局。"):
      (pinned?"正前往"+name(pinned)+"。":"")+handHint(p.hand);
    put(el("hint"),notice || p.notice || (table?name(table)+" · "+seats.filter(v=>v.available).length+" 个有效座位。点桌边切换禁坐，点空地搬桌，R 旋转。✓ 可坐　▧ 受阻　× 禁坐":hint));
    const rows=s.fixtures.filter(f=>book.tools[f.kind].action==="table").map(f=>{
      const st=s.stations[f.id],g=s.groups.find(v=>v.id===st.group);
      let title="空桌",line=st.seats.filter(v=>v.available).length+" 个有效座位",bar="";
      if(st.dirty){title="待清桌";line="脏盘 ×"+st.dirty;}
      if(g){
        title="第 "+g.id+" 组 · "+g.size+" 人";
        line=waitName(g.stage)+(g.stage==="food"?" · 欠 "+orderText(g.remaining):"");
        if(level.patience[g.stage]){
          bar=meter("第 "+g.id+" 组"+waitName(g.stage)+"耐心",patience(g,s.now));
        }
      }
      return '<div class="table"><div><b>'+name(f)+'</b><span class="tag">'+title+'</span></div><p>'+line+'</p>'+bar+'</div>';
    }).join("");
    if(rows!==lastTables){el("tables").innerHTML=rows;lastTables=rows;}
    const queue=s.queue.slice(0,map.queue.length).map(id=>{
      const g=s.groups.find(v=>v.id===id);
      return "<span>第 "+id+" 组 · "+g.size+"人</span>"+meter("第 "+id+" 组等位耐心",patience(g,s.now));
    }).join("")+(s.queue.length>map.queue.length?"<span>另有 "+(s.queue.length-map.queue.length)+" 组</span>":"") || "暂无客人";
    if(queue!==lastQueue){el("queue").innerHTML=queue;lastQueue=queue;}
    const rack=s.fixtures.find(f=>book.tools[f.kind].action==="plates");
    const sink=s.fixtures.find(f=>book.tools[f.kind].action==="wash"), basin=s.stations[sink.id], cap=book.tools[sink.kind].capacity;
    const ownedPlates=level.plates+s.store.extraPlates,supply=s.practice?Math.max(ownedPlates,cap):ownedPlates;
    put(el("plateCount"),"盘架干净盘 "+s.stations[rack.id].plates+" / "+supply+(s.returns.length?" · 可取回搭档物品":"")+"　｜　"+(s.practice?"练习":"营业额")+" ¥"+s.stats.revenue+"　｜　池中脏盘 "+basin.dirty+" / "+cap+" · 净盘 "+basin.clean);
    const dialog=el("result");
    if(finished && !dialog.open){
      put(el("outcome"),stage);put(el("reason"),s.reason);
      el("totals").innerHTML="<dt>服务桌数</dt><dd>"+s.stats.tables+" 桌</dd><dt>售出份数</dt><dd>"+s.stats.sold+" 份</dd><dt>营业额</dt><dd>¥"+s.stats.revenue+"</dd>";
      el("again").disabled=!host;put(el("again"),host?(s.phase==="won"?"下一关":"重试本关"):"等待房主");
      if(s.phase==="lost")dialog.showModal();
    }else if(!finished && dialog.open)dialog.close();
  };
  function handHint(item){
    if(!item)return "空格拿放，E 接单或工作，也可以点工位走近操作。";
    if(item==="dirty")return "空格把脏盘放进水槽，再点 E 连续刷盘。";
    if(item==="plate")return "到放有成品的料理台或传菜台装盘。";
    if(item.startsWith("plated:"))return "到点了这道菜的桌边上菜；在空台面按 E 可撤盘。";
    if(isBurnt(item))return "把焦料拿到垃圾桶，按空格丢弃。";
    if(item==="omeletLog")return "放在台面上，再拿干净盘分取两份蛋烧。";
    if(hasProduct(recipe,item))return "到盘架给"+itemName(item,book)+"装盘。";
    const step=recipe.steps.find(step=>step.inputs.includes(item));
    const station=step && stationFor(step);
    return station?"把"+itemName(item,book)+"放到"+station.name+"，也可以暂放在传菜台。":"可以把手里的物品放在传菜台。";
  }
}
