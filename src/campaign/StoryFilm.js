// The campaign's opening film: an in-engine cinematic that tells the story so far,
// played every time a new campaign starts (Mission 1), and on demand from the menu.
//
// Shots (about two and a half minutes):
//   1  Orbit       Earth at sunrise, the HALCYON constellation gliding past
//   2  Release     a satellite drops a rod; it burns through re-entry
//   3  Impact      the rod hits a desert test range: flash, fireball, shockwave
//   4  The key     the HALCYON key open in a secure lab
//   5  Convoy      armoured escorts and trucks on a mountain road at night
//   6  Ambush      a roadside bomb, muzzle flashes on the hill, Hart taken
//   7  Aftermath   burning wrecks, the key's case lying open and empty, a drone overhead
//   8  Vasko       MERIDIAN's founder at his window, the targets on his screens
//   9  Drone feed  Port Kaval from a drone: MERIDIAN loading crates onto a freighter
//  10  Briefing    ORION round a map table in a tent at a forward base
//  11  ORION       the team at dawn, one by one, then into the helicopter
//  12  Flight      two helicopters low over the Black Sea toward the coast
//  13  Title       the constellation over the Earth, the game's title
//
// Everything is generated in code (textures included). Subtitles narrate each shot,
// and the narration is spoken when Squad voices is on. Hold Space or click SKIP.
import * as THREE from '../lib/three.js';
import { Humanoid } from '../ai/Humanoid.js';
import { Helicopter } from '../world/Helicopter.js';
import { WEAPONS } from '../weapons/WeaponData.js';
import { Audio } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { escapeHtml } from '../core/Utils.js';
import { buildCargoTruck, buildMRAP, dressRoad, rangeTargets, rangeMountains, dressAirfield, dressOffice, dressLab, buildKeyCase, buildDrone, buildPort, buildBriefing, buildSea } from './FilmProps.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- noise
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Value noise that wraps every `px` cells in x (seamless round the globe). */
function vnoise(x, y, px, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (i) => ((i % px) + px) % px;
  const a = hash(w(xi), yi, s), b = hash(w(xi + 1), yi, s), c = hash(w(xi), yi + 1, s), d = hash(w(xi + 1), yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(u, v, base, oct, s) {
  let sum = 0, amp = 0.5, norm = 0, f = base;
  for (let o = 0; o < oct; o++) { sum += vnoise(u * f, v * f, f, s + o * 17) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
function smokeTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 14 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return tex(c);
}

/** Flame puff: hot core fading through orange to sooty edges. */
function flameTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,190,1)'); gr.addColorStop(0.35, 'rgba(255,140,40,0.95)'); gr.addColorStop(0.7, 'rgba(120,40,10,0.55)'); gr.addColorStop(1, 'rgba(30,20,15,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

// ---------------------------------------------------------------- particles
/** Pooled sprite particles: smoke, fire, sparks, dust. */
class Particles {
  constructor(scene, map, additive, max = 260) {
    this.list = [];
    this.pool = [];
    this.scene = scene;
    this.make = () => {
      const m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
      const s = new THREE.Sprite(m);
      scene.add(s);
      return s;
    };
    this.max = max;
  }
  emit(pos, vel, o = {}) {
    if (this.list.length >= this.max) return;
    const s = this.pool.pop() ?? this.make();
    s.visible = true;
    s.position.copy(pos);
    s.material.color.set(o.color ?? 0xffffff);
    s.material.rotation = Math.random() * 6.28;
    this.list.push({ s, vel: vel.clone(), life: o.life ?? 2, t: 0, size: o.size ?? 1, grow: o.grow ?? 2, alpha: o.alpha ?? 1, drag: o.drag ?? 0.6, rise: o.rise ?? 0, spin: (Math.random() - 0.5) * (o.spin ?? 0.6), fadeIn: o.fadeIn ?? 0.08 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { p.s.visible = false; this.pool.push(p.s); this.list.splice(i, 1); continue; }
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y += p.rise * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const sz = p.size * (1 + p.grow * k);
      p.s.scale.set(sz, sz, 1);
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = p.alpha * Math.min(1, p.t / p.fadeIn) * (1 - k) * (1 - k * 0.3);
    }
  }
}

// ---------------------------------------------------------------- Earth
function earthTextures() {
  const W = 1536, H = 768;
  const day = canvas(W, H), night = canvas(W, H), spec = canvas(W, H), cloud = canvas(W, H);
  const dg = day.getContext('2d'), ng = night.getContext('2d'), sg = spec.getContext('2d'), cg = cloud.getContext('2d');
  const di = dg.createImageData(W, H), ni = ng.createImageData(W, H), si = sg.createImageData(W, H), ci = cg.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const v = y / H, lat = (0.5 - v) * Math.PI, alat = Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const u = x / W, i = (y * W + x) * 4;
      let h = fbm(u, v * 0.5, 4, 6, 3) * 0.85 + fbm(u, v * 0.5, 16, 3, 9) * 0.15;
      h += (alat > 1.25 ? 0.08 : 0) - 0.02;
      const land = h > 0.53;
      const moist = fbm(u, v * 0.5, 7, 4, 41);
      // Ocean, then land blended in over a narrow band so coastlines are smooth.
      const ok = smooth((h - 0.36) / 0.17);
      let r = lerp(4, 22, ok), g = lerp(18, 70, ok), b = lerp(48, 112, ok);
      const lk = smooth((h - 0.52) / 0.022); // a soft shoreline, not a pixel step
      if (lk > 0) {
        const e = (h - 0.53) / 0.3;
        const belt = smooth((alat - 0.18) / 0.12) * (1 - smooth((alat - 0.5) / 0.15)); // dry subtropical belt
        const dry = clamp((0.6 - moist) * 2.4 + belt * 0.45 - smooth((alat - 0.75) / 0.2) * 0.8, 0, 1);
        let lr = lerp(46, 168, dry), lg = lerp(84, 138, dry), lb = lerp(36, 88, dry);
        const det = (fbm(u, v * 0.5, 64, 2, 13) - 0.5) * 30;
        lr += det; lg += det; lb += det * 0.6;
        if (e > 0.45) { const m = smooth((e - 0.45) / 0.3); lr = lerp(lr, 112, m); lg = lerp(lg, 98, m); lb = lerp(lb, 84, m); }
        if (alat > 1.0) { const m = smooth((alat - 1.0) / 0.22); lr = lerp(lr, 116, m); lg = lerp(lg, 122, m); lb = lerp(lb, 108, m); }
        r = lerp(r, lr, lk); g = lerp(g, lg, lk); b = lerp(b, lb, lk);
      }
      // Ice caps and snow on the high ground, both blended in softly.
      const snow = Math.max(smooth((alat - 1.2) / 0.14), smooth(((h - 0.53) / 0.3 - 0.78) / 0.12) * smooth((h - 0.52) / 0.022));
      if (snow > 0) { r = lerp(r, 236, snow); g = lerp(g, 242, snow); b = lerp(b, 248, snow); }
      di.data[i] = r; di.data[i + 1] = g; di.data[i + 2] = b; di.data[i + 3] = 255;
      si.data[i] = si.data[i + 1] = si.data[i + 2] = land || alat > 1.25 ? 10 : 255; si.data[i + 3] = 255;
      // City lights: clusters on habitable land, densest near coasts.
      let L = 0;
      if (land && alat < 1.1) {
        const coast = 1 - smooth((h - 0.53) / 0.12);
        const city = hash(x >> 1, y >> 1, 77);
        const cluster = fbm(u, v * 0.5, 24, 2, 55);
        if (city > 0.992 - coast * 0.012 && cluster > 0.52) L = 0.9;
        else if (cluster > 0.64 && hash(x, y, 91) > 0.965) L = 0.45;
      }
      ni.data[i] = 255 * L; ni.data[i + 1] = 190 * L; ni.data[i + 2] = 110 * L; ni.data[i + 3] = 255;
      const c = fbm(u, v * 0.5, 6, 5, 123) * 0.75 + fbm(u, v * 0.5, 24, 3, 7) * 0.25;
      const a = smooth((c - 0.57) / 0.22) * 205;
      ci.data[i] = ci.data[i + 1] = ci.data[i + 2] = 255; ci.data[i + 3] = a;
    }
  }
  dg.putImageData(di, 0, 0); ng.putImageData(ni, 0, 0); sg.putImageData(si, 0, 0); cg.putImageData(ci, 0, 0);
  return { day: tex(day), night: tex(night), spec: tex(spec, false), cloud: tex(cloud) };
}

function buildEarth(R, sunDir) {
  const t = earthTextures();
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { day: { value: t.day }, night: { value: t.night }, spec: { value: t.spec }, sunDir: { value: sunDir }, camPos: { value: V() } },
    vertexShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform sampler2D spec; uniform vec3 sunDir; uniform vec3 camPos;
      varying vec3 vN; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN);
        float ndl = dot(n, sunDir);
        vec3 d = texture2D(day, vUv).rgb;
        vec3 nl = texture2D(night, vUv).rgb;
        float lit = smoothstep(-0.2, 0.32, ndl);
        vec3 col = d * (0.02 + 0.95 * max(ndl, 0.0));
        col = mix(nl * 1.3 + d * 0.012, col, lit);
        vec3 v = normalize(camPos - vW);
        vec3 h = normalize(sunDir + v);
        col += vec3(1.0, 0.86, 0.66) * pow(max(dot(n, h), 0.0), 70.0) * texture2D(spec, vUv).r * 1.4 * lit;
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col += vec3(0.25, 0.5, 1.0) * rim * (0.15 + 0.85 * lit) * 0.7;
        col += vec3(1.0, 0.45, 0.15) * rim * smoothstep(-0.2, 0.05, ndl) * (1.0 - lit) * 0.6; // terminator glow
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 64), mat);
  g.add(earth);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.01, 96, 48), new THREE.MeshLambertMaterial({ map: t.cloud, color: 0xdfe4ea, transparent: true, depthWrite: false }));
  g.add(clouds);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 96, 48), new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir }, camPos: { value: V() } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 sunDir; uniform vec3 camPos; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 v = normalize(camPos - vW); vec3 n = normalize(vN);
        float f = pow(1.0 - abs(dot(n, v)), 2.2);
        float s = 0.12 + 0.88 * smoothstep(-0.35, 0.45, dot(n, sunDir));
        vec3 c = mix(vec3(1.0, 0.5, 0.25), vec3(0.32, 0.62, 1.0), smoothstep(-0.1, 0.4, dot(n, sunDir)));
        gl_FragColor = vec4(c * f * s * 1.6, f * s); }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  g.add(atmo);
  return { group: g, earth, clouds, uniforms: [mat.uniforms, atmo.material.uniforms] };
}

function starfield(r) {
  const n = 5000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    // Denser along a band (the Milky Way).
    const band = Math.random() < 0.45 ? (Math.random() - 0.5) * 0.25 : u;
    const ss = Math.sqrt(1 - band * band);
    pos[i * 3] = Math.cos(a) * ss * r; pos[i * 3 + 1] = band * r; pos[i * 3 + 2] = Math.sin(a) * ss * r;
    const w = 0.55 + Math.random() * 0.45, tint = Math.random();
    col[i * 3] = w * (tint > 0.85 ? 1 : 0.85); col[i * 3 + 1] = w * 0.9; col[i * 3 + 2] = w * (tint < 0.2 ? 1 : 0.9);
    void s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
}

// ---------------------------------------------------------------- satellite
function buildSatellite() {
  const g = new THREE.Group();
  const foilC = canvas(128, 128), fg = foilC.getContext('2d');
  for (let i = 0; i < 260; i++) { fg.fillStyle = `hsl(${40 + Math.random() * 8}, 70%, ${35 + Math.random() * 30}%)`; fg.fillRect(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 20, 3 + Math.random() * 12); }
  const foil = new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 1, roughness: 0.32, map: tex(foilC), bumpMap: tex(foilC, false), bumpScale: 2 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 0.2, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.6, roughness: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.9, roughness: 0.3 });
  const cellsC = canvas(256, 128), cgx = cellsC.getContext('2d');
  cgx.fillStyle = '#0b1a3a'; cgx.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 16) for (let y = 0; y < 128; y += 16) { cgx.fillStyle = `rgb(${18 + Math.random() * 10},${36 + Math.random() * 14},${84 + Math.random() * 30})`; cgx.fillRect(x + 1, y + 1, 14, 14); }
  cgx.strokeStyle = 'rgba(200,210,230,0.5)';
  for (let x = 0; x <= 256; x += 64) { cgx.beginPath(); cgx.moveTo(x, 0); cgx.lineTo(x, 128); cgx.stroke(); }
  const cells = new THREE.MeshStandardMaterial({ map: tex(cellsC), metalness: 0.6, roughness: 0.25, color: 0xffffff });
  const add = (geo, m, x, y, z, parent = g) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  add(new THREE.BoxGeometry(1.2, 1.5, 1.2), foil, 0, 0, 0);
  add(new THREE.BoxGeometry(1.24, 0.12, 1.24), white, 0, 0.8, 0);
  add(new THREE.BoxGeometry(1.24, 0.12, 1.24), white, 0, -0.8, 0);
  // Rod magazine under the bus: a frame of long tungsten rods.
  const mag = new THREE.Group(); mag.position.set(0, -1.5, 0); g.add(mag);
  add(new THREE.BoxGeometry(1.0, 0.08, 1.0), dark, 0, 0.7, 0, mag);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 10), steel, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, mag); }
  add(new THREE.BoxGeometry(1.0, 0.08, 1.0), dark, 0, -0.7, 0, mag);
  // Solar wings.
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), steel, s * 1.15, 0, 0).rotation.z = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const p = add(new THREE.BoxGeometry(1.3, 0.03, 1.6), cells, s * (2.35 + k * 1.34), 0, 0);
      p.rotation.x = 0.06;
    }
  }
  // Dish, star trackers, thrusters.
  const dish = new THREE.Mesh(new THREE.LatheGeometry([V(0, 0), V(0.35, 0.05), V(0.62, 0.22), V(0.64, 0.25)], 24), white);
  dish.material.side = THREE.DoubleSide;
  dish.position.set(0, 0.86, 0.35); dish.rotation.x = -0.9; g.add(dish);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), steel, 0, 1.05, 0.48).rotation.x = -0.9;
  for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45]]) add(new THREE.BoxGeometry(0.16, 0.16, 0.22), dark, x, 0.95, z);
  for (const [x, z] of [[0.5, -0.5], [-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { const n = add(new THREE.ConeGeometry(0.06, 0.14, 10, 1, true), steel, x, -0.9, z); n.rotation.x = Math.PI; }
  const ledR = add(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }), 0.62, 0.7, 0.62);
  const ledG = add(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20ff60, toneMapped: false }), -0.62, 0.7, 0.62);
  g.userData = { mag, ledR, ledG };
  return g;
}

// ---------------------------------------------------------------- sets
function skyDome(top, horizon, sunDir, sunColor = 0xffc07a) {
  return new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(horizon) }, sun: { value: sunDir.clone().normalize() }, sunC: { value: new THREE.Color(sunColor) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform vec3 sunC; varying vec3 vD;
      void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55));
        float s = max(dot(normalize(vD), sun), 0.0); c += sunC * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.45);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
}

function terrain(size, seg, amp, color, seed, flatten = null) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    let h = (fbm(x / size + 0.5, z / size + 0.5, 6, 5, seed) - 0.5) * amp;
    if (flatten) h *= flatten(x, z);
    P.setY(i, h);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

function screenCanvas(draw, w = 512, h = 288) { const c = canvas(w, h); draw(c.getContext('2d'), w, h); return tex(c); }

// ---------------------------------------------------------------- the film
const LINES = {
  orbit: [[0.8, 'HALCYON. A ring of American satellites, three hundred kilometres up.'], [6.2, 'Each one carries steel rods that can be dropped onto any target on Earth.']],
  release: [[0.5, 'No warning. No defence.']],
  impact: [[0.6, 'One strike hits as hard as a small nuclear weapon.'], [5.5, 'Anywhere. In minutes.']],
  key: [[0.5, 'Firing it takes the HALCYON key, a control unit the size of a suitcase,'], [5.2, 'the launch codes, and a dish big enough to reach the satellites.']],
  convoy: [[0.6, 'Eleven days ago, the key left the Halden research facility under armed escort.']],
  ambush: [[0.4, 'The convoy was ambushed. Forty-one soldiers and engineers died in under six minutes.'], [6.6, 'The key vanished. So did the engineer who built it: Dr. Lena Hart.']],
  aftermath: [[0.6, 'By the time a drone reached the road, only the fires were moving.'], [6.4, 'The key\'s case lay open in the dirt. Empty.']],
  drone: [[0.6, 'Eleven days later, a drone over the harbour at Port Kaval watched MERIDIAN load crates onto a freighter.'], [6.8, 'One of them, the size of a suitcase, never left a man\'s hands.']],
  briefing: [[0.6, 'At a forward base on the Black Sea coast, the footage lands on one table.'], [6.4, 'Find which container the key is in, before that ship sails.']],
  flight: [[0.6, 'That night, ORION flies in low over the water, no lights.'], [6.0, 'Wraith goes into the harbour alone.']],
  vasko: [[0.6, 'The attackers were MERIDIAN, a private army of former special forces.'], [6.2, 'Their founder, Anton Vasko, means to sell HALCYON\'s power to the highest bidder.']],
  orion: [[0.6, 'Task Force ORION: four US Army Special Forces operators who officially do not exist.'], [13.5, 'Their orders: find the key. Stop MERIDIAN. Bring Vasko in.']],
  title: [[0.8, 'You are Sergeant Elias "Wraith" Cole.']],
};

export class StoryFilm {
  /** app: the App (renderer, ui); onDone(): called when the film ends or is skipped. */
  constructor(app, onDone) {
    this.app = app;
    this.r = app.renderer;
    this.onDone = onDone;
    this.t = 0;
    this.shot = -1;
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 4000);
    this.glow = glowTexture();
    this.smokeTex = smokeTexture();
    this.disposables = [];
    this._buildOverlay();
    this._buildSpace();
    this._buildRange();
    this._buildLab();
    this._buildRoad();
    this._buildOffice();
    this._buildAirfield();
    this._buildPortScene();
    this._buildTent();
    this._buildSeaScene();
    this.shots = [
      { id: 'orbit', dur: 12, scene: this.space },
      { id: 'release', dur: 8, scene: this.space },
      { id: 'impact', dur: 10, scene: this.range },
      { id: 'key', dur: 10, scene: this.lab },
      { id: 'convoy', dur: 11, scene: this.road },
      { id: 'ambush', dur: 13, scene: this.road },
      { id: 'aftermath', dur: 12, scene: this.road },
      { id: 'vasko', dur: 12, scene: this.office },
      { id: 'drone', dur: 13, scene: this.port },
      { id: 'briefing', dur: 12, scene: this.tent },
      { id: 'orion', dur: 19, scene: this.airfield },
      { id: 'flight', dur: 12, scene: this.seaScene },
      { id: 'title', dur: 9, scene: this.space },
    ];
    this.total = this.shots.reduce((a, s) => a + s.dur, 0);
    Audio.playMusic('tension');
    Audio.preloadVoices('NARRATOR');
    this._next();
  }

  // ---------- overlay ----------
  _buildOverlay() {
    const el = document.createElement('div');
    el.className = 'film';
    el.innerHTML = `<div class="film-bar top"></div><div class="film-bar bottom"></div>
      <div class="film-fade"></div><div class="film-flash"></div>
      <div class="film-card"></div><div class="film-title"></div>
      <div class="film-sub"></div>
      <div class="film-hud"><div class="fh-tl">MQ-9 // FEED 2<br>EO/IR WHT-HOT</div><div class="fh-tr">PORT KAVAL<br><span class="fh-time"></span></div><div class="fh-bl">ALT 18,400 FT<br>SLANT 6.1 KM</div><div class="fh-br">TGT 03<br>TRACK</div><div class="fh-x"></div><div class="fh-box"></div></div>
      <button class="film-skip" type="button">SKIP ▸ <small>hold SPACE</small><i></i></button>`;
    this.app.ui.appendChild(el);
    this.el = el;
    this.$ = (s) => el.querySelector(s);
    this.$('.film-skip').addEventListener('click', () => this.finish());
    this.holdSkip = 0;
  }

  say(text) {
    const s = this.$('.film-sub');
    s.classList.remove('on');
    void s.offsetWidth;
    s.textContent = text;
    s.classList.add('on');
    // The recorded narrator, or the browser's voice where a line has no recording.
    if (Audio.voice('NARRATOR', text)) return;
    if (Store.settings.squadVoice && !this.app.testMode && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      try {
        const ss = window.speechSynthesis;
        ss.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const voices = ss.getVoices().filter((v) => /^en/i.test(v.lang));
        const male = voices.filter((v) => /male|david|mark|guy|daniel|george|james|fred|alex|tom|aaron|arthur|ryan/i.test(v.name) && !/female/i.test(v.name));
        if (voices.length) u.voice = (male.length ? male : voices)[0];
        u.rate = 0.92; u.pitch = 0.72;
        u.volume = clamp((Store.settings.masterVolume ?? 0.8) * 1.1, 0, 1);
        ss.speak(u);
      } catch { /* no speech */ }
    }
  }

  card(html) { const c = this.$('.film-card'); c.innerHTML = html ?? ''; c.classList.toggle('on', !!html); }
  title(html) { const c = this.$('.film-title'); c.innerHTML = html ?? ''; c.classList.toggle('on', !!html); }
  flash(k) { this.$('.film-flash').style.opacity = String(clamp(k, 0, 1)); }

  // ---------- sets ----------
  _buildSpace() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x000004);
    this.sunDir = V(0.75, 0.18, 0.62).normalize();
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
    sun.position.copy(this.sunDir).multiplyScalar(500);
    s.add(sun, new THREE.AmbientLight(0x1a2030, 0.3));
    s.add(starfield(1800));
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sunSprite.position.copy(this.sunDir).multiplyScalar(1500);
    sunSprite.scale.set(260, 260, 1);
    s.add(sunSprite);
    this.earth = buildEarth(60, this.sunDir);
    s.add(this.earth.group);
    // The constellation: ten satellites on an inclined ring.
    this.ring = new THREE.Group();
    this.ring.rotation.set(0.35, 0, 0.18);
    s.add(this.ring);
    this.sats = [];
    const proto = buildSatellite();
    for (let i = 0; i < 10; i++) {
      const sat = i === 0 ? proto : proto.clone(true);
      sat.userData = { ...proto.userData, angle: (i / 10) * Math.PI * 2 };
      if (i > 0) sat.userData.mag = sat.children.find((c) => c.isGroup);
      sat.scale.setScalar(0.32);
      this.ring.add(sat);
      this.sats.push(sat);
    }
    // The falling rod and its re-entry glow.
    this.rod = new THREE.Group();
    const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 10), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.3 }));
    this.rod.add(rodMesh);
    this.rodGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
    this.rod.add(this.rodGlow);
    this.rod.visible = false;
    s.add(this.rod);
    this.spaceFx = new Particles(s, this.glow, true, 220);
    this.space = s;
  }

  _buildRange() {
    const s = new THREE.Scene();
    const sunDir = V(-0.6, 0.12, -0.78).normalize();
    s.add(skyDome(0x1a2340, 0xd08a52, sunDir, 0xffa060));
    s.fog = new THREE.Fog(0xb88458, 120, 1100);
    const sun = new THREE.DirectionalLight(0xffc08a, 2.2);
    sun.position.copy(sunDir).multiplyScalar(300);
    s.add(sun, new THREE.HemisphereLight(0x8090b0, 0x5a4030, 0.7));
    const ground = terrain(2400, 160, 26, 0xb79466, 5, (x, z) => clamp((Math.hypot(x, z) - 80) / 300, 0.15, 1));
    s.add(ground);
    // Mountain ridges all round the desert range.
    s.add(rangeMountains(fbm));
    // The target: a compound of bunkers, containers, a tower, a mast and old vehicles.
    this.targets = rangeTargets();
    this.targets.position.set(0, 0, -260);
    s.add(this.targets);
    this.streak = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.2, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.streakHead = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.streakHead.scale.set(30, 30, 1);
    s.add(this.streak, this.streakHead);
    this.fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.shock = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffe6c0, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shock.rotation.x = -Math.PI / 2;
    this.boomLight = new THREE.PointLight(0xffc080, 0, 900, 2);
    s.add(this.fireball, this.shock, this.boomLight);
    this.rangeDust = new Particles(s, this.smokeTex, false, 260);
    this.rangeFire = new Particles(s, this.glow, true, 200);
    this.rangeFlame = new Particles(s, this.flameTex ??= flameTexture(), false, 200);
    this.range = s;
  }

  _buildLab() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x05070a);
    s.fog = new THREE.Fog(0x05070a, 6, 22);
    s.add(new THREE.HemisphereLight(0x2a3a50, 0x0a0a0c, 0.5));
    const key = new THREE.SpotLight(0xbfd8ff, 60, 14, 0.5, 0.6, 1.5);
    key.position.set(-2.5, 4.2, 2.5); key.target.position.set(0, 1, 0);
    s.add(key, key.target);
    const rim = new THREE.PointLight(0x4080ff, 6, 6);
    rim.position.set(2, 1.6, -1.5);
    s.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.35, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.4, metalness: 0.8 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.2), steel);
    table.position.set(0, 0.9, 0);
    s.add(table);
    for (const [x, z] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), steel); l.position.set(x, 0.45, z); s.add(l); }
    // The HALCYON key: a black hard case, lid up, screen and keypad inside.
    const caseM = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.55, metalness: 0.3 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.3, metalness: 0.9 });
    const k = new THREE.Group(); k.position.set(0, 0.94, 0); s.add(k);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.6), caseM); base.position.y = 0.08; k.add(base);
    for (const z of [-0.3, 0.3]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.03, 0.03), edge); e.position.set(0, 0.16, z); k.add(e); }
    const lid = new THREE.Group(); lid.position.set(0, 0.16, -0.3); lid.rotation.x = -1.85; k.add(lid);
    const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.6), caseM); lidM.position.set(0, 0.0, 0.3); lid.add(lidM);
    this.keyScreenTex = screenCanvas(() => {}, 512, 320);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.45), new THREE.MeshBasicMaterial({ map: this.keyScreenTex, toneMapped: false }));
    screen.position.set(0, -0.025, 0.3); screen.rotation.x = Math.PI / 2; lid.add(screen);
    for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: i === 11 ? 0xa01818 : 0x2a2c30, roughness: 0.5, emissive: i === 11 ? 0x400000 : 0x000000 })); b.position.set(-0.28 + (i % 4) * 0.09, 0.17, -0.05 + Math.floor(i / 4) * 0.08); k.add(b); }
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.45, 0.1, 0), V(0.8, 0, 0.1), V(1.2, -0.1, -0.2), V(1.6, -0.4, -0.6)]), 30, 0.015, 6), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.6 }));
    k.add(cable);
    // Server racks with blinking LEDs behind.
    this.labLeds = [];
    for (let r = 0; r < 4; r++) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.9), new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.5, metalness: 0.6 }));
      rack.position.set(-2.4 + r * 1.6, 1.1, -3.2);
      s.add(rack);
      for (let j = 0; j < 14; j++) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: j % 4 === 0 ? 0xffa020 : 0x30a0ff, toneMapped: false }));
        led.position.set(rack.position.x - 0.3 + (j % 2) * 0.1, 0.3 + j * 0.13, -2.74);
        s.add(led);
        this.labLeds.push(led);
      }
    }
    this.keyCase = k;
    dressLab(s);
    this.lab = s;
  }

  _drawKeyScreen(t) {
    const c = this.keyScreenTex.image, g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#020a12'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(90,180,255,0.9)'; g.lineWidth = 2;
    g.fillStyle = '#7fd0ff'; g.font = 'bold 22px monospace'; g.fillText('HALCYON // STRIKE AUTHORIZATION', 18, 34);
    g.fillRect(18, 44, W - 36, 2);
    // A spinning wireframe globe with the satellite ring.
    const cx = 140, cy = 180, R = 95;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 6; i++) { const a = t * 0.6 + (i / 6) * Math.PI; g.beginPath(); g.ellipse(cx, cy, Math.abs(Math.cos(a)) * R, R, 0, 0, Math.PI * 2); g.stroke(); }
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(cx, cy + i * 34, Math.sqrt(R * R - (i * 34) ** 2), 10, 0, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = 'rgba(255,190,80,0.9)';
    g.beginPath(); g.ellipse(cx, cy, R * 1.35, R * 0.45, -0.3, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 10; i++) { const a = t * 0.4 + (i / 10) * Math.PI * 2; const x = cx + Math.cos(a) * R * 1.35 * Math.cos(-0.3) - Math.sin(a) * R * 0.45 * Math.sin(-0.3), y = cy + Math.cos(a) * R * 1.35 * Math.sin(-0.3) + Math.sin(a) * R * 0.45 * Math.cos(-0.3); g.fillStyle = '#ffc050'; g.fillRect(x - 3, y - 3, 6, 6); }
    g.fillStyle = '#7fd0ff'; g.font = '16px monospace';
    const lines = ['CONSTELLATION ........ 10/10 ONLINE', 'ROD MAGAZINES ........ 60 READY', 'UPLINK DISH .......... NOT FOUND', 'LAUNCH CODES ......... REQUIRED'];
    lines.forEach((l, i) => { g.fillStyle = i >= 2 ? (Math.sin(t * 5) > 0 ? '#ff5040' : '#802018') : '#7fd0ff'; g.fillText(l, 268, 110 + i * 30); });
    g.fillStyle = 'rgba(127,208,255,0.5)';
    g.fillText(`T+${(t * 37).toFixed(0).padStart(5, '0')}`, 268, 260);
    this.keyScreenTex.needsUpdate = true;
  }

  _buildRoad() {
    const s = new THREE.Scene();
    s.add(skyDome(0x02040a, 0x0c1424, V(0.3, 0.4, -0.8), 0x405070));
    s.fog = new THREE.FogExp2(0x0a1020, 0.008);
    // Moonlight from the camera side so the convoy reads in the dark.
    const moon = new THREE.DirectionalLight(0x9ab4e0, 2.1);
    moon.position.set(50, 110, 75);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 400 });
    s.add(moon, new THREE.HemisphereLight(0x4a5a80, 0x141008, 1.3));
    // Hills either side of a road that runs along x.
    const hills = terrain(900, 180, 60, 0x2c3326, 21, (x, z) => clamp((Math.abs(z) - 9) / 40, 0, 1));
    s.add(hills);
    const roadC = canvas(512, 64), rg = roadC.getContext('2d');
    rg.fillStyle = '#26282b'; rg.fillRect(0, 0, 512, 64);
    for (let i = 0; i < 4000; i++) { rg.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},255,0.04)`; rg.fillRect(Math.random() * 512, Math.random() * 64, 2, 2); }
    rg.fillStyle = '#c8b060'; for (let x = 0; x < 512; x += 64) rg.fillRect(x, 30, 36, 3);
    const rt = tex(roadC); rt.wrapS = THREE.RepeatWrapping; rt.repeat.set(40, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(1200, 9), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.85 }));
    road.rotation.x = -Math.PI / 2; road.position.y = 0.03; road.receiveShadow = true;
    s.add(road);
    // The convoy: an armoured escort up front, two cargo trucks (the key rides in
    // the second vehicle), another escort at the rear.
    this.trucks = [
      buildMRAP({ code: 'B-2-5 11' }),
      buildCargoTruck({ color: 0x8a7f62, seed: 2, code: 'HQ-12' }),
      buildCargoTruck({ color: 0x7d7660, seed: 3, code: 'HQ-14' }),
      buildMRAP({ seed: 6, code: 'B-2-5 14' }),
    ];
    this.trucks.forEach((tk, i) => { tk.position.set(-i * 16, 0, 0); s.add(tk); });
    this.headlights = this.trucks.map((tk) => {
      const L = new THREE.SpotLight(0xfff0d0, 120, 70, 0.42, 0.5, 1.6);
      L.position.copy(tk.userData.lightAt); L.target.position.set(30, 0, 0);
      tk.add(L, L.target);
      return L;
    });
    // Poles and wires, marker posts, rocks, scrub and pines along the road.
    dressRoad(s, (x, z) => this._hillY(x, z), { from: -300, to: 320 });
    this.roadFire = new Particles(s, this.glow, true, 180);
    this.roadSmoke = new Particles(s, this.smokeTex, false, 200);
    this.muzzles = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd070, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.scale.set(1.6, 1.6, 1); m.visible = false; s.add(m);
      this.muzzles.push({ s: m, pos: V(-30 + i * 6 + Math.random() * 3, 0, -30 - Math.random() * 20), t: Math.random() });
    }
    for (const mz of this.muzzles) mz.pos.y = this._hillY(mz.pos.x, mz.pos.z) + 1.4;
    this.tracers = [];
    const tm = new THREE.LineBasicMaterial({ color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 10; i++) { const geo = new THREE.BufferGeometry().setFromPoints([V(), V()]); const l = new THREE.Line(geo, tm); l.visible = false; s.add(l); this.tracers.push({ l, t: 99 }); }
    this.ieds = new THREE.PointLight(0xffa050, 0, 120, 1.5);
    s.add(this.ieds);
    // MERIDIAN fighters coming down the slope, and Hart.
    this.raiders = [];
    for (let i = 0; i < 6; i++) {
      const h = new Humanoid('meridian', i === 2 ? 'juggernaut' : 'rk74', { seed: 30 + i });
      const x = -24 + i * 2.2, z = -22 - (i % 2) * 2;
      h.root.position.set(x, this._hillY(x, z), z);
      h.root.rotation.y = 0;
      h.root.visible = false;
      s.add(h.root);
      this.raiders.push(h);
    }
    this.hart = new Humanoid('civilian', 'p11', { seed: 5 });
    this.hart.setCaptive('back');
    this.hart.root.visible = false;
    s.add(this.hart.root);
    this.hartGuards = [0, 1].map((i) => { const h = new Humanoid('meridian', 'wasp', { seed: 50 + i }); h.root.visible = false; s.add(h.root); return h; });
    // For the aftermath: the key's case, thrown open, and a drone on its way.
    this.emptyCase = buildKeyCase(); this.emptyCase.visible = false; s.add(this.emptyCase);
    this.drone = buildDrone(); this.drone.visible = false; s.add(this.drone);
    this.road = s;
  }

  _hillY(x, z) {
    const size = 900;
    return (fbm(x / size + 0.5, z / size + 0.5, 6, 5, 21) - 0.5) * 60 * clamp((Math.abs(z) - 9) / 40, 0, 1);
  }

  _buildOffice() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x020203);
    // City at night beyond the window (a wall of lit windows, far off).
    const cityC = canvas(1024, 256), cg = cityC.getContext('2d');
    const sky = cg.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, '#05070f'); sky.addColorStop(1, '#1c1420');
    cg.fillStyle = sky; cg.fillRect(0, 0, 1024, 256);
    for (let b = 0; b < 60; b++) {
      const x = Math.random() * 1024, w = 18 + Math.random() * 50, h = 40 + Math.random() * 170;
      cg.fillStyle = '#07080c'; cg.fillRect(x, 256 - h, w, h);
      for (let wy = 256 - h + 6; wy < 250; wy += 8) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (Math.random() > 0.72) { cg.fillStyle = Math.random() > 0.8 ? '#ffd9a0' : '#d6a060'; cg.fillRect(wx, wy, 3, 4); }
    }
    const city = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshBasicMaterial({ map: tex(cityC), toneMapped: false }));
    city.position.set(0, 3, -16);
    s.add(city);
    const frame = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.5, metalness: 0.5 });
    for (const x of [-3, -1, 1, 3]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.6, 0.12), frame); m.position.set(x, 2.5, -5.9); s.add(m); }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.4), new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.25 }));
    glass.position.set(0, 2.5, -5.95);
    s.add(glass);
    // Monitor wall: world map with targets, the HALCYON UI, a buyers list.
    this.monitorTex = [0, 1, 2].map(() => screenCanvas(() => {}, 512, 288));
    this.monitorTex.forEach((t, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.07), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
      m.position.set(4.2 + (i - 1) * 0.2, 2.2 + (i === 1 ? 1.2 : 0), -2 + (i - 1) * 2.05);
      m.rotation.y = -Math.PI / 2;
      if (i !== 1) m.position.set(6.9, 1.9, -1.2 + (i - 1) * 2.1);
      else m.position.set(6.9, 3.05, -1.2);
      s.add(m);
    });
    // MERIDIAN emblem.
    const embC = canvas(256, 256), eg = embC.getContext('2d');
    eg.fillStyle = '#0b0b0c'; eg.fillRect(0, 0, 256, 256);
    eg.strokeStyle = '#b01e1e'; eg.lineWidth = 10; eg.beginPath(); eg.arc(128, 118, 80, 0, Math.PI * 2); eg.stroke();
    eg.lineWidth = 6; eg.beginPath(); eg.moveTo(128, 30); eg.lineTo(128, 206); eg.stroke();
    eg.beginPath(); eg.ellipse(128, 118, 40, 80, 0, 0, Math.PI * 2); eg.stroke();
    eg.fillStyle = '#c8c8c8'; eg.font = 'bold 26px sans-serif'; eg.textAlign = 'center'; eg.fillText('MERIDIAN', 128, 240);
    const emb = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ map: tex(embC), roughness: 0.8 }));
    emb.position.set(-6.9, 2.6, -1); emb.rotation.y = Math.PI / 2;
    s.add(emb);
    this.officeRed = new THREE.PointLight(0xff2a20, 8, 14, 1.6);
    this.officeRed.position.set(-3, 4.2, 2);
    s.add(this.officeRed);
    const moon = new THREE.DirectionalLight(0x6f86b0, 0.8);
    moon.position.set(0, 4, -12);
    s.add(moon, new THREE.AmbientLight(0x101218, 0.6));
    const screenLight = new THREE.PointLight(0x4fa8ff, 2.2, 9, 1.4);
    screenLight.position.set(5.5, 2.5, -1.2);
    s.add(screenLight);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 0.4, metalness: 0.2 }));
    desk.position.set(1.8, 0.78, 1.2);
    s.add(desk);
    this.vasko = new Humanoid('suit', 'p11', { seed: 99 });
    this.vasko.setCaptive('side');
    this.vasko.root.position.set(0.4, 0, -4.6);
    this.vasko.root.rotation.y = 0; // facing the window (away from the camera)
    s.add(this.vasko.root);
    this.office = s;
    this._walls();
    dressOffice(s);
    // The banker's lamp on the desk throws a warm pool over the desk and chair.
    const lampL = new THREE.PointLight(0xffc27a, 5, 7, 1.6);
    lampL.position.set(1.0, 1.1, 1.3);
    s.add(lampL);
  }

  /** The office: walls, floor and ceiling, with an 8 x 4.4 m window in the back wall. */
  _walls() {
    const s = this.office;
    const m = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.85 });
    const wall = (w, h, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; s.add(p); return p; };
    wall(12, 5, -7, 2.5, 0, Math.PI / 2); wall(12, 5, 7, 2.5, 0, -Math.PI / 2); wall(14, 5, 0, 2.5, 6, Math.PI);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.7, metalness: 0.15 })); floor.rotation.x = -Math.PI / 2; s.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), m); ceil.rotation.x = Math.PI / 2; ceil.position.y = 5; s.add(ceil);
    // Back wall in four pieces round an 8 x 4.4 window.
    wall(3, 5, -5.5, 2.5, -6, 0); wall(3, 5, 5.5, 2.5, -6, 0); wall(8, 0.3, 0, 0.15, -6, 0); wall(8, 0.3, 0, 4.85, -6, 0);
  }

  _drawMonitors(t) {
    const [map, ui, buyers] = this.monitorTex;
    let g = map.image.getContext('2d');
    let W = 512, H = 288;
    g.fillStyle = '#03080f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#123050';
    for (let y = 20; y < H - 10; y += 6) for (let x = 10; x < W - 10; x += 6) { const u = x / W, v = y / H; if (fbm(u, v * 0.5, 4, 5, 3) > 0.53) g.fillRect(x, y, 4, 4); }
    const targets = [[0.18, 0.35], [0.47, 0.3], [0.53, 0.42], [0.74, 0.38], [0.8, 0.6], [0.3, 0.62]];
    targets.forEach(([u, v], i) => { const p = (Math.sin(t * 3 + i) + 1) / 2; g.strokeStyle = `rgba(255,60,40,${0.4 + p * 0.6})`; g.lineWidth = 2; g.beginPath(); g.arc(u * W, v * H, 6 + p * 8, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#ff4030'; g.fillRect(u * W - 2, v * H - 2, 4, 4); });
    g.fillStyle = '#ff5040'; g.font = 'bold 18px monospace'; g.fillText('STRIKE CANDIDATES: 6', 14, 24);
    map.needsUpdate = true;
    g = ui.image.getContext('2d');
    g.fillStyle = '#02060a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffb040'; g.font = 'bold 22px monospace'; g.fillText('HALCYON — ASSET SECURED', 16, 36);
    g.fillStyle = '#c08030'; g.font = '16px monospace';
    ['KEY .............. IN HAND', 'ENGINEER ......... IN HAND', 'DISH ............. SURVEYING', 'DEMONSTRATION .... 1 STRIKE'].forEach((l, i) => g.fillText(l, 16, 80 + i * 32));
    g.strokeStyle = '#ffb040'; g.strokeRect(16, 220, W - 32, 22); g.fillStyle = '#ffb040'; g.fillRect(18, 222, (W - 36) * ((t * 0.05) % 1), 18);
    ui.needsUpdate = true;
    g = buyers.image.getContext('2d');
    g.fillStyle = '#05050a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d0d0d8'; g.font = 'bold 20px monospace'; g.fillText('BIDS', 16, 32);
    g.font = '16px monospace';
    [['BUYER 1', '$ 2.1 B'], ['BUYER 2', '$ 2.6 B'], ['BUYER 3', '$ 3.4 B']].forEach(([a, b], i) => { g.fillStyle = i === 2 ? '#ff5040' : '#9090a0'; g.fillText(a, 16, 80 + i * 40); g.fillText(b, 300, 80 + i * 40); });
    buyers.needsUpdate = true;
  }

  _buildAirfield() {
    const s = new THREE.Scene();
    const sunDir = V(0.9, 0.08, -0.4).normalize();
    s.add(skyDome(0x24324a, 0xf0a060, sunDir, 0xffb070));
    s.fog = new THREE.Fog(0xc89a78, 60, 700);
    const sun = new THREE.DirectionalLight(0xffc89a, 2.6);
    sun.position.copy(sunDir).multiplyScalar(120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 300 });
    s.add(sun, new THREE.HemisphereLight(0x9ab0d0, 0x5a4a3a, 1.25));
    const padC = canvas(512, 512), pg = padC.getContext('2d');
    pg.fillStyle = '#6e6c68'; pg.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) { pg.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.035)`; pg.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
    pg.strokeStyle = 'rgba(30,30,30,0.6)'; pg.lineWidth = 2; for (let x = 0; x <= 512; x += 128) { pg.beginPath(); pg.moveTo(x, 0); pg.lineTo(x, 512); pg.stroke(); pg.beginPath(); pg.moveTo(0, x); pg.lineTo(512, x); pg.stroke(); }
    const pt = tex(padC); pt.wrapS = pt.wrapT = THREE.RepeatWrapping; pt.repeat.set(30, 30);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.95 }));
    pad.rotation.x = -Math.PI / 2; pad.receiveShadow = true;
    s.add(pad);
    const hC = canvas(256, 256), hg = hC.getContext('2d');
    hg.strokeStyle = '#e8e0c8'; hg.lineWidth = 14; hg.beginPath(); hg.arc(128, 128, 110, 0, Math.PI * 2); hg.stroke(); hg.fillStyle = '#e8e0c8'; hg.font = 'bold 150px sans-serif'; hg.textAlign = 'center'; hg.fillText('H', 128, 182);
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ map: tex(hC), transparent: true, roughness: 0.9 }));
    hm.rotation.x = -Math.PI / 2; hm.position.set(0, 0.02, -14); s.add(hm);
    this.heli = new Helicopter(s);
    this.heli.group.position.set(0, 0, -14);
    this.heli.group.rotation.y = Math.PI / 2;
    this.heli.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Hangars, barriers, crates, light towers, windsock, taxiway lights; a fuel
    // truck, an escort vehicle and a second helicopter on the line.
    dressAirfield(s);
    const fuel = buildCargoTruck({ body: 'tanker', color: 0x5d6248, seed: 8, code: 'FUEL 3' });
    fuel.position.set(15, 0, -26); fuel.rotation.y = 2.6; s.add(fuel);
    const escort = buildMRAP({ color: 0x5d6248, seed: 9, code: 'HQ 5' });
    escort.position.set(-17, 0, -2); escort.rotation.y = -0.4; s.add(escort);
    for (const v of [fuel, escort]) v.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.heli2 = new Helicopter(s);
    this.heli2.group.position.set(-34, 0, -40);
    this.heli2.group.rotation.y = 0.9;
    const names = [
      ['REYES', 'vx4', 'CAPT. MARA REYES', 'Team leader'],
      ['HATCH', 'juggernaut', 'SGT. DMITRI "HATCH" SOROKIN', 'Breacher, demolitions'],
      ['TEX', 'hx30', 'CPL. JONAH "TEX" HALE', 'Marksman, signals'],
      ['WRAITH', 'vx4', 'SGT. ELIAS "WRAITH" COLE', 'Pointman — you'],
    ];
    this.team = names.map(([id, w, name, role], i) => {
      const h = new Humanoid('orion', w, { seed: 11 + i * 7 });
      h.root.position.set(-4.5 + i * 3, 0, 2);
      h.root.rotation.y = Math.PI; // facing the camera (+z)
      h.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      s.add(h.root);
      return { h, id, name, role };
    });
    this.airfield = s;
  }

  /** Port Kaval at night, seen from a drone: quay, freighter, cranes, men loading crates. */
  _buildPortScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x05080c);
    s.fog = new THREE.FogExp2(0x0a0f14, 0.0032);
    s.add(new THREE.HemisphereLight(0x52606e, 0x101012, 1.2));
    const moon = new THREE.DirectionalLight(0xa6b8d8, 1.1);
    moon.position.set(-80, 140, 60);
    s.add(moon);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x0a161c, roughness: 0.3, metalness: 0.4 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -1.4;
    s.add(water);
    buildPort(s);
    const truck = buildCargoTruck({ color: 0x3a3c3e, seed: 31, code: 'MRD' });
    truck.position.set(14, 0, 7); s.add(truck);
    // Gangway from the quay up to the deck.
    const gang = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 6.2), new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.6, metalness: 0.5 }));
    gang.position.set(0, 1.6, -1.6); gang.rotation.x = 0.55; s.add(gang);
    const crateM = new THREE.MeshStandardMaterial({ color: 0x4c5038, roughness: 0.85 });
    const caseM = new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.5, metalness: 0.3 });
    this.porters = [0, 1, 2, 3].map((i) => {
      const h = new Humanoid('meridian', 'rk74', { seed: 60 + i });
      h.setCaptive('carry');
      const key = i === 2;
      const box = new THREE.Mesh(key ? new THREE.BoxGeometry(0.5, 0.2, 0.36) : new THREE.BoxGeometry(0.5, 0.4, 0.4), key ? caseM : crateM);
      box.position.set(0, 0.2, -0.36).add(h.shift);
      h.torso.add(box);
      s.add(h.root);
      return { h, phase: i / 4, key };
    });
    this.portGuards = [[10, 3, 2.4], [-6, 3, -0.4], [2, 3.3, -9]].map(([x, y, yaw], i) => {
      const h = new Humanoid('meridian', 'rk74', { seed: 80 + i });
      h.root.position.set(x, y === 3 ? 0 : y, i === 2 ? -9 : 3 + i);
      h.root.rotation.y = yaw;
      s.add(h.root);
      return h;
    });
    this.port = s;
  }

  /** The briefing tent at the forward base. */
  _buildTent() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x040404);
    s.add(new THREE.AmbientLight(0x1c2024, 0.7));
    this.tentSet = buildBriefing(s);
    // ORION round the table; Reyes at the head, working the map.
    const spots = [[-1.75, 0, -Math.PI / 2], [-0.5, 1.15, 0.05], [0.7, 1.12, -0.1], [1.75, 0.15, Math.PI / 2 + 0.1]];
    this.briefTeam = spots.map(([x, z, yaw], i) => {
      const h = new Humanoid('orion', 'vx4', { seed: 11 + i * 7 });
      h.root.position.set(x, 0, z);
      h.root.rotation.y = yaw;
      h.setCaptive('side');
      h.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      s.add(h.root);
      return h;
    });
    this.tent = s;
  }

  /** The Black Sea at first light: two helicopters low over the water. */
  _buildSeaScene() {
    const s = new THREE.Scene();
    const sunDir = V(0.25, 0.05, -1).normalize();
    s.add(skyDome(0x0c1830, 0xd88a58, sunDir, 0xffa070));
    s.fog = new THREE.Fog(0x6a6476, 300, 2800);
    const sun = new THREE.DirectionalLight(0xffb888, 1.8);
    sun.position.copy(sunDir).multiplyScalar(300);
    s.add(sun, new THREE.HemisphereLight(0x6a7a9a, 0x101820, 1.0));
    this.sea = buildSea(s);
    this.flightHelis = [0, 1].map((i) => {
      const h = new Helicopter(s);
      h.group.position.set(i ? 34 : 0, i ? 30 : 24, i ? 26 : 0);
      h.group.rotation.x = -0.12;
      return h;
    });
    this.seaScene = s;
  }

  // ---------- timeline ----------
  _next() {
    this.shot++;
    if (this.shot >= this.shots.length) { this.finish(); return; }
    const sh = this.shots[this.shot];
    this.st = 0;
    this.lineIdx = 0;
    this.card(null);
    this.title(null);
    this.flash(0);
    this.r.domElement.style.filter = '';
    this.$('.film-hud').classList.remove('on');
    this[`_enter_${sh.id}`]?.();
  }

  update(dt) {
    if (this.done) return;
    dt = Math.min(dt, 1 / 20);
    this.t += dt;
    this.st += dt;
    const sh = this.shots[this.shot];
    // Skip: hold Space / Enter / Escape.
    const inp = this.app.input;
    const holding = inp?.isDown?.('Space') || inp?.isDown?.('Enter') || inp?.isDown?.('Escape');
    this.holdSkip = holding ? this.holdSkip + dt : Math.max(0, this.holdSkip - dt * 2);
    this.$('.film-skip i').style.width = `${clamp(this.holdSkip / 0.7, 0, 1) * 100}%`;
    if (this.holdSkip > 0.7) { this.finish(); return; }
    const lines = LINES[sh.id] ?? [];
    while (this.lineIdx < lines.length && this.st >= lines[this.lineIdx][0]) this.say(lines[this.lineIdx++][1]);
    if (this.st > sh.dur - 0.6) this.$('.film-sub').classList.remove('on');
    const fade = Math.max(1 - smooth(this.st / 0.6), smooth((this.st - (sh.dur - 0.5)) / 0.5));
    this.$('.film-fade').style.opacity = String(this.shot === 0 ? Math.max(fade, 1 - smooth(this.st / 1.6)) : fade);
    this[`_shot_${sh.id}`]?.(this.st, dt);
    if (this.st >= sh.dur) this._next();
  }

  render() {
    if (this.done) return;
    const sh = this.shots[this.shot];
    if (!sh) return;
    const r = this.r;
    r.setRenderTarget(null);
    r.autoClear = true;
    if (this.camera.aspect !== innerWidth / innerHeight) { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
    for (const u of this.earth.uniforms) u.camPos.value.copy(this.camera.position);
    r.render(sh.scene, this.camera);
  }

  _listen() {
    const f = V(0, 0, -1).applyQuaternion(this.camera.quaternion);
    Audio.setListener(this.camera.position, f);
  }

  // Shot 1: orbit at sunrise, the constellation gliding by.
  /** The satellite nearest the sub-solar point (lit from behind the camera). */
  _sunSat() {
    this._spaceTick(0);
    let best = this.sats[0], bd = -2;
    for (const s of this.sats) { s.updateMatrixWorld(true); const d = s.getWorldPosition(V()).normalize().dot(this.sunDir); if (d > bd) { bd = d; best = s; } }
    return best;
  }

  _enter_orbit() { this.camera.fov = 46; this.camera.updateProjectionMatrix(); this.rod.visible = false; this.hero = this._sunSat(); }
  _shot_orbit(t, dt) {
    this._spaceTick(dt);
    // Ride just above and behind one satellite as the ring sweeps over the planet.
    const sat = this.hero;
    sat.updateMatrixWorld(true);
    const sp = sat.getWorldPosition(V());
    const out = sp.clone().normalize();
    const along = V(0, 1, 0).cross(out).normalize();
    const k = smooth(t / 12);
    this.camera.position.copy(sp).addScaledVector(out, lerp(3.2, 6, k)).addScaledVector(along, lerp(-3.4, 2.4, k)).add(V(0, lerp(1.2, 2.2, k), 0));
    this.camera.lookAt(sp.clone().lerp(V(0, 0, 0), lerp(0.04, 0.22, k)));
  }

  _spaceTick(dt) {
    this.earth.earth.rotation.y += dt * 0.012;
    this.earth.clouds.rotation.y += dt * 0.016;
    for (const s of this.sats) {
      s.userData.angle += dt * 0.05;
      const a = s.userData.angle;
      s.position.set(Math.cos(a) * 95, 0, Math.sin(a) * 95);
      s.lookAt(this.ring.worldToLocal(V(0, 0, 0)).add(V(0, 0, 0)));
      s.rotateX(Math.PI / 2);
      s.userData.ledR.visible = Math.sin(this.t * 4 + a * 10) > 0.6;
      s.userData.ledG.visible = Math.sin(this.t * 4 + a * 10 + 2) > 0.6;
    }
    this.spaceFx.update(dt);
  }

  // Shot 2: one satellite opens its magazine and drops a rod into re-entry.
  _enter_release() { this.camera.fov = 34; this.camera.updateProjectionMatrix(); this.rod.visible = false; this.released = false; this.hero = this._sunSat(); }
  _shot_release(t, dt) {
    this._spaceTick(dt);
    const sat = this.hero;
    sat.updateMatrixWorld(true);
    const sp = sat.getWorldPosition(V());
    const down = sp.clone().normalize().negate();
    const side = V(0, 1, 0).cross(down).normalize();
    // Camera rides beside the satellite, then follows the rod down.
    if (t < 3) {
      this.camera.position.copy(sp).addScaledVector(side, 2.2).addScaledVector(down, -0.6).add(V(0, 0.4, 0));
      this.camera.lookAt(sp.clone().addScaledVector(down, 0.4));
    }
    if (t > 1.6 && !this.released) {
      this.released = true;
      this.rod.visible = true;
      this.rod.position.copy(sp).addScaledVector(down, 0.6);
      this.rodV = down.clone().multiplyScalar(0.6);
      this.rod.quaternion.setFromUnitVectors(V(0, 1, 0), down);
      Audio.ui('beep');
    }
    if (this.released) {
      this.rodV.addScaledVector(down, dt * 1.4);
      this.rod.position.addScaledVector(this.rodV, dt);
      const alt = this.rod.position.length() - 60;
      const heat = Math.max(clamp((22 - alt) / 12, 0, 1), smooth((t - 3) / 2.2));
      this.rodGlow.material.opacity = heat * 0.9;
      this.rodGlow.scale.setScalar(0.15 + heat * 0.45);
      if (heat > 0.1) for (let i = 0; i < 3; i++) this.spaceFx.emit(this.rod.position, this.rodV.clone().multiplyScalar(-0.4).add(V((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05)), { color: i ? 0xff8030 : 0xfff0c0, life: 0.5 + Math.random() * 0.6, size: 0.08 + heat * 0.22, grow: 2.2, alpha: heat * 0.9, drag: 0.6 });
      if (t >= 3) {
        // Chase from above and to the side: the burning rod against the planet below.
        const back = this.rodV.clone().normalize();
        this.camera.position.copy(this.rod.position).addScaledVector(back, -7).addScaledVector(side, 3.4).addScaledVector(down, -2.5);
        this.camera.lookAt(this.rod.position.clone().addScaledVector(back, 6));
      }
      if (alt < 0.5) { this.rodV.multiplyScalar(0); this.rodGlow.material.opacity = 0; }
    }
  }

  // Shot 3: the rod arrives at a desert test range.
  _enter_impact() {
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
    this.camera.position.set(60, 22, 160);
    this.hit = false;
    this.fireball.visible = false; this.shock.visible = false;
    this.boomLight.intensity = 0;
  }
  _shot_impact(t, dt) {
    const tgt = this.targets.position;
    const shake = this.hit ? Math.max(0, 1.6 - (t - this.hitT)) * 0.9 : 0;
    this.camera.position.set(60 - t * 1.2 + (Math.random() - 0.5) * shake, 22 + (Math.random() - 0.5) * shake, 160 - t * 2);
    this.camera.lookAt(tgt.x, tgt.y + 25 + (this.hit ? 15 * smooth((t - this.hitT) / 3) : 0), tgt.z);
    // The incoming streak.
    const arrive = 3.2;
    if (t < arrive) {
      const k = clamp(t / arrive, 0, 1);
      const head = V(tgt.x + 140 * (1 - k), 900 * (1 - k * k) + 2, tgt.z - 80 * (1 - k));
      const tailP = head.clone().add(V(40, 260, -25).multiplyScalar(0.5 + k * 0.5));
      this.streak.visible = this.streakHead.visible = t > 0.8;
      this.streak.position.copy(head).lerp(tailP, 0.5);
      this.streak.scale.set(1, head.distanceTo(tailP), 1);
      this.streak.quaternion.setFromUnitVectors(V(0, 1, 0), tailP.clone().sub(head).normalize());
      this.streak.material.opacity = 0.8;
      this.streakHead.position.copy(head);
    } else {
      this.streak.visible = this.streakHead.visible = false;
      if (!this.hit) {
        this.hit = true; this.hitT = t;
        Audio.setListener(this.camera.position, V(0, 0, -1));
        Audio.explosion(tgt.clone().setY(2), 3.5);
        setTimeout(() => Audio.explosion(tgt.clone().setY(2), 2.5), 350);
        this.fireball.visible = this.shock.visible = true;
        for (let i = 0; i < 120; i++) {
          const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 70;
          this.rangeDust.emit(tgt.clone().add(V(0, 2, 0)), V(Math.cos(a) * sp, 8 + Math.random() * 40, Math.sin(a) * sp), { color: 0x8a6a48, life: 6 + Math.random() * 3, size: 12 + Math.random() * 14, grow: 3, alpha: 0.75, drag: 0.7, rise: 2 });
        }
        for (const b of this.targets.children) { b.userData.v = V((b.position.x) * 0.8 + (Math.random() - 0.5) * 6, 18 + Math.random() * 20, b.position.z * 0.8 + (Math.random() - 0.5) * 6); b.userData.spin = V(Math.random(), Math.random(), Math.random()).multiplyScalar(2); }
      }
      const k = t - this.hitT;
      this.flash(1 - smooth(k / 0.5));
      this.fireball.position.copy(tgt).setY(8 + k * 10);
      const fs = 10 + 42 * smooth(k / 0.6);
      this.fireball.scale.set(fs, fs * 0.7, fs);
      this.fireball.material.opacity = clamp(0.5 - k / 1.1, 0, 0.5);
      this.fireball.material.color.setHSL(0.08 - k * 0.02, 1, clamp(0.7 - k * 0.15, 0.2, 0.7));
      this.shock.position.copy(tgt).setY(1.5);
      const ss = 10 + k * 160;
      this.shock.scale.set(ss, ss, 1);
      this.shock.material.opacity = clamp(1 - k / 2.2, 0, 1);
      this.boomLight.position.copy(tgt).setY(30);
      this.boomLight.intensity = 1.2e4 * Math.max(0, 1 - k / 1.8);
      if (k < 2.6) for (let i = 0; i < 5; i++) this.rangeFlame.emit(tgt.clone().add(V((Math.random() - 0.5) * 30, 4 + k * 20, (Math.random() - 0.5) * 30)), V((Math.random() - 0.5) * 14, 20 + Math.random() * 24, (Math.random() - 0.5) * 14), { color: 0xffffff, life: 1.5 + Math.random(), size: 18 + Math.random() * 16, grow: 1.6, alpha: 1, drag: 1 });
      if (k < 3) for (let i = 0; i < 7; i++) this.rangeFire.emit(tgt.clone().add(V((Math.random() - 0.5) * 34, 6 + k * 22, (Math.random() - 0.5) * 34)), V((Math.random() - 0.5) * 18, 22 + Math.random() * 26, (Math.random() - 0.5) * 18), { color: Math.random() > 0.55 ? 0xff6a18 : Math.random() > 0.5 ? 0xffb050 : 0xff3a10, life: 1.2 + Math.random() * 0.8, size: 16 + Math.random() * 14, grow: 1.8, alpha: 0.85, drag: 1.1 });
      // The rising column and the mushroom cap spreading at its top.
      if (k > 0.5 && k < 5) for (let i = 0; i < 3; i++) this.rangeDust.emit(tgt.clone().add(V((Math.random() - 0.5) * 16, 10 + k * 14, (Math.random() - 0.5) * 16)), V((Math.random() - 0.5) * 6, 14 + Math.random() * 8, (Math.random() - 0.5) * 6), { color: 0x4a3a2c, life: 5, size: 14, grow: 2.5, alpha: 0.7, drag: 0.5, rise: 1 });
      if (k > 1.2 && k < 5) for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; this.rangeDust.emit(tgt.clone().add(V(0, 60 + k * 16, 0)), V(Math.cos(a) * 22, 2 + Math.random() * 4, Math.sin(a) * 22), { color: 0x5a4834, life: 6, size: 22, grow: 2.2, alpha: 0.6, drag: 0.4 }); }
      for (const b of this.targets.children) if (b.userData.v) { b.userData.v.y -= 30 * dt; b.position.addScaledVector(b.userData.v, dt); if (b.position.y < 1) { b.position.y = 1; b.userData.v.multiplyScalar(0.3); } b.rotation.x += b.userData.spin.x * dt; b.rotation.z += b.userData.spin.z * dt; }
    }
    this.rangeDust.update(dt);
    this.rangeFire.update(dt);
    this.rangeFlame.update(dt);
  }

  // Shot 4: the key, open on a table in a secure lab.
  _enter_key() { this.camera.fov = 34; this.camera.updateProjectionMatrix(); }
  _shot_key(t) {
    const a = -0.9 + t * 0.06;
    const r = 2.6 - t * 0.09;
    this.camera.position.set(Math.sin(a) * r, 1.75 - t * 0.02, Math.cos(a) * r);
    this.camera.lookAt(0, 1.12, -0.05);
    this._drawKeyScreen(t);
    for (let i = 0; i < this.labLeds.length; i++) this.labLeds[i].visible = Math.sin(t * (2 + (i % 7)) + i) > -0.2;
  }

  // Shot 5: the convoy on a mountain road at night.
  _enter_convoy() {
    this.camera.fov = 42; this.camera.updateProjectionMatrix();
    this.trucks.forEach((tk, i) => { tk.position.set(-60 - i * 16, 0, 0); tk.rotation.set(0, 0, 0); tk.userData.v = 12; });
    for (const h of this.raiders) h.root.visible = false;
    this.hart.root.visible = false;
    for (const g of this.hartGuards) g.root.visible = false;
    Audio.startLoop('film', 'rotor');
    Audio.setLoop('film', 0.15, 0.35);
  }
  _driveTrucks(dt) {
    for (const tk of this.trucks) {
      tk.position.x += tk.userData.v * dt;
      for (const w of tk.userData.wheels) w.rotation.z -= (tk.userData.v * dt) / tk.userData.wheelR;
      tk.position.y = Math.sin(this.t * 9 + tk.position.x) * 0.02 * (tk.userData.v > 1 ? 1 : 0);
    }
  }
  _shot_convoy(t, dt) {
    this._driveTrucks(dt);
    const lead = this.trucks[0].position;
    if (t < 4.5) {
      this.camera.position.set(lead.x + 6 - t * 1.5, 1.2, 7.5);
      this.camera.lookAt(lead.x - 6, 1.6, 0);
    } else {
      this.camera.position.set(lead.x + 26, 7, -14);
      this.camera.lookAt(lead.x - 10, 1.5, 0);
    }
    this._listen();
  }

  // Shot 6: the ambush.
  _enter_ambush() {
    this.camera.fov = 44; this.camera.updateProjectionMatrix();
    this.blown = false;
    this.lead0 = this.trucks[0].position.x;
  }
  _shot_ambush(t, dt) {
    const lead = this.trucks[0];
    if (t < 0.9) this._driveTrucks(dt);
    else {
      if (!this.blown) {
        this.blown = true;
        Audio.explosion(lead.position.clone().setY(1), 2.2);
        this.flash(0.7);
        lead.userData.v = 0;
        lead.userData.lift = 0;
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 10;
          this.roadFire.emit(lead.position.clone().add(V(1.5, 1, 0)), V(Math.cos(a) * sp, 4 + Math.random() * 10, Math.sin(a) * sp), { color: Math.random() > 0.4 ? 0xff8a30 : 0xffd080, life: 0.9 + Math.random() * 0.6, size: 2.4, grow: 1.8, alpha: 1, drag: 2 });
          this.roadSmoke.emit(lead.position.clone().add(V(1.5, 1.5, 0)), V(Math.cos(a) * sp * 0.4, 3 + Math.random() * 5, Math.sin(a) * sp * 0.4), { color: 0x1c1a18, life: 5 + Math.random() * 3, size: 3, grow: 3, alpha: 0.8, drag: 0.8, rise: 0.6 });
        }
      }
      for (const tk of this.trucks.slice(1)) { tk.userData.v = Math.max(0, tk.userData.v - dt * 18); }
      this._driveTrucks(dt);
      const k = t - 0.9;
      lead.rotation.z = Math.min(0.5, k * 1.6) * Math.max(0, 1 - Math.max(0, k - 0.6) * 0.4);
      lead.position.y = Math.max(0, Math.sin(Math.min(Math.PI, k * 3.2)) * 1.4);
      this.ieds.position.copy(lead.position).add(V(1, 2, 0));
      this.ieds.intensity = 3000 * Math.max(0, 1 - k / 1.2);
      this.flash(Math.max(0, 0.7 - k * 1.5));
      if (Math.random() < dt * 14) this.roadSmoke.emit(lead.position.clone().add(V(1, 2.4, 0)), V(Math.random() - 0.5, 2.5, Math.random() - 0.5), { color: 0x151413, life: 6, size: 2.5, grow: 3.5, alpha: 0.7, drag: 0.5, rise: 0.8 });
      if (Math.random() < dt * 22) this.roadFire.emit(lead.position.clone().add(V(1 + Math.random(), 2, (Math.random() - 0.5) * 2)), V(0, 2 + Math.random() * 2, 0), { color: 0xff7020, life: 0.7, size: 1.3, grow: 1.2, alpha: 0.9, drag: 1 });
      // Muzzle flashes and tracers from the hillside.
      if (k > 1.4) {
        for (const mz of this.muzzles) {
          mz.t -= dt;
          mz.s.visible = mz.t > 0.06 && mz.t < 0.11;
          mz.s.position.copy(mz.pos);
          if (mz.t <= 0) {
            mz.t = 0.12 + Math.random() * 0.25;
            const tr = this.tracers.find((x) => x.t > 0.12);
            if (tr && Math.random() < 0.6) {
              tr.t = 0;
              const to = this.trucks[1 + Math.floor(Math.random() * 2)].position.clone().add(V((Math.random() - 0.5) * 4, 1.5 + Math.random(), (Math.random() - 0.5) * 2));
              tr.l.geometry.setFromPoints([mz.pos.clone(), to]);
              tr.l.visible = true;
            }
            if (Math.random() < 0.25) Audio.gunshot(WEAPONS.rk74.sound, mz.pos, false);
          }
        }
        for (const tr of this.tracers) { tr.t += dt; if (tr.t > 0.08) tr.l.visible = false; }
      }
      // Raiders come down the slope in a file, weapons up; Hart is taken from the second truck.
      if (k > 3.2) {
        this.raiders.forEach((h, i) => {
          if (!h.root.visible) { h.root.visible = true; }
          const p = h.root.position;
          const tz = -6 - (i % 2) * 1.2;
          if (p.z < tz) { p.z += dt * 2.2; p.x += dt * 0.4; p.y = this._hillY(p.x, p.z); }
          h.update(dt, p.z < tz ? 2.2 : 0, 0.3, 0, false, 1);
        });
      }
      if (k > 6.2) {
        const t2 = this.trucks[1].position;
        const hk = k - 6.2;
        this.hart.root.visible = true;
        const hp = V(t2.x - 1.5, 0, 1.8 - hk * 1.6).add(V(-hk * 0.6, 0, 0));
        hp.z = Math.max(hp.z, -12);
        this.hart.root.position.copy(hp);
        this.hart.root.position.y = this._hillY(hp.x, hp.z);
        this.hart.root.rotation.y = 0;
        this.hart.update(dt, 1.6, 0.2, 0, false);
        this.hartGuards.forEach((g, i) => {
          g.root.visible = true;
          g.root.position.copy(hp).add(V(i ? 0.8 : -0.8, 0, 0.6));
          g.root.position.y = this._hillY(g.root.position.x, g.root.position.z);
          g.root.rotation.y = 0;
          g.update(dt, 1.6, 0.2, 0, false, 1);
        });
      }
    }
    this.roadFire.update(dt);
    this.roadSmoke.update(dt);
    const lx = this.lead0;
    if (t < 5.5) {
      this.camera.position.set(lx - 4, 3.2, 14);
      this.camera.lookAt(lx + 4, 1.6, -2);
    } else if (t < 9.5) {
      this.camera.position.set(lx - 40, 14, -40);
      this.camera.lookAt(lx - 16, 0, 0);
    } else {
      const t2 = this.trucks[1].position;
      this.camera.position.set(t2.x - 7, 2.2, 5.5);
      this.camera.lookAt(t2.x - 2.5, 1.4, -6);
    }
    this._listen();
    if (t > this.shots[this.shot].dur - 0.1) Audio.stopLoop('film');
  }

  // Shot 7: the aftermath: fires, the open case, a drone crossing the sky.
  _enter_aftermath() {
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
    for (const h of this.raiders) h.root.visible = false;
    this.hart.root.visible = false;
    for (const g of this.hartGuards) g.root.visible = false;
    for (const tr of this.tracers) tr.l.visible = false;
    for (const mz of this.muzzles) mz.s.visible = false;
    const t2 = this.trucks[1].position;
    this.emptyCase.position.set(t2.x - 4, this._hillY(t2.x - 4, -7) + 0.02, -7);
    this.emptyCase.rotation.y = 0.6;
    this.emptyCase.visible = true;
    this.drone.visible = true;
    Audio.startLoop('film', 'rotor');
  }
  _shot_aftermath(t, dt) {
    Audio.setLoop('film', 0.08, 0.5);
    // The wrecks still burn.
    for (const tk of [this.trucks[0], this.trucks[2]]) {
      if (Math.random() < dt * 20) this.roadFire.emit(tk.position.clone().add(V((Math.random() - 0.5) * 3, 1.4 + Math.random(), (Math.random() - 0.5) * 1.6)), V(0, 1.6 + Math.random() * 2, 0), { color: Math.random() > 0.5 ? 0xff7020 : 0xffa040, life: 0.8, size: 1.3, grow: 1.3, alpha: 0.9, drag: 1 });
      if (Math.random() < dt * 7) this.roadSmoke.emit(tk.position.clone().add(V(0, 2.6, 0)), V((Math.random() - 0.5) * 0.6, 2.2, (Math.random() - 0.5) * 0.6), { color: 0x141312, life: 7, size: 2.4, grow: 3.4, alpha: 0.65, drag: 0.4, rise: 0.6 });
    }
    this.roadFire.update(dt);
    this.roadSmoke.update(dt);
    this.ieds.position.copy(this.trucks[0].position).add(V(1, 2, 0));
    this.ieds.intensity = 520 + Math.sin(t * 23) * 120 + Math.random() * 120;
    // The drone crosses high over the road.
    const L = this.trucks[1].position;
    this.drone.position.set(L.x - 150 + t * 22, 34, -14);
    this.drone.userData.prop.rotation.x += dt * 70;
    const blink = (t * 1.3) % 1 < 0.12;
    this.drone.userData.red.visible = this.drone.userData.green.visible = blink;
    if (t < 6) {
      // Down by the case, rising slowly.
      const c = this.emptyCase.position, k = smooth(t / 6);
      this.camera.position.set(c.x + 1.5 - k * 1.1, c.y + 0.55 + k * 1.3, c.z + 1.5 + k * 2.2);
      this.camera.lookAt(c.x, c.y + 0.1 + k * 0.7, c.z);
    } else {
      // Low on the road among the wrecks, tilting up to follow the drone.
      const k = smooth((t - 6) / 6);
      this.camera.position.set(L.x - 9, 1.8, 9);
      const look = V(L.x + 4, 2, -3).lerp(this.drone.position, 0.12 + k * 0.28);
      this.camera.lookAt(look);
    }
    this._listen();
    if (t > this.shots[this.shot].dur - 0.1) Audio.stopLoop('film');
  }

  // Shot 9: the drone feed over Port Kaval.
  _enter_drone() {
    this.camera.fov = 24; this.camera.updateProjectionMatrix();
    this.r.domElement.style.filter = 'grayscale(1) contrast(1.15) brightness(1.5)';
    this.$('.film-hud').classList.add('on');
  }
  _shot_drone(t, dt) {
    // Porters shuttle crates from the truck up the gangway; guards stand watch.
    const A = V(12, 0, 6.2), B = V(0, 0, 1.5), C = V(0, 3.3, -4.6);
    for (const p of this.porters) {
      const u = (p.phase + t * 0.07) % 1;
      const pos = u < 0.6 ? A.clone().lerp(B, u / 0.6) : B.clone().lerp(C, (u - 0.6) / 0.4);
      const dir = u < 0.6 ? B.clone().sub(A) : C.clone().sub(B);
      p.h.root.position.copy(pos);
      p.h.root.rotation.y = Math.atan2(-dir.x, -dir.z);
      p.h.update(dt, 1.3, 0, 0, false, 0);
    }
    for (const g of this.portGuards) g.update(dt, 0, 0, 0, false, 0);
    // A high, slow orbit, zooming in.
    const a = 0.75 + t * 0.025, r = 170 - t * 3, hgt = 120 - t * 2.4;
    this.camera.position.set(4 + Math.sin(a) * r, hgt, 2 + Math.cos(a) * r);
    this.camera.lookAt(4, 1, 1);
    this.camera.fov = 24 - smooth(t / 12) * 9;
    this.camera.updateProjectionMatrix();
    // HUD: time code and a box tracking the man with the case.
    const key = this.porters.find((p) => p.key).h.root.position.clone().setY(1.4);
    key.project(this.camera);
    const box = this.$('.fh-box');
    box.style.left = `${(key.x * 0.5 + 0.5) * 100}%`;
    box.style.top = `${(-key.y * 0.5 + 0.5) * 100}%`;
    this.$('.fh-time').textContent = `02:${String(14 + Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t + 31) % 60).padStart(2, '0')}Z`;
  }

  // Shot 10: the briefing tent.
  _enter_briefing() {
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
    this.briefTeam[0].playMove('Interact', { loop: true, hideGun: false });
    this.briefTeam[2].playMove('Idle_Talking', { loop: true, hideGun: false });
    this._saluted = false;
  }
  _shot_briefing(t, dt) {
    for (const h of this.briefTeam) h.update(dt, 0, 0, 0, false, 0);
    if (t > 7 && !this._saluted) { this._saluted = true; this.briefTeam[3].playMove('Salute', { hideGun: false }); } // orders taken
    const sway = Math.sin(t * 0.8) * 0.03;
    this.tentSet.lamp.position.x = sway; this.tentSet.shade.position.x = sway; this.tentSet.bulb.position.x = sway;
    const k = smooth(t / 12);
    this.camera.position.set(lerp(3.4, 1.0, k), lerp(2.4, 1.75, k), lerp(2.9, 1.3, k));
    this.camera.lookAt(lerp(0, -0.35, k), lerp(1.1, 0.9, k), lerp(0, 0.1, k));
  }

  // Shot 12: the flight in, low over the sea.
  _enter_flight() {
    this.camera.fov = 44; this.camera.updateProjectionMatrix();
    Audio.startLoop('film', 'rotor');
  }
  _shot_flight(t, dt) {
    Audio.setLoop('film', 0.65, 1);
    for (const h of this.flightHelis) { h.update(dt); h.group.position.y += Math.sin(this.t * 1.3 + h.group.position.x) * 0.02; }
    this.sea.normal.offset.y += dt * 0.55;
    const H = this.flightHelis[0].group.position;
    if (t < 6.5) {
      const k = smooth(t / 6.5);
      this.camera.position.set(H.x - 16 + k * 4, H.y + 2 - k * 1, H.z - 10 + k * 18);
      this.camera.lookAt(H.x, H.y, H.z - 2);
    } else {
      // Behind and below the pair, the coast and the harbour lights ahead.
      const k = smooth((t - 6.5) / 5.5);
      this.camera.position.set(H.x + 10, H.y - 12 + k * 4, H.z + 40);
      this.camera.lookAt(H.x + 10, H.y - 4, H.z - 200);
    }
    this._listen();
    if (t > this.shots[this.shot].dur - 0.1) Audio.stopLoop('film');
  }

  // Shot 8: Vasko at his window, the strike candidates on his screens.
  _enter_vasko() { this.camera.fov = 36; this.camera.updateProjectionMatrix(); }
  _shot_vasko(t, dt) {
    // Behind Vasko at the window, then round to the screens: targets and bids.
    const k = smooth(t / 6.5), k2 = smooth((t - 6.5) / 4);
    this.camera.position.set(lerp(lerp(-1.7, 0.9, k), 3.4, k2), lerp(1.8, 1.75, k), lerp(lerp(5.3, 1.2, k), 1.4, k2));
    this.camera.lookAt(lerp(0.4, 6.9, k2), lerp(1.7, 2.4, k2), lerp(-4.6, -1.2, k2));
    this.officeRed.intensity = 6 + Math.sin(t * 2.2) * 3;
    this.vasko.root.rotation.y = smooth((t - 7.5) / 2) * -0.6;
    this.vasko.update(dt, 0, 0, 0, false);
    this._drawMonitors(t);
  }

  // Shot 8: ORION at dawn, one by one, then into the helicopter.
  _enter_orion() {
    this.camera.fov = 34; this.camera.updateProjectionMatrix();
    this.team.forEach((m, i) => { m.h.root.position.set(-4.5 + i * 3, 0, 2); m.h.root.rotation.y = Math.PI; });
    Audio.startLoop('film', 'rotor');
    this.cardShown = -1;
  }
  _shot_orion(t, dt) {
    this.heli.update(dt);
    Audio.setLoop('film', 0.55, 1);
    const per = 3;
    const idx = Math.floor((t - 1) / per);
    if (t < 13) {
      // Dolly along the line, stopping on each face with a name card.
      const i = clamp(idx, 0, 3);
      const k = clamp(((t - 1) % per) / per, 0, 1);
      const from = this.team[Math.max(0, i - 1)].h.root.position, to = this.team[i].h.root.position;
      const fx = t < 1 ? from.x - 1 : lerp(from.x, to.x, smooth(Math.min(1, k * 2.5)));
      this.camera.position.set(fx - 1.1, 1.58, 5.2);
      this.camera.lookAt(fx - 0.35, 1.42, 2);
      if (t >= 1 && idx !== this.cardShown && idx <= 3) {
        this.cardShown = idx;
        const m = this.team[idx];
        this.card(`<b>${escapeHtml(m.name)}</b><span>${escapeHtml(m.role)}</span>`);
      }
      this.team.forEach((m) => m.h.update(dt, 0, 0, 0, false, 0));
    } else {
      this.card(null);
      // They turn and move to the helicopter in a stack, weapons up.
      const k = t - 13;
      this.team.forEach((m, i) => {
        const p = m.h.root.position;
        m.h.root.rotation.y = 0; // facing the helicopter (-z)
        const tx = -0.6 + (i % 2) * 1.2, tz = -9.5 + i * 1.4;
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        const sp = k > i * 0.25 && d > 0.2 ? 2.4 : 0;
        if (sp) { p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt; }
        m.h.moveRel = sp ? Math.atan2(-dx, -dz) : 0;
        m.h.update(dt, sp, 0.3, 0, false, 1);
      });
      this.camera.position.set(lerp(5, 7.5, smooth(k / 6)), lerp(1.7, 3.6, smooth(k / 6)), lerp(6, 5, smooth(k / 6)));
      this.camera.lookAt(0, 1.2, lerp(-2, -9, smooth(k / 5)));
    }
    this._listen();
  }

  // Shot 9: the title over the constellation.
  _enter_title() {
    this.camera.fov = 40; this.camera.updateProjectionMatrix();
    Audio.stopLoop('film');
    this.rod.visible = false;
    setTimeout(() => this.title('<div class="ft-a">FIELD OF HONOR</div><div class="ft-b">US ARMY SPECIAL FORCES</div><div class="ft-c">MISSION 1 · BLACK WATER · PORT KAVAL</div>'), 1800);
  }
  _shot_title(t, dt) {
    this._spaceTick(dt);
    const a = 2.2 + t * 0.03;
    const r = 120 + t * 9;
    this.camera.position.set(Math.cos(a) * r, 30 + t * 2, Math.sin(a) * r);
    this.camera.lookAt(0, 6, 0);
  }

  // ---------- end ----------
  finish() {
    if (this.done) return;
    this.done = true;
    this.r.domElement.style.filter = '';
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    Audio.stopVoice();
    Audio.stopLoop('film');
    this.el.classList.add('out');
    setTimeout(() => this.dispose(), 400);
    this.onDone?.();
  }

  dispose() {
    this.el?.remove();
    for (const s of [this.space, this.range, this.lab, this.road, this.office, this.airfield, this.port, this.tent, this.seaScene]) {
      s?.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) { for (const k of ['map', 'bumpMap', 'alphaMap']) m[k]?.dispose?.(); m.dispose(); }
      });
    }
    this.glow.dispose(); this.smokeTex.dispose(); this.flameTex?.dispose();
    for (const u of this.earth?.uniforms ?? []) for (const k of ['day', 'night', 'spec']) u[k]?.value?.dispose?.();
  }
}
