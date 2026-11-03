// Procedural utility helicopter used for fast-rope insertions: open right-side
// cabin door, cockpit glazing, engine deck, spinning main and tail rotors, skids,
// a fast-rope bar (FRIES) above the door and navigation lights.
// Local space: origin at the cabin floor centre, nose toward -Z, door on +X.
import * as THREE from '../lib/three.js';
import { getTexture } from './Textures.js';

export class Helicopter {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'helicopter';
    const body = new THREE.MeshStandardMaterial({ color: 0x3e4535, roughness: 0.55, metalness: 0.35, map: getTexture('metal') });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f1c, roughness: 0.7, metalness: 0.3 });
    const interior = new THREE.MeshStandardMaterial({ color: 0x2b2e2a, roughness: 0.85, metalness: 0.1 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.82 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    // Cabin shell with the right door opening (z -1.3 .. 1.1, up to 1.55 m).
    add(B(2.3, 0.12, 4.2), interior, 0, -0.06, 0); // floor
    add(B(2.36, 0.55, 4.6), body, 0, -0.4, 0.05); // belly
    add(B(0.08, 1.75, 4.2), body, -1.15, 0.875, 0); // left wall
    add(B(0.08, 1.75, 0.8), body, 1.15, 0.875, -1.7); // right wall, front of door
    add(B(0.08, 1.75, 1.0), body, 1.15, 0.875, 1.6); // right wall, behind door
    add(B(0.08, 0.2, 2.4), body, 1.15, 1.65, -0.1); // door header
    add(B(0.06, 1.55, 0.06), dark, 1.17, 0.78, 1.1); // door rail
    add(B(2.36, 0.12, 4.4), body, 0, 1.8, 0); // roof
    add(B(2.3, 1.75, 0.08), body, 0, 0.875, 2.1); // rear bulkhead
    add(B(2.2, 1.75, 0.05), interior, 0, 0.875, -2.12); // cockpit partition
    add(B(0.6, 0.06, 0.7), glass, -1.17, 1.15, -0.3, 0, Math.PI / 2, Math.PI / 2); // cabin window
    // Interior: bench, seat backs, cargo straps.
    add(B(0.45, 0.42, 3.0), interior, -0.85, 0.21, 0.1);
    add(B(0.08, 0.6, 3.0), dark, -1.08, 0.75, 0.1);
    add(B(0.04, 0.04, 3.8), dark, 0, 1.72, 0); // overhead cable
    // Cockpit / nose.
    add(B(2.1, 1.05, 1.9), body, 0, 0.12, -3.05);
    const canopy = add(new THREE.SphereGeometry(1.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.62, -3.0);
    canopy.scale.set(0.93, 0.95, 1.05);
    const nose = add(new THREE.SphereGeometry(1, 16, 10), body, 0, 0.1, -3.95);
    nose.scale.set(1.04, 0.58, 0.85);
    add(B(0.08, 1.2, 0.08), dark, 0.0, 1.05, -3.55, 0.6, 0, 0); // windscreen frame
    // Engine deck, intakes, exhausts.
    add(B(1.5, 0.65, 3.4), body, 0, 2.18, 0.25);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 12), dark, -0.55, 2.25, -1.4, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 12), dark, 0.55, 2.25, -1.4, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 10), dark, -0.62, 2.2, 1.95, Math.PI / 2 + 0.3, 0, 0.4);
    add(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 10), dark, 0.62, 2.2, 1.95, Math.PI / 2 + 0.3, 0, -0.4);
    // Tail boom, fin, stabiliser.
    add(new THREE.CylinderGeometry(0.24, 0.56, 6.9, 14), body, 0, 1.2, 5.55, Math.PI / 2);
    add(B(0.12, 1.9, 1.1), body, 0, 2.05, 8.85, -0.35);
    add(B(2.6, 0.08, 0.6), body, 0, 1.05, 8.3);
    // Skids.
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.05, 0.05, 4.8, 8), dark, s * 1.3, -1.12, -0.2, Math.PI / 2);
      add(B(0.07, 0.6, 0.07), dark, s * 1.2, -0.85, -1.3, 0, 0, s * 0.3);
      add(B(0.07, 0.6, 0.07), dark, s * 1.2, -0.85, 1.1, 0, 0, s * 0.3);
    }
    // Fast-rope bar above the door.
    add(B(0.95, 0.08, 0.08), dark, 1.6, 1.7, -0.1);
    add(B(0.06, 0.3, 0.06), dark, 2.04, 1.57, -0.1);
    this.ropeAnchor = new THREE.Vector3(2.05, 1.42, -0.1);

    // Main rotor.
    add(new THREE.CylinderGeometry(0.12, 0.14, 0.55, 10), dark, 0, 2.75, -0.2);
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 3.0, -0.2);
    this.group.add(this.rotor);
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.16, 12), dark, 0, 0, 0, 0, 0, 0, this.rotor);
    for (let i = 0; i < 4; i++) {
      const blade = add(B(0.42, 0.045, 7.6), dark, 0, 0, 3.95, 0.04, 0, 0, new THREE.Group());
      blade.parent.rotation.y = (i * Math.PI) / 2;
      this.rotor.add(blade.parent);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.MeshBasicMaterial({ color: 0x1a1c1a, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    this.rotor.add(disc);
    // Tail rotor.
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(-0.22, 2.25, 9.05);
    this.group.add(this.tailRotor);
    add(B(0.04, 1.7, 0.18), dark, 0, 0, 0, 0, 0, 0, this.tailRotor);
    add(B(0.04, 0.18, 1.7), dark, 0, 0, 0, 0, 0, 0, this.tailRotor);

    // Navigation lights.
    const light = (c, x, y, z) => add(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: c }), x, y, z);
    light(0xff2020, -1.2, 0.0, -2.2);
    light(0x20ff40, 1.2, 0.0, -2.2);
    this.beacon = light(0xff3030, 0, 3.0, 8.9);
    // Cabin light so the interior reads at night.
    this.cabinLight = new THREE.PointLight(0xff5a3a, 3, 4, 2);
    this.cabinLight.position.set(0, 1.5, 0);
    this.group.add(this.cabinLight);

    // Rope (hangs in world space under the anchor).
    const tex = ropeTexture();
    this.ropeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.95 });
    const ropeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 8, 1);
    ropeGeo.translate(0, -0.5, 0);
    this.rope = new THREE.Mesh(ropeGeo, this.ropeMat);
    this.rope.castShadow = true;
    this.rope.visible = false;
    scene.add(this.rope);

    this.t = 0;
    scene.add(this.group);
  }

  get position() { return this.group.position; }

  /** World position of the rope anchor. */
  anchorWorld(out = new THREE.Vector3()) {
    this.group.updateMatrixWorld();
    return out.copy(this.ropeAnchor).applyMatrix4(this.group.matrixWorld);
  }

  /** Lower the rope to groundY (or hide it). slideOffset scrolls the braid texture. */
  updateRope(groundY, deployed, slideOffset = 0) {
    this.rope.visible = deployed > 0;
    if (!deployed) return;
    const a = this.anchorWorld();
    const full = Math.max(0.5, a.y - groundY + 0.4);
    const len = full * Math.min(1, deployed);
    this.rope.position.copy(a);
    this.rope.scale.set(1, len, 1);
    this.rope.rotation.set(Math.sin(this.t * 1.3) * 0.015, 0, Math.cos(this.t * 1.1) * 0.015);
    this.ropeMat.map.repeat.set(1, len / 0.12);
    this.ropeMat.map.offset.y = slideOffset / 0.12;
  }

  update(dt) {
    this.t += dt;
    this.rotor.rotation.y += dt * 27;
    this.tailRotor.rotation.x += dt * 60;
    this.beacon.visible = Math.floor(this.t * 1.5) % 2 === 0;
  }

  dispose() {
    this.group.removeFromParent();
    this.rope.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.rope.geometry.dispose();
  }
}

let ropeTex = null;
function ropeTexture() {
  if (ropeTex) return ropeTex;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#6b5a3c';
  g.fillRect(0, 0, 32, 32);
  // Braided twist.
  g.strokeStyle = '#3c3122';
  g.lineWidth = 5;
  for (let i = -32; i < 64; i += 11) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 32); g.stroke(); }
  g.strokeStyle = 'rgba(200,180,140,0.35)';
  g.lineWidth = 2;
  for (let i = -32; i < 64; i += 11) { g.beginPath(); g.moveTo(i + 4, 0); g.lineTo(i + 36, 32); g.stroke(); }
  ropeTex = new THREE.CanvasTexture(c);
  ropeTex.wrapS = ropeTex.wrapT = THREE.RepeatWrapping;
  ropeTex.colorSpace = THREE.SRGBColorSpace;
  return ropeTex;
}
