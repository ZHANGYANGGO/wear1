import { garmentCatalog } from './garments.mjs';
import { bobId, bobLayers } from './woman-bob-wardrobe.mjs';
import { builtinPeople, localRegistration } from '../create/profiles.mjs';

// Each entry names sprite parts in the role's 560 × 1536 coordinates.
// Only browser-reviewed artwork belongs in these lists.
function ready(id, layer) {
  return { status: 'ready', parts: [{ id, layer }] };
}

const heelFit = { status: 'pending', message: '细高跟需要适配抬跟脚型和鞋底落点。' };
const coatLayers = {
  status: 'ready',
  parts: [{ id: 'white-puffer-back', layer: 4 }, { id: 'white-puffer', layer: 40 }],
};

const fitted = {
  'navy-shirt': ready('navy-shirt', 30),
  'purple-graphic-tee': ready('purple-graphic-tee', 30),
  'light-blue-jeans': ready('light-blue-jeans', 20),
  'white-platform-sneakers': ready('white-platform-sneakers', 10),
  'white-sweatshirt': ready('white-sweatshirt', 30),
  'black-trousers': ready('black-trousers', 20),
  'gray-joggers': ready('gray-joggers', 20),
  'ivory-mary-janes': ready('ivory-mary-janes', 10),
  'blue-collar-polo': ready('blue-collar-polo', 30),
  'floral-maxi': ready('floral-maxi', 25),
  'nude-pumps': heelFit,
  'white-puffer': coatLayers,
};
const straight = {
  'navy-shirt': ready('navy-shirt', 30),
  'purple-graphic-tee': ready('purple-graphic-tee', 30),
  'light-blue-jeans': ready('light-blue-jeans', 20),
  'white-platform-sneakers': ready('white-platform-sneakers', 10),
  'white-sweatshirt': ready('white-sweatshirt', 30),
  'black-trousers': ready('black-trousers', 20),
  'gray-joggers': ready('gray-joggers', 20),
  'ivory-mary-janes': ready('ivory-mary-janes', 10),
  'blue-collar-polo': ready('blue-collar-polo', 30),
  'floral-maxi': ready('floral-maxi', 25),
  'nude-pumps': heelFit,
  'white-puffer': coatLayers,
};

// Mila, Iris and Nia share the fitted template and its garment anchors.
const families = new Map(builtinPeople.map(({id}) => [id, localRegistration.find(role => role.id === id)?.family ?? 'fitted']));
const assets = { fitted, straight };
const placement = {
  shoes: { anchor: 'feet', layer: 10 },
  bottom: { anchor: 'waist', layer: 20 },
  dress: { anchor: 'neck', layer: 25 },
  top: { anchor: 'neck', layer: 30 },
  outerwear: { anchor: 'neck', layer: 40 },
};
const swatches = {
  'navy-shirt': '#263d57', 'nude-pumps': '#b8987e', 'floral-maxi': '#e6ded0',
  'white-sweatshirt': '#eeeae0', 'black-trousers': '#302e32', 'ivory-mary-janes': '#dfcbb1',
  'blue-collar-polo': '#e9dfba', 'gray-joggers': '#b8b6b4', 'white-puffer': '#e7e1d4',
  'light-blue-jeans': '#779fbb', 'white-platform-sneakers': '#dbceba', 'purple-graphic-tee': '#786389',
};

export function getFitInfo(id, roleId, templateId) {
  if (roleId === bobId) {
    const entries = Object.hasOwn(bobLayers, id) ? bobLayers[id] : null;
    if (!entries) return { status: 'pending', message: '这件衣物未纳入短发女士的专属衣橱。' };
    return {
      status: 'ready', template: bobId,
      parts: entries.map(([piece, layer]) => ({
        id: piece, layer, image: new URL(`../../assets/wardrobe/tryon/woman-bob/${piece}.webp`, import.meta.url).href,
      })),
    };
  }
  const family = families.get(roleId) ?? (roleId?.startsWith('photo-') && Object.hasOwn(assets,templateId) ? templateId : null);
  if (!family) return { status: 'pending', message: '请先创建并确认一个本地分身。' };
  const fit = assets[family][id];
  const roleFit = fit?.roles?.[roleId] ?? fit;
  if (roleFit?.status !== 'ready') {
    return { status: roleFit?.status ?? 'pending', message: roleFit?.message ?? '当前分身的试穿图层待适配。' };
  }
  return {
    status: 'ready',
    template: family,
    parts: roleFit.parts.map(({ id: component, layer }) => ({
      id: component,
      layer,
      image: new URL(`../../assets/wardrobe/tryon/${family}/${component}.webp`, import.meta.url).href,
    })),
  };
}

export function wardrobeSprites(roleId, templateId, overlays = {}) {
  return garmentCatalog.flatMap(item => {
    const fit = getFitInfo(item.id, roleId, templateId);
    if (fit.status !== 'ready') return [];
    return [{
      id: item.id, name: item.name, category: item.category,
      thumbnail: new URL('../../' + item.cartoonDisplayImage.slice(2), import.meta.url).href,
      detail: item.primaryColor + ' · 衣橱单品',
      color: swatches[item.id],
      offset: [0, 0], scale: 1,
      ...placement[item.category],
      parts: overlays[item.id] ? [...fit.parts,overlays[item.id]] : fit.parts,
    }];
  });
}

/** Catalogue view for future recommendation consumers. */
export function withTryOnAvailability(item, roleId, templateId) {
  const fit = getFitInfo(item.id, roleId, templateId);
  return {
    ...item,
    tryOnStatus: fit.status,
    tryOnAssets: fit.status === 'ready' ? { [fit.template]: fit.parts } : {},
  };
}
