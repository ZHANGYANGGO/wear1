import { avatarProvider, personalBundle, readConfirmedProfile, selectFittingPerson } from '../create/profiles.mjs';
import { preparePreview } from '../create/preview.mjs';
import { modules, listPeople, getImage, getTarget, getResult, selectTarget, getCartoon, getFitting, confirmFitting } from './store.mjs';
import { bodyTemplates } from '../avatar/body-templates.mjs';
import { composePersonalBody } from '../avatar/personal-body.mjs';
import { openPersonalWardrobe } from '../wardrobe/personal.mjs';
import { wardrobeSprites } from '../wardrobe/tryon-assets.mjs';
import { selectOutfit } from '../wardrobe/selection.mjs';
import { readStudioView, restoreLook, visibleLook } from '../wardrobe/tryon-selection.mjs';

const el = id => document.getElementById(id);
const requested = new URLSearchParams(location.search).get('module');
const module = Object.hasOwn(modules, requested) ? requested : 'library';
const select = el('person-select');
let people = [], current, releasePreview, pendingBody, sequence = 0;
const title = modules[module];
el('title').textContent = title;
document.title = title + ' · WearMate';
for (const [id, name] of Object.entries(modules)) {
  const link = document.createElement('a');
  link.href = id === 'library' ? './people.html' : './people.html?module=' + id;
  link.textContent = name;
  if (id === module) link.setAttribute('aria-current', 'page');
  el('modules').append(link);
}

function options() {
  select.replaceChildren();
  for (const [kind, label] of [['builtin','自带人物'],['photo','我的照片人物']]) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const person of people.filter(p => p.kind === kind)) group.append(new Option(person.name, person.id));
    if (group.children.length) select.append(group);
  }
}

function outfitPreview(bundle) {
  if (!bundle.templateId) return {};
  try {
    const saved=readStudioView(localStorage,bundle.id)?.selection;
    if (!saved) return {};
    const owned=new Set(openPersonalWardrobe(localStorage,bundle.id).store.list().map(item=>item.id));
    const requested=new Set(Object.values(saved));
    const extras=wardrobeSprites(bundle.id,bundle.templateId,bundle.overlays).filter(item=>owned.has(item.id) && requested.has(item.id));
    const byId=new Map([...bundle.garments,...extras].map(item=>[item.id,item]));
    return {extras,selection:visibleLook(restoreLook(saved,selectOutfit('casual'),byId))};
  } catch {return {};}
}

async function preview(person, templateId, originalOnly=false) {
  const result = module === 'library' || originalOnly ? null : await getResult(person.id, module);
  const head = person.kind==='photo' && !originalOnly ? await getCartoon(person.id) : null;
  if ((head && (templateId || !result?.image)) || (person.kind === 'builtin' && !result?.image)) {
    let body;
    if (head) {
      const saved=(await getFitting(person.id))?.body;
      person.templateId=saved?.headRevision===head.revision ? saved.templateId : undefined;
      templateId ??= person.templateId ?? 'fitted';
      body=person.templateId===templateId ? saved :
        await composePersonalBody(head,templateId,await avatarProvider.byId(bodyTemplates[templateId].donor));
    }
    const bundle=body ? await personalBundle(person,body) : await avatarProvider.byId(person.id);
    const avatar = document.createElement('div');
    avatar.className = 'avatar'; avatar.setAttribute('role', 'img');
    try {
      const { next } = await preparePreview(avatar,bundle,outfitPreview(bundle));
      return { node: next, release:bundle.release, body,head };
    } catch(error) {bundle.release?.();throw error;}
  }
  const blob = result?.image ?? await getImage(person.id);
  if (!(blob instanceof Blob)) throw new Error('人物图像暂不可用。');
  const url = URL.createObjectURL(blob), image = new Image();
  image.className = 'photo'; image.alt = person.name; image.src = url;
  try { await image.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
  return { node: image, release:()=>URL.revokeObjectURL(url), cartoon: result?.parameters?.cartoon, head };
}

async function show(person, ticket, remember, templateId) {
  let rendered,warning='';
  try { rendered=await preview(person,templateId); }
  catch (error) {
    if (person.kind!=='photo' || templateId) throw error;
    rendered=await preview(person,null,true);
    warning=error.message+' 可在「查看或更新照片分析」重新生成头层。';
  }
  try {
    if (ticket !== sequence) return;
    if (remember) await selectTarget(module, person.id);
    if (ticket !== sequence) return;
    el('preview').replaceChildren(rendered.node);
    releasePreview?.(); releasePreview=rendered.release; rendered.release=null;
    pendingBody=rendered.body;
    current = person; select.value = person.id;
    el('preview').dataset.personId = person.id;
    el('person-name').textContent = person.name;
    el('source').textContent = pendingBody ? '照片角色 · '+bodyTemplates[pendingBody.templateId].name : rendered.cartoon
      ? (rendered.cartoon.style === 'anime' ? '动漫头层' : '手绘头层') + ' · ' + rendered.cartoon.size.join(' × ')
      : (person.kind === 'photo' ? '照片人物' : '自带分层人物') + ' · ' + person.width + ' × ' + person.height;
    el('body-panel').hidden=!rendered.head;
    el('body-preview').hidden=Boolean(pendingBody);
    el('body-template').value=pendingBody?.templateId ?? person.templateId ?? 'fitted';
    el('body-confirm').disabled=!pendingBody || pendingBody.templateId===person.templateId;
    el('mapped-label').hidden=!pendingBody;
    el('mapped-points').checked=false;
    const usable=!warning && (person.kind==='builtin' || person.templateId && (!pendingBody || person.templateId===pendingBody.templateId));
    el('try-on').hidden = el('to-closet').hidden = !usable;
    el('inspect').hidden = person.kind !== 'photo';
    el('inspect').href = './create.html?module=' + module + '&person=' + encodeURIComponent(person.id);
    for (const button of el('portraits').children) button.setAttribute('aria-pressed',String(button.dataset.id === person.id));
    el('inspect').textContent = module === 'cartoon' ? '打开卡通生成与衣领预览' : '查看或更新照片分析';
    if (rendered.head && rendered.head.version<2) {
      el('inspect').textContent='用已存照片更新旧版头脸和颈部';
      el('inspect').href+='#cartoon-panel';
    }
    el('module-note').textContent = module === 'cartoon'
      ? (person.kind === 'photo' ? '使用这个人物的照片生成卡通头层，或查看已确认的结果。' : '此人物已有预制图层。上传单人照片可生成自己的卡通头层。')
      : module === 'library'
      ? (person.kind === 'photo' ? '这张照片可在各造型模块中选择。' : '此人物带有已适配的试穿图层。')
      : '已载入' + title + '使用的人物。当前阶段提供选人与预览，效果处理将在后续接入。';
    el('message').textContent = pendingBody ? (usable ? '已确认此身体模板。' : '检查全身预览后，确认模板即可换装。') : '';
    el('error').textContent=warning;
  } finally { rendered.release?.(); }
}

function fail(error, ticket) {
  if (ticket !== sequence) return;
  if (current) select.value = current.id;
  el('message').textContent = '';
  el('error').textContent = error.name === 'QuotaExceededError' ? '浏览器存储空间不足，未能保存人物。' : error.message;
}

async function change(person,remember,templateId) {
  const ticket = ++sequence;
  el('error').textContent = '';
  el('try-on').disabled = el('to-closet').disabled = true;
  el('body-confirm').disabled=true;
  el('body-preview').disabled=el('body-template').disabled=true;
  try { await show(person,ticket,remember,templateId); }
  catch (error) {
    fail(error,ticket);
    if (ticket===sequence) el('body-template').value=pendingBody?.templateId ?? current?.templateId ?? 'fitted';
  } finally {
    if (ticket===sequence) {
      el('body-preview').disabled=el('body-template').disabled=false;
      el('try-on').disabled=el('to-closet').disabled=false;
      el('body-confirm').disabled=!pendingBody || pendingBody.templateId===current?.templateId;
    }
  }
}
select.onchange=()=>change(people.find(person=>person.id===select.value),true);
el('body-preview').onclick=el('body-template').onchange=()=>change(current,false,el('body-template').value);
el('body-confirm').onclick=async()=>{
  const body=pendingBody, person=current, ticket=sequence;
  if (!body || el('body-confirm').disabled) return;
  el('body-confirm').disabled=el('body-template').disabled=el('body-preview').disabled=true;
  try {
    await confirmFitting(person.id,body);
    person.templateId=body.templateId;
    if (ticket!==sequence) return;
    await selectFittingPerson(person.id,()=>ticket===sequence);
    if (ticket!==sequence) return;
    el('try-on').hidden=el('to-closet').hidden=false;
    el('message').textContent='已保存全身角色，可以进入衣橱或试穿。';
  } catch(error) { fail(error,ticket); }
  finally {
    if(ticket===sequence) {
      el('body-preview').disabled=el('body-template').disabled=false;
      el('body-confirm').disabled=body.templateId===person.templateId;
    }
  }
};
el('mapped-points').onchange=()=>{
  const avatar=el('preview').querySelector('.avatar');
  if (!avatar || !pendingBody) return;
  avatar.querySelector('canvas')?.remove();
  if (!el('mapped-points').checked) return;
  const canvas=document.createElement('canvas');
  canvas.className='sprite'; canvas.width=560;canvas.height=1536;
  const ctx=canvas.getContext('2d'), {landmarks,features}=pendingBody.geometry;
  for (const [name,indices] of Object.entries(features)) {
    ctx.beginPath();
    indices.forEach((index,i)=>ctx[i?'lineTo':'moveTo'](...landmarks[index]));
    ctx.closePath();ctx.lineWidth=2;ctx.strokeStyle=name==='outline'?'#ffca49':'#00d4c6';ctx.stroke();
  }
  avatar.append(canvas);
};

el('new-photo').href = './create.html?module=' + module;

async function thumbnails() {
  for (const person of people.filter(p => p.kind === 'builtin')) {
    const { avatar } = await avatarProvider.byId(person.id);
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.id = person.id;
    const image = new Image(); image.alt = ''; image.src = avatar.baseLayers.find(layer => layer.id === 'head').image;
    const frame = document.createElement('span'); frame.append(image);
    button.append(frame, document.createTextNode(person.name.replace('示例角色 ','')));
    button.onclick = () => { select.value = person.id; select.dispatchEvent(new Event('change')); };
    el('portraits').append(button);
  }
}
async function enter(path) {
  const ticket=sequence;
  try { await selectFittingPerson(current.id,()=>ticket===sequence); if(ticket===sequence) location.assign(path); }
  catch (error) { fail(error,ticket); }
}
el('to-closet').onclick=()=>enter('./wardrobe.html');
el('try-on').onclick=()=>enter('./');
for (const link of document.querySelectorAll('.site-nav a[href="./"], .site-nav a[href="./wardrobe.html"]')) {
  link.addEventListener('click',event=>{
    if (!current || el('try-on').hidden || el('try-on').disabled || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enter(link.getAttribute('href'));
  });
}
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});
try {
  people = await listPeople(); options();
  const ids = [await getTarget(module), await getTarget('library'), readConfirmedProfile()?.id, 'woman-bob'];
  const person = ids.map(id => people.find(p => p.id === id)).find(Boolean);
  await thumbnails(); select.disabled = false;
  await show(person, ++sequence, false);
} catch (error) { fail(error, sequence); }
