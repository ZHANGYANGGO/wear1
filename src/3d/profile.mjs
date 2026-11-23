import { validLocalFit } from './fitting.mjs';
const storageKey = 'wearmate.3d.confirmed';

export function readConfirmedModel() {
  try {
    const record = JSON.parse(sessionStorage.getItem(storageKey));
    if (!record || !/^[a-f0-9-]{36}$/.test(record.id)
      || !Number.isFinite(record.heightCm) || !Number.isFinite(record.weightKg)) return null;
    if (record.kind === 'local' && !validLocalFit(record)) return null;
    return record;
  } catch {
    return null;
  }
}

export function confirmModel(record) {
  if (record.kind === 'local') {
    if (!validLocalFit(record)) throw new Error('本地体型资料无效。');
    sessionStorage.setItem(storageKey, JSON.stringify(record));
    return record;
  }
  const value = {
    id: record.id,
    heightCm: record.heightCm,
    weightKg: record.weightKg,
    modelUrl: `/api/3d/models/${record.id}/file.glb`,
    approximate: Boolean(record.approximate),
    bodyCoverage: record.bodyCoverage === 'cropped' ? 'cropped' : 'full',
  };
  sessionStorage.setItem(storageKey, JSON.stringify(value));
  return value;
}

export function attachReference(bodyId, referenceId) {
  const profile = readConfirmedModel();
  if (profile?.kind !== 'local' || profile.id !== bodyId || !/^[a-f0-9-]{36}$/.test(referenceId)) {
    throw new Error('当前试衣分身已更换，请返回工作台。');
  }
  confirmModel({ ...profile, referenceId });
}
