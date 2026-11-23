function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isName(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPoint(value) {
  return Array.isArray(value) && value.length === 2
    && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function isAssetUrl(value) {
  if (!isName(value)) return false;
  try {
    return ['http:', 'https:', 'blob:', 'file:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Validate the shared coordinate frame and the layers needed to mount the role. */
export function validateAvatar(avatar, garments) {
  if (!isRecord(avatar)) return '角色配置必须是对象。';
  if (!isName(avatar.id) || !isName(avatar.label)) return '角色 ID 和名称不能为空。';
  const { width, height, anchors, baseLayers } = avatar;
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) {
    return '角色画布宽度和高度必须为正整数。';
  }
  if (!isRecord(anchors)) return '角色锚点必须是对象。';
  for (const [name, point] of Object.entries(anchors)) {
    if (!isName(name) || !isPoint(point)) return `角色锚点「${name}」必须包含两个有限坐标。`;
    const [x, y] = point;
    if (x < 0 || x > width || y < 0 || y > height) return `角色锚点「${name}」超出画布。`;
  }
  if (!Array.isArray(baseLayers) || baseLayers.length === 0) return '角色至少需要一个基础图层。';
  const ids = new Set();
  for (const [index, layer] of baseLayers.entries()) {
    if (!isRecord(layer) || !isName(layer.id)) return `第 ${index + 1} 个基础图层缺少有效 ID。`;
    if (ids.has(layer.id)) return `图层 ID「${layer.id}」重复。`;
    if (!Number.isFinite(layer.layer)) return `基础图层「${layer.id}」的层级必须为有限数字。`;
    if (!isAssetUrl(layer.image)) return `基础图层「${layer.id}」的素材地址无效。`;
    ids.add(layer.id);
  }
  if (!Array.isArray(garments)) return '衣物图层必须按列表传入。';
  for (const garment of garments) {
    if (!isRecord(garment) || !isName(garment.id)) return '衣物图层缺少有效 ID。';
    if (ids.has(garment.id)) return `图层 ID「${garment.id}」重复。`;
    if (isName(garment.anchor) && !Object.hasOwn(anchors, garment.anchor)) {
      return `角色缺少必需锚点「${garment.anchor}」。`;
    }
    ids.add(garment.id);
  }
  return '';
}

/** A malformed sprite can be skipped without invalidating the other garment IDs. */
export function validateGarmentLayer(garment) {
  if (!isName(garment.anchor) || !isPoint(garment.offset)
      || !Number.isFinite(garment.scale) || garment.scale <= 0) {
    return '衣物定位、缩放或层级无效。';
  }
  if (Object.hasOwn(garment, 'parts') && (!Array.isArray(garment.parts) || garment.parts.length === 0)) {
    return '衣物至少需要一个透明素材图层。';
  }
  const parts = garment.parts ?? [garment];
  const ids = new Set();
  for (const part of parts) {
    if (!isRecord(part) || !isName(part.id) || ids.has(part.id)
        || !Number.isFinite(part.layer) || !isAssetUrl(part.image)) return '衣物素材或层级无效。';
    ids.add(part.id);
  }
  return '';
}
