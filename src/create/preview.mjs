import { mountAvatar } from '../avatar/renderer.mjs';
import { inspectGeneratedLayers } from '../stage1a/alpha.mjs';
import { selectOutfit } from '../wardrobe/selection.mjs';

/** Validate offstage, so an invalid candidate can never replace the workbench. */
export async function preparePreview(element, bundle, { extras = [], strict = true, selection } = {}) {
  const next = element.cloneNode(false);
  const mounted = mountAvatar(next, bundle.avatar, [...bundle.garments, ...extras]);
  const result = await mounted.ready;
  if (!result.ok) throw new Error(result.message);
  const opacityIssue = inspectGeneratedLayers(next, bundle.avatar, bundle.slots);
  if (opacityIssue) throw new Error(opacityIssue);
  if (!strict) return { next, mounted };
  const loaded = [...mounted.garmentLoads.values()];
  await Promise.all(loaded.map(load => load.settled));
  if (bundle.garments.some(item=>mounted.garmentLoads.get(item.id)?.status!=='ready')) {
    throw new Error('分身的试穿素材没有完整加载，请重试。');
  }
  const ready=selection && Object.values(selection).every(id=>!id || mounted.garmentLoads.get(id)?.status==='ready');
  mounted.show(ready ? selection : selectOutfit('casual'));
  return { next, mounted };
}
