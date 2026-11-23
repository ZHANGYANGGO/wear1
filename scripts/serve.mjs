import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { garmentCatalog } from '../src/wardrobe/garments.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.argv[2] ?? 4173);
const privateRoot = process.env.WEARMATE_PRIVATE_PROFILE_DIR
  ? path.resolve(process.env.WEARMATE_PRIVATE_PROFILE_DIR) : null;
const privateAsset = /^\/local-profile\/sprites\/((?:role-(?:head|arms|ankles)|(?:brick-tee|espresso-jacket|blue-denim|oat-trousers|cream-trainers|penny-loafers)(?:-thumb)?)\.webp)$/;
const wardrobeOriginals = new Map(garmentCatalog.map(({ originalImage }) =>
  [originalImage.slice(1), path.join(root, '.local-wardrobe-references', path.basename(originalImage))]));
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
    if (wardrobeOriginals.has(route)) {
      const { port: actualPort } = server.address();
      if (![ `127.0.0.1:${actualPort}`, `localhost:${actualPort}` ].includes(request.headers.host)) {
        response.writeHead(400).end();
        return;
      }
      const data = await fs.readFile(wardrobeOriginals.get(route));
      response.writeHead(200, {
        'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
      return;
    }
    if (route.startsWith('/local-profile/')) {
      const address = server.address();
      if (![ `127.0.0.1:${address.port}`, `localhost:${address.port}` ].includes(request.headers.host)) {
        response.writeHead(400).end();
        return;
      }
      if (route === '/local-profile/manifest.json') {
        let manifest = null;
        if (privateRoot) {
          try {
            const { photoSha256 } = JSON.parse(await fs.readFile(path.join(privateRoot, 'manifest.json'), 'utf8'));
            if (/^[a-f0-9]{64}$/.test(photoSha256)) manifest = { photoSha256 };
          } catch {
            // An unavailable optional profile must not interrupt Mila or the synthetic samples.
          }
        }
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : JSON.stringify(manifest));
        return;
      }
      const asset = route.match(privateAsset);
      if (privateRoot && asset) {
        const data = await fs.readFile(path.join(privateRoot, asset[1]));
        response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : data);
        return;
      }
      response.writeHead(404).end();
      return;
    }
    const publicRoute = ['/', '/index.html', '/stage1a.html', '/create.html', '/wardrobe.html'].includes(route)
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
