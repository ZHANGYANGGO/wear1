export const categories = {
  top: '上衣', bottom: '裤子', dress: '连衣裙', outerwear: '外套', shoes: '鞋子',
};
export const seasons = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const warmth = { 1: '轻薄', 2: '适中', 3: '保暖' };
export const statements = { basic: '基础款', accent: '点缀款', statement: '亮点款' };
export const availability = { available: '可穿', washing: '清洗中', unavailable: '暂不可穿' };
export const tryOnStatuses = { pending: '试穿待适配', ready: '已有试穿素材', failed: '试穿素材不可用' };

// Coverage for future layered sprites. tryOnAssets will address assets by body template or role ID.
export const tryOnCoverage = {
  top: { slots: ['top'] },
  bottom: { slots: ['bottom'] },
  dress: { slots: ['top', 'bottom'] },
  outerwear: { slots: ['outerwear'], above: ['top', 'dress'], needsArmOcclusion: true },
  shoes: { slots: ['shoes'] },
};

function words(value, limit, length) {
  if (!Array.isArray(value) || value.length > limit || value.some(word =>
    typeof word !== 'string' || !word.trim() || word.trim().length > length)) return null;
  return [...new Set(value.map(word => word.trim()))];
}

export function editableFields(item) {
  const name = typeof item?.name === 'string' ? item.name.trim() : '';
  const primaryColor = typeof item?.primaryColor === 'string' ? item.primaryColor.trim() : '';
  const secondaryColors = words(item?.secondaryColors, 6, 20);
  const styleTags = words(item?.styleTags, 8, 20);
  const seasonList = words(item?.seasons, 4, 8);
  if (!name || name.length > 45 || !primaryColor || primaryColor.length > 20 ||
      !secondaryColors || !styleTags || !seasonList || !seasonList.every(key => Object.hasOwn(seasons, key)) ||
      !Object.hasOwn(categories, item.category) || !Object.hasOwn(statements, item.statementLevel) ||
      !Object.hasOwn(availability, item.availability) ||
      !Number.isInteger(item.warmthLevel) || !Object.hasOwn(warmth, item.warmthLevel)) {
    throw new Error('请检查名称、颜色和分类。辅色最多 6 项，风格标签最多 8 项，每项最多 20 个字。');
  }
  return {
    name, category: item.category, primaryColor, secondaryColors, styleTags, seasons: seasonList,
    warmthLevel: item.warmthLevel, statementLevel: item.statementLevel, availability: item.availability,
  };
}
