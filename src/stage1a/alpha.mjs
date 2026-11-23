const slots = {
  head: { top: 1, bottom: 286, containsX: (x) => x >= 95 && x < 465 },
  arms: { top: 360, bottom: 890, containsX: (x, y) => y < 430 || x < 170 || x > 365 },
  ankles: { top: 1410, bottom: 1472, containsX: (x) => (x >= 118 && x < 206) || (x >= 318 && x < 413) },
};

/** Suppress invisible compression fringes when inspecting the visible sprite bounds. */
export function layerFitsSlot(id, pixels, width, height, permittedSlots = slots) {
  if (!Object.hasOwn(permittedSlots, id)) return false;
  const slot = permittedSlots[id];
  if (pixels.length !== width * height * 4) return false;
  let left = false;
  let right = false;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] <= 32) continue;
    const pixel = (index - 3) / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (y < slot.top || y >= slot.bottom || !slot.containsX(x, y)) return false;
    left ||= x < width / 2;
    right ||= x >= width / 2;
  }
  return left && right;
}

/** Check decoded same-origin images before replacing the active role. */
export function inspectGeneratedLayers(host, avatar, permittedSlots = slots) {
  const canvas = host.ownerDocument.createElement('canvas');
  canvas.width = avatar.width;
  canvas.height = avatar.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '浏览器无法检查候选图层的透明边界。';
  const images = [...host.children];
  for (const layer of avatar.baseLayers) {
    const image = images.find(sprite => sprite.dataset.layer === layer.id);
    if (!image) return `候选角色缺少「${layer.id}」图层。`;
    context.clearRect(0, 0, avatar.width, avatar.height);
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, avatar.width, avatar.height);
    if (!layerFitsSlot(layer.id, data, avatar.width, avatar.height, permittedSlots)) {
      return `候选角色的「${layer.id}」图层为空、超出对位区域或缺少一侧轮廓。`;
    }
  }
  return '';
}
