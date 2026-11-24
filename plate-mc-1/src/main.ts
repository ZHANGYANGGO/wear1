import Phaser from "phaser";
import { HEIGHT, WIDTH, canTransfer, manifest, itemName, targetAt, type Action, type Snapshot } from "../shared/moving";
import { Part4Scene } from "./Part4Scene";
import { session } from "./session";
import "./style.css";
import {orderHud} from "./orders";
import {freightCatalog} from "../shared/catalog";
import {price} from "../shared/campaign";
import {lastHostedRoom} from "./room-save";

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const lobby=el<HTMLDialogElement>("lobby");
const keys=new Set<string>();
const pointers=new Map<number,string>();
const pressed=(...codes:string[])=>Number(codes.some(k=>keys.has(k)||[...pointers.values()].includes(k)));
function controls(){return {
  x:pressed("ArrowRight","KeyD")-pressed("ArrowLeft","KeyA"),
  y:pressed("ArrowDown","KeyS")-pressed("ArrowUp","KeyW"),
  turn:pressed("KeyE")-pressed("KeyQ"),
};}
function stop(){keys.clear();pointers.clear();session.drive(controls());}
window.addEventListener("blur",stop);
document.addEventListener("visibilitychange",()=>{if(document.hidden)stop();});
const valid=["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight","KeyQ","KeyE","Space","KeyF"];
document.addEventListener("keydown",e=>{
  if(lobby.open||session.run.phase!=="moving"||e.ctrlKey||e.altKey||e.metaKey||!valid.includes(e.code))return;
  if(e.code==="Space" && e.target instanceof HTMLButtonElement && e.target.matches(":focus-visible"))return;
  e.preventDefault();if(e.repeat)return;
  if(e.code==="Space")session.act("grab");
  else if(e.code==="KeyF")session.act("use");
  else {keys.add(e.code);session.drive(controls());}
});
document.addEventListener("keyup",e=>{if(keys.delete(e.code))session.drive(controls());});
for(const button of document.querySelectorAll<HTMLButtonElement>(".touch button")){
  button.addEventListener("pointerdown",e=>{
    e.preventDefault();button.setPointerCapture(e.pointerId);
    if(button.dataset.key){pointers.set(e.pointerId,button.dataset.key);session.drive(controls());}
    else session.act(button.dataset.act as Action);
  });
  button.addEventListener("lostpointercapture",e=>{pointers.delete(e.pointerId);session.drive(controls());});
}
function write(id:string,text:string){const node=el(id);if(node.textContent!==text)node.textContent=text;}
function hud(f:Snapshot){
  orderHud();
  const p=f.people.find(p=>p.id===session.id);
  const t=p && targetAt(f,p);
  let hint="室内门厅路短，小院门更宽。靠近货物按空格抓住。";
  let tool="工具";
  const extra=f.extras.find(e=>e.id===(p?.held??t?.item));
  if(extra){const spec=freightCatalog[extra.kind];hint=spec.name+"　+"+price(extra)+" · "+(extra.damaged?"已磕坏":spec.risk)+(p?.held?"。Q/E 转向，空格放下。":"。空格抓取。");}
  else if(p?.held==="sofa")hint="已抓住沙发。Q / E 转向，空格松手。";
  else if(p?.held==="cart"){
    hint=f.books==="wet"?"把推车靠到湿箱旁，按 F 将书转到车上。":"推车跟随移动。按空格停车，车轮会锁住。";
    if(canTransfer(f)){tool="转装书";hint="按 F 把书转上推车，保留胶带。";}
  }else if(p?.held==="plant")hint="按住 Q 或 E 扶稳慢走。到车厢后松手放稳。";
  else if(p?.held==="box")hint=f.books==="cart"?"手里是空箱，书在推车上。":"书箱已拿起。入厢后松手放稳。";
  else if(t && f.people.some(m=>m.held===t.item && m.end===t.end))hint="搭档正在抓这里，请换个抓点。";
  else if(t?.item==="sofa"){
    tool="垫滑板";
    hint=f.board<0?"按 F 给这一端垫滑板，再去另一端按空格抓住。":"空格抓住沙发，Q / E 辅助转向。";
  }else if(t?.item==="box" && f.books==="wet"){
    tool="贴胶带";hint="按 F 用一卷胶带加固；也可以把推车带到这里转装书。";
  }else if(t?.item==="box" && session.run.stock.tarp && f.books==="dry" && !f.covered){tool="盖雨布";hint="按 F 用防雨布盖好书箱，或按空格搬到屋檐下。";}
  else if(t)hint="按空格抓住"+(t.item==="box" && f.books==="cart"?"空箱":itemName(f,t.item))+"。";
  else if(f.count===3)hint="必搬货已齐。继续搬额外货，或到车尾关门收工。";
  write("hint",hint);write("touch-use",tool);
  for(const key of manifest){
    let detail="待搬";
    if(key==="books" && f.books==="cart")detail="在推车上";
    if(key==="plant" && f.spilled)detail="已掉土 · 可交付";
    if(key==="plant" && f.tilt>0.6)detail="摇晃中";
    write("row-"+key,f.signed[key]?"✓ 已签收":detail);
    el("row-"+key).classList.toggle("signed",f.signed[key]);
  }
  write("stamp",f.count===3?"已签收":"搬运中");
  el("stamp").classList.toggle("done",f.count===3);
  write("count",f.count+" / 3");
  el("bar").style.width=(f.count*100/3)+"%";
  write("delivery",f.count===3?"必搬货已齐，到车尾可提前收工。":"整件入厢，松手放稳后逐件签收。");
  write("tool-state",f.board>=0?"已垫在沙发下":"可安装");
  write("cart-state",f.books==="cart"?"1 / 1 份书":"0 / 1 份");
  write("tape-state",f.tape+" 卷");
  const boxText={dry:"普通订单 · 干书箱可直接搬。",wet:"湿箱局 · 贴胶带或推车转装。",taped:"湿箱局 · 书箱已加固。",cart:"湿箱局 · 书已转装，原箱已空。"};
  write("box-state",f.covered?"书箱已盖上防雨布。":boxText[f.books]);
  write("scenario",f.scenario==="wet"?"重开普通局":"重开湿箱局");
  for(const key of ["KeyQ","KeyE"]){
    const button=document.querySelector<HTMLButtonElement>('[data-key="'+key+'"]')!;
    const caption=p?.held==="plant"?"扶稳":key==="KeyQ"?"左转":"右转";
    if(button.textContent!==caption)button.textContent=caption;
  }
  if(session.room)write("members",session.room.status || `${session.room.role==="host"?"我是房主":"我是搭档"} · 房间号 ${session.room.roomId} · ${f.people.length} / 2 人`);
}
const localFile=location.protocol==="file:";
const inviteLabel=localFile?"复制房间号":"复制邀请链接";
function mode(){
  write("invite",inviteLabel);
  el("solo").setAttribute("aria-pressed",String(!session.room));
  el("multi").setAttribute("aria-pressed",String(!!session.room));
  el("online").hidden=!session.room;
  el("scenario").hidden=!!session.room;
}
let connecting=false;
function openLobby(){stop();el("resume-room").hidden=!lastHostedRoom();if(!lobby.open)lobby.showModal();}
function roomAddress(id?:string){
  const url=new URL(location.href);
  if(localFile)url.hash=id?"room="+id:"";
  else if(id)url.searchParams.set("room",id);
  else url.searchParams.delete("room");
  history.replaceState(id && session.room?.role==="host"?{hostRoom:id}:null,"",url);
}
el("solo").onclick=()=>{
  if(session.room){stop();session.solo();roomAddress();mode();}
  el("solo").blur();
};
el("multi").onclick=()=>{if(!session.room){write("network-msg","");openLobby();}else el("invite").focus();};
el("reset").onclick=()=>{stop();session.restart();el("reset").blur();};
el("scenario").onclick=()=>{
  if(session.room)return;
  stop();session.restart(session.frame.scenario==="wet"?"dry":"wet");el("scenario").blur();
};
async function connect(code?:string,recover=false){
  if(connecting)return;
  connecting=true;
  for(const b of lobby.querySelectorAll("button"))b.disabled=true;
  write("network-msg","正在连接房间…");
  try{
    const id=await session.connect(code,recover);stop();mode();lobby.close();
    roomAddress(id);
    (document.activeElement as HTMLElement)?.blur();
  }catch(e){mode();write("network-msg",e instanceof Error?e.message:"连接失败，请检查网络后重试。");}
  finally{connecting=false;for(const b of lobby.querySelectorAll("button"))b.disabled=false;}
}
lobby.addEventListener("cancel",e=>{if(connecting)e.preventDefault();});
el("create").onclick=()=>void connect();
el("resume-room").onclick=()=>{const code=lastHostedRoom();if(code)void connect(code,true);};
el("join").onclick=()=>{const code=el<HTMLInputElement>("code").value.trim();if(code)void connect(code);else write("network-msg","请先输入房间号。");};
el("code").addEventListener("keydown",e=>{if(e.key==="Enter")el("join").click();});
el("invite").onclick=async()=>{
  const value=localFile?session.room?.roomId:location.href;
  if(!value)return;
  try{await navigator.clipboard.writeText(value);write("invite",localFile?"房间号已复制":"邀请链接已复制");setTimeout(()=>write("invite",inviteLabel),1800);}
  catch{window.prompt(inviteLabel,value);}
};
session.onDisconnect=message=>{stop();mode();openLobby();write("network-msg",message);};
new Phaser.Game({type:Phaser.CANVAS,width:WIDTH,height:HEIGHT,parent:"stage",backgroundColor:"#b8cca0",
  audio:{noAudio:true},banner:false,scene:new Part4Scene(controls,hud)});
if(localFile)lobby.querySelector("p")!.textContent="双方分别打开游戏文件并联网，房主把房间号发给搭档。";
const invitation=new URLSearchParams(localFile?location.hash.slice(1):location.search).get("room");
if(invitation){openLobby();el<HTMLInputElement>("code").value=invitation;void connect(invitation);}
