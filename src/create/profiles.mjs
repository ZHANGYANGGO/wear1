import { adaptGeneratedProfile, bodyTemplate, profileVersion } from '../stage1a/protocol.mjs';
import { validateAvatar } from '../avatar/validation.mjs';
import { mila } from '../avatar/config.mjs';
import { garments } from '../wardrobe/catalog.mjs';
import { measurement } from './photo.mjs';
import { cases } from '../stage1a/cases.mjs';
import { bodyTemplates, personalLayers } from '../avatar/body-templates.mjs';
import { personalSlots } from '../stage1a/alpha.mjs';

export const localRegistration = [
  { id: 'woman-bob', label: '短发女士', family: 'fitted', digest: '63645570227c1d46a003c0bc197765b940639e54c5f180be57cec8422efc4ca0' },
  { id: 'man-smile', label: '微笑男士', family: 'straight', digest: '29d3e7ac431c57e0701066353a9a1eb9d648584af073df4d8dabab291022f06e' },
  { id: 'man-glasses', label: '戴眼镜男士', family: 'straight', digest: '171b8391fc7bf472cdf1c272abb9fd40919462def082faafcc41a0d7dca5bafa' },
  { id: 'woman-silver', label: '银发女士', family: 'fitted', digest: '15cb4ba0efd4a9f02b4536aba179234d8180ce904b8aa19b823467b48328be0b' },
];

const byId = new Map(localRegistration.map(record => [record.id, record]));
const demonstrationAvatars = new Map([mila, ...cases.map(sample => sample.profile)].map(avatar => [avatar.id, avatar]));
export const builtinPeople = [...localRegistration, ...demonstrationAvatars.values()].map(({ id, label }) => ({
  id, name: label, kind: 'builtin', width: mila.width, height: mila.height,
}));
const asset = (folder, file) => new URL(`../../assets/local-avatar/${folder}/${file}.webp`, import.meta.url).href;
const straightSlots = {
  ankles: { top: 1405, bottom: 1470, containsX: x => (x > 95 && x < 223) || (x > 275 && x < 430) },
  head: { top: 1, bottom: 309, containsX: x => x > 124 && x < 443 },
  arms: { top: 471, bottom: 936, containsX: x => x < 137 || x > 395 },
};
const variants = {
  'brick-tee': ['砖红休闲圆领 T 恤', '砖红 · 棉质', '#ac5638'],
  'espresso-jacket': ['深蓝直身短袖衬衫', '深蓝 · 直身剪裁', '#3d4c5e'],
  'blue-denim': ['蓝色直筒牛仔裤', '水洗蓝 · 牛仔', '#506f91'],
  'oat-trousers': ['沙色直筒休闲裤', '沙色 · 斜纹棉', '#b9a383'],
  'cream-trainers': ['浅米色帆布鞋', '浅米色 · 帆布', '#d6c7ab'],
  'penny-loafers': ['深棕色乐福鞋', '深棕色 · 皮革', '#503c31'],
};

function buildBundle(record) {
  const { id, label, family } = record;
  const straight = family === 'straight';
  const avatar = {
    id, label, width: 560, height: 1536,
    anchors: bodyTemplates[family].anchors,
    baseLayers: [{ id: 'ankles', layer: 0 }, { id: 'head', layer: 5 }, { id: 'arms', layer: 6 }]
      .map(layer => ({ ...layer, image: asset(id, layer.id) })),
  };
  const clothes = straight ? garments.map(item => {
    const [name, detail, color] = variants[item.id];
    return { ...item, name, detail, color, image: asset('straight', item.id), thumbnail: asset('straight', item.id + '-thumb') };
  }) : garments;
  if (straight) {
    const issue = validateAvatar(avatar, clothes);
    if (issue) throw new Error(issue);
  } else {
    const checked = adaptGeneratedProfile({ ...avatar, template: bodyTemplate, version: profileVersion }, clothes);
    if (!checked.ok) throw new Error(checked.message);
  }
  return {
    id, avatar, garments: clothes, slots: straight ? straightSlots : undefined,
    sourceLabel: `${label} · 本地预制`,
    outfitDetails: straight ? { casual: '直筒牛仔裤与砖红 T 恤', commute: '深蓝直身衬衫与沙色休闲裤' } : undefined,
  };
}

/** Load only an explicitly selected, layered fitting character. */
export class LocalAvatarProvider {

  async byId(id) {
    if (demonstrationAvatars.has(id)) return { id, avatar: demonstrationAvatars.get(id), garments };
    if (isPhotoId(id)) {
      const { getFitting, getPhotoPerson } = await import('../people/store.mjs');
      const [person, fit] = await Promise.all([getPhotoPerson(id),getFitting(id)]);
      if (!person?.templateId || fit?.body.templateId!==person.templateId) throw new Error('请先在人物库预览并确认身体模板。');
      return personalBundle(person,fit.body);
    }
    const record = byId.get(id);
    if (!record) throw new Error('找不到已确认的分身。');
    return buildBundle(record);
  }
}

export const avatarProvider = new LocalAvatarProvider();
function isPhotoId(id) { return typeof id==='string' && /^photo-[\da-f-]{36}$/i.test(id); }

export async function personalBundle(person, body) {
  const template=bodyTemplates[body.templateId];
  if (!template || body.version!==2 || !body.geometry?.crop) throw new Error('个人角色模板无法读取。');
  const donor=await avatarProvider.byId(template.donor);
  const baseLayers=[], overlays={}, urls=[];
  const url=blob=>{const value=URL.createObjectURL(blob);urls.push(value);return value;};
  const release=()=>urls.forEach(value=>URL.revokeObjectURL(value));
  try {
    for (const [id,blob] of Object.entries(body.layers)) {
      baseLayers.push({id,layer:personalLayers[id],image:url(blob)});
    }
    if (body.maryJaneInsteps) overlays['ivory-mary-janes']={id:'personal-insteps',layer:11,image:url(body.maryJaneInsteps)};
    const checked=adaptGeneratedProfile({id:person.id,label:person.name,width:560,height:1536,
      anchors:template.anchors,baseLayers,template:body.templateId,version:body.version},donor.garments);
    if (!checked.ok) throw new Error(checked.message);
    return {...donor,id:person.id,avatar:checked.avatar,templateId:body.templateId,geometry:body.geometry,overlays,
      sourceLabel:'照片角色 · '+template.name,
      slots:personalSlots(template,body.geometry.crop,donor.slots,body.geometry.landmarks[152][1]),release};
  } catch(error) {release();throw error;}
}
const storageKey = 'wearmate.local-demo.confirmed';

function validRecord(record) {
  if (record?.source === 'photo') return isPhotoId(record.id);
  if (record?.source === 'library') return builtinPeople.some(person => person.id === record.id);
  return record && typeof record.id === 'string' && /^[a-z0-9_-]{1,100}$/i.test(record.id)
    && measurement(record.heightCm) && measurement(record.weightKg);
}

export async function selectFittingPerson(id, isCurrent=()=>true) {
  const photo=isPhotoId(id);
  if (photo) {
    const { getPhotoPerson } = await import('../people/store.mjs');
    if (!(await getPhotoPerson(id))?.templateId) throw new Error('请先确认身体模板。');
  } else if (!builtinPeople.some(person => person.id === id)) throw new Error('该人物没有可试穿的分层素材。');
  if (!isCurrent()) return;
  const prior=readConfirmedProfile();
  const value=JSON.stringify(prior?.id===id ? prior : {id,source:photo?'photo':'library'});
  sessionStorage.setItem(storageKey,value);
  try {
    if (photo) localStorage.setItem(storageKey,value);
    else localStorage.removeItem(storageKey);
  } catch { /* The current tab still remembers its selected role. */ }
}

export function readConfirmedProfile() {
  try {
    const record = JSON.parse(sessionStorage.getItem(storageKey) ?? localStorage.getItem(storageKey));
    return validRecord(record) ? record : null;
  } catch {
    return null;
  }
}

export function confirmProfile({ id, heightCm, weightKg }) {
  const record = { id, heightCm, weightKg };
  if (!validRecord(record)) throw new Error('分身资料无效。');
  sessionStorage.setItem(storageKey, JSON.stringify(record));
}
