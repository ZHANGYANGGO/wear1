import assert from 'node:assert/strict';
import test from 'node:test';
import { bobCatalog } from '../src/wardrobe/woman-bob-wardrobe.mjs';
import { availableClothes,recommend,weatherProfile } from '../src/today/rules.mjs';
import { cities,parseForecast,simulated } from '../src/today/weather.mjs';

const run=(id,items=bobCatalog,ready=()=>true)=>recommend(items,simulated(cities[0],id),ready);
for(const id of ['mild','cold','hot','rain']) test('complete, distinct, fitted outfits for '+id,()=>{
  const {plans}=run(id); assert.equal(plans.length,2);
  for(const plan of plans) {
    assert.equal(plan.avatarId,'woman-bob');
    const g=plan.garmentIds;
    assert.ok(g.shoes && (g.dress ? !g.top&&!g.bottom : g.top&&g.bottom));
    assert.ok(plan.items.every(item=>bobCatalog.some(i=>i.id===item.id)));
    if(id==='cold') assert.equal(g.outerwear,'white-puffer');
    if(id==='hot') assert.equal(g.outerwear,null);
    if(id==='rain') assert.equal(g.shoes,'white-platform-sneakers');
  }
  assert.ok(['top','bottom','dress'].some(slot=>plans[0].garmentIds[slot]!==plans[1].garmentIds[slot]));
});
test('deleted, washing, unknown, recategorized or broken assets cannot pad a second look',()=>{
  const items=bobCatalog.map(item=>['purple-graphic-tee','navy-shirt'].includes(item.id)?{...item,availability:'washing'}:item);
  assert.equal(run('mild',items).plans.length,1);
  assert.equal(run('mild',items,id=>id!=='floral-maxi').plans.length,0);
  const fake=[{...bobCatalog[0],id:'brick-tee'},{...bobCatalog[0],category:'shoes'},
    {...bobCatalog[0],availability:'unavailable'}];
  assert.deepEqual(availableClothes(fake,()=>true),[]);
  assert.match(run('cold',bobCatalog,id=>id!=='white-puffer').notices.join(''),/缺少/);
});
test('wind, apparent temperature and probable precipitation affect selection',()=>{
  const mild=simulated(cities[0],'mild');
  assert.equal(weatherProfile({...mild,feels:9,wind:30}).cold,true);
  assert.equal(weatherProfile({...mild,rain:75}).wet,true);
  assert.equal(weatherProfile({...mild,rain:75}).wetNow,false);
});
test('city-local day, missing apparent temperature and incomplete forecasts',()=>{
  const now=new Date('2026-11-20T23:45:00Z'),city=cities[0];
  const data={timezone:city.timezone,current:{temperature_2m:14,weather_code:2,wind_speed_10m:11,time:'2026-11-21T07:45'},
    daily:{time:['2026-11-20','2026-11-21'],temperature_2m_max:[20,19],temperature_2m_min:[13,12],precipitation_probability_max:[10,35]}};
  const w=parseForecast(city,data,now);assert.equal(w.high,19);assert.equal(w.rain,35);assert.equal(w.feels,null);
  assert.throws(()=>parseForecast(city,{...data,current:{...data.current,time:'2026-11-20T23:45'}},now));
  assert.throws(()=>parseForecast(city,{...data,daily:{...data.daily,temperature_2m_max:[20,null]}},now));
  assert.match(simulated(cities.at(-1),'hot',now).time,/^2026-11-20/);
});

