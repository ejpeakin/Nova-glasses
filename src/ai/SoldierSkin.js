// Detailed soldier bodies: the rigged, textured "Vanguard" soldier by Mixamo that
// ships with the three.js examples (examples/models/gltf/Soldier.glb), repainted
// per faction and driven by Humanoid's procedural skeleton.
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

/** Bind-pose transforms (in the model root's frame) and body dimensions. */
function bindData(scene) {
  scene.updateMatrixWorld(true);
  const bone = (n) => scene.getObjectByName(`mixamorig${n}`);
  const bind = {};
  const p = V(), q = Q(), s = V();
  scene.traverse((o) => {
    if (!o.isBone) return;
    o.matrixWorld.decompose(p, q, s);
    bind[o.name.replace('mixamorig', '')] = { p: p.clone(), q: q.clone() };
  });
  const char = bone('Hips').parent;
  const unit = char.scale.x; // bones are authored in centimetres
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
  const dims = {
    hipH: midLeg.y,
    hipsOff: B('Hips').p.clone().sub(midLeg),
    legX: Math.abs(B('RightUpLeg').p.x - midLeg.x),
    thigh: len('RightUpLeg', 'RightLeg'),
    shinA: len('RightLeg', 'RightFoot'),
    ankleH: B('RightFoot').p.y,
    torso: spine.clone().sub(midLeg),
    shoulder: B('RightArm').p.clone().sub(spine),
    neck: B('Neck').p.clone().sub(spine),
    armA: len('RightArm', 'RightForeArm'),
    fore: len('RightForeArm', 'RightHand'),
    palm: len('RightHand', 'RightHandMiddle1') * 0.5,
  };
  dims.shin = dims.shinA + dims.ankleH;
  dims.armB = dims.fore + dims.palm;
  return { scene, char: { q: char.quaternion.clone(), p: char.position.clone() }, unit, bind, rest, dims, mats: new Map() };
}

export const soldierDims = () => T?.dims;

// ---------------------------------------------------------------------------
// Faction paint: the model's tan armour, olive undersuit and red flashes are
// repainted from the texture's own shading, so the wear, grime and stitching
// survive in every colour scheme.

export const PAINT = {
  // US Army: ranger-green armour over multicam, green IR-patch flashes.
  orion: { plate: 0x646650, suit: 0x5f6146, stripe: 0x4d7a46, camo: [0x8c7b5a, 0x5d6142, 0x9f8f6a, 0x4a3f2e] },
  meridian: { plate: 0x3a3d41, suit: 0x2b2d30, stripe: 0x9a1c1c },
  desertEnemy: { plate: 0xb59f78, suit: 0x8d7c5c, stripe: 0x9a1c1c, camo: [0x9d8a66, 0x7d6c4f, 0xb7a57f, 0x6b5b42] },
  snowEnemy: { plate: 0xdde2e6, suit: 0xaeb5bc, stripe: 0x9a1c1c, camo: [0xc3c9ce, 0x9ea6ae, 0xe3e7ea, 0x8b939b] },
};

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

function paintTexture(src, paint) {
  const w = src.width, h = src.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(src, 0, 0);
  const img = cx.getImageData(0, 0, w, h);
  const d = img.data;
  const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const plate = rgb(paint.plate), suit = rgb(paint.suit), stripe = rgb(paint.stripe);
  const camo = paint.camo?.map(rgb);
  const n1 = noiseGrid(32, 0x51a7), n2 = noiseGrid(32, 0x9e3b);
  const sc1 = 32 / w * 1.0, sc2 = 32 / w * 2.3;
  const tmp = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Bluish-grey metal (buckles, visor frame): leave as it is.
      if (b > r + 4 && lum > 40) continue;
      const red = sstep(55, 95, r - g * 1.4);
      const tan = (1 - red) * sstep(70, 120, r) * sstep(18, 45, r - b);
      let base = suit;
      if (camo && tan < 0.99) {
        // Four-colour blotch camouflage on the fabric (UV space; the seams hide in it).
        const k = n1(x * sc1, y * sc1) * 0.65 + n2(x * sc2, y * sc2) * 0.35;
        const c = k < 0.38 ? camo[3] : k < 0.5 ? camo[1] : k < 0.62 ? camo[0] : camo[2];
        tmp[0] = c[0]; tmp[1] = c[1]; tmp[2] = c[2];
        base = tmp;
      }
      // Shade each paint from the texel's own brightness relative to that area's base tone.
      const ks = Math.min(1.6, lum / 44), kp = Math.min(1.25, lum / 165), kr = Math.min(1.3, r / 133);
      const wS = 1 - tan - red;
      d[i] = Math.min(255, base[0] * ks * wS + plate[0] * kp * tan + stripe[0] * kr * red);
      d[i + 1] = Math.min(255, base[1] * ks * wS + plate[1] * kp * tan + stripe[1] * kr * red);
      d[i + 2] = Math.min(255, base[2] * ks * wS + plate[2] * kp * tan + stripe[2] * kr * red);
    }
  }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function materialsFor(key, paint) {
  if (T.mats.has(key)) return T.mats.get(key);
  let body = null, visor = null;
  T.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (o.name.includes('visor')) visor = o.material; else body = o.material;
  });
  const map = paintTexture(body.map.image, paint);
  const mb = body.clone();
  mb.map = map;
  mb.roughness = 0.84;
  mb.metalness = 0.04;
  mb.color.setRGB(1, 1, 1);
  const mv = (visor ?? body).clone();
  mv.map = map;
  mv.roughness = 0.22;
  mv.metalness = 0.55;
  mv.color.setRGB(1, 1, 1);
  const out = { body: mb, visor: mv };
  T.mats.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------

const qa = Q(), qb = Q(), qc = Q(), qd = Q(), qe = Q();
const va = V(), vb = V(), vc = V(), vd = V(), ve = V();

export class SoldierRig {
  /** key: material cache key; paint: { plate, suit, stripe, camo? }. */
  constructor(key, paint) {
    this.root = SkeletonUtils.clone(T.scene);
    const mats = materialsFor(key, paint);
    this.meshes = [];
    this.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.material = o.name.includes('visor') ? mats.visor : mats.body;
      o.castShadow = true;
      // Posed limbs reach well outside the bind-pose bounds: cull on a generous sphere.
      o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.9 / T.unit), 1.9 / T.unit);
      this.meshes.push(o);
    });
    this.b = {};
    for (const n of NAMES) this.b[n] = this.root.getObjectByName(`mixamorig${n}`);
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
  }

  _curl(name, worldAxis, ang) {
    const bn = this.root.getObjectByName(`mixamorig${name}`);
    const bd = T.bind[name];
    if (!bn || !bd) return;
    const local = worldAxis.clone().applyQuaternion(bd.q.clone().invert());
    bn.quaternion.multiply(Q().setFromAxisAngle(local, ang));
  }

  /** Set a bone from its desired rotation (model-root frame) given its parent's. */
  _set(name, parentQ, q) {
    this.b[name].quaternion.copy(qe.copy(parentQ).invert().multiply(q));
  }

  /** Child bone position (model-root frame) from its parent's transform. */
  _child(name, parentP, parentQ, out) {
    return out.copy(this.b[name].position).multiplyScalar(T.unit).applyQuaternion(parentQ).add(parentP);
  }

  /** Copy the Humanoid's procedural pose onto the skeleton. */
  pose(h) {
    const R = T.rest, d = this.d;
    const hips = h.hips, torso = h.torso;
    // Pelvis.
    const Qh = hips.quaternion;
    const Qt = qa.copy(Qh).multiply(torso.quaternion);
    const qHips = Q().copy(Qh).multiply(R.Hips);
    const pHips = va.copy(d.hipsOff).applyQuaternion(Qh).add(hips.position);
    const cq = qb.copy(T.char.q).invert();
    this.b.Hips.quaternion.copy(cq).multiply(qHips);
    this.b.Hips.position.copy(pHips).sub(T.char.p).applyQuaternion(cq).divideScalar(T.unit);
    // Spine: the procedural torso rotation spread over three vertebrae.
    const rt = torso.quaternion;
    const qS = Q().copy(Qh).multiply(qc.slerpQuaternions(ID, rt, 0.35)).multiply(R.Spine);
    this._set('Spine', qHips, qS);
    const qS1 = Q().copy(Qh).multiply(qc.slerpQuaternions(ID, rt, 0.7)).multiply(R.Spine1);
    this._set('Spine1', qS, qS1);
    const qS2 = Q().copy(Qt).multiply(R.Spine2);
    this._set('Spine2', qS1, qS2);
    const qN = Q().copy(Qt).multiply(qc.slerpQuaternions(ID, h.head.quaternion, 0.4)).multiply(R.Neck);
    this._set('Neck', qS2, qN);
    this._set('Head', qN, Q().copy(Qt).multiply(h.head.quaternion).multiply(R.Head));
    // Positions down the spine to the shoulders (for the arm IK).
    const pS = this._child('Spine', pHips, qHips, V());
    const pS1 = this._child('Spine1', pS, qS, V());
    const pS2 = this._child('Spine2', pS1, qS1, V());
    // Torso frame (hips-parent frame) for the hand targets.
    const tPos = this._tp.copy(torso.position).applyQuaternion(Qh).add(hips.position);
    for (const arm of h.arms) {
      const side = arm.side > 0 ? 'Right' : 'Left';
      const qSh = Q().copy(qS2).multiply(this.b[`${side}Shoulder`].quaternion);
      const pSh = this._child(`${side}Shoulder`, pS2, qS2, V());
      const S = this._child(`${side}Arm`, pSh, qSh, V());
      const target = vc.copy(arm.target).applyQuaternion(Qt).add(tPos);
      this._arm(side, arm.side, S, target, Qt, qSh);
    }
    // Legs: copy thigh and shin, keep the boot near level while the foot is planted.
    for (const l of h.legs) {
      const side = l.side > 0 ? 'Right' : 'Left';
      const qT = Q().copy(Qh).multiply(l.thigh.quaternion);
      const qUp = Q().copy(qT).multiply(R[`${side}UpLeg`]);
      this._set(`${side}UpLeg`, qHips, qUp);
      const qSh = qd.copy(qT).multiply(l.shin.quaternion);
      const qLeg = Q().copy(qSh).multiply(R[`${side}Leg`]);
      this._set(`${side}Leg`, qUp, qLeg);
      const qF = Q().copy(qSh).multiply(qe.setFromAxisAngle(X, l.ankle ?? 0)).multiply(R[`${side}Foot`]);
      this._set(`${side}Foot`, qLeg, qF);
    }
  }

  /** Two-bone IK on the model's own arm: shoulder S to palm target, elbow down and out. */
  _arm(side, sx, S, target, Qt, qParent) {
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
    const qArm = Q().copy(Qt).multiply(qd.setFromUnitVectors(DOWN, u1)).multiply(R[`${side}Arm`]);
    this._set(`${side}Arm`, qParent, qArm);
    const sw = qd.setFromUnitVectors(DOWN, u2);
    const qFore = Q().copy(Qt).multiply(sw).multiply(R[`${side}ForeArm`]);
    this._set(`${side}ForeArm`, qArm, qFore);
    this._set(`${side}Hand`, qFore, Q().copy(Qt).multiply(sw).multiply(R[`${side}Hand`]));
  }

  dispose() { this.root.removeFromParent(); }
}
