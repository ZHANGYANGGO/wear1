const separateSlots = ['top', 'bottom'];
export const lookSlots = [...separateSlots, 'dress', 'outerwear', 'shoes'];

export const studioViewKey = roleId => 'wearmate.studio.view.' + roleId;
export function readStudioView(storage,roleId) {
  try { return JSON.parse(storage.getItem(studioViewKey(roleId))); }
  catch { return null; }
}

export function createLook(separates) {
  return {
    top: separates.top, bottom: separates.bottom, shoes: separates.shoes,
    dress: null, outerwear: null,
  };
}

export function selectTryOnItem(look, item) {
  if (!item || !lookSlots.includes(item.category)) return look;
  if (separateSlots.includes(item.category)) return { ...look, [item.category]: item.id, dress: null };
  return { ...look, [item.category]: item.id };
}

export function removeLayer(look, slot) {
  return slot === 'dress' || slot === 'outerwear' ? { ...look, [slot]: null } : look;
}

export function visibleLook(look) {
  return {
    top: look.dress ? null : look.top,
    bottom: look.dress ? null : look.bottom,
    dress: look.dress,
    outerwear: look.outerwear,
    shoes: look.shoes,
  };
}

export function restoreLook(saved, defaults, byId) {
  const next = createLook(defaults);
  for (const slot of lookSlots) {
    if (byId.get(saved?.[slot])?.category === slot) next[slot] = saved[slot];
  }
  return next;
}

export function canWearSelection(look, byId, isReady) {
  const items = visibleLook(look);
  if (!items.shoes || (!items.dress && (!items.top || !items.bottom))) return false;
  return lookSlots.every(slot => items[slot] === null ||
    (byId.get(items[slot])?.category === slot && isReady(items[slot])));
}
