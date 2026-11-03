// Set dressing: fills each map with the clutter and context that make it read as a
// real place (vegetation, road markings, street furniture, power lines, debris,
// puddles, tyre tracks, military kit) plus distant backdrops beyond the playable
// area. Scattered props avoid spawns, objectives, LZs and enemy posts.
import * as THREE from '../lib/three.js';
import { MISSIONS } from '../campaign/Story.js';

// ---------------------------------------------------------------------------
// Placement helpers

function avoidList(b, mapId) {
  const pts = [];
  const add = (x, z, r) => pts.push({ x, z, r });
  for (const team of ['a', 'b', 'ffa']) for (const s of b.spawns[team]) add(s.x, s.z, 2.5);
  for (const d of b.domPoints) add(d.pos.x, d.pos.z, 5.5);
  for (const p of Object.values(b.points)) add(p.x, p.z, 3);
  for (const m of MISSIONS) {
    if (m.map !== mapId) continue;
    add(m.start.pos[0], m.start.pos[m.start.pos.length === 3 ? 2 : 1], 4);
    if (m.insertion) add(m.insertion.lz[0], m.insertion.lz[1], 7);
    for (const o of m.objectives) if (o.target) add(o.target[0], o.target.length === 3 ? o.target[2] : o.target[1], 3.5);
    for (const g of Object.values(m.groups)) for (const u of g.units) add(u.pos[0], u.pos.length === 3 ? u.pos[2] : u.pos[1], 1.6);
  }
  return pts;
}

function makeFree(b, avoid) {
  const w = b.world;
  return (x, z, r = 0.8, h = 2.2) => {
    const bd = w.bounds;
    if (x - r < bd.minX + 1 || x + r > bd.maxX - 1 || z - r < bd.minZ + 1 || z + r > bd.maxZ - 1) return false;
    if (w.overlaps(x - r, 0.05, z - r, x + r, h, z + r)) return false;
    for (const a of avoid) if (Math.hypot(a.x - x, a.z - z) < a.r + r) return false;
    return true;
  };
}

/** Thin cylinder between two points (wires, ropes, pipes). */
function beam(b, ax, ay, az, bx, by, bz, r, mat, seg = 5) {
  const a = new THREE.Vector3(ax, ay, az), c = new THREE.Vector3(bx, by, bz);
  const dir = c.clone().sub(a);
  const len = dir.length();
  const m = new THREE.Matrix4().compose(
    a.clone().add(c).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    new THREE.Vector3(1, 1, 1),
  );
  b.geometry(new THREE.CylinderGeometry(r, r, len, seg, 1), m, mat);
}

/** Sagging cable as two segments. */
function cable(b, ax, ay, az, bx, by, bz, sag = 0.6, mat = 'black') {
  const mx = (ax + bx) / 2, my = (ay + by) / 2 - sag, mz = (az + bz) / 2;
  beam(b, ax, ay, az, mx, my, mz, 0.018, mat, 4);
  beam(b, mx, my, mz, bx, by, bz, 0.018, mat, 4);
}

/** Instanced low-poly bushes / shrubs (one draw call per call). */
function bushes(b, points, color, scale = 1, snowCap = false) {
  if (!points.length) return;
  const geo = new THREE.IcosahedronGeometry(0.55, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + Math.random() * 0.3), p.getY(i) * 0.6, p.getZ(i) * (0.85 + Math.random() * 0.3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const im = new THREE.InstancedMesh(geo, mat, points.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  points.forEach(([x, z, k], i) => {
    const sc = scale * k;
    s.set(sc * (0.8 + Math.random() * 0.5), sc, sc * (0.8 + Math.random() * 0.5));
    q.setFromEuler(new THREE.Euler(0, Math.random() * 6.28, 0));
    m.compose(new THREE.Vector3(x, sc * 0.25, z), q, s);
    im.setMatrixAt(i, m);
  });
  im.receiveShadow = true;
  im.castShadow = true;
  b.root.add(im);
  if (snowCap) {
    const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.9 }), points.length);
    points.forEach(([x, z, k], i) => {
      m.compose(new THREE.Vector3(x, scale * k * 0.42, z), q.identity(), s.set(scale * k, scale * k * 0.45, scale * k));
      cap.setMatrixAt(i, m);
    });
    b.root.add(cap);
  }
}

function scatter(b, free, n, test, r = 0.6) {
  const out = [];
  const bd = b.world.bounds;
  let tries = 0;
  while (out.length < n && tries++ < n * 20) {
    const x = bd.minX + 2 + b.rng() * (bd.maxX - bd.minX - 4);
    const z = bd.minZ + 2 + b.rng() * (bd.maxZ - bd.minZ - 4);
    if (test && !test(x, z)) continue;
    if (!free(x, z, r)) continue;
    out.push([x, z, 0.6 + b.rng() * 0.8]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prop kit

function pallet(b, x, z, stack = 1, cargo = true) {
  for (let i = 0; i < stack; i++) {
    const y = i * 0.15;
    for (const dz of [-0.45, 0, 0.45]) b.box(x, y, z + dz, 1.2, 0.1, 0.1, 'woodDark', false);
    for (let k = 0; k < 5; k++) b.box(x - 0.5 + k * 0.25, y + 0.1, z, 0.12, 0.03, 1.0, 'wood', false);
  }
  let top = stack * 0.15;
  if (cargo) { b.box(x, top, z, 1.1, 0.7, 0.95, b.rng() < 0.5 ? 'tarp' : 'wood', false); top += 0.7; }
  b.world.add(x - 0.6, 0, z - 0.5, x + 0.6, top, z + 0.5, 'wood');
}

function jerrycans(b, x, z, n = 4) {
  for (let i = 0; i < n; i++) b.box(x + (i % 2) * 0.22, 0, z + Math.floor(i / 2) * 0.38, 0.17, 0.46, 0.34, i % 3 ? 'olive' : 'signRed', false);
}

function tires(b, x, z, n = 4) {
  for (let i = 0; i < n; i++) b.mesh(new THREE.TorusGeometry(0.33, 0.13, 8, 16), 'rubber', x + (b.rng() - 0.5) * 0.15, 0.13 + i * 0.25, z + (b.rng() - 0.5) * 0.15, 0, Math.PI / 2, 0);
  b.world.add(x - 0.45, 0, z - 0.45, x + 0.45, 0.25 * n + 0.05, z + 0.45, 'soft');
}

function generator(b, x, z, rot = 0) {
  const ax = Math.abs(Math.sin(rot)) > 0.5;
  b.box(x, 0, z, ax ? 0.9 : 1.7, 1.15, ax ? 1.7 : 0.9, 'olive');
  b.box(x, 1.15, z, ax ? 0.5 : 0.9, 0.12, ax ? 0.9 : 0.5, 'metalDark', false);
  b.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), 'metalDark', x + 0.3, 1.5, z + 0.2);
  b.mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 12), 'metalDark', x + (ax ? 0.46 : 0), 0.6, z + (ax ? 0 : 0.46), 0, Math.PI / 2, 0);
}

function powerPole(b, x, z, h = 8.5, axis = 'x') {
  b.mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 8), 'bark', x, h / 2, z);
  b.box(x, h - 0.6, z, axis === 'x' ? 0.12 : 1.9, 0.12, axis === 'x' ? 1.9 : 0.12, 'woodDark', false);
  for (const o of [-0.8, 0, 0.8]) b.mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 6), 'signWhite', x + (axis === 'x' ? 0 : o), h - 0.42, z + (axis === 'x' ? o : 0));
  b.world.add(x - 0.17, 0, z - 0.17, x + 0.17, h, z + 0.17, 'wood');
}

function powerLine(b, pts, h = 8.5, axis = 'x') {
  for (const [x, z] of pts) powerPole(b, x, z, h, axis);
  for (let i = 0; i + 1 < pts.length; i++) {
    for (const o of [-0.8, 0, 0.8]) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      cable(b, x1 + (axis === 'x' ? 0 : o), h - 0.35, z1 + (axis === 'x' ? o : 0), x2 + (axis === 'x' ? 0 : o), h - 0.35, z2 + (axis === 'x' ? o : 0), 0.7);
    }
  }
}

function concertina(b, x0, z0, x1, z1, y = 0) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.floor(len / 0.4);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    b.mesh(new THREE.TorusGeometry(0.42, 0.01, 3, 18), 'metal', x0 + (x1 - x0) * t, y + 0.42, z0 + (z1 - z0) * t, ang, 0, (i % 2 ? 0.25 : -0.25));
  }
}

function streetLight(b, x, z, side = 1, axis = 'z') {
  b.mesh(new THREE.CylinderGeometry(0.07, 0.1, 7, 8), 'metalDark', x, 3.5, z);
  const ox = axis === 'z' ? 0 : side * 1.2, oz = axis === 'z' ? side * 1.2 : 0;
  beam(b, x, 6.9, z, x + ox, 7.0, z + oz, 0.05, 'metalDark');
  b.box(x + ox, 6.82, z + oz, 0.5, 0.12, 0.25, 'metalDark', false);
  b.box(x + ox, 6.76, z + oz, 0.4, 0.04, 0.2, 'lightWarm', false);
  b.world.add(x - 0.1, 0, z - 0.1, x + 0.1, 7, z + 0.1, 'metal');
}

function trafficLight(b, x, z, armX, armZ) {
  b.mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.6, 8), 'metalDark', x, 2.8, z);
  beam(b, x, 5.4, z, x + armX, 5.4, z + armZ, 0.06, 'metalDark');
  const hx = x + armX, hz = z + armZ;
  b.box(hx, 4.3, hz, 0.36, 1.0, 0.3, 'black', false);
  const lit = Math.floor(b.rng() * 3);
  ['lightRed', 'lightAmber', 'lightGreen'].forEach((m, i) => {
    b.box(hx, 5.1 - i * 0.3, hz, 0.22, 0.2, 0.32, i === lit ? m : 'black', false);
  });
  b.world.add(x - 0.12, 0, z - 0.12, x + 0.12, 5.6, z + 0.12, 'metal');
}

function bench(b, x, z, axis = 'x') {
  const ax = axis === 'x';
  b.box(x, 0.42, z, ax ? 1.8 : 0.45, 0.06, ax ? 0.45 : 1.8, 'wood', false);
  b.box(x + (ax ? 0 : 0.2), 0.62, z + (ax ? 0.2 : 0), ax ? 1.8 : 0.06, 0.35, ax ? 0.06 : 1.8, 'wood', false);
  for (const o of [-0.75, 0.75]) b.box(x + (ax ? o : 0), 0, z + (ax ? 0 : o), ax ? 0.06 : 0.45, 0.42, ax ? 0.45 : 0.06, 'metalDark', false);
}

function hydrant(b, x, z) {
  b.mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.65, 10), 'signRed', x, 0.33, z);
  b.mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'signRed', x, 0.65, z);
  b.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 8), 'signRed', x, 0.42, z, 0, 0, Math.PI / 2);
}

function trashBin(b, x, z) {
  b.mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.9, 12), 'metalDark', x, 0.45, z);
  b.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12), 'black', x, 0.92, z);
}

function dumpster(b, x, z, axis = 'x') {
  const ax = axis === 'x';
  b.box(x, 0.12, z, ax ? 2.0 : 1.4, 1.25, ax ? 1.4 : 2.0, 'contGreen');
  b.box(x, 1.37, z, ax ? 2.05 : 1.45, 0.06, ax ? 1.45 : 2.05, 'black', false);
  for (const o of [-0.8, 0.8]) for (const p of [-0.55, 0.55]) b.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), 'rubber', x + (ax ? o : p), 0.07, z + (ax ? p : o), 0, Math.PI / 2, 0);
}

function sign(b, x, z, mat = 'signGreen', rot = 0) {
  b.mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), 'metalDark', x, 1.4, z);
  b.mesh(new THREE.BoxGeometry(0.8, 0.5, 0.03), mat, x, 2.5, z, rot);
}

function forklift(b, x, z, rot = 0) {
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz, rx = 0, rz = 0) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
    const world = new THREE.Matrix4().makeRotationY(rot).premultiply(new THREE.Matrix4().makeTranslation(x, 0, z)).multiply(m);
    b.geometry(geo, world, mat);
  };
  add(new THREE.BoxGeometry(1.2, 0.9, 2.0), 'contOrange', 0, 0.75, 0.2);
  add(new THREE.BoxGeometry(1.15, 0.6, 0.5), 'metalDark', 0, 0.6, 1.25); // counterweight
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.4, 0.95]) add(new THREE.BoxGeometry(0.06, 1.2, 0.06), 'black', sx, 1.8, sz);
  add(new THREE.BoxGeometry(1.2, 0.05, 1.45), 'black', 0, 2.4, 0.28); // overhead guard
  for (const sx of [-0.45, 0.45]) add(new THREE.BoxGeometry(0.1, 2.6, 0.1), 'metalDark', sx, 1.3, -0.85); // mast
  for (const sx of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.12, 0.05, 1.1), 'metalDark', sx, 0.12, -1.45); // forks
  add(new THREE.BoxGeometry(0.05, 0.4, 0.05), 'black', 0, 1.5, 0.1); // seat back
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.55, 0.9]) add(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), 'rubber', sx, 0.3, sz, 0, Math.PI / 2);
  void g;
  b.world.add(x - 1.2, 0, z - 1.2, x + 1.2, 2.4, z + 1.2, 'metal');
}

function camoNet(b, x, z, w, d, h = 3.2) {
  for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) b.box(x + ox, 0, z + oz, 0.08, h, 0.08, 'woodDark', false);
  b.box(x, h, z, w + 0.6, 0.04, d + 0.6, 'tarp', false);
  for (let i = 0; i < 10; i++) b.mesh(new THREE.ConeGeometry(0.5 + b.rng() * 0.6, 0.35, 5), 'tarp', x + (b.rng() - 0.5) * w, h - 0.15, z + (b.rng() - 0.5) * d, b.rng() * 6, Math.PI, 0);
}

function puddle(b, x, z, r) {
  const geo = new THREE.CircleGeometry(r, 14);
  const p = geo.attributes.position;
  for (let i = 1; i < p.count; i++) { const k = 0.7 + Math.random() * 0.45; p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * (0.6 + Math.random() * 0.3)); }
  b.mesh(geo, 'puddle', x, 0.03, z, 0, -Math.PI / 2, 0);
}

function flag(b, x, z, mat = 'signRed') {
  b.mesh(new THREE.CylinderGeometry(0.05, 0.06, 9, 8), 'metal', x, 4.5, z);
  b.box(x + 0.75, 7.6, z, 1.5, 0.9, 0.02, mat, false);
  b.box(x + 0.75, 7.6, z, 0.5, 0.9, 0.025, 'black', false);
  b.world.add(x - 0.07, 0, z - 0.07, x + 0.07, 9, z + 0.07, 'metal');
}

function lightTower(b, x, z) {
  b.box(x, 0.3, z, 1.4, 0.7, 2.6, 'contOrange');
  for (const o of [-0.8, 0.8]) b.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), 'rubber', x + 0.75 * Math.sign(o), 0.3, z + o * 0.5, 0, 0, Math.PI / 2);
  b.mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 6), 'metalDark', x, 4.5, z + 0.8);
  b.box(x, 7.8, z + 0.8, 1.6, 0.08, 0.1, 'metalDark', false);
  for (const o of [-0.6, -0.2, 0.2, 0.6]) b.box(x + o, 7.55, z + 0.8, 0.32, 0.3, 0.15, 'lightPanel', false);
}

function trailer(b, x, z, mat) {
  b.box(x, 1.0, z, 2.3, 0.18, 12.2, 'metalDark', false);
  for (const o of [4.4, 5.4]) for (const s of [-1, 1]) b.mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 12), 'rubber', x + s * 0.9, 0.48, z + o, 0, 0, Math.PI / 2);
  b.box(x, 0, z - 4.8, 0.15, 1.0, 0.15, 'metalDark', false);
  b.container(x, 1.18, z, 'z', mat);
  b.world.add(x - 1.2, 0, z - 6.1, x + 1.2, 1.2, z + 6.1, 'metal');
}

// ---------------------------------------------------------------------------
// Backdrops (outside the playable area, no shadows)

function backdropMeshes(b, list) {
  const mats = {};
  for (const item of list) {
    const key = item.color;
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color: item.color, roughness: 1, flatShading: true, emissive: item.emissive ?? 0x000000, emissiveIntensity: item.ei ?? 1 });
    const m = new THREE.Mesh(item.geo, mats[key]);
    m.position.set(item.x, item.y ?? 0, item.z);
    m.rotation.y = item.ry ?? 0;
    if (item.s) m.scale.set(...item.s);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    b.root.add(m);
  }
}

function ringPositions(b, n, r0, r1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b.rng() * 0.25;
    const r = r0 + b.rng() * (r1 - r0);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-map dressing

function desert(b, free) {
  // Mesas and ridgelines on the horizon.
  const far = [];
  for (const [x, z] of ringPositions(b, 22, 200, 300)) {
    const r = 25 + b.rng() * 40, h = 18 + b.rng() * 45;
    far.push({ geo: new THREE.CylinderGeometry(r * (0.55 + b.rng() * 0.25), r, h, 7), color: 0xb98f60, x, z, y: h / 2 - 2, ry: b.rng() * 3 });
  }
  backdropMeshes(b, far);
  // Tyre tracks along both roads.
  for (const o of [-1.15, 1.15]) {
    b.patch(o, 0, 0.32, 138, 'tracks', 0.035);
    b.patch(0, o * 0.9, 138, 0.3, 'tracks', 0.036);
  }
  // Power line along the east road to the village.
  powerLine(b, [[34, 5.2], [45, 5.2], [56, 5.2], [67, 5.2]], 8.5, 'x');
  powerLine(b, [[-34, -5.2], [-45, -5.2], [-56, -5.2], [-67, -5.2]], 8.5, 'x');
  // Concertina wire outside the hesco perimeter.
  for (const [x0, z0, x1, z1] of [[-30, -32.2, -5, -32.2], [5, -32.2, 30, -32.2], [-30, 32.2, -5, 32.2], [5, 32.2, 30, 32.2], [-32.2, -29, -32.2, 29], [32.2, -29, 32.2, -7], [32.2, 10, 32.2, 29]]) concertina(b, x0, z0, x1, z1);
  // Compound kit.
  if (free(9.5, -5, 1.2)) generator(b, 9.5, -5, 0);
  if (free(-23.5, -7, 1.4)) { b.mesh(new THREE.CapsuleGeometry(0.4, 2.2, 4, 10), 'black', -23.5, 0.25, -7, 0, 0, Math.PI / 2, 0.6, 1, 1.6); b.world.add(-25.2, 0, -7.6, -21.8, 0.5, -6.4, 'soft'); }
  camoNet(b, -10, -20, 8, 4.4, 3.4);
  for (const [x, z] of [[12, -7.5], [-14, 6.5], [15, 20], [-5, -24]]) if (free(x, z, 0.9)) pallet(b, x, z, 1 + Math.floor(b.rng() * 2));
  for (const [x, z] of [[-3, -27.5], [22, -27], [-27, 20], [7, 26]]) if (free(x, z, 0.6)) jerrycans(b, x, z, 4);
  if (free(-4, -9, 0.4)) flag(b, -3.5, -9.5, 'signRed');
  for (const [x, z] of [[25, -10], [-12, -27]]) if (free(x, z, 0.7)) tires(b, x, z, 3);
  // Desert scrub and rocks.
  bushes(b, scatter(b, free, 230, (x, z) => (Math.abs(x) > 5 && Math.abs(z) > 4) && (Math.abs(x) > 31 || Math.abs(z) > 31 || b.rng() < 0.15), 0.4), 0x6f6a40, 1.1);
  for (const [x, z, k] of scatter(b, free, 80, null, 0.3)) b.rock(x, z, 0.25 * k + 0.1, 'rock', false);
}

function downtown(b, free) {
  // Skyline beyond the battle zone.
  const far = [];
  for (const [x, z] of ringPositions(b, 46, 120, 230)) {
    const w = 14 + b.rng() * 22, h = 25 + b.rng() * 75;
    far.push({ geo: new THREE.BoxGeometry(w, h, w * (0.7 + b.rng() * 0.6)), color: b.rng() < 0.5 ? 0x6e7276 : 0x5a5e62, x, z, y: h / 2, ry: b.rng() * 0.4 });
  }
  backdropMeshes(b, far);
  // Road markings: dashed centre lines, crosswalks, stop lines.
  for (let x = -60; x < 60; x += 6) if (Math.abs(x) > 12) b.patch(x + 1.5, 0, 3, 0.15, 'roadYellow', 0.035);
  for (let z = -60; z < 60; z += 6) if (Math.abs(z) > 12) b.patch(0, z + 1.5, 0.15, 3, 'roadYellow', 0.035);
  for (const s of [-1, 1]) {
    for (let k = -5; k <= 5; k += 1.1) {
      b.patch(s * 11.5, k, 2.6, 0.5, 'roadPaint', 0.034);
      b.patch(k, s * 11.5, 0.5, 2.6, 'roadPaint', 0.034);
    }
    b.patch(s * 13.2, s > 0 ? -3 : 3, 0.3, 6, 'roadPaint', 0.034);
    b.patch(s > 0 ? 3 : -3, s * 13.2, 6, 0.3, 'roadPaint', 0.034);
  }
  // Traffic lights at the intersection.
  trafficLight(b, 8.3, -8.3, -3.5, 0); trafficLight(b, -8.3, 8.3, 3.5, 0);
  trafficLight(b, 8.3, 8.3, 0, -3.5); trafficLight(b, -8.3, -8.3, 0, 3.5);
  // Street furniture along the sidewalks.
  const r = b.rng;
  for (let x = -55; x <= 55; x += 9) {
    if (Math.abs(x) < 14) continue;
    for (const s of [-1, 1]) {
      const z = s * 9.4;
      const k = r();
      if (!free(x, z, 0.4, 1)) continue;
      if (k < 0.25) bench(b, x, z, 'x');
      else if (k < 0.45) trashBin(b, x, z);
      else if (k < 0.6) hydrant(b, x, z);
      else if (k < 0.75) sign(b, x, z, r() < 0.5 ? 'signGreen' : 'signBlue');
    }
  }
  for (let z = -55; z <= 55; z += 9) {
    if (Math.abs(z) < 14) continue;
    for (const s of [-1, 1]) {
      const x = s * 9.4;
      if (!free(x, z, 0.4, 1)) continue;
      if (r() < 0.4) trashBin(b, x, z); else if (r() < 0.5) hydrant(b, x, z);
    }
  }
  for (const [x, z, a] of [[30, 11.5, 'x'], [-30, -11.5, 'x'], [11.5, -30, 'z'], [-11.5, 40, 'z']]) if (free(x, z, 1.2)) dumpster(b, x, z, a);
  // Overhead cables strung between buildings.
  for (const x of [-42, -28, 28, 44]) cable(b, x, 8.5, -10.2, x + 2, 8.5, 10.2, 0.9);
  for (const z of [-40, 30]) cable(b, -10.2, 8, z, 10.2, 8.2, z + 3, 0.9);
  // Craters, scorch, debris and litter.
  for (const [x, z] of [[-18, -2], [14, 3], [2, -38], [-3, 33]]) { b.patch(x, z, 3.2, 3.2, 'burnt', 0.031); b.debris(x, z, 8, 2.2); }
  for (const [x, z] of scatter(b, free, 60, null, 0.3)) b.debris(x, z, 2, 0.6);
  for (const [x, z] of scatter(b, free, 70, (x, z) => Math.abs(x) < 10 || Math.abs(z) < 10, 0.2)) b.box(x, 0.02, z, 0.25 + r() * 0.2, 0.005, 0.3, 'signWhite', false);
  if (free(29, 4.5, 0.6)) tires(b, 29, 4.5, 4);
  if (free(-20, -4.5, 0.6)) tires(b, -20, -4.5, 3);
  bushes(b, scatter(b, free, 40, (x, z) => Math.abs(x) > 10 && Math.abs(z) > 10, 0.4), 0x4f5a34, 0.7);
}

function snowfall(b, free) {
  // Snow drifts against walls and along the cliffs.
  for (const [x, z, k] of scatter(b, free, 45, null, 1.2)) b.mesh(new THREE.SphereGeometry(1, 10, 6), 'snow', x, -0.2, z, b.rng() * 6, 0, 0, 1.6 * k, 0.55, 1.1 * k);
  // Extra pines in clusters near the edges.
  for (const [x, z] of scatter(b, free, 34, (x, z) => Math.abs(x) > 52 || Math.abs(z) > 54, 1)) b.pine(x, z, 6 + b.rng() * 5, true);
  bushes(b, scatter(b, free, 120, null, 0.4), 0x3a4a3a, 0.9, true);
  // Vehicle tracks on the main road.
  for (const o of [-1.2, 1.2]) b.patch(o, 0, 0.45, 118, 'concreteDark', 0.034);
  // Comms mast with guy wires beside the radar station.
  if (free(32, 30, 0.6)) {
    b.box(32, 0, 30, 0.5, 16, 0.5, 'metal');
    for (let i = 1; i < 6; i++) b.box(32, i * 2.8, 30, 0.9, 0.08, 0.9, 'metalDark', false);
    for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) beam(b, 32, 14, 30, 32 + dx, 0, 30 + dz, 0.015, 'black', 4);
    b.mesh(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), 'signWhite', 32, 12.5, 30.5, 0, -1.2, 0);
  }
  for (const [x, z] of [[10, -30], [-12, 30], [-30, -12]]) if (free(x, z, 1.5)) lightTower(b, x, z);
  for (const [x, z] of [[-36, 12], [-37, 14]]) if (free(x, z, 0.4)) b.barrel(x, z, 'olive');
  if (free(-36, 8, 1.2)) generator(b, -36, 8, Math.PI / 2);
  for (const [x, z] of [[8, -22], [-8, 22], [16, 2], [-14, -10]]) if (free(x, z, 0.9)) pallet(b, x, z, 1);
  for (const fz of [-50, 55]) for (const [a, c] of [[-40, -26.3], [-24.7, -3.6], [3.6, 24.7], [26.3, 40]]) concertina(b, a, fz, c, fz, 2.2);
}

function blacksite(b, free) {
  // Pipe runs, cable trays and ducts along the main corridors.
  for (const s of [-1, 1]) {
    for (const [z, r, mat] of [[-2.6, 0.13, 'pipeRed'], [-2.1, 0.09, 'metal'], [2.4, 0.11, 'pipeYellow']]) {
      beam(b, s * 10.4, 4.15, z, s * 41.5, 4.15, z, r, mat, 10);
    }
    b.box(s * 26, 4.3, 0, 31, 0.08, 0.5, 'metalDark', false); // cable tray
    beam(b, s * 13, 4.2, -38, s * 13, 4.2, -14.5, 0.1, 'metal', 10);
    beam(b, s * 13, 4.2, 14.5, s * 13, 4.2, 38, 0.1, 'metal', 10);
    for (let x = 14; x < 41; x += 4) b.box(s * x, 4.0, 0, 0.06, 0.6, 6, 'metalDark', false); // pipe hangers
  }
  // Floor guide lines.
  for (const s of [-1, 1]) { b.patch(s * 26, -7.5, 30, 0.12, 'roadYellow', 0.03); b.patch(s * 26, 7.5, 30, 0.12, 'roadYellow', 0.03); }
  // Lockers in the armory.
  for (let z = -36.5; z < -16; z += 0.62) b.box(-37.45, 0, z, 0.5, 1.9, 0.58, 'steelBlue', false);
  b.world.add(-37.7, 0, -36.8, -37.2, 1.9, -15.9, 'metal');
  // Status LEDs on the server racks.
  for (let i = 0; i < 4; i++) for (const zc of [22, 30]) for (const s of [-1, 1]) for (let k = 0; k < 8; k++) {
    b.box(-33 + i * 4.5 + s * 0.505, 0.5 + k * 0.24, zc - 2 + (k % 3) * 1.6, 0.01, 0.03, 0.05, k % 4 === 0 ? 'lightAmber' : 'lightGreen', false);
  }
  // Monitors on the lab benches.
  for (const [x, z] of [[22, 24], [22, 30], [30, 24], [30, 30]]) { b.box(x, 0.78, z, 0.55, 0.36, 0.04, 'black', false); b.box(x, 0.8, z - 0.025, 0.5, 0.3, 0.01, 'screenBlue', false); }
  // Gas cylinders and crates.
  for (let i = 0; i < 6; i++) b.mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 10), i % 2 ? 'contGreen' : 'metal', -10.6 + (i % 3) * 0.3, 0.7, -36.5 + Math.floor(i / 3) * 0.3);
  for (const [x, z] of scatter(b, free, 10, (x, z) => Math.abs(x) > 12 || Math.abs(z) > 12, 0.7)) b.crate(x, z, 0.9, 0, b.rng() < 0.5 ? 'olive' : 'wood');
  // Hazard placards beside doors.
  for (const [x, z] of [[-21, 13.8], [21, 13.8], [-21, -13.8], [21, -13.8], [3, 21.8], [-9, -21.8]]) b.box(x, 1.8, z, 0.5, 0.5, 0.03, 'hazard', false);
}

function harbor(b, free) {
  // Ships at anchor, far shore hills and town lights.
  const far = [];
  for (let i = 0; i < 5; i++) {
    const x = -220 + i * 110 + (b.rng() - 0.5) * 40, z = 160 + b.rng() * 120, L = 60 + b.rng() * 60;
    far.push({ geo: new THREE.BoxGeometry(L, 9, 14), color: 0x1d2228, x, z, y: 2 });
    far.push({ geo: new THREE.BoxGeometry(12, 12, 12), color: 0x2a2e33, x: x + L * 0.35, z, y: 12 });
    far.push({ geo: new THREE.BoxGeometry(0.8, 0.8, 0.8), color: 0xffd080, emissive: 0xffc060, ei: 3, x: x + L * 0.35, z: z - 6.5, y: 14 });
  }
  for (let i = 0; i < 9; i++) far.push({ geo: new THREE.ConeGeometry(70 + b.rng() * 60, 30 + b.rng() * 40, 6), color: 0x141a20, x: -400 + i * 100, z: 420 + b.rng() * 60, y: 10 });
  for (let i = 0; i < 70; i++) far.push({ geo: new THREE.BoxGeometry(1.5, 1.5, 1.5), color: 0xffcf8a, emissive: 0xffb050, ei: 2.5, x: -380 + b.rng() * 760, z: 390 + b.rng() * 40, y: 3 + b.rng() * 18 });
  backdropMeshes(b, far);
  // Mooring lines from the bollards up to the ship.
  for (const x of [-34, -18, 6, 22, 38]) beam(b, x, 0.85, 45.6, x + 2, 9.5, 51, 0.035, 'tarp', 5);
  // Lane markings.
  for (let x = -68; x < 68; x += 7) { b.patch(x, 25.3, 3.5, 0.15, 'roadYellow', 0.035); b.patch(x, 34.7, 3.5, 0.15, 'roadYellow', 0.035); }
  for (let z = -60; z < 30; z += 7) b.patch(-12.2, z, 0.15, 3.5, 'roadYellow', 0.035);
  // Rain puddles (reflective), yard equipment.
  for (const [x, z, k] of scatter(b, free, 34, null, 1.2)) puddle(b, x, z, 0.9 + k * 1.3);
  for (const [x, z, rot] of [[-12, 12, 0.4], [54, -16, 1.5], [3, -6, 3]]) if (free(x, z, 1.3)) forklift(b, x, z, rot);
  for (const [x, z] of scatter(b, free, 12, (x, z) => z < 24, 0.9)) pallet(b, x, z, 1 + Math.floor(b.rng() * 3), b.rng() < 0.6);
  if (free(-52, 12, 1.3, 1.3) && free(-52, 4, 1.3, 1.3)) trailer(b, -52, 8, 'contBlue');
  for (const [x, z] of [[60, 24], [-58, -40], [46, -24]]) if (free(x, z, 0.6)) tires(b, x, z, 4);
  for (const [x, z] of [[-48, -28], [50, 4]]) if (free(x, z, 1.5)) lightTower(b, x, z);
  for (const [x, z] of [[-14, -30], [10, -30], [-40, 24]]) if (free(x, z, 1.2)) dumpster(b, x, z, 'x');
}

const DRESS = { desert, downtown, snowfall, blacksite, harbor };

export function dressMap(id, b) {
  const fn = DRESS[id];
  if (!fn) return;
  const free = makeFree(b, avoidList(b, id));
  fn(b, free);
}
