import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReconstructionService } from './reconstruction.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.argv[2] ?? 4173);
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const reconstruction = createReconstructionService({ root: path.join(root, '.private', '3d-models') });
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
};

function json(response, status, body, head = false) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  response.end(head ? undefined : data);
}

async function body(request) {
  const length = Number(request.headers['content-length'] || 0);
  if (length > 60 * 1024 * 1024) throw Object.assign(new Error('上传内容超过 60 MB。'), { statusCode: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 60 * 1024 * 1024) throw Object.assign(new Error('上传内容超过 60 MB。'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求必须是有效的 JSON。'), { statusCode: 400 });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const route = decodeURIComponent(url.pathname);
    if (route.startsWith('/api/3d/')) {
      const address = server.address();
      if (![`127.0.0.1:${address.port}`, `localhost:${address.port}`].includes(request.headers.host)) {
        json(response, 400, { error: '无效的本机访问地址。' });
        return;
      }
      if (route === '/api/3d/config' && request.method === 'GET') {
        json(response, 200, { provider: '阿里云百炼 · Tripo-H3.1', configured: reconstruction.configured() });
        return;
      }
      if (route === '/api/3d/models' && request.method === 'POST') {
        const record = await reconstruction.create(await body(request));
        json(response, 202, record);
        return;
      }
      const statusRoute = route.match(/^\/api\/3d\/models\/([a-f0-9-]{36})$/);
      if (statusRoute && request.method === 'GET') {
        const record = await reconstruction.get(statusRoute[1]);
        json(response, record ? 200 : 404, record || { error: '找不到该 3D 生成任务。' });
        return;
      }
      const fileRoute = route.match(/^\/api\/3d\/models\/([a-f0-9-]{36})\/file\.glb$/);
      if (fileRoute && (request.method === 'GET' || request.method === 'HEAD')) {
        const filename = await reconstruction.file(fileRoute[1]);
        if (!filename) {
          json(response, 404, { error: '3D 模型尚未生成或不存在。' }, request.method === 'HEAD');
          return;
        }
        const file = await fs.stat(filename);
        response.writeHead(200, {
          'Content-Type': mime['.glb'],
          'Content-Length': file.size,
          'Content-Disposition': `inline; filename="wearmate-${fileRoute[1]}.glb"`,
          'Cache-Control': 'private, no-store',
          'Cross-Origin-Resource-Policy': 'same-origin',
        });
        if (request.method === 'HEAD') response.end();
        else createReadStream(filename).on('error', () => response.destroy()).pipe(response);
        return;
      }
      json(response, 404, { error: '接口不存在。' });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD, POST' }).end();
      return;
    }
    const vendorRoute = route.match(/^\/vendor\/three\/((?:build|examples\/jsm)\/(?:[a-z0-9-]+\/)*[a-z0-9.-]+\.js)$/i);
    const poseRoute = route.match(/^\/vendor\/pose\/(vision_bundle\.mjs|wasm\/vision_wasm_(?:nosimd_)?internal\.(?:js|wasm))$/);
    const publicRoute = vendorRoute || poseRoute || route === '/assets/3d/pose-lite.task' || ['/', '/index.html', '/stage1a.html', '/create.html', '/wardrobe.html', '/appearance.html'].includes(route)
      || /^\/(assets|src)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:css|mjs|svg|webp|glb)$/i.test(route);
    if (!publicRoute) {
      response.writeHead(404).end();
      return;
    }
    const filename = vendorRoute ? path.join(root, 'node_modules', 'three', vendorRoute[1])
      : poseRoute ? path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', poseRoute[1])
      : path.join(root, route === '/' ? '/index.html' : route);
    const file = await fs.stat(filename);
    const contentType = mime[path.extname(filename)];
    if (!file.isFile() || !contentType) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': file.size,
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    if (routeIsApi(request)) json(response, error.statusCode || 502, { error: error.message || '云端 3D 服务暂时不可用。' });
    else response.writeHead(404).end();
  }
});

function routeIsApi(request) {
  return request.url?.startsWith('/api/');
}

server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`WearMate 3D  http://${host}:${server.address().port}/`);
  console.log(`阿里云百炼 Tripo: ${reconstruction.configured() ? '已配置' : '未配置（在 .env 设置 DASHSCOPE_API_KEY 和 DASHSCOPE_WORKSPACE_ID）'}`);
});
