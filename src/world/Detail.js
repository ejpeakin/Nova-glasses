// Battlefield detail: a second, denser layer of dressing on top of Dressing.js so
// every map reads as a lived-in, fought-over place up close. Instanced ground
// cover (grass tufts, pebbles, litter, cans, spent brass), patches that break up
// the ground, and set pieces of the fighting: shell craters, sandbagged firing
// positions, burnt-out wrecks, rubble, ruined walls, barricades and, indoors, the
// furniture and kit of a working facility. Everything keeps clear of spawns,
// objectives, landing zones and enemy posts (the same `free` test as Dressing).
import * as THREE from '../lib/three.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

/** Density multiplier for the instanced ground cover by graphics quality. */
const density = (b) => (b.quality === 'low' ? 0.35 : b.quality === 'medium' ? 0.65 : 1);

/** True when nothing is overhead (not inside a building, under a canopy or a container). */
const outdoors = (b, x, z) => !b.world.overlaps(x - 0.3, 2.4, z - 0.3, x + 0.3, 60, z + 0.3);

function scatter(b, free, n, test, r = 0.4) {
  const out = [];
  const bd = b.world.bounds;
  let tries = 0;
  while (out.length < n && tries++ < n * 25) {
    const x = bd.minX + 2 + b.rng() * (bd.maxX - bd.minX - 4);
    const z = bd.minZ + 2 + b.rng() * (bd.maxZ - bd.minZ - 4);
    if (test && !test(x, z)) continue;
    if (!free(x, z, r)) continue;
    out.push([x, z, 0.6 + b.rng() * 0.8]);
  }
  return out;
}

/** Points scattered around a centre (for clusters such as brass round a nest). */
function around(b, x, z, n, r) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = b.rng() * 6.283, d = Math.sqrt(b.rng()) * r; out.push([x + Math.cos(a) * d, z + Math.sin(a) * d, 0.6 + b.rng() * 0.8]); }
  return out;
}

function instanced(b, geo, mat, list, place, { shadow = false, receive = true } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const col = new THREE.Color();
  let colored = false;
  list.forEach((it, i) => {
    const c = place(it, _p, _q, _s, col);
    _m.compose(_p, _q, _s);
    im.setMatrixAt(i, _m);
    if (c) { im.setColorAt(i, col); colored = true; }
  });
  if (colored) im.instanceColor.needsUpdate = true;
  im.castShadow = shadow;
  im.receiveShadow = receive;
  b.root.add(im);
  return im;
}

// ---------------------------------------------------------------- textures

let GRASS = null;
function grassTexture() {
  if (GRASS) return GRASS;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x0 = 8 + Math.random() * 48, lean = (Math.random() - 0.5) * 22, h = 30 + Math.random() * 32;
    const shade = 150 + Math.random() * 105;
    g.strokeStyle = `rgb(${shade},${shade},${shade})`;
    g.lineWidth = 1.2 + Math.random() * 1.6;
    g.beginPath(); g.moveTo(x0, 64); g.quadraticCurveTo(x0 + lean * 0.3, 64 - h * 0.6, x0 + lean, 64 - h); g.stroke();
  }
  GRASS = new THREE.CanvasTexture(c);
  GRASS.colorSpace = THREE.SRGBColorSpace;
  return GRASS;
}

// ---------------------------------------------------------------- ground cover

/** Grass / weed tufts: two crossed alpha-tested cards each. colors: hex list. */
function tufts(b, pts, colors, h = 0.45) {
  const g1 = new THREE.PlaneGeometry(0.6, 1, 1, 1); g1.translate(0, 0.5, 0);
  const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
  const g3 = g1.clone(); g3.rotateY(Math.PI / 4);
  const geo = new THREE.BufferGeometry();
  const merge = [g1, g2, g3].map((g) => g.toNonIndexed());
  const pos = [], nrm = [], uv = [];
  for (const g of merge) { pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); for (let i = 0; i < g.attributes.position.count; i++) nrm.push(0, 1, 0); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  instanced(b, geo, mat, pts, ([x, z, k], p, q, s, col) => {
    p.set(x, 0, z);
    q.setFromEuler(_e.set(0, b.rng() * 6.28, 0));
    const sc = h * (0.6 + k * 0.6);
    s.set(sc * (0.8 + b.rng() * 0.5), sc, sc);
    col.setHex(colors[Math.floor(b.rng() * colors.length)]).multiplyScalar(0.8 + b.rng() * 0.35);
    return true;
  });
}

/** Pebbles and small stones. */
function pebbles(b, pts, color, size = 0.12) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  instanced(b, geo, mat, pts, ([x, z, k], p, q, s, col) => {
    const sc = size * (0.4 + k * k * 1.1);
    p.set(x, sc * 0.25, z);
    q.setFromEuler(_e.set(b.rng() * 3, b.rng() * 3, b.rng() * 3));
    s.set(sc * (0.8 + b.rng() * 0.6), sc * (0.5 + b.rng() * 0.4), sc * (0.8 + b.rng() * 0.6));
    col.setHex(color).multiplyScalar(0.75 + b.rng() * 0.45);
    return true;
  });
}

/** Paper, cardboard, rags and wrappers lying flat. */
function litter(b, pts, palette = [0xd8d4c8, 0xb89a6a, 0x8a8478, 0xc8c0a8, 0x5a6a7a, 0xa04030]) {
  const geo = new THREE.BoxGeometry(1, 0.01, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  instanced(b, geo, mat, pts, ([x, z, k], p, q, s, col) => {
    p.set(x, 0.012 + b.rng() * 0.01, z);
    q.setFromEuler(_e.set((b.rng() - 0.5) * 0.15, b.rng() * 6.28, (b.rng() - 0.5) * 0.15));
    s.set(0.12 + k * 0.22, 1, 0.1 + k * 0.28);
    col.setHex(palette[Math.floor(b.rng() * palette.length)]);
    return true;
  });
}

/** Drink cans, bottles and ration tins. */
function cans(b, pts) {
  const geo = new THREE.CylinderGeometry(0.033, 0.033, 0.12, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.6 });
  const pal = [0xb02020, 0x2050a0, 0x30a050, 0xc0c0c0, 0x6a4a20];
  instanced(b, geo, mat, pts, ([x, z], p, q, s, col) => {
    const lying = b.rng() < 0.75;
    p.set(x, lying ? 0.033 : 0.06, z);
    q.setFromEuler(_e.set(lying ? Math.PI / 2 : 0, b.rng() * 6.28, 0));
    s.set(1, 1, 1);
    col.setHex(pal[Math.floor(b.rng() * pal.length)]);
    return true;
  });
}

/** Spent brass. */
function brass(b, pts) {
  const geo = new THREE.CylinderGeometry(0.006, 0.006, 0.045, 5);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9a043, roughness: 0.3, metalness: 0.9 });
  instanced(b, geo, mat, pts, ([x, z], p, q, s) => {
    p.set(x, 0.007, z);
    q.setFromEuler(_e.set(Math.PI / 2, b.rng() * 6.28, 0));
    s.set(1, 1, 1);
  }, { receive: false });
}

/** Trash bags (lumpy dark sacks). */
function sacks(b, pts, color = 0x1c1d1f) {
  const geo = new THREE.SphereGeometry(0.3, 8, 6);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) * (0.9 + Math.random() * 0.2), P.getY(i) * (P.getY(i) > 0 ? 1.2 : 0.7), P.getZ(i) * (0.9 + Math.random() * 0.2));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
  instanced(b, geo, mat, pts, ([x, z, k], p, q, s, col) => {
    p.set(x, 0.2 * k, z);
    q.setFromEuler(_e.set(0, b.rng() * 6.28, (b.rng() - 0.5) * 0.4));
    s.setScalar(0.7 + k * 0.4);
    col.setHex(color).multiplyScalar(0.8 + b.rng() * 0.5);
    return true;
  }, { shadow: true });
}

/** Traffic cones. */
function cones(b, pts) {
  const geo = new THREE.ConeGeometry(0.17, 0.62, 10); geo.translate(0, 0.31, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe0601a, roughness: 0.6 });
  instanced(b, geo, mat, pts, ([x, z], p, q, s) => {
    const down = b.rng() < 0.25;
    p.set(x, down ? 0.17 : 0, z);
    q.setFromEuler(_e.set(down ? Math.PI / 2 : 0, b.rng() * 6.28, 0));
    s.set(1, 1, 1);
  }, { shadow: true });
}

/** Flat patches that break up the ground (dirt, gravel, oil, scorch). */
function patches(b, pts, mats, size = [1.5, 5]) {
  for (const [x, z, k] of pts) {
    const w = size[0] + (size[1] - size[0]) * b.rng(), d = w * (0.5 + b.rng() * 0.6);
    const m = mats[Math.floor(b.rng() * mats.length)];
    b.mesh(new THREE.CircleGeometry(0.5, 14), m, x, 0.012 + b.rng() * 0.012 + k * 0.001, z, 0, -Math.PI / 2, b.rng() * 6.28, w, d, 1);
  }
}

// ---------------------------------------------------------------- set pieces

/** Shell crater: scorched floor, a raised broken rim, debris. */
function crater(b, x, z, r, rimMat = 'dirt') {
  b.mesh(new THREE.CircleGeometry(r, 18), 'burnt', x, 0.026, z, 0, -Math.PI / 2);
  b.mesh(new THREE.CircleGeometry(r * 1.6, 18), 'tracks', x, 0.022, z, 0, -Math.PI / 2, b.rng() * 6, 1, 0.8 + b.rng() * 0.3, 1); // thrown-up earth
  const n = Math.round(r * 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + b.rng() * 0.3, d = r * (0.9 + b.rng() * 0.25), s = 0.3 + b.rng() * 0.35 * r;
    b.mesh(new THREE.IcosahedronGeometry(1, 0), rimMat, x + Math.cos(a) * d, s * 0.15, z + Math.sin(a) * d, b.rng() * 3, b.rng(), b.rng(), s, s * 0.35, s * 0.8);
  }
  b.debris(x, z, Math.round(r * 3), r * 0.9);
}

/** A sandbagged firing position: a U of bags open to the back, ammo cans, brass. */
function nest(b, x, z, rot, out) {
  const ax = Math.abs(Math.cos(rot)) > 0.7; // which way the front faces
  const f = ax ? Math.sign(Math.cos(rot)) : Math.sign(Math.sin(rot));
  if (ax) {
    b.sandbags(x + f * 1.3, z, 2.6, 'z', 1.0);
    b.sandbags(x, z - 1.3, 2.2, 'x', 0.8);
    b.sandbags(x, z + 1.3, 2.2, 'x', 0.8);
  } else {
    b.sandbags(x, z + f * 1.3, 2.6, 'x', 1.0);
    b.sandbags(x - 1.3, z, 2.2, 'z', 0.8);
    b.sandbags(x + 1.3, z, 2.2, 'z', 0.8);
  }
  b.box(x - 0.4, 0, z + 0.3, 0.32, 0.2, 0.18, 'olive', false);
  b.box(x - 0.05, 0, z + 0.45, 0.32, 0.2, 0.18, 'olive', false);
  out.push(...around(b, x, z, 26, 1.1));
}

/** A burnt-out wreck with a scorch mark, loose tyres and debris. */
function wreck(b, x, z, axis, kind = 'car') {
  b.mesh(new THREE.CircleGeometry(3.2, 18), 'burnt', x, 0.018, z, 0, -Math.PI / 2, b.rng() * 6, 1, 0.7, 1);
  if (kind === 'truck') b.truck(x, z, axis, 'burnt'); else b.car(x, z, axis, 'burnt', true);
  for (let i = 0; i < 2; i++) b.mesh(new THREE.TorusGeometry(0.33, 0.13, 8, 14), 'rubber', x + (b.rng() - 0.5) * 5, 0.13, z + (b.rng() - 0.5) * 5, 0, Math.PI / 2, b.rng());
  b.debris(x, z, 6, 2.6);
}

/** A broken length of wall: uneven blocks, some fallen. Has a collider. */
function ruinedWall(b, x, z, len, axis, mat = 'plasterTan') {
  const n = Math.max(2, Math.round(len / 0.9));
  let maxH = 0;
  for (let i = 0; i < n; i++) {
    const a = -len / 2 + (i + 0.5) * (len / n), h = 0.6 + b.rng() * 1.6;
    maxH = Math.max(maxH, h);
    if (axis === 'x') b.box(x + a, 0, z, len / n - 0.05, h, 0.35, mat, false);
    else b.box(x, 0, z + a, 0.35, h, len / n - 0.05, mat, false);
  }
  for (let i = 0; i < 4; i++) { const s = 0.3 + b.rng() * 0.4; b.mesh(new THREE.BoxGeometry(1, 1, 1), mat, x + (b.rng() - 0.5) * len, s * 0.3, z + (b.rng() - 0.5) * 1.8, b.rng() * 3, b.rng(), 0, s * 1.6, s * 0.6, s); }
  if (axis === 'x') b.world.add(x - len / 2, 0, z - 0.2, x + len / 2, maxH * 0.8, z + 0.2, 'concrete');
  else b.world.add(x - 0.2, 0, z - len / 2, x + 0.2, maxH * 0.8, z + len / 2, 'concrete');
}

/** Rebar sticking out of a rubble pile. */
function rubbleHeap(b, x, z, s = 2) {
  b.rubble(x, z, s);
  for (let i = 0; i < 4; i++) {
    const a = b.rng() * 6.28, l = 0.6 + b.rng() * 0.9;
    const g = new THREE.CylinderGeometry(0.012, 0.012, l, 4);
    b.mesh(g, 'rust', x + Math.cos(a) * s * 0.3, l * 0.4, z + Math.sin(a) * s * 0.3, b.rng() * 3, (b.rng() - 0.5) * 1.2, (b.rng() - 0.5) * 1.2);
  }
}

/** Ammo crates, a ration box and a radio on a pallet. */
function supplyPile(b, x, z) {
  b.box(x, 0, z, 1.2, 0.12, 1.0, 'woodDark', false);
  b.box(x - 0.3, 0.12, z - 0.2, 0.55, 0.3, 0.32, 'olive', false);
  b.box(x + 0.3, 0.12, z - 0.2, 0.55, 0.3, 0.32, 'olive', false);
  b.box(x, 0.42, z - 0.2, 0.55, 0.3, 0.32, 'olive', false);
  b.box(x + 0.25, 0.12, z + 0.25, 0.4, 0.25, 0.3, 'tan', false);
  b.world.add(x - 0.6, 0, z - 0.5, x + 0.6, 0.72, z + 0.5, 'wood');
}

/** An office desk with a monitor, keyboard and chair (indoors). */
function desk(b, x, z, rot) {
  const ax = Math.abs(Math.sin(rot)) > 0.5;
  b.box(x, 0.72, z, ax ? 0.75 : 1.5, 0.05, ax ? 1.5 : 0.75, 'panelDark', false);
  for (const [dx, dz] of [[-0.68, -0.32], [0.68, -0.32], [-0.68, 0.32], [0.68, 0.32]]) b.box(x + (ax ? dz : dx), 0, z + (ax ? dx : dz), 0.05, 0.72, 0.05, 'metalDark', false);
  b.box(x, 0.77, z, ax ? 0.05 : 0.5, 0.34, ax ? 0.5 : 0.05, 'black', false);
  b.box(x + (ax ? 0.03 : 0), 0.79, z + (ax ? 0 : 0.03), ax ? 0.01 : 0.45, 0.28, ax ? 0.45 : 0.01, 'screenBlue', false);
  b.box(x + (ax ? 0.25 : 0), 0.77, z + (ax ? 0 : 0.25), ax ? 0.15 : 0.42, 0.02, ax ? 0.42 : 0.15, 'black', false);
  const cx = x + (ax ? 0.75 : 0), cz = z + (ax ? 0 : 0.75);
  b.box(cx, 0.45, cz, 0.48, 0.07, 0.48, 'black', false);
  b.box(cx + (ax ? 0.22 : 0), 0.52, cz + (ax ? 0 : 0.22), ax ? 0.06 : 0.46, 0.5, ax ? 0.46 : 0.06, 'black', false);
  b.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), 'metalDark', cx, 0.22, cz);
  b.world.add(x - (ax ? 0.4 : 0.78), 0, z - (ax ? 0.78 : 0.4), x + (ax ? 0.4 : 0.78), 0.8, z + (ax ? 0.78 : 0.4), 'wood');
}

function cabinet(b, x, z) {
  b.box(x, 0, z, 0.48, 1.32, 0.6, 'steelBlue', false);
  for (let i = 0; i < 4; i++) b.box(x, 0.12 + i * 0.32, z - 0.305, 0.12, 0.02, 0.01, 'metal', false);
  b.world.add(x - 0.24, 0, z - 0.3, x + 0.24, 1.32, z + 0.3, 'metal');
}

function cart(b, x, z) {
  b.box(x, 0.18, z, 1.0, 0.04, 0.55, 'metal', false);
  b.box(x, 0.6, z, 1.0, 0.04, 0.55, 'metal', false);
  for (const [dx, dz] of [[-0.48, -0.25], [0.48, -0.25], [-0.48, 0.25], [0.48, 0.25]]) b.box(x + dx, 0.08, z + dz, 0.03, 0.85, 0.03, 'metalDark', false);
  b.box(x - 0.2, 0.64, z, 0.4, 0.22, 0.3, 'olive', false);
}

/** Steel shelving unit stocked with boxes and cases (against a wall). */
function shelves(b, x, z, axis) {
  const ax = axis === 'x', L = 1.8, D = 0.55;
  const w = ax ? L : D, d = ax ? D : L;
  for (const y of [0.1, 0.75, 1.4, 2.05]) b.box(x, y, z, w, 0.04, d, 'metal', false);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(x + sx * (w / 2 - 0.03), 0, z + sz * (d / 2 - 0.03), 0.05, 2.12, 0.05, 'metalDark', false);
  const boxes = ['tan', 'olive', 'woodDark', 'tan', 'black'];
  for (const y of [0.14, 0.79, 1.44]) {
    let a = -L / 2 + 0.1;
    while (a < L / 2 - 0.35) {
      const bw = 0.25 + b.rng() * 0.3, bh = 0.2 + b.rng() * 0.32;
      if (b.rng() < 0.8) b.box(x + (ax ? a + bw / 2 : 0), y, z + (ax ? 0 : a + bw / 2), ax ? bw : D * 0.8, bh, ax ? D * 0.8 : bw, boxes[Math.floor(b.rng() * boxes.length)], false);
      a += bw + 0.04;
    }
  }
  b.world.add(x - w / 2, 0, z - d / 2, x + w / 2, 2.15, z + d / 2, 'metal');
}

/** Pallet of shrink-wrapped cartons. */
function palletLoad(b, x, z) {
  b.box(x, 0, z, 1.2, 0.14, 1.0, 'wood', false);
  const h = 0.5 + b.rng() * 0.9;
  b.box(x, 0.14, z, 1.1, h, 0.92, 'tan', false);
  b.box(x, 0.14 + h * 0.5, z, 1.12, 0.03, 0.94, 'signWhite', false); // strapping
  b.world.add(x - 0.6, 0, z - 0.5, x + 0.6, 0.14 + h, z + 0.5, 'wood');
}

/** A desk knocked on its side as cover. */
function overturned(b, x, z, rot) {
  b.mesh(new THREE.BoxGeometry(1.5, 0.75, 0.05), 'panelDark', x, 0.375, z, rot);
  b.mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), 'metalDark', x + Math.sin(rot) * 0.35, 0.05, z + Math.cos(rot) * 0.35, rot);
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const hx = 0.75 * c + 0.05 * s, hz = 0.75 * s + 0.05 * c;
  b.world.add(x - hx, 0, z - hz, x + hx, 0.76, z + hz, 'wood');
}

// ---------------------------------------------------------------- per map

/** Scatter helpers bound to a map: `cover` scales by quality, `piece` only lands outdoors. */
function tools(b, free) {
  const k = density(b);
  const out = (test) => (x, z) => outdoors(b, x, z) && (!test || test(x, z));
  return {
    cover: (n, test, r = 0.15, inside = false) => scatter(b, free, Math.round(n * k), inside ? test : out(test), r),
    piece: (n, test, r) => scatter(b, free, n, out(test), r),
  };
}

const quarter = (b) => Math.floor(b.rng() * 4) * Math.PI / 2;

function desert(b, free) {
  const { cover, piece } = tools(b, free);
  tufts(b, cover(1100, null, 0.2), [0xb4a064, 0x9c8a50, 0xc2ae74, 0x8a8a52], 0.5);
  pebbles(b, cover(650, null, 0.15), 0xa08a6a, 0.14);
  patches(b, piece(46, null, 1.2), ['tracks', 'dirt', 'tracks'], [2, 7]);
  const brassPts = [];
  for (const [x, z] of piece(10, null, 3.2)) crater(b, x, z, 1.4 + b.rng() * 1.2, 'dirt');
  for (const [x, z] of piece(7, null, 2.4)) nest(b, x, z, quarter(b), brassPts);
  for (const [x, z] of piece(5, null, 3.4)) wreck(b, x, z, b.rng() < 0.5 ? 'x' : 'z', b.rng() < 0.4 ? 'truck' : 'car');
  for (const [x, z] of piece(7, null, 2.4)) ruinedWall(b, x, z, 2.5 + b.rng() * 3, b.rng() < 0.5 ? 'x' : 'z', b.rng() < 0.5 ? 'plasterTan' : 'concreteDark');
  for (const [x, z] of piece(6, null, 1.6)) supplyPile(b, x, z);
  litter(b, cover(140, null, 0.2, true), [0xd8d0b8, 0xb89a6a, 0x8a7a5a, 0x5a6340]);
  cans(b, cover(90, null, 0.15, true));
  brass(b, brassPts.concat(cover(200, null, 0.1, true)));
}

function downtown(b, free) {
  const { cover, piece } = tools(b, free);
  const street = (x, z) => Math.abs(x) < 11 || Math.abs(z) < 11;
  litter(b, cover(480, null, 0.15, true));
  cans(b, cover(160, null, 0.12, true));
  sacks(b, cover(70, null, 0.4));
  tufts(b, cover(380, null, 0.2), [0x6a7a3a, 0x5a6a30, 0x7a7a42], 0.32); // weeds through the cracks
  pebbles(b, cover(480, null, 0.12, true), 0x8a8682, 0.1); // broken concrete chips
  patches(b, piece(36, null, 1.2), ['burnt', 'concreteDark', 'puddle'], [1.2, 4]); // stains, patched tarmac
  cones(b, cover(40, street, 0.3));
  const brassPts = [];
  for (const [x, z] of piece(7, street, 3)) crater(b, x, z, 1.3 + b.rng(), 'concreteDark');
  for (const [x, z] of piece(8, null, 3.4)) wreck(b, x, z, Math.abs(x) < Math.abs(z) ? 'z' : 'x');
  for (const [x, z] of piece(14, null, 1.8)) rubbleHeap(b, x, z, 1.4 + b.rng() * 1.2);
  for (const [x, z] of piece(5, null, 2.4)) nest(b, x, z, quarter(b), brassPts);
  for (const [x, z] of piece(8, null, 2)) b.barrier(x, z, 3, b.rng() < 0.5 ? 'x' : 'z');
  brass(b, brassPts.concat(cover(160, null, 0.1, true)));
}

function snowfall(b, free) {
  const { cover, piece } = tools(b, free);
  tufts(b, cover(750, null, 0.2), [0x8a7a58, 0x6a6448, 0x9a8a62], 0.42); // dead grass through the snow
  pebbles(b, cover(480, null, 0.15), 0x5a5a5e, 0.16);
  patches(b, piece(30, null, 1.2), ['concreteDark', 'rockDark'], [1.2, 4.5]); // bare ground and slush
  const brassPts = [];
  for (const [x, z] of piece(8, null, 3.2)) crater(b, x, z, 1.4 + b.rng() * 1.1, 'rockDark');
  for (const [x, z] of piece(6, null, 2.4)) nest(b, x, z, quarter(b), brassPts);
  for (const [x, z] of piece(4, null, 3.4)) wreck(b, x, z, b.rng() < 0.5 ? 'x' : 'z', 'truck');
  for (const [x, z] of piece(5, null, 1.6)) supplyPile(b, x, z);
  for (const [x, z] of piece(4, null, 2.4)) ruinedWall(b, x, z, 3 + b.rng() * 2, b.rng() < 0.5 ? 'x' : 'z', 'concreteDark');
  litter(b, cover(70, null, 0.2, true), [0x5a6340, 0x8a8478, 0x3a3c3e]);
  brass(b, brassPts.concat(cover(140, null, 0.1, true)));
}

function harbor(b, free) {
  const { cover, piece } = tools(b, free);
  litter(b, cover(300, null, 0.15, true), [0xd8d4c8, 0xb89a6a, 0x8a8478, 0x3a5a7a, 0xa04030, 0xc8c0a8]);
  cans(b, cover(110, null, 0.12, true));
  pebbles(b, cover(300, null, 0.12, true), 0x7a7672, 0.09);
  tufts(b, cover(240, null, 0.2), [0x5a6a3a, 0x6a6a42], 0.3);
  patches(b, piece(42, null, 1.2), ['puddle', 'burnt', 'concreteDark'], [1.2, 4]); // oil, rust stains, wet patches
  sacks(b, cover(34, null, 0.4), 0x2a2a28);
  cones(b, cover(26, null, 0.3));
  const brassPts = [];
  for (const [x, z] of piece(5, (x, z) => z < 30, 3.4)) wreck(b, x, z, b.rng() < 0.5 ? 'x' : 'z');
  for (const [x, z] of piece(5, null, 2.4)) nest(b, x, z, quarter(b), brassPts);
  for (const [x, z] of piece(12, null, 0.7)) { b.barrel(x, z, ['steelBlue', 'olive', 'rust', 'signRed'][Math.floor(b.rng() * 4)]); if (b.rng() < 0.5 && free(x + 0.65, z, 0.35)) b.barrel(x + 0.65, z, 'steelBlue'); }
  // Coiled mooring ropes on the quay.
  for (const [x, z] of piece(10, (x, z) => z > 30, 0.6)) for (let i = 0; i < 3; i++) b.mesh(new THREE.TorusGeometry(0.42 - i * 0.05, 0.05, 6, 18), 'tarp', x, 0.05 + i * 0.09, z, 0, Math.PI / 2, 0);
  brass(b, brassPts.concat(cover(120, null, 0.1, true)));
}

function blacksite(b, free) {
  const { cover } = tools(b, free);
  const pts = (n, test, r) => scatter(b, free, n, test, r);
  // Against a wall: clear right where it stands, but something solid close by.
  const byWall = (r) => (x, z) => !free(x, z, r + 0.55);
  litter(b, cover(320, null, 0.12, true), [0xe8e8e0, 0xd8d8d0, 0xc8d0d8, 0xe0d8c0]); // papers everywhere
  for (const [x, z] of pts(14, (x, z) => Math.abs(x) > 14 || Math.abs(z) > 14, 1.7)) desk(b, x, z, b.rng() < 0.5 ? 0 : Math.PI / 2);
  for (const [x, z] of pts(14, byWall(0.45), 0.45)) cabinet(b, x, z);
  for (const [x, z] of pts(8, byWall(0.75), 0.75)) cart(b, x, z);
  for (const [x, z] of pts(6, byWall(0.85), 0.85)) supplyPile(b, x, z);
  for (const [x, z] of pts(16, byWall(1.0), 1.0)) shelves(b, x, z, free(x + 1.2, z, 0.2) && free(x - 1.2, z, 0.2) ? 'x' : 'z');
  for (const [x, z] of pts(14, byWall(0.75), 0.75)) palletLoad(b, x, z);
  for (const [x, z] of pts(10, null, 1.0)) overturned(b, x, z, quarter(b) + (b.rng() - 0.5) * 0.4);
  const brassPts = [];
  for (const [x, z] of pts(4, (x, z) => Math.abs(x) < 14 && Math.abs(z) < 14, 2.4)) nest(b, x, z, quarter(b), brassPts); // security's last stand in the atrium
  // Cables snaking across the floor.
  for (const [x, z] of pts(14, null, 1)) {
    let px = x, pz = z, a = b.rng() * 6.28;
    for (let i = 0; i < 5; i++) {
      const nx = px + Math.cos(a) * 1.2, nz = pz + Math.sin(a) * 1.2;
      if (!free(nx, nz, 0.1, 0.3)) break;
      b.mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), 'black', (px + nx) / 2, 0.02, (pz + nz) / 2, -a, 0, Math.PI / 2);
      px = nx; pz = nz; a += (b.rng() - 0.5) * 1.2;
    }
  }
  patches(b, pts(16, null, 1), ['burnt', 'puddle'], [1, 2.5]);
  brass(b, brassPts.concat(cover(140, null, 0.1, true)));
}

const DETAIL = { desert, downtown, snowfall, harbor, blacksite };

/** Add the detail layer for map `id` (call after the main dressing). */
export function detailMap(id, b, free) {
  DETAIL[id]?.(b, free);
}
