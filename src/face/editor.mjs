import {createModelViewer} from '../3d/viewer.mjs';
import {confirmModel,readConfirmedModel} from '../3d/profile.mjs';
import {downloadBody} from '../3d/download.mjs';
import {baseStyle,beautyPresets,beautyKeys,makeupPresets,zones,selectBeauty,selectMakeup} from './style.mjs';
import {fitFace} from './geometry.mjs';
import {observePhoto} from './observations.mjs';

const el=id=>document.getElementById(id),owner=readConfirmedModel();
if(owner?.kind!=='local'){location.replace('/create.html');}else{await edit(owner);}
async function edit(owner){
  const viewer=createModelViewer(el('face-view'));
  let draft=structuredClone(owner.faceLook??{front:null,side:null,shape:null,style:baseStyle()}),ready=false,busy=false;
  let generation=0,gray=false,holding=false,closeup=true,frame=0,pending=false,hasPreview=false;
  let failedView='front';
  const versions={front:0,side:0},files={front:null,side:null},working={front:false,side:false};
  const message=t=>{el('state').textContent=t;};
  const error=t=>{el('error').textContent=t;};
  function refresh(){
    pending=working.front||working.side;
    for(const id of ['save','export-base','export-style'])el(id).disabled=!ready||busy||pending;
    el('retry').disabled=!files[failedView]||busy||pending;
    el('side').disabled=!draft.front||working.front||busy;el('remove-side').disabled=(!draft.side&&!working.side)||busy;
    el('photo-info').textContent=(draft.front?'已使用正脸':'使用模板脸')+(draft.side?' · 侧照朝向 '+Math.round(draft.side.yaw*180/Math.PI)+'°':' · 深度采用模板先验')+
      (draft.front?'。后脑和不可见发际线采用模板近似。':'。');
    el('beauty-name').textContent=Object.keys(beautyPresets).find(n=>beautyKeys.every((k,i)=>draft.style.beauty[k]===beautyPresets[n][i]))??'自定义';
    for(const k of beautyKeys){el(k).value=draft.style.beauty[k];el(k+'-out').value=el(k).value;}
    for(const k of zones){el(k).value=draft.style.makeup[k].amount;el(k+'-out').value=el(k).value;el(k+'-color').value=draft.style.makeup[k].color;}
    el('gray').setAttribute('aria-pressed',String(gray));
  }
  function repaint(){if(!ready||busy)return;cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>viewer.setFaceStyle(holding?baseStyle():draft.style,gray&&!holding));}
  function changed(){el('wardrobe').hidden=true;refresh();repaint();}
  async function rebuild(next){
    const id=++generation;ready=false;refresh();
    try {
      const {measurements:cm}=await viewer.load(null,{...owner,faceLook:next},true);
      if(id!==generation)return;
      el('dimensions').textContent='网格复测（cm）　身高 '+cm.height.toFixed(2)+'　胸 '+cm.chest.toFixed(2)+'　腰 '+cm.waist.toFixed(2)+'　臀 '+cm.hips.toFixed(2);
      // Sliders may change while the mesh is being built.
      next.style=draft.style;draft=next;ready=hasPreview=true;viewer.focusFace(closeup);viewer.setFaceStyle(draft.style,gray);
    }catch(e){if(id===generation){ready=hasPreview;error(e.message);throw e;}}finally{refresh();}
  }
  function button(text,fn,parent){
    const b=document.createElement('button');b.textContent=text;b.onclick=fn;parent.append(b);return b;
  }
  function slider(k,label,parent,makeup){
    const row=document.createElement('div');row.className='control';
    row.innerHTML='<label for="'+k+'">'+label+'</label><input id="'+k+'" type="range" min="0" max="100"><output id="'+k+'-out"></output>';
    parent.append(row);
    if(makeup){
      const col=document.createElement('input');col.type='color';col.id=k+'-color';col.setAttribute('aria-label',label+'色号');row.append(col);
      col.oninput=()=>{draft.style.makeup[k].color=col.value;changed();};
    }else button('复位',()=>{draft.style.beauty[k]=0;changed();},row);
    el(k).oninput=()=>{if(makeup)draft.style.makeup[k].amount=+el(k).value;else draft.style.beauty[k]=+el(k).value;changed();};
  }
  beautyKeys.forEach((k,i)=>slider(k,['磨皮','匀肤','提亮','下颌轻收'][i],el('beauty-controls'),false));
  zones.forEach((k,i)=>slider(k,['口红浓度','腮红晕染','眼影浓度','眼线粗细'][i],el('makeup-controls'),true));
  const descriptions={'原貌':'保留肤质和脸型','自然清透':'轻磨皮、轻匀肤','柔和上镜':'加强磨皮、匀肤和提亮','轮廓微调':'轻匀肤并收下颌'};
  for(const n of Object.keys(beautyPresets)){
    const preset=button(n,()=>{draft.style=selectBeauty(draft.style,n);changed();},el('beauty-presets'));
    const detail=document.createElement('small');detail.textContent=descriptions[n];detail.style.display='block';
    preset.append(detail);preset.setAttribute('aria-label',n);preset.title=descriptions[n];
  }
  for(const n of Object.keys(makeupPresets))button(n,()=>{draft.style=selectMakeup(draft.style,n);changed();},el('makeup-presets'));
  el('beauty-reset').onclick=()=>{draft.style=selectBeauty(draft.style,'原貌');changed();};
  el('remove-makeup').onclick=()=>{draft.style.makeup=baseStyle().makeup;changed();};
  const hold=v=>{holding=v;repaint();};
  el('compare').onpointerdown=e=>{el('compare').setPointerCapture(e.pointerId);hold(true);};
  for(const ev of ['pointerup','lostpointercapture','blur'])el('compare').addEventListener(ev,()=>hold(false));
  el('compare').onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();hold(true);}};
  el('compare').onkeyup=()=>hold(false);
  el('gray').onclick=()=>{gray=!gray;refresh();repaint();};
  el('focus').onclick=()=>{closeup=!closeup;viewer.focusFace(closeup);el('focus').textContent=closeup?'看全身':'看面部';};

  async function detect(v,file){
    if(!file||busy)return;
    if(hasPreview){generation++;viewer.cancelPendingLoad();ready=true;}
    const seq=++versions[v];files[v]=file;failedView=v;working[v]=true;
    if(v==='front'){versions.side++;working.side=false;}
    error('');message('正在本机检测'+(v==='front'?'正脸':'侧脸')+'…');refresh();
    try{
      const obs=await observePhoto(file,v,el(v+'-mirror').checked);
      if(seq!==versions[v])return;
      const next={...draft,[v]:obs};if(v==='front'){next.side=null;files.side=null;el('side').value='';}
      next.shape=fitFace(next.front,next.side);
      await rebuild(next);if(seq!==versions[v])return;
      el('wardrobe').hidden=true;message('原貌已生成，可旋转核对或继续调妆。');
    }catch(e){if(seq===versions[v]){error(e.message);message('保留上一次可用造型，可重试或替换照片。');}}
    finally{if(seq===versions[v]){working[v]=false;refresh();}}
  }
  for(const v of ['front','side']){
    el(v+'-mirror').checked=Boolean(draft[v]?.mirror);
    el(v).onchange=()=>detect(v,el(v).files[0]);
    el(v+'-mirror').onchange=()=>files[v]&&detect(v,files[v]);
  }
  el('retry').onclick=()=>detect(failedView,files[failedView]);
  el('remove-side').onclick=async()=>{versions.side++;working.side=false;files.side=null;el('side').value='';
    error('');await rebuild({...draft,side:null,shape:fitFace(draft.front,null)});changed();message('已保留仅正脸结果。');};
  el('save').onclick=()=>{try{
    const current=readConfirmedModel();if(current?.id!==owner.id)throw new Error('当前人台已更换，请重新打开面部造型。');
    confirmModel({...current,faceLook:draft});message('造型已确认，可进入试衣间或下载。');el('wardrobe').hidden=false;
  }catch(e){error(e.message);}};
  async function saveFile(original){
    if(busy||!ready||pending)return;busy=true;el('panel').inert=true;cancelAnimationFrame(frame);refresh();
    try{viewer.setFaceStyle(original?baseStyle():draft.style,false);
      await downloadBody(viewer,owner.id+(original?'-original':'-styled'));message('已导出'+(original?'原貌':'当前造型')+' GLB。');
    }catch(e){error(e.message);}finally{busy=false;el('panel').inert=false;refresh();repaint();}
  }
  el('export-base').onclick=()=>saveFile(true);el('export-style').onclick=()=>saveFile(false);
  window.addEventListener('pagehide',()=>{versions.front++;versions.side++;generation++;cancelAnimationFrame(frame);viewer.dispose();});
  try{await rebuild(draft);el('panel').inert=false;message('可上传照片或直接在当前脸型上试妆。');
    const key='wearmate.face.input.'+owner.id,source=sessionStorage.getItem(key);sessionStorage.removeItem(key);
    if(source&&!draft.front)await detect('front',await (await fetch(source)).blob());
  }catch(e){error(e.message);}
}

