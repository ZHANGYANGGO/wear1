import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MODEL = 'Tripo/Tripo-H3.1';
const UPLOAD_POLICY_URL = 'https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy';
const VIEWS = ['front', 'left', 'back', 'right'];
const MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg' };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MODEL_BYTES = 200 * 1024 * 1024;

function signature(type, bytes) {
  if (type === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

export function validateReconstructionInput(body) {
  const heightCm = Number(body?.heightCm);
  const weightKg = Number(body?.weightKg);
  if (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250) throw new Error('身高需在 80–250 cm 之间。');
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300) throw new Error('体重需在 20–300 kg 之间。');
  if (body?.consent !== true) throw new Error('上传照片前需要确认云端处理授权。');
  if (!Array.isArray(body?.photos) || body.photos.length < 1 || body.photos.length > 4) throw new Error('请上传 1–4 张同一人物的照片。');
  const views = new Set();
  const photos = body.photos.map(photo => {
    if (!VIEWS.includes(photo?.view) || views.has(photo.view)) throw new Error('照片视角无效或重复。');
    views.add(photo.view);
    if (!MIME[photo?.type] || typeof photo?.data !== 'string') throw new Error('照片必须是 JPEG 或 PNG。');
    let bytes;
    try {
      bytes = Buffer.from(photo.data, 'base64');
    } catch {
      throw new Error('照片数据无法读取。');
    }
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !signature(photo.type, bytes)) throw new Error('照片内容、格式或大小不符合要求。');
    return { view: photo.view, type: photo.type, bytes };
  });
  if (!views.has('front')) throw new Error('必须包含正面照片。');
  const bodyCoverage = body.bodyCoverage === 'cropped' ? 'cropped' : 'full';
  return { heightCm, weightKg, bodyCoverage, photos };
}

export function generationRequest(photos, files) {
  const parameters = {
    texture: true,
    pbr: true,
    texture_quality: 'standard',
    geometry_quality: 'standard',
    face_limit: 200000,
    orientation: 'align_image',
    enable_image_autofix: true,
  };
  if (files.length === 1) return {
    endpoint: '/services/aigc/video-generation/3d-generation',
    body: { model: MODEL, input: { image: files[0] }, parameters },
  };
  const byView = new Map(photos.map((photo, index) => [photo.view, { type: MIME[photo.type], file_token: files[index] }]));
  return {
    endpoint: '/services/aigc/video-generation/3d-generation',
    body: {
      model: MODEL,
      input: { images: VIEWS.map(view => byView.get(view) || {}) },
      parameters,
    },
  };
}

function publicRecord(record) {
  return {
    id: record.id,
    status: record.status,
    progress: record.progress,
    approximate: record.approximate,
    bodyCoverage: record.bodyCoverage === 'cropped' ? 'cropped' : 'full',
    views: record.views || [],
    heightCm: record.heightCm,
    weightKg: record.weightKg,
    modelUrl: record.modelUrl,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function responseJson(response, fallback) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(fallback);
  }
  if (!response.ok) throw new Error(data?.message || data?.error?.message || fallback);
  return data;
}

async function downloadModel(url, fetchImpl) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('云端返回的模型地址无效。');
  }
  if (parsed.protocol !== 'https:') throw new Error('云端模型地址必须使用 HTTPS。');
  const response = await fetchImpl(parsed, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('云端模型下载失败。');
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_MODEL_BYTES) throw new Error('生成的 3D 模型超过 200 MB。');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_MODEL_BYTES) throw new Error('生成的 3D 模型超过 200 MB。');
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('云端返回的不是有效的 GLB 2.0 文件。');
  }
  return bytes;
}

export function createReconstructionService({ root, env = process.env, fetchImpl = fetch }) {
  const key = env.DASHSCOPE_API_KEY;
  const workspace = env.DASHSCOPE_WORKSPACE_ID;
  const apiRoot = `https://${workspace}.cn-beijing.maas.aliyuncs.com/api/v1`;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function request(url, options = {}) {
    return fetchImpl(url, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: AbortSignal.timeout(options.timeout || 60000),
    });
  }

  async function uploadPhoto(photo) {
    const policyResponse = await request(`${UPLOAD_POLICY_URL}&model=${encodeURIComponent(MODEL)}`);
    const policyData = await responseJson(policyResponse, '无法获取百炼临时照片上传凭证。');
    const credential = policyData?.data;
    if (!credential?.upload_host || !credential?.upload_dir || !credential?.policy || !credential?.signature || !credential?.oss_access_key_id) {
      throw new Error('百炼临时照片上传凭证不完整。');
    }
    const extension = photo.type === 'image/png' ? 'png' : 'jpg';
    const objectKey = `${credential.upload_dir}/${randomUUID()}.${extension}`;
    const form = new FormData();
    form.append('OSSAccessKeyId', credential.oss_access_key_id);
    form.append('Signature', credential.signature);
    form.append('policy', credential.policy);
    form.append('x-oss-object-acl', credential.x_oss_object_acl || 'private');
    form.append('x-oss-forbid-overwrite', credential.x_oss_forbid_overwrite || 'true');
    form.append('key', objectKey);
    form.append('success_action_status', '200');
    form.append('file', new Blob([photo.bytes], { type: photo.type }), path.basename(objectKey));
    const upload = await fetchImpl(credential.upload_host, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
    if (!upload.ok) throw new Error('照片上传到百炼临时空间失败。');
    return `oss://${objectKey}`;
  }

  async function save(record) {
    const directory = path.join(root, record.id);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'model.json'), JSON.stringify(record, null, 2), { mode: 0o600 });
  }

  async function read(id) {
    try {
      return JSON.parse(await readFile(path.join(root, id, 'model.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  async function poll(record) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const response = await request(`${apiRoot}/tasks/${record.providerTaskId}`);
      const data = await responseJson(response, '百炼 3D 任务状态查询失败。');
      const output = data?.output;
      const state = output?.task_status;
      if (state === 'SUCCEEDED') {
        const result = output?.results?.[0];
        const url = result?.pbr_model_url || result?.model_url;
        if (!url) {
          record.status = 'failed';
          record.error = '云端任务成功，但没有返回可下载的 3D 模型。';
          record.progress = 100;
        } else {
          try {
            const bytes = await downloadModel(url, fetchImpl);
            await writeFile(path.join(root, record.id, 'model.glb'), bytes, { mode: 0o600 });
            record.status = 'success';
            record.progress = 100;
            record.modelUrl = `/api/3d/models/${record.id}/file.glb`;
          } catch {
            record.status = 'failed';
            record.error = '生成的 3D 模型下载或校验失败，请重新生成。';
          }
        }
        record.updatedAt = new Date().toISOString();
        await save(record);
        return publicRecord(record);
      }
      if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(state)) {
        record.status = 'failed';
        record.error = output?.message || (state === 'CANCELED' ? '云端 3D 任务已取消。' : '云端 3D 生成失败。');
        record.updatedAt = new Date().toISOString();
        await save(record);
        return publicRecord(record);
      }
      if (!['PENDING', 'RUNNING'].includes(state)) throw new Error('百炼返回了未知的 3D 任务状态。');
      record.status = state === 'RUNNING' ? 'running' : 'queued';
      record.progress = Math.max(0, Math.min(95, Number(output?.progress) || (state === 'RUNNING' ? 20 : 0)));
      record.updatedAt = new Date().toISOString();
      await save(record);
      if (attempt < 119) await new Promise(resolve => setTimeout(resolve, env.NODE_ENV === 'test' ? 1 : 15000));
    }
    record.status = 'failed';
    record.error = '云端生成超时，请稍后重新生成。';
    record.updatedAt = new Date().toISOString();
    await save(record);
    return publicRecord(record);
  }

  return {
    configured() {
      return Boolean(key && workspace && /^[a-z0-9-]+$/i.test(workspace));
    },
    async create(body) {
      const input = validateReconstructionInput(body);
      if (!this.configured()) throw new Error('尚未配置阿里云百炼 API Key 和 WorkspaceId。');
      const id = randomUUID();
      const now = new Date().toISOString();
      const record = {
        ...publicRecord({
          id, status: 'queued', progress: 0, approximate: input.photos.length === 1,
          views: input.photos.map(photo => photo.view),
          heightCm: input.heightCm, weightKg: input.weightKg, bodyCoverage: input.bodyCoverage, modelUrl: null, error: null,
          createdAt: now, updatedAt: now,
        }),
        providerTaskId: null,
      };
      await save(record);
      const files = [];
      for (const photo of input.photos) files.push(await uploadPhoto(photo));
      const generation = generationRequest(input.photos, files);
      const response = await request(`${apiRoot}${generation.endpoint}`, {
        method: 'POST',
        headers: { 'X-DashScope-Async': 'enable', 'X-DashScope-OssResourceResolve': 'enable' },
        body: JSON.stringify(generation.body),
      });
      const data = await responseJson(response, '百炼 3D 任务创建失败。');
      if (!data?.output?.task_id) throw new Error('百炼没有返回 3D 任务编号。');
      record.providerTaskId = data.output.task_id;
      record.updatedAt = new Date().toISOString();
      await save(record);
      return publicRecord(record);
    },
    async get(id) {
      const record = await read(id);
      if (!record) return null;
      if (['success', 'failed'].includes(record.status)) return publicRecord(record);
      if (!record.providerTaskId) return publicRecord(record);
      return poll(record);
    },
    async file(id) {
      const record = await read(id);
      return record?.status === 'success' ? path.join(root, id, 'model.glb') : null;
    },
  };
}
