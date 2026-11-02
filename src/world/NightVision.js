// Night-vision goggles post-process. The world and viewmodel render into an HDR
// target; a fullscreen pass amplifies the light, blooms bright sources, adds
// intensifier grain and scintillation, tints the image (green or white phosphor)
// and masks it with a dual-tube goggle view that opens when the goggles flip down.
import * as THREE from '../lib/three.js';

export class NightVision {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: renderer.capabilities.isWebGL2 ? 4 : 0,
    });
    this.amount = 0; // goggle flip progress 0..1
    this.target = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        time: { value: 0 },
        gain: { value: 3 },
        amount: { value: 0 },
        phosphor: { value: 0 },
        aspect: { value: size.x / size.y },
        texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; uniform float gain; uniform float amount;
        uniform float phosphor; uniform float aspect; uniform vec2 texel;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float lumAt(vec2 uv) { return dot(texture2D(tDiffuse, uv).rgb, vec3(0.3, 0.59, 0.11)); }
        void main() {
          vec2 c = vUv - 0.5;
          // Slight barrel distortion of the eyepiece optics.
          vec2 uv = 0.5 + c * (1.0 - 0.06 * dot(c, c));
          float lum = lumAt(uv) * gain;
          // Halo / bloom around light sources (the classic NVG flare).
          float glow = 0.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.785398;
            vec2 o = vec2(cos(a), sin(a));
            glow += max(lumAt(uv + o * texel * 6.0) * gain - 1.1, 0.0);
            glow += max(lumAt(uv + o * texel * 16.0) * gain - 1.1, 0.0) * 0.6;
          }
          lum += glow * 0.09;
          // Intensifier response: compress highlights, lift shadows a touch.
          lum = 1.0 - exp(-lum * 1.6);
          lum = pow(lum, 0.9);
          // Grain (stronger in the dark), scintillation and faint scan pattern.
          float g = hash(floor(vUv / texel / 1.5) + fract(time * 13.7) * 91.0) - 0.5;
          lum += g * (0.09 - lum * 0.05);
          if (hash(floor(vUv / texel) + floor(time * 30.0)) > 0.9993) lum += 0.6;
          lum *= 0.965 + 0.035 * sin(vUv.y / texel.y * 1.6);
          lum *= 0.985 + 0.015 * sin(time * 47.0);
          lum = clamp(lum, 0.0, 1.0);
          // Dual-tube goggle mask; tubes open as the goggles flip down.
          vec2 p = vec2(c.x * aspect, c.y);
          float r = mix(0.02, 0.57, amount);
          float d = min(length(p - vec2(-0.23, 0.0)), length(p + vec2(-0.23, 0.0)));
          float mask = smoothstep(r, r - 0.06, d);
          float vig = 1.0 - smoothstep(0.15, 0.6, d / max(r, 0.01) * 0.6);
          vec3 green = vec3(0.32, 1.0, 0.42) * lum + vec3(0.0, 0.02, 0.0);
          vec3 white = vec3(0.86, 0.95, 1.0) * lum;
          vec3 col = mix(green, white, phosphor) * mask * (0.75 + 0.25 * vig);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  get active() { return this.amount > 0.001 || this.target > 0; }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(size.x, size.y);
    this.material.uniforms.aspect.value = size.x / size.y;
    this.material.uniforms.texel.value.set(1 / size.x, 1 / size.y);
  }

  toggle(on) { this.target = on ? 1 : 0; }

  update(dt) {
    // Flip down takes ~0.45 s, flip up is quicker.
    const speed = this.target > this.amount ? 2.2 : 5;
    this.amount += Math.sign(this.target - this.amount) * Math.min(Math.abs(this.target - this.amount), dt * speed);
  }

  /** Composite the HDR target to the screen. */
  present(time, gain, phosphor) {
    const u = this.material.uniforms;
    u.time.value = time;
    u.gain.value = gain;
    u.amount.value = this.amount * this.amount * (3 - 2 * this.amount);
    u.phosphor.value = phosphor === 'white' ? 1 : 0;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.rt.dispose();
    this.material.dispose();
  }
}
