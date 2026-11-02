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
    this.hurtDirs.length = 0;
  }

  get height() { return STANCE[this.stance].h; }
  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  get chest() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z); }
  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
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
    if (this.sprinting) speed = 7.3;
    if (weapons) speed *= weapons.moveMult();

    if (this.sliding > 0) {
      this.sliding -= dt;
      const s = 4 + this.sliding * 9;
      this.vel.x = this.slideDir.x * s;
      this.vel.z = this.slideDir.z * s;
      if (this.sliding <= 0 && wantsSprint && fwdHeld) this.setStance('stand');
    } else {
      const accel = this.onGround ? 55 : 12;
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
        if (this.sprinting || (this.stance === 'stand' && this.speed > 3)) this.noise = Math.max(this.noise, this.sprinting ? 18 : 10);
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
    cam.rotation.z = bobX * 0.3 + (this.sliding > 0 ? 0.06 : 0) + this.deathRoll;
    if (weaponOffset) { cam.rotation.x += weaponOffset.x; cam.rotation.y += weaponOffset.y; }
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
