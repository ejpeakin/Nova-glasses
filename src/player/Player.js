// First-person character controller: walking, sprinting, sliding, jumping,
// crouch/prone stances with headroom checks, step-up stairs, health regen.
import * as THREE from '../lib/three.js';
import { clamp, damp } from '../core/Utils.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';

const R = 0.3;
const STANCE = {
  stand: { h: 1.8, eye: 1.64, speed: 4.7 },
  crouch: { h: 1.25, eye: 1.12, speed: 2.7 },
  prone: { h: 0.7, eye: 0.42, speed: 1.15 },
};
const GRAVITY = 19;
const STEP = 0.48;

export class Player {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.camera = game.camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.stance = 'stand';
    this.eye = STANCE.stand.eye;
    this.onGround = true;
    this.sprinting = false;
    this.sliding = 0;
    this.slideDir = new THREE.Vector3();
    this.health = 100;
    this.maxHealth = 100;
    this.lastHurt = -99;
    this.alive = true;
    this.team = 'a';
    this.name = 'You';
    this.isPlayer = true;
    this.bobPhase = 0;
    this.bob = 0;
    this.landDip = 0;
    this.stepDist = 0;
    this.recoilPitch = 0; // camera offsets from recoil, recover over time
    this.recoilYaw = 0;
    this.shake = 0;
    this.hurtDirs = [];
    this.flashed = 0;
    this.lastShotTime = -99;
    this.noise = 0;
    this.speed = 0;
    this.time = 0;
    this.kills = 0;
    this.deaths = 0;
    this.damageMult = 1;
    this.invulnerable = 0;
    this.holdBreath = 0;
    this.breath = 1;
    this.deathRoll = 0;
    this.mantle = null; // active vault/mantle/climb move
    this.vaultPlan = null; // what Space would climb right now
    this.rappel = null; // active rappel down a wall
    this.vaultCheckT = 0;
  }

  spawn(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.stance = 'stand';
    this.eye = STANCE.stand.eye;
    this.health = this.maxHealth;
    this.alive = true;
    this.sliding = 0;
    this.recoilPitch = this.recoilYaw = 0;
    this.flashed = 0;
    this.invulnerable = 2;
    this.deathRoll = 0;
    this.mantle = null;
    this.vaultPlan = null;
    this.rappel = null;
    this.hurtDirs.length = 0;
  }

  get height() { return STANCE[this.stance].h; }
  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  get chest() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z); }
  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /** Mid-climb, mid-vault or on a rappel rope (weapon lowered, no firing). */
  get climbing() { return !!this.mantle || !!this.rappel; }

  /**
   * Can we vault over, mantle onto or climb what is directly ahead? Low cover
   * (sandbags, barriers, crates, sills) up to 1.65 m is a vault or mantle; ledges,
   * container sides, walls and fences up to 2.7 m are a climb (hands on the edge,
   * pull up). In the air (after a jump) the reach is measured from where we are.
   * Returns { to, over, crouch, vault, climb } or null.
   */
  _planVault(air = false) {
    if ((!air && !this.onGround) || this.stance === 'prone' || this.sliding > 0) return null;
    const w = this.world, y = this.pos.y;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const maxRise = air ? 2.1 : 2.7;
    // Probe a few distances ahead for the nearest face we could climb.
    let px = 0, pz = 0, top = 0, rise = 0, found = false;
    for (const reach of [R + 0.12, R + 0.28, R + 0.45]) {
      px = this.pos.x + fx * reach; pz = this.pos.z + fz * reach;
      top = w.groundHeight(px, pz, y + maxRise, 0, 0.1);
      rise = top - y;
      // There must be an actual face in front of us (not just stairs or a slope).
      if (rise >= (air ? 0.3 : 0.45) && rise <= maxRise && w.overlaps(px - 0.08, y + 0.25, pz - 0.08, px + 0.08, top - 0.05, pz + 0.08)
        && !w.overlaps(px - 0.08, top + 0.05, pz - 0.08, px + 0.08, top + 0.9, pz + 0.08)) { found = true; break; }
      if (w.overlaps(px - 0.08, y + maxRise + 0.02, pz - 0.08, px + 0.08, y + maxRise + 0.1, pz + 0.08)) return null; // a wall too tall to climb is in the way
    }
    if (!found) return null;
    const climb = rise > 1.65;
    // Room to pass over the top (diving through a window counts).
    if (this._blocked(px, top, pz, 1.05)) return null;
    // Thin obstacle (barrier, wall, fence): go over and land on the far side.
    if (rise <= (climb ? maxRise : 1.3)) {
      for (const d of [0.75, 1.1, 1.5]) {
        const qx = px + fx * d, qz = pz + fz * d;
        const g = w.groundHeight(qx, qz, top + 0.05, 0, R - 0.02);
        if (g >= top - 0.05) break; // obstacle keeps going: mantle onto it instead
        if (g < top - 0.3 && !this._blocked(qx, g, qz, STANCE.stand.h) && !this._blocked((px + qx) / 2, top, (pz + qz) / 2, 1.05)) {
          return { to: new THREE.Vector3(qx, g, qz), over: top, crouch: false, vault: true, climb };
        }
      }
    }
    // Deep obstacle: climb up and stand (or crouch) on top.
    const mx = this.pos.x + fx * (R + 0.55), mz = this.pos.z + fz * (R + 0.55);
    if (Math.abs(w.groundHeight(mx, mz, top + 0.05, 0, 0.1) - top) > 0.2) return null; // nothing to stand on up there
    if (this._blocked(mx, top, mz, STANCE.crouch.h)) return null;
    return { to: new THREE.Vector3(mx, top, mz), over: top, crouch: this._blocked(mx, top, mz, STANCE.stand.h), vault: false, climb };
  }

  _startMantle(plan) {
    const rise = plan.over - this.pos.y;
    const dur = plan.climb ? 0.75 + rise * 0.22 : plan.vault ? 0.55 : 0.5 + rise * 0.15;
    this.mantle = { t: 0, dur, from: this.pos.clone(), plan, fx: -Math.sin(this.yaw), fz: -Math.cos(this.yaw) };
    this.vel.set(0, 0, 0);
    this.vaultPlan = null;
    Audio.mech('raise');
    Audio.footstep(this.world.groundMat, null, 1.4);
  }

  _updateMantle(dt) {
    const m = this.mantle;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    const { from, plan } = m;
    if (plan.climb) {
      // Hand over hand: haul straight up the face, then roll over the edge.
      const up = Math.min(1, k / 0.62), over = Math.max(0, (k - 0.62) / 0.38);
      const hy = from.y + (plan.over + 0.12 - from.y) * (1 - Math.pow(1 - up, 2));
      const edge = new THREE.Vector3(from.x + (plan.to.x - from.x) * 0.12, 0, from.z + (plan.to.z - from.z) * 0.12);
      if (over <= 0) this.pos.set(edge.x * up + from.x * (1 - up), hy, edge.z * up + from.z * (1 - up));
      else {
        const e = over * over * (3 - 2 * over);
        this.pos.set(edge.x + (plan.to.x - edge.x) * e, plan.over + 0.12 + (plan.to.y - plan.over - 0.12) * e + Math.sin(e * Math.PI) * (plan.vault ? 0.25 : 0.06), edge.z + (plan.to.z - edge.z) * e);
      }
      // Each heave of the arms nods the view.
      this.mantleRoll = Math.sin(k * Math.PI * 3) * 0.035 * (1 - over);
      this.climbPitch = -Math.abs(Math.sin(k * Math.PI * 3)) * 0.05 * (1 - over);
      if (Math.floor(k * 3) !== m.heave) { m.heave = Math.floor(k * 3); if (m.heave < 3) Audio.mech('raise'); }
    } else {
      // Up first, then over (quadratic arc through a point just above the top edge).
      const apex = new THREE.Vector3(from.x + (plan.to.x - from.x) * (plan.vault ? 0.5 : 0.35), plan.over + (plan.vault ? 0.35 : 0.08), from.z + (plan.to.z - from.z) * (plan.vault ? 0.5 : 0.35));
      const a = 1 - k;
      this.pos.set(
        a * a * from.x + 2 * a * k * apex.x + k * k * plan.to.x,
        a * a * from.y + 2 * a * k * apex.y + k * k * plan.to.y,
        a * a * from.z + 2 * a * k * apex.z + k * k * plan.to.z,
      );
      this.mantleRoll = Math.sin(k * Math.PI) * (plan.vault ? 0.09 : 0.04);
    }
    if (k >= 1) {
      this.mantle = null;
      this.mantleRoll = 0;
      this.climbPitch = 0;
      this.onGround = true;
      this.vel.set(m.fx * (plan.vault ? 3 : 0.5), 0, m.fz * (plan.vault ? 3 : 0.5));
      if (plan.crouch) this.stance = 'crouch';
      this.landDip = plan.vault ? 0.08 : 0.04;
      Audio.footstep(this.world.groundMat, null, 1.6);
    }
  }

  /**
   * Standing at a roof edge (or behind a low parapet) looking out over a drop:
   * where would the rappel rope take us? Returns { anchor, wall, out, hang, groundY,
   * height, toWall } or null.
   */
  planRappel() {
    if (!this.onGround || this.stance === 'prone' || this.pos.y < 2.2) return null;
    const w = this.world, y = this.pos.y;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // Walk out from our feet until the support drops away.
    let edge = null, lipY = y;
    for (let d = 0.2; d <= 2.2; d += 0.1) {
      const x = this.pos.x + fx * d, z = this.pos.z + fz * d;
      const g = w.groundHeight(x, z, y + 1.2, 0, 0.06);
      if (g > y + 1.15) return null; // a wall, not an edge
      if (g < y - 2.5) { edge = { x, z, d }; break; }
      lipY = Math.max(lipY, g);
    }
    if (!edge) return null;
    // The face of the building is just behind the drop point; hang a little outside it.
    const wx = edge.x - fx * 0.05, wz = edge.z - fz * 0.05;
    const ox = edge.x + fx * 0.55, oz = edge.z + fz * 0.55;
    const groundY = w.groundHeight(ox, oz, y - 2.4, 0, 0.25);
    const height = y - groundY;
    if (height < 2.5) return null;
    if (this._blocked(ox, groundY, oz, STANCE.stand.h)) return null; // nowhere to land
    if (w.overlaps(ox - 0.25, groundY + 0.4, oz - 0.25, ox + 0.25, lipY - 0.2, oz + 0.25)) return null; // something in the way going down
    return {
      anchor: new THREE.Vector3(wx, lipY + 0.05, wz),
      wall: new THREE.Vector3(wx, 0, wz),
      out: new THREE.Vector3(ox, 0, oz),
      toWall: new THREE.Vector3(-fx, 0, -fz),
      lipY, groundY, height,
    };
  }

  /** Clip in and go over the edge: turn to face the wall, lean back, then bound down. */
  startRappel(plan) {
    this.rappel = { plan, phase: 'over', t: 0, from: this.pos.clone(), bound: 0, y: plan.lipY - 1.3, swing: 0, boundFrom: 0, boundTo: 0, boundT: 0 };
    this.vel.set(0, 0, 0);
    this.sliding = 0;
    this.vaultPlan = null;
    if (this.stance !== 'stand') this.stance = 'stand';
    this.faceYaw = Math.atan2(-plan.toWall.x, -plan.toWall.z); // facing the building
    Audio.mech('raise');
    Audio.startLoop?.('rappel', 'rope');
  }

  _updateRappel(dt, input) {
    const r = this.rappel, plan = r.plan;
    r.t += dt;
    // Body hangs outside the wall: feet planted on it, leaning back on the rope.
    const hangAt = (gap) => new THREE.Vector3(plan.wall.x - plan.toWall.x * gap, 0, plan.wall.z - plan.toWall.z * gap);
    if (r.phase === 'over') {
      // Step back to the lip, sit into the harness and lower over the edge.
      const k = Math.min(1, r.t / 0.9);
      const e = k * k * (3 - 2 * k);
      const H = hangAt(0.75);
      const top = plan.lipY + 0.2;
      const a = 1 - e;
      this.pos.set(
        a * r.from.x + e * H.x,
        a * a * r.from.y + 2 * a * e * top + e * e * r.y,
        a * r.from.z + e * H.z,
      );
      // Swing round to face the wall on the way over.
      const dy = ((this.faceYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += dy * Math.min(1, dt * 9);
      this.pitch += (-0.35 - this.pitch) * Math.min(1, dt * 5);
      this.mantleRoll = Math.sin(e * Math.PI) * 0.06;
      if (k >= 1) { r.phase = 'bound'; r.boundT = 1; this.mantleRoll = 0; }
      return;
    }
    if (r.phase === 'bound') {
      // Controlled bounds: kick off, drop, swing back in and plant the boots.
      const fast = input.anyDown('ShiftLeft', 'ShiftRight');
      const dur = fast ? 0.6 : 0.75;
      r.boundT += dt / dur;
      if (r.boundT >= 1) {
        if (r.bound > 0) { Audio.footstep('wood', null, 1.3); this.landDip = 0.04; }
        const left = r.y - plan.groundY;
        if (left < 0.25) { r.phase = 'land'; r.t = 0; r.landFrom = this.pos.clone(); return; }
        r.bound++;
        r.boundT = 0;
        r.boundFrom = r.y;
        r.boundTo = Math.max(plan.groundY, r.y - (fast ? 2.6 : 1.6) * (0.85 + 0.3 * ((r.bound * 0.618) % 1)));
        Audio.mech('pin');
      }
      const k = Math.min(1, r.boundT);
      const e = k * k * (3 - 2 * k);
      r.y = r.boundFrom + (r.boundTo - r.boundFrom) * e;
      const gap = 0.75 + Math.sin(k * Math.PI) * 0.65; // swing out from the wall and back
      const H = hangAt(gap);
      this.pos.set(H.x, r.y, H.z);
      this.mantleRoll = Math.sin(k * Math.PI) * 0.03;
      this.climbPitch = -Math.sin(k * Math.PI) * 0.06;
      Audio.setLoop?.('rappel', Math.sin(k * Math.PI) * 0.5, 0.8 + (fast ? 0.3 : 0));
      return;
    }
    // land: feet down, unclip, step back from the wall.
    const k = Math.min(1, r.t / 0.35);
    const H = hangAt(0.95);
    this.pos.set(r.landFrom.x + (H.x - r.landFrom.x) * k, r.landFrom.y + (plan.groundY - r.landFrom.y) * k, r.landFrom.z + (H.z - r.landFrom.z) * k);
    if (k >= 1) {
      this.pos.set(H.x, plan.groundY, H.z);
      this.rappel = null;
      this.onGround = true;
      this.vel.set(0, 0, 0);
      this.mantleRoll = 0;
      this.climbPitch = 0;
      this.landDip = 0.1;
      Audio.stopLoop?.('rappel');
      Audio.footstep(this.world.groundMat, null, 1.8);
    }
  }

  _blocked(x, y, z, h) {
    return this.world.overlaps(x - R, y + 0.02, z - R, x + R, y + h, z + R);
  }

  setStance(s) {
    if (s === this.stance) return true;
    const h = STANCE[s].h;
    if (h > this.height && this._blocked(this.pos.x, this.pos.y, this.pos.z, h)) return false;
    this.stance = s;
    return true;
  }

  look(dx, dy, sens) {
    const inv = Store.settings.invertY ? -1 : 1;
    this.yaw -= dx * 0.0022 * sens;
    this.pitch -= dy * 0.0022 * sens * inv;
    this.pitch = clamp(this.pitch, -1.5, 1.5);
  }

  /** Apply camera recoil kick (degrees). */
  kick(v, h) {
    const rv = THREE.MathUtils.degToRad(v), rh = THREE.MathUtils.degToRad(h);
    this.pitch += rv;
    this.yaw += rh;
    this.recoilPitch += rv;
    this.recoilYaw += rh;
  }

  takeDamage(amount, fromPos, attacker = null) {
    if (!this.alive || this.invulnerable > 0 || this.game.godMode) return;
    this.health -= amount * this.damageMult;
    this.lastHurt = this.time;
    this.shake = Math.min(1, this.shake + 0.25);
    if (fromPos) {
      const ang = Math.atan2(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
      this.hurtDirs.push({ ang, t: 1.2 });
      if (this.hurtDirs.length > 6) this.hurtDirs.shift();
    }
    Audio.hurt();
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.game.onPlayerDeath(attacker);
    }
  }

  heal(full = true) {
    this.health = full ? this.maxHealth : Math.min(this.maxHealth, this.health + 50);
    this.lastHurt = -99;
  }

  update(dt, input, weapons) {
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    for (const d of this.hurtDirs) d.t -= dt;
    this.hurtDirs = this.hurtDirs.filter((d) => d.t > 0);
    this.flashed = Math.max(0, this.flashed - dt);
    if (!this.alive) {
      // Death camera: slump to the ground and roll.
      this.eye = damp(this.eye, 0.3, 2.5, dt);
      this.deathRoll = damp(this.deathRoll, 0.7, 2.5, dt);
      return;
    }

    // Health regeneration (CoD-style: wait, then refill quickly).
    if (this.time - this.lastHurt > 4.5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 32 * dt);
    }

    // ---- stance input ----
    const wantsSprint = input.anyDown('ShiftLeft', 'ShiftRight');
    const fwdHeld = input.isDown('KeyW');
    if (input.pressed('KeyC')) {
      if (this.sprinting && this.onGround && this.stance === 'stand') {
        // Slide.
        this.sliding = 0.75;
        this.slideDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.setStance('crouch');
        Audio.footstep(this.world.groundMat, null, 2);
      } else if (this.stance === 'crouch') this.setStance('stand');
      else this.setStance('crouch');
    }
    if (input.anyPressed('ControlLeft', 'ControlRight', 'KeyZ')) {
      if (this.stance === 'prone') this.setStance('crouch');
      else if (this.onGround) this.setStance('prone');
    }
    if (this.rappel) {
      this._updateRappel(dt, input);
      this.speed = 0;
      this.eye = damp(this.eye, STANCE.stand.eye, 12, dt);
      return;
    }
    if (this.mantle) {
      this._updateMantle(dt);
      this.speed = 0;
      this.eye = damp(this.eye, STANCE[this.stance].eye, 12, dt);
      return;
    }
    this.vaultCheckT -= dt;
    if (this.vaultCheckT <= 0) { this.vaultCheckT = 0.1; this.vaultPlan = this._planVault(); }
    if (input.pressed('Space') && this.onGround && this.stance !== 'prone') {
      const plan = this._planVault();
      if (plan) { this._startMantle(plan); return; }
    }
    // Ledge grab: jump at a wall, press Space again to catch the edge and climb.
    if (input.pressed('Space') && !this.onGround && this.vel.y < 3) {
      const plan = this._planVault(true);
      if (plan && plan.climb !== undefined) { this._startMantle({ ...plan, climb: true }); return; }
    }
    if (input.pressed('Space')) {
      if (this.stance !== 'stand') {
        if (!this.setStance('stand')) this.setStance('crouch');
      } else if (this.onGround) {
        this.vel.y = 5.6;
        this.onGround = false;
        weapons?.onJump();
      }
    }

    // ---- horizontal movement ----
    let ix = 0, iz = 0;
    if (input.isDown('KeyW')) iz -= 1;
    if (input.isDown('KeyS')) iz += 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = ix * cos + iz * sin;
    const wz = -ix * sin + iz * cos;

    const busy = weapons ? weapons.blocksSprint() : false;
    this.sprinting = wantsSprint && fwdHeld && iz < 0 && this.stance === 'stand' && !busy && this.sliding <= 0;
    if (this.sprinting && weapons) weapons.cancelAds();
    let speed = STANCE[this.stance].speed;
    // Campaign: a measured tactical walk (sprint is still there when you need it).
    if (this.measured && !this.sprinting) speed = Math.min(speed, this.stance === 'stand' ? 3.3 : speed * 0.85);
    if (this.sprinting) speed = 7.3;
    if (weapons) speed *= weapons.moveMult();

    if (this.sliding > 0) {
      this.sliding -= dt;
      const s = 4 + this.sliding * 9;
      this.vel.x = this.slideDir.x * s;
      this.vel.z = this.slideDir.z * s;
      if (this.sliding <= 0 && wantsSprint && fwdHeld) this.setStance('stand');
    } else {
      const accel = this.onGround ? (this.measured && !this.sprinting ? 26 : 55) : 12;
      const tx = wx * speed, tz = wz * speed;
      this.vel.x = damp(this.vel.x, tx, accel / speed, dt);
      this.vel.z = damp(this.vel.z, tz, accel / speed, dt);
    }

    // ---- integrate with collision ----
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);

    const oldY = this.pos.y;
    this.vel.y -= GRAVITY * dt;
    let ny = oldY + this.vel.y * dt;
    const gh = this.world.groundHeight(this.pos.x, this.pos.z, oldY, 0.05, R - 0.02);
    const wasGround = this.onGround;
    if (this.vel.y <= 0) {
      if (ny <= gh) {
        if (!wasGround && this.vel.y < -6) {
          this.landDip = Math.min(0.12, -this.vel.y * 0.01);
          Audio.footstep(this.world.groundMat, null, 1.6);
        }
        ny = gh;
        this.vel.y = 0;
        this.onGround = true;
      } else if (wasGround && oldY - gh < 0.42 && this.vel.y > -3) {
        // Stick to stairs / small drops when walking down.
        ny = gh;
        this.vel.y = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
    } else {
      this.onGround = false;
      const c = this.world.overlaps(this.pos.x - R, ny + 0.02, this.pos.z - R, this.pos.x + R, ny + this.height, this.pos.z + R);
      if (c) { ny = Math.min(ny, c.minY - this.height - 0.01); this.vel.y = 0; }
    }
    this.pos.y = Math.max(0, ny);
    if (this.pos.y === 0 && this.vel.y < 0) { this.vel.y = 0; this.onGround = true; }

    // ---- view: eye height, bob, recoil recovery ----
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.eye = damp(this.eye, STANCE[this.stance].eye, 12, dt);
    if (this.onGround && this.speed > 0.5) {
      const rate = this.sprinting ? 2.1 : this.stance === 'prone' ? 0.8 : 1.5;
      this.bobPhase += dt * this.speed * rate;
      this.stepDist += this.speed * dt;
      const stepLen = this.sprinting ? 2.4 : this.stance === 'crouch' ? 1.3 : 1.9;
      if (this.stepDist > stepLen) {
        this.stepDist = 0;
        const mat = this.surfaceMaterial();
        Audio.footstep(mat, null, this.sprinting ? 1.3 : this.stance === 'stand' ? 1 : 0.5);
        if (this.sprinting || (this.stance === 'stand' && this.speed > (this.measured ? 3.6 : 3))) this.noise = Math.max(this.noise, this.sprinting ? 18 : 10);
      }
    }
    this.bob = damp(this.bob, this.onGround && this.speed > 0.5 ? 1 : 0, 8, dt);
    this.landDip = damp(this.landDip, 0, 8, dt);
    this.noise = Math.max(0, this.noise - dt * 20);
    const rec = weapons ? weapons.recoverRate() : 8;
    // Recoil recovery returns most (not all) of the climb, like real recoil management.
    const back = 1 - Math.exp(-rec * dt);
    if (weapons && !weapons.isFiring()) {
      const rp = this.recoilPitch * back * 0.85;
      const ryw = this.recoilYaw * back * 0.85;
      this.pitch -= rp; this.yaw -= ryw;
      this.recoilPitch -= rp / 0.85; this.recoilYaw -= ryw / 0.85;
    }
    this.shake = Math.max(0, this.shake - dt * 2);
    // Defensive: never let a bad value poison the camera.
    if (!Number.isFinite(this.pitch + this.yaw + this.recoilPitch + this.recoilYaw)) {
      this.pitch = Number.isFinite(this.pitch) ? this.pitch : 0;
      this.yaw = Number.isFinite(this.yaw) ? this.yaw : 0;
      this.recoilPitch = this.recoilYaw = 0;
    }
    this.pitch = clamp(this.pitch, -1.5, 1.5);
  }

  surfaceMaterial() {
    if (this.pos.y > 0.05) {
      const hit = this.world.raycast(this.pos.x, this.pos.y + 0.2, this.pos.z, 0, -1, 0, 0.5);
      if (hit) return hit.mat;
    }
    return this.world.groundMat;
  }

  _moveAxis(axis, d) {
    if (Math.abs(d) < 1e-6) return;
    const p = this.pos;
    if (axis === 'x') p.x += d; else p.z += d;
    const h = this.height;
    const c = this.world.overlaps(p.x - R, p.y + 0.02, p.z - R, p.x + R, p.y + h, p.z + R);
    if (!c) return;
    // Step up onto low obstacles (stairs, curbs).
    const rise = c.maxY - p.y;
    if (this.onGround && rise > 0 && rise <= STEP && !this._blocked(p.x, c.maxY, p.z, h)) {
      p.y = c.maxY;
      return;
    }
    if (axis === 'x') p.x = d > 0 ? c.minX - R - 0.001 : c.maxX + R + 0.001;
    else p.z = d > 0 ? c.minZ - R - 0.001 : c.maxZ + R + 0.001;
    // Resolve any remaining overlap (corner cases) by reverting.
    if (this.world.overlaps(p.x - R, p.y + 0.02, p.z - R, p.x + R, p.y + h, p.z + R)) {
      if (axis === 'x') p.x -= d; else p.z -= d;
      // Still stuck: nudge upward is unsafe; leave as is.
    }
    if (axis === 'x') this.vel.x = 0; else this.vel.z = 0;
  }

  applyCamera(fov, weaponOffset = null) {
    const cam = this.camera;
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bob * (this.sprinting ? 1.6 : 1);
    const bobX = Math.cos(this.bobPhase) * 0.025 * this.bob;
    cam.position.set(this.pos.x, this.pos.y + this.eye + bobY - this.landDip, this.pos.z);
    const sh = this.shake * this.shake;
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + (Math.random() - 0.5) * sh * 0.04;
    cam.rotation.x = this.pitch + (Math.random() - 0.5) * sh * 0.04;
    cam.rotation.z = bobX * 0.3 + (this.sliding > 0 ? 0.06 : 0) + this.deathRoll + (this.mantleRoll ?? 0);
    cam.rotation.x += this.climbPitch ?? 0;
    if (weaponOffset) { cam.rotation.x += weaponOffset.x; cam.rotation.y += weaponOffset.y; }
    // Third person: the camera sits back over the right shoulder and orbits with your
    // aim (in tighter when aiming down sights), pulled in short of any wall behind you.
    const k = this.tpsK ?? 0;
    if (k > 0.001) {
      cam.rotation.z *= 1 - k;
      cam.updateMatrixWorld();
      const ads = this.tpsAds ?? 0;
      const crouch = this.stance === 'stand' ? 0 : 1;
      const off = new THREE.Vector3(0.62 - ads * 0.16, 0.24 - ads * 0.1 + crouch * 0.1, 2.7 - ads * 1.35).multiplyScalar(k).applyQuaternion(cam.quaternion);
      const L = off.length();
      if (L > 1e-3) {
        off.divideScalar(L);
        const o = cam.position;
        const hit = this.world.raycast(o.x, o.y, o.z, off.x, off.y, off.z, L + 0.3);
        const want = hit ? Math.max(0.15, hit.t - 0.3) : L;
        // Pull in at once, ease back out.
        this._camDist = this._camDist == null || want < this._camDist ? want : this._camDist + (want - this._camDist) * 0.12;
        cam.position.addScaledVector(off, this._camDist);
      }
    }
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  /** Hitbox test for bullets fired by AI. Returns { t, head } or null. */
  rayHit(o, d, maxT) {
    if (!this.alive) return null;
    const h = this.height;
    // Head sphere.
    const hc = new THREE.Vector3(this.pos.x, this.pos.y + this.eye + 0.05, this.pos.z);
    const th = raySphere(o, d, hc, 0.16);
    if (th !== null && th < maxT) return { t: th, head: true };
    const tb = rayBox(o, d, this.pos.x - R, this.pos.y, this.pos.z - R, this.pos.x + R, this.pos.y + h - 0.2, this.pos.z + R);
    if (tb !== null && tb < maxT) return { t: tb, head: false };
    return null;
  }
}

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

export function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < a || oo > b) return null;
    } else {
      let t1 = (a - oo) / dd, t2 = (b - oo) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}
