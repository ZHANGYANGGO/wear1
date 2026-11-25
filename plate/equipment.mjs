import {canDiscard,itemName,isBurnt,orderInfo} from "./content.mjs";

export const isTray=item=>item?.startsWith("tray:");
export const trayContents=(s,item)=>isTray(item)?s.trays[item.slice("tray:".length)]:null;
export function options(s,p,f,book){
  const st=s.stations[f.id],def=book.tools[f.kind],h=p.hand,slots=trayContents(s,h);
  if(f.fitting==="box"){
    const item=st.slots[p.slot%4];
    return {grab:item?(h?"":"取"+itemName(item,book)):(canDiscard(h,book) && !isBurnt(h)?"放入所选格":""),work:""};
  }
  if(f.fitting==="tray"){
    const dock=s.trays[f.attachment],i=p.slot%2;
    const grab=h==="tray:"+f.attachment?"归还托盘":!st.docked?"":!h?"取托盘":!loadError(dock,i,h)?"装入所选盘位":"";
    return {grab,work:""};
  }
  if(def.timer && st.raw)return {grab:h?"":"取回生牛排",work:"确认"+(p.slot%2?"全熟":"五分熟")+"并点火"};
  if(slots){
    const item=slots[p.slot%2],group=s.groups.find(g=>g.id===st.group);
    if(def.action==="table"){
      const serves=group?.stage==="food" && group.remaining.some(id=>item==="plated:"+orderInfo(id,book).product);
      return {grab:serves?"交所选一盘":!group && st.dirty && !loadError(slots,p.slot%2,"dirty")?"收一只脏盘":"",work:group?.stage==="order"?"接单":""};
    }
    if(def.action==="counter")return {grab:item && !st.item?"放下所选一盘":!loadError(slots,p.slot%2,st.item)?"装入所选盘位":"",work:""};
    if(["wash","soak"].includes(def.action)){
      const canLoad=item==="dirty" && st.dirty<def.capacity && !(def.action==="soak" && (st.batchEnd || st.clean));
      return {grab:canLoad?"放一只脏盘":"",work:st.dirty && !st.batchEnd?(def.action==="wash"?"连续刷盘":"启动浸洗"):""};
    }
    return {grab:"",work:""};
  }
  if(def.action==="soak")return {grab:st.batchEnd?"":h==="dirty" && !st.clean && st.dirty<3?"放脏盘":!h && st.clean?"取一只净盘":"",
    work:st.dirty && !st.batchEnd?"启动浸洗":""};
  return null;
}
function loadError(slots,i,item){
  if(slots[i])return "所选盘位已有盘子。";
  if(item!=="dirty" && !item?.startsWith("plated:"))return "托盘只装已装盘的菜或脏盘。";
  if(slots.some(v=>v && (v==="dirty")!==(item==="dirty")))return "成品和脏盘要分开装。";
  return "";
}
function load(slots,i,item){
  const error=loadError(slots,i,item);
  if(!error)slots[i]=item;
  return error;
}
export function useFitting(game,p,f,st){
  if(f.fitting==="box"){
    const i=p.slot%4;
    if(!p.hand){p.hand=st.slots[i];st.slots[i]=null;return "";}
    if(!canDiscard(p.hand,game.book) || isBurnt(p.hand))return "备料盒只收食材和备好的食物。";
    if(st.slots[i])return "所选格已装满。";
    st.slots[i]=p.hand;p.hand=null;return "";
  }
  const token="tray:"+f.attachment;
  if(p.hand===token){st.docked=true;p.hand=null;return "";}
  if(!st.docked)return "这只托盘正在使用。";
  if(!p.hand){p.hand=token;st.docked=false;return "";}
  const message=load(game.s.trays[f.attachment],p.slot%2,p.hand);
  if(!message)p.hand=null;return message;
}
export function useTray(game,p,st,def,actions){
  const token=p.hand,slots=trayContents(game.s,token),i=p.slot%2,item=slots[i];
  if(def.action==="counter"){
    if(item && !st.item){st.item=item;slots[i]=null;return "";}
    const message=load(slots,i,st.item);if(!message)st.item=null;return message;
  }
  if(def.action==="table"){
    const g=game.s.groups.find(g=>g.id===st.group);
    if(!g && st.dirty){
      const message=load(slots,i,"dirty");
      if(!message){st.dirty--;if(!st.dirty)st.idleSince=game.s.now;}
      return message;
    }
    if(!item && g?.stage==="food")return "所选格是空的，这桌需要 "+g.remaining.map(id=>orderInfo(id,game.book).name).join("、");
  }else if(!["wash","soak"].includes(def.action) || item!=="dirty")return "请选择托盘中的一盘，再到餐桌、台面或水槽操作。";
  // Let the ordinary table/sink validate precisely one plate.
  p.hand=item;
  try{return actions[def.action](game,p,st,def);}
  finally{slots[i]=p.hand;p.hand=token;}
}
