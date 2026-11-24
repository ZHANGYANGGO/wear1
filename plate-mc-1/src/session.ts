import type { BrowserRoom } from "./browser-room";
import {Campaign,operationId,type RunView,type Command} from "../shared/campaign";
import {presetOf} from "../shared/catalog";
import {idle,type Action,type Controls,type Scenario,type Snapshot} from "../shared/moving";

const params=new URLSearchParams(location.search);
const preset=presetOf(params.get("order"));
const seed=Number(params.get("seed")??7)>>>0;
const saveKey="moving-day/run-v1/"+preset+"/"+seed;
class MovingSession {
  private local=new Campaign(preset,seed);
  private savedAt=0;
  private lastInput="";
  room?:BrowserRoom;
  id="local";
  frame!:Snapshot;
  run!:RunView;
  note="";
  onDisconnect=(_message:string)=>{};
  constructor(){
    try{
      const data=sessionStorage.getItem(saveKey);
      if(data)this.local=Campaign.restore(JSON.parse(data));
    }catch{this.note="存档无法读取，可以开始新游戏。";}
    this.local.world.add(this.id);
    this.refresh();
    const checkpoint=()=>{this.drive(idle());if(this.room)this.room.checkpoint();else this.persist();};
    addEventListener("pagehide",e=>{checkpoint();if(!e.persisted)this.room?.leave(false);});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)checkpoint();});
  }
  private refresh(now=Date.now()){
    this.local.advance(now);
    this.frame=this.local.world.snapshot();
    this.run=this.local.view(now);
  }
  private persist(){
    try{sessionStorage.setItem(saveKey,JSON.stringify(this.local.save()));this.savedAt=Date.now();return true;}
    catch{this.note="本局保存失败，请检查浏览器存储空间。";return false;}
  }
  solo(){
    const old=this.room;this.room=undefined;old?.leave(true);
    this.id="local";this.lastInput="";this.refresh();
  }
  async connect(code?:string,recover=false){
    this.drive(idle());this.persist();
    const {BrowserRoom}=await import("./browser-room");
    const room:BrowserRoom=new BrowserRoom(code,preset,seed,{
      frame:data=>{if(this.room===room){this.frame=data.frame;this.run=data.run;}},
      notice:message=>{if(this.room===room)this.note=message;},
      disconnect:message=>{if(this.room===room){this.solo();this.onDisconnect(message);}},
    },recover);
    this.room=room;this.id=room.role;this.lastInput="";this.note="";
    try{await room.open();}catch(e){room.leave(false);this.solo();throw e;}
    return room.roomId;
  }
  drive(v:Controls){
    if(!this.room){this.local.input(this.id,v,Date.now());return;}
    const key=this.run.token+"/"+[v.x,v.y,v.turn].join(",");
    if(this.room.status){this.lastInput="";return;}
    if(key!==this.lastInput){this.room.send({kind:"input",controls:v,token:this.run.token});this.lastInput=key;}
  }
  tick(v:Controls){
    const before=this.run.phase;
    this.drive(v);
    if(!this.room){
      this.refresh();
      if(before!==this.run.phase || (this.run.phase==="moving" && Date.now()-this.savedAt>=250))this.persist();
    }
  }
  act(a:Action){
    if(this.room)this.room.send({kind:"action",action:a,token:this.run.token});
    else {this.local.act(this.id,a,Date.now());this.refresh();this.persist();}
  }
  command(type:Command["type"],product?:string,confirm=false){
    const c:Command={type,product,confirm,token:this.run.token,op:operationId()};
    this.note="";
    if(this.room){this.room.send({kind:"command",command:c});return;}
    const previous=this.local.save();
    this.note=this.local.command(this.id,c,Date.now());
    this.refresh();
    if(!this.persist()){this.local=Campaign.restore(previous);this.refresh();}
  }
  newLocalRun(){
    if(this.room)return;
    const previous=this.local;
    this.local=new Campaign(preset,seed);
    this.local.world.add(this.id);
    this.local.command(this.id,{type:"new",token:this.local.token,op:"new"},Date.now());
    if(!this.persist())this.local=previous;
    else this.note="";
    this.refresh();
  }
  restart(scenario?:Scenario){this.command(scenario && scenario!==this.frame.scenario?"wet":"reset");}
}
export const session=new MovingSession();
