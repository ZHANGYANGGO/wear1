import { canWearSelection, lookSlots, visibleLook } from './tryon-selection.mjs';

export const looksKey = 'wearmate.saved-looks.v1';
const idPattern = /^[a-z0-9-]+$/;
const nameLimit = 45;

function validEntry(item) {
  if (!item || typeof item.roleId !== 'string' || !idPattern.test(item.roleId) ||
      typeof item.name !== 'string' || !item.name.trim() || item.name.length > nameLimit ||
      typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) ||
      !lookSlots.every(slot => item[slot] === null ||
        (typeof item[slot] === 'string' && idPattern.test(item[slot])))) return false;
  return !!item.shoes && (item.dress ? !item.top && !item.bottom : !!item.top && !!item.bottom);
}

export function readSavedLooks(storage) {
  try {
    const value = storage.getItem(looksKey);
    if (value === null) return [];
    const parsed = JSON.parse(value);
    if (parsed?.version !== 1 || !Array.isArray(parsed.looks) || !parsed.looks.every(validEntry)) throw new Error();
    return parsed.looks;
  } catch {
    throw new Error('无法读取已保存穿搭，请检查浏览器的站点存储。');
  }
}

export function saveLook(storage, { roleId, name, selection }, byId, isReady) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > nameLimit) throw new Error('请填写 1 至 45 个字的穿搭名称。');
  if (!canWearSelection(selection, byId, isReady)) throw new Error('当前穿搭尚未完整加载，暂时无法保存。');
  const record = { roleId, name: trimmed, createdAt: new Date().toISOString(), ...visibleLook(selection) };
  if (!validEntry(record)) throw new Error('当前穿搭数据无效。');
  const looks = readSavedLooks(storage);
  try {
    storage.setItem(looksKey, JSON.stringify({ version: 1, looks: [record, ...looks] }));
  } catch {
    throw new Error('穿搭未保存，请检查浏览器的存储权限或剩余空间。');
  }
  return record;
}
