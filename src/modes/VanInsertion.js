// Ground insertion for quiet raids. You ride in the back of an unmarked van with the
// lights off while it creeps through the dark streets, a dim red dome light on and two
// of the team up front. It pulls in to the kerb out of the target's sight, the side
// door slides open, the squad steps down and spreads out along the wall, and you
// follow them out onto the pavement.
//
// Acts as the game's camera "cinematic" until you are out; the van stays parked
// (its footprint is a collider added by the mission's build step).
import * as THREE from '../lib/three.js';
import { bevelBox } from '../campaign/FilmProps.js';
import { Audio } from '../core/Audio.js';
import { clamp, smoothstep } from '../core/Utils.js';

const DRIVE = 11; // seconds from the first frame to the stop
const SETTLE = 0.8, DOOR = 1.2, STEP = 1.8;

function buildVan() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x9a9fa2, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.8, metalness: 0.2 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x3a3c3d, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.85 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const B = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  // Shell (front of the van toward -Z). Floor, roof, rear doors.
  B(2.0, 0.08, 4.3, inner, 0, 0.49, 0.5);
  B(2.04, 0.07, 4.15, paint, 0, 2.33, 0.6);
  B(2.0, 1.85, 0.06, paint, 0, 1.42, 2.65);
  for (const s of [-1, 1]) B(0.7, 0.4, 0.02, glass, s * 0.5, 1.95, 2.69); // rear windows
  // Left side: one long panel, front door window.
  B(0.05, 0.9, 4.3, paint, -1.0, 0.9, 0.5);
  B(0.05, 0.97, 3.2, paint, -1.0, 1.84, 1.05);
  B(0.05, 0.06, 1.1, paint, -1.0, 2.3, -1.1);
  B(0.02, 0.85, 1.05, glass, -1.0, 1.82, -1.1);
  // Right side: front door window, the sliding door opening, and the panel behind it.
  B(0.05, 0.9, 1.2, paint, 1.0, 0.9, -1.05);
  B(0.05, 0.06, 1.1, paint, 1.0, 2.3, -1.1);
  B(0.02, 0.85, 1.05, glass, 1.0, 1.82, -1.1);
  B(0.05, 1.87, 1.8, paint, 1.0, 1.41, 1.75);
  const door = new THREE.Group();
  const dp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.82, 1.3), paint);
  door.add(dp);
  const dw = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.9), glass);
  dw.position.set(0.02, 0.45, 0);
  door.add(dw);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.16), trim);
  handle.position.set(0.04, 0.0, -0.45);
  door.add(handle);
  door.position.set(1.0, 1.42, 0.2);
  g.add(door);
  // Cab: bonnet, windscreen, pillars, bumpers, grille, lights, mirrors.
  add(bevelBox(2.0, 0.8, 0.8, 0.12), paint, 0, 0.85, -2.25);
  B(2.0, 0.12, 0.5, paint, 0, 1.28, -1.75);
  const ws = add(new THREE.PlaneGeometry(1.86, 0.98), glass, 0, 1.78, -1.62, -0.5);
  void ws;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 1.05, 0.08), paint, s * 0.97, 1.78, -1.62, -0.5);
  B(2.08, 0.22, 0.16, trim, 0, 0.55, -2.7);
  B(2.08, 0.22, 0.16, trim, 0, 0.55, 2.72);
  B(1.3, 0.3, 0.04, trim, 0, 0.95, -2.66);
  const lamp = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.1, metalness: 0.8 });
  for (const s of [-1, 1]) B(0.32, 0.16, 0.04, lamp, s * 0.78, 1.0, -2.66);
  const brake = new THREE.MeshStandardMaterial({ color: 0x3a0606, emissive: 0xff1a10, emissiveIntensity: 0.15, roughness: 0.4 });
  for (const s of [-1, 1]) B(0.14, 0.42, 0.04, brake, s * 0.9, 1.3, 2.69);
  for (const s of [-1, 1]) { B(0.06, 0.22, 0.14, trim, s * 1.1, 1.75, -1.55); B(0.18, 0.04, 0.04, trim, s * 1.04, 1.7, -1.58); }
  // Wheels.
  for (const s of [-1, 1]) for (const z of [-1.75, 1.7]) {
    add(new THREE.CylinderGeometry(0.37, 0.37, 0.24, 20), rubber, s * 0.92, 0.37, z, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12), lamp, s * 0.92, 0.37, z, 0, 0, Math.PI / 2);
    B(0.1, 0.12, 0.95, trim, s * 1.0, 0.78, z); // wheel arch
  }
  // Inside: dashboard with a dim cluster, wheel, front seats with the two up front.
  B(1.9, 0.26, 0.42, dark, 0, 1.24, -1.62);
  const cluster = new THREE.MeshStandardMaterial({ color: 0x1a0e04, emissive: 0xffa040, emissiveIntensity: 0.6 });
  B(0.32, 0.08, 0.02, cluster, -0.45, 1.33, -1.4);
  add(new THREE.TorusGeometry(0.19, 0.025, 8, 24), dark, -0.45, 1.38, -1.38, -1.1);
  const kit = new THREE.MeshStandardMaterial({ color: 0x2b2e2a, roughness: 0.9 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0x3c4034, roughness: 0.8 });
  for (const s of [-1, 1]) {
    B(0.5, 0.14, 0.5, dark, s * 0.45, 0.95, -0.95);
    B(0.5, 0.72, 0.12, dark, s * 0.45, 1.4, -0.66);
    B(0.26, 0.2, 0.1, dark, s * 0.45, 1.88, -0.66);
    // A team member in each front seat: plate carrier, shoulders, helmet and NVG mount.
    B(0.46, 0.55, 0.3, kit, s * 0.45, 1.36, -0.92);
    add(new THREE.SphereGeometry(0.105, 12, 10), dark, s * 0.45, 1.8, -0.92);
    add(new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), helmet, s * 0.45, 1.84, -0.93);
    B(0.06, 0.05, 0.05, kit, s * 0.45, 1.9, -1.06);
  }
  // Cargo: bench along the left wall, kit bags, a dim red dome light.
  B(0.45, 0.42, 2.4, dark, -0.72, 0.74, 1.2);
  B(0.5, 0.3, 0.7, kit, 0.55, 0.68, 2.1);
  B(0.4, 0.26, 0.55, kit, 0.6, 0.66, 1.4);
  const dome = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 0.7 });
  B(0.22, 0.03, 0.12, dome, 0, 2.29, 0.9);
  const red = new THREE.PointLight(0xff2a14, 0.3, 2.4, 2);
  red.position.set(0, 2.15, 0.9);
  g.add(red);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, door, brake, red };
}

export class VanInsertion {
  /**
   * o: { path: [[x, z], ...] from the start of the run to the stop, exit: [x, z] where
   *      you step down, exitYaw, spots: [[x, z], ...] where the squad spreads out,
   *      squad, lines: [{ t, who, text }], onDone }
   */
  constructor(game, o) {
    this.game = game;
    this.squad = o.squad ?? [];
    this.spots = o.spots ?? [];
    this.lines = (o.lines ?? []).map((l) => ({ ...l }));
    this.onDone = o.onDone;
    const pts = o.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts);
    this.exit = new THREE.Vector3(o.exit[0], 0, o.exit[1]);
    this.exitYaw = o.exitYaw ?? 0;
    const van = buildVan();
    this.van = van;
    game.scene.add(van.group);
    this.t = 0;
    this.done = false;
    this._place(0, 0);
    // The squad rides in the back: hidden until the door opens.
    for (const s of this.squad) { s.scripted = true; s.model.root.visible = false; s.pos.copy(this.van.group.position); }
    this.camLocal = new THREE.Vector3(0.18, 1.56, 0.35);
    this.lookLocal = new THREE.Vector3(0.05, 1.3, -4);
    Audio.startLoop('van', 'engine');
  }

  _place(u, t) {
    const v = this.van.group;
    const p = this.curve.getPointAt(clamp(u, 0, 1));
    const tan = this.curve.getTangentAt(clamp(u, 0, 0.999));
    const yaw = Math.atan2(-tan.x, -tan.z);
    // Suspension: a gentle float on the springs while moving, a dip forward on the brakes.
    const moving = t < DRIVE ? 1 : 0;
    const braking = t > DRIVE - 2.5 && t < DRIVE + SETTLE ? Math.sin(clamp((t - (DRIVE - 2.5)) / (2.5 + SETTLE), 0, 1) * Math.PI) : 0;
    v.position.set(p.x, Math.sin(t * 7.3) * 0.012 * moving + Math.sin(t * 3.1) * 0.008 * moving, p.z);
    v.rotation.set(-0.025 * braking + Math.sin(t * 2.3) * 0.004 * moving, yaw, Math.sin(t * 1.7) * 0.006 * moving);
    v.updateMatrixWorld(true);
  }

  skip() { this.t = DRIVE + SETTLE + DOOR + STEP; this.finish(); }

  update(dt, camera) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    for (const l of this.lines) if (!l.said && t >= l.t) { l.said = true; this.game.hud.say([{ who: l.who, text: l.text }]); }
    // Drive: rolling in, easing off to a stop at the kerb.
    const k = clamp(t / DRIVE, 0, 1);
    const u = 1 - (1 - k) * (1 - k);
    this._place(u, t);
    const speed = (2 * (1 - k)) / DRIVE;
    this.van.brake.emissiveIntensity = t > DRIVE - 3 ? 1.4 : 0.15;
    Audio.setLoop('van', 0.5, t < DRIVE ? 0.4 + speed * 3 : 0.15);
    const v = this.van.group;
    // The side door slides back once you are stopped.
    const d = smoothstep(clamp((t - DRIVE - SETTLE) / DOOR, 0, 1));
    this.van.door.position.set(1.0 + Math.min(1, d * 4) * 0.1, 1.42, 0.2 + d * 1.25);
    if (d > 0 && !this._opened) { this._opened = true; Audio.ui?.('click'); }
    // Squad out first, one at a time, each to his own spot along the wall.
    const out = t - DRIVE - SETTLE - DOOR * 0.6;
    const doorWorld = v.localToWorld(new THREE.Vector3(1.6, 0, 0.2));
    this.squad.forEach((s, i) => {
      if (out < i * 0.55 || !s.scripted || !s.alive) return;
      s.scripted = false;
      s.model.root.visible = true;
      s.pos.set(doorWorld.x, 0, doorWorld.z);
      const spot = this.spots[i];
      if (spot) s.command('move', new THREE.Vector3(spot[0], 0, spot[1]), this.exitYaw);
    });
    // Camera: seated behind the front seats, looking out through the windscreen; then
    // a look across to the open door, and out onto the pavement.
    const sway = t < DRIVE ? 1 : 0;
    const cam = this.camLocal.clone().add(new THREE.Vector3(Math.sin(t * 1.3) * 0.01 * sway, Math.sin(t * 2.1) * 0.008 * sway, 0));
    const look = this.lookLocal.clone().lerp(new THREE.Vector3(1.6, 1.2, 0.6), smoothstep(clamp((t - DRIVE - SETTLE * 0.5) / DOOR, 0, 1)));
    const camW = v.localToWorld(cam);
    const lookW = v.localToWorld(look);
    const s = smoothstep(clamp((t - DRIVE - SETTLE - DOOR) / STEP, 0, 1));
    if (s > 0) {
      // Through the door (half way) and down onto the pavement facing the target.
      const mid = v.localToWorld(new THREE.Vector3(1.05, 1.5, 0.3));
      const end = this.exit.clone().setY(1.64);
      const a = s < 0.5 ? camW.lerp(mid, s * 2) : mid.lerp(end, (s - 0.5) * 2);
      camW.copy(a);
      const fwd = new THREE.Vector3(-Math.sin(this.exitYaw), 0, -Math.cos(this.exitYaw));
      lookW.lerp(end.clone().addScaledVector(fwd, 10), smoothstep(clamp((s - 0.25) / 0.75, 0, 1)));
    }
    camera.position.copy(camW);
    camera.lookAt(lookW);
    camera.updateMatrixWorld();
    if (t >= DRIVE + SETTLE + DOOR + STEP) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    // (Skipped: park the van and put everyone where they would be.)
    this._place(1, DRIVE + SETTLE + DOOR + STEP);
    this.van.door.position.set(1.1, 1.42, 1.45);
    this.van.brake.emissiveIntensity = 0.15;
    this.squad.forEach((s, i) => {
      if (!s.scripted) return;
      s.scripted = false;
      s.model.root.visible = true;
      const spot = this.spots[i] ?? [this.exit.x, this.exit.z];
      s.pos.set(spot[0], 0, spot[1]);
    });
    Audio.setLoop('van', 0.12, 0.1); // left idling at the kerb
    this.onDone?.();
  }

  dispose() {
    Audio.stopLoop?.('van');
  }
}
