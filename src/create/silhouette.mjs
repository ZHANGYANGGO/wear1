import { imageAdvice } from './image-advice.mjs';
import { extractContour } from './contour.mjs';
import { templateShoulderBreadth, templateShoulderJointSpan } from '../3d/fitting.mjs';

let loading;
let loadAttempt = 0;
export class PhotoQualityError extends Error {}

async function landmarker() {
  if (!loading) loading = (async () => {
    // A failed module fetch is cached by some browsers. Give an explicit retry a fresh URL.
    const suffix = loadAttempt ? '?retry=' + loadAttempt : '';
    const { FilesetResolver, PoseLandmarker } = await import('/vendor/pose/vision_bundle.mjs' + suffix);
    return PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/vendor/pose/wasm'), {
      baseOptions: { modelAssetPath: '/assets/3d/pose-lite.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numPoses: 2, minPoseDetectionConfidence: .30, outputSegmentationMasks: true,
    });
  })().catch(error => { loading = null; loadAttempt++; throw error; });
  return loading;
}

// Read the contiguous torso span through its centre, excluding separated arms.
export function torsoSections(mask, width, height, points, view, world, issues = []) {
  if (!points || ![11,12,23,24,27,28].every(i => points[i] && points[i].y > 0 && points[i].y < 1))
    throw new PhotoQualityError('头顶或下肢可能超出画面，请退后，让头顶和双脚完整入镜。');
  let top = height, bottom = -1;
  let framedTop = height, framedBottom = -1;
  for (let y = 0; y < height; y++) {
    let foreground = 0;
    for (let x = 0; x < width; x++) if (mask[y * width + x] >= .58) foreground++;
    if (foreground) {
      top = Math.min(top, y); bottom = y;
    }
    // Ignore isolated pixels for crop warnings. Keep the original full mask span for fitting.
    if (foreground < Math.max(2, width * .003)) continue;
    framedTop = Math.min(framedTop, y);
    framedBottom = y;
  }
  const span = bottom - top;
  const framedSpan = framedBottom - framedTop;
  if (framedSpan <= 0) throw new PhotoQualityError('未能提取人体轮廓，请换简洁背景并均匀补光。');
  // Small shifts in the segmentation boundary are common after JPEG compression.
  // Measure clearance in proportion to the frame so different resolutions are comparable.
  const edgeMargin = Math.max(1, Math.round(height * .005));
  const headAtEdge = framedTop <= edgeMargin;
  const feetAtEdge = height - 1 - framedBottom <= edgeMargin;
  if (headAtEdge || feetAtEdge) {
    const edge = headAtEdge && feetAtEdge ? '头顶和鞋底都太靠近画面边缘'
      : headAtEdge ? '头顶太靠近画面上边缘' : '鞋底太靠近画面下边缘';
    throw new PhotoQualityError('照片已读取。' + edge + '，请换用上下留边的全身原图，或退后半步重拍。');
  }
  if (framedSpan < height * .38)
    throw new PhotoQualityError('人物占画面太小，请靠近一些，保持全身清晰入镜。');
  if ((points[27].y + points[28].y) * height / 2 < framedTop + framedSpan * .83)
    throw new PhotoQualityError('脚踝位置不清楚，请自然站直，露出双脚后重拍。');
  const shoulder = { x: (points[11].x + points[12].x) / 2, y: (points[11].y + points[12].y) / 2 };
  const hip = { x: (points[23].x + points[24].x) / 2, y: (points[23].y + points[24].y) / 2 };
  // Both shoulder and pelvis axes must agree before rejecting the view.
  // A horizontal axis in camera space faces the lens; a depth axis is side-on.
  const axes = [11, 23].map(i => {
    const a = world?.[i], b = world?.[i + 1];
    if (!a || !b || Math.max(points[i].visibility, points[i + 1].visibility) < .65) return NaN;
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.abs(dx) / Math.hypot(dx, dz);
  });
  if (view === 'front' && axes.every(axis => axis < .40))
    throw new PhotoQualityError('肩部和髋部都偏向侧面，请转回正面，让双肩朝向镜头。');
  if (view === 'side' && axes.every(axis => axis > .86))
    throw new PhotoQualityError('两肩和髋部仍明显分开，请固定手机，身体再转向侧面约 90°，只重拍侧面。');
  const ratios = { confidence: {} };
  for (const [key, fraction] of Object.entries({ shoulders: .03, chest: .32, waist: .68, hips: 1.02 })) {
    const center = Math.round((shoulder.x + fraction * (hip.x - shoulder.x)) * (width - 1));
    const row = Math.round((shoulder.y + fraction * (hip.y - shoulder.y)) * (height - 1));
    const widths = [];
    let armInSpan = false;
    const radius = Math.max(2, Math.round(span * .006));
    for (let y = Math.max(0,row-radius); y <= Math.min(height-1,row+radius); y++) {
      const start = y * width;
      if (center < 0 || center >= width || mask[start + center] < .52) continue;
      let left = center, right = center;
      while (left > 0 && mask[start + left - 1] >= .52) left--;
      while (right + 1 < width && mask[start + right + 1] >= .52) right++;
      if (left === 0 || right === width - 1) continue;
      widths.push((right - left + 1) / span);
      // An arm touching the shirt becomes part of the same mask interval. The
      // previous contiguous-run test alone then measured both arm and torso.
      for (const [a,b] of [[11,13],[12,14],[13,15],[14,16]]) {
        const from = points[a], to = points[b];
        if (!(from?.visibility >= .65 && to?.visibility >= .65)) continue;
        const t = (y / (height - 1) - from.y) / (to.y - from.y);
        const x = (from.x + t * (to.x - from.x)) * (width - 1);
        if (t >= 0 && t <= 1 && x >= left && x <= right) armInSpan = true;
      }
    }
    widths.sort((a,b) => a-b);
    const value = widths[Math.floor(widths.length / 2)];
    if (!Number.isFinite(value) || value * span < 2)
      throw new PhotoQualityError('躯干轮廓不清晰，请换简洁背景，双臂稍离身体后重拍。');
    ratios[key] = value;
    const flagged = issues.some(issue => issue.fromRow <= row + radius && issue.toRow >= row - radius);
    ratios.confidence[key] = armInSpan || flagged ? .18 : 1;
    if (view === 'front' && key === 'shoulders' && Math.min(points[11].visibility, points[12].visibility) >= .75) {
      const jointSpan = Math.abs(points[11].x - points[12].x) * (width - 1) / span;
      if (jointSpan > 0) {
        ratios[key] = jointSpan * templateShoulderBreadth / templateShoulderJointSpan;
        ratios.confidence[key] = 1;
      }
    }
  }
  ratios.hipHeight = (bottom - hip.y * height) / span;
  ratios.shoulderHeight = (bottom - shoulder.y * height) / span;
  return ratios;
}

function torsoVisibility(points) {
  return Math.min(...[11, 23].map(i => Math.max(points[i]?.visibility??0, points[i + 1]?.visibility??0)));
}

export function poseInput(image) {
  // The bundled CPU landmarker can abort while producing a segmentation mask
  // if the input width isn't a multiple of four. Scale the full frame to fit.
  const width = image.naturalWidth - image.naturalWidth % 4;
  if (width === image.naturalWidth) return image;
  const canvas = image.ownerDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(image.naturalHeight * width / image.naturalWidth);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function checkMaskFrame(contour) {
  const {top,bottom,left,right,maskHeight:h,maskWidth:w}=contour.frame;
  if(top<h*.004 || bottom>h*.996 || left<=0 || right>=w-1 || bottom-top<h*.38)
    throw new PhotoQualityError('请保留头脚和两侧边缘，使用完整的单人轮廓。');
  const widthAt=level=>{
    const r=contour.rows[Math.round((1-level)*(contour.rows.length-1))];
    return r[2]-r[1];
  };
  if(widthAt(.67)<.045 || widthAt(.95)>.9*widthAt(.67) || widthAt(.51)>.65)
    throw new PhotoQualityError('轮廓缺少可辨认的头部或躯干，请检查遮罩。');
}

// BodyM supplies opaque white-on-black silhouette PNGs. Preserve their original
// pixel edges instead of asking an RGB pose detector to rediscover the subject.
function nativeMask(img,view) {
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  function binary(rgba) {
    for(let i=0;i<rgba.length;i+=4) {
      const v=rgba[i];
      if((v!==0 && v!==255) || rgba[i+1]!==v || rgba[i+2]!==v || rgba[i+3]!==255) return false;
    }
    return true;
  }
  canvas.width=32; canvas.height=32; ctx.imageSmoothingEnabled=false;
  ctx.drawImage(img,0,0,32,32);
  if(!binary(ctx.getImageData(0,0,32,32).data)) return null;
  canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
  ctx.drawImage(img,0,0);
  const bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  if(bytes[0]!==0 || !binary(bytes)) return null;
  const contour=extractContour(bytes,canvas.width,canvas.height,{stride:4,threshold:128,view});
  checkMaskFrame(contour);
  return {sections:{},contour,advice:'已读取二值轮廓，按模板比例定位躯干。'};
}

export async function analyzePhoto(photo, view) {
  const img = new Image();
  img.src = photo.url;
  await img.decode();
  if(photo.type==='image/png') {
    const native=nativeMask(img,view);
    if(native) return native;
  }
  const engine = await landmarker();
  const input = poseInput(img);
  let result;
  try { result = engine.detect(input); }
  catch (error) { loading = null; engine.close(); throw error; }
  try {
    if (!result.landmarks.length) throw new PhotoQualityError('未检测到站立的人物，请让一人全身入镜后重拍。');
    const visibility = result.landmarks.map(torsoVisibility);
    if (visibility.filter(score => score > .65).length > 1)
      throw new PhotoQualityError('画面中检测到多人，请只保留需要建模的人物后重拍。');
    const index = visibility.indexOf(Math.max(...visibility));
    const mask = result.segmentationMasks?.[index];
    if (!mask) throw new PhotoQualityError('未能提取人体轮廓，请换简洁背景后重拍。');
    const points = result.landmarks[index];
    const pixels = mask.getAsFloat32Array();
    const contour = extractContour(pixels, mask.width, mask.height, {
      view, probabilityMask: true, landmarks: points.map(p => ({ ...p })),
      worldLandmarks: result.worldLandmarks?.[index]?.map(p => ({ ...p })) ?? null,
      inputWidth: input.naturalWidth ?? input.width, inputHeight: input.naturalHeight ?? input.height,
      originalWidth: img.naturalWidth, originalHeight: img.naturalHeight,
    });
    const haveJoints=[11,12,23,24,27,28].every(i=>Number.isFinite(points[i]?.y))
      && [11,23,27].every(i=>Math.max(points[i].visibility,points[i+1].visibility)>=.3);
    if(!haveJoints) checkMaskFrame(contour);
    const sections = haveJoints ? torsoSections(pixels, mask.width, mask.height, points, view, result.worldLandmarks?.[index], contour.issues) : {};
    const notes = imageAdvice(img, pixels, mask.width, mask.height);
    // One side is naturally less visible in profile. Only advise when both sides are weak.
    const uncertain = [11, 23, 27].some(i => Math.max(points[i]?.visibility??0, points[i + 1]?.visibility??0) < .65);
    if (uncertain) notes.push('部分关节点不够清晰，可让手臂稍离身体，减少遮挡。');
    return { sections, contour, advice: notes.join(' ') };
  } finally { result.close(); }
}

