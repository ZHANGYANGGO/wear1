import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mila } from '../src/avatar/config.mjs';
import { categories, garmentById, garments, outfits } from '../src/wardrobe/catalog.mjs';
import { matchOutfit, selectGarment, selectOutfit } from '../src/wardrobe/selection.mjs';

test('both presets contain a different garment for every category', () => {
  assert.equal(outfits.length, 2);
  for (const { id } of categories) {
    const ids = outfits.map(outfit => outfit.items[id]);
    assert.equal(new Set(ids).size, 2);
    for (const garment of ids) assert.equal(garmentById.get(garment)?.category, id);
  }
  for (const outfit of outfits) {
    const selection = selectOutfit(outfit.id);
    assert.deepEqual(selection, outfit.items);
    assert.notEqual(selection, outfit.items);
    assert.equal(matchOutfit(selection), outfit);
  }
});

test('each manual choice changes only its own category and detects a reconstructed preset', () => {
  const initial = selectOutfit('casual');
  let selection = initial;
  for (const { id } of categories) {
    const other = selectOutfit('commute')[id];
    const next = selectGarment(selection, other);
    assert.deepEqual(next, { ...selection, [id]: other });
    assert.deepEqual(initial, outfits[0].items);
    selection = next;
    assert.equal(matchOutfit(selection)?.id, id === 'shoes' ? 'commute' : undefined);
  }
});

test('unknown and already selected IDs leave the current selection intact', () => {
  const selection = selectOutfit('casual');
  assert.equal(selectOutfit('missing'), undefined);
  assert.equal(selectGarment(selection, 'missing'), selection);
  assert.equal(selectGarment(selection, selection.top), selection);
});

test('every garment has a valid anchor, transparent WebP sprite and thumbnail', async () => {
  assert.equal(garmentById.size, garments.length);
  const garmentAssets = garments.flatMap(garment => {
    assert.ok(mila.anchors[garment.anchor]);
    return [
      { image: garment.image, fullFrame: true },
      { image: garment.thumbnail, fullFrame: false },
    ];
  });
  const assets = [...mila.baseLayers.map(layer => ({ image: layer.image, fullFrame: true })), ...garmentAssets];
  for (const { image, fullFrame } of assets) {
    const bytes = await readFile(new URL(image));
    assert.equal(bytes.toString('ascii', 8, 16), 'WEBPVP8X');
    assert.ok(bytes[20] & 16, `${image} must carry alpha`);
    if (fullFrame) {
      assert.equal(bytes.readUIntLE(24, 3) + 1, mila.width);
      assert.equal(bytes.readUIntLE(27, 3) + 1, mila.height);
    }
  }
});
