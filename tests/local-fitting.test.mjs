import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPointDeformer, deformPoint, ellipseGirth, fitBody, templateHeight, upgradePhotoFit, validLocalFit } from '../src/3d/fitting.mjs';
import { poseInput, torsoSections } from '../src/create/silhouette.mjs';
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

test('clothing or a fused arm cannot drive a large local waist bulge; clean observations still change the fit', () => {
  const neutral = fitBody(input);
  const observed = { ...views.front, waist: .293, chest: .341 };
  const fit = front => fitBody({ ...input, tier: 'photos', views: { front, side: views.side } });
  const clear = fit(observed);
  const occluded = fit({ ...observed, confidence: { waist: .18, chest: .18 } });
  const narrower = fit({ ...views.front, waist: .15, chest: .17 });
  assert.ok(clear.bands[3][1] > narrower.bands[3][1] + .08);
  assert.ok(occluded.bands[3][1] < clear.bands[3][1]);
  assert.ok(occluded.bands[3][1] < 1.12 * neutral.bands[3][1]);
});

test('torso and sleeve at wrist height receive distinct deformation; arm distances are preserved in the fitted mesh', async () => {
  const bytes = await readFile(new URL('../assets/3d/fitting-body.glb', import.meta.url));
  const length = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString('utf8', 20, 20+length));
  const attrs = gltf.meshes[0].primitives[0].attributes;
  function floats(index, size) {
    const a = gltf.accessors[index], buffer = gltf.bufferViews[a.bufferView];
    return new Float32Array(bytes.buffer, bytes.byteOffset + 28 + length + buffer.byteOffset + (a.byteOffset || 0), a.count * size);
  }
  const xyz = floats(attrs.POSITION,3), weights = floats(attrs._ARM_WEIGHT,1);
  const profile = fitBody({ ...input, tier: 'measured', views, girths: { ...girths, waist: 110 } });
  const deform = createPointDeformer(profile), scale = input.heightCm / 100 / templateHeight;
  let distal = 0, trunk = 0, first;
  for (let i = 0; i < weights.length; i++) {
    const x = xyz[i*3], y = xyz[i*3+1], z = xyz[i*3+2];
    if (y < .92 || y > 1.19 || x <= 0) continue;
    if (x > .39 && weights[i] >= .99999) {
      const p = deform(x, y, z, weights[i]);
      const displacement = p.map((v,k) => v/scale - [x,y,z][k]);
      first ??= displacement;
      assert.ok(Math.hypot(...displacement.map((v,k) => v-first[k])) < .00001);
      distal++;
    }
    if (x < .18 && weights[i] === 0 && Math.abs(deform(x,y,z,0)[0] / scale - x) > .01) trunk++;
  }
  assert.ok(distal > 200 && trunk > 25);
  // The same shared deformer is used by garment vertices carrying equivalent rig weights.
  assert.notDeepEqual(deform(.44,1.06,.17,1), deform(.44,1.06,.17,0));
});

test('existing unmeasured photo profiles recover a conservative fit while preserving their identity and references', () => {
  const old = { ...fitBody(input), tier: 'photos', referenceId: 'existing-reference' };
  old.bands[3] = [1.06,1.76,1.78];
  const corrected = upgradePhotoFit(old);
  assert.equal(corrected.id, old.id);
  assert.equal(corrected.referenceId, old.referenceId);
  assert.ok(corrected.bands[3][1] < 1.17);
  assert.equal(old.bands[3][1], 1.76);
  assert.equal(upgradePhotoFit(corrected), corrected);
  for (const tier of ['quick','measured','appearance']) {
    const saved = { ...old, tier };
    assert.equal(upgradePhotoFit(saved), saved);
  }
});

test('measured tier requires three girths, appearance can use either local fit', () => {
  assert.throws(() => fitBody({ ...input, tier: 'measured', views }), /围度/);
  const model = fitBody({ ...input, tier: 'measured', views, girths });
  const [, x, z] = model.bands[3];
  assert.ok(Math.abs(ellipseGirth(x * .258, z * .179) * 170 / templateHeight - 82) < 1e-8);
  assert.deepEqual(model.bands, fitBody({ ...input, tier: 'appearance', views, girths }).bands);
  assert.deepEqual(fitBody({ ...input, tier: 'appearance', views }).bands, fitBody({ ...input, tier: 'photos', views }).bands);
});

test('pose input aligns all width remainders and scales the entire frame without cropping', () => {
  for (const [width, height] of [[417, 303], [462, 312], [291, 743], [244, 732]]) {
    let drawn;
    const canvas = { getContext: () => ({ drawImage: (...args) => { drawn = args; } }) };
    const image = { naturalWidth: width, naturalHeight: height, ownerDocument: { createElement: () => canvas } };
    const input = poseInput(image);
    if (width % 4 === 0) {
      assert.equal(input, image);
      assert.equal(drawn, undefined);
    } else {
      assert.equal(input, canvas);
      assert.equal(canvas.width, width - width % 4);
      assert.equal(canvas.height, Math.round(height * canvas.width / width));
      assert.deepEqual(drawn, [image, 0, 0, canvas.width, canvas.height]);
    }
  }
});

test('silhouette sampler rejects missing, cropped and wrong-view poses', () => {
  const size = 150;
  const mask = new Float32Array(size ** 2);
  for (let y = 5; y < 145; y++) mask.fill(1, y * size + 60, y * size + 90);
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5 }));
  points[11] = { x: .41, y: .2 }; points[12] = { x: .59, y: .2 };
  points[23].y = points[24].y = .52;
  points[27].y = points[28].y = .91;
  const world = points.map(p => ({ ...p, z: 0 }));
  world[23].x = .44; world[24].x = .56;
  const sections = torsoSections(mask,size,size,points,'front',world);
  assert.ok(sections.chest > .2 && sections.hipHeight > .4);
  assert.throws(() => torsoSections(mask,size,size,points,'side',world), /90°/);
  world[23].z = 1; // A frontal-looking shoulder axis alone cannot rule out a side view.
  assert.doesNotThrow(() => torsoSections(mask,size,size,points,'side',world));
  assert.throws(() => torsoSections(mask,size,size,null,'front'), /头顶/);
  mask[2] = 1;
  assert.doesNotThrow(() => torsoSections(mask,size,size,points,'front',world));
  mask.fill(1, 65, 85);
  assert.throws(() => torsoSections(mask,size,size,points,'front'), /全身/);
});

test('portrait framing reports the affected edge even when compression shifts the mask a few pixels', () => {
  const width = 200, height = 732;
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5 }));
  points[11].y = points[12].y = .2;
  points[27].y = points[28].y = .92;
  function check(topGap, bottomGap) {
    const mask = new Float32Array(width * height);
    for (let y = topGap; y < height - bottomGap; y++) {
      mask.fill(1, y * width + 70, y * width + 130);
    }
    return torsoSections(mask, width, height, points, 'front');
  }
  for (const topGap of [1, 3]) {
    assert.throws(() => check(topGap, 3), /头顶和鞋底/);
    assert.throws(() => check(topGap, 20), /头顶太靠近画面上边缘/);
  }
  assert.throws(() => check(20, 3), /鞋底太靠近画面下边缘/);
  assert.doesNotThrow(() => check(8, 8));
});

test('an arm inside the sampled chest interval lowers its confidence; separated arms do not', () => {
  const size = 160, mask = new Float32Array(size * size);
  for (let y = 5; y < 155; y++) mask.fill(1, size*y+54, size*y+106);
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  for (const [i,x,y] of [[11,.28,.2],[12,.72,.2],[13,.22,.44],[14,.78,.44],
    [15,.22,.58],[16,.78,.58],[23,.42,.56],[24,.58,.56],[27,.45,.92],[28,.55,.92]]) {
    Object.assign(points[i], { x, y });
  }
  const measure = (issues = []) => torsoSections(mask, size, size, points, 'front', null, issues);
  const clear = measure();
  assert.equal(clear.confidence.chest, 1);
  points[13].x = .50;
  const touching = measure();
  assert.equal(touching.chest, clear.chest);
  assert.ok(touching.confidence.chest < clear.confidence.chest);
  points[13].x = .22;
  assert.ok(measure([{ fromRow: 69, toRow: 73 }]).confidence.waist < clear.confidence.waist);
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

