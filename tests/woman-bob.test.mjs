import assert from 'node:assert/strict';
import test from 'node:test';
import { openPersonalWardrobe } from '../src/wardrobe/personal.mjs';
import { getFitInfo, wardrobeSprites } from '../src/wardrobe/tryon-assets.mjs';
import { bobCatalog, bobCommute, bobId } from '../src/wardrobe/woman-bob-wardrobe.mjs';
import { storageKey } from '../src/wardrobe/store.mjs';

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

test('all curated clothing uses the dedicated role art including neck, instep and coat layers', () => {
  const sprites = wardrobeSprites(bobId);
  assert.deepEqual(new Set(sprites.map(item => item.id)), new Set(bobCatalog.map(item => item.id)));
  for (const { parts } of sprites) {
    assert.ok(parts.every(part => new URL(part.image).pathname.includes('/tryon/woman-bob/')));
  }
  const layers = id => getFitInfo(id, bobId).parts.map(({ layer }) => layer).sort((a, b) => a-b);
  assert.deepEqual(layers('navy-shirt'), [4, 7, 30]);
  assert.deepEqual(layers('white-puffer'), [4, 40]);
  assert.deepEqual(layers('ivory-mary-janes'), [1, 10]);
  for (const id of Object.values(bobCommute.items)) assert.equal(getFitInfo(id, bobId).status, 'ready');
  for (const id of ['nude-pumps', 'blue-collar-polo', 'white-sweatshirt']) {
    assert.equal(getFitInfo(id, bobId).status, 'pending');
  }
});
