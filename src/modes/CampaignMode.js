// Runs a scripted campaign mission: squad, enemy groups, objective chain,
// dialogue, stealth alarms, checkpoints, boss fights, timers and the intro cinematic.
import * as THREE from '../lib/three.js';
import { Squad } from '../ai/Soldier.js';
import { Humanoid } from '../ai/Humanoid.js';
import { spawnSoldier, snapGround, Cinematic, introKeys, ShotSequence, shotKeys } from './Common.js';
import { MISSIONS } from '../campaign/Story.js';
import { Insertion } from './Insertion.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { formatTime } from '../core/Utils.js';
import { Armory } from '../ui/Armory.js';
import { buildObjectiveProp, buildDoor } from '../world/ObjectiveProps.js';
import { rankOf } from '../core/Ranks.js';

const DEATH_QUOTES = [
  ['"The more you sweat in training, the less you bleed in combat."', 'Military proverb'],
  ['"No plan survives first contact with the enemy."', 'Helmuth von Moltke'],
  ['"Move fast, shoot straight, and use cover. In that order — or any order."', 'ORION field manual'],
  ['"Courage is fear holding on a minute longer."', 'George S. Patton'],
  ['"In war, the moral is to the physical as three is to one."', 'Napoleon Bonaparte'],
  ['"Smoke is cheaper than blood."', 'Sgt. D. Sorokin'],
];

export class CampaignMode {
  constructor(missionIndex, difficulty) {
    this.index = missionIndex;
    this.mission = MISSIONS[missionIndex];
    this.difficulty = difficulty;
    this.mapId = this.mission.map;
    this.lighting = this.mission.lighting;
    this.weather = this.mission.weather;
    this.drops = true;
    this.weaponDrops = true;
    this.type = 'campaign';
    this.gadgets = { rappel: true }; // spy kit: rappel rope for going down off roofs
    this.markers = [];
    this.groups = {};
    this.objIndex = -1;
    this.alarmed = false;
    this.kills = 0;
    this.elapsed = 0;
    this.timers = [];
    this.frozen = false;
    this.sleeveColor = 0x5a5a40;
    this.grenadeDamageMult = { recruit: 0.4, regular: 0.6, hardened: 0.8, veteran: 1 }[difficulty] ?? 0.6;
    this.smokeColumns = (this.mission.smoke ?? []).map(([x, z]) => new THREE.Vector3(x, 0.5, z));
  }

  loadout() {
    // What you drew from the armory, or the mission's issued kit until then.
    const lo = this.chosen ?? this.mission.loadout;
    return { ...lo, attachments: lo.attachments ?? {} };
  }

  beforeMap(b) {
    const m = this.mission;
    if (m.crash) {
      const [x, z] = m.crash;
      b.box(x, 0, z, 3.2, 2.4, 9, 'burnt');
      b.box(x + 0.5, 0.8, z + 7, 0.8, 0.8, 7, 'burnt', false);
      b.box(x + 0.5, 0.8, z + 10.5, 0.2, 2.2, 1.4, 'burnt', false);
      b.mesh(new THREE.BoxGeometry(0.3, 0.06, 11), 'black', x - 1, 2.6, z + 1, 0.6, 0, 0.15);
      b.mesh(new THREE.BoxGeometry(0.3, 0.06, 9), 'black', x + 2, 0.4, z - 4, -0.9, 0.2, 0);
      b.sandbags(x - 6, z - 8, 4, 'x');
      b.sandbags(x + 6, z + 2, 4, 'z');
    }
    // Mission-specific set pieces (sniper perches, rooftop access, outcrops).
    m.build?.(b);
  }

  setup(game) {
    this.game = game;
    const m = this.mission;
    const p = game.player;
    // Raised starts ([x, y, z]) put you on a perch; otherwise snap to the nav grid.
    const sp = m.start.pos.length === 3 ? new THREE.Vector3(m.start.pos[0], m.start.pos[1], m.start.pos[2]) : snapGround(game.world, m.start.pos[0], m.start.pos[1]);
    p.spawn(sp.x, sp.y, sp.z, m.start.yaw);
    p.invulnerable = 0;
    this.checkpoint = { pos: sp.clone(), yaw: m.start.yaw };
    this.squad = [];
    this.props = [];
    this.squadLeash = m.squadLeash; // close-quarters ops keep the squad tight
    m.squad.forEach((s, i) => this._spawnFriend(s, i));
    for (const [id, g] of Object.entries(m.groups)) {
      this.groups[id] = { def: g, spawned: false, units: [], squad: new Squad(id) };
      if (g.spawnOn === undefined) this._spawnGroup(id);
    }
    // Props tied to objectives.
    for (const o of m.objectives) {
      if (o.aa) o.prop = this._aaGun(new THREE.Vector3(o.target[0], 0, o.target[2]));
      if (o.vasko) {
        const v = new Humanoid('meridian', 'p11');
        v.root.position.set(o.target[0], 0, o.target[2] + 1.5);
        v.root.rotation.y = 0;
        v.update(0.1, 0, 1, 0, false);
        v.gun.visible = false;
        game.scene.add(v.root);
        this.vaskoModel = v;
      }
    }
    if (m.timer) this.timeLeft = m.timer;
    // Locked doors (picked open by an objective) and civilians held in the building.
    this.doors = {};
    for (const [id, spec] of Object.entries(m.doors ?? {})) this.doors[id] = buildDoor(game, spec);
    this.civilians = (m.civilians ?? []).map((c) => {
      const h = new Humanoid('civilian', 'p11', { seed: Math.round(c.pos[0] * 31 + c.pos[1] * 17) });
      h.root.position.set(c.pos[0], 0, c.pos[1]);
      h.root.rotation.y = c.yaw ?? 0;
      h.setCaptive(c.pose ?? 'back');
      game.scene.add(h.root);
      return { model: h, crouch: 1, freed: false, yaw: c.yaw ?? 0 };
    });
    // Weapon caches (e.g. a suppressed rifle left on a rooftop by an asset).
    for (const c of m.caches ?? []) game.addPickup('weapon', new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]), c.weapon, c.attachments ?? null);
    // Intro cinematic, then hand control to the player.
    const firstTarget = m.objectives[0].target;
    const focus = firstTarget ? new THREE.Vector3(firstTarget[0], 0, firstTarget.length === 3 ? firstTarget[2] : firstTarget[1]) : null;
    this.frozen = true;
    if (m.insertion) {
      // Ride in on a helicopter and fast-rope onto the LZ.
      const ins = m.insertion;
      this.insertion = new Insertion(game, {
        lz: new THREE.Vector3(ins.lz[0], 0, ins.lz[1]),
        from: new THREE.Vector3(ins.from[0], 0, ins.from[1]),
        hover: ins.hover ?? 13,
        squad: this.squad,
        lines: ins.lines,
        onLanded: () => {
          this.checkpoint = { pos: game.player.pos.clone(), yaw: game.player.yaw };
          game.hud.insertion(false);
          this._beginPlay();
        },
      });
      game.cinematic = this.insertion;
      game.hud.insertion(true);
      // Pick your weapons off the cabin rack before the run in.
      this.insertion.holdFlight = true;
      this.armory = new Armory(game, m, 'heli', (lo) => { this.chosen = lo; this.armory = null; this.insertion.holdFlight = false; });
    } else {
      game.cinematic = new Cinematic(introKeys(sp, m.start.yaw, focus), 8, () => this._gearUp());
      game.hud.letterbox(true);
    }
    game.hud.locationCard([m.title.toUpperCase(), m.location, m.time, 'Sgt. Elias "Wraith" Cole — Task Force ORION']);
    Audio.playMusic('tension');
  }

  /** On-foot starts: gear up from the armory after the intro, then go. */
  _gearUp() {
    const g = this.game;
    g.cinematic = null;
    g.hud.letterbox(false);
    // Nobody spots or shoots you while you are at the rack.
    g.stealthGrace = g.time + 9999;
    g.player.invulnerable = 9999;
    this.armory = new Armory(g, this.mission, 'ground', (lo) => {
      this.chosen = lo;
      this.armory = null;
      g.player.invulnerable = 1;
      this._beginPlay();
    });
  }

  skipCinematic() {
    this.armory?.confirm();
    const c = this.game.cinematic;
    if (c?.skip) c.skip(); else c?.finish();
  }

  _beginPlay() {
    const g = this.game;
    g.cinematic = null;
    g.hud.letterbox(false);
    g.hud.fadeLocation(2.5);
    g.stealthGrace = g.time + 6; // a moment to get your bearings before anyone can spot you
    this.frozen = false;
    Audio.playMusic('none');
    g.hud.hint(this.mission.kitHint ?? 'T at a roof edge: rappel down  ·  SPACE at a ledge: climb  ·  V from behind: silent takedown  ·  aim at enemies to tag them', 8);
    this._nextObjective();
  }

  // ---------- mid-mission clips ----------
  _playCutscene(o) {
    const g = this.game;
    this.frozen = true;
    this.inClip = true;
    g.player.invulnerable = 999;
    g.stealthGrace = g.time + 999;
    g.weapons.cancelAds?.();
    g.hud.clearSubs();
    const shots = o.shots.map((sh) => ({
      // Hold each shot at least as long as its lines take to read.
      keys: shotKeys(sh), dur: Math.max(sh.dur ?? 4, (sh.say ?? []).reduce((t, l) => t + 1.6 + l.text.length * 0.055, 0) - 0.3),
      onStart: () => {
        if (sh.say) { g.hud.clearSubs(); g.hud.say(sh.say); }
        for (const id of sh.spawn ?? []) this._spawnGroup(id);
      },
    }));
    if (o.say) g.hud.say(o.say);
    if (o.music) Audio.playMusic(o.music);
    g.cinematic = new ShotSequence(shots, () => this._endCutscene(o));
    g.hud.letterbox(true);
  }

  _endCutscene(o) {
    const g = this.game;
    g.cinematic = null;
    g.hud.letterbox(false);
    this.frozen = false;
    this.inClip = false;
    g.player.invulnerable = 1.5;
    g.stealthGrace = g.time + 2.5;
    this._complete();
  }

  /** A guard found a body. On a stealth op he raises the alarm unless he's silenced quickly. */
  onBodyFound(finder) {
    if (!this.mission.stealth || this.alarmed || this.inClip) return;
    this.game.hud.toast('BODY DISCOVERED', 'warn');
    this.timers.push({ t: 4.5, fn: () => { if (finder.alive && !this.alarmed) { this.game.hud.toast('ALARM RAISED', 'warn'); this.alarm(); } } });
  }

  _spawnFriend(s, i) {
    const g = this.game;
    const p = g.player;
    const off = new THREE.Vector3(-2 + i * 2, 0, 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
    const unit = spawnSoldier(g, {
      pos: [p.pos.x + off.x, p.pos.z + off.z], yaw: p.yaw, team: 'a', friendly: true, storyChar: true, name: s.name,
      weapon: s.weapon, difficulty: 'hardened', followIndex: i, faction: 'orion', suppressed: s.suppressed,
    });
    unit.outMult = 0.5;
    this.squad.push(unit);
    return unit;
  }

  _spawnGroup(id) {
    const grp = this.groups[id];
    if (!grp || grp.spawned) return;
    grp.spawned = true;
    const g = this.game;
    const faction = this.mapId === 'snowfall' ? 'snowEnemy' : this.mapId === 'desert' && !this.mission.lighting?.includes('night') ? 'desertEnemy' : 'meridian';
    for (const u of grp.def.units) {
      const unit = spawnSoldier(g, {
        pos: u.pos, team: 'b', name: u.name ?? 'MERIDIAN', role: u.role ?? 'rifleman', weapon: u.weapon,
        difficulty: this.difficulty, patrol: u.patrol ? g.builder.patrols[u.patrol] : null, squad: grp.squad,
        stationary: u.stationary, hunter: grp.def.hunter, health: u.health ? Math.round(u.health * ({ recruit: 0.7, regular: 1, hardened: 1.2, veteran: 1.4 }[this.difficulty] ?? 1)) : undefined,
        faction, yaw: Math.random() * Math.PI * 2,
      });
      if (grp.def.hunter) {
        unit.state = 'hunt';
      }
      grp.units.push(unit);
      if (unit.role === 'boss') this.boss = unit;
    }
  }

  _spawnTrigger(key) {
    for (const [id, grp] of Object.entries(this.groups)) {
      if (grp.def.spawnOn === key) this._spawnGroup(id);
    }
  }

  get objective() { return this.mission.objectives[this.objIndex]; }

  _complete() {
    const o = this.objective;
    if (o.doneSay) this.game.hud.say(o.doneSay);
    if (o.freeCivilians) for (const c of this.civilians) { c.freed = true; c.model.setCaptive('side'); }
    if (o.stopTimer && this.timeLeft !== undefined) { this.timeLeft = undefined; this.game.hud.el.timer.hidden = true; }
    if (o.stopTimer) this.hostagesSafe = true;
    for (const a of o.onComplete ?? []) this._action(a);
    if (o.interact) o.interact.active = false;
    if (o.type !== 'cutscene') {
      Audio.ui('objective');
      this.game.hud.objectiveDone(o.text);
    }
    // Checkpoint.
    this.checkpoint = { pos: this.game.player.pos.clone(), yaw: this.game.player.yaw };
    this._nextObjective();
  }

  _action(a) {
    if (a === 'alarm') this.alarm();
    if (a === 'joinReyes') this._spawnFriend({ name: 'Reyes', weapon: 'vx4' }, this.squad.length);
  }

  alarm(spotter) {
    if (this.alarmed) return;
    this.alarmed = true;
    const m = this.mission;
    // Hostage ops: once they know you're here, the clock starts on the hostages.
    if (m.alarmTimer && !this.hostagesSafe && this.timeLeft === undefined) this.timeLeft = m.alarmTimer;
    if (m.alarmGroup) this._spawnTrigger('alarm');
    if (spotter) {
      this.game.hud.toast('YOU HAVE BEEN SPOTTED', 'warn');
      Audio.ui('alert');
      this.game.hud.say([{ who: 'REYES', text: 'We\'re blown! Weapons free!' }]);
    }
    // Everyone nearby becomes alert.
    for (const a of this.game.actors) {
      if (a.alive && a.team === 'b' && a.state !== 'combat' && a.pos.distanceTo(this.game.player.pos) < 60) {
        a.onHeard(this.game.player.pos.clone(), this.game.player);
      }
    }
  }

  onPlayerSpotted(ai) {
    if (this.mission.stealth && !this.alarmed) this.alarm(ai);
  }

  _nextObjective() {
    this.objIndex++;
    const m = this.mission;
    if (this.objIndex >= m.objectives.length) {
      this._missionComplete();
      return;
    }
    const o = this.objective;
    // Numbered spawn triggers count real objectives only (clips don't shift them).
    if (o.type !== 'cutscene') { this.realIndex = (this.realIndex ?? -1) + 1; this._spawnTrigger(this.realIndex); }
    if (o.id) this._spawnTrigger(o.id);
    if (o.type === 'cutscene') { this._playCutscene(o); return; }
    if (o.say) this.game.hud.say(o.say);
    // Squad drills: stack up on a door (hold crouched at given spots), or flow in behind you.
    if (o.stack) {
      this.squad.forEach((s, i) => {
        const st = o.stack[i % o.stack.length];
        s.command('hold', new THREE.Vector3(st[0], 0, st[1]), o.stackYaw ?? 0);
        if (s.order) s.order.exact = true;
      });
    }
    if (o.squadFollow) for (const s of this.squad) s.order = null;
    this.game.hud.objective(o.text);
    o.started = this.elapsed;
    o.waveDone = new Set();
    if (o.type === 'interact') {
      const pos = new THREE.Vector3(o.target[0], o.target[1], o.target[2]);
      // The real thing to work on (laptop, charge, hostage, prisoner...) and the hands doing it.
      if (o.vasko) o.model = this.vaskoModel;
      if (o.door) o.doorRef = this.doors[o.door];
      const toward = this.game.player.pos.clone().sub(pos).setY(0).normalize();
      const prop = buildObjectiveProp(this.game, o, pos, toward);
      o.actionProp = prop;
      this.props.push(prop);
      // Range is measured from where the work actually is (a prop may sit off the
      // scripted point, e.g. a man pulled clear of a wreck).
      const at = new THREE.Vector3(prop.work.x, pos.y, prop.work.z);
      o.interact = this.game.addInteractable({
        pos: at, label: o.label, duration: o.duration, model: false, prop, onComplete: () => {
          prop.complete();
          if (o.aa) this._destroyAA(o);
          this._complete();
        },
      });
      prop._it = o.interact;
    }
    if (o.type === 'eliminate' || o.type === 'boss') {
      for (const id of o.groups ?? [o.group]) this._spawnGroup(id);
    }
    if (o.type === 'defend') o.progress = 0;
    if (o.type === 'boss') {
      this.boss = this.groups[o.group].units.find((u) => u.role === 'boss');
    }
  }

  _aaGun(pos) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 0.7, metalness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.6, 12), mat);
    base.position.y = 0.3;
    g.add(base);
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.2), mat);
    turret.position.y = 1.05;
    g.add(turret);
    for (const s of [-0.35, 0.35]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), dark);
      b.position.set(s, 1.9, -0.7);
      b.rotation.x = -0.9;
      g.add(b);
    }
    g.position.copy(pos);
    g.position.z += 1.4;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(g);
    this.game.world.add(pos.x - 1.1, 0, pos.z + 0.3, pos.x + 1.1, 1.5, pos.z + 2.5, 'metal');
    return g;
  }

  _destroyAA(o) {
    const pos = new THREE.Vector3(o.target[0], 0.5, o.target[2] + 1.4);
    this.timers.push({
      t: 2.5, fn: () => {
        o.actionProp?.detonate?.();
        this.game.effects.explosion(pos, 1.6);
        Audio.explosion(pos, 1.4);
        this.game.player.shake = Math.min(1.2, this.game.player.shake + 0.6);
        o.prop.traverse((m) => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 }); });
        o.prop.rotation.z = 0.25;
        this.game.smokeColumns.push(pos.clone());
      },
    });
  }

  update(dt) {
    const g = this.game;
    // Helicopter keeps flying (squad roping, departure) after the player is down.
    if (this.insertion && g.cinematic !== this.insertion) this.insertion.tick(dt);
    // The armory takes the keys first, so locking in does not also skip the flight.
    this.armory?.update(dt, g.input);
    for (const d of Object.values(this.doors ?? {})) { d.update(dt); d.block(g.player); }
    for (const c of this.civilians ?? []) {
      if (c.freed) c.crouch = Math.max(0, c.crouch - dt * 1.2);
      c.model.update(dt, 0, c.crouch, 0, false);
    }
    // Objective props animate (screens, LEDs, people) whether or not you are at them.
    for (const pr of this.props ?? []) {
      const it = pr._it;
      const k = !it ? 0 : !it.active ? 1 : Math.min(1, it.progress / it.duration);
      pr.update(dt, k, !!(it && g.action?.it === it && g.action.on), g.time);
    }
    if (this.frozen) {
      if (g.cinematic && (g.input.pressed('Space') || g.input.pressed('Enter') || g.input.mousePressed[0])) this.skipCinematic();
      this.markers = [];
      return;
    }
    if (this.done) return;
    this.elapsed += dt;
    for (const t of this.timers) { t.t -= dt; if (t.t <= 0 && !t.fired) { t.fired = true; t.fn(); } }
    this.timers = this.timers.filter((t) => !t.fired);

    if (this.timeLeft !== undefined) {
      this.timeLeft -= dt;
      g.hud.timer(`${this.mission.timerText ?? 'TIME'}  ${formatTime(this.timeLeft)}`, this.timeLeft < 60);
      if (this.timeLeft <= 0) {
        const [ft, fr] = this.mission.timerFail ?? ['HALCYON has launched.', 'The uplink went live before ORION could stop it.'];
        this._fail(ft, fr);
        return;
      }
    }

    const o = this.objective;
    if (!o) return;
    const p = g.player;
    const markers = [];
    const tpos = o.target ? new THREE.Vector3(o.target[0], o.target.length === 3 ? o.target[1] : 0, o.target.length === 3 ? o.target[2] : o.target[1]) : null;
    let sub = '';
    switch (o.type) {
      case 'goto':
      case 'extract': {
        markers.push({ pos: tpos, label: o.type === 'extract' ? 'EXFIL' : 'GO', kind: 'goto' });
        for (const [hx, hz, hl] of o.hints ?? []) markers.push({ pos: new THREE.Vector3(hx, 1.2, hz), label: hl, kind: 'interact' });
        const d = Math.hypot(p.pos.x - tpos.x, p.pos.z - tpos.z);
        // Rooftop goals: you actually have to be up there.
        if (o.minY !== undefined) sub = p.pos.y >= o.minY ? '' : (o.hintSub ?? 'Find a way up: stairs, or climb [SPACE] onto ledges');
        if (d < o.radius && p.alive && (o.minY === undefined || p.pos.y >= o.minY) && !p.climbing) this._complete();
        break;
      }
      case 'interact': {
        const ip = o.interact?.pos ?? tpos;
        markers.push({ pos: ip.clone().setY(ip.y + 0.6), label: 'INTERACT', kind: 'interact' });
        break;
      }
      case 'eliminate': {
        const left = this._remaining(o.groups);
        sub = `Hostiles remaining: ${left.length}`;
        if (left.length <= 3) for (const u of left) markers.push({ pos: u.pos.clone().setY(u.pos.y + 2.1), label: '', kind: 'enemy', actor: u });
        if (left.length === 0) this._complete();
        break;
      }
      case 'defend': {
        markers.push({ pos: tpos, label: 'DEFEND', kind: 'defend' });
        const inside = Math.hypot(p.pos.x - tpos.x, p.pos.z - tpos.z) < o.radius;
        if (inside) o.progress += dt;
        for (const w of o.waves ?? []) {
          if (o.progress >= w.at && !o.waveDone.has(w.spawn)) { o.waveDone.add(w.spawn); this._spawnTrigger(w.spawn); Audio.ui('alert'); g.hud.toast('ENEMY REINFORCEMENTS', 'warn'); }
        }
        sub = inside ? `Hold for ${formatTime(o.time - o.progress)}` : 'Return to the defense area!';
        if (o.progress >= o.time) this._complete();
        break;
      }
      case 'boss': {
        const b = this.boss;
        const t = this.elapsed - o.started;
        for (const w of o.waves ?? []) {
          if (t >= w.at && !o.waveDone.has(w.spawn)) { o.waveDone.add(w.spawn); this._spawnTrigger(w.spawn); }
        }
        if (b) {
          g.hud.bossBar(o.bossName, b.health / b.maxHealth);
          if (b.alive) markers.push({ pos: b.pos.clone().setY(b.pos.y + 2.4), label: 'KILL', kind: 'enemy', actor: b });
          if (!b.alive) { g.hud.bossBar(null); this._complete(); }
        }
        break;
      }
      default:
        break;
    }
    g.hud.objectiveSub(sub);
    this.markers = markers;
  }

  _remaining(groupIds) {
    const out = [];
    for (const id of groupIds) {
      const grp = this.groups[id];
      if (!grp) continue;
      for (const u of grp.units) if (u.alive) out.push(u);
    }
    return out;
  }

  onKill(killer, victim) {
    if (killer === this.game.player && victim.team === 'b') this.kills++;
  }

  onPlayerDeath() {
    if (this.done) return;
    const [q, a] = DEATH_QUOTES[Math.floor(Math.random() * DEATH_QUOTES.length)];
    setTimeout(() => {
      if (!this.game || this.game.disposed) return;
      this.game.app.showDeath({
        title: 'MISSION FAILED',
        reason: 'You were killed in action.',
        quote: q, author: a,
        checkpoint: () => this.respawnAtCheckpoint(),
      });
    }, 1600);
  }

  _fail(title, reason) {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    g.over = true;
    g.app.showDeath({ title: 'MISSION FAILED', reason: `${title} ${reason}`, quote: '"There is no second place in a gunfight."', author: 'Unknown', checkpoint: null });
  }

  respawnAtCheckpoint() {
    const g = this.game;
    const c = this.checkpoint;
    g.player.spawn(c.pos.x, c.pos.y, c.pos.z, c.yaw);
    g.player.invulnerable = 3;
    g.stealthGrace = g.time + 3;
    g.weapons.addAmmo(1, true);
    for (const s of this.squad) {
      if (s.pos.distanceTo(c.pos) > 15) s.pos.copy(snapGround(g.world, c.pos.x + 2, c.pos.z + 2));
      s.health = s.maxHealth;
    }
    // Enemies lose track of the player.
    for (const a of g.actors) {
      if (a.team === 'b' && a.alive && a.target === g.player) { a.targetVisible = false; a.lastSeenT = g.time - 6; }
    }
    if (this.timeLeft !== undefined) this.timeLeft = Math.max(this.timeLeft, 120);
  }

  _missionComplete() {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    const m = this.mission;
    Store.stats.missionsCompleted++;
    // Mission XP (more on harder difficulties): rank unlocks better guns in the armory.
    const before = rankOf(Store.stats.xp);
    const xp = Math.round(1500 * ({ recruit: 0.7, regular: 1, hardened: 1.4, veteran: 1.8 }[this.difficulty] ?? 1));
    Store.stats.xp += xp;
    const after = rankOf(Store.stats.xp);
    const camp = Store.campaign;
    camp.completed[m.id] = camp.completed[m.id] ? Math.max(camp.completed[m.id], diffRank(this.difficulty)) : diffRank(this.difficulty);
    camp.unlocked = Math.max(camp.unlocked, Math.min(MISSIONS.length, this.index + 2));
    const best = camp.bestTimes[m.id];
    if (!best || this.elapsed < best) camp.bestTimes[m.id] = Math.round(this.elapsed);
    Store.save();
    g.over = true;
    Audio.playMusic('victory');
    setTimeout(() => {
      g.app.missionComplete({
        mission: m, index: this.index, time: this.elapsed, kills: this.kills, deaths: g.player.deaths,
        difficulty: this.difficulty, xp, rankUp: after.index > before.index ? after.name : null,
      });
    }, m.finale ? 3500 : 2200);
    g.hud.say(m.finale ? [] : [{ who: 'WATCHTOWER', text: 'Objective complete. Good work, ORION.' }]);
  }

  hudInfo() { return null; }

  dispose() {
    this.armory?.dispose();
    for (const pr of this.props ?? []) pr.dispose();
    for (const d of Object.values(this.doors ?? {})) d.dispose();
    for (const c of this.civilians ?? []) c.model.root.removeFromParent();
    this.insertion?.dispose();
    this.vaskoModel?.dispose();
  }
}

function diffRank(d) {
  return { recruit: 1, regular: 2, hardened: 3, veteran: 4 }[d] ?? 1;
}
