import { categories, garmentById, outfits } from './catalog.mjs';

/** @import {OutfitSelection} from './catalog.mjs' */

/** @param {string} id */
export function selectOutfit(id) {
  const outfit = outfits.find(candidate => candidate.id === id);
  return outfit ? { ...outfit.items } : undefined;
}

/** @param {OutfitSelection} selection @param {string} id */
export function selectGarment(selection, id) {
  const garment = garmentById.get(id);
  if (!garment || selection[garment.category] === id) return selection;
  return { ...selection, [garment.category]: id };
}

/** @param {OutfitSelection} selection */
export function matchOutfit(selection) {
  return outfits.find(outfit => categories.every(({ id }) => selection[id] === outfit.items[id]));
}
