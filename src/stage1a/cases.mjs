import { mila } from '../avatar/config.mjs';
import { bodyTemplate, profileVersion } from './protocol.mjs';

function asset(id, part) {
  return new URL(`../../assets/stage1a/${id}-${part}.webp`, import.meta.url).href;
}

function generatedCase(id, label, features) {
  return {
    id,
    label,
    features,
    reference: asset(id, 'reference'),
    profile: {
      version: profileVersion,
      template: bodyTemplate,
      id,
      label,
      width: mila.width,
      height: mila.height,
      anchors: mila.anchors,
      baseLayers: mila.baseLayers.map(({ id: part, layer }) => ({
        id: part,
        layer,
        image: asset(id, part),
      })),
    },
  };
}

export const cases = [
  generatedCase('nia', 'Nia', '黑色紧卷短发、圆椭圆脸、暖深棕肤色、较宽鼻翼和饱满嘴唇。'),
  generatedCase('iris', 'Iris', '铜红齐下巴短发、偏心形脸、浅肤色、鼻颊雀斑和灰绿色眼睛。'),
];
