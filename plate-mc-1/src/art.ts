import { cargo, GRIP, HEIGHT, WIDTH, houseWalls, truckRails, awning, type Snapshot } from "../shared/moving";

import {freightCatalog} from "../shared/catalog";
type Brush = CanvasRenderingContext2D;
const ink = "#34483d";
function box(c: Brush,x:number,y:number,w:number,h:number,fill:string,stroke="",r=0) {
  c.beginPath(); c.roundRect(x,y,w,h,r); c.fillStyle=fill; c.fill();
  if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}
}
function line(c:Brush, pts:number[][], color:string, width=2) {
  c.beginPath(); pts.forEach(([x,y],i)=>i ? c.lineTo(x,y):c.moveTo(x,y));
  c.strokeStyle=color;c.lineWidth=width;c.lineJoin="round";c.lineCap="round";c.stroke();
}
function oval(c:Brush,x:number,y:number,rx:number,ry:number,fill:string,stroke=""){
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();
  if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}
}
function label(c:Brush,s:string,x:number,y:number,size:number,color:string){
  c.font=`bold ${size}px "Microsoft YaHei",sans-serif`;c.fillStyle=color;c.textAlign="center";c.textBaseline="middle";c.fillText(s,x,y);
}
function shrub(c:Brush,x:number,y:number,scale:number) {
  c.save();c.translate(x,y);c.scale(scale,scale);
  oval(c,5,7,24,17,"#719468");oval(c,-9,0,14,14,"#6e9a71",ink);oval(c,6,-8,17,16,"#86ac7d",ink);
  oval(c,16,5,12,11,"#78a076",ink);line(c,[[-5,-5],[0,-8],[4,-5]],"#b7d798");line(c,[[12,4],[15,2]],"#b7d798");c.restore();
}
function carton(c:Brush,x:number,y:number,w:number){
  box(c,x+3,y+4,w,w*.77,"#65745355","",3);box(c,x,y,w,w*.77,"#d9a961",ink,3);
  line(c,[[x+1,y+w*.37],[x+w-1,y+w*.37]],"#956d38",1);
  box(c,x+w*.4,y+1,w*.19,w*.72,"#f1d399");line(c,[[x+5,y+6],[x+10,y+6]],"#997842");
}
function arrow(c:Brush,x:number,y:number,rotation:number) {
  c.save();c.translate(x,y);c.rotate(rotation);line(c,[[-15,0],[12,0],[5,-7]],"#b88b57",3);
  line(c,[[12,0],[5,7]],"#b88b57",3);c.restore();
}
export function mapArt(c:Brush,width=cargo.w){
  box(c,0,0,WIDTH,HEIGHT,"#b8cca0");
  let seed=117;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<780;i++){const x=rand()*WIDTH,y=rand()*HEIGHT;
    if(i%6===0)line(c,[[x-2,y-2],[x,y+1],[x+2,y-3]],"#94b181",1);
    else box(c,x,y,2,1.5,"#9bb58a");}
  // Street, kerb and paved path to the truck.
  box(c,0,573,WIDTH,HEIGHT-573,"#a4ada2");box(c,0,568,WIDTH,7,"#d9dbca");
  line(c,[[0,575],[920,575]],"#859287");
  for(let x=-10;x<940;x+=76)box(c,x,662,42,4,"#e0dec7","",2);
  box(c,53,366,161,155,"#d0c4a4","",24);box(c,126,405,493,115,"#d0c4a4","",22);
  box(c,441,287,313,254,"#d8d2b8");
  for(let row=0;row<9;row++)for(let n=0;n<6;n++){
    const x=441+n*58-(row%2)*24,y=296+row*27;
    if(x>441&&x<752)line(c,[[x,y],[x,y+24]],"#c6c0a8",1);
    line(c,[[441,y],[753,y]],"#c6c0a8",1);}
  for(const [x,y,s] of [[22,13,.85],[88,13,.68],[757,66,1],[801,78,.8],[866,199,1.2],[829,232,.7],[38,535,.76],[83,551,.65],[875,395,.81]])shrub(c,x,y,s);
  // Short timber fence on the far side of the garden.
  for(const y of [108,121])box(c,731,y,192,5,"#d4b585","#847b5b",1);
  for(let x=739;x<923;x+=34)box(c,x,102,8,29,"#e6cda0","#847b5b",2);
  // Living room planks and the tiled turning bay.
  box(c,37,59,382,323,"#e6c999");
  for(let row=0;row<14;row++){
    const y=59+row*24;line(c,[[38,y],[417,y]],"#c7a77b",1);
    for(let x=40+(row*47)%92;x<418;x+=92)line(c,[[x,y],[x,Math.min(381,y+24)]],"#c7a77b",1);
  }
  box(c,421,58,262,230,"#e5e4ca");
  for(let x=423;x<684;x+=32)line(c,[[x,59],[x,287]],"#cccfb5",1);
  for(let y=61;y<287;y+=32)line(c,[[421,y],[683,y]],"#cccfb5",1);
  // Woven rug.
  for(let y=137;y<245;y+=7){line(c,[[105,y],[116,y]],"#b99573");line(c,[[328,y],[339,y]],"#b99573");}
  box(c,113,129,218,121,"#d2a585","#a7795b",3);
  box(c,119,135,206,109,"#e6c1a0","#f1d4af",3);
  for(const x of [132,312])for(let y=150;y<240;y+=16)line(c,[[x-3,y],[x,y-4],[x+3,y],[x,y+4],[x-3,y]],"#c39777",1.5);
  label(c,"客 厅",221,91,20,"#796d51");label(c,"直 角 门 厅",553,90,17,"#73816b");
  arrow(c,386,189,0);arrow(c,558,261,Math.PI/2);arrow(c,133,364,Math.PI/2);
  label(c,"露 天 小 院",293,449,18,"#756b52");arrow(c,382,450,0);
  // Wall shadows, cutaway walls, windows.
  for(const [x,y,w,h] of houseWalls){box(c,x+3,y+6,w,h,"#6c72564d","",1);box(c,x,y,w,h,"#8f9986",ink,1);}
  for(const x of [101,265,494]){
    box(c,x,48,66,12,"#d3e7db",ink,2);line(c,[[x+2,53],[x+64,53]],"#8bb0a4");line(c,[[x+33,49],[x+33,59]],ink);
  }
  // Door jambs are flush with the passage.
  for(const [x,y] of [[414,133],[414,235],[503,286],[608,286]])box(c,x,y,9,9,"#bd8557",ink,2);
  box(c,awning.x,awning.y,awning.w,awning.h,"#526d6636","#779180",3);
  for(let x=awning.x;x<awning.x+awning.w;x+=13)box(c,x,awning.y,12,9,((x-awning.x)/13)%2?"#709686":"#efe7c6");
  label(c,"避雨檐",awning.x+awning.w/2,awning.y+38,14,"#546d5d");
  const left=cargo.x,right=left+width,center=(left+right)/2;
  box(c,left-2,453,width+17,248,"#45544444","",12);
  for(const x of [left-16,right-2])for(const y of [475,622])box(c,x,y,17,34,"#394a40","#26382e",5);
  box(c,left-8,445,width+16,207,"#8f9e87",ink,3);
  box(c,left,cargo.y,width,cargo.h,"#b7c8a8");
  for(let x=left+8;x<right;x+=18)line(c,[[x,451],[x,642]],"#a7ba9a",2);
  c.setLineDash([7,7]);c.strokeStyle="#59806a";c.lineWidth=2;c.strokeRect(left+4,cargo.y+5,width-8,cargo.h-10);c.setLineDash([]);
  label(c,"装 载 区",center,538,22,"#60816a");label(c,"松手放稳后签收",center,567,14,"#678972");
  for(const [x,y,w,h] of truckRails(width))box(c,x,y,w,h,"#e9c574",ink,2);
  box(c,left+11,648,width-23,50,"#cf7756",ink,10);box(c,left+33,653,width-67,18,"#8cae9e",ink,6);
  line(c,[[left+43,668],[left+55,655]],"#c8e2ce",3);
  for(const x of [left+23,right-49])box(c,x,684,22,7,"#fce8a2",ink,2);
  box(c,center-43,689,86,6,"#859783",ink,2);
  box(c,left+5,425,width-11,22,"#c2beb0","#7e8879",2);
  for(const y of [430,437,444])line(c,[[left+8,y],[right-9,y]],"#929b8d",1);
}
export function sofaArt(c:Brush,frame:Snapshot,me:string){
  const {sofa,board,people}=frame;c.save();c.translate(sofa.x,sofa.y);c.rotate(sofa.angle);
  box(c,-72,-21,149,53,"#40524355","",9);
  if(board>=0){const dx=board===0?-65:65;box(c,dx-11,-34,22,68,"#efb64f",ink,4);
    for(const y of [-34,29])box(c,dx-5,y,10,6,"#46564b",ink,2);}
  box(c,-74,-26,148,52,"#558f7f",ink,8);
  for(let i=0;i<3;i++){box(c,-61+i*41,-16,40,34,"#83b39b","#436957",5);
    line(c,[[-56+i*41,12],[-27+i*41,12]],"#a4c4a9",1.4);}
  box(c,-64,-26,128,11,"#77a98f",ink,5);
  for(const end of [0,1]){const x=end===0?-GRIP:GRIP;
    box(c,x-5,-21,10,43,"#699a86",ink,4);
    const owner=people.find(p=>p.end===end);
    oval(c,x,0,7,7,owner?(owner.id===me?"#efae46":"#7396ca"):"#fff4c8",ink);
    if(owner)label(c,"✓",x,0,10,ink);else oval(c,x,0,2,2,"#927543");
  }c.restore();
}
export function freightArt(c:Brush,f:Snapshot){
  const {cart,plant,box:crate}=f;
  c.save();c.translate(cart.x,cart.y);
  for(const x of [-34,23])for(const y of [-23,17])box(c,x,y,12,7,"#46564b",ink,3);
  box(c,-44,-21,88,42,"#e7b657",ink,5);
  box(c,-37,-16,70,31,"#eecb84","#a28049",2);
  line(c,[[35,-16],[39,-16],[39,16],[35,16]],ink,4);
  if(f.books==="cart"){
    for(const [x,color] of [[-29,"#497969"],[-11,"#ac694f"],[7,"#6688a7"]] as const){
      box(c,x,-13,16,25,color,ink,2);line(c,[[x+3,7],[x+13,7]],"#eee6c6");
    }
  }else label(c,"推车",0,0,13,"#735728");
  c.restore();
  c.save();c.translate(crate.x,crate.y);
  carton(c,-17,-15,34);
  if(f.books==="cart")box(c,-13,-11,26,20,"#806447","#a17a4e",1);
  if(f.books==="wet")oval(c,7,5,9,5,"#739898");
  if(f.books==="taped")box(c,-16,-3,32,6,"#f7d475");
  label(c,f.books==="cart"?"空":f.books==="wet"?"湿":"书",-3,-3,12,f.books==="cart"?"#faf1ce":ink);
  if(f.covered){box(c,-19,-18,38,34,"#548e9c",ink,4);line(c,[[-16,-14],[15,12]],"#c4e6d5",2);}
  c.restore();
  for(const e of f.extras){
    const spec=freightCatalog[e.kind],w=spec.w,h=spec.h;
    c.save();c.translate(e.x,e.y);c.rotate(e.angle);
    if(spec.art==="lamp"){
      oval(c,0,h/2-7,w/2,7,"#ac8050",ink);line(c,[[0,h/2-8],[0,-h/2+10]],ink,4);
      box(c,-w/2,-h/2,w,21,"#f5d47c",ink,5);
    }else{
      box(c,-w/2,-h/2,w,h,spec.art==="table"?"#b88760":"#baddd9",ink,4);
      if(spec.art==="mirror"){
        c.strokeStyle="#ad855a";c.lineWidth=4;c.strokeRect(-w/2+3,-h/2+3,w-6,h-6);
        line(c,[[-w*.32,-h*.18],[w*.18,-h*.4]],"#edf8ea",4);
        if(e.damaged)line(c,[[0,-h/2],[-7,-14],[8,-3],[-2,6],[12,23]],ink,2);
      }else line(c,[[-w/2+5,0],[w/2-5,0]],"#805b44");
    }
    c.restore();
  }
  c.save();c.translate(plant.x,plant.y);
  if(f.spilled)for(const [x,y] of [[-16,13],[16,15],[-11,17],[19,10]])oval(c,x,y,2.3,1.6,"#8d6248");
  box(c,-13,-4,26,20,"#c18060",ink,5);
  c.rotate(f.tilt*.38);line(c,[[0,3],[0,-14]],ink,2);
  oval(c,-6,-6,8,4,"#70a17c",ink);oval(c,6,-12,8,5,"#8caf78",ink);oval(c,-2,-17,5,6,"#70a17c",ink);
  c.restore();
}
export function playersArt(c:Brush,frame:Snapshot,me:string){
  for(const p of frame.people){
    const mine=p.id===me, cap=p.slot===0?"#e6aa47":"#7397bd";
    c.save();c.translate(p.x,p.y+(p.held && p.held!=="sofa"?15:0));oval(c,1,7,13,9,"#55604e55");
    box(c,-11,-5,22,18,p.slot===0?"#588888":"#7d7ea1",ink,7);
    oval(c,0,-4,10,10,"#edc7a1",ink);box(c,-10,-14,20,9,cap,ink,5);
    box(c,-3,-9,16,5,cap,ink,3);oval(c,5,-2,1.5,1.5,ink);
    const name=mine?"你":"搭档";box(c,-17,-36,34,17,mine?"#315849":"#4c6380","",5);label(c,name,0,-27,12,"#fffce4");c.restore();
  }
}
