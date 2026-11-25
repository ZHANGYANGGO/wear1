import {Kitchen,canPortion,interactionTarget} from "./game.mjs";
import {catalog} from "./content.mjs";
import {createView} from "./view.mjs";
import {Room} from "./room.mjs";
import {createPicker} from "./map-picker.mjs";
import {marketView} from "./market-view.mjs";

export function launch(book=catalog,level="first"){
  let game=new Kitchen(book,level),s=game.s,me="host",room=null,selected=null,notice="",last=performance.now();
  const saveKey="mountain-kitchen.store."+level;
  function readStore(){
    try{const data=JSON.parse(localStorage.getItem(saveKey));if(data)game.restore(data.state ?? data);}
    catch{notice="未能读取本机店铺存档。";}
    s=game.s;
  }
  readStore();
  let savedAt=last;
  function save(){
    if((room && !room.host) || me==="guest")return;
    try{localStorage.setItem(saveKey,JSON.stringify({version:1,state:game.s}));savedAt=performance.now();}
    catch{notice="浏览器未能保存本店进度，请检查本地存储空间。";}
  }
  const $=id=>document.getElementById(id);
  function label(id,value){const el=$(id);if(el.textContent!==value)el.textContent=value;}
  let moves=[],snapshotAt=0,latency=0;
  function send(command){
    command.run=s.run;notice="";
    if(s.phase==="open" && (command.type==="work" || command.type==="use"))
      command.focus=interactionTarget(s,s.players[me],book,command.type==="work"?"work":"grab")?.id ?? null;
    if(s.phase==="open" && s.players[me]?.hand==="plate" && ["go","use"].includes(command.type)){
      const f=command.type==="go"?s.fixtures.find(f=>f.x===command.x && f.y===command.y):interactionTarget(s,s.players[me],book);
      if(canPortion(s,s.players[me],f,book))command.intent="portion";
    }
    if(room && !room.host){
      room.send(command);
      if(["drive","go","stop"].includes(command.type)){
        const {x=0,y=0}=command.type==="drive"?command:{};
        moves.push({seq:room.sequence,at:performance.now(),x,y});
      }
    }
    else {advance();game.command("host",command);s=game.s;save();room?.publish();}
    paint();
  }
  function place(x,y,rotate=false){
    const f=s.fixtures.find(v=>v.id===selected);if(!f)return;
    send({type:"place",id:f.id,from:[f.x,f.y,f.dir].join(","),x,y,dir:(f.dir+(rotate?1:0))%4});
  }
  function cell(x,y,hold=false){
    if(market.chooseCell(x,y))return;
    if(s.phase==="prep" || s.phase==="won"){
      const f=s.fixtures.find(v=>v.x===x && v.y===y);
      if(f){selected=f.id;notice="";paint();}else if(selected)place(x,y);
    }else {held.clear();send({type:"go",x,y,intent:hold?"form":"auto"});}
  }
  const held=new Set();
  let holding=false;
  function release(){
    if(holding){holding=false;send({type:"release"});}
  }
  const picker=createPicker(book,game.level);
  const market=marketView(()=>game,send,paint);
  let render,mapDrawn=null,recipeDrawn=null,pickerRun=null;
  function predictedPose(){
    const p=s.players.guest;
    if(me!=="guest" || !p || !["open","prep"].includes(s.phase))return null;
    const now=performance.now(),pose={...p};
    let at=Math.max(now-150,snapshotAt-latency/2),dx=p.dx,dy=p.dy;
    for(const move of moves){
      game.predict(pose,dx,dy,Math.max(0,move.at-at));
      at=Math.max(move.at,at);dx=move.x;dy=move.y;
    }
    game.predict(pose,dx,dy,Math.min(150,Math.max(0,now-at)));
    return pose;
  }
  function paint(){
    const picking=s.phase==="select",host=me==="host" && (!room || room.host);
    $("todayMenu").hidden=picking;
    $("mapPicker").hidden=!picking;$("kitchen").hidden=picking;document.querySelector(".help").hidden=picking;
    if(picking){
      market.render(game,s,me,host);
      label("shopName","山间食堂");
      if($("result").open)$("result").close();
      if(pickerRun!==s.run){picker.setRecipe(s.recipe);picker.preview(s.map);pickerRun=s.run;selected=null;held.clear();holding=false;}
      $("recipeChoice").disabled=!host;
      $("cancelMap").hidden=!host || !s.canCancel;$("chooseMap").disabled=!host;
      if(!host)label("chooseMap","等待房主确认店面");
      $("roomButton").disabled=false;
      label("connection",room?.ready?(host?"房主":"搭档")+" · "+Object.keys(s.players).length+" / 2":"单人经营");
      return;
    }
    pickerRun=null;
    if($("replaceLayout").open)$("replaceLayout").close();
    if(mapDrawn!==s.map || recipeDrawn!==s.recipe){
      selected=null;mapDrawn=s.map;recipeDrawn=s.recipe;
      label("todayMenu","今日供应 · "+game.recipe.name);
      render=createView(book,game.level,game.map,game.recipe,cell,(x,y)=>{holding=true;cell(x,y,true);},release,
        (f,side,banned)=>send({type:"seat",id:f.id,from:[f.x,f.y,f.dir].join(),side,banned}));
    }
    label("shopName",game.map.name || "山间食堂");
    $("browseMaps").hidden=!(host && game.level.maps && ["prep","won"].includes(s.phase));
    label("browseMaps","更换菜谱或店面");
    $("resultMaps").hidden=!(host && game.level.maps);
    render(s,{me,selected,room,notice,predicted:predictedPose()});
    market.render(game,s,me,host);
    $("reclaim").hidden=!host || !s.players.guest?.away || !s.players.guest.hand;
  }
  function advance(){
    const now=performance.now();
    if(!room || room.host){
      const phase=game.s.phase;game.advance(now-last);
      if(phase!==game.s.phase || (game.s.phase==="open" && now-savedAt>=1000))save();
    }
    last=now;
  }
  function frame(){advance();paint();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  // A hidden host still drives the kitchen and publishes to the visible guest.
  setInterval(()=>{advance();room?.publish();if(document.hidden)paint();},50);
  $("rotate").onclick=()=>{const f=s.fixtures.find(v=>v.id===selected);if(f)place(f.x,f.y,true);};
  $("openShop").onclick=()=>{send({type:"open"});if(s.phase!=="prep")selected=null;};
  $("again").onclick=()=>{selected=null;send({type:"reset"});};
  $("browseMaps").onclick=$("resultMaps").onclick=()=>send({type:"browse"});
  $("cancelMap").onclick=()=>send({type:"cancelMap"});
  const confirmSelection=()=>send({type:"choose",map:picker.current,recipe:picker.recipe});
  $("chooseMap").onclick=()=>{
    const changed=s.canCancel && s.previousPhase!=="lost" && (s.map!==picker.current || s.recipe!==picker.recipe) && (s.round>1 || s.fixtures.some(f=>{
      const original=game.map.fixtures.find(v=>v.id===f.id);
      return !original || f.attachment || f.x!==original.x || f.y!==original.y || f.dir!==original.dir || !!f.banned;
    }));
    if(changed)$("replaceLayout").showModal();
    else confirmSelection();
  };
  $("keepLayout").onclick=()=>$("replaceLayout").close();
  $("replaceMap").onclick=()=>{$("replaceLayout").close();confirmSelection();};
  $("practice").onclick=()=>{selected=null;send({type:s.practice?"endPractice":"practice"});};
  $("grab").onclick=()=>send({type:"use"});
  let heldWorkButton=false;
  $("work").onpointerdown=e=>{
    heldWorkButton=false;
    if(e.button!==0)return;
    const p=s.players[me],f=interactionTarget(s,p,book,"work");
    if(!f || !s.stations[f.id].pending)return;
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    heldWorkButton=true;holding=true;send({type:"work"});
  };
  $("work").onlostpointercapture=release;
  $("work").onclick=e=>{
    // A discrete action changes button labels and layout. Commit after touch-up.
    if(!heldWorkButton || e.detail===0){send({type:"work"});send({type:"release"});}
    heldWorkButton=false;
  };
  $("result").oncancel=e=>e.preventDefault();
  const keys={KeyW:2,ArrowUp:2,KeyS:0,ArrowDown:0,KeyA:1,ArrowLeft:1,KeyD:3,ArrowRight:3};
  function drive(){
    const directions=new Set([...held].map(key=>keys[key]));
    send({type:"drive",x:Number(directions.has(3))-Number(directions.has(1)),y:Number(directions.has(0))-Number(directions.has(2))});
  }
  function stopInput(){
    held.clear();holding=false;
    if(["prep","open"].includes(s.phase))send({type:"stop"});
  }
  addEventListener("keydown",e=>{
    if(s.phase==="select" || document.querySelector("dialog[open]") || e.altKey || e.ctrlKey || e.metaKey)return;
    if(market.placing()){
      if(!e.repeat && e.code==="KeyR")$("turnPreview").click();
      if(e.code==="Escape")$("cancelPlace").click();
      return;
    }
    if(e.code==="KeyQ" && !e.repeat && s.phase==="open"){market.cycle();return;}
    if(e.key==="Shift" && !e.repeat){send({type:"dash"});return;}
    if(Object.hasOwn(keys,e.code)){
      e.preventDefault();if(!e.repeat && !held.has(e.code)){held.add(e.code);drive();}
    }
    if(s.phase==="open" && (e.code==="Space" || e.code==="KeyE")){
      e.preventDefault();if(!e.repeat){
        if(e.code==="KeyE")holding=true;
        send({type:e.code==="Space"?"use":"work"});
      }
    }
    if(["prep","won"].includes(s.phase) && e.code==="KeyR" && !e.repeat)$("rotate").click();
  });
  addEventListener("keyup",e=>{
    if(e.key==="Shift" && !e.shiftKey)send({type:"dashRelease"});
    if(held.delete(e.code)){e.preventDefault();drive();}
    if(e.code==="KeyE")release();
  });
  addEventListener("blur",stopInput);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)stopInput();});
  function updateLobby(msg=""){
    const joined=!!room?.ready;
    $("lobby").hidden=joined;$("hosting").hidden=!joined;
    $("createRoom").disabled=!!room;$("joinRoom").disabled=!!room;
    $("network").textContent=msg;$("roomCode").textContent=joined?room.code:"";
    $("roomInfo").textContent=me==="host"?"将房间号发给搭档，保持房主页面打开。":"你已加入房主的厨房。";
  }
  function exitRoom(msg){
    const wasGuest=room && !room.host;room?.close();room=null;
    if(wasGuest){game=new Kitchen(book,level);readStore();selected=null;}
    else {game.removeGuest();save();}
    me="host";moves=[];latency=0;pickerRun=null;s=game.s;last=performance.now();notice=msg;updateLobby(msg);paint();
  }
  function connect(code){
    if(room)return;
    if(code!==undefined && !/^[0-9A-F]{10}$/.test(code)){updateLobby("请输入 10 位房间号。");return;}
    room=new Room(code,{
      ready:()=>{updateLobby();if(me==="guest")$("roomDialog").close();paint();},
      canJoin:returning=>returning || ["select","prep","won"].includes(game.s.phase)?"":"已经开门，仅原搭档可以重连。",
      state:()=>game.s, frame:(state,ack)=>{
        snapshotAt=performance.now();
        if(state.run!==s.run || state.phase!==s.phase)moves=[];
        const confirmed=moves.filter(m=>m.seq<=ack);
        if(confirmed.length)latency=Math.min(200,snapshotAt-confirmed.at(-1).at);
        moves=moves.filter(m=>m.seq>ack);
        me="guest";game.s=s=state;paint();
      },
      act:c=>{advance();game.command("guest",c);s=game.s;save();paint();},
      join:returning=>{if(!returning && game.s.players.guest?.away)game.removeGuest();game.addPlayer("guest");notice="搭档已加入。";save();paint();},
      left:()=>{game.parkGuest();notice="搭档已离线。可以继续营业，或收回搭档持物。";save();paint();},
      error:msg=>exitRoom(msg),
    });
    updateLobby("正在连接配对服务…");
    try{room.open();}catch{exitRoom("连接失败，请检查网络。");}
  }
  $("roomButton").onclick=()=>{stopInput();updateLobby();$("roomDialog").showModal();};
  $("createRoom").onclick=()=>connect();
  $("joinRoom").onclick=()=>connect($("code").value.trim().toUpperCase());
  $("code").onkeydown=e=>{if(e.key==="Enter")$("joinRoom").click();};
  $("copy").onclick=async()=>{
    try{await navigator.clipboard.writeText(room.code);$("network").textContent="房间号已复制。";}
    catch{$("network").textContent="请选中上方的房间号复制。";}
  };
  $("leave").onclick=()=>{exitRoom("已退出房间。");$("roomDialog").close();};
  $("reclaim").onclick=()=>send({type:"reclaim"});
  addEventListener("pagehide",()=>{if(s.phase!=="select" || s.canCancel)save();room?.close();},{once:true});
  paint();
}
