import { categories, garments, garmentById, outfits } from './wardrobe/catalog.mjs';
import { matchOutfit, selectGarment, selectOutfit } from './wardrobe/selection.mjs';
import { mila } from './avatar/config.mjs';
import { mountAvatar } from './avatar/renderer.mjs';

const outfitList = document.querySelector('#outfits');
const categoryList = document.querySelector('#categories');
const garmentList = document.querySelector('#garments');
const lookName = document.querySelector('#look-name');
const lookDetails = document.querySelector('#look-details');
const avatar = mountAvatar(document.querySelector('#avatar'), mila, garments);
const outfitButtons = new Map();
const categoryButtons = new Map();
const garmentButtons = new Map();
let selection = selectOutfit(outfits[0].id);
let activeCategory = categories[0].id;
let isReady = false;

function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function button(className) {
  const element = node('button', className);
  element.type = 'button';
  return element;
}

function swatches(colors) {
  const group = node('span', 'swatches');
  group.setAttribute('aria-hidden', 'true');
  for (const color of colors) {
    const dot = node('span', 'swatch');
    dot.style.setProperty('--swatch', color);
    group.append(dot);
  }
  return group;
}

function updateLook() {
  avatar.show(selection);
  const matched = matchOutfit(selection);
  const selectedIds = Object.values(selection);
  for (const [id, element] of outfitButtons) {
    element.setAttribute('aria-pressed', String(id === matched?.id));
    element.disabled = !isReady;
  }
  for (const [id, element] of garmentButtons) {
    element.setAttribute('aria-pressed', String(selectedIds.includes(id)));
    element.disabled = !isReady;
  }
  const name = matched?.name ?? '自定义搭配';
  const details = selectedIds.map(id => garmentById.get(id).name).join(' / ');
  if (lookName.textContent !== name) lookName.textContent = name;
  if (lookDetails.textContent !== details) lookDetails.textContent = details;
}

for (const outfit of outfits) {
  const element = button('outfit-button');
  element.dataset.outfit = outfit.id;
  const letter = node('span', 'outfit-letter', outfit.letter);
  const copy = node('span', 'outfit-copy');
  copy.append(node('strong', '', outfit.name), node('span', '', outfit.detail));
  element.append(letter, copy, swatches(Object.values(outfit.items).map(id => garmentById.get(id).color)));
  element.addEventListener('click', () => {
    selection = selectOutfit(outfit.id);
    updateLook();
  });
  outfitButtons.set(outfit.id, element);
  outfitList.append(element);
}

function showCategory(id) {
  activeCategory = id;
  for (const [key, element] of categoryButtons) {
    const isActive = key === activeCategory;
    element.setAttribute('aria-selected', String(isActive));
    element.tabIndex = isActive ? 0 : -1;
  }
  garmentList.setAttribute('aria-labelledby', `tab-${id}`);
  garmentButtons.clear();
  garmentList.replaceChildren();
  for (const garment of garments.filter(item => item.category === id)) {
    const element = button('garment-button');
    element.dataset.garment = garment.id;
    element.style.setProperty('--swatch', garment.color);
    const photo = node('span', 'garment-photo');
    const thumb = node('img', 'garment-art');
    thumb.src = garment.thumbnail;
    thumb.alt = '';
    thumb.draggable = false;
    const check = node('span', 'garment-check', '✓');
    check.setAttribute('aria-hidden', 'true');
    photo.append(thumb, check);
    const copy = node('span', 'garment-copy');
    copy.append(node('strong', '', garment.name), node('span', 'garment-detail', garment.detail));
    element.append(photo, copy);
    element.addEventListener('click', () => {
      selection = selectGarment(selection, garment.id);
      updateLook();
    });
    garmentButtons.set(garment.id, element);
    garmentList.append(element);
  }
  updateLook();
}

for (const category of categories) {
  const element = button('category-tab');
  element.id = `tab-${category.id}`;
  element.textContent = category.name;
  element.setAttribute('role', 'tab');
  element.setAttribute('aria-controls', garmentList.id);
  element.addEventListener('click', () => showCategory(category.id));
  categoryButtons.set(category.id, element);
  categoryList.append(element);
}

categoryList.addEventListener('keydown', event => {
  const index = categories.findIndex(category => category.id === activeCategory);
  const positions = {
    Home: 0,
    End: categories.length - 1,
    ArrowLeft: (index + categories.length - 1) % categories.length,
    ArrowRight: (index + 1) % categories.length,
  };
  if (!Object.hasOwn(positions, event.key)) return;
  event.preventDefault();
  const { id } = categories[positions[event.key]];
  showCategory(id);
  categoryButtons.get(id).focus();
});

showCategory(activeCategory);
avatar.ready.then(() => {
  isReady = true;
  updateLook();
}).catch(() => {
  document.querySelector('#asset-error').hidden = false;
});
