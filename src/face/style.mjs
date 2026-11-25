export const beautyPresets={'原貌':[0,0,0,0],'自然清透':[15,15,5,0],'柔和上镜':[30,25,10,0],'轮廓微调':[10,10,0,20]};
export const beautyKeys=['smooth','even','light','jaw'];
export const makeupPresets={
  '清透日常':[['#ae5e67',42],['#db8680',26],['#bc927f',23],['#523b38',32]],
  '暖调晚妆':[['#953746',78],['#c06559',43],['#965c52',58],['#39262c',68]]
};
export const zones=['lip','blush','shadow','liner'];
export function baseStyle(){
  return {beauty:Object.fromEntries(beautyKeys.map(k=>[k,0])),
    makeup:Object.fromEntries(zones.map((k,i)=>[k,{color:makeupPresets['清透日常'][i][0],amount:0}]))};
}
export function selectBeauty(style,name){
  return {...style,beauty:Object.fromEntries(beautyKeys.map((k,i)=>[k,beautyPresets[name][i]]))};
}
export function selectMakeup(style,name){
  return {...style,makeup:Object.fromEntries(zones.map((k,i)=>[k,{color:makeupPresets[name][i][0],amount:makeupPresets[name][i][1]}]))};
}

