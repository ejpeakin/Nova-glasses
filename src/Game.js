// One match/mission session: builds the level, runs the simulation loop and owns
// combat resolution (bullets, explosions, flashbangs, melee), pickups,
// interactables, death/respawn and rendering of world + viewmodel.
import * as THREE from './lib/three.js';
import { World } from './world/World.js';
import { MapBuilder } from './world/MapBuilder.js';
import { buildMap, MAP_INFO } from './world/Maps.js';
import { Environment } from './world/Environment.js';
import { Effects } from './world/Effects.js';
import { NightVision } from './world/NightVision.js';
import { getSpriteTexture } from './world/Textures.js';
import { Player } from './player/Player.js';
import { WeaponSystem } from './weapons/WeaponSystem.js';
import { Grenades } from './weapons/Grenades.js';
import { WEAPONS } from './weapons/WeaponData.js';
import { buildLowGun } from './ai/Humanoid.js';
import { Audio } from './core/Audio.js';
import { Store } from './core/Storage.js';
import { clamp, lerp, rand } from './core/Utils.js';
import { Comms } from './player/Comms.js';

export class Game {
  constructor(app, config) {
    this.app = app;
    this.config = config;
    this.renderer = app.renderer;
    this.input = app.input;
    this.hud = app.hud;
    this.time = 0;
    this.dt = 0;
    this.paused = false;
    this.over = false;
    this.actors = [];
    this.pickups = [];
    this.interactables = [];
    this.flashlightOn = false;
    this.flashlightVisible = false; // white light enemies can see (the IR illuminator is invisible to them)
    this.bodies = []; // fallen soldiers other guards can discover
    this.nvg = false;
    this.lastMouse = { x: 0, y: 0 };
    this.killfeed = [];
    this.comms = new Comms(this);
    this.calloutCD = 0;
    this.respawnT = 0;
    this.slowmo = 1;
    this.cinematic = null; // camera override (cutscenes)
  }

  /** Build everything. mode: an instance of a mode class (campaign/tdm/...). */
  build(mode) {
    const q = Store.settings.quality;
    this.mode = mode;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.world = new World();
    this.mapId = mode.mapId;
    this.mapInfo = MAP_INFO[this.mapId];
    const builder = new MapBuilder(this.scene, this.world, this.mapId.length * 7919, q);
    mode.beforeMap?.(builder);
    buildMap(this.mapId, builder);
    this.builder = builder;
    const lighting = mode.lighting ?? this.mapInfo.lighting;
    const weather = mode.weather ?? this.mapInfo.weather;
    this.night = lighting === 'night';
    this.lighting = lighting;
    // Night-vision goggles: light amplification tuned to how dark the level is.
    this.nvgFx = new NightVision(this.renderer);
    this.nvgGain = { night: 3.6, indoor: 2.4, dusk: 1.8, dawn: 1.6, overcast: 1.3, snow: 1.0, desert: 0.9, day: 0.95 }[lighting] ?? 1.3;
    if (this.night && Store.settings.nvgAuto) { this.nvg = true; this.nvgFx.toggle(true); this.nvgFx.amount = 1; }
    this.env = new Environment(this.scene, this.renderer, lighting, weather, q);
    // How far anyone can see through this level's fog (feeds AI vision range).
    this.visRange = Math.max(35, Math.min(200, 0.95 / (this.env.preset.fogDensity || 0.008)));
    if (this.night && weather === 'rain') this.env.enableLightning();
    this.effects = new Effects(this.scene, q);
    // Unlit particles (smoke, dust, weather) are dimmed to the level's light so they don't glow at night.
    const ambient = { night: 0.14, indoor: 0.55, dusk: 0.55, dawn: 0.6, overcast: 0.85 }[lighting] ?? 1;
    this.effects.setAmbient(ambient);
    if (this.env.particles) this.env.particles.pts.material.color.multiplyScalar(Math.max(0.25, ambient));
    this.grenades = new Grenades(this);
    this.player = new Player(this);
    this.player.damageMult = mode.playerDamageMult ?? 1;
    this.weapons = new WeaponSystem(this, mode.loadout());
    // Flashlight (always present so toggling never recompiles shaders).
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 40, 0.42, 0.5, 1.3);
    this.flashlight.position.set(0.2, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.camera.add(this.flashlight, this.flashlight.target);
    this._initLasers();
    const ropeGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 5);
    ropeGeo.rotateX(Math.PI / 2);
    ropeGeo.translate(0, 0, 0.5);
    this.rope = new THREE.Mesh(ropeGeo, new THREE.MeshStandardMaterial({ color: 0x2b2a26, roughness: 0.9 }));
    this.rope.visible = false;
    this.rope.frustumCulled = false;
    this.hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.4, metalness: 0.8 })); // anchor carabiner
    this.hook.visible = false;
    this.ropeTail = new THREE.Mesh(ropeGeo, this.rope.material);
    this.ropeTail.visible = false;
    this.ropeTail.frustumCulled = false;
    this.scene.add(this.rope, this.hook, this.ropeTail);
    // Visible weapon laser: a faint red beam from the muzzle and a bright dot on whatever it hits.
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute([1.6, 0.08, 0.06, 0.25, 0.01, 0.01], 3));
      this.laserBeam = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      this.laserBeam.frustumCulled = false;
      this.laserBeam.visible = false;
      this.laserDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSpriteTexture('flash'), color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, toneMapped: false, fog: false }));
      this.laserDot.visible = false;
      this.scene.add(this.laserBeam, this.laserDot);
    }
    {
      const tips = [];
      if (this.night || this.mapId === 'blacksite') tips.push('F: flashlight   N: night vision');
      if (this.weapons.slots.some((sl) => ['ar', 'smg', 'marksman', 'sniper', 'lmg'].includes(sl.stats.class))) tips.push('L: weapon laser');
      if (tips.length) this.hud?.hint(tips.join('   ·   '), 6);
    }
    Audio.setAmbience(mode.ambience ?? this.mapInfo.ambience);
    Audio.setAcoustics(this.world.indoor ? 'indoor' : this.mapId);
    this.smokeColumns = mode.smokeColumns ?? [];
    mode.setup(this);
    this.resize();
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.weapons.viewScene, this.weapons.viewCam);
    // Night vision renders into an HDR target (a different shader variant): warm those up too.
    this.renderer.setRenderTarget(this.nvgFx.rt);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.weapons.viewScene, this.weapons.viewCam);
    this.renderer.setRenderTarget(null);
    this.nvgFx.warm?.();
  }

  // ---------- rappel rope (campaign) ----------
  _updateRappelPrompt(input) {
    const p = this.player;
    this._rapT = (this._rapT ?? 0) - this.dt;
    if (p.climbing) { this.rappelPlan = null; return; }
    if (this._rapT <= 0) { this._rapT = 0.12; this.rappelPlan = p.planRappel(); }
    if (input.pressed('KeyT') && this.rappelPlan) {
      this.weapons.cancelAds?.();
      p.startRappel(this.rappelPlan);
      this.rappelPlan = null;
    }
  }

  // ---------- weapon laser ----------
  _updateWeaponLaser() {
    const w = this.weapons, p = this.player;
    const on = w.laserOn && p.alive && !this.cinematic && !p.climbing && w.muzzleView;
    this.laserBeam.visible = this.laserDot.visible = !!on;
    if (!on) return;
    const cam = this.camera;
    // Muzzle: the viewmodel muzzle carried into world space by the camera.
    const from = w.muzzleView.clone().applyMatrix4(cam.matrixWorld);
    // The dot lands where shots go: along the line of sight, on the first wall or body.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const o = cam.position;
    const hit = this.world.raycast(o.x, o.y, o.z, fwd.x, fwd.y, fwd.z, 300);
    let t = hit ? hit.t : 300;
    for (const a of this.actors) { if (a.alive) { const h = a.rayHit(o, fwd, t); if (h) t = h.t; } }
    const to = o.clone().addScaledVector(fwd, t);
    const pa = this.laserBeam.geometry.attributes.position;
    pa.setXYZ(0, from.x, from.y, from.z);
    pa.setXYZ(1, to.x, to.y, to.z);
    pa.needsUpdate = true;
    this.laserDot.position.copy(to).addScaledVector(fwd, -0.03);
    this.laserDot.scale.setScalar(0.035 + t * 0.0045);
  }

  /** Rappel rope: anchored at the roof edge, running through your hands and on down to the ground. */
  _updateRope() {
    const r = this.player.rappel;
    const show = !!r && !this.cinematic;
    this.rope.visible = this.hook.visible = this.ropeTail.visible = show;
    if (!show) return;
    const plan = r.plan, p = this.player;
    const anchor = plan.anchor;
    // The line passes in front of your chest, between you and the wall.
    const at = new THREE.Vector3(p.pos.x + plan.toWall.x * 0.22, p.pos.y + 1.05, p.pos.z + plan.toWall.z * 0.22);
    const seg = (m, a, b) => { m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, Math.max(0.01, a.distanceTo(b))); };
    seg(this.rope, anchor, at);
    const ground = new THREE.Vector3(at.x + plan.toWall.x * 0.1, plan.groundY + 0.02, at.z + plan.toWall.z * 0.1);
    seg(this.ropeTail, at, ground);
    this.hook.position.copy(anchor);
    this.ropeAt = at;
  }

  // ---------- target tagging (hold your sights on an enemy) ----------
  _updateTagging(dt) {
    const w = this.weapons;
    if ((w.ads ?? 0) < 0.85) { this._tagT = 0; this._tagged = null; return; }
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestA = THREE.MathUtils.degToRad(2.2);
    for (const a of this.actors) {
      if (!a.alive || a.marked || !this.hostile(this.player, a)) continue;
      const c = a.chest;
      const to = c.clone().sub(cam.position);
      const d = to.length();
      if (d > 180) continue;
      const ang = to.divideScalar(d).angleTo(fwd);
      if (ang < bestA && this.world.los(cam.position, c)) { bestA = ang; best = a; }
    }
    if (best && best === this._tagged) {
      this._tagT += dt;
      if (this._tagT > 0.45) {
        best.marked = true;
        this._tagT = 0;
        Audio.ui('click');
        this.hud?.toast('TARGET TAGGED', 'xp');
      }
    } else { this._tagged = best; this._tagT = 0; }
  }

  // ---------- IR lasers (visible only through night vision) ----------
  _initLasers() {
    this.lasers = [];
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const dotMat = new THREE.SpriteMaterial({ map: getSpriteTexture('flash'), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute([2.4, 2.4, 2.4, 0.35, 0.35, 0.35], 3));
      const line = new THREE.Line(g, mat);
      line.frustumCulled = false;
      line.visible = false;
      const dot = new THREE.Sprite(dotMat);
      dot.visible = false;
      this.scene.add(line, dot);
      this.lasers.push({ line, dot });
    }
  }

  _updateLasers() {
    const on = this.nvgFx.active && this.nvgFx.amount > 0.6 && this.nvg;
    let i = 0;
    const beam = (from, dir) => {
      const L = this.lasers[i++];
      const hit = this.world.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, 150);
      const len = hit ? hit.t : 150;
      const pa = L.line.geometry.attributes.position;
      pa.setXYZ(0, from.x, from.y, from.z);
      pa.setXYZ(1, from.x + dir.x * len, from.y + dir.y * len, from.z + dir.z * len);
      pa.needsUpdate = true;
      L.line.visible = true;
      L.dot.visible = !!hit;
      if (hit) { L.dot.position.copy(hit.point).addScaledVector(dir, -0.03); L.dot.scale.setScalar(0.05 + len * 0.005); }
    };
    if (on) {
      const cam = this.camera;
      if (this.player.alive && !this.cinematic) {
        // From the weapon's laser module, converging on the point of aim.
        const q = cam.quaternion;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        const aim = this.world.raycast(cam.position.x, cam.position.y, cam.position.z, fwd.x, fwd.y, fwd.z, 250);
        const aimPt = cam.position.clone().addScaledVector(fwd, aim ? aim.t : 250);
        const from = cam.position.clone().add(new THREE.Vector3(0.085, -0.1, -0.4).applyQuaternion(q));
        beam(from, aimPt.sub(from).normalize());
      }
      for (const a of this.actors) {
        if (i >= this.lasers.length) break;
        if (!a.alive || !a.friendly || a.mpBot || a.scripted) continue;
        if (a.pos.distanceTo(this.player.pos) > 90) continue;
        const from = a.model.muzzle.getWorldPosition(new THREE.Vector3());
        const dir = a.model.muzzleDir(new THREE.Vector3());
        beam(from.addScaledVector(dir, 0.02), dir);
      }
    }
    for (; i < this.lasers.length; i++) { this.lasers[i].line.visible = false; this.lasers[i].dot.visible = false; }
  }

  // ---------- relations ----------
  hostile(a, b) {
    if (!a || !b || a === b) return false;
    return a.team !== b.team;
  }

  hostilesOf(actor) {
    const out = [];
    if (this.player.alive && !this.player.hidden && this.hostile(actor, this.player)) out.push(this.player);
    for (const a of this.actors) if (a.alive && !a.hidden && this.hostile(actor, a)) out.push(a);
    return out;
  }

  addActor(soldier) {
    this.actors.push(soldier);
    return soldier;
  }

  removeActor(a) {
    a.dispose();
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
  }

  // ---------- combat ----------
  fireBullet(origin, dir, o) {
    const maxDist = o.maxDist ?? 300;
    const shooter = o.shooter;
    const wHit = this.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
    let maxT = wHit ? wHit.t : maxDist;
    let hitActor = null, head = false;
    const test = (a) => {
      if (a === shooter || !a.alive) return;
      if (shooter && !this.hostile(shooter, a)) return;
      const h = a.rayHit(origin, dir, maxT);
      if (h) { maxT = h.t; hitActor = a; head = h.head; }
    };
    test(this.player);
    for (const a of this.actors) test(a);
    const point = origin.clone().addScaledVector(dir, maxT);
    // Near-miss: whiz past the player's head / suppress AI near the line.
    if (shooter !== this.player && hitActor !== this.player && this.player.alive && this.hostile(shooter, this.player)) {
      const hp = this.player.eyePos;
      const t = clamp(hp.clone().sub(origin).dot(dir), 0, maxT);
      const closest = origin.clone().addScaledVector(dir, t);
      const miss = closest.distanceTo(hp);
      // Rounds passing close crack overhead (supersonic) or zip past; within ~1.6 m they suppress.
      if (miss < 5 && t > 4 && t < maxT - 0.3) {
        const wd = WEAPONS[o.weaponId];
        Audio.bulletPass(closest, miss, (wd?.velocity ?? 800) > 360, wd?.class === 'sniper' ? 1.4 : 1);
      }
      if (miss < 1.6 && t > 3) this.player.suppressed = 1;
    }
    if (shooter === this.player) {
      for (const a of this.actors) {
        if (!a.alive || a === hitActor || !this.hostile(shooter, a)) continue;
        const c = a.chest;
        const t = clamp(c.clone().sub(origin).dot(dir), 0, maxT);
        if (origin.clone().addScaledVector(dir, t).distanceTo(c) < 2.2) a.onNearMiss();
      }
    }
    if (hitActor) {
      const d = origin.distanceTo(point);
      const r = o.range;
      const base = d <= r[0] ? o.damage[0] : d >= r[1] ? o.damage[1] : lerp(o.damage[0], o.damage[1], (d - r[0]) / (r[1] - r[0]));
      const dmg = base * (head ? o.headMult : 1) * (o.dmgMult ?? 1);
      const wasAlive = hitActor.alive;
      hitActor.takeDamage(dmg, origin, shooter, head, o.weaponId);
      if (!hitActor.isPlayer) this.effects.blood(point, dir);
      if (shooter === this.player) {
        const killed = wasAlive && !hitActor.alive;
        this.hud?.hitmarker(killed, head);
        Audio.hitmarker(killed, head);
        if (killed && d > Store.stats.longestKill) Store.stats.longestKill = Math.round(d);
      }
      return { point, normal: dir.clone().negate(), actor: hitActor, head, t: maxT };
    }
    if (wHit) {
      this.effects.impact(wHit.point, wHit.normal, wHit.mat);
      if (Math.random() < 0.5) Audio.impact(wHit.mat, wHit.point);
      if ((wHit.mat === 'metal' || wHit.mat === 'concrete') && Math.random() < 0.1 && wHit.point.distanceTo(this.player.pos) < 30) Audio.ricochet(wHit.point);
      return { point: wHit.point, normal: wHit.normal, mat: wHit.mat, t: wHit.t };
    }
    return null;
  }

  explode(pos, def, owner, weaponId = 'frag') {
    const size = def.fx ?? 1.5;
    this.effects.explosion(pos, size);
    Audio.explosion(pos, Math.min(1.6, 0.7 + size * 0.4));
    const center = pos.clone().setY(pos.y + 0.3);
    const victims = [this.player, ...this.actors];
    for (const v of victims) {
      if (!v.alive) continue;
      const c = v.chest;
      const d = c.distanceTo(center);
      if (d > def.radius) continue;
      if (!this.world.los(center, c, true) && !this.world.los(center, v.eyePos ?? c, true)) continue;
      // Friendlies are not hurt by their own team's grenades (except the thrower).
      if (owner && v !== owner && !this.hostile(owner, v)) continue;
      const k = Math.pow(1 - d / def.radius, 1.1);
      const dmg = def.damage * k * (v.isPlayer && owner !== this.player ? (this.mode.grenadeDamageMult ?? 0.7) : 1);
      v.takeDamage(dmg, pos, owner, false, weaponId);
    }
    const pd = this.player.pos.distanceTo(pos);
    this.player.shake = Math.min(1.8, this.player.shake + clamp(1 - pd / (24 * size), 0, 1) * 1.8);
    if (pd < def.radius * 1.3) Audio.muffleFor(1.2 + (1 - pd / (def.radius * 1.3)) * 1.5, 500);
    this.emitNoise(pos, 120, owner);
  }

  flashbang(pos, def, owner) {
    this.effects.flashbang(pos, def.fx ?? 1);
    Audio.flashbang(pos);
    const p = this.player;
    const ep = p.eyePos;
    const d = ep.distanceTo(pos);
    this.player.shake = Math.min(1.2, this.player.shake + clamp(1 - d / 12, 0, 1) * 0.8);
    if (d < def.radius && this.world.los(pos.clone().setY(pos.y + 0.2), ep, true)) {
      const fwd = p.forward;
      const to = pos.clone().sub(ep).normalize();
      const facing = fwd.dot(to);
      // Looking at it: a long white-out. Night vision amplifies the flash even more.
      let t = (1 - d / def.radius) * (facing > 0.2 ? 6.5 : 2.6) + 0.8;
      if (this.nvgFx?.active) t *= 1.4;
      p.flashed = Math.max(p.flashed, t);
      this.flashedMax = Math.max(p.flashed, 0.1);
      this._captureFlash = true; // burn the current frame into an afterimage
      Audio.muffleFor(t, 260);
      Audio.tinnitus(t + 1);
    } else if (d < def.radius * 1.6) {
      Audio.muffleFor(1.2, 900);
    }
    for (const a of this.actors) {
      if (!a.alive) continue;
      const ad = a.eyePos.distanceTo(pos);
      if (ad < def.radius && this.world.los(pos.clone().setY(pos.y + 0.2), a.eyePos, true)) {
        a.flashed(4.5 * (1 - ad / def.radius) + 1.2);
      }
    }
    this.emitNoise(pos, 50, owner);
  }

  melee(attacker) {
    const p = this.player;
    const fwd = p.forward.setY(0).normalize();
    let best = null, bestD = 2.6;
    for (const a of this.actors) {
      if (!a.alive || !this.hostile(p, a)) continue;
      const to = a.pos.clone().sub(p.pos).setY(0);
      const d = to.length();
      if (d > bestD) continue;
      if (to.normalize().dot(fwd) < 0.55) continue;
      best = a; bestD = d;
    }
    Audio.mech('raise');
    // Silent takedown: an enemy who hasn't seen you (or has their back to you) drops without a sound.
    if (best && best.role !== 'boss' && best.role !== 'heavy') {
      const engaged = best.state === 'combat' && best.target === p && best.targetVisible;
      const facing = new THREE.Vector3(-Math.sin(best.yaw), 0, -Math.cos(best.yaw));
      const toP = p.pos.clone().sub(best.pos).setY(0).normalize();
      const behind = facing.dot(toP) < 0.25;
      if (!engaged && (behind || best.state === 'idle' || best.state === 'patrol' || best.state === 'alert')) {
        best.takeDamage(99999, null, attacker, false, 'melee');
        Audio.impact('flesh', best.chest);
        this.hud?.toast('SILENT TAKEDOWN', 'xp');
        this.hud?.hitmarker(true, false);
        Store.stats.meleeKills++;
        return;
      }
    }
    if (best) {
      best.takeDamage(best.role === 'boss' ? 120 : 250, p.pos, attacker, false, 'melee');
      Audio.impact('flesh', best.chest);
      this.effects.blood(best.chest, fwd);
      this.hud?.hitmarker(!best.alive, false);
      Audio.hitmarker(!best.alive, false);
      if (!best.alive) Store.stats.meleeKills++;
    }
  }

  emitNoise(pos, radius, source) {
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a.pos.distanceTo(pos) < radius) a.onHeard(pos, source);
    }
  }

  onGrenadeWarning(g) {
    for (const a of this.actors) a.onGrenade(g);
    if (g.owner !== this.player && this.player.pos.distanceTo(g.pos) < g.def.radius + 2) this.hud?.grenadeWarning(g);
  }

  callout(actor, text) {
    if (this.calloutCD > 0) return;
    if (actor.pos.distanceTo(this.player.pos) > 30) return;
    this.calloutCD = 3;
    this.hud?.callout(actor.name, text, actor.team === this.player.team);
  }

  onPlayerSpotted(ai) {
    this.mode.onPlayerSpotted?.(ai);
  }

  onKill(killer, victim, weaponId, head) {
    const wname = weaponId === 'melee' ? 'MELEE' : WEAPONS[weaponId]?.name ?? (weaponId ? weaponId.toUpperCase() : '');
    this.hud?.killfeed(killer?.name ?? 'World', victim.name, wname, head, killer === this.player, victim === this.player, killer ? killer.team === this.player.team : false);
    if (killer && killer !== victim) { killer.kills = (killer.kills ?? 0) + 1; }
    if (killer === this.player && victim !== this.player) {
      Store.stats.kills++;
      if (head) Store.stats.headshots++;
      if (weaponId === 'frag' || weaponId === 'semtex' || weaponId === 'c4') Store.stats.grenadeKills++;
      const wk = Store.stats.weaponKills;
      wk[weaponId] = (wk[weaponId] ?? 0) + 1;
      const xp = head ? 150 : 100;
      Store.stats.xp += xp;
      this.hud?.toast(head ? `HEADSHOT  +${xp}` : `KILL  +${xp}`, 'xp');
      Store.saveSoon();
    }
    this.mode.onKill?.(killer, victim, weaponId, head);
    if (!victim.isPlayer) {
      this.bodies.push({ pos: victim.pos.clone(), team: victim.team, t: this.time, actor: victim });
      if (this.bodies.length > 40) this.bodies.shift();
    }
    // Drops.
    if (!victim.isPlayer && victim.team !== this.player.team && this.mode.drops) this._drop(victim);
  }

  onPlayerDeath(attacker) {
    Store.stats.deaths++;
    this.player.deaths++;
    this.onKill(attacker, this.player, attacker?.weaponId ?? null, false);
    this.weapons.ads = 0;
    this.mode.onPlayerDeath?.(attacker);
  }

  // ---------- pickups & interactables ----------
  _drop(victim) {
    const pos = victim.pos.clone();
    if (Math.random() < 0.45) this.addPickup('ammo', pos.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4))));
    if (this.mode.weaponDrops && Math.random() < 0.35 && this.pickups.filter((p) => p.kind === 'weapon').length < 6) {
      this.addPickup('weapon', pos.clone().add(new THREE.Vector3(0.5, 0, 0)), victim.weaponId);
    }
  }

  addPickup(kind, pos, weaponId = null, attachments = null) {
    let mesh;
    if (kind === 'ammo') {
      mesh = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.22), new THREE.MeshStandardMaterial({ color: 0x4f5a34, roughness: 0.8 }));
      box.position.y = 0.09;
      mesh.add(box);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: 0xd4b040, emissive: 0x403000 }));
      strip.position.y = 0.16;
      mesh.add(strip);
    } else if (kind === 'ammoCrate') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x4f5a34, roughness: 0.8 }));
      mesh.position.y = 0.3;
      const g = new THREE.Group();
      g.add(mesh);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.62), new THREE.MeshStandardMaterial({ color: 0xd4b040, emissive: 0x302000 }));
      lid.position.y = 0.6;
      g.add(lid);
      mesh = g;
      this.world.add(pos.x - 0.5, 0, pos.z - 0.3, pos.x + 0.5, 0.6, pos.z + 0.3, 'wood');
    } else {
      mesh = buildLowGun(weaponId);
      mesh.rotation.set(0, Math.random() * 6, Math.PI / 2);
      mesh.position.y = 0.06;
      const g = new THREE.Group();
      g.add(mesh);
      mesh = g;
    }
    mesh.position.x = pos.x; mesh.position.z = pos.z;
    mesh.position.y += this.world.groundHeight(pos.x, pos.z, pos.y + 0.3);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(mesh);
    const p = { kind, pos: mesh.position.clone(), mesh, weaponId, attachments, t: 0 };
    this.pickups.push(p);
    return p;
  }

  /** Hold-E interaction (plant charge, hack terminal...). */
  addInteractable(o) {
    const it = { radius: 2.2, duration: 2, progress: 0, active: true, ...o };
    if (!it.mesh && it.model !== false) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.5, metalness: 0.5 }));
      base.position.y = 0.17;
      g.add(base);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshBasicMaterial({ color: 0x40ff90 }));
      screen.position.set(0, 0.25, 0.181);
      g.add(screen);
      it.light = screen;
      g.position.copy(it.pos);
      this.scene.add(g);
      it.mesh = g;
    }
    this.interactables.push(it);
    return it;
  }

  _updateInteraction(dt) {
    const p = this.player;
    let prompt = null, progress = 0;
    if (!p.alive) { this.hud?.prompt(null); return; }
    // Pickups.
    for (const pk of this.pickups) {
      pk.t += dt;
      if (pk.mesh && pk.kind !== 'ammoCrate') pk.mesh.rotation.y += dt * (pk.kind === 'ammo' ? 1.5 : 0.3);
      const d = Math.hypot(pk.pos.x - p.pos.x, pk.pos.z - p.pos.z);
      if (Math.abs(pk.pos.y - p.pos.y) > 1.5) continue;
      if (pk.kind === 'ammo' && d < 1.2) {
        if (this.weapons.addAmmo(0.25, Math.random() < 0.4)) {
          Audio.mech('magIn');
          this.hud?.toast('+ AMMO');
          pk.dead = true;
        }
      } else if (pk.kind === 'ammoCrate' && d < 2) {
        prompt = 'Press <b>E</b> to resupply ammunition';
        if (this.input.pressed('KeyE')) {
          this.weapons.addAmmo(1, true);
          this.weapons.lethal.count = Math.max(this.weapons.lethal.count, 1);
          Audio.mech('magIn');
          this.hud?.toast('RESUPPLIED');
        }
      } else if (pk.kind === 'weapon' && d < 1.6) {
        const w = WEAPONS[pk.weaponId];
        if (pk.weaponId === this.weapons.weapon.id) {
          if (this.weapons.addAmmo(0.3, false)) { Audio.mech('magIn'); this.hud?.toast('+ AMMO'); pk.dead = true; }
        } else {
          prompt = `Press <b>E</b> to swap for <b>${w.name}</b>`;
          if (this.input.pressed('KeyE')) {
            const old = this.weapons.weapon.id;
            this.weapons.replaceCurrent(pk.weaponId, pk.attachments ?? {});
            pk.dead = true;
            if (WEAPONS[old].class !== 'pistol') this.addPickup('weapon', p.pos.clone(), old);
          }
        }
      }
    }
    for (const pk of this.pickups) if (pk.dead) pk.mesh.removeFromParent();
    this.pickups = this.pickups.filter((pk) => !pk.dead);

    // Interactables (hold E).
    for (const it of this.interactables) {
      if (!it.active) continue;
      if (it.light) it.light.material.color.setHSL(0.38, 1, 0.4 + Math.sin(this.time * 6) * 0.15);
      const d = p.pos.distanceTo(it.pos.clone().setY(p.pos.y));
      if (d > it.radius || Math.abs(it.pos.y - p.pos.y) > 2) { it.progress = Math.max(0, it.progress - dt); continue; }
      prompt = `Hold <b>E</b> to ${it.label}`;
      if (this.input.isDown('KeyE')) {
        it.progress += dt;
        progress = it.progress / it.duration;
        if (it.progress >= it.duration) {
          it.active = false;
          if (it.light) it.light.material.color.set(0x2060ff);
          if (it.removeOnUse && it.mesh) it.mesh.removeFromParent();
          Audio.ui('confirm');
          it.onComplete?.();
          prompt = null;
        }
      } else {
        it.progress = 0;
      }
    }
    if (!prompt && p.vaultPlan && !p.mantle) prompt = `Press <b>SPACE</b> to ${p.vaultPlan.vault ? 'vault over' : 'climb up'}`;
    this.hud?.prompt(prompt, progress);
  }

  // ---------- frame ----------
  update(rawDt) {
    if (this.paused || this.disposed) {
      if (!this.disposed) this.render();
      return;
    }
    const dt = Math.min(rawDt, 1 / 20) * this.slowmo;
    this.dt = dt;
    this.time += dt;
    this.calloutCD -= dt;
    const input = this.input;
    const p = this.player;

    const md = input.consumeMouse();
    this.lastMouse = md;
    const controllable = !this.cinematic && p.alive && !this.mode.frozen && !this.over;
    if (controllable) {
      const s = Store.settings;
      const sens = s.sensitivity * lerp(1, s.adsSensitivity / this.weapons.stats.zoom * 1.2, this.weapons.ads);
      p.look(md.x, md.y, sens);
    }
    if (controllable) {
      this.comms.update(dt, input);
      p.update(dt, input, this.weapons);
      this.weapons.update(dt, input, p);
      if (input.pressed('KeyF')) { this.flashlightOn = !this.flashlightOn; Audio.ui('click'); }
      this._updateInteraction(dt);
      if (this.mode.gadgets?.rappel) this._updateRappelPrompt(input);
      if (this.mode.type === 'campaign') this._updateTagging(dt);
    } else {
      p.update(dt, { isDown: () => false, pressed: () => false, anyDown: () => false, anyPressed: () => false, mouseDown: [], mousePressed: [] }, this.weapons);
      this.hud?.prompt(null);
      this.comms.closeMenu();
    }
    if (input.pressed('KeyN') && p.alive && !this.over) this.setNvg(!this.nvg);
    this.nvgFx.update(dt);
    this.hud?.nvg(this.nvg);
    // With the goggles down the light is an IR illuminator: a wide flood only the
    // goggles can see, so it doesn't give you away.
    const ir = this.nvg;
    this.flashlightVisible = this.flashlightOn && !ir;
    this.flashlight.intensity = this.flashlightOn ? (ir ? (this.nvgFx.amount > 0.5 ? 34 : 0) : 60) : 0;
    this.flashlight.angle = ir ? 0.65 : 0.42;
    this.flashlight.distance = ir ? 75 : 40;
    if (this.nvg && !this._irHint) { this._irHint = true; this.hud?.hint('F: IR illuminator (invisible to enemies)', 5); }
    for (const a of this.actors) {
      a.update(dt);
      const th = this.weapons.stats.thermal && this.weapons.scopeInfo().active;
      a.model.setThermal(th);
    }
    // Stealth meter: how close the nearest unalerted enemy is to spotting the player.
    let det = 0;
    for (const a of this.actors) {
      if (!a.alive || a.mpBot || a.team === p.team) continue;
      if (a.state === 'combat' && a.target === p && a.targetVisible) { det = 1; break; }
      if (a.target === p || a.state === 'idle' || a.state === 'patrol' || a.state === 'alert') det = Math.max(det, Math.min(0.99, a.awareness));
    }
    p.detection = det;
    this.grenades.update(dt);
    for (const sc of this.smokeColumns) this.effects.smokeColumn(sc, dt);
    this.effects.update(dt, this.world);
    this.mode.update(dt);

    // Camera.
    const baseV = this.verticalFov();
    const fov = this.weapons.currentFov(baseV);
    if (this.cinematic) {
      this.cinematic.update(dt, this.camera);
    } else {
      const off = this.weapons.scopeOffset(dt, input, p);
      p.applyCamera(fov, off);
    }
    const camPos = this.camera.getWorldPosition(new THREE.Vector3());
    this.env.update(dt, p.pos, () => Audio.explosion(camPos.clone().add(new THREE.Vector3(rand(-200, 200), 80, rand(-200, 200))), 0.6));
    Audio.setListener(camPos, this.camera.getWorldDirection(new THREE.Vector3()));
    this.weapons.updateLighting(this.env, this.camera);
    if (p.suppressed) p.suppressed = Math.max(0, p.suppressed - dt * 1.5);
    this._updateLasers();
    this._updateRope();
    this._updateWeaponLaser();
    this.hud?.update(this, dt);
    this.render();
  }

  verticalFov() {
    const h = Store.settings.fov * Math.PI / 180;
    const aspect = window.innerWidth / window.innerHeight;
    return 2 * Math.atan(Math.tan(h / 2) / aspect) * 180 / Math.PI;
  }

  /** Flip the night-vision goggles down (on) or up (off). */
  setNvg(on) {
    if (this.nvg === on) return;
    this.nvg = on;
    this.nvgFx.toggle(on);
    Audio.nvg(on);
  }

  render() {
    const r = this.renderer;
    r.autoClear = false;
    const nvg = this.nvgFx?.active;
    if (nvg) r.setRenderTarget(this.nvgFx.rt);
    r.clear();
    r.render(this.scene, this.camera);
    if (!this.cinematic && this.player.alive) {
      r.clearDepth();
      r.render(this.weapons.viewScene, this.weapons.viewCam);
    } else if (this.cinematic?.showHands && this.cinematic.viewScene) {
      r.clearDepth();
      r.render(this.cinematic.viewScene, this.cinematic.viewCam);
    }
    if (nvg) this.nvgFx.present(this.time, this.nvgGain, Store.settings.nvgPhosphor);
    if (this._captureFlash) { this._captureFlash = false; this.hud?.flashAfterimage(r.domElement); }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapons.viewCam.aspect = w / h;
    this.weapons.viewCam.updateProjectionMatrix();
    this.effects.resize(h * this.renderer.getPixelRatio(), this.verticalFov());
    this.nvgFx?.setSize();
  }

  dispose() {
    this.comms?.dispose();
    this.disposed = true;
    this.mode.dispose?.();
    for (const a of this.actors) a.dispose();
    this.actors.length = 0;
    this.grenades.clear();
    this.effects.dispose();
    this.env.dispose();
    this.weapons.dispose();
    this.nvgFx.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.app.setNightVision(false);
    Audio.setAmbience([]);
  }
}
