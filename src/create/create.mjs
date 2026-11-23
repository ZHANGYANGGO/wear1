import { openPhoto, measurement } from './photo.mjs';
import { avatarProvider, confirmProfile, readConfirmedProfile } from './profiles.mjs';
import { preparePreview } from './preview.mjs';

const form = document.querySelector('#create-form');
const photoInput = document.querySelector('#photo');
const heightInput = document.querySelector('#height');
const weightInput = document.querySelector('#weight');
const generate = document.querySelector('#generate');
const status = document.querySelector('#create-status');
const errorBox = document.querySelector('#create-error');
const photoPreview = document.querySelector('#uploaded-preview');
const photoEmpty = document.querySelector('#photo-empty');
const candidateEmpty = document.querySelector('#candidate-empty');
const source = document.querySelector('#preview-source');
const actions = document.querySelector('#preview-actions');
let candidateStage = document.querySelector('#candidate-avatar');
let photo = null;
let candidate = null;
let checkingPhoto = false;
let generating = false;
let lastUpload = 0;
let lastGeneration = 0;
const previousProfile = readConfirmedProfile();
if (previousProfile) {
  heightInput.value = previousProfile.heightCm;
  weightInput.value = previousProfile.weightKg;
}

function error(message = '') {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function clearPhoto() {
  if (photo) URL.revokeObjectURL(photo.url);
  photo = null;
  photoPreview.removeAttribute('src');
  photoPreview.hidden = true;
  photoEmpty.hidden = false;
}

function clearCandidate() {
  candidate = null;
  candidateStage.replaceChildren();
  candidateStage.hidden = true;
  candidateEmpty.hidden = false;
  source.hidden = true;
  actions.hidden = true;
}

function refreshForm() {
  generate.hidden = !!candidate;
  generate.disabled = generating || checkingPhoto || !photo
    || !measurement(heightInput.value) || !measurement(weightInput.value);
  for (const input of [photoInput, heightInput, weightInput]) input.disabled = generating;
  form.setAttribute('aria-busy', String(generating || checkingPhoto));
}

function idleStatus() {
  const measures = [[heightInput, '身高'], [weightInput, '体重']];
  const invalid = measures.filter(([input]) => input.validity.badInput
    || (input.value !== '' && !measurement(input.value)));
  for (const [input] of measures) input.setAttribute('aria-invalid', String(invalid.some(([field]) => field === input)));
  if (invalid.length) status.textContent = `${invalid.map(([, label]) => label).join('和')}请输入有效的正数。`;
  else if (!photo) status.textContent = '选择照片并填写两项数值。';
  else if (measures.every(([input]) => measurement(input.value))) status.textContent = '信息已齐全，可以创建分身。';
  else status.textContent = '照片已就绪。填写身高和体重后可预览分身。';
}

photoInput.addEventListener('change', async () => {
  const request = ++lastUpload;
  clearCandidate();
  clearPhoto();
  error();
  const file = photoInput.files[0];
  checkingPhoto = !!file;
  refreshForm();
  if (!file) { idleStatus(); return; }
  status.textContent = '正在检查照片…';
  try {
    const selected = await openPhoto(file);
    if (request !== lastUpload) { URL.revokeObjectURL(selected.url); return; }
    photo = selected;
    photoPreview.src = photo.url;
    photoPreview.hidden = false;
    photoEmpty.hidden = true;
    idleStatus();
  } catch (failure) {
    if (request !== lastUpload) return;
    photoInput.value = '';
    status.textContent = '请重新选择照片。';
    error(failure.message);
  } finally {
    if (request === lastUpload) {
      checkingPhoto = false;
      refreshForm();
    }
  }
});

for (const input of [heightInput, weightInput]) {
  input.addEventListener('input', () => {
    clearCandidate();
    error();
    idleStatus();
    refreshForm();
  });
}

async function buildCandidate() {
  if (generating || checkingPhoto || !photo
    || !measurement(heightInput.value) || !measurement(weightInput.value)) return;
  clearCandidate();
  error();
  const request = ++lastGeneration;
  generating = true;
  status.textContent = '正在准备分身…';
  candidateEmpty.textContent = '正在准备分身…';
  refreshForm();
  try {
    const heightCm = measurement(heightInput.value);
    const weightKg = measurement(weightInput.value);
    const bundle = await avatarProvider.resolve({ photo: photo.buffer, heightCm, weightKg });
    if (request !== lastGeneration) return;
    const { next } = await preparePreview(candidateStage, bundle);
    if (request !== lastGeneration) return;
    candidateStage.replaceWith(next);
    candidateStage = next;
    candidateStage.hidden = false;
    candidateEmpty.hidden = true;
    candidate = { id: bundle.id, heightCm, weightKg };
    source.textContent = bundle.sourceLabel;
    source.hidden = false;
    actions.hidden = false;
    status.textContent = '本地预览已就绪。确认后可进入穿搭工作台。';
    document.querySelector('#preview-title').focus();
  } catch (failure) {
    if (request === lastGeneration) {
      status.textContent = '';
      error(failure.message);
    }
  } finally {
    if (request === lastGeneration) {
      generating = false;
      candidateEmpty.textContent = '全身分身将在这里显示';
      refreshForm();
    }
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  buildCandidate();
});
document.querySelector('#regenerate').addEventListener('click', buildCandidate);
document.querySelector('#confirm').addEventListener('click', () => {
  if (!candidate || generating) return;
  try {
    confirmProfile(candidate);
    location.assign('./');
  } catch {
    error('此浏览器未允许保存本次分身。请允许此站点使用会话存储后重试。');
  }
});
window.addEventListener('pagehide', () => {
  lastUpload++;
  lastGeneration++;
  clearPhoto();
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  photoInput.value = '';
  checkingPhoto = false;
  generating = false;
  clearCandidate();
  candidateEmpty.textContent = '全身分身将在这里显示';
  error();
  idleStatus();
  refreshForm();
});
