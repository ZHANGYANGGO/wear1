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

function within(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(label + '需在 ' + min + '–' + max + ' 之间。');
  return value;
}

export function ellipseGirth(width, depth) {
  return Math.PI / 2 * (3 * (width + depth) - Math.sqrt((3 * width + depth) * (width + 3 * depth)));
}

export function fitBody({ tier, heightCm, weightKg, views, girths = {}, adjust = {} }) {
  if (!Object.hasOwn(tiers, tier)) throw new Error('请选择建模方式。');
  within(heightCm, 80, 250, '身高（cm）');
  within(weightKg, 20, 300, '体重（kg）');
  const stature = heightCm / 100 / templateHeight;
  const build = clamp(Math.sqrt(weightKg / (heightCm / 100) ** 2 / 22), .72, 1.65);
  const bands = [[0, 1, 1], [.32, .7 + .3 * build, .7 + .3 * build]];
  for (const [name, [y, width, depth]] of Object.entries(sections)) {
    let x = build, z = build;
    if (tier !== 'quick') {
      const front = views?.front?.[name], side = views?.side?.[name];
      if (![front, side].every(v => Number.isFinite(v) && v > 0)) throw new Error('请提供可辨认的正面与侧面全身照。');
      x = .14 * build + .86 * clamp(front * templateHeight / width, .62, 1.9);
      z = .14 * build + .86 * clamp(side * templateHeight / depth, .62, 1.9);
    }
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
  return { kind: 'local', id: crypto.randomUUID(), tier, heightCm, weightKg, bands, lengths };
}

export function deformPoint(x, y, z, profile) {
  const { bands, heightCm } = profile;
  let i = 1;
  while (i < bands.length - 1 && y > bands[i][0]) i++;
  const [low, a, b] = bands[i - 1], [high, c, d] = bands[i];
  const u = clamp((y - low) / (high - low), 0, 1);
  const t = u * u * (3 - 2 * u);
  const scale = heightCm / 100 / templateHeight;
  const spine = .025;
  const hip = profile.lengths?.hip ?? .874, shoulder = profile.lengths?.shoulder ?? 1.357;
  let fittedY;
  if (y < .874) fittedY = y * hip / .874;
  else if (y < 1.357) fittedY = hip + (y - .874) * (shoulder - hip) / (1.357 - .874);
  else fittedY = shoulder + (y - 1.357) * (templateHeight - shoulder) / (templateHeight - 1.357);
  return [x * (a + (c - a) * t) * scale, fittedY * scale, (spine + (z - spine) * (b + (d - b) * t)) * scale];
}

export function validLocalFit(record) {
  return (record.lengths == null || (Number.isFinite(record.lengths.hip) && Number.isFinite(record.lengths.shoulder)
    && record.lengths.hip > 0 && record.lengths.hip < record.lengths.shoulder && record.lengths.shoulder < templateHeight))
    && Object.hasOwn(tiers, record.tier) && record.heightCm >= 80 && record.heightCm <= 250
    && record.weightKg >= 20 && record.weightKg <= 300 && Array.isArray(record.bands) && record.bands.length === 8
    && record.bands.every((row, i) => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)
      && row[1] > 0 && row[2] > 0 && (i === 0 || row[0] > record.bands[i - 1][0]));
}

