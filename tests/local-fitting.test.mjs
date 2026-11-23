import assert from 'node:assert/strict';
import test from 'node:test';
import { deformPoint, ellipseGirth, fitBody, templateHeight, validLocalFit } from '../src/3d/fitting.mjs';
import { torsoSections } from '../src/create/silhouette.mjs';
import { attachReference, confirmModel, readConfirmedModel } from '../src/3d/profile.mjs';

const input = { heightCm: 170, weightKg: 65, tier: 'quick' };
const views = {
  front: { chest: .2, waist: .16, hips: .21, shoulders: .24, hipHeight: .51, shoulderHeight: .81 },
  side: { chest: .13, waist: .12, hips: .13, shoulders: .09, hipHeight: .52, shoulderHeight: .8 },
};
const girths = { chest: 98, waist: 82, hips: 101 };

test('local fit preserves metric height and changes body and shirt widths at chest level', () => {
  const slim = fitBody({ ...input, weightKg: 55 });
  const broad = fitBody({ ...input, weightKg: 92, heightCm: 185 });
  assert.ok(validLocalFit(slim));
  assert.equal(deformPoint(0, 0, 0, slim)[1], 0);
  assert.ok(Math.abs(deformPoint(0, templateHeight, 0, broad)[1] - 1.85) < 1e-8);
  for (const x of [.153, .16]) assert.ok(deformPoint(x, 1.212, .025, broad)[0] > deformPoint(x, 1.212, .025, slim)[0]);
  const adjusted = fitBody({ ...input, adjust: { shoulders: 20 } });
  assert.ok(adjusted.bands[5][1] > fitBody(input).bands[5][1]);
});

test('two silhouettes constrain width, depth and hip height independently', () => {
  assert.throws(() => fitBody({ ...input, tier: 'photos' }), /全身照/);
  const base = fitBody({ ...input, tier: 'photos', views });
  const other = fitBody({ ...input, tier: 'photos', views: { ...views, side: { ...views.side, chest: .17, hipHeight: .56 } } });
  assert.equal(base.bands[4][1], other.bands[4][1]);
  assert.ok(base.bands[4][2] < other.bands[4][2]);
  assert.ok(deformPoint(0,.874,0,base)[1] < deformPoint(0,.874,0,other)[1]);
});

test('measured tier requires three girths, appearance can use either local fit', () => {
  assert.throws(() => fitBody({ ...input, tier: 'measured', views }), /围度/);
  const model = fitBody({ ...input, tier: 'measured', views, girths });
  const [, x, z] = model.bands[3];
  assert.ok(Math.abs(ellipseGirth(x * .258, z * .179) * 170 / templateHeight - 82) < 1e-8);
  assert.deepEqual(model.bands, fitBody({ ...input, tier: 'appearance', views, girths }).bands);
  assert.deepEqual(fitBody({ ...input, tier: 'appearance', views }).bands, fitBody({ ...input, tier: 'photos', views }).bands);
});

test('silhouette sampler rejects missing, cropped and wrong-view poses', () => {
  const size = 150;
  const mask = new Float32Array(size ** 2);
  for (let y = 5; y < 145; y++) mask.fill(1, y * size + 60, y * size + 90);
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5 }));
  points[11] = { x: .41, y: .2 }; points[12] = { x: .59, y: .2 };
  points[23].y = points[24].y = .52;
  points[27].y = points[28].y = .91;
  const sections = torsoSections(mask,size,size,points,'front');
  assert.ok(sections.chest > .2 && sections.hipHeight > .4);
  assert.throws(() => torsoSections(mask,size,size,points,'side'), /90°/);
  assert.throws(() => torsoSections(mask,size,size,null,'front'), /头顶/);
  mask[2] = 1;
  assert.throws(() => torsoSections(mask,size,size,points,'front'), /全身/);
});

test('cloud references are scoped to a confirmed local body and legacy records stay readable', t => {
  const data = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => data.get(key), setItem: (key, value) => data.set(key, value),
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor); else delete globalThis.sessionStorage; });
  const record = fitBody(input);
  const legacy = confirmModel({ id: crypto.randomUUID(), heightCm: 170, weightKg: 65, approximate: true });
  assert.equal(readConfirmedModel().modelUrl, legacy.modelUrl);
  confirmModel(record);
  attachReference(record.id, legacy.id);
  assert.deepEqual(readConfirmedModel(), { ...record, referenceId: legacy.id });
  const newer = fitBody(input);
  confirmModel(newer);
  assert.throws(() => attachReference(record.id, legacy.id));
  assert.deepEqual(readConfirmedModel(), newer);
});

