const maxBytes = 10 * 1024 * 1024;
const maxPixels = 16_000_000;

export function measurement(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function imageType(buffer) {
  const bytes = new Uint8Array(buffer);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  const tag = (offset, value) => [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  if (tag(0, 'RIFF') && tag(8, 'WEBP')) return 'image/webp';
  return null;
}

export async function openPhoto(file) {
  if (!file?.size || file.size > maxBytes) throw new Error('请选择一张不超过 10 MB 的照片。');
  const buffer = await file.arrayBuffer();
  const type = imageType(buffer);
  if (!type || (file.type && file.type !== type)) throw new Error('请选择可读取的 JPEG、PNG 或 WebP 照片。');
  const url = URL.createObjectURL(new Blob([buffer], { type }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth < 128 || image.naturalHeight < 128
      || image.naturalWidth * image.naturalHeight > maxPixels) {
      throw new Error('请使用宽高均不小于 128 像素、总像素不超过 1600 万的照片。');
    }
    return { url, buffer, type, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error.name === 'EncodingError') throw new Error('照片无法解码，请重新选择文件。');
    throw error;
  }
}

export async function fingerprint(buffer, unavailableMessage = '请在本机预览地址打开创建页。') {
  if (!globalThis.crypto?.subtle) throw new Error(unavailableMessage);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
