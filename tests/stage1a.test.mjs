import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mila } from '../src/avatar/config.mjs';
import { layerFitsSlot } from '../src/stage1a/alpha.mjs';
import { cases } from '../src/stage1a/cases.mjs';
import { adaptGeneratedProfile } from '../src/stage1a/protocol.mjs';
import { garments } from '../src/wardrobe/catalog.mjs';

test('both independently generated layer sets implement the same garment template', async () => {
  const sources = new Set(mila.baseLayers.map(layer => layer.image));
  for (const sample of cases) {
    const result = adaptGeneratedProfile(sample.profile, garments);
    assert.equal(result.ok, true);
    assert.notEqual(result.avatar.id, mila.id);
    assert.deepEqual(result.avatar.anchors, mila.anchors);
    for (const { image } of result.avatar.baseLayers) {
      assert.ok(!sources.has(image));
      sources.add(image);
      const bytes = await readFile(new URL(image));
      assert.equal(bytes.toString('ascii', 8, 16), 'WEBPVP8X');
      assert.ok(bytes[20] & 16, `${image} must carry alpha`);
      assert.equal(bytes.readUIntLE(24, 3) + 1, 560);
      assert.equal(bytes.readUIntLE(27, 3) + 1, 1536);
    }
    assert.ok((await readFile(new URL(sample.reference))).length > 0);
  }
});

test('rejects incompatible template version, canvas, anchors and layer assignments', () => {
  const profile = cases[0].profile;
  const results = [
    [{ ...profile, version: 2 }, /版本/],
    [{ ...profile, width: 561 }, /560×1536/],
    [{ ...profile, anchors: { ...profile.anchors, neck: [275, 260] } }, /neck.*对齐/],
    [{ ...profile, anchors: {} }, /缺少必需锚点/],
    [{ ...profile, baseLayers: profile.baseLayers.slice(0, 1) }, /三个/],
    [{ ...profile, baseLayers: profile.baseLayers.map(layer => ({ ...layer, image: profile.baseLayers[0].image })) }, /独立/],
  ];
  for (const [input, error] of results) {
    const result = adaptGeneratedProfile(input, garments);
    assert.equal(result.ok, false);
    assert.match(result.message, error);
  }
});

test('rejects empty, one-sided or out-of-slot pixels instead of accepting a flattened image', () => {
  const { width, height } = mila;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, alpha) => { pixels[(y * width + x) * 4 + 3] = alpha; };
  assert.equal(layerFitsSlot('arms', pixels, width, height), false);
  put(140, 500, 255);
  assert.equal(layerFitsSlot('arms', pixels, width, height), false);
  put(390, 500, 255);
  assert.equal(layerFitsSlot('arms', pixels, width, height), true);
  put(280, 550, 255);
  assert.equal(layerFitsSlot('arms', pixels, width, height), false);
  pixels.fill(255);
  assert.equal(layerFitsSlot('head', pixels, width, height), false);
});
