// Third-person soldier model with procedural animation (walk, run, crouch, aim,
// flinch, death fall). Shared geometries and materials keep it cheap to clone.
import * as THREE from '../lib/three.js';
import { getTexture } from '../world/Textures.js';
import { WEAPONS } from '../weapons/WeaponData.js';
import { damp, clamp } from '../core/Utils.js';

export const FACTIONS = {
  orion: { fabric: 0x8a8460, vest: 0x6f6a4c, helmet: 0x5f5d48, skin: 0xc49a7a, mask: false, band: 0x2f6f3a },
  meridian: { fabric: 0x3a3c3e, vest: 0x26282a, helmet: 0x1e2022, skin: 0xb08868, mask: true, band: 0x9a1c1c },
  heavy: { fabric: 0x2a2a2a, vest: 0x1a1b1c, helmet: 0x141516, skin: 0xb08868, mask: true, band: 0xb01e1e, heavy: true },
  desertEnemy: { fabric: 0x8a7a5a, vest: 0x4a4436, helmet: 0x5a4e3a, skin: 0xa07858, mask: true, band: 0x9a1c1c },
  snowEnemy: { fabric: 0xc8ccd0, vest: 0x6a7076, helmet: 0xd0d4d8, skin: 0xb08868, mask: true, band: 0x9a1c1c },
};

const FFA_COLORS = [0x7a3a3a, 0x3a5a7a, 0x6a6a3a, 0x4a7a4a, 0x7a5a3a, 0x5a3a7a, 0x3a7a7a, 0x7a7a7a];

const geo = {};
function G() {
  if (geo.ready) return geo;
  geo.torso = new THREE.BoxGeometry(0.4, 0.52, 0.24);
  geo.vest = new THREE.BoxGeometry(0.44, 0.38, 0.3);
  geo.pouch = new THREE.BoxGeometry(0.09, 0.1, 0.06);
  geo.head = new THREE.BoxGeometry(0.2, 0.24, 0.22);
  geo.helmet = new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9);
  geo.goggles = new THREE.BoxGeometry(0.17, 0.05, 0.04);
  geo.thigh = new THREE.BoxGeometry(0.17, 0.46, 0.18);
  geo.thigh.translate(0, -0.23, 0);
  geo.shin = new THREE.BoxGeometry(0.15, 0.44, 0.15);
  geo.shin.translate(0, -0.22, 0);
  geo.boot = new THREE.BoxGeometry(0.15, 0.1, 0.26);
  geo.boot.translate(0, -0.47, -0.04);
  geo.upperArm = new THREE.BoxGeometry(0.12, 0.12, 0.3);
  geo.upperArm.translate(0, 0, -0.15);
  geo.foreArm = new THREE.BoxGeometry(0.1, 0.1, 0.3);
  geo.foreArm.translate(0, 0, -0.15);
  geo.band = new THREE.BoxGeometry(0.125, 0.05, 0.125);
  geo.pack = new THREE.BoxGeometry(0.32, 0.36, 0.16);
  geo.ready = true;
  return geo;
}

const mats = new Map();
function fabricMat(color) {
  const k = 'f' + color;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, map: getTexture('fabric', 256), roughness: 0.95 }));
  return mats.get(k);
}
function plainMat(color, rough = 0.8, metal = 0) {
  const k = `p${color}:${rough}:${metal}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return mats.get(k);
}

const gunCache = new Map();
/** Low-poly merged gun for third-person models, cached per weapon. */
export function buildLowGun(weaponId) {
  if (gunCache.has(weaponId)) return new THREE.Mesh(gunCache.get(weaponId), plainMat(0x1c1d1e, 0.6, 0.4));
  const m = WEAPONS[weaponId]?.model ?? WEAPONS.vx4.model;
  const parts = [];
  const add = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); parts.push(b); };
  const L = m.len;
  if (m.body === 'pistol' || m.body === 'deagle') {
    add(0.035, 0.05, 0.2, 0, 0.03, -0.08);
    add(0.03, 0.1, 0.045, 0, -0.03, 0);
  } else {
    add(0.06, 0.09, 0.4, 0, 0.0, -0.1); // receiver
    add(0.03, 0.03, L * 0.55, 0, 0.01, -0.3 - L * 0.27); // barrel
    add(0.05, 0.08, 0.25, 0, -0.01, 0.2); // stock
    add(0.035, 0.12, 0.06, 0, -0.09, -0.12); // mag
    add(0.03, 0.09, 0.04, 0, -0.07, 0.04); // grip
    if (m.body === 'lmg') add(0.1, 0.1, 0.1, -0.05, -0.08, -0.1);
    if (m.body === 'bolt' || m.body === 'dmr') add(0.04, 0.04, 0.22, 0, 0.07, -0.08);
  }
  // Manual merge.
  let count = 0, icount = 0;
  for (const p of parts) { count += p.attributes.position.count; icount += p.index.count; }
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  const idx = new Uint16Array(icount);
  let vo = 0, io = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, vo * 3);
    nrm.set(p.attributes.normal.array, vo * 3);
    for (let i = 0; i < p.index.count; i++) idx[io + i] = p.index.array[i] + vo;
    vo += p.attributes.position.count;
    io += p.index.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  gunCache.set(weaponId, g);
  return new THREE.Mesh(g, plainMat(0x1c1d1e, 0.6, 0.4));
}

export class Humanoid {
  constructor(faction = 'meridian', weaponId = 'vx4', opts = {}) {
    const g = G();
    const f = { ...FACTIONS[faction] ?? FACTIONS.meridian };
    if (opts.colorIndex !== undefined) { f.fabric = FFA_COLORS[opts.colorIndex % FFA_COLORS.length]; f.band = f.fabric; }
    this.faction = f;
    const scale = f.heavy ? 1.15 : 1;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(scale);
    this.root.add(this.body);
    const fabric = fabricMat(f.fabric);
    const vestM = plainMat(f.vest, 0.85);
    const skin = plainMat(f.skin, 0.7);
    const helmetM = plainMat(f.helmet, 0.6, 0.2);
    const black = plainMat(0x111111, 0.4, 0.3);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.body.add(this.hips);
    // Torso pivots at the hips.
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const torso = new THREE.Mesh(g.torso, fabric);
    torso.position.y = 0.28;
    this.torso.add(torso);
    const vest = new THREE.Mesh(g.vest, vestM);
    vest.position.set(0, 0.33, 0);
    if (f.heavy) vest.scale.set(1.2, 1.35, 1.3);
    this.torso.add(vest);
    for (const px of [-0.12, 0, 0.12]) {
      const p = new THREE.Mesh(g.pouch, vestM);
      p.position.set(px, 0.24, -0.17);
      this.torso.add(p);
    }
    const pack = new THREE.Mesh(g.pack, vestM);
    pack.position.set(0, 0.32, 0.2);
    this.torso.add(pack);
    // Head.
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    const head = new THREE.Mesh(g.head, f.mask ? plainMat(0x18191a, 0.9) : skin);
    this.head.add(head);
    const helmet = new THREE.Mesh(g.helmet, helmetM);
    helmet.position.y = 0.04;
    helmet.scale.set(1.05, 0.95, 1.1);
    this.head.add(helmet);
    const gog = new THREE.Mesh(g.goggles, f.heavy ? plainMat(0xff2222, 0.3, 0.2) : black);
    gog.position.set(0, 0.02, -0.115);
    if (f.heavy) { gog.material = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 2 }); gog.scale.set(1.1, 1.4, 1); }
    this.head.add(gog);
    // Arms (shoulder pivots).
    this.armR = new THREE.Group(); this.armR.position.set(0.24, 0.5, 0); this.torso.add(this.armR);
    this.armL = new THREE.Group(); this.armL.position.set(-0.24, 0.5, 0); this.torso.add(this.armL);
    for (const arm of [this.armR, this.armL]) {
      const up = new THREE.Mesh(g.upperArm, fabric);
      arm.add(up);
      const fore = new THREE.Group();
      fore.position.z = -0.28;
      arm.add(fore);
      const fm = new THREE.Mesh(g.foreArm, fabric);
      fore.add(fm);
      arm.userData.fore = fore;
    }
    const band = new THREE.Mesh(g.band, plainMat(f.band, 0.8));
    band.position.set(0, 0, -0.12);
    this.armL.add(band);
    // Arm pose: holding a rifle.
    this.armR.rotation.set(-0.35, 0.25, 0);
    this.armR.userData.fore.rotation.set(0.5, -0.6, 0);
    this.armL.rotation.set(-0.25, -0.5, 0);
    this.armL.userData.fore.rotation.set(0.45, 0.65, 0);
    // Gun held at chest.
    this.gunPivot = new THREE.Group();
    this.gunPivot.position.set(0.1, 0.36, -0.25);
    this.torso.add(this.gunPivot);
    this.gun = buildLowGun(weaponId);
    this.gunPivot.add(this.gun);
    this.muzzle = new THREE.Object3D();
    const L = WEAPONS[weaponId]?.model.len ?? 0.8;
    this.muzzle.position.set(0, 0.01, -0.3 - L * 0.55);
    this.gunPivot.add(this.muzzle);
    // Legs.
    this.legs = [];
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.11, 0, 0);
      this.hips.add(thigh);
      thigh.add(new THREE.Mesh(g.thigh, fabric));
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      thigh.add(shin);
      shin.add(new THREE.Mesh(g.shin, fabric));
      shin.add(new THREE.Mesh(g.boot, black));
      this.legs.push({ thigh, shin, side });
    }
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.phase = Math.random() * 6;
    this.crouch = 0;
    this.flinch = 0;
    this.dead = false;
    this.deathT = 0;
    this.deathDir = 1;
    this.aimPitch = 0;
  }

  setThermal(on) {
    // Thermal optic: bright white silhouettes.
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
    // Fall away from the shot.
    this.deathSide = (Math.random() - 0.5) * 0.8;
    this.deathDir = fromDir ?? 1;
  }

  /** speed: horizontal m/s, crouch: 0..1, pitch: aim pitch (rad). */
  update(dt, speed, crouch, pitch, firing) {
    if (this.dead) {
      this.deathT += dt;
      const t = clamp(this.deathT / 0.7, 0, 1);
      const e = t * t;
      this.body.rotation.x = this.deathDir * e * (Math.PI / 2 - 0.08);
      this.body.rotation.z = this.deathSide * e;
      this.body.position.y = -e * 0.05;
      this.hips.position.y = damp(this.hips.position.y, 0.75, 4, dt);
      for (const l of this.legs) { l.thigh.rotation.x = damp(l.thigh.rotation.x, 0.4 * l.side, 5, dt); l.shin.rotation.x = damp(l.shin.rotation.x, -0.6, 5, dt); }
      this.armR.rotation.x = damp(this.armR.rotation.x, -1.2, 4, dt);
      this.armL.rotation.x = damp(this.armL.rotation.x, -1.4, 4, dt);
      // Rifle settles flat along the body instead of pointing at the sky.
      this.gunPivot.rotation.x = damp(this.gunPivot.rotation.x, -this.deathDir * 1.45, 5, dt);
      this.gunPivot.rotation.z = damp(this.gunPivot.rotation.z, 0.5, 4, dt);
      return;
    }
    this.crouch = damp(this.crouch, crouch, 10, dt);
    const c = this.crouch;
    const moving = speed > 0.2;
    this.phase += dt * (moving ? 2 + speed * 1.6 : 0);
    const amp = moving ? clamp(speed / 5, 0.35, 0.8) * (1 - c * 0.5) : 0;
    const s = Math.sin(this.phase);
    for (const l of this.legs) {
      const ph = l.side > 0 ? 0 : Math.PI;
      const sw = Math.sin(this.phase + ph) * amp;
      const bend = Math.max(0, Math.sin(this.phase + ph + Math.PI / 2)) * amp * 1.3;
      const tx = sw + c * 1.15;
      const sx = -bend - c * 1.95;
      l.thigh.rotation.x = damp(l.thigh.rotation.x, tx, 14, dt);
      l.shin.rotation.x = damp(l.shin.rotation.x, sx, 14, dt);
    }
    const bob = moving ? Math.abs(s) * 0.04 : 0;
    this.hips.position.y = 0.95 - c * 0.42 + bob;
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.torso.rotation.x = damp(this.torso.rotation.x, -c * 0.25 + (moving ? 0.1 * Math.min(speed / 5, 1) : 0) + this.flinch * 0.35, 10, dt);
    this.aimPitch = damp(this.aimPitch, pitch, 10, dt);
    this.gunPivot.rotation.x = this.aimPitch - this.torso.rotation.x;
    this.gunPivot.rotation.z = damp(this.gunPivot.rotation.z, 0, 8, dt);
    this.armR.rotation.x = -0.35 + this.gunPivot.rotation.x * 0.8;
    this.armL.rotation.x = -0.25 + this.gunPivot.rotation.x * 0.8;
    this.head.rotation.x = this.aimPitch * 0.6;
    this.gun.position.z = firing ? 0.02 : damp(this.gun.position.z, 0, 20, dt);
  }

  dispose() {
    this.root.removeFromParent();
  }
}

const THERMAL_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
