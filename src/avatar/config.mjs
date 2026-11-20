/** @typedef {{id: string, label: string, width: number, height: number, anchors: Record<string, [number, number]>, baseLayers: {id: string, layer: number, image: string}[]}} AvatarConfig */

/** @type {AvatarConfig} */
export const mila = {
  id: 'mila',
  label: '示例角色 Mila',
  width: 560,
  height: 1536,
  anchors: {
    neck: [276, 260],
    shoulderLeft: [147, 266],
    shoulderRight: [404, 269],
    waist: [274, 566],
    ankleLeft: [159, 1422],
    ankleRight: [361, 1422],
    feet: [260, 1422],
  },
  baseLayers: [
    { id: 'ankles', layer: 0 },
    { id: 'head', layer: 5 },
    { id: 'arms', layer: 6 },
  ].map(layer => ({
    ...layer,
    image: new URL(`../../assets/avatar/${layer.id}.webp`, import.meta.url).href,
  })),
};
