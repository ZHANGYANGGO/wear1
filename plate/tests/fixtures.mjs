import {catalog} from "../content.mjs";

export function testBook(){
  const book=structuredClone(catalog);
  book.tools.quickPot={...book.tools.pot,name:"快煮锅",seconds:1};
  book.recipes.doubleRice={name:"双米饭团",price:19,product:"doubleRice",steps:[
    book.recipes.onigiri.steps[0],
    {action:"combine",inputs:["cooked","cooked"],output:"doubleRice"},
  ]};
  const map=book.maps.courtyard=structuredClone(book.maps.shop);
  map.entry=[11,0];map.queue=[[11,0],[11,1],[11,2],[11,3]];
  Object.assign(map.fixtures.find(f=>f.id==="a"),{x:8,y:2});
  map.fixtures.find(f=>f.id==="pot").kind="quickPot";
  const first=book.levels.first;
  book.levels.steakService={...first,maps:undefined,menu:["steak"],arrivals:[[0,1],[0,1]],duration:8};
  first.menu=["onigiri"];
  book.levels.mapShift={...first,duration:32,arrivals:[[0,1]],browse:.2,eat:.5,patience:{...first.patience,order:10}};
  first.map="shop";delete first.maps;
  book.levels.extension={...first,duration:3,map:"courtyard",menu:["doubleRice"],arrivals:[[0,1]],browse:.2,eat:.5};
  book.levels.rush={...first,duration:2,arrivals:[[0,2],[0,2],[1,1]],browse:.5,eat:1,
    patience:{queue:180,order:180,food:180}};
  book.levels.duo={...first,duration:6,arrivals:[[0,2]],browse:.2,eat:2};
  return book;
}
