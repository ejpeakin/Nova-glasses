// Sky, lighting, fog and weather presets (day, dusk, night, overcast, snow, indoor).
import * as THREE from '../lib/three.js';
import { getSpriteTexture } from './Textures.js';

export const LIGHTING = {
  day: {
    skyTop: 0x5b8fd0, skyHorizon: 0xd8e4ec, ground: 0xb8a888, sun: 0xfff1d8, sunI: 3.2, hemiI: 1.15,
    fog: 0xc9d6e0, fogDensity: 0.0065, sunDir: [0.45, 0.8, 0.35], exposure: 1.0,
  },
  desert: {
    skyTop: 0x4f86c6, skyHorizon: 0xead9b8, ground: 0xc8a878, sun: 0xffe8c0, sunI: 3.6, hemiI: 1.1,
    fog: 0xdcc8a6, fogDensity: 0.0075, sunDir: [0.5, 0.75, -0.3], exposure: 1.0,
  },
  dusk: {
    skyTop: 0x2a3550, skyHorizon: 0xe08850, ground: 0x6a5040, sun: 0xffb070, sunI: 2.4, hemiI: 0.7,
    fog: 0x9a7868, fogDensity: 0.009, sunDir: [-0.7, 0.22, 0.4], exposure: 1.05,
  },
  overcast: {
    skyTop: 0x7a8288, skyHorizon: 0xa8adb0, ground: 0x6a6a66, sun: 0xdde4ea, sunI: 1.3, hemiI: 1.25,
    fog: 0x9aa0a4, fogDensity: 0.012, sunDir: [0.3, 0.9, 0.2], exposure: 1.05,
  },
  night: {
    skyTop: 0x060a14, skyHorizon: 0x24324a, ground: 0x2a3040, sun: 0x9db8ec, sunI: 1.25, hemiI: 1.6,
    fog: 0x161f2e, fogDensity: 0.012, sunDir: [-0.3, 0.7, -0.5], exposure: 1.55, stars: true,
  },
  snow: {
    skyTop: 0x8f9eae, skyHorizon: 0xd4dce4, ground: 0xd0d8e0, sun: 0xeef4ff, sunI: 1.8, hemiI: 1.3,
    fog: 0xc8d2dc, fogDensity: 0.016, sunDir: [0.2, 0.6, 0.6], exposure: 1.0,
  },
  indoor: {
    skyTop: 0x101418, skyHorizon: 0x101418, ground: 0x303438, sun: 0xcfe0ff, sunI: 0.6, hemiI: 1.6,
    fog: 0x0c1014, fogDensity: 0.02, sunDir: [0.2, 1, 0.1], exposure: 1.15, noSky: true,
  },
  dawn: {
    skyTop: 0x3c4a6a, skyHorizon: 0xd8a088, ground: 0x6a6058, sun: 0xffc8a0, sunI: 2.0, hemiI: 0.8,
    fog: 0xa89090, fogDensity: 0.01, sunDir: [0.8, 0.25, -0.2], exposure: 1.05,
  },
};

export class Environment {
  constructor(scene, renderer, preset = 'day', weather = 'none', quality = 'high') {
    this.scene = scene;
    this.renderer = renderer;
    this.preset = LIGHTING[preset] ?? LIGHTING.day;
    this.weather = weather;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lightningTimer = 6;
    const p = this.preset;

    scene.background = new THREE.Color(p.fog);
    scene.fog = new THREE.FogExp2(p.fog, p.fogDensity);
    renderer.toneMappingExposure = p.exposure;

    this.hemi = new THREE.HemisphereLight(p.skyHorizon, p.ground, p.hemiI);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight(p.sun, p.sunI);
    this.sunDir = new THREE.Vector3(...p.sunDir).normalize();
    this.sun.castShadow = quality !== 'low';
    const sz = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    if (!p.noSky) this._buildSky(p);
    this._buildWeather(weather, quality);
    this._buildEnvMap(p);
    // The environment map adds ambient bounce, so the hemisphere fill is reduced.
    this.hemi.intensity = p.hemiI * 0.55;
    this.baseHemi = this.hemi.intensity;
  }

  /** Small PMREM environment from the sky gradient so metals and glossy surfaces reflect something. */
  _buildEnvMap(p) {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(p.noSky ? 0x9aa4ae : p.skyTop) },
        horizon: { value: new THREE.Color(p.skyHorizon) },
        ground: { value: new THREE.Color(p.ground) },
        sunColor: { value: new THREE.Color(p.sun).multiplyScalar(p.sunI * 0.6) },
        sunDir: { value: this.sunDir.clone() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, ground, pow(-h, 0.5));
        c += sunColor * pow(max(dot(vDir, normalize(sunDir)), 0.0), 40.0); gl_FragColor = vec4(c, 1.0); }`,
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
    this.envMap = pm.fromScene(envScene, 0.02).texture;
    this.scene.environment = this.envMap;
    pm.dispose();
    mat.dispose();
  }

  _buildSky(p) {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(p.skyTop) },
        horizon: { value: new THREE.Color(p.skyHorizon) },
        sunColor: { value: new THREE.Color(p.sun) },
        sunDir: { value: this.sunDir.clone() },
        stars: { value: p.stars ? 1 : 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w;
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform float stars;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
          if (h < 0.0) col = mix(horizon, horizon * 0.6, -h * 5.0);
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25 + pow(s, 3.0) * 0.08);
          if (stars > 0.5 && h > 0.05) {
            vec3 cell = floor(vDir * 220.0);
            float st = step(0.9975, hash(cell));
            col += vec3(st) * 0.9 * h;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.scene.background = new THREE.Color(p.skyHorizon);
  }

  _buildWeather(kind, quality) {
    this.particles = null;
    if (kind === 'none') return;
    const count = { rain: 6000, snow: 4000, dust: 1500, ash: 1500 }[kind] * (quality === 'low' ? 0.35 : quality === 'medium' ? 0.6 : 1);
    const n = Math.floor(count);
    const area = kind === 'rain' ? 40 : 50;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * area;
      pos[i * 3 + 1] = Math.random() * 25;
      pos[i * 3 + 2] = (Math.random() - 0.5) * area;
      vel[i] = 0.7 + Math.random() * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    let mat;
    if (kind === 'rain') {
      mat = new THREE.PointsMaterial({ color: 0xaabbcc, size: 0.5, map: getSpriteTexture('drop'), transparent: true, opacity: 0.55, depthWrite: false });
    } else if (kind === 'snow') {
      mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, map: getSpriteTexture('soft'), transparent: true, opacity: 0.9, depthWrite: false });
    } else if (kind === 'ash') {
      mat = new THREE.PointsMaterial({ color: 0x555555, size: 0.08, map: getSpriteTexture('soft'), transparent: true, opacity: 0.8, depthWrite: false });
    } else {
      mat = new THREE.PointsMaterial({ color: 0xd8c098, size: 0.3, map: getSpriteTexture('smoke'), transparent: true, opacity: 0.35, depthWrite: false });
    }
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.particles = { pts, pos, vel, n, area, kind, t: 0 };
  }

  /** Lightning flash support for night storms. */
  enableLightning() { this.lightning = true; }

  update(dt, focus, onThunder) {
    // Keep the shadow frustum centred on the player.
    const s = this.sun;
    s.position.set(focus.x + this.sunDir.x * 100, focus.y + this.sunDir.y * 100, focus.z + this.sunDir.z * 100);
    s.target.position.set(focus.x, focus.y, focus.z);
    if (this.sky) this.sky.position.copy(focus);

    const w = this.particles;
    if (w) {
      w.t += dt;
      const { pos, vel, n, area, kind } = w;
      const fall = kind === 'rain' ? 22 : kind === 'snow' ? 1.6 : kind === 'ash' ? 0.8 : 0.4;
      const drift = kind === 'dust' ? 3 : kind === 'snow' ? 0.8 : kind === 'rain' ? 1.5 : 0.5;
      const half = area / 2;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        pos[k + 1] -= fall * vel[i] * dt;
        pos[k] += drift * dt * (kind === 'snow' ? Math.sin(w.t + i) : 1) * vel[i];
        if (kind === 'dust') pos[k + 1] += Math.sin(w.t * 0.7 + i) * dt * 0.6;
        // Wrap around the player.
        let x = pos[k], z = pos[k + 2];
        if (x - focus.x > half) pos[k] -= area; else if (x - focus.x < -half) pos[k] += area;
        if (z - focus.z > half) pos[k + 2] -= area; else if (z - focus.z < -half) pos[k + 2] += area;
        if (pos[k + 1] < focus.y - 6 || (kind === 'dust' && pos[k + 1] < 0)) pos[k + 1] = focus.y + 18 + Math.random() * 6;
      }
      w.pts.geometry.attributes.position.needsUpdate = true;
    }

    if (this.lightning) {
      this.lightningTimer -= dt;
      if (this.lightningTimer < 0) {
        this.lightningTimer = 8 + Math.random() * 14;
        this.flash = 0.35;
        setTimeout(() => onThunder?.(), 600 + Math.random() * 1600);
      }
      if (this.flash > 0) {
        this.flash -= dt;
        const f = Math.max(0, this.flash) * (Math.random() < 0.5 ? 6 : 2);
        this.hemi.intensity = this.baseHemi + f;
      } else {
        this.hemi.intensity = this.baseHemi;
      }
    }
  }

  dispose() {
    if (this.scene.environment === this.envMap) this.scene.environment = null;
    this.envMap?.dispose();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
  }
}
