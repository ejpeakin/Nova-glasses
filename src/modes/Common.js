// Shared helpers for game modes: spawning soldiers safely, loadouts, cinematics.
import * as THREE from '../lib/three.js';
import { Soldier } from '../ai/Soldier.js';
import { Store } from '../core/Storage.js';
import { smoothstep, clamp } from '../core/Utils.js';

export const CALLSIGNS = ['Viper', 'Ghost', 'Havoc', 'Raven', 'Saber', 'Nomad', 'Reaper', 'Bishop', 'Atlas', 'Cobra', 'Falcon', 'Jackal',
  'Kodiak', 'Lynx', 'Mako', 'Onyx', 'Specter', 'Talon', 'Vandal', 'Warden', 'Yeti', 'Zulu', 'Hex', 'Drift', 'Tango', 'Blitz'];

/** Snap a map position to the nearest walkable nav cell (ground level). */
export function snapGround(world, x, z) {
  const c = world.nearestWalkable(x, z, 10);
  if (c < 0) return new THREE.Vector3(x, 0, z);
  return world.cellCenter(c);
}

export function spawnSoldier(game, o) {
  let pos;
  if (o.pos.length === 3) {
    pos = new THREE.Vector3(o.pos[0], o.pos[1], o.pos[2]);
    if (pos.y > 0.5) o.stationary = true;
    else pos = snapGround(game.world, pos.x, pos.z);
  } else if (o.pos.isVector3) {
    pos = o.pos.y > 0.5 ? o.pos.clone() : snapGround(game.world, o.pos.x, o.pos.z);
  } else {
    pos = snapGround(game.world, o.pos[0], o.pos[1]);
  }
  const s = new Soldier(game, { ...o, pos });
  return game.addActor(s);
}

/** The player's saved multiplayer loadout. */
export function savedLoadout() {
  const lo = Store.loadout;
  return { ...lo, attachments: { [lo.primary]: Store.getAttachments(lo.primary), [lo.secondary]: Store.getAttachments(lo.secondary) } };
}

/** Camera fly-through used for mission intros and transitions. */
export class Cinematic {
  constructor(keys, duration, onEnd) {
    this.posCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.pos));
    this.lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.look));
    this.duration = duration;
    this.t = 0;
    this.onEnd = onEnd;
    this.done = false;
  }

  update(dt, camera) {
    if (this.done) return;
    this.t += dt;
    const u = smoothstep(clamp(this.t / this.duration, 0, 1));
    camera.position.copy(this.posCurve.getPoint(u));
    camera.lookAt(this.lookCurve.getPoint(u));
    camera.updateMatrixWorld();
    if (this.t >= this.duration) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.onEnd?.();
  }
}

/** Build a standard intro: wide establishing shot -> over the shoulder -> eyes. */
export function introKeys(start, yaw, focus) {
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const f = focus ?? start.clone().addScaledVector(fwd, 30);
  const eye = start.clone().setY(start.y + 1.64);
  return [
    { pos: f.clone().add(new THREE.Vector3(22, 26, 18)), look: f.clone() },
    { pos: f.clone().lerp(start, 0.5).add(new THREE.Vector3(-6, 14, 4)), look: f.clone().lerp(start, 0.3) },
    { pos: eye.clone().addScaledVector(fwd, -4).add(new THREE.Vector3(1.2, 1.4, 0)), look: eye.clone().addScaledVector(fwd, 12) },
    { pos: eye.clone(), look: eye.clone().addScaledVector(fwd, 10) },
  ];
}
