import { createModelViewer } from '../3d/viewer.mjs';
import { garmentCatalog, garmentGroups } from '../3d/garments.mjs';
import { readConfirmedModel } from '../3d/profile.mjs';

const profile = readConfirmedModel();
document.querySelector('#face-editor-link').hidden=profile?.kind!=='local';
const empty = document.querySelector('#tryon-empty');
const status = document.querySelector('#tryon-status');
const errorBox = document.querySelector('#tryon-error');
const state = document.querySelector('#tryon-state');
const summary = document.querySelector('#tryon-summary');
const reset = document.querySelector('#tryon-reset');
const rotate = document.querySelector('#tryon-rotate');
const removeAll = document.querySelector('#remove-all');
const groups = document.querySelector('#garment-groups');
const worn = new Map();
const buttons = new Map();
let viewer;
let busy = false;
let ready = false;

function error(message = '') {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function refresh() {
  for (const [id, button] of buttons) {
    const item = garmentCatalog.find(garment => garment.id === id);
    button.setAttribute('aria-pressed', String(worn.get(item.slot) === id));
    button.disabled = busy || !ready;
  }
  reset.disabled = !ready;
  rotate.disabled = !ready;
  removeAll.disabled = busy || !worn.size;
  const names = [...new Set([...worn.values()])].map(id => garmentCatalog.find(item => item.id === id).name);
  summary.textContent = names.length ? names.join('、') : '原始人物 · 尚未选择服装';
}

for (const group of garmentGroups) {
  const section = document.createElement('section');
  section.className = 'garment-group';
  const title = document.createElement('h3');
  title.textContent = group.label;
  const list = document.createElement('div');
  list.className = 'garment-options';
  for (const item of garmentCatalog.filter(garment => group.categories.includes(garment.category))) {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = true;
    button.className = 'garment-option';
    button.dataset.garment = item.id;
    button.setAttribute('aria-pressed', 'false');
    const swatch = document.createElement('span');
    swatch.className = 'garment-swatch';
    swatch.style.setProperty('--swatch', item.color);
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = item.name;
    button.append(swatch, label);
    button.addEventListener('click', () => toggleGarment(item));
    buttons.set(item.id, button);
    list.append(button);
  }
  section.append(title, list);
  groups.append(section);
}

async function toggleGarment(item) {
  if (busy || !ready) return;
  busy = true;
  refresh();
  error();
  const removing = worn.get(item.slot) === item.id;
  try {
    const conflicts = new Set(item.occupies.map(slot => worn.get(slot)).filter(Boolean));
    const stats = removing ? null : await viewer.wear(item);
    if (!removing && !stats) return;
    for (const id of conflicts) {
      const old = garmentCatalog.find(entry => entry.id === id);
      if (removing || old.slot !== item.slot) viewer.removeGarment(old.slot);
      for (const slot of old.occupies) worn.delete(slot);
    }
    if (!removing) {
      for (const slot of item.occupies) worn.set(slot, item.id);
      state.textContent = '3D 服装已加载';
      status.textContent = `${item.name}：${stats.triangles.toLocaleString('zh-CN')} 个三角面，可与人物一起旋转检查。`;
    } else {
      state.textContent = '已脱下服装';
      status.textContent = `已脱下${item.name}。`;
    }
  } catch (failure) {
    error(`服装加载失败：${failure.message}`);
    status.textContent = '请重试，或先更换 3D 人物。';
  } finally {
    busy = false;
    refresh();
  }
}

removeAll.addEventListener('click', () => {
  if (!viewer) return;
  for (const slot of ['top', 'bottom', 'outerwear', 'shoes']) viewer.removeGarment(slot);
  worn.clear();
  state.textContent = '原始人物';
  status.textContent = '已移除全部独立服装网格。';
  refresh();
});
reset.addEventListener('click', () => viewer?.reset());
rotate.addEventListener('click', () => {
  const active = rotate.getAttribute('aria-pressed') !== 'true';
  rotate.setAttribute('aria-pressed', String(active));
  viewer?.setAutoRotate(active);
});

try {
  viewer = createModelViewer(document.querySelector('#tryon-viewer'));
} catch {
  error('当前浏览器无法初始化 WebGL，请启用硬件加速或更换现代浏览器。');
}

if (!profile) {
  empty.innerHTML = '尚未创建 3D 分身<br>请先创建并确认试衣分身';
  state.textContent = '缺少 3D 人物';
  status.textContent = '先创建并确认 3D 分身，再返回此页选择服装。';
} else if (viewer) {
  try {
    const stats = await viewer.load(profile.modelUrl, profile);
    ready = true;
    empty.hidden = true;
    state.textContent = '人物已就绪';
    status.textContent = `人物网格 ${stats.triangles.toLocaleString('zh-CN')} 个三角面。请选择服装开始静态 3D 试穿。`;
    if (profile.approximate) error('当前人物来自单图近似重建；若原照片不是全身照，缺失的腿部和脚部无法通过服装网格恢复。');
  } catch (failure) {
    empty.textContent = '3D 人物加载失败';
    state.textContent = '人物不可用';
    status.textContent = '请重新生成人物，或确认本机私密模型仍然存在。';
    error(`人物加载失败：${failure.message}`);
  }
}
refresh();
window.addEventListener('pagehide', () => viewer?.dispose());

window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
