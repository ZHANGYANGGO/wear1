import { validateAvatar, validateGarmentLayer } from './validation.mjs';

const latestMount = new WeakMap();

/** @typedef {{status: 'loading' | 'ready' | 'failed', settled: Promise<void>}} GarmentLoad */
/** @typedef {{ok: true} | {ok: false, message: string}} MountResult */

async function spriteError(image, { width, height }) {
  try {
    await image.decode();
  } catch {
    return '素材无法读取。';
  }
  return image.naturalWidth === width && image.naturalHeight === height
    ? ''
    : `素材尺寸应为 ${width} × ${height}。`;
}

/**
 * Prepare a new role offstage. A valid body replaces the existing role once
 * decoded, while wearable sprites settle independently.
 * @param {HTMLElement} element
 * @param {import('./config.mjs').AvatarConfig} avatar
 * @param {import('../wardrobe/catalog.mjs').Garment[]} garments
 */
export function mountAvatar(element, avatar, garments) {
  const attempt = {};
  latestMount.set(element, attempt);
  /** @type {Map<string, GarmentLoad>} */
  const garmentLoads = new Map();
  const issue = validateAvatar(avatar, garments);
  if (issue) {
    return {
      garmentLoads,
      ready: Promise.resolve(/** @type {MountResult} */ ({ ok: false, message: issue })),
      show() {},
    };
  }

  const sprites = [];
  const clothing = new Map();
  function createImage(sprite) {
    const image = element.ownerDocument.createElement('img');
    image.className = 'sprite';
    image.dataset.layer = sprite.id;
    image.alt = '';
    image.draggable = false;
    image.src = sprite.image;
    sprites.push({ image, layer: sprite.layer });
    return image;
  }

  const bodyLoads = avatar.baseLayers.map(sprite => {
    const image = createImage(sprite);
    return spriteError(image, avatar).then(error => error ? `基础图层「${sprite.id}」${error}` : '');
  });

  for (const garment of garments) {
    if (validateGarmentLayer(garment)) {
      garmentLoads.set(garment.id, { status: 'failed', settled: Promise.resolve() });
      continue;
    }
    const image = createImage(garment);
    const [anchorX, anchorY] = avatar.anchors[garment.anchor];
    const [offsetX, offsetY] = garment.offset;
    image.classList.add('sprite-garment');
    image.style.transformOrigin = `${100 * anchorX / avatar.width}% ${100 * anchorY / avatar.height}%`;
    image.style.transform = `translate(${100 * offsetX / avatar.width}%, ${100 * offsetY / avatar.height}%) scale(${garment.scale})`;
    image.hidden = true;
    clothing.set(garment.id, image);
    /** @type {GarmentLoad} */
    const load = {
      status: 'loading',
      settled: spriteError(image, avatar).then(error => {
        load.status = error ? 'failed' : 'ready';
      }),
    };
    garmentLoads.set(garment.id, load);
  }

  /** @type {Promise<MountResult>} */
  const ready = Promise.all(bodyLoads).then(errors => {
    const error = errors.find(Boolean);
    if (error) return { ok: false, message: error };
    if (latestMount.get(element) !== attempt) {
      return { ok: false, message: '角色加载已被较新的请求替代。' };
    }
    element.style.setProperty('--avatar-ratio', `${avatar.width} / ${avatar.height}`);
    element.setAttribute('aria-label', avatar.label);
    sprites.sort((a, b) => a.layer - b.layer);
    element.replaceChildren(...sprites.map(sprite => sprite.image));
    return { ok: true };
  });

  return {
    garmentLoads,
    ready,
    /** @param {import('../wardrobe/catalog.mjs').OutfitSelection} selection */
    show(selection) {
      const selected = new Set(Object.values(selection));
      for (const [id, image] of clothing) {
        image.hidden = !selected.has(id) || garmentLoads.get(id).status !== 'ready';
      }
    },
  };
}
