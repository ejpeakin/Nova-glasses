// Thrown equipment: bouncing frag/flash/smoke grenades, sticky semtex and
// remote C4, with simple sphere-vs-box physics against the world.
import * as THREE from '../lib/three.js';
import { EQUIPMENT } from './WeaponData.js';
import { Audio } from '../core/Audio.js';

const R = 0.07;

function makeMesh(id) {
  const g = new THREE.Group();
  let mesh;
  if (id === 'c4') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.8 }));
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    led.position.set(0.05, 0.04, 0);
    g.add(led);
    g.userData.led = led;
  } else if (id === 'smoke' || id === 'flash') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), new THREE.MeshStandardMaterial({ color: id === 'smoke' ? 0x5a6a5a : 0x3a3a3a, roughness: 0.6, metalness: 0.4 }));
  } else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: id === 'semtex' ? 0x6a6a5a : 0x3c4a32, roughness: 0.7, metalness: 0.3 }));
  }
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

export class Grenades {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.smokes = [];
  }

  throw(id, origin, vel, owner, cooked = 0) {
    const def = EQUIPMENT[id];
    const mesh = makeMesh(id);
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    const g = { id, def, mesh, pos: origin.clone(), vel: vel.clone(), owner, fuse: def.fuse - cooked, stuck: false, dead: false, detonate: false, bounces: 0, blink: 0 };
    this.list.push(g);
    return g;
  }

  update(dt) {
    const world = this.game.world;
    for (const g of this.list) {
      if (g.dead) continue;
      g.fuse -= dt;
      if (!g.stuck) {
        g.vel.y -= 16 * dt;
        const steps = 3;
        for (let s = 0; s < steps; s++) {
          const d = dt / steps;
          for (const axis of ['x', 'y', 'z']) {
            const before = g.pos[axis];
            g.pos[axis] += g.vel[axis] * d;
            const p = g.pos;
            const hit = world.overlaps(p.x - R, p.y - R, p.z - R, p.x + R, p.y + R, p.z + R) || (p.y - R < 0 ? { ground: true } : null);
            if (hit) {
              g.pos[axis] = axis === 'y' && hit.ground ? R : before;
              if (g.def.sticky || g.def.remote) {
                g.stuck = true;
                g.vel.set(0, 0, 0);
                break;
              }
              g.vel[axis] *= -0.38;
              if (axis === 'y') { g.vel.x *= 0.7; g.vel.z *= 0.7; } else g.vel.y *= 0.9;
              if (Math.abs(g.vel[axis]) > 1.2 && g.bounces < 6) { Audio.mech('bounce', g.pos); g.bounces++; }
            }
          }
          if (g.stuck) break;
        }
        g.mesh.rotation.x += g.vel.length() * dt * 2;
        g.mesh.rotation.z += g.vel.length() * dt * 1.3;
      }
      g.mesh.position.copy(g.pos);
      // Warn nearby AI so they scramble.
      if (g.def.damage && g.fuse < 2.5 && !g.warned) {
        g.warned = true;
        this.game.onGrenadeWarning(g);
      }
      if (g.def.remote && g.mesh.userData.led) {
        g.blink += dt;
        g.mesh.userData.led.visible = Math.floor(g.blink * 3) % 2 === 0;
      }
      if (g.fuse <= 0 || g.detonate) this._explode(g);
    }
    this.list = this.list.filter((g) => !g.dead);
    // Active smoke emitters.
    for (const s of this.smokes) {
      s.t += dt;
      if (s.t < 9) this.game.effects.smokeCloud(s.pos, dt, s.t < 2 ? 2 : 1);
    }
    this.smokes = this.smokes.filter((s) => s.t < 9);
  }

  _explode(g) {
    g.dead = true;
    g.mesh.removeFromParent();
    const pos = g.pos.clone();
    const def = g.def;
    if (def.smoke) {
      Audio.mech('pin', pos);
      Audio.impact('soft', pos);
      const now = performance.now() / 1000;
      this.game.world.smokes.push({ x: pos.x, y: pos.y + 1.5, z: pos.z, r: def.radius, start: now, until: now + 22 });
      this.smokes.push({ pos, t: 0 });
      return;
    }
    if (def.flash) {
      this.game.flashbang(pos, def, g.owner);
      return;
    }
    this.game.explode(pos, def, g.owner, g.id);
  }

  clear() {
    for (const g of this.list) g.mesh.removeFromParent();
    this.list.length = 0;
    this.smokes.length = 0;
  }
}
