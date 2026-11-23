import assert from 'node:assert/strict';
import test from 'node:test';
import { mila } from '../src/avatar/config.mjs';
import { mountAvatar } from '../src/avatar/renderer.mjs';
import { validateAvatar } from '../src/avatar/validation.mjs';
import { garments, outfits } from '../src/wardrobe/catalog.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createStage(decode = async () => {}) {
  return {
    children: [],
    attributes: new Map(),
    style: { setProperty() {} },
    setAttribute(name, value) { this.attributes.set(name, value); },
    replaceChildren(...children) { this.children = children; },
    ownerDocument: {
      createElement() {
        return {
          dataset: {},
          style: {},
          classList: { add() {} },
          naturalWidth: mila.width,
          naturalHeight: mila.height,
          decode() { return decode(this); },
        };
      },
    },
  };
}

test('validates the shared canvas, required anchors, and base-layer metadata', () => {
  assert.equal(validateAvatar(mila, garments), '');
  assert.match(validateAvatar(null, garments), /配置必须是对象/);
  assert.match(validateAvatar({ ...mila, height: 0 }, garments), /画布/);
  assert.match(validateAvatar({ ...mila, anchors: {} }, garments), /缺少必需锚点「neck」/);
  assert.match(validateAvatar({ ...mila, anchors: { ...mila.anchors, neck: [10, NaN] } }, garments), /有限坐标/);
  assert.match(validateAvatar({ ...mila, anchors: { ...mila.anchors, neck: [900, 10] } }, garments), /超出画布/);
  assert.match(validateAvatar({ ...mila, baseLayers: [] }, garments), /基础图层/);
  assert.match(validateAvatar({ ...mila, baseLayers: [mila.baseLayers[0], mila.baseLayers[0]] }, garments), /重复/);
  assert.match(validateAvatar({ ...mila, baseLayers: [{ ...mila.baseLayers[0], layer: Infinity }] }, garments), /层级/);
  assert.match(validateAvatar({ ...mila, baseLayers: [{ ...mila.baseLayers[0], image: 'bad-path' }] }, garments), /素材地址无效/);
});

test('a failed or pending spare garment does not block the base and available clothes', async () => {
  const loafers = garments.find(item => item.id === 'penny-loafers');
  const pendingShoes = deferred();
  const stage = createStage(async image => {
    if (image.src === loafers.image) await pendingShoes.promise;
  });
  const mounted = mountAvatar(stage, mila, garments);
  const spare = mounted.garmentLoads.get(loafers.id);
  assert.equal(spare.status, 'loading');
  assert.deepEqual(await mounted.ready, { ok: true });
  for (const id of Object.values(outfits[0].items)) {
    const load = mounted.garmentLoads.get(id);
    await load.settled;
    assert.equal(load.status, 'ready');
  }
  mounted.show(outfits[0].items);
  assert.deepEqual(visibleIds(stage), ['ankles', 'head', 'arms', 'cream-trainers', 'blue-denim', 'brick-tee']);

  pendingShoes.reject(new Error('HTTP 404'));
  await spare.settled;
  assert.equal(spare.status, 'failed');
  assert.equal(mounted.garmentLoads.get('cream-trainers').status, 'ready');
  mounted.show({ ...outfits[0].items, top: 'espresso-jacket' });
  assert.deepEqual(visibleIds(stage), ['ankles', 'head', 'arms', 'cream-trainers', 'blue-denim', 'espresso-jacket']);
});

test('an invalid garment URL and a decoded garment of the wrong dimensions are isolated', async () => {
  const first = { ...garments[0], image: 'invalid address' };
  const second = garments[1];
  const stage = createStage(async image => {
    if (image.src === second.image) image.naturalWidth = 200;
  });
  const mounted = mountAvatar(stage, mila, [first, second, ...garments.slice(2)]);
  assert.deepEqual(await mounted.ready, { ok: true });
  await Promise.all([...mounted.garmentLoads.values()].map(load => load.settled));
  assert.equal(mounted.garmentLoads.get(first.id).status, 'failed');
  assert.equal(mounted.garmentLoads.get(second.id).status, 'failed');
  assert.equal(mounted.garmentLoads.get('blue-denim').status, 'ready');
  assert.equal(stage.children.some(image => image.dataset.layer === first.id), false);
});

test('missing anchors, invalid base URLs and bad decoded base images preserve the current role', async () => {
  const wrongSize = new URL('file:///wrong-size.webp').href;
  const broken = new URL('file:///broken.webp').href;
  const stage = createStage(async image => {
    if (image.src === wrongSize) image.naturalHeight = 20;
    if (image.src === broken) throw new Error('Decode rejected');
  });
  assert.deepEqual(await mountAvatar(stage, mila, garments).ready, { ok: true });
  const current = stage.children;
  const invalid = [
    [{ ...mila, anchors: {} }, /缺少必需锚点/],
    [{ ...mila, baseLayers: [{ ...mila.baseLayers[0], image: 'bad-path' }] }, /素材地址无效/],
    [{ ...mila, baseLayers: [{ ...mila.baseLayers[0], image: wrongSize }] }, /素材尺寸/],
    [{ ...mila, baseLayers: [{ ...mila.baseLayers[0], image: broken }] }, /素材无法读取/],
  ];
  for (const [avatar, message] of invalid) {
    const result = await mountAvatar(stage, avatar, garments).ready;
    assert.equal(result.ok, false);
    assert.match(result.message, message);
    assert.equal(stage.children, current);
    assert.equal(stage.attributes.get('aria-label'), mila.label);
  }
});

test('a slower role cannot overwrite a later successful mount', async () => {
  const slowAsset = new URL('file:///slow.webp').href;
  const pendingBody = deferred();
  const stage = createStage(async image => {
    if (image.src === slowAsset) await pendingBody.promise;
  });
  const slow = mountAvatar(stage, {
    ...mila,
    label: 'Slow role',
    baseLayers: [{ ...mila.baseLayers[0], image: slowAsset }],
  }, garments);
  assert.deepEqual(await mountAvatar(stage, mila, garments).ready, { ok: true });
  const current = stage.children;
  pendingBody.resolve();
  assert.equal((await slow.ready).ok, false);
  assert.equal(stage.children, current);
  assert.equal(stage.attributes.get('aria-label'), mila.label);
});

test('a multi-part outerwear sprite is atomic and keeps the body and other garments', async () => {
  const back = { id: 'coat-back', layer: 4, image: 'file:///coat-back.webp' };
  const front = { id: 'coat-front', layer: 40, image: 'file:///coat-front.webp' };
  const coat = { id: 'coat', category: 'outerwear', anchor: 'neck', scale: 1, offset: [0, 0], parts: [back, front] };
  for (const fail of [false, true]) {
    const stage = createStage(async image => {
      if (fail && image.src === back.image) throw new Error('Missing material');
    });
    const mounted = mountAvatar(stage, mila, [...garments, coat]);
    assert.deepEqual(await mounted.ready, { ok: true });
    await Promise.all([...mounted.garmentLoads.values()].map(load => load.settled));
    mounted.show({ ...outfits[0].items, outerwear: coat.id });
    const ids = visibleIds(stage);
    assert.equal(mounted.garmentLoads.get(coat.id).status, fail ? 'failed' : 'ready');
    assert.equal(ids.includes('coat-front'), !fail);
    assert.equal(ids.includes('coat-back'), !fail);
    if (!fail) {
      assert.ok(ids.indexOf('coat-back') < ids.indexOf('head'));
      assert.ok(ids.indexOf('coat-front') > ids.indexOf('brick-tee'));
    }
    assert.ok(ids.includes('brick-tee') && ids.includes('blue-denim'));
  }
});

function visibleIds(stage) {
  return stage.children.filter(image => !image.hidden).map(image => image.dataset.layer);
}
