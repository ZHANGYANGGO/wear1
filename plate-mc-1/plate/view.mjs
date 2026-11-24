import {drawFloor,drawFixture,drawItem,drawPerson,drawSign} from "./art.mjs";
import {itemName,dirs,orderInfo,isBurnt,hasProduct} from "./content.mjs";
import {waitName,interactionTarget,isScrubbing,verbs,boardVerb} from "./game.mjs";

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
export function createView(book,level,map,recipe,click,startForm,release){
  const canvas=el("scene"),rows=map.height+Number(!!map.outside);
  canvas.width=map.width*tile;canvas.height=rows*tile;
  el("kitchen").style.setProperty("--board-ratio",map.width/rows);
  const floor=document.createElement("canvas");floor.width=canvas.width;floor.height=canvas.height;
  drawFloor(floor.getContext("2d"),map);
  const ctx=canvas.getContext("2d"),cells=el("cells"),buttons=[];
  cells.style.gridTemplateColumns="repeat("+map.width+",1fr)";
  cells.replaceChildren();cells.style.gridTemplateRows="repeat("+rows+",1fr)";
  let phase="prep",pointer=null;
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const b=document.createElement("button");b.type="button";b.dataset.x=x;b.dataset.y=y;
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
  const name=f=>book.tools[f.kind].action==="table"?f.id.toUpperCase()+" 桌":book.tools[f.kind].name;
  const recipeName=id=>orderInfo(id,book).name;
  const stationFor=step=>step.station?book.tools[step.station]:map.fixtures.map(f=>book.tools[f.kind]).find(d=>d.action===step.action);
  function heatText(st){
    if(isBurnt(st.item))return "已焦糊";
    if(st.job)return "加热中";
    if(st.heat)return itemName(st.item,book)+"可取";
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
  function draw(s,selected,me,focus,predicted,choices){
    const now=performance.now();
    ctx.drawImage(floor,0,0);
    for(const f of s.fixtures){
      if(f===focus){
        ctx.strokeStyle=choices?.grab || choices?.work?"#fff6a8":"#bdbba8";ctx.lineWidth=4;ctx.beginPath();
        ctx.roundRect(f.x*tile+2,f.y*tile+1,tile-4,tile-3,8);ctx.stroke();
      }
      drawFixture(ctx,f,s.stations[f.id],s,book.tools[f.kind]);
    }
    for(const g of s.groups){
      if(g.stage==="done")continue;
      let x,y,seated;
      if(g.stage==="walk" || g.stage==="leave"){
        const t=Math.min(1,(s.now-g.since)/(g.due-g.since))*(g.route.length-1), a=g.route[Math.floor(t)],b=g.route[Math.ceil(t)];
        x=midpoint(a[0]+(b[0]-a[0])*(t%1));y=midpoint(a[1]+(b[1]-a[1])*(t%1));
      }else if(g.stage==="queue"){
        const pos=map.queue[Math.min(s.queue.indexOf(g.id),map.queue.length-1)];
        x=midpoint(pos[0]);y=midpoint(pos[1]);
      }else{
        seated=s.fixtures.find(v=>v.id===g.table);x=midpoint(seated.x);y=midpoint(seated.y);
      }
      if(seated){
        const angle=seated.dir*Math.PI/2,dx=24*Math.cos(angle),dy=24*Math.sin(angle);
        drawPerson(ctx,x-dx,y-dy,"customer",(seated.dir+3)%4);
        if(g.size===2)drawPerson(ctx,x+dx,y+dy,"customer",(seated.dir+1)%4);
      }else{
        drawPerson(ctx,x-(g.size===2?11:0),y,"customer",0);
        if(g.size===2)drawPerson(ctx,x+11,y+3,"customer",1);
      }
      if(g.table && ["food","eat","leave"].includes(g.stage)){
        const f=s.fixtures.find(v=>v.id===g.table),tx=midpoint(f.x),ty=midpoint(f.y);
        g.served.forEach((id,i)=>drawItem(ctx,tx+(i-(g.size-1)/2)*24,ty+2,"plated:"+orderInfo(id,book).product,23));
      }
      if(g.stage==="queue"){
        const ratio=patience(g,s.now);
        drawSign(ctx,x,y+25,"等位","#83573c");drawMeter(ctx,x,y-30,ratio,barColor(ratio));
      }
    }
    for(const [id,authoritative] of Object.entries(s.players)){
      const p=id===me && predicted?predicted:authoritative;
      let pose=poses.get(id);
      if(!pose || pose.run!==s.run){pose={x:p.x,y:p.y,at:now,gait:0,run:s.run};poses.set(id,pose);}
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
      const reach=working?2+Math.sin(s.now/65)*1.8:t<1?Math.sin(Math.PI*t)*5:0, facing=dirs[p.dir];
      drawPerson(ctx,x+facing[0]*reach,y+facing[1]*reach,id,p.dir,stride);
      const hx=x+(facing[0] || 1)*13,hy=y+1;
      if(effect?.item && t<1){
        const f=s.fixtures.find(v=>v.id===effect.fixture), travel=effect.pickup?1-t:t;
        drawItem(ctx,hx+(midpoint(f.x)-hx)*travel,hy+(midpoint(f.y)-hy)*travel-Math.sin(Math.PI*t)*9,effect.item,21);
      }else if(p.hand)drawItem(ctx,hx,hy,p.hand,21);
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
      drawSign(ctx,x,y+26,label,color,tile-2);
      if(st.heat || st.pending || (d.action==="wash" && st.dirty)){
        const elapsed=d.action==="wash"?st.washed:st.formed;
        const ratio=st.heat?(st.item?ratioHeat:1-ratioHeat):elapsed/(d.seconds*1000);
        drawMeter(ctx,x,y-30,ratio,d.action==="wash"?"#84d7df":nearBurn?"#ff7156":st.heat && st.item?"#a5cf8b":"#f4c565");
      }
      if(f.id===selected && s.phase==="prep"){
        ctx.strokeStyle="#b74b24";ctx.lineWidth=4;ctx.strokeRect(f.x*tile+2,f.y*tile+2,tile-4,tile-4);
        const [dx,dy]=dirs[f.dir];
        if(d.frontOnly){ctx.fillStyle="#ba502c";ctx.beginPath();ctx.arc(x+dx*31,y+dy*31,5,0,Math.PI*2);ctx.fill();}
      }
    }
    const chef=s.players[me];
    if(focus && !chef.path.length && (choices.grab || choices.work)){
      const pose=poses.get(me),x=Math.max(62,Math.min(canvas.width-62,midpoint(pose.x)));
      const y=midpoint(pose.y),side=focus.y>chef.y?-1:1;
      const action=choices.work && (!choices.grab || (s.stations[focus.id].pending && !chef.hand))?"E "+choices.work:"空格 "+choices.grab;
      drawSign(ctx,x,Math.max(12,Math.min(canvas.height-12,y+side*29)),action,"#284a41");
    }
  }
  let lastLayout="",lastTables="",lastQueue="",chefCell=null;
  return (s,{me,selected,room,notice,predicted})=>{
    const p=s.players[me];if(!p)return;
    const cell=buttons[Math.round(p.y)*map.width+Math.round(p.x)];
    if(chefCell!==cell){
      chefCell?.removeAttribute("aria-current");cell?.setAttribute("aria-current","location");chefCell=cell;
    }
    const prep=s.phase==="prep",finished=["lost","won"].includes(s.phase), host=me==="host";
    const focus=s.phase==="open" && (s.fixtures.find(f=>f.id===p.target) || interactionTarget(s,p,book));
    const choices=focus?verbs(s,p,focus,book):{};
    phase=s.phase;draw(s,selected,me,focus,predicted,choices);
    const layout=s.fixtures.map(f=>[f.id,f.x,f.y,f.dir].join()).join("|");
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
    }
    const end=level.duration*1000, stage=prep?"营业准备":s.practice?"练习中":finished?(s.phase==="won"?"成功打烊":"营业失败"):s.now>=end?"停止来客 · 继续服务":"营业中";
    put(el("phase"),stage);
    const day=clamp(1-s.now/end),dayBar=el("time");
    dayBar.parentElement.hidden=s.practice;
    if(dayBar.value!==Math.round(day*1000))dayBar.value=Math.round(day*1000);
    dayBar.style.setProperty("--fill",barColor(day));
    put(el("hand"),itemName(p.hand,book));put(el("served"),"已服务 "+s.stats.tables+" 桌");
    put(el("connection"),room?.ready?(host?"房主":"搭档")+" · "+Object.keys(s.players).length+" / 2":"单人经营");
    el("openShop").hidden=!prep || !host;
    el("practice").hidden=!host || (!prep && !s.practice);put(el("practice"),s.practice?"结束练习":"练习");
    el("grab").hidden=el("work").hidden=s.phase!=="open";
    put(el("grab"),"空格 · "+(choices.grab || "拿放"));put(el("work"),"E · "+(choices.work || "工作"));
    el("rotate").hidden=!prep || !s.fixtures.some(f=>f.id===selected && book.tools[f.kind].frontOnly);
    el("roomButton").disabled=!room && !prep;
    const chosen=s.fixtures.find(f=>f.id===selected);
    const hint=prep?(chosen?"已选"+name(chosen)+"。点空地搬动。"+(book.tools[chosen.kind].frontOnly?"按 R 改变操作面。":"四周相邻的通道均可操作。"):"可直接开门，或点设备再点空地调整布局。"):
      (focus?"当前工位 · "+name(focus)+"　":"")+handHint(p.hand);
    put(el("hint"),notice || p.notice || hint);
    const rows=s.fixtures.filter(f=>book.tools[f.kind].action==="table").map(f=>{
      const st=s.stations[f.id],g=s.groups.find(v=>v.id===st.group);
      let title="空桌",line="可以入座",bar="";
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
    const queue=s.queue.map(id=>{
      const g=s.groups.find(v=>v.id===id);
      return "<span>第 "+id+" 组 · "+g.size+"人</span>"+meter("第 "+id+" 组等位耐心",patience(g,s.now));
    }).join("") || "暂无客人";
    if(queue!==lastQueue){el("queue").innerHTML=queue;lastQueue=queue;}
    const rack=s.fixtures.find(f=>book.tools[f.kind].action==="plates");
    const sink=s.fixtures.find(f=>book.tools[f.kind].action==="wash"), basin=s.stations[sink.id], cap=book.tools[sink.kind].capacity;
    const supply=s.practice?Math.max(level.plates,cap):level.plates;
    put(el("plateCount"),"盘架干净盘 "+s.stations[rack.id].plates+" / "+supply+(s.returns.length?" · 可取回搭档物品":"")+"　｜　"+(s.practice?"练习":"营业额")+" ¥"+s.stats.revenue+"　｜　池中脏盘 "+basin.dirty+" / "+cap+" · 净盘 "+basin.clean);
    const dialog=el("result");
    if(finished && !dialog.open){
      put(el("outcome"),stage);put(el("reason"),s.reason);
      el("totals").innerHTML="<dt>服务桌数</dt><dd>"+s.stats.tables+" 桌</dd><dt>售出份数</dt><dd>"+s.stats.sold+" 份</dd><dt>营业额</dt><dd>¥"+s.stats.revenue+"</dd>";
      el("again").disabled=!host;put(el("again"),host?"再玩一次":"等待房主重开");
      dialog.showModal();
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
