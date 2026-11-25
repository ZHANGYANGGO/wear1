export const levels = { hips: .83, belly: .96, waist: 1.06, chest: 1.212 };
export const girthNames = ['chest', 'waist', 'hips'];

// Read the single, identity-transform Body primitive shared by the shipped template
// and our baked GLBs. Accessories have separate nodes, even after GLTFExporter.
export function bodyFromGLB(bytes) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.getUint32(0, true) !== 0x46546c67) throw new Error('需要二进制 GLB。');
  const length = data.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  const node = json.nodes.find(n => n.name === 'Body');
  const primitive = json.meshes[node?.mesh]?.primitives[0];
  if (!primitive) throw new Error('找不到 WearMate 人体网格。');
  function attribute(id) {
    const a = json.accessors[id], v = json.bufferViews[a.bufferView];
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    const size = a.type === 'VEC3' ? 3 : 1;
    if (!Type || (v.byteStride && v.byteStride !== Type.BYTES_PER_ELEMENT * size)) throw new Error('不支持的网格属性布局。');
    return new Type(bytes.buffer, bytes.byteOffset + 28 + length + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * size);
  }
  return { positions: attribute(primitive.attributes.POSITION), indices: attribute(primitive.indices),
    weights: primitive.attributes._ARM_WEIGHT == null ? null : attribute(primitive.attributes._ARM_WEIGHT) };
}

function interpolate(a, b, t) { return a.map((value, i) => value + t * (b[i] - value)); }

// Intersect rest triangles once. Weld coincident seam vertices in the plane and
// keep the closed component spanning the midline. Store edge barycentric anchors
// so the tape follows the same anatomical surface after a fit or export.
function torsoRing(mesh, y) {
  const { positions: xyz, indices } = mesh, nodes = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const hits = [];
    for (let j = 0; j < 3; j++) {
      const a = indices[i+j], b = indices[i+(j+1)%3], ya = xyz[3*a+1], yb = xyz[3*b+1];
      if ((ya < y) === (yb < y)) continue;
      const t = (y-ya)/(yb-ya);
      const x = xyz[3*a] + t*(xyz[3*b]-xyz[3*a]), z = xyz[3*a+2] + t*(xyz[3*b+2]-xyz[3*a+2]);
      const key = Math.round(x*1e7) + ',' + Math.round(z*1e7);
      if (!nodes.has(key)) nodes.set(key, { a,b,t,x, neighbors: new Set() });
      hits.push(nodes.get(key));
    }
    if (hits.length === 2 && hits[0] !== hits[1]) {
      hits[0].neighbors.add(hits[1]); hits[1].neighbors.add(hits[0]);
    }
  }
  const seen = new Set(), loops = [];
  for (const first of nodes.values()) {
    if (seen.has(first)) continue;
    const loop = []; let current = first, previous;
    while (current && !seen.has(current) && current.neighbors.size === 2) {
      seen.add(current); loop.push(current);
      const next = [...current.neighbors].find(p => p !== previous);
      previous = current; current = next;
    }
    if (current === first && loop.some(p => p.x < -.04) && loop.some(p => p.x > .04)) loops.push(loop);
  }
  if (loops.length !== 1) throw new Error('躯干测量环不唯一，模板高度 ' + y);
  return loops[0].map(({a,b,t}) => ({a,b,t}));
}

export function createTape(mesh) {
  const rings = Object.fromEntries(Object.entries(levels).map(([key,y]) => [key, torsoRing(mesh,y)]));
  let foot=0, crown=0;
  for(let i=1; i<mesh.positions.length/3; i++) {
    if(mesh.positions[3*i+1]<mesh.positions[3*foot+1]) foot=i;
    if(mesh.positions[3*i+1]>mesh.positions[3*crown+1]) crown=i;
  }
  return { rings, foot, crown, count: mesh.positions.length/3 };
}

export function measureMesh(tape, positions, deform, weights) {
  if (positions.length !== 3*tape.count) throw new Error('人体拓扑与软尺不匹配。');
  const cache = new Map();
  function point(i) {
    if (!cache.has(i)) {
      const x=positions[3*i], y=positions[3*i+1], z=positions[3*i+2];
      cache.set(i, deform ? deform(x,y,z,weights?.[i] ?? 0) : [x,y,z]);
    }
    return cache.get(i);
  }
  const paths={}, bounds={}, cm={height: (point(tape.crown)[1]-point(tape.foot)[1])*100};
  for (const [name, anchors] of Object.entries(tape.rings)) {
    const points=anchors.map(({a,b,t}) => interpolate(point(a),point(b),t));
    let distance=0, left=Infinity, right=-Infinity, back=Infinity, front=-Infinity;
    points.forEach(([x,y,z],i) => {
      const next=points[(i+1)%points.length];
      distance+=Math.hypot(next[0]-x,next[1]-y,next[2]-z);
      left=Math.min(left,x); right=Math.max(right,x); back=Math.min(back,z); front=Math.max(front,z);
    });
    cm[name]=100*distance; paths[name]=points; bounds[name]={left,right,back,front};
  }
  return {cm,paths,bounds};
}

export function prepareTemplate(bytes) {
  const mesh=bodyFromGLB(bytes), tape=createTape(mesh);
  return {mesh,tape,rest:measureMesh(tape,mesh.positions)};
}
let pending;
export function localTemplate() {
  return pending ??= fetch('/assets/3d/fitting-body.glb').then(async r => {
    if(!r.ok) throw new Error('人体模板读取失败。');
    return prepareTemplate(new Uint8Array(await r.arrayBuffer()));
  }).catch(error => { pending=null; throw error; });
}

