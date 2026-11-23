import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { localRegistration } from '../src/create/profiles.mjs';
import { garments, outfits } from '../src/wardrobe/catalog.mjs';
import { garmentCatalog } from '../src/wardrobe/garments.mjs';
import { looksKey, readSavedLooks, saveLook } from '../src/wardrobe/saved-looks.mjs';
import { getFitInfo, wardrobeSprites, withTryOnAvailability } from '../src/wardrobe/tryon-assets.mjs';
import {
  canWearSelection, createLook, removeLayer, restoreLook, selectTryOnItem, visibleLook,
} from '../src/wardrobe/tryon-selection.mjs';

const defaults = outfits[0].items;
const dress = { id: 'floral-maxi', category: 'dress' };
const coat = { id: 'white-puffer', category: 'outerwear' };
const byId = new Map([...garments, dress, coat].map(item => [item.id, item]));
const ready = () => true;

test('role-scoped fitting entries have independent transparent parts in the shared canvas', async () => {
  const seen = new Set();
  for (const role of localRegistration) {
    const options = wardrobeSprites(role.id);
    assert.ok(options.length >= 4);
    for (const item of garmentCatalog) {
      const status = getFitInfo(item.id, role.id);
      assert.ok(['pending', 'failed', 'ready'].includes(status.status));
      const decorated = withTryOnAvailability(item, role.id);
      assert.equal(decorated.tryOnStatus, status.status);
      assert.equal(decorated.originalImage, item.originalImage);
      assert.equal(decorated.cartoonDisplayImage, item.cartoonDisplayImage);
    }
    for (const item of options) {
      for (const part of item.parts) {
        assert.match(part.image, new RegExp('/tryon/' + (role.id === 'woman-bob' ? role.id : role.family) + '/'));
        assert.notEqual(part.image, item.thumbnail);
        if (seen.has(part.image)) continue;
        seen.add(part.image);
        const bytes = await readFile(new URL(part.image));
        assert.equal(bytes.toString('ascii', 8, 16), 'WEBPVP8X');
        assert.ok(bytes[20] & 0x10);
        assert.equal(bytes.readUIntLE(24, 3) + 1, 560);
        assert.equal(bytes.readUIntLE(27, 3) + 1, 1536);
      }
    }
  }
  assert.deepEqual(wardrobeSprites('mila'), []);
});

test('a dress replaces both separates and removing it restores them and any coat', () => {
  const full = createLook(defaults);
  const jacketed = selectTryOnItem(full, coat);
  const dressed = selectTryOnItem(jacketed, dress);
  assert.deepEqual(visibleLook(dressed), {
    top: null, bottom: null, dress: dress.id, outerwear: coat.id, shoes: defaults.shoes,
  });
  assert.equal(canWearSelection(dressed, byId, ready), true);
  assert.deepEqual(removeLayer(dressed, 'dress'), jacketed);
  assert.equal(removeLayer(dressed, 'outerwear').dress, dress.id);
  const selectBack = selectTryOnItem(dressed, byId.get('espresso-jacket'));
  assert.equal(selectBack.dress, null);
  assert.equal(selectBack.outerwear, coat.id);
  assert.equal(selectBack.bottom, defaults.bottom);
  assert.deepEqual(restoreLook({ top: 'blue-denim', shoes: 'bad', dress: 'shirt' }, defaults, byId), full);
});

test('saved records persist visible slot IDs, timestamp and role; failures leave the prior record intact', () => {
  const records = new Map();
  const storage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
  const selection = selectTryOnItem(selectTryOnItem(createLook(defaults), dress), coat);
  assert.deepEqual(readSavedLooks(storage), []);
  const record = saveLook(storage, { roleId: 'woman-bob', name: '  花园散步 ', selection }, byId, ready);
  assert.deepEqual(readSavedLooks(storage), [record]);
  assert.equal(record.name, '花园散步');
  assert.equal(record.top, null);
  assert.equal(record.bottom, null);
  assert.equal(record.outerwear, coat.id);
  assert.equal(record.shoes, defaults.shoes);
  assert.equal(record.roleId, 'woman-bob');
  assert.ok(Number.isFinite(Date.parse(record.createdAt)));
  assert.throws(() => saveLook(storage, { roleId: 'woman-bob', name: '缺件', selection }, byId, id => id !== coat.id), /尚未完整/);
  assert.throws(() => saveLook({
    ...storage,
    setItem() { throw new Error('Quota'); },
  }, { roleId: 'woman-bob', name: '配额失败', selection }, byId, ready), /未保存/);
  assert.deepEqual(readSavedLooks(storage), [record]);
  storage.setItem(looksKey, '{"version":0}');
  assert.throws(() => readSavedLooks(storage), /无法读取/);
});
