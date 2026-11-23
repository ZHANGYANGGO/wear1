import { createModelViewer } from './3d/viewer.mjs';
import { readConfirmedModel } from './3d/profile.mjs';
import { tiers } from './3d/fitting.mjs';
import { downloadBody } from './3d/download.mjs';

const profile = readConfirmedModel();
const local = profile?.kind === 'local';
const byId = id => document.getElementById(id);
const toggle = byId('switch-model');
const error = byId('studio-error');
const empty = byId('avatar-empty');
const status = byId('studio-status');
const download = byId('studio-download');
const reset = byId('studio-reset');
const rotate = byId('studio-rotate');
let viewer, reference = false;
try { viewer = createModelViewer(byId('avatar-viewer')); }
catch { error.textContent = '请启用浏览器 WebGL 硬件加速。'; error.hidden = false; }

async function show(asReference) {
  if (!viewer || !profile) return;
  reference = asReference;
  toggle.disabled = reset.disabled = rotate.disabled = true;
  error.hidden = true;
  download.hidden = true;
  empty.hidden = false;
  empty.textContent = '正在读取模型…';
  const isBody = local && !reference;
  const url = reference ? '/api/3d/models/' + profile.referenceId + '/file.glb' : profile.modelUrl;
  try {
    const stats = await viewer.load(url, isBody ? profile : {});
    empty.hidden = true;
    reset.disabled = rotate.disabled = false;
    download.hidden = false;
    download.textContent = isBody ? '下载人台 GLB' : '下载参考 GLB';
    download.onclick = async () => {
      try {
        if (isBody) await downloadBody(viewer, profile.id);
        else {
          const link = document.createElement('a');
          link.href = url; link.download = 'wearmate-' + (reference ? profile.referenceId : profile.id) + '.glb'; link.click();
        }
      } catch (failure) { error.textContent = failure.message; error.hidden = false; }
    };
    byId('model-state').textContent = isBody ? '试衣分身已就绪' : '外观模型已就绪';
    byId('model-summary').textContent = stats.triangles.toLocaleString() + ' 个三角面';
    byId('stage-role-name').textContent = isBody ? '试衣分身' : '外观参考';
    byId('stage-role-type').textContent = isBody ? '本地参数化人体' : '云端生成';
    status.textContent = '拖动旋转，滚轮缩放。';
  } catch (failure) {
    viewer.clear();
    byId('model-state').textContent = '模型不可用';
    empty.textContent = '模型读取失败';
    error.textContent = failure.message;
    error.hidden = false;
    status.textContent = reference ? '可切回本地试衣分身。' : '请检查模型文件或重新创建。';
  } finally {
    toggle.textContent = reference ? '返回试衣分身' : '查看外观参考';
    toggle.disabled = false;
  }
}
if (profile) {
  byId('profile-format').textContent = 'GLB / glTF 2.0';
  byId('profile-height').textContent = profile.heightCm + ' cm';
  byId('profile-weight').textContent = profile.weightKg + ' kg';
  byId('profile-method').textContent = local ? tiers[profile.tier] : '历史云端分身';
  byId('studio-approximation').hidden = local || !profile.approximate;
  byId('reference-panel').hidden = !local;
  toggle.hidden = !profile.referenceId;
  toggle.onclick = () => show(!reference);
  await show(Boolean(local && profile.referenceId && new URLSearchParams(location.search).get('view') === 'reference'));
} else { empty.textContent = '尚未创建试衣分身'; }
reset.onclick = () => viewer?.reset();
rotate.onclick = () => {
  const active = rotate.getAttribute('aria-pressed') !== 'true';
  rotate.setAttribute('aria-pressed', String(active)); viewer?.setAutoRotate(active);
};
window.addEventListener('pagehide', () => viewer?.dispose());

window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
