// Animated 3D backdrop for the menus: a real map under cinematic lighting with a
// slow camera orbit, idle soldiers, smoke — plus a rotating weapon showcase.
import * as THREE from '../lib/three.js';
import { World } from '../world/World.js';
import { MapBuilder } from '../world/MapBuilder.js';
import { buildMap } from '../world/Maps.js';
import { Environment } from '../world/Environment.js';
import { Effects } from '../world/Effects.js';
import { Humanoid } from '../ai/Humanoid.js';
import { buildWeaponModel } from '../weapons/WeaponModel.js';
import { WEAPONS, resolveAttachments } from '../weapons/WeaponData.js';
import { pick } from '../core/Utils.js';

const SETS = [
  { map: 'desert', lighting: 'dusk', weather: 'dust', center: [0, 2], radius: 34, height: 12, troops: [[-6, -9], [-4.5, -10], [7, -10.5], [-8, 12]], smoke: [[10, -4], [-20, 0]] },
  { map: 'harbor', lighting: 'night', weather: 'rain', center: [20, 10], radius: 30, height: 14, troops: [[16, 0], [18, 1.5], [26, 0.5]], smoke: [[-6, 30]] },
  { map: 'snowfall', lighting: 'snow', weather: 'snow', center: [-10, 10], radius: 32, height: 10, troops: [[-6, -12], [6, -13], [0, 10.5]], smoke: [] },
  { map: 'downtown', lighting: 'overcast', weather: 'ash', center: [0, 0], radius: 26, height: 11, troops: [[-8, -6], [8, 6.5], [5, -9]], smoke: [[-30, -3], [20, -3.5]] },
];

export class MenuScene {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.set = pick(SETS);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);
    this.world = new World();
    const b = new MapBuilder(this.scene, this.world, 7, quality);
    buildMap(this.set.map, b);
    this.env = new Environment(this.scene, renderer, this.set.lighting, this.set.weather, quality);
    this.effects = new Effects(this.scene, quality);
    this.smoke = this.set.smoke.map(([x, z]) => new THREE.Vector3(x, 0.5, z));
    this.troops = [];
    for (const [x, z] of this.set.troops) {
      const h = new Humanoid('orion', pick(['vx4', 'rk74', 'juggernaut', 'hx30']));
      h.root.position.set(x, 0, z);
      h.root.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(h.root);
      this.troops.push(h);
    }
    this.t = Math.random() * 100;
    // Showcase.
    this.showScene = new THREE.Scene();
    this.showCam = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.01, 20);
    this.showCam.position.set(0, 0, 2.2);
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(2, 3, 2);
    const rim = new THREE.DirectionalLight(0x9fd07a, 2.5);
    rim.position.set(-3, 1, -2);
    this.showScene.add(new THREE.HemisphereLight(0xddeeff, 0x202018, 1.2), key, rim);
    this.showPivot = new THREE.Group();
    this.showScene.add(this.showPivot);
    this.showcase = null;
    this.showScene.environment = this.env.envMap;
    this.resize();
  }

  showWeapon(id, att) {
    this.showPivot.clear();
    if (!id) { this.showcase = null; return; }
    const info = buildWeaponModel(WEAPONS[id], resolveAttachments(id, att));
    const g = info.group;
    const len = WEAPONS[id].model.len;
    const s = 1.1 / Math.max(0.35, len);
    g.scale.setScalar(s);
    g.position.z = (len / 2) * s * 0.6;
    const holder = new THREE.Group();
    holder.add(g);
    holder.rotation.y = Math.PI / 2;
    this.showPivot.add(holder);
    this.showcase = id;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.showCam.aspect = w / h;
    this.showCam.updateProjectionMatrix();
    this.effects.resize(h * this.renderer.getPixelRatio(), 50);
    // Weapon sits in the right half of the screen.
    const vis = 2 * Math.tan((this.showCam.fov * Math.PI) / 360) * 2.2;
    this.showPivot.position.set(vis * this.showCam.aspect * 0.18, -0.05, 0);
  }

  update(dt) {
    this.t += dt;
    const s = this.set;
    const a = this.t * 0.04;
    const [cx, cz] = s.center;
    this.camera.position.set(cx + Math.cos(a) * s.radius, s.height + Math.sin(this.t * 0.1) * 1.5, cz + Math.sin(a) * s.radius);
    this.camera.lookAt(cx, 2, cz);
    this.env.update(dt, new THREE.Vector3(cx, 0, cz));
    for (const p of this.smoke) this.effects.smokeColumn(p, dt);
    this.effects.update(dt, this.world);
    for (const h of this.troops) h.update(dt, 0, 0, Math.sin(this.t * 0.5 + h.phase) * 0.1, false);
    this.showPivot.rotation.y = Math.sin(this.t * 0.4) * 0.5;
    this.showPivot.rotation.x = Math.sin(this.t * 0.3) * 0.05;
  }

  render() {
    const r = this.renderer;
    r.autoClear = false;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.showcase) {
      r.clearDepth();
      r.render(this.showScene, this.showCam);
    }
  }

  dispose() {
    this.effects.dispose();
    this.env.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
