import { garments } from '../wardrobe/catalog.mjs';

const layerRoot = new URL('../../assets/local-avatar/woman-bob/rebuilt/', import.meta.url);
const poseTweaks = new Set(['arms', 'blue-denim']);
const asset = id => new URL(id + (poseTweaks.has(id) ? '-pose-tweak.webp' : '.webp'), layerRoot).href;
const defaults = new Set(['brick-tee', 'blue-denim', 'cream-trainers']);

export const rebuiltBob = {
  id: 'woman-bob',
  sourceLabel: '短发女士 · 重绘母版',
  avatar: {
    id: 'woman-bob', label: '短发女士', width: 560, height: 1536,
    anchors: {
      neck: [287, 257], shoulderLeft: [155, 263], shoulderRight: [423, 273],
      waist: [285, 573], ankleLeft: [161, 1420], ankleRight: [334, 1429], feet: [248, 1425],
    },
    baseLayers: [{ id: 'ankles', layer: 0 }, { id: 'head', layer: 5 }, { id: 'arms', layer: 6 }]
      .map(layer => ({ ...layer, image: asset(layer.id) })),
  },
  garments: garments.filter(item => defaults.has(item.id)).map(item => ({ ...item, image: asset(item.id) })),
  slots: {
    head: { top: 5, bottom: 284, containsX: x => x >= 192 && x < 385 },
    arms: { top: 385, bottom: 875, containsX: (x, y) => y < 421 || x < 183 || x > 378 },
    ankles: { top: 1405, bottom: 1455, containsX: x => (x >= 127 && x < 201) || (x >= 292 && x < 375) },
  },
};
