export class SubjectMaskError extends Error {}

// Eight-connected runs let us discard isolated speckles without a second full-size mask.
function subjectRows(mask, width, height, stride, threshold) {
  const parent = [], areas = [], all = [];
  function root(i) {
    while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  let previous = [];
  for (let y = 0; y < height; y++) {
    const row = [], start = y * width * stride;
    let cursor = 0, x = 0;
    while (x < width) {
      while (x < width && mask[start + x * stride] < threshold) x++;
      if (x === width) break;
      const left = x++;
      while (x < width && mask[start + x * stride] >= threshold) x++;
      const right = x - 1;
      while (cursor < previous.length && previous[cursor].right < left - 1) cursor++;
      let id;
      for (let i = cursor; i < previous.length && previous[i].left <= right + 1; i++) {
        const neighbor = root(previous[i].id);
        if (id === undefined) id = neighbor;
        else if (neighbor !== id) { parent[neighbor] = id; areas[id] += areas[neighbor]; }
      }
      if (id === undefined) { id = parent.length; parent.push(id); areas.push(0); }
      areas[id] += right - left + 1;
      row.push({ left, right, id });
    }
    all.push(row);
    previous = row;
  }
  let main = -1;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] === i && (main < 0 || areas[i] > areas[main])) main = i;
  }
  if (main < 0 || areas[main] === width * height || areas[main] < Math.max(8, width * height * .001))
    throw new SubjectMaskError('无法从遮罩提取主体，请使用人物与背景清晰分开的全身照。');
  const bounds = new Map();
  for (const [y, row] of all.entries()) for (const run of row) {
    run.id = root(run.id);
    if (areas[run.id] < areas[main] * .025) continue;
    const b = bounds.get(run.id) ?? { left: width, right: -1, top: y, bottom: y };
    b.left = Math.min(b.left, run.left); b.right = Math.max(b.right, run.right); b.bottom = y;
    bounds.set(run.id, b);
  }
  const body = bounds.get(main), keep = new Set([main]);
  // Retain substantial vertically separated pieces aligned with the body, and report the gap.
  for (const [id, b] of bounds) {
    const overlap = Math.min(body.right, b.right) - Math.max(body.left, b.left) + 1;
    const gap = Math.max(b.top - body.bottom, body.top - b.bottom) - 1;
    if (overlap > .35 * Math.min(b.right - b.left + 1, body.right - body.left + 1)
        && gap > 0 && gap <= .12 * height) keep.add(id);
  }
  return all.map(row => row.filter(run => keep.has(run.id)));
}

const rounded = n => Math.round(n * 1e6) / 1e6;

export function originalPoint(frame, level, offset) {
  const { maskWidth, maskHeight, originalWidth, originalHeight, axisX, top, bottom } = frame;
  const span = bottom - top;
  return {
    x: (axisX + .5) * originalWidth / maskWidth - .5 + offset * span * originalHeight / maskHeight,
    y: (bottom - level * span + .5) * originalHeight / maskHeight - .5,
  };
}

function profileDirection(points, frame) {
  if (!points) return null;
  const { maskWidth, bottom, top } = frame;
  // Require the nose-to-ear and toe-to-heel projections to agree on the same visible side.
  for (const [ear, heel, toe] of [[7,29,31], [8,30,32]]) {
    if (![0, ear, heel, toe].every(i => points[i]?.visibility >= .65)) continue;
    const face = (points[0].x - points[ear].x) * maskWidth / (bottom - top);
    const foot = (points[toe].x - points[heel].x) * maskWidth / (bottom - top);
    if (Math.abs(face) > .025 && Math.abs(foot) > .035 && Math.sign(face) === Math.sign(foot)) {
      return face < 0 ? { anterior: 'left', posterior: 'right' } : { anterior: 'right', posterior: 'left' };
    }
  }
  return null;
}

// Rows run head to foot. Columns are relative height, signed left and right offsets,
// and (when separated) the intervals of visible foreground on that row.
export function extractContour(mask, width, height, options = {}) {
  const { stride = 1, threshold = .58, probabilityMask = false, view, landmarks = null, worldLandmarks = null,
    inputWidth = width, inputHeight = height, originalWidth = width, originalHeight = height } = options;
  if (!['front', 'side'].includes(view) || !Number.isInteger(width) || !Number.isInteger(height)
      || width < 1 || height < 2 || mask.length !== width * height * stride) throw new Error('无效的遮罩尺寸或视角');
  const visible = subjectRows(mask, width, height, stride, threshold);
  let top = height, bottom = -1, left = width, right = -1;
  for (const [y, row] of visible.entries()) {
    if (!row.length) continue;
    top = Math.min(top, y); bottom = y;
    left = Math.min(left, row[0].left); right = Math.max(right, row.at(-1).right);
  }
  if (bottom <= top || right <= left) throw new SubjectMaskError('主体轮廓退化，请换用清晰的全身照。');
  const axisX = (left + right) / 2, span = bottom - top;
  const frame = { maskWidth: width, maskHeight: height, inputWidth, inputHeight, originalWidth, originalHeight,
    left, right, top, bottom, axisX };
  const xScale = (originalWidth / width) / (originalHeight / height) / span;
  const offset = x => rounded((x - axisX) * xScale);
  const rows = [], issues = [], last = new Map();
  const arms = { left: { ended: false }, right: { ended: false } };
  function mark(reason, y) {
    const prior = last.get(reason);
    if (prior?.toRow === y - 1) prior.toRow = y;
    else {
      const interval = { reason, fromRow: y, toRow: y };
      last.set(reason, interval); issues.push(interval);
    }
  }
  for (let y = top; y <= bottom; y++) {
    const runs = visible[y], level = rounded((bottom - y) / span);
    if (!runs.length) { rows.push([level, null, null]); mark('missing-boundary', y); continue; }
    const first = runs[0].left, end = runs.at(-1).right;
    const row = [level, offset(first), offset(end)];
    if (runs.length > 1) row.push(runs.map(r => [offset(r.left), offset(r.right)]));
    rows.push(row);
    if (first === 0 || end === width - 1 || y === 0 || y === height - 1) mark('frame-edge', y);
    if (probabilityMask) {
      // A soft transition on both sides of the chosen threshold localizes an ambiguous edge.
      const d = Math.max(2, Math.round(span * .008));
      for (const [edge, inward, label] of [[first, 1, 'left'], [end, -1, 'right']]) {
        const inside = edge + d * inward, outside = edge - d * inward;
        if (inside < first || inside > end || outside < 0 || outside >= width) continue;
        const a = mask[(y * width + inside) * stride], b = mask[(y * width + outside) * stride];
        if (a >= threshold && a < .82 && b > .25 && b < threshold) mark(label + '-soft-boundary', y);
      }
    }
    // In the waist region a single unsplit front outline cannot distinguish arms resting
    // against the torso. This is an uncertainty flag, not an inferred anatomical waist.
    if (view === 'front' && level >= .48 && level <= .75) {
      // The centre can fall in a narrow gap between the thighs. Treat both central
      // runs as body before looking for the much farther lateral forearms.
      const centre = runs.filter(r => r.right >= axisX - .035 * span && r.left <= axisX + .035 * span);
      if (!centre.length) { if (level <= .60) mark('torso-location-uncertain', y); continue; }
      const gap = Math.max(1, span * .009);
      for (const side of ['left', 'right']) {
        const isLeft = side === 'left', outer = isLeft ? first : end;
        const separated = isLeft ? first < centre[0].left && runs[0].right < centre[0].left - gap
          : end > centre.at(-1).right && runs.at(-1).left > centre.at(-1).right + gap;
        const arm = arms[side];
        if (separated) arm.ended = false;
        else if (arm.separated && (isLeft ? outer - arm.outer : arm.outer - outer) > gap) arm.ended = true;
        if (level <= .60 && !separated && !arm.ended) mark(side + '-arm-separation-uncertain', y);
        arm.separated = separated; arm.outer = outer;
      }
    } else if (view === 'side' && landmarks && level >= .48 && level <= .60) {
      for (const i of [13, 14]) {
        const elbow = landmarks[i], wrist = landmarks[i + 2];
        if (!elbow || !wrist || Math.min(elbow.visibility, wrist.visibility) < .65) continue;
        const t = (y / height - elbow.y) / (wrist.y - elbow.y);
        const x = (elbow.x + t * (wrist.x - elbow.x)) * width;
        if (t >= 0 && t <= 1 && x >= first && x <= end) { mark('projected-arm-overlap', y); break; }
      }
    }
  }
  return { version: 1, view, frame, rows, issues, status: issues.length ? 'partial' : 'success',
    direction: view === 'side' ? profileDirection(landmarks, frame) : null,
    landmarks, worldLandmarks, camera: null };
}
