// Helicopter fast-rope insertion. The player rides in the open door, the aircraft
// flares into a hover over the LZ, the rope drops and the player presses E to
// fast-rope down (first-person hands on the rope, braid sliding past). Squadmates
// follow down the rope, then the helicopter departs.
//
// Acts as the game's camera "cinematic" until the player touches down, then keeps
// animating the helicopter and squad through update(dt) from the campaign mode.
import * as THREE from '../lib/three.js';
import { Helicopter } from '../world/Helicopter.js';
import { buildArms } from '../weapons/WeaponModel.js';
import { Audio } from '../core/Audio.js';
import { clamp, damp, smoothstep } from '../core/Utils.js';

const FLIGHT = 11; // seconds from first frame to hover
const SEATS = [[-0.75, 0, -0.9], [-0.75, 0, 0.55], [0.15, 0, 1.55], [-0.1, 0, -1.6]];

export class Insertion {
  constructor(game, o) {
    this.game = game;
    this.squad = o.squad ?? [];
    this.onLanded = o.onLanded;
    this.lines = o.lines ?? {};
    this.hoverH = o.hover ?? 13;
    const w = game.world;
    this.lz = o.lz.clone();
    this.groundY = w.groundHeight(this.lz.x, this.lz.z, 50, 0.1, 0.3);
    const dir = o.from.clone().setY(0).normalize(); // direction the helicopter comes FROM
    const hoverPos = new THREE.Vector3(this.lz.x, this.groundY + this.hoverH, this.lz.z);
    // The rope hangs from the right side; offset the hover so the rope lands on the LZ.
    this.heading = Math.atan2(dir.x, dir.z); // nose faces away from the approach direction
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    hoverPos.addScaledVector(right, -2.05);
    this.hoverPos = hoverPos;
    this.path = new THREE.CatmullRomCurve3([
      hoverPos.clone().addScaledVector(dir, 190).setY(hoverPos.y + 42),
      hoverPos.clone().addScaledVector(dir, 90).setY(hoverPos.y + 24),
      hoverPos.clone().addScaledVector(dir, 28).setY(hoverPos.y + 6),
      hoverPos.clone(),
    ]);
    this.heli = new Helicopter(game.scene);
    this.phase = 'flight';
    this.t = 0;
    this.lookYaw = 0.15;
    this.lookPitch = -0.12;
    this.rope = 0;
    this.slide = 0;
    this.slideV = 0;
    this.camY = 0;
    this.done = false;
    this.camPos = new THREE.Vector3();
    this.camQuat = new THREE.Quaternion();
    this._placeHeli(0);

    // Hands-on-rope viewmodel.
    this.viewScene = new THREE.Scene();
    this.viewCam = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2, 1);
    this.viewScene.add(key);
    this.arms = buildArms(0x5a5a40);
    this.viewScene.add(this.arms.left, this.arms.right);
    this.showHands = false;

    for (const s of this.squad) { s.scripted = true; s.hidden = true; }
    game.player.hidden = true;
    game.player.invulnerable = 999;
    Audio.startLoop('rotor', 'rotor');
    Audio.startLoop('rope', 'rope');
  }

  _placeHeli(dt) {
    const h = this.heli.group;
    let pos, pitch = 0, roll = 0;
    if (this.phase === 'flight') {
      const u = clamp(this.t / FLIGHT, 0, 1);
      const e = 1 - Math.pow(1 - u, 2.2);
      pos = this.path.getPoint(e);
      const speed = Math.pow(1 - u, 1.2);
      // Nose down in cruise, flare nose-up as it brakes into the hover.
      pitch = -0.16 * speed + 0.2 * Math.sin(clamp((u - 0.62) / 0.38, 0, 1) * Math.PI);
      roll = Math.sin(this.t * 0.7) * 0.04 * speed;
    } else if (this.phase === 'depart') {
      this.departV = Math.min(38, (this.departV ?? 2) + dt * 7);
      const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
      this.departPos.addScaledVector(fwd, this.departV * dt);
      this.departPos.y += dt * Math.min(9, this.departV * 0.35);
      pos = this.departPos;
      pitch = -0.2 * Math.min(1, this.departV / 20);
      roll = -0.08 * Math.min(1, this.departV / 15);
    } else {
      // Hover: gentle bob and drift.
      pos = this.hoverPos.clone();
      pos.y += Math.sin(this.t * 1.1) * 0.22;
      pos.x += Math.sin(this.t * 0.5) * 0.15;
      roll = Math.sin(this.t * 0.8) * 0.02;
      pitch = Math.sin(this.t * 0.6) * 0.015;
    }
    h.position.copy(pos);
    h.rotation.set(pitch, this.heading, roll, 'YXZ');
    h.updateMatrixWorld();
  }

  skip() {
    if (this.phase === 'flight') this.t = FLIGHT;
  }

  /** Rotor wash: dust thrown outward on the ground under the helicopter. */
  _rotorWash(dt) {
    const p = this.heli.position;
    const alt = p.y - this.groundY;
    if (alt > 32) return;
    const k = 1 - alt / 32;
    const mat = this.game.world.groundMat;
    const col = mat === 'snow' ? [0.92, 0.94, 0.97] : mat === 'sand' ? [0.82, 0.72, 0.52] : [0.55, 0.54, 0.5];
    const n = Math.round(dt * 70 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
      const sp = 6 + Math.random() * 6;
      this.game.effects.smoke.emit(p.x + Math.cos(a) * r, this.groundY + 0.3, p.z + Math.sin(a) * r, Math.cos(a) * sp, 0.4 + Math.random(), Math.sin(a) * sp,
        { life: 1.6 + Math.random(), size: 0.8, sizeEnd: 3.5, color: col, alpha: 0.45 * k, drag: 1.6, spin: 0.5 });
    }
  }

  _seatSquad() {
    const h = this.heli.group;
    this.squad.forEach((s, i) => {
      if (!s.scripted || s.roping) return;
      const seat = SEATS[i % SEATS.length];
      s.pos.set(seat[0], seat[1], seat[2]).applyMatrix4(h.matrixWorld);
      s.yaw = this.heading - Math.PI / 2;
      s.scriptCrouch = 1;
    });
  }

  _squadRope(dt) {
    const anchor = this.heli.anchorWorld();
    let allDown = true;
    this.squad.forEach((s, i) => {
      if (!s.scripted) return;
      allDown = false;
      const start = 0.9 + i * 1.4;
      if (this.since < start) return;
      if (!s.roping) { s.roping = true; s.ropeY = anchor.y - 0.9; s.scriptCrouch = 0; }
      s.ropeV = Math.min(6, (s.ropeV ?? 0) + dt * 9);
      s.ropeY -= s.ropeV * dt;
      s.pos.set(anchor.x + 0.2, Math.max(this.groundY, s.ropeY - 1.4), anchor.z + 0.05 * i);
      s.yaw = this.heading + Math.PI / 2;
      if (s.ropeY - 1.4 <= this.groundY + 0.02) {
        // Step off the rope and fan out.
        s.scripted = false;
        s.hidden = false;
        s.roping = false;
        s.pos.y = this.groundY;
        s.state = 'follow';
        s.path = null;
        s.vel.set(Math.cos(i * 2.1) * 2.5, 0, Math.sin(i * 2.1) * 2.5);
      }
    });
    return allDown;
  }

  /** Camera driver while the player is aboard or on the rope. */
  update(dt, camera) {
    // While the weapon rack is open the aircraft loiters out at the start of the run.
    this.t = this.holdFlight ? Math.min(this.t + dt * 0.1, 1.2) : this.t + dt;
    const g = this.game;
    const input = g.input;
    const md = g.lastMouse ?? { x: 0, y: 0 };
    this.heli.update(dt);
    this._placeHeli(dt);
    this._seatSquad();
    this._rotorWash(dt);

    // Free look (limited to what you can see from the door).
    this.lookYaw = clamp(this.lookYaw - md.x * 0.0022, -1.9, 1.9);
    this.lookPitch = clamp(this.lookPitch - md.y * 0.0022, -1.25, 0.9);

    const h = this.heli.group;
    if (this.phase === 'flight') {
      if (!this.said30 && this.t > 2.5) { this.said30 = true; g.hud.say([this.lines.approach ?? { who: 'PILOT', text: 'Thirty seconds! Get ready on the ropes!' }]); }
      if (this.t >= FLIGHT) {
        this.phase = 'hover';
        this.hoverT = 0;
        g.hud.say([this.lines.ropes ?? { who: 'PILOT', text: 'Ropes out! Go, go, go!' }]);
      }
    } else if (this.phase === 'hover') {
      this.hoverT += dt;
      this.rope = Math.min(1, this.rope + dt * 1.4);
      if (this.rope >= 1) {
        g.hud.prompt('Press <b>E</b> to fast-rope down', 0);
        if (input.pressed('KeyE') || input.pressed('Space')) {
          this.phase = 'grab';
          this.grabT = 0;
          g.hud.prompt(null);
          Audio.mech('raise');
        }
      }
    }
    this.heli.updateRope(this.groundY, this.rope, this.slide);

    // Rotor volume: loud inside, fades with distance once you're down.
    const camDist = camera.position.distanceTo(h.position);
    Audio.setLoop('rotor', clamp(1.25 - camDist / 160, 0, 1) * (this.phase === 'flight' || this.phase === 'hover' ? 1 : 0.85));

    // Seat camera in the door, looking out.
    const seat = new THREE.Vector3(-0.25, 1.1, 0.1).applyMatrix4(h.matrixWorld); // on the cabin floor, facing the open door
    const lookQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch, -Math.PI / 2 + this.lookYaw, 0, 'YXZ'));
    const seatQ = h.quaternion.clone().multiply(lookQ);
    const shake = (this.phase === 'flight' || this.phase === 'hover') ? 0.004 : 0;

    if (this.phase === 'flight' || this.phase === 'hover') {
      this.camPos.copy(seat);
      this.camQuat.copy(seatQ);
      this.showHands = false;
    } else if (this.phase === 'grab') {
      // Swing out of the door onto the rope.
      this.grabT += dt;
      const k = smoothstep(clamp(this.grabT / 0.7, 0, 1));
      const anchor = this.heli.anchorWorld();
      const onRope = this._ropeCamPos(anchor, anchor.y - 0.75);
      this.camPos.lerpVectors(seat, onRope, k);
      this.camQuat.slerpQuaternions(seatQ, this._worldLookQuat(), k);
      this.showHands = k > 0.5;
      if (this.grabT >= 0.7) {
        this.phase = 'slide';
        this.camY = onRope.y;
        this.slideV = 0;
        this.ropeTopY = anchor.y;
      }
    } else if (this.phase === 'slide') {
      const anchor = this.heli.anchorWorld();
      const eye = 1.64;
      const left = this.camY - eye - this.groundY;
      // Accelerate, then brake hard for the last few metres.
      if (left > 3.2) this.slideV = Math.min(7.5, this.slideV + dt * 11);
      else this.slideV = Math.max(1.6, this.slideV - dt * 16);
      this.camY -= this.slideV * dt;
      this.slide += this.slideV * dt;
      Audio.setLoop('rope', clamp(this.slideV / 7.5, 0, 1) * 0.55, this.slideV / 7.5);
      this.camPos.copy(this._ropeCamPos(anchor, this.camY));
      this.camQuat.copy(this._worldLookQuat());
      this.showHands = true;
      if (this.camY - eye <= this.groundY + 0.01) this._land(anchor);
    }

    camera.position.copy(this.camPos);
    if (shake) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
    camera.quaternion.copy(this.camQuat);
    const fov = g.verticalFov();
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    this._placeHands(camera);
  }

  /** Camera sits just behind the rope (toward the aircraft), rope in front of the face. */
  _ropeCamPos(anchor, y) {
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    return new THREE.Vector3(anchor.x, y, anchor.z).addScaledVector(right, -0.45);
  }

  /** World-space look: heading out of the door plus the player's free look. */
  _worldLookQuat() {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch, this.heading - Math.PI / 2 + this.lookYaw, 0, 'YXZ'));
  }

  _placeHands(camera) {
    if (!this.showHands) { this.arms.left.visible = this.arms.right.visible = false; return; }
    this.arms.left.visible = this.arms.right.visible = true;
    // Rope points in camera space, gloves gripping one above the other.
    const anchor = this.heli.anchorWorld();
    const inv = camera.matrixWorldInverse;
    const k = Math.tan((camera.fov * Math.PI) / 360) / Math.tan((this.viewCam.fov * Math.PI) / 360);
    const toView = (y) => {
      const v = new THREE.Vector3(anchor.x, y, anchor.z).applyMatrix4(inv);
      v.x /= k; v.y /= k; // match the hands' narrower FOV
      return v;
    };
    const top = toView(camera.position.y + 0.02);
    const low = toView(camera.position.y - 0.22);
    if (top.z > -0.12 || low.z > -0.12) { this.arms.left.visible = this.arms.right.visible = false; return; } // looking away
    if (this.arms.real) {
      // Both gloved fists closed around the vertical rope, knuckles stacked down it.
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
      this.arms.attach('left', null, top, new THREE.Vector3(-0.42, -0.8, 0.12), 'fist', q);
      this.arms.attach('right', null, low, new THREE.Vector3(0.4, -0.85, 0.1), 'fist', q);
    } else {
      this.arms.place(this.arms.left, new THREE.Vector3(-0.3, -0.62, 0.08), top);
      this.arms.place(this.arms.right, new THREE.Vector3(0.3, -0.68, 0.08), low);
    }
    this.viewCam.aspect = window.innerWidth / window.innerHeight;
    this.viewCam.updateProjectionMatrix();
  }

  _land(anchor) {
    const g = this.game;
    const p = g.player;
    const pos = this._ropeCamPos(anchor, this.groundY);
    const euler = new THREE.Euler().setFromQuaternion(this.camQuat, 'YXZ');
    p.pos.set(pos.x, this.groundY, pos.z);
    p.vel.set(0, 0, 0);
    p.yaw = euler.y;
    p.pitch = clamp(euler.x, -0.6, 0.6);
    p.stance = 'stand';
    p.eye = 1.64;
    p.landDip = 0.12;
    p.hidden = false;
    p.invulnerable = 3;
    p.onGround = true;
    g.weapons.state = 'raise';
    g.weapons.stateT = 0;
    Audio.footstep(g.world.groundMat, null, 2);
    Audio.setLoop('rope', 0);
    this.phase = 'squad';
    this.since = 0;
    this.showHands = false;
    this.arms.left.visible = this.arms.right.visible = false;
    this.done = true;
    this.onLanded?.();
  }

  /** World animation after the player is down (squad roping, departure). */
  tick(dt) {
    if (this.removed) return;
    this.t += dt;
    this.heli.update(dt);
    this._placeHeli(dt);
    if (this.phase === 'squad') {
      this.since += dt;
      this._seatSquad();
      const allDown = this._squadRope(dt);
      this.heli.updateRope(this.groundY, 1, 0);
      if (allDown && this.since > 1.5) {
        this.phase = 'depart';
        this.departPos = this.heli.position.clone();
        this.rope = 0;
        this.heli.updateRope(this.groundY, 0);
        this.game.hud.say([this.lines.depart ?? { who: 'PILOT', text: 'Raven Two-One is clear. Good hunting.' }]);
      }
    } else if (this.phase === 'depart') {
      this.departT = (this.departT ?? 0) + dt;
      if (this.departT > 14) { this.dispose(); return; }
    }
    this._rotorWash(dt);
    const d = this.game.camera.position.distanceTo(this.heli.position);
    Audio.setLoop('rotor', clamp(1.15 - d / 170, 0, 1) * 0.85);
  }

  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.heli.dispose();
    Audio.stopLoop('rotor');
    Audio.stopLoop('rope');
    for (const s of this.squad) { s.scripted = false; s.hidden = false; }
  }
}
