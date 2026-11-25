import { sourceHash } from '../people/store.mjs';

const el = id => document.getElementById(id);
const names = {anime:'动漫',handdrawn:'手绘'};
const phases = {preparing:'正在准备本机模型…',inference:'正在生成脸部与外围头发…',calibrating:'正在生成图上校准五官与颈部…'};
const garments = new Map();
function garment(id) {
  if (!garments.has(id)) {
    const image = new Image();
    image.src = './assets/wardrobe/tryon/fitted/'+id+'.webp';
    garments.set(id,image.decode().then(()=>image).catch(error=>{garments.delete(id);throw error;}));
  }
  return garments.get(id);
}
function encode(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function requestHead(source,style,signal,progress) {
  const [foreground,semantic] = await Promise.all([encode(source.assets.foreground),encode(source.assets.semantic)]);
  const payload = {sourceId:source.sourceId,needsSupplement:source.needsSupplement,landmarks:source.landmarks,
    geometry:source.geometry,assets:{foreground,semantic}};
  let response;
  try {
    response=await fetch('./api/cartoon-head',{method:'POST',signal,
      headers:{'Content-Type':'application/json','X-Cartoon-Style':style},body:JSON.stringify(payload)});
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('无法连接本机服务。请重新启动「启动二维工作台.cmd」，保留页面并重试。');
  }
  if (!response.ok) {
    const message=await response.json().catch(()=>null);
    throw new Error(message?.error ?? '生成服务不可用。请重启二维工作台后重试。');
  }
  const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending='';
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      pending+=value;
      let split;
      while ((split=pending.indexOf('\n'))>=0) {
        const line=pending.slice(0,split);pending=pending.slice(split+1);
        if (!line) continue;
        const event=JSON.parse(line);
        if (event.error) throw new Error(event.error);
        if (event.phase) progress(phases[event.phase]);
        if (event.result) {
          const result=event.result;
          for (const [key,data] of Object.entries(result.assets)) {
            result.assets[key]=new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'});
          }
          result.sourceHash=await sourceHash(source);
          return result;
        }
      }
    }
  } catch (error) {
    if (!signal.aborted && (error instanceof TypeError || error instanceof SyntaxError)) {
      throw new Error('本机推理连接中断。请重启二维工作台后用同一张照片重试。');
    }
    throw error;
  } finally { reader.releaseLock(); }
  throw new Error('本机推理中断。请重启二维工作台后用同一张照片重试。');
}

function drawPoints(ctx,head) {
  const width=head.size[0];
  for (const [name,indexes] of Object.entries(head.features)) {
    ctx.beginPath();
    indexes.forEach((id,i)=>{const [x,y]=head.landmarks[id]; if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y);});
    ctx.closePath();
    ctx.lineWidth=Math.max(1,width/230);
    ctx.strokeStyle=name==='outline'?'#f5c644':'#18d1c5';ctx.stroke();
    for (const i of indexes) {
      const [x,y]=head.landmarks[i];ctx.beginPath();ctx.arc(x,y,Math.max(1,width/230),0,2*Math.PI);
      ctx.fillStyle=ctx.strokeStyle;ctx.fill();
    }
  }
  const [x,y]=head.version>=2 ? head.landmarks[152] : head.neck;
  ctx.lineWidth=2;ctx.strokeStyle='#ff407e';ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);
  ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();
}
export function createCartoonPanel(onState) {
  let source=null, draft=null, operation=null, locked=false, generation=0, drawing=0;
  let urls=[];
  function controls() {
    el('cartoon-generate').disabled=locked || !source || Boolean(operation);
    el('cartoon-generate').textContent=draft?'重新生成':'生成卡通头层';
    el('cartoon-style').disabled=locked || Boolean(operation);
    el('cartoon-stop').hidden=!operation;
    el('cartoon-save').disabled=locked || !draft || Boolean(operation);
    onState();
  }
  function stop() {
    generation++;
    operation?.abort();operation=null;
  }
  function clearUrls() {urls.forEach(url=>URL.revokeObjectURL(url));urls=[];}
  async function render() {
    const job=++drawing, head=draft;
    el('cartoon-inspect').hidden=el('cartoon-canvas').hidden=!head;
    el('cartoon-empty').hidden=Boolean(head);
    el('cartoon-caption').textContent=head?'卡通头层 · '+names[head.style]:'卡通头层';
    if (!head) return;
    const [bitmap,hair,join,shirt]=await Promise.all([createImageBitmap(head.assets.head),
      createImageBitmap(head.assets.frontHair),createImageBitmap(head.assets.neckJoin),garment(el('cartoon-garment').value)]);
    try {
      if (job!==drawing) return;
      const canvas=el('cartoon-canvas');
      [canvas.width,canvas.height]=head.size;
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
      if (el('cartoon-points').checked) drawPoints(ctx,head);
      const fit=el('cartoon-fitting'),fc=fit.getContext('2d');
      fc.clearRect(0,0,fit.width,fit.height);
      const [a,b,c,d,e,f]=head.mapping.layerToFittedTemplate;
      const front=document.createElement('canvas');
      [front.width,front.height]=head.size;
      const frontCtx=front.getContext('2d',{willReadFrequently:true});
      frontCtx.drawImage(hair,0,0);
      const mask=frontCtx.getImageData(0,0,front.width,front.height).data;
      frontCtx.clearRect(0,0,front.width,front.height);
      frontCtx.drawImage(bitmap,0,0);
      const pixels=frontCtx.getImageData(0,0,front.width,front.height);
      for (let i=0;i<mask.length;i+=4) pixels.data[i+3]=mask[i];
      frontCtx.putImageData(pixels,0,0);
      // The viewport crops the existing 560×1536 garment canvas around its neckline.
      fc.save();fc.translate(-50,0);
      fc.drawImage(join,...head.mapping.neckJoinAt);
      fc.save();fc.transform(a,d,b,e,c,f);fc.drawImage(bitmap,0,0);fc.restore();
      fc.drawImage(shirt,0,0);
      fc.transform(a,d,b,e,c,f);fc.drawImage(front,0,0);fc.restore();
      el('neck-note').textContent=(head.version>=2 ? '粉色十字标记下巴。试领图显示从下颌两侧延伸到衣领的颈部。'
        : '粉色十字标记旧版头层的颈部参考点。')+(head.hairClipped?'原照截断了部分发尾。':'');
      canvas.dataset.style=head.style;
      canvas.dataset.overlay=String(el('cartoon-points').checked);
      fit.dataset.garment=el('cartoon-garment').value;
    } finally {bitmap.close();hair.close();join.close();}
  }
  function repaint() {render().catch(error=>{el('cartoon-error').textContent='预览未能加载。'+error.message;});}
  function setSource(primary,supplement) {
    const chosen=supplement ?? (primary?.needsSupplement ? null : primary) ?? null;
    el('cartoon-panel').hidden=!primary;
    if (source===chosen && (primary ? el('cartoon-original').hasAttribute('src') : !urls.length)) return;
    stop();clearUrls();draft=null;source=chosen;
    const display=chosen ?? primary;
    for (const [id,blob] of [['cartoon-original',display?.original],['cartoon-foreground',display?.assets.foreground]]) {
      const img=el(id);
      if (!blob) {img.removeAttribute('src');continue;}
      const url=URL.createObjectURL(blob);urls.push(url);img.src=url;
    }
    el('cartoon-source-label').textContent=chosen?.sourceId==='supplement'?'补拍正脸':'原照片';
    el('cartoon-status').textContent=source?'选择画风后即可生成。':'先补传清晰正脸，即可用该人物生成卡通头层。';
    el('cartoon-error').textContent='';
    repaint();controls();
  }
  el('cartoon-generate').onclick=async()=>{
    if (!source || operation || locked) return;
    stop();const job=generation;
    operation=new AbortController();
    const selected=source,style=el('cartoon-style').value;
    controls();el('cartoon-error').textContent='';el('cartoon-status').textContent=phases.preparing;
    try {
      const result=await requestHead(selected,style,operation.signal,message=>{
        if (generation===job && message) el('cartoon-status').textContent=message;
      });
      if (generation!==job) return;
      draft=result;await render();
      if (generation===job) el('cartoon-status').textContent='生成完成。请检查头层与衣领，确认后保存。';
    } catch (error) {
      if (generation===job) {el('cartoon-status').textContent='生成失败，可用当前照片重试。';el('cartoon-error').textContent=error.message;}
    } finally { if (generation===job) {operation=null;controls();} }
  };
  el('cartoon-stop').onclick=()=>{stop();controls();el('cartoon-status').textContent='已取消本次生成，可重新选择画风。';};
  el('cartoon-garment').onchange=el('cartoon-points').onchange=repaint;
  el('cartoon-save').onclick=()=>el('confirm').click();
  window.addEventListener('pagehide',()=>{stop();clearUrls();});
  window.addEventListener('pageshow',event=>{if(event.persisted) location.reload();});
  return {setSource,
    restore(saved){if (saved && source && saved.sourceId===source.sourceId) {draft=saved;el('cartoon-style').value=saved.style;
      el('cartoon-status').textContent=saved.version>=2 ? '已载入此人物保存的卡通头层。'
        : '已载入旧版头层。点击「重新生成」可用已保存的照片修复脸部比例和颈部接合。';repaint();controls();}},
    setLocked(value){locked=value;controls();},
    get busy(){return Boolean(operation);},
    get result(){return draft;}
  };
}
