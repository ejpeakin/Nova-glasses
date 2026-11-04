// Detailed soldier bodies: Mixamo's rigged, textured SWAT operator (helmet with
// goggles, plate carrier, pouches, knee pads, gloves; see SOLDIER_CREDIT.md),
// repainted per faction and driven by Humanoid's procedural skeleton.
//
// Humanoid keeps animating its invisible procedural rig (gait, crouch, kneel,
// aiming, reloads, deaths); every frame SoldierRig copies that pose onto the
// Mixamo skeleton. Spine, head and legs copy the rotations of the matching
// procedural joints; the arms are solved again with two-bone IK on the Mixamo
// skeleton's own bone lengths so the gloves land on the weapon's grips.
import * as THREE from '../lib/three.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import * as SkeletonUtils from '../lib/SkeletonUtils.js';
import { SOLDIER_GLB } from '../assets/soldier.js';

let T = null; // parsed template + bind data
let loading = null;

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const ID = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

// Driven bones, parents before children.
const NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

/** Parse the soldier model once (call before the first match). */
export function preloadSoldier() {
  if (loading) return loading;
  loading = new Promise((ok, no) => {
    const bin = Uint8Array.from(atob(SOLDIER_GLB), (c) => c.charCodeAt(0)).buffer;
    new GLTFLoader().parse(bin, '', ok, no);
  })
    .then((gltf) => { T = bindData(gltf.scene); })
    .catch((e) => console.warn('Soldier model failed to load; using procedural soldiers.', e));
  return loading;
}

export const soldierSkinReady = () => !!T;

/** Bind-pose transforms (in the template root's frame) and body dimensions. */
function bindData(model) {
  // Wrap the model so it faces -Z like Humanoid (Mixamo characters face +Z).
  const scene = new THREE.Group();
  scene.add(model);
  scene.updateMatrixWorld(true);
  const find = (n) => scene.getObjectByName(`mixamorig${n}`);
  const wp = (o) => o.getWorldPosition(V());
  if (wp(find('LeftUpLeg')).x > wp(find('RightUpLeg')).x) { scene.rotation.y = Math.PI; scene.updateMatrixWorld(true); }
  const bind = {};
  const p = V(), q = Q(), s = V();
  scene.traverse((o) => {
    if (!o.isBone) return;
    const n = o.name.replace('mixamorig', '');
    if (bind[n]) return; // first of any duplicate names
    o.matrixWorld.decompose(p, q, s);
    bind[n] = { p: p.clone(), q: q.clone() };
  });
  const char = find('Hips').parent;
  char.matrixWorld.decompose(p, q, s);
  const charT = { q: q.clone(), p: p.clone() };
  const unit = s.x; // bones are authored in centimetres
  const B = (n) => bind[n];
  const midLeg = B('LeftUpLeg').p.clone().add(B('RightUpLeg').p).multiplyScalar(0.5);
  // Rest pose matching the procedural rig: arms hanging straight down (the model
  // is bound in a T-pose), legs straight. rest = alignment * bind rotation.
  const rest = {};
  const align = (from, to) => Q().setFromUnitVectors(B(to).p.clone().sub(B(from).p).normalize(), DOWN);
  for (const n of NAMES) rest[n] = B(n).q.clone();
  for (const side of ['Left', 'Right']) {
    const a = align(`${side}Arm`, `${side}ForeArm`), f = align(`${side}ForeArm`, `${side}Hand`);
    rest[`${side}Arm`].premultiply(a);
    rest[`${side}ForeArm`].premultiply(f);
    rest[`${side}Hand`].premultiply(f);
    const u = align(`${side}UpLeg`, `${side}Leg`), l = align(`${side}Leg`, `${side}Foot`);
    rest[`${side}UpLeg`].premultiply(u);
    rest[`${side}Leg`].premultiply(l);
    rest[`${side}Foot`].premultiply(l);
  }
  const len = (a, b) => B(a).p.distanceTo(B(b).p);
  const spine = B('Spine').p;
  const ground = new THREE.Box3().setFromObject(scene).min.y;
  const dims = {
    hipH: midLeg.y - ground,
    hipsOff: B('Hips').p.clone().sub(midLeg),
    legX: Math.abs(B('RightUpLeg').p.x - midLeg.x),
    thigh: len('RightUpLeg', 'RightLeg'),
    shinA: len('RightLeg', 'RightFoot'),
    ankleH: B('RightFoot').p.y - ground,
    torso: spine.clone().sub(midLeg),
    shoulder: B('RightArm').p.clone().sub(spine),
    neck: B('Neck').p.clone().sub(spine),
    armA: len('RightArm', 'RightForeArm'),
    fore: len('RightForeArm', 'RightHand'),
    palm: len('RightHand', 'RightHandMiddle1') * 0.55,
  };
  dims.shin = dims.shinA + dims.ankleH;
  dims.armB = dims.fore + dims.palm;
  // Culling spheres in each mesh's own frame (posed limbs leave the bind bounds).
  const spheres = {};
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const inv = o.matrixWorld.clone().invert();
    const sc = V(); o.matrixWorld.decompose(V(), Q(), sc);
    spheres[o.name] = new THREE.Sphere(new THREE.Vector3(0, 0.9 + ground, 0).applyMatrix4(inv), 1.9 / sc.x);
  });
  return { scene, char: charT, unit, bind, rest, dims, spheres, mats: new Map() };
}

export const soldierDims = () => T?.dims;

// ---------------------------------------------------------------------------
// Faction paint. The uniform (blue in the source texture) becomes each side's
// camouflage, the black kit each side's gear colour, the SWAT lettering is
// painted out, and masked factions get a balaclava. Everything is shaded from
// the texture's own brightness, so folds, stitching, wear and grime survive.

export const PAINT = {
  // US Army: OCP-style camouflage uniform and helmet cover, coyote kit, faces showing.
  orion: { camo: [0x8a7b5c, 0x666649, 0x9d8e6c, 0x564734], gear: 0x5b4d39 },
  // MERIDIAN: black, with black balaclavas.
  meridian: { camo: [0x34363a, 0x26282b, 0x3e4045, 0x1e1f22], gear: 0x1e1f21, mask: 0x18191b },
  desertEnemy: { camo: [0xb5a47f, 0x978660, 0xcab993, 0x7d6c4f], gear: 0x7c6b50, mask: 0xbcad90 },
  snowEnemy: { camo: [0xdfe3e6, 0xc2c8cd, 0xeff1f3, 0xa7afb7], gear: 0x8a9096, mask: 0xd6dadd },
};
const SKIN_TONES = [[1, 1, 1], [0.92, 0.8, 0.7], [0.74, 0.6, 0.5], [0.5, 0.38, 0.3]];

function noiseGrid(n, seed) {
  const g = new Float32Array(n * n);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const a = g[((yi % n + n) % n) * n + ((xi % n + n) % n)], b = g[((yi % n + n) % n) * n + (((xi + 1) % n + n) % n)];
    const c = g[(((yi + 1) % n + n) % n) * n + ((xi % n + n) % n)], d = g[(((yi + 1) % n + n) % n) * n + (((xi + 1) % n + n) % n)];
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

function pixels(src) {
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(src, 0, 0);
  return { cv, cx, img: cx.getImageData(0, 0, cv.width, cv.height) };
}
function toTexture({ cv, cx, img }) {
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Uniform, helmet cover and kit. */
function paintBody(src, paint) {
  const P = pixels(src), d = P.img.data, w = P.cv.width, h = P.cv.height;
  const gear = rgb(paint.gear), camo = paint.camo.map(rgb);
  const n1 = noiseGrid(40, 0x51a7), n2 = noiseGrid(40, 0x9e3b), n3 = noiseGrid(40, 0x2c61);
  const s1 = 40 / w * 3, s2 = 40 / w * 6.5, s3 = 40 / w * 13;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      // Blue cloth -> camouflage; neutral black/grey -> kit colour.
      const cloth = sstep(8, 22, b - r) * sstep(2, 12, g - r);
      let cr = 0, cg = 0, cb = 0;
      if (cloth > 0) {
        const k = n1(x * s1, y * s1) * 0.55 + n2(x * s2, y * s2) * 0.3 + n3(x * s3, y * s3) * 0.15;
        const c = k < 0.4 ? camo[3] : k < 0.5 ? camo[1] : k < 0.6 ? camo[0] : camo[2];
        const kc = Math.min(1.55, lum / 96);
        cr = c[0] * kc; cg = c[1] * kc; cb = c[2] * kc;
      }
      // Bright, colourless marks on the kit (the SWAT lettering) are painted out.
      if (mx - mn < 28 && lum > 120) lum = 48;
      const kg = Math.min(1.45, lum / 42);
      const gr = gear[0] * kg, gg = gear[1] * kg, gb = gear[2] * kg;
      d[i] = Math.min(255, cr * cloth + gr * (1 - cloth));
      d[i + 1] = Math.min(255, cg * cloth + gg * (1 - cloth));
      d[i + 2] = Math.min(255, cb * cloth + gb * (1 - cloth));
    }
  }
  return toTexture(P);
}

/** Face: left as it is, or covered by a knit balaclava with an eye slit. */
function paintHead(src, mask) {
  const P = pixels(src), d = P.img.data, w = P.cv.width, h = P.cv.height;
  const m = rgb(mask);
  const knit = noiseGrid(64, 0x77aa);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      // Eyeballs and the skin round the eyes stay; everything else is cloth.
      const eye = Math.hypot(u - 0.249, v - 0.947) < 0.05 || Math.hypot(u - 0.347, v - 0.947) < 0.05;
      const slit = v > 0.64 && v < 0.715 && u > 0.36 && u < 0.645;
      if (eye || slit) continue;
      const i = (y * w + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const k = (0.75 + 0.35 * Math.min(1.4, lum / 120)) * (0.88 + 0.24 * knit(x * 0.5, y * 0.5));
      d[i] = Math.min(255, m[0] * k); d[i + 1] = Math.min(255, m[1] * k); d[i + 2] = Math.min(255, m[2] * k);
    }
  }
  return toTexture(P);
}

function materialsFor(key, paint, tone) {
  const mk = `${key}:${paint.mask ? 'm' : tone}`;
  if (T.mats.has(mk)) return T.mats.get(mk);
  let body = null, head = null;
  T.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    for (const m of [].concat(o.material)) { if (m.name.includes('head')) head = m; else body = m; }
  });
  T.mats.bodies ??= new Map();
  let mb = T.mats.bodies.get(key);
  if (!mb) {
    mb = body.clone();
    mb.map = paintBody(body.map.image, paint);
    mb.roughness = 0.86;
    mb.metalness = 0.04;
    mb.color.setRGB(1, 1, 1);
    T.mats.bodies.set(key, mb);
  }
  const mh = head.clone();
  if (paint.mask) { mh.map = paintHead(head.map.image, paint.mask); mh.roughness = 0.95; } else {
    const c = SKIN_TONES[tone % SKIN_TONES.length];
    mh.color.setRGB(c[0], c[1], c[2]);
    mh.roughness = 0.62;
  }
  mh.metalness = 0;
  const out = { body: mb, head: mh };
  T.mats.set(mk, out);
  return out;
}

// ---------------------------------------------------------------------------

const qa = Q(), qb = Q(), qc = Q(), qd = Q(), qe = Q(), qa2 = Q();
const va = V(), vb = V(), vc = V(), vd = V(), ve = V();

export class SoldierRig {
  /** key: material cache key; paint: PAINT entry; tone: skin tone index. */
  constructor(key, paint, tone = 0) {
    this.root = SkeletonUtils.clone(T.scene);
    const mats = materialsFor(key, paint, tone);
    this.meshes = [];
    this.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => (m.name.includes('head') ? mats.head : mats.body)) : (o.material.name.includes('head') ? mats.head : mats.body);
      o.castShadow = true;
      o.boundingSphere = T.spheres[o.name].clone();
      this.meshes.push(o);
    });
    this.b = {};
    for (const n of NAMES) this.b[n] = this.root.getObjectByName(`mixamorig${n}`);
    // For each driven bone: its nearest driven ancestor and any bones in between.
    this.up = {};
    for (const n of NAMES) {
      const mids = [];
      let a = this.b[n].parent, anc = null;
      while (a) {
        const an = a.isBone ? a.name.replace('mixamorig', '') : null;
        if (an && NAMES.includes(an) && this.b[an] === a) { anc = an; break; }
        if (!a.isBone) break;
        mids.unshift(a);
        a = a.parent;
      }
      this.up[n] = { anc, mids };
    }
    this.wq = {}; this.wp = {};
    for (const n of NAMES) { this.wq[n] = Q(); this.wp[n] = V(); }
    // Fingers curled into a grip; thumb wrapped across.
    for (const side of ['Left', 'Right']) {
      const axis = new THREE.Vector3(0, 0, side === 'Right' ? -1 : 1); // T-pose: fingers along ±X, palms down
      for (const f of FINGERS) {
        for (let j = 1; j <= 3; j++) this._curl(`${side}Hand${f}${j}`, axis, j === 1 ? 0.95 : 1.05);
      }
      for (let j = 1; j <= 3; j++) this._curl(`${side}HandThumb${j}`, new THREE.Vector3(0, side === 'Right' ? 1 : -1, 0), j === 1 ? 0.35 : 0.45);
    }
    this.d = T.dims;
    this._tp = V();
    this._pq = Q(); this._pp = V();
  }

  _curl(name, worldAxis, ang) {
    const bn = this.root.getObjectByName(`mixamorig${name}`);
    const bd = T.bind[name];
    if (!bn || !bd) return;
    const local = worldAxis.clone().applyQuaternion(bd.q.clone().invert());
    bn.quaternion.multiply(Q().setFromAxisAngle(local, ang));
  }

  /** World (template-root frame) rotation and position of a driven bone's parent. */
  _parent(name, outQ, outP) {
    const { anc, mids } = this.up[name];
    if (anc) { outQ.copy(this.wq[anc]); outP.copy(this.wp[anc]); } else { outQ.copy(T.char.q); outP.copy(T.char.p); }
    for (const m of mids) {
      outP.add(va.copy(m.position).multiplyScalar(T.unit).applyQuaternion(outQ));
      outQ.multiply(m.quaternion);
    }
  }

  /** Give a driven bone a world rotation (null keeps its local one); returns its world position. */
  _set(name, q) {
    const pq = this._pq, pp = this._pp;
    this._parent(name, pq, pp);
    const bone = this.b[name];
    if (q) bone.quaternion.copy(qe.copy(pq).invert().multiply(q));
    this.wq[name].copy(pq).multiply(bone.quaternion);
    return this.wp[name].copy(bone.position).multiplyScalar(T.unit).applyQuaternion(pq).add(pp);
  }

  /** Copy the Humanoid's procedural pose onto the skeleton. */
  pose(h) {
    const R = T.rest, d = this.d;
    const hips = h.hips, torso = h.torso;
    // Pelvis.
    const Qh = hips.quaternion;
    const Qt = qa.copy(Qh).multiply(torso.quaternion);
    // Pelvis: rotation and position (its parent is the model root).
    const qHips = qb.copy(Qh).multiply(R.Hips);
    const pHips = va.copy(d.hipsOff).applyQuaternion(Qh).add(hips.position);
    const cq = qc.copy(T.char.q).invert();
    this.b.Hips.position.copy(pHips).sub(T.char.p).applyQuaternion(cq).divideScalar(T.unit);
    this._set('Hips', qHips);
    // Spine: the procedural torso rotation spread over three vertebrae.
    const rt = torso.quaternion;
    this._set('Spine', qd.copy(Qh).multiply(qc.slerpQuaternions(ID, rt, 0.35)).multiply(R.Spine));
    this._set('Spine1', qd.copy(Qh).multiply(qc.slerpQuaternions(ID, rt, 0.7)).multiply(R.Spine1));
    this._set('Spine2', qd.copy(Qt).multiply(R.Spine2));
    this._set('Neck', qd.copy(Qt).multiply(qc.slerpQuaternions(ID, h.head.quaternion, 0.4)).multiply(R.Neck));
    this._set('Head', qd.copy(Qt).multiply(h.head.quaternion).multiply(R.Head));
    // Arms: IK from the model's own shoulders to the procedural hand targets.
    const tPos = this._tp.copy(torso.position).applyQuaternion(Qh).add(hips.position);
    for (const arm of h.arms) {
      const side = arm.side > 0 ? 'Right' : 'Left';
      this._set(`${side}Shoulder`, null);
      this._parent(`${side}Arm`, this._pq, this._pp);
      const S = this._sh ??= V();
      S.copy(this.b[`${side}Arm`].position).multiplyScalar(T.unit).applyQuaternion(this._pq).add(this._pp);
      const target = vc.copy(arm.target).applyQuaternion(Qt).add(tPos);
      this._arm(side, arm.side, S, target, Qt);
    }
    // Legs: copy thigh and shin, keep the boot near level while the foot is planted.
    for (const l of h.legs) {
      const side = l.side > 0 ? 'Right' : 'Left';
      const qT = qa2.copy(Qh).multiply(l.thigh.quaternion);
      this._set(`${side}UpLeg`, qd.copy(qT).multiply(R[`${side}UpLeg`]));
      const qSh = qT.multiply(l.shin.quaternion);
      this._set(`${side}Leg`, qd.copy(qSh).multiply(R[`${side}Leg`]));
      this._set(`${side}Foot`, qd.copy(qSh).multiply(qc.setFromAxisAngle(X, l.ankle ?? 0)).multiply(R[`${side}Foot`]));
    }
  }

  /** Two-bone IK on the model's own arm: shoulder S to palm target, elbow down and out. */
  _arm(side, sx, S, target, Qt) {
    const d = this.d, a = d.armA, b = d.armB;
    const dir = va.subVectors(target, S);
    let len = dir.length();
    const u = dir.divideScalar(Math.max(1e-4, len));
    len = Math.min(Math.max(len, 0.08), a + b - 0.002);
    const x = (a * a - b * b + len * len) / (2 * len);
    const hgt = Math.sqrt(Math.max(0, a * a - x * x));
    const pole = vd.set(sx * 0.75, -1, 0.25).normalize().applyQuaternion(Qt);
    pole.addScaledVector(u, -pole.dot(u)).normalize();
    const elbow = ve.copy(S).addScaledVector(u, x).addScaledVector(pole, hgt);
    const hand = vb.copy(S).addScaledVector(u, len);
    const qti = qc.copy(Qt).invert();
    const u1 = elbow.clone().sub(S).normalize().applyQuaternion(qti);
    const u2 = hand.sub(elbow).normalize().applyQuaternion(qti);
    const R = T.rest;
    this._set(`${side}Arm`, qa2.copy(Qt).multiply(qd.setFromUnitVectors(DOWN, u1)).multiply(R[`${side}Arm`]));
    const sw = qd.setFromUnitVectors(DOWN, u2);
    this._set(`${side}ForeArm`, qa2.copy(Qt).multiply(sw).multiply(R[`${side}ForeArm`]));
    this._set(`${side}Hand`, qa2.copy(Qt).multiply(sw).multiply(R[`${side}Hand`]));
  }

  dispose() { this.root.removeFromParent(); }
}
