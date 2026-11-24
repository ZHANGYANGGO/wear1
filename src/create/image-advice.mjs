// A small thumbnail is enough for optional capture advice. These observations
// never reject a photo or change any dimensions passed to the fitter.
export function imageAdvice(image, mask, maskWidth, maskHeight) {
  const scale = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  let thumbnail;
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    thumbnail = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch { return []; }
  return inspectThumbnail(thumbnail, mask, maskWidth, maskHeight);
}

export function inspectThumbnail({ data, width, height }, mask, maskWidth, maskHeight) {
  function light(x, y) {
    const i = (y * width + x) * 4;
    return .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
  }
  let samples = 0, dark = 0, bright = 0, edges = 0, soft = 0;
  for (let y = 0; y < height; y += 4) {
    const row = Math.floor(y * maskHeight / height) * maskWidth;
    let inside = false;
    for (let x = 0; x < width; x++) {
      const probability = mask[row + Math.floor(x * maskWidth / width)];
      if (probability > .80) {
        const value = light(x, y);
        samples++;
        if (value < 8) dark++;
        if (value > 247) bright++;
      }
      const next = probability >= .55;
      if (next !== inside && x >= 5 && x + 5 < width) {
        const contrast = Math.abs(light(x - 5, y) - light(x + 5, y));
        if (contrast > 55) {
          let strongest = 0;
          for (let k = x - 4; k <= x + 5; k++) {
            strongest = Math.max(strongest, Math.abs(light(k, y) - light(k - 1, y)));
          }
          edges++;
          if (strongest < contrast * .20) soft++;
        }
      }
      inside = next;
    }
  }
  const notes = [];
  if (samples > 150 && dark > samples * .12 && bright > samples * .12)
    notes.push('人物区域同时有较多过亮和过暗处，可换到光线均匀的位置。');
  if (edges >= 16 && soft > edges * .85)
    notes.push('多处人物边缘偏软，建议稳住镜头并重新对焦。');
  return notes;
}
