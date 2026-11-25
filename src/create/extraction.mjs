import { modules, confirmAnalysis, getAnalysis, getCartoon, getImage, listPeople } from '../people/store.mjs';
import { createCartoonPanel } from './cartoon.mjs';

const byId = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const module = Object.hasOwn(modules,query.get('module')) ? query.get('module') : 'library';
const back = './people.html?module=' + module;
const personId = query.get('person');
const ctx = byId('canvas').getContext('2d');
const colors = [[0,0,0],[119,75,49],[227,180,99],[224,145,140],[84,126,166],[151,99,163]];
let primary, supplement, sequence = 0, renderSequence = 0, controller, saving = false, suggestedName = '';
const cartoon = createCartoonPanel(ready);
byId('cancel').href = back;
byId('cancel').onclick = event => {
  if (saving) return event.preventDefault();
  sequence++; controller?.abort();
};
window.addEventListener('pagehide',() => { sequence++; controller?.abort(); });
function ready() {
  byId('confirm').disabled = saving || Boolean(controller) || cartoon.busy || !primary;
  byId('to-cartoon').hidden = !primary || primary.needsSupplement && !supplement;
  byId('confirm').textContent = primary?.needsSupplement && !supplement ? '先保存全身轮廓' :
    cartoon.result ? '确认并保存人物和头层' : '确认并保存人物';
}
function unpack(data) {
  for (const key of Object.keys(data.assets)) {
    const bytes = Uint8Array.from(atob(data.assets[key]),c => c.charCodeAt(0));
    data.assets[key] = new Blob([bytes],{type:'image/png'});
  }
}
function update() {
  cartoon.setSource(primary,supplement);
  byId('tools').hidden = !primary;
  byId('supplement-box').hidden = !primary?.needsSupplement;
  byId('view-source').options[1].hidden = !supplement;
  if (!supplement) byId('view-source').value = 'primary';
  ready();
  draw().catch(e => { byId('error').textContent = '预览读取失败。' + e.message; });
}
async function draw() {
  const ticket = ++renderSequence;
  const source = byId('view-source').value === 'supplement' ? supplement : primary;
  const canvas = byId('canvas');
  byId('empty').hidden = Boolean(source);
  canvas.hidden = !source;
  byId('details').textContent = '';
  byId('legend').hidden = !source || byId('view').value !== 'semantic';
  if (!source) return;
  const mode = byId('view').value;
  const [w,h] = source.geometry.rasterSize;
  const [ow,oh] = source.geometry.orientedSize;
  const original = mode === 'original' || mode === 'basic';
  const blobs = [original ? source.original : mode === 'semantic' ? source.assets.semantic : source.assets.foreground];
  if (mode === 'basic') blobs.push(source.assets.semantic);
  const bitmaps = await Promise.all(blobs.map(blob => createImageBitmap(blob,{imageOrientation:'from-image'})));
  try {
    if (ticket !== renderSequence) return;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(bitmaps[0],0,0,w,h);
    if (mode === 'semantic' || mode === 'basic') {
      const pixels = ctx.getImageData(0,0,w,h);
      let labels = pixels.data;
      if (mode === 'basic') {
        ctx.drawImage(bitmaps[1],0,0,w,h);
        labels = ctx.getImageData(0,0,w,h).data;
      }
      for (let i=0;i<labels.length;i+=4) {
        const id = labels[i];
        if (mode === 'semantic') {
          const [r,g,b] = colors[id] ?? colors[0];
          pixels.data.set([r,g,b,id ? 255 : 0],i);
        } else if (!id) pixels.data[i+3] = 0;
      }
      ctx.putImageData(pixels,0,0);
    }
    if (byId('points').checked && source.landmarks) {
      ctx.save(); ctx.scale(w/ow,h/oh);
      for (const [name,indices] of Object.entries(source.features)) {
        const pts = indices.map(i => source.landmarks[i]);
        ctx.beginPath(); pts.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
        ctx.closePath();
        ctx.lineWidth = 2.6 * ow / Math.max(360,w);
        ctx.strokeStyle = '#222'; ctx.stroke();
        ctx.lineWidth *= .55; ctx.strokeStyle = name === 'outline' ? '#ffdc54' : '#51ffe2'; ctx.stroke();
        for (const [x,y] of pts) {
          ctx.beginPath();ctx.arc(x,y,ctx.lineWidth*1.5,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();
        }
      }
      ctx.restore();
    }
    byId('details').textContent = [ow + ' × ' + oh,source.landmarks?.length ? source.landmarks.length + ' 个面部点位' : '缺少清晰面部点位',
      source.bodyObservation === 'observed' ? '已观测身体' : '完整身体未观测'].join(' · ');
    canvas.dataset.source = source.sourceId;
    canvas.dataset.view = mode;
    canvas.dataset.points = String(byId('points').checked);
  } finally { bitmaps.forEach(bitmap => bitmap.close()); }
}
for (const id of ['view','view-source','points']) byId(id).onchange = update;
byId('background').onchange = () => { byId('frame').dataset.background = byId('background').value; };

async function processPhoto(file, sourceId) {
  if (!file || saving) return;
  const ticket = ++sequence;
  controller?.abort();
  controller = new AbortController();
  if (sourceId === 'primary') { primary = null; supplement = null; }
  else supplement = null;
  update();
  byId('error').textContent = '';
  byId('status').textContent = '正在本机提取人物轮廓和面部点位…';
  try {
    if (file.size > 10*1024*1024) throw new Error('每张照片最多 10 MB。');
    const res = await fetch('./api/photo-analysis',{method:'POST',headers:{'X-Photo-Source':sourceId},
      body:file,signal:controller.signal});
    const data = await res.json();
    if (ticket !== sequence) return;
    if (!res.ok) throw new Error(data.error || '照片分析失败。');
    unpack(data); data.original = file;
    if (sourceId === 'primary') {
      primary = data;
      if (!personId && file.name && (!byId('name').value || byId('name').value === suggestedName)) {
        suggestedName = file.name.replace(/\.[^.]+$/,'');
        byId('name').value = suggestedName;
      }
    } else supplement = data;
    byId('view-source').value = sourceId;
    byId('status').textContent = primary.needsSupplement && !supplement
      ? '全身轮廓已提取。可先保存轮廓，或补传同一人的清晰正脸以获得可靠点位。'
      : '提取完成。可继续生成卡通头像，也可先保存人物。';
  } catch (error) {
    if (ticket === sequence) {
      byId('error').textContent = error.message;
      byId('status').textContent = sourceId === 'supplement' ? '已保留主照片，可重新选择补拍图。' : '';
    }
  } finally {
    if (ticket === sequence) { controller = null; update(); }
  }
}
for (const [id,source] of [['photo','primary'],['supplement','supplement']]) {
  byId(id).onchange = event => {
    const file = event.target.files[0]; event.target.value = '';
    processPhoto(file,source);
  };
}
byId('confirm').onclick = async () => {
  if (byId('confirm').disabled) return;
  const height = byId('height'), weight = byId('weight');
  if (!height.reportValidity() || !weight.reportValidity()) return;
  const measurements = {};
  if (height.value) measurements.heightCm = height.valueAsNumber;
  if (weight.value) measurements.weightKg = weight.valueAsNumber;
  saving = true; cartoon.setLocked(true); byId('photo').disabled = byId('supplement').disabled = true; ready();
  try {
    await confirmAnalysis({name:byId('name').value,primary,supplement,module,personId,cartoon:cartoon.result,
      measurements:Object.keys(measurements).length ? measurements : undefined});
    location.assign(back);
  } catch (error) {
    byId('error').textContent = error.name === 'QuotaExceededError' ? '浏览器存储空间不足，未能保存人物。' : error.message;
    saving = false; cartoon.setLocked(false); byId('photo').disabled = byId('supplement').disabled = false; ready();
  }
};
if (personId) {
  byId('photo').disabled = true;
  try {
    const person = (await listPeople()).find(p => p.kind === 'photo' && p.id === personId);
    if (!person) throw new Error('找不到这个照片人物。');
    byId('name').value = person.name;
    byId('height').value = person.measurements?.heightCm ?? '';
    byId('weight').value = person.measurements?.weightKg ?? '';
    const saved = await getAnalysis(personId);
    if (saved) {
      primary = saved.primary; supplement = saved.supplement; update();
      cartoon.restore(await getCartoon(personId));
      byId('status').textContent = '已载入保存的人物分析。';
    }
    else await processPhoto(await getImage(personId),'primary');
  } catch (e) { byId('error').textContent = e.message; }
  finally { byId('photo').disabled = false; }
} else {
  byId('photo').disabled = false;
}

