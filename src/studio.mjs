import { categories, garments, garmentById, outfits } from './wardrobe/catalog.mjs';
import { matchOutfit, selectGarment, selectOutfit } from './wardrobe/selection.mjs';
import { mila } from './avatar/config.mjs';
import { mountAvatar } from './avatar/renderer.mjs';

const outfitList = document.querySelector('#outfits');
const categoryList = document.querySelector('#categories');
const garmentList = document.querySelector('#garments');
const lookName = document.querySelector('#look-name');
const lookDetails = document.querySelector('#look-details');
const avatarElement = document.querySelector('#avatar');
const assetError = document.querySelector('#asset-error');
const avatar = mountAvatar(avatarElement, mila, garments);
const outfitButtons = new Map();
const categoryButtons = new Map();
const garmentButtons = new Map();
let selection = selectOutfit(outfits[0].id);
let activeCategory = categories[0].id;
let avatarReady = false;
let avatarError = '';

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

function garmentStatus(id) {
  return avatar.garmentLoads.get(id)?.status ?? 'loading';
}

function isGarmentReady(id) {
  return garmentStatus(id) === 'ready';
}

function updateChoice({ element, status }, selected, available, message) {
  element.setAttribute('aria-pressed', String(selected));
  element.disabled = !avatarReady || !available;
  if (status.textContent !== message) status.textContent = message;
  status.hidden = !message;
}

function updateLook() {
  for (const { id } of categories) {
    if (garmentStatus(selection[id]) !== 'failed') continue;
    const fallback = garments.find(item => item.category === id && isGarmentReady(item.id));
    if (fallback) selection = selectGarment(selection, fallback.id);
  }

  const selectedIds = Object.values(selection);
  const complete = avatarReady && selectedIds.every(isGarmentReady);
  const matched = complete ? matchOutfit(selection) : undefined;
  avatarElement.hidden = !complete;
  avatar.show(selection);

  for (const outfit of outfits) {
    const ids = Object.values(outfit.items);
    const ready = ids.every(isGarmentReady);
    const failed = ids.filter(id => garmentStatus(id) === 'failed').map(id => garmentById.get(id).name);
    const message = failed.length ? `素材不可用（${failed.join('、')}）`
      : !ready && !avatarError ? '素材加载中' : '';
    updateChoice(outfitButtons.get(outfit.id), outfit.id === matched?.id, ready, message);
  }
  for (const [id, choice] of garmentButtons) {
    const ready = isGarmentReady(id);
    const message = garmentStatus(id) === 'failed' ? '素材加载失败'
      : !ready && !avatarError ? '素材加载中' : '';
    updateChoice(choice, ready && selectedIds.includes(id), ready, message);
  }

  const name = complete ? (matched?.name ?? '自定义搭配')
    : avatarError ? '造型不可用'
      : selectedIds.some(id => garmentStatus(id) === 'failed') ? '造型未完整加载' : '造型加载中';
  const details = selectedIds.filter(isGarmentReady).map(id => garmentById.get(id).name).join(' / ');
  const failures = garments.filter(item => garmentStatus(item.id) === 'failed').map(item => item.name);
  const errorText = [avatarError, failures.length ? `衣物素材加载失败（${failures.join('、')}）。` : ''].filter(Boolean).join(' ');
  if (lookName.textContent !== name) lookName.textContent = name;
  if (lookDetails.textContent !== details) lookDetails.textContent = details;
  if (assetError.textContent !== errorText) assetError.textContent = errorText;
  assetError.hidden = !errorText;
}

for (const outfit of outfits) {
  const element = button('outfit-button');
  element.dataset.outfit = outfit.id;
  const letter = node('span', 'outfit-letter', outfit.letter);
  const copy = node('span', 'outfit-copy');
  const status = node('small', 'choice-status');
  copy.append(node('strong', '', outfit.name), node('span', '', outfit.detail), status);
  element.append(letter, copy, swatches(Object.values(outfit.items).map(id => garmentById.get(id).color)));
  element.addEventListener('click', () => {
    selection = selectOutfit(outfit.id);
    updateLook();
  });
  outfitButtons.set(outfit.id, { element, status });
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
    const thumbnailStatus = node('span', 'thumbnail-status', '缩略图不可用');
    thumbnailStatus.hidden = true;
    thumb.addEventListener('error', () => {
      thumb.hidden = true;
      thumbnailStatus.hidden = false;
    }, { once: true });
    thumb.src = garment.thumbnail;
    thumb.alt = '';
    thumb.draggable = false;
    const check = node('span', 'garment-check', '✓');
    check.setAttribute('aria-hidden', 'true');
    photo.append(thumb, thumbnailStatus, check);
    const copy = node('span', 'garment-copy');
    const status = node('small', 'choice-status');
    copy.append(node('strong', '', garment.name), node('span', 'garment-detail', garment.detail), status);
    element.append(photo, copy);
    element.addEventListener('click', () => {
      selection = selectGarment(selection, garment.id);
      updateLook();
    });
    garmentButtons.set(garment.id, { element, status });
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
for (const load of avatar.garmentLoads.values()) {
  load.settled.then(updateLook);
}
avatar.ready.then(result => {
  avatarReady = result.ok;
  if (!result.ok) avatarError = `角色加载失败。 ${result.message}`;
  updateLook();
});
