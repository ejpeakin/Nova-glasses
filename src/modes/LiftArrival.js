// Arrival by service lift into the blacksite: you ride down with the squad in a
// cramped freight car. The floor counter ticks down, the cables groan, the car
// jolts to a stop, the doors grind open on the corridor, and the team steps out.
// Acts as the game's camera "cinematic" until the doors are open and you are out.
import * as THREE from '../lib/three.js';
import { Audio } from '../core/Audio.js';
import { clamp, smoothstep } from '../core/Utils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RIDE = 6.5, DOORS = 1.4, OUT = 1.8;

function floorTexture(text) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0d0c'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ff8a3a'; g.font = 'bold 40px "Share Tech Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LiftArrival {
  /**
   * o: { at: [x, z] the car's centre, facing: yaw the doors face (+X: -PI/2), squad,
   *      spots: [[x, z]...] where they spread out, exit: [x, z], floors: ['B1'...], lines, onDone }
   */
  constructor(game, o) {
    this.game = game;
    this.o = o;
    this.squad = o.squad ?? [];
    this.spots = o.spots ?? [];
    this.lines = (o.lines ?? []).map((l) => ({ ...l }));
    this.floors = o.floors ?? ['G', 'B1', 'B2', 'B3', 'B4'];
    const [cx, cz] = o.at;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = (o.facing ?? -Math.PI / 2) + Math.PI / 2; // local +X out through the doors
    game.scene.add(g);
    this.g = g;
    // The car: open toward +X, 2.4 x 2.4 x 2.7 m.
    const steel = new THREE.MeshStandardMaterial({ color: 0x6d7276, roughness: 0.55, metalness: 0.7 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x3e4245, roughness: 0.7, metalness: 0.6 });
    const hazard = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.7 });
    const B = (w, h, d, m, x, y, z, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
    B(2.5, 0.08, 2.5, plate, 0, 0.04, 0); // floor
    B(2.5, 0.08, 2.5, steel, 0, 2.74, 0); // ceiling
    B(0.06, 2.7, 2.5, steel, -1.22, 1.35, 0); // back
    for (const s of [-1, 1]) B(2.5, 2.7, 0.06, steel, 0, 1.35, s * 1.22);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) B(2.2, 0.05, 0.03, plate, 0, 0.5 + i * 0.5, s * 1.18); // ribbed walls
    B(0.04, 0.08, 2.3, hazard, 1.15, 0.09, 0); // hazard sill
    // Floor counter and light.
    this.counter = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: floorTexture(this.floors[0]) }));
    this.counter.position.set(1.0, 2.35, -0.9);
    this.counter.rotation.y = -Math.PI / 2;
    g.add(this.counter);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 1.6 }));
    lamp.position.set(0, 2.69, 0);
    g.add(lamp);
    this.lamp = lamp;
    // Sliding doors at +X.
    this.doors = [-1, 1].map((s) => B(0.05, 2.5, 1.22, steel, 1.24, 1.27, s * 0.61));
    // Squad rides in with you (the actors themselves, held in place).
    const seats = [[-0.6, -0.65], [-0.6, 0.65], [0.15, -0.75]];
    this.squad.forEach((s, i) => {
      s.scripted = true;
      const [lx, lz] = seats[i % seats.length];
      const w = V(lx, 0, lz).applyMatrix4(g.matrixWorld);
      g.updateMatrixWorld(true);
      s.pos.copy(V(lx, 0, lz).applyMatrix4(g.matrixWorld));
      s.yaw = s.lookYaw = o.facing ?? -Math.PI / 2;
      void w;
    });
    // The car's walls stay as cover/blocking once you're out.
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const w = game.world;
    const sideA = new THREE.Box3(), sideB = new THREE.Box3(), back = new THREE.Box3();
    for (const [m, bb] of [[g.children[2], back], [g.children[3], sideA], [g.children[4], sideB]]) { bb.setFromObject(m); w.add(bb.min.x, 0, bb.min.z, bb.max.x, 2.7, bb.max.z, 'metal'); }
    void box;
    this.t = 0;
    this.done = false;
    this.floorIdx = 0;
    Audio.startLoop('lift', 'engine');
  }

  skip() { this.t = RIDE + DOORS + OUT; this.finish(); }

  update(dt, camera) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    for (const l of this.lines) if (!l.said && t >= l.t) { l.said = true; this.game.hud.say([{ who: l.who, text: l.text }]); }
    // Floors tick down, the light flickers once, the car jolts at the bottom.
    const fi = Math.min(this.floors.length - 1, Math.floor((t / RIDE) * this.floors.length));
    if (fi !== this.floorIdx) { this.floorIdx = fi; this.counter.material.map = floorTexture(this.floors[fi]); this.counter.material.needsUpdate = true; Audio.ui?.('click'); }
    this.lamp.material.emissiveIntensity = t > RIDE * 0.55 && t < RIDE * 0.6 ? 0.2 : 1.6;
    Audio.setLoop('lift', t < RIDE ? 0.35 : 0.05, 0.15);
    const g = this.g;
    const shake = t < RIDE ? 0.004 : t < RIDE + 0.35 ? 0.03 * (1 - (t - RIDE) / 0.35) : 0;
    // Doors.
    const d = smoothstep(clamp((t - RIDE - 0.4) / DOORS, 0, 1));
    this.doors.forEach((door, i) => { door.position.z = (i ? 1 : -1) * (0.61 + d * 1.15); });
    // The squad steps out once the doors are open.
    const out = t - RIDE - 0.4 - DOORS * 0.7;
    this.squad.forEach((s, i) => {
      if (out < i * 0.35 || !s.scripted || !s.alive) return;
      s.scripted = false;
      const spot = this.spots[i];
      if (spot) s.command('move', V(spot[0], 0, spot[1]), this.o.facing ?? -Math.PI / 2);
    });
    // Camera: at the back of the car, eyes on the doors; step out at the end.
    const inside = V(-0.75 + Math.sin(t * 31) * shake, 1.64 + Math.sin(t * 23) * shake, 0.2).applyMatrix4(g.matrixWorld);
    const exit = V(this.o.exit[0], 1.64, this.o.exit[1]);
    const s = smoothstep(clamp((t - RIDE - DOORS) / OUT, 0, 1));
    const cam = inside.lerp(exit, s);
    const look = V(6, 1.5, 0).applyMatrix4(g.matrixWorld);
    camera.position.copy(cam);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    if (t >= RIDE + DOORS + OUT) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.doors.forEach((door, i) => { door.position.z = (i ? 1 : -1) * 1.76; });
    this.squad.forEach((s, i) => {
      if (!s.scripted) return;
      s.scripted = false;
      const spot = this.spots[i];
      if (spot) s.pos.set(spot[0], 0, spot[1]);
    });
    Audio.setLoop('lift', 0, 0.1);
    this.o.onDone?.();
  }

  tick() {}

  dispose() {
    Audio.stopLoop?.('lift');
    this.g.removeFromParent();
  }
}
