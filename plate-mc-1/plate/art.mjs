// Original Canvas illustrations. All positions use a 64-pixel floor grid.
const TILE = 64;
const ink = "#354338";
const cream = "#fff7dc";
const darkWood = "#755438";

function box(ctx, x, y, w, h, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  paint(ctx, fill, stroke);
}
function oval(ctx, x, y, rx, ry, fill, stroke) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  paint(ctx, fill, stroke);
}
function paint(ctx, fill, stroke) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function line(ctx, points, color, width = 1.5) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  paint(ctx, null, color);
  ctx.restore();
}
function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  paint(ctx, fill, stroke);
}
function tileDetails(ctx, x, y, kitchen) {
  const offset = ((x * 13 + y * 7) % 43) + 4;
  const left = x * TILE;
  const top = y * TILE;
  if (kitchen) {
    ctx.fillStyle = (x + y) % 2 ? "#c9d6c6" : "#d4ddca";
    ctx.fillRect(left, top, TILE, TILE);
    line(ctx, [left + 1, top + 63, left + 63, top + 63, left + 63, top + 1], "#b7c4b5", 2);
    line(ctx, [left + 2, top + 61, left + 2, top + 2, left + 61, top + 2], "#e4e8d6", 1);
    ctx.fillStyle = "#b8c8b8";
    ctx.fillRect(left + offset, top + (offset * 3 % 47) + 6, 2, 1);
  } else {
    ctx.fillStyle = ["#e4c69a", "#e9cda3", "#e7c99c"][(x + y * 2) % 3];
    ctx.fillRect(left, top, TILE, TILE);
    for (let plank = 0; plank < 2; plank++) {
      const edge = top + 32 * plank;
      line(ctx, [left, edge + 1, left + 64, edge + 1], "#cfa97f");
      line(ctx, [left, edge + 3, left + 64, edge + 3], "#eddbb6", 1);
      if ((x + y + plank) % 2 === 0) line(ctx, [left + 28, edge + 2, left + 28, edge + 32], "#cfa97f");
      line(ctx, [left + offset, edge + 11, left + offset + 7, edge + 10, left + offset + 12, edge + 10], "#d9b88e", 1);
    }
  }
}

function doorway(ctx, x, y) {
  ctx.save();
  ctx.translate(x * TILE + 32, y * TILE + 32);
  box(ctx, -21, -18, 42, 36, 5, "#ab7853", "#976746");
  box(ctx, -18, -15, 36, 30, 3, "#c49665");
  for (let n = -12; n <= 12; n += 6) line(ctx, [n, -12, n, 12], "#ac8056", 2);
  // A small noren crest set into the entry mat.
  oval(ctx, 0, 0, 8, 8, "#ad7a51");
  line(ctx, [-5, 2, 0, -4, 5, 2, -5, 2], "#f1dbb2", 1.6);
  ctx.restore();
}

function pavement(ctx, width, row) {
  const top = row * TILE;
  ctx.fillStyle = "#a5afad";
  ctx.fillRect(0, top, width * TILE, TILE);
  for (let y = 0; y < 3; y++) {
    const stagger = y % 2 ? -TILE / 2 : 0;
    for (let col = 0; col <= width; col++) {
      const x = stagger + col * TILE;
      box(ctx, x + 1, top + y * 22 + 1, TILE - 2, 20, 2,
        (col + 2 * y) % 3 ? "#c3cac3" : "#bdc4bf");
      line(ctx, [x + 4, top + y * 22 + 3, x + 40, top + y * 22 + 3], "#d1d6ce", 1);
    }
  }
  ctx.fillStyle = "#798784";
  ctx.fillRect(0, top + TILE - 4, width * TILE, 4);
}

function queueMarks(ctx, x, y, next, outside) {
  ctx.save();
  ctx.translate((x + .5) * TILE, (y + .5) * TILE);
  if (next && (next[0] !== x || next[1] !== y)) {
    ctx.rotate(Math.atan2(next[0] - x, y - next[1]));
  }
  const color = outside ? "#53726b" : darkWood;
  if (outside) {
    oval(ctx, 0, 0, 17, 17, "#dde1d3", "#a7b7ae");
    line(ctx, [-5,-10,0,-14,5,-10], color, 2);
  } else ctx.globalAlpha = .38;
  for (const side of [-1, 1]) {
    const foot = side * 4.5;
    const offset = side * 2;
    oval(ctx, foot, -2 + offset, 2.8, 4.4, color);
    oval(ctx, foot, 5 + offset, 2.3, 1.8, color);
  }
  ctx.restore();
}

function shopFront(ctx, map) {
  const base = map.height * TILE;
  const width = map.width * TILE;
  const left = map.entry[0] * TILE + 4;
  const right = left + TILE - 8;
  for (const [start, end] of [[0,left], [right,width]]) {
    box(ctx, start, base - 9, end - start, 14, 1, "#76694e", "#65583f");
    box(ctx, start, base - 10, end - start, 6, 1, "#b29368");
    for (let x = start + 6; x < end - 4; x += 15) {
      line(ctx, [x,base-3,x,base+3], "#998567", 2);
    }
  }
  box(ctx, left + 1, base - 7, right - left - 2, 14, 1, "#d2be95");
  line(ctx, [left+5,base+5,right-5,base+5], "#aa9b7d", 2);
  // The two short fabric panels frame the open door without covering it.
  for (const side of [left,right]) {
    box(ctx, side - 4, base - 14, 8, 22, 2, "#785d3e", darkWood);
    box(ctx, side - 6, base - 14, 12, 14, [2,2,4,4], "#587c6b", ink);
    line(ctx, [side-3,base-6,side,base-10,side+3,base-6], "#f6e6ba", 1.3);
  }
}

function partition(ctx, edge) {
  ctx.save();
  if (edge.side === "right") {
    ctx.translate((edge.x + 1) * TILE, edge.y * TILE);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(edge.x * TILE, (edge.y + 1) * TILE);
  }
  if (edge.kind === "window") {
    // The light lacquered counter is an open service hatch; only its ends have posts.
    box(ctx, 0, -5, TILE, 14, 2, "#779b93", "#365e57");
    box(ctx, 1, -7, TILE - 2, 10, 2, "#c6e7d9", "#5b897e");
    line(ctx, [8,-3,TILE-8,-3], "#f5f4d6", 2);
    for (const x of [0,TILE-6]) box(ctx, x, -10, 6, 18, 1.5, "#956f4b", darkWood);
  } else {
    box(ctx, 0, -8, TILE, 17, 1, "#565e4f", "#4d5445");
    box(ctx, 0, -9, TILE, 11, 1, "#7d8777");
    line(ctx, [2,-7,TILE-2,-7], "#a0a897", 2);
    line(ctx, [3,5,TILE-3,5], "#646d5e", 1);
  }
  ctx.restore();
}

function passage(ctx, x, y, side) {
  ctx.save();
  ctx.translate((x + (side === "right" ? 1 : .5)) * TILE,
    (y + (side === "down" ? 1 : .5)) * TILE);
  if (side === "right") ctx.rotate(-Math.PI / 2);
  // Paired floor chevrons mark the walk-through gap in either direction.
  for (const sign of [-1,1]) {
    const dx = sign * 6;
    line(ctx, [dx,-sign*5,dx,sign*6], "#77846d", 2.6);
    line(ctx, [dx-3,sign*3,dx,sign*6,dx+3,sign*3], "#77846d", 2.6);
  }
  ctx.restore();
}

function planter(ctx, x, y, length) {
  ctx.save();
  ctx.translate((x + .5) * TILE, (y + .5) * TILE);
  const width = length * TILE - 10;
  box(ctx, -27, -23, width, 50, 6, "#5b634c3b");
  box(ctx, -27, -25, width, 48, 5, "#a97552", "#69533e");
  box(ctx, -27, -26, width, 43, 5, "#d29c70", "#795e43");
  box(ctx, -22, -21, width - 10, 33, 4, "#695c43");
  for (let n = 0; n < length * 4 - 1; n++) {
    const lx = -11 + n * (width - 34) / (length * 4 - 2);
    const ly = n % 2 ? 1 : -9;
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(i * Math.PI * 2 / 5);
      oval(ctx, 0, -5, 4.4, 7.4, i % 2 ? "#577b51" : "#72955c", "#4e6a47");
      ctx.restore();
    }
    oval(ctx, lx, ly, 2.8, 2.8, n % 3 ? "#d3ad77" : "#da977c");
  }
  ctx.restore();
}

function wallTrim(ctx, map) {
  const width = map.width * TILE;
  const height = map.height * TILE;
  // Narrow inset wall trim keeps every walkable edge cell visibly open.
  box(ctx, 0, 0, width, 10, 0, "#73694f");
  box(ctx, 0, 1, width, 3, 0, "#a58e68");
  box(ctx, 0, 10, width, 3, 0, "#48544229");
  if (map.outside) {
    shopFront(ctx, map);
    return;
  }
  box(ctx, 0, height - 6, width, 6, 0, "#978563");
  box(ctx, 0, height - 5, width, 2, 0, "#c2ab80");
  // A short split shop curtain hangs on the dining room's back wall.
  const start = ((map.split ?? 0) * TILE + width) / 2 - 52;
  for (let i = 0; i < 4; i++) {
    const x = start + i * 26;
    polygon(ctx, [x,4,x+24,4,x+24,18,x+20,20,x,19], i % 2 ? "#68836d" : "#607b68", "#526450");
    line(ctx, [x + 4, 5, x + 4, 16], "#8ca08a", 1);
    line(ctx, [x + 8, 13, x + 12, 8, x + 16, 13, x + 8, 13], "#d1d5b1", 1.3);
  }
  line(ctx, [start-4,4,start+105,4], "#5c5945", 3);
}

export function drawFloor(ctx, map) {
  ctx.save();
  ctx.lineWidth = 1.5;
  const [kx, ky, kw, kh] = map.kitchen ?? [0, 0, map.split ?? 0, map.height];
  const inKitchen = (x, y) => x >= kx && x < kx + kw && y >= ky && y < ky + kh;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) tileDetails(ctx, x, y, inKitchen(x,y));
  }
  if (map.outside) pavement(ctx, map.width, map.height);
  for (const [i, [x, y]] of (map.queue || []).entries()) {
    queueMarks(ctx, x, y, i > 0 ? map.queue[i - 1] : map.entry, map.outside);
  }
  for (const [x, y] of map.walls || []) {
    const left = x * TILE, top = y * TILE;
    box(ctx, left, top + 4, TILE, TILE - 3, 1, "#586354");
    box(ctx, left + 1, top, TILE - 2, TILE - 11, 3, "#889481", "#647260");
    box(ctx, left + 4, top + 3, TILE - 8, 5, 2, "#a4ad96");
    line(ctx, [left + 4, top + 50, left + 60, top + 50], "#74816d", 2);
    for (const n of [8, 54]) box(ctx, left + n, top + 53, 3, 8, 1, "#69745f");
  }
  const passages = map.passages || [];
  for (const [x,y] of passages) {
    for (const [dx,dy,side] of [[1,0,"right"],[0,1,"down"]]) {
      if (inKitchen(x,y) !== inKitchen(x+dx,y+dy) &&
          passages.some(([px,py]) => px === x+dx && py === y+dy)) {
        passage(ctx,x,y,side);
      }
    }
  }
  for (const edge of map.edges || []) partition(ctx, edge);
  const beds = new Set((map.planters || []).map(([x,y]) => x+","+y));
  for (const [x,y] of map.planters || []) {
    if (beds.has((x-1)+","+y)) continue;
    let length = 1;
    while (beds.has((x+length)+","+y)) length++;
    planter(ctx, x, y, length);
  }
  wallTrim(ctx, map);
  if (map.entry) doorway(ctx, map.entry[0], map.entry[1]);
  ctx.restore();
}

function seaweed(ctx, x, y, w, h) {
  box(ctx, x, y, w, h, 1.5, "#354e42", "#304237");
  for (let i = 2; i < w - 2; i += 3) line(ctx, [x + i, y + 2, x + i, y + h - 2], "#587463", 1);
}
function riceBall(ctx, seaweedWrap) {
  ctx.beginPath();
  ctx.moveTo(-8.5, 7);
  ctx.quadraticCurveTo(-13, 6, -10, 0);
  ctx.quadraticCurveTo(-7, -7, -2, -10);
  ctx.quadraticCurveTo(1, -12, 4, -8);
  ctx.quadraticCurveTo(10, -2, 11, 4);
  ctx.quadraticCurveTo(13, 9, 5, 9);
  ctx.closePath();
  paint(ctx, "#fff9e5", ink);
  line(ctx, [-6, -1, -5, -3], "#d8d3b9", 1.5);
  line(ctx, [4, -4, 5, -2], "#d8d3b9", 1.5);
  if (seaweedWrap) seaweed(ctx, -3.5, 1.5, 8, 8);
}
function plate(ctx, dirty = false) {
  oval(ctx, 0, 1, 12, 7.5, "#a7c0af", ink);
  oval(ctx, 0, -1, 12, 7, "#f3f5df", ink);
  oval(ctx, 0, -1.5, 8.5, 4.2, null, "#b6c9b9");
  if (dirty) {
    oval(ctx, 1, 0, 4.5, 1.7, "#a26842");
    oval(ctx, -4, -3, 1.4, 1.1, "#c29160");
    box(ctx, 4, -3.5, 2.5, 1.5, 0.6, "#6e8055");
  }
}

function cucumber(ctx, sliced) {
  ctx.save();
  ctx.rotate(-.65);
  if (sliced) {
    for (const [x, y] of [[-10,-7],[-8,-2],[-11,3]]) {
      box(ctx, x, y, 20, 4, 1, "#8bb263", "#476e48");
      line(ctx, [x+2,y+1,x+17,y+1], "#e0e4a1", 1.5);
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(-10, -5, -5, -4);
    ctx.quadraticCurveTo(2, -2, 7, -5);
    ctx.quadraticCurveTo(13, -6, 12, 0);
    ctx.quadraticCurveTo(9, 7, -6, 6);
    ctx.quadraticCurveTo(-12, 6, -11, 0);
    paint(ctx, "#49834b", "#36573b");
    line(ctx, [-8,-1,-4,-1,1,0,6,-2], "#a4bd70", 1.7);
    line(ctx, [10,-3,12,-6], "#5a6c40", 2);
    for (const x of [-5,1,7]) oval(ctx, x, 2, .9, .8, "#bacd83");
  }
  ctx.restore();
}
function egg(ctx) {
  ctx.beginPath();
  ctx.moveTo(1,-11);
  ctx.bezierCurveTo(5,-12,10,-3,9,3);
  ctx.bezierCurveTo(8,13,-9,13,-9,3);
  ctx.bezierCurveTo(-9,-3,-4,-11,1,-11);
  paint(ctx, "#f4d8a6", "#745c40");
  line(ctx, [-5,1,-4,-3,-2,-5], "#fff5d5", 2);
  oval(ctx, 5, 4, 1.2, .8, "#c39568");
}
function beatenEgg(ctx) {
  ctx.beginPath();
  ctx.moveTo(-11,-3);
  ctx.quadraticCurveTo(-10,10,0,10);
  ctx.quadraticCurveTo(10,10,11,-3);
  ctx.closePath();
  paint(ctx, "#89afae", ink);
  oval(ctx, 0,-3,11,5.5,"#fbebd0",ink);
  oval(ctx, 0,-3,8.8,3.6,"#f4b443");
  line(ctx, [-4,-3,-1,-4,4,-3], "#fff4a8", 1.6);
  line(ctx, [4,-3,9,-10], "#80694f", 1.8);
}
function steak(ctx, stage) {
  const raw = stage === "beef", pink = stage === "steakMedium", burnt = stage === "burntSteak";
  const face = raw ? "#d45e57" : pink ? "#bc8256" : burnt ? "#463f38" : "#986644";
  const side = raw ? "#a64b45" : pink ? "#e58b78" : burnt ? "#332e29" : "#765036";
  ctx.save();
  ctx.rotate(-.24);
  ctx.beginPath();
  ctx.moveTo(-11,0);
  ctx.bezierCurveTo(-16,-9,-2,-12,3,-7);
  ctx.bezierCurveTo(6,-4,14,-4,12,4);
  ctx.bezierCurveTo(10,12,-6,12,-11,4);
  ctx.closePath();
  paint(ctx, side, ink);
  ctx.translate(0,-3);
  ctx.beginPath();
  ctx.moveTo(-11,0);
  ctx.bezierCurveTo(-14,-8,-4,-9,1,-6);
  ctx.bezierCurveTo(6,-2,13,-4,12,2);
  ctx.bezierCurveTo(10,9,-7,9,-11,3);
  ctx.closePath();
  paint(ctx, face, raw ? "#8f5145" : "#634d37");
  if (raw) {
    line(ctx, [-9,-2,-5,-5,-2,-4,3,0,8,0], "#f3c5a8", 2);
    line(ctx, [-3,-4,-3,0,-5,2], "#edb395", 1.4);
  } else {
    for (const x of [-6,-1,4]) line(ctx,[x-1,-2,x+2,3],burnt ? "#232722" : "#63472d", 1.8);
    if (stage === "steakWell") line(ctx, [-6,3,5,-1], "#755037", 1.6);
    if (burnt) line(ctx, [-7,-4,-4,-5,0,-3], "#9b9384", 1.8);
  }
  ctx.restore();
}
function eggRoll(ctx, stage) {
  const whole = stage !== "omelet", burnt = stage === "burntEgg";
  ctx.save();
  ctx.rotate(-.3);
  const left = whole ? -12 : -7, width = whole ? 25 : 14;
  box(ctx, left,-6,width,14,5,burnt ? "#5b4939" : "#e9a63e",burnt ? "#353631" : "#9b6b39");
  if (whole) {
    line(ctx, [left+3,-4,left+12,-4],burnt ? "#928676" : "#ffda78", 2);
    line(ctx, [left+5,1,left+7,4],burnt ? "#302f29" : "#b97c36", 1.8);
  }
  const end = left + width - 5;
  oval(ctx,end,1,5,7,burnt ? "#635442" : "#ffe283",burnt ? "#363730" : "#a6743d");
  line(ctx,[end-2,-3,end+1,-4,end+3,-1,end+3,3,end,4,end-1,1,end+1,0],
    burnt ? "#35352e" : "#ca8b40",1.5);
  ctx.restore();
}
function maki(ctx, x, y) {
  box(ctx,x-6.5,y-3,13,10,4,"#344f43",ink);
  oval(ctx,x,y-3,6.7,4.6,"#fbf0d4","#344f43");
  box(ctx,x-2.5,y-4.8,5,3.8,1,"#83ac59","#517e47");
}
function riceMound(ctx, burnt) {
  oval(ctx,0,2,10,7,burnt ? "#534d3e" : "#eee5c8",ink);
  for (const [x,y] of [[-5,1],[-2,-3],[4,-2],[2,3]]) {
    oval(ctx,x,y,3.1,1.9,burnt ? "#776c54" : "#faf4dc");
  }
  if (burnt) line(ctx, [-6,4,-3,2,0,5,4,4], "#34382d", 1.8);
}
function food(ctx, item) {
  if (item === "nori") {
    seaweed(ctx, -9, -8, 16, 15);
    ctx.rotate(-.16);
    seaweed(ctx, -7, -6, 16, 15);
  } else if (item === "rice") {
    box(ctx, -8, -8, 16, 17, 3, "#dfbe83", darkWood);
    box(ctx, -8, -9, 16, 4, 1, "#a77e4e", darkWood);
    oval(ctx, 0, 1, 5, 3.5, cream);
    line(ctx, [-2, 2, 2, -1], "#ae925e", 1);
  } else if (item === "cooked" || item === "burntRice") riceMound(ctx,item === "burntRice");
  else if (item === "cucumber" || item === "cucumberStrips") cucumber(ctx,item === "cucumberStrips");
  else if (item === "cucumberRoll") { maki(ctx,-4,-1); maki(ctx,4,3); }
  else if (item === "egg") egg(ctx);
  else if (item === "beatenEgg") beatenEgg(ctx);
  else if (["beef","steakMedium","steakWell","burntSteak"].includes(item)) steak(ctx,item);
  else if (["omeletLog","omelet","burntEgg"].includes(item)) eggRoll(ctx,item);
  else {
    riceBall(ctx, true);
    if (item !== "onigiri") oval(ctx, 2, -4, 4, 2, "#e88c64");
  }
}
export function drawItem(ctx, x, y, item, size = 22) {
  if (!item) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 1.45;
  if (item === "plate" || item === "dirty") plate(ctx, item === "dirty");
  else if (item.startsWith("plated:")) {
    plate(ctx);
    ctx.translate(0,-4);
    ctx.scale(.76,.76);
    food(ctx,item.slice(7));
  } else food(ctx,item);
  ctx.restore();
}

function cabinet(ctx, face, top, rim) {
  oval(ctx, 1, 23, 28, 6, "#6d593736");
  box(ctx, -25, 10, 7, 14, 2, darkWood, ink);
  box(ctx, 18, 10, 7, 14, 2, darkWood, ink);
  box(ctx, -27, -19, 54, 39, 4, face, ink);
  box(ctx, -29, -26, 58, 38, 4, top, ink);
  line(ctx, [-25, -22, 25, -22], rim, 2);
  line(ctx, [-23, 15, 23, 15], rim, 1);
}
function crate(ctx, art) {
  cabinet(ctx, "#ac7646", "#d2a265", "#e8c68f");
  box(ctx, -23, -18, 46, 24, 3, "#9d784e", darkWood);
  if (art === "rice") {
    oval(ctx, 0, -4, 16, 9, "#d8bb87", darkWood);
    oval(ctx, 0, -8, 14, 7, "#f1e6c6", "#a79770");
    for (const [x, y] of [[-8,-8],[-5,-5],[0,-10],[3,-5],[8,-8]]) line(ctx, [x, y, x + 2, y - 1], "#c9b997", 1.6);
  } else if (art === "nori") {
    for (let off = 0; off < 3; off++) {
      ctx.save();
      ctx.translate(-12 + off * 3, -15 + off * 2);
      ctx.rotate(-.11);
      seaweed(ctx, 0, 0, 22, 13);
      ctx.restore();
    }
  } else if (art === "beef") {
    box(ctx,-19,-15,38,18,3,"#cbd7ca","#708879");
    drawItem(ctx,3,-8,art,19);
    drawItem(ctx,-6,-4,art,20);
  } else if (art === "egg") {
    for (const [x,y] of [[-11,-9],[0,-10],[11,-9],[-5,-3],[6,-3]]) {
      drawItem(ctx,x,y,art,13);
    }
  } else {
    for (const x of [-11,0,11]) drawItem(ctx,x,-7,art,20);
  }
}
function steam(ctx, now) {
  for (const offset of [0,.5]) {
    const t = (now / 950 + offset) % 1;
    const x = offset ? 5 : -6, y = -17 - 12 * t;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    line(ctx,[x,y,x+2*Math.sin(t*6),y-3,x+1,y-7],"#ffffe4",2.4);
    ctx.restore();
  }
}
function cookingPot(ctx, station, now) {
  const hot = station?.heat || station?.job;
  cabinet(ctx, "#718277", "#acb8a3", "#dbe3c7");
  box(ctx, -20, -18, 40, 26, 4, "#727d6a", ink);
  box(ctx,-17,13,5,4,2,hot ? "#ffb05d" : cream,ink);
  box(ctx,12,13,5,4,2,cream,ink);
  box(ctx, -20, -9, 40, 5, 2, "#514f41", ink);
  box(ctx, -15, -13, 30, 17, 5, "#86a396", ink);
  oval(ctx, 0, -12, 15, 6, "#c8d0bb", ink);
  if (station?.item) {
    oval(ctx,0,-12,12.5,4.6,"#63796b");
    drawItem(ctx,0,-15,station.item,22);
  } else {
    oval(ctx, 0, -13, 8, 3.8, "#a2b5a3");
    box(ctx, -4, -19, 8, 5, 2, darkWood, ink);
  }
  if (hot) steam(ctx,now);
}
function fryingPan(ctx, station, now) {
  const hot = station?.heat || station?.job;
  cabinet(ctx,"#697c77","#b2c0b5","#e1e5d3");
  box(ctx,-23,-19,46,26,3,"#59675b",ink);
  oval(ctx,-3,-4,16,9,hot ? "#ed9455" : "#788477",ink);
  line(ctx,[5,-8,21,-17],ink,6);
  line(ctx,[8,-9,21,-17],"#a97c4e",3.6);
  oval(ctx,-3,-8,15.5,10,"#536560",ink);
  oval(ctx,-3,-9.5,12.5,7.2,"#364840","#718277");
  box(ctx,-18,13,9,4,2,hot ? "#ffb05d" : "#9eaf99",ink);
  box(ctx,12,12,6,5,2,"#dedcca",ink);
  const contents = station?.item || station?.heat?.input;
  if (contents === "beatenEgg") {
    oval(ctx,-3,-9.5,10,5.2,"#f0b347","#bd813f");
    line(ctx,[-9,-9,-7,-11,-2,-12],"#ffe698",1.7);
  } else if (contents) drawItem(ctx,-3,-10,contents,20);
  if (hot) steam(ctx,now);
}
function wasteBin(ctx) {
  oval(ctx,2,21,19,5,"#6c62423d");
  for (const x of [-12,12]) oval(ctx,x,20,3,4,"#485045",ink);
  polygon(ctx,[-18,-12,18,-12,14,18,10,21,-12,20,-16,17],"#8a9890",ink);
  for (const x of [-8,0,8]) line(ctx,[x,-4,x*.8,13],"#68796e",2.2);
  box(ctx,-19,-20,38,11,4,"#aeb8a7",ink);
  oval(ctx,0,-12,20,7,"#d0d3bd",ink);
  oval(ctx,0,-12,16,4.5,"#48574d");
  line(ctx,[-12,-11,-6,-13,1,-12,9,-13],"#6c796b",2);
  box(ctx,-5,15,10,4,1.5,"#d6c8a6",ink);
}
function prepCounter(ctx) {
  cabinet(ctx,"#799387","#cbdbcc","#eef1d8");
  box(ctx,-21,-18,42,24,3,"#ddd4ac","#a6a489");
  line(ctx,[-17,-13,-12,-14,-6,-14],"#eae3c5",1.5);
  // A folded dish towel hangs below the clear portioning surface.
  box(ctx,10,9,10,12,1.5,"#eee8c9","#859685");
  line(ctx,[12,17,18,17],"#769a91",2);
}
function worktop(ctx, board) {
  cabinet(ctx, "#b58a5e", board ? "#d5ba86" : "#e0c998", "#f4ddb0");
  if (board) {
    box(ctx, -19, -18, 34, 23, 4, "#b98d5e", darkWood);
    line(ctx, [-15, -13, 6, -13], "#d5aa78", 1);
    polygon(ctx, [11,1,17,-9,20,-8,15,3], "#dde1cd", ink);
    line(ctx, [16,-8,20,-15], darkWood, 3);
  } else {
    line(ctx, [-20,-15,-10,-16,-3,-15], "#c9b081", 1);
    line(ctx, [9,4,21,3], "#c9b081", 1);
  }
}
function washSink(ctx,st) {
  cabinet(ctx, "#738f83", "#b7ccbc", "#e1e6cd");
  box(ctx, -20, -16, 39, 23, 5, "#718f84", ink);
  box(ctx, -16, -11, 31, 15, 4, "#90c0b8", "#799f96");
  line(ctx, [-10,-4,-4,-5,1,-4], "#c8dfce", 2);
  oval(ctx, 7, -1, 2.2, 1.6, "#698e84");
  line(ctx, [0,-17,0,-22,6,-22,6,-13], ink, 5);
  line(ctx, [0,-17,0,-22,6,-22,6,-14], "#ccd9ca", 2.5);
  if(st.dirty){
    const stroke=Math.sin(st.washed/90);
    for(let i=0;i<Math.min(4,st.dirty);i++)drawItem(ctx,-7,-2-i*2,"dirty",21);
    box(ctx,-6+stroke*6,-8,10,6,2,"#f2c465",darkWood);
    for(let i=0;i<4;i++){
      const t=(st.washed/640+i*.25)%1;
      oval(ctx,-10+i*6,-3-8*t,1.2+t,1.2+t,"#effff7","#a1cbc4");
    }
  }
  for(let i=0;i<Math.min(4,st.clean);i++)drawItem(ctx,12,1-i*2,"plate",18);
}
function plateRack(ctx, count) {
  cabinet(ctx, "#b08054", "#ceb185", "#ead0a2");
  box(ctx, -20, -17, 40, 22, 4, "#b79468", darkWood);
  for (let i = 0; i < Math.min(count, 4); i++) drawItem(ctx, 0, -2 - i * 3.5, "plate", 29);
  if (!count) oval(ctx, 0, -6, 12, 6, null, "#96764f");
}
function table(ctx, dir) {
  ctx.save();
  ctx.rotate(dir * Math.PI / 2);
  // Seats flank the serving side. The opposite side holds the chopstick cup.
  for (const x of [-24, 24]) {
    box(ctx, x - 6, -16, 12, 29, 3, "#a47147", ink);
    box(ctx, x - 4, -13, 8, 23, 2, "#c79d68", darkWood);
  }
  oval(ctx, 2, 14, 25, 6, "#75614034");
  box(ctx, -21, -17, 42, 37, 7, "#ad784d", ink);
  box(ctx, -22, -21, 44, 36, 7, "#daad75", ink);
  line(ctx, [-19,-16,-9,-16,-6,-15], "#edc997", 2);
  line(ctx, [12,8,19,7], "#be8e5e", 1);
  box(ctx, 13, -16, 6, 7, 1, "#f1e1bd", darkWood);
  line(ctx, [15,-15,14,-21], darkWood, 1.5);
  line(ctx, [17,-15,18,-21], darkWood, 1.5);
  ctx.restore();
}
export function drawFixture(ctx, fixture, station, state, def) {
  ctx.save();
  ctx.translate((fixture.x + .5) * TILE, (fixture.y + .5) * TILE);
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  const art = def?.art || fixture.kind;
  if (art === "table") table(ctx, fixture.dir || 0);
  else if (def.action === "stock") crate(ctx, art);
  else if (art === "pot") cookingPot(ctx,station,state.now);
  else if (art === "pan") fryingPan(ctx,station,state.now);
  else if (art === "bin") wasteBin(ctx);
  else if (art === "counter" && fixture.kind !== "pass") prepCounter(ctx);
  else if (art === "sink") washSink(ctx,station);
  else if (art === "rack") plateRack(ctx, station?.plates ?? 0);
  else worktop(ctx, art === "board");
  if (art==="board" && station?.parts?.length>1){
    const offset=11*(1-station.formed/(1000*def.seconds));
    station.parts.forEach((item,i)=>drawItem(ctx,(i-(station.parts.length-1)/2)*offset*2,-6,item,21));
  }else if (station?.item && art !== "pan" && art !== "pot") {
    drawItem(ctx, 0, -6, station.item, 25);
  }
  if (art === "table" && station?.dirty) {
    for (let n = 0; n < Math.min(2, station.dirty); n++) drawItem(ctx, n * 16 - 8, -5, "dirty", 17);
  }
  // The brass marker stays on the actual interaction edge after a rotation.
  if(def.frontOnly){
    ctx.rotate((fixture.dir || 0) * Math.PI / 2);
    if (art === "table") {
      box(ctx, -12, 20, 24, 6, 2, "#f5d58e", "#806540");
      polygon(ctx, [-5,24,0,29,5,24], "#f5d58e", "#806540");
    } else box(ctx, -6, 23, 12, 3.5, 1.6, "#f5d58e", "#94764e");
  }
  ctx.restore();
}

export function drawPerson(ctx, x, y, kind, facing, stride=0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  const chef = kind === "host" || kind === "guest";
  const coat = kind === "host" ? "#668f78" : kind === "guest" ? "#d0845d" : "#8194a0";
  const apron = kind === "host" ? "#3f6854" : "#a96040";
  const sideways = facing === 1 || facing === "left" ? -1 : facing === 3 || facing === "right" ? 1 : 0;
  const back = facing === 2 || facing === "up";
  oval(ctx, 1, 15, 14, 4.5, "#534c3e38");
  box(ctx, -9, 8+stride*3, 7, 9, 2.5, "#504c41", ink);
  box(ctx, 2, 8-stride*3, 7, 9, 2.5, "#504c41", ink);
  ctx.translate(stride*.8,-Math.abs(stride)*1.5);
  box(ctx, -11, -7, 22, 21, 5, coat, ink);
  for (const side of [-1, 1]) {
    oval(ctx, side * 10, 5+side*stride*2, 3.8, 5.2, coat, ink);
    oval(ctx, side * 11, 8.5+side*stride*2, 2.8, 2.3, "#dfad86");
  }
  if (chef) {
    box(ctx, -6, 0, 12, 11, 1.5, apron);
    line(ctx, [-5,-4,-4,1,4,1,5,-4], "#e7dfba", 1.5);
    line(ctx, [-3,7,3,7], "#c5c69d");
  } else line(ctx, [-6,-3,-2,2,4,-4], "#c6d4d1", 2);
  oval(ctx, 0, -8.8, 9.3, 9.5, back ? "#66513f" : "#f0c7a0", ink);
  if (!back) {
    const eyes = sideways < 0 ? [-6,-1] : sideways > 0 ? [1,6] : [-4,4];
    for (const eye of eyes) oval(ctx, eye, -8, 1.15, 1.45, ink);
    line(ctx, [sideways * 2 - 1,-3.5,sideways * 2 + 1,-3.5], "#be8665", 1);
  }
  if (chef) {
    box(ctx, -10, -22, 20, 9, [5,5,2,2], "#f7f1dc", ink);
    box(ctx, -10, -16, 20, 3.2, 1, coat);
    line(ctx, [-5,-21,-5,-18], "#c8ccb6");
    line(ctx, [1,-21,1,-18], "#c8ccb6");
  } else {
    ctx.beginPath();
    ctx.moveTo(-9,-8); ctx.quadraticCurveTo(-13,-20,-2,-20);
    ctx.quadraticCurveTo(9,-22,10,-10); ctx.lineTo(6,-12);
    ctx.lineTo(2,-14); ctx.lineTo(0,-12); ctx.lineTo(-4,-14); ctx.closePath();
    paint(ctx, "#6c5540", ink);
  }
  ctx.restore();
}
export function drawSign(ctx, x, y, text, color = "#415c4b", maxWidth = Infinity) {
  if (!text) return;
  ctx.save();
  ctx.font = '600 14px system-ui, "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = Math.min(maxWidth,Math.ceil(ctx.measureText(text).width) + 14);
  box(ctx, x - width/2, y - 10, width, 21, 6, color);
  ctx.fillStyle = "#fff9e7";
  ctx.fillText(text, x, y + 1, width - 8);
  ctx.restore();
}
