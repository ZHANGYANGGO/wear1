import { bobCatalog, bobId } from '../wardrobe/woman-bob-wardrobe.mjs';

const fitted = new Map(bobCatalog.map(item => [item.id,item.category]));
const neutral = /^(黑|白|浅灰|米白|暖白|裸杏)/;
const blues = /蓝|靛/;
const styles = {
  daily: ['休闲','运动','宽松','水洗','网面'],
  accent: ['通勤','复古','度假','碎花','几何暗纹','细带'],
};

// Experience-based styling rules for this wardrobe. Wind is measured in km/h.
export function weatherProfile(w) {
  const feel = w.feels ?? w.temp;
  const effective = .75*feel + .25*w.temp - (w.wind>=24 ? 2 : 0) - (w.low<feel-8 ? 1 : 0);
  const wetNow = (w.code>=51 && w.code<=86) || w.code>=95;
  return { cold:effective<=12, hot:effective>=25, breezy:w.wind>=24 && effective<20,
    wet:wetNow || w.rain>=60, wetNow };
}

export function availableClothes(items, ready) {
  return items.filter(item => item.availability==='available' && fitted.get(item.id)===item.category && ready(item.id));
}

function score(look, weather, style) {
  const items = Object.values(look).filter(Boolean);
  const core = look.dress ?? look.top;
  const tags = items.flatMap(item=>item.styleTags ?? []);
  const harmony = items.filter(item=>neutral.test(item.primaryColor)).length>0 ? 3 : 0;
  const echoed = items.some(item=>items.some(other=>other!==item &&
    (item.secondaryColors ?? []).some(color=>color===other.primaryColor)));
  const plainBase = core.statementLevel==='statement' && (!look.bottom || look.bottom.statementLevel==='basic');
  let points = harmony + Number(echoed)*2 + Number(plainBase)*2;
  points += tags.filter(tag=>styles[style].includes(tag)).length*2;
  if (look.bottom && blues.test(look.bottom.primaryColor) && /紫|蓝/.test(core.primaryColor)) points += 2;
  if (look.bottom?.styleTags?.includes('通勤') && core.styleTags?.includes('通勤')) points += 3;
  if (look.bottom?.styleTags?.includes('运动') && look.shoes.styleTags?.includes('运动')) points += 2;
  if (style==='accent') points += core.statementLevel==='statement' ? 6 : 2;
  if (style==='daily' && look.bottom) points += 4;
  if (weather.cold) points += (look.bottom?.warmthLevel ?? 0)*4 + (look.shoes.warmthLevel ?? 1)*2;
  if (weather.hot) points += 2*(3-(core.warmthLevel ?? 2)) + Number(Boolean(look.dress))*(style==='daily' ? 15 : 3);
  if (weather.breezy && look.outerwear) points += 6;
  if (!weather.cold && !weather.breezy && look.outerwear) points -= 14;
  if (weather.wet && look.dress) points -= 8;
  return points;
}

function difference(a,b) {
  if (!!a.dress!==!!b.dress) return 5;
  // A closed puffer conceals the top. A visible lower silhouette must then change.
  if (a.outerwear && b.outerwear && a.bottom?.id===b.bottom?.id) return 0;
  return Number(a.top?.id!==b.top?.id)*2 + Number(a.bottom?.id!==b.bottom?.id)*2
    + Number(a.outerwear?.id!==b.outerwear?.id);
}

function reason(look,profile) {
  const core = look.dress ?? look.top;
  const weather = profile.wetNow ? '当前有降水' : profile.wet ? '今天降水概率较高'
    : profile.cold ? '体感偏冷' : profile.hot ? '体感偏热' : profile.breezy ? '风较大' : '体感温和';
  const pairing = look.dress ? core.name+'配'+look.shoes.name+'，让碎花成为整套的重点'
    : core.name+'配'+look.bottom.name+'，'+(core.statementLevel==='statement' ? '把视觉重点留给上衣' : core.styleTags?.includes('通勤') && look.bottom.styleTags?.includes('通勤') ? '用直筒裤承接衬衫的利落线条' : '用'+look.bottom.primaryColor+'下装衬托上衣');
  return weather+'，'+pairing+'。'+(look.outerwear ? '外搭'+look.outerwear.name+'。' : '');
}

export function recommend(items,weather,ready) {
  const usable = availableClothes(items,ready);
  const group = slot => usable.filter(item=>item.category===slot);
  const p = weatherProfile(weather);
  const notices = [];
  const coats = group('outerwear');
  if (p.cold && !coats.length) notices.push('可穿衣物中缺少已适配的外套，现有搭配对低温的覆盖有限。');
  const outerOptions = p.hot ? [null] : p.cold && coats.length ? coats : [null,...coats];
  let shoes = group('shoes');
  if ((p.wet || p.cold) && shoes.some(item=>item.id==='white-platform-sneakers')) {
    shoes = shoes.filter(item=>item.id!=='ivory-mary-janes');
  }
  if (p.wet) {
    notices.push(shoes.some(item=>item.id==='white-platform-sneakers')
      ? '降水时优先包覆脚面的鞋款。衣库尚无经过验证的防水鞋。'
      : '缺少可穿的包覆式运动鞋，雨天鞋款选择有限。');
  }
  const cores = [];
  for (const top of group('top')) for (const bottom of group('bottom')) cores.push({top,bottom,dress:null});
  // The only dress in this wardrobe is a light, full-length floral dress.
  if (!p.cold) for (const dress of group('dress')) cores.push({top:null,bottom:null,dress});
  const candidates = [];
  for (const core of cores) for (const shoe of shoes) for (const outerwear of outerOptions) {
    candidates.push({...core,shoes:shoe,outerwear});
  }
  function best(list,style,first) {
    return list.map(look=>({look,score:score(look,p,style)+(first?difference(look,first)*2:0)}))
      .sort((a,b)=>b.score-a.score)[0]?.look;
  }
  const a = best(candidates,'daily');
  const b = a && best(candidates.filter(other=>difference(a,other)>=2),'accent',a);
  if (!a) notices.push('现有可穿单品无法组成适合此天气的完整搭配。');
  else if (!b) notices.push('可用衣物仅支持一套搭配，无法再组成风格明显不同的第二套。');
  const plans = [a,b].filter(Boolean).map((look,i)=>({
    id:i?'outfit-b':'outfit-a',name:i?'精致出彩':'舒适日常',avatarId:bobId,
    garmentIds:Object.fromEntries(Object.entries(look).map(([slot,item])=>[slot,item?.id ?? null])),
    items:Object.values(look).filter(Boolean),reason:reason(look,p),
  }));
  return {plans,notices};
}

