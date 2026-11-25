import {goods,refreshPrice,availableAssets,placementError} from "./market.mjs";
import {trayContents} from "./equipment.mjs";
import {itemName} from "./content.mjs";
import {interactionTarget} from "./game.mjs";
import {drawFixture} from "./art.mjs";

const el=id=>document.getElementById(id);
const set=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
function button(label,action,disabled=false){
  const b=document.createElement("button");b.type="button";b.textContent=label;b.disabled=disabled;
  b.onclick=e=>{if(e.detail<=1)action();};return b;
}
export function marketView(current,send,paint){
  let hidden=false,preview=null,screen="",shelfKey="",slotKey="",renderedRevision=-1;
  function start(selection){
    preview={...selection,dir:0};hidden=true;
    el("result").close();el("stockDialog").close();paint();
  }
  el("hideMarket").onclick=()=>{hidden=true;el("result").close();paint();};
  el("showMarket").onclick=()=>{hidden=false;paint();};
  el("cancelPlace").onclick=()=>{preview=null;hidden=false;paint();};
  el("turnPreview").onclick=()=>{if(preview){preview.dir=(preview.dir+1)%4;paint();}};
  el("commitPlace").onclick=()=>{
    if(!preview)return;
    const c=preview,rev=current().s.store.revision;
    send(c);
    if(current().s.store.revision!==rev){preview=null;hidden=false;paint();}
  };
  el("showStock").onclick=()=>{
    const {s}=current();
    el("stockList").replaceChildren(...availableAssets(s).map(a=>button(goods[a.sku].name,()=>start({type:"deploy",asset:a.id,sku:a.sku,revision:s.store.revision}))));
    el("stockDialog").showModal();
  };
  el("newStore").onclick=()=>el("confirmNew").showModal();
  el("keepStore").onclick=()=>el("confirmNew").close();
  el("startNew").onclick=()=>{el("confirmNew").close();send({type:"newStore"});};
  el("refreshShelf").onclick=e=>{if(e.detail<=1)send({type:"refresh",revision:renderedRevision});};
  const ghost=document.createElement("span"),sample=document.createElement("canvas"),arrow=document.createElement("b");
  ghost.id="placementGhost";ghost.hidden=true;ghost.setAttribute("aria-hidden","true");
  sample.width=sample.height=64;ghost.append(sample,arrow);el("board").append(ghost);
  let sampleKey="";
  function slotLabels(game,s,me){
    const p=s.players[me],f=interactionTarget(s,p,game.book);
    const st=f && s.stations[f.id];
    const slots=trayContents(s,p.hand) || st?.slots || (f?.fitting==="tray" && s.trays[f.attachment]);
    if(slots)return slots.map((item,i)=>(i+1)+" · "+(item?itemName(item,game.book):"空格位"));
    const work=interactionTarget(s,p,game.book,"work");
    return st?.raw || s.stations[work?.id]?.raw?["五分熟","全熟"]:[];
  }
  function render(game,s,me,host){
    const key=s.run+"|"+s.phase,won=s.phase==="won",prep=s.phase==="prep";
    if(key!==screen){screen=key;hidden=false;preview=null;shelfKey="";el("stockDialog").close();}
    el("marketPanel").hidden=!won;el("shopTools").hidden=!(won || prep || s.phase==="lost");
    set(el("wallet"),"钱包 ¥"+s.store.wallet);
    el("showMarket").hidden=!won || !!preview;el("newStore").hidden=!host;
    el("showStock").hidden=!host || !(prep || won) || !availableAssets(s).length || !!preview;
    el("placement").hidden=!preview;ghost.hidden=!preview || preview.x==null;
    if(preview){
      const error=placementError(game,preview.sku,preview.x,preview.y,preview.dir);
      set(el("placementName"),goods[preview.sku].name+" · "+(preview.x==null?(goods[preview.sku].fitting?"点空台面":"点空地预览"):error || (!goods[preview.sku].fitting && game.doorAt(preview.x,preview.y)?"摆放后，这扇门会改为传菜窗":"可以摆放")));
      el("commitPlace").disabled=preview.x==null || !!error;el("turnPreview").hidden=!!goods[preview.sku].fitting;
      if(preview.x!=null){
        const rows=game.map.height+Number(!!game.map.outside);
        Object.assign(ghost.style,{left:preview.x/game.map.width*100+"%",top:preview.y/rows*100+"%",width:100/game.map.width+"%",height:100/rows+"%"});
        ghost.dataset.invalid=String(!!error);set(arrow,["↓","←","↑","→"][preview.dir]);
        const key=preview.sku+preview.dir;
        if(key!==sampleKey){
          sampleKey=key;const g=goods[preview.sku],ctx=sample.getContext("2d");
          ctx.clearRect(0,0,64,64);
          drawFixture(ctx,{x:0,y:0,dir:preview.dir,kind:g.kind || "counter",fitting:g.fitting?preview.sku:null,attachment:"preview"},
            {docked:true,slots:[],parts:[]},{now:0,trays:{preview:[]}},game.book.tools[g.kind || "counter"]);
        }
      }
    }
    if(won){
      if(!hidden && !el("result").open && !el("stockDialog").open)el("result").showModal();
      set(el("receipt"),"餐费 ¥"+s.stats.revenue+" · 小费 ¥"+s.tips+" · 本关入账 ¥"+(s.stats.revenue+s.tips)+" · 可用 ¥"+s.store.wallet);
      const id=s.store.revision+"|"+host;
      if(id!==shelfKey){
        shelfKey=id;renderedRevision=s.store.revision;
        el("shelf").replaceChildren(...s.store.shelf.map((slot,index)=>{
          const g=goods[slot.sku],card=document.createElement("article"),title=document.createElement("strong"),desc=document.createElement("p");
          card.dataset.sku=slot.sku;card.dataset.sold=slot.sold;card.dataset.locked=slot.locked;
          title.textContent=g.name+" · ¥"+slot.price;desc.textContent=g.use;
          const base={index,sku:slot.sku,revision:s.store.revision};
          const buy=button(slot.sold?"售罄":g.plates?"购买":"选位置",()=>{
            if(g.plates)send({...base,type:"buy"});else start({...base,type:"buy"});
          },!host || slot.sold || s.store.wallet<slot.price);
          const lock=button(slot.locked?"已锁 · 解锁":"锁货",()=>send({...base,type:"lock",locked:!slot.locked}),!host || slot.sold);
          card.append(title,desc,buy,lock);return card;
        }));
      }
      const cost=refreshPrice(s.store);
      set(el("refreshShelf"),"刷新 ¥"+cost);el("refreshShelf").disabled=!host || s.store.wallet<cost || s.store.shelf.every(slot=>slot.locked);
    }
    const labels=s.phase==="open"?slotLabels(game,s,me):[],selected=(s.players[me]?.slot || 0)%labels.length;
    el("slots").hidden=!labels.length;
    const sk=JSON.stringify([labels,selected]);
    if(slotKey!==sk){
      slotKey=sk;el("slots").replaceChildren(...labels.map((label,i)=>{
        const b=button(label,()=>send({type:"slot",slot:i}));b.setAttribute("aria-pressed",i===selected);return b;
      }));
    }
  }
  return {render,placing:()=>!!preview,chooseCell(x,y){if(!preview)return false;Object.assign(preview,{x,y});paint();return true;},
    cycle(){const buttons=Array.from(el("slots").children);if(buttons.length)buttons[(buttons.findIndex(b=>b.getAttribute("aria-pressed")==="true")+1)%buttons.length].click();}};
}
