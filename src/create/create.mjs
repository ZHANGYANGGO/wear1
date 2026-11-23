import { createModelViewer } from '../3d/viewer.mjs';
import { fitBody, tiers } from '../3d/fitting.mjs';
import { confirmModel, readConfirmedModel } from '../3d/profile.mjs';
import { downloadBody } from '../3d/download.mjs';
import { openPhoto } from './photo.mjs';
import { installCamera } from './camera.mjs';
import { analyzePhoto } from './silhouette.mjs';

const byId = id => document.getElementById(id);
const form = byId('create-form');
const inputs = [...form.querySelectorAll('[data-view]')];
const photos = new Map();
const status = byId('create-status');
const error = byId('create-error');
let revision = 0, busy = false, checking = 0, candidate, viewer;
const previous = readConfirmedModel();
if (previous) {
  byId('height').value = previous.heightCm;
  byId('weight').value = previous.weightKg;
}
try { viewer = createModelViewer(byId('candidate-viewer')); }
catch { status.textContent = '请在支持 WebGL 的浏览器中启用硬件加速。'; }
const guides = {
  quick: '使用身高和体重估计体型，可调节肩宽、腰腹和臀部。',
  photos: '两张照片仅在本页分析。宽松服装会影响轮廓估计。',
  measured: '在自然站立时用软尺测量三处围度，水平绕一圈。围度将约束双视角拟合结果。',
  appearance: '先用正侧面照建立试衣分身，围度可选。确认后可另选清晰正脸等参考照，自主决定是否提交云端增强。',
};
function refresh() {
  byId('generate').disabled = !viewer || busy || checking > 0;
  byId('confirm').disabled = !candidate || busy;
}
function invalidate() {
  revision++;
  candidate = null;
  viewer?.clear();
  byId('candidate-empty').hidden = false;
  byId('preview-actions').hidden = true;
  byId('preview-source').hidden = true;
  byId('model-meta').textContent = '尚未生成模型。';
  if (viewer) status.textContent = '';
  error.hidden = true;
  refresh();
}
function updateTier() {
  const tier = form.elements.tier.value;
  for (const [id, show] of [['adjustments', tier === 'quick'], ['local-photos', tier !== 'quick'], ['girths', ['measured','appearance'].includes(tier)]]) {
    byId(id).hidden = !show;
    byId(id).disabled = !show;
  }
  for (const input of byId('girths').querySelectorAll('input')) input.required = tier === 'measured';
  byId('tier-guide').textContent = guides[tier];
  byId('confirm').textContent = tier === 'appearance' ? '确认分身，查看外观增强选项' : '在工作台使用';
}
form.addEventListener('input', event => {
  invalidate();
  if (event.target.name === 'tier') updateTier();
  if (event.target.type === 'range') event.target.nextElementSibling.value = event.target.value + '%';
});
installCamera(inputs);
for (const input of inputs) {
  let version = 0;
  input.addEventListener('change', async () => {
    const current = ++version, key = input.dataset.view;
    invalidate();
    const old = photos.get(key);
    if (old) URL.revokeObjectURL(old.url);
    photos.delete(key);
    const preview = form.querySelector('[data-preview="' + key + '"]');
    preview.hidden = true;
    preview.removeAttribute('src');
    const file = input.files[0];
    if (!file) return;
    checking++;
    refresh();
    try {
      const photo = await openPhoto(file);
      if (current !== version) { URL.revokeObjectURL(photo.url); return; }
      if (!['image/jpeg','image/png'].includes(photo.type)) {
        URL.revokeObjectURL(photo.url);
        throw new Error('请选择 JPEG 或 PNG 照片。');
      }
      photos.set(key, photo);
      preview.src = photo.url;
      preview.hidden = false;
    } catch (failure) {
      if (current === version) { input.value = ''; error.textContent = failure.message; error.hidden = false; }
    } finally { checking--; refresh(); }
  });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || checking || !viewer || !form.reportValidity()) return;
  invalidate();
  const current = revision;
  const data = new FormData(form);
  const tier = data.get('tier');
  const optional = name => data.get(name) ? Number(data.get(name)) : null;
  const input = {
    tier, heightCm: byId('height').valueAsNumber, weightKg: byId('weight').valueAsNumber,
    girths: { chest: optional('chest'), waist: optional('waistGirth'), hips: optional('hipGirth') },
    adjust: Object.fromEntries(['shoulders','waist','hips'].map(key => [key, Number(data.get(key))])), views: {},
  };
  busy = true;
  refresh();
  try {
    if (tier !== 'quick') {
      for (const key of ['front','side']) {
        const photo = photos.get(key);
        if (!photo) throw new Error('请提供正面和侧面全身照。');
        status.textContent = key === 'front' ? '正在本地分析正面轮廓…' : '正在本地分析侧面轮廓…';
        await new Promise(resolve => setTimeout(resolve, 30));
        photo.sections ??= await analyzePhoto(photo, key);
        if (revision !== current) return;
        input.views[key] = photo.sections;
      }
    }
    const record = fitBody(input);
    status.textContent = '正在拟合人体模板…';
    const stats = await viewer.load(null, record);
    if (current !== revision) return;
    candidate = record;
    byId('candidate-empty').hidden = true;
    byId('preview-source').textContent = tiers[tier] + ' · 本地';
    byId('preview-source').hidden = false;
    byId('model-meta').textContent = record.heightCm + ' cm / ' + record.weightKg + ' kg · ' + stats.triangles.toLocaleString() + ' 个三角面';
    byId('preview-actions').hidden = false;
    status.textContent = '本地分身已就绪，可旋转检查后确认。';
    byId('preview-title').focus();
  } catch (failure) {
    if (revision === current) { error.textContent = failure.message; error.hidden = false; status.textContent = '请调整输入后重试。'; }
  } finally { busy = false; refresh(); }
});
byId('confirm').onclick = () => {
  if (!candidate) return;
  try { confirmModel(candidate); location.assign(candidate.tier === 'appearance' ? './#reference-panel' : './'); }
  catch { error.textContent = '无法保存分身，请允许浏览器会话存储。'; error.hidden = false; }
};
byId('reset-view').onclick = () => viewer?.reset();
byId('auto-rotate').onclick = event => {
  const button = event.currentTarget, active = button.getAttribute('aria-pressed') !== 'true';
  viewer?.setAutoRotate(active); button.setAttribute('aria-pressed', String(active));
};
byId('download-model').onclick = async () => {
  if (!candidate) return;
  try { await downloadBody(viewer, candidate.id); }
  catch (failure) { error.textContent = failure.message; error.hidden = false; }
};
window.addEventListener('pagehide', () => {
  revision++;
  for (const photo of photos.values()) URL.revokeObjectURL(photo.url);
  viewer?.dispose();
});
updateTier();
refresh();

window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
