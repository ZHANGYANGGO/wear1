import {drawFixture,drawFloor} from "./art.mjs";
import {recipeFixtures} from "./content.mjs";

export function createPicker(book,level){
  const ids=level.maps || [],images=new Map(),cards=new Map();
  const el=id=>document.getElementById(id);
  const select=el("recipeChoice");
  select.replaceChildren(...level.menu.map(id=>new Option(book.recipes[id].name,id)));
  let current=null;
  function preview(id){
    const map=book.maps[id];
    if(!map || !cards.has(id))return;
    current=id;
    for(const [key,button] of cards)button.setAttribute("aria-pressed",String(key===id));
    const image=images.get(id),canvas=el("mapPreview");
    canvas.width=image.width;canvas.height=image.height;
    canvas.getContext("2d").drawImage(image,0,0);
    canvas.setAttribute("aria-label",map.name+" · "+book.recipes[select.value].name+"初始布局与店外队列");
    el("previewName").textContent=map.name;el("previewSize").textContent=map.width+" × "+map.height;
    el("mapDescription").textContent=map.description;
    el("chooseMap").textContent="选择"+map.name+"并进入准备";
  }
  for(const id of ids){
    const map=book.maps[id],image=document.createElement("canvas");
    image.width=map.width*64;image.height=(map.height+Number(!!map.outside))*64;
    images.set(id,image);
    const button=document.createElement("button"),info=document.createElement("span"),name=document.createElement("strong"),size=document.createElement("small");
    button.type="button";button.dataset.map=id;button.setAttribute("aria-pressed","false");image.setAttribute("aria-hidden","true");
    name.textContent=map.name;size.textContent=map.width+" × "+map.height;info.append(name,size);
    button.append(image,info);cards.set(id,button);button.onclick=()=>preview(id);el("mapCards").append(button);
  }
  function setRecipe(id){
    select.value=id;
    for(const [key,image] of images){
      const map=book.maps[key],ctx=image.getContext("2d");drawFloor(ctx,map);
      for(const f of recipeFixtures(book,map,id)){
        const def=book.tools[f.kind];
        drawFixture(ctx,f,{parts:[],plates:def.action==="plates"?level.plates:0,dirty:0,clean:0},{now:0},def);
      }
    }
    if(current)preview(current);
  }
  select.onchange=()=>setRecipe(select.value);
  return {preview,setRecipe,get current(){return current;},get recipe(){return select.value;}};
}
