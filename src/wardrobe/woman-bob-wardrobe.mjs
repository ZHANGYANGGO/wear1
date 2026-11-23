import { garmentCatalog } from './garments.mjs';

// Front and back pieces are drawn on the short-haired woman's own pose frame.
export const bobId = 'woman-bob';
export const bobLayers = {
  'navy-shirt': [['neckline', 7], ['navy-shirt-back', 4], ['navy-shirt', 30]],
  'purple-graphic-tee': [['neckline', 7], ['purple-graphic-tee', 30]],
  'black-trousers': [['black-trousers', 20]],
  'gray-joggers': [['gray-joggers', 20]],
  'light-blue-jeans': [['light-blue-jeans', 20]],
  'white-platform-sneakers': [['white-platform-sneakers', 10]],
  'ivory-mary-janes': [['mary-jane-insteps', 1], ['ivory-mary-janes', 10]],
  'floral-maxi': [['neckline', 7], ['floral-maxi', 25]],
  'white-puffer': [['white-puffer-back', 4], ['white-puffer', 40]],
};
export const bobCatalog = garmentCatalog.filter(item => Object.hasOwn(bobLayers, item.id));
export const bobStandardLayers = {
  ...bobLayers,
  'navy-shirt': [['navy-shirt-back', 4], ['navy-shirt', 30]],
  'purple-graphic-tee': [['purple-graphic-tee', 30]],
  'ivory-mary-janes': [['ivory-mary-janes', 10]],
  'floral-maxi': [['floral-maxi', 25], ['floral-maxi-under-coat', 25]],
};
export const bobCasual = {
  id: 'casual', letter: 'A', name: '印花休闲', detail: '紫色印花 T、浅蓝牛仔与厚底鞋',
  items: { top: 'purple-graphic-tee', bottom: 'light-blue-jeans', shoes: 'white-platform-sneakers' },
};
export const bobCommute = {
  id: 'commute', letter: 'B', name: '海军蓝通勤', detail: '暗纹衬衫、直筒黑裤与细带皮鞋',
  items: { top: 'navy-shirt', bottom: 'black-trousers', shoes: 'ivory-mary-janes' },
};
