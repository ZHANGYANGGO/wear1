import assert from 'node:assert/strict';
import test from 'node:test';
import { extractContour, originalPoint, SubjectMaskError } from '../src/create/contour.mjs';

const w = 64, h = 96;
function fill(mask, y, a, b) { mask.fill(1, y * w + a, y * w + b + 1); }
function silhouette() {
  const mask = new Uint8Array(w * h);
  for (let y = 8; y <= 89; y++) fill(mask, y, y >= 47 && y <= 54 ? 16 : 20, y >= 60 && y <= 68 ? 47 : 41);
  mask[1] = 1; // Disconnected speck above the actual head.
  return mask;
}

test('signed asymmetric boundaries map back to the original even with odd source width and different mask scale', () => {
  const contour = extractContour(silhouette(), w, h, { view: 'side', originalWidth: 131, originalHeight: 195,
    inputWidth: 128, inputHeight: 191 });
  const { frame, rows } = contour;
  assert.deepEqual([frame.top, frame.bottom, frame.axisX], [8, 89, 31.5]);
  assert.equal(rows[0][0], 1); assert.equal(rows.at(-1)[0], 0);
  assert.equal(contour.status, 'success'); assert.equal(contour.direction, null);
  assert.equal(contour.landmarks, null); assert.equal(contour.camera, null);
  assert.ok(rows[50 - frame.top][1] < rows[30 - frame.top][1]);
  assert.ok(rows[62 - frame.top][2] > rows[30 - frame.top][2]);
  for (const [y, x, column] of [[50,16,1], [62,47,2], [8,20,1], [89,41,2]]) {
    const row = rows[y - frame.top], point = originalPoint(frame, row[0], row[column]);
    assert.ok(Math.abs(point.x - ((x + .5) * 131 / w - .5)) < .001);
    assert.ok(Math.abs(point.y - ((y + .5) * 195 / h - .5)) < .001);
  }
});

test('visible intervals distinguish separated limbs; occlusion and missing rows have localized flags', () => {
  const mask = silhouette();
  for (let y = 30; y < 60; y++) { fill(mask, y, 10, 12); fill(mask, y, 49, 51); }
  fill(mask, 30, 10, 51);
  const clear = extractContour(mask, w, h, { view: 'front' });
  assert.equal(clear.status, 'success');
  assert.equal(clear.rows[45-clear.frame.top][3].length, 3);
  for (let y = 44; y <= 48; y++) fill(mask, y, 10, 41);
  mask.fill(0, 70*w, 71*w);
  const partial = extractContour(mask, w, h, { view: 'front' });
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.issues.find(i => i.reason === 'left-arm-separation-uncertain'),
    { reason: 'left-arm-separation-uncertain', fromRow: 44, toRow: 48 });
  assert.deepEqual(partial.issues.find(i => i.reason === 'missing-boundary'),
    { reason: 'missing-boundary', fromRow: 70, toRow: 70 });
  const row = partial.rows[44-partial.frame.top];
  assert.equal(Math.round(originalPoint(partial.frame, row[0], row[1]).x), 10);
});

test('profile labels follow visible facial and foot evidence, and remain unknown on disagreement', () => {
  const points = Array.from({ length: 33 }, () => ({ x: .45, y: .5, visibility: 0 }));
  for (const i of [0,7,29,31]) points[i].visibility = .9;
  const analyze = () => extractContour(silhouette(), w, h, { view: 'side', landmarks: points }).direction;
  points[0].x = points[31].x = .32;
  assert.deepEqual(analyze(), { anterior: 'left', posterior: 'right' });
  points[0].x = .58; assert.equal(analyze(), null);
  points[31].x = .58; assert.deepEqual(analyze(), { anterior: 'right', posterior: 'left' });
  points[0].visibility = .25; assert.equal(analyze(), null);
});

test('a narrow central gap and the end of separated hands do not imply arms touching the waist', () => {
  const mask = silhouette();
  for (let y = 29; y <= 46; y++) {
    fill(mask, y, 9, 12); fill(mask, y, 50, 53);
    if (y > 40) mask.fill(0, y*w+30, y*w+32);
  }
  fill(mask, 29, 9, 53);
  const contour = extractContour(mask, w, h, { view: 'front' });
  assert.deepEqual(contour.issues, []);
});

test('uniform empty and solid masks cannot define a subject', () => {
  for (const value of [0, 1]) {
    assert.throws(() => extractContour(new Uint8Array(w*h).fill(value), w, h, { view: 'front' }), SubjectMaskError);
  }
});

test('soft segmentation probabilities mark only the affected edge rows', () => {
  const mask = Float32Array.from(silhouette());
  for (let y = 21; y <= 24; y++) {
    mask.fill(.4, y*w+17, y*w+20);
    mask.fill(.7, y*w+20, y*w+23);
  }
  const contour = extractContour(mask, w, h, { view: 'side', probabilityMask: true });
  assert.deepEqual(contour.issues, [{ reason: 'left-soft-boundary', fromRow: 21, toRow: 24 }]);
});
