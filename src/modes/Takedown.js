// Silent takedown, as a short clip: the camera cuts out of your eyes to a low side
// shot of Wraith behind the guard. Left hand clamps over his mouth and hauls him back
// off balance, the knife goes in at the neck (time slows for the strike), and Wraith
// rides him down to the floor before the camera drops back into first person.
// Acts as the game's camera "cinematic" for its two seconds.
import * as THREE from '../lib/three.js';
import { Humanoid } from '../ai/Humanoid.js';
import { Audio } from '../core/Audio.js';
import { clamp, smoothstep } from '../core/Utils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DUR = 2.4;

function buildKnife() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.22, metalness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.75, metalness: 0.1 });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.11, 0.03), black);
  g.add(grip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.05), black);
  guard.position.y = -0.06;
  g.add(guard);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.18, 0.032), steel);
  blade.position.y = -0.155;
  g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 4), steel);
  tip.scale.set(0.3, 1, 1);
  tip.rotation.z = Math.PI;
  tip.position.y = -0.265;
  g.add(tip);
  return g;
}

export class TakedownClip {
  /** game, victim (a Soldier), onDone() after the clip. */
  constructor(game, victim, onDone) {
    this.game = game;
    this.v = victim;
    this.onDone = onDone;
    this.t = 0;
    this.done = false;
    this.killed = false;
    const p = game.player;
    p.invulnerable = Math.max(p.invulnerable ?? 0, DUR + 1);
    victim.scripted = true;
    victim.vel?.set(0, 0, 0);
    this.yaw = victim.yaw;
    this.fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right = V(-this.fwd.z, 0, this.fwd.x);
    this.vStart = victim.pos.clone();
    // Film from whichever side has room (no wall in the way of the camera).
    const w = game.world, c = victim.pos.clone().setY(victim.pos.y + 1.3);
    const clear = (s) => !w.raycast(c.x, c.y, c.z, this.right.x * s, 0, this.right.z * s, 2.0);
    this.side = clear(1) ? 1 : clear(-1) ? -1 : 1;
    // Wraith, in the flesh for once: behind him, facing the same way, rifle slung, knife out.
    const wid = game.weapons?.weapon?.id ?? 'vx4';
    const h = new Humanoid('orion', wid, { seed: 77 });
    h.root.position.copy(this.vStart).addScaledVector(this.fwd, -0.72);
    h.root.rotation.y = this.yaw;
    h.gun.visible = false;
    if (h.mag) h.mag.visible = false;
    h.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    game.scene.add(h.root);
    this.h = h;
    this.knife = buildKnife();
    const node = h.rightHandNode();
    node.add(this.knife);
    node.updateWorldMatrix(true, false);
    const s = node.getWorldScale(V());
    this.knife.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    this.knife.position.set(0, 0.06 / s.y, 0.02 / s.z);
    this.h.handOverride = { right: { p: V(), w: 0 }, left: { p: V(), w: 0 } };
    for (let i = 0; i < 4; i++) h.update(1 / 60, 0, 0.15, 0, false, 0);
    Audio.foley?.('punch', victim.pos);
  }

  /** Points on the victim: his mouth, the side of his neck, his chest (world space). */
  _victimPoints() {
    const v = this.v, base = v.pos;
    const sink = this.killed ? smoothstep(clamp((this.t - 0.75) / 0.8, 0, 1)) : 0;
    const headY = base.y + (v.headY ?? 1.62) - sink * 0.75;
    const mouth = V(base.x, headY - 0.04, base.z).addScaledVector(this.fwd, 0.12);
    const neck = V(base.x, headY - 0.17, base.z).addScaledVector(this.fwd, 0.02).addScaledVector(this.right, 0.1);
    const chest = V(base.x, headY - 0.45, base.z).addScaledVector(this.fwd, 0.05);
    return { mouth, neck, chest, sink };
  }

  skip() { this.t = DUR; this._kill(); this.finish(); }

  _kill() {
    if (this.killed) return;
    this.killed = true;
    const g = this.game, v = this.v;
    const { neck } = this._victimPoints();
    v.scripted = false;
    v.takeDamage(99999, null, g.player, true, 'melee');
    g.effects.blood(neck, this.fwd.clone().multiplyScalar(-1).addScaledVector(this.right, 0.6).normalize(), true);
    Audio.impact('flesh', neck);
  }

  update(dt, camera) {
    if (this.done) return;
    this.t += dt;
    const t = this.t, g = this.game, v = this.v, h = this.h;
    // Slow motion for the strike.
    g.slowmo = t > 0.4 && t < 0.85 ? 0.45 : 1;
    // He's hauled back off balance onto Wraith.
    if (!this.killed) {
      const pull = smoothstep(clamp(t / 0.35, 0, 1));
      v.pos.copy(this.vStart).addScaledVector(this.fwd, -0.22 * pull);
      v.scriptCrouch = 0;
      if (t > 0.05 && !this._jolt) { this._jolt = true; v.model.playMove('Hit_Head', { hideGun: false, parts: 'upper' }); }
    }
    if (t > 0.62) this._kill();
    const { mouth, neck, chest, sink } = this._victimPoints();
    // Wraith's hands: left over the mouth, then on the chest riding him down; right
    // from the hip to the neck and back.
    const o = h.handOverride;
    o.left.w = smoothstep(clamp(t / 0.22, 0, 1));
    o.left.p.copy(this.killed ? mouth.clone().lerp(chest, sink) : mouth);
    const strike = smoothstep(clamp((t - 0.3) / 0.32, 0, 1)) * (1 - smoothstep(clamp((t - 1.0) / 0.5, 0, 1)));
    const hip = h.root.position.clone().addScaledVector(this.right, 0.28).setY(h.root.position.y + 0.95).addScaledVector(this.fwd, 0.25);
    o.right.w = 1;
    o.right.p.copy(hip.lerp(neck, strike));
    const kneel = smoothstep(clamp((t - 0.8) / 0.7, 0, 1));
    h.update(dt, 0, 0.15 + kneel * 0.75, 0, false, 0);
    // Camera: low and to his right, a little ahead, pushing in.
    const mid = V().addVectors(neck, h.root.position.clone().setY(neck.y)).multiplyScalar(0.5);
    const push = smoothstep(clamp(t / DUR, 0, 1));
    // (Side-on, both of them in profile.)
    const camPos = mid.clone().addScaledVector(this.right, (2.25 - push * 0.35) * this.side).addScaledVector(this.fwd, 0.3).setY(mid.y + 0.12 - sink * 0.1);
    let look = mid.clone().setY(mid.y - 0.15 - sink * 0.35);
    // The last beat eases back into your own eyes.
    const back = smoothstep(clamp((t - (DUR - 0.5)) / 0.5, 0, 1));
    if (back > 0) {
      const p = g.player;
      const eye = V(p.pos.x, p.pos.y + (p.eye ?? 1.64), p.pos.z);
      const pf = V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      camPos.lerp(eye, back);
      look = look.lerp(eye.clone().addScaledVector(pf, 5).setY(eye.y - 0.6), back);
    }
    camera.position.copy(camPos);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    if (t >= DUR) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this._kill();
    this.game.slowmo = 1;
    this.h.root.removeFromParent();
    this.onDone?.();
  }
}
