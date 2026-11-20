/**
 * The pose is defined by the pre-aligned sprites. Runtime offsets are in canvas
 * pixels, so resizing the viewport changes the scale of the entire stack.
 * @param {HTMLElement} element
 * @param {import('./config.mjs').AvatarConfig} avatar
 * @param {import('../wardrobe/catalog.mjs').Garment[]} garments
 */
export function mountAvatar(element, avatar, garments) {
  element.style.setProperty('--avatar-ratio', `${avatar.width} / ${avatar.height}`);
  element.setAttribute('aria-label', avatar.label);
  /** @type {({id: string, layer: number, image: string, fixed: true} | import('../wardrobe/catalog.mjs').Garment)[]} */
  const spriteLayers = [
    ...avatar.baseLayers.map(layer => ({ ...layer, fixed: true })),
    ...garments,
  ].sort((a, b) => a.layer - b.layer);
  const clothing = new Map();
  const images = spriteLayers.map(sprite => {
    const image = document.createElement('img');
    image.className = 'sprite';
    image.dataset.layer = sprite.id;
    image.alt = '';
    image.draggable = false;
    image.src = sprite.image;
    if (!('fixed' in sprite)) {
      image.classList.add('sprite-garment');
      const [anchorX, anchorY] = avatar.anchors[sprite.anchor];
      const [offsetX, offsetY] = sprite.offset;
      image.style.transformOrigin = `${100 * anchorX / avatar.width}% ${100 * anchorY / avatar.height}%`;
      image.style.transform = `translate(${100 * offsetX / avatar.width}%, ${100 * offsetY / avatar.height}%) scale(${sprite.scale})`;
      image.hidden = true;
      clothing.set(sprite.id, image);
    }
    return image;
  });
  element.append(...images);

  return {
    ready: Promise.all(images.map(image => image.decode())),
    /** @param {import('../wardrobe/catalog.mjs').OutfitSelection} selection */
    show(selection) {
      const selected = new Set(Object.values(selection));
      for (const [id, image] of clothing) image.hidden = !selected.has(id);
    },
  };
}
