import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { garmentCatalog } from '../src/wardrobe/garments.mjs';
import { editableFields, tryOnCoverage } from '../src/wardrobe/model.mjs';
import { LocalGarmentProvider } from '../src/wardrobe/provider.mjs';
import { storageKey, WardrobeStore } from '../src/wardrobe/store.mjs';
import { fingerprint } from '../src/create/photo.mjs';

class MemoryStorage {
  value = null;
  blocked = false;
  getItem() { return this.value; }
  setItem(key, value) {
    assert.equal(key, storageKey);
    if (this.blocked) throw new Error('quota exceeded');
    this.value = value;
  }
}

test('wardrobe registrations own distinct transparent displays and separate source IDs', async () => {
  const provider = new LocalGarmentProvider();
  const items = provider.list();
  const sourceURLs = new Set();
  const displayURLs = new Set();
  for (const item of items) {
    assert.deepEqual(editableFields(item), {
      name: item.name, category: item.category, primaryColor: item.primaryColor,
      secondaryColors: item.secondaryColors, styleTags: item.styleTags,
      seasons: item.seasons, warmthLevel: item.warmthLevel,
      statementLevel: item.statementLevel, availability: 'available',
    });
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.match(item.originalImage, /^\.\/local-wardrobe\/original\/[a-f0-9]{32}\.png$/);
    assert.equal(item.cartoonDisplayImage, './assets/wardrobe/display/' + item.id + '.webp');
    assert.equal(item.tryOnStatus, 'pending');
    assert.deepEqual(item.tryOnAssets, {});
    sourceURLs.add(item.originalImage);
    displayURLs.add(item.cartoonDisplayImage);
    const webp = await readFile(new URL('../' + item.cartoonDisplayImage, import.meta.url));
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
    assert.equal(webp.toString('ascii', 12, 16), 'VP8X');
    assert.ok(webp[20] & 0x10, 'display image contains an alpha channel');
    assert.equal(webp.readUIntLE(24, 3) + 1, 768);
    assert.equal(webp.readUIntLE(27, 3) + 1, 768);
  }
  assert.equal(sourceURLs.size, items.length);
  assert.equal(displayURLs.size, items.length);
  assert.deepEqual(tryOnCoverage.dress.slots, ['top', 'bottom']);
  assert.equal(tryOnCoverage.outerwear.needsArmOcclusion, true);
  assert.throws(() => new LocalGarmentProvider([...garmentCatalog, garmentCatalog[0]]), /重复/);
});

test('provider matches exact bytes and refuses changes or unknown content', async () => {
  const raw = Uint8Array.of(7, 14, 23, 9).buffer;
  const fake = { ...garmentCatalog[0], sha256: await fingerprint(raw) };
  const provider = new LocalGarmentProvider([fake, ...garmentCatalog.slice(1)]);
  const found = await provider.match(raw);
  assert.equal(found.id, fake.id);
  found.tryOnAssets.invalid = true;
  assert.deepEqual(provider.get(fake.id).tryOnAssets, {});
  assert.equal(await provider.match(Uint8Array.of(7, 14, 23, 8).buffer), null);
  assert.equal(provider.get('unregistered'), null);
});

test('wardrobe creates once, edits safe fields, persists, and deletes independently of assets', () => {
  const provider = new LocalGarmentProvider();
  const storage = new MemoryStorage();
  const store = new WardrobeStore(storage, provider);
  const [item] = provider.list();
  assert.deepEqual(store.list(), []);
  assert.ok(store.add(item.id));
  assert.equal(store.add(item.id), false);
  store.edit(item.id, {
    ...item, name: ' 手工编辑 ', availability: 'washing', category: 'outerwear',
    originalImage: 'changed', tryOnStatus: 'ready',
  });
  const reopened = new WardrobeStore(storage, provider);
  const [saved] = reopened.list();
  assert.equal(saved.name, '手工编辑');
  assert.equal(saved.availability, 'washing');
  assert.equal(saved.category, 'outerwear');
  assert.equal(saved.originalImage, item.originalImage);
  assert.equal(saved.tryOnStatus, 'pending');
  assert.ok(reopened.remove(item.id));
  assert.equal(reopened.remove(item.id), false);
  assert.deepEqual(reopened.list(), []);
  assert.deepEqual(provider.get(item.id), item);
});

test('sample import is optional and preserves prior edits without duplicates', () => {
  const provider = new LocalGarmentProvider();
  const store = new WardrobeStore(new MemoryStorage(), provider);
  const [item] = provider.list();
  assert.ok(store.add(item.id, { ...item, name: '自己的名字' }));
  assert.equal(store.importSamples(), provider.list().length - 1);
  assert.equal(store.importSamples(), 0);
  assert.equal(store.list().find(entry => entry.id === item.id).name, '自己的名字');
});

test('failed or invalid storage does not overwrite the last valid record', () => {
  const provider = new LocalGarmentProvider();
  const storage = new MemoryStorage();
  const store = new WardrobeStore(storage, provider);
  const [item] = provider.list();
  store.add(item.id);
  storage.blocked = true;
  assert.throws(() => store.remove(item.id), /未保存/);
  assert.equal(store.list().length, 1);
  assert.throws(() => store.edit(item.id, { ...item, availability: 'other' }), /请检查/);
  storage.value = '{"invalid":true}';
  assert.throws(() => store.importSamples(), /记录暂不可用/);
  assert.equal(storage.value, '{"invalid":true}');
  assert.throws(() => new WardrobeStore(undefined, provider).list(), /检查浏览器/);
});
