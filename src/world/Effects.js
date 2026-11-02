// Visual effects: GPU particle pools (fire, smoke, sparks, dust, blood), tracers,
// bullet-hole decals, pooled flash lights, brass casings and explosions.
import * as THREE from '../lib/three.js';
import { getSpriteTexture } from './Textures.js';
import { rand } from '../core/Utils.js';

class ParticlePool {
  constructor(scene, capacity, texture, additive) {
    this.cap = capacity;
    this.count = 0;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    // Simulation state.
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.a0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.rgb = new Float32Array(capacity * 3);
    this.rgb1 = new Float32Array(capacity * 3);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture }, scale: { value: 600 } }]),
      vertexShader: `
        attribute float size; attribute vec4 color; attribute float rot;
        varying vec4 vColor; varying float vRot;
        uniform float scale;
        #include <fog_pars_vertex>
        void main() {
          vColor = color; vRot = rot;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(-mvPosition.z, 0.1);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vColor; varying float vRot;
        #include <fog_pars_fragment>
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float s = sin(vRot), co = cos(vRot);
          vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
          vec4 t = texture2D(map, uv);
          gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
          if (gl_FragColor.a < 0.003) discard;
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  setScale(h, fov) {
    this.points.material.uniforms.scale.value = h / (2 * Math.tan((fov * Math.PI) / 360));
  }

  emit(x, y, z, vx, vy, vz, o) {
    let i;
    if (this.count < this.cap) i = this.count++;
    else { i = this.cursor; this.cursor = (this.cursor + 1) % this.cap; }
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 0;
    this.max[i] = o.life ?? 1;
    this.s0[i] = o.size ?? 0.3;
    this.s1[i] = o.sizeEnd ?? this.s0[i];
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.spin[i] = o.spin ?? 0;
    this.rot[i] = Math.random() * 6.28;
    const c = o.color ?? [1, 1, 1], c1 = o.colorEnd ?? c;
    this.rgb[i * 3] = c[0]; this.rgb[i * 3 + 1] = c[1]; this.rgb[i * 3 + 2] = c[2];
    this.rgb1[i * 3] = c1[0]; this.rgb1[i * 3 + 1] = c1[1]; this.rgb1[i * 3 + 2] = c1[2];
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) {
        // Swap-remove with the last live particle.
        n--;
        this._copy(n, i);
        i--;
        continue;
      }
      const k = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02 && this.grav[i] > 0) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6; }
      const t = this.life[i] / this.max[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.rot[i] += this.spin[i] * dt;
      const fadeIn = Math.min(1, this.life[i] / 0.06);
      this.col[i * 4] = this.rgb[k] + (this.rgb1[k] - this.rgb[k]) * t;
      this.col[i * 4 + 1] = this.rgb[k + 1] + (this.rgb1[k + 1] - this.rgb[k + 1]) * t;
      this.col[i * 4 + 2] = this.rgb[k + 2] + (this.rgb1[k + 2] - this.rgb[k + 2]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * (1 - t * 0.3) * fadeIn;
    }
    this.count = n;
    if (this.cursor >= n) this.cursor = 0;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.rot.needsUpdate = true;
  }

  _copy(from, to) {
    if (from === to) return;
    for (const arr of [this.pos, this.vel, this.rgb, this.rgb1]) {
      arr[to * 3] = arr[from * 3]; arr[to * 3 + 1] = arr[from * 3 + 1]; arr[to * 3 + 2] = arr[from * 3 + 2];
    }
    for (let c = 0; c < 4; c++) this.col[to * 4 + c] = this.col[from * 4 + c];
    for (const arr of [this.life, this.max, this.s0, this.s1, this.a0, this.grav, this.drag, this.spin, this.size, this.rot]) arr[to] = arr[from];
  }

  clear() { this.count = 0; }
}

export class Effects {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    const q = quality === 'low' ? 0.5 : 1;
    this.fire = new ParticlePool(scene, Math.floor(1500 * q), getSpriteTexture('flash'), true);
    this.sparks = new ParticlePool(scene, Math.floor(800 * q), getSpriteTexture('spark'), true);
    this.smoke = new ParticlePool(scene, Math.floor(2200 * q), getSpriteTexture('smoke'), false);
    this.pools = [this.fire, this.sparks, this.smoke];

    // Tracers.
    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
    tGeo.translate(0, 0, -0.5);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tGeo, this.tracerMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, d: 0, speed: 0, active: false });
    }

    // Decals.
    this.decals = [];
    this.decalIndex = 0;
    const dGeo = new THREE.PlaneGeometry(1, 1);
    this.holeMat = new THREE.MeshBasicMaterial({ map: getSpriteTexture('hole'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.9 });
    this.scorchMat = new THREE.MeshBasicMaterial({ map: getSpriteTexture('scorch'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < (quality === 'low' ? 60 : 160); i++) {
      const m = new THREE.Mesh(dGeo, this.holeMat);
      m.visible = false;
      m.matrixAutoUpdate = true;
      scene.add(m);
      this.decals.push(m);
    }

    // Pooled flash lights (fixed count: adding lights at runtime forces shader recompiles).
    this.flashLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 12, 2);
      scene.add(l);
      this.flashLights.push({ light: l, t: 0, dur: 0, peak: 0 });
    }
    this.flashCursor = 0;

    // Brass.
    this.casings = [];
    const cGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6);
    cGeo.rotateZ(Math.PI / 2);
    const cMat = new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(cGeo, cMat);
      m.visible = false;
      scene.add(m);
      this.casings.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    this.casingIndex = 0;
  }

  resize(h, fov) {
    for (const p of this.pools) p.setScale(h, fov);
  }

  // ---------- emitters ----------

  muzzle(pos, dir, big = 1, light = true) {
    for (let i = 0; i < 3; i++) {
      const s = rand(0.6, 1.4) * big;
      this.fire.emit(pos.x + dir.x * 0.08 * i, pos.y + dir.y * 0.08 * i, pos.z + dir.z * 0.08 * i, dir.x * 2, dir.y * 2, dir.z * 2,
        { life: 0.05, size: 0.22 * s, sizeEnd: 0.32 * s, color: [1, 0.85, 0.6], alpha: 0.9 });
    }
    this.smoke.emit(pos.x, pos.y, pos.z, dir.x * 1.5 + rand(-0.2, 0.2), 0.4, dir.z * 1.5, { life: 0.9, size: 0.15, sizeEnd: 0.7, color: [0.75, 0.75, 0.72], alpha: 0.18, drag: 2, spin: 1 });
    if (light) this.flash(pos, 0xffb060, 6 * big, 0.06, 10);
  }

  flash(pos, color, intensity, dur, distance = 12) {
    const f = this.flashLights[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashLights.length;
    f.light.position.copy(pos);
    f.light.color.setHex(color);
    f.light.distance = distance;
    f.t = 0; f.dur = dur; f.peak = intensity;
    f.light.intensity = intensity;
  }

  tracer(from, to, speed = 380) {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    t.from.copy(from);
    t.dir.subVectors(to, from);
    t.len = t.dir.length();
    if (t.len < 2) return;
    t.dir.divideScalar(t.len);
    t.d = Math.min(1.5, t.len * 0.1);
    t.speed = speed;
    t.active = true;
    t.mesh.visible = true;
  }

  impact(point, normal, mat = 'concrete') {
    const n = normal;
    const dust = mat === 'sand' || mat === 'snow' || mat === 'soft';
    const col = mat === 'snow' ? [0.95, 0.97, 1] : mat === 'sand' ? [0.85, 0.75, 0.55] : mat === 'wood' ? [0.55, 0.42, 0.3] : [0.65, 0.63, 0.6];
    for (let i = 0; i < (dust ? 6 : 3); i++) {
      this.smoke.emit(point.x + n.x * 0.05, point.y + n.y * 0.05, point.z + n.z * 0.05,
        n.x * rand(0.5, 2) + rand(-0.5, 0.5), n.y * rand(0.5, 2) + rand(0.2, 1), n.z * rand(0.5, 2) + rand(-0.5, 0.5),
        { life: rand(0.5, 1.2), size: 0.08, sizeEnd: dust ? 0.9 : 0.5, color: col, alpha: dust ? 0.5 : 0.4, drag: 3, spin: 1.5 });
    }
    if (mat === 'metal' || mat === 'concrete') {
      for (let i = 0; i < (mat === 'metal' ? 8 : 4); i++) {
        this.sparks.emit(point.x, point.y, point.z, n.x * rand(1, 5) + rand(-2, 2), n.y * rand(1, 5) + rand(0, 3), n.z * rand(1, 5) + rand(-2, 2),
          { life: rand(0.15, 0.4), size: 0.035, sizeEnd: 0.01, color: [1, 0.8, 0.4], gravity: 9.8 });
      }
    }
    this.decal(point, n, 0.09 + Math.random() * 0.03, this.holeMat);
  }

  blood(point, dir) {
    for (let i = 0; i < 5; i++) {
      this.smoke.emit(point.x, point.y, point.z, dir.x * rand(0.5, 2) + rand(-0.6, 0.6), rand(-0.3, 1), dir.z * rand(0.5, 2) + rand(-0.6, 0.6),
        { life: rand(0.25, 0.5), size: 0.08, sizeEnd: 0.35, color: [0.45, 0.04, 0.03], alpha: 0.75, drag: 4 });
    }
  }

  decal(point, normal, size, mat) {
    const m = this.decals[this.decalIndex];
    this.decalIndex = (this.decalIndex + 1) % this.decals.length;
    m.material = mat;
    m.position.copy(point).addScaledVector(normal, 0.01);
    m.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(size);
    m.visible = true;
  }

  casing(pos, right) {
    const c = this.casings[this.casingIndex];
    this.casingIndex = (this.casingIndex + 1) % this.casings.length;
    c.mesh.position.copy(pos);
    c.vel.copy(right).multiplyScalar(rand(1.5, 2.5));
    c.vel.y = rand(1.5, 2.5);
    c.life = 1.5;
    c.mesh.visible = true;
  }

  explosion(pos, size = 1) {
    const q = this.quality === 'low' ? 0.5 : 1;
    for (let i = 0; i < 26 * q; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = rand(2, 7) * size;
      this.fire.emit(pos.x, pos.y + 0.3, pos.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp,
        { life: rand(0.25, 0.6), size: 0.8 * size, sizeEnd: 2.4 * size, color: [1, 0.75, 0.4], colorEnd: [0.6, 0.15, 0.02], alpha: 0.9, drag: 5 });
    }
    for (let i = 0; i < 30 * q; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(1, 5) * size;
      this.smoke.emit(pos.x + rand(-0.5, 0.5), pos.y + rand(0.2, 1.2), pos.z + rand(-0.5, 0.5), Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp,
        { life: rand(2, 4.5), size: 1 * size, sizeEnd: 5 * size, color: [0.25, 0.23, 0.21], colorEnd: [0.45, 0.43, 0.4], alpha: 0.7, drag: 1.5, spin: 0.4 });
    }
    for (let i = 0; i < 30 * q; i++) {
      this.sparks.emit(pos.x, pos.y + 0.3, pos.z, rand(-9, 9), rand(3, 12), rand(-9, 9),
        { life: rand(0.5, 1.4), size: 0.06, sizeEnd: 0.02, color: [1, 0.7, 0.3], gravity: 12 });
    }
    // Ground dust ring.
    for (let i = 0; i < 16 * q; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.smoke.emit(pos.x, 0.3, pos.z, Math.cos(a) * 8 * size, 0.3, Math.sin(a) * 8 * size,
        { life: 1.6, size: 0.8, sizeEnd: 3, color: [0.6, 0.55, 0.48], alpha: 0.5, drag: 3 });
    }
    this.flash(pos.clone().setY(pos.y + 1), 0xff9040, 60 * size, 0.35, 30);
    if (pos.y < 0.6) this.decal(new THREE.Vector3(pos.x, 0.01, pos.z), new THREE.Vector3(0, 1, 0), 3.2 * size, this.scorchMat);
  }

  flashbang(pos) {
    for (let i = 0; i < 10; i++) {
      this.fire.emit(pos.x, pos.y + 0.2, pos.z, rand(-1, 1), rand(0, 1), rand(-1, 1), { life: 0.25, size: 1.5, sizeEnd: 3, color: [1, 1, 1], alpha: 1 });
    }
    for (let i = 0; i < 12; i++) {
      this.smoke.emit(pos.x, pos.y + 0.3, pos.z, rand(-2, 2), rand(0.5, 2), rand(-2, 2), { life: 2.5, size: 0.5, sizeEnd: 2.5, color: [0.85, 0.85, 0.85], alpha: 0.4, drag: 2 });
    }
    this.flash(pos.clone().setY(pos.y + 0.5), 0xffffff, 120, 0.3, 30);
  }

  smokeCloud(pos, dt, strength = 1) {
    // Called every frame while a smoke grenade is pouring.
    const n = Math.max(1, Math.round(dt * 40 * strength));
    for (let i = 0; i < n; i++) {
      this.smoke.emit(pos.x + rand(-0.3, 0.3), pos.y + 0.2, pos.z + rand(-0.3, 0.3), rand(-2.5, 2.5), rand(0.3, 1.6), rand(-2.5, 2.5),
        { life: rand(12, 18), size: 1.5, sizeEnd: rand(6, 8), color: [0.82, 0.83, 0.84], alpha: 0.55, drag: 0.6, spin: 0.15 });
    }
  }

  smokeColumn(pos, dt) {
    if (Math.random() < dt * 6) {
      this.smoke.emit(pos.x + rand(-1, 1), pos.y, pos.z + rand(-1, 1), rand(0.3, 1), rand(2, 3.5), rand(-0.3, 0.3),
        { life: rand(8, 12), size: 2, sizeEnd: 10, color: [0.12, 0.11, 0.1], colorEnd: [0.3, 0.29, 0.28], alpha: 0.55, drag: 0.1, spin: 0.1 });
    }
    if (Math.random() < dt * 10) {
      this.fire.emit(pos.x + rand(-0.6, 0.6), pos.y, pos.z + rand(-0.6, 0.6), 0, rand(1.5, 3), 0, { life: rand(0.4, 0.8), size: 1, sizeEnd: 0.3, color: [1, 0.6, 0.2], alpha: 0.8 });
    }
  }

  update(dt, world) {
    for (const p of this.pools) p.update(dt);
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.d += t.speed * dt;
      if (t.d >= t.len) { t.active = false; t.mesh.visible = false; continue; }
      const len = Math.min(4, t.d);
      t.mesh.position.copy(t.from).addScaledVector(t.dir, t.d);
      t.mesh.lookAt(t.mesh.position.x + t.dir.x, t.mesh.position.y + t.dir.y, t.mesh.position.z + t.dir.z);
      t.mesh.scale.set(1, 1, len); // geometry spans local -Z, so the streak trails the head
    }
    for (const f of this.flashLights) {
      if (f.light.intensity <= 0) continue;
      f.t += dt;
      f.light.intensity = f.t >= f.dur ? 0 : f.peak * (1 - f.t / f.dur);
    }
    for (const c of this.casings) {
      if (!c.mesh.visible) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += dt * 20; c.mesh.rotation.y += dt * 13;
      const gy = world ? world.groundHeight(c.mesh.position.x, c.mesh.position.z, c.mesh.position.y, 0.05, 0.02) : 0;
      if (c.mesh.position.y < gy + 0.01) {
        c.mesh.position.y = gy + 0.01;
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.5; c.vel.z *= 0.5;
      }
    }
  }

  dispose() {
    for (const p of this.pools) { this.scene.remove(p.points); p.points.geometry.dispose(); p.points.material.dispose(); }
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const d of this.decals) this.scene.remove(d);
    for (const f of this.flashLights) this.scene.remove(f.light);
    for (const c of this.casings) this.scene.remove(c.mesh);
  }
}
