import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReconstructionService, generationRequest, validateReconstructionInput } from '../scripts/reconstruction.mjs';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const photo = (view = 'front') => ({ view, type: 'image/png', data: png.toString('base64') });
const env = { DASHSCOPE_API_KEY: 'secret-test-key', DASHSCOPE_WORKSPACE_ID: 'workspace-test', NODE_ENV: 'test' };

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function uploadPolicy() {
  return response({ data: {
    upload_host: 'https://upload.example.test',
    upload_dir: 'dashscope-instant/test',
    policy: 'private-policy',
    signature: 'private-signature',
    oss_access_key_id: 'temporary-access-id',
    x_oss_object_acl: 'private',
    x_oss_forbid_overwrite: 'true',
  } });
}

function glb() {
  const bytes = Buffer.alloc(20);
  bytes.write('glTF', 0, 'ascii');
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(20, 8);
  bytes.writeUInt32LE(0, 12);
  bytes.writeUInt32LE(0, 16);
  return bytes;
}

test('3D input validates consent, measurements, views and actual image bytes', () => {
  const valid = validateReconstructionInput({ heightCm: 170, weightKg: 65, consent: true, photos: [photo()] });
  assert.equal(valid.photos[0].view, 'front');
  assert.equal(valid.photos[0].type, 'image/png');
  for (const body of [
    { heightCm: 0, weightKg: 65, consent: true, photos: [photo()] },
    { heightCm: 170, weightKg: 65, consent: false, photos: [photo()] },
    { heightCm: 170, weightKg: 65, consent: true, photos: [] },
    { heightCm: 170, weightKg: 65, consent: true, photos: [photo('left')] },
    { heightCm: 170, weightKg: 65, consent: true, photos: [{ ...photo(), data: 'bm90LWEtcG5n' }] },
  ]) assert.throws(() => validateReconstructionInput(body));
});

test('DashScope single and multiview requests use private OSS inputs and fixed view order', () => {
  const single = generationRequest([{ view: 'front', type: 'image/png' }], ['oss://private/front']);
  assert.equal(single.endpoint, '/services/aigc/video-generation/3d-generation');
  assert.equal(single.body.input.image, 'oss://private/front');
  assert.equal(single.body.model, 'Tripo/Tripo-H3.1');
  assert.equal(single.body.parameters.pbr, true);
  const multi = generationRequest([
    { view: 'front', type: 'image/png' }, { view: 'back', type: 'image/jpeg' },
  ], ['oss://private/front', 'oss://private/back']);
  assert.deepEqual(multi.body.input.images, [
    { type: 'png', file_token: 'oss://private/front' },
    {},
    { type: 'jpeg', file_token: 'oss://private/back' },
    {},
  ]);
  assert.equal(multi.body.parameters.texture, true);
});

test('missing DashScope credentials reject before any network request', async () => {
  let calls = 0;
  const service = createReconstructionService({ root: path.join(tmpdir(), 'unused'), env: {}, fetchImpl: async () => { calls++; } });
  await assert.rejects(service.create({ heightCm: 170, weightKg: 65, consent: true, photos: [photo()] }), /尚未配置/);
  assert.equal(calls, 0);
});

test('task uploads photos privately, polls, saves GLB and never exposes credentials or provider URLs', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'wearmate-3d-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const model = glb();
  const calls = [];
  const service = createReconstructionService({
    root,
    env,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).startsWith('https://dashscope.aliyuncs.com/api/v1/uploads')) return uploadPolicy();
      if (String(url) === 'https://upload.example.test') return new Response(null, { status: 200 });
      if (String(url).endsWith('/services/aigc/video-generation/3d-generation')) return response({ output: { task_id: 'remote-task', task_status: 'PENDING' } });
      if (String(url).endsWith('/tasks/remote-task')) return response({ output: {
        task_status: 'SUCCEEDED', results: [{ pbr_model_url: 'https://cdn.example.test/private/model.glb' }],
      } });
      if (String(url) === 'https://cdn.example.test/private/model.glb') return new Response(model);
      throw new Error('Unexpected request');
    },
  });
  const created = await service.create({ heightCm: 170, weightKg: 65, consent: true, photos: [photo()] });
  assert.equal(created.status, 'queued');
  assert.equal(created.approximate, true);
  assert.equal('providerTaskId' in created, false);
  const upload = calls.find(call => call.url === 'https://upload.example.test');
  assert.ok(upload.options.body instanceof FormData);
  assert.equal(upload.options.body.get('x-oss-object-acl'), 'private');
  assert.equal(upload.options.body.get('success_action_status'), '200');
  assert.match(upload.options.body.get('key'), /^dashscope-instant\/test\/.+\.png$/);
  assert.equal(upload.options.body.get('file').type, 'image/png');
  assert.equal('Authorization' in (upload.options.headers || {}), false);
  const generation = calls.find(call => call.url.endsWith('/services/aigc/video-generation/3d-generation'));
  assert.equal(generation.options.headers.Authorization, 'Bearer secret-test-key');
  assert.equal(generation.options.headers['X-DashScope-Async'], 'enable');
  assert.equal(generation.options.headers['X-DashScope-OssResourceResolve'], 'enable');
  assert.match(JSON.parse(generation.options.body).input.image, /^oss:\/\/dashscope-instant\/test\//);
  const completed = await service.get(created.id);
  assert.equal(completed.status, 'success');
  assert.equal(completed.modelUrl, `/api/3d/models/${created.id}/file.glb`);
  assert.deepEqual(await readFile(await service.file(created.id)), model);
  assert.equal(JSON.stringify(completed).includes('secret-test-key'), false);
  assert.equal(JSON.stringify(completed).includes('workspace-test'), false);
  assert.equal(JSON.stringify(completed).includes('cdn.example.test'), false);
});

test('DashScope terminal failure is returned without a model URL', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'wearmate-3d-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = createReconstructionService({
    root,
    env,
    fetchImpl: async url => {
      if (String(url).startsWith('https://dashscope.aliyuncs.com/api/v1/uploads')) return uploadPolicy();
      if (String(url) === 'https://upload.example.test') return new Response(null, { status: 200 });
      if (String(url).includes('/services/')) return response({ output: { task_id: 'remote-task' } });
      return response({ output: { task_status: 'FAILED', code: 'InvalidImage', message: '无法从照片生成模型' } });
    },
  });
  const created = await service.create({ heightCm: 170, weightKg: 65, consent: true, photos: [photo()] });
  const failed = await service.get(created.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, '无法从照片生成模型');
  assert.equal(failed.modelUrl, null);
});
