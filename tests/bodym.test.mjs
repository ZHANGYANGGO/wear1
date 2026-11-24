import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { PNG } from 'pngjs';
import { parseSplit } from '../scripts/parse-bodym.mjs';

test('offline pairing retains repeat sessions, separates labels and counts broken or missing views in the denominator', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'wearmate-bodym-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const local = path.join(root, 'train');
  for (const sub of ['mask', 'mask_left']) await mkdir(path.join(local, sub), { recursive: true });
  await writeFile(path.join(local, 'subject_to_photo_map.csv'), 'subject_id,photo_id\r\ns,a\r\ns,b\r\ns,c\r\ns,d\r\ns,e\r\n');
  await writeFile(path.join(local, 'hwg_metadata.csv'), 'subject_id,height_cm,weight_kg\ns,165,57\n');
  await writeFile(path.join(local, 'measurements.csv'), 'subject_id,waist\ns,75\n');
  const image = new PNG({ width: 32, height: 42 });
  for (let y = 3; y < 40; y++) for (let x = 12; x < 21; x++) {
    image.data.fill(255, (y*32+x)*4, (y*32+x+1)*4);
  }
  const bytes = PNG.sync.write(image);
  for (const id of ['a','b','c','d','e']) await writeFile(path.join(local,'mask',id+'.png'), bytes);
  for (const id of ['a','b']) await writeFile(path.join(local,'mask_left',id+'.png'), bytes);
  await writeFile(path.join(local, 'mask_left/d.png'), Buffer.from('bad'));
  image.data.fill(0);
  await writeFile(path.join(local, 'mask_left/e.png'), PNG.sync.write(image));
  const summary = await parseSplit({ split: 'train', root, dir: root });
  assert.deepEqual([summary.subjects,summary.expectedPairs,summary.validPairs,summary.partial,summary.failed], [1,5,3,2,3]);
  const rows = gunzipSync(await readFile(path.join(root,'train.ndjson.gz'))).toString().trim().split('\n').map(s => JSON.parse(s));
  assert.deepEqual(rows.map(r => r.photo_id), ['a','b','c','d','e']);
  assert.ok(rows.every(r => r.subject_id === 's' && !Object.hasOwn(r, 'measurements')));
  assert.equal(rows[0].metadata.height_cm, 165);
  assert.equal(rows[0].side.landmarks, null);
  assert.ok(rows.slice(2).every(r => r.status === 'failed' && r.errors.side));
  const labels = JSON.parse(await readFile(path.join(root, 'train-measurements.json')));
  assert.equal(labels.s.waist, 75);
  assert.ok(summary.samples[0].edgesVerified.every(n => n > 0));
});
