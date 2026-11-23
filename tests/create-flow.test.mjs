import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { imageType, measurement } from '../src/create/photo.mjs';
import { LocalAvatarProvider, localRegistration } from '../src/create/profiles.mjs';

test('body input requires two independent positive numbers', () => {
  assert.equal(measurement('170.5'), 170.5);
  assert.equal(measurement('65'), 65);
  for (const value of ['', '0', '-2', 'abc', 'Infinity']) assert.equal(measurement(value), null);
});

test('file signatures recognize the allowed image formats and reject disguised bytes', () => {
  assert.equal(imageType(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)), 'image/png');
  assert.equal(imageType(Uint8Array.of(255, 216, 255, 224)), 'image/jpeg');
  assert.equal(imageType(new TextEncoder().encode('RIFF0000WEBP')), 'image/webp');
  assert.equal(imageType(new TextEncoder().encode('<svg></svg>')), null);
  assert.equal(imageType(new Uint8Array()), null);
});

test('four registrations have distinct identities, hashes and actual layered assets', async () => {
  const provider = new LocalAvatarProvider();
  assert.equal(localRegistration.length, 4);
  assert.equal(new Set(localRegistration.map(record => record.digest)).size, 4);
  assert.equal(new Set(localRegistration.map(record => record.id)).size, 4);
  const bodyHashes = { head: new Set(), arms: new Set(), ankles: new Set() };
  for (const { id, family } of localRegistration) {
    const bundle = await provider.byId(id);
    assert.equal(bundle.id, id);
    assert.equal(bundle.avatar.width, 560);
    assert.equal(bundle.avatar.height, 1536);
    assert.equal(bundle.garments.length, 6);
    assert.equal(bundle.garments.every(item => item.image.includes('/straight/')), family === 'straight');
    for (const layer of bundle.avatar.baseLayers) {
      const bytes = await readFile(new URL(layer.image));
      assert.equal(bytes.toString('ascii',8,16), 'WEBPVP8X');
      assert.ok(bytes[20] & 16);
      assert.equal(bytes.readUIntLE(24,3) + 1, 560);
      assert.equal(bytes.readUIntLE(27,3) + 1, 1536);
      bodyHashes[layer.id].add(createHash('sha256').update(bytes).digest('hex'));
    }
  }
  for (const hashes of Object.values(bodyHashes)) assert.equal(hashes.size, 4);
});

test('an unregistered input returns an explicit rejection and unknown IDs cannot restore', async () => {
  const provider = new LocalAvatarProvider();
  await assert.rejects(provider.resolve({
    photo: new TextEncoder().encode('unregistered'), heightCm: 170, weightKg: 65,
  }), /当前演示版本暂不支持该照片/);
  await assert.rejects(provider.byId('unknown'), /找不到已确认的分身/);
});
