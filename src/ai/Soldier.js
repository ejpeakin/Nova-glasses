// Soldier AI shared by enemies, friendly squadmates and multiplayer bots.
// Patrols, perceives (vision cone + LOS + stance/light), hears gunfire, takes and
// rotates cover, peeks to shoot in bursts, flanks, throws grenades, flees from
// explosives, shares intel with its squad, and follows the player when friendly.
import * as THREE from '../lib/three.js';
import { Humanoid } from './Humanoid.js';
import { WEAPONS } from '../weapons/WeaponData.js';
import { Audio } from '../core/Audio.js';
import { clamp, damp, dampAngle, rand, chance, wrapAngle, pick } from '../core/Utils.js';
import { raySphere, rayBox } from '../player/Player.js';

export const DIFFICULTY = {
  recruit: { label: 'Recruit', accuracy: 0.42, reaction: 1.1, damage: 0.32, sight: 45, aggression: 0.3, health: 0.85, grenade: 0.3 },
  regular: { label: 'Regular', accuracy: 0.6, reaction: 0.8, damage: 0.52, sight: 60, aggression: 0.5, health: 1, grenade: 0.6 },
  hardened: { label: 'Hardened', accuracy: 0.76, reaction: 0.6, damage: 0.8, sight: 70, aggression: 0.65, health: 1.1, grenade: 0.85 },
  veteran: { label: 'Veteran', accuracy: 0.88, reaction: 0.42, damage: 1.15, sight: 80, aggression: 0.8, health: 1.2, grenade: 1 },
};

const tmpV = new THREE.Vector3();
let nextId = 1;

export class Squad {
  constructor(name = 'squad') {
    this.name = name;
    this.members = [];
    this.lastKnown = null;
    this.lastKnownT = -99;
    this.target = null;
  }

  share(target, pos, time) {
    this.target = target;
    this.lastKnown = pos.clone();
    this.lastKnownT = time;
  }

  movers() { return this.members.filter((m) => m.alive && m.moving && m.state === 'combat').length; }
}

export class Soldier {
  constructor(game, o) {
    this.id = nextId++;
    this.game = game;
    this.team = o.team ?? 'b';
    this.name = o.name ?? 'Hostile';
    this.role = o.role ?? 'rifleman';
    this.friendly = !!o.friendly;
    this.storyChar = !!o.storyChar;
    this.mpBot = !!o.mpBot;
    this.hunter = !!o.hunter; // always pushes toward its goal (survival / MP)
    this.stationary = !!o.stationary;
    this.diff = DIFFICULTY[o.difficulty ?? 'regular'];
    this.weaponId = o.weapon ?? (this.role === 'sniper' ? 'longbow' : this.role === 'heavy' || this.role === 'boss' ? 'juggernaut' : 'vx4');
    this.weapon = WEAPONS[this.weaponId];
    this.ammo = this.weapon.mag;
    const baseHp = this.role === 'boss' ? (o.health ?? 1500) : this.role === 'heavy' ? 260 : 100;
    this.maxHealth = Math.round(baseHp * (this.friendly || this.mpBot ? 1 : this.diff.health));
    this.health = this.maxHealth;
    this.armor = this.role === 'boss' || this.role === 'heavy' ? 0.55 : 1; // damage multiplier
    this.pos = o.pos.clone();
    this.yaw = o.yaw ?? 0;
    this.lookYaw = this.yaw;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.alive = true;
    this.isPlayer = false;
    this.stance = 'stand';
    this.crouch = 0;
    this.patrol = o.patrol ?? null;
    this.patrolIdx = 0;
    this.home = this.pos.clone();
    this.squad = o.squad ?? null;
    if (this.squad) this.squad.members.push(this);
    this.followIndex = o.followIndex ?? 0;

    this.state = this.friendly ? 'follow' : this.hunter ? 'hunt' : this.patrol ? 'patrol' : 'idle';
    this.target = null;
    this.targetVisible = false;
    this.lastSeenT = -99;
    this.lastKnown = null;
    this.acquiredT = 0;
    this.awareness = 0;
    this.path = null;
    this.pathIdx = 0;
    this.pathGoal = null;
    this.moving = false;
    this.runMode = false;
    this.cover = null;
    this.coverPhase = 'hide';
    this.coverT = 0;
    this.peekOffset = null;
    this.thinkT = rand(0, 0.4);
    this.senseT = rand(0, 0.2);
    this.fireT = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.suppression = 0;
    this.grenadeCD = rand(6, 12);
    this.grenades = this.role === 'sniper' ? 0 : this.role === 'boss' ? 99 : (this.mpBot ? 1 : 2);
    this.fleeT = 0;
    this.fleeFrom = null;
    this.stunT = 0;
    this.repathT = 0;
    this.stuckT = 0;
    this.lastPos = this.pos.clone();
    this.idleLookT = 0;
    this.combatT = 0;
    this.repositionT = rand(6, 12);
    this.deadT = 0;
    this.kills = 0;
    this.deaths = 0;
    this.score = 0;
    this.revealed = -99;
    this.lastShotTime = -99;
    this.noiseTimer = 0;
    this.lastHit = -99;

    const faction = o.faction ?? (this.team === 'a' ? 'orion' : 'meridian');
    this.model = new Humanoid(this.role === 'boss' || this.role === 'heavy' ? 'heavy' : faction, this.weaponId, { colorIndex: o.colorIndex });
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    game.scene.add(this.model.root);
  }

  // ---------- geometry helpers ----------
  get headY() { return 1.72 - this.crouch * 0.5; }
  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.headY - 0.05, this.pos.z); }
  get chest() { return new THREE.Vector3(this.pos.x, this.pos.y + this.headY - 0.45, this.pos.z); }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  rayHit(o, d, maxT) {
    if (!this.alive) return null;
    const s = this.role === 'boss' || this.role === 'heavy' ? 1.15 : 1;
    const hc = tmpV.set(this.pos.x, this.pos.y + this.headY * s, this.pos.z);
    const th = raySphere(o, d, hc, 0.15 * s);
    if (th !== null && th < maxT) return { t: th, head: true };
    const r = 0.28 * s;
    const tb = rayBox(o, d, this.pos.x - r, this.pos.y, this.pos.z - r, this.pos.x + r, this.pos.y + (this.headY - 0.14) * s, this.pos.z + r);
    if (tb !== null && tb < maxT) return { t: tb, head: false };
    return null;
  }

  // ---------- events ----------
  takeDamage(amount, fromPos, attacker = null, head = false, weaponId = null) {
    if (!this.alive) return;
    let dmg = amount * this.armor;
    this.lastHit = this.game.time;
    if (this.storyChar) {
      this.health = Math.max(25, this.health - dmg);
    } else {
      this.health -= dmg;
    }
    if (this.role !== 'boss') this.model.hit();
    this.suppression = Math.min(1, this.suppression + 0.35);
    if (attacker && attacker.alive && this.game.hostile(this, attacker)) {
      // Know where the shot came from.
      if (!this.target || !this.targetVisible) this._acquire(attacker, true);
      this.lastKnown = attacker.pos.clone();
      this.lastSeenT = this.game.time - 0.5;
      if (this.state !== 'combat' && this.state !== 'flee') this.state = 'combat';
    }
    if (this.health <= 0) this._die(fromPos, attacker, head, weaponId);
  }

  _die(fromPos, attacker, head, weaponId) {
    this.alive = false;
    this.health = 0;
    this.state = 'dead';
    if (this.cover) { this.cover.owner = null; this.cover = null; }
    let dir = 1;
    if (fromPos) {
      // Fall away from the shooter.
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
      dir = fx * dx + fz * dz > 0 ? 1 : -1;
    }
    this.model.die(dir);
    this.deaths++;
    this.game.onKill(attacker, this, weaponId, head);
  }

  onHeard(pos, source) {
    if (!this.alive || this.friendly && this.state === 'combat' && this.targetVisible) return;
    if (source && !this.game.hostile(this, source)) return;
    if (this.state === 'combat') {
      if (!this.targetVisible) { this.lastKnown = pos.clone(); }
      return;
    }
    if (this.state === 'flee') return;
    this.lastKnown = pos.clone();
    this.awareness = Math.max(this.awareness, 0.5);
    if (source && this.pos.distanceTo(pos) < 12) {
      this._acquire(source, false);
      this.state = 'combat';
      return;
    }
    this.state = 'alert';
    this.alertT = 0;
    this._pathTo(pos, true);
  }

  onNearMiss() {
    this.suppression = Math.min(1, this.suppression + 0.18);
  }

  onGrenade(g) {
    if (!this.alive || this.stationary || this.role === 'boss') return;
    const d = this.pos.distanceTo(g.pos);
    if (d < g.def.radius + 1.5) {
      this.state = 'flee';
      this.fleeT = 1.8;
      this.fleeFrom = g.pos.clone();
      const away = this.pos.clone().sub(g.pos).setY(0);
      if (away.lengthSq() < 0.01) away.set(rand(-1, 1), 0, rand(-1, 1));
      away.normalize().multiplyScalar(g.def.radius + 3);
      this._pathTo(this.pos.clone().add(away), true);
      if (this.cover) { this.cover.owner = null; this.cover = null; }
      if (this.team !== this.game.player.team && chance(0.5)) this.game.callout(this, 'GRENADE!');
    }
  }

  flashed(seconds) {
    this.stunT = Math.max(this.stunT, seconds);
    this.targetVisible = false;
  }

  // ---------- perception ----------
  _canSee(e, now) {
    const eye = this.eyePos;
    const tgt = e.isPlayer ? e.eyePos : e.chest;
    const d = eye.distanceTo(tgt);
    let range = this.diff.sight * (this.mpBot ? 1.2 : 1);
    if (this.game.night) {
      const lit = e.isPlayer && (this.game.flashlightOn || now - (e.revealed ?? -99) < 1.5);
      range *= lit ? 1 : 0.5;
    }
    if (this.role === 'sniper') range *= 1.6;
    if (d > range) return 0;
    // Vision cone.
    if (d > 3.5) {
      const ang = Math.atan2(-(tgt.x - eye.x), -(tgt.z - eye.z));
      const fov = this.state === 'combat' || this.state === 'alert' ? 1.4 : 1.05;
      if (Math.abs(wrapAngle(ang - this.lookYaw)) > fov) return 0;
    }
    if (!this.game.world.los(eye, tgt)) {
      // Try the chest too (head may be behind a ledge).
      if (!e.isPlayer || !this.game.world.los(eye, e.chest)) return 0;
    }
    let vis = 1 - d / range;
    if (e.isPlayer) {
      vis *= e.stance === 'prone' ? 0.35 : e.stance === 'crouch' ? 0.65 : 1;
      if (e.speed > 3) vis *= 1.4;
      if (now - e.lastShotTime < 1 && now - (e.revealed ?? -99) < 1) vis *= 2;
    }
    return Math.max(0.05, vis);
  }

  _sense(dt, now) {
    if (this.stunT > 0) return;
    const candidates = this.game.hostilesOf(this);
    let best = null, bestScore = -Infinity, bestVis = 0;
    for (const e of candidates) {
      const vis = this._canSee(e, now);
      if (vis <= 0) continue;
      const d = this.pos.distanceTo(e.pos);
      let score = -d + (e === this.target ? 12 : 0) + (e.isPlayer && !this.friendly ? 4 : 0);
      if (score > bestScore) { bestScore = score; best = e; bestVis = vis; }
    }
    if (best) {
      const engaged = this.state === 'combat' || this.state === 'hunt' || this.mpBot || this.friendly;
      if (engaged || this.awareness >= 1) {
        if (best !== this.target || !this.targetVisible) this._acquire(best, engaged && this.state === 'combat');
        this.targetVisible = true;
        this.lastSeenT = now;
        this.lastKnown = best.pos.clone();
        this.squad?.share(best, best.pos, now);
        if (this.state !== 'combat' && this.state !== 'flee') this.state = 'combat';
      } else {
        // Build up suspicion (stealth window).
        this.awareness += bestVis * 0.2 * (1.3 / this.diff.reaction) * 2.5;
        this.lookYaw = Math.atan2(-(best.pos.x - this.pos.x), -(best.pos.z - this.pos.z));
        if (this.awareness >= 1) {
          this._acquire(best, false);
          this.targetVisible = true;
          this.lastSeenT = now;
          this.lastKnown = best.pos.clone();
          this.state = 'combat';
          this.squad?.share(best, best.pos, now);
          this._alertSquad();
          if (!this.friendly && this.game.player === best) this.game.onPlayerSpotted(this);
        } else if (this.state === 'idle' || this.state === 'patrol') {
          this.state = 'alert';
          this.alertT = 0;
          this.lastKnown = best.pos.clone();
          this.path = null;
        }
      }
    } else {
      this.targetVisible = false;
      this.awareness = Math.max(0, this.awareness - 0.04);
    }
    if (this.target && !this.target.alive) {
      this.target = null;
      this.targetVisible = false;
    }
  }

  _acquire(e, fast) {
    if (this.target !== e) this.acquiredT = this.game.time + (fast ? this.diff.reaction * 0.4 : this.diff.reaction) * rand(0.8, 1.3);
    this.target = e;
  }

  _alertSquad() {
    if (!this.squad) return;
    for (const m of this.squad.members) {
      if (m === this || !m.alive) continue;
      if (m.pos.distanceTo(this.pos) > 45) continue;
      if (m.state === 'idle' || m.state === 'patrol' || m.state === 'alert') {
        m.state = 'combat';
        m.target = this.target;
        m.lastKnown = this.lastKnown?.clone();
        m.lastSeenT = this.game.time - 1;
        m.acquiredT = this.game.time + m.diff.reaction * 1.5;
      }
    }
  }

  // ---------- movement ----------
  _pathTo(goal, run = false) {
    const p = this.game.world.findPath(this.pos, goal);
    this.path = p;
    this.pathIdx = 0;
    this.pathGoal = goal.clone();
    this.runMode = run;
    this.moving = !!p;
    this.repathT = 0;
    return !!p;
  }

  _followPath(dt) {
    if (!this.path || this.pathIdx >= this.path.length) {
      this.moving = false;
      return true;
    }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.45) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.moving = false; return true; }
      return false;
    }
    let sp = this.runMode ? (this.role === 'boss' ? 2.6 : 4.6) : (this.state === 'patrol' ? 1.6 : 2.6);
    if (this.crouch > 0.5) sp = Math.min(sp, 2.2);
    if (this.mpBot && this.runMode) sp = 5.4;
    const nx = dx / d, nz = dz / d;
    this.vel.x = damp(this.vel.x, nx * sp, 8, dt);
    this.vel.z = damp(this.vel.z, nz * sp, 8, dt);
    this.moving = true;
    return false;
  }

  _integrate(dt) {
    const w = this.game.world;
    // Separation from nearby actors.
    for (const a of this.game.actors) {
      if (a === this || !a.alive) continue;
      const dx = this.pos.x - a.pos.x, dz = this.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.64 && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        this.vel.x += (dx / d) * (0.8 - d) * 6;
        this.vel.z += (dz / d) * (0.8 - d) * 6;
      }
    }
    if (this.stationary) { this.vel.set(0, 0, 0); return; }
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const onNav = this.pos.y < 0.4;
    if (!onNav) {
      // Off-nav (upper floors / roofs): use box collision only.
      const R = 0.3;
      if (!w.overlaps(nx - R, this.pos.y + 0.3, this.pos.z - R, nx + R, this.pos.y + 1.6, this.pos.z + R)) this.pos.x = nx;
      if (!w.overlaps(this.pos.x - R, this.pos.y + 0.3, nz - R, this.pos.x + R, this.pos.y + 1.6, nz + R)) this.pos.z = nz;
    } else {
      if (w.walkable(nx, this.pos.z)) this.pos.x = nx; else this.vel.x = 0;
      if (w.walkable(this.pos.x, nz)) this.pos.z = nz; else this.vel.z = 0;
    }
    const gh = w.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.2, 0.4, 0.2);
    this.pos.y = damp(this.pos.y, gh, 20, dt);
    // Stuck detection.
    if (this.moving) {
      this.stuckT += dt;
      if (this.stuckT > 1) {
        if (this.pos.distanceTo(this.lastPos) < 0.3) {
          this.path = null;
          this.moving = false;
          this.vel.set(rand(-2, 2), 0, rand(-2, 2));
        }
        this.lastPos.copy(this.pos);
        this.stuckT = 0;
      }
    }
  }

  // ---------- combat ----------
  _findCover(threat) {
    const w = this.game.world;
    const pref = this.role === 'sniper' ? 40 : this.weapon.class === 'shotgun' || this.weapon.class === 'smg' ? 10 : 20;
    const aggr = this.diff.aggression;
    let best = null, bestScore = Infinity;
    const dSelfThreat = this.pos.distanceTo(threat);
    for (const cp of w.cover) {
      if (cp.owner && cp.owner !== this && cp.owner.alive) continue;
      const ds = Math.hypot(cp.x - this.pos.x, cp.z - this.pos.z);
      if (ds > 20) continue;
      const dt = Math.hypot(cp.x - threat.x, cp.z - threat.z);
      if (dt < 5 || dt > 55) continue;
      if (!w.coverProtects(cp, threat)) continue;
      let score = ds * 1.1 + Math.abs(dt - pref) * 0.6 + rand(0, 4);
      if (dt < dSelfThreat) score -= aggr * 6; // advancing cover preferred by aggressive AI
      // Flankers prefer cover off the line between squad and target.
      if (this.flanker) {
        const ax = this.pos.x - threat.x, az = this.pos.z - threat.z;
        const bx = cp.x - threat.x, bz = cp.z - threat.z;
        const cross = Math.abs(ax * bz - az * bx) / (Math.hypot(ax, az) * Math.hypot(bx, bz) + 1e-3);
        score -= cross * 8;
      }
      if (score < bestScore) { bestScore = score; best = cp; }
    }
    return best;
  }

  _shootAt(target, dt, suppressive = false) {
    const now = this.game.time;
    if (now < this.acquiredT && !suppressive) return false;
    if (this.burstPause > 0) { this.burstPause -= dt; return false; }
    this.fireT -= dt;
    if (this.fireT > 0) return false;
    const wpn = this.weapon;
    const muzzle = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    const aimAt = suppressive ? this.lastKnown.clone().setY(this.lastKnown.y + 1.2) : (chance(0.15 * this.diff.accuracy) && target.isPlayer ? target.eyePos : target.chest);
    const d = muzzle.distanceTo(aimAt);
    if (wpn.class === 'shotgun' && d > 22) return false;
    if (this.ammo <= 0) {
      this.ammo = wpn.mag;
      this.burstPause = wpn.reload;
      Audio.mech('magIn', this.pos);
      return false;
    }
    // Spread in metres at the target.
    let spread = (0.25 + d * 0.022) * (1.7 - this.diff.accuracy);
    if (this.moving) spread *= 1.8;
    if (target.speed > 3) spread *= 1.35;
    spread *= 1 + this.suppression * 1.2;
    if (now - this.acquiredT < 1.2) spread *= 1.8; // first shots are wild
    if (suppressive) spread *= 2.5;
    if (target.isPlayer && target.stance === 'prone') spread *= 1.2;
    if (wpn.class === 'sniper') spread *= 0.35;
    const pellets = wpn.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      const aim = aimAt.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.8, 0.8), rand(-1, 1)).multiplyScalar(spread * (pellets > 1 ? 1.5 : 1)));
      const dir = aim.sub(muzzle).normalize();
      const hit = this.game.fireBullet(muzzle, dir, {
        shooter: this, weaponId: this.weaponId, damage: wpn.damage, range: wpn.range, headMult: wpn.headMult,
        maxDist: 250, dmgMult: target.isPlayer ? this.diff.damage : (this.outMult ?? 1),
      });
      if (i === 0 && (chance(0.5) || wpn.class === 'sniper')) this.game.effects.tracer(muzzle, hit ? hit.point : muzzle.clone().addScaledVector(dir, 150), 300);
    }
    this.ammo--;
    this.game.effects.muzzle(muzzle, new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 0.9, chance(0.5));
    Audio.gunshot(wpn.sound, muzzle, false);
    this.lastShotTime = now;
    this.revealed = now;
    this.noiseTimer -= 1;
    if (this.noiseTimer <= 0) { this.game.emitNoise(this.pos, 60, this); this.noiseTimer = 4; }
    const rpm = wpn.mode === 'bolt' ? 25 : wpn.mode === 'pump' ? 55 : Math.min(wpn.rpm * 0.85, 700);
    this.fireT = 60 / rpm;
    if (wpn.mode === 'semi') this.fireT = Math.max(this.fireT, rand(0.25, 0.5));
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      this.burstLeft = wpn.mode === 'auto' ? Math.floor(rand(3, 8)) : Math.floor(rand(1, 4));
      this.burstPause = rand(0.35, 1.0) * (wpn.class === 'sniper' ? 2.5 : 1) * (1 + this.suppression);
    }
    return true;
  }

  _throwGrenade(at) {
    if (this.grenades <= 0) return false;
    const from = this.eyePos.add(new THREE.Vector3(0, 0.3, 0));
    const dx = at.x - from.x, dz = at.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 7 || dist > 30) return false;
    // Lob at 45°: v² = g·d (ignoring height difference).
    const g = 16;
    const v = Math.sqrt(g * dist) * 0.98;
    const vel = new THREE.Vector3(dx / dist * v * 0.7071, v * 0.7071, dz / dist * v * 0.7071);
    this.game.grenades.throw('frag', from, vel, this, rand(0, 1));
    this.grenades--;
    this.grenadeCD = rand(10, 18);
    if (chance(0.6)) this.game.callout(this, this.team === this.game.player.team ? 'Frag out!' : 'Granata!');
    return true;
  }

  // ---------- main update ----------
  update(dt) {
    if (!this.alive) {
      this.deadT += dt;
      this.model.update(dt, 0, 0, 0, false);
      return;
    }
    const now = this.game.time;
    this.stunT = Math.max(0, this.stunT - dt);
    this.suppression = Math.max(0, this.suppression - dt * 0.35);
    this.grenadeCD -= dt;
    if (this.friendly && this.storyChar && now - this.lastHit > 5) this.health = Math.min(this.maxHealth, this.health + dt * 20);

    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.18 + rand(0, 0.08);
      this._sense(dt, now);
    }
    this.thinkT -= dt;
    const think = this.thinkT <= 0;
    if (think) this.thinkT = 0.35 + rand(0, 0.3);

    let wantCrouch = 0;
    let firing = false;
    let faceYaw = this.lookYaw;

    if (this.stunT > 0) {
      // Flashed: stagger, shoot wildly sometimes.
      this.vel.multiplyScalar(0.9);
      this.lookYaw += Math.sin(now * 3) * dt;
      faceYaw = this.lookYaw;
      this.path = null;
      this.moving = false;
    } else {
      switch (this.state) {
        case 'idle': {
          this.vel.multiplyScalar(0.8);
          this.idleLookT -= dt;
          if (this.idleLookT <= 0) { this.idleLookT = rand(2, 5); this.lookTarget = this.yaw + rand(-1.2, 1.2); }
          faceYaw = this.lookTarget ?? this.yaw;
          break;
        }
        case 'patrol': {
          if (!this.path) {
            const wp = this.patrol[this.patrolIdx % this.patrol.length];
            this.patrolIdx++;
            if (!this._pathTo(wp, false)) this.state = 'idle';
            this.patrolWait = rand(1, 3);
          }
          if (this._followPath(dt)) {
            this.vel.multiplyScalar(0.8);
            this.patrolWait -= dt;
            if (this.patrolWait <= 0) this.path = null;
          }
          faceYaw = this._velYaw() ?? faceYaw;
          break;
        }
        case 'alert': {
          this.alertT = (this.alertT ?? 0) + dt;
          if (this.path && !this._followPath(dt)) faceYaw = this._velYaw() ?? faceYaw;
          else {
            this.vel.multiplyScalar(0.8);
            if (this.lastKnown) faceYaw = Math.atan2(-(this.lastKnown.x - this.pos.x), -(this.lastKnown.z - this.pos.z));
            if (this.alertT > 3 && !this.path && this.lastKnown && this.pos.distanceTo(this.lastKnown) > 3) this._pathTo(this.lastKnown, false);
          }
          if (this.alertT > 14) {
            this.state = this.patrol ? 'patrol' : this.hunter ? 'hunt' : 'idle';
            this.path = null;
            this.awareness = 0;
          }
          break;
        }
        case 'flee': {
          this.fleeT -= dt;
          this._followPath(dt);
          faceYaw = this._velYaw() ?? faceYaw;
          if (this.fleeT <= 0) { this.state = this.target ? 'combat' : 'alert'; this.alertT = 0; this.path = null; }
          break;
        }
        case 'follow': {
          const res = this._follow(dt, think);
          faceYaw = res ?? faceYaw;
          break;
        }
        case 'hunt': {
          if (think && (!this.path || this.repathT > 6)) {
            const goal = this.game.mode?.botGoal?.(this) ?? this.game.player.pos;
            if (goal) this._pathTo(goal, true);
          }
          this.repathT += dt;
          if (this._followPath(dt)) { this.vel.multiplyScalar(0.8); if (think) this.path = null; }
          faceYaw = this._velYaw() ?? faceYaw;
          break;
        }
        case 'combat': {
          const r = this._combat(dt, think, now);
          wantCrouch = r.crouch;
          firing = r.firing;
          faceYaw = r.face ?? faceYaw;
          break;
        }
        default:
          break;
      }
    }

    // Turn toward desired facing.
    this.lookYaw = dampAngle(this.lookYaw, faceYaw, this.state === 'combat' ? 9 : 4, dt);
    this.yaw = this.lookYaw;
    this._integrate(dt);
    this.crouch = wantCrouch;

    // Aim pitch.
    let pitch = 0;
    if (this.state === 'combat' && this.target) {
      const tp = this.targetVisible ? this.target.chest : this.lastKnown ?? this.target.pos;
      const e = this.eyePos;
      pitch = Math.atan2(tp.y - (e.y - 0.3), Math.hypot(tp.x - e.x, tp.z - e.z));
    }
    this.pitch = pitch;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, this.speed, this.crouch, this.pitch, firing);
  }

  _velYaw() {
    if (Math.hypot(this.vel.x, this.vel.z) < 0.3) return null;
    return Math.atan2(-this.vel.x, -this.vel.z);
  }

  _follow(dt, think) {
    const p = this.game.player;
    if (this.target && this.target.alive && (this.targetVisible || this.game.time - this.lastSeenT < 4)) {
      this.state = 'combat';
      return null;
    }
    // Formation slot behind/beside the player.
    const slot = [[-2.5, 3], [2.5, 3.5], [0, 5], [-4, 6], [4, 6]][this.followIndex % 5];
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const gx = p.pos.x + slot[0] * cos + slot[1] * sin;
    const gz = p.pos.z - slot[0] * sin + slot[1] * cos;
    const goal = new THREE.Vector3(gx, 0, gz);
    const d = this.pos.distanceTo(goal);
    if (d > 2.5) {
      if (think && (!this.path || (this.pathGoal && this.pathGoal.distanceTo(goal) > 3))) this._pathTo(goal, d > 7 || p.sprinting);
      this._followPath(dt);
      if (d > 45 && !this.game.world.los(this.eyePos, p.eyePos)) {
        // Catch up when hopelessly left behind (off-screen teleport).
        const near = this.game.world.nearestWalkable(gx, gz, 6);
        if (near >= 0) { this.game.world.cellCenter(near, this.pos); this.path = null; }
      }
    } else {
      this.vel.multiplyScalar(0.8);
      this.path = null;
    }
    this.crouch = p.stance !== 'stand' ? 1 : 0;
    return this._velYaw() ?? p.yaw;
  }

  _combat(dt, think, now) {
    const tgt = this.target;
    const res = { crouch: 0, firing: false, face: null };
    if (!tgt || !tgt.alive) {
      this.target = null;
      if (this.cover) { this.cover.owner = null; this.cover = null; }
      this.state = this.friendly ? 'follow' : this.hunter ? 'hunt' : 'alert';
      this.alertT = 0;
      this.path = null;
      return res;
    }
    this.combatT += dt;
    const sinceSeen = now - this.lastSeenT;
    const lk = this.lastKnown ?? tgt.pos;
    const distT = this.pos.distanceTo(lk);
    res.face = Math.atan2(-(lk.x - this.pos.x), -(lk.z - this.pos.z));

    // Lost contact for long: give up / search.
    if (sinceSeen > (this.mpBot ? 8 : 18)) {
      this.target = null;
      if (this.cover) { this.cover.owner = null; this.cover = null; }
      this.state = this.friendly ? 'follow' : this.hunter ? 'hunt' : 'alert';
      this.alertT = 0;
      if (!this.friendly && !this.hunter) this._pathTo(lk, false);
      return res;
    }

    // Friendlies stay near the player.
    if (this.friendly && this.pos.distanceTo(this.game.player.pos) > 22 && think) {
      if (this.cover) { this.cover.owner = null; this.cover = null; }
      this._pathTo(this.game.player.pos, true);
    }

    // Stationary shooters (snipers in towers, perched guards).
    if (this.stationary) {
      res.crouch = this.targetVisible ? 0 : 1;
      if (this.targetVisible) res.firing = this._shootAt(tgt, dt);
      return res;
    }

    // Grenade decision.
    if (think && !this.targetVisible && sinceSeen > 2 && sinceSeen < 10 && this.grenadeCD <= 0 && chance(this.diff.grenade * (this.role === 'boss' ? 0.8 : 0.35))) {
      this._throwGrenade(lk);
    }

    // Boss: relentless advance with suppressive fire.
    if (this.role === 'boss') {
      if (think && (!this.path || this.repathT > 2)) { if (distT > 6) this._pathTo(lk, false); }
      this.repathT += dt;
      this._followPath(dt);
      if (this.targetVisible) res.firing = this._shootAt(tgt, dt);
      else if (sinceSeen < 3) res.firing = this._shootAt(tgt, dt, true);
      return res;
    }

    // Moving to a destination?
    if (this.path && this.moving) {
      this._followPath(dt);
      if (this.targetVisible && (this.mpBot || chance(0.85))) res.firing = this._shootAt(tgt, dt);
      if (!this.moving && this.cover) { this.coverPhase = 'hide'; this.coverT = rand(0.6, 1.4); }
      return res;
    }
    this.vel.multiplyScalar(0.75);
    this.repositionT -= dt;

    // Evaluate cover.
    if (think) {
      const coverBad = this.cover && !this.game.world.coverProtects(this.cover, lk);
      const tooClose = distT < 4 && this.weapon.class !== 'shotgun';
      const wantMove = !this.cover || coverBad || this.repositionT <= 0 || tooClose;
      const squadBusy = this.squad && this.squad.movers() >= Math.max(1, Math.ceil(this.squad.members.filter((m) => m.alive).length / 2));
      if (wantMove && (!squadBusy || coverBad || !this.cover)) {
        this.flanker = chance(0.3 * this.diff.aggression + (this.mpBot ? 0.2 : 0));
        const cp = this._findCover(lk);
        if (cp) {
          if (this.cover) this.cover.owner = null;
          this.cover = cp;
          cp.owner = this;
          this._pathTo(new THREE.Vector3(cp.x, 0, cp.z), true);
          this.repositionT = rand(7, 14) * (1.3 - this.diff.aggression);
          this.peekOffset = null;
          return res;
        }
        if (!this.cover) {
          // No cover: advance or strafe.
          if (distT > (this.weapon.class === 'smg' || this.weapon.class === 'shotgun' ? 8 : 18) || !this.targetVisible) {
            const toward = lk.clone().sub(this.pos).setY(0).normalize();
            const side = new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar(rand(-6, 6));
            const goal = this.pos.clone().addScaledVector(toward, Math.min(10, distT * 0.5)).add(side);
            this._pathTo(goal, true);
          } else if (chance(0.5)) {
            const toward = lk.clone().sub(this.pos).setY(0).normalize();
            const goal = this.pos.clone().add(new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar(rand(-4, 4)));
            if (this.game.world.walkable(goal.x, goal.z)) this._pathTo(goal, false);
          }
          this.repositionT = rand(3, 6);
        }
      }
    }

    // In cover: hide / peek cycle.
    if (this.cover) {
      const atCover = Math.hypot(this.cover.x - this.pos.x, this.cover.z - this.pos.z) < 1.2;
      if (atCover) {
        this.coverT -= dt;
        if (this.coverT <= 0) {
          if (this.coverPhase === 'hide') {
            this.coverPhase = 'peek';
            this.coverT = rand(1.4, 3) * (1 - this.suppression * 0.5);
            if (this.cover.tall) {
              // Step out sideways to get a shot.
              const nx = this.cover.nx, nz = this.cover.nz;
              const side = chance(0.5) ? 1 : -1;
              const off = new THREE.Vector3(this.cover.x + -nz * side * 1.1, 0, this.cover.z + nx * side * 1.1);
              this.peekOffset = this.game.world.walkable(off.x, off.z) ? off : null;
            }
          } else {
            this.coverPhase = 'hide';
            this.coverT = rand(0.8, 2.2) * (1 + this.suppression * 2);
          }
        }
        if (this.coverPhase === 'hide') {
          res.crouch = 1;
          // Drift back to the cover spot.
          const dx = this.cover.x - this.pos.x, dz = this.cover.z - this.pos.z;
          this.vel.x += dx * 4 * dt; this.vel.z += dz * 4 * dt;
        } else {
          res.crouch = this.cover.tall ? 0 : (this.targetVisible ? 0 : 0);
          if (this.peekOffset) {
            const dx = this.peekOffset.x - this.pos.x, dz = this.peekOffset.z - this.pos.z;
            this.vel.x = dx * 5; this.vel.z = dz * 5;
          }
          if (this.targetVisible) res.firing = this._shootAt(tgt, dt);
          else if (sinceSeen < 2.5 && this.squad && chance(0.5)) res.firing = this._shootAt(tgt, dt, true);
        }
      } else if (!this.moving) {
        this._pathTo(new THREE.Vector3(this.cover.x, 0, this.cover.z), true);
      }
    } else if (this.targetVisible) {
      res.crouch = distT > 15 && chance(0.5) ? 1 : 0;
      res.firing = this._shootAt(tgt, dt);
    } else if (think && sinceSeen > 3 && !this.path) {
      // Push toward last known position.
      this._pathTo(lk, true);
    }
    return res;
  }

  dispose() {
    if (this.cover) this.cover.owner = null;
    this.model.dispose();
  }
}

export { pick };
