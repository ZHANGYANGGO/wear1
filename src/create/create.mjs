import { createModelViewer } from '../3d/viewer.mjs';
import { fitBody, tiers } from '../3d/fitting.mjs';
import { confirmModel, readConfirmedModel } from '../3d/profile.mjs';
import { downloadBody } from '../3d/download.mjs';
import { installCamera } from './camera.mjs';
import { createPhotoReview, viewLabels, stateLabels } from './photo-review.mjs';
import { originalPoint } from './contour.mjs';

const byId = id => document.getElementById(id);
const form = byId('create-form');
const inputs = [...form.querySelectorAll('[data-view]')];
const review = createPhotoReview(renderPhotos);
const status = byId('create-status');
const error = byId('create-error');
let revision = 0, busy = false, candidate, viewer;
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
  const reasons = [];
  if (form.elements.tier.value !== 'quick') {
    for (const input of inputs) {
      const view = input.dataset.view;
      const { state } = review.get(view);
      if (state !== 'ready') reasons.push(viewLabels[view] + stateLabels[state]);
    }
  }
  if (!byId('height').validity.valid || !byId('weight').validity.valid) reasons.push('请填写有效的身高和体重');
  if (byId('girths').querySelector('input:invalid')) reasons.push('请检查胸围、腰围和臀围');
  const guide = reasons.join('，');
  if (byId('generate-guide').textContent !== guide) byId('generate-guide').textContent = guide;
  byId('generate').disabled = !viewer || busy || reasons.length > 0;
  byId('confirm').disabled = !candidate || busy;
}
function renderPhotos() {
  for (const input of inputs) {
    const view = input.dataset.view;
    const { state, detail, photo, contour } = review.get(view);
    const preview = form.querySelector('[data-preview="' + view + '"]');
    preview.hidden = !photo;
    if (!photo) preview.removeAttribute('src');
    else if (preview.src !== photo.url) preview.src = photo.url;
    const overlay = form.querySelector('[data-contour="' + view + '"]');
    overlay.hidden = !contour;
    if (!contour) overlay.open = false;
    const result = byId(view + '-result');
    const message = [viewLabels[view], stateLabels[state], detail].filter(Boolean).join(' · ');
    result.dataset.state = state;
    if (result.textContent !== message) result.textContent = message;
    form.querySelector('[data-retry="' + view + '"]').hidden = state !== 'retry';
  }
  refresh();
}

function drawContour(view) {
  const overlay = form.querySelector('[data-contour="' + view + '"]');
  const { contour } = review.get(view);
  const img = form.querySelector('[data-preview="' + view + '"]');
  if (!overlay.open || !contour || !img.naturalWidth) return;
  const canvas = overlay.querySelector('canvas'), { frame, rows, issues } = contour;
  const scale = Math.min(1, 640 / Math.max(frame.originalWidth, frame.originalHeight));
  canvas.width = Math.round(frame.originalWidth * scale) || 1;
  canvas.height = Math.round(frame.originalHeight * scale) || 1;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const sx = canvas.width / frame.originalWidth, sy = canvas.height / frame.originalHeight;
  const axis = originalPoint(frame, 1, 0), foot = originalPoint(frame, 0, 0);
  ctx.fillStyle = '#4767ce';
  ctx.fillRect(axis.x * sx, axis.y * sy, 1, (foot.y - axis.y) * sy);
  for (const [i, [h, left, right]] of rows.entries()) {
    if (left === null) continue;
    const y = frame.top + i;
    ctx.fillStyle = issues.some(r => y >= r.fromRow && y <= r.toRow) ? '#eb9000' : '#00cfc1';
    for (const offset of [left, right]) {
      const p = originalPoint(frame, h, offset);
      ctx.fillRect(p.x * sx - 1, p.y * sy, 2, Math.max(1, canvas.height / frame.maskHeight));
    }
  }
  let note = '蓝线为参考轴，青色为可见边界，橙色为有遮挡或不确定的行段。';
  if (view === 'side') note += contour.direction
    ? ' 腹侧在画面' + (contour.direction.anterior === 'left' ? '左' : '右') + '侧。' : ' 腹背朝向待定。';
  overlay.querySelector('small').textContent = note;
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
  if (event.target.type === 'file') return; // The change handler also handles camera captures.
  if (event.target.name === 'tier') updateTier();
  invalidate();
  if (event.target.type === 'range') event.target.nextElementSibling.value = event.target.value + '%';
});
installCamera(inputs);
for (const input of inputs) {
  const view = input.dataset.view;
  form.querySelector('[data-contour="' + view + '"]').ontoggle = () => drawContour(view);
  form.querySelector('[data-preview="' + view + '"]').onload = () => drawContour(view);
  form.querySelector('[data-retry="' + view + '"]').onclick = () => review.retry(view);
  input.addEventListener('change', () => {
    invalidate();
    review.select(view, input.files[0]);
  });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (byId('generate').disabled || !form.reportValidity()) return;
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
      for (const view of ['front','side']) input.views[view] = review.get(view).sections;
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
  review.dispose();
  viewer?.dispose();
});
updateTier();
renderPhotos();

window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
