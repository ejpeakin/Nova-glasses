// Procedural first-person weapon models. Each body type is assembled from simple
// primitives with bevel-like detailing; attachments mount on rails and the muzzle.
// Weapon space: barrel points down -Z, +Y up, origin at the firing grip.
import * as THREE from '../lib/three.js';

const matCache = new Map();
function mat(color, rough = 0.5, metal = 0.5, extra = {}) {
  const key = `${color}:${rough}:${metal}:${JSON.stringify(extra)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
}

function box(parent, w, h, d, x, y, z, m, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  parent.add(mesh);
  return mesh;
}

function cyl(parent, r, len, x, y, z, m, seg = 12, r2 = r) {
  // Cylinder aligned with Z.
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, seg), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/**
 * Returns { group, muzzle, sightY, mag, magHome, action, actionHome, leftHand, ejection }.
 */
export function buildWeaponModel(def, att = {}) {
  const m = def.model;
  const g = new THREE.Group();
  const body = mat(m.color, 0.55, 0.45);
  const dark = mat(0x161718, 0.6, 0.5);
  const accent = mat(m.accent, m.accent === 0x6b4a2e || m.accent === 0x5a3f28 ? 0.8 : 0.6, m.accent === 0x6b4a2e || m.accent === 0x5a3f28 ? 0.05 : 0.4);
  const steel = mat(0x55595d, 0.35, 0.85);
  const magMat = mat(0x34372f, 0.75, 0.25); // polymer mags read against the receiver
  const info = { group: g, sightY: 0.075, leftHand: new THREE.Vector3(0, -0.02, -0.28), ejection: new THREE.Vector3(0.03, 0.04, -0.05) };
  let recvTop = 0.06; // top of receiver/rail
  let barrelZ = -0.3; // where the barrel starts
  let muzzleZ = -m.len + 0.12;
  let magPos = new THREE.Vector3(0, -0.07, -0.09);
  const mag = new THREE.Group();
  let action = null;
  const pistol = m.body === 'pistol' || m.body === 'deagle';

  switch (m.body) {
    case 'ar':
    case 'dmr':
    case 'ak':
    case 'scar': {
      const tall = m.body === 'scar' ? 0.095 : 0.075;
      box(g, 0.052, tall, 0.34, 0, 0.02 + tall / 2 - 0.035, -0.08, body); // receiver
      box(g, 0.054, 0.012, 0.36, 0, 0.02 + tall - 0.035 + 0.006, -0.09, dark); // top rail
      recvTop = 0.02 + tall - 0.035 + 0.012;
      // Handguard.
      const hgLen = m.body === 'dmr' ? 0.38 : 0.3;
      const hgMat = m.body === 'ak' ? accent : body;
      box(g, 0.058, 0.06, hgLen, 0, 0.012, -0.25 - hgLen / 2 + 0.02, hgMat);
      if (m.body !== 'ak') {
        for (let i = 0; i < 4; i++) box(g, 0.06, 0.008, 0.02, 0, 0.03, -0.27 - i * 0.065, dark); // vent ribs
      }
      barrelZ = -0.23 - hgLen;
      // Stock.
      if (m.body === 'ak') {
        const st = box(g, 0.042, 0.07, 0.26, 0, -0.005, 0.22, accent);
        st.rotation.x = 0.12;
        box(g, 0.045, 0.1, 0.02, 0, -0.02, 0.35, dark);
      } else if (m.body === 'scar') {
        box(g, 0.05, 0.06, 0.24, 0, 0.0, 0.2, accent);
        box(g, 0.05, 0.11, 0.03, 0, -0.02, 0.32, accent);
      } else {
        box(g, 0.026, 0.026, 0.16, 0, 0.012, 0.15, dark); // buffer tube
        box(g, 0.045, 0.085, 0.12, 0, -0.004, 0.26, body); // stock
      }
      // Grip.
      const grip = box(g, 0.035, 0.1, 0.045, 0, -0.065, 0.035, dark);
      grip.rotation.x = -0.3;
      box(g, 0.012, 0.03, 0.05, 0, -0.03, -0.01, dark); // trigger guard
      // Charging handle (animated on empty reload).
      action = box(g, 0.02, 0.015, 0.04, 0.0, recvTop - 0.005, 0.07, steel);
      // Mag.
      if (m.magType === 'banana' || m.magType === 'curved') {
        const curve = m.magType === 'banana' ? 0.35 : 0.2;
        const s1 = box(mag, 0.03, 0.1, 0.065, 0, -0.04, 0, m.magType === 'banana' ? mat(0x4a3424, 0.7, 0.1) : magMat);
        const s2 = box(mag, 0.03, 0.08, 0.065, 0, -0.12, -0.022, s1.material);
        s2.rotation.x = curve;
      } else {
        box(mag, 0.03, 0.13, 0.07, 0, -0.06, 0, magMat);
      }
      magPos.set(0, -0.015, -0.11);
      info.leftHand.set(0, -0.02, -0.33);
      break;
    }
    case 'smg':
    case 'vector': {
      const isV = m.body === 'vector';
      box(g, 0.05, isV ? 0.11 : 0.07, 0.3, 0, isV ? 0.0 : 0.01, -0.06, body);
      box(g, 0.052, 0.01, 0.26, 0, isV ? 0.06 : 0.05, -0.06, dark);
      recvTop = isV ? 0.065 : 0.055;
      box(g, 0.045, 0.05, 0.12, 0, 0.0, -0.26, isV ? accent : body);
      barrelZ = -0.32;
      box(g, 0.02, 0.02, 0.16, 0, 0.01, 0.15, dark); // folding stock arms
      box(g, 0.035, 0.07, 0.025, 0, -0.01, 0.24, dark);
      const grip = box(g, 0.034, 0.095, 0.042, 0, -0.07, 0.03, dark);
      grip.rotation.x = -0.25;
      action = box(g, 0.015, 0.015, 0.03, 0.028, 0.03, -0.02, steel);
      box(mag, 0.026, 0.15, 0.04, 0, -0.07, 0, magMat);
      magPos.set(0, -0.02, isV ? -0.15 : -0.09);
      info.leftHand.set(0, -0.03, -0.22);
      break;
    }
    case 'bolt': {
      box(g, 0.05, 0.065, 0.36, 0, 0.005, -0.06, body);
      box(g, 0.052, 0.01, 0.3, 0, 0.042, -0.06, dark);
      recvTop = 0.047;
      // Chassis/stock.
      box(g, 0.06, 0.06, 0.42, 0, -0.025, -0.38, accent);
      box(g, 0.048, 0.075, 0.3, 0, -0.01, 0.24, accent);
      box(g, 0.05, 0.12, 0.03, 0, -0.03, 0.39, dark);
      box(g, 0.04, 0.025, 0.14, 0, 0.04, 0.22, accent); // cheek riser
      barrelZ = -0.55;
      const grip = box(g, 0.035, 0.1, 0.045, 0, -0.07, 0.06, dark);
      grip.rotation.x = -0.35;
      // Bolt handle.
      action = new THREE.Group();
      box(action, 0.06, 0.012, 0.012, 0.03, 0, 0, steel);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), steel);
      knob.position.set(0.06, -0.005, 0);
      action.add(knob);
      action.position.set(0.02, 0.02, 0.06);
      g.add(action);
      box(mag, 0.03, 0.06, 0.08, 0, -0.03, 0, magMat);
      magPos.set(0, -0.025, -0.06);
      info.leftHand.set(0, -0.05, -0.4);
      // Folded bipod.
      box(g, 0.012, 0.012, 0.2, 0.02, -0.06, -0.55, dark);
      box(g, 0.012, 0.012, 0.2, -0.02, -0.06, -0.55, dark);
      break;
    }
    case 'pump':
    case 'autoshotgun': {
      const auto = m.body === 'autoshotgun';
      box(g, 0.055, 0.08, 0.3, 0, 0.005, -0.06, body);
      box(g, 0.056, 0.01, 0.26, 0, 0.05, -0.06, dark);
      recvTop = 0.055;
      barrelZ = -0.2;
      if (!auto) {
        cyl(g, 0.014, 0.42, 0, -0.03, -0.42, dark); // mag tube
        action = cyl(g, 0.026, 0.18, 0, -0.03, -0.36, accent, 10); // pump forend
        box(g, 0.045, 0.075, 0.27, 0, -0.015, 0.21, accent); // wood stock
        info.leftHand.set(0, -0.045, -0.36);
      } else {
        box(g, 0.06, 0.06, 0.24, 0, 0.0, -0.32, body);
        box(g, 0.04, 0.08, 0.2, 0, 0.0, 0.2, dark);
        action = box(g, 0.015, 0.015, 0.03, 0.03, 0.03, -0.02, steel);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18), magMat);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, -0.08, 0);
        mag.add(drum);
        magPos.set(0, -0.02, -0.12);
        info.leftHand.set(0, -0.03, -0.32);
      }
      const grip = box(g, 0.036, 0.1, 0.045, 0, -0.07, 0.04, dark);
      grip.rotation.x = -0.3;
      break;
    }
    case 'lmg': {
      box(g, 0.07, 0.1, 0.38, 0, 0.01, -0.06, body);
      box(g, 0.075, 0.03, 0.22, 0, 0.075, -0.02, accent); // feed cover
      box(g, 0.074, 0.012, 0.1, 0, 0.095, -0.2, dark);
      recvTop = 0.1;
      box(g, 0.065, 0.065, 0.24, 0, 0.0, -0.36, body);
      for (let i = 0; i < 5; i++) box(g, 0.068, 0.012, 0.025, 0, 0.03, -0.26 - i * 0.045, dark);
      barrelZ = -0.47;
      box(g, 0.05, 0.08, 0.26, 0, -0.01, 0.22, dark);
      box(g, 0.012, 0.012, 0.22, 0.025, -0.05, -0.55, dark); // bipod
      box(g, 0.012, 0.012, 0.22, -0.025, -0.05, -0.55, dark);
      const grip = box(g, 0.036, 0.1, 0.045, 0, -0.075, 0.06, dark);
      grip.rotation.x = -0.3;
      action = box(g, 0.02, 0.02, 0.04, 0.04, 0.03, -0.08, steel);
      box(mag, 0.1, 0.12, 0.12, -0.03, -0.06, 0, mat(0x4a5038, 0.8, 0.2)); // ammo box
      magPos.set(-0.02, -0.03, -0.1);
      info.leftHand.set(-0.01, 0.08, -0.06); // top of feed cover (pistol-grip hold)
      info.leftHand.set(0, -0.03, -0.36);
      break;
    }
    case 'pistol':
    case 'deagle': {
      const big = m.body === 'deagle';
      const sl = big ? 0.24 : 0.19, sh = big ? 0.045 : 0.035;
      action = box(g, 0.032, sh, sl, 0, 0.045, -0.07, body); // slide
      box(g, 0.03, 0.025, sl * 0.85, 0, 0.012, -0.065, dark); // frame
      const grip = box(g, 0.03, 0.11, 0.05, 0, -0.045, 0.01, dark);
      grip.rotation.x = -0.18;
      box(g, 0.01, 0.025, 0.045, 0, -0.005, -0.04, dark);
      recvTop = 0.045 + sh / 2;
      barrelZ = -0.07 - sl / 2;
      box(mag, 0.024, 0.1, 0.04, 0, -0.05, 0, magMat);
      magPos.set(0, -0.0, 0.015);
      info.leftHand.set(-0.01, -0.06, 0.03); // two-handed grip
      break;
    }
    default:
      break;
  }

  // Barrel.
  const barrelLen = Math.max(0.05, Math.abs(barrelZ - muzzleZ));
  if (!pistol) {
    const r = m.body === 'lmg' || m.body === 'bolt' ? 0.014 : m.body === 'pump' || m.body === 'autoshotgun' ? 0.018 : 0.011;
    cyl(g, r, barrelLen, 0, m.body === 'pump' ? 0.012 : 0.01, (barrelZ + muzzleZ) / 2, steel);
    if (m.body === 'ar' || m.body === 'dmr' || m.body === 'ak') {
      // Front sight post block.
      box(g, 0.012, 0.045, 0.012, 0, 0.04, barrelZ - 0.02, dark);
    }
  } else {
    muzzleZ = barrelZ - 0.005;
  }

  // ---- attachments ----
  const barrelAtt = att.barrel;
  if (barrelAtt === 'long' && !pistol) { cyl(g, 0.012, 0.09, 0, 0.01, muzzleZ - 0.045, steel); muzzleZ -= 0.09; }
  if (barrelAtt === 'short' && !pistol) { muzzleZ += 0.06; }
  const muzzleY = pistol ? 0.045 : (m.body === 'pump' ? 0.012 : 0.01);
  if (att.muzzle === 'suppressor') {
    cyl(g, pistol ? 0.017 : 0.021, pistol ? 0.13 : 0.18, 0, muzzleY, muzzleZ - (pistol ? 0.065 : 0.09), mat(0x1a1b1c, 0.75, 0.35), 14);
    muzzleZ -= pistol ? 0.13 : 0.18;
  } else if (att.muzzle === 'compensator') {
    cyl(g, 0.017, 0.06, 0, muzzleY, muzzleZ - 0.03, dark, 6);
    muzzleZ -= 0.06;
  } else if (att.muzzle === 'flash') {
    cyl(g, 0.015, 0.06, 0, muzzleY, muzzleZ - 0.03, dark, 5);
    muzzleZ -= 0.06;
  }
  if (att.underbarrel === 'vgrip') {
    box(g, 0.03, 0.08, 0.03, 0, -0.05, info.leftHand.z, dark);
    info.leftHand.y -= 0.05;
  } else if (att.underbarrel === 'agrip') {
    const a = box(g, 0.03, 0.035, 0.07, 0, -0.03, info.leftHand.z + 0.02, dark);
    a.rotation.x = 0.5;
  } else if (att.underbarrel === 'laser') {
    box(g, 0.03, 0.03, 0.06, 0.035, 0.0, info.leftHand.z - 0.06, dark);
    const dot = box(g, 0.008, 0.008, 0.002, 0.035, 0.0, info.leftHand.z - 0.091, mat(0xff2020, 0.3, 0, { emissive: 0xff0000, emissiveIntensity: 3 }));
    void dot;
  }
  if (att.stock === 'heavy' && !pistol) box(g, 0.05, 0.03, 0.08, 0, 0.045, 0.24, dark);
  if (att.magazine === 'extended') {
    mag.scale.y = 1.35;
  }
  if (att.magazine === 'fast') {
    // Taped twin mag.
    const twin = mag.clone();
    twin.position.set(0.034, 0, 0);
    mag.add(twin);
  }

  // ---- optics ----
  const optic = att.optic ?? 'iron';
  const ry = recvTop;
  if (optic === 'iron') {
    if (pistol) {
      box(g, 0.006, 0.01, 0.006, 0, ry + 0.005, barrelZ + 0.012, dark); // front
      box(g, 0.012, 0.01, 0.006, -0.009, ry + 0.005, 0.0 - 0.02, dark);
      box(g, 0.012, 0.01, 0.006, 0.009, ry + 0.005, 0.0 - 0.02, dark);
      info.sightY = ry + 0.009;
    } else {
      // Rear aperture + front post.
      const rear = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.004, 6, 12), dark);
      rear.position.set(0, ry + 0.02, 0.02);
      g.add(rear);
      box(g, 0.02, 0.012, 0.012, 0, ry + 0.006, 0.02, dark);
      const fz = Math.min(barrelZ - 0.02, -0.4);
      box(g, 0.004, 0.026, 0.004, 0, ry + 0.007, fz, dark);
      box(g, 0.016, 0.008, 0.016, 0, ry + 0.004, fz, dark);
      info.sightY = ry + 0.02;
    }
  } else if (optic === 'reflex' || optic === 'holo') {
    const holo = optic === 'holo';
    const h = holo ? 0.05 : 0.04;
    const z = -0.06;
    box(g, holo ? 0.045 : 0.035, 0.012, holo ? 0.08 : 0.05, 0, ry + 0.006, z, dark); // base
    // Hollow frame (two posts + top).
    const fw = holo ? 0.045 : 0.034;
    box(g, 0.004, h, 0.012, -fw / 2, ry + h / 2 + 0.01, z - 0.02, dark);
    box(g, 0.004, h, 0.012, fw / 2, ry + h / 2 + 0.01, z - 0.02, dark);
    box(g, fw, 0.004, 0.02, 0, ry + h + 0.012, z - 0.02, dark);
    if (holo) box(g, fw, 0.03, 0.05, 0, ry + 0.022, z + 0.03, dark);
    // Glass + reticle.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(fw - 0.004, h - 0.004), new THREE.MeshStandardMaterial({ color: 0x88aaff, transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0.5 }));
    glass.position.set(0, ry + h / 2 + 0.012, z - 0.02);
    g.add(glass);
    const ret = makeReticleSprite(holo ? 'holo' : 'dot');
    ret.position.set(0, ry + h / 2 + 0.012, z - 0.021);
    ret.scale.setScalar(holo ? 0.022 : 0.012);
    g.add(ret);
    info.sightY = ry + h / 2 + 0.012;
  } else if (optic === 'acog' || optic === 'sniper8' || optic === 'thermal') {
    const long = optic !== 'acog';
    const len = long ? 0.3 : 0.16, r = long ? 0.022 : 0.019;
    const oy = ry + 0.035;
    box(g, 0.02, 0.025, 0.08, 0, ry + 0.012, -0.05, dark);
    cyl(g, r, len, 0, oy, -0.06, mat(0x1d1e1f, 0.5, 0.5), 16);
    cyl(g, r * 1.35, 0.06, 0, oy, -0.06 - len / 2 - 0.02, mat(0x1d1e1f, 0.5, 0.5), 16, r);
    cyl(g, r * 1.2, 0.04, 0, oy, -0.06 + len / 2 + 0.01, mat(0x1d1e1f, 0.5, 0.5), 16);
    if (optic === 'thermal') box(g, 0.05, 0.04, 0.08, 0, oy, -0.04, mat(0x2a2c2e, 0.6, 0.3));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 1.3, 16), new THREE.MeshStandardMaterial({ color: 0x223355, roughness: 0.05, metalness: 0.9, emissive: 0x081020 }));
    lens.position.set(0, oy, -0.06 - len / 2 - 0.051);
    lens.rotation.y = Math.PI;
    g.add(lens);
    if (long) cyl(g, 0.008, 0.03, 0, oy + r + 0.012, -0.06, dark); // turret
    info.sightY = oy;
  }
  if (pistol && optic === 'iron') info.sightY = ry + 0.009;

  // Where the left hand grips the magazine during reloads (lower third of the mag,
  // measured with the mag at its own origin so it can follow the mag's animation).
  mag.updateMatrixWorld(true);
  const magBox = new THREE.Box3().setFromObject(mag);
  if (magBox.isEmpty()) magBox.set(new THREE.Vector3(-0.02, -0.1, -0.03), new THREE.Vector3(0.02, 0, 0.03));
  info.magGrip = new THREE.Vector3(
    (magBox.min.x + magBox.max.x) / 2 - 0.012,
    magBox.min.y + (magBox.max.y - magBox.min.y) * 0.3,
    (magBox.min.z + magBox.max.z) / 2,
  );

  // Mag group placement.
  mag.position.copy(magPos);
  g.add(mag);
  info.mag = mag;
  info.magHome = magPos.clone();
  info.action = action;
  info.actionHome = action ? action.position.clone() : null;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, muzzleY, muzzleZ);
  g.add(muzzle);
  info.muzzle = muzzle;
  info.muzzleZ = muzzleZ;

  g.traverse((o) => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
  });
  return info;
}

const reticleCache = {};
function makeReticleSprite(kind) {
  if (!reticleCache[kind]) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.strokeStyle = x.fillStyle = '#ff3a2a';
    x.shadowColor = '#ff0000';
    x.shadowBlur = 6;
    if (kind === 'holo') {
      x.lineWidth = 3;
      x.beginPath(); x.arc(32, 32, 22, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.arc(32, 32, 3.5, 0, Math.PI * 2); x.fill();
    } else {
      x.beginPath(); x.arc(32, 32, 7, 0, Math.PI * 2); x.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    reticleCache[kind] = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), reticleCache[kind]);
  m.rotation.y = Math.PI; // face the eye (+Z)
  m.renderOrder = 10;
  return m;
}

/** Simple first-person arms (sleeves + gloves). Returns { left, right, update(leftTarget, rightTarget) }. */
export function buildArms(sleeveColor = 0x4d5340) {
  const sleeve = mat(sleeveColor, 0.95, 0);
  const glove = mat(0x3d3b33, 0.85, 0.05);
  const make = () => {
    const arm = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.4), sleeve);
    fore.position.z = -0.2;
    arm.add(fore);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), mat(0x2a2c26, 0.9, 0));
    cuff.position.z = -0.38;
    arm.add(cuff);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.1), glove);
    hand.position.z = -0.45;
    arm.add(hand);
    return arm;
  };
  const left = make(), right = make();
  const tmp = new THREE.Vector3();
  return {
    left, right,
    /** Points each arm from a fixed elbow at the screen edge to its hand target (both in the same space). */
    place(arm, elbow, target) {
      arm.position.copy(elbow);
      tmp.subVectors(target, elbow);
      const len = tmp.length();
      arm.lookAt(tmp.add(elbow));
      arm.rotateY(Math.PI); // lookAt points +Z; arm geometry extends along -Z
      arm.scale.set(1, 1, len / 0.47);
    },
  };
}
