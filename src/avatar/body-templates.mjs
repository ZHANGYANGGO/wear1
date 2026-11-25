import { mila } from './config.mjs';

const straightAnchors = {
  neck: [268, 276], shoulderLeft: [78, 324], shoulderRight: [454, 322],
  waist: [263, 793], ankleLeft: [150, 1417], ankleRight: [357, 1418], feet: [254, 1418],
};

export const bodyTemplates = {
  fitted: {
    id: 'fitted', name: '合身版', anchors: mila.anchors, donor: 'mila',
    chinY: 202, faceWidth: 120, collarBottom: 288, joinWidth: 175,
    armStart: 368, bareArmRow: 416, ankleSample: 1432,
  },
  straight: {
    id: 'straight', name: '直身版', anchors: straightAnchors, donor: 'man-smile',
    chinY: 211, faceWidth: 140, collarBottom: 312, joinWidth: 210,
    armStart: 478, bareArmRow: 536, ankleSample: 1427,
  },
};

export const personalLayers = { ankles: 0, backHair: -1, head: 5, arms: 6, frontHair: 45 };

export function project([a,b,c,d,e,f], [x,y]) {
  return [a*x + b*y + c, d*x + e*y + f];
}

export function placeHead(head, template) {
  const { landmarks, features, size, neck } = head;
  const placement=head.mapping?.placements?.[template.id];
  if (placement) {
    const {layerToCanvas}=placement;
    return {layerToCanvas,landmarks:landmarks.map(point=>project(layerToCanvas,point)),
      features,neck:[...template.anchors.neck],canvasSize:[560,1536]};
  }
  const xs = features.outline.map(index => landmarks[index][0]);
  const chinY = landmarks[152][1];
  const center = template.anchors.neck[0];
  // Keep the entire observed crop on stage, even with tall or asymmetric hair.
  const scale = Math.min(template.faceWidth / (Math.max(...xs) - Math.min(...xs)),
    (center-4)/Math.max(1,neck[0]), (556-center)/Math.max(1,size[0]-neck[0]),
    (template.chinY-3)/Math.max(1,chinY),
    (template.anchors.waist[1]-template.chinY-2)/Math.max(1,size[1]-chinY));
  const layerToCanvas = [scale,0,center-scale*neck[0],0,scale,template.chinY-scale*chinY];
  return { layerToCanvas, landmarks: landmarks.map(point => project(layerToCanvas, point)),
    features, neck: project(layerToCanvas,neck), canvasSize: [560,1536] };
}
