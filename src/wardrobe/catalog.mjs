/** @typedef {'top' | 'bottom' | 'shoes'} Category */
/** @typedef {Readonly<Record<Category, string>>} OutfitSelection */
/** @typedef {{id: string, category: Category, name: string, detail: string, color: string, anchor: string, offset: [number, number], scale: number, layer: number}} GarmentSpec */
/** @typedef {GarmentSpec & {image: string, thumbnail: string}} Garment */
/** @typedef {{id: string, letter: string, name: string, detail: string, items: OutfitSelection}} Outfit */

/** @type {{id: Category, name: string}[]} */
export const categories = [
  { id: 'top', name: '上衣' },
  { id: 'bottom', name: '裤子' },
  { id: 'shoes', name: '鞋子' },
];

/** @type {GarmentSpec[]} */
const garmentSpecs = [
  { id: 'brick-tee', category: 'top', name: '砖红圆领 T 恤', detail: '砖红 · 棉质', color: '#a43d2e', anchor: 'neck', offset: [0, 0], scale: 1, layer: 30 },
  { id: 'espresso-jacket', category: 'top', name: '短袖剪裁夹克', detail: '深咖 · 金属扣', color: '#3a2d28', anchor: 'neck', offset: [0, 0], scale: 1, layer: 30 },
  { id: 'blue-denim', category: 'bottom', name: '水洗直筒牛仔裤', detail: '水洗蓝 · 牛仔', color: '#526e84', anchor: 'waist', offset: [0, 0], scale: 1, layer: 20 },
  { id: 'oat-trousers', category: 'bottom', name: '燕麦色褶裥西裤', detail: '燕麦色 · 压褶', color: '#d7c4a4', anchor: 'waist', offset: [0, 0], scale: 1, layer: 20 },
  { id: 'cream-trainers', category: 'shoes', name: '奶白低帮运动鞋', detail: '奶白 · 生胶底', color: '#ede0c6', anchor: 'feet', offset: [0, 0], scale: 1, layer: 10 },
  { id: 'penny-loafers', category: 'shoes', name: '黑色便士乐福鞋', detail: '墨黑 · 亮面皮革', color: '#252121', anchor: 'feet', offset: [0, 0], scale: 1, layer: 10 },
];

/** @type {Outfit[]} */
export const outfits = [
  { id: 'casual', letter: 'A', name: '舒适休闲', detail: '水洗牛仔与红色棉衫', items: { top: 'brick-tee', bottom: 'blue-denim', shoes: 'cream-trainers' } },
  { id: 'commute', letter: 'B', name: '精致通勤', detail: '剪裁夹克与褶裥西裤', items: { top: 'espresso-jacket', bottom: 'oat-trousers', shoes: 'penny-loafers' } },
];

/** @type {Garment[]} */
export const garments = garmentSpecs.map(garment => ({
  ...garment,
  image: new URL(`../../assets/avatar/${garment.id}.webp`, import.meta.url).href,
  thumbnail: new URL(`../../assets/avatar/${garment.id}-thumb.webp`, import.meta.url).href,
}));

export const garmentById = new Map(garments.map(garment => [garment.id, garment]));
