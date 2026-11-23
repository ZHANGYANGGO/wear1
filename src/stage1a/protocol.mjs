import { mila } from '../avatar/config.mjs';
import { validateAvatar } from '../avatar/validation.mjs';

export const profileVersion = 1;
export const bodyTemplate = 'wearmate-front-560x1536-v1';

/** Adapt an already registered layer set to the existing renderer. */
export function adaptGeneratedProfile(profile, garments) {
  if (profile?.version !== profileVersion || profile.template !== bodyTemplate) {
    return { ok: false, message: '此角色的图层版本或身体模板未获验证。' };
  }
  const { id, label, width, height, anchors, baseLayers } = profile;
  const avatar = { id, label, width, height, anchors, baseLayers };
  const issue = validateAvatar(avatar, garments);
  if (issue) return { ok: false, message: issue };
  if (width !== mila.width || height !== mila.height) {
    return { ok: false, message: '角色画布与现有衣物的 560×1536 模板不一致。' };
  }
  for (const [name, [x, y]] of Object.entries(mila.anchors)) {
    if (anchors[name]?.[0] !== x || anchors[name]?.[1] !== y) {
      return { ok: false, message: `角色锚点「${name}」尚未与现有衣物对齐。` };
    }
  }
  const slotsMatch = baseLayers.length === mila.baseLayers.length
    && mila.baseLayers.every(slot => baseLayers.some(layer => layer.id === slot.id && layer.layer === slot.layer));
  if (!slotsMatch) {
    return { ok: false, message: '角色需要脚踝、头脸及手臂三个已注册的独立图层。' };
  }
  if (new Set(baseLayers.map(layer => layer.image)).size !== baseLayers.length) {
    return { ok: false, message: '角色的三个图层需要各自独立的素材。' };
  }
  return { ok: true, avatar };
}
