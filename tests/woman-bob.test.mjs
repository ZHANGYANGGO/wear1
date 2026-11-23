import assert from 'node:assert/strict';
import test from 'node:test';
import { openPersonalWardrobe } from '../src/wardrobe/personal.mjs';
import { getFitInfo, wardrobeSprites } from '../src/wardrobe/tryon-assets.mjs';
import { bobCatalog, bobCommute, bobId } from '../src/wardrobe/woman-bob-wardrobe.mjs';
import { storageKey } from '../src/wardrobe/store.mjs';
import { avatarProvider } from '../src/create/profiles.mjs';
import { rebuiltBob } from '../src/create/bob-rebuild.mjs';
import { validateAvatar } from '../src/avatar/validation.mjs';
import { readFile } from 'node:fs/promises';

test('the rebuilt avatar registers three body layers and three separate default garments', async () => {
  const { avatar, garments } = rebuiltBob;
  assert.equal(validateAvatar(avatar, garments), '');
  assert.equal(avatar.id, bobId);
  assert.deepEqual(garments.map(item => item.id), ['brick-tee', 'blue-denim', 'cream-trainers']);
  const layers = [...avatar.baseLayers, ...garments];
  assert.equal(new Set(layers.map(layer => layer.image)).size, 6);
  for (const layer of layers) {
    assert.match(layer.image, /\/woman-bob\/rebuilt\//);
    const bytes = await readFile(new URL(layer.image));
    assert.equal(bytes.toString('ascii', 8, 16), 'WEBPVP8L');
    assert.equal(bytes[20], 0x2f);
    // Lossless WebP packs width, height and the alpha flag into four bytes.
    const header = bytes.readUInt32LE(21);
    assert.equal((header & 0x3fff) + 1, 560);
    assert.equal(((header >>> 14) & 0x3fff) + 1, 1536);
    assert.equal((header >>> 28) & 1, 1);
  }
});

test('the revised pose and its default outfit resolve together', async () => {
  const { avatar, garments } = await avatarProvider.byId(bobId);
  assert.notEqual(avatar.anchors.shoulderLeft[1], avatar.anchors.shoulderRight[1]);
  assert.ok(avatar.anchors.ankleRight[0] - avatar.anchors.ankleLeft[0] < 190);
  assert.ok(avatar.baseLayers.every(layer => layer.image.includes('/woman-bob/refined/')));
  for (const id of ['brick-tee', 'blue-denim', 'cream-trainers']) {
    assert.match(garments.find(item => item.id === id).image, /\/woman-bob\/refined\//);
  }
});

test('short-haired wardrobe is ready on first visit and keeps deletions across visits', () => {
  const records = new Map([[storageKey, '{"version":1,"entries":[]}']]);
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
  const { provider, store, key } = openPersonalWardrobe(storage, bobId);
  assert.notEqual(key, storageKey);
  assert.equal(store.list().length, 9);
  assert.equal(provider.get('nude-pumps'), null);
  store.edit('navy-shirt', { ...provider.get('navy-shirt'), name: '我的蓝衬衫' });
  store.remove('black-trousers');
  const reopened = openPersonalWardrobe(storage, bobId).store;
  assert.equal(reopened.list().length, 8);
  assert.equal(reopened.list().find(item => item.id === 'navy-shirt').name, '我的蓝衬衫');
  assert.equal(records.get(storageKey), '{"version":1,"entries":[]}');
  for (const item of reopened.list()) reopened.remove(item.id);
  assert.deepEqual(openPersonalWardrobe(storage, bobId).store.list(), []);
  assert.equal(reopened.importSamples(), 9);
});

test('all curated clothing uses the standard role art and layered collars', () => {
  const sprites = wardrobeSprites(bobId);
  assert.deepEqual(new Set(sprites.map(item => item.id)), new Set(bobCatalog.map(item => item.id)));
  for (const { parts } of sprites) {
    assert.ok(parts.every(part => new URL(part.image).pathname.includes('/tryon/woman-bob/standard/')));
  }
  const layers = id => getFitInfo(id, bobId).parts.map(({ layer }) => layer).sort((a, b) => a-b);
  assert.deepEqual(layers('navy-shirt'), [4, 30]);
  assert.deepEqual(layers('white-puffer'), [4, 40]);
  assert.deepEqual(layers('ivory-mary-janes'), [10]);
  for (const id of Object.values(bobCommute.items)) assert.equal(getFitInfo(id, bobId).status, 'ready');
  for (const id of ['nude-pumps', 'blue-collar-polo', 'white-sweatshirt']) {
    assert.equal(getFitInfo(id, bobId).status, 'pending');
  }
});
