import { bobId } from '../wardrobe/woman-bob-wardrobe.mjs';

const path = new URL('../../assets/wardrobe/tryon/woman-bob/standard/', import.meta.url);
export const standardBob = {
  id: bobId,
  pose: 'standard',
  sourceLabel: '短发女士 · 标准母版',
  avatar: {
    id: bobId, label: '短发女士', width: 560, height: 1536,
    anchors: {
      neck: [279, 294], shoulderLeft: [129, 324], shoulderRight: [423, 324],
      waist: [278, 619], ankleLeft: [199, 1392], ankleRight: [347, 1393], feet: [273, 1478],
    },
    baseLayers: [
      { id: 'body', layer: 6, image: new URL('body.webp', path).href },
      { id: 'head', layer: 5, image: new URL('head.webp', path).href },
    ],
  },
  garments: [],
  slots: {
    body: { top: 277, bottom: 1490, containsX: x => x > 14 && x < 541 },
    head: { top: 48, bottom: 287, containsX: x => x >= 180 && x <= 369 },
  },
};
