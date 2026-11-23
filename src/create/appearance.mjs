import { installCamera } from './camera.mjs';
import { openPhoto, measurement } from './photo.mjs';
import { createModelViewer } from '../3d/viewer.mjs';
import { attachReference, readConfirmedModel } from '../3d/profile.mjs';

const form = document.querySelector('#create-form');
const photoInputs = [...document.querySelectorAll('[data-view]')];
const heightInput = document.querySelector('#height');
const weightInput = document.querySelector('#weight');
const owner = readConfirmedModel();
if (owner?.kind !== 'local') location.replace('./create.html');
const consent = document.querySelector('#consent');
const generate = document.querySelector('#generate');
const regenerate = document.querySelector('#regenerate');
const status = document.querySelector('#create-status');
const progress = document.querySelector('#generation-progress');
const errorBox = document.querySelector('#create-error');
const candidateEmpty = document.querySelector('#candidate-empty');
const source = document.querySelector('#preview-source');
const actions = document.querySelector('#preview-actions');
const meta = document.querySelector('#model-meta');
const approximation = document.querySelector('#approximation-note');
const download = document.querySelector('#download-model');
const autoRotate = document.querySelector('#auto-rotate');
const pendingKey = 'wearmate.3d.reference.' + owner?.id;
installCamera(photoInputs);
const photos = new Map();
let candidate = null;
let configured = false;
let configLoaded = false;
let viewerReady = false;
let checkingPhotos = 0;
let generating = false;
let operation = 0;
let viewer;

function error(message = '') {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function idleStatus() {
  const measures = [[heightInput, '身高'], [weightInput, '体重']];
  const invalid = measures.filter(([input]) => input.validity.badInput || (input.value !== '' && !measurement(input.value)));
  for (const [input] of measures) input.setAttribute('aria-invalid', String(invalid.some(([field]) => field === input)));
  if (!configLoaded) status.textContent = '正在检查云端 3D 服务配置…';
  else if (!configured) status.textContent = '未配置阿里云百炼凭据，照片尚未上传。请在 .env 配置 API Key 和 WorkspaceId 后重启服务。';
  else if (!viewerReady) status.textContent = '当前浏览器无法创建 WebGL 3D 预览。';
  else if (invalid.length) status.textContent = `${invalid.map(([, label]) => label).join('和')}请输入有效的正数。`;
  else if (!photos.has('front')) status.textContent = '请先选择一张正面照片。';
  else if (!consent.checked) status.textContent = '请阅读并同意云端照片上传说明。';
  else if (measures.every(([input]) => measurement(input.value))) status.textContent = photos.size > 1 ? `已选择 ${photos.size} 个视角，可以开始多视图 3D 重建。` : '可以开始单图近似 3D 重建。';
  else status.textContent = '照片已就绪，请填写身高和体重。';
}

function refreshForm() {
  generate.hidden = Boolean(candidate);
  generate.disabled = owner?.kind !== 'local' || generating || checkingPhotos > 0 || !configured || !viewerReady || !photos.has('front')
    || !consent.checked || !measurement(heightInput.value) || !measurement(weightInput.value);
  regenerate.disabled = generate.disabled;
  for (const input of [...photoInputs, consent, ...document.querySelectorAll('[data-camera]')]) input.disabled = generating;
  form.setAttribute('aria-busy', String(generating || checkingPhotos > 0));
}

function clearCandidate() {
  candidate = null;
  viewer?.clear();
  candidateEmpty.hidden = false;
  source.hidden = true;
  actions.hidden = true;
  regenerate.hidden = true;
  approximation.hidden = true;
  autoRotate.setAttribute('aria-pressed', 'false');
  viewer?.setAutoRotate(false);
  meta.textContent = '尚未生成模型。';
  refreshForm();
}

function clearPhoto(view) {
  const previous = photos.get(view);
  if (previous) URL.revokeObjectURL(previous.url);
  photos.delete(view);
  const preview = document.querySelector(`[data-preview="${view}"]`);
  preview.removeAttribute('src');
  preview.hidden = true;
}

for (const input of photoInputs) {
  let revision = 0;
  input.addEventListener('change', async () => {
    const view = input.dataset.view;
    const request = ++revision;
    operation++;
    clearCandidate();
    clearPhoto(view);
    error();
    const file = input.files[0];
    if (!file) { idleStatus(); refreshForm(); return; }
    checkingPhotos++;
    status.textContent = '正在检查照片…';
    refreshForm();
    try {
      const selected = await openPhoto(file);
      if (!['image/jpeg', 'image/png'].includes(selected.type)) {
        URL.revokeObjectURL(selected.url);
        throw new Error('云端上传支持 JPEG 或 PNG，请转换照片格式后重试。');
      }
      if (request !== revision) { URL.revokeObjectURL(selected.url); return; }
      photos.set(view, selected);
      const preview = document.querySelector(`[data-preview="${view}"]`);
      preview.src = selected.url;
      preview.hidden = false;
      idleStatus();
    } catch (failure) {
      if (request === revision) {
        input.value = '';
        error(failure.message);
        idleStatus();
      }
    } finally {
      checkingPhotos--;
      refreshForm();
    }
  });
}

for (const input of [heightInput, weightInput]) {
  input.addEventListener('input', () => {
    clearCandidate();
    error();
    idleStatus();
    refreshForm();
  });
}
consent.addEventListener('change', () => { idleStatus(); refreshForm(); });

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

async function api(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `请求失败（HTTP ${response.status}）。`);
  return payload;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function showCandidate(record, request) {
  const stats = await viewer.load(record.modelUrl);
  if (request !== operation) return;
  candidate = record;
  candidateEmpty.hidden = true;
  source.textContent = `阿里云百炼 Tripo · ${record.approximate ? '单图近似重建' : `${record.views.length} 视角重建`}`;
  source.hidden = false;
  approximation.hidden = !record.approximate;
  meta.textContent = `${record.heightCm} cm / ${record.weightKg} kg · ${stats.triangles.toLocaleString('zh-CN')} 个三角面 · 拖动旋转，滚轮缩放`;
  download.href = record.modelUrl;
  download.download = `wearmate-${record.id}.glb`;
  actions.hidden = false;
  regenerate.hidden = !photos.has('front');
  progress.hidden = true;
  status.textContent = '真实 GLB 模型已生成并保存在本机私密目录。';
  refreshForm();
  document.querySelector('#preview-title').focus();
}

async function followTask(id, request) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (request === operation && Date.now() < deadline) {
    const record = await api(`/api/3d/models/${id}`);
    if (request !== operation) return;
    progress.value = record.progress || 0;
    status.textContent = record.status === 'running'
      ? `云端正在重建几何与贴图：${record.progress || 0}%…`
      : '任务已排队，云端 GPU 正在准备…';
    if (record.status === 'success') {
      await showCandidate(record, request);
      return;
    }
    if (record.status === 'failed') { sessionStorage.removeItem(pendingKey); throw new Error(record.error || '云端 3D 生成失败。'); }
    await wait(2200);
  }
  if (request === operation) throw new Error('等待生成超时。任务仍保留在云端，请稍后刷新页面继续查询。');
}

async function runGeneration(id = null) {
  if (generating) return;
  clearCandidate();
  error();
  const request = ++operation;
  generating = true;
  progress.value = 0;
  progress.hidden = false;
  status.textContent = id ? '正在恢复上次生成任务…' : '正在将所选照片安全上传至阿里云百炼…';
  refreshForm();
  try {
    let taskId = id;
    if (!taskId) {
      const selected = [...photos.entries()].map(([view, photo]) => ({ view, type: photo.type, data: base64(photo.buffer) }));
      const record = await api('/api/3d/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heightCm: measurement(heightInput.value), weightKg: measurement(weightInput.value),
          consent: consent.checked, photos: selected,
        }),
      });
      taskId = record.id;
    }
    try { sessionStorage.setItem(pendingKey, taskId); } catch {}
    await followTask(taskId, request);
  } catch (failure) {
    if (request === operation) {
      progress.hidden = true;
      status.textContent = '本次未能完成 3D 预览。';
      error(failure.message);
    }
  } finally {
    if (request === operation) {
      generating = false;
      refreshForm();
    }
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!generate.disabled) runGeneration();
});
regenerate.addEventListener('click', () => { if (!regenerate.disabled) runGeneration(); });
document.querySelector('#reset-view').addEventListener('click', () => viewer.reset());
autoRotate.addEventListener('click', () => {
  const active = autoRotate.getAttribute('aria-pressed') !== 'true';
  autoRotate.setAttribute('aria-pressed', String(active));
  viewer.setAutoRotate(active);
});
document.querySelector('#confirm').addEventListener('click', () => {
  if (!candidate || generating) return;
  try {
    attachReference(owner.id, candidate.id);
    sessionStorage.removeItem(pendingKey);
    location.assign('./?view=reference');
  } catch {
    error('无法关联参考，请确认当前分身仍有效，并允许浏览器会话存储。');
  }
});

try {
  viewer = createModelViewer(document.querySelector('#candidate-viewer'));
  viewerReady = true;
} catch {
  error('无法初始化 WebGL。请使用支持硬件加速的现代浏览器。');
}

if (owner) {
  heightInput.value = owner.heightCm;
  weightInput.value = owner.weightKg;
}
for (const input of photoInputs) {
  if (input.files.length) input.dispatchEvent(new Event('change'));
}
try {
  const config = await api('/api/3d/config');
  configured = config.configured;
  configLoaded = true;
  idleStatus();
  const pending = sessionStorage.getItem(pendingKey);
  if (pending && configured && viewerReady) await runGeneration(pending);
} catch (failure) {
  configLoaded = true;
  error(failure.message);
} finally {
  refreshForm();
}

window.addEventListener('pagehide', () => {
  operation++;
  for (const view of [...photos.keys()]) clearPhoto(view);
  viewer?.dispose();
});

window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
