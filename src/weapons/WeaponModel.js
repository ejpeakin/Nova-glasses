// Procedural first-person weapon models.
//
// Parts are cut from side-profile silhouettes (extruded with bevelled edges) and
// cross-section profiles, so receivers, stocks, grips and curved magazines have
// real outlines. Details: picatinny rails with teeth, slotted handguards, gas
// blocks, flash hiders, ejection ports, charging handles, selectors, sights and
// optics. Surfaces use anodised metal, stippled polymer and wood-grain textures.
//
// Weapon space: barrel points down -Z, +Y up, origin at the top of the firing grip.
import * as THREE from '../lib/three.js';
import { handsReady, makeHand } from './Hands.js';

// ---------------------------------------------------------------------------
// Surface textures (generated once).

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const make = (paint, repeat) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    paint(g, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    return t;
  };
  const noise = (g, s, base, amp, size = 1) => {
    const img = g.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = base + (Math.random() - 0.5) * amp;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (size > 1) { g.drawImage(g.canvas, 0, 0, s / size, s / size); g.drawImage(g.canvas, 0, 0, s / size, s / size, 0, 0, s, s); }
  };
  TEX = {
    // Anodised / Cerakote finish: fine grain plus light handling wear.
    finish: make((g, s) => {
      noise(g, s, 215, 40);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 40; i++) {
        g.lineWidth = Math.random() * 1.2;
        const x = Math.random() * s, y = Math.random() * s;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 6); g.stroke();
      }
    }, 9),
    // Aggressive grip stipple.
    stipple: make((g, s) => {
      g.fillStyle = '#888'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) {
        const v = Math.random() < 0.5 ? 40 : 230;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 0.8 + Math.random() * 1.6, 0, Math.PI * 2); g.fill();
      }
    }, 14),
    // Walnut grain running along the weapon.
    wood: (() => {
      const t = make((g, s) => {
        g.fillStyle = '#b07a4c'; g.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y++) {
          const k = Math.sin(y * 0.21 + Math.sin(y * 0.05) * 3) * 0.5 + 0.5;
          g.fillStyle = `rgba(70,35,15,${0.08 + k * 0.28})`;
          g.fillRect(0, y, s, 1);
        }
        for (let i = 0; i < 60; i++) {
          g.strokeStyle = `rgba(50,25,10,${Math.random() * 0.35})`;
          g.lineWidth = Math.random() * 1.5;
          const y = Math.random() * s;
          g.beginPath(); g.moveTo(0, y);
          g.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 10, s * 0.7, y + (Math.random() - 0.5) * 10, s, y);
          g.stroke();
        }
      }, 5);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
    // Fabric for sleeves.
    cloth: make((g, s) => {
      g.fillStyle = '#9a9a8a'; g.fillRect(0, 0, s, s);
      const cols = ['rgba(60,62,48,0.55)', 'rgba(130,126,98,0.5)', 'rgba(42,44,36,0.5)'];
      for (let i = 0; i < 80; i++) {
        g.fillStyle = cols[i % 3];
        g.beginPath();
        const x = Math.random() * s, y = Math.random() * s;
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 40);
        g.fill();
      }
      for (let y = 0; y < s; y += 2) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, s, 1); }
    }, 7),
  };
  TEX.cloth.colorSpace = THREE.SRGBColorSpace;
  return TEX;
}

const matCache = new Map();
function material(kind, color, extra = {}) {
  const key = `${kind}:${color}:${JSON.stringify(extra)}`;
  if (matCache.has(key)) return matCache.get(key);
  const t = textures();
  let m;
  switch (kind) {
    case 'alu': // anodised aluminium receivers
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.55, roughnessMap: t.finish, bumpMap: t.finish, bumpScale: 0.6 });
      break;
    case 'steel': // barrels, bolts, pins
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.88, roughnessMap: t.finish });
      break;
    case 'park': // parkerised steel (AK, shotgun)
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.6, roughnessMap: t.finish, bumpMap: t.finish, bumpScale: 0.8 });
      break;
    case 'poly': // polymer furniture
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04, bumpMap: t.finish, bumpScale: 0.5 });
      break;
    case 'grip': // stippled grips
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02, bumpMap: t.stipple, bumpScale: 1.6 });
      break;
    case 'wood':
      m = new THREE.MeshStandardMaterial({ color, map: t.wood, roughness: 0.5, metalness: 0, bumpMap: t.wood, bumpScale: 0.4 });
      break;
    case 'rubber':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, bumpMap: t.stipple, bumpScale: 0.6 });
      break;
    case 'brass':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.95 });
      break;
    case 'glass':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      break;
    case 'lens':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.04, metalness: 0.95, emissive: 0x150a24, emissiveIntensity: 0.6 });
      break;
    case 'emissive':
      m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5, roughness: 0.4 });
      break;
    case 'inner':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...extra });
  }
  matCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------
// Geometry helpers.

function makeShape(pts, ShapeType = THREE.Shape) {
  const s = new ShapeType();
  pts.forEach((p, i) => {
    if (p[0] === 'q') s.quadraticCurveTo(p[1], p[2], p[3], p[4]);
    else if (i === 0) s.moveTo(p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  });
  return s;
}

/** Side-profile part: pts are [z, y] (or ['q', cz, cy, z, y]); extruded `width` along X. */
function prism(parent, pts, width, m, { x = 0, bevel = 0.0022, holes = null, curve = 8 } = {}) {
  const shape = makeShape(pts);
  if (holes) for (const h of holes) shape.holes.push(makeShape(h, THREE.Path));
  const b = Math.min(bevel, width * 0.28);
  const depth = Math.max(0.0004, width - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.85, bevelSegments: 2, curveSegments: curve });
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2 + x, 0, 0);
  const mesh = new THREE.Mesh(geo, m);
  parent.add(mesh);
  return mesh;
}

/** Cross-section part: pts are [x, y]; extruded from zA to zB along Z. */
function prismZ(parent, pts, zA, zB, m, { bevel = 0.0015, curve = 8 } = {}) {
  const shape = makeShape(pts);
  const len = Math.abs(zB - zA);
  const b = Math.min(bevel, len * 0.2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0004, len - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 2, curveSegments: curve });
  geo.translate(0, 0, Math.min(zA, zB) + b);
  const mesh = new THREE.Mesh(geo, m);
  parent.add(mesh);
  return mesh;
}

function box(parent, w, h, d, x, y, z, m, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

/** Cylinder along Z between zA and zB (rA radius at zA, rB at zB). */
function tube(parent, rA, rB, zA, zB, x, y, m, seg = 16, open = false) {
  const len = Math.abs(zB - zA);
  // CylinderGeometry radiusTop is at +Y, which maps to +Z after rotating.
  const front = Math.min(zA, zB) === zA ? rA : rB, back = Math.min(zA, zB) === zA ? rB : rA;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(back, front, len, seg, 1, open), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, (zA + zB) / 2);
  parent.add(mesh);
  return mesh;
}

/** Cylinder along X (pins, knobs, turrets on the side). */
function knobX(parent, r, len, x, y, z, m, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function knobY(parent, r, len, x, y, z, m, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Picatinny rail from zA (rear) to zB (front) sitting on y, with cross-slot teeth. */
function rail(parent, zA, zB, y, m, { x = 0, width = 0.021, axis = 'y' } = {}) {
  const pts = [[zA, y], [zA, y + 0.0095]];
  const pitch = 0.01;
  for (let z = zA; z > zB + pitch; z -= pitch) {
    pts.push([z - 0.0015, y + 0.0095], [z - 0.0015, y + 0.0062], [z - 0.0055, y + 0.0062], [z - 0.0055, y + 0.0095]);
  }
  pts.push([zB, y + 0.0095], [zB, y]);
  const mesh = prism(parent, pts, width, m, { x, bevel: 0.0007, curve: 1 });
  if (axis === 'side') { mesh.rotation.z = -Math.PI / 2; }
  return mesh;
}

function slots(zFrom, zTo, yLow, yHigh, n) {
  const holes = [];
  const span = (zFrom - zTo) / n;
  for (let i = 0; i < n; i++) {
    const a = zFrom - i * span - span * 0.2, b = a - span * 0.6;
    holes.push([[a, yLow], [a, yHigh], [b, yHigh], [b, yLow]]);
  }
  return holes;
}

function pistolGrip(parent, m, { z = 0.03, y = -0.024, angle = 1, len = 0.11 } = {}) {
  const k = angle;
  const pts = [
    [z, y], [z + 0.042, y], [z + 0.05, y - 0.014],
    [z + 0.05 + 0.03 * k, y - len], ['q', z + 0.05 + 0.032 * k, y - len - 0.012, z + 0.04 + 0.03 * k, y - len - 0.012],
    [z + 0.012 + 0.026 * k, y - len - 0.012],
    [z + 0.006 + 0.024 * k, y - len + 0.01], [z + 0.002 + 0.018 * k, y - len * 0.65], [z + 0.008 + 0.014 * k, y - len * 0.55],
    [z + 0.0 + 0.01 * k, y - len * 0.42], [z + 0.004 + 0.006 * k, y - len * 0.3], [z - 0.002, y - 0.02],
  ];
  return prism(parent, pts, 0.03, m, { bevel: 0.006 });
}

function triggerGroup(parent, z, y, metal, frame) {
  // Trigger guard (with opening) and trigger blade.
  prism(parent, [[z, y], [z, y - 0.026], [z - 0.068, y - 0.026], [z - 0.068, y]], 0.011, frame,
    { holes: [[[z - 0.006, y - 0.004], [z - 0.006, y - 0.02], [z - 0.062, y - 0.02], [z - 0.062, y - 0.004]]], bevel: 0.0015 });
  prism(parent, [[z - 0.024, y], [z - 0.028, y - 0.01], [z - 0.033, y - 0.016], ['q', z - 0.036, y - 0.021, z - 0.031, y - 0.02], [z - 0.026, y - 0.014], [z - 0.019, y]], 0.005, metal, { bevel: 0.0008 });
}

function flashHider(parent, z, y, steel, dark) {
  tube(parent, 0.0105, 0.0105, z, z - 0.048, 0, y, steel, 14);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    box(parent, 0.003, 0.0035, 0.026, Math.cos(a) * 0.0105, y + Math.sin(a) * 0.0105, z - 0.03, dark, 0, 0, a);
  }
}

// ---------------------------------------------------------------------------

/**
 * Returns { group, muzzle, sightY, mag, magHome, magGrip, action, actionHome,
 *           leftHand, rightHand, ejection, muzzleZ }.
 */
export function buildWeaponModel(def, att = {}) {
  const m = def.model;
  const g = new THREE.Group();
  const body = m.body;
  const wood = m.accent === 0x6b4a2e || m.accent === 0x5a3f28;
  const tan = (m.color >> 16) > 0x70; // FDE / stainless finishes
  const alu = material('alu', m.color);
  const park = material('park', 0x26272a);
  const steel = material('steel', 0x2b2d30);
  const bright = material('steel', 0x5c6066);
  const dark = material('alu', 0x111213);
  const poly = material('poly', wood ? 0x1c1c1d : (tan ? 0x1d1e1f : m.accent));
  const furn = wood ? material('wood', 0x8a5f42) : material('poly', tan ? m.color : 0x202123);
  const gripM = material('grip', tan && body !== 'deagle' ? m.color : 0x1b1c1d);
  const rubber = material('rubber', 0x141414);
  const magM = body === 'ak' ? material('park', 0x3b2a1e) : material('poly', tan ? 0x7d6a50 : 0x26282a);
  const brass = material('brass', 0xb8903c);
  const info = {
    group: g, sightY: 0.07, leftHand: new THREE.Vector3(0, -0.03, -0.3), rightHand: new THREE.Vector3(0, -0.055, 0.05),
    ejection: new THREE.Vector3(0.03, 0.03, -0.03),
  };
  let recvTop = 0.054; // top of the optics rail
  let muzzleY = 0.02;
  let muzzleZ = -m.len + 0.12;
  let opticZ = -0.03;
  const magPos = new THREE.Vector3(0, -0.015, -0.11);
  const mag = new THREE.Group();
  let action = null;
  let railOn = true;
  let irons = 'ar';
  const pistol = body === 'pistol' || body === 'deagle';

  const stanag = (h = 0.17, curve = 0.02) => {
    prism(mag, [[-0.032, 0.02], [0.032, 0.02], [0.032, -h * 0.7], ['q', 0.03, -h * 0.95, 0.022 - curve * 0.5, -h], [-0.04 - curve * 0.5, -h], ['q', -0.038, -h * 0.85, -0.032, -h * 0.7]], 0.024, magM, { bevel: 0.003 });
    prism(mag, [[-0.046 - curve * 0.5, -h + 0.004], [0.026 - curve * 0.5, -h + 0.004], [0.028 - curve * 0.5, -h - 0.009], [-0.048 - curve * 0.5, -h - 0.009]], 0.03, magM, { bevel: 0.003 });
    for (let i = 0; i < 3; i++) box(mag, 0.026, 0.004, 0.05, 0, -0.03 - i * 0.03, -0.002 - i * 0.003, magM);
    tube(mag, 0.0045, 0.0045, 0.02, -0.02, 0, 0.026, brass, 8);
    tube(mag, 0.0045, 0.001, -0.02, -0.032, 0, 0.026, material('brass', 0xa0602a), 8);
  };

  switch (body) {
    // ----------------------------------------------------- AR-15 family
    case 'ar':
    case 'dmr': {
      const hg = body === 'dmr' ? 0.38 : 0.3;
      // Lower receiver with flared magwell.
      prism(g, [[0.078, 0.0], [-0.165, 0.0], [-0.165, -0.022], [-0.15, -0.03], [-0.148, -0.05], [-0.072, -0.05], [-0.07, -0.028], [-0.0, -0.024], [0.062, -0.024], [0.08, -0.01]], 0.046, alu);
      // Upper receiver.
      prism(g, [[0.085, 0.0], [0.085, 0.036], [0.072, 0.045], [-0.17, 0.045], [-0.17, 0.0]], 0.044, alu);
      box(g, 0.002, 0.016, 0.052, 0.0225, 0.023, -0.022, dark); // ejection port
      box(g, 0.003, 0.019, 0.058, 0.0245, 0.023, -0.022, alu); // dust cover
      knobX(g, 0.0016, 0.004, 0.026, 0.013, -0.05, bright, 6); // dust cover hinge
      tube(g, 0.008, 0.008, 0.058, 0.03, 0.026, 0.03, alu, 10); // forward assist
      box(g, 0.006, 0.011, 0.012, 0.025, 0.038, 0.006, alu); // brass deflector
      box(g, 0.003, 0.012, 0.018, -0.024, -0.008, -0.068, alu); // bolt catch
      knobX(g, 0.005, 0.004, 0.025, -0.014, -0.066, dark, 10); // mag release
      knobX(g, 0.008, 0.003, -0.025, -0.012, 0.035, dark, 12); // selector
      box(g, 0.003, 0.004, 0.02, -0.027, -0.012, 0.03, dark, 0.5);
      for (const z of [0.062, -0.152]) knobX(g, 0.0035, 0.05, 0, -0.008, z, bright, 8); // takedown pins
      rail(g, 0.08, -0.17, 0.045, alu);
      // Free-float handguard with M-LOK slots (you can see the barrel through them).
      const hz = -0.172, he = -0.172 - hg;
      prism(g, [[hz, -0.024], [hz, 0.045], [he, 0.045], [he, -0.016], ['q', he, -0.024, he + 0.008, -0.024]], 0.054, alu,
        { holes: slots(hz - 0.01, he + 0.01, -0.012, 0.004, Math.round(hg / 0.06)), bevel: 0.003 });
      rail(g, hz, he + 0.002, 0.045, alu);
      tube(g, 0.016, 0.016, hz + 0.004, hz - 0.012, 0, 0.022, dark, 14); // barrel nut
      // Buffer tube, castle nut and stock.
      tube(g, 0.0155, 0.0155, 0.085, 0.255, 0, 0.02, alu, 16);
      tube(g, 0.018, 0.018, 0.088, 0.098, 0, 0.02, dark, 10);
      if (body === 'dmr') {
        prism(g, [[0.17, 0.035], [0.25, 0.05], [0.34, 0.048], [0.35, 0.04], [0.35, -0.07], [0.33, -0.075], [0.3, -0.04], [0.22, -0.03], [0.17, -0.005]], 0.042, furn, { bevel: 0.005 });
        box(g, 0.03, 0.012, 0.11, 0, 0.058, 0.27, furn); // cheek riser
      } else {
        prism(g, [[0.17, 0.04], [0.31, 0.044], [0.322, 0.038], [0.322, -0.058], [0.305, -0.064], [0.27, -0.03], [0.2, -0.014], [0.17, -0.004]], 0.04, furn,
          { holes: [[[0.205, 0.02], [0.27, 0.022], [0.27, 0.008], [0.21, 0.006]]], bevel: 0.005 });
      }
      box(g, 0.043, 0.112, 0.012, 0, -0.008, body === 'dmr' ? 0.356 : 0.327, rubber); // butt pad
      pistolGrip(g, gripM);
      triggerGroup(g, 0.0, -0.024, steel, alu);
      // Charging handle (racked on empty reloads).
      action = new THREE.Group();
      box(action, 0.012, 0.007, 0.03, 0, 0, 0, alu);
      box(action, 0.042, 0.006, 0.008, 0, 0, 0.016, alu);
      action.position.set(0, 0.04, 0.09);
      g.add(action);
      stanag(body === 'dmr' ? 0.14 : 0.17, body === 'dmr' ? 0.008 : 0.02);
      muzzleY = 0.022;
      info.leftHand.set(0, -0.038, -0.172 - hg * 0.5);
      opticZ = -0.03;
      break;
    }
    // ----------------------------------------------------- AK pattern
    case 'ak': {
      // Stamped receiver, curved dust cover, rear sight block.
      prism(g, [[0.11, -0.025], [0.11, 0.03], [0.09, 0.034], [-0.19, 0.034], [-0.2, 0.02], [-0.2, -0.025]], 0.046, park);
      prismZ(g, [[-0.022, 0.03], [-0.022, 0.038], ['q', -0.019, 0.054, 0, 0.056], ['q', 0.019, 0.054, 0.022, 0.038], [0.022, 0.03]], -0.17, 0.1, park);
      box(g, 0.042, 0.022, 0.05, 0, 0.044, -0.2, park); // rear sight block
      prism(g, [[-0.19, 0.055], [-0.24, 0.058], [-0.24, 0.062], [-0.19, 0.062]], 0.03, park); // tangent leaf
      for (const z of [0.07, -0.02, -0.12]) knobX(g, 0.0035, 0.05, 0, -0.012, z, bright, 8); // rivets
      box(g, 0.004, 0.016, 0.07, 0.024, 0.008, -0.08, park, 0, 0, 0); // safety lever
      // Wooden handguards, gas tube.
      prism(g, [[-0.22, -0.026], [-0.23, -0.03], [-0.42, -0.026], [-0.425, -0.018], [-0.425, 0.018], [-0.22, 0.024]], 0.052, furn, { bevel: 0.005 });
      prismZ(g, [[-0.02, 0.04], [-0.02, 0.05], ['q', -0.018, 0.068, 0, 0.07], ['q', 0.018, 0.068, 0.02, 0.05], [0.02, 0.04]], -0.4, -0.24, furn, { bevel: 0.003 });
      tube(g, 0.011, 0.011, -0.2, -0.24, 0, 0.052, park, 12);
      box(g, 0.026, 0.04, 0.035, 0, 0.034, -0.445, park); // gas block
      // Fixed wooden stock.
      prism(g, [[0.105, 0.028], [0.13, 0.026], [0.35, 0.002], [0.362, -0.004], [0.362, -0.086], [0.35, -0.092], [0.2, -0.048], [0.13, -0.03], [0.105, -0.02]], 0.042, furn, { bevel: 0.006 });
      box(g, 0.044, 0.094, 0.008, 0, -0.043, 0.366, park); // butt plate
      pistolGrip(g, material('grip', 0x3a2618), { z: 0.035, angle: 1.3 });
      triggerGroup(g, 0.005, -0.025, park, park);
      // Charging handle on the right side.
      action = new THREE.Group();
      knobX(action, 0.0065, 0.026, 0.012, 0, 0, park, 10);
      box(action, 0.004, 0.006, 0.05, 0.002, 0, 0.02, park);
      action.position.set(0.023, 0.026, 0.02);
      g.add(action);
      // Banana magazine.
      prism(mag, [[-0.034, 0.02], [0.034, 0.02], [0.032, -0.05], ['q', 0.02, -0.15, -0.045, -0.196], [-0.105, -0.18], ['q', -0.05, -0.11, -0.036, -0.04]], 0.026, magM, { bevel: 0.0035 });
      for (let i = 0; i < 4; i++) box(mag, 0.028, 0.004, 0.012, 0, -0.03 - i * 0.04, -0.03 - i * i * 0.006, magM);
      tube(mag, 0.0048, 0.0048, 0.02, -0.02, 0, 0.026, brass, 8);
      magPos.set(0, -0.022, -0.11);
      muzzleY = 0.018;
      info.leftHand.set(0, -0.036, -0.32);
      railOn = false;
      irons = 'ak';
      opticZ = -0.05;
      recvTop = 0.058;
      break;
    }
    // ----------------------------------------------------- SCAR-style battle rifle
    case 'scar': {
      prism(g, [[0.1, 0.0], [0.1, 0.055], [-0.245, 0.055], [-0.262, 0.035], [-0.262, 0.0]], 0.05, alu);
      rail(g, 0.1, -0.262, 0.055, alu);
      rail(g, -0.13, -0.25, 0.012, alu, { x: 0.03, width: 0.016 });
      box(g, 0.002, 0.018, 0.05, 0.026, 0.028, -0.02, dark); // ejection port
      // Polymer lower.
      prism(g, [[0.08, 0.0], [-0.16, 0.0], [-0.16, -0.022], [-0.148, -0.05], [-0.072, -0.05], [-0.07, -0.026], [0.06, -0.024], [0.08, -0.01]], 0.048, poly);
      knobX(g, 0.008, 0.003, -0.026, -0.012, 0.035, dark, 12);
      // Folding skeleton stock with cheek riser.
      prism(g, [[0.1, 0.048], [0.33, 0.042], [0.342, 0.032], [0.342, -0.072], [0.322, -0.076], [0.24, -0.03], [0.1, -0.012]], 0.04, alu,
        { holes: [[[0.15, 0.028], [0.29, 0.024], [0.29, -0.012], [0.21, -0.012]]], bevel: 0.005 });
      box(g, 0.032, 0.014, 0.12, 0, 0.056, 0.25, poly);
      box(g, 0.042, 0.11, 0.012, 0, -0.016, 0.346, rubber);
      pistolGrip(g, gripM);
      triggerGroup(g, 0.0, -0.024, steel, poly);
      // Left-side reciprocating charging handle.
      action = new THREE.Group();
      knobX(action, 0.007, 0.022, -0.011, 0, 0, poly, 10);
      action.position.set(-0.026, 0.036, -0.12);
      g.add(action);
      // 20-round steel box mag.
      prism(mag, [[-0.034, 0.02], [0.034, 0.02], [0.034, -0.118], [-0.04, -0.118]], 0.027, material('park', 0x2a2b2d), { bevel: 0.003 });
      box(mag, 0.032, 0.01, 0.078, 0, -0.122, -0.003, material('park', 0x2a2b2d));
      tube(mag, 0.005, 0.005, 0.02, -0.02, 0, 0.026, brass, 8);
      muzzleY = 0.024;
      recvTop = 0.0645;
      info.leftHand.set(0, -0.01, -0.21);
      opticZ = -0.02;
      break;
    }
    // ----------------------------------------------------- SMGs
    case 'smg':
    case 'vector': {
      const isV = body === 'vector';
      if (isV) {
        // Vector-style slanted lower housing.
        prism(g, [[0.07, 0.0], [0.07, 0.052], [-0.15, 0.052], [-0.2, 0.01], [-0.2, -0.045], [-0.15, -0.06], [-0.1, -0.06], [-0.06, -0.022], [0.0, -0.022]], 0.05, alu);
        tube(g, 0.018, 0.018, -0.2, -0.27, 0, 0.026, poly, 14); // barrel shroud
        magPos.set(0, -0.03, -0.15);
        info.leftHand.set(0, -0.06, -0.15);
      } else {
        prism(g, [[0.07, 0.0], [0.07, 0.04], [-0.13, 0.04], [-0.13, 0.0]], 0.046, alu);
        prism(g, [[0.06, 0.0], [-0.13, 0.0], [-0.13, -0.018], [-0.12, -0.05], [-0.06, -0.05], [-0.055, -0.022], [0.06, -0.022]], 0.044, poly);
        prism(g, [[-0.13, -0.02], [-0.13, 0.04], [-0.235, 0.04], [-0.235, -0.02]], 0.05, alu, { holes: slots(-0.14, -0.225, -0.008, 0.008, 2), bevel: 0.003 });
        rail(g, -0.13, -0.234, 0.04, alu);
        magPos.set(0, -0.02, -0.09);
        info.leftHand.set(0, -0.032, -0.19);
      }
      const top = isV ? 0.052 : 0.04;
      rail(g, 0.068, isV ? -0.15 : -0.13, top, alu);
      recvTop = top + 0.0095;
      box(g, 0.002, 0.014, 0.04, 0.024, top * 0.55, -0.02, dark);
      pistolGrip(g, gripM, { len: 0.1 });
      triggerGroup(g, 0.0, -0.022, steel, poly);
      // Folding wire stock.
      prism(g, [[0.07, 0.03], [0.26, 0.026], [0.27, 0.016], [0.27, -0.06], [0.255, -0.064], [0.07, -0.01]], 0.03, alu,
        { holes: [[[0.09, 0.018], [0.25, 0.014], [0.25, -0.048], [0.09, -0.004]]], bevel: 0.003 });
      box(g, 0.034, 0.09, 0.01, 0, -0.022, 0.274, rubber);
      action = new THREE.Group();
      box(action, 0.012, 0.007, 0.024, 0, 0, 0, alu);
      box(action, 0.036, 0.006, 0.007, 0, 0, 0.012, alu);
      action.position.set(0, top - 0.006, 0.075);
      g.add(action);
      // 9 mm / .45 stick magazine.
      prism(mag, [[-0.02, 0.02], [0.02, 0.02], [0.022, -0.15], [-0.024, -0.15]], 0.022, magM, { bevel: 0.003 });
      box(mag, 0.026, 0.01, 0.05, 0, -0.152, -0.001, magM);
      tube(mag, 0.0045, 0.0045, 0.012, -0.014, 0, 0.025, brass, 8);
      muzzleY = isV ? 0.026 : 0.02;
      opticZ = -0.03;
      break;
    }
    // ----------------------------------------------------- Bolt-action precision rifle
    case 'bolt': {
      // Chassis forend with slots, round receiver, thumbhole stock.
      prism(g, [[-0.1, -0.045], [-0.1, 0.012], [-0.6, 0.012], [-0.6, -0.034], ['q', -0.6, -0.045, -0.59, -0.045]], 0.058, alu,
        { holes: slots(-0.13, -0.58, -0.03, -0.004, 6), bevel: 0.003 });
      prism(g, [[0.105, -0.03], [0.105, 0.0], [-0.1, 0.0], [-0.1, -0.03]], 0.05, alu);
      tube(g, 0.022, 0.022, 0.11, -0.13, 0, 0.022, steel, 18); // round action
      box(g, 0.002, 0.016, 0.06, 0.022, 0.026, -0.0, dark); // ejection port
      rail(g, 0.11, -0.3, 0.042, alu);
      prism(g, [[0.1, 0.0], [0.41, 0.006], [0.425, -0.004], [0.425, -0.12], [0.405, -0.125], [0.3, -0.06], [0.16, -0.058], [0.13, -0.09], [0.1, -0.06]], 0.046, furn,
        { holes: [[[0.17, -0.016], [0.27, -0.014], [0.27, -0.04], [0.18, -0.044]]], bevel: 0.006 });
      box(g, 0.036, 0.016, 0.13, 0, 0.022, 0.27, furn); // adjustable cheek piece
      knobY(g, 0.004, 0.03, 0, 0.005, 0.24, bright, 8);
      box(g, 0.048, 0.125, 0.014, 0, -0.06, 0.432, rubber);
      box(g, 0.016, 0.05, 0.016, 0, -0.14, 0.36, alu); // monopod
      pistolGrip(g, gripM, { z: 0.035, angle: 0.6 });
      triggerGroup(g, 0.01, -0.03, steel, alu);
      // Bolt handle with knob.
      action = new THREE.Group();
      box(action, 0.05, 0.009, 0.009, 0.024, 0, 0, steel);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 12, 8), steel);
      knob.position.set(0.052, -0.006, 0);
      action.add(knob);
      action.position.set(0.016, 0.022, 0.075);
      g.add(action);
      // Short box magazine.
      prism(mag, [[-0.04, 0.02], [0.04, 0.02], [0.04, -0.045], [-0.044, -0.045]], 0.03, material('park', 0x232426), { bevel: 0.003 });
      tube(mag, 0.0055, 0.0055, 0.03, -0.03, 0, 0.026, brass, 8);
      magPos.set(0, -0.03, -0.055);
      // Folded bipod.
      for (const s of [-1, 1]) box(g, 0.01, 0.01, 0.2, s * 0.014, -0.058, -0.5, dark);
      box(g, 0.04, 0.02, 0.03, 0, -0.05, -0.58, dark);
      muzzleY = 0.022;
      info.leftHand.set(0, -0.06, -0.42);
      info.rightHand.set(0, -0.062, 0.06);
      opticZ = -0.03;
      irons = 'none';
      break;
    }
    // ----------------------------------------------------- Shotguns
    case 'pump':
    case 'autoshotgun': {
      const auto = body === 'autoshotgun';
      prism(g, [[0.09, -0.035], [0.09, 0.03], [0.07, 0.046], [-0.16, 0.046], [-0.16, -0.035]], 0.05, auto ? alu : park);
      box(g, 0.002, 0.026, 0.065, 0.026, 0.016, -0.04, dark); // ejection port
      box(g, 0.03, 0.002, 0.07, 0, -0.036, -0.06, dark); // loading port
      triggerGroup(g, 0.02, -0.035, steel, auto ? poly : park);
      muzzleY = 0.025;
      recvTop = 0.0555;
      if (!auto) {
        tube(g, 0.012, 0.012, -0.16, muzzleZ, 0, 0.026, park, 16); // barrel
        box(g, 0.006, 0.004, Math.abs(muzzleZ + 0.16), 0, 0.04, (muzzleZ - 0.16) / 2, park); // vent rib
        tube(g, 0.0125, 0.0125, -0.16, -0.62, 0, -0.012, park, 14); // magazine tube
        tube(g, 0.014, 0.014, -0.62, -0.645, 0, -0.012, steel, 12); // tube cap
        // Wooden pump with grooves (slides on cycling).
        action = new THREE.Group();
        tube(action, 0.024, 0.024, 0.1, -0.1, 0, 0, furn, 18);
        for (let i = 0; i < 6; i++) tube(action, 0.0245, 0.0245, -0.06 + i * 0.022, -0.068 + i * 0.022, 0, 0, dark, 18);
        action.position.set(0, -0.012, -0.32);
        g.add(action);
        // Straight wooden stock with grip wrist.
        prism(g, [[0.088, 0.03], [0.37, 0.004], [0.37, -0.108], [0.35, -0.112], [0.17, -0.05], [0.12, -0.044], [0.088, -0.035]], 0.044, furn, { bevel: 0.007 });
        box(g, 0.045, 0.115, 0.012, 0, -0.054, 0.377, rubber);
        info.leftHand.set(0, -0.044, -0.32);
        info.rightHand.set(0, -0.05, 0.12);
        irons = 'bead';
      } else {
        rail(g, 0.088, -0.16, 0.046, alu);
        prism(g, [[-0.16, -0.025], [-0.16, 0.044], [-0.36, 0.04], [-0.36, -0.02]], 0.056, poly, { holes: slots(-0.17, -0.35, 0.006, 0.026, 4) });
        tube(g, 0.013, 0.013, -0.16, muzzleZ, 0, 0.025, steel, 14);
        prism(g, [[0.09, 0.03], [0.32, 0.026], [0.33, 0.016], [0.33, -0.09], [0.31, -0.094], [0.2, -0.05], [0.09, -0.03]], 0.044, poly, { bevel: 0.006 });
        box(g, 0.046, 0.11, 0.012, 0, -0.03, 0.336, rubber);
        pistolGrip(g, gripM, { z: 0.045, y: -0.035 });
        action = new THREE.Group();
        knobX(action, 0.007, 0.024, 0.012, 0, 0, poly, 10);
        action.position.set(0.026, 0.026, -0.04);
        g.add(action);
        // Drum magazine.
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.052, 28), magM);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, -0.085, 0);
        mag.add(drum);
        for (const s of [-1, 1]) knobX(mag, 0.03, 0.006, s * 0.028, -0.085, 0, dark, 18);
        box(mag, 0.05, 0.03, 0.05, 0, -0.005, 0.0, magM);
        magPos.set(0, -0.035, -0.12);
        info.leftHand.set(0, -0.03, -0.3);
        info.rightHand.set(0, -0.07, 0.07);
      }
      opticZ = -0.05;
      break;
    }
    // ----------------------------------------------------- Belt-fed LMG
    case 'lmg': {
      prism(g, [[0.1, -0.03], [0.1, 0.06], [-0.2, 0.06], [-0.21, 0.04], [-0.21, -0.03]], 0.068, alu);
      prism(g, [[0.075, 0.06], [0.075, 0.08], [0.06, 0.088], [-0.17, 0.088], [-0.18, 0.06]], 0.074, alu); // feed cover
      knobX(g, 0.004, 0.08, 0, 0.066, 0.07, bright, 8); // cover hinge
      rail(g, 0.06, -0.17, 0.088, alu);
      recvTop = 0.0975;
      box(g, 0.004, 0.012, 0.09, -0.036, 0.02, -0.07, dark); // feed tray slot
      // Perforated barrel jacket, heavy barrel, carry handle.
      tube(g, 0.024, 0.024, -0.21, -0.48, 0, 0.022, alu, 20);
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) knobX(g, 0.006, 0.004, s * 0.023, 0.022, -0.24 - i * 0.04, dark, 10);
      prism(g, [[-0.22, 0.045], [-0.22, 0.09], [-0.32, 0.09], [-0.32, 0.045], [-0.3, 0.045], [-0.3, 0.075], [-0.24, 0.075], [-0.24, 0.045]], 0.016, alu, { bevel: 0.002 });
      pistolGrip(g, gripM, { z: 0.04, y: -0.03 });
      triggerGroup(g, 0.01, -0.03, steel, alu);
      prism(g, [[0.1, 0.05], [0.32, 0.045], [0.33, 0.035], [0.33, -0.08], [0.31, -0.085], [0.2, -0.04], [0.1, -0.025]], 0.045, poly,
        { holes: [[[0.14, 0.032], [0.29, 0.028], [0.29, -0.02], [0.2, -0.02]]], bevel: 0.006 });
      box(g, 0.047, 0.12, 0.012, 0, -0.02, 0.336, rubber);
      box(g, 0.034, 0.018, 0.024, 0, 0.002, -0.47, dark); // bipod hinge
      for (const s of [-1, 1]) box(g, 0.009, 0.009, 0.24, s * 0.012, -0.006, -0.6, dark); // folded legs
      action = new THREE.Group();
      knobX(action, 0.008, 0.03, 0.015, 0, 0, poly, 10);
      action.position.set(0.034, 0.02, -0.06);
      g.add(action);
      // Soft ammo pouch with a belt feeding into the gun.
      prism(mag, [[-0.06, 0.0], [0.06, 0.0], [0.065, -0.11], ['q', 0.06, -0.125, 0.045, -0.125], [-0.05, -0.125], ['q', -0.065, -0.12, -0.064, -0.1]], 0.1, material('poly', 0x4c5139), { bevel: 0.01 });
      for (let i = 0; i < 6; i++) {
        tube(mag, 0.0045, 0.0045, 0.022, -0.022, 0.03 + i * 0.01, 0.006 + i * 0.009, brass, 6);
      }
      magPos.set(-0.035, -0.035, -0.08);
      muzzleY = 0.022;
      info.leftHand.set(0, -0.036, -0.38);
      opticZ = -0.05;
      break;
    }
    // ----------------------------------------------------- Pistols
    case 'pistol':
    case 'deagle': {
      const big = body === 'deagle';
      const slideM = big ? material('steel', m.color) : alu;
      const L = big ? 0.24 : 0.19, top = big ? 0.07 : 0.064;
      action = new THREE.Group();
      g.add(action);
      // Slide profile with rear and front cocking serrations.
      prism(action, [[0.03, 0.028], [0.03, top - 0.004], [0.02, top], [0.03 - L + 0.008, top], [0.03 - L, top - 0.006], [0.03 - L, 0.028]], big ? 0.032 : 0.026, slideM, { bevel: 0.0025 });
      for (let i = 0; i < 6; i++) {
        for (const s of [-1, 1]) {
          box(action, 0.002, top - 0.036, 0.0022, s * (big ? 0.0165 : 0.0135), (top + 0.028) / 2 + 0.002, 0.024 - i * 0.0045, dark);
          if (!big) box(action, 0.002, top - 0.04, 0.0022, s * 0.0135, (top + 0.028) / 2 + 0.002, 0.03 - L + 0.012 + i * 0.0045, dark);
        }
      }
      box(action, 0.012, 0.002, 0.032, 0.004, top + 0.0005, -0.03, dark); // ejection port
      box(action, 0.01, 0.004, 0.026, 0.004, top - 0.002, -0.03, brass); // barrel hood
      if (big) prismZ(action, [[-0.011, top], [0.011, top], [0.007, top + 0.012], [-0.007, top + 0.012]], 0.03 - L, -0.02, slideM); // barrel rib
      tube(action, big ? 0.0105 : 0.0075, big ? 0.0105 : 0.0075, 0.03 - L - 0.003, 0.03 - L + 0.004, 0, 0.047, steel, 14);
      // Sights (3-dot) ride on the slide.
      const sightTop = top + (big ? 0.012 : 0) + 0.008;
      box(action, 0.004, 0.008, 0.005, 0, sightTop - 0.004, 0.03 - L + 0.012, dark);
      box(action, 0.0022, 0.0022, 0.001, 0, sightTop - 0.002, 0.03 - L + 0.0145, material('emissive', 0xdfffe0));
      for (const s of [-1, 1]) {
        box(action, 0.006, 0.008, 0.006, s * 0.0055, sightTop - 0.004, 0.02, dark);
        box(action, 0.0022, 0.0022, 0.001, s * 0.0055, sightTop - 0.002, 0.0235, material('emissive', 0xdfffe0));
      }
      // Polymer (or stainless) frame with accessory rail and grip.
      const frameM = big ? material('steel', m.color) : poly;
      prism(g, [[0.035, 0.03], [0.035, 0.012], [0.0, 0.004], [-0.095, 0.006], [0.03 - L + 0.012, 0.012], [0.03 - L + 0.012, 0.03]], big ? 0.03 : 0.025, frameM, { bevel: 0.002 });
      if (!big) rail(g, -0.06, 0.03 - L + 0.016, -0.005, frameM, { width: 0.02 });
      prism(g, [[0.0, 0.006], [0.0, -0.02], [-0.06, -0.02], ['q', -0.068, -0.02, -0.07, 0.0]], 0.012, frameM, { holes: [[[-0.006, 0.0], [-0.006, -0.014], [-0.056, -0.014], [-0.06, 0.0]]], bevel: 0.0015 });
      prism(g, [[-0.024, 0.006], [-0.028, -0.004], [-0.031, -0.01], [-0.026, -0.011], [-0.019, 0.004]], 0.006, steel, { bevel: 0.0008 });
      prism(g, [[0.036, 0.022], [0.05, 0.012], [0.056, -0.004], [0.064, -0.09], [0.058, -0.105], [0.016, -0.105], [0.012, -0.09], [0.006, -0.06], [0.0, 0.004]], big ? 0.032 : 0.028, big ? rubber : gripM, { bevel: 0.005 });
      if (big) box(g, 0.012, 0.016, 0.01, 0, top - 0.01, 0.035, steel, -0.4); // hammer
      // Magazine: only the base plate shows below the grip.
      const tilt = new THREE.Group();
      tilt.rotation.x = -0.2;
      mag.add(tilt);
      prism(tilt, [[-0.016, 0.0], [0.016, 0.0], [0.016, -0.1], [-0.016, -0.1]], 0.02, material('park', 0x1d1e20), { bevel: 0.002 });
      prism(tilt, [[-0.022, -0.1], [0.02, -0.1], [0.02, -0.112], [-0.024, -0.112]], 0.03, poly, { bevel: 0.0025 });
      magPos.set(0, 0.0, 0.032);
      muzzleY = 0.047;
      muzzleZ = 0.03 - L - 0.003;
      recvTop = top;
      info.sightY = sightTop;
      info.leftHand.set(-0.01, -0.07, 0.04);
      info.rightHand.set(0, -0.045, 0.035);
      irons = 'pistol';
      railOn = false;
      opticZ = -0.06;
      break;
    }
    default:
      break;
  }

  // Barrel and gas block for long guns (shotguns and pistols handled above).
  const barrelStart = { ar: -0.172, dmr: -0.172, ak: -0.2, scar: -0.262, smg: -0.235, vector: -0.27, bolt: -0.13, lmg: -0.48, autoshotgun: -0.36 }[body];
  if (barrelStart !== undefined) {
    const heavy = body === 'bolt' || body === 'lmg';
    tube(g, heavy ? 0.013 : 0.0095, heavy ? 0.011 : 0.0085, barrelStart, muzzleZ, 0, muzzleY, steel, 16);
    if (body === 'bolt') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        box(g, 0.003, 0.003, Math.abs(muzzleZ - barrelStart) * 0.7, Math.cos(a) * 0.012, muzzleY + Math.sin(a) * 0.012, (barrelStart + muzzleZ) / 2 + 0.03, dark, 0, 0, a); // flutes
      }
    }
    if (body === 'ar' || body === 'dmr') {
      // Low-profile gas block just past the handguard.
      const gz = -0.172 - (body === 'dmr' ? 0.38 : 0.3) - 0.025;
      box(g, 0.026, 0.026, 0.02, 0, muzzleY + 0.002, gz, dark);
    }
  }

  // Iron sights.
  const optic = att.optic ?? 'iron';
  if (optic === 'iron') {
    if (irons === 'ar') {
      const rz = 0.07;
      box(g, 0.022, 0.006, 0.026, 0, recvTop + 0.003, rz, dark);
      for (const s of [-1, 1]) box(g, 0.004, 0.022, 0.014, s * 0.01, recvTop + 0.014, rz, dark);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.0022, 6, 14), dark);
      ring.position.set(0, recvTop + 0.019, rz);
      g.add(ring);
      const fz = body === 'scar' ? -0.25 : body === 'smg' || body === 'vector' ? -0.22 : -0.172 - (body === 'dmr' ? 0.36 : 0.28);
      box(g, 0.022, 0.006, 0.022, 0, recvTop + 0.003, fz, dark);
      for (const s of [-1, 1]) box(g, 0.004, 0.024, 0.012, s * 0.011, recvTop + 0.015, fz, dark);
      box(g, 0.003, 0.016, 0.003, 0, recvTop + 0.013, fz, dark);
      info.sightY = recvTop + 0.019;
    } else if (irons === 'ak') {
      const fz = muzzleZ + 0.07;
      box(g, 0.02, 0.034, 0.03, 0, muzzleY + 0.018, fz, park); // front sight block
      box(g, 0.003, 0.03, 0.003, 0, muzzleY + 0.046, fz, park);
      prismZ(g, [[-0.012, muzzleY + 0.03], [-0.012, muzzleY + 0.06], ['q', 0, muzzleY + 0.068, 0.012, muzzleY + 0.06], [0.012, muzzleY + 0.03], [0.009, muzzleY + 0.03], [0.009, muzzleY + 0.058], ['q', 0, muzzleY + 0.063, -0.009, muzzleY + 0.058], [-0.009, muzzleY + 0.03]], fz - 0.008, fz + 0.008, park);
      info.sightY = muzzleY + 0.061;
    } else if (irons === 'bead') {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 8, 6), material('brass', 0xd8c08a));
      bead.position.set(0, 0.044, muzzleZ + 0.012);
      g.add(bead);
      info.sightY = 0.046;
    } else if (irons === 'none') {
      box(g, 0.02, 0.012, 0.02, 0, recvTop + 0.006, 0.07, dark);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.002, 6, 12), dark);
      ring.position.set(0, recvTop + 0.016, 0.07);
      g.add(ring);
      box(g, 0.003, 0.016, 0.003, 0, recvTop + 0.008, -0.29, dark);
      info.sightY = recvTop + 0.016;
    }
  } else if (!railOn && !pistol) {
    rail(g, 0.06, -0.12, recvTop, park); // side-mount optic rail on the dust cover
    recvTop += 0.0095;
  }

  // ---- attachments ----
  if (att.barrel === 'long' && !pistol) { tube(g, 0.0095, 0.0095, muzzleZ, muzzleZ - 0.09, 0, muzzleY, steel, 14); muzzleZ -= 0.09; }
  if (att.barrel === 'short' && !pistol) muzzleZ += 0.06;
  if (att.muzzle === 'suppressor') {
    const r = pistol ? 0.016 : 0.021, L = pistol ? 0.13 : 0.18;
    const sup = material('alu', 0x1c1d1e);
    tube(g, r * 0.7, r, muzzleZ, muzzleZ - 0.012, 0, muzzleY, sup, 18);
    tube(g, r, r, muzzleZ - 0.012, muzzleZ - L + 0.012, 0, muzzleY, sup, 18);
    tube(g, r, r * 0.6, muzzleZ - L + 0.012, muzzleZ - L, 0, muzzleY, sup, 18);
    for (let i = 0; i < 3; i++) tube(g, r + 0.0008, r + 0.0008, muzzleZ - 0.03 - i * 0.008, muzzleZ - 0.034 - i * 0.008, 0, muzzleY, dark, 18);
    muzzleZ -= L;
  } else if (att.muzzle === 'compensator') {
    prismZ(g, [[-0.013, muzzleY - 0.011], [0.013, muzzleY - 0.011], [0.013, muzzleY + 0.011], [-0.013, muzzleY + 0.011]], muzzleZ - 0.055, muzzleZ, dark, { bevel: 0.003 });
    for (let i = 0; i < 3; i++) box(g, 0.004, 0.012, 0.006, 0, muzzleY + 0.008, muzzleZ - 0.012 - i * 0.014, material('inner', 0x050505));
    muzzleZ -= 0.055;
  } else if (att.muzzle === 'flash') {
    flashHider(g, muzzleZ, muzzleY, steel, material('inner', 0x050505));
    muzzleZ -= 0.048;
  } else if (!pistol && body !== 'pump') {
    // Factory muzzle device.
    if (body === 'ak') { tube(g, 0.012, 0.012, muzzleZ, muzzleZ - 0.045, 0, muzzleY, park, 14); box(g, 0.012, 0.004, 0.02, 0, muzzleY + 0.012, muzzleZ - 0.03, material('inner', 0x050505)); muzzleZ -= 0.045; }
    else if (body === 'bolt' || body === 'scar') { prismZ(g, [[-0.016, muzzleY - 0.012], [0.016, muzzleY - 0.012], [0.016, muzzleY + 0.012], [-0.016, muzzleY + 0.012]], muzzleZ - 0.065, muzzleZ, dark, { bevel: 0.004 }); for (let i = 0; i < 3; i++) for (const s of [-1, 1]) box(g, 0.004, 0.016, 0.008, s * 0.016, muzzleY, muzzleZ - 0.015 - i * 0.016, material('inner', 0x050505)); muzzleZ -= 0.065; }
    else { flashHider(g, muzzleZ, muzzleY, steel, material('inner', 0x050505)); muzzleZ -= 0.048; }
  }
  if (att.underbarrel === 'vgrip') {
    box(g, 0.024, 0.01, 0.04, 0, -0.03, info.leftHand.z, dark);
    const vg = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.016, 0.075, 14), gripM);
    vg.position.set(0, -0.072, info.leftHand.z);
    g.add(vg);
    info.leftHand.y -= 0.05;
  } else if (att.underbarrel === 'agrip') {
    prism(g, [[info.leftHand.z + 0.04, -0.026], [info.leftHand.z - 0.035, -0.026], [info.leftHand.z - 0.04, -0.034], [info.leftHand.z + 0.012, -0.062], [info.leftHand.z + 0.04, -0.034]], 0.026, poly, { bevel: 0.004 });
  } else if (att.underbarrel === 'laser') {
    const lz = info.leftHand.z - 0.06;
    prismZ(g, [[0.026, -0.01], [0.052, -0.01], [0.052, 0.022], [0.026, 0.022]], lz - 0.07, lz + 0.01, material('poly', 0x3b3d2f), { bevel: 0.003 });
    for (const yy of [0.0, 0.013]) tube(g, 0.005, 0.005, lz - 0.07, lz - 0.072, 0.039, yy, material('lens', 0x101820), 10);
    box(g, 0.004, 0.004, 0.002, 0.039, 0.0, lz - 0.073, material('emissive', 0xff2020));
  }
  if (att.stock === 'heavy' && !pistol) box(g, 0.034, 0.018, 0.1, 0, 0.06, 0.25, poly);
  if (att.magazine === 'extended') mag.scale.y = 1.35;
  if (att.magazine === 'fast') {
    const twin = mag.clone();
    twin.position.set(0.032, 0, 0);
    mag.add(twin);
    box(mag, 0.064, 0.022, 0.07, 0.016, -0.07, 0, material('poly', 0x222222));
  }

  // ---- optics ----
  const ry = recvTop;
  if (optic === 'reflex' || optic === 'holo') {
    const oz = pistol ? -0.04 : opticZ;
    if (optic === 'reflex') {
      // Micro red dot: open tube on a riser mount.
      const axis = ry + (pistol ? 0.02 : 0.034);
      box(g, 0.022, axis - ry - 0.012, 0.03, 0, ry + (axis - ry - 0.012) / 2, oz, dark);
      tube(g, 0.0165, 0.0165, oz + 0.026, oz - 0.026, 0, axis, material('inner', 0x16171a), 20, true);
      tube(g, 0.0175, 0.0175, oz + 0.026, oz + 0.02, 0, axis, dark, 20, true);
      tube(g, 0.0175, 0.0175, oz - 0.02, oz - 0.026, 0, axis, dark, 20, true);
      knobY(g, 0.006, 0.01, 0, axis + 0.019, oz, dark, 12);
      knobX(g, 0.006, 0.01, 0.019, axis, oz, dark, 12);
      const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.0158, 20), material('glass', 0x8a4dbb));
      lensF.position.set(0, axis, oz - 0.024);
      g.add(lensF);
      const ret = makeReticleSprite('dot');
      ret.position.set(0, axis, oz - 0.0245);
      ret.scale.setScalar(0.01);
      g.add(ret);
      info.sightY = axis;
    } else {
      // Holographic: battery base with a hooded window.
      const h = 0.036;
      prism(g, [[oz + 0.045, ry], [oz + 0.045, ry + 0.016], [oz - 0.05, ry + 0.016], [oz - 0.05, ry]], 0.036, dark, { bevel: 0.003 });
      for (const s of [-1, 1]) prism(g, [[oz + 0.01, ry + 0.012], [oz + 0.01, ry + h + 0.006], [oz - 0.045, ry + h + 0.006], [oz - 0.045, ry + 0.012]], 0.004, dark, { x: s * 0.017, bevel: 0.0012 });
      prismZ(g, [[-0.019, ry + h + 0.002], [0.019, ry + h + 0.002], [0.019, ry + h + 0.008], ['q', 0, ry + h + 0.014, -0.019, ry + h + 0.008]], oz - 0.045, oz + 0.01, dark);
      for (let i = 0; i < 3; i++) box(g, 0.006, 0.004, 0.004, -0.01 + i * 0.01, ry + 0.017, oz + 0.04, rubber);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.03, h - 0.01), material('glass', 0x6a8acb));
      glass.position.set(0, ry + 0.012 + (h - 0.006) / 2, oz - 0.035);
      g.add(glass);
      const ret = makeReticleSprite('holo');
      ret.position.set(0, ry + 0.012 + (h - 0.006) / 2, oz - 0.0355);
      ret.scale.setScalar(0.02);
      g.add(ret);
      info.sightY = ry + 0.012 + (h - 0.006) / 2;
    }
  } else if (optic === 'acog' || optic === 'sniper8' || optic === 'thermal') {
    const scopeM = material('alu', 0x1b1c1e);
    if (optic === 'acog') {
      const axis = ry + 0.03, oz = opticZ;
      box(g, 0.024, 0.016, 0.06, 0, ry + 0.008, oz, scopeM);
      prismZ(g, [[-0.018, axis - 0.016], [0.018, axis - 0.016], [0.022, axis - 0.004], [0.018, axis + 0.016], [-0.018, axis + 0.016], [-0.022, axis - 0.004]], oz - 0.06, oz + 0.05, scopeM, { bevel: 0.003 });
      tube(g, 0.022, 0.018, oz - 0.06, oz - 0.09, 0, axis, scopeM, 20);
      tube(g, 0.016, 0.017, oz + 0.05, oz + 0.075, 0, axis, rubber, 20);
      box(g, 0.006, 0.003, 0.07, 0, axis + 0.018, oz - 0.01, material('emissive', 0x30ff60)); // fibre optic
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 20), material('lens', 0x1a2a44));
      lens.position.set(0, axis, oz - 0.0905);
      lens.rotation.y = Math.PI;
      g.add(lens);
      info.sightY = axis;
    } else if (optic === 'thermal') {
      const axis = ry + 0.04, oz = opticZ;
      box(g, 0.024, 0.024, 0.08, 0, ry + 0.012, oz, scopeM);
      prismZ(g, [[-0.026, axis - 0.022], [0.026, axis - 0.022], [0.026, axis + 0.022], [-0.026, axis + 0.022]], oz - 0.09, oz + 0.06, scopeM, { bevel: 0.006 });
      tube(g, 0.026, 0.024, oz - 0.09, oz - 0.11, 0, axis, scopeM, 22);
      tube(g, 0.018, 0.02, oz + 0.06, oz + 0.095, 0, axis, rubber, 18);
      knobX(g, 0.009, 0.012, 0.031, axis + 0.008, oz - 0.02, rubber, 14);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 22), material('lens', 0x281a10));
      lens.position.set(0, axis, oz - 0.1105);
      lens.rotation.y = Math.PI;
      g.add(lens);
      info.sightY = axis;
    } else {
      // Variable-power sniper scope with turrets, rings and bells.
      const axis = ry + 0.034, oz = opticZ - 0.03;
      tube(g, 0.0152, 0.0152, oz + 0.09, oz - 0.12, 0, axis, scopeM, 24);
      tube(g, 0.026, 0.0152, oz - 0.12, oz - 0.17, 0, axis, scopeM, 24); // objective bell
      tube(g, 0.026, 0.026, oz - 0.17, oz - 0.2, 0, axis, scopeM, 24);
      tube(g, 0.0152, 0.02, oz + 0.09, oz + 0.12, 0, axis, scopeM, 24); // ocular
      tube(g, 0.021, 0.021, oz + 0.12, oz + 0.16, 0, axis, rubber, 24);
      knobY(g, 0.013, 0.026, 0, axis + 0.026, oz - 0.015, scopeM, 18); // elevation turret
      knobX(g, 0.013, 0.026, 0.026, axis, oz - 0.015, scopeM, 18); // windage turret
      knobX(g, 0.009, 0.016, -0.022, axis, oz - 0.015, scopeM, 14); // parallax
      for (const rz of [oz + 0.06, oz - 0.08]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0172, 0.004, 8, 20), scopeM);
        ring.position.set(0, axis, rz);
        g.add(ring);
        box(g, 0.022, axis - ry - 0.012, 0.016, 0, ry + (axis - ry - 0.012) / 2, rz, scopeM);
      }
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0245, 24), material('lens', 0x1a2240));
      lens.position.set(0, axis, oz - 0.2005);
      lens.rotation.y = Math.PI;
      g.add(lens);
      info.sightY = axis;
    }
  }

  // Where the left hand grips the magazine during reloads.
  mag.updateMatrixWorld(true);
  const magBox = new THREE.Box3().setFromObject(mag);
  if (magBox.isEmpty()) magBox.set(new THREE.Vector3(-0.02, -0.1, -0.03), new THREE.Vector3(0.02, 0, 0.03));
  info.magGrip = new THREE.Vector3(
    (magBox.min.x + magBox.max.x) / 2 - 0.012,
    magBox.min.y + (magBox.max.y - magBox.min.y) * 0.3,
    (magBox.min.z + magBox.max.z) / 2,
  );

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

/**
 * First-person arms. With the rigged hand models loaded: camo sleeves with rolled
 * cuffs running from a fixed elbow to realistic tactical-gloved hands that wrap the
 * weapon. Otherwise: simple tapered sleeves and primitive gloved hands.
 */
export function buildArms(sleeveColor = 0x4d5340) {
  if (handsReady()) return buildRealArms();
  const t = textures();
  const sleeve = new THREE.MeshStandardMaterial({ color: sleeveColor, map: t.cloth, roughness: 0.95, metalness: 0 });
  const cuffM = new THREE.MeshStandardMaterial({ color: 0x2c2e27, roughness: 0.9, metalness: 0 });
  const glove = material('grip', 0x3a382f);
  const knuckle = material('poly', 0x2a2924);
  const make = () => {
    const arm = new THREE.Group();
    // Geometry runs along -Z from the elbow (0) to the hand (-0.47).
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.046, 0.36, 14), sleeve);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = -0.18;
    arm.add(fore);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.05, 14), cuffM);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = -0.355;
    arm.add(cuff);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.04, 12), glove);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.z = -0.395;
    arm.add(wrist);
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.04, 4, 10), glove);
    palm.rotation.x = Math.PI / 2;
    palm.scale.set(1.15, 1, 0.72);
    palm.position.z = -0.44;
    arm.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.028, 3, 8), glove);
      f.rotation.x = Math.PI / 2 + 0.9;
      f.position.set(-0.024 + i * 0.016, -0.014, -0.478);
      arm.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.03, 3, 8), glove);
    thumb.rotation.set(Math.PI / 2 - 0.3, 0, 0.8);
    thumb.position.set(0.032, -0.006, -0.445);
    arm.add(thumb);
    const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.016), knuckle);
    knuckles.position.set(0, 0.016, -0.462);
    arm.add(knuckles);
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

const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
// Hand orientation relative to the gun: firing hand on the pistol grip (knuckles down
// the grip, palm against it, thumb over the top), support hand under the handguard.
const Q_RIGHT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.32, 0.06, 0.05));
const Q_LEFT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.25, Math.PI / 2 - 0.55));
// Free hand (no gun to hold): fist, palm down, knuckles leading along the forearm.
const Q_FREE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));

let CAMO = null;
/** Woodland-arid camouflage print (green, tan and brown blotches over an olive base). */
function camoTexture() {
  if (CAMO) return CAMO;
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#7f7c57';
  g.fillRect(0, 0, S, S);
  const blob = (x, y, r, col) => {
    g.fillStyle = col;
    g.beginPath();
    const n = 9 + Math.floor(rnd() * 5);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, rr = r * (0.55 + rnd() * 0.65);
      const px = x + Math.cos(a) * rr * 1.35, py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.quadraticCurveTo(x + Math.cos(a - 0.3) * rr * 1.6, y + Math.sin(a - 0.3) * rr * 1.2, px, py);
    }
    g.closePath();
    g.fill();
  };
  // Draw every blob wrapped so the print tiles seamlessly.
  const layer = (n, rMin, rMax, cols) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S, r = rMin + rnd() * (rMax - rMin), col = cols[Math.floor(rnd() * cols.length)];
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) if (x + ox > -rMax * 2 && x + ox < S + rMax * 2 && y + oy > -rMax * 2 && y + oy < S + rMax * 2) blob(x + ox, y + oy, r, col);
    }
  };
  layer(26, 30, 70, ['#9c946a', '#a89f75']); // tan
  layer(34, 22, 55, ['#5d6a3f', '#66713f']); // green
  layer(30, 12, 34, ['#4a3e2d', '#54452f']); // brown
  layer(40, 5, 14, ['#b5ab84', '#3f4a2c', '#6e6a45']); // fine speckle
  // Woven ripstop grid and fibre noise.
  g.globalAlpha = 0.07;
  g.strokeStyle = '#000';
  for (let i = 0; i < S; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  g.globalAlpha = 1;
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  CAMO = new THREE.CanvasTexture(c);
  CAMO.wrapS = CAMO.wrapT = THREE.RepeatWrapping;
  CAMO.colorSpace = THREE.SRGBColorSpace;
  CAMO.anisotropy = 4;
  return CAMO;
}

let WEAVE = null;
/**
 * Height map for the sleeve fabric: a ripstop grid (thicker threads every few
 * millimetres), fibre noise, and a flat-felled seam with stitching running
 * down the underside of the forearm (u = 0.5).
 */
function weaveTexture() {
  if (WEAVE) return WEAVE;
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    let v = 128 + ((x + y) % 2 ? 9 : -9) + (rnd() - 0.5) * 26; // plain weave and fibre noise
    if (x % 16 === 0 || y % 16 === 0) v += 34; // ripstop threads
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  // Seam: two raised folds of fabric with a line of stitches on each.
  const sx = S / 2;
  const grad = g.createLinearGradient(sx - 14, 0, sx + 14, 0);
  grad.addColorStop(0, 'rgba(128,128,128,0)');
  grad.addColorStop(0.25, 'rgba(200,200,200,0.9)');
  grad.addColorStop(0.5, 'rgba(60,60,60,0.95)');
  grad.addColorStop(0.75, 'rgba(200,200,200,0.9)');
  grad.addColorStop(1, 'rgba(128,128,128,0)');
  g.fillStyle = grad;
  g.fillRect(sx - 14, 0, 28, S);
  g.fillStyle = 'rgba(40,40,40,0.9)';
  for (let y = 0; y < S; y += 8) { g.fillRect(sx - 9, y, 2, 5); g.fillRect(sx + 7, y + 4, 2, 5); }
  WEAVE = new THREE.CanvasTexture(c);
  WEAVE.wrapS = WEAVE.wrapT = THREE.RepeatWrapping;
  WEAVE.anisotropy = 4;
  return WEAVE;
}

/**
 * Combat-shirt forearm: oval in section, tapering to the wrist, with soft
 * lengthwise drape, folds that bunch above the cuff, and slight sag underneath.
 */
function sleeveGeometry() {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 26, true);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const a = Math.atan2(z, x);
    const s = 0.5 - y; // 0 at the elbow, 1 at the wrist
    let r = 0.054 + (0.042 - 0.054) * s;
    r *= 1 + 0.035 * Math.sin(a * 2 + 0.6) + 0.025 * Math.sin(a * 3 + s * 9) * (0.4 + s); // drape
    r *= 1 + 0.03 * Math.sin(a * 5 - s * 6) * s * s; // creases toward the wrist
    if (s > 0.72) {
      const k = (s - 0.72) / 0.28; // bunching where the sleeve rides on the glove cuff
      r *= 1 + 0.07 * Math.max(0, Math.sin(k * Math.PI * 3.2 + a * 0.8)) * k + 0.03 * k;
    }
    // Fabric hangs under the forearm (local +z ends up pointing down after rotateX).
    const sag = Math.max(0, Math.sin(a)) * 0.04 * (1 - s);
    P.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r * 0.88 + sag * r);
  }
  geo.computeVertexNormals();
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -0.5);
  return geo;
}

function buildRealArms() {
  const camo = camoTexture().clone();
  camo.repeat.set(1.7, 2.3);
  camo.needsUpdate = true;
  const weave = weaveTexture();
  const cloth = (extra = {}) => new THREE.MeshPhysicalMaterial({
    map: camo, bumpMap: weave, bumpScale: 1.6, roughness: 0.94, metalness: 0,
    sheen: 0.7, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x9a9878), ...extra,
  });
  // Double-sided so the inside of the sleeve shows fabric, not a hole, at the cuff.
  const sleeveM = cloth({ side: THREE.DoubleSide });
  const cuffM = cloth({ color: 0xcfcfcf, side: THREE.DoubleSide });
  const tabM = new THREE.MeshStandardMaterial({ color: 0x4a4632, bumpMap: weave, bumpScale: 2.5, roughness: 0.96, metalness: 0 });
  const hemM = new THREE.MeshStandardMaterial({ color: 0x3b3a2c, roughness: 0.95, metalness: 0 });
  const sleeveGeo = sleeveGeometry();
  const make = (side) => {
    const group = new THREE.Group();
    // Sleeve: from the elbow (z=0) to z=-1, stretched to reach the wrist.
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveM);
    // Fitted cuff: a doubled hem band with stitching and a velcro adjustment tab.
    const cuff = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0455, 0.0435, 0.042, 28, 1, true), cuffM);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 1, 0.88);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.0438, 0.0028, 8, 36), hemM);
    hem.position.z = -0.02;
    hem.scale.set(1, 0.88, 1);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.036), tabM);
    tab.position.set(side === 'right' ? 0.014 : -0.014, 0.0385, 0.002);
    tab.rotation.z = side === 'right' ? -0.32 : 0.32;
    cuff.add(band, hem, tab);
    const fore = new THREE.Group();
    fore.add(sleeve, cuff);
    group.add(fore);
    const hand = makeHand(side);
    group.add(hand.root);
    return { group, fore, sleeve, cuff, hand };
  };
  const L = make('left'), R = make('right');
  const orient = (a, elbow, wrist) => {
    _v.subVectors(wrist, elbow);
    const len = _v.length();
    a.fore.position.copy(elbow);
    a.fore.lookAt(_w.copy(wrist));
    a.fore.rotateY(Math.PI);
    a.sleeve.scale.set(1, 1, Math.max(0.05, len - 0.02));
    a.cuff.position.set(0, 0, -(len - 0.035));
  };
  return {
    real: true,
    left: L.group, right: R.group,
    hands: { left: L.hand, right: R.hand },
    /**
     * side 'left' | 'right'; gunQuat: weapon orientation (null = free hand);
     * target: where the grip point goes; elbow: fixed shoulder-side anchor; pose: grip name.
     */
    attach(side, gunQuat, target, elbow, pose, handQuat = null, anchor = 'grip') {
      const a = side === 'right' ? R : L;
      a.hand.pose(pose);
      if (handQuat) _q.copy(handQuat);
      else if (gunQuat) _q.copy(gunQuat).multiply(side === 'right' ? Q_RIGHT : Q_LEFT);
      else {
        // Point the fist along the forearm.
        _v.subVectors(target, elbow).normalize();
        _m.lookAt(_w.set(0, 0, 0), _v, new THREE.Vector3(0, 1, 0));
        _q.setFromRotationMatrix(_m).multiply(Q_FREE);
      }
      a.hand.place(_q, target, anchor);
      orient(a, elbow, a.hand.wrist());
    },
    place() {},
  };
}
