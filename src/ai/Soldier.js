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
  recruit: { label: 'Recruit', accuracy: 0.42, aim: 1.35, settle: 1.7, reaction: 1.1, damage: 0.28, sight: 45, aggression: 0.3, health: 0.85, grenade: 0.3 },
  regular: { label: 'Regular', accuracy: 0.6, aim: 0.8, settle: 1.3, reaction: 0.8, damage: 0.41, sight: 60, aggression: 0.5, health: 1, grenade: 0.6 },
  hardened: { label: 'Hardened', accuracy: 0.76, aim: 0.62, settle: 1.0, reaction: 0.6, damage: 0.62, sight: 70, aggression: 0.65, health: 1.1, grenade: 0.85 },
  veteran: { label: 'Veteran', accuracy: 0.88, aim: 0.5, settle: 0.8, reaction: 0.42, damage: 0.86, sight: 80, aggression: 0.8, health: 1.2, grenade: 1 },
};

// Aim error multipliers per weapon class (snipers and DMRs shoot tighter, SMGs and pistols wider).
const CLASS_AIM = { sniper: 0.32, marksman: 0.5, ar: 1, lmg: 1.2, smg: 1.1, pistol: 1.45, shotgun: 1 };

/** Standard normal sample (Box-Muller). */
function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * Math.random());
}
const irand = (a, b) => Math.floor(rand(a, b + 1));
const UP = new THREE.Vector3(0, 1, 0);

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
    this.suppressed = !!o.suppressed; // suppressed weapon: quiet report, small flash, little noise
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
    this.order = null; // squad order from the player: { kind, pos, yaw, until, target }
    this.followCrouch = 0;

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
    this.trackSince = 0; // when the current target came into view (aim settles from here)
    this.trackTarget = null;
    this.recoil = 0; // accumulated muzzle climb within a burst (rad)
    this.reloadT = 0;
    this.reloadDur = 0;
    this.reloadCue = 0;
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
    this.model = new Humanoid(this.role === 'boss' || this.role === 'heavy' ? 'heavy' : faction, this.weaponId, { colorIndex: o.colorIndex, seed: this.id * 7 + (o.name?.length ?? 0) });
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.onMagDrop = (geo, mat, mw) => {
      // Only bother simulating mags the player could see land.
      if (this.pos.distanceTo(game.player.pos) < 40) game.effects.dropProp(geo, mat, mw, this.vel.clone().multiplyScalar(0.8));
    };
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
    if (this.role !== 'boss') {
      let side = 0;
      if (fromPos) {
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); // body's right
        const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
        side = Math.sign(rx * dx + rz * dz);
      }
      this.model.hit(side);
      // A motion-captured flinch through the chest and head (he keeps his feet and his rifle).
      if (this.alive && !this.model.inMove && Math.random() < 0.7) this.model.playMove(head ? 'Hit_Head' : 'Hit_Chest', { hideGun: false, parts: 'upper' });
    }
    // Being hit throws off aim for a moment.
    this.trackSince = Math.max(this.trackSince, this.game.time - this.diff.settle * 0.5);
    this.suppression = Math.min(1, this.suppression + 0.35);
    if (attacker && attacker.alive && this.game.hostile(this, attacker) && this.health > 0) {
      // Know where the shot came from (unless the hit killed him outright).
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
    // Shotguns, snipers and explosions hit hard enough to throw a man off his feet.
    const cls = WEAPONS[weaponId]?.class;
    this.model.die(dir, { head, heavy: !WEAPONS[weaponId] || cls === 'sniper' || cls === 'shotgun' });
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
    // Squadmates keep their place (formation, stack, held position) and just turn to the noise.
    if (this.friendly) {
      this.watch(pos.clone());
      if (source && this.pos.distanceTo(pos) < 12 && this.game.world.los(this.eyePos, source.eyePos ?? pos)) { this._acquire(source, false); this.state = 'combat'; }
      return;
    }
    this.lastKnown = pos.clone();
    this.awareness = Math.max(this.awareness, 0.5);
    if (source && this.pos.distanceTo(pos) < 12) {
      this._acquire(source, false);
      this.state = 'combat';
      return;
    }
    this.state = 'alert';
    this.alertT = 0;
    this._pathTo(pos, this.pos.distanceTo(pos) > 25);
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
    if (this.role === 'sniper') range *= 1.6;
    // Fog, snow and smoke-thick air limit how far anyone can actually see.
    range = Math.min(range, this.game.visRange ?? range);
    if (this.game.night) {
      const lit = e.isPlayer && (this.game.flashlightVisible || now - (e.revealed ?? -99) < 1.5);
      range *= lit ? 1 : 0.5;
    }
    if (d > range) return 0;
    // Mission-start grace: Task Force ORION is still unseen unless it opens fire.
    const g = this.game;
    if (!this.mpBot && now < (g.stealthGrace ?? 0) && e.team === g.player.team && now - (e.lastShotTime ?? -99) > 0.5) return 0;
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
    // Visibility falls off steeply with distance; stance and movement matter a lot.
    let vis = Math.pow(1 - d / range, 1.4);
    if (e.isPlayer) {
      vis *= e.stance === 'prone' ? 0.25 : e.stance === 'crouch' ? 0.5 : 1;
      vis *= e.speed < 0.5 ? 0.6 : e.speed > 5.5 ? 1.6 : 1;
      if (now - e.lastShotTime < 1 && now - (e.revealed ?? -99) < 1) vis *= 3; // muzzle flash / report
    } else if (e.storyChar) {
      vis *= 0.6; // squadmates move tactically
    }
    if (d < 6) vis *= 3; // right in front of them
    return Math.max(0.02, vis);
  }

  _sense(dt, now) {
    if (this.stunT > 0) return;
    let candidates = this.game.hostilesOf(this);
    if (this.storyChar) {
      // Squadmates hold fire on unaware enemies: they only engage once the enemy is alert,
      // the player has opened fire, or the alarm is up. No blowing the player's cover.
      const g = this.game;
      const loud = g.time - (g.player.lastShotTime ?? -99) < 10 || g.mode?.alarmed;
      if (!loud) candidates = candidates.filter((e) => e.state === 'combat' || e.state === 'hunt' || e.state === 'flee' || (e.awareness ?? 0) > 0.95 || now - (e.pingedT ?? -99) < 20);
    }
    // Unaware guards who come across a fallen comrade go to investigate and raise the alarm.
    if (!this.mpBot && !this.friendly && (this.state === 'idle' || this.state === 'patrol' || this.state === 'alert')) {
      const g = this.game;
      for (const b of g.bodies) {
        if (b.team !== this.team || b.seenBy?.has(this) || b.actor === this) continue;
        const d = Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z);
        if (d > 20) continue;
        const eye = this.eyePos;
        const to = new THREE.Vector3(b.pos.x - eye.x, 0, b.pos.z - eye.z).normalize();
        const fwd = new THREE.Vector3(-Math.sin(this.lookYaw), 0, -Math.cos(this.lookYaw));
        if (d > 4 && fwd.dot(to) < 0.2) continue; // not looking that way
        if (!g.world.los(eye, b.pos.clone().setY(b.pos.y + 0.3))) continue;
        (b.seenBy ??= new Set()).add(this);
        this.state = 'alert';
        this.alertT = 0;
        this.awareness = Math.max(this.awareness, 0.6);
        this.lastKnown = b.pos.clone();
        this._pathTo(b.pos, true);
        g.callout(this, pick(['Man down!', 'Body here!', 'We have a man down!']));
        g.mode?.onBodyFound?.(this, b);
        break;
      }
    }
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
        this._track(best, now);
        this.targetVisible = true;
        this.lastSeenT = now;
        this.lastKnown = best.pos.clone();
        this.squad?.share(best, best.pos, now);
        if (this.state !== 'combat' && this.state !== 'flee') this.state = 'combat';
      } else {
        // Build up suspicion gradually (a few seconds in the open at mid range).
        const alertMul = this.state === 'alert' ? 1.6 : 1;
        this.awareness += bestVis * 0.75 * (0.8 / this.diff.reaction) * alertMul * 0.22;
        if (this.awareness > 0.3) this.lookYaw = Math.atan2(-(best.pos.x - this.pos.x), -(best.pos.z - this.pos.z));
        if (this.awareness >= 1) {
          this._acquire(best, false);
          this._track(best, now);
          this.targetVisible = true;
          this.lastSeenT = now;
          this.lastKnown = best.pos.clone();
          this.state = 'combat';
          if (chance(0.6)) this.game.callout(this, this.friendly ? 'Contact front!' : pick(['Contact!', 'There! Enemy!', 'Intruder!']));
          this.squad?.share(best, best.pos, now);
          this._alertSquad();
          if (!this.friendly && this.game.player === best) this.game.onPlayerSpotted(this);
        } else if (this.awareness > 0.35 && (this.state === 'idle' || this.state === 'patrol')) {
          this.state = 'alert';
          this.alertT = 0;
          this.lastKnown = best.pos.clone();
          this.path = null;
        }
      }
    } else {
      this.targetVisible = false;
      this.awareness = Math.max(0, this.awareness - 0.05);
    }
    if (this.target && !this.target.alive) {
      this.target = null;
      this.targetVisible = false;
    }
  }

  /** Aim settles onto a target the longer it stays in view; losing sight or switching resets it. */
  _track(e, now) {
    if (this.trackTarget !== e || now - (this.trackSeenT ?? -99) > 0.7) this.trackSince = now;
    this.trackTarget = e;
    this.trackSeenT = now;
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
    // Pace: a measured tactical walk with the weapon up when there is a threat about,
    // a jog (not a flat-out sprint) to cover distance, a slow amble on patrol.
    let sp;
    if (this.state === 'flee') sp = 4.8;
    else if (this.runMode) sp = this.role === 'boss' ? 2.6 : this.mpBot ? 4.6 : 4.0;
    else if (this.state === 'patrol') sp = 1.5;
    else if (this.tactical) sp = this.state === 'combat' && this.targetVisible ? 1.8 : 2.2;
    else sp = 2.6;
    if (this.health < this.maxHealth * 0.35 && !this.storyChar) sp *= 0.75; // wounded
    if (this.crouch > 0.5) sp = Math.min(sp, 1.8);
    if (this.paceOverride) sp = this.paceOverride; // keeping station on the player
    const nx = dx / d, nz = dz / d;
    this.vel.x = damp(this.vel.x, nx * sp, 8, dt);
    this.vel.z = damp(this.vel.z, nz * sp, 8, dt);
    this.moving = true;
    return false;
  }

  _integrate(dt) {
    const w = this.game.world;
    // Personal space: men on the move or holding ground keep a couple of metres apart
    // (a soft push), and only bodily shove apart when actually touching. Stacked on a
    // door they stand shoulder to shoulder.
    const R = this.order?.kind === 'hold' || this.scripted ? 0.8 : 1.6;
    for (const a of this.game.actors) {
      if (a === this || !a.alive) continue;
      const dx = this.pos.x - a.pos.x, dz = this.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        const push = d < 0.8 ? (0.8 - d) * 6 + (R - 0.8) * 1.5 : (R - d) * 1.5;
        this.vel.x += (dx / d) * push;
        this.vel.z += (dz / d) * push;
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
          this.vel.set(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)); // small nudge, then repath
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
    const mates = this.squad ? this.squad.members.filter((m) => m.alive && m !== this && m.pos.distanceTo(this.pos) < 30) : [];
    const centre = mates.length ? mates.reduce((a, m) => a.add(m.pos), new THREE.Vector3()).divideScalar(mates.length) : null;
    for (const cp of w.cover) {
      if (cp.owner && cp.owner !== this && cp.owner.alive) continue;
      const ds = Math.hypot(cp.x - this.pos.x, cp.z - this.pos.z);
      if (ds > 20) continue;
      const dt = Math.hypot(cp.x - threat.x, cp.z - threat.z);
      if (dt < 5 || dt > 55) continue;
      if (!w.coverProtects(cp, threat)) continue;
      let score = ds * 1.1 + Math.abs(dt - pref) * 0.6 + rand(0, 1.5);
      // Keep the squad together: cover far from your mates is worth less, but don't
      // bunch up behind the same bit of wall either (one grenade gets you all).
      if (centre) score += Math.max(0, Math.hypot(cp.x - centre.x, cp.z - centre.z) - 7) * 0.9;
      for (const m of mates) {
        const dm = Math.hypot(cp.x - (m.cover?.x ?? m.pos.x), cp.z - (m.cover?.z ?? m.pos.z));
        if (dm < 3.5) score += (3.5 - dm) * 3;
      }
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

  /** Where to put the crosshair on a target: centre mass, or whatever part is exposed. */
  _aimPoint(target) {
    const eye = this.eyePos;
    const w = this.game.world;
    let centre, head;
    if (target.isPlayer) {
      centre = new THREE.Vector3(target.pos.x, target.pos.y + target.height * 0.6, target.pos.z);
      head = new THREE.Vector3(target.pos.x, target.pos.y + target.eye + 0.04, target.pos.z);
    } else {
      centre = target.chest.setY(target.pos.y + target.headY * 0.62);
      head = new THREE.Vector3(target.pos.x, target.pos.y + target.headY, target.pos.z);
    }
    // Marksmen go for the head; everyone else aims centre mass unless only the head shows.
    const headHunter = this.weapon.class === 'sniper' ? 0.55 * this.diff.accuracy : this.weapon.class === 'marksman' ? 0.25 : 0.05;
    if (chance(headHunter) && w.los(eye, head)) return { p: head, part: 'head' };
    if (w.los(eye, centre)) return { p: centre, part: 'centre' };
    if (w.los(eye, head)) return { p: head, part: 'head' };
    const low = centre.clone().setY(target.pos.y + 0.35);
    if (w.los(eye, low)) return { p: low, part: 'low' };
    return { p: centre, part: 'hidden' };
  }

  /** One-sigma aim error (radians) for a shot at this target right now. */
  _aimError(target, d, now, suppressive) {
    const wpn = this.weapon;
    let sigma = THREE.MathUtils.degToRad(this.diff.aim) * (CLASS_AIM[wpn.class] ?? 1);
    if (wpn.class === 'smg' && d > 25) sigma *= 1 + (d - 25) / 30;
    if (wpn.class === 'pistol' && d > 15) sigma *= 1 + (d - 15) / 20;
    // Settling onto a target that just came into view.
    const settle = (wpn.class === 'sniper' ? 1.6 : 1) * this.diff.settle;
    const st = clamp((now - this.trackSince) / settle, 0, 1);
    sigma *= 1 + 2.2 * (1 - st) * (1 - st);
    // Shooter's own state.
    const sp = this.speed;
    if (sp > 0.4) sigma *= 1 + sp * 0.45;
    else if (this.crouch > 0.5) sigma *= 0.85;
    sigma *= 1 + this.suppression * 1.5;
    if (now - this.lastHit < 0.4) sigma *= 2;
    // Tracking a moving target: aim lags its sideways motion.
    const tv = target.vel;
    if (tv) {
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      const lateral = Math.abs(tv.x * (-dz / dl) + tv.z * (dx / dl));
      const vertical = Math.abs(tv.y ?? 0) * 0.5;
      const lag = 0.05 + (1 - this.diff.accuracy) * 0.14;
      const err = ((lateral + vertical) / Math.max(2, d)) * lag;
      sigma = Math.hypot(sigma, err);
    }
    // Darkness and haze.
    const g = this.game;
    if (g.night && target.isPlayer && !(g.flashlightVisible || now - (target.revealed ?? -99) < 1.5)) sigma *= 1.4;
    if (g.visRange && d > g.visRange * 0.6) sigma *= 1.3;
    if (suppressive) sigma = sigma * 3 + 0.02;
    return sigma;
  }

  _shootAt(target, dt, suppressive = false, at = null) {
    const now = this.game.time;
    if (this.reloadT > 0) return false;
    // Weapons tight: the squad only fires on the player's shot, or when hit.
    const g = this.game;
    if (g.comms?.holdFire && this.team === g.player.team && (this.friendly || this.mpBot) && now - (g.player.lastShotTime ?? -99) > 3 && now - this.lastHit > 3) return false;
    if (now < this.acquiredT && !suppressive) return false;
    if (this.burstPause > 0) { this.burstPause -= dt; return false; }
    this.fireT -= dt;
    if (this.fireT > 0) return false;
    const wpn = this.weapon;
    if (this.ammo <= 0) { this._startReload(false); return false; }
    const muzzle = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    let aimAt;
    if (at) aimAt = at.clone();
    else if (suppressive) aimAt = this.lastKnown.clone().setY(this.lastKnown.y + 1.1);
    else {
      const a = this._aimPoint(target);
      aimAt = a.p;
    }
    const d = muzzle.distanceTo(aimAt);
    // Snipers take their time: no shot until the crosshair has settled.
    if (wpn.class === 'sniper' && !suppressive && now - this.trackSince < this.diff.settle * 1.6 * 0.75) return false;
    if (wpn.class === 'shotgun' && d > 24) return false;
    if (wpn.class === 'pistol' && d > 45) return false;
    const sigma = this._aimError(target, d, now, suppressive);
    // Muzzle climb accumulated through the burst pushes later rounds high.
    const climb = this.recoil;
    const base = aimAt.sub(muzzle).normalize();
    const right = new THREE.Vector3().crossVectors(base, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, base);
    const pellets = wpn.pellets ?? 1;
    const ex = gauss() * sigma, ey = gauss() * sigma + climb * 0.8;
    for (let i = 0; i < pellets; i++) {
      const spread = pellets > 1 ? 0.04 : 0;
      const dir = base.clone()
        .addScaledVector(right, ex + gauss() * spread + (gauss() * climb * 0.3))
        .addScaledVector(up, ey + gauss() * spread)
        .normalize();
      const hit = this.game.fireBullet(muzzle, dir, {
        shooter: this, weaponId: this.weaponId, damage: wpn.damage, range: wpn.range, headMult: wpn.headMult,
        maxDist: 250, dmgMult: target.isPlayer ? this.diff.damage : (this.outMult ?? 1),
      });
      if (i === 0 && (chance(0.45) || wpn.class === 'sniper')) this.game.effects.tracer(muzzle, hit ? hit.point : muzzle.clone().addScaledVector(dir, 150), 300);
    }
    this.ammo--;
    this.recoil += THREE.MathUtils.degToRad((wpn.recoil?.v ?? 0.6) * 0.42) * (1.3 - this.diff.accuracy * 0.6);
    const fwd = this.model.muzzleDir(new THREE.Vector3());
    const quiet = wpn.suppressed || this.suppressed;
    this.game.effects.muzzle(muzzle, fwd, quiet ? 0.35 : 0.9, !quiet && chance(0.5));
    const cam = this.game.player.pos;
    if (Math.abs(muzzle.x - cam.x) + Math.abs(muzzle.z - cam.z) < 30 && pellets === 1) {
      const ej = this.model.ejectPos(new THREE.Vector3());
      this.game.effects.casing(ej, right);
    }
    this.model.fire(wpn);
    Audio.gunshot(wpn.sound, muzzle, quiet, this);
    this.lastShotTime = now;
    this.revealed = now;
    this.noiseTimer -= 1;
    // (On missions where the team's gunfire is inaudible, the squad's shots make no noise either.)
    const silent = this.friendly && this.game.mode?.mission?.silentShots;
    if (this.noiseTimer <= 0) { if (!silent) this.game.emitNoise(this.pos, quiet ? 12 : 60, this); this.noiseTimer = 4; }
    // Rate of fire and trigger discipline: long bursts up close, short bursts and
    // aimed singles at range, LMGs lay down longer strings.
    const rpm = wpn.mode === 'bolt' ? 26 : wpn.mode === 'pump' ? 60 : Math.min(wpn.rpm * 0.9, 750);
    this.fireT = 60 / rpm;
    if (wpn.mode === 'semi') this.fireT = Math.max(this.fireT, d > 30 ? rand(0.32, 0.55) : rand(0.18, 0.32));
    if (wpn.mode === 'bolt') this.model.cycle('bolt');
    else if (wpn.mode === 'pump') this.model.cycle('pump');
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      if (wpn.mode === 'auto') {
        this.burstLeft = wpn.class === 'lmg' ? irand(5, 10) : suppressive ? irand(3, 6) : d < 12 ? irand(4, 8) : d < 30 ? irand(2, 4) : irand(1, 2);
      } else this.burstLeft = wpn.mode === 'semi' ? irand(2, 4) : 1;
      const pause = d < 12 ? rand(0.15, 0.4) : d < 30 ? rand(0.3, 0.65) : rand(0.4, 0.85);
      this.burstPause = pause * (wpn.class === 'sniper' ? 2 : 1) * (1 + this.suppression);
    }
    return true;
  }

  /** Change magazines. Tactical reloads keep the old mag; empty ones drop it. */
  _startReload(tactical) {
    if (this.reloadT > 0 || this.ammo >= this.weapon.mag) return;
    const wpn = this.weapon;
    const empty = this.ammo <= 0;
    const base = empty ? (wpn.reloadEmpty ?? wpn.reload) : wpn.reload;
    this.reloadDur = this.reloadT = base * rand(1.0, 1.2) * (this.mpBot ? 0.9 : 1);
    this.reloadCue = 0;
    this.reloadEmpty = empty;
    this.burstLeft = 0;
    this.model.reload(this.reloadDur, { empty, drop: !tactical && wpn.class !== 'shotgun', shells: wpn.class === 'shotgun' });
    if (chance(0.45)) this.game.callout(this, this.friendly ? pick(['Reloading!', 'Changing mags!', 'Cover me, reloading!']) : pick(['Reloading!', 'Cover me!', 'Changing mag!']));
  }

  _updateReload(dt) {
    if (this.reloadT <= 0) return;
    this.reloadT -= dt;
    const t = 1 - this.reloadT / this.reloadDur;
    const shotgun = this.weapon.class === 'shotgun';
    const cues = shotgun ? [[0.15, 'shell'], [0.35, 'shell'], [0.55, 'shell'], [0.75, 'shell'], [0.9, 'pump']]
      : [[0.22, 'magOut'], [0.62, 'magIn'], ...(this.reloadEmpty ? [[0.84, this.weapon.class === 'pistol' ? 'slide' : this.weapon.mode === 'bolt' ? 'bolt' : 'bolt']] : [])];
    while (this.reloadCue < cues.length && t >= cues[this.reloadCue][0]) {
      Audio.mech(cues[this.reloadCue][1], this.pos);
      this.reloadCue++;
    }
    if (this.reloadT <= 0) {
      this.reloadT = 0;
      this.ammo = this.weapon.mag;
    }
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
    // Wind up and release on the clip's throw (a beat after the decision).
    this.grenades--;
    if (this.model.playMove('OverhandThrow')) this._throwPending = { t: 0.55, from, vel };
    else this.game.grenades.throw('frag', from, vel, this, rand(0, 1));
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
    if (this._throwPending && (this._throwPending.t -= dt) <= 0) {
      const { vel } = this._throwPending;
      this._throwPending = null;
      this.game.grenades.throw('frag', this.eyePos.add(new THREE.Vector3(0, 0.3, 0)), vel, this, rand(0, 1));
    }
    if (this.scripted) {
      // Driven by a cutscene (e.g. riding in / fast-roping from a helicopter).
      this.vel.set(0, 0, 0);
      this.lookYaw = this.yaw;
      this.model.root.position.copy(this.pos);
      this.model.root.rotation.y = this.yaw;
      this.model.update(dt, 0, this.scriptCrouch ?? 0, 0, false);
      return;
    }
    const now = this.game.time;
    this.stunT = Math.max(0, this.stunT - dt);
    this.suppression = Math.max(0, this.suppression - dt * 0.35);
    this.recoil *= Math.exp(-dt * 5);
    this._updateReload(dt);
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
    let aiming = false;

    if (this.stunT > 0) {
      // Flashed: stagger, shoot wildly sometimes.
      this.vel.multiplyScalar(0.9);
      this.lookYaw += Math.sin(now * 3) * dt;
      faceYaw = this.lookYaw;
      this.path = null;
      this.moving = false;
    } else {
      this.tactical = false;
      switch (this.state) {
        case 'idle': {
          this.vel.multiplyScalar(0.8);
          this.idleLookT -= dt;
          if (this.idleLookT <= 0) { this.idleLookT = rand(2, 5); this.lookTarget = this.yaw + rand(-1.2, 1.2); }
          faceYaw = this.lookTarget ?? this.yaw;
          // Bored guards fiddle with a radio, a device, their kit.
          this.fidgetT = (this.fidgetT ?? rand(4, 14)) - dt;
          if (this.fidgetT <= 0) { this.fidgetT = rand(10, 22); if (!this.friendly) this.model.playMove(chance(0.5) ? 'Interact' : 'Idle_Listening'); }
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
          // Searching: weapons up, moving as a team behind a point man, each man
          // covering his own side; taking a knee and scanning when stopped.
          this.alertT = (this.alertT ?? 0) + dt;
          this.tactical = true;
          aiming = this.reloadT <= 0;
          const lk = this.lastKnown;
          const look = lk ? Math.atan2(-(lk.x - this.pos.x), -(lk.z - this.pos.z)) : faceYaw;
          const lead = this._teamLead();
          if (lead && lead !== this) {
            const slot = this._fileSlot(lead);
            const ds = Math.hypot(slot.x - this.pos.x, slot.z - this.pos.z);
            if (ds > 1.0 && now >= (this._slotPathT ?? 0) && (!this.path || this.pathGoal.distanceTo(slot) > 1.5)) { this._slotPathT = now + 0.5; this._pathTo(slot, ds > 14); }
            if (!(this.path && !this._followPath(dt))) this.vel.multiplyScalar(0.8);
            faceYaw = lead.lookYaw + this._sectorOffset();
          } else if (this._pointManWaits()) {
            // Point man: hold up until the file closes in behind him.
            this.vel.multiplyScalar(0.8);
            faceYaw = look + Math.sin(now * 0.6 + this.id) * 0.4;
          } else if (this.path && !this._followPath(dt)) {
            faceYaw = look + Math.sin(now * 0.9 + this.id) * 0.35;
          } else {
            this.vel.multiplyScalar(0.8);
            faceYaw = look + Math.sin(now * 0.6 + this.id) * 0.6;
            if (this.alertT > 3 && !this.path && lk && this.pos.distanceTo(lk) > 3) this._pathTo(lk, false);
          }
          wantCrouch = this.moving ? 0.3 : 0.6;
          if (this.alertT > 14) {
            this.state = this.friendly ? 'follow' : this.patrol ? 'patrol' : this.hunter ? 'hunt' : 'idle';
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
          this.tactical = true;
          const res = this._follow(dt, think);
          faceYaw = res ?? faceYaw;
          wantCrouch = this.followCrouch;
          aiming = !!this.followAim && this.reloadT <= 0;
          break;
        }
        case 'hunt': {
          const ordered = this._obeyOrder(dt, think);
          if (ordered !== null) { faceYaw = this._watchYaw() ?? ordered; wantCrouch = this.followCrouch; aiming = true; break; }
          // Fresh contact nearby: slow down, weapon up, eyes on where it was.
          const recent = now - this.lastSeenT < 8 && this.lastKnown;
          this.tactical = !!recent;
          if (think && (!this.path || this.repathT > 6)) {
            const goal = this.game.mode?.botGoal?.(this) ?? this.game.player.pos;
            if (goal) this._pathTo(goal, !recent);
          }
          this.repathT += dt;
          if (this._followPath(dt)) { this.vel.multiplyScalar(0.8); if (think) this.path = null; }
          if (recent) {
            faceYaw = Math.atan2(-(this.lastKnown.x - this.pos.x), -(this.lastKnown.z - this.pos.z));
            aiming = this.reloadT <= 0;
            wantCrouch = this.moving ? 0.3 : 0;
          } else faceYaw = this._velYaw() ?? faceYaw;
          break;
        }
        case 'combat': {
          this.tactical = true;
          const r = this._combat(dt, think, now);
          wantCrouch = r.crouch;
          firing = r.firing;
          faceYaw = r.face ?? faceYaw;
          // Weapon shouldered whenever in contact or advancing at a walk; only lowered to rush.
          aiming = (this.targetVisible || now - this.lastShotTime < 0.8 || (this.moving && !this.runMode)) && !(this.runMode && this.moving) && this.reloadT <= 0;
          break;
        }
        default:
          break;
      }
    }

    // Covering fire on the player's call (when not busy with a visible enemy).
    let coverPitch = null;
    if (this.order?.kind === 'cover' && this.stunT <= 0 && !(this.state === 'combat' && this.targetVisible)) {
      const c = this._coverFire(dt);
      if (c) { faceYaw = c.face; firing = c.firing || firing; aiming = true; coverPitch = c.pitch; wantCrouch = 0; }
    }

    // Turn toward desired facing (snappier when tracking a visible target).
    this.lookYaw = dampAngle(this.lookYaw, faceYaw, this.state === 'combat' ? (this.targetVisible ? 12 : 8) : 4, dt);
    this.yaw = this.lookYaw;
    this._integrate(dt);
    this.crouch = wantCrouch;

    // Aim pitch.
    let pitch = 0;
    if (this.state === 'combat' && this.target) {
      const tp = this.targetVisible ? this.target.chest : (this.lastKnown ?? this.target.pos).clone().setY((this.lastKnown ?? this.target.pos).y + 1.1);
      const e = this.eyePos;
      pitch = Math.atan2(tp.y - (e.y - 0.1), Math.hypot(tp.x - e.x, tp.z - e.z));
    }
    if (coverPitch !== null) pitch = coverPitch;
    this.pitch = pitch;
    // Direction of travel relative to facing, so the legs can walk sideways/backwards.
    this.model.moveRel = this.speed > 0.3 ? wrapAngle(Math.atan2(-this.vel.x, -this.vel.z) - this.yaw) : 0;
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, this.speed, this.crouch, this.pitch, firing, aiming ? 1 : 0);
    if (this.model.glint) {
      const p = this.game.player;
      const d = this.pos.distanceTo(p.pos);
      const want = aiming && this.target === p && this.targetVisible && d > 15 ? 1 : 0;
      this.glintK = damp(this.glintK ?? 0, want, want ? 3 : 6, dt);
      this.model.setGlint(this.glintK * (this.game.night ? 0.6 : 1), d, now);
    }
  }

  // ---------- orders from the player (squad comms) ----------
  /** kind: 'regroup' | 'hold' | 'move' | 'cover'. pos: where; yaw: facing to hold. */
  command(kind, pos, yaw, target = null) {
    const now = this.game.time;
    if (kind === 'cover') {
      this.order = { kind, pos, yaw, target, until: now + 8, prev: this.order?.kind === 'cover' ? this.order.prev : this.order };
      return;
    }
    if (this.cover) { this.cover.owner = null; this.cover = null; }
    this.path = null;
    if (this.friendly && !this.model.inMove) this.model.playMove('Head_Nod', { hideGun: false, parts: 'head' }); // copy that
    this.order = { kind, pos, yaw, until: kind === 'regroup' ? now + 14 : this.mpBot ? now + 50 : Infinity };
    if (kind === 'regroup' && this.state === 'combat' && !this.targetVisible) this.state = this.friendly ? 'follow' : this.hunter ? 'hunt' : 'alert';
  }

  /** Pick up a target the player pointed out. */
  engage(e) {
    const now = this.game.time;
    if (!e || !e.alive) return;
    this.target = e;
    this.lastKnown = e.pos.clone();
    this.lastSeenT = now;
    this.acquiredT = Math.min(this.acquiredT, now + this.diff.reaction * 0.5);
    if (this.state !== 'combat') { this.state = 'combat'; this.combatT = 0; }
  }

  /** Turn to watch a point the player called out. */
  watch(p) { this.watchPos = p; this.watchUntil = this.game.time + 6; }

  _orderSlot() {
    return [[0, 0], [-1.6, 0.6], [1.6, 0.6], [0, 1.8], [-2.4, 2], [2.4, 2]][this.followIndex % 6];
  }

  /** Carry out a movement order. Returns the facing to use, or null when there is none. */
  _obeyOrder(dt, think) {
    const o = this.order;
    if (!o || o.kind === 'cover') return null;
    const g = this.game, now = g.time, p = g.player;
    if (now > o.until) { this.order = null; return null; }
    let goal;
    if (o.kind === 'regroup') {
      const slot = [[-1.6, 1.8], [1.6, 2], [0, 3], [-2.6, 3.2], [2.6, 3.2]][this.followIndex % 5];
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      goal = new THREE.Vector3(p.pos.x + slot[0] * cos + slot[1] * sin, 0, p.pos.z - slot[0] * sin + slot[1] * cos);
    } else {
      const [sx, sz] = o.kind === 'move' ? this._orderSlot() : [0, 0];
      const sin = Math.sin(o.yaw), cos = Math.cos(o.yaw);
      goal = new THREE.Vector3(o.pos.x + sx * cos + sz * sin, 0, o.pos.z - sx * sin + sz * cos);
    }
    const d = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    let arrived = d <= (o.kind === 'hold' ? 1.2 : 1.6);
    if (!arrived) {
      const stale = !this.path || (think && this.pathGoal && this.pathGoal.distanceTo(goal) > 2);
      if (stale && now >= (this._orderPathT ?? 0)) {
        this._orderPathT = now + 0.4;
        if (!this._pathTo(goal, o.kind !== 'hold' && d > 3)) {
          // Nowhere to go: hold here instead.
          this.order = { ...o, kind: 'hold', pos: this.pos.clone(), until: o.kind === 'regroup' ? now : o.until };
          arrived = true;
        }
      }
      if (!arrived) {
        if (!this.path) { this.vel.multiplyScalar(0.8); return o.yaw; }
        if (!this._followPath(dt)) { this.followCrouch = 0; return this._velYaw() ?? o.yaw; }
        arrived = true; // end of the route (close enough)
      }
    }
    this.vel.multiplyScalar(0.8);
    this.path = null;
    if (o.kind === 'regroup') {
      this.order = null;
      this.followCrouch = p.stance !== 'stand' ? 1 : 0;
      return p.yaw;
    }
    // In position: take a knee and watch the sector (or the door, on a stack).
    this.followCrouch = 1;
    return o.exact ? o.yaw : o.yaw + (this.followIndex % 3 - 1) * 0.5;
  }

  /** Where this soldier should stay close to in a fight, and how far it may stray. */
  _leash() {
    const o = this.order;
    if (o && (o.kind === 'hold' || o.kind === 'move')) return { at: o.pos, r: 9 };
    if (o && o.kind === 'regroup') return { at: this.game.player.pos, r: 5 };
    if (this.friendly) return { at: this.game.player.pos, r: this.game.mode?.squadLeash ?? 22 };
    return null;
  }

  /** Covering fire on the point the player called. */
  _coverFire(dt) {
    const o = this.order;
    if (!o || o.kind !== 'cover') return null;
    const now = this.game.time;
    if (now > o.until) { this.order = o.prev ?? null; return null; }
    if (o.target && o.target.alive) o.pos = o.target.chest;
    const e = this.eyePos;
    if (now >= (this._coverLosT ?? 0)) {
      this._coverLosT = now + 0.3;
      this._coverLos = e.distanceTo(o.pos) < 140 && this.game.world.los(e, o.pos);
    }
    if (!this._coverLos) return null;
    const face = Math.atan2(-(o.pos.x - this.pos.x), -(o.pos.z - this.pos.z));
    let firing = false;
    if (Math.abs(wrapAngle(face - this.lookYaw)) < 0.25) {
      const tgt = o.target && o.target.alive ? o.target : { pos: o.pos, vel: null, isPlayer: false };
      firing = this._shootAt(tgt, dt, true, o.pos);
    }
    return { face, firing, pitch: Math.atan2(o.pos.y - (e.y - 0.1), Math.hypot(o.pos.x - e.x, o.pos.z - e.z)) };
  }

  /** Position in a line abreast across the squad (-1, 0, 1...), for advancing side by side. */
  _lineSlot() {
    if (!this.squad) return 0;
    const alive = this.squad.members.filter((m) => m.alive);
    return alive.indexOf(this) - (alive.length - 1) / 2;
  }

  // ---------- moving as a team ----------
  /** Squadmates on the move together (searching), point man first. */
  _team() {
    if (!this.squad) return [];
    return this.squad.members.filter((m) => m.alive && m.state === this.state && !m.stationary && m.pos.distanceTo(this.pos) < 30);
  }

  _teamLead() { return this._team()[0] ?? null; }

  /** As point man of a moving file: keep to a pace the team can hold, and wait for stragglers. */
  _pointManWaits() {
    const team = this._team();
    if (team.length < 2 || team[0] !== this) return false;
    this.runMode = false;
    let lag = 0;
    for (const m of team) if (m !== this) lag = Math.max(lag, m.pos.distanceTo(this.pos));
    return lag > 9;
  }

  /** A place in a staggered file behind the point man. */
  _fileSlot(lead) {
    const team = this._team();
    const rank = Math.max(1, team.indexOf(this));
    const fwd = lead.speed > 0.3 ? new THREE.Vector3(lead.vel.x, 0, lead.vel.z).normalize() : new THREE.Vector3(-Math.sin(lead.lookYaw), 0, -Math.cos(lead.lookYaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const slot = lead.pos.clone().addScaledVector(fwd, -2.6 * rank).addScaledVector(right, rank % 2 ? 1.2 : -1.2); // well spread out
    slot.y = 0;
    const w = this.game.world;
    if (!w.walkable(slot.x, slot.z)) { const c = w.nearestWalkable(slot.x, slot.z, 3); if (c >= 0) w.cellCenter(c, slot); }
    return slot;
  }

  /** Which way this man's weapon points in a moving file: alternate sides, the last man covers the rear. */
  _sectorOffset() {
    const team = this._team();
    const rank = Math.max(0, team.indexOf(this));
    if (team.length >= 4 && rank === team.length - 1) return Math.PI;
    return [0, 0.6, -0.6, 1.1, -1.1][rank % 5];
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
    const ordered = this._obeyOrder(dt, think);
    if (ordered !== null) return this._watchYaw() ?? ordered;
    // A well-spaced staggered file trailing behind you, anchored to the way you are moving (not
    // where you happen to look), each man shouldering his rifle into his own sector.
    // Every move is measured: they move out one after another a beat after you do, at
    // a slow tactical walk, don't shuffle for small shifts and take a knee when you halt.
    const now = this.game.time, w = this.game.world;
    const yawF = this._formationHeading();
    const i = this.followIndex % 5;
    const slot = [[1.4, 2.9], [-1.4, 5.6], [1.4, 8.3], [-1.4, 11.0], [0, 13.7]][i];
    const sector = [0.55, -0.55, 1.1, -1.1, Math.PI][i];
    const sin = Math.sin(yawF), cos = Math.cos(yawF);
    const goal = new THREE.Vector3(p.pos.x + slot[0] * cos + slot[1] * sin, 0, p.pos.z - slot[0] * sin + slot[1] * cos);
    if (!w.walkable(goal.x, goal.z)) { const c = w.nearestWalkable(goal.x, goal.z, 3); if (c >= 0) w.cellCenter(c, goal); goal.y = 0; }
    const d = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    const pv = Math.hypot(p.vel.x, p.vel.z);
    const fm = (this._fm ??= { go: 0, still: 0, moving: false });
    fm.go = pv > 0.6 ? fm.go + dt : 0;
    fm.still = pv < 0.3 ? fm.still + dt : 0;
    const delay = p.sprinting ? 0.12 * i : 0.45 + 0.45 * i; // stepping off one at a time
    const hold = d < 1.5 && pv < 0.6 && !fm.moving; // close enough: don't shuffle about
    const waiting = fm.go < delay && d < 6;
    if (d > 0.45 && !hold && !waiting) {
      fm.moving = d > 0.6;
      const walk = p.sprinting || d > 12 ? 5 : d > 8 ? 4 : 3.1; // jog only to close a big gap
      if (d < 7 && this.pos.y < 0.4 && w.walkLine(this.pos.x, this.pos.z, goal.x, goal.z)) {
        // Close and clear: ease into the slot, never faster than a tactical walk.
        const sp = clamp(Math.min(pv, 3.1) * 0.92 + (d - 0.45) * 0.35, 0.5, walk);
        this.vel.x = damp(this.vel.x, ((goal.x - this.pos.x) / d) * sp, 3.5, dt);
        this.vel.z = damp(this.vel.z, ((goal.z - this.pos.z) / d) * sp, 3.5, dt);
        this.path = null;
        this.moving = true;
      } else {
        if (now >= (this._followPathT ?? 0) && (!this.path || (this.pathGoal && this.pathGoal.distanceTo(goal) > 1.5))) {
          this._followPathT = now + 0.4;
          this._pathTo(goal, d > 14 || p.sprinting);
        }
        // Walk the route at your pace, jogging only when well behind.
        this.paceOverride = clamp(Math.min(Math.max(pv, 2.0), 3.1) + (d - 1) * 0.25, 1.4, walk);
        this._followPath(dt);
        this.paceOverride = 0;
        if (d > 45 && !w.los(this.eyePos, p.eyePos)) {
          // Catch up when hopelessly left behind (off-screen teleport).
          const near = w.nearestWalkable(goal.x, goal.z, 6);
          if (near >= 0) { w.cellCenter(near, this.pos); this.path = null; }
        }
      }
    } else {
      this.vel.multiplyScalar(0.86);
      this.path = null;
      this.moving = false;
      fm.moving = false;
    }
    const moving = this.speed > 0.4;
    // Halted for a while: take a knee and cover your sector.
    const kneel = !moving && fm.still > 2.2 + i * 0.5;
    this.followCrouch = p.stance !== 'stand' || kneel ? 1 : moving && !p.sprinting ? 0.3 : 0;
    this.followAim = !p.sprinting && !(this.runMode && this.moving);
    return this._watchYaw() ?? yawF + sector;
  }

  /** Heading of the player's formation: their direction of travel, held while they stand still. */
  _formationHeading() {
    const g = this.game, p = g.player;
    const f = (g._formation ??= { t: -1, yaw: p.yaw });
    if (f.t !== g.time) {
      f.t = g.time;
      if (Math.hypot(p.vel.x, p.vel.z) > 0.8) f.yaw = dampAngle(f.yaw, Math.atan2(-p.vel.x, -p.vel.z), 3, g.dt ?? 1 / 30);
    }
    return f.yaw;
  }

  _watchYaw() {
    if (!this.watchPos || this.game.time > this.watchUntil) return null;
    return Math.atan2(-(this.watchPos.x - this.pos.x), -(this.watchPos.z - this.pos.z));
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

    // Hand to hand: an enemy within arm's reach gets a fist instead of a burst.
    this.meleeCD = (this.meleeCD ?? 0) - dt;
    if (this.meleeT > 0) {
      this.meleeT -= dt;
      this.vel.multiplyScalar(0.7);
      res.face = Math.atan2(-(tgt.pos.x - this.pos.x), -(tgt.pos.z - this.pos.z));
      if (!this.meleeHit && this.meleeT < 0.5) {
        this.meleeHit = true;
        if (tgt.alive && Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) < 2.1) {
          tgt.takeDamage(this.role === 'boss' ? 45 : 30, this.pos.clone(), this);
          Audio.foley?.('punch', tgt.pos);
        }
      }
      return res;
    }
    if (this.targetVisible && this.meleeCD <= 0 && this.reloadT <= 0 && !this.stationary && Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) < 1.7) {
      // Jab, cross or a front kick; the blow lands when meleeT drops under 0.5.
      const [move, t] = [['Fighting_Right_Jab', 0.9], ['Fighting_Left_Jab', 0.9], ['Punch_Cross', 0.95], ['Kick_Breach', 1.3]][Math.floor(Math.random() * 4)];
      if (this.model.playMove(move)) { this.meleeT = t; this.meleeHit = false; this.meleeCD = 1.6; return res; }
    }

    // Lost contact for long: give up / search.
    if (sinceSeen > (this.mpBot ? 8 : 18)) {
      this.target = null;
      if (this.cover) { this.cover.owner = null; this.cover = null; }
      this.state = this.friendly ? 'follow' : this.hunter ? 'hunt' : 'alert';
      this.alertT = 0;
      if (!this.friendly && !this.hunter) this._pathTo(lk, false);
      return res;
    }

    // Friendlies stay near the player (or the spot they were ordered to hold).
    const leash = think ? this._leash() : null;
    if (leash && this.pos.distanceTo(leash.at) > leash.r) {
      if (this.cover) { this.cover.owner = null; this.cover = null; }
      this._pathTo(leash.at, true);
    }

    // Top up the magazine during a lull in the fight.
    if (!this.targetVisible && sinceSeen > 1.5 && this.ammo < this.weapon.mag * 0.5) this._startReload(this.ammo > 0);

    // Stationary shooters (snipers in towers, perched guards).
    if (this.stationary) {
      res.crouch = this.targetVisible && this.reloadT <= 0 ? 0 : 1;
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
      const canFire = this.mpBot || !this.runMode || distT < 10;
      if (this.targetVisible && canFire) res.firing = this._shootAt(tgt, dt);
      if (!this.runMode) res.crouch = 0.3; // crouch-walk, weapon on the threat
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
        // One flanker per squad at most, and only when there are enough men to hold the front.
        const mates = this.squad ? this.squad.members.filter((m) => m.alive && m !== this) : [];
        this.flanker = mates.length >= 2 && !mates.some((m) => m.flanker) && chance(0.15 * this.diff.aggression + (this.mpBot ? 0.1 : 0));
        const cp = this._findCover(lk);
        if (cp) {
          if (this.cover) this.cover.owner = null;
          this.cover = cp;
          cp.owner = this;
          // Short moves at a crouch-walk with the weapon up; only rush to cover that is far.
          this._pathTo(new THREE.Vector3(cp.x, 0, cp.z), this.targetVisible && Math.hypot(cp.x - this.pos.x, cp.z - this.pos.z) > 13);
          this.repositionT = rand(11, 18) * (1.3 - this.diff.aggression);
          this.peekOffset = null;
          return res;
        }
        if (!this.cover) {
          // No cover: advance deliberately, abreast of the squad, or hold and fight from a knee.
          const range = this.weapon.class === 'smg' || this.weapon.class === 'shotgun' ? 9 : this.weapon.class === 'sniper' ? 45 : 20;
          if (distT > range || !this.targetVisible) {
            const toward = lk.clone().sub(this.pos).setY(0).normalize();
            const side = new THREE.Vector3(-toward.z, 0, toward.x).multiplyScalar(this._lineSlot() * 3);
            const goal = this.pos.clone().addScaledVector(toward, Math.min(8, distT * 0.4)).add(side);
            this._pathTo(goal, !this.targetVisible && distT > 45);
          }
          this.repositionT = rand(6, 9);
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
        if (this.coverPhase === 'peek' && (this.reloadT > 0 || this.ammo <= 0)) { this.coverPhase = 'hide'; this.coverT = rand(0.4, 0.8); }
        if (this.coverPhase === 'hide') {
          res.crouch = 1;
          if (this.ammo < this.weapon.mag * 0.4 && this.reloadT <= 0) this._startReload(this.ammo > 0);
          // Drift back to the cover spot.
          const dx = this.cover.x - this.pos.x, dz = this.cover.z - this.pos.z;
          this.vel.x += dx * 4 * dt; this.vel.z += dz * 4 * dt;
        } else {
          res.crouch = this.cover.tall ? 0 : (this.targetVisible ? 0 : 0);
          if (this.peekOffset) {
            // Lean out at a controlled step, not a lunge.
            const dx = this.peekOffset.x - this.pos.x, dz = this.peekOffset.z - this.pos.z;
            this.vel.x = damp(this.vel.x, dx * 3, 10, dt); this.vel.z = damp(this.vel.z, dz * 3, 10, dt);
          }
          if (this.targetVisible) res.firing = this._shootAt(tgt, dt);
          else if (sinceSeen < 2.5 && this.squad && chance(0.5)) res.firing = this._shootAt(tgt, dt, true);
        }
      } else if (!this.moving) {
        this._pathTo(new THREE.Vector3(this.cover.x, 0, this.cover.z), this.targetVisible && Math.hypot(this.cover.x - this.pos.x, this.cover.z - this.pos.z) > 13);
      }
    } else if (this.targetVisible) {
      if (think) this.kneel = distT > 15 && chance(0.6);
      res.crouch = this.kneel || this.reloadT > 0 ? 1 : 0;
      res.firing = this._shootAt(tgt, dt);
    } else if (think && sinceSeen > 3 && !this.path) {
      // Push toward the last known position at a walk, weapon up.
      this._pathTo(lk, distT > 40);
    }
    return res;
  }

  dispose() {
    if (this.cover) this.cover.owner = null;
    this.model.dispose();
  }
}

export { pick };
