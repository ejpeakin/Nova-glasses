// Multiplayer-style modes played against AI bots: Team Deathmatch, Free For All,
// Domination (three capture points) and Survival (escalating waves).
import * as THREE from '../lib/three.js';
import { PRIMARIES, WEAPONS } from '../weapons/WeaponData.js';
import { spawnSoldier, snapGround, savedLoadout, CALLSIGNS } from './Common.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { pick, rand, formatTime, clamp } from '../core/Utils.js';

export const MODE_INFO = {
  tdm: { name: 'Team Deathmatch', short: 'TDM', desc: 'Two teams of six. First team to the score limit wins.', limits: [30, 50, 75], defLimit: 50, bots: 11 },
  ffa: { name: 'Free For All', short: 'FFA', desc: 'Every operator for themselves. First to the kill limit wins.', limits: [15, 25, 40], defLimit: 25, bots: 7 },
  dom: { name: 'Domination', short: 'DOM', desc: 'Capture and hold flags A, B and C. Each held flag scores every second.', limits: [150, 200, 300], defLimit: 200, bots: 11 },
  survival: { name: 'Survival', short: 'SURV', desc: 'Hold out against endless, escalating waves of MERIDIAN forces.', limits: [], defLimit: 0, bots: 0 },
};

const TEAM_NAMES = { a: 'ORION', b: 'MERIDIAN' };

class BaseMatch {
  constructor(cfg) {
    this.cfg = cfg;
    this.type = cfg.mode;
    this.mapId = cfg.map;
    this.markers = [];
    this.records = []; // scoreboard rows
    this.time = cfg.timeLimit ?? 600;
    this.done = false;
    this.playerRespawn = 0;
    this.drops = false;
    this.sleeveColor = 0x4d5340;
    this.grenadeDamageMult = 0.8;
  }

  loadout() { return savedLoadout(); }

  _rec(name, team, isPlayer = false) {
    const r = { name, team, kills: 0, deaths: 0, score: 0, isPlayer, unit: null, respawnAt: 0 };
    this.records.push(r);
    return r;
  }

  _spawnPoints(team) {
    const b = this.game.builder;
    if (this.type === 'ffa' || this.type === 'survival') return b.spawns.ffa;
    // Mix team spawns with neutral ones once the match is going.
    return this.elapsed > 20 ? [...b.spawns[team], ...b.spawns.ffa] : b.spawns[team];
  }

  _safeSpawn(team, forUnit) {
    const pts = this._spawnPoints(team);
    const enemies = [];
    const g = this.game;
    if (g.player.alive && g.hostile(forUnit, g.player)) enemies.push(g.player.pos);
    for (const a of g.actors) if (a.alive && g.hostile(forUnit, a)) enemies.push(a.pos);
    let best = null, bestScore = -Infinity;
    for (const s of pts) {
      let minD = 999;
      for (const e of enemies) minD = Math.min(minD, Math.hypot(e.x - s.x, e.z - s.z));
      const score = Math.min(minD, 45) + rand(0, 12);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    const p = snapGround(g.world, best.x + rand(-1.5, 1.5), best.z + rand(-1.5, 1.5));
    return { pos: p, yaw: best.yaw ?? rand(0, Math.PI * 2) };
  }

  _spawnBot(rec, idx) {
    const g = this.game;
    const sp = this._safeSpawn(rec.team, { team: rec.team });
    // Your own team (ORION) all carry the RK-74, the AK-47 pattern rifle; the enemy picks any gun.
    const weapon = rec.weapon ?? (rec.team === 'a' && this.type !== 'ffa' ? 'rk74' : pick(PRIMARIES));
    rec.weapon = weapon;
    const u = spawnSoldier(g, {
      pos: sp.pos, yaw: sp.yaw, team: rec.team, name: rec.name, mpBot: true, hunter: true,
      weapon, difficulty: this.cfg.botDifficulty ?? 'regular',
      faction: rec.team === 'a' ? 'orion' : 'meridian', colorIndex: this.type === 'ffa' ? idx : undefined,
    });
    u.record = rec;
    rec.unit = u;
    return u;
  }

  _respawnPlayer() {
    const g = this.game;
    const sp = this._safeSpawn(g.player.team, g.player);
    g.player.spawn(sp.pos.x, 0, sp.pos.z, sp.yaw);
    g.weapons.setLoadout(this.loadout());
    g.hud.deathCard(null);
  }

  setupCommon(game) {
    this.game = game;
    this.elapsed = 0;
    const p = game.player;
    p.name = 'You';
    this.playerRec = this._rec('You', p.team, true);
  }

  onPlayerDeath(attacker) {
    this.playerRespawn = 4;
    this.game.hud.deathCard(attacker ? `KILLED BY ${attacker.name.toUpperCase()}` : 'YOU DIED', attacker?.weaponId ? WEAPONS[attacker.weaponId]?.name : '');
  }

  onKill(killer, victim) {
    const kr = killer === this.game.player ? this.playerRec : killer?.record;
    const vr = victim === this.game.player ? this.playerRec : victim.record;
    if (vr) vr.deaths++;
    if (kr && killer !== victim && this.game.hostile(killer, victim)) {
      kr.kills++;
      kr.score += 100;
      this.scoreKill?.(kr, vr);
    }
  }

  _updateRespawns(dt) {
    const g = this.game;
    if (!g.player.alive && this.playerRespawn > 0) {
      this.playerRespawn -= dt;
      g.hud.deathTimer(Math.ceil(this.playerRespawn));
      if (this.playerRespawn <= 0) this._respawnPlayer();
    }
    for (const r of this.records) {
      if (r.isPlayer || !r.unit) continue;
      if (!r.unit.alive) {
        if (!r.respawnAt) r.respawnAt = this.elapsed + 4;
        if (this.elapsed >= r.respawnAt) {
          r.respawnAt = 0;
          g.removeActor(r.unit);
          this._spawnBot(r, this.records.indexOf(r));
        }
      }
    }
  }

  _finish(won, title) {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    g.over = true;
    Store.stats.matchesPlayed++;
    if (won) Store.stats.matchesWon++;
    Store.stats.xp += won ? 1000 : 400;
    Store.save();
    Audio.playMusic(won ? 'victory' : 'menu');
    g.hud.toast(title, won ? 'xp' : 'warn');
    setTimeout(() => g.app.matchComplete({ won, title, mode: this.type, map: this.mapId, rows: this.scoreboard(), teamScores: this.teamScores, player: this.playerRec, extra: this.resultExtra?.() }), 2500);
  }

  scoreboard() {
    return [...this.records].sort((a, b) => b.score - a.score || b.kills - a.kills);
  }

  /** Default bot objective: hunt towards enemies with some wandering. */
  botGoal(bot) {
    const g = this.game;
    const foes = g.hostilesOf(bot);
    if (foes.length && Math.random() < 0.65) {
      // Head toward the nearest few enemies (they "hear" the fight).
      foes.sort((a, b) => a.pos.distanceTo(bot.pos) - b.pos.distanceTo(bot.pos));
      const f = foes[Math.floor(Math.random() * Math.min(3, foes.length))];
      return f.pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6)));
    }
    const s = pick(g.builder.spawns.ffa);
    return new THREE.Vector3(s.x, 0, s.z);
  }
}

// ---------------------------------------------------------------------------

export class TeamDeathmatch extends BaseMatch {
  setup(game) {
    this.setupCommon(game);
    this.limit = this.cfg.scoreLimit ?? 50;
    this.teamScores = { a: 0, b: 0 };
    const total = (this.cfg.bots ?? 11) + 1;
    const names = [...CALLSIGNS].sort(() => Math.random() - 0.5);
    let n = 0;
    for (let i = 1; i < total; i++) {
      const team = i % 2 === 1 ? 'b' : 'a';
      const rec = this._rec(names[n++ % names.length], team);
      this._spawnBot(rec, i);
    }
    const sp = this._safeSpawn('a', game.player);
    game.player.spawn(sp.pos.x, 0, sp.pos.z, sp.yaw);
    game.hud.bigMessage('TEAM DEATHMATCH', `First team to ${this.limit} kills`);
    Audio.ui('alert');
  }

  scoreKill(kr) {
    this.teamScores[kr.team]++;
    if (this.teamScores[kr.team] >= this.limit) {
      this._finish(kr.team === 'a', kr.team === 'a' ? 'VICTORY' : 'DEFEAT');
    }
  }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.time -= dt;
    this._updateRespawns(dt);
    if (this.time <= 0) {
      const { a, b } = this.teamScores;
      this._finish(a > b, a > b ? 'VICTORY' : a === b ? 'DRAW' : 'DEFEAT');
    }
  }

  hudInfo() {
    return { kind: 'teams', a: this.teamScores.a, b: this.teamScores.b, limit: this.limit, time: formatTime(this.time), names: TEAM_NAMES };
  }
}

// ---------------------------------------------------------------------------

export class FreeForAll extends BaseMatch {
  setup(game) {
    this.setupCommon(game);
    this.limit = this.cfg.scoreLimit ?? 25;
    game.player.team = 'p0';
    this.playerRec.team = 'p0';
    const names = [...CALLSIGNS].sort(() => Math.random() - 0.5);
    for (let i = 1; i <= (this.cfg.bots ?? 7); i++) {
      const rec = this._rec(names[i % names.length], `p${i}`);
      this._spawnBot(rec, i);
    }
    const sp = this._safeSpawn('p0', game.player);
    game.player.spawn(sp.pos.x, 0, sp.pos.z, sp.yaw);
    game.hud.bigMessage('FREE FOR ALL', `First to ${this.limit} kills`);
    Audio.ui('alert');
  }

  scoreKill(kr) {
    if (kr.kills >= this.limit) this._finish(kr.isPlayer, kr.isPlayer ? 'VICTORY — 1ST PLACE' : `${kr.name.toUpperCase()} WINS`);
  }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.time -= dt;
    this._updateRespawns(dt);
    if (this.time <= 0) {
      const top = this.scoreboard()[0];
      this._finish(top.isPlayer, top.isPlayer ? 'VICTORY — 1ST PLACE' : `${top.name.toUpperCase()} WINS`);
    }
  }

  hudInfo() {
    const sb = this.scoreboard();
    const leader = sb[0];
    const place = sb.indexOf(this.playerRec) + 1;
    return { kind: 'ffa', you: this.playerRec.kills, leader: leader.isPlayer ? (sb[1]?.kills ?? 0) : leader.kills, leaderName: leader.isPlayer ? (sb[1]?.name ?? '-') : leader.name, place, limit: this.limit, time: formatTime(this.time) };
  }
}

// ---------------------------------------------------------------------------

export class Domination extends TeamDeathmatch {
  setup(game) {
    super.setup(game);
    this.limit = this.cfg.scoreLimit ?? 200;
    this.flags = game.builder.domPoints.map((d) => this._makeFlag(d));
    this.scoreTick = 0;
    game.hud.bigMessage('DOMINATION', `Capture and hold A, B and C — first to ${this.limit}`);
  }

  _makeFlag(d) {
    const g = this.game;
    const pos = snapGround(g.world, d.pos.x, d.pos.z);
    const group = new THREE.Group();
    group.position.copy(pos);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 8), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
    pole.position.y = 2;
    group.add(pole);
    const clothMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x222222 });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8, 6, 1), clothMat);
    cloth.position.set(0.62, 3.5, 0);
    group.add(cloth);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    g.scene.add(group);
    return { label: d.label, pos, group, cloth, clothMat, ringMat, owner: null, progress: 0, radius: 5 };
  }

  scoreKill() { /* kills do not score team points in Domination */ }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.time -= dt;
    this._updateRespawns(dt);
    const g = this.game;
    const everyone = [g.player, ...g.actors].filter((a) => a.alive);
    for (const f of this.flags) {
      let na = 0, nb = 0;
      for (const a of everyone) {
        if (Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z) < f.radius && Math.abs(a.pos.y - f.pos.y) < 3) {
          if (a.team === 'a') na++; else nb++;
        }
      }
      const before = f.owner;
      f.contested = na > 0 && nb > 0;
      if (!f.contested && (na || nb)) {
        const dir = na ? 1 : -1;
        const rate = 0.22 * Math.min(2, na || nb);
        // Must neutralise before capturing.
        f.progress = clamp(f.progress + dir * rate * dt, -1, 1);
        if (f.progress >= 1) f.owner = 'a';
        else if (f.progress <= -1) f.owner = 'b';
        else if ((f.owner === 'a' && f.progress < 0) || (f.owner === 'b' && f.progress > 0)) f.owner = null;
      }
      if (f.owner !== before) {
        const playerIn = Math.hypot(g.player.pos.x - f.pos.x, g.player.pos.z - f.pos.z) < f.radius;
        if (f.owner === 'a') {
          g.hud.toast(`FLAG ${f.label} SECURED`, 'xp');
          Audio.ui('objective');
          if (playerIn) { this.playerRec.score += 150; Store.stats.xp += 150; }
        } else if (f.owner === 'b') {
          g.hud.toast(`FLAG ${f.label} LOST`, 'warn');
          Audio.ui('alert');
        }
      }
      const col = f.owner === 'a' ? 0x3ab0ff : f.owner === 'b' ? 0xff4a3a : 0xdddddd;
      f.clothMat.color.setHex(col);
      f.clothMat.emissive.setHex(col).multiplyScalar(0.25);
      f.ringMat.color.setHex(f.contested ? 0xffd040 : col);
      f.cloth.rotation.y = Math.sin(this.elapsed * 2 + f.pos.x) * 0.3;
    }
    this.scoreTick += dt;
    if (this.scoreTick >= 1) {
      this.scoreTick -= 1;
      for (const f of this.flags) if (f.owner) this.teamScores[f.owner]++;
      for (const t of ['a', 'b']) {
        if (this.teamScores[t] >= this.limit) { this._finish(t === 'a', t === 'a' ? 'VICTORY' : 'DEFEAT'); return; }
      }
    }
    if (this.time <= 0) {
      const { a, b } = this.teamScores;
      this._finish(a > b, a > b ? 'VICTORY' : a === b ? 'DRAW' : 'DEFEAT');
    }
    this.markers = this.flags.map((f) => ({ pos: f.pos.clone().setY(f.pos.y + 4.4), label: f.label, kind: 'flag', owner: f.owner, contested: f.contested, progress: f.progress }));
  }

  botGoal(bot) {
    const mine = bot.team;
    const targets = this.flags.filter((f) => f.owner !== mine);
    const list = [...(targets.length && Math.random() < 0.8 ? targets : this.flags)];
    list.sort((a, b) => a.pos.distanceTo(bot.pos) - b.pos.distanceTo(bot.pos));
    const f = Math.random() < 0.7 ? list[0] : pick(list);
    return f.pos.clone().add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3)));
  }

  hudInfo() {
    return { ...super.hudInfo(), kind: 'dom', flags: this.flags.map((f) => ({ label: f.label, owner: f.owner, contested: f.contested, progress: f.progress })) };
  }
}

// ---------------------------------------------------------------------------

export class Survival extends BaseMatch {
  setup(game) {
    this.setupCommon(game);
    this.drops = true;
    this.wave = 0;
    this.queue = 0;
    this.intermission = 6;
    this.score = 0;
    this.kills = 0;
    this.teamScores = null;
    const s = pick(game.builder.spawns.ffa.length ? game.builder.spawns.ffa : game.builder.spawns.a);
    const sp = snapGround(game.world, s.x, s.z);
    game.player.spawn(sp.x, 0, sp.z, s.yaw ?? 0);
    this.base = sp.clone();
    const crate = snapGround(game.world, sp.x + 2, sp.z + 1);
    game.addPickup('ammoCrate', crate);
    game.hud.bigMessage('SURVIVAL', 'Hold out as long as you can');
    game.hud.hint('An ammo crate is at your start position — press E to resupply between waves.', 8);
  }

  _diff() {
    const w = this.wave;
    return w <= 2 ? 'recruit' : w <= 5 ? 'regular' : w <= 9 ? 'hardened' : 'veteran';
  }

  _weaponPool() {
    const w = this.wave;
    const pool = ['wasp', 'p11', 'vx4'];
    if (w >= 2) pool.push('breaker', 'rk74');
    if (w >= 4) pool.push('viper', 'havoc', 'hx30');
    if (w >= 6) pool.push('juggernaut', 'specter');
    return pool;
  }

  _startWave() {
    this.wave++;
    this.queue = Math.min(6 + this.wave * 3, 40);
    this.spawnT = 0;
    this.game.hud.bigMessage(`WAVE ${this.wave}`, this.wave % 5 === 0 ? 'Heavy armor inbound' : 'Hostiles inbound');
    Audio.ui('alert');
    if (this.wave % 5 === 0) this.pendingHeavy = Math.floor(this.wave / 5);
    if (this.wave % 10 === 0) this.pendingBoss = true;
  }

  _spawnEnemy() {
    const g = this.game;
    const pts = g.builder.spawns.ffa.concat(g.builder.spawns.a, g.builder.spawns.b);
    // Prefer points out of the player's immediate area.
    const far = pts.filter((s) => Math.hypot(s.x - g.player.pos.x, s.z - g.player.pos.z) > 28);
    const s = pick(far.length ? far : pts);
    let role = 'rifleman', weapon = pick(this._weaponPool()), health;
    if (this.pendingBoss) { role = 'boss'; weapon = 'juggernaut'; health = 1200 + this.wave * 60; this.pendingBoss = false; }
    else if (this.pendingHeavy > 0) { role = 'heavy'; weapon = 'juggernaut'; this.pendingHeavy--; }
    const u = spawnSoldier(g, {
      pos: [s.x + rand(-2, 2), s.z + rand(-2, 2)], team: 'b', hunter: true, name: role === 'boss' ? 'Warlord' : role === 'heavy' ? 'Juggernaut' : 'MERIDIAN',
      weapon, role, health, difficulty: this._diff(), faction: g.mapId === 'snowfall' ? 'snowEnemy' : g.mapId === 'desert' ? 'desertEnemy' : 'meridian',
    });
    u.state = 'hunt';
    u.grenades = this.wave >= 3 ? 1 : 0;
    this.queue--;
  }

  botGoal() {
    // Survival enemies always converge on the player's rough position.
    const p = this.game.player.pos;
    return p.clone().add(new THREE.Vector3(rand(-5, 5), 0, rand(-5, 5)));
  }

  onKill(killer, victim) {
    if (victim === this.game.player) return;
    if (killer === this.game.player) {
      this.kills++;
      this.score += victim.role === 'boss' ? 1000 : victim.role === 'heavy' ? 400 : 100;
      this.playerRec.kills++;
      this.playerRec.score = this.score;
    }
  }

  onPlayerDeath() {
    this.game.hud.deathCard('YOU WERE OVERWHELMED', `Survived to wave ${this.wave}`);
    Store.stats.wavesSurvived += Math.max(0, this.wave - 1);
    Store.stats.bestWave = Math.max(Store.stats.bestWave, this.wave);
    this._finish(false, `SURVIVED ${Math.max(0, this.wave - 1)} WAVES`);
  }

  resultExtra() { return { wave: this.wave, score: this.score, kills: this.kills }; }

  update(dt) {
    if (this.done) return;
    const g = this.game;
    this.elapsed += dt;
    const alive = g.actors.filter((a) => a.alive && a.team === 'b');
    // Clear corpses.
    for (const a of [...g.actors]) if (!a.alive && a.deadT > 8) g.removeActor(a);
    if (this.queue <= 0 && alive.length === 0) {
      if (this.wave > 0 && this.intermission <= 0) {
        this.intermission = 14;
        this.score += this.wave * 250;
        this.playerRec.score = this.score;
        Store.stats.bestWave = Math.max(Store.stats.bestWave, this.wave);
        g.hud.bigMessage(`WAVE ${this.wave} SURVIVED`, `+${this.wave * 250}  ·  Next wave in 14 s`);
        Audio.ui('objective');
        g.player.heal(true);
      }
      this.intermission -= dt;
      if (this.intermission <= 0) this._startWave();
    } else {
      this.spawnT -= dt;
      const maxAlive = Math.min(5 + this.wave, 14);
      if (this.queue > 0 && alive.length < maxAlive && this.spawnT <= 0) {
        this._spawnEnemy();
        this.spawnT = Math.max(0.4, 2 - this.wave * 0.1);
      }
      // Late-wave stragglers get marked.
      this.markers = this.queue === 0 && alive.length <= 3 ? alive.map((u) => ({ pos: u.pos.clone().setY(u.pos.y + 2.1), kind: 'enemy', label: '', actor: u })) : [];
    }
  }

  hudInfo() {
    const left = this.game.actors.filter((a) => a.alive && a.team === 'b').length + this.queue;
    return { kind: 'survival', wave: this.wave, score: this.score, left, intermission: this.queue <= 0 && left === 0 ? Math.max(0, Math.ceil(this.intermission)) : 0 };
  }
}

export function createMatch(cfg) {
  switch (cfg.mode) {
    case 'tdm': return new TeamDeathmatch(cfg);
    case 'ffa': return new FreeForAll(cfg);
    case 'dom': return new Domination(cfg);
    case 'survival': return new Survival(cfg);
    default: throw new Error(`Unknown mode ${cfg.mode}`);
  }
}
