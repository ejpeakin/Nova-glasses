// Night-vision goggles post-process, modelled on modern Gen 3 binocular goggles
// (PVS-31 class: two filmless high-resolution tubes).
// The world and viewmodel render into an HDR target, then:
//   1. the scene's average brightness is measured and adapted over time, driving
//      automatic brightness control (the goggles dim when a flash or explosion
//      floods the tube and open up in the dark);
//   2. bright sources go through a quarter-res bright pass and blur, giving the
//      small, tight halos modern tubes put round lights, muzzle flashes and lasers;
//   3. a final pass reads the scene with the tube's spectral response (strong in
//      the red and near-infrared, so foliage, skin and fabric glow and the sky
//      stays dark), amplifies it, sharpens it, applies the intensifier response
//      curve with deep blacks, adds faint scintillation (strongest in the dark)
//      and tints it with a cool teal phosphor (or white P45). The picture fills
//      the screen, darkening into the corners, and opens out from the centre as
//      the goggles flip down.
import * as THREE from '../lib/three.js';

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// Intensifier spectral response: weighted toward red and near-infrared.
const LUMW = 'vec3(0.5, 0.42, 0.08)';
const LUM_SIZE = 32;

/** Shared GLSL: automatic brightness control from the adapted average luminance. */
const ABC = `
  uniform sampler2D tAvg; uniform float gain;
  float exposure() {
    float avg = max(texture2D(tAvg, vec2(0.5)).r, 1e-4);
    float abc = clamp(0.24 / (avg * gain), 0.3, 1.6);
    return gain * abc;
  }`;

export class NightVision {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const hf = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: renderer.capabilities.isWebGL2 ? 4 : 0,
    });
    this.lumRT = new THREE.WebGLRenderTarget(LUM_SIZE, LUM_SIZE, { ...hf, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.avgRT = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { ...hf, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }));
    this.avgIdx = 0;
    this.avgReady = false;
    const bw = Math.max(1, Math.floor(size.x / 4)), bh = Math.max(1, Math.floor(size.y / 4));
    this.bloomA = new THREE.WebGLRenderTarget(bw, bh, hf);
    this.bloomB = new THREE.WebGLRenderTarget(bw, bh, hf);
    this.amount = 0; // goggle flip progress 0..1
    this.target = 0;
    this.lastTime = null;

    this.lumMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture } },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() {
          float s = 0.0;
          for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) {
            vec2 o = (vec2(float(x), float(y)) - 1.0) * (0.3 / ${LUM_SIZE.toFixed(1)});
            s += log(dot(texture2D(tDiffuse, vUv + o).rgb, ${LUMW}) + 1e-4);
          }
          gl_FragColor = vec4(s / 9.0, 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.avgMat = new THREE.ShaderMaterial({
      uniforms: { tLum: { value: this.lumRT.texture }, tPrev: { value: null }, rateUp: { value: 0.1 }, rateDown: { value: 0.05 }, init: { value: 1 } },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tLum; uniform sampler2D tPrev; uniform float rateUp; uniform float rateDown; uniform float init;
        void main() {
          float s = 0.0;
          for (int y = 0; y < ${LUM_SIZE}; y++) for (int x = 0; x < ${LUM_SIZE}; x++)
            s += texture2D(tLum, (vec2(float(x), float(y)) + 0.5) / ${LUM_SIZE.toFixed(1)}).r;
          float cur = exp(s / ${(LUM_SIZE * LUM_SIZE).toFixed(1)});
          float prev = texture2D(tPrev, vec2(0.5)).r;
          // The tube protects itself quickly from bright light and opens up slowly.
          float a = init > 0.5 ? cur : mix(prev, cur, cur > prev ? rateUp : rateDown);
          gl_FragColor = vec4(a, 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.rt.texture }, tAvg: { value: null }, gain: { value: 3 }, texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) } },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
        ${ABC}
        void main() {
          float e = exposure();
          float l = 0.0;
          for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++)
            l += dot(texture2D(tDiffuse, vUv + (vec2(float(x), float(y)) - 0.5) * texel * 2.0).rgb, ${LUMW});
          l = l * 0.25 * e;
          gl_FragColor = vec4(max(l - 1.0, 0.0), 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tInput; uniform vec2 dir; varying vec2 vUv;
        void main() {
          float w[5]; w[0] = 0.227; w[1] = 0.1945; w[2] = 0.1216; w[3] = 0.054; w[4] = 0.0162;
          float s = texture2D(tInput, vUv).r * w[0];
          for (int i = 1; i < 5; i++) {
            s += texture2D(tInput, vUv + dir * float(i)).r * w[i];
            s += texture2D(tInput, vUv - dir * float(i)).r * w[i];
          }
          gl_FragColor = vec4(s, 0.0, 0.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        tBloom: { value: this.bloomA.texture },
        tAvg: { value: null },
        time: { value: 0 },
        gain: { value: 3 },
        amount: { value: 0 },
        phosphor: { value: 0 },
        aspect: { value: size.x / size.y },
        texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
      },
      vertexShader: VS,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float time; uniform float amount;
        uniform float phosphor; uniform float aspect; uniform vec2 texel;
        varying vec2 vUv;
        ${ABC}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float lumAt(vec2 uv) { return dot(texture2D(tDiffuse, uv).rgb, ${LUMW}); }
        void main() {
          vec2 c = vUv - 0.5;
          // Eyepiece optics: very slight barrel distortion.
          vec2 uv = 0.5 + c * (1.0 - 0.02 * dot(c, c));
          float e = exposure();
          float lum = lumAt(uv) * e;
          // Crisp high-resolution tube: a 3x3 unsharp mask.
          float nb = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) if (x != 0 || y != 0) nb += lumAt(uv + vec2(float(x), float(y)) * texel * 1.25);
          nb = nb / 8.0 * e;
          lum = max(0.0, lum + (lum - nb) * 0.9);
          // Soft halos round bright sources (lights, lasers, muzzle flash).
          lum += texture2D(tBloom, uv).r * 0.85;
          // Intensifier response: moody, with deep shadows, clean mids and highlights
          // that roll off toward white.
          lum = 1.0 - exp(-lum * 1.8);
          lum = clamp((lum - 0.05) / 0.95, 0.0, 1.0);
          lum = mix(lum, lum * lum * (3.0 - 2.0 * lum), 0.7);
          // Faint scintillation: a clean modern tube, the grain only shows in the dark.
          vec2 px = floor(gl_FragCoord.xy);
          float n = hash(px + fract(time * 17.31) * 173.0) - 0.5;
          lum += n * (0.008 + 0.035 * (1.0 - lum) * (1.0 - lum));
          lum = clamp(lum, 0.0, 1.0);
          // Full-screen picture that opens out from the centre as the goggles flip down,
          // falling off into dark corners.
          vec2 p = vec2(c.x * aspect, c.y);
          float d = length(p);
          float rad = mix(0.03, 1.25, amount);
          float mask = smoothstep(rad, rad - 0.06, d);
          float vig = 1.0 - 0.72 * smoothstep(0.3, 1.0, length(c * vec2(1.25, 1.45)));
          // Phosphor: cool teal whose highlights run to near white; or P45 white.
          vec3 teal = mix(vec3(0.17, 0.74, 0.68), vec3(0.72, 1.0, 0.95), smoothstep(0.55, 1.0, lum)) * lum + vec3(0.0, 0.016, 0.016);
          vec3 white = mix(vec3(0.8, 0.88, 0.98), vec3(1.0), smoothstep(0.6, 1.0, lum)) * lum + vec3(0.01, 0.012, 0.016);
          vec3 col = mix(teal, white, phosphor) * mask * vig;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get active() { return this.amount > 0.001 || this.target > 0; }

  /** Compile every pass up front so the first flip-down doesn't hitch. */
  warm() {
    const s = new THREE.Scene();
    for (const m of [this.lumMat, this.avgMat, this.brightMat, this.blurMat, this.material]) {
      const q = new THREE.Mesh(this.quad.geometry, m);
      q.frustumCulled = false;
      s.add(q);
    }
    this.renderer.compile(s, this.camera);
  }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(size.x, size.y);
    this.bloomA.setSize(Math.max(1, Math.floor(size.x / 4)), Math.max(1, Math.floor(size.y / 4)));
    this.bloomB.setSize(Math.max(1, Math.floor(size.x / 4)), Math.max(1, Math.floor(size.y / 4)));
    this.material.uniforms.aspect.value = size.x / size.y;
    this.material.uniforms.texel.value.set(1 / size.x, 1 / size.y);
    this.brightMat.uniforms.texel.value.set(1 / size.x, 1 / size.y);
  }

  toggle(on) {
    if (on && !this.target) this.avgReady = false; // re-measure the scene on flip-down
    this.target = on ? 1 : 0;
  }

  update(dt) {
    // Flip down takes ~0.45 s, flip up is quicker.
    const speed = this.target > this.amount ? 2.2 : 5;
    this.amount += Math.sign(this.target - this.amount) * Math.min(Math.abs(this.target - this.amount), dt * speed);
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /** Composite the HDR target to the screen. */
  present(time, gain, phosphor) {
    const r = this.renderer;
    const dt = this.lastTime === null ? 0.016 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    // 1. Measure and adapt the average brightness.
    this._pass(this.lumMat, this.lumRT);
    const prev = this.avgRT[this.avgIdx], next = this.avgRT[1 - this.avgIdx];
    const au = this.avgMat.uniforms;
    au.tPrev.value = prev.texture;
    au.rateUp.value = 1 - Math.exp(-dt * 6);
    au.rateDown.value = 1 - Math.exp(-dt * 1.4);
    au.init.value = this.avgReady ? 0 : 1;
    this._pass(this.avgMat, next);
    this.avgIdx = 1 - this.avgIdx;
    this.avgReady = true;
    const avgTex = next.texture;
    // 2. Bright pass and blur for halos.
    this.brightMat.uniforms.tAvg.value = avgTex;
    this.brightMat.uniforms.gain.value = gain;
    this._pass(this.brightMat, this.bloomA);
    const bu = this.blurMat.uniforms;
    const bx = 1 / this.bloomA.width, by = 1 / this.bloomA.height;
    for (const s of [1.0, 2.0]) {
      bu.tInput.value = this.bloomA.texture; bu.dir.value.set(bx * s, 0);
      this._pass(this.blurMat, this.bloomB);
      bu.tInput.value = this.bloomB.texture; bu.dir.value.set(0, by * s);
      this._pass(this.blurMat, this.bloomA);
    }
    // 3. Final composite to the screen.
    const u = this.material.uniforms;
    u.time.value = time;
    u.gain.value = gain;
    u.tAvg.value = avgTex;
    u.amount.value = this.amount * this.amount * (3 - 2 * this.amount);
    u.phosphor.value = phosphor === 'white' ? 1 : 0;
    this._pass(this.material, null);
    this.quad.material = this.material;
  }

  dispose() {
    for (const t of [this.rt, this.lumRT, ...this.avgRT, this.bloomA, this.bloomB]) t.dispose();
    for (const m of [this.lumMat, this.avgMat, this.brightMat, this.blurMat, this.material]) m.dispose();
  }
}
