import Peer from "peerjs";

const protocol="onigiri-v6",prefix="onigiri-shop-v6-";
const roomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(5)),v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();

// PeerServer introduces the two browsers. Only the host accepts game commands.
export class Room {
  constructor(code,callbacks){
    this.host=!code;this.code=code || roomCode();this.callbacks=callbacks;
    this.sequence=0;this.received=0;this.closed=false;this.ready=false;
  }
  open(){
    const peer=this.peer=new Peer(prefix+(this.host?this.code:"guest-"+roomCode()),{secure:true});
    this.timeout=setTimeout(()=>this.fail("连接超时，请确认房主已建房，并检查网络。"),18000);
    peer.on("open",()=>{
      if(this.closed)return;
      if(this.host){this.connected();return;}
      this.attach(peer.connect(prefix+this.code,{reliable:true,serialization:"json",label:protocol}));
    });
    peer.on("connection",link=>{
      if(!this.host || link.label!==protocol){link.close();return;}
      link.on("open",()=>{
        const reason=this.link?"房间已有两名玩家。":this.callbacks.canJoin();
        if(reason){link.send({kind:"error",text:reason});setTimeout(()=>link.close(),250);return;}
        this.received=0;this.link=link;this.listen(link);this.callbacks.join();this.publish();
      });
    });
    peer.on("error",e=>{
      if(this.closed)return;
      if(this.host && this.ready && this.link?.open)return;
      this.fail(e.type==="peer-unavailable"?"找不到这个厨房房间，请核对房间号。":"配对服务连接失败，请检查网络后重试。");
    });
    peer.on("disconnected",()=>{
      if(!this.closed && this.host && !peer.destroyed)peer.reconnect();
    });
  }
  connected(){clearTimeout(this.timeout);this.ready=true;this.callbacks.ready(this.code);}
  attach(link){this.link=link;this.listen(link);}
  listen(link){
    link.on("data",msg=>{
      if(this.closed || this.link!==link || !msg)return;
      if(this.host){
        if(msg.kind==="act" && Number.isSafeInteger(msg.seq) && msg.seq>this.received){
          this.received=msg.seq;this.callbacks.act(msg.command);this.publish();
        }
      }else if(msg.kind==="state"){
        this.callbacks.frame(msg.state,msg.ack);
        if(!this.ready)this.connected();
      }else if(msg.kind==="error")this.fail(msg.text);
    });
    const left=()=>{
      if(this.link!==link || this.closed)return;
      this.link=null;
      if(this.host)this.callbacks.left();else this.fail("已与房主断开连接。");
    };
    link.on("close",left);link.on("error",left);
  }
  publish(){
    if(this.host && this.link?.open && this.link.dataChannel.bufferedAmount<65536)
      this.link.send({kind:"state",state:this.callbacks.state(),ack:this.received});
  }
  send(command){if(this.link?.open)this.link.send({kind:"act",seq:++this.sequence,command});}
  fail(message){if(!this.closed){this.close();this.callbacks.error(message);}}
  close(){this.closed=true;clearTimeout(this.timeout);this.peer?.destroy();}
}
