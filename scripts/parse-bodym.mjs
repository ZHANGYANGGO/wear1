import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parse } from 'csv-parse/sync';
import { PNG } from 'pngjs';
import { extractContour, originalPoint } from '../src/create/contour.mjs';

const privateDir = fileURLToPath(new URL('../.private/', import.meta.url));
const dataset = path.join(privateDir, 'datasets', 'bodym');
const output = path.join(privateDir, 'bodym-analysis');
const baseline = { train: [6134, 62175717], testA: [1684, 17184116], testB: [1160, 12078444] };
const writeJSON = (filename, value) => writeFileSync(filename, JSON.stringify(value, null, 2));

function filesIn(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const key = prefix + entry.name;
    return entry.isDirectory() ? filesIn(path.join(dir, entry.name), key + '/') : [key];
  });
}

function indexed(rows) {
  const result = new Map();
  for (const row of rows) {
    if (!row.subject_id || result.has(row.subject_id)) throw new Error('Missing or duplicate subject in metadata/measurements');
    result.set(row.subject_id, row);
  }
  return result;
}

// Validate a sample by inverse-projecting every reported outer edge onto the source PNG.
function sampleView(source, contour) {
  const decoded = PNG.sync.read(source);
  const { frame, rows, issues } = contour;
  const paths = [[], []], warnings = [];
  let checked = 0;
  for (const [i, [level, left, right]] of rows.entries()) {
    if (left === null) continue;
    for (const [side, offset] of [left, right].entries()) {
      const p = originalPoint(frame, level, offset), x = Math.round(p.x), y = Math.round(p.y);
      const neighbor = x + (side === 0 ? -1 : 1);
      if (y !== frame.top + i || decoded.data[(y * decoded.width + x) * 4] < 128
          || (neighbor >= 0 && neighbor < decoded.width && decoded.data[(y * decoded.width + neighbor) * 4] >= 128)) {
        throw new Error('Sample edge did not match original mask pixel');
      }
      // SVG images occupy pixel cells; the centre of pixel (0,0) is (.5,.5).
      const point = (x + .5) + ' ' + (y + .5);
      // Adjacent rows may switch from a hand to the torso. Draw observed pixels only.
      paths[side].push('M' + point + 'v.1');
      if (issues.some(r => y >= r.fromRow && y <= r.toRow)) warnings.push('M' + point + 'v.1');
      checked++;
    }
  }
  const svg = '<image width="' + decoded.width + '" height="' + decoded.height + '" href="data:image/png;base64,' + source.toString('base64') + '"/>'
    + '<path stroke="#698fff" d="M' + (frame.axisX + .5) + ' ' + frame.top + 'V' + frame.bottom + '"/>'
    + '<g fill="none" stroke-width="2.5" stroke-linecap="round"><path stroke="#00c8ac" d="' + paths.flat().join('') + '"/>'
    + '<path stroke="#ff9a21" d="' + warnings.join('') + '"/></g>';
  return { checked, svg, width: decoded.width, height: decoded.height };
}

function saveSample(dir, name, record, images) {
  const views = ['front','side'].map(view => sampleView(images[view], record[view]));
  const panel = 330, height = 440;
  const groups = views.map((v, i) => {
    const scale = Math.min(panel / v.width, height / v.height);
    const x = i * panel + (panel - v.width * scale) / 2;
    return '<g transform="translate(' + x + ' 35) scale(' + scale + ')">' + v.svg + '</g>';
  });
  writeFileSync(path.join(dir, name + '.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="660" height="510" viewBox="0 0 660 510">'
    + '<rect width="660" height="510" fill="#fafafa"/><g font-family="sans-serif" font-size="17"><text x="12" y="24">正面</text><text x="342" y="24">侧面</text>'
    + groups.join('') + '<text x="12" y="498">蓝线：固定参考轴　青线：轮廓　橙色：不确定行段</text></g></svg>');
  writeJSON(path.join(dir, name + '.json'), record);
  return { name, photo_id: record.photo_id, status: record.status, edgesVerified: views.map(v => v.checked) };
}

export async function parseSplit({ split, root, dir, inventory = null }) {
  const local = path.join(root, split);
  const actual = filesIn(local), png = actual.filter(k => k.endsWith('.png')).length;
  const csv = actual.filter(k => k.endsWith('.csv')).length;
  const sizes = new Map(actual.map(k => [k, statSync(path.join(local, k)).size]));
  const bytes = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  const remote = new Map(inventory?.filter(i => i.key.startsWith(split + '/')).map(i => [i.key.slice(split.length + 1), i]));
  const differences = { missingKeys: [], extraKeys: [], wrongSize: [], baseline: [] };
  if (inventory) {
    for (const [k, item] of remote) {
      if (!sizes.has(k)) differences.missingKeys.push(k);
      else if (sizes.get(k) !== item.size) differences.wrongSize.push(k);
    }
    differences.extraKeys = actual.filter(k => !remote.has(k));
  }
  function read(key) {
    const data = readFileSync(path.join(local, key));
    const item = remote.get(key);
    if (item && (item.size !== data.length || (/^[a-f0-9]{32}$/i.test(item.etag)
        && createHash('md5').update(data).digest('hex') !== item.etag))) throw new Error('S3 checksum mismatch: ' + key);
    return data;
  }
  const csvRows = name => parse(read(name + '.csv'), { columns: true, bom: true, skip_empty_lines: true,
    cast(value, context) {
      if (context.header || ['subject_id', 'photo_id', 'gender'].includes(context.column)) return value;
      const number = Number(value);
      return value.trim() && Number.isFinite(number) ? number : null;
    } });
  const pairs = csvRows('subject_to_photo_map');
  const metadata = indexed(csvRows('hwg_metadata')), measurements = indexed(csvRows('measurements'));
  const counts = { expectedPairs: pairs.length, subjects: new Set(pairs.map(p => p.subject_id)).size,
    validPairs: 0, success: 0, partial: 0, failed: 0, missingMetadata: 0, missingMeasurements: 0 };
  for (const [field, observed, expected] of [['pairs', pairs.length, baseline[split][0]], ['png', png, 2 * baseline[split][0]],
    ['csv', csv, 3], ['bytes', bytes, baseline[split][1]]]) {
    if (observed !== expected) differences.baseline.push({ field, observed, expected });
  }
  const ids = new Set(), mapped = new Set(), samples = [];
  let savedArmExample = false;
  // Measurement targets are stored once per subject, outside the contour records.
  writeJSON(path.join(dir, split + '-measurements.json'), Object.fromEntries(measurements));
  function* records() {
    for (const { subject_id, photo_id } of pairs) {
      const meta = metadata.get(subject_id);
      if (!meta) counts.missingMetadata++;
      if (!measurements.has(subject_id)) counts.missingMeasurements++;
      const record = { split, subject_id, photo_id, metadata: meta ?? null, front: null, side: null };
      const images = {}, errors = {};
      if (!/^[a-zA-Z0-9_-]+$/.test(photo_id) || ids.has(photo_id)) errors.mapping = 'Invalid or duplicate photo ID';
      ids.add(photo_id);
      let decoded = 0;
      if (!errors.mapping) for (const [view, folder] of [['front','mask'], ['side','mask_left']]) {
        const key = folder + '/' + photo_id + '.png';
        mapped.add(key);
        try {
          images[view] = read(key);
          const { data, width, height } = PNG.sync.read(images[view], { checkCRC: true });
          decoded++;
          record[view] = extractContour(data, width, height, { stride: 4, threshold: 128, view });
        } catch (e) { errors[view] = e.message; }
      }
      if (decoded === 2) counts.validPairs++;
      if (Object.keys(errors).length) { record.status = 'failed'; record.errors = errors; }
      else record.status = [record.front,record.side].some(v => v.status === 'partial') ? 'partial' : 'success';
      counts[record.status]++;
      if (record.status !== 'failed') {
        if (samples.length === 0) samples.push(saveSample(dir, split + '-sample', record, images));
        else if (!savedArmExample && record.status === 'partial') {
          const front = record.front;
          const armExample = front.issues.some(r => r.reason.includes('arm-separation')
            && r.toRow - r.fromRow >= .035 * (front.frame.bottom - front.frame.top));
          if (samples.length === 1 || armExample) {
            samples[1] = saveSample(dir, split + '-partial', record, images);
            savedArmExample = armExample;
          }
        }
      }
      yield JSON.stringify(record) + '\n';
    }
  }
  await pipeline(Readable.from(records()), createGzip({ level: 1 }), createWriteStream(path.join(dir, split + '.ndjson.gz')));
  differences.unmappedPNG = actual.filter(k => k.endsWith('.png') && !mapped.has(k));
  const result = { split, png, csv, bytes, ...counts, samples, differences };
  writeJSON(path.join(dir, split + '-report.json'), result);
  return result;
}

async function run() {
  mkdirSync(output, { recursive: true });
  const dir = mkdtempSync(path.join(output, 'run-'));
  const manifest = path.join(output, 'inventory.json');
  const jobs = Object.keys(baseline).map(split => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { split, root: dataset, dir, manifest } });
    worker.once('message', result => { console.log(split, result.success, 'success,', result.partial, 'partial,', result.failed, 'failed'); resolve(result); });
    worker.once('error', reject);
    worker.once('exit', code => { if (code) reject(new Error('Worker exited ' + code)); });
  }));
  const splits = await Promise.all(jobs);
  const report = { dataset, dir, checkedAgainstInventory: existsSync(manifest), splits };
  writeJSON(path.join(dir, 'report.json'), report);
  // Publish only after all three partitions and overlays have closed successfully.
  const temp = path.join(output, path.basename(dir) + '-latest.tmp');
  writeJSON(temp, report); renameSync(temp, path.join(output, 'latest.json'));
  console.log('Full report:', path.join(dir, 'report.json'));
  if (splits.some(s => s.failed || s.missingMetadata || s.missingMeasurements || Object.values(s.differences).some(a => a.length))) process.exitCode = 1;
}

if (!isMainThread && workerData?.manifest) {
  const inventory = existsSync(workerData.manifest) ? JSON.parse(readFileSync(workerData.manifest, 'utf8')) : null;
  parentPort.postMessage(await parseSplit({ ...workerData, inventory }));
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run();
}
