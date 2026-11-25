export const goods={
  counter:{name:"空白台面",price:15,kind:"counter",use:"暂存、交接，或安装一个台面配件"},
  plates4:{name:"4 只装餐盘",price:20,plates:4,use:"永久增加 4 只餐盘"},
  box:{name:"四格备料盒",price:25,fitting:true,use:"安装在台面，独立存取四份食材"},
  tray:{name:"双盘托盘",price:30,fitting:true,use:"安装在台面，一趟送两盘或收两只脏盘"},
  plates8:{name:"8 只装餐盘",price:35,plates:8,use:"永久增加 8 只餐盘"},
  metal:{name:"铁皮餐桌",price:32,kind:"metal",use:"用餐耗时缩短三分之一"},
  elegant:{name:"优雅餐桌",price:40,kind:"elegant",use:"看菜单和用餐慢 20%，整桌小费 50%"},
  rapid:{name:"快速锅",price:42,kind:"rapid",use:"全部火候加快 50%，焦糊也更快"},
  timer:{name:"安全定时锅",price:45,kind:"timer",use:"达到选定熟度后自动停火"},
  soak:{name:"三盘自动浸洗槽",price:50,kind:"soak",use:"装入 1 至 3 只脏盘，启动后一批同时洗净"}
};
export function offerPrice(sku,day){
  return Math.round(goods[sku].price*(10+Math.max(0,day-1))/10);
}
export function newStore(){
  return {pricingVersion:2,wallet:0,extraPlates:0,assets:[],shelf:[],revision:0,refreshes:0,settled:0};
}
export function restoreStore(saved){
  const store={...newStore(),...saved};
  if(saved && !saved.pricingVersion && store.shelf.length){
    for(const slot of store.shelf){
      const price=offerPrice(slot.sku,store.settled);
      slot.price=slot.locked?Math.min(slot.price,price):price;
    }
    store.revision++;
  }
  return store;
}
export function restock(store,random=Math.random){
  const previous=store.shelf;
  const reserved=new Set(previous.filter(slot=>slot.locked).map(slot=>slot.sku));
  store.shelf=Array.from({length:5},(_,i)=>{
    const old=previous[i];
    if(old?.locked)return old;
    const choices=Object.keys(goods).filter(sku=>!reserved.has(sku) && (old?.sold || sku!==old?.sku));
    const sku=choices[Math.floor(random()*choices.length)];
    reserved.add(sku);
    return {sku,price:offerPrice(sku,store.settled),locked:false,sold:false};
  });
  store.revision++;
}
export const refreshPrice=store=>10*(store.refreshes+1);
export function settle(s){
  const store=s.store;
  if(store.settled>=s.round)return;
  store.wallet+=s.stats.revenue+s.tips;
  store.settled=s.round;store.refreshes=0;
  restock(store);
}
export function availableAssets(s){
  const placed=new Set(s.fixtures.flatMap(f=>[f.id,f.attachment]));
  return s.store.assets.filter(asset=>!placed.has(asset.id));
}
export function stationState(f){
  const st={item:null,parts:[],job:null,heat:null,readyAt:0,washed:0,dirty:0,clean:0,plates:0,group:null,pending:null,formed:0,idleSince:0};
  if(f.fitting==="box")st.slots=[null,null,null,null];
  if(f.fitting==="tray")st.docked=true;
  return st;
}
export function placementError(game,sku,x,y,dir){
  const item=goods[sku];
  if(!item || !Number.isInteger(dir) || dir<0 || dir>3)return "请选择朝向。";
  if(item.fitting){
    const f=game.at(x,y);
    return f && game.def(f).action==="counter" && !f.fitting && !game.s.stations[f.id].item?"":"请选择空闲的普通台面。";
  }
  return game.freePlacement(x,y)?game.doorPlacementError({id:"preview",kind:item.kind},x,y,dir):"这里需要留给通行、角色或其他设备。";
}
export function trade(game,c){
  const s=game.s,store=s.store;
  if(c.revision!==store.revision)return "货架已更新，请重新选择。";
  if(c.type==="refresh"){
    const cost=refreshPrice(store);
    if(store.wallet<cost || store.shelf.every(slot=>slot.locked))return "余额不足或货架已全锁。";
    store.wallet-=cost;store.refreshes++;restock(store);return "";
  }
  const owned=c.type==="deploy",asset=owned && availableAssets(s).find(a=>a.id===c.asset);
  const slot=store.shelf[c.index];
  if(owned?!asset:(!slot || slot.sold || slot.sku!==c.sku))return "该商品已不可用。";
  if(c.type==="lock"){
    if(typeof c.locked==="boolean" && slot.locked!==c.locked){slot.locked=c.locked;store.revision++;}
    return "";
  }
  const sku=owned?asset.sku:slot.sku,item=goods[sku];
  if(!owned && store.wallet<slot.price)return "余额不足，可以先锁定商品。";
  if(item.plates){
    store.extraPlates+=item.plates;
    const rack=s.fixtures.find(f=>game.def(f).action==="plates");
    s.stations[rack.id].plates+=item.plates;
  }else{
    const error=placementError(game,sku,c.x,c.y,c.dir);
    if(error)return error;
    const id=owned?asset.id:"buy-"+(store.assets.length+1);
    if(item.fitting){
      const f=game.at(c.x,c.y);f.fitting=sku;f.attachment=id;
      if(sku==="tray"){s.stations[f.id].docked=true;s.trays[id]=[null,null];}
      else s.stations[f.id].slots=[null,null,null,null];
    }else{
      const f={id,kind:item.kind,x:c.x,y:c.y,dir:c.dir};
      s.fixtures.push(f);s.stations[id]=stationState(f);
    }
    if(!owned)store.assets.push({id,sku});
    game.refreshSeats();
  }
  if(!owned){store.wallet-=slot.price;slot.sold=true;slot.locked=false;}
  store.revision++;return "";
}
