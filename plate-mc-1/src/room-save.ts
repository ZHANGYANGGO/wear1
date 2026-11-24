import { Campaign } from "../shared/campaign";

const prefix="moving-day/host-v1/";
const lastKey="moving-day/last-host";
export function lastHostedRoom(){
  try{return localStorage.getItem(lastKey);}catch{return null;}
}
export function restoreHost(code:string){
  const raw=localStorage.getItem(prefix+code);
  if(!raw)throw Error("这台设备上没有这间房的存档，请重新创建房间。");
  const game=Campaign.restore(JSON.parse(raw));
  game.world.remove("guest");
  return game;
}
export function saveHost(code:string,game:Campaign){
  localStorage.setItem(prefix+code,JSON.stringify(game.save()));
}
export function rememberHost(code:string){localStorage.setItem(lastKey,code);}

