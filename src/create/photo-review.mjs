import { openPhoto } from './photo.mjs';
import { analyzePhoto, PhotoQualityError } from './silhouette.mjs';
import { SubjectMaskError } from './contour.mjs';

export const viewLabels = { front: '正面照', side: '侧面照' };
export const stateLabels = { empty: '待添加', checking: '检查中', ready: '可用', retake: '需重拍', retry: '本地检测未完成' };

function sameBytes(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  const left = new Uint8Array(a), right = new Uint8Array(b);
  return left.every((byte, i) => byte === right[i]);
}

export function createPhotoReview(changed, read = openPhoto, analyze = analyzePhoto) {
  const slots = new Map();
  let sequence = 0, duplicate = false;
  function get(view) {
    const slot = slots.get(view) ?? { state: 'empty' };
    if (duplicate) {
      const other = slots.get(view === 'front' ? 'side' : 'front');
      // Keep the accepted view. When both pass (or neither has passed), keep the first selection.
      const ready = slot.state === 'ready', otherReady = other.state === 'ready';
      if (ready === otherReady ? slot.order > other.order : otherReady) {
        return { ...slot, state: 'retake', sections: null, contour: null, detail: '与另一视角使用了同一文件，请在这里另拍或选择对应角度的照片。' };
      }
    }
    return slot;
  }
  async function check(view, slot) {
    slot.state = 'checking';
    slot.detail = '';
    changed();
    try {
      const { sections, contour, advice } = await analyze(slot.photo, view);
      if (slots.get(view) !== slot) return;
      Object.assign(slot, { state: 'ready', sections, contour, detail: advice });
    } catch (error) {
      if (slots.get(view) !== slot) return;
      if (error instanceof PhotoQualityError || error instanceof SubjectMaskError) Object.assign(slot, { state: 'retake', detail: error.message });
      else Object.assign(slot, { state: 'retry', detail: '照片已保留，请点击重试检测。' });
    }
    changed();
  }
  async function select(view, file) {
    const previous = slots.get(view);
    if (previous?.photo) URL.revokeObjectURL(previous.photo.url);
    const slot = { order: ++sequence, state: file ? 'checking' : 'empty' };
    slots.set(view, slot);
    duplicate = false;
    changed();
    if (!file) return;
    try {
      const photo = await read(file, ['image/jpeg', 'image/png']);
      if (slots.get(view) !== slot) { URL.revokeObjectURL(photo.url); return; }
      slot.photo = photo;
      const other = slots.get(view === 'front' ? 'side' : 'front');
      duplicate = sameBytes(photo.buffer, other?.photo?.buffer);
    } catch (error) {
      if (slots.get(view) !== slot) return;
      Object.assign(slot, { state: 'retake', detail: error.message });
      changed();
      return;
    }
    await check(view, slot);
  }
  return {
    get, select,
    retry(view) {
      if (get(view).state === 'retry') return check(view, slots.get(view));
    },
    dispose() {
      for (const slot of slots.values()) if (slot.photo) URL.revokeObjectURL(slot.photo.url);
      slots.clear();
      duplicate = false;
    },
  };
}
