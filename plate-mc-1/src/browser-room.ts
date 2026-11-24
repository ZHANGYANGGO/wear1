import Peer, { type DataConnection } from "peerjs";
import { Campaign, operationId, type Command, type RunView } from "../shared/campaign";
import type { Preset } from "../shared/catalog";
import type { Action, Controls, Snapshot } from "../shared/moving";
import { rememberHost, restoreHost, saveHost } from "./room-save";

type Request = {kind:"input"; token:string; controls:Controls}
  | {kind:"action"; token:string; action:Action} | {kind:"command"; command:Command};
type Frame = {kind:"frame"; frame:Snapshot; run:RunView};
type Reply = Frame | {kind:"notice"|"ended"|"full"; message:string};
type Callbacks = {frame:(f:Frame)=>void; notice:(s:string)=>void; disconnect:(s:string)=>void};

const hostAddress=(room:string)=>"moving-day-v1-"+room;
const networkError="未能连接到搭档。请确认房主页面已打开，或换一个网络后重试。";

// A host is the sole writer of the team's physics, clock and ledger.
// Signaling establishes a data channel. Only the data channel carries game packets.
export class BrowserRoom {
  readonly roomId:string;
  readonly role:"host"|"guest";
  status="";
  private game?:Campaign;
  private peer?:Peer;
  private link?:DataConnection;
  private timer=0;
  private closed=false;
  private started=false;
  private resuming=false;
  private guestKey="";
  private savedAt=0;
  private savedToken="";
  private connectingSince=0;
  private nextAttempt=0;
  private lastDial=0;
  private lastFrameAt=0;
  private ready?:()=>void;
  private failed?:(e:Error)=>void;
  private releaseHost?:()=>void;

  constructor(code:string|undefined, preset:Preset, seed:number, private callbacks:Callbacks, recover=false){
    this.roomId=code?.trim().toUpperCase() || operationId().slice(0,10).toUpperCase();
    if(!/^[A-F0-9]{10}$/.test(this.roomId))throw Error("房间号应为 10 位数字或字母 A–F。");
    this.resuming=!!code && (recover || history.state?.hostRoom===this.roomId);
    this.role=!code || this.resuming?"host":"guest";
    if(this.role==="host"){
      this.game=new Campaign(preset,seed);
      this.game.command("host",{type:"new",op:operationId(),token:this.game.token},Date.now());
      this.game.world.add("host");
    }else{
      const key="moving-day/guest-v1/"+this.roomId;
      this.guestKey=sessionStorage.getItem(key) || operationId();
      sessionStorage.setItem(key,this.guestKey);
    }
  }

  async open():Promise<void>{
    // A second tab must not write a stale checkpoint during a signaling outage.
    if(this.game && navigator.locks){
      await new Promise<void>((acquired,reject)=>{
        navigator.locks.request(hostAddress(this.roomId),{ifAvailable:true},lock=>{
          if(!lock){reject(Error("这间房已在另一个标签页主持。"));return;}
          acquired();
          return new Promise<void>(release=>{this.releaseHost=release;});
        }).catch(reject);
      });
      if(this.closed){this.releaseHost?.();throw Error("房间已关闭。");}
    }
    return new Promise((resolve,reject)=>{
      this.ready=resolve;this.failed=reject;
      this.connectingSince=Date.now();
      this.register();
      this.timer=window.setInterval(()=>this.update(),50);
    });
  }

  private register(){
    const id=this.role==="host"?hostAddress(this.roomId):"moving-guest-"+operationId();
    const peer=this.peer=new Peer(id,{secure:true});
    peer.on("open",()=>{
      if(this.closed || this.peer!==peer)return;
      if(this.game){
        // Read the freshest checkpoint after exclusive signaling ID registration.
        if(!this.started){
          try{
            if(this.resuming)this.game=restoreHost(this.roomId);
          }catch(e){this.fail(e instanceof Error?e.message:"无法读取团队存档。");return;}
        }
        this.game.advance(Date.now());
        if(!this.checkpoint()){this.fail("无法保存团队进度，请检查浏览器存储权限。");return;}
        try{rememberHost(this.roomId);}catch{this.fail("无法保存房间号，请检查浏览器存储权限。");return;}
        this.status="";this.connected();this.broadcast();
      }else this.dial();
    });
    peer.on("connection",conn=>{
      if(this.closed || this.peer!==peer || !this.game){conn.close();return;}
      conn.on("open",()=>{
        if(this.closed || this.peer!==peer){conn.close();return;}
        const key=conn.metadata?.guestKey;
        if(conn.label!=="moving-v1" || typeof key!=="string" || !/^[a-f0-9]{32}$/.test(key)
            || (this.link?.open && key!==this.guestKey)){
          conn.send({kind:"full",message:"房间已有两名玩家。"});
          window.setTimeout(()=>conn.close(),250);return;
        }
        const old=this.link;this.link=conn;old?.close();
        this.guestKey=key;this.game!.world.add("guest");this.broadcast();
      });
      conn.on("data",data=>{if(this.link===conn)this.apply("guest",data as Request);});
      const left=()=>{
        if(this.link!==conn)return;
        this.link=undefined;this.game!.advance(Date.now());this.game!.world.remove("guest");
        this.checkpoint();this.broadcast();
      };
      conn.on("close",left);conn.on("error",left);
    });
    peer.on("error",e=>{
      if(this.closed || this.peer!==peer)return;
      if(e.type==="peer-unavailable" && !this.game){this.dropLink();return;}
      if(e.type==="unavailable-id" && this.resuming && !this.started){
        this.peer=undefined;peer.destroy();this.nextAttempt=Date.now()+1000;return;
      }
      if(!this.started){this.fail("无法建立房间连接。请检查网络及公共配对服务后重试。");return;}
      if(peer.destroyed){this.peer=undefined;this.nextAttempt=Date.now()+1000;}
    });
    peer.on("disconnected",()=>{
      if(this.closed || this.peer!==peer)return;
      this.nextAttempt=Date.now()+1000;
    });
  }

  private connected(){
    this.started=true;this.connectingSince=0;
    this.ready?.();this.ready=undefined;this.failed=undefined;
  }

  private dial(){
    if(!this.peer?.open || this.link || this.closed)return;
    this.lastDial=Date.now();
    const conn=this.link=this.peer.connect(hostAddress(this.roomId),{
      label:"moving-v1",metadata:{guestKey:this.guestKey},serialization:"json",reliable:true,
    });
    conn.on("data",data=>{
      if(this.link!==conn || this.closed)return;
      const msg=data as Reply;
      if(msg?.kind==="frame"){
        this.lastFrameAt=Date.now();this.status="";this.connected();this.callbacks.frame(msg);
      }else if(msg?.kind==="notice")this.callbacks.notice(msg.message);
      else if(msg?.kind==="full" || msg?.kind==="ended")this.fail(msg.message);
    });
    const lost=()=>{if(this.link===conn)this.dropLink();};
    conn.on("close",lost);conn.on("error",lost);
  }

  private dropLink(){
    const old=this.link;this.link=undefined;old?.close();
    if(!this.connectingSince)this.connectingSince=Date.now();
    if(this.started)this.status="正在重新连接房主…";
    this.nextAttempt=Date.now()+900;
  }

  private update(){
    const now=Date.now();
    if(this.connectingSince && now-this.connectingSince>25000){this.fail(networkError);return;}
    if(now>=this.nextAttempt){
      if(!this.peer || this.peer.destroyed)this.register();
      else if(this.peer.disconnected && !this.peer.destroyed){
        this.nextAttempt=now+2000;this.peer.reconnect();
      }else if(!this.game && !this.link)this.dial();
    }
    if(!this.game && this.link){
      const quietSince=Math.max(this.lastDial,this.lastFrameAt);
      if(now-quietSince>(this.link.open?12000:7000))this.dropLink();
    }
    if(this.started && this.game){
      this.game.advance(now);
      if(this.savedToken!==this.game.token || (this.game.state.phase==="moving" && now-this.savedAt>=250))this.checkpoint();
      this.broadcast();
    }
  }

  private broadcast(){
    if(!this.game || this.closed)return;
    const data:Frame={kind:"frame",frame:this.game.world.snapshot(),run:this.game.view(Date.now())};
    this.callbacks.frame(data);
    if(this.link?.open && this.link.dataChannel.bufferedAmount<65536)this.link.send(data);
  }

  checkpoint(){
    if(!this.game || this.closed || (!this.started && !this.peer?.open))return true;
    try{
      saveHost(this.roomId,this.game);
      this.savedAt=Date.now();this.savedToken=this.game.token;return true;
    }catch{this.callbacks.notice("团队进度保存失败，请检查浏览器存储空间。");return false;}
  }

  send(request:Request){
    if(!this.started || this.closed)return;
    if(this.game)this.apply("host",request);
    else if(this.link?.open && !this.connectingSince)this.link.send(request);
  }

  private apply(id:"host"|"guest",msg:Request){
    const game=this.game;
    if(!game || !msg || !game.world.movers.has(id))return;
    const now=Date.now();
    if(msg.kind==="input" && msg.token===game.token){
      const v=msg.controls;
      if(v && [v.x,v.y,v.turn].every(n=>Number.isFinite(n) && Math.abs(n)<=1))game.input(id,v,now);
    }else if(msg.kind==="action" && msg.token===game.token && (msg.action==="use" || msg.action==="grab")){
      game.act(id,msg.action,now);this.checkpoint();this.broadcast();
    }else if(msg.kind==="command"){
      const c=msg.command;
      if(!c || typeof c.op!=="string" || !c.op || c.op.length>100)return;
      const previous=game.save();
      let message=game.command(id,c,now);
      if(!this.checkpoint()){
        this.game=Campaign.restore(previous);message="本次操作保存失败，请重试。";
      }
      if(message){
        if(id==="host")this.callbacks.notice(message);
        else if(this.link?.open)this.link.send({kind:"notice",message});
      }
      this.broadcast();
    }
  }

  private fail(message:string){
    const reject=this.failed;
    this.leave(false);
    if(reject)reject(Error(message));else this.callbacks.disconnect(message);
  }

  leave(endRoom:boolean){
    if(this.closed)return;
    if(this.started && this.game)this.checkpoint();
    this.closed=true;clearInterval(this.timer);
    if(endRoom && this.game && this.link?.open)this.link.send({kind:"ended",message:"房主已离开本局。"});
    this.peer?.destroy();this.releaseHost?.();
  }
}

