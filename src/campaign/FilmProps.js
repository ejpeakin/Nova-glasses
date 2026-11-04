// Detailed vehicles and set dressing for the story film: an FMTV-style 6x6 cargo
// truck (and a fuel tanker on the same chassis), an M-ATV-style armoured escort
// with a gun turret, roadside clutter (utility poles and wires, marker posts,
// rocks, scrub, pines), the test range's target compound, and props for the
// airfield, the office and the lab.
//
// Vehicles face +X (front), Y is up, Z is the width. Static parts are merged
// into one mesh per material; wheels stay separate so they can turn.
import * as THREE from '../lib/three.js';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(c, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

// ---------------------------------------------------------------- textures

/** Painted metal: mottled fade, chips, scratches and a film of dust. (1 texture repeat = 1 m) */
function paintTex(hex, seed) {
  const c = cv(256, 256), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = css(hex); g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const dark = R() < 0.55;
    g.fillStyle = dark ? `rgba(25,20,12,${0.012 + R() * 0.025})` : `rgba(255,246,226,${0.01 + R() * 0.02})`;
    g.beginPath(); g.arc(R() * 256, R() * 256, 2 + R() * 10, 0, PI * 2); g.fill();
  }
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(40,34,26,${0.25 + R() * 0.4})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 2); }
  g.lineWidth = 0.7;
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${R() < 0.5 ? '30,26,20' : '220,210,190'},${0.12 + R() * 0.15})`;
    const x = R() * 256, y = R() * 256;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 34, y + (R() - 0.5) * 10); g.stroke();
  }
  // Streaks running down from rain.
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,26,18,${0.03 + R() * 0.05})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 2, 20 + R() * 60); }
  return ctex(c);
}

/** Canvas tarp: woven texture with folds and dirt. */
function tarpTex(hex, seed) {
  const c = cv(256, 256), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = css(hex); g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.04})`; g.fillRect(0, y, 256, 1); }
  for (let x = 0; x < 256; x += 2) { g.fillStyle = `rgba(255,255,255,${0.02 + R() * 0.03})`; g.fillRect(x, 0, 1, 256); }
  for (let i = 0; i < 26; i++) {
    const x = R() * 256, w = 6 + R() * 18;
    const gr = g.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${0.08 + R() * 0.1})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - w, 0, w * 2, 256);
  }
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,48,30,${0.03 + R() * 0.05})`; g.beginPath(); g.arc(R() * 256, R() * 256, 1 + R() * 9, 0, PI * 2); g.fill(); }
  return ctex(c);
}

function treadTex() {
  const c = cv(128, 64), g = c.getContext('2d');
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#141414';
  for (let i = 0; i < 8; i++) {
    const x = i * 16;
    g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 7, 8); g.lineTo(x + 13, 32); g.lineTo(x + 7, 56); g.lineTo(x, 56); g.lineTo(x + 6, 32); g.closePath(); g.fill();
  }
  g.fillStyle = '#3a3a3a'; g.fillRect(0, 0, 128, 7); g.fillRect(0, 57, 128, 7);
  return ctex(c, false);
}

/** Grille: horizontal slats with a dark gap behind. */
function grilleTex(hex) {
  const c = cv(128, 64), g = c.getContext('2d');
  g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = css(hex);
  for (let y = 2; y < 64; y += 8) g.fillRect(2, y, 124, 4);
  g.fillRect(0, 0, 3, 64); g.fillRect(125, 0, 3, 64); g.fillRect(62, 0, 4, 64);
  return ctex(c, true, false);
}

/** White stencilled text on transparent (bumper codes, placards). */
function stencilTex(lines, w = 256, h = 64, color = '#e6e2d4', font = 'bold 26px monospace') {
  const c = cv(w, h), g = c.getContext('2d');
  g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1)));
  return ctex(c, true, false);
}

function barkTex() {
  const c = cv(64, 256), g = c.getContext('2d'), R = rng(7);
  g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '20,14,8' : '110,92,70'},${0.2 + R() * 0.3})`; g.fillRect(R() * 64, R() * 256, 1 + R() * 2, 8 + R() * 30); }
  return ctex(c);
}

function corrugatedTex(hex, seed) {
  const c = cv(256, 256), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = css(hex); g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const gr = g.createLinearGradient(x, 0, x + 16, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(x, 0, 16, 256);
  }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(120,60,25,${0.08 + R() * 0.2})`; g.beginPath(); g.arc(R() * 256, R() * 256, 2 + R() * 12, 0, PI * 2); g.fill(); }
  return ctex(c);
}

// ---------------------------------------------------------------- geometry kit

/** Box with rounded edges (radius r) built by extruding a bevelled rectangle. */
export function bevelBox(w, h, d, r, seg = 2) {
  r = Math.max(0.002, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const x = w / 2 - r, y = h / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-x, -y); s.lineTo(x, -y); s.lineTo(x, y); s.lineTo(-x, y); s.lineTo(-x, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 2 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _n = new THREE.Vector3(), _p = new THREE.Vector3();

/** Collects transformed primitives and merges them into one mesh per material. */
class Kit {
  constructor() { this.by = new Map(); }
  /** p position, r Euler rotation, s scale; uvs are re-projected at uvScale (1 = texture per metre) unless keepUV. */
  add(mat, geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    g.applyMatrix4(_m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _n.set(s[0], s[1], s[2])));
    if (!o.keepUV) {
      // Box projection in world units so every part shares the same texel density.
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, k = o.uvScale ?? 1;
      for (let i = 0; i < P.count; i++) {
        const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
        if (ax >= ay && ax >= az) U.setXY(i, P.getZ(i) * k, P.getY(i) * k);
        else if (ay >= az) U.setXY(i, P.getX(i) * k, P.getZ(i) * k);
        else U.setXY(i, P.getX(i) * k, P.getY(i) * k);
      }
    }
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return this;
  }
  box(mat, w, h, d, x, y, z, r, o) { return this.add(mat, new THREE.BoxGeometry(w, h, d), [x, y, z], r, undefined, o); }
  bbox(mat, w, h, d, rad, x, y, z, r, o) { return this.add(mat, bevelBox(w, h, d, rad), [x, y, z], r, undefined, o); }
  cyl(mat, r1, r2, h, seg, x, y, z, r, o) { return this.add(mat, new THREE.CylinderGeometry(r1, r2, h, seg), [x, y, z], r, undefined, o); }
  /** Cylinder between two points. */
  rod(mat, a, b, rad, seg = 6) {
    const d = V().subVectors(b, a), len = d.length();
    const g = new THREE.CylinderGeometry(rad, rad, len, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return this.add(mat, g);
  }
  build(parent, { shadow = true, receive = true } = {}) {
    for (const [mat, list] of this.by) {
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = shadow; mesh.receiveShadow = receive;
      parent.add(mesh);
    }
    this.by.clear();
    return parent;
  }
}

// ---------------------------------------------------------------- materials

const MAT = new Map();
function mats(color, seed = 1) {
  const key = `${color}:${seed}`;
  if (MAT.has(key)) return MAT.get(key);
  const tread = treadTex();
  const m = {
    paint: new THREE.MeshStandardMaterial({ map: paintTex(color, seed), roughness: 0.7, metalness: 0.2 }),
    trim: new THREE.MeshStandardMaterial({ map: paintTex(new THREE.Color(color).multiplyScalar(0.72).getHex(), seed + 3), roughness: 0.75, metalness: 0.2 }),
    chassis: new THREE.MeshStandardMaterial({ map: paintTex(0x1d1e1c, seed + 1), roughness: 0.8, metalness: 0.35 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x242424, map: tread, bumpMap: tread, bumpScale: 3, roughness: 0.92, metalness: 0 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141515, roughness: 0.65, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.35, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.12, metalness: 0.45 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff1cc, emissiveIntensity: 2.2, roughness: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0805, emissive: 0xff2010, emissiveIntensity: 1.6, roughness: 0.3 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x6a4000, emissive: 0xff9a20, emissiveIntensity: 0.8, roughness: 0.3 }),
    grille: new THREE.MeshStandardMaterial({ map: grilleTex(color), roughness: 0.6, metalness: 0.3 }),
    tarp: new THREE.MeshStandardMaterial({ map: tarpTex(new THREE.Color(color).lerp(new THREE.Color(0x5f5a3c), 0.55).getHex(), seed + 5), roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ map: paintTex(0x5d4a33, seed + 9), roughness: 0.9, metalness: 0 }),
  };
  MAT.set(key, m);
  return m;
}

// ---------------------------------------------------------------- wheels

const wheelCache = new Map();
/** A military tyre on a beadlock rim; axle along Z, centred at the origin. */
function wheelGeos(R, W, M) {
  const key = `${R}:${W}`;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const prof = [[R * 0.6, -W / 2], [R * 0.88, -W / 2], [R * 0.96, -W * 0.45], [R, -W * 0.34], [R, W * 0.34], [R * 0.96, W * 0.45], [R * 0.88, W / 2], [R * 0.6, W / 2]];
  const tyre = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  tyre.rotateX(PI / 2);
  const tu = tyre.attributes.uv;
  for (let i = 0; i < tu.count; i++) tu.setX(i, tu.getX(i) * 14);
  const k = new Kit();
  k.add(M.rubber, tyre, undefined, undefined, undefined, { keepUV: true });
  const rimR = R * 0.6;
  k.cyl(M.trim, rimR, rimR, W * 0.84, 24, 0, 0, 0, [PI / 2, 0, 0]);
  for (const s of [-1, 1]) {
    k.add(M.trim, new THREE.TorusGeometry(rimR * 0.97, 0.025, 6, 24), [0, 0, s * W * 0.42]);
    k.cyl(M.trim, rimR * 0.5, rimR * 0.62, 0.05, 20, 0, 0, s * W * 0.44, [PI / 2, 0, 0]);
    k.cyl(M.chassis, R * 0.17, R * 0.2, 0.08, 14, 0, 0, s * W * 0.48, [PI / 2, 0, 0]); // hub
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; k.cyl(M.steel, 0.016, 0.016, 0.04, 6, Math.cos(a) * rimR * 0.78, Math.sin(a) * rimR * 0.78, s * W * 0.44, [PI / 2, 0, 0]); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + 0.2; k.cyl(M.steel, 0.02, 0.02, 0.05, 6, Math.cos(a) * R * 0.13, Math.sin(a) * R * 0.13, s * W * 0.52, [PI / 2, 0, 0]); }
  }
  const tmp = new THREE.Group();
  k.build(tmp);
  const out = tmp.children.map((m) => ({ geo: m.geometry, mat: m.material }));
  wheelCache.set(key, out);
  return out;
}

function wheel(R, W, M) {
  const g = new THREE.Group();
  for (const { geo, mat } of wheelGeos(R, W, M)) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}

/** Headlight in a square housing, facing +X. */
function headlight(k, M, x, y, z, r = 0.1) {
  k.bbox(M.black, 0.1, r * 2.6, r * 2.6, 0.02, x - 0.02, y, z);
  k.cyl(M.steel, r * 1.08, r * 1.08, 0.03, 16, x + 0.035, y, z, [0, 0, PI / 2]);
  k.cyl(M.lamp, r, r, 0.03, 16, x + 0.045, y, z, [0, 0, PI / 2]);
}

// ---------------------------------------------------------------- cargo truck

/**
 * FMTV-style 6x6 truck. body: 'cargo' (canvas-covered bed) | 'tanker' (fuel tank).
 * userData: wheels (spin about local Z), wheelR, lightAt (headlight position).
 */
export function buildCargoTruck({ color = 0x8a7f62, seed = 1, body = 'cargo', code = 'HQ-12' } = {}) {
  const g = new THREE.Group();
  const M = mats(color, seed);
  const k = new Kit();
  const R = 0.56, W = 0.4;
  const AXLES = [2.3, -1.25, -2.65];
  // Chassis rails, crossmembers, axles, differentials and springs.
  for (const z of [-0.46, 0.46]) k.box(M.chassis, 7.0, 0.26, 0.12, -0.35, 0.98, z);
  for (const x of [3.0, 1.7, 0.3, -1.0, -2.0, -3.3]) k.box(M.chassis, 0.12, 0.18, 0.92, x, 0.98, 0);
  for (const x of AXLES) {
    k.cyl(M.chassis, 0.075, 0.075, 2.0, 10, x, R, 0, [PI / 2, 0, 0]);
    k.add(M.chassis, new THREE.SphereGeometry(0.2, 12, 8), [x, R, 0], [0, 0, 0], [1.1, 0.95, 1.2]);
    for (const z of [-0.46, 0.46]) for (let j = 0; j < 4; j++) k.box(M.chassis, 1.1 - j * 0.2, 0.025, 0.09, x, R + 0.15 + j * 0.03, z);
  }
  k.cyl(M.chassis, 0.05, 0.05, 3.8, 8, 0.4, 0.62, 0, [0, 0, PI / 2]); // driveshaft
  // ---- Cab (forward of the bed, over the engine).
  k.bbox(M.paint, 1.85, 1.42, 2.32, 0.07, 2.27, 2.07, 0);
  // Nose with the grille and the engine hood shelf.
  k.bbox(M.paint, 0.42, 0.72, 2.16, 0.05, 3.34, 1.62, 0);
  k.add(M.grille, new THREE.PlaneGeometry(1.4, 0.5), [3.556, 1.64, 0], [0, PI / 2, 0], undefined, { keepUV: true });
  k.box(M.trim, 0.02, 0.56, 1.5, 3.548, 1.64, 0);
  // Windshield: two panes, pillars and frame, raked slightly back.
  for (const z of [-0.52, 0.52]) {
    k.box(M.glass, 0.02, 0.56, 0.92, 3.2, 2.34, z, [0, 0, -0.06]);
    k.box(M.black, 0.03, 0.015, 0.7, 3.18, 2.08, z, [0.32, 0, -0.06]); // wiper
  }
  k.box(M.trim, 0.05, 0.62, 0.1, 3.205, 2.34, 0, [0, 0, -0.06]);
  k.box(M.trim, 0.05, 0.07, 2.2, 3.22, 2.66, 0);
  k.box(M.trim, 0.05, 0.07, 2.2, 3.2, 2.02, 0);
  // Doors: windows, seams, handles, hinges, steps and grab bars.
  for (const s of [-1, 1]) {
    const z = s * 1.165;
    k.box(M.glass, 1.02, 0.5, 0.02, 2.45, 2.33, z);
    k.box(M.trim, 1.1, 0.05, 0.03, 2.45, 2.61, z); k.box(M.trim, 1.1, 0.05, 0.03, 2.45, 2.06, z);
    k.box(M.black, 0.012, 1.25, 0.03, 1.82, 1.98, z); k.box(M.black, 0.012, 1.25, 0.03, 3.08, 1.98, z);
    k.box(M.black, 1.27, 0.012, 0.03, 2.45, 1.36, z);
    k.box(M.steel, 0.16, 0.035, 0.04, 2.0, 1.95, z + s * 0.02);
    for (const y of [1.6, 2.3]) k.box(M.chassis, 0.06, 0.1, 0.04, 3.06, y, z + s * 0.015);
    k.box(M.chassis, 0.45, 0.04, 0.26, 2.45, 1.1, s * 1.08); // step
    k.box(M.chassis, 0.45, 0.04, 0.26, 2.45, 0.78, s * 1.08);
    k.cyl(M.steel, 0.016, 0.016, 0.7, 6, 3.12, 2.1, s * 1.2);
    // Mirror on its arm.
    k.rod(M.chassis, V(3.1, 2.55, s * 1.12), V(3.18, 2.55, s * 1.48), 0.018);
    k.rod(M.chassis, V(3.1, 2.15, s * 1.12), V(3.18, 2.2, s * 1.48), 0.018);
    k.bbox(M.black, 0.07, 0.42, 0.24, 0.02, 3.18, 2.36, s * 1.5);
    // Front fender, flap and the wheel well.
    k.bbox(M.black, 1.3, 0.08, 0.44, 0.02, 2.3, 1.3, s * 0.98);
    k.box(M.black, 0.02, 0.42, 0.42, 2.98, 1.1, s * 0.98, [0, 0, -0.35]);
    k.box(M.black, 0.02, 0.3, 0.42, 1.65, 1.15, s * 0.98);
    // Lights.
    headlight(k, M, 3.53, 1.42, s * 0.82);
    k.box(M.amber, 0.04, 0.08, 0.14, 3.56, 1.66, s * 0.98);
    k.box(M.amber, 0.04, 0.05, 0.1, 3.22, 2.76, s * 0.95); // roof markers
  }
  k.box(M.amber, 0.04, 0.05, 0.1, 3.22, 2.76, 0);
  // Bumper, tow hooks, winch.
  k.bbox(M.trim, 0.24, 0.3, 2.46, 0.03, 3.62, 1.05, 0);
  for (const z of [-0.62, 0.62]) k.add(M.chassis, new THREE.TorusGeometry(0.06, 0.02, 6, 12, PI * 1.4), [3.77, 1.0, z], [PI / 2, 0, 0]);
  k.bbox(M.chassis, 0.2, 0.22, 0.5, 0.03, 3.78, 1.07, 0);
  // Roof: gunner's ring and hatch, antenna mount.
  k.add(M.trim, new THREE.TorusGeometry(0.36, 0.05, 8, 24), [2.05, 2.8, -0.3], [PI / 2, 0, 0]);
  k.cyl(M.paint, 0.33, 0.33, 0.06, 20, 2.05, 2.82, -0.3);
  k.cyl(M.black, 0.04, 0.04, 0.12, 8, 1.45, 2.84, -1.0);
  k.cyl(M.black, 0.008, 0.004, 2.4, 4, 1.45, 4.0, -1.0, [0.05, 0, -0.05]);
  // Exhaust stack with heat shield and rain cap, air intake on the other side.
  k.cyl(M.chassis, 0.07, 0.07, 1.7, 10, 1.25, 2.25, 1.04);
  k.cyl(M.steel, 0.1, 0.1, 0.8, 12, 1.25, 2.5, 1.04);
  k.box(M.chassis, 0.16, 0.03, 0.16, 1.25, 3.12, 1.04, [0, 0, 0.5]);
  k.bbox(M.paint, 0.34, 0.95, 0.32, 0.05, 1.22, 2.05, -1.02);
  k.cyl(M.black, 0.14, 0.14, 0.25, 14, 1.22, 2.65, -1.02);
  // Cab back window and the spare behind the cab.
  k.box(M.glass, 0.02, 0.32, 0.9, 1.335, 2.4, 0);
  // Fuel tank and battery box between the axles.
  k.cyl(M.trim, 0.27, 0.27, 1.05, 16, 0.75, 0.98, 0.84, [0, 0, PI / 2]);
  for (const x of [0.45, 1.05]) k.add(M.chassis, new THREE.TorusGeometry(0.28, 0.015, 4, 16), [x, 0.98, 0.84], [0, PI / 2, 0]);
  k.cyl(M.chassis, 0.06, 0.06, 0.06, 10, 0.85, 1.27, 0.84);
  k.bbox(M.paint, 0.9, 0.45, 0.4, 0.03, 0.75, 0.95, -0.9);
  k.box(M.steel, 0.12, 0.03, 0.03, 0.75, 1.05, -1.11);
  if (body === 'tanker') {
    // Fuel tank body: rounded tank, end caps, walkway, ladder, hose reel and placards.
    k.cyl(M.paint, 0.95, 0.95, 4.2, 28, -1.4, 2.25, 0, [0, 0, PI / 2]);
    for (const x of [0.7, -3.5]) k.add(M.paint, new THREE.SphereGeometry(0.95, 24, 10, 0, PI * 2, 0, PI / 2), [x, 2.25, 0], [0, 0, x > 0 ? -PI / 2 : PI / 2], [1, 0.25, 1]);
    for (const x of [0.2, -1.4, -3.0]) k.add(M.trim, new THREE.TorusGeometry(0.96, 0.03, 6, 28), [x, 2.25, 0], [0, PI / 2, 0]);
    k.box(M.chassis, 3.6, 0.04, 0.5, -1.4, 3.23, 0);
    for (const x of [-0.5, -2.3]) k.cyl(M.trim, 0.2, 0.2, 0.12, 14, x, 3.25, 0);
    for (let i = 0; i < 8; i++) k.cyl(M.steel, 0.015, 0.015, 0.5, 6, -3.2 + i * 0.4, 3.45, 0.26, [0, 0, 0]);
    k.rod(M.steel, V(-3.4, 3.7, 0.26), V(0.5, 3.7, 0.26), 0.015);
    k.box(M.chassis, 0.6, 0.7, 2.3, -3.55, 1.25, 0);
    k.cyl(M.black, 0.25, 0.25, 0.5, 16, -3.55, 1.25, 0.6, [PI / 2, 0, 0]);
    k.add(new THREE.MeshStandardMaterial({ map: stencilTex(['FLAMMABLE', 'JP-8'], 256, 96, '#d8301c'), transparent: true, roughness: 0.8 }), new THREE.PlaneGeometry(1.2, 0.45), [-1.4, 2.25, 0.955], [0, 0, 0], undefined, { keepUV: true });
  } else {
    // Cargo bed: floor, side and front boards, tailgate.
    k.box(M.chassis, 4.75, 0.14, 2.44, -1.32, 1.3, 0);
    for (const s of [-1, 1]) {
      k.box(M.paint, 4.75, 0.55, 0.06, -1.32, 1.64, s * 1.19);
      for (let i = 0; i < 7; i++) k.box(M.trim, 0.06, 0.55, 0.03, -3.6 + i * 0.75, 1.64, s * 1.225);
      for (let i = 0; i < 9; i++) k.box(M.steel, 0.05, 0.05, 0.04, -3.5 + i * 0.55, 1.88, s * 1.235); // lashing hooks
    }
    k.box(M.paint, 0.08, 1.8, 2.44, 1.02, 2.22, 0);
    k.box(M.paint, 0.08, 0.55, 2.44, -3.66, 1.64, 0);
    // Canvas cover over its bows.
    const sh = new THREE.Shape();
    const hw = 1.22, y0 = 1.88, y1 = 3.05, rr = 0.42;
    sh.moveTo(-hw, y0); sh.lineTo(hw, y0); sh.lineTo(hw, y1 - rr);
    sh.quadraticCurveTo(hw, y1, hw - rr, y1); sh.lineTo(-hw + rr, y1);
    sh.quadraticCurveTo(-hw, y1, -hw, y1 - rr); sh.lineTo(-hw, y0);
    const cover = new THREE.ExtrudeGeometry(sh, { depth: 4.62, bevelEnabled: false, curveSegments: 6 });
    cover.rotateY(PI / 2);
    cover.translate(-3.62, 0, 0);
    k.add(M.tarp, cover, undefined, undefined, undefined, { uvScale: 0.8 });
    // Bows showing through the canvas, and the ropes along its edge.
    const bowPts = [V(0, y0, -hw), V(0, y1 - rr, -hw), V(0, y1 - 0.06, -hw + 0.12), V(0, y1, -hw + rr), V(0, y1, hw - rr), V(0, y1 - 0.06, hw - 0.12), V(0, y1 - rr, hw), V(0, y0, hw)];
    for (let i = 0; i < 6; i++) {
      const x = -3.5 + i * 0.86;
      const pts = bowPts.map((p) => V(x, p.y + (p.y > y0 + 0.1 ? 0.012 : 0), p.z * 1.008));
      k.add(M.tarp, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 24, 0.03, 5, false));
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const xa = -3.5 + i * 0.55, xb = xa + 0.55;
        k.rod(M.black, V(xa, 1.88, s * 1.24), V((xa + xb) / 2, 2.02, s * 1.235), 0.008, 4);
        k.rod(M.black, V((xa + xb) / 2, 2.02, s * 1.235), V(xb, 1.88, s * 1.24), 0.008, 4);
      }
    }
    // Rolled rear flap and straps.
    k.cyl(M.tarp, 0.09, 0.09, 2.3, 10, -3.64, 2.92, 0, [PI / 2, 0, 0]);
    for (const z of [-0.7, 0, 0.7]) k.box(M.black, 0.02, 0.5, 0.05, -3.645, 2.66, z);
    // Spare tyre on the bed front.
    const sp = wheel(R, W, M);
    sp.position.set(0.78, 2.35, 0); sp.rotation.y = PI / 2;
    g.add(sp);
  }
  // Rear: bumper, lights, reflectors, mud flaps, bumper stencils.
  k.bbox(M.chassis, 0.2, 0.25, 2.3, 0.03, -3.82, 1.0, 0);
  for (const s of [-1, 1]) {
    k.box(M.tail, 0.04, 0.1, 0.16, -3.93, 1.02, s * 0.9);
    k.box(M.amber, 0.04, 0.06, 0.12, -3.93, 1.14, s * 0.9);
    k.box(M.black, 0.02, 0.55, 0.45, -3.3, 0.72, s * 0.98);
    k.box(M.black, 0.02, 0.45, 0.42, 1.6, 0.85, s * 0.98);
  }
  const stencil = new THREE.MeshStandardMaterial({ map: stencilTex([code]), transparent: true, roughness: 0.8 });
  k.add(stencil, new THREE.PlaneGeometry(0.7, 0.18), [3.745, 1.05, 0.75], [0, PI / 2, 0], undefined, { keepUV: true });
  k.add(stencil, new THREE.PlaneGeometry(0.7, 0.18), [-3.925, 1.0, 0.3], [0, -PI / 2, 0], undefined, { keepUV: true });
  k.build(g);
  // Wheels (dual-sided rims, separate so they can roll).
  const wheels = [];
  for (const x of AXLES) for (const s of [-1, 1]) { const w = wheel(R, W, M); w.position.set(x, R, s * 1.0); g.add(w); wheels.push(w); }
  g.userData = { wheels, wheelR: R, lightAt: V(3.62, 1.42, 0) };
  return g;
}

// ---------------------------------------------------------------- armoured escort

/** M-ATV-style MRAP with a gun turret. userData as buildCargoTruck. */
export function buildMRAP({ color = 0x7d7458, seed = 4, code = 'B-2-5' } = {}) {
  const g = new THREE.Group();
  const M = mats(color, seed);
  const k = new Kit();
  const R = 0.64, W = 0.46;
  const AXLES = [1.85, -1.7];
  for (const x of AXLES) {
    k.cyl(M.chassis, 0.08, 0.08, 1.9, 10, x, R, 0, [PI / 2, 0, 0]);
    k.add(M.chassis, new THREE.SphereGeometry(0.22, 12, 8), [x, R, 0], [0, 0, 0], [1.1, 0.9, 1.2]);
  }
  // V-shaped hull underneath.
  const vh = new THREE.Shape();
  vh.moveTo(0, 0.62); vh.lineTo(1.1, 1.0); vh.lineTo(1.1, 1.38); vh.lineTo(-1.1, 1.38); vh.lineTo(-1.1, 1.0); vh.lineTo(0, 0.62);
  const hull = new THREE.ExtrudeGeometry(vh, { depth: 5.2, bevelEnabled: false });
  hull.rotateY(PI / 2); hull.translate(-2.75, 0, 0);
  k.add(M.paint, hull);
  // Armoured body: crew capsule with chamfered roof edges, hood, armour panels.
  k.bbox(M.paint, 3.5, 1.3, 2.36, 0.1, -0.85, 2.02, 0);
  k.bbox(M.paint, 1.85, 0.5, 2.1, 0.12, 1.85, 1.66, 0, [0, 0, -0.13]);
  k.box(M.black, 1.2, 0.02, 0.9, 1.75, 1.96, 0, [0, 0, -0.13]); // hood vents
  for (const s of [-1, 1]) {
    // Bolted add-on armour on the doors.
    for (const x of [-1.9, -0.75, 0.25]) {
      k.bbox(M.trim, 0.95, 0.95, 0.06, 0.03, x, 1.95, s * 1.2);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) k.cyl(M.steel, 0.018, 0.018, 0.03, 6, x - 0.38 + i * 0.25, 1.55 + j * 0.8, s * 1.235, [PI / 2, 0, 0]);
    }
    // Small thick side windows.
    for (const x of [-0.75, 0.25]) {
      k.box(M.glass, 0.5, 0.36, 0.02, x, 2.3, s * 1.24);
      k.box(M.black, 0.6, 0.05, 0.05, x, 2.5, s * 1.24); k.box(M.black, 0.6, 0.05, 0.05, x, 2.1, s * 1.24);
    }
    k.box(M.steel, 0.2, 0.05, 0.05, -0.45, 1.85, s * 1.26); // door handles
    k.box(M.steel, 0.2, 0.05, 0.05, 0.55, 1.85, s * 1.26);
    k.box(M.chassis, 2.3, 0.05, 0.3, -0.25, 1.05, s * 1.12); // running board
    // Fenders, mirrors, headlight with wire guard.
    k.bbox(M.black, 1.5, 0.1, 0.5, 0.03, 1.85, 1.38, s * 1.0);
    k.bbox(M.black, 1.5, 0.1, 0.5, 0.03, -1.7, 1.4, s * 1.0);
    k.rod(M.chassis, V(0.9, 2.45, s * 1.18), V(1.0, 2.45, s * 1.55), 0.02);
    k.bbox(M.black, 0.08, 0.36, 0.22, 0.02, 1.0, 2.3, s * 1.58);
    headlight(k, M, 2.82, 1.62, s * 0.78, 0.11);
    for (const dz of [-0.06, 0.06]) k.box(M.chassis, 0.02, 0.3, 0.015, 2.92, 1.62, s * 0.78 + dz);
    k.box(M.amber, 0.04, 0.07, 0.12, 2.82, 1.82, s * 0.95);
    // Antennas on the rear corners.
    k.cyl(M.black, 0.05, 0.05, 0.14, 8, -2.4, 2.75, s * 1.0);
    k.cyl(M.black, 0.009, 0.004, 2.8, 4, -2.45, 4.1, s * 1.05, [0, 0, 0.06]);
    // Tail lights and mud flaps.
    k.box(M.tail, 0.04, 0.12, 0.16, -2.62, 1.45, s * 0.92);
    k.box(M.black, 0.02, 0.55, 0.5, -2.45, 0.75, s * 1.0);
  }
  // Windshield: two thick armoured panes in heavy frames.
  for (const z of [-0.52, 0.52]) {
    k.box(M.glass, 0.03, 0.55, 0.88, 0.93, 2.28, z, [0, 0, -0.12]);
    k.box(M.black, 0.08, 0.66, 0.08, 0.95, 2.28, z + Math.sign(z) * 0.48, [0, 0, -0.12]);
  }
  k.box(M.black, 0.1, 0.66, 0.12, 0.95, 2.28, 0, [0, 0, -0.12]);
  k.box(M.black, 0.1, 0.08, 2.1, 0.97, 2.0, 0);
  // Grille and brush guard, bumper, winch.
  k.add(M.grille, new THREE.PlaneGeometry(1.3, 0.38), [2.81, 1.6, 0], [0, PI / 2, 0], undefined, { keepUV: true });
  for (const z of [-0.6, -0.3, 0, 0.3, 0.6]) k.cyl(M.chassis, 0.025, 0.025, 0.7, 6, 2.9, 1.45, z);
  k.cyl(M.chassis, 0.03, 0.03, 1.5, 6, 2.9, 1.8, 0, [PI / 2, 0, 0]);
  k.bbox(M.chassis, 0.25, 0.3, 2.3, 0.04, 2.95, 1.1, 0);
  k.cyl(M.steel, 0.1, 0.1, 0.55, 12, 3.0, 1.12, 0, [PI / 2, 0, 0]);
  // Turret: ring, shield plates, M2 machine gun with its ammo can.
  const tx = -0.75;
  k.add(M.trim, new THREE.TorusGeometry(0.58, 0.07, 8, 28), [tx, 2.72, 0], [PI / 2, 0, 0]);
  k.bbox(M.trim, 0.07, 0.62, 1.3, 0.02, tx + 0.55, 3.0, 0, [0, 0, -0.18]);
  for (const s of [-1, 1]) k.bbox(M.trim, 0.8, 0.55, 0.07, 0.02, tx + 0.22, 2.98, s * 0.66, [0, s * 0.35, 0]);
  k.box(M.glass, 0.02, 0.2, 0.4, tx + 0.6, 3.1, 0, [0, 0, -0.18]);
  k.box(M.chassis, 0.6, 0.16, 0.18, tx + 0.1, 3.02, 0);
  k.cyl(M.chassis, 0.05, 0.05, 0.4, 10, tx + 0.55, 3.04, 0, [0, 0, PI / 2]);
  k.cyl(M.chassis, 0.03, 0.03, 1.15, 8, tx + 1.12, 3.04, 0, [0, 0, PI / 2]);
  k.cyl(M.chassis, 0.04, 0.035, 0.12, 8, tx + 1.72, 3.04, 0, [0, 0, PI / 2]);
  k.bbox(M.trim, 0.25, 0.18, 0.12, 0.02, tx + 0.05, 2.98, -0.2);
  k.box(M.chassis, 0.06, 0.3, 0.06, tx - 0.15, 2.9, 0);
  // Rear: spare tyre on its carrier, door, ladder, bumper stencil.
  k.bbox(M.trim, 0.06, 1.0, 0.9, 0.03, -2.62, 2.0, 0.35);
  for (let i = 0; i < 4; i++) k.box(M.chassis, 0.05, 0.03, 0.4, -2.66, 1.15 + i * 0.25, -0.65);
  const stencil = new THREE.MeshStandardMaterial({ map: stencilTex([code]), transparent: true, roughness: 0.8 });
  k.add(stencil, new THREE.PlaneGeometry(0.7, 0.18), [3.08, 1.1, 0.7], [0, PI / 2, 0], undefined, { keepUV: true });
  k.build(g);
  const sp = wheel(R, W, M);
  sp.position.set(-2.75, 2.0, -0.45); sp.rotation.y = PI / 2;
  g.add(sp);
  const wheels = [];
  for (const x of AXLES) for (const s of [-1, 1]) { const w = wheel(R, W, M); w.position.set(x, R, s * 1.0); g.add(w); wheels.push(w); }
  g.userData = { wheels, wheelR: R, lightAt: V(2.9, 1.62, 0) };
  return g;
}

// ---------------------------------------------------------------- roadside

/**
 * Dress a road running along X: utility poles with sagging wires on one side,
 * marker posts on both, and rocks, scrub and pines on the slopes.
 * heightAt(x, z) gives the ground height.
 */
export function dressRoad(scene, heightAt, { from = -260, to = 300, seed = 3, pines = true } = {}) {
  const R = rng(seed);
  const k = new Kit();
  const wood = new THREE.MeshStandardMaterial({ map: barkTex(), roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8e90, roughness: 0.4, metalness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.7 });
  const refl = new THREE.MeshStandardMaterial({ color: 0x501010, emissive: 0xff3020, emissiveIntensity: 0.6, roughness: 0.3 });
  const reflW = new THREE.MeshStandardMaterial({ color: 0x606060, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.3 });
  const wireM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  // Utility poles every 42 m on the far side, wires sagging between them.
  const zp = -11.5, poles = [];
  for (let x = from; x <= to; x += 42) {
    const y = heightAt(x, zp), h = 8.5;
    k.cyl(wood, 0.13, 0.16, h, 8, x, y + h / 2, zp);
    k.box(wood, 0.12, 0.12, 2.0, x, y + h - 0.5, zp);
    for (const dz of [-0.85, 0, 0.85]) k.cyl(white, 0.05, 0.06, 0.16, 8, x, y + h - 0.36, zp + dz);
    k.rod(wood, V(x, y + h - 1.6, zp), V(x, y + h - 0.6, zp + 0.8), 0.04);
    poles.push(V(x, y + h - 0.3, zp));
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    for (const dz of [-0.85, 0, 0.85]) {
      const a = poles[i].clone().add(V(0, 0, dz)), b = poles[i + 1].clone().add(V(0, 0, dz));
      const pts = [];
      for (let j = 0; j <= 10; j++) { const t = j / 10; pts.push(a.clone().lerp(b, t).add(V(0, -1.1 * 4 * t * (1 - t), 0))); }
      k.add(wireM, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 3, false), undefined, undefined, undefined, { keepUV: true });
    }
  }
  // Marker posts with reflectors, both shoulders.
  for (let x = from; x <= to; x += 25) {
    for (const s of [-1, 1]) {
      const z = s * 5.6, y = heightAt(x, z);
      k.box(white, 0.1, 1.1, 0.1, x, y + 0.55, z);
      k.box(s < 0 ? refl : reflW, 0.012, 0.16, 0.06, x + 0.05, y + 0.95, z);
      k.box(s < 0 ? refl : reflW, 0.012, 0.16, 0.06, x - 0.05, y + 0.95, z);
    }
  }
  // Kilometre stone.
  k.bbox(white, 0.25, 0.7, 0.35, 0.06, 40, heightAt(40, 6.2) + 0.35, 6.2);
  k.build(scene, { shadow: true });
  // Rocks, scrub and pines (instanced).
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const P = rockGeo.attributes.position;
  for (let i = 0; i < P.count; i++) { const f = 0.75 + R() * 0.5; P.setXYZ(i, P.getX(i) * f, P.getY(i) * f * 0.7, P.getZ(i) * f); }
  rockGeo.computeVertexNormals();
  const rockM = new THREE.MeshStandardMaterial({ color: 0x57534c, roughness: 0.95, flatShading: true });
  const bushGeo = new THREE.DodecahedronGeometry(1, 0);
  const bushM = new THREE.MeshStandardMaterial({ color: 0x3c4428, roughness: 1, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const crownGeo = mergeGeometries([0, 1, 2, 3].map((i) => { const c = new THREE.ConeGeometry(1.6 - i * 0.32, 2.2, 8).toNonIndexed(); c.translate(0, 2.2 + i * 1.25, 0); return c; }));
  const crownM = new THREE.MeshStandardMaterial({ color: 0x24321e, roughness: 1, flatShading: true });
  const trunkM = new THREE.MeshStandardMaterial({ map: barkTex(), roughness: 1 });
  const place = (geo, mat, n, fn) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) { fn(p, q, s); m.compose(p, q, s); im.setMatrixAt(i, m); }
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  const span = to - from;
  const side = () => { const s = R() < 0.5 ? -1 : 1; return s * (7 + Math.pow(R(), 1.6) * 70); };
  place(rockGeo, rockM, 220, (p, q, s) => { const x = from + R() * span, z = side(); const sc = 0.15 + Math.pow(R(), 3) * 1.3; p.set(x, heightAt(x, z) + sc * 0.2, z); q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)); s.set(sc, sc, sc); });
  place(bushGeo, bushM, 380, (p, q, s) => { const x = from + R() * span, z = side(); const sc = 0.3 + R() * 0.7; p.set(x, heightAt(x, z) + sc * 0.4, z); q.setFromEuler(new THREE.Euler(0, R() * 6, 0)); s.set(sc * 1.3, sc * 0.8, sc * 1.2); });
  if (pines) {
    const spots = [];
    for (let i = 0; i < 160; i++) { const x = from + R() * span, s = R() < 0.5 ? -1 : 1, z = s * (16 + R() * 90); spots.push([x, z, 0.7 + R() * 0.8]); }
    place(trunkGeo, trunkM, spots.length, (p, q, s) => { const [x, z, sc] = spots.shift(); spots.push([x, z, sc]); p.set(x, heightAt(x, z), z); q.identity(); s.set(sc, sc * 2.4, sc); });
    place(crownGeo, crownM, spots.length, (p, q, s) => { const [x, z, sc] = spots.shift(); p.set(x, heightAt(x, z), z); q.setFromEuler(new THREE.Euler(0, x, 0)); s.set(sc, sc, sc); });
  }
}

// ---------------------------------------------------------------- test range

/** The target compound: bunkers, container stacks, a watchtower, a mast, hulks. Each child flies on impact. */
export function rangeTargets() {
  const grp = new THREE.Group();
  const conc = new THREE.MeshStandardMaterial({ map: paintTex(0x9c9284, 21), roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
  const piece = (build) => { const g = new THREE.Group(); const k = new Kit(); build(k, g); k.build(g); grp.add(g); return g; };
  // Bunkers with doorways, roof slabs and blast walls.
  for (const [x, z, w, h, d, ry] of [[0, 0, 14, 5, 10, 0], [18, 6, 8, 4, 8, 0.3], [-16, -8, 10, 3.5, 7, -0.2]]) {
    const b = piece((k) => {
      k.bbox(conc, w, h, d, 0.25, 0, h / 2, 0);
      k.bbox(conc, w + 1, 0.6, d + 1, 0.2, 0, h + 0.3, 0);
      k.box(dark, 1.6, 2.4, 0.2, w * 0.2, 1.2, d / 2 + 0.01);
      for (let i = 0; i < 3; i++) k.box(dark, 0.9, 0.35, 0.2, -w * 0.3 + i * 1.6, h * 0.7, d / 2 + 0.01);
      k.bbox(conc, 3.2, 2.2, 0.8, 0.15, w * 0.2, 1.1, d / 2 + 2.4);
    });
    b.position.set(x, 0, z); b.rotation.y = ry;
  }
  // Container stacks.
  const cols = [0x8a3a22, 0x2f4f6a, 0x4d5a36, 0x9a7a3a];
  for (const [x, z, n, ry] of [[-6, 14, 3, 0.1], [10, -12, 2, -0.4], [24, -4, 2, 1.2]]) {
    for (let i = 0; i < n; i++) {
      const col = cols[(i + Math.round(x)) & 3];
      const cm = new THREE.MeshStandardMaterial({ map: corrugatedTex(col, i + n), roughness: 0.7, metalness: 0.4 });
      const c = piece((k) => {
        k.box(cm, 6.1, 2.6, 2.44, 0, 1.3, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(dark, 0.18, 2.64, 0.18, sx * 2.98, 1.3, sz * 1.14);
        k.box(dark, 0.02, 2.3, 2.2, 3.06, 1.3, 0);
      });
      c.position.set(x + (i === 2 ? 1 : 0), i === 2 ? 2.6 : 0, z + (i === 2 ? 0 : i * 2.6)); c.rotation.y = ry;
    }
  }
  // Watchtower and a lattice radio mast.
  const steel = new THREE.MeshStandardMaterial({ color: 0x5e5a52, roughness: 0.6, metalness: 0.6 });
  const tw = piece((k) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod(steel, V(sx * 1.6, 0, sz * 1.6), V(sx * 1.1, 9, sz * 1.1), 0.1);
    for (const y of [3, 6]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) { const f = 1.6 - (y / 9) * 0.5; k.rod(steel, V(a[0] * f, y, a[1] * f), V(b[0] * f, y, b[1] * f), 0.05); }
    k.box(conc, 3.2, 0.2, 3.2, 0, 9.1, 0);
    k.box(steel, 3.2, 1.0, 0.08, 0, 9.7, 1.6); k.box(steel, 3.2, 1.0, 0.08, 0, 9.7, -1.6); k.box(steel, 0.08, 1.0, 3.2, 1.6, 9.7, 0);
    k.add(steel, new THREE.ConeGeometry(2.6, 1.0, 4), [0, 11.2, 0], [0, PI / 4, 0]);
  });
  tw.position.set(-22, 0, 10);
  const mast = piece((k) => {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; k.rod(steel, V(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), V(Math.cos(a) * 0.25, 24, Math.sin(a) * 0.25), 0.05); }
    for (let y = 1.5; y < 24; y += 1.5) for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2, b = ((i + 1) / 3) * PI * 2, f = 0.5 - (y / 24) * 0.25; k.rod(steel, V(Math.cos(a) * f, y, Math.sin(a) * f), V(Math.cos(b) * f, y + 0.75, Math.sin(b) * f), 0.02); }
    k.cyl(steel, 0.6, 0.6, 0.1, 16, 0, 20, 0, [PI / 2, 0, 0]);
  });
  mast.position.set(8, 0, -18);
  // Target vehicles: a tank hulk and two old trucks.
  const rust = new THREE.MeshStandardMaterial({ map: paintTex(0x5a4632, 31), roughness: 0.9, metalness: 0.3 });
  const tank = piece((k) => {
    k.bbox(rust, 7, 1.1, 3.4, 0.2, 0, 1.0, 0);
    for (const s of [-1, 1]) k.bbox(dark, 7.4, 0.9, 0.7, 0.3, 0, 0.6, s * 1.6);
    k.bbox(rust, 3.4, 0.9, 2.8, 0.35, -0.4, 2.0, 0);
    k.cyl(rust, 0.12, 0.14, 4.5, 10, 3.4, 2.0, 0, [0, 0, PI / 2 + 0.05]);
  });
  tank.position.set(-4, 0, -20); tank.rotation.y = 0.5;
  for (const [x, z, ry] of [[28, 10, 1.9], [-28, -2, -0.7]]) {
    const t = buildCargoTruck({ color: 0x6a5a40, seed: 40 + x, code: 'TGT' });
    t.position.set(x, 0, z); t.rotation.set(0, ry, 0.04);
    grp.add(t);
  }
  // Sandbag walls and drums.
  const bagM = new THREE.MeshStandardMaterial({ map: tarpTex(0x9a8a62, 9), roughness: 1 });
  const bags = piece((k) => {
    for (let i = 0; i < 14; i++) for (let j = 0; j < 3; j++) { const a = (i / 14) * PI * 1.4 + (j % 2) * 0.05; k.add(bagM, new THREE.SphereGeometry(0.5, 8, 6), [Math.cos(a) * 4, 0.25 + j * 0.42, Math.sin(a) * 4], [0, -a, 0], [0.75, 0.42, 0.45]); }
  });
  bags.position.set(12, 0, 16);
  const drumM = new THREE.MeshStandardMaterial({ map: corrugatedTex(0x3a5a3a, 5), roughness: 0.6, metalness: 0.4 });
  const drums = piece((k) => { for (let i = 0; i < 7; i++) k.cyl(drumM, 0.3, 0.3, 0.9, 14, (i % 4) * 0.65, 0.45, Math.floor(i / 4) * 0.65); });
  drums.position.set(4, 0, 8);
  return grp;
}

/** Mountain ridges ringing the range (replaces lone cones). */
export function rangeMountains(fbm) {
  const geo = new THREE.PlaneGeometry(4200, 4200, 220, 220);
  geo.rotateX(-PI / 2);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), r = Math.hypot(x, z);
    const ring = Math.min(1, Math.max(0, (r - 760) / 420));
    const ridge = 1 - Math.abs(fbm(x / 1400 + 0.5, z / 1400 + 0.5, 4, 5, 77) * 2 - 1);
    P.setY(i, ring * ring * (90 + ridge * ridge * 380) - 30 * (1 - ring) - 2);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6a5450, roughness: 1, flatShading: true }));
  return m;
}

// ---------------------------------------------------------------- airfield

/** Hangars with doors and lights, barriers, crates, a windsock, light towers, runway lights. */
export function dressAirfield(scene) {
  const k = new Kit();
  const hm = new THREE.MeshStandardMaterial({ map: corrugatedTex(0x6a6e66, 3), roughness: 0.7, metalness: 0.45, side: THREE.DoubleSide });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.9 });
  const conc = new THREE.MeshStandardMaterial({ map: paintTex(0xa8a49a, 12), roughness: 0.95 });
  const crate = new THREE.MeshStandardMaterial({ map: paintTex(0x5c5a3a, 14), roughness: 0.85 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.4, metalness: 0.7 });
  const lampM = new THREE.MeshStandardMaterial({ color: 0xffe8c0, emissive: 0xffd9a0, emissiveIntensity: 2.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x102040, emissive: 0x3070ff, emissiveIntensity: 2 });
  for (let i = 0; i < 4; i++) {
    const x = -70 + i * 40, z = -90;
    // Arched hangar: corrugated shell, gable walls, open door with the dark inside, apron light.
    k.add(hm, new THREE.CylinderGeometry(12, 12, 30, 28, 1, true, -PI / 2, PI), [x, 0, z], [-PI / 2, 0, 0]);
    const wallShape = new THREE.Shape(); wallShape.absarc(0, 0, 12, 0, PI, false); wallShape.lineTo(12, 0);
    const hole = new THREE.Path(); hole.moveTo(-7, 0); hole.lineTo(7, 0); hole.lineTo(7, 8); hole.lineTo(-7, 8); hole.lineTo(-7, 0); wallShape.holes.push(hole);
    k.add(hm, new THREE.ShapeGeometry(wallShape, 16), [x, 0, z + 15], [0, 0, 0]);
    k.add(hm, new THREE.ShapeGeometry(new THREE.Shape().absarc(0, 0, 12, 0, PI, false), 16), [x, 0, z - 15], [0, PI, 0]);
    k.box(darkM, 14, 8, 0.2, x, 4, z + 13);
    k.box(steel, 14.6, 0.4, 0.4, x, 8.2, z + 15.1);
    k.box(hm, 7, 8, 0.15, x - 10.4, 4, z + 15.3); // slid-open door leaf
    k.cyl(steel, 0.08, 0.08, 1.2, 6, x, 9.2, z + 15.4, [PI / 2, 0, 0]);
    k.box(lampM, 0.6, 0.12, 0.3, x, 9.2, z + 16);
  }
  // Jersey barriers, crate stacks, fuel drums.
  for (let i = 0; i < 12; i++) k.add(conc, new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.12, 0.3), new THREE.Vector2(0.08, 0.8), new THREE.Vector2(-0.08, 0.8), new THREE.Vector2(-0.12, 0.3)]), { depth: 3.6, bevelEnabled: false }), [-30 + i * 3.7, 0, 22], [0, PI / 2, 0]);
  for (const [x, z, n] of [[14, -2, 5], [-16, -6, 4], [18, -24, 3]]) {
    for (let i = 0; i < n; i++) k.bbox(crate, 1.2, 1.0, 1.0, 0.04, x + (i % 3) * 1.25, 0.5 + Math.floor(i / 3) * 1.0, z);
    k.box(crate, 3.8, 0.12, 1.2, x + 1.25, 0.06, z + 1.6);
  }
  // Light towers.
  for (const [x, z] of [[-24, -30], [24, -30]]) {
    k.cyl(steel, 0.12, 0.18, 14, 8, x, 7, z);
    k.box(steel, 2.4, 0.2, 0.2, x, 13.8, z);
    for (const dx of [-0.9, -0.3, 0.3, 0.9]) k.box(lampM, 0.45, 0.35, 0.1, x + dx, 14.15, z + 0.12);
  }
  // Windsock.
  k.cyl(steel, 0.06, 0.06, 6, 6, 30, 3, -8);
  const sock = new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.8, side: THREE.DoubleSide });
  k.add(sock, new THREE.CylinderGeometry(0.15, 0.4, 2.4, 10, 1, true), [31.2, 5.85, -8], [0, 0, -PI / 2 + 0.15]);
  // Taxiway edge lights.
  for (let i = 0; i < 26; i++) for (const s of [-1, 1]) k.cyl(blue, 0.06, 0.08, 0.3, 6, -60 + i * 5, 0.15, -32 + s * 9);
  k.build(scene);
  // Paint: runway centreline, taxi markings.
  const lineM = new THREE.MeshStandardMaterial({ color: 0xd8c860, roughness: 0.9 });
  const lk = new Kit();
  for (let i = 0; i < 20; i++) lk.box(lineM, 3, 0.01, 0.25, -60 + i * 6.5, 0.015, -32);
  lk.box(lineM, 60, 0.01, 0.15, 0, 0.015, -24);
  lk.build(scene, { shadow: false });
}

// ---------------------------------------------------------------- office & lab

/** Vasko's office: desk with lamp and laptop, leather chair, bookcase, globe, rug, ceiling lights. */
export function dressOffice(scene) {
  const k = new Kit();
  const wood = new THREE.MeshStandardMaterial({ map: paintTex(0x2a1a10, 50), roughness: 0.35, metalness: 0.1 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x1a0f0c, roughness: 0.45, metalness: 0.05 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.3, metalness: 0.9 });
  const green = new THREE.MeshStandardMaterial({ color: 0x0f3a1e, roughness: 0.2, metalness: 0.2, emissive: 0x0a2010, emissiveIntensity: 0.5 });
  const rug = new THREE.MeshStandardMaterial({ map: tarpTex(0x3a1014, 60), roughness: 1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.5, metalness: 0.3 });
  // Desk (the existing top sits at y 0.78 around x 1.8, z 1.2): pedestals and a modesty panel.
  for (const x of [0.85, 2.75]) k.bbox(wood, 0.5, 0.74, 1.0, 0.02, x, 0.37, 1.2);
  k.box(wood, 1.4, 0.5, 0.04, 1.8, 0.45, 1.68);
  for (let i = 0; i < 3; i++) for (const x of [0.85, 2.75]) k.box(brass, 0.12, 0.02, 0.02, x, 0.2 + i * 0.22, 0.69);
  // Banker's lamp, laptop, papers, a glass.
  k.cyl(brass, 0.08, 0.1, 0.03, 16, 1.0, 0.835, 1.35);
  k.cyl(brass, 0.012, 0.012, 0.32, 6, 1.0, 0.98, 1.35);
  k.add(green, new THREE.CylinderGeometry(0.06, 0.13, 0.12, 16, 1, true, 0, PI), [1.0, 1.15, 1.35], [PI / 2, 0, PI / 2]);
  k.box(black, 0.36, 0.015, 0.25, 2.1, 0.83, 1.15);
  k.box(black, 0.36, 0.24, 0.012, 2.1, 0.95, 1.29, [-0.25, 0, 0]);
  const paper = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.9 });
  for (let i = 0; i < 4; i++) k.box(paper, 0.21, 0.004, 0.3, 1.5 + i * 0.03, 0.825 + i * 0.004, 1.05 + i * 0.02, [0, 0.1 * i, 0]);
  // Chair.
  k.bbox(leather, 0.6, 0.12, 0.55, 0.05, 1.8, 0.5, 2.0);
  k.bbox(leather, 0.6, 0.75, 0.12, 0.05, 1.8, 0.95, 2.3, [-0.12, 0, 0]);
  for (const s of [-1, 1]) k.bbox(leather, 0.08, 0.08, 0.5, 0.03, 1.8 + s * 0.32, 0.72, 2.0);
  k.cyl(black, 0.03, 0.03, 0.4, 8, 1.8, 0.25, 2.0);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; k.box(black, 0.32, 0.03, 0.05, 1.8 + Math.cos(a) * 0.16, 0.05, 2.0 + Math.sin(a) * 0.16, [0, -a, 0]); }
  // Bookcase along the side wall with rows of books.
  const R = rng(77);
  const bookM = [0x3a1a12, 0x14243a, 0x2a3a1a, 0x4a3a20, 0x1a1a1a, 0x5a1a10].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  k.box(wood, 0.4, 3.0, 3.4, -6.75, 1.5, 3.6);
  for (let sh = 0; sh < 5; sh++) {
    k.box(wood, 0.42, 0.04, 3.4, -6.74, 0.3 + sh * 0.6, 3.6);
    let z = 2.0;
    while (z < 5.2) {
      const w = 0.03 + R() * 0.05, h = 0.32 + R() * 0.18;
      k.box(bookM[Math.floor(R() * 6)], 0.26, h, w, -6.68, 0.32 + sh * 0.6 + h / 2, z);
      z += w + 0.004;
    }
  }
  // Globe on a stand.
  const globeC = cv(256, 128), gg = globeC.getContext('2d');
  gg.fillStyle = '#c8b48a'; gg.fillRect(0, 0, 256, 128);
  gg.fillStyle = '#7a6a3a'; for (let i = 0; i < 40; i++) { gg.beginPath(); gg.ellipse(R() * 256, 20 + R() * 88, 6 + R() * 26, 4 + R() * 14, R() * 3, 0, PI * 2); gg.fill(); }
  k.add(new THREE.MeshStandardMaterial({ map: ctex(globeC), roughness: 0.4 }), new THREE.SphereGeometry(0.3, 24, 16), [-4.6, 1.15, 0.6], [0.4, 0, 0.3], undefined, { keepUV: true });
  k.add(brass, new THREE.TorusGeometry(0.33, 0.012, 6, 32, PI), [-4.6, 1.15, 0.6], [0, PI / 2, 0.4]);
  k.cyl(wood, 0.04, 0.06, 0.8, 8, -4.6, 0.45, 0.6);
  k.cyl(wood, 0.25, 0.28, 0.05, 16, -4.6, 0.03, 0.6);
  // Rug and recessed ceiling lights.
  k.box(rug, 5, 0.01, 3.6, 0.6, 0.006, 1.0, undefined, { uvScale: 0.5 });
  const dl = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffd8a0, emissiveIntensity: 1.2 });
  for (const [x, z] of [[-3, 0], [0, 0], [3, 0], [-3, 3.5], [0, 3.5], [3, 3.5]]) k.cyl(dl, 0.12, 0.12, 0.02, 14, x, 4.985, z);
  // A drinks cabinet with bottles.
  k.bbox(wood, 1.4, 0.9, 0.45, 0.02, -5.0, 0.45, -4.6);
  const bottles = [0x5a2a08, 0x1a3a1a, 0x8a6a2a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
  for (let i = 0; i < 6; i++) k.cyl(bottles[i % 3], 0.04, 0.045, 0.3, 10, -5.5 + i * 0.2, 1.05, -4.6);
  k.build(scene);
}

/** Lab: overhead light panels, cable trays, a second bench with test gear, a glass wall. */
export function dressLab(scene) {
  const k = new Kit();
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.8 });
  const panel = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, emissive: 0xcfe0ff, emissiveIntensity: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.5, metalness: 0.4 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b020, roughness: 0.6 });
  for (const x of [-2.4, 0, 2.4]) { k.box(steel, 1.3, 0.06, 0.5, x, 3.6, 0.5); k.box(panel, 1.2, 0.01, 0.42, x, 3.565, 0.5); }
  // Cable tray with bundles running to the racks.
  k.box(steel, 8, 0.04, 0.4, 0, 3.0, -2.6);
  for (let i = 0; i < 6; i++) k.cyl(black, 0.03, 0.03, 8, 6, 0, 3.05, -2.75 + i * 0.06, [0, 0, PI / 2]);
  for (let i = 0; i < 6; i++) k.cyl(steel, 0.012, 0.012, 1.0, 4, -3.5 + i * 1.4, 3.5, -2.6);
  // Second bench: oscilloscope, laptop, toolbox, coiled cables.
  k.box(steel, 2.0, 0.06, 0.8, 3.4, 0.9, 0.8);
  for (const [x, z] of [[2.5, 0.5], [4.3, 0.5], [2.5, 1.1], [4.3, 1.1]]) k.box(steel, 0.05, 0.9, 0.05, x, 0.45, z);
  k.bbox(black, 0.45, 0.3, 0.35, 0.02, 2.9, 1.08, 0.75);
  k.box(new THREE.MeshStandardMaterial({ color: 0x103018, emissive: 0x30ff80, emissiveIntensity: 0.6 }), 0.01, 0.18, 0.24, 3.13, 1.1, 0.75);
  k.box(black, 0.36, 0.015, 0.25, 3.6, 0.94, 0.8);
  k.box(new THREE.MeshStandardMaterial({ color: 0x0a1830, emissive: 0x3070c0, emissiveIntensity: 0.7 }), 0.34, 0.22, 0.01, 3.6, 1.06, 0.66, [0.25, 0, 0]);
  k.bbox(new THREE.MeshStandardMaterial({ color: 0xa01818, roughness: 0.5, metalness: 0.3 }), 0.5, 0.22, 0.25, 0.02, 4.1, 1.04, 0.9);
  k.add(black, new THREE.TorusGeometry(0.12, 0.015, 6, 20), [3.3, 0.94, 1.0], [PI / 2, 0, 0]);
  // Glass partition with a frame and a hazard stripe on the floor.
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.22 });
  k.box(glass, 0.02, 3.2, 6, -4.4, 1.6, 0.5);
  for (const z of [-2.5, -0.5, 1.5, 3.5]) k.box(steel, 0.06, 3.2, 0.06, -4.4, 1.6, z);
  for (let i = 0; i < 10; i++) k.box(i % 2 ? yellow : black, 0.6, 0.005, 0.12, -2.7 + i * 0.6, 0.004, 1.9);
  k.build(scene);
}

// ---------------------------------------------------------------- aftermath, port, briefing, flight

/** The HALCYON key's transport case, lid thrown open, empty (foam cut-out showing). */
export function buildKeyCase() {
  const g = new THREE.Group();
  const k = new Kit();
  const shell = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.3 });
  const foam = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9da0, roughness: 0.35, metalness: 0.85 });
  k.bbox(shell, 0.95, 0.18, 0.62, 0.03, 0, 0.09, 0);
  k.box(foam, 0.86, 0.02, 0.54, 0, 0.175, 0);
  k.box(new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1 }), 0.62, 0.021, 0.36, 0, 0.18, 0); // the empty cut-out
  for (const x of [-0.3, 0.3]) k.box(steel, 0.08, 0.04, 0.03, x, 0.12, 0.315);
  k.build(g);
  const lid = new THREE.Group(); lid.position.set(0, 0.18, -0.31); lid.rotation.x = -2.1; g.add(lid);
  const lk = new Kit();
  lk.bbox(shell, 0.95, 0.06, 0.62, 0.025, 0, 0.0, 0.31);
  lk.box(foam, 0.86, 0.02, 0.54, 0, -0.035, 0.31);
  lk.build(lid);
  return g;
}

/** A Reaper-style drone: slim fuselage, long straight wings, V-tail, pusher prop, nav lights. */
export function buildDrone() {
  const g = new THREE.Group();
  const k = new Kit();
  const grey = new THREE.MeshStandardMaterial({ color: 0x6c7076, roughness: 0.6, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.4 });
  k.add(grey, new THREE.CapsuleGeometry(0.45, 7.5, 6, 14), [0, 0, 0], [0, 0, PI / 2]);
  k.add(grey, new THREE.SphereGeometry(0.62, 14, 10), [3.6, 0.15, 0], [0, 0, 0], [1.3, 0.9, 0.9]); // sensor bulge / nose
  k.add(dark, new THREE.SphereGeometry(0.28, 12, 8), [3.2, -0.55, 0]); // sensor ball
  k.box(grey, 1.3, 0.12, 20, 0.6, 0.25, 0);
  for (const s of [-1, 1]) k.box(grey, 1.0, 0.08, 2.6, -3.6, 0.6, s * 1.0, [s * 0.75, 0, 0]);
  k.cyl(dark, 0.08, 0.08, 0.3, 8, -4.2, 0, 0, [0, 0, PI / 2]);
  k.build(g);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.18), dark);
  prop.position.set(-4.35, 0, 0);
  g.add(prop);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a20, toneMapped: false }));
  red.position.set(0.6, 0.3, -10);
  const green = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x30ff60, toneMapped: false }));
  green.position.set(0.6, 0.3, 10);
  g.add(red, green);
  g.userData = { prop, red, green };
  return g;
}

/** Port Kaval at night: quay, container stacks, a freighter at the berth, gantry cranes, lamps. */
export function buildPort(scene) {
  const k = new Kit();
  const conc = new THREE.MeshStandardMaterial({ map: paintTex(0x77746c, 70), roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.6, metalness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ map: paintTex(0xb08a28, 71), roughness: 0.7, metalness: 0.4 });
  const hullM = new THREE.MeshStandardMaterial({ map: paintTex(0x3a2826, 72), roughness: 0.8, metalness: 0.3 });
  const deckM = new THREE.MeshStandardMaterial({ map: paintTex(0x4a5a3a, 73), roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ map: paintTex(0xc8c6be, 74), roughness: 0.8 });
  const lampM = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 3 });
  const winM = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc070, emissiveIntensity: 1.6 });
  // Quay along x, its edge at z = 0, water beyond (z < 0).
  k.box(conc, 300, 2.4, 70, 0, -1.2, 35);
  for (let x = -140; x <= 140; x += 12) k.cyl(steel, 0.3, 0.35, 0.6, 10, x, 0.3, 1.2); // bollards
  k.box(new THREE.MeshStandardMaterial({ color: 0xd8c040, roughness: 0.8 }), 300, 0.01, 0.25, 0, 0.01, 3.5); // edge line
  // Container stacks.
  const R = rng(17);
  const cols = [0x8a3a22, 0x2f4f6a, 0x4d5a36, 0x9a7a3a, 0x6a2a2a, 0x3a3a46];
  const cmats = cols.map((c, i) => new THREE.MeshStandardMaterial({ map: corrugatedTex(c, 80 + i), roughness: 0.7, metalness: 0.4 }));
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 9; i++) {
      const h = 1 + Math.floor(R() * 3);
      for (let j = 0; j < h; j++) k.box(cmats[Math.floor(R() * cmats.length)], 12.2, 2.6, 2.44, -70 + i * 13.5 + (row % 2) * 4, 1.3 + j * 2.6, 22 + row * 3);
    }
  }
  // The freighter at the berth: hull with a raked bow, deck, bridge block, cargo hatches, masts.
  const hs = new THREE.Shape();
  hs.moveTo(-48, -6); hs.lineTo(40, -6); hs.lineTo(52, 2); hs.lineTo(54, 5); hs.lineTo(-50, 5); hs.lineTo(-50, -2); hs.closePath();
  const hull = new THREE.ExtrudeGeometry(hs, { depth: 16, bevelEnabled: false });
  hull.translate(0, 0, -8);
  k.add(hullM, hull, [10, -2, -11], [0, 0, 0], [1, 1, 1], { uvScale: 0.25 });
  k.box(deckM, 98, 0.3, 15.6, 12, 3.15, -11);
  for (let i = 0; i < 5; i++) k.box(steel, 9, 1.2, 10, 30 - i * 13, 3.9, -11);
  k.box(white, 10, 9, 14, -32, 7.5, -11);
  k.box(white, 8, 3, 15, -32, 13, -11);
  for (let i = 0; i < 6; i++) k.box(winM, 0.8, 0.9, 0.1, -35 + i * 1.3, 13.2, -3.4);
  k.cyl(steel, 0.25, 0.25, 9, 8, -32, 19, -11);
  for (const x of [18, -6]) { k.cyl(steel, 0.35, 0.35, 12, 8, x, 9, -11); k.rod(steel, V(x, 13, -11), V(x + 9, 6, -11), 0.2); }
  // Gantry cranes on the quay, booms out over the ship.
  for (const x of [-20, 30]) {
    for (const z of [2, 14]) for (const dx of [-5, 5]) k.box(yellow, 1, 26, 1, x + dx, 13, z);
    k.box(yellow, 12, 2, 14, x, 26, 8);
    k.box(yellow, 3, 2, 52, x, 28, -6);
    k.box(steel, 3, 2.5, 3, x, 25.5, -10);
    k.rod(steel, V(x, 25, -10), V(x, 12, -10), 0.06);
  }
  // Lamp posts (bright heads) along the quay.
  for (let x = -100; x <= 100; x += 25) {
    k.cyl(steel, 0.15, 0.2, 14, 8, x, 7, 8);
    k.box(steel, 2.4, 0.2, 0.4, x, 14, 8);
    k.box(lampM, 0.8, 0.25, 0.5, x - 0.9, 13.8, 8); k.box(lampM, 0.8, 0.25, 0.5, x + 0.9, 13.8, 8);
  }
  k.build(scene);
  // A few real lights (the rest is emissive).
  for (const x of [-25, 0, 25]) { const L = new THREE.PointLight(0xffc070, 110, 40, 1.6); L.position.set(x, 13, 8); scene.add(L); }
}

/** The briefing tent: canvas walls, a map table with photos, a hanging lamp, crates and radios. */
export function buildBriefing(scene) {
  const k = new Kit();
  const canvasM = new THREE.MeshStandardMaterial({ map: tarpTex(0x5a5a3c, 90), roughness: 1, side: THREE.DoubleSide });
  const ply = new THREE.MeshStandardMaterial({ map: paintTex(0x7a6448, 91), roughness: 0.85 });
  const crate = new THREE.MeshStandardMaterial({ map: paintTex(0x4f5236, 92), roughness: 0.85 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.6, metalness: 0.3 });
  // Tent: half-cylinder vault, end walls, plywood floor.
  k.add(canvasM, new THREE.CylinderGeometry(4.2, 4.2, 10, 24, 1, true, -PI / 2, PI), [0, 0, 0], [-PI / 2, 0, PI / 2], undefined, { uvScale: 0.5 });
  // (The vault runs along X.)
  k.box(ply, 10, 0.05, 8.4, 0, 0.0, 0, undefined, { uvScale: 0.6 });
  for (const x of [-5, 5]) k.add(canvasM, new THREE.CircleGeometry(4.2, 24, 0, PI), [x, 0, 0], [0, x > 0 ? -PI / 2 : PI / 2, 0]);
  for (let i = 0; i < 4; i++) k.add(black, new THREE.TorusGeometry(4.15, 0.03, 4, 24, PI), [-3.75 + i * 2.5, 0, 0], [0, PI / 2, 0]);
  // Map table (plywood on trestles).
  k.box(ply, 2.6, 0.06, 1.5, 0, 0.88, 0);
  for (const x of [-1.1, 1.1]) for (const z of [-0.6, 0.6]) k.box(black, 0.06, 0.88, 0.06, x, 0.44, z);
  // Crates, a radio set, a whiteboard on an easel.
  for (const [x, z, s] of [[-3.0, -3.6, 1], [-2.2, -3.8, 0.8], [3.0, 3.4, 1]]) k.bbox(crate, 1.1 * s, 0.7 * s, 0.7 * s, 0.03, x, 0.35 * s, z);
  k.bbox(black, 0.5, 0.3, 0.35, 0.02, -3.0, 0.85, -3.6);
  k.cyl(black, 0.006, 0.004, 1.2, 4, -2.85, 1.6, -3.6);
  k.build(scene);
  // Map with the port, routes and pinned photos (canvas).
  const c = cv(1024, 600), g = c.getContext('2d');
  g.fillStyle = '#d8d0b4'; g.fillRect(0, 0, 1024, 600);
  g.fillStyle = '#9fb8c0'; g.beginPath(); g.moveTo(0, 0); g.lineTo(1024, 0); g.lineTo(1024, 230); g.bezierCurveTo(800, 260, 600, 200, 420, 260); g.bezierCurveTo(260, 300, 120, 240, 0, 290); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(80,70,50,0.35)'; g.lineWidth = 1;
  for (let x = 0; x < 1024; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 600); g.stroke(); }
  for (let y = 0; y < 600; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  g.fillStyle = '#8a8270'; for (let i = 0; i < 40; i++) g.fillRect(380 + (i % 8) * 34, 300 + Math.floor(i / 8) * 26, 26, 16);
  g.strokeStyle = '#b01e1e'; g.lineWidth = 6; g.beginPath(); g.arc(520, 255, 46, 0, PI * 2); g.stroke();
  g.setLineDash([16, 10]); g.beginPath(); g.moveTo(980, 560); g.bezierCurveTo(800, 520, 650, 380, 540, 300); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#b01e1e'; g.font = 'bold 30px monospace'; g.fillText('PORT KAVAL', 420, 380); g.fillText('OBJ BLACK WATER', 560, 180);
  const photo = (x, y, rot, label, dark) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = '#f2f0ea'; g.fillRect(-70, -85, 140, 170);
    g.fillStyle = dark; g.fillRect(-60, -75, 120, 120);
    g.fillStyle = '#c8a890'; g.beginPath(); g.ellipse(0, -20, 26, 34, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#222'; g.font = 'bold 18px monospace'; g.textAlign = 'center'; g.fillText(label, 0, 72);
    g.restore();
  };
  photo(130, 430, -0.12, 'VASKO', '#3a3d44'); photo(300, 470, 0.08, 'HART', '#6a7078'); photo(880, 120, 0.1, 'FREIGHTER', '#2a3a48');
  const mapTex = ctex(c, true, false);
  const map = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.85 }));
  map.rotation.x = -PI / 2; map.position.set(0, 0.915, 0);
  scene.add(map);
  // Hanging lamp over the table.
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));
  shade.position.set(0, 2.55, 0); scene.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }));
  bulb.position.set(0, 2.47, 0); scene.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.5, 4), black); cord.position.set(0, 3.4, 0); scene.add(cord);
  const lamp = new THREE.PointLight(0xffc888, 26, 9, 1.6); lamp.position.set(0, 2.4, 0); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024);
  scene.add(lamp);
  return { lamp, shade, bulb };
}

/** Open sea at first light with a coastline and the port's lights ahead (-Z). */
export function buildSea(scene) {
  const n = cv(256, 256), g = n.getContext('2d'), R = rng(5);
  g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const x = R() * 256, y = R() * 256, w = 6 + R() * 26; g.fillStyle = `rgba(${100 + R() * 56},${100 + R() * 56},255,0.35)`; g.beginPath(); g.ellipse(x, y, w, w * 0.35, 0, 0, PI * 2); g.fill(); }
  const normal = ctex(n, false);
  normal.repeat.set(60, 60);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x14303c, roughness: 0.18, metalness: 0.55, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9) }));
  water.rotation.x = -PI / 2;
  scene.add(water);
  // Coast: a dark ridge line, with the port's lights along the shore.
  // A jagged ridge, dark against the dawn.
  const cg = new THREE.CylinderGeometry(2600, 2600, 120, 160, 1, true, PI * 0.8, PI * 0.4);
  const CP = cg.attributes.position;
  for (let i = 0; i < CP.count; i++) if (CP.getY(i) > 0) CP.setY(i, CP.getY(i) + (Math.sin(i * 0.37) * 0.5 + Math.sin(i * 0.11 + 1.3) * 0.8 + R() * 0.5) * 70);
  const coast = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0x07080b, side: THREE.DoubleSide, fog: false }));
  coast.position.set(0, 40, 0);
  scene.add(coast);
  const lights = new THREE.Group();
  const dot = new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false });
  for (let i = 0; i < 140; i++) {
    const a = PI * 0.9 + R() * PI * 0.2, r = 2560;
    const m = new THREE.Mesh(new THREE.SphereGeometry(6 + R() * 8, 6, 4), dot);
    m.position.set(Math.cos(a + PI / 2) * r * 0.0 + (R() - 0.5) * 1400, 4 + R() * 30, -2400 - R() * 120);
    lights.add(m);
  }
  scene.add(lights);
  return { water, normal };
}
