import { categories, garments as defaultGarments, outfits as classicOutfits } from './wardrobe/catalog.mjs';
import { bobId, bobCommute } from './wardrobe/woman-bob-wardrobe.mjs';
import { getFitInfo, wardrobeSprites } from './wardrobe/tryon-assets.mjs';
import {
  canWearSelection, createLook, removeLayer, restoreLook, selectTryOnItem, visibleLook,
} from './wardrobe/tryon-selection.mjs';
import { readSavedLooks, saveLook } from './wardrobe/saved-looks.mjs';
import { openPersonalWardrobe } from './wardrobe/personal.mjs';
import { mila } from './avatar/config.mjs';
import { mountAvatar } from './avatar/renderer.mjs';
import { avatarProvider, readConfirmedProfile } from './create/profiles.mjs';
import { preparePreview } from './create/preview.mjs';

const outfitList = document.querySelector('#outfits');
const categoryList = document.querySelector('#categories');
const garmentList = document.querySelector('#garments');
const lookName = document.querySelector('#look-name');
const lookDetails = document.querySelector('#look-details');
let avatarElement = document.querySelector('#avatar');
const assetError = document.querySelector('#asset-error');
const feedback = document.querySelector('#tryon-feedback');
const form = document.querySelector('#save-look-form');
const nameInput = document.querySelector('#look-title');
const saveButton = document.querySelector('#save-look-button');
const savedDetails = document.querySelector('#saved-looks');
const savedList = document.querySelector('#saved-look-list');
const saveStatus = document.querySelector('#saved-look-status');
const profileId = readConfirmedProfile()?.id ?? bobId;
let local;
let personal = new Map();
try {
  local = window.localStorage;
  personal = new Map(openPersonalWardrobe(local, profileId).store.list().map(item => [item.id, item]));
} catch {
  // Opening the workbench should remain possible with an unavailable wardrobe store.
}
let activeBundle = null;
let adapted = [];
let avatar;
let profileError = '';
try {
  const bundle = await avatarProvider.byId(profileId);
  const extras = wardrobeSprites(bundle.id);
  const prepared = await preparePreview(avatarElement, bundle, { extras, strict: false });
  avatarElement.replaceWith(prepared.next);
  avatarElement = prepared.next;
  avatarElement.dataset.profile = bundle.id;
  avatar = prepared.mounted;
  activeBundle = bundle;
  adapted = extras;
  document.querySelector('#stage-role-name').textContent = bundle.avatar.label;
  document.querySelector('#stage-role-type').textContent = '本地预制分身';
} catch {
  profileError = '当前分身暂不可用，现显示示例角色 Mila。';
}
avatar ??= mountAvatar(avatarElement, mila, defaultGarments);
const dedicated = activeBundle?.id === bobId;
const outfits = dedicated ? [classicOutfits[0], bobCommute] : classicOutfits;
const extras = adapted.map(item => dedicated && personal.has(item.id)
  ? { ...item, name: personal.get(item.id).name } : item);
const garments = [...(activeBundle?.garments ?? defaultGarments), ...extras];
const allById = new Map(garments.map(item => [item.id, item]));
const baseIds = new Set(Object.values(classicOutfits[0].items));
const controlGarments = garments.filter(item =>
  item.parts ? personal.has(item.id) : (!dedicated || baseIds.has(item.id)));
const garmentById = dedicated ? new Map(controlGarments.map(item => [item.id, item])) : allById;
const tabs = [...categories];
if (adapted.some(item => item.category === 'dress')) tabs.push({ id: 'dress', name: '连衣裙' });
if (adapted.some(item => item.category === 'outerwear')) tabs.push({ id: 'outerwear', name: '外套' });
categoryList.style.setProperty('--category-count', tabs.length);
const outfitButtons = new Map();
const categoryButtons = new Map();
const garmentButtons = new Map();
const defaults = outfits[0].items;
let selection = createLook(defaults);
let activeCategory = categories[0].id;
let avatarReady = false;
let avatarError = '';
const roleId = activeBundle?.id ?? mila.id;
const viewKey = 'wearmate.studio.view.' + roleId;

try {
  const previous = JSON.parse(sessionStorage.getItem(viewKey));
  selection = restoreLook(previous?.selection, defaults, garmentById);
  if (tabs.some(({ id }) => id === previous?.category)) activeCategory = previous.category;
} catch {
  // The studio still works when the browser blocks session storage.
}

const request = new URL(window.location.href);
let requestedId = request.searchParams.get('tryOn');
if (personal.has(requestedId) && garmentById.get(requestedId)?.parts) {
  activeCategory = garmentById.get(requestedId).category;
}

function showMessage(element, text = '') {
  element.textContent = text;
  element.hidden = !text;
}

function applyRequest() {
  if (!requestedId) return;
  const item = garmentById.get(requestedId);
  let reply;
  if (!personal.has(requestedId)) reply = '请先把这件衣物加入个人衣橱。';
  else if (!item?.parts) reply = getFitInfo(requestedId, roleId).message ?? '当前分身的试穿图层暂不可用。';
  else if (garmentStatus(item.id) === 'failed') reply = `「${item.name}」加载失败，已保留当前穿搭。`;
  else if (!avatarReady || !isGarmentReady(item.id)) {
    if (!avatarError) {
      showMessage(feedback, `正在加载「${item.name}」…`);
      return;
    }
    reply = '角色暂不可用，待角色恢复后可试穿。';
  } else {
    const candidate = selectTryOnItem(selection, item);
    if (dedicated && !canWearSelection(candidate, garmentById, isGarmentReady)) {
      const layers = Object.values(visibleLook(candidate)).filter(Boolean);
      if (layers.some(id => garmentStatus(id) === 'loading')) {
        showMessage(feedback, '正在准备完整穿搭…');
        return;
      }
      reply = '搭配所需的其他衣物未能加载，请先更换单品再试穿。';
    } else {
      selection = candidate;
      rememberView();
      reply = `已试穿「${item.name}」。`;
    }
  }
  requestedId = null;
  request.searchParams.delete('tryOn');
  history.replaceState(history.state, '', request);
  showMessage(feedback, reply);
}

function rememberView() {
  try {
    sessionStorage.setItem(viewKey, JSON.stringify({ selection, category: activeCategory }));
  } catch {
    // The selected outfit remains active on the current page.
  }
}

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

let syncWeatherSelection;
function updateLook() {
  for (const slot of ['dress', 'outerwear']) {
    if (garmentStatus(selection[slot]) === 'failed') selection = removeLayer(selection, slot);
  }
  for (const { id } of categories) {
    if (garmentStatus(selection[id]) !== 'failed') continue;
    const fallback = dedicated
      ? controlGarments.find(item => item.category === id && isGarmentReady(item.id))
      : garments.find(item => !item.parts && item.category === id && isGarmentReady(item.id));
    if (fallback) selection = { ...selection, [id]: fallback.id };
  }

  applyRequest();
  const visible = visibleLook(selection);
  const selectedIds = Object.values(visible).filter(Boolean);
  const complete = avatarReady && canWearSelection(selection, garmentById, isGarmentReady);
  const matched = complete && !visible.dress && !visible.outerwear
    ? outfits.find(outfit => categories.every(slot => outfit.items[slot.id] === visible[slot.id])) : undefined;
  avatarElement.hidden = !complete;
  avatar.show(visible);
  syncWeatherSelection?.();
  saveButton.disabled = !complete;

  for (const outfit of outfits) {
    const ids = Object.values(outfit.items);
    const owned = !dedicated || ids.every(id => baseIds.has(id) || personal.has(id));
    const ready = owned && ids.every(isGarmentReady);
    const failed = ids.filter(id => garmentStatus(id) === 'failed').map(id => allById.get(id).name);
    const message = !owned ? '衣橱中缺少单品' : failed.length ? `素材不可用（${failed.join('、')}）`
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
  const errorText = [profileError, avatarError, failures.length ? `衣物素材加载失败（${failures.join('、')}）。` : ''].filter(Boolean).join(' ');
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
  const detail = activeBundle?.outfitDetails?.[outfit.id] ?? outfit.detail;
  copy.append(node('strong', '', outfit.name), node('span', '', detail), status);
  element.append(letter, copy, swatches(Object.values(outfit.items).map(id => allById.get(id).color)));
  element.addEventListener('click', () => {
    selection = createLook(outfit.items);
    showMessage(feedback);
    updateLook();
    rememberView();
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
  const choices = controlGarments.filter(item => item.category === id);
  for (const garment of choices) {
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
      selection = selectTryOnItem(selection, garment);
      showMessage(feedback);
      updateLook();
      rememberView();
    });
    garmentButtons.set(garment.id, { element, status });
    garmentList.append(element);
  }
  if (id === 'dress' || id === 'outerwear') {
    const clear = button('layer-clear');
    clear.textContent = id === 'dress' ? '切回上衣与裤子' : '脱下外套';
    clear.addEventListener('click', () => {
      selection = removeLayer(selection, id);
      showMessage(feedback, id === 'dress' ? '已切回上衣和裤子。' : '已脱下外套。');
      updateLook();
      rememberView();
    });
    garmentList.append(clear);
  }
  if (!choices.length) {
    const notice = node('p', 'no-wardrobe-choice', '可以从');
    const link = node('a', '', '我的衣橱');
    link.href = './wardrobe.html';
    notice.append(link, '加入该类别的可试穿衣物。');
    garmentList.prepend(notice);
  }
  updateLook();
  rememberView();
}

for (const category of tabs) {
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
  const index = tabs.findIndex(category => category.id === activeCategory);
  const positions = {
    Home: 0,
    End: tabs.length - 1,
    ArrowLeft: (index + tabs.length - 1) % tabs.length,
    ArrowRight: (index + 1) % tabs.length,
  };
  if (!Object.hasOwn(positions, event.key)) return;
  event.preventDefault();
  const { id } = tabs[positions[event.key]];
  showCategory(id);
  categoryButtons.get(id).focus();
});

function renderSaved() {
  let records;
  try {
    records = readSavedLooks(local).filter(item => item.roleId === roleId);
  } catch {
    return;
  }
  savedDetails.hidden = !records.length;
  savedList.replaceChildren();
  for (const record of records) {
    const row = node('li');
    const load = button('saved-look-load');
    load.textContent = record.name;
    load.addEventListener('click', () => {
      const candidate = restoreLook(record, selection, garmentById);
      const complete = Object.entries(visibleLook(candidate)).every(([slot, id]) => id === record[slot])
        && canWearSelection(candidate, garmentById, isGarmentReady);
      if (!complete) {
        showMessage(saveStatus, '这套穿搭的素材暂不可用，已保留当前穿搭。');
        return;
      }
      selection = candidate;
      updateLook();
      rememberView();
      showMessage(saveStatus, `已载入「${record.name}」。`);
    });
    const time = node('time', '', new Date(record.createdAt).toLocaleDateString('zh-CN'));
    time.dateTime = record.createdAt;
    row.append(load, time);
    savedList.append(row);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!avatarReady) return;
  try {
    const record = saveLook(local, { roleId, name: nameInput.value, selection }, garmentById, isGarmentReady);
    nameInput.value = '';
    renderSaved();
    showMessage(saveStatus, `已保存「${record.name}」。`);
  } catch (error) {
    showMessage(saveStatus, error.message);
  }
});
renderSaved();

showCategory(activeCategory);
for (const load of avatar.garmentLoads.values()) {
  load.settled.then(updateLook);
}
avatar.ready.then(result => {
  avatarReady = result.ok;
  if (!result.ok) avatarError = `角色加载失败。 ${result.message}`;
  updateLook();
});

const todayEntry = document.querySelector('#today-entry');
if (dedicated && request.searchParams.get('view') !== 'today') {
  todayEntry.hidden = false;
  document.querySelector('.intro-note').hidden = true;
}
if (dedicated && request.searchParams.get('view') === 'today') {
  document.body.classList.add('today');
  document.title = '今日穿搭 · WearMate';
  const currentNav = document.querySelector('nav [aria-current=page]');
  currentNav.textContent = '今日穿搭';
  currentNav.href = './?view=today';
  document.querySelector('h1').textContent = '今日穿搭';
  document.querySelector('.intro-label').textContent = 'DAILY OUTFIT';
  document.querySelector('.intro-note').hidden = true;
  document.querySelector('[aria-labelledby=outfits-title]').hidden = true;
  document.querySelector('#wardrobe').hidden = true;
  document.querySelector('#weather-panel').hidden = false;
  document.querySelector('#today-recommendations').hidden = false;
  const jump = document.querySelector('.look-caption a');
  jump.href = '#today-recommendations';
  jump.textContent = '选择方案';
  const { mountToday } = await import('./today/page.mjs');
  await Promise.all([avatar.ready, ...[...avatar.garmentLoads.values()].map(load => load.settled)]);
  const { store, key } = openPersonalWardrobe(local, bobId);
  syncWeatherSelection = mountToday({
    list: () => store.list(),
    ready: id => avatarReady && garmentById.has(id) && isGarmentReady(id),
    current: () => visibleLook(selection),
    failedNames: () => adapted.filter(item => personal.has(item.id) && garmentStatus(item.id) === 'failed').map(item => item.name),
    wear(plan) {
      const candidate = restoreLook(plan.garmentIds, selection, garmentById);
      if (!avatarReady || plan.avatarId !== roleId || !canWearSelection(candidate, garmentById, isGarmentReady)
          || !Object.entries(visibleLook(candidate)).every(([slot,id]) => id === plan.garmentIds[slot])) {
        throw new Error('本套搭配的图层尚未完整就绪');
      }
      selection = candidate;
      updateLook();
      rememberView();
    },
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) window.location.reload();
  });
}
