// Third-person soldier model. Each body segment (pelvis, torso, head, arms, legs) is
// one merged geometry with vertex colours in two material groups (camouflage fabric
// and plain gear/skin), so a detailed soldier costs about a dozen draw calls.
// Arms use two-bone IK so both hands stay on the weapon; legs use a procedural gait.
import * as THREE from '../lib/three.js';
import { getTexture, getSpriteTexture } from '../world/Textures.js';
import { WEAPONS, resolveAttachments } from '../weapons/WeaponData.js';
import { buildWeaponModel } from '../weapons/WeaponModel.js';
import { damp, clamp, makeRng } from '../core/Utils.js';
import { SoldierRig, soldierSkinReady, soldierDims, PAINT } from './SoldierSkin.js';

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
  civilian: {
    fabric: 0x5d6673, pants: 0x2c313a, vest: 0x5d6673, gear: 0x515a66, helmet: 0x5d6673, boots: 0x2a2421,
    gloves: 0xb58a6a, mask: 'none', headgear: ['none'], band: 0x5d6673, civilian: true, // plain clothes: no carrier, pouches or kit
  },
  suit: {
    fabric: 0x34373e, pants: 0x26282d, vest: 0x34373e, gear: 0x2b2d33, helmet: 0x34373e, boots: 0x1a1513,
    gloves: 0xc29a7a, mask: 'none', headgear: ['none'], band: 0x34373e, civilian: true, // dark business suit
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
  sphere(rad, color, mat, p, s, r, ws, hs) {
    ws ??= rad < 0.03 ? 8 : rad < 0.09 ? 10 : 12;
    hs ??= Math.round(ws * 0.72);
    return this.add(new THREE.SphereGeometry(rad, ws, hs), color, mat, p, r, s, rad / 0.15);
  }
  cyl(r1, r2, h, color, mat, p, r, s, seg = 10) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), color, mat, p, r, s, h / 0.35); }
  capsule(rad, len, color, mat, p, r, s) { return this.add(new THREE.CapsuleGeometry(rad, len, 5, 12), color, mat, p, r, s, (len + rad * 2) / 0.35); }
  /** Box with rounded edges and corners (radius rad). */
  rbox(w, h, d, rad, color, mat, p, r, s) {
    const m = Math.max(w, h, d);
    // Two bend segments only on large, chunky pieces; thin straps and pouches get one.
    const seg = m > 0.25 && Math.min(w, h, d) > 0.08 ? 2 : 1;
    return this.add(roundedBoxGeo(w, h, d, rad, seg), color, mat, p, r, s, m / 0.35);
  }
  /** Surface of revolution around +Y from a [radius, y] profile (bottom to top, closed with radius 0 at both ends). */
  lathe(profile, color, mat, p, r, s, seg = 14) {
    const pts = profile.map(([rad, y]) => new THREE.Vector2(rad, y));
    const h = profile[profile.length - 1][1] - profile[0][1];
    return this.add(new THREE.LatheGeometry(pts, seg), color, mat, p, r, s, h / 0.35);
  }

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

/** Rounded box: a subdivided box whose edge bands are bent around radius `r`. */
function roundedBoxGeo(w, h, d, r, seg = 2) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  r = Math.max(0.0005, Math.min(r, hx - 1e-4, hy - 1e-4, hz - 1e-4));
  const n = seg * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const P = g.attributes.position, N = g.attributes.normal;
  const map = (t, half) => {
    const u = Math.round((t + 0.5) * n);
    if (u <= seg) return -half + r * (u / seg);
    if (u >= seg + 1) return half - r + r * ((u - seg - 1) / seg);
    return 0;
  };
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), off = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.set(map(P.getX(i), hx), map(P.getY(i), hy), map(P.getZ(i), hz));
    inner.set(clamp(v.x, -hx + r, hx - r), clamp(v.y, -hy + r, hy - r), clamp(v.z, -hz + r, hz - r));
    off.subVectors(v, inner);
    if (off.lengthSq() < 1e-12) off.set(N.getX(i), N.getY(i), N.getZ(i));
    off.normalize();
    v.copy(inner).addScaledVector(off, r);
    P.setXYZ(i, v.x, v.y, v.z);
    N.setXYZ(i, off.x, off.y, off.z);
  }
  return g;
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
  p.sphere(0.16, f.pants, FABRIC, [0, 0.035, 0], [1.08, 0.74, 0.8], [0, 0, 0], 14, 10); // hips
  p.sphere(0.085, f.pants, FABRIC, [-0.072, -0.005, 0.05], [1, 1, 0.9]); // seat
  p.sphere(0.085, f.pants, FABRIC, [0.072, -0.005, 0.05], [1, 1, 0.9]);
  p.add(new THREE.TorusGeometry(0.163, 0.026, 6, 20), f.gear, PLAIN, [0, 0.125, 0], [Math.PI / 2, 0, 0], [1.06, 0.82, 1.35], 2); // war belt
  p.rbox(0.07, 0.09, 0.05, 0.016, f.gear, PLAIN, [-0.13, 0.085, -0.115]); // belt pouches
  p.rbox(0.07, 0.09, 0.05, 0.016, f.gear, PLAIN, [0.13, 0.085, -0.115]);
  p.rbox(0.1, 0.1, 0.055, 0.022, f.gear, PLAIN, [0, 0.07, 0.135]); // dump pouch
  return p.build();
}

/** Torso: pivot at the hips; shoulders at y≈0.5. */
function torsoGeo(f, v) {
  const p = new Parts();
  // Body: a tapered, elliptical surface of revolution (waist -> ribcage -> shoulders -> neck).
  const bodyProfile = [[0, 0], [0.118, 0.012], [0.138, 0.06], [0.134, 0.15], [0.143, 0.25], [0.163, 0.35], [0.174, 0.43], [0.168, 0.49], [0.13, 0.545], [0.07, 0.585], [0, 0.6]];
  if (f.heavy) {
    p.lathe(bodyProfile, f.fabric, FABRIC, [0, 0, 0], [0, 0, 0], [1.32, 1, 1]);
    p.lathe([[0, 0.05], [0.2, 0.07], [0.215, 0.2], [0.225, 0.4], [0.215, 0.52], [0.15, 0.6], [0, 0.62]], f.vest, PLAIN, [0, 0, 0], [0, 0, 0], [1.25, 1, 1.05], 18); // bomb-suit
    p.rbox(0.34, 0.3, 0.09, 0.04, f.gear, PLAIN, [0, 0.36, -0.22]); // chest plate
    p.rbox(0.36, 0.16, 0.1, 0.045, f.gear, PLAIN, [0, 0.12, -0.2]);
    p.lathe([[0, 0.56], [0.16, 0.57], [0.18, 0.62], [0.16, 0.68], [0, 0.69]], f.vest, PLAIN, [0, 0, 0], [0, 0, 0], [1, 1, 1], 16); // armoured collar
    p.sphere(0.12, f.vest, PLAIN, [-0.27, 0.52, 0], [1, 0.8, 1.1], [0, 0, 0], 14, 10); // pauldrons
    p.sphere(0.12, f.vest, PLAIN, [0.27, 0.52, 0], [1, 0.8, 1.1], [0, 0, 0], 14, 10);
    return p.build();
  }
  p.lathe(bodyProfile, f.fabric, FABRIC, [0, 0, 0], [0, 0, 0], [1.22, 1, 0.8], 16);
  p.sphere(0.074, f.fabric, FABRIC, [-0.2, 0.495, 0], [1, 0.95, 1.05], [0, 0, 0], 10, 8); // deltoids
  p.sphere(0.074, f.fabric, FABRIC, [0.2, 0.495, 0], [1, 0.95, 1.05], [0, 0, 0], 10, 8);
  if (!f.civilian) {
    // Plate carrier: a padded shell around the ribcage with soft-edged plates front and back.
    p.lathe([[0, 0.19], [0.158, 0.2], [0.172, 0.24], [0.181, 0.34], [0.19, 0.43], [0.184, 0.495], [0.12, 0.528], [0, 0.534]], f.vest, PLAIN, [0, 0, 0], [0, 0, 0], [1.2, 1, 0.93], 16);
    p.rbox(0.3, 0.29, 0.05, 0.022, f.vest, PLAIN, [0, 0.37, -0.15]);
    p.rbox(0.3, 0.31, 0.05, 0.022, f.vest, PLAIN, [0, 0.38, 0.145]);
    p.rbox(0.07, 0.04, 0.3, 0.018, f.vest, PLAIN, [-0.1, 0.528, 0]); // shoulder straps
    p.rbox(0.07, 0.04, 0.3, 0.018, f.vest, PLAIN, [0.1, 0.528, 0]);
    // Triple mag pouch + admin pouch.
    for (const x of [-0.09, 0, 0.09]) {
      p.rbox(0.08, 0.11, 0.055, 0.016, f.gear, PLAIN, [x, 0.285, -0.2]);
      p.rbox(0.03, 0.03, 0.05, 0.009, 0x1d1e20, PLAIN, [x, 0.35, -0.2]); // magazine baseplate
    }
    p.rbox(0.2, 0.08, 0.035, 0.013, f.gear, PLAIN, [0, 0.43, -0.19]);
    // Side pouches.
    p.rbox(0.06, 0.12, 0.09, 0.018, f.gear, PLAIN, [-0.215, 0.27, 0.02]);
    p.rbox(0.06, 0.1, 0.08, 0.018, f.gear, PLAIN, [0.215, 0.27, 0.04]);
    if (v.radio) {
      p.rbox(0.07, 0.15, 0.06, 0.016, f.gear, PLAIN, [-0.12, 0.42, 0.19]);
      p.cyl(0.006, 0.004, 0.42, 0x111111, PLAIN, [-0.13, 0.68, 0.2], [0.15, 0, 0.1], [1, 1, 1], 5); // antenna
    }
    if (v.pack) {
      p.rbox(0.3, 0.34, 0.15, 0.05, f.gear, PLAIN, [0, 0.36, 0.245]);
      p.rbox(0.28, 0.09, 0.16, 0.04, f.vest, PLAIN, [0, 0.55, 0.245]);
    }
  }
  // Neck.
  const neckCol = f.mask === 'balaclava' ? f.maskColor : f.mask === 'shemagh' ? f.scarf : v.skin;
  p.lathe([[0, 0.55], [0.062, 0.56], [0.054, 0.6], [0.05, 0.65], [0, 0.66]], neckCol, f.mask === 'none' ? PLAIN : FABRIC, [0, 0, 0], [0, 0, 0], [1, 1, 1.05], 12);
  if (f.mask === 'shemagh') p.add(new THREE.TorusGeometry(0.068, 0.03, 8, 16), f.scarf, FABRIC, [0, 0.585, 0], [Math.PI / 2, 0, 0], [1.05, 1, 1.1], 1);
  return p.build();
}

/** Head: pivot at the base of the neck (y=0 at torso y≈0.63). */
function headGeo(f, v) {
  const p = new Parts();
  const masked = f.mask === 'balaclava';
  const headCol = masked ? f.maskColor : v.skin;
  const headMat = masked ? FABRIC : PLAIN;
  if (f.heavy || v.headgear === 'juggernaut') {
    p.sphere(0.155, f.helmet, PLAIN, [0, 0.12, 0], [1, 1.08, 1.08], [0, 0, 0], 18, 14);
    p.rbox(0.2, 0.09, 0.08, 0.035, f.gear, PLAIN, [0, 0.07, -0.12]); // chin guard
    return p.build();
  }
  // Skull, jaw and face.
  p.sphere(0.102, headCol, headMat, [0, 0.11, 0.005], [0.94, 1.1, 1.04], [0, 0, 0], 14, 11);
  p.sphere(0.07, headCol, headMat, [0, 0.045, -0.03], [0.95, 0.72, 1.0], [0, 0, 0], 12, 8); // jaw
  p.sphere(0.016, v.skin, PLAIN, [0, 0.087, -0.104], [0.85, 1.5, 1.15]); // nose
  p.sphere(0.022, v.skin, PLAIN, [-0.098, 0.1, 0], [0.5, 1.1, 0.8]); // ears
  p.sphere(0.022, v.skin, PLAIN, [0.098, 0.1, 0], [0.5, 1.1, 0.8]);
  if (masked) p.rbox(0.12, 0.04, 0.03, 0.013, v.skin, PLAIN, [0, 0.118, -0.093]); // eye opening
  if (f.mask === 'shemagh') {
    p.sphere(0.085, f.scarf, FABRIC, [0, 0.04, -0.02], [1, 0.62, 1.02]); // face wrap
    p.sphere(0.11, f.scarf, FABRIC, [0, 0.14, 0.01], [1, 0.75, 1.05]);
  }
  // Eyes or ballistic glasses.
  if (v.glasses) p.rbox(0.16, 0.034, 0.025, 0.011, 0x0c0d0e, PLAIN, [0, 0.118, -0.103]);
  else {
    p.sphere(0.009, 0x15130f, PLAIN, [-0.033, 0.12, -0.096], [1.3, 0.8, 1], [0, 0, 0], 8, 6);
    p.sphere(0.009, 0x15130f, PLAIN, [0.033, 0.12, -0.096], [1.3, 0.8, 1], [0, 0, 0], 8, 6);
  }
  // Headgear.
  switch (v.headgear) {
    case 'helmet':
      p.sphere(0.128, f.helmet, PLAIN, [0, 0.14, 0.006], [1.06, 0.88, 1.13], [0, 0, 0], 16, 9);
      p.add(new THREE.SphereGeometry(0.128, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), f.helmet, PLAIN, [0, 0.135, 0.006], [0, 0, 0], [1.07, 0.92, 1.14]);
      p.rbox(0.018, 0.028, 0.15, 0.007, f.gear, PLAIN, [-0.132, 0.125, 0.01]); // ARC rails
      p.rbox(0.018, 0.028, 0.15, 0.007, f.gear, PLAIN, [0.132, 0.125, 0.01]);
      p.rbox(0.055, 0.04, 0.035, 0.012, 0x1a1a1a, PLAIN, [0, 0.205, -0.128]); // NVG shroud
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [-0.115, 0.085, 0], [0, 0, Math.PI / 2], [1, 1, 1], 14); // headset cups
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [0.115, 0.085, 0], [0, 0, Math.PI / 2], [1, 1, 1], 14);
      p.rbox(0.07, 0.035, 0.04, 0.012, f.gear, PLAIN, [0, 0.21, 0.12]); // counterweight pouch
      break;
    case 'cap':
      p.add(new THREE.SphereGeometry(0.11, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), f.fabric, FABRIC, [0, 0.135, 0.005], [0, 0, 0], [1, 0.8, 1.08]);
      p.rbox(0.15, 0.012, 0.08, 0.005, f.fabric, FABRIC, [0, 0.138, -0.125], [-0.15, 0, 0]);
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [-0.11, 0.09, 0], [0, 0, Math.PI / 2], [1, 1, 1], 14);
      p.cyl(0.045, 0.045, 0.03, f.gear, PLAIN, [0.11, 0.09, 0], [0, 0, Math.PI / 2], [1, 1, 1], 14);
      break;
    case 'boonie':
      p.lathe([[0, 0.152], [0.18, 0.15], [0.185, 0.158], [0.11, 0.17], [0.112, 0.235], [0, 0.24]], f.fabric, FABRIC, [0, 0, 0], [0, 0, 0], [1, 1, 1], 18);
      break;
    case 'beanie':
      p.add(new THREE.SphereGeometry(0.113, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), f.gear, FABRIC, [0, 0.13, 0.005], [0, 0, 0], [1, 1, 1.06]);
      break;
    default:
      break;
  }
  return p.build();
}

/** Upper arm: pivot at the shoulder, hangs along -Y (length 0.32). */
function upperArmGeo(f) {
  const p = new Parts();
  // Deltoid -> biceps -> elbow taper.
  p.lathe([[0, -0.345], [0.04, -0.335], [0.046, -0.3], [0.05, -0.24], [0.056, -0.16], [0.058, -0.09], [0.061, -0.035], [0.05, 0.018], [0, 0.034]], f.fabric, FABRIC, [0, 0, 0], [0, 0, 0], [1, 1, 1.04], 12);
  p.rbox(0.07, 0.07, 0.03, 0.013, f.gear, PLAIN, [0.0, -0.1, -0.048]); // sleeve pocket
  if (f.heavy) p.sphere(0.08, f.vest, PLAIN, [0, -0.12, 0], [1, 1.5, 1]);
  return p.build();
}

/** Forearm + hand: pivot at the elbow; palm centred at -0.31. */
function foreArmGeo(f, left) {
  const p = new Parts();
  p.lathe([[0, -0.255], [0.036, -0.245], [0.04, -0.215], [0.046, -0.14], [0.051, -0.075], [0.049, -0.015], [0.036, 0.022], [0, 0.03]], f.fabric, FABRIC, [0, 0, 0], [0, 0, 0], [1, 1, 0.9], 12);
  p.lathe([[0, -0.255], [0.046, -0.252], [0.048, -0.225], [0, -0.215]], f.fabric, FABRIC, [0, 0, 0], [0, 0, 0], [1, 1, 0.92], 12); // cuff
  p.rbox(0.068, 0.085, 0.04, 0.017, f.gloves, PLAIN, [0, -0.3, 0]); // palm
  p.rbox(0.062, 0.05, 0.03, 0.013, f.gloves, PLAIN, [0, -0.354, -0.012], [0.5, 0, 0]); // curled fingers
  p.add(new THREE.CapsuleGeometry(0.011, 0.03, 2, 6), f.gloves, PLAIN, [left ? 0.038 : -0.038, -0.29, -0.022], [0.3, 0, 0]); // thumb
  if (f.heavy) p.sphere(0.065, f.vest, PLAIN, [0, -0.11, 0], [1, 1.6, 1]);
  return p.build();
}

/** Thigh: pivot at the hip joint (length 0.46). */
function thighGeo(f, right, v) {
  const p = new Parts();
  p.lathe([[0, -0.49], [0.054, -0.475], [0.064, -0.43], [0.072, -0.36], [0.083, -0.24], [0.09, -0.12], [0.092, -0.04], [0.08, 0.03], [0.05, 0.062], [0, 0.07]], f.pants, FABRIC, [0, 0, 0], [0, 0, 0], [1, 1, 1.06], 14);
  p.rbox(0.03, 0.12, 0.1, 0.012, f.pants, FABRIC, [right ? 0.082 : -0.082, -0.22, 0]); // cargo pocket
  if (right && v.holster) p.rbox(0.06, 0.18, 0.1, 0.02, f.gear, PLAIN, [0.1, -0.17, 0]); // drop holster
  if (!right && v.legPouch) p.rbox(0.05, 0.12, 0.09, 0.018, f.gear, PLAIN, [-0.1, -0.2, 0.01]);
  if (f.heavy) p.lathe([[0, -0.37], [0.105, -0.35], [0.11, -0.1], [0.1, 0.0], [0, 0.02]], f.vest, PLAIN, [0, 0, -0.01], [0, 0, 0], [1, 1, 1], 14);
  return p.build();
}

/** Shin + boot: pivot at the knee (length 0.46 to sole). */
function shinGeo(f) {
  const p = new Parts();
  p.sphere(0.068, f.pants, FABRIC, [0, 0.0, 0.004], [1, 1.1, 1]); // knee
  // Calf bulge tapering into the ankle.
  p.lathe([[0, -0.375], [0.048, -0.36], [0.05, -0.3], [0.058, -0.2], [0.066, -0.12], [0.066, -0.05], [0.062, 0.0], [0.04, 0.035], [0, 0.04]], f.pants, FABRIC, [0, 0, 0], [0, 0, 0], [1, 1, 1.08], 14);
  p.sphere(0.06, f.gear, PLAIN, [0, -0.03, -0.055], [1, 1.25, 0.55]); // knee pad
  p.rbox(0.112, 0.14, 0.165, 0.042, f.boots, PLAIN, [0, -0.385, -0.012]); // boot upper
  p.rbox(0.112, 0.072, 0.27, 0.033, f.boots, PLAIN, [0, -0.424, -0.045]); // foot
  p.rbox(0.118, 0.026, 0.282, 0.011, 0x111111, PLAIN, [0, -0.452, -0.045]); // sole
  if (f.heavy) p.lathe([[0, -0.33], [0.085, -0.32], [0.09, -0.12], [0.08, 0.02], [0, 0.04]], f.vest, PLAIN, [0, 0, -0.01], [0, 0, 0], [1, 1, 1], 14);
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
  const pm = new Parts();
  const inMag = (o) => { for (let q = o; q; q = q.parent) if (q === info.mag) return true; return false; };
  const toMag = new THREE.Matrix4().makeTranslation(-info.magHome.x, -info.magHome.y, -info.magHome.z);
  info.group.traverse((o) => {
    if (!o.isMesh || o.material.transparent || o.material.isMeshBasicMaterial) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (inMag(o) && def.class !== 'shotgun') pm.add(g.applyMatrix4(toMag), o.material.color.getHex(), PLAIN);
    else p.add(g, o.material.color.getHex(), PLAIN);
  });
  const geo = p.build();
  geo.computeBoundingBox();
  const entry = {
    geo,
    magGeo: pm.list.length ? pm.build() : null,
    magHome: info.magHome.clone(),
    magGrip: info.magGrip.clone(),
    sightY: info.sightY,
    ejection: info.ejection.clone(),
    stockZ: geo.boundingBox.max.z,
    muzzle: info.muzzle.position.clone(),
    left: info.leftHand.clone(),
    right: info.rightHand ? info.rightHand.clone() : new THREE.Vector3(0, -0.04, 0.03),
  };
  gunCache.set(weaponId, entry);
  return entry;
}

export function gunMaterial() {
  if (!gunMat) gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 });
  return gunMat;
}

/** Detailed weapon mesh (third person, pickups). */
export function buildLowGun(weaponId) {
  const b = bakedGun(weaponId);
  const m = new THREE.Mesh(b.geo, gunMaterial());
  m.castShadow = true;
  if (b.magGeo) {
    const mag = new THREE.Mesh(b.magGeo, gunMaterial());
    mag.position.copy(b.magHome);
    m.add(mag);
  }
  return m;
}

// ---------------------------------------------------------------------------

const DOWN = new THREE.Vector3(0, -1, 0);
// Joint layout of the procedural body (metres). Soldiers wearing the detailed
// skinned model run the same rig with that model's proportions instead.
const PROC_DIM = {
  hipH: 0.95, torso: new THREE.Vector3(0, 0.08, 0), shoulder: new THREE.Vector3(0.205, 0.5, 0), neck: new THREE.Vector3(0, 0.63, 0),
  armA: 0.32, armB: 0.31, legX: 0.1, thigh: 0.46, shin: 0.465, shinA: 0.34, ankleH: 0.125,
};
const NO_SHIFT = new THREE.Vector3();
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const tmpM2 = new THREE.Matrix4();
const tmpM3 = new THREE.Matrix4();
const tmpQ2 = new THREE.Quaternion();
const tmpQ3 = new THREE.Quaternion();
const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpS1 = new THREE.Vector3();
const tmpEu = new THREE.Euler();
const POUCH = new THREE.Vector3(-0.07, 0.31, -0.25); // torso-local: front mag pouch
const BELT = new THREE.Vector3(-0.17, 0.12, -0.12); // torso-local: shell caddy
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));

/** Paint for a skinned soldier, or null when this one stays procedural. */
function skinPaint(faction, f, opts) {
  if (opts.procedural || f.civilian || f.heavy || !soldierSkinReady()) return null;
  if (opts.colorIndex !== undefined) {
    const c = new THREE.Color(FFA_COLORS[opts.colorIndex % FFA_COLORS.length]);
    const tone = (k) => c.clone().multiplyScalar(k).getHex();
    return { key: `ffa${opts.colorIndex % FFA_COLORS.length}`, camo: [tone(1), tone(0.8), tone(1.15), tone(0.6)], gear: tone(0.45) };
  }
  const p = PAINT[faction];
  return p ? { key: faction, ...p } : null;
}

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
    const paint = skinPaint(faction, f, opts);
    const D = paint ? soldierDims() : null;
    const dim = this.dim = D ? { ...PROC_DIM, ...D } : PROC_DIM;
    // Torso-local poses (gun carry, reload, captive hands) were laid out for the
    // procedural shoulders; move them with the skinned model's shoulders.
    this.shift = D ? new THREE.Vector3(D.shoulder.x - 0.205, D.shoulder.y - 0.5, Math.min(D.shoulder.z, 0.03)) : NO_SHIFT;
    this.pouch = POUCH.clone().add(this.shift);
    this.belt = BELT.clone().add(this.shift);
    const mats = materials();
    const procMeshes = [];
    const mk = (geo) => {
      const m = new THREE.Mesh(geo, mats);
      m.castShadow = true;
      procMeshes.push(m);
      return m;
    };

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    if (f.heavy) this.body.scale.setScalar(1.12);
    this.root.add(this.body);

    this.hips = new THREE.Group();
    this.hips.position.y = dim.hipH;
    this.body.add(this.hips);
    this.hips.add(mk(cached(`${key}:pelvis`, () => pelvisGeo(f))));

    this.torso = new THREE.Group();
    this.torso.position.copy(dim.torso);
    this.hips.add(this.torso);
    this.torso.add(mk(cached(`${key}:torso:${v.pack}:${v.radio}:${v.skin}`, () => torsoGeo(f, v))));

    this.head = new THREE.Group();
    this.head.position.copy(dim.neck);
    this.torso.add(this.head);
    this.head.add(mk(cached(`${key}:head:${v.headgear}:${v.skin}:${v.glasses}`, () => headGeo(f, v))));
    if (f.heavy) {
      const visor = new THREE.Mesh(roundedBoxGeo(0.17, 0.035, 0.03, 0.012), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1810, emissiveIntensity: 2.4 }));
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
      const arm = { side, upper, fore, shoulder: new THREE.Vector3(dim.shoulder.x * side, dim.shoulder.y, dim.shoulder.z), target: new THREE.Vector3() };
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
    this.gunPivot.position.set(this.pistol ? 0.03 : 0.1, this.pistol ? 0.4 : 0.42, this.pistol ? -0.4 : -0.3).add(this.shift);
    this.torso.add(this.gunPivot);
    this.gun = new THREE.Mesh(baked.geo, gunMaterial());
    this.gun.castShadow = true;
    this.gunPivot.add(this.gun);
    // Magazine: a child of the gun so it can be pulled out and swapped during reloads.
    this.magHome = baked.magHome.clone();
    this.magGrip = baked.magGrip.clone();
    this.mag = null;
    if (baked.magGeo) {
      this.mag = new THREE.Mesh(baked.magGeo, gunMaterial());
      this.mag.castShadow = true;
      this.mag.position.copy(this.magHome);
      this.gun.add(this.mag);
    }
    this.ejection = baked.ejection.clone();
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.copy(baked.muzzle);
    this.gunPivot.add(this.muzzle);
    this.gripR = baked.right.clone();
    this.gripL = this.pistol ? new THREE.Vector3(-0.02, -0.05, 0.02) : baked.left.clone().add(new THREE.Vector3(0, -0.01, 0));
    this.weaponClass = def.class;
    // Hip / ready carry (torso-local) and the shouldered aiming position (body frame at
    // shoulder height): the butt sits in the right shoulder pocket, torso bladed.
    this.hipPos = this.gunPivot.position.clone();
    this.aimOff = (this.pistol ? new THREE.Vector3(0.0, 0.52, -0.46) : new THREE.Vector3(0.11, 0.555, -Math.max(0.22, baked.stockZ) + 0.01)).add(this.shift);
    this.blade = this.pistol ? 0.1 : 0.5;
    this.kickPow = def.class === 'sniper' ? 1.9 : def.class === 'shotgun' ? 1.7 : def.class === 'lmg' ? 1.2 : def.class === 'pistol' ? 1.3 : 1;
    this.aimBlend = 0;
    this.kick = 0;
    this.cycleT = -1;
    this.cycleKind = null;
    this.cycleDelay = 0;
    this.rl = null; // active reload
    this.reloadBlend = 0;
    this.onMagDrop = null; // (geometry, material, worldMatrix) => void
    this.flinchSide = 0;
    this.deathStyle = 'topple';
    // Scope glint: snipers aiming at the player flash a reflection off the objective lens.
    this.glint = null;
    if (def.class === 'sniper' || def.class === 'marksman') {
      this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSpriteTexture('flash'), color: 0xfff4dc, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0 }));
      this.glint.position.set(0, baked.sightY ?? 0.09, -0.22);
      this.glint.visible = false;
      this.gunPivot.add(this.glint);
    }
    this._gp = new THREE.Vector3();
    this._gq = new THREE.Quaternion();

    // Legs.
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * dim.legX, 0, 0);
      this.hips.add(thigh);
      thigh.add(mk(cached(`${key}:thigh:${side}:${v.holster}:${v.legPouch}`, () => thighGeo(f, side > 0, v))));
      const shin = new THREE.Group();
      shin.position.y = -dim.thigh;
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

    // Detailed skinned body driven by the rig above (the procedural meshes hide).
    this.rig = null;
    if (paint) {
      this.rig = new SoldierRig(paint.key, paint, SKIN.indexOf(v.skin), Math.floor(rng() * 1e9));
      // Men come in different builds.
      this.body.scale.setScalar(0.96 + rng() * 0.08);
      this.body.add(this.rig.root);
      for (const m of procMeshes) m.visible = false;
    }
  }

  setThermal(on) {
    if (on === this._thermal) return;
    this._thermal = on;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) { o.userData.mat = o.material; o.material = THERMAL_MAT; } else if (o.userData.mat) o.material = o.userData.mat;
    });
  }

  /** side: -1 hit from the left, 1 from the right, 0 front/back. */
  hit(side = 0) {
    this.flinch = 1;
    this.flinchSide = side;
  }

  die(fromDir, o = {}) {
    this.dead = true;
    this.deathT = 0;
    this.deathSide = (Math.random() - 0.5) * 0.8;
    this.deathDir = fromDir ?? 1;
    // Headshots drop on the spot; other hits topple away or twist and fall sideways.
    this.deathStyle = o.head ? 'crumple' : Math.random() < 0.35 ? 'twist' : 'topple';
    this.twist = (Math.random() < 0.5 ? -1 : 1);
    this.rl = null;
    this.cycleT = -1;
    if (this.glint) this.glint.visible = false;
  }

  /** Recoil impulse for one shot. */
  fire() {
    this.kick = 1;
  }

  /** Work the action after a shot: 'bolt' (right hand) or 'pump' (left hand). */
  cycle(kind) {
    this.cycleKind = kind;
    this.cycleDelay = kind === 'bolt' ? 0.22 : 0.08;
    this.cycleT = 0;
  }

  /** Visible magazine change. o: { empty, drop, shells }. */
  reload(dur, o = {}) {
    if (this.dead) return;
    this.rl = { t: 0, dur: Math.max(0.5, dur), empty: !!o.empty, drop: !!o.drop && !!this.mag, shells: !!o.shells, released: false };
  }

  get reloading() { return !!this.rl; }

  /** Show the scope glint (0..1) as seen from `dist` metres. */
  setGlint(k, dist, t) {
    if (!this.glint) return;
    const on = k > 0.02 && !this.dead;
    this.glint.visible = on;
    if (!on) return;
    const pulse = 0.75 + 0.25 * Math.sin(t * 9);
    this.glint.material.opacity = k * pulse;
    this.glint.scale.setScalar(0.2 + dist * 0.02);
  }

  muzzleDir(out) {
    this.gunPivot.updateWorldMatrix(true, false);
    return out.set(0, 0, -1).transformDirection(this.gunPivot.matrixWorld);
  }

  ejectPos(out) {
    this.gunPivot.updateWorldMatrix(true, false);
    return out.copy(this.ejection).applyMatrix4(this.gunPivot.matrixWorld);
  }

  /** Two-bone IK: shoulder -> elbow -> hand, with the elbow pushed down and out. */
  _solveArm(arm, hand) {
    arm.target.copy(hand);
    if (this.rig) return; // the skinned model solves its own arms
    const a = this.dim.armA, b = this.dim.armB;
    const S = arm.shoulder;
    const d = this._a.subVectors(hand, S);
    let len = d.length();
    const u = d.divideScalar(Math.max(1e-4, len));
    len = clamp(len, 0.1, a + b - 0.002);
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

  /** Gun-space point -> torso-local. */
  _g2t(v, out) {
    return out.copy(v).applyMatrix4(this.gunPivot.matrix);
  }

  _poseArms(dt = 0) {
    this.gunPivot.updateMatrix();
    const rh = this._g2t(this.gripR, new THREE.Vector3());
    const lh = this._g2t(this.gripL, new THREE.Vector3());
    // Support hand: if the handguard is out of reach, slide back along the gun toward the magwell.
    const S = this.arms[1].shoulder;
    const reach = this.dim.armA + this.dim.armB - 0.015;
    if (lh.distanceTo(S) > reach && !this.pistol) {
      const back = this._g2t(tmpV1.set(this.gripL.x, this.gripL.y, Math.max(this.gripL.z, this.magHome.z - 0.04)), new THREE.Vector3());
      const axis = back.clone().sub(lh);
      const L = axis.length();
      if (L > 1e-3) {
        axis.divideScalar(L);
        // |lh + t*axis - S| = reach
        const o = lh.clone().sub(S);
        const bq = o.dot(axis), cq = o.lengthSq() - reach * reach;
        const disc = bq * bq - cq;
        const t = disc >= 0 ? clamp(-bq - Math.sqrt(disc), 0, L) : L;
        lh.addScaledVector(axis, t);
      }
    }
    // Working the action.
    if (this.cycleT >= 0 && !this.rl) {
      if (this.cycleDelay > 0) this.cycleDelay -= dt;
      else {
        const dur = this.cycleKind === 'bolt' ? 0.75 : 0.42;
        this.cycleT += dt / dur;
        const w = Math.sin(Math.PI * clamp(this.cycleT, 0, 1));
        if (this.cycleKind === 'bolt') {
          const bolt = this._g2t(tmpV2.set(0.06, 0.02, 0.07 - w * 0.06), new THREE.Vector3());
          rh.lerp(bolt, clamp(w * 1.6, 0, 1));
        } else {
          lh.add(this._g2t(tmpV2.set(0, 0, 0.11 * w), new THREE.Vector3()).sub(this._g2t(tmpV1.set(0, 0, 0), new THREE.Vector3())));
        }
        if (this.cycleT >= 1) this.cycleT = -1;
      }
    }
    // Reload choreography for the support hand (and the magazine).
    if (this.rl) this._reloadHands(lh);
    else if ((this.sprintBlend ?? 0) > 0.01) {
      // Free arm pumps opposite the left leg.
      const sw = Math.sin(this.phase);
      tmpV2.set(-0.2, 0.24 + sw * 0.07, -0.16 - sw * 0.17);
      lh.lerp(tmpV2, this.sprintBlend);
    }
    if (this.captive === 'back') {
      // Wrists together behind the back (bound hostage, cuffed prisoner).
      rh.set(0.05, 0.07, 0.17).add(this.shift);
      lh.set(-0.05, 0.07, 0.17).add(this.shift);
    } else if (this.captive === 'head') {
      // Hands on the head: surrendering.
      rh.set(0.09, 0.74, -0.02).add(this.shift);
      lh.set(-0.09, 0.74, -0.02).add(this.shift);
    } else if (this.captive === 'side') {
      // Unarmed, arms relaxed at the sides.
      rh.set(0.23, -0.18, -0.02).add(this.shift);
      lh.set(-0.23, -0.18, -0.02).add(this.shift);
    }
    this._solveArm(this.arms[0], rh);
    this._solveArm(this.arms[1], lh);
  }

  /** Unarmed pose: 'back' (wrists bound behind), 'head' (hands on head), 'side', or false (armed). */
  setCaptive(mode) {
    this.captive = mode === true ? 'back' : mode;
    this.gun.visible = !mode;
    if (this.mag) this.mag.visible = !mode;
  }

  _reloadHands(lh) {
    const r = this.rl;
    const t = r.t;
    const G = lh.clone();
    if (r.shells) {
      // Shotgun: shells from the belt caddy into the loading port, four times.
      const port = this._g2t(tmpV1.set(0, -0.06, -0.06), new THREE.Vector3());
      if (t > 0.08 && t < 0.86) {
        const k = ((t - 0.08) / 0.78) * 4;
        const w = 0.5 - 0.5 * Math.cos(k * Math.PI * 2);
        lh.copy(port).lerp(this.belt, w);
      } else if (t <= 0.08) lh.copy(G).lerp(port, smooth(t / 0.08));
      else lh.copy(port).lerp(G, smooth((t - 0.86) / 0.14));
      return;
    }
    const W = this._g2t(this.magGrip, new THREE.Vector3());
    const Ch = this._g2t(tmpV1.set(-0.035, 0.045, this.pistol ? 0.05 : 0.1), new THREE.Vector3());
    const tap = W.clone().add(tmpV2.set(0, 0.025, 0));
    const keys = [[0, G], [0.12, W], [0.22, W], [0.42, this.pouch], [0.5, this.pouch], [0.62, W], [0.68, tap], [0.76, W], [0.86, r.empty ? Ch : W], [1, G]];
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, A] = keys[i], [t1, B] = keys[i + 1];
    lh.copy(A).lerp(B, smooth(clamp((t - t0) / Math.max(1e-3, t1 - t0), 0, 1)));
    // Magazine follows the hand between release and seating.
    if (!this.mag) return;
    const inv = tmpM3.copy(this.gunPivot.matrix).invert();
    const handInGun = tmpV2.copy(lh).applyMatrix4(inv);
    const grabOff = tmpV1.subVectors(this.magGrip, this.magHome);
    if (t >= 0.22 && !r.released) {
      r.released = true;
      if (r.drop) {
        this.gun.updateWorldMatrix(true, true);
        this.onMagDrop?.(this.mag.geometry, this.mag.material, this.mag.matrixWorld.clone());
        this.mag.visible = false;
      }
    }
    if (t < 0.22) { this.mag.position.copy(this.magHome); this.mag.visible = true; }
    else if (t < 0.42) {
      if (!r.drop) { this.mag.visible = true; this.mag.position.copy(handInGun).sub(grabOff); } // stow the partial mag
    } else if (t < 0.47) this.mag.visible = false;
    else if (t < 0.62) { this.mag.visible = true; this.mag.position.copy(handInGun).sub(grabOff); }
    else { this.mag.visible = true; this.mag.position.copy(this.magHome); }
  }

  _updateDead(dt) {
    this.deathT += dt;
    const st = this.deathStyle;
    const T = st === 'crumple' ? 0.95 : 0.75;
    const H = this.dim.hipH, hk = H / 0.95;
    const t = clamp(this.deathT / T, 0, 1);
    const e = t * t;
    if (st === 'crumple') {
      // Knees give out on the spot, then the body pitches forward face-down, legs trailing.
      const k = smooth(clamp(this.deathT / 0.3, 0, 1));
      const f = smooth(clamp((this.deathT - 0.25) / 0.65, 0, 1));
      const buckle = k * (1 - f);
      this.hips.position.y = damp(this.hips.position.y, lerp(H, 0.66 * hk, buckle) - f * 0.06, 12, dt);
      for (const l of this.legs) {
        l.thigh.rotation.x = damp(l.thigh.rotation.x, lerp(0.75 * buckle + 0.1 * l.side, 0.12 + 0.08 * l.side, f), 10, dt);
        l.shin.rotation.x = damp(l.shin.rotation.x, lerp(-1.5 * buckle, -0.25, f), 10, dt);
      }
      this.body.rotation.x = -f * (Math.PI / 2 - 0.1);
      this.body.rotation.z = this.deathSide * 0.4 * f;
      this.body.position.y = 0;
      this.torso.rotation.x = damp(this.torso.rotation.x, -0.35 * buckle, 6, dt);
      this.head.rotation.x = damp(this.head.rotation.x, 0.5 * f - 0.3 * buckle, 8, dt);
      this.head.rotation.y = damp(this.head.rotation.y, this.twist * 0.7 * f, 6, dt);
    } else if (st === 'twist') {
      this.body.rotation.y = this.twist * e * 0.9;
      this.body.rotation.z = this.twist * e * (Math.PI / 2 - 0.1);
      this.body.rotation.x = this.deathDir * e * 0.25;
      this.hips.position.y = damp(this.hips.position.y, 0.78 * hk, 5, dt);
      for (const l of this.legs) {
        l.thigh.rotation.x = damp(l.thigh.rotation.x, 0.3 + 0.35 * l.side * this.twist, 5, dt);
        l.shin.rotation.x = damp(l.shin.rotation.x, -0.7 - 0.3 * l.side, 5, dt);
      }
      this.torso.rotation.x = damp(this.torso.rotation.x, -0.2, 4, dt);
      this.head.rotation.z = damp(this.head.rotation.z, this.twist * 0.5, 4, dt);
    } else {
      // Knees buckle first, then the body topples away from the shot.
      this.body.rotation.x = this.deathDir * e * (Math.PI / 2 - 0.08);
      this.body.rotation.z = this.deathSide * e;
      this.body.position.y = -e * 0.05;
      this.hips.position.y = damp(this.hips.position.y, 0.72 * hk, 5, dt);
      for (const l of this.legs) {
        l.thigh.rotation.x = damp(l.thigh.rotation.x, (this.deathDir < 0 ? 0.9 : 0.35) + 0.2 * l.side, 5, dt);
        l.shin.rotation.x = damp(l.shin.rotation.x, this.deathDir < 0 ? -1.3 : -0.5, 5, dt);
      }
      this.torso.rotation.x = damp(this.torso.rotation.x, -this.deathDir * 0.3, 4, dt);
      this.head.rotation.x = damp(this.head.rotation.x, -this.deathDir * 0.5, 4, dt);
    }
    // The weapon slips out of the firing grip.
    this.gunPivot.rotation.x = damp(this.gunPivot.rotation.x, -this.deathDir * 1.2, 5, dt);
    this.gunPivot.rotation.z = damp(this.gunPivot.rotation.z, 0.6, 4, dt);
    this.gunPivot.position.y = damp(this.gunPivot.position.y, 0.2 + this.shift.y, 4, dt);
    this.gunPivot.position.z = damp(this.gunPivot.position.z, -0.25 + this.shift.z, 4, dt);
    this._poseArms(dt);
    if (this.rig) { for (const l of this.legs) l.ankle = damp(l.ankle ?? 0, 0, 4, dt); this.rig.pose(this); }
  }

  /** speed: horizontal m/s, crouch: 0..1, pitch: aim pitch (rad), firing: bool, aim: 0..1 shouldered. */
  update(dt, speed, crouch, pitch, firing, aim = 0) {
    if (this.dead) { this._updateDead(dt); return; }
    this.crouch = damp(this.crouch, crouch, 10, dt);
    const c = this.crouch;
    const moving = speed > 0.2;
    const run = clamp((speed - 2.5) / 3, 0, 1);
    // Moving one way while looking (and aiming) another: the hips and legs turn
    // toward the direction of travel, the upper body stays on target, and walking
    // away from where you face is a backpedal.
    const rel = this.moveRel ?? 0;
    const back = moving && Math.abs(rel) > Math.PI * 0.6;
    const turn = moving ? clamp(back ? Math.atan2(Math.sin(rel - Math.PI), Math.cos(rel - Math.PI)) : rel, -1.1, 1.1) : 0;
    this.hipTurn = damp(this.hipTurn ?? 0, turn, 8, dt);
    this.phase += dt * (moving ? 2.2 + speed * 1.55 : 0) * (back ? -1 : 1);
    const amp = moving ? clamp(speed / 5, 0.32, 0.85) * (1 - c * 0.45) : 0;
    // Stationary and low: take a knee (right knee down, left foot forward) instead of squatting.
    this.kneel = damp(this.kneel ?? 0, c > 0.5 && speed < 0.6 ? 1 : 0, 7, dt);
    const kn = this.kneel * c;
    for (const l of this.legs) {
      const ph = l.side > 0 ? 0 : Math.PI;
      const sw = Math.sin(this.phase + ph) * amp;
      const bend = Math.max(0, Math.sin(this.phase + ph + Math.PI / 2)) * amp * (1.2 + run * 0.6);
      const squatT = sw + c * 1.15, squatS = -bend - c * 1.95 - (moving ? 0.08 : 0);
      // (The skinned model's shins are longer: its front knee rides higher.)
      const kneelT = l.side > 0 ? -0.08 : this.rig ? 1.6 : 1.3, kneelS = l.side > 0 ? -1.42 : this.rig ? -1.08 : -1.3;
      l.thigh.rotation.x = damp(l.thigh.rotation.x, lerp(squatT, kneelT, kn), 14, dt);
      l.shin.rotation.x = damp(l.shin.rotation.x, lerp(squatS, kneelS, kn), 14, dt);
      l.thigh.rotation.z = damp(l.thigh.rotation.z, -l.side * (0.03 + kn * 0.08), 8, dt);
    }
    const s = Math.sin(this.phase);
    const bob = moving ? Math.abs(s) * (0.03 + run * 0.03) : 0;
    this.breath += dt;
    this.hips.position.y = this.dim.hipH - c * 0.42 + bob + kn * 0.03;
    if (this.rig) this._plantFeet();
    this.hipSway = moving ? Math.sin(this.phase) * 0.08 * amp : 0;
    this.hips.rotation.y = this.hipTurn + this.hipSway;
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.kick *= Math.exp(-dt * 16);

    // Reload progress.
    if (this.rl) {
      this.rl.t += dt / this.rl.dur;
      if (this.rl.t >= 1) {
        this.rl = null;
        if (this.mag) { this.mag.visible = true; this.mag.position.copy(this.magHome); }
      }
    }
    const rt = this.rl ? this.rl.t : 1;
    const rw = this.rl ? smooth(clamp(rt / 0.1, 0, 1)) * smooth(clamp((1 - rt) / 0.12, 0, 1)) : 0;
    this.reloadBlend = rw;
    this.aimBlend = damp(this.aimBlend, aim && !this.rl ? 1 : 0, aim ? 8 : 5, dt);
    const ab = this.aimBlend;

    // Torso: lean into a run, hunch when crouched, settle into a forward-weighted
    // stance and blade the body when shouldering the weapon, flinch when hit.
    const lean = -c * 0.22 * (1 - kn * 0.7) - (moving ? 0.05 + run * 0.12 : 0) * (1 - ab) - ab * 0.07 + this.flinch * 0.35 + this.kick * 0.035 * this.kickPow + Math.sin(this.breath * 1.7) * 0.012;
    this.torso.rotation.x = damp(this.torso.rotation.x, lean, 10, dt);
    this.torso.rotation.y = -this.hipTurn - this.hipSway * 0.8 - ab * this.blade;
    this.torso.rotation.z = this.flinchSide * this.flinch * 0.25;
    // Head: look along the sights with a cheek weld when aiming.
    this.aimPitch = damp(this.aimPitch, pitch, 10, dt);
    const tr = this.torso.rotation;
    this.head.rotation.x = lerp(this.aimPitch * 0.6 - tr.x * 0.5, this.aimPitch - tr.x - 0.2, ab) - rw * 0.35;
    this.head.rotation.y = -tr.y * (0.5 + 0.5 * ab);
    this.head.rotation.z = -0.2 * ab * (this.pistol ? 0.3 : 1);

    // Weapon, pose A: hip / ready, low ready when moving out of contact (torso-local).
    this.lowReady = damp(this.lowReady, moving && !firing && ab < 0.5 && Math.abs(pitch) < 0.01 ? 1 : 0, 5, dt);
    const gp = this._gp.set(this.hipPos.x, this.hipPos.y - this.lowReady * 0.06, this.hipPos.z);
    const gq = this._gq.setFromEuler(tmpEu.set(this.aimPitch - tr.x - this.lowReady * 0.55, this.lowReady * 0.35, 0));
    // Pose B: shouldered, solved in the body frame and brought into torso space.
    if (ab > 0.001) {
      this.hips.updateMatrix();
      this.torso.updateMatrix();
      const torsoInBody = tmpM2.multiplyMatrices(this.hips.matrix, this.torso.matrix);
      const off = tmpV1.copy(this.aimOff).applyAxisAngle(tmpV2.set(1, 0, 0), tr.x * 0.8);
      off.y += this.hips.position.y + this.torso.position.y;
      const qb = tmpQ2.setFromEuler(tmpEu.set(this.aimPitch, 0, 0));
      const mb = tmpM3.compose(off, qb, tmpS1.set(1, 1, 1));
      mb.premultiply(torsoInBody.invert());
      const pb = new THREE.Vector3(), qbt = tmpQ3;
      mb.decompose(pb, qbt, tmpS1);
      gp.lerp(pb, ab);
      gq.slerp(qbt, ab);
    }
    // Pose S: tactical sprint — gun held one-handed by the right shoulder, muzzle up.
    this.sprintBlend = damp(this.sprintBlend ?? 0, run > 0.55 && ab < 0.3 && !this.rl ? 1 : 0, 6, dt);
    const sp = this.sprintBlend;
    if (sp > 0.001) {
      const ps = tmpV1.set(this.pistol ? 0.12 : 0.15, this.pistol ? 0.52 : 0.5, this.pistol ? -0.24 : -0.17).add(this.shift);
      const qs = tmpQ2.setFromEuler(tmpEu.set((this.pistol ? 1.0 : 1.15) - tr.x + Math.sin(this.phase) * 0.06, 0.12, -0.28));
      gp.lerp(ps, sp);
      gq.slerp(qs, sp);
    }
    // Pose C: reload — gun brought in, muzzle up and canted toward the support hand.
    if (rw > 0.001) {
      const pc = tmpV1.set(this.pistol ? 0.03 : 0.06, this.pistol ? 0.43 : 0.44, this.pistol ? -0.32 : -0.28).add(this.shift);
      const qc = tmpQ2.setFromEuler(tmpEu.set(0.3 - tr.x, -0.2, this.pistol ? 0.2 : 0.6));
      gp.lerp(pc, rw);
      gq.slerp(qc, rw);
    }
    // Recoil: the gun drives back into the shoulder and the muzzle climbs.
    if (this.kick > 0.002) {
      const k = this.kick * this.kickPow;
      gp.add(tmpV2.set(0, 0.006 * k, 0.03 * k).applyQuaternion(gq));
      gq.multiply(tmpQ3.setFromAxisAngle(tmpV2.set(1, 0, 0), 0.07 * k));
    }
    this.gunPivot.position.copy(gp);
    this.gunPivot.quaternion.copy(gq);
    this._poseArms(dt);
    if (this.rig) this.rig.pose(this);
  }

  /**
   * Skinned model: set the pelvis height from the leg angles so the lowest boot
   * (or a knee on the ground) touches down, and level the boots while planted.
   */
  _plantFeet() {
    const d = this.dim;
    let low = Infinity;
    for (const l of this.legs) {
      const t = l.thigh.rotation.x, phi = t + l.shin.rotation.x;
      // The ankle flexes to keep the sole flat while the shin is near upright; a
      // shin lying back (kneeling) keeps the foot in line, toes on the ground.
      const comp = -phi * 0.9 * (phi < -0.85 ? sstep(-1.3, -0.85, phi) : 1);
      l.ankle = comp;
      const knee = -d.thigh * Math.cos(t);
      const sole = knee - d.shinA * Math.cos(phi) - d.ankleH * Math.cos(phi + comp);
      low = Math.min(low, sole, knee - 0.075);
    }
    this.hips.position.y = -low;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const THERMAL_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
