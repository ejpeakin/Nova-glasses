// Night-vision goggles post-process, modelled on a Gen 3 image intensifier.
// The world and viewmodel render into an HDR target, then:
//   1. the scene's average brightness is measured and adapted over time, driving
//      automatic brightness control (the goggles dim when a flash or explosion
//      floods the tube and open up in the dark);
//   2. bright sources go through a quarter-res bright pass and blur, giving the
//      characteristic halos around lights, muzzle flashes and IR lasers;
//   3. a final pass amplifies, sharpens, applies the intensifier response curve,
//      photon-limited scintillation noise and the faint honeycomb of the
//      microchannel plate, tints with green (P43) or white (P45) phosphor and masks
//      it with the dual-tube view that opens as the goggles flip down.
import * as THREE from '../lib/three.js';

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const LUMW = 'vec3(0.3, 0.59, 0.11)';
const LUM_SIZE = 32;

/** Shared GLSL: automatic brightness control from the adapted average luminance. */
const ABC = `
  uniform sampler2D tAvg; uniform float gain;
  float exposure() {
    float avg = max(texture2D(tAvg, vec2(0.5)).r, 1e-4);
    float abc = clamp(0.2 / (avg * gain), 0.28, 1.45);
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
          gl_FragColor = vec4(max(l - 0.85, 0.0), 0.0, 0.0, 1.0);
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
          // Eyepiece optics: slight barrel distortion.
          vec2 uv = 0.5 + c * (1.0 - 0.05 * dot(c, c));
          float e = exposure();
          float lum = lumAt(uv) * e;
          // Crisp tube image: gentle unsharp mask.
          float nb = (lumAt(uv + vec2(texel.x, 0.0)) + lumAt(uv - vec2(texel.x, 0.0)) + lumAt(uv + vec2(0.0, texel.y)) + lumAt(uv - vec2(0.0, texel.y))) * 0.25 * e;
          lum = max(0.0, lum + (lum - nb) * 0.55);
          // Halos around bright sources.
          lum += texture2D(tBloom, uv).r * 1.1;
          // Intensifier response with a touch of contrast.
          lum = 1.0 - exp(-lum * 1.8);
          lum = smoothstep(0.0, 1.0, pow(lum, 1.08)) * 0.7 + lum * 0.3; // contrast: deeper shadows, brighter highlights
          // Photon-limited scintillation: fine, fresh every frame, strongest in the dark.
          vec2 px = floor(gl_FragCoord.xy);
          float n = (hash(px + fract(time * 17.31) * 173.0) - 0.5) * 0.65 + (hash(floor(px * 0.5) + fract(time * 9.71) * 91.0) - 0.5) * 0.35;
          lum += n * (0.045 + 0.13 * (1.0 - lum));
          if (hash(px + floor(time * 30.0)) > 0.99935) lum += 0.55;
          // Microchannel-plate honeycomb, barely there.
          vec2 hp = gl_FragCoord.xy / 3.2;
          vec2 r = vec2(1.0, 1.7320508), h = r * 0.5;
          vec2 ha = mod(hp, r) - h, hb = mod(hp - h, r) - h;
          vec2 hg = dot(ha, ha) < dot(hb, hb) ? ha : hb;
          lum *= 1.0 - 0.03 * smoothstep(0.32, 0.5, length(hg));
          lum = clamp(lum, 0.0, 1.0);
          // Dual-tube view; tubes open as the goggles flip down, darker toward each tube's edge.
          vec2 p = vec2(c.x * aspect, c.y);
          float rad = mix(0.02, 0.6, amount);
          float dl = length(p - vec2(-0.22, 0.0)), dr = length(p + vec2(-0.22, 0.0));
          float d = min(dl, dr);
          float mask = smoothstep(rad, rad - 0.05, d);
          float vig = 1.0 - 0.32 * smoothstep(0.35, 1.0, d / max(rad, 0.01));
          vec3 green = vec3(0.34, 1.0, 0.45) * lum + vec3(0.004, 0.03, 0.008);
          vec3 white = vec3(0.87, 0.94, 1.0) * lum + vec3(0.012, 0.014, 0.018);
          vec3 col = mix(green, white, phosphor) * mask * vig;
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
    for (const s of [1.6, 3.2]) {
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
