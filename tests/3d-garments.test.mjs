import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { garmentCatalog, garmentGroups } from '../src/3d/garments.mjs';

function parseGlb(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  return JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
}

test('3D wardrobe only references unique standalone GLB garment meshes with embedded textures', async () => {
  assert.equal(new Set(garmentCatalog.map(item => item.id)).size, garmentCatalog.length);
  for (const item of garmentCatalog) {
    const gltf = parseGlb(await readFile(new URL(`../assets/3d/garments/${item.id}.glb`, import.meta.url)));
    assert.ok(gltf.meshes.length > 0, item.id);
    assert.ok(gltf.textures.length > 0, item.id);
    assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri), item.id);
    assert.equal(gltf.animations?.length || 0, 0, item.id);
    assert.ok(item.occupies.includes(item.slot), item.id);
    assert.ok(garmentGroups.some(group => group.categories.includes(item.category)), item.id);
  }
});

test('dress occupies both clothing slots while outerwear and shoes remain independent', () => {
  const dress = garmentCatalog.find(item => item.id === 'dress');
  assert.deepEqual(dress.occupies, ['top', 'bottom']);
  assert.deepEqual(garmentCatalog.find(item => item.id === 'jacket').occupies, ['outerwear']);
  assert.deepEqual(garmentCatalog.find(item => item.id === 'shoes').occupies, ['shoes']);
});
