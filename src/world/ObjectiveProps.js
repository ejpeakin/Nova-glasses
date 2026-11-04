// Objective props: the physical thing you work on at an "interact" objective
// (a rugged laptop patched into a server, a tracker on a container, C4 on an AA
// gun, a bound hostage, a prisoner to cuff, a man in a wreck, an antenna junction
// box, a drive bay, the HALCYON core), and the feedback while you work on it.
//
// Each prop exposes:
//   kind         what the player's hands do (see WeaponSystem._actionHands)
//   work         world point the hands work at (moves for drives, drags, ...)
//   n            horizontal unit vector from the work point toward the operator
//   stand        how far from the work point the operator stands
//   crouch       whether the operator gets down to it
//   update(dt, k, acting, time)  k: progress 0..1
//   complete()   the action finished
//   dispose()
import * as THREE from '../lib/three.js';
import { Humanoid } from '../ai/Humanoid.js';
import { Audio } from '../core/Audio.js';

/** What kind of action an objective is, from its flags and wording. */
export function actionKind(o) {
  if (o.act) return o.act;
  const l = (o.label ?? '').toLowerCase();
  if (o.door || /pick the lock|lockpick|unlock/.test(l)) return 'lockpick';
  if (o.vasko || /detain|arrest|cuff|apprehend/.test(l)) return 'detain';
  if (o.aa || /\bc4\b|charge|explosive/.test(l)) return 'c4';
  if (/tracker|beacon|\bbug\b/.test(l)) return 'tracker';
  if (/cut .*free|untie|free the/.test(l)) return 'cut';
  if (/splice|wire/.test(l)) return 'splice';
  if (/wreck|drag|pull \w+ from/.test(l)) return 'rescue';
  if (/\bcore\b/.test(l)) return 'core';
  if (/drive/.test(l)) return 'drive';
  return 'hack';
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const mat = (color, rough = 0.7, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
function box(w, h, d, m, x, y, z, parent) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  b.receiveShadow = true;
  parent.add(b);
  return b;
}
function cyl(r0, r1, h, m, x, y, z, parent, seg = 16) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  c.position.set(x, y, z);
  c.castShadow = true;
  parent.add(c);
  return c;
}
function led(color, r, x, y, z, parent) {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m);
  s.position.set(x, y, z);
  parent.add(s);
  return s;
}
function tube(points, r, m, parent) {
  const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, r, 6, false), m);
  t.castShadow = true;
  parent.add(t);
  return t;
}
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** The open side of a spot: a horizontal direction with room for the operator, preferring `toward`. */
function openSide(world, pos, toward) {
  let best = null, bestScore = -Infinity;
  const y = pos.y + 0.9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    const hit = world.raycast(pos.x, y, pos.z, dx, 0, dz, 1.6);
    const free = hit ? hit.t : 1.6;
    if (free < 1.0) continue;
    if (pos.y < 0.5 && !world.walkable(pos.x + dx * 0.9, pos.z + dz * 0.9)) continue;
    const score = free + (toward ? 1.2 * (dx * toward.x + dz * toward.z) : 0);
    if (score > bestScore) { bestScore = score; best = V(dx, 0, dz); }
  }
  return best ?? (toward && toward.lengthSq() > 0 ? toward.clone().setY(0).normalize() : V(0, 0, 1));
}

// ---------- laptop screen ----------
function screen(w, h) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { c, g: c.getContext('2d'), tex, mesh, last: -1 };
}
function hexLine(seed) {
  let s = (seed * 2654435761) >>> 0, out = '';
  for (let i = 0; i < 26; i++) { s = (s * 1103515245 + 12345) >>> 0; out += '0123456789ABCDEF'[s >>> 28]; if (i % 4 === 3) out += ' '; }
  return out;
}
function drawScreen(sc, title, task, k, t, done) {
  const g = sc.g, W = 256, H = 160;
  g.fillStyle = '#03100a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = done ? '#7dffb0' : '#2cff8a';
  g.font = 'bold 13px monospace';
  g.fillText(title, 10, 20);
  g.fillStyle = 'rgba(44,255,138,0.35)';
  g.fillRect(10, 26, W - 20, 1);
  g.font = '10px monospace';
  g.fillStyle = 'rgba(44,255,138,0.5)';
  const rows = done ? 2 : 6;
  for (let i = 0; i < rows; i++) g.fillText(hexLine(Math.floor(t * 9) + i * 7), 10, 44 + i * 13);
  g.fillStyle = '#2cff8a';
  g.font = 'bold 12px monospace';
  g.fillText(done ? `${task}: COMPLETE` : `${task}  ${Math.floor(k * 100)}%`, 10, 128);
  g.strokeStyle = '#2cff8a';
  g.strokeRect(10, 136, W - 20, 12);
  g.fillRect(12, 138, (W - 24) * (done ? 1 : k), 8);
  sc.tex.needsUpdate = true;
}

// ---------- props ----------
function hackProp(game, o, pos, n) {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = Math.atan2(n.x, n.z); // local +Z faces the operator
  const od = mat(0x394030, 0.85, 0.05), dark = mat(0x1b1d1f, 0.5, 0.35), metal = mat(0x6a6e72, 0.35, 0.8);
  // Two stacked hard cases bring the laptop to a working height.
  box(0.58, 0.34, 0.42, od, 0, 0.17, 0.04, g);
  box(0.52, 0.28, 0.38, od, 0, 0.48, 0.04, g);
  for (const x of [-0.18, 0.18]) { box(0.05, 0.03, 0.02, metal, x, 0.3, 0.255, g); box(0.05, 0.03, 0.02, metal, x, 0.58, 0.235, g); }
  const lap = new THREE.Group();
  lap.position.set(0, 0.62, 0.08);
  g.add(lap);
  box(0.34, 0.022, 0.24, dark, 0, 0.011, 0, lap);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.12), mat(0x0d0e0f, 0.6, 0.1));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.0225, 0.02);
  lap.add(keys);
  const lid = new THREE.Group();
  lid.position.set(0, 0.022, -0.12);
  lid.rotation.x = -0.32;
  lap.add(lid);
  box(0.34, 0.23, 0.012, dark, 0, 0.115, -0.006, lid);
  const sc = screen(0.31, 0.19);
  sc.mesh.position.set(0, 0.118, 0.001);
  lid.add(sc.mesh);
  // Patched into whatever it is hacking: a server cabinet behind, or a wall port.
  const cable = mat(0x101010, 0.6, 0.1);
  const back = game.world.raycast(pos.x, pos.y + 0.8, pos.z, -n.x, 0, -n.z, 1.2);
  const leds = [];
  if (!back || back.t > 1.0) {
    box(0.6, 1.5, 0.55, dark, 0, 0.75, -0.62, g);
    for (let i = 0; i < 8; i++) { box(0.5, 0.1, 0.01, mat(0x26292c, 0.4, 0.5), 0, 0.2 + i * 0.16, -0.34, g); leds.push(led(i % 3 ? 0x30ff70 : 0xffa020, 0.008, 0.2, 0.2 + i * 0.16, -0.333, g)); }
    tube([V(0.17, 0.635, 0.05), V(0.26, 0.6, -0.05), V(0.24, 0.9, -0.3), V(0.15, 1.0, -0.335)], 0.006, cable, g);
  } else {
    const d = back.t - 0.02;
    tube([V(0.17, 0.635, 0.05), V(0.25, 0.55, -0.1), V(0.2, 0.8, -d + 0.1), V(0.15, 0.85, -d)], 0.006, cable, g);
    box(0.08, 0.12, 0.02, dark, 0.15, 0.85, -d, g);
  }
  game.scene.add(g);
  g.updateMatrixWorld(true);
  const work = lap.localToWorld(V(0, 0.03, 0.035));
  const title = /manifest/i.test(o.label) ? 'MERIDIAN LOGISTICS // SECURE' : /lift/i.test(o.label) ? 'FACILITY 6 // LIFT CONTROL' : /terminal/i.test(o.label) ? 'UPLINK NODE // ROOT SHELL' : 'MERIDIAN NET // BREACH';
  const task = o.label.replace(/^(download|hack|shut down|override|pull|secure)\s+the\s+/i, '').toUpperCase().slice(0, 22);
  let done = false, keyT = 0;
  drawScreen(sc, title, task, 0, 0, false);
  return {
    kind: 'hack', group: g, work, n, stand: 0.48, crouch: true,
    update(dt, k, acting, t) {
      for (let i = 0; i < leds.length; i++) leds[i].visible = Math.sin(t * (3 + i) + i * 1.7) > -0.3;
      if (t - sc.last > 0.1) { sc.last = t; drawScreen(sc, title, task, k, t, done); }
      if (acting) { keyT -= dt; if (keyT <= 0) { keyT = 0.05 + Math.random() * 0.09; Audio.foley('key', work); } }
    },
    complete() { done = true; drawScreen(sc, title, task, 1, 0, true); Audio.foley('beep', work); },
    dispose() { g.removeFromParent(); },
  };
}

function trackerProp(game, o, pos, n) {
  // Find the container: the nearest wall around the target at chest height.
  const y = pos.y + 1.12;
  let S = null, N = n.clone(), best = 2.6;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    const hit = game.world.raycast(pos.x, y, pos.z, dx, 0, dz, best);
    if (hit && hit.t < best && Math.abs(hit.normal.y) < 0.5) { best = hit.t; S = hit.point.clone(); N = hit.normal.clone().setY(0).normalize(); }
  }
  let crate = null;
  if (!S) {
    // Nothing to stick it to here: the cargo itself, a stencilled crate on the quay.
    crate = new THREE.Group();
    crate.position.set(pos.x, pos.y, pos.z);
    crate.rotation.y = Math.atan2(n.x, n.z);
    box(1.4, 1.3, 1.1, mat(0x5a6a4a, 0.85, 0.1), 0, 0.65, -0.55, crate);
    for (const x of [-0.6, 0, 0.6]) box(0.06, 1.32, 1.12, mat(0x45523a, 0.85, 0.1), x, 0.65, -0.55, crate);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const cg = c.getContext('2d');
    cg.fillStyle = '#e8e4d0'; cg.font = 'bold 40px monospace'; cg.fillText('K-77', 14, 46);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
    label.position.set(-0.3, 0.95, 0.002);
    crate.add(label);
    game.scene.add(crate);
    crate.updateMatrixWorld(true);
    S = crate.localToWorld(V(0.25, 1.0, 0));
    N = n.clone();
  }
  const g = new THREE.Group();
  g.position.copy(S).addScaledVector(N, 0.012);
  g.quaternion.setFromUnitVectors(UP, N);
  cyl(0.045, 0.048, 0.022, mat(0x151617, 0.45, 0.3), 0, 0, 0, g, 20);
  cyl(0.03, 0.03, 0.006, mat(0x2a2c2e, 0.35, 0.5), 0, 0.013, 0, g, 16);
  const light = led(0xff2a1a, 0.006, 0.018, 0.017, 0, g);
  g.visible = false;
  game.scene.add(g);
  const work = S.clone().addScaledVector(N, 0.02);
  let placed = false, armed = false;
  return {
    kind: 'tracker', group: g, work, n: N, stand: 0.45, crouch: false,
    update(dt, k, acting, t) {
      if (!placed && k >= 0.5) { placed = true; g.visible = true; Audio.foley('stick', work); }
      if (placed) light.visible = armed ? Math.sin(t * 6) > 0.6 : Math.sin(t * 14) > 0;
    },
    complete() { placed = true; armed = true; g.visible = true; Audio.foley('beep', work); },
    dispose() { g.removeFromParent(); crate?.removeFromParent(); },
  };
}

function c4Prop(game, o, pos, n) {
  // The face of the AA turret nearest the operator.
  const aa = o.prop;
  let S, N = n.clone();
  if (aa) {
    aa.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(aa.matrixWorld).invert();
    const ln = n.clone().transformDirection(inv);
    const f = aa.userData.face ?? { x: 0.71, z: 0.61, y: 1.0 }; // half-sizes of the face the charge goes on
    const lp = Math.abs(ln.x) > Math.abs(ln.z) ? V(Math.sign(ln.x) * f.x, f.y, 0) : V(0, f.y, Math.sign(ln.z) * f.z);
    S = aa.localToWorld(lp);
    N = (Math.abs(ln.x) > Math.abs(ln.z) ? V(Math.sign(ln.x), 0, 0) : V(0, 0, Math.sign(ln.z))).transformDirection(aa.matrixWorld).setY(0).normalize();
  } else S = V(pos.x, pos.y + 1, pos.z).addScaledVector(n, 0.6);
  const g = new THREE.Group();
  g.position.copy(S).addScaledVector(N, 0.03);
  g.rotation.y = Math.atan2(N.x, N.z);
  box(0.2, 0.11, 0.05, mat(0xcfc6a2, 0.9, 0), 0, 0, 0, g);
  for (const x of [-0.06, 0.06]) box(0.02, 0.115, 0.055, mat(0x2b2d2f, 0.6, 0.1), x, 0, 0, g);
  box(0.05, 0.035, 0.03, mat(0x111213, 0.5, 0.3), 0, 0.02, 0.035, g);
  tube([V(-0.02, 0.03, 0.05), V(-0.05, 0.06, 0.06), V(-0.09, 0.04, 0.03)], 0.002, mat(0xcc2222, 0.5, 0), g);
  tube([V(0.02, 0.03, 0.05), V(0.05, 0.07, 0.06), V(0.08, 0.04, 0.03)], 0.002, mat(0x2244cc, 0.5, 0), g);
  const light = led(0xff2a1a, 0.006, 0.012, 0.03, 0.052, g);
  g.visible = false;
  game.scene.add(g);
  const work = S.clone().addScaledVector(N, 0.05);
  let placed = false, armed = false, beepT = 0;
  return {
    kind: 'c4', group: g, work, n: N, stand: 0.5, crouch: true,
    update(dt, k, acting, t) {
      if (!placed && k >= 0.45) { placed = true; g.visible = true; Audio.foley('stick', work); }
      if (armed) {
        beepT -= dt;
        light.visible = beepT > 0.35;
        if (beepT <= 0) { beepT = 0.5; Audio.foley('beep', work); }
      } else light.visible = placed && Math.sin(t * 10) > 0;
    },
    complete() { placed = true; armed = true; g.visible = true; },
    detonate() { g.removeFromParent(); },
    dispose() { g.removeFromParent(); },
  };
}

/** A person on their knees: a hostage with bound wrists, or a prisoner. */
function personProp(game, o, pos, n, kind) {
  const faction = o.detainee ?? (kind === 'cut' ? 'civilian' : kind === 'rescue' ? 'orion' : 'meridian');
  const model = o.model ?? new Humanoid(faction, kind === 'rescue' ? 'vx4' : 'p11', { seed: 77 });
  // Never inside solid geometry (a man trapped "in" a wreck sits against its side).
  const at = pos.clone();
  for (let d = 0; d < 4; d += 0.1) {
    const q = pos.clone().addScaledVector(n, d);
    if (!game.world.overlaps(q.x - 0.32, q.y + 0.15, q.z - 0.32, q.x + 0.32, q.y + 1.1, q.z + 0.32)) { at.copy(q).addScaledVector(n, d > 0 ? 0.1 : 0); break; }
  }
  model.root.position.copy(at);
  // Hostage and prisoner kneel facing away (you work at their wrists); the wounded
  // man in the wreck sits facing you.
  model.root.rotation.y = kind === 'rescue' ? Math.atan2(-n.x, -n.z) : Math.atan2(n.x, n.z);
  if (!model.root.parent) game.scene.add(model.root);
  model.setCaptive(kind === 'detain' ? 'head' : kind === 'cut' ? 'back' : 'side');
  const zip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), mat(0x0e0e0e, 0.6, 0));
  zip.position.set(0, 0.07, 0.17);
  zip.rotation.y = Math.PI / 2;
  zip.visible = kind === 'cut';
  model.torso.add(zip);
  let crouch = 1, done = false, drag = 0, cueT = 0, zipped = false, standT = 0;
  const home = model.root.position.clone();
  const workLocal = kind === 'rescue' ? V(0, 0.46, -0.14) : V(0, 0.07, 0.2);
  const prop = {
    kind, model, work: V(), n: n.clone(), stand: kind === 'rescue' ? 0.5 : 0.42, crouch: true,
    update(dt, k, acting, t) {
      if (kind === 'detain' && !done) {
        if (k > 0.2) model.setCaptive('back');
        if (!zipped && k >= 0.6) { zipped = true; zip.visible = true; Audio.foley('zip', prop.work); }
      }
      if (kind === 'cut' && acting && !done) { cueT -= dt; if (cueT <= 0) { cueT = 0.28; Audio.foley('cut', prop.work); } }
      if (kind === 'rescue' && !done) {
        drag = Math.max(drag, smooth(clamp01((k - 0.15) / 0.85)) * 0.55);
        model.root.position.copy(home).addScaledVector(n, drag);
        if (acting) { cueT -= dt; if (cueT <= 0) { cueT = 0.5; Audio.foley('drag', prop.work); } }
      }
      if (done && kind === 'cut') {
        // Freed: she gets up and turns to face you.
        standT += dt;
        crouch = Math.max(0, 1 - standT * 1.5);
        model.root.rotation.y += (Math.atan2(-n.x, -n.z) - model.root.rotation.y) * Math.min(1, dt * 3);
      }
      model.update(dt, 0, crouch, 0, false);
      model.torso.updateMatrixWorld(true);
      prop.work.copy(model.torso.localToWorld(workLocal.clone()));
    },
    complete() {
      done = true;
      if (kind === 'cut') { zip.visible = false; model.setCaptive('side'); Audio.foley('cut', prop.work); }
      if (kind === 'detain') { zip.visible = true; Audio.foley('zip', prop.work); }
      if (kind === 'rescue') model.root.visible = false; // Reyes gets up and joins the squad
    },
    dispose() { model.root.removeFromParent(); },
  };
  prop.update(0, 0, false, 0);
  return prop;
}

function spliceProp(game, o, pos, n) {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = Math.atan2(n.x, n.z);
  const grey = mat(0x6b7166, 0.6, 0.55), dark = mat(0x22252a, 0.6, 0.3);
  // Antenna mast with the junction box clamped to it.
  cyl(0.045, 0.05, 4.2, mat(0x8a8d90, 0.4, 0.8), 0, 2.1, -0.16, g, 12);
  for (const yy of [3.4, 3.9]) box(0.9, 0.03, 0.03, mat(0x8a8d90, 0.4, 0.8), 0, yy, -0.16, g);
  box(0.38, 0.5, 0.16, grey, 0, 1.25, 0, g);
  box(0.33, 0.45, 0.01, dark, 0, 1.25, 0.075, g);
  const door = new THREE.Group();
  door.position.set(-0.19, 1.25, 0.08);
  door.rotation.y = -1.95;
  g.add(door);
  box(0.38, 0.5, 0.012, grey, 0.19, 0, 0, door);
  for (let i = 0; i < 6; i++) box(0.035, 0.025, 0.02, mat(0xd8d4c4, 0.7, 0), -0.1 + i * 0.04, 1.36, 0.085, g);
  const wireCols = [0xc02020, 0x2050c0, 0xe0c020, 0x20a040, 0xe0e0e0];
  wireCols.forEach((c, i) => tube([V(-0.1 + i * 0.04, 1.35, 0.09), V(-0.08 + i * 0.035, 1.22, 0.12), V(-0.04 + i * 0.02, 1.12, 0.1), V(0, 1.03, 0.06)], 0.0035, mat(c, 0.55, 0), g));
  tube([V(0, 1.5, -0.02), V(0, 1.9, -0.1), V(0, 3.3, -0.12)], 0.01, mat(0x111111, 0.6, 0), g);
  const light = led(0xff2a1a, 0.01, 0.14, 1.46, 0.085, g);
  game.scene.add(g);
  g.updateMatrixWorld(true);
  const work = g.localToWorld(V(0, 1.2, 0.12));
  let sparkT = 0.5, done = false;
  return {
    kind: 'splice', group: g, work, n, stand: 0.45, crouch: false,
    update(dt, k, acting, t) {
      if (acting && !done) {
        sparkT -= dt;
        if (sparkT <= 0) {
          sparkT = 0.4 + Math.random() * 0.7;
          game.effects.impact(work.clone().addScaledVector(n, -0.03), n.clone(), 'metal');
          Audio.foley('spark', work);
        }
      }
      light.material.color.set(done ? 0x30ff60 : Math.sin(t * 5) > 0 ? 0xff2a1a : 0x401010);
    },
    complete() { done = true; Audio.foley('beep', work); },
    dispose() { g.removeFromParent(); },
  };
}

function driveProp(game, o, pos, n, kind) {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = Math.atan2(n.x, n.z);
  const dark = mat(0x1e2124, 0.5, 0.4), steel = mat(0x8c9196, 0.3, 0.85);
  let item, slideAxis, itemHome;
  const leds = [];
  if (kind === 'drive') {
    box(0.56, 1.05, 0.5, dark, 0, 0.525, 0, g);
    for (let i = 0; i < 4; i++) { box(0.4, 0.05, 0.01, mat(0x0b0c0d, 0.5, 0.2), 0, 0.72 + i * 0.07, 0.252, g); leds.push(led(0x30ff70, 0.006, 0.23, 0.72 + i * 0.07, 0.257, g)); }
    item = new THREE.Group();
    box(0.11, 0.035, 0.16, mat(0xd8731e, 0.55, 0.2), 0, 0, -0.06, item);
    box(0.08, 0.02, 0.012, steel, 0, 0, 0.026, item);
    itemHome = V(0, 0.93, 0.25);
    slideAxis = V(0, 0, 1);
  } else {
    box(0.5, 0.72, 0.5, dark, 0, 0.36, 0, g);
    cyl(0.16, 0.18, 0.06, steel, 0, 0.75, 0, g, 24);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set(0, 0.95, 0);
    g.add(glass);
    item = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 20), new THREE.MeshStandardMaterial({ color: 0x40e0ff, emissive: 0x30c8ff, emissiveIntensity: 2.2, roughness: 0.2 }));
    item.add(core);
    cyl(0.062, 0.062, 0.03, steel, 0, 0.13, 0, item, 20);
    cyl(0.062, 0.062, 0.03, steel, 0, -0.13, 0, item, 20);
    itemHome = V(0, 0.93, 0);
    slideAxis = V(0, 1, 0);
  }
  item.position.copy(itemHome);
  g.add(item);
  game.scene.add(g);
  let done = false, cued = false;
  const prop = {
    kind, group: g, work: V(), n, stand: 0.45, crouch: true,
    update(dt, k, acting, t) {
      const pull = smooth(clamp01((k - 0.55) / 0.45));
      item.position.copy(itemHome).addScaledVector(slideAxis, (kind === 'drive' ? 0.16 : 0.22) * pull);
      if (!cued && pull > 0.05) { cued = true; Audio.foley('slide', prop.work); }
      for (let i = 0; i < leds.length; i++) leds[i].visible = Math.sin(t * (5 + i * 2)) > 0;
      g.updateMatrixWorld(true);
      prop.work.copy(item.localToWorld(kind === 'drive' ? V(0, 0, 0.03) : V(0, 0, 0)));
    },
    complete() { done = true; item.visible = false; Audio.foley('stick', prop.work); },
    dispose() { g.removeFromParent(); },
  };
  prop.update(0, 0, false, 0);
  return prop;
}

/**
 * A hinged door in a doorway, locked until picked. spec: { x, z, w, h, axis: 'x'|'z',
 * out: -1|1 (which side is outside, along the wall normal) }. While closed it keeps
 * the player out of the doorway.
 */
export function buildDoor(game, spec) {
  const w = spec.w ?? 1.7, h = spec.h ?? 2.35, out = spec.out ?? -1;
  const g = new THREE.Group();
  g.position.set(spec.x, 0, spec.z);
  g.rotation.y = spec.axis === 'z' ? -Math.PI / 2 : 0;
  const pivot = new THREE.Group();
  pivot.position.set(-w / 2 + 0.04, 0, 0);
  g.add(pivot);
  const wood = mat(0x4a3424, 0.75, 0.05), brass = mat(0xb08a3a, 0.35, 0.85), steel = mat(0x8c9196, 0.3, 0.85);
  const lw = w - 0.08;
  box(lw, h, 0.05, wood, lw / 2, h / 2, 0, pivot);
  for (const [yy, hh] of [[0.55, 0.7], [1.6, 0.8]]) for (const sgn of [-1, 1]) box(lw - 0.3, hh, 0.012, mat(0x3c2a1d, 0.8, 0.05), lw / 2, yy, sgn * 0.031, pivot);
  for (const sgn of [-1, 1]) {
    box(0.035, 0.035, 0.03, brass, lw - 0.12, 1.0, sgn * 0.04, pivot);
    box(0.12, 0.02, 0.02, brass, lw - 0.17, 1.0, sgn * 0.065, pivot);
  }
  const cylinder = cyl(0.014, 0.014, 0.02, steel, lw - 0.12, 0.88, out * 0.035, pivot, 12);
  cylinder.rotation.x = Math.PI / 2;
  game.scene.add(g);
  g.updateMatrixWorld(true);
  const lock = pivot.localToWorld(V(lw - 0.12, 0.9, out * 0.06));
  const n = V(0, 0, out).transformDirection(g.matrixWorld).setY(0).normalize();
  const door = {
    group: g, lock, n, open: false, angle: 0,
    unlock() { door.open = true; },
    update(dt) {
      const target = door.open ? 1.55 * out : 0;
      door.angle += (target - door.angle) * Math.min(1, dt * 2.2);
      pivot.rotation.y = door.angle;
    },
    /** Keep the player out of a closed doorway (push them back to their side). */
    block(p) {
      if (door.open && Math.abs(door.angle) > 0.6) return;
      const lp = g.worldToLocal(p.pos.clone());
      if (Math.abs(lp.x) > w / 2 + 0.1 || Math.abs(lp.z) > 0.45 || lp.y > h) { if (Math.abs(lp.z) > 0.45) door.side = Math.sign(lp.z); return; }
      lp.z = (door.side ?? Math.sign(lp.z || out)) < 0 ? -0.45 : 0.45; // back to the side you came from
      const wp = g.localToWorld(lp);
      p.pos.x = wp.x;
      p.pos.z = wp.z;
    },
    dispose() { g.removeFromParent(); },
  };
  return door;
}

function lockProp(game, o, door) {
  let pickT = 0;
  return {
    kind: 'lockpick', group: null, work: door.lock.clone(), n: door.n.clone(), stand: 0.62, crouch: true,
    update(dt, k, acting) {
      if (acting) { pickT -= dt; if (pickT <= 0) { pickT = 0.12 + Math.random() * 0.2; Audio.foley('pick', door.lock); } }
    },
    complete() { Audio.foley('unlock', door.lock); door.unlock(); },
    dispose() {},
  };
}

/**
 * Build the prop for an interact objective. `toward` points from the target to
 * where the player is coming from.
 */
export function buildObjectiveProp(game, o, pos, toward) {
  const kind = actionKind(o);
  if (kind === 'lockpick' && o.doorRef) return lockProp(game, o, o.doorRef);
  const n = openSide(game.world, pos, toward);
  switch (kind) {
    case 'tracker': return trackerProp(game, o, pos, n);
    case 'c4': return c4Prop(game, o, pos, n);
    case 'cut': case 'detain': case 'rescue': return personProp(game, o, pos, n, kind);
    case 'splice': return spliceProp(game, o, pos, n);
    case 'drive': case 'core': return driveProp(game, o, pos, n, kind);
    default: return hackProp(game, o, pos, n);
  }
}
