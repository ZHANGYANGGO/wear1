import {products} from "../shared/equipment";
import {atDoor,price,quote,type Command} from "../shared/campaign";
import {freightCatalog} from "../shared/catalog";
import {session} from "./session";

const el=(id:string)=>document.getElementById(id)!;
function write(id:string,value:string){if(el(id).textContent!==value)el(id).textContent=value;}
const money=(v:number)=>v>0?"+"+v:String(v);
const clock=(v:number)=>Math.floor(v/60)+":"+String(v%60).padStart(2,"0");
const freightNames:Record<string,string>={sofa:"沙发",books:"书",plant:"盆栽"};
let sheetKey="";
let lastToken="",previousSeconds=Infinity,alert="",alertUntil=0;
function line(parent:HTMLElement,tag:string,value:string){
  const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;
}
function button(parent:HTMLElement,caption:string,action:Command["type"],item?:string,disabled=false){
  const b=document.createElement("button");b.textContent=caption;b.dataset.command=action;
  if(item)b.dataset.product=item;
  b.disabled=disabled;b.onclick=()=>{b.blur();session.command(action,item);};parent.append(b);
}
function sheet(){
  const r=session.run,panel=el("sheet");panel.replaceChildren();
  const rec=r.receipt;
  if(r.phase==="menu"){
    line(panel,"small","公寓搬运订单");line(panel,"h2","今天应该很顺利");
    line(panel,"p","完成必搬清单，再用剩余空间接额外货。两单之间可以把收入换成装备。");
    button(panel,"开始新游戏","new");return;
  }
  if(r.phase==="brief"){
    line(panel,"small",`本局订单 ${r.level+1} / ${r.levels}`);line(panel,"h2",r.terms.name);
    line(panel,"p","必搬　长沙发、一箱书、一盆绿植");
    line(panel,"p",`基础款 ${r.terms.base}　出车成本 ${r.terms.cost}　限时 ${clock(r.terms.seconds)}`);
    line(panel,"p",r.terms.rainAt===null?"天气晴，可以留意屋里的额外货。":"预报有雨。书箱在小院，留意屋檐和防雨布。");
    button(panel,"开始搬运","start");return;
  }
  if(!rec)return;
  line(panel,"small",`第 ${r.level+1} 单 · ${rec.reason==="manual"?"提前关门":"到点发车"}`);
  line(panel,"h2",r.phase==="missing"?"发车时仍有缺件":r.phase==="loss"?"本单亏损，如何收工？":r.phase==="end"?"本局已收工":"收工回执");
  const lines=line(panel,"ul","");lines.className="receipt-lines";
  for(const [name,n] of [["基础款",rec.base],...rec.lines.map(l=>[l.name+(l.damaged?"（受损）":""),l.price]),["盆栽货损",-rec.damage],["出车成本",-rec.cost]]){
    const li=line(lines,"li",String(name));line(li,"b",money(Number(n)));
  }
  line(panel,"p",`本单净收益 ${money(rec.net)}　钱包 ${r.wallet}`);
  if(r.phase==="missing"){line(panel,"p","缺少 "+rec.missing.map(k=>freightNames[k]).join("、"));button(panel,"重试本关","retry");}
  if(r.phase==="loss"){
    line(panel,"p",`接受后余额 ${r.wallet+rec.net}，重试保留当前余额。`);
    button(panel,r.level+1===r.levels?"接受亏损并结束本局":"接受亏损并继续","accept");button(panel,"重试本关","retry");
  }
  if(r.phase==="shop"){
    line(panel,"h3","关间采购");line(panel,"p",session.room?"队伍共用钱包与装备，任一人可购买。":"购买后下一关生效，也可以存钱。");
    for(const [id,p] of Object.entries(products)){
      const owned=r.stock[id]??0;
      if(owned && p.effect==="vehicle"){
        button(panel,p.name+(r.vehicle===id?" · 已装备":" · 装备"),"equip",id,r.vehicle===id);
        if(owned>=p.limit)continue;
      }
      const quantity=p.limit>1?`（${owned}/${p.limit}）`:"";
      button(panel,p.name+quantity+(owned>=p.limit?" · 已持有":"　"+p.price),"buy",id,owned>=p.limit||r.wallet<p.price);
    }
    if(r.vehicle)button(panel,"换回基础车","equip","");
    button(panel,"接下一单","next");
  }
  if(r.phase==="end"){line(panel,"p","本局累计净收益 "+money(r.profit)+"　结束余额 "+r.wallet);button(panel,"开始新游戏","new");}
}
el("close-order").onclick=()=>{const confirm=session.note==="确认关门";session.command("close",undefined,confirm);el("close-order").blur();};
el("new-run").onclick=()=>{if(window.confirm("结束当前局，从初始资金和第一关重新开始？"))session.newLocalRun();el("new-run").blur();};
el("cancel-close").onclick=()=>{session.note="";el("cancel-close").blur();};
export function orderHud(){
  const r=session.run,f=session.frame;
  const moving=r.phase==="moving",practice=r.preset==="practice";
  const door=atDoor(f,session.id);
  if((session.note==="确认关门" || session.note.startsWith("还缺必搬货")) &&
      (!door || r.token!==lastToken || (f.count===3 && session.note.startsWith("还缺必搬货"))))session.note="";
  if(r.token!==lastToken){
    if(lastToken && !session.note.includes("存档") && !session.note.includes("保存失败"))session.note="";
    lastToken=r.token;previousSeconds=r.terms.seconds+1;alert="";
  }
  for(const seconds of [60,15]){
    if(moving && r.remaining<=seconds && previousSeconds>seconds){
      alert="发车倒计时已进入最后 "+seconds+" 秒";alertUntil=Date.now()+3000;
    }
  }
  if(Date.now()>=alertUntil)alert="";
  previousSeconds=r.remaining;
  const weather=r.weather==="warning"?"乌云来了，请把书箱移入屋檐或盖上防雨布":r.weather==="rain"?"正在下雨，露天书箱会受潮":"";
  const msg=session.note==="确认关门"?"收工将锁定本单亏损 "+money(quote(f,r.terms).net)+"。确认关门或继续补货。":session.note;
  const reconnect=session.room?.status || "";
  const notice=reconnect || msg || (moving?[alert,weather].filter(Boolean).join("　"):"");
  el("sheet").inert=!!reconnect;
  write("notice",notice);el("notice").hidden=!notice;
  const key=JSON.stringify([r.token,r.wallet,r.vehicle,r.stock,r.receipt,!!session.room]);
  el("dispatch").hidden=moving;
  if(!moving && key!==sheetKey){sheetKey=key;sheet();}
  write("timer",moving?"发车 "+clock(r.remaining):"第 "+(r.level+1)+" 单");
  el("timer").classList.toggle("urgent",moving&&r.remaining<=60);
  const q=quote(f,r.terms);
  write("base-pay",f.count===3?String(q.base):r.terms.base+"，待交齐");
  write("extra-pay",String(q.lines.reduce((n,l)=>n+l.price,0)));
  write("actual-pay",String(q.actual));write("damage-pay",money(-q.damage));
  write("net-pay",money(q.net));write("wallet",String(r.wallet));
  const signed=f.extras.filter(e=>e.signed);
  write("extra-list",signed.map(e=>freightCatalog[e.kind].name+" +"+price(e)).join("　"));
  el("close-order").hidden=!moving || !door || practice;
  write("close-order",session.note==="确认关门"?"确认关门":"关门收工");
  el("cancel-close").hidden=!moving || session.note!=="确认关门";
  el("scenario").hidden=!practice || !!session.room || !moving;
  el("new-run").hidden=!!session.room || practice || r.phase==="menu" || r.phase==="end";
  el("reset").hidden=!practice || !moving;
}
