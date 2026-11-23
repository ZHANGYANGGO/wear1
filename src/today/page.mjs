import { cities, forecast, scenarios, simulated } from './weather.mjs';
import { availableClothes, recommend, weatherProfile } from './rules.mjs';

const prefKey = 'wearmate.today.weather';
function node(tag,text,className) {
  const el=document.createElement(tag);
  if (text !== undefined) el.textContent=text;
  if (className) el.className=className;
  return el;
}
export function mountToday({list,ready,wear,current,failedNames}) {
  const $ = id=>document.getElementById(id);
  const location=$('weather-city'), mode=$('weather-mode'), status=$('weather-status');
  const summary=$('weather-summary'), cards=$('weather-plans'), notes=$('weather-notes');
  for (const city of cities) location.add(new Option(city.name,city.name));
  for (const [id,[name,temp]] of Object.entries(scenarios)) mode.add(new Option('模拟 · '+temp+'°C '+name,id));
  try {
    const prefs=JSON.parse(sessionStorage.getItem(prefKey));
    if (cities.some(c=>c.name===prefs?.city)) location.value=prefs.city;
    if (Object.hasOwn(scenarios,prefs?.mode)) mode.value=prefs.mode;
  } catch {}
  let weather, plans=[], sequence=0, controller;
  const city = ()=>cities.find(c=>c.name===location.value);

  function sync() {
    const visible=current();
    for (const card of cards.children) {
      const plan=plans.find(p=>p.id===card.dataset.plan);
      const active=plan && Object.entries(plan.garmentIds).every(([key,id])=>visible[key]===id);
      card.querySelector('button').setAttribute('aria-pressed',String(Boolean(active)));
      card.querySelector('button').textContent=active?'正在穿着':'试穿方案 '+(plan.id==='outfit-a'?'A':'B');
    }
  }

  function render() {
    cards.replaceChildren(); notes.replaceChildren(); plans=[];
    if (!weather) return;
    let result;
    try { result=recommend(list(),weather,ready); }
    catch { notes.textContent='无法读取专属衣橱，请检查浏览器存储后重试。'; return; }
    plans=result.plans;
    for (const text of result.notices) notes.append(node('p',text));
    const failed=failedNames();
    if (failed.length) notes.append(node('p','加载失败，已排除：'+failed.join('、')+'。'));
    for (const plan of plans) {
      const card=node('article',undefined,'plan-card');
      card.dataset.plan=plan.id;
      const head=node('header');
      head.append(node('span',plan.id==='outfit-a'?'A':'B','plan-letter'),node('h3',plan.name));
      const action=node('button'); action.type='button';
      action.addEventListener('click',()=>{
        try {
          const allowed=new Set(availableClothes(list(),ready).map(item=>item.id));
          const invalid=plan.items.filter(item=>!allowed.has(item.id));
          if (invalid.length) throw new Error('暂不可穿：'+invalid.map(i=>i.name).join('、'));
          wear(plan);
          $('plan-feedback').textContent='已试穿「'+plan.name+'」。';
          if (matchMedia('(max-width: 52rem)').matches) $('fitting-room').scrollIntoView({block:'start'});
          sync();
        } catch (error) {
          $('plan-feedback').textContent=error.message+'。已保留当前造型。';
          render();
        }
      });
      head.append(action);
      const pieces=node('div',undefined,'plan-pieces');
      for (const item of plan.items) {
        const figure=node('figure');
        const img=node('img'); img.src=item.cartoonDisplayImage; img.alt='';
        figure.append(img,node('figcaption',item.name)); pieces.append(figure);
      }
      card.append(head,pieces,node('p',plan.reason,'plan-reason')); cards.append(card);
    }
    sync();
  }
  function paint() {
    const w=weather, p=weatherProfile(w);
    $('weather-degree').textContent=Math.round(w.temp)+'°';
    $('weather-condition').textContent=w.city.name+' · '+w.label;
    $('weather-range').textContent='低 '+w.low+'° / 高 '+w.high+'°';
    $('weather-values').textContent='体感 '+(w.feels===null?'暂无':w.feels+'°C')+'　·　今日降水概率 '+w.rain+'%　·　风速 '+w.wind+' km/h';
    $('weather-hint').textContent=p.cold?'体感偏冷，优先叠穿外套。':p.hot?'天气偏热，选择轻薄单品。':
      p.wet?'留意降水，选择鞋面包覆较多的搭配。':p.breezy?'风较大，可搭配一层外套。':'温度适宜，适合轻装出行。';
    const source=$('weather-source');
    source.replaceChildren();
    if (w.source==='模拟天气') source.append('模拟天气 · 场景时间 ');
    else {
      const link=node('a','Open-Meteo');
      link.href='https://open-meteo.com/'; link.target='_blank'; link.rel='noopener';
      source.append(link,' · 预报更新时间 ');
    }
    source.append(w.time.replace('T',' ')+'　'+w.city.timezone);
    summary.hidden=false; render();
  }
  async function refresh() {
    const token=++sequence;
    controller?.abort();
    controller=new AbortController();
    const signal=controller.signal;
    const live=mode.value==='live';
    try {sessionStorage.setItem(prefKey,JSON.stringify({city:location.value,mode:mode.value}));} catch {}
    $('weather-retry').hidden=!live; $('plan-feedback').textContent='';
    weather=null; summary.hidden=true; render();
    status.textContent=live?'正在获取'+city().name+'的当地天气…':'';
    const activeController=controller;
    const timer=setTimeout(()=>activeController.abort(),10000);
    try {
      const next=live?await forecast(city(),signal):simulated(city(),mode.value);
      if (token!==sequence) return;
      weather=next;status.textContent='';paint();
    } catch (error) {
      if (token!==sequence) return;
      status.textContent='天气获取失败。'+(error.name==='AbortError'?'请求超时。':'')+'请重试或选择模拟天气。';
    } finally {clearTimeout(timer);}
  }
  location.onchange=mode.onchange=refresh; $('weather-retry').onclick=refresh;
  refresh();
  return sync;
}
