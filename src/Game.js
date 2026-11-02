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
import { Player } from './player/Player.js';
import { WeaponSystem } from './weapons/WeaponSystem.js';
import { Grenades } from './weapons/Grenades.js';
import { WEAPONS } from './weapons/WeaponData.js';
import { buildLowGun } from './ai/Humanoid.js';
import { Audio } from './core/Audio.js';
import { Store } from './core/Storage.js';
import { clamp, lerp, rand } from './core/Utils.js';

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
    this.nvg = false;
    this.lastMouse = { x: 0, y: 0 };
    this.killfeed = [];
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
    if (this.night && weather === 'rain') this.env.enableLightning();
    this.effects = new Effects(this.scene, q);
    this.grenades = new Grenades(this);
    this.player = new Player(this);
    this.player.damageMult = mode.playerDamageMult ?? 1;
    this.weapons = new WeaponSystem(this, mode.loadout());
    // Flashlight (always present so toggling never recompiles shaders).
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 40, 0.42, 0.5, 1.3);
    this.flashlight.position.set(0.2, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.camera.add(this.flashlight, this.flashlight.target);
    if (this.night || this.mapId === 'blacksite') this.hud?.hint('F: flashlight   N: night vision', 6);
    Audio.setAmbience(mode.ambience ?? this.mapInfo.ambience);
    Audio.setReverb(this.world.indoor ? 0.5 : 0.2);
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
      if (closest.distanceTo(hp) < 1.6 && t > 3) {
        Audio.whiz(closest);
        this.player.suppressed = 1;
      }
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
      return { point: wHit.point, normal: wHit.normal, mat: wHit.mat, t: wHit.t };
    }
    return null;
  }

  explode(pos, def, owner, weaponId = 'frag') {
    this.effects.explosion(pos, def.damage > 180 ? 1.3 : 1);
    Audio.explosion(pos, 1);
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
    this.player.shake = Math.min(1.2, this.player.shake + clamp(1 - pd / 30, 0, 1) * 1.2);
    if (pd < 9) Audio.muffleFor(1.5, 600);
    this.emitNoise(pos, 120, owner);
  }

  flashbang(pos, def, owner) {
    this.effects.flashbang(pos);
    Audio.flashbang(pos);
    const p = this.player;
    const ep = p.eyePos;
    const d = ep.distanceTo(pos);
    if (d < def.radius && this.world.los(pos.clone().setY(pos.y + 0.2), ep, true)) {
      const fwd = p.forward;
      const to = pos.clone().sub(ep).normalize();
      const facing = fwd.dot(to);
      const t = (1 - d / def.radius) * (facing > 0.2 ? 4.5 : 1.8) + 0.6;
      p.flashed = Math.max(p.flashed, t);
      this.flashedMax = Math.max(p.flashed, 0.1);
      Audio.muffleFor(t, 300);
      Audio.tinnitus(t);
    }
    for (const a of this.actors) {
      if (!a.alive) continue;
      const ad = a.eyePos.distanceTo(pos);
      if (ad < def.radius && this.world.los(pos.clone().setY(pos.y + 0.2), a.eyePos, true)) {
        a.flashed(3.5 * (1 - ad / def.radius) + 1);
      }
    }
    this.emitNoise(pos, 50, owner);
  }

  melee(attacker) {
    const p = this.player;
    const fwd = p.forward.setY(0).normalize();
    let best = null, bestD = 2.4;
    for (const a of this.actors) {
      if (!a.alive || !this.hostile(p, a)) continue;
      const to = a.pos.clone().sub(p.pos).setY(0);
      const d = to.length();
      if (d > bestD) continue;
      if (to.normalize().dot(fwd) < 0.55) continue;
      best = a; bestD = d;
    }
    Audio.mech('raise');
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

  addPickup(kind, pos, weaponId = null) {
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
    const p = { kind, pos: mesh.position.clone(), mesh, weaponId, t: 0 };
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
            this.weapons.replaceCurrent(pk.weaponId);
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
      p.update(dt, input, this.weapons);
      this.weapons.update(dt, input, p);
      if (input.pressed('KeyF')) { this.flashlightOn = !this.flashlightOn; Audio.ui('click'); }
      this._updateInteraction(dt);
    } else {
      p.update(dt, { isDown: () => false, pressed: () => false, anyDown: () => false, anyPressed: () => false, mouseDown: [], mousePressed: [] }, this.weapons);
      this.hud?.prompt(null);
    }
    if (input.pressed('KeyN') && p.alive && !this.over) this.setNvg(!this.nvg);
    this.nvgFx.update(dt);
    this.hud?.nvg(this.nvg);
    this.flashlight.intensity = this.flashlightOn ? 60 : 0;
    for (const a of this.actors) {
      a.update(dt);
      const th = this.weapons.stats.thermal && this.weapons.scopeInfo().active;
      a.model.setThermal(th);
    }
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
