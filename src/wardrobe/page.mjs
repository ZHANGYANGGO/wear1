import { openPhoto } from '../create/photo.mjs';
import { availability, categories, seasons, statements, tryOnStatuses, warmth } from './model.mjs';
import { openPersonalWardrobe } from './personal.mjs';
import { bobId } from './woman-bob-wardrobe.mjs';
import { localRegistration, readConfirmedProfile } from '../create/profiles.mjs';
import { getFitInfo } from './tryon-assets.mjs';

const byId = id => document.getElementById(id);
const roleId = readConfirmedProfile()?.id ?? bobId;
let storage;
try {
  storage = window.localStorage;
} catch {
  // A blocked store is handled by WardrobeStore so the preview remains usable.
}
const { store, provider, key: storageKey } = openPersonalWardrobe(storage, roleId);
const dialog = byId('garment-dialog');
const title = byId('dialog-title');
const addButton = byId('open-add');
const uploadPanel = byId('upload-panel');
const upload = byId('garment-photo');
const form = byId('garment-form');
const original = byId('original-image');
const cartoon = byId('cartoon-image');
const save = byId('save-item');
const remove = byId('remove-item');
const tryOn = byId('try-on-item');
const removeCheck = byId('remove-check');
const grid = byId('closet-grid');
const search = byId('closet-search');
const categoryButtons = new Map();
let entries = [];
let currentCategory = 'all';
let dialogMode = '';
let activeItem;
let uploadURL;
let requestId = 0;
let returnFocus;
const role = localRegistration.find(record => record.id === roleId);
if (roleId === bobId) {
  document.querySelector('h1').textContent = '短发女士的衣橱';
  document.querySelector('.wardrobe-note').textContent = '为当前分身制作的试穿单品。';
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label) node.textContent = label;
  return node;
}

function message(id, content = '') {
  const node = byId(id);
  node.textContent = content;
  node.hidden = !content;
}

function mutationError(error) {
  message('dialog-error', error.message);
  byId('dialog-error').scrollIntoView({ block: 'nearest' });
}

function populateOptions(name, options) {
  for (const [value, label] of Object.entries(options)) {
    const option = element('option', '', label);
    option.value = value;
    form.elements.namedItem(name).append(option);
  }
}
populateOptions('availability', availability);
populateOptions('category', categories);
populateOptions('warmthLevel', warmth);
populateOptions('statementLevel', statements);

for (const [value, caption] of Object.entries(seasons)) {
  const label = element('label', 'season-option');
  const input = element('input');
  input.type = 'checkbox';
  input.name = 'seasons';
  input.value = value;
  label.append(input, caption);
  byId('season-fields').append(label);
}

for (const [key, label] of Object.entries({ all: '全部', ...categories })) {
  const button = element('button', 'closet-filter', label);
  button.type = 'button';
  button.dataset.category = key;
  button.addEventListener('click', () => {
    currentCategory = key;
    showCards();
  });
  categoryButtons.set(key, button);
  byId('closet-filters').append(button);
}

['purple-graphic-tee', 'floral-maxi', 'white-platform-sneakers'].forEach((id, index) => {
  const image = byId(['showcase-one', 'showcase-two', 'showcase-three'][index]);
  const item = provider.get(id);
  if (item) image.src = item.cartoonDisplayImage;
});

function makeCard(item) {
  const button = element('button', 'closet-card');
  button.type = 'button';
  button.dataset.garmentId = item.id;
  button.addEventListener('click', () => showDetails(item, button));
  const art = element('span', 'closet-card-art');
  const image = element('img');
  image.src = item.cartoonDisplayImage;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  const detail = element('span', 'closet-card-copy');
  const label = element('span', 'closet-card-category', categories[item.category]);
  const name = element('strong', '', item.name);
  const meta = element('span', 'closet-card-meta', item.primaryColor + ' · ' + availability[item.availability]);
  const arrow = element('span', 'closet-card-arrow', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  art.append(image);
  detail.append(label, name, meta, arrow);
  button.append(art, detail);
  return button;
}

function showCards() {
  const term = search.value.trim().normalize('NFKC').toLocaleLowerCase();
  const result = entries.filter(item =>
    (currentCategory === 'all' || item.category === currentCategory) &&
    item.name.normalize('NFKC').toLocaleLowerCase().includes(term));
  for (const [key, button] of categoryButtons) {
    button.setAttribute('aria-pressed', String(key === currentCategory));
  }
  grid.replaceChildren(...result.map(makeCard));
  byId('closet-count').textContent = currentCategory === 'all' && !term
    ? entries.length + ' 件衣物' : '显示 ' + result.length + ' / ' + entries.length + ' 件';
  byId('no-results').hidden = result.length > 0;
}

function refresh() {
  let storageMessage = '';
  try {
    entries = store.list();
  } catch (error) {
    storageMessage = error.message;
  }
  message('storage-problem', storageMessage);
  byId('closet-empty').hidden = entries.length > 0;
  byId('closet-library').hidden = entries.length === 0;
  byId('import-samples').disabled = Boolean(storageMessage);
  showCards();
}
search.addEventListener('input', showCards);
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) refresh();
});

function setWritingState(enabled) {
  for (const control of form.querySelectorAll('input, select, button')) control.disabled = !enabled;
}

function setActive(item, sourceURL) {
  activeItem = item;
  original.hidden = false;
  byId('original-unavailable').hidden = true;
  original.src = sourceURL;
  cartoon.src = item.cartoonDisplayImage;
  const fit = getFitInfo(item.id, role?.id);
  const text = fit.status === 'ready'
    ? `可试穿 · ${role.label}`
    : [tryOnStatuses[fit.status], fit.message].join(' · ');
  byId('tryon-status').textContent = text;
  for (const key of ['name', 'category', 'availability', 'primaryColor', 'warmthLevel', 'statementLevel']) {
    form.elements.namedItem(key).value = item[key];
  }
  for (const key of ['secondaryColors', 'styleTags']) {
    form.elements.namedItem(key).value = item[key].join('、');
  }
  for (const checkbox of form.querySelectorAll('input[name="seasons"]')) {
    checkbox.checked = item.seasons.includes(checkbox.value);
  }
  remove.hidden = dialogMode !== 'details';
  removeCheck.hidden = true;
  const duplicate = dialogMode === 'upload' && entries.some(entry => entry.id === item.id);
  setWritingState(!duplicate);
  tryOn.hidden = dialogMode !== 'details';
  tryOn.disabled = fit.status !== 'ready';
  save.textContent = dialogMode === 'details' ? '保存修改' : duplicate ? '已在我的衣橱' : '加入我的衣橱';
  if (duplicate) message('dialog-status', '这件衣物已经在你的衣橱里。');
  form.hidden = false;
}

original.addEventListener('error', () => {
  if (!activeItem || form.hidden) return;
  original.hidden = true;
  byId('original-unavailable').hidden = false;
});
cartoon.addEventListener('error', () => {
  if (activeItem && !form.hidden) message('dialog-error', '插画加载失败。可以重新打开详情或重新选择文件。');
});

function releaseUpload() {
  if (uploadURL) URL.revokeObjectURL(uploadURL);
  uploadURL = undefined;
}

function openDialog(mode, heading, trigger) {
  dialogMode = mode;
  returnFocus = trigger;
  activeItem = undefined;
  title.textContent = heading;
  message('dialog-status');
  message('dialog-error');
  uploadPanel.hidden = mode !== 'upload';
  upload.value = '';
  form.hidden = true;
  dialog.showModal();
  title.focus();
}

addButton.addEventListener('click', () => openDialog('upload', '添加衣物', addButton));
byId('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  requestId++;
  releaseUpload();
  original.removeAttribute('src');
  cartoon.removeAttribute('src');
  const target = returnFocus?.isConnected ? returnFocus : addButton;
  target.focus();
});

upload.addEventListener('change', async () => {
  const previousRequest = ++requestId;
  releaseUpload();
  activeItem = undefined;
  form.hidden = true;
  message('dialog-error');
  message('dialog-status');
  const file = upload.files[0];
  if (!file) return;
  let photo;
  message('dialog-status', '正在本地匹配衣物…');
  try {
    photo = await openPhoto(file);
    const item = await provider.match(photo.buffer);
    if (previousRequest !== requestId || !dialog.open) return;
    message('dialog-status');
    if (!item) {
      upload.value = '';
      message('dialog-error', '当前演示版本尚未收录这张衣物照片。请使用素材包中的原始文件。');
      return;
    }
    uploadURL = photo.url;
    setActive(item, uploadURL);
  } catch (error) {
    if (previousRequest === requestId && dialog.open) {
      upload.value = '';
      message('dialog-status');
      message('dialog-error', error.message || '照片读取失败，请换一张照片。');
    }
  } finally {
    if (photo && photo.url !== uploadURL) URL.revokeObjectURL(photo.url);
  }
});

function showDetails(item, trigger) {
  openDialog('details', '衣物详情', trigger);
  setActive(item, item.originalImage);
}

tryOn.addEventListener('click', () => {
  if (dialogMode !== 'details' || getFitInfo(activeItem?.id, role?.id).status !== 'ready') return;
  const destination = new URL('./', window.location.href);
  destination.searchParams.set('tryOn', activeItem.id);
  window.location.assign(destination);
});

function readForm() {
  const data = new FormData(form);
  const split = key => String(data.get(key) ?? '').split(/[、,，]/).map(value => value.trim()).filter(Boolean);
  return {
    name: data.get('name'),
    category: data.get('category'),
    availability: data.get('availability'),
    primaryColor: data.get('primaryColor'),
    secondaryColors: split('secondaryColors'),
    styleTags: split('styleTags'),
    warmthLevel: Number(data.get('warmthLevel')),
    statementLevel: data.get('statementLevel'),
    seasons: data.getAll('seasons'),
  };
}

function finish(content, selectedId) {
  refresh();
  if (selectedId) {
    returnFocus = [...grid.children].find(card => card.dataset.garmentId === selectedId) ?? addButton;
  }
  dialog.close();
  message('wardrobe-status', content);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!activeItem || save.disabled) return;
  message('dialog-error');
  try {
    const { id } = activeItem;
    if (dialogMode === 'upload') {
      if (!store.add(id, readForm())) {
        message('dialog-error', '这件衣物已经在你的衣橱里。');
        return;
      }
      currentCategory = 'all';
      search.value = '';
      finish('已加入我的衣橱。', id);
    } else {
      store.edit(id, readForm());
      finish('衣物信息已保存。', id);
    }
  } catch (error) {
    mutationError(error);
  }
});

remove.addEventListener('click', () => {
  removeCheck.hidden = false;
  byId('cancel-remove').focus();
});
byId('cancel-remove').addEventListener('click', () => {
  removeCheck.hidden = true;
  remove.focus();
});
byId('confirm-remove').addEventListener('click', () => {
  try {
    store.remove(activeItem.id);
    finish('已从个人衣橱删除。');
  } catch (error) {
    mutationError(error);
  }
});

byId('import-samples').addEventListener('click', () => {
  try {
    const count = store.importSamples();
    refresh();
    addButton.focus();
    message('wardrobe-status', '已导入 ' + count + ' 件示例衣物。');
  } catch (error) {
    message('storage-problem', error.message);
  }
});

refresh();
