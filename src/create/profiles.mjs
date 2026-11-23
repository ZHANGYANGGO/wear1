import { adaptGeneratedProfile, bodyTemplate, profileVersion } from '../stage1a/protocol.mjs';
import { validateAvatar } from '../avatar/validation.mjs';
import { mila } from '../avatar/config.mjs';
import { garments } from '../wardrobe/catalog.mjs';
import { fingerprint, measurement } from './photo.mjs';
import { rebuiltBob } from './bob-rebuild.mjs';

export const localRegistration = [
  { id: 'woman-bob', label: '短发女士', family: 'fitted', digest: '63645570227c1d46a003c0bc197765b940639e54c5f180be57cec8422efc4ca0' },
  { id: 'man-smile', label: '微笑男士', family: 'straight', digest: '29d3e7ac431c57e0701066353a9a1eb9d648584af073df4d8dabab291022f06e' },
  { id: 'man-glasses', label: '戴眼镜男士', family: 'straight', digest: '171b8391fc7bf472cdf1c272abb9fd40919462def082faafcc41a0d7dca5bafa' },
  { id: 'woman-silver', label: '银发女士', family: 'fitted', digest: '15cb4ba0efd4a9f02b4536aba179234d8180ce904b8aa19b823467b48328be0b' },
];

const byDigest = new Map(localRegistration.map(record => [record.digest, record]));
const byId = new Map(localRegistration.map(record => [record.id, record]));
const asset = (folder, file) => new URL(`../../assets/local-avatar/${folder}/${file}.webp`, import.meta.url).href;
const straightSlots = {
  ankles: { top: 1405, bottom: 1470, containsX: x => (x > 95 && x < 223) || (x > 275 && x < 430) },
  head: { top: 1, bottom: 309, containsX: x => x > 124 && x < 443 },
  arms: { top: 471, bottom: 936, containsX: x => x < 137 || x > 395 },
};
const straightAnchors = {
  neck: [268, 276], shoulderLeft: [78, 324], shoulderRight: [454, 322],
  waist: [263, 793], ankleLeft: [150, 1417], ankleRight: [357, 1418], feet: [254, 1418],
};
const bobAnchors = {
  neck: [283, 260], shoulderLeft: [150, 273], shoulderRight: [410, 261],
  waist: [284, 566], ankleLeft: [178, 1418], ankleRight: [348, 1425], feet: [265, 1421],
};
const bobSlots = {
  head: { top: 1, bottom: 289, containsX: x => x >= 174 && x < 394 },
  arms: { top: 363, bottom: 891, containsX: (x, y) => y < 440 || x < 178 || x > 365 },
  ankles: { top: 1402, bottom: 1478, containsX: x => (x >= 136 && x < 213) || (x >= 310 && x < 397) },
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
  const bob = id === 'woman-bob';
  const bodyFolder = bob ? 'woman-bob/refined' : id;
  const avatar = {
    id, label, width: 560, height: 1536,
    anchors: bob ? bobAnchors : straight ? straightAnchors : mila.anchors,
    baseLayers: [{ id: 'ankles', layer: 0 }, { id: 'head', layer: 5 }, { id: 'arms', layer: 6 }]
      .map(layer => ({ ...layer, image: asset(bodyFolder, layer.id) })),
  };
  const bobDefaults = ['brick-tee', 'blue-denim', 'cream-trainers'];
  const clothes = straight ? garments.map(item => {
    const [name, detail, color] = variants[item.id];
    return { ...item, name, detail, color, image: asset('straight', item.id), thumbnail: asset('straight', item.id + '-thumb') };
  }) : bob ? garments.map(item => bobDefaults.includes(item.id)
    ? { ...item, image: asset(bodyFolder, item.id) } : item) : garments;
  if (straight || bob) {
    const issue = validateAvatar(avatar, clothes);
    if (issue) throw new Error(issue);
  } else {
    const checked = adaptGeneratedProfile({ ...avatar, template: bodyTemplate, version: profileVersion }, clothes);
    if (!checked.ok) throw new Error(checked.message);
  }
  return {
    id, avatar, garments: clothes, slots: bob ? bobSlots : straight ? straightSlots : undefined,
    sourceLabel: `${label} · 本地预制`,
    outfitDetails: straight ? { casual: '直筒牛仔裤与砖红 T 恤', commute: '深蓝直身衬衫与沙色休闲裤' } : undefined,
  };
}

/**
 * AvatarProvider contract. An AIAvatarProvider can later implement these methods,
 * returning the same aligned AvatarConfig, garments and optional alpha slots.
 * @typedef {ReturnType<typeof buildBundle>} AvatarBundle
 * @typedef {{resolve(input: {photo: ArrayBuffer, heightCm: number, weightKg: number}): Promise<AvatarBundle>, byId(id: string): Promise<AvatarBundle>}} AvatarProvider
 */

export class LocalAvatarProvider {
  async resolve({ photo, heightCm, weightKg }) {
    if (!measurement(heightCm) || !measurement(weightKg)) throw new Error('请填写有效的身高和体重。');
    const record = byDigest.get(await fingerprint(photo));
    if (!record) throw new Error('当前演示版本暂不支持该照片');
    return record.id === rebuiltBob.id ? rebuiltBob : buildBundle(record);
  }

  async byId(id) {
    const record = byId.get(id);
    if (!record) throw new Error('找不到已确认的分身。');
    return buildBundle(record);
  }
}

/** @type {AvatarProvider} */
export const avatarProvider = new LocalAvatarProvider();
const storageKey = 'wearmate.local-demo.confirmed';

function validRecord(record) {
  return record && typeof record.id === 'string' && /^[a-z0-9_-]{1,100}$/i.test(record.id)
    && measurement(record.heightCm) && measurement(record.weightKg);
}

export function readConfirmedProfile() {
  try {
    const record = JSON.parse(sessionStorage.getItem(storageKey));
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
