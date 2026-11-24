import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoReview } from '../src/create/photo-review.mjs';
import { PhotoQualityError } from '../src/create/silhouette.mjs';
import { inspectThumbnail } from '../src/create/image-advice.mjs';

const read = async byte => ({
  buffer: Uint8Array.of(byte).buffer,
  url: URL.createObjectURL(new Blob([Uint8Array.of(byte)])),
});
const sections = { chest: .2, waist: .16, hips: .21, shoulders: .25 };
const accepted = { sections, contour: { rows: [[1, -.1, .1]] }, advice: '' };

test('quality tips require repeated soft boundaries or substantial clipped areas within the person', () => {
  const width = 100, height = 80;
  const mask = new Float32Array(width * height);
  const data = new Uint8ClampedArray(width * height * 4);
  function sample(luma) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      mask[i] = x >= 24 && x < 76 ? 1 : 0;
      data.fill(luma(x), i * 4, i * 4 + 3);
    }
    return inspectThumbnail({ data, width, height }, mask, width, height);
  }
  assert.deepEqual(sample(x => x >= 24 && x < 76 ? 135 : 55), []);
  assert.match(sample(x => 55 + Math.max(0, Math.min(10, x - 19, 81 - x)) * 8).join(''), /对焦/);
  assert.match(sample(x => x < 50 ? 0 : 255).join(''), /光线/);
});

test('replacing or rejecting one view preserves the other preview and its fitted sections', async t => {
  const calls = [];
  const review = createPhotoReview(() => {}, read, async (photo, view) => {
    calls.push(view);
    if (view === 'side' && new Uint8Array(photo.buffer)[0] === 1) throw new PhotoQualityError('请转身');
    return accepted;
  });
  t.after(() => review.dispose());
  await review.select('front', 1);
  const front = review.get('front');
  assert.equal(front.contour, accepted.contour);
  await review.select('side', 1);
  assert.match(review.get('side').detail, /同一文件/);
  await review.select('side', 2);
  assert.equal(review.get('front'), front);
  assert.equal(review.get('side').sections, sections);
  assert.equal(review.get('side').contour, accepted.contour);
  assert.deepEqual(calls, ['front', 'side', 'side']);
  // Upload order is free, including a side view initially put in the wrong slot.
  await review.select('front', 2);
  assert.equal(review.get('side').state, 'ready');
  assert.equal(review.get('front').state, 'retake');
});

test('a late detector result and a late file decode cannot overwrite replacements', async t => {
  let finishCheck, finishRead;
  const review = createPhotoReview(() => {}, async byte => {
    if (byte === 3) await new Promise(resolve => { finishRead = resolve; });
    return read(byte);
  }, async photo => {
    if (new Uint8Array(photo.buffer)[0] === 1) {
      await new Promise(resolve => { finishCheck = resolve; });
      throw new PhotoQualityError('迟到的旧结果');
    }
    return accepted;
  });
  t.after(() => review.dispose());
  const pending = review.select('side', 1);
  await new Promise(resolve => setImmediate(resolve));
  const decoding = review.select('side', 3);
  await review.select('side', 2);
  finishCheck(); finishRead();
  await Promise.all([pending, decoding]);
  assert.equal(review.get('side').state, 'ready');
  assert.equal(new Uint8Array(review.get('side').photo.buffer)[0], 2);
});

test('a failed detector can retry the retained photo, while an unreadable file needs replacing', async t => {
  let reads = 0, checks = 0;
  const review = createPhotoReview(() => {}, async file => {
    reads++;
    if (file === 9) throw new Error('请更换损坏的文件');
    return read(file);
  }, async () => {
    if (++checks === 1) throw new Error('model unavailable');
    return accepted;
  });
  t.after(() => review.dispose());
  await review.select('side', 2);
  assert.equal(review.get('side').state, 'retry');
  const url = review.get('side').photo.url;
  await review.retry('side');
  assert.equal(review.get('side').state, 'ready');
  assert.equal(review.get('side').photo.url, url);
  assert.equal(reads, 1);
  await review.select('side', 9);
  assert.equal(review.get('side').state, 'retake');
  assert.equal(review.get('side').sections, undefined);
  assert.equal(checks, 2);
});
