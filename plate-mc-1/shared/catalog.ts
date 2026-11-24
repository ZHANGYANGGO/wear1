/** Order freight is billed per physical instance; equipment belongs to the whole run. */
export type FreightSpec = {
  name: string; w: number; h: number; price: number; damagedPrice?: number;
  impact?: number; art: "table" | "lamp" | "mirror"; risk: string;
};
export const freightCatalog: Record<string, FreightSpec> = {
  table: { name:"折叠桌", w:78,h:19, price:12, art:"table",risk:"扁平，适合窄位" },
  lamp: { name:"落地灯", w:20,h:90, price:20, art:"lamp",risk:"细长，留意转弯" },
  mirror: { name:"穿衣镜", w:72,h:143, price:35, damagedPrice:15, impact:1.9, art:"mirror",risk:"碰撞降价至 15" },
};
export type Placement = { id:string; kind:string; x:number; y:number };
export const placements:Placement[] = [
  {id:"lamp-1",kind:"lamp",x:375,y:257},{id:"table-1",kind:"table",x:100,y:100},
  {id:"table-2",kind:"table",x:275,y:88},{id:"mirror-1",kind:"mirror",x:85,y:277},
];
export const rules = { initialWallet:0,initialStock:{} as Record<string,number>,initialVehicle:"",
  base:120,cost:100,plantDamage:25,standardWidth:214,
  levels:[{name:"公寓搬迁",seconds:360,rain:false},{name:"雨前发车",seconds:360,rain:true}] };
export type Preset="normal"|"rain"|"short"|"even"|"practice";
export function presetOf(v:unknown):Preset {
  return v==="rain"||v==="short"||v==="even"||v==="practice"?v:"normal";
}
export function order(level:number,preset:Preset,seed:number) {
  const entry=rules.levels[level];
  const seconds=preset==="short"||preset==="even"?12:entry.seconds;
  return {...entry,seconds,base:rules.base,cost:preset==="even"?120:rules.cost,
    rainAt:entry.rain || preset==="rain" ? 24000+((seed>>>0)%13)*1000 : null};
}
