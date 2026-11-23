let loading;
async function landmarker() {
  if (!loading) loading = (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('/vendor/pose/vision_bundle.mjs');
    return PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/vendor/pose/wasm'), {
      baseOptions: { modelAssetPath: '/assets/3d/pose-lite.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numPoses: 2, outputSegmentationMasks: true,
    });
  })().catch(error => { loading = null; throw error; });
  return loading;
}

// Read the contiguous torso span through its centre, excluding separated arms.
export function torsoSections(mask, width, height, points, view) {
  if (!points || ![11,12,23,24,27,28].every(i => points[i] && points[i].y > 0 && points[i].y < 1))
    throw new Error('请让头顶和双脚完整入镜。');
  let top = height, bottom = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < .58) continue;
    const y = Math.floor(i / width);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const span = bottom - top;
  if (span < height * .38 || top < 1 || bottom >= height - 1 || (points[27].y + points[28].y) * height / 2 < top + span * .83)
    throw new Error('请站直，头脚留一点边距，并让全身占据画面的大部分。');
  const shoulder = { x: (points[11].x + points[12].x) / 2, y: (points[11].y + points[12].y) / 2 };
  const hip = { x: (points[23].x + points[24].x) / 2, y: (points[23].y + points[24].y) / 2 };
  const shoulderSpan = Math.abs(points[11].x - points[12].x) * width / span;
  if (view === 'front' ? shoulderSpan < .105 : shoulderSpan > .12)
    throw new Error(view === 'front' ? '正面照请双肩朝向镜头。' : '侧面照请转身约 90°，让两肩在画面中接近重合。');
  const ratios = {};
  for (const [key, fraction] of Object.entries({ shoulders: .03, chest: .32, waist: .68, hips: 1.02 })) {
    const center = Math.round((shoulder.x + fraction * (hip.x - shoulder.x)) * (width - 1));
    const row = Math.round((shoulder.y + fraction * (hip.y - shoulder.y)) * (height - 1));
    const widths = [];
    for (let y = Math.max(0,row-2); y <= Math.min(height-1,row+2); y++) {
      const start = y * width;
      if (mask[start + center] < .52) continue;
      let left = center, right = center;
      while (left > 0 && mask[start + left - 1] >= .52) left--;
      while (right + 1 < width && mask[start + right + 1] >= .52) right++;
      widths.push((right - left + 1) / span);
    }
    widths.sort((a,b) => a-b);
    const value = widths[Math.floor(widths.length / 2)];
    if (!(value > .045 && value < .51)) throw new Error('躯干轮廓不清晰，请换简洁背景，双臂稍离身体后重拍。');
    ratios[key] = value;
  }
  ratios.hipHeight = (bottom - hip.y * height) / span;
  ratios.shoulderHeight = (bottom - shoulder.y * height) / span;
  return ratios;
}

export async function analyzePhoto(photo, view) {
  const engine = await landmarker();
  const img = new Image();
  img.src = photo.url;
  await img.decode();
  const result = engine.detect(img);
  try {
    if (result.landmarks.length !== 1 || !result.segmentationMasks?.length) throw new Error('请拍摄单人站立的全身照，确保肩、腰和双脚清晰可见。');
    const mask = result.segmentationMasks[0];
    return torsoSections(mask.getAsFloat32Array(), mask.width, mask.height, result.landmarks[0], view);
  } finally { result.close(); }
}

