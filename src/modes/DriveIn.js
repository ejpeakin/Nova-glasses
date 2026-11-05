// Arrival by vehicle, filmed from outside: an armoured truck grinding in down a road
// with the squad in the back, or a fast boat running low across the harbour.
//   1. A chase shot that swings from behind the vehicle to alongside it as it rolls in.
//   2. A cut to your own eyes as it stops: the squad climbs out and fans out to their
//      spots (or, in the boat, the quay ladder in front of you), and you step off.
// The truck stays parked; the boat backs off and leaves (tick(), after control
// returns to you). Acts as the game's camera "cinematic" until you are out.
import * as THREE from '../lib/three.js';
import { buildMRAP, buildCargoTruck, bevelBox } from '../campaign/FilmProps.js';
import { Humanoid } from '../ai/Humanoid.js';
import { Audio } from '../core/Audio.js';
import { clamp, smoothstep } from '../core/Utils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A rigid-hull inflatable: grey hull, black tubes, centre console and twin outboards. Faces +X. */
function buildBoat() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x4a4f52, roughness: 0.6, metalness: 0.3 });
  const tube = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.85, metalness: 0.05 });
  const deck = new THREE.MeshStandardMaterial({ color: 0x2b2e30, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.7, metalness: 0.3 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  // Hull: a wedge-bowed box.
  const shape = new THREE.Shape();
  shape.moveTo(-3.6, 0); shape.lineTo(2.6, 0); shape.quadraticCurveTo(4.3, 0.15, 4.6, 0.9); shape.lineTo(-3.6, 0.9); shape.lineTo(-3.6, 0);
  const hg = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  hg.translate(0, 0, -1.1);
  add(hg, hull, 0, -0.35, 0);
  add(new THREE.BoxGeometry(7.6, 0.06, 2.0), deck, 0.2, 0.52, 0);
  // Inflatable collar round the sides and bow.
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.3, 6.6, 6, 12), tube, -0.2, 0.62, s * 1.12, 0, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(1.12, 0.3, 8, 16, Math.PI), tube, 3.3, 0.62, 0, Math.PI / 2, 0, -Math.PI / 2);
  // Console with windscreen, seats, twin outboards.
  add(bevelBox(0.9, 1.0, 0.9, 0.06), hull, 0.4, 1.05, 0);
  add(new THREE.BoxGeometry(0.06, 0.45, 0.9), new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.5 }), 0.86, 1.72, 0, 0, 0, -0.35);
  for (const x of [-0.7, -1.7]) add(new THREE.BoxGeometry(0.6, 0.5, 1.2), deck, x, 0.8, 0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.45, 0.9, 0.38), dark, -3.85, 0.55, s * 0.45);
    add(new THREE.BoxGeometry(0.16, 0.7, 0.14), dark, -3.95, -0.15, s * 0.45);
  }
  g.userData = { length: 8.2 };
  return g;
}

export class DriveIn {
  /**
   * o: { vehicle: 'mrap' | 'truck' | 'boat', path: [[x, z], ...] to the stop,
   *      exit: [x, z] (or [x, y, z]) where you step off, exitYaw, spots: [[x, z]...] for
   *      the squad, squad (actors), crew: number of extra team members riding in the
   *      boat, lines: [{ t, who, text }], water: y of the water (boat), onDone }
   */
  constructor(game, o) {
    this.game = game;
    this.o = o;
    this.squad = o.squad ?? [];
    this.spots = o.spots ?? [];
    this.lines = (o.lines ?? []).map((l) => ({ ...l }));
    this.boat = o.vehicle === 'boat';
    this.y0 = this.boat ? (o.water ?? -1.2) + 0.15 : 0;
    this.curve = new THREE.CatmullRomCurve3(o.path.map(([x, z]) => V(x, this.y0, z)));
    this.len = this.curve.getLength();
    this.drive = o.drive ?? clamp(this.len / (this.boat ? 9 : 6.5), 7, 13); // seconds of rolling in
    this.exit = o.exit.length === 3 ? V(o.exit[0], o.exit[1], o.exit[2]) : V(o.exit[0], 0, o.exit[1]);
    this.exitYaw = o.exitYaw ?? 0;
    const v = this.boat ? buildBoat() : o.vehicle === 'truck' ? buildCargoTruck({ color: o.color ?? 0x5c6250, seed: 7, code: 'OR-21' }) : buildMRAP({ color: o.color ?? 0x6e6a58, seed: 9, code: 'OR-11' });
    v.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    game.scene.add(v);
    this.v = v;
    // Crew who stay with the boat (Hatch on the console, Reyes at the bow).
    this.crew = [];
    for (let i = 0; i < (o.crew ?? 0); i++) {
      const h = new Humanoid('orion', 'rk74', { seed: 31 + i * 9 });
      h.root.position.set(i === 0 ? -0.2 : 2.4, 0.55, i === 0 ? 0 : 0.5);
      h.root.rotation.y = -Math.PI / 2; // facing +X with the boat
      v.add(h.root);
      this.crew.push({ h, crouch: i === 0 ? 0 : 1 });
    }
    // Squad rides inside, out of sight, until it stops.
    for (const s of this.squad) { s.scripted = true; s.model.root.visible = false; }
    this.t = 0;
    this.done = false;
    this.leaving = 0;
    this._place(0);
    Audio.startLoop('drive', 'engine');
  }

  _place(u, t = 0) {
    const v = this.v;
    const p = this.curve.getPointAt(clamp(u, 0, 1));
    const tan = this.curve.getTangentAt(clamp(u, 0, 0.999));
    v.position.copy(p);
    const moving = u < 1 ? 1 : 0;
    if (this.boat) {
      // Running across the swell: pitch, roll and bob.
      v.position.y = this.y0 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.1) * 0.03;
      v.rotation.set(Math.sin(t * 1.7) * 0.03, Math.atan2(-tan.z, tan.x), Math.sin(t * 2.3 + 1) * 0.05 * moving - 0.08 * moving, 'YXZ');
    } else {
      v.position.y = Math.sin(t * 9) * 0.015 * moving;
      v.rotation.set(0, Math.atan2(-tan.z, tan.x), Math.sin(t * 3.3) * 0.008 * moving, 'YXZ');
    }
    v.updateMatrixWorld(true);
  }

  skip() { this.t = this.drive + 4; this.finish(); }

  update(dt, camera) {
    if (this.done) return;
    this.t += dt;
    const t = this.t, D = this.drive;
    for (const l of this.lines) if (!l.said && t >= l.t) { l.said = true; this.game.hud.say([{ who: l.who, text: l.text }]); }
    const k = clamp(t / D, 0, 1);
    const u = k < 1 ? 1 - Math.pow(1 - k, 2.2) : 1;
    const prevU = this._u ?? 0;
    this._u = u;
    this._place(u, t);
    // Wheels turn with the distance covered.
    const wr = this.v.userData.wheelR;
    if (wr) for (const w of this.v.userData.wheels) w.rotation.z -= ((u - prevU) * this.len) / wr;
    for (const c of this.crew) c.h.update(dt, 0, c.crouch, 0, false, 1);
    Audio.setLoop('drive', t < D ? 0.55 : 0.18, t < D ? 0.35 + (1 - k) * 0.9 : 0.1);
    if (this.boat && t < D && Math.random() < dt * 30) {
      // Wake and bow spray.
      const back = V(-4.2, 0, (Math.random() - 0.5) * 1.6).applyMatrix4(this.v.matrixWorld);
      this.game.effects.smoke.emit(back.x, this.y0 - 0.1, back.z, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, { life: 1.6, size: 0.5, sizeEnd: 2.2, color: [0.82, 0.88, 0.9], alpha: 0.3, drag: 1.5 });
    }
    const v = this.v;
    const L = this.boat ? 4 : this.o.vehicle === 'truck' ? 4.2 : 3.4; // half-length: the back door is just behind it
    let camPos, look;
    if (t < D) {
      // Chase: from behind and high, swinging round to alongside and low.
      const s = smoothstep(k);
      // (Aimed a little below the vehicle so it sits in the upper half of the frame,
      // clear of the mission title card and subtitles.)
      const off = this.boat ? V(-10 + s * 9, 2.4 - s * 1.2, 4.2 + s * 1.0) : V(-12 + s * 11, 4.2 - s * 2.8, 5.0 + s * 1.2);
      camPos = off.applyMatrix4(v.matrixWorld);
      look = V(L * 0.5 + s * 3, this.boat ? -1.6 : -1.2, 0).applyMatrix4(v.matrixWorld);
    } else {
      // Off the vehicle: your eyes, the team dismounting, then turning to the objective.
      const e = t - D;
      const fwd = V(-Math.sin(this.exitYaw), 0, -Math.cos(this.exitYaw));
      const eye = this.exit.clone().setY(this.exit.y + 1.64);
      if (this.boat) {
        // Standing at the bow, then up the ladder onto the quay.
        const bow = V(3.2, 1.9, 0).applyMatrix4(v.matrixWorld);
        const up = smoothstep(clamp((e - 1.2) / 1.4, 0, 1));
        camPos = bow.lerp(eye, up);
        look = this.exit.clone().addScaledVector(fwd, 8).setY(1.2).lerp(eye.clone().addScaledVector(fwd, 10), up);
      } else {
        camPos = eye;
        const rear = V(-L - 1, 1.2, 0).applyMatrix4(v.matrixWorld);
        look = rear.lerp(eye.clone().addScaledVector(fwd, 10), smoothstep(clamp((e - 1.4) / 1.4, 0, 1)));
      }
      // The squad climbs out of the back, one at a time, and spreads out.
      if (!this.boat) {
        const door = V(-L - 0.9, 0, 0).applyMatrix4(v.matrixWorld);
        this.squad.forEach((sq, i) => {
          if (e < 0.25 + i * 0.5 || !sq.scripted || !sq.alive) return;
          sq.scripted = false;
          sq.model.root.visible = true;
          sq.pos.set(door.x + (i % 2 ? 0.5 : -0.5), 0, door.z);
          const spot = this.spots[i];
          if (spot) sq.command('move', V(spot[0], 0, spot[1]), this.exitYaw);
        });
      }
      if (e > (this.boat ? 2.8 : 3.0)) { camera.position.copy(camPos); camera.lookAt(look); camera.updateMatrixWorld(); this.finish(); return; }
    }
    camera.position.copy(camPos);
    camera.lookAt(look);
    camera.updateMatrixWorld();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this._place(1, this.t);
    this.squad.forEach((s, i) => {
      if (!s.scripted) return;
      s.scripted = false;
      s.model.root.visible = true;
      const spot = this.spots[i] ?? [this.exit.x + 1.5 * (i + 1), this.exit.z];
      s.pos.set(spot[0], 0, spot[1]);
    });
    if (this.boat) this.leaving = 0.001; // the boat backs off and runs out to sea
    Audio.setLoop('drive', this.boat ? 0.3 : 0.1, 0.2);
    this.o.onDone?.();
  }

  /** After control returns: the boat leaves; the truck idles at the kerb. */
  tick(dt) {
    if (!this.done) return;
    for (const c of this.crew) c.h.update(dt, 0, c.crouch, 0, false, 1);
    if (!this.boat || !this.leaving) return;
    this.leaving += dt;
    const v = this.v;
    const k = this.leaving;
    const back = V(-Math.cos(v.rotation.y), 0, Math.sin(v.rotation.y));
    const sp = Math.min(9, k * k * 1.5);
    v.position.addScaledVector(back, sp * dt);
    v.rotation.y += dt * 0.25 * Math.min(1, k / 3);
    v.position.y = this.y0 + Math.sin(k * 2.3) * 0.08;
    Audio.setLoop('drive', Math.max(0, 0.45 - k * 0.04), 0.6);
    if (k > 14) { v.removeFromParent(); this.leaving = 0; Audio.stopLoop?.('drive'); }
  }

  dispose() {
    Audio.stopLoop?.('drive');
    this.v.removeFromParent();
  }
}
