export const tiers = { quick: '快速人台', photos: '双视角拟合', measured: '实测围度', appearance: '外观增强' };
export const templateHeight = 1.6594313383102417;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Neutral torso sections in metres, sampled in the template's standing pose.
const sections = {
  hips: [0.83, 0.352, 0.210],
  waist: [1.06, 0.258, 0.179],
  chest: [1.212, 0.306, 0.214],
  shoulders: [1.357, 0.408, 0.145],
};
// Shoulder joint centres in the MakeHuman template's bind pose (metres).
const shoulderPivot = { x: .1700, y: 1.3201, z: .0193 };
export const templateShoulderJointSpan = 2 * shoulderPivot.x;
export const templateShoulderBreadth = sections.shoulders[1];

function within(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(label + '需在 ' + min + '–' + max + ' 之间。');
  return value;
}

export function ellipseGirth(width, depth) {
  return Math.PI / 2 * (3 * (width + depth) - Math.sqrt((3 * width + depth) * (width + 3 * depth)));
}

// Fit the four log-scales together: a height/weight prior at zero, a robust
// observation at each band, and a penalty on differences between neighbors.
function fitSilhouetteAxis(view, dimension, build) {
  const diagonal = [], rhs = [];
  const coupling = .45, prior = .7, transition = .20;
  for (const [name, section] of Object.entries(sections)) {
    const observed = view?.[name];
    if (!Number.isFinite(observed) || observed <= 0) throw new Error('请提供可辨认的正面与侧面全身照。');
    const delta = Math.log(observed) - Math.log(section[dimension] * build / templateHeight);
    const confidence = clamp(view.confidence?.[name] ?? 1, 0, 1);
    const weight = confidence * (Math.abs(delta) <= transition ? 1 : transition / Math.abs(delta));
    diagonal.push(prior + weight);
    rhs.push(weight * delta);
  }
  // Tridiagonal system for the chain hips–waist–chest–shoulders.
  for (let i = 1; i < diagonal.length; i++) { diagonal[i - 1] += coupling; diagonal[i] += coupling; }
  for (let i = 1; i < diagonal.length; i++) {
    const factor = coupling / diagonal[i - 1];
    diagonal[i] -= factor * coupling;
    rhs[i] += factor * rhs[i - 1];
  }
  for (let i = rhs.length - 1; i >= 0; i--) rhs[i] = (rhs[i] + coupling * (rhs[i + 1] ?? 0)) / diagonal[i];
  return rhs.map(value => build * Math.exp(value));
}

export function fitBody({ tier, heightCm, weightKg, views, girths = {}, adjust = {} }) {
  if (!Object.hasOwn(tiers, tier)) throw new Error('请选择建模方式。');
  within(heightCm, 80, 250, '身高（cm）');
  within(weightKg, 20, 300, '体重（kg）');
  const stature = heightCm / 100 / templateHeight;
  const build = clamp(Math.sqrt(weightKg / (heightCm / 100) ** 2 / 22), .72, 1.65);
  const bands = [[0, 1, 1], [.32, .7 + .3 * build, .7 + .3 * build]];
  const widths = tier === 'quick' ? null : fitSilhouetteAxis(views?.front, 1, build);
  const depths = tier === 'quick' ? null : fitSilhouetteAxis(views?.side, 2, build);
  for (const [name, [y, width, depth]] of Object.entries(sections)) {
    const index = bands.length - 2;
    let x = widths?.[index] ?? build, z = depths?.[index] ?? build;
    if (tier === 'quick') {
      const slider = within(adjust[name] ?? 0, -25, 25, '体型微调');
      x *= 1 + slider / 100;
      if (name !== 'shoulders') z *= 1 + slider / 100;
    }
    if (name !== 'shoulders' && (tier === 'measured' || (tier === 'appearance' && girths[name] != null))) {
      const cm = within(girths[name], 35, 220, '实测围度（cm）');
      const factor = cm / (ellipseGirth(x * width, z * depth) * stature * 100);
      x *= factor;
      z *= factor;
    }
    bands.push([y, x, z]);
  }
  bands.push([1.47, 1, 1], [templateHeight, 1, 1]);
  const lengths = { hip: .874, shoulder: 1.357 };
  if (views?.front && views?.side && tier !== 'quick') {
    for (const key of Object.keys(lengths)) {
      const values = [views.front[key + 'Height'], views.side[key + 'Height']];
      if (values.every(Number.isFinite)) {
        const observed = templateHeight * (values[0] + values[1]) / 2;
        lengths[key] = clamp(observed, lengths[key] - .095, lengths[key] + .095);
      }
    }
  }
  const record = { kind: 'local', id: crypto.randomUUID(), tier, heightCm, weightKg, bands, lengths };
  if (tier !== 'quick') record.photoFitVersion = 2;
  return record;
}

// Unmeasured v1 photo records have only the old mixed band scales left. Recover
// their clamped observations; treat them conservatively since the masks are gone.
export function upgradePhotoFit(record) {
  if (record.tier !== 'photos' || record.photoFitVersion != null) return record;
  const build = clamp(Math.sqrt(record.weightKg / (record.heightCm / 100) ** 2 / 22), .72, 1.65);
  const bands = record.bands.map(b => [...b]);
  for (const dim of [1, 2]) {
    const view = { confidence: {} };
    Object.entries(sections).forEach(([name, section], i) => {
      view[name] = clamp((bands[i+2][dim] - .14 * build) / .86, .62, 1.9) * section[dim] / templateHeight;
      view.confidence[name] = .35;
    });
    fitSilhouetteAxis(view, dim, build).forEach((v,i) => { bands[i+2][dim] = v; });
  }
  return { ...record, bands, photoFitVersion: 2 };
}

function bandScales(y, bands) {
  let i = 1;
  while (i < bands.length - 1 && y > bands[i][0]) i++;
  const [low, a, b] = bands[i - 1], [high, c, d] = bands[i];
  const u = clamp((y - low) / (high - low), 0, 1);
  const t = u * u * (3 - 2 * u);
  return [a + (c - a) * t, b + (d - b) * t];
}

export function createPointDeformer(profile) {
  const scale = profile.heightCm / 100 / templateHeight, spine = .025;
  const hip = profile.lengths?.hip ?? .874, shoulder = profile.lengths?.shoulder ?? 1.357;
  function level(y) {
    if (y < .874) return y * hip / .874;
    if (y < 1.357) return hip + (y - .874) * (shoulder - hip) / (1.357 - .874);
    return shoulder + (y - 1.357) * (templateHeight - shoulder) / (templateHeight - 1.357);
  }
  const [sx, sz] = bandScales(shoulderPivot.y, profile.bands);
  const dx = shoulderPivot.x * (sx - 1), dy = level(shoulderPivot.y) - shoulderPivot.y;
  const dz = (shoulderPivot.z - spine) * (sz - 1);
  return (x, y, z, armWeight = 0) => {
    const [width, depth] = bandScales(y, profile.bands);
    let px = x * width, py = level(y), pz = spine + (z - spine) * depth;
    if (profile.tier !== 'quick' && armWeight > 0) {
      // Translate the arm with its shoulder. The original rig weights blend the
      // shoulder seam; the fully weighted forearm and hand keep their shape.
      px += armWeight * (x + Math.sign(x) * dx - px);
      py += armWeight * (y + dy - py);
      pz += armWeight * (z + dz - pz);
    }
    return [px * scale, py * scale, pz * scale];
  };
}

export function deformPoint(x, y, z, profile, armWeight = 0) {
  return createPointDeformer(profile)(x, y, z, armWeight);
}

export function validLocalFit(record) {
  return (record.lengths == null || (Number.isFinite(record.lengths.hip) && Number.isFinite(record.lengths.shoulder)
    && record.lengths.hip > 0 && record.lengths.hip < record.lengths.shoulder && record.lengths.shoulder < templateHeight))
    && Object.hasOwn(tiers, record.tier) && record.heightCm >= 80 && record.heightCm <= 250
    && record.weightKg >= 20 && record.weightKg <= 300 && Array.isArray(record.bands) && record.bands.length === 8
    && record.bands.every((row, i) => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)
      && row[1] > 0 && row[2] > 0 && (i === 0 || row[0] > record.bands[i - 1][0]));
}

