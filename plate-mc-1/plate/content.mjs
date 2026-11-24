import {riceSeconds, onigiriIngredients} from "./upstream/recipe.mjs";

export const tools = {
  rice: {name:"米柜", art:"rice", action:"stock", item:"rice"},
  nori: {name:"海苔柜", art:"nori", action:"stock", item:"nori"},
  cucumber: {name:"黄瓜筐", art:"cucumber", action:"stock", item:"cucumber"},
  egg: {name:"鸡蛋筐", art:"egg", action:"stock", item:"egg"},
  beef: {name:"牛排柜", art:"beef", action:"stock", item:"beef"},
  pot: {name:"饭锅", art:"pot", action:"cook", appliance:"pot", seconds:riceSeconds},
  pan: {name:"平底锅", art:"pan", action:"cook", appliance:"pan"},
  board: {name:"料理台", art:"board", action:"combine", seconds:.5},
  pass: {name:"传菜台", art:"counter", action:"counter"},
  counter: {name:"备餐台", art:"counter", action:"counter"},
  bin: {name:"垃圾桶", art:"bin", action:"discard"},
  sink: {name:"水槽", art:"sink", action:"wash", seconds:3, capacity:4},
  rack: {name:"盘架", art:"rack", action:"plates", frontOnly:true},
  table: {name:"餐桌", art:"table", action:"table", seats:2, frontOnly:true},
};
// Each heat interval ends when its output becomes available in the appliance.
const riceStep={action:"cook",station:"pot",inputs:["rice"],output:"cooked",
  stages:[{item:"cooked"},{seconds:8,item:"burntRice"}]};
export const recipes = {
  onigiri: {name:"海苔饭团", price:12, product:"onigiri", steps:[
    riceStep,
    {action:"combine", inputs:onigiriIngredients, output:"onigiri",verb:"捏制"},
  ]},
  cucumberRoll:{name:"黄瓜细卷",price:15,product:"cucumberRoll",steps:[
    {action:"combine",inputs:["cucumber"],output:"cucumberStrips",verb:"切条"},
    riceStep,
    {action:"combine",inputs:[...onigiriIngredients,"cucumberStrips"],output:"cucumberRoll",verb:"卷制"},
  ]},
  omelet:{name:"厚蛋烧",price:10,product:"omelet",steps:[
    {action:"combine",inputs:["egg"],output:"beatenEgg",verb:"打蛋"},
    {action:"cook",station:"pan",inputs:["beatenEgg"],output:"omeletLog",
      stages:[{seconds:4,item:"omeletLog"},{seconds:8,item:"burntEgg"}]},
    {action:"portion",station:"counter",inputs:["omeletLog"],output:"omelet",servings:2},
  ]},
  steak:{name:"牛排",price:18,variants:{
    medium:{name:"五分熟牛排",product:"steakMedium"},well:{name:"全熟牛排",product:"steakWell"},
  },steps:[
    {action:"cook",station:"pan",inputs:["beef"],output:"steakMedium",
      stages:[{seconds:4,item:"steakMedium"},{seconds:4,item:"steakWell"},{seconds:6,item:"burntSteak"}]},
  ]},
};
const place=(id,kind,x,y,dir=0)=>({id,kind,x,y,dir});
const kitchenSupplies=(cucumber,egg,beef,pan,counter,bin)=>[
  place("cucumber","cucumber",...cucumber),place("egg","egg",...egg),place("beef","beef",...beef),
  place("pan","pan",...pan),place("counter","counter",...counter),place("bin","bin",...bin),
];
// Edges lie on the right or bottom of the named cell. A window passes items, never people.
const edge=(x,y,side,kind="wall")=>({x,y,side,kind});
const divider=(row,length,windows)=>Array.from({length},(_,x)=>edge(x,row,"down",windows.includes(x)?"window":"wall"));
const queueOutside=(doorX,y,direction)=>Array.from({length:4},(_,i)=>[doorX+i*direction,y]);
export const maps = {
  corner_diner:{
    name:"街角小食堂",description:"中间递菜，右侧通行。把水槽搬近前厅，可以少跑一趟。",width:10,height:8,
    kitchen:[0,0,10,4],outside:true,entry:[0,7],queue:queueOutside(0,8,1),
    spawns:{host:[3,2],guest:[6,5]},walls:[],edges:divider(3,8,[4,5]),passages:[[8,3],[8,4],[9,3],[9,4]],
    fixtures:[place("rice","rice",1,1),place("pot","pot",2,1),place("nori","nori",3,1),place("board","board",4,1),
      ...kitchenSupplies([3,3],[9,2],[7,0],[8,0],[9,1],[7,3]),
      place("rack","rack",6,2,0),place("sink","sink",7,2),place("pass","pass",4,3),place("a","table",2,5,3),place("b","table",7,6,2)],
  },
  island_diner:{
    name:"中岛小馆",description:"后厨居中，两侧递菜。绕岛上菜时可以按桌位选路。",width:11,height:9,
    kitchen:[3,2,5,5],outside:true,entry:[5,8],queue:queueOutside(5,9,-1),
    spawns:{host:[5,4],guest:[8,6]},walls:[],passages:[[7,6],[7,7]],
    edges:[...Array.from({length:5},(_,i)=>edge(3+i,1,"down")),
      ...Array.from({length:4},(_,i)=>edge(3+i,6,"down")),
      ...Array.from({length:5},(_,i)=>edge(2,2+i,"right",i===2?"window":"wall")),
      ...Array.from({length:5},(_,i)=>edge(7,2+i,"right",i===2?"window":"wall"))],
    fixtures:[place("rice","rice",3,2),place("pot","pot",4,2),place("nori","nori",5,2),place("board","board",6,2),
      ...kitchenSupplies([7,2],[6,4],[3,6],[5,6],[4,4],[8,7]),
      place("rack","rack",4,6,2),place("sink","sink",6,6),place("pass","pass",3,4),place("pass2","pass",7,4),
      place("a","table",1,4,3),place("b","table",9,4,1)],
  },
  courtyard_diner:{
    name:"双窗小院",description:"花池两侧各有一扇窗，可以分桌出菜，也可以一边递菜、一边回盘。",width:11,height:8,
    kitchen:[0,0,11,4],outside:true,entry:[5,7],queue:queueOutside(5,8,1),
    spawns:{host:[4,2],guest:[7,5]},walls:[],planters:[[5,5],[6,5]],edges:divider(3,10,[2,8]),passages:[[10,3],[10,4]],
    fixtures:[place("rice","rice",2,1),place("pot","pot",3,1),place("nori","nori",4,1),place("board","board",5,1),
      ...kitchenSupplies([4,3],[6,0],[8,0],[9,0],[7,0],[9,3]),
      place("rack","rack",7,2,0),place("sink","sink",9,2),place("pass","pass",2,3),place("pass2","pass",8,3),
      place("a","table",2,5,2),place("b","table",8,6,2)],
  },
  shop: {width:12,height:7,split:7,entry:[11,3],queue:[[11,3],[11,4],[11,5],[11,6]],
    spawns:{host:[3,3],guest:[7,3]}, walls:[[6,0],[6,1],[6,5],[6,6]],
    fixtures:[
      place("rice","rice",1,1),place("pot","pot",2,1),place("nori","nori",3,1),place("board","board",4,1),
      place("rack","rack",2,5,2),place("sink","sink",4,5,2),place("pass","pass",6,3,1),
      place("a","table",9,1,1),place("b","table",9,5,1),
    ]},
};
export const levels = {
  first:{map:"corner_diner",maps:["corner_diner","island_diner","courtyard_diner"],menu:["onigiri","cucumberRoll","omelet","steak"],plates:3,duration:60,arrivals:[[1,1],[8,2],[23,2],[40,1]],
    patience:{queue:105,order:70,food:110}, browse:3,eat:6},
};
export const catalog={tools,recipes,maps,levels};
export function recipeFixtures(book,map,recipeId){
  const {steps}=book.recipes[recipeId];
  return map.fixtures.filter(f=>{
    const tool=book.tools[f.kind];
    if(tool.action==="stock")return steps.some(step=>step.inputs.includes(tool.item));
    if(tool.action==="cook")return steps.some(step=>step.action==="cook" && (!step.station || step.station===tool.appliance));
    if(tool.action==="combine")return steps.some(step=>step.action==="combine");
    return true;
  });
}
export const dirs=[[0,1],[-1,0],[0,-1],[1,0]];
const names={rice:"生米",nori:"海苔",cooked:"熟饭",plate:"干净盘",dirty:"脏盘",cucumber:"黄瓜",cucumberStrips:"黄瓜条",
  egg:"鸡蛋",beatenEgg:"蛋液",omeletLog:"整条厚蛋烧",beef:"生牛排",burntRice:"焦饭",burntEgg:"焦蛋烧",burntSteak:"焦牛排"};
export const isBurnt=item=>["burntRice","burntEgg","burntSteak"].includes(item);
export const hasProduct=(recipe,item)=>!!item && (recipe.product===item || Object.values(recipe.variants || {}).some(v=>v.product===item));
export function canDiscard(item,book=catalog){
  if(!item || item==="plate" || item==="dirty" || item.startsWith("plated:"))return false;
  if(isBurnt(item) || Object.values(book.tools).some(tool=>tool.action==="stock" && tool.item===item))return true;
  return Object.values(book.recipes).some(recipe=>hasProduct(recipe,item) || recipe.steps.some(step=>
    step.output===item || step.stages?.some(stage=>stage.item===item)));
}
export function orderInfo(id,book=catalog){
  const [key,variant]=id.split(":"),recipe=book.recipes[key];
  return variant?{...recipe,...recipe.variants[variant]}:recipe;
}
export function itemName(item,book=catalog){
  if(!item)return "空手";
  const id=item.replace(/^plated:/,"");
  const recipe=Object.values(book.recipes).find(r=>hasProduct(r,id));
  const name=names[id] || Object.values(recipe?.variants || {}).find(v=>v.product===id)?.name || recipe?.name || id;
  return item.startsWith("plated:")?name+"（已装盘）":name;
}
