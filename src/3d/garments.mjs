export const garmentCatalog = [
  { id: 'tshirt', name: '休闲圆领 T 恤', category: 'top', slot: 'top', occupies: ['top'], color: '#b55d45', url: './assets/3d/garments/tshirt.glb', transform: { scale: 1.5 }, croppedTransform: { scale: [2.7, 3.2, 2.7], position: [0, -2.508, 0] } },
  { id: 'shirt', name: '浅色长袖衬衫', category: 'top', slot: 'top', occupies: ['top'], color: '#d8d3c5', url: './assets/3d/garments/shirt.glb', transform: { scale: 1.5 }, croppedTransform: { scale: [1.75, 3, 2.7], position: [0, -2.229, 0] } },
  { id: 'dress', name: '酒红束腰连衣裙', category: 'dress', slot: 'top', occupies: ['top', 'bottom'], color: '#7a2434', url: './assets/3d/garments/dress.glb', transform: { scale: 1.5 }, croppedTransform: { scale: [2.7, 2, 2.7], position: [0, -.75, 0] } },
  { id: 'jacket', name: '深色剪裁夹克', category: 'outerwear', slot: 'outerwear', occupies: ['outerwear'], color: '#403d3a', url: './assets/3d/garments/jacket.glb', transform: { scale: 1.5 }, croppedTransform: { scale: [1.65, 2.77, 2.7], position: [0, -1.947, 0] } },
  { id: 'jeans', name: '蓝色直筒牛仔裤', category: 'bottom', slot: 'bottom', occupies: ['bottom'], color: '#496783', url: './assets/3d/garments/jeans.glb', transform: { scale: 1.5 } },
  { id: 'shoes', name: '深色低帮鞋', category: 'shoes', slot: 'shoes', occupies: ['shoes'], color: '#3c3732', url: './assets/3d/garments/shoes.glb', transform: { scale: 1.5 } },
];

export const garmentGroups = [
  { id: 'top', label: '上装 / 连衣裙', categories: ['top', 'dress'] },
  { id: 'outerwear', label: '外套', categories: ['outerwear'] },
  { id: 'bottom', label: '下装', categories: ['bottom'] },
  { id: 'shoes', label: '鞋履', categories: ['shoes'] },
];
