import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.argv[2] ?? 4173);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const route = decodeURIComponent(url.pathname);
    const publicRoute = route === '/' || route === '/index.html'
      || /^\/(assets|src)\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:css|mjs|svg|webp)$/i.test(route);
    if (!publicRoute) {
      response.writeHead(404).end();
      return;
    }
    const filename = path.join(root, route === '/' ? '/index.html' : route);
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
  } catch {
    response.writeHead(404).end();
  }
});

server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`WearMate  http://${host}:${server.address().port}/`);
});
