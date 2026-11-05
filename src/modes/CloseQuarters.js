// Close-quarters set pieces for slow, room-by-room clears under strict rules of
// engagement (driven by a mission's `cqb` block):
//   - interior doors you ease open with E; while shut they block sight, but a round
//     goes straight through the wood (both ways);
//   - a man behind a shut door who fires blind through it when he hears you outside;
//   - a gunman hidden in a wardrobe who bursts out when you get close;
//   - a suspect who goes for a weapon left on a counter the moment you come in;
//   - people who surrender (hands up) and must not be shot, one of whom fakes it and
//     lunges for a detonator: drop him before he reaches it or the house goes up;
//   - civilians who jump up and move suddenly when you enter (hold your fire).
import * as THREE from '../lib/three.js';
import { buildDoor } from '../world/ObjectiveProps.js';
import { Audio } from '../core/Audio.js';
import { clamp, rand, smoothstep } from '../core/Utils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mat = (color, rough = 0.8, metal = 0.05) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** Same floor (within a storey) and within r metres in the plan. */
function near(a, b, r) {
  return Math.abs(a.y - b.y) < 1.6 && Math.hypot(a.x - b.x, a.z - b.z) < r;
}

/** A wardrobe: carcass with two hinged doors facing `yaw`. Returns the doors to swing. */
function buildWardrobe(scene, x, y, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  const wood = mat(0x5a4030), dark = mat(0x2a1e16);
  const B = (w, h, d, m, px, py, pz, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); parent.add(o); o.castShadow = o.receiveShadow = true; return o; };
  B(1.1, 2.0, 0.04, wood, 0, 1.0, -0.3); // back
  for (const s of [-1, 1]) B(0.04, 2.0, 0.62, wood, s * 0.55, 1.0, 0);
  B(1.1, 0.04, 0.62, wood, 0, 2.0, 0);
  B(1.1, 0.06, 0.62, dark, 0, 0.03, 0);
  const doors = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * 0.55, 0, 0.31);
    g.add(hinge);
    B(0.54, 1.94, 0.03, wood, -s * 0.27, 1.0, 0, hinge);
    B(0.02, 0.18, 0.03, mat(0xb08a3a, 0.35, 0.8), -s * 0.5, 1.05, 0.03, hinge);
    doors.push({ hinge, s });
  }
  scene.add(g);
  return { group: g, doors };
}

export class CloseQuarters {
  /**
   * spec: {
   *   doors: { id: { x, y, z, w, h, axis, out } },
   *   blind: [{ unit: 'group:index', door, ear }],      // fires through the door
   *   wardrobes: [{ x, y, z, yaw, unit }],                // hides a gunman
   *   reach: [{ unit, weapon: [x, y, z], trigger: door }],// goes for a rifle
   *   surrender: [{ unit, feint: { bench: [x, y, z], delay: [a, b] } }],
   *   startle: [{ civ: index, to: [x, z], trigger: r }],  // jumps up and moves
   * }
   */
  constructor(mode, spec) {
    this.mode = mode;
    this.game = mode.game;
    this.spec = spec;
    const g = this.game;
    // Interior doors, each with a thin penetrable collider while shut.
    this.doors = {};
    for (const [id, d] of Object.entries(spec.doors ?? {})) {
      const door = buildDoor(g, { w: 1.0, h: 2.15, out: 1, ...d });
      const w = (d.w ?? 1.0) / 2, y = d.y ?? 0, h = d.h ?? 2.15;
      const c = d.axis === 'z' ? g.world.add(d.x - 0.04, y, d.z - w, d.x + 0.04, y + h, d.z + w, 'wood') : g.world.add(d.x - w, y, d.z - 0.04, d.x + w, y + h, d.z + 0.04, 'wood');
      c.pen = true;
      door.collider = c;
      door.centre = V(d.x, y, d.z);
      this.doors[id] = door;
    }
    this.wardrobes = (spec.wardrobes ?? []).map((w) => ({ ...w, ...buildWardrobe(g.scene, w.x, w.y ?? 0, w.z, w.yaw ?? 0), open: 0, sprung: false }));
    // Wardrobe fronts are thin wood too.
    for (const w of this.wardrobes) {
      const fx = Math.sin(w.yaw ?? 0) * 0.31, fz = Math.cos(w.yaw ?? 0) * 0.31;
      const ax = Math.abs(Math.cos(w.yaw ?? 0)) > 0.5;
      const y = w.y ?? 0;
      w.collider = ax ? g.world.add(w.x + fx - 0.55, y, w.z + fz - 0.03, w.x + fx + 0.55, y + 2, w.z + fz + 0.03, 'wood') : g.world.add(w.x + fx - 0.03, y, w.z + fz - 0.55, w.x + fx + 0.03, y + 2, w.z + fz + 0.55, 'wood');
      w.collider.pen = true;
    }
    this.blind = (spec.blind ?? []).map((b) => ({ ...b, cool: rand(0.3, 0.8), burst: 0 }));
    this.reach = (spec.reach ?? []).map((r) => ({ ...r, phase: 'wait', t: 0 }));
    this.surrender = (spec.surrender ?? []).map((s) => ({ ...s, phase: 'wait', t: 0 }));
    this.startle = (spec.startle ?? []).map((s) => ({ ...s, phase: 'wait', t: 0 }));
    // Rifles left on counters.
    for (const r of this.reach) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.86), mat(0x1c1c1d, 0.6, 0.4));
      m.position.set(r.weapon[0], r.weapon[1] + 0.04, r.weapon[2]);
      m.rotation.y = r.weaponYaw ?? 0.4;
      g.scene.add(m);
      r.prop = m;
    }
  }

  /** Bind units once their groups are spawned: 'group:index' -> actor. */
  _unit(ref) {
    const [gid, i] = ref.split(':');
    return this.mode.groups[gid]?.units?.[Number(i) || 0] ?? null;
  }

  openDoor(door, quiet = true) {
    if (door.open) return;
    door.unlock();
    door.collider.minY = door.collider.maxY = -100; // out of the way of sight and rounds
    Audio.foley?.(quiet ? 'unlock' : 'punch', door.lock);
  }

  /** Prompt to ease open the shut door in front of you (E). */
  interactPrompt(p, input) {
    let best = null, bd = 1.6;
    for (const d of Object.values(this.doors)) {
      if (d.open) continue;
      if (Math.abs(d.centre.y - p.pos.y) > 1.2) continue;
      const dist = Math.hypot(d.centre.x - p.pos.x, d.centre.z - p.pos.z);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return null;
    if (input.pressed('KeyE')) { this.openDoor(best); return null; }
    return 'Press <b>E</b> to ease the door open';
  }

  update(dt) {
    const g = this.game, p = g.player, now = g.time;
    for (const d of Object.values(this.doors)) { d.update(dt); d.block(p); }
    // Unarmed and surrendered people are not targets for anyone; set up once spawned.
    for (const r of this.reach) {
      const a = r.actor ??= this._unit(r.unit);
      if (!a || r.phase === 'done') continue;
      if (!a.alive) { r.phase = 'done'; continue; }
      if (r.phase === 'wait') {
        a.unarmed = true; a.stationary = true; a.surrendered = 'unarmed'; a.hidden = true;
        a.model.gun.visible = false; if (a.model.mag) a.model.mag.visible = false;
        const door = r.trigger ? this.doors[r.trigger] ?? this.mode.doors?.[r.trigger] : null;
        const go = (door && door.open) || near(p.pos, a.pos, r.radius ?? 5);
        if (go) {
          r.phase = 'reach'; r.t = 0;
          a.surrendered = false; a.hidden = false; // reaching for a weapon: fair game
          a.lookYaw = a.yaw = Math.atan2(-(r.weapon[0] - a.pos.x), -(r.weapon[2] - a.pos.z));
          a.model.playMove('Interact', { hideGun: true });
          g.hud.say([{ who: 'HATCH', text: '(whisper) He\'s going for the rifle!' }]);
        }
      } else if (r.phase === 'reach') {
        r.t += dt;
        a.lookYaw = a.yaw = Math.atan2(-(r.weapon[0] - a.pos.x), -(r.weapon[2] - a.pos.z));
        if (r.t > 0.9) {
          // Got it: armed and turning on you.
          r.phase = 'done';
          r.prop.visible = false;
          a.unarmed = false; a.stationary = false;
          a.model.gun.visible = true; if (a.model.mag) a.model.mag.visible = true;
          a.state = 'combat'; a.target = p; a.lastKnown = p.pos.clone(); a.lastSeenT = now; a.acquiredT = now + 0.35;
        }
      }
    }
    // Blind fire through a shut door at whoever is outside it.
    for (const b of this.blind) {
      const a = b.actor ??= this._unit(b.unit);
      const door = this.doors[b.door];
      if (!a || !a.alive || !door || door.open) continue;
      a.stationary = true;
      a.lookYaw = a.yaw = Math.atan2(-(door.centre.x - a.pos.x), -(door.centre.z - a.pos.z));
      if (!near(p.pos, door.centre, b.ear ?? 4.5)) continue;
      if (!b.heard) { b.heard = true; g.hud.say([{ who: 'REYES', text: '(whisper) Movement behind that door. Watch it.' }]); b.cool = 1.4; }
      b.cool -= dt;
      if (b.cool > 0) continue;
      if (b.burst <= 0) b.burst = 3 + Math.floor(Math.random() * 4);
      b.burst--;
      b.cool = b.burst > 0 ? 0.1 : rand(1.4, 2.4);
      // Spray at where the footsteps were: the door, chest height, a bit wild.
      const aim = V(p.pos.x + rand(-0.7, 0.7), p.pos.y + rand(0.9, 1.5), p.pos.z + rand(-0.7, 0.7));
      a.fireT = 0; a.burstPause = 0; a.acquiredT = 0;
      a.unarmed = false;
      a._shootAt(p, dt, true, aim);
    }
    // Wardrobe ambush.
    for (const w of this.wardrobes) {
      const a = w.actor ??= this._unit(w.unit);
      if (!a) continue;
      if (!w.sprung) {
        if (a.alive) { a.stationary = true; a.hidden = true; a.stunT = Math.max(a.stunT ?? 0, 0.5); a.pos.set(w.x, w.y ?? 0, w.z); a.yaw = a.lookYaw = (w.yaw ?? 0) + Math.PI; }
        if (!a.alive || near(p.pos, V(w.x, w.y ?? 0, w.z), w.radius ?? 2.8)) {
          w.sprung = true;
          w.collider.minY = w.collider.maxY = -100;
          Audio.foley?.('punch', V(w.x, (w.y ?? 0) + 1, w.z));
          if (a.alive) {
            a.hidden = false; a.stunT = 0; a.stationary = false;
            a.state = 'combat'; a.target = p; a.lastKnown = p.pos.clone(); a.lastSeenT = now; a.acquiredT = now + 0.45;
            g.hud.say([{ who: 'TEX', text: 'WARDROBE!' }]);
          }
        }
      }
      if (w.sprung && w.open < 1) {
        w.open = Math.min(1, w.open + dt * 5);
        for (const d of w.doors) d.hinge.rotation.y = d.s * smoothstep(w.open) * 1.9;
      }
    }
    // Surrender, and the one who fakes it.
    for (const s of this.surrender) {
      const a = s.actor ??= this._unit(s.unit);
      if (!a || s.phase === 'done') continue;
      if (!a.alive) {
        if (s.phase === 'lunge') g.hud.say([{ who: 'REYES', text: 'Trigger man down. Good shot.' }]);
        s.phase = 'done';
        continue;
      }
      if (s.phase === 'wait') {
        a.unarmed = true; a.stationary = true; a.hidden = true; a.surrendered = 'unarmed';
        a.model.gun.visible = false; if (a.model.mag) a.model.mag.visible = false;
        if (near(p.pos, a.pos, s.radius ?? 7) && g.world.los(p.eyePos ?? p.pos.clone().setY(p.pos.y + 1.6), a.pos.clone().setY(a.pos.y + 1.5))) {
          s.phase = 'hands'; s.t = 0;
          a.surrendered = 'hands';
          a.model.setCaptive('head');
          a.lookYaw = a.yaw = Math.atan2(-(p.pos.x - a.pos.x), -(p.pos.z - a.pos.z));
          g.hud.say([{ who: s.who ?? 'SUSPECT', text: s.line ?? 'Don\'t shoot! Don\'t shoot! I give up!' }]);
          s.delay = s.feint ? rand(s.feint.delay?.[0] ?? 2.5, s.feint.delay?.[1] ?? 4.5) : Infinity;
        }
      } else if (s.phase === 'hands') {
        s.t += dt;
        a.lookYaw = a.yaw = Math.atan2(-(p.pos.x - a.pos.x), -(p.pos.z - a.pos.z));
        if (s.t > s.delay) {
          // The lunge: hands come down and he turns for the bench.
          s.phase = 'lunge'; s.t = 0;
          a.surrendered = false; a.hidden = false;
          a.model.setCaptive(null);
          const bx = s.feint.bench[0], bz = s.feint.bench[2];
          a.lookYaw = a.yaw = Math.atan2(-(bx - a.pos.x), -(bz - a.pos.z));
          a.model.playMove('Interact', { hideGun: true });
          g.hud.say([{ who: 'REYES', text: 'HE\'S GOING FOR THE TRIGGER!' }]);
        }
      } else if (s.phase === 'lunge') {
        s.t += dt;
        if (s.t > (s.feint.window ?? 1.6)) {
          s.phase = 'done';
          const at = V(s.feint.bench[0], s.feint.bench[1] + 0.5, s.feint.bench[2]);
          g.effects.explosion(at, 4);
          Audio.explosion(at, 1.6);
          p.shake = 2;
          this.mode._fail('The house went up.', 'He reached the detonator. When a man who has surrendered moves for the bench, take the shot.');
        }
      }
    }
    // Civilians who jump up and move when you come in.
    for (const st of this.startle) {
      const c = this.mode.civilians[st.civ];
      if (!c || st.phase === 'done' || c.shot) continue;
      const pos = c.model.root.position;
      if (st.phase === 'wait') {
        if (near(p.pos, pos, st.radius ?? 4.5) && g.world.los(p.pos.clone().setY(p.pos.y + 1.6), pos.clone().setY(pos.y + 1.2))) {
          st.phase = 'move'; st.t = 0; st.from = pos.clone();
          c.taken = true;
          c.model.setCaptive(null);
          if (st.say) g.hud.say([{ who: 'CIVILIAN', text: st.say }]);
        }
      } else if (st.phase === 'move') {
        st.t += dt;
        const k = clamp(st.t / (st.time ?? 0.9), 0, 1);
        const to = V(st.to[0], pos.y, st.to[1]);
        pos.lerpVectors(st.from, to, smoothstep(k));
        c.model.root.rotation.y = Math.atan2(-(to.x - st.from.x), -(to.z - st.from.z));
        c.model.update(dt, k < 1 ? 3.2 : 0, 0, 0, false);
        if (k >= 1) {
          st.phase = 'done';
          c.model.root.rotation.y = st.face ?? c.model.root.rotation.y;
          c.model.setCaptive('head');
          c.taken = false; c.crouch = 1;
        }
      }
    }
  }

  dispose() {
    for (const d of Object.values(this.doors)) d.dispose();
    for (const w of this.wardrobes) w.group.removeFromParent();
    for (const r of this.reach) r.prop?.removeFromParent();
  }
}
