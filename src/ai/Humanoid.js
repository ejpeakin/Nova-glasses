// Third-person soldier model. Each body segment (pelvis, torso, head, arms, legs) is
// one merged geometry with vertex colours in two material groups (camouflage fabric
// and plain gear/skin), so a detailed soldier costs about a dozen draw calls.
// Arms use two-bone IK so both hands stay on the weapon; legs use a procedural gait.
import * as THREE from '../lib/three.js';
import { getTexture } from '../world/Textures.js';
import { WEAPONS, resolveAttachments } from '../weapons/WeaponData.js';
import { buildWeaponModel } from '../weapons/WeaponModel.js';
import { damp, clamp, makeRng } from '../core/Utils.js';

const SKIN = [0xc99d7e, 0xb48364, 0x8f6146, 0x6b4430, 0xd9b496, 0xa87a5a];

export const FACTIONS = {
  orion: {
    fabric: 0x938d68, pants: 0x8a845f, vest: 0x5f6247, gear: 0x4c4f3a, helmet: 0x726d52, boots: 0x6a563c,
    gloves: 0x4e4838, mask: 'none', headgear: ['helmet', 'helmet', 'cap'], band: 0x3a6e3c,
  },
  meridian: {
    fabric: 0x44474a, pants: 0x3a3d40, vest: 0x26292c, gear: 0x1f2124, helmet: 0x26282b, boots: 0x1b1b1c,
    gloves: 0x1d1d1e, mask: 'balaclava', maskColor: 0x1a1b1c, headgear: ['helmet', 'helmet', 'none'], band: 0x9a1c1c,
  },
  desertEnemy: {
    fabric: 0xb09c72, pants: 0x96845f, vest: 0x72634b, gear: 0x5e5240, helmet: 0x7e6e52, boots: 0x6c5439,
    gloves: 0x5c4c3b, mask: 'shemagh', scarf: 0xbcad90, headgear: ['helmet', 'none', 'boonie'], band: 0x9a1c1c,
  },
  snowEnemy: {
    fabric: 0xe2e6ea, pants: 0xd2d7dc, vest: 0x80878e, gear: 0x6c7279, helmet: 0xdadfe4, boots: 0x3b3d3f,
    gloves: 0x4b4d4f, mask: 'balaclava', maskColor: 0xd4d8dc, headgear: ['helmet', 'helmet', 'beanie'], band: 0x9a1c1c,
  },
  heavy: {
    fabric: 0x2e2f30, pants: 0x2a2b2c, vest: 0x1c1d1e, gear: 0x232425, helmet: 0x18191a, boots: 0x151515,
    gloves: 0x18181a, mask: 'none', headgear: ['juggernaut'], band: 0xb01e1e, heavy: true,
  },
};

const FFA_COLORS = [0x7a3a3a, 0x3a5a7a, 0x6a6a3a, 0x4a7a4a, 0x7a5a3a, 0x5a3a7a, 0x3a7a7a, 0x7a7a7a];

// ---------------------------------------------------------------------------
// Geometry merging with vertex colours and two material groups.

const FABRIC = 0, PLAIN = 1;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpN = new THREE.Matrix3();
const tmpC = new THREE.Color();

class Parts {
  constructor() { this.list = []; }

  /** Add a primitive. p = [x,y,z], r = [rx,ry,rz], s = [sx,sy,sz]. */
  add(geo, color, mat = PLAIN, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], uv = 1) {
    this.list.push({ geo, color, mat, p, r, s, uv });
    return this;
  }

  box(w, h, d, color, mat, p, r, s) { return this.add(new THREE.BoxGeometry(w, h, d), color, mat, p, r, s, Math.max(w, h, d) / 0.35); }
  sphere(rad, color, mat, p, s, r, ws = 12, hs = 9) { return this.add(new THREE.SphereGeometry(rad, ws, hs), color, mat, p, r, s, rad / 0.15); }
  cyl(r1, r2, h, color, mat, p, r, s, seg = 10) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), color, mat, p, r, s, h / 0.35); }
  capsule(rad, len, color, mat, p, r, s) { return this.add(new THREE.CapsuleGeometry(rad, len, 4, 10), color, mat, p, r, s, (len + rad * 2) / 0.35); }

  build() {
    const pos = [], nrm = [], uv = [], col = [];
    const idx = [[], []];
    for (const part of this.list) {
      const g = part.geo.index ? part.geo : part.geo;
      tmpE.set(part.r[0], part.r[1], part.r[2]);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(part.p[0], part.p[1], part.p[2]);
      tmpS.set(part.s[0], part.s[1], part.s[2]);
      tmpM.compose(tmpP, tmpQ, tmpS);
      tmpN.getNormalMatrix(tmpM);
      tmpC.setHex(part.color);
      const base = pos.length / 3;
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(tmpM);
        pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(tmpN).normalize();
        nrm.push(v.x, v.y, v.z);
        uv.push(U ? U.getX(i) * part.uv : 0, U ? U.getY(i) * part.uv : 0);
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[part.mat].push(base + g.index.getX(i));
      else for (let i = 0; i < P.count; i++) idx[part.mat].push(base + i);
      part.geo.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx[0].concat(idx[1]));
    geo.addGroup(0, idx[0].length, FABRIC);
    geo.addGroup(idx[0].length, idx[1].length, PLAIN);
    geo.computeBoundingSphere();
    return geo;
  }
}

let MATS = null;
function materials() {
  if (MATS) return MATS;
  MATS = [
    new THREE.MeshStandardMaterial({ vertexColors: true, map: getTexture('fabric', 256), roughness: 0.93, metalness: 0 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 }),
  ];
  return MATS;
}

const geoCache = new Map();
function cached(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}

// ---------------------------------------------------------------------------
// Body segment builders (all in metres, pivots documented per segment).

/** Pelvis: pivot at hip joint height. */
function pelvisGeo(f) {
  const p = new Parts();
  p.box(0.33, 0.2, 0.22, f.pants, FABRIC, [0, 0.03, 0]);
  p.box(0.35, 0.055, 0.24, f.gear, PLAIN, [0, 0.13, 0]); // war belt
  p.box(0.07, 0.09, 0.05, f.gear, PLAIN, [-0.13, 0.08, -0.12]); // belt pouches
  p.box(0.07, 0.09, 0.05, f.gear, PLAIN, [0.13, 0.08, -0.12]);
  p.box(0.09, 0.1, 0.05, f.gear, PLAIN, [0, 0.07, 0.13]); // dump pouch
  return p.build();
}

/** Torso: pivot at the hips; shoulders at y≈0.5. */
function torsoGeo(f, v) {
  const p = new Parts();
  if (f.heavy) {
    p.capsule(0.19, 0.2, f.fabric, FABRIC, [0, 0.3, 0], [0, 0, 0], [1.25, 1, 0.9]);
    p.box(0.52, 0.5, 0.44, f.vest, PLAIN, [0, 0.33, 0]); // bomb-suit plates
    p.box(0.46, 0.18, 0.4, f.gear, PLAIN, [0, 0.12, 0]);
    p.box(0.3, 0.12, 0.08, f.gear, PLAIN, [0, 0.42, -0.24]);
    p.cyl(0.17, 0.2, 0.12, f.vest, PLAIN, [0, 0.62, 0]); // armoured collar
    p.sphere(0.12, f.vest, PLAIN, [-0.27, 0.52, 0], [1, 0.8, 1.1]); // pauldrons
    p.sphere(0.12, f.vest, PLAIN, [0.27, 0.52, 0], [1, 0.8, 1.1]);
    return p.build();
  }
  // Body under the gear.
  p.capsule(0.145, 0.1, f.fabric, FABRIC, [0, 0.17, 0], [0, 0, 0], [1.15, 1, 0.82]);
  p.capsule(0.16, 0.16, f.fabric, FABRIC, [0, 0.38, 0], [0, 0, 0], [1.2, 1, 0.8]);
  p.sphere(0.072, f.fabric, FABRIC, [-0.205, 0.5, 0], [1, 0.95, 1]); // deltoids
  p.sphere(0.072, f.fabric, FABRIC, [0.205, 0.5, 0], [1, 0.95, 1]);
  // Plate carrier.
  p.box(0.33, 0.31, 0.065, f.vest, PLAIN, [0, 0.37, -0.15]);
  p.box(0.33, 0.34, 0.06, f.vest, PLAIN, [0, 0.38, 0.14]);
  p.box(0.38, 0.15, 0.29, f.vest, PLAIN, [0, 0.27, 0]); // cummerbund
  p.box(0.065, 0.045, 0.3, f.vest, PLAIN, [-0.1, 0.535, 0]); // shoulder straps
  p.box(0.065, 0.045, 0.3, f.vest, PLAIN, [0.1, 0.535, 0]);
  // Triple mag pouch + admin pouch.
  for (const x of [-0.09, 0, 0.09]) p.box(0.08, 0.11, 0.055, f.gear, PLAIN, [x, 0.285, -0.205]);
  p.box(0.2, 0.08, 0.035, f.gear, PLAIN, [0, 0.43, -0.195]);
  // Side pouches.
  p.box(0.06, 0.12, 0.09, f.gear, PLAIN, [-0.21, 0.27, 0.02]);
  p.box(0.06, 0.1, 0.08, f.gear, PLAIN, [0.21, 0.27, 0.04]);
  if (v.radio) {
    p.box(0.07, 0.15, 0.06, f.gear, PLAIN, [-0.12, 0.42, 0.19]);
    p.cyl(0.006, 0.004, 0.42, 0x111111, PLAIN, [-0.13, 0.68, 0.2], [0.15, 0, 0.1], [1, 1, 1], 5); // antenna
  }
  if (v.pack) {
    p.box(0.3, 0.34, 0.15, f.gear, PLAIN, [0, 0.36, 0.245]);
    p.box(0.28, 0.08, 0.16, f.vest, PLAIN, [0, 0.55, 0.245]);
  }
  // Neck.
  const neckCol = f.mask === 'balaclava' ? f.maskColor : f.mask === 'shemagh' ? f.scarf : v.skin;
  p.cyl(0.052, 0.058, 0.11, neckCol, f.mask === 'none' ? PLAIN : FABRIC, [0, 0.6, 0.0]);
  if (f.mask === 'shemagh') p.cyl(0.085, 0.09, 0.07, f.scarf, FABRIC, [0, 0.58, 0]);
  return p.build();
}

/** Head: pivot at the base of the neck (y=0 at torso y≈0.63). */
function headGeo(f, v) {
  const p = new Parts();
  const masked = f.mask === 'balaclava';
  const headCol = masked ? f.maskColor : v.skin;
  const headMat = masked ? FABRIC : PLAIN;
  if (f.heavy || v.headgear === 'juggernaut') {
    p.sphere(0.155, f.helmet, PLAIN, [0, 0.12, 0], [1, 1.08, 1.08], [0, 0, 0], 14, 10);
    p.box(0.2, 0.09, 0.08, f.gear, PLAIN, [0, 0.07, -0.12]); // chin guard
    return p.build();
  }
  // Skull + jaw + face.
  p.sphere(0.102, headCol, headMat, [0, 0.11, 0.005], [0.94, 1.1, 1.04]);
  p.box(0.13, 0.07, 0.12, headCol, headMat, [0, 0.03, -0.025]);
  p.box(0.022, 0.035, 0.03, v.skin, PLAIN, [0, 0.085, -0.11]); // nose
  p.box(0.025, 0.05, 0.03, v.skin, PLAIN, [-0.098, 0.1, 0]); // ears
  p.box(0.025, 0.05, 0.03, v.skin, PLAIN, [0.098, 0.1, 0]);
  if (masked) {
    p.box(0.13, 0.042, 0.02, v.skin, PLAIN, [0, 0.118, -0.098]); // eye slot
  }
  if (f.mask === 'shemagh') {
    p.box(0.16, 0.08, 0.15, f.scarf, FABRIC, [0, 0.035, -0.02]); // face wrap
    p.sphere(0.11, f.scarf, FABRIC, [0, 0.14, 0.01], [1, 0.75, 1.05]);
  }
  // Eyes or ballistic glasses.
  if (v.glasses) p.box(0.16, 0.034, 0.025, 0x0c0d0e, PLAIN, [0, 0.118, -0.105]);
  else {
    p.box(0.022, 0.012, 0.01, 0x15130f, PLAIN, [-0.033, 0.12, -0.1]);
    p.box(0.022, 0.012, 0.01, 0x15130f, PLAIN, [0.033, 0.12, -0.1]);
  }
  // Headgear.
  switch (v.headgear) {
    case 'helmet':
      p.sphere(0.128, f.helmet, PLAIN, [0, 0.14, 0.006], [1.06, 0.88, 1.13], [0, 0, 0], 14, 8);
      p.add(new THREE.SphereGeometry(0.128, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), f.helmet, PLAIN, [0, 0.135, 0.006], [0, 0, 0], [1.07, 0.92, 1.14]);
      p.box(0.018, 0.028, 0.15, f.gear, PLAIN, [-0.132, 0.125, 0.01]); // ARC rails
      p.box(0.018, 0.028, 0.15, f.gear, PLAIN, [0.132, 0.125, 0.01]);
      p.box(0.055, 0.04, 0.035, 0x1a1a1a, PLAIN, [0, 0.205, -0.128]); // NVG shroud
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [-0.115, 0.085, 0], [0, 0, Math.PI / 2]); // headset cups
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [0.115, 0.085, 0], [0, 0, Math.PI / 2]);
      p.box(0.07, 0.035, 0.04, f.gear, PLAIN, [0, 0.21, 0.12]); // counterweight pouch
      break;
    case 'cap':
      p.add(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), f.fabric, FABRIC, [0, 0.135, 0.005], [0, 0, 0], [1, 0.8, 1.08]);
      p.box(0.15, 0.012, 0.08, f.fabric, FABRIC, [0, 0.138, -0.125], [-0.15, 0, 0]);
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [-0.11, 0.09, 0], [0, 0, Math.PI / 2]);
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [0.11, 0.09, 0], [0, 0, Math.PI / 2]);
      break;
    case 'boonie':
      p.cyl(0.18, 0.18, 0.012, f.fabric, FABRIC, [0, 0.16, 0], [0, 0, 0], [1, 1, 1], 14);
      p.cyl(0.1, 0.112, 0.07, f.fabric, FABRIC, [0, 0.2, 0], [0, 0, 0], [1, 1, 1], 12);
      break;
    case 'beanie':
      p.add(new THREE.SphereGeometry(0.113, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), f.gear, FABRIC, [0, 0.13, 0.005], [0, 0, 0], [1, 1, 1.06]);
      break;
    default:
      break;
  }
  return p.build();
}

/** Upper arm: pivot at the shoulder, hangs along -Y (length 0.29). */
function upperArmGeo(f) {
  const p = new Parts();
  p.capsule(0.052, 0.19, f.fabric, FABRIC, [0, -0.145, 0]);
  if (f.heavy) p.box(0.13, 0.2, 0.13, f.vest, PLAIN, [0, -0.12, 0]);
  return p.build();
}

/** Forearm + hand: pivot at the elbow; glove centred at -0.29. */
function foreArmGeo(f, left) {
  const p = new Parts();
  p.capsule(0.045, 0.17, f.fabric, FABRIC, [0, -0.12, 0]);
  p.cyl(0.05, 0.048, 0.05, f.fabric, FABRIC, [0, -0.215, 0]); // cuff
  p.box(0.075, 0.1, 0.045, f.gloves, PLAIN, [0, -0.29, 0]);
  p.box(0.025, 0.05, 0.025, f.gloves, PLAIN, [left ? 0.04 : -0.04, -0.27, -0.02]); // thumb
  if (f.heavy) p.box(0.11, 0.16, 0.11, f.vest, PLAIN, [0, -0.11, 0]);
  return p.build();
}

/** Thigh: pivot at the hip joint (length 0.46). */
function thighGeo(f, right, v) {
  const p = new Parts();
  p.capsule(0.082, 0.28, f.pants, FABRIC, [0, -0.22, 0]);
  if (right && v.holster) p.box(0.06, 0.18, 0.1, f.gear, PLAIN, [0.085, -0.17, 0]); // drop holster
  if (!right && v.legPouch) p.box(0.05, 0.12, 0.09, f.gear, PLAIN, [-0.085, -0.2, 0.01]);
  if (f.heavy) p.box(0.19, 0.3, 0.2, f.vest, PLAIN, [0, -0.2, -0.01]);
  return p.build();
}

/** Shin + boot: pivot at the knee (length 0.46 to sole). */
function shinGeo(f) {
  const p = new Parts();
  p.capsule(0.062, 0.26, f.pants, FABRIC, [0, -0.19, 0]);
  p.box(0.1, 0.11, 0.05, f.gear, PLAIN, [0, -0.03, -0.065]); // knee pad
  p.box(0.112, 0.12, 0.17, f.boots, PLAIN, [0, -0.39, -0.015]); // boot upper
  p.box(0.115, 0.06, 0.27, f.boots, PLAIN, [0, -0.43, -0.04]); // foot
  p.box(0.12, 0.022, 0.28, 0x111111, PLAIN, [0, -0.462, -0.04]); // sole
  if (f.heavy) p.box(0.15, 0.3, 0.15, f.vest, PLAIN, [0, -0.17, -0.01]);
  return p.build();
}

// ---------------------------------------------------------------------------
// Weapons for third-person models: the first-person model baked into one mesh.

const gunCache = new Map();
let gunMat = null;
function bakedGun(weaponId) {
  if (gunCache.has(weaponId)) return gunCache.get(weaponId);
  const def = WEAPONS[weaponId] ?? WEAPONS.vx4;
  const info = buildWeaponModel(def, resolveAttachments(weaponId, {}));
  info.group.updateMatrixWorld(true);
  const p = new Parts();
  info.group.traverse((o) => {
    if (!o.isMesh || o.material.transparent || o.material.map) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    p.add(g, o.material.color.getHex(), PLAIN);
  });
  const entry = {
    geo: p.build(),
    muzzle: info.muzzle.position.clone(),
    left: info.leftHand.clone(),
    right: new THREE.Vector3(0, -0.04, 0.03),
  };
  gunCache.set(weaponId, entry);
  return entry;
}

function gunMaterial() {
  if (!gunMat) gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 });
  return gunMat;
}

/** Detailed weapon mesh (third person, pickups). */
export function buildLowGun(weaponId) {
  const m = new THREE.Mesh(bakedGun(weaponId).geo, gunMaterial());
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------

const DOWN = new THREE.Vector3(0, -1, 0);

export class Humanoid {
  constructor(faction = 'meridian', weaponId = 'vx4', opts = {}) {
    const base = FACTIONS[faction] ?? FACTIONS.meridian;
    const f = { ...base };
    let key = faction;
    if (opts.colorIndex !== undefined) {
      const c = FFA_COLORS[opts.colorIndex % FFA_COLORS.length];
      f.fabric = c; f.pants = c; f.band = c;
      key += `:ffa${opts.colorIndex % FFA_COLORS.length}`;
    }
    const rng = makeRng((opts.seed ?? Math.floor(Math.random() * 1e6)) * 2654435761);
    const v = {
      headgear: rng.pick(f.headgear),
      skin: rng.pick(SKIN),
      glasses: rng() < 0.45,
      pack: rng() < 0.4,
      radio: rng() < 0.35,
      holster: rng() < 0.6,
      legPouch: rng() < 0.4,
    };
    this.faction = f;
    const mats = materials();
    const mk = (geo) => {
      const m = new THREE.Mesh(geo, mats);
      m.castShadow = true;
      return m;
    };

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    if (f.heavy) this.body.scale.setScalar(1.12);
    this.root.add(this.body);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.body.add(this.hips);
    this.hips.add(mk(cached(`${key}:pelvis`, () => pelvisGeo(f))));

    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);
    this.torso.add(mk(cached(`${key}:torso:${v.pack}:${v.radio}:${v.skin}`, () => torsoGeo(f, v))));

    this.head = new THREE.Group();
    this.head.position.y = 0.63;
    this.torso.add(this.head);
    this.head.add(mk(cached(`${key}:head:${v.headgear}:${v.skin}:${v.glasses}`, () => headGeo(f, v))));
    if (f.heavy) {
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.03), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1810, emissiveIntensity: 2.4 }));
      visor.position.set(0, 0.13, -0.16);
      this.head.add(visor);
    }
    // Armband on the left shoulder (faction ID).
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 10), new THREE.MeshStandardMaterial({ color: f.band, roughness: 0.8 }));

    // Arms: separate meshes posed every frame by IK (children of the torso).
    this.arms = [];
    for (const side of [1, -1]) {
      const upper = mk(cached(`${key}:upper`, () => upperArmGeo(f)));
      const fore = mk(cached(`${key}:fore:${side}`, () => foreArmGeo(f, side < 0)));
      this.torso.add(upper, fore);
      const arm = { side, upper, fore, shoulder: new THREE.Vector3(0.205 * side, 0.5, 0) };
      if (side < 0) {
        const b = band.clone();
        b.position.y = -0.09;
        upper.add(b);
      }
      this.arms.push(arm);
    }

    // Weapon.
    const def = WEAPONS[weaponId] ?? WEAPONS.vx4;
    const baked = bakedGun(weaponId);
    this.pistol = def.class === 'pistol';
    this.gunPivot = new THREE.Group();
    this.gunPivot.position.set(this.pistol ? 0.03 : 0.1, this.pistol ? 0.4 : 0.42, this.pistol ? -0.4 : -0.3);
    this.torso.add(this.gunPivot);
    this.gun = new THREE.Mesh(baked.geo, gunMaterial());
    this.gun.castShadow = true;
    this.gunPivot.add(this.gun);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.copy(baked.muzzle);
    this.gunPivot.add(this.muzzle);
    this.gripR = baked.right.clone();
    this.gripL = this.pistol ? new THREE.Vector3(-0.02, -0.05, 0.02) : baked.left.clone().add(new THREE.Vector3(0, -0.01, 0));

    // Legs.
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.1, 0, 0);
      this.hips.add(thigh);
      thigh.add(mk(cached(`${key}:thigh:${side}:${v.holster}:${v.legPouch}`, () => thighGeo(f, side > 0, v))));
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      thigh.add(shin);
      shin.add(mk(cached(`${key}:shin`, () => shinGeo(f))));
      this.legs.push({ thigh, shin, side });
    }

    this.phase = rng() * 6;
    this.crouch = 0;
    this.flinch = 0;
    this.dead = false;
    this.deathT = 0;
    this.deathDir = 1;
    this.aimPitch = 0;
    this.lowReady = 0;
    this.breath = rng() * 6;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  setThermal(on) {
    if (on === this._thermal) return;
    this._thermal = on;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) { o.userData.mat = o.material; o.material = THERMAL_MAT; } else if (o.userData.mat) o.material = o.userData.mat;
    });
  }

  hit() { this.flinch = 1; }

  die(fromDir) {
    this.dead = true;
    this.deathT = 0;
    this.deathSide = (Math.random() - 0.5) * 0.8;
    this.deathDir = fromDir ?? 1;
  }

  /** Two-bone IK: shoulder -> elbow -> hand, with the elbow pushed down and out. */
  _solveArm(arm, hand) {
    const a = 0.29, b = 0.29;
    const S = arm.shoulder;
    const d = this._a.subVectors(hand, S);
    let len = d.length();
    const u = d.divideScalar(Math.max(1e-4, len));
    len = clamp(len, 0.08, a + b - 0.002);
    const target = this._b.copy(S).addScaledVector(u, len);
    const x = (a * a - b * b + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const pole = this._c.set(arm.side * 0.75, -1, 0.25).normalize();
    pole.addScaledVector(u, -pole.dot(u)).normalize();
    const elbow = this._d.copy(S).addScaledVector(u, x).addScaledVector(pole, h);
    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(DOWN, this._c.subVectors(elbow, S).normalize());
    arm.fore.position.copy(elbow);
    arm.fore.quaternion.setFromUnitVectors(DOWN, this._c.subVectors(target, elbow).normalize());
  }

  _poseArms() {
    this.gunPivot.updateMatrix();
    const rh = this._d.copy(this.gripR).applyMatrix4(this.gunPivot.matrix).clone();
    const lh = this._d.copy(this.gripL).applyMatrix4(this.gunPivot.matrix).clone();
    this._solveArm(this.arms[0], rh);
    this._solveArm(this.arms[1], lh);
  }

  /** speed: horizontal m/s, crouch: 0..1, pitch: aim pitch (rad), firing: bool. */
  update(dt, speed, crouch, pitch, firing) {
    if (this.dead) {
      this.deathT += dt;
      const t = clamp(this.deathT / 0.75, 0, 1);
      const e = t * t;
      // Knees buckle first, then the body topples.
      this.body.rotation.x = this.deathDir * e * (Math.PI / 2 - 0.08);
      this.body.rotation.z = this.deathSide * e;
      this.body.position.y = -e * 0.05;
      this.hips.position.y = damp(this.hips.position.y, 0.72, 5, dt);
      for (const l of this.legs) {
        l.thigh.rotation.x = damp(l.thigh.rotation.x, (this.deathDir < 0 ? 0.9 : 0.35) + 0.2 * l.side, 5, dt);
        l.shin.rotation.x = damp(l.shin.rotation.x, this.deathDir < 0 ? -1.3 : -0.5, 5, dt);
      }
      this.torso.rotation.x = damp(this.torso.rotation.x, -this.deathDir * 0.3, 4, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -this.deathDir * 0.5, 4, dt);
      this.gunPivot.rotation.x = damp(this.gunPivot.rotation.x, -this.deathDir * 1.2, 5, dt);
      this.gunPivot.rotation.z = damp(this.gunPivot.rotation.z, 0.6, 4, dt);
      this.gunPivot.position.y = damp(this.gunPivot.position.y, 0.2, 4, dt);
      this._poseArms();
      return;
    }
    this.crouch = damp(this.crouch, crouch, 10, dt);
    const c = this.crouch;
    const moving = speed > 0.2;
    const run = clamp((speed - 2.5) / 3, 0, 1);
    this.phase += dt * (moving ? 2.2 + speed * 1.55 : 0);
    const amp = moving ? clamp(speed / 5, 0.32, 0.85) * (1 - c * 0.45) : 0;
    for (const l of this.legs) {
      const ph = l.side > 0 ? 0 : Math.PI;
      const sw = Math.sin(this.phase + ph) * amp;
      const bend = Math.max(0, Math.sin(this.phase + ph + Math.PI / 2)) * amp * (1.2 + run * 0.6);
      l.thigh.rotation.x = damp(l.thigh.rotation.x, sw + c * 1.15, 14, dt);
      l.shin.rotation.x = damp(l.shin.rotation.x, -bend - c * 1.95 - (moving ? 0.08 : 0), 14, dt);
      l.thigh.rotation.z = damp(l.thigh.rotation.z, -l.side * 0.03, 8, dt);
    }
    const s = Math.sin(this.phase);
    const bob = moving ? Math.abs(s) * (0.03 + run * 0.03) : 0;
    this.breath += dt;
    this.hips.position.y = 0.95 - c * 0.42 + bob;
    this.hips.rotation.y = moving ? Math.sin(this.phase) * 0.08 * amp : 0;
    this.flinch = Math.max(0, this.flinch - dt * 5);
    // Lean into a run, hunch when crouched, breathe at rest.
    const lean = -c * 0.22 + (moving ? 0.08 + run * 0.14 : 0) + this.flinch * 0.35 + Math.sin(this.breath * 1.7) * 0.012;
    this.torso.rotation.x = damp(this.torso.rotation.x, lean, 10, dt);
    this.torso.rotation.y = -this.hips.rotation.y * 0.8;
    // Weapon: aim when engaged, carry at low ready when moving without firing.
    this.lowReady = damp(this.lowReady, moving && !firing && Math.abs(pitch) < 0.01 ? 1 : 0, 5, dt);
    this.aimPitch = damp(this.aimPitch, pitch, 10, dt);
    this.gunPivot.rotation.x = this.aimPitch - this.torso.rotation.x - this.lowReady * 0.55;
    this.gunPivot.rotation.y = this.lowReady * 0.35;
    this.gunPivot.rotation.z = damp(this.gunPivot.rotation.z, 0, 8, dt);
    this.gunPivot.position.y = damp(this.gunPivot.position.y, (this.pistol ? 0.4 : 0.42) - this.lowReady * 0.06, 8, dt);
    this.head.rotation.x = this.aimPitch * 0.6 - this.torso.rotation.x * 0.5;
    this.head.rotation.y = this.torso.rotation.y * -0.5;
    this.gun.position.z = firing ? 0.025 : damp(this.gun.position.z, 0, 20, dt);
    this._poseArms();
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const THERMAL_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
