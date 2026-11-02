// Procedural audio engine. Every sound — gunfire, explosions, footsteps, UI and
// music — is synthesized with the Web Audio API, so the game ships no audio files.
import { Store } from './Storage.js';
import { clamp, rand, pick } from './Utils.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.ambience = new Map();
    this.musicNodes = null;
    this.lastStep = 0;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.compressor = c.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.sfx = c.createGain();
    this.music = c.createGain();
    this.amb = c.createGain();
    this.sfx.connect(this.muffle);
    this.amb.connect(this.muffle);
    this.muffle.connect(this.compressor);
    this.music.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(c.destination);

    // Shared noise buffers.
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    // Small synthetic reverb impulse for gunshot tails.
    const irLen = Math.floor(c.sampleRate * 1.6);
    this.ir = c.createBuffer(2, irLen, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = this.ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.ir;
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.22;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.muffle);

    this.ready = true;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = Store.settings;
    this.master.gain.value = s.masterVolume;
    this.sfx.gain.value = s.sfxVolume;
    this.amb.gain.value = s.sfxVolume * 0.7;
    this.music.gain.value = s.musicVolume * 0.5;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setListener(pos, forward) {
    if (!this.ready || !Number.isFinite(pos.x + pos.y + pos.z + forward.x + forward.y + forward.z)) return;
    this.listenerPos = { x: pos.x, y: pos.y, z: pos.z };
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  setReverb(amount) {
    if (this.ready) this.reverbGain.gain.setTargetAtTime(amount, this.now, 0.3);
  }

  /** Temporarily muffle all world sound (flashbangs, near explosions). */
  muffleFor(seconds, freq = 500) {
    if (!this.ready) return;
    const f = this.muffle.frequency;
    f.cancelScheduledValues(this.now);
    f.setValueAtTime(freq, this.now);
    f.setTargetAtTime(20000, this.now + seconds, seconds * 0.5);
  }

  // ---------- building blocks ----------

  _out(pos, opts = {}) {
    // Returns a node to connect into; spatialised when a position is given.
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.value = opts.gain ?? 1;
    if (pos) {
      const dx = pos.x - this.listenerPos.x, dy = pos.y - this.listenerPos.y, dz = pos.z - this.listenerPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!Number.isFinite(dist) || dist > (opts.maxDist ?? 220)) return null;
      const p = c.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref ?? 4;
      p.rolloffFactor = opts.rolloff ?? 1.1;
      p.maxDistance = 1000;
      if (p.positionX) {
        p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      } else {
        p.setPosition(pos.x, pos.y, pos.z);
      }
      // Air absorption: distant sounds lose their highs.
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = clamp(18000 - dist * 140, 900, 18000);
      gain.connect(lp);
      lp.connect(p);
      p.connect(opts.bus ?? this.sfx);
      if (opts.verb) {
        const send = c.createGain();
        send.gain.value = opts.verb * clamp(dist / 40, 0.3, 1.5);
        lp.connect(send);
        send.connect(this.reverb);
      }
      gain._dist = dist;
      return gain;
    }
    gain.connect(opts.bus ?? this.sfx);
    if (opts.verb) {
      const send = c.createGain();
      send.gain.value = opts.verb * 0.4;
      gain.connect(send);
      send.connect(this.reverb);
    }
    gain._dist = 0;
    return gain;
  }

  _noise(dest, t, dur, { type = 'lowpass', freq = 1000, q = 0.7, gain = 1, attack = 0.001, decay, freqEnd, brown = false } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay ?? dur));
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    src.stop(t + dur + 0.1);
  }

  _tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd, gain = 0.5, attack = 0.002 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- weapons ----------

  /**
   * profile: { crack, body, thump, tail, pitch, gain } — per-weapon character.
   * pos null = the local player's own gun (non-spatial, louder).
   */
  gunshot(profile, pos = null, suppressed = false) {
    if (!this.ready) return;
    const t = this.now;
    const p = profile;
    const pitch = (p.pitch ?? 1) * rand(0.96, 1.04);
    if (suppressed) {
      const out = this._out(pos, { gain: pos ? 0.5 : 0.55, ref: 2, rolloff: 1.6, maxDist: 60 });
      if (!out) return;
      this._noise(out, t, 0.09, { type: 'bandpass', freq: 1400 * pitch, q: 0.8, gain: 0.9 });
      this._noise(out, t, 0.05, { type: 'highpass', freq: 3000, gain: 0.4 });
      this._tone(out, t, 0.06, { freq: 180 * pitch, freqEnd: 70, gain: 0.5 });
      return;
    }
    const out = this._out(pos, { gain: (pos ? 1.25 : 0.95) * (p.gain ?? 1), ref: 6, rolloff: 0.9, verb: p.tail ?? 0.6 });
    if (!out) return;
    const far = out._dist > 45;
    // Supersonic crack (sharp, bright).
    if (!far) this._noise(out, t, 0.05, { type: 'highpass', freq: 2200 * pitch, gain: (p.crack ?? 0.8) * 1.1, decay: 0.045 });
    // Body (the "bang").
    this._noise(out, t, 0.22, { type: 'lowpass', freq: (p.body ?? 2200) * pitch, freqEnd: 400, q: 1.2, gain: 1.4, decay: 0.2 });
    // Low thump.
    this._tone(out, t, 0.16, { freq: (p.thump ?? 140) * pitch, freqEnd: 42, gain: 1.1 });
    // Tail / slap off the environment.
    this._noise(out, t + 0.01, 0.6 * (p.tail ?? 0.6) + 0.15, { type: 'lowpass', freq: 900, freqEnd: 200, gain: 0.35, attack: 0.02 });
  }

  dryFire() {
    if (!this.ready) return;
    const out = this._out(null, { gain: 0.5 });
    this._noise(out, this.now, 0.03, { type: 'highpass', freq: 4000, gain: 0.8 });
  }

  /** Mechanical reload foley. kind: magOut | magIn | bolt | pump | shell | slide | raise */
  mech(kind, pos = null) {
    if (!this.ready) return;
    const t = this.now;
    const out = this._out(pos, { gain: pos ? 0.6 : 0.7, ref: 2, rolloff: 2, maxDist: 25 });
    if (!out) return;
    switch (kind) {
      case 'magOut':
        this._noise(out, t, 0.05, { type: 'bandpass', freq: 2600, q: 3, gain: 0.9 });
        this._noise(out, t + 0.06, 0.08, { type: 'bandpass', freq: 900, q: 2, gain: 0.5 });
        break;
      case 'magIn':
        this._noise(out, t, 0.04, { type: 'bandpass', freq: 1800, q: 2, gain: 0.8 });
        this._noise(out, t + 0.05, 0.05, { type: 'bandpass', freq: 3200, q: 4, gain: 1.0 });
        this._tone(out, t + 0.05, 0.05, { type: 'square', freq: 600, freqEnd: 300, gain: 0.08 });
        break;
      case 'bolt':
        this._noise(out, t, 0.06, { type: 'bandpass', freq: 2200, q: 3, gain: 0.9 });
        this._noise(out, t + 0.12, 0.06, { type: 'bandpass', freq: 3000, q: 3, gain: 1.0 });
        break;
      case 'pump':
        this._noise(out, t, 0.08, { type: 'bandpass', freq: 1200, q: 2, gain: 1.0, freqEnd: 2400 });
        this._noise(out, t + 0.14, 0.07, { type: 'bandpass', freq: 2400, q: 2, gain: 1.0, freqEnd: 1000 });
        break;
      case 'shell':
        this._noise(out, t, 0.04, { type: 'bandpass', freq: 1600, q: 3, gain: 0.7 });
        this._tone(out, t, 0.04, { freq: 900, gain: 0.05 });
        break;
      case 'slide':
        this._noise(out, t, 0.05, { type: 'bandpass', freq: 3500, q: 3, gain: 0.8 });
        this._noise(out, t + 0.08, 0.04, { type: 'bandpass', freq: 2500, q: 3, gain: 0.8 });
        break;
      case 'raise':
        this._noise(out, t, 0.12, { type: 'bandpass', freq: 700, q: 1, gain: 0.25, attack: 0.03 });
        this._noise(out, t + 0.1, 0.03, { type: 'bandpass', freq: 3000, q: 4, gain: 0.35 });
        break;
      case 'pin':
        this._tone(out, t, 0.12, { type: 'triangle', freq: 2400, freqEnd: 1800, gain: 0.15 });
        this._noise(out, t, 0.04, { type: 'highpass', freq: 5000, gain: 0.4 });
        break;
      case 'bounce':
        this._noise(out, t, 0.05, { type: 'bandpass', freq: 1500, q: 4, gain: 0.6 });
        this._tone(out, t, 0.05, { freq: 700, gain: 0.08 });
        break;
      default:
        this._noise(out, t, 0.05, { type: 'bandpass', freq: 2000, q: 2, gain: 0.6 });
    }
  }

  shellCasing(pos = null) {
    if (!this.ready) return;
    const out = this._out(pos, { gain: 0.15, ref: 1, rolloff: 2, maxDist: 15 });
    if (!out) return;
    const t = this.now + rand(0.25, 0.45);
    this._tone(out, t, 0.08, { type: 'triangle', freq: rand(3200, 4200), gain: 0.3 });
    this._tone(out, t + 0.09, 0.05, { type: 'triangle', freq: rand(3000, 4000), gain: 0.15 });
  }

  explosion(pos, size = 1) {
    if (!this.ready) return;
    const t = this.now;
    const out = this._out(pos, { gain: 1.8 * size, ref: 10, rolloff: 0.7, verb: 1.2, maxDist: 500 });
    if (!out) return;
    this._noise(out, t, 1.8, { type: 'lowpass', freq: 1800, freqEnd: 120, gain: 1.6, decay: 1.6, brown: false });
    this._noise(out, t, 2.4, { type: 'lowpass', freq: 400, freqEnd: 60, gain: 2.0, brown: true });
    this._tone(out, t, 0.8, { freq: 75, freqEnd: 28, gain: 1.6 });
    // Debris crackle.
    for (let i = 0; i < 6; i++) {
      this._noise(out, t + 0.2 + Math.random() * 0.9, 0.04, { type: 'highpass', freq: 2500, gain: 0.25 });
    }
  }

  flashbang(pos) {
    if (!this.ready) return;
    const t = this.now;
    const out = this._out(pos, { gain: 1.6, ref: 8, rolloff: 0.8, verb: 0.8 });
    if (!out) return;
    this._noise(out, t, 0.6, { type: 'highpass', freq: 800, gain: 1.8, decay: 0.5 });
    this._tone(out, t, 0.2, { freq: 120, freqEnd: 40, gain: 1.2 });
  }

  tinnitus(seconds) {
    if (!this.ready) return;
    const out = this._out(null, { gain: 0.12, bus: this.music });
    this._tone(out, this.now, seconds, { freq: 3400, gain: 0.5, attack: 0.05 });
  }

  impact(material = 'concrete', pos) {
    if (!this.ready) return;
    const out = this._out(pos, { gain: 0.45, ref: 2, rolloff: 1.8, maxDist: 40 });
    if (!out) return;
    const t = this.now;
    if (material === 'metal') {
      this._tone(out, t, 0.18, { type: 'triangle', freq: rand(1800, 2600), freqEnd: 1200, gain: 0.25 });
      this._noise(out, t, 0.04, { type: 'highpass', freq: 3000, gain: 0.6 });
    } else if (material === 'flesh') {
      this._noise(out, t, 0.08, { type: 'lowpass', freq: 700, gain: 0.9 });
    } else if (material === 'wood') {
      this._noise(out, t, 0.07, { type: 'bandpass', freq: 900, q: 2, gain: 0.8 });
    } else if (material === 'soft') {
      this._noise(out, t, 0.08, { type: 'lowpass', freq: 600, gain: 0.6 });
    } else {
      this._noise(out, t, 0.06, { type: 'bandpass', freq: 2200, q: 1.2, gain: 0.8 });
      this._noise(out, t + 0.01, 0.12, { type: 'lowpass', freq: 800, gain: 0.3 });
    }
  }

  whiz(pos) {
    if (!this.ready) return;
    const out = this._out(pos, { gain: 0.5, ref: 1, rolloff: 1.5, maxDist: 8 });
    if (!out) return;
    this._noise(out, this.now, 0.14, { type: 'bandpass', freq: 4000, freqEnd: 1500, q: 4, gain: 0.8, attack: 0.03 });
  }

  footstep(surface = 'concrete', pos = null, loud = 1) {
    if (!this.ready) return;
    const out = this._out(pos, { gain: (pos ? 0.6 : 0.22) * loud, ref: 2, rolloff: 1.8, maxDist: 30 });
    if (!out) return;
    const t = this.now;
    switch (surface) {
      case 'snow':
        this._noise(out, t, 0.14, { type: 'bandpass', freq: 1800, q: 0.6, gain: 0.7, attack: 0.02 });
        break;
      case 'sand':
        this._noise(out, t, 0.12, { type: 'highpass', freq: 1500, gain: 0.5, attack: 0.01 });
        break;
      case 'metal':
        this._noise(out, t, 0.06, { type: 'bandpass', freq: 600, q: 1, gain: 0.8 });
        this._tone(out, t, 0.12, { type: 'triangle', freq: rand(300, 360), gain: 0.06 });
        break;
      case 'wood':
        this._noise(out, t, 0.07, { type: 'bandpass', freq: 500, q: 1.5, gain: 0.9 });
        break;
      default:
        this._noise(out, t, 0.06, { type: 'bandpass', freq: 900, q: 0.9, gain: 0.8 });
        this._noise(out, t, 0.03, { type: 'highpass', freq: 3500, gain: 0.25 });
    }
  }

  // ---------- feedback / UI ----------

  hitmarker(kill = false, head = false) {
    if (!this.ready) return;
    const out = this._out(null, { gain: 0.4 });
    const t = this.now;
    this._noise(out, t, 0.03, { type: 'bandpass', freq: 3500, q: 3, gain: 1 });
    if (head) this._tone(out, t, 0.12, { type: 'triangle', freq: 2600, gain: 0.25 });
    if (kill) {
      this._tone(out, t + 0.02, 0.18, { type: 'sine', freq: 180, freqEnd: 90, gain: 0.8 });
      this._noise(out, t + 0.02, 0.06, { type: 'lowpass', freq: 600, gain: 0.6 });
    }
  }

  hurt() {
    if (!this.ready) return;
    const out = this._out(null, { gain: 0.35 });
    this._noise(out, this.now, 0.12, { type: 'lowpass', freq: 500, gain: 1 });
    this._tone(out, this.now, 0.12, { freq: 90, freqEnd: 50, gain: 0.6 });
  }

  heartbeat() {
    if (!this.ready) return;
    const out = this._out(null, { gain: 0.5, bus: this.music });
    const t = this.now;
    this._tone(out, t, 0.12, { freq: 55, freqEnd: 40, gain: 1 });
    this._tone(out, t + 0.22, 0.1, { freq: 50, freqEnd: 38, gain: 0.7 });
  }

  /** Goggles flipping down (tube spin-up whine) or up. */
  nvg(on) {
    if (!this.ready) return;
    const t = this.now;
    const out = this._out(null, { gain: 0.5 });
    this._noise(out, t, 0.05, { type: 'bandpass', freq: 1800, q: 2, gain: 0.7 });
    this._noise(out, t + 0.05, 0.06, { type: 'bandpass', freq: 900, q: 1.5, gain: 0.5 });
    if (on) this._tone(out, t + 0.08, 0.9, { type: 'sine', freq: 2400, freqEnd: 9500, gain: 0.05, attack: 0.08 });
    else this._tone(out, t, 0.35, { type: 'sine', freq: 8000, freqEnd: 1500, gain: 0.03 });
  }

  ui(kind = 'click') {
    if (!this.ready) return;
    const out = this._out(null, { gain: 0.25, bus: this.music });
    const t = this.now;
    if (kind === 'hover') this._tone(out, t, 0.05, { type: 'sine', freq: 1700, gain: 0.25 });
    else if (kind === 'back') this._tone(out, t, 0.09, { type: 'triangle', freq: 600, freqEnd: 380, gain: 0.5 });
    else if (kind === 'confirm') {
      this._tone(out, t, 0.08, { type: 'triangle', freq: 880, gain: 0.5 });
      this._tone(out, t + 0.07, 0.14, { type: 'triangle', freq: 1320, gain: 0.5 });
    } else if (kind === 'objective') {
      this._tone(out, t, 0.18, { type: 'triangle', freq: 660, gain: 0.5 });
      this._tone(out, t + 0.12, 0.18, { type: 'triangle', freq: 990, gain: 0.5 });
      this._tone(out, t + 0.24, 0.35, { type: 'triangle', freq: 1320, gain: 0.45 });
    } else if (kind === 'alert') {
      this._tone(out, t, 0.1, { type: 'square', freq: 520, gain: 0.25 });
      this._tone(out, t + 0.14, 0.1, { type: 'square', freq: 520, gain: 0.25 });
    } else if (kind === 'radio') {
      this._noise(out, t, 0.1, { type: 'bandpass', freq: 2500, q: 2, gain: 0.5 });
      this._tone(out, t, 0.06, { type: 'square', freq: 1800, gain: 0.08 });
    } else if (kind === 'type') {
      this._noise(out, t, 0.015, { type: 'highpass', freq: 5000, gain: 0.25 });
    } else if (kind === 'beep') {
      this._tone(out, t, 0.06, { type: 'sine', freq: 2200, gain: 0.35 });
    } else {
      this._tone(out, t, 0.05, { type: 'square', freq: 1000, gain: 0.15 });
      this._noise(out, t, 0.02, { type: 'highpass', freq: 4000, gain: 0.3 });
    }
  }

  // ---------- ambience ----------

  /** kind: wind | rain | hum | waves | city */
  setAmbience(kinds = []) {
    if (!this.ready) return;
    const want = new Set(kinds);
    for (const [k, node] of this.ambience) {
      if (!want.has(k)) {
        node.gain.gain.setTargetAtTime(0, this.now, 0.5);
        setTimeout(() => { try { node.src.stop(); } catch { /* ignored */ } }, 2500);
        this.ambience.delete(k);
      }
    }
    for (const k of want) {
      if (this.ambience.has(k)) continue;
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = k === 'rain' ? this.noise : this.brown;
      src.loop = true;
      const f = c.createBiquadFilter();
      const g = c.createGain();
      g.gain.value = 0;
      let level = 0.3;
      if (k === 'wind') { f.type = 'lowpass'; f.frequency.value = 500; level = 0.5; }
      if (k === 'rain') { f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.4; level = 0.12; }
      if (k === 'hum') { f.type = 'lowpass'; f.frequency.value = 180; level = 0.6; }
      if (k === 'waves') { f.type = 'lowpass'; f.frequency.value = 700; level = 0.5; }
      if (k === 'city') { f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 0.5; level = 0.5; }
      src.connect(f); f.connect(g); g.connect(this.amb);
      // Slow LFO so the bed breathes.
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      lfo.frequency.value = k === 'waves' ? 0.12 : 0.07;
      lfoGain.gain.value = level * 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      lfo.start();
      if (k === 'hum') {
        const o = c.createOscillator();
        o.frequency.value = 60;
        const og = c.createGain();
        og.gain.value = 0.04;
        o.connect(og); og.connect(g);
        o.start();
        src.addEventListener('ended', () => { try { o.stop(); } catch { /* ignored */ } });
      }
      src.start();
      src.addEventListener('ended', () => { try { lfo.stop(); } catch { /* ignored */ } });
      g.gain.setTargetAtTime(level, this.now, 1.2);
      this.ambience.set(k, { src, gain: g });
    }
  }

  // ---------- vehicle loops ----------

  /**
   * Continuous loops whose level the game drives every frame.
   * kind: 'rotor' (blade slap + turbine whine) | 'rope' (friction hiss while fast-roping)
   */
  startLoop(name, kind) {
    if (!this.ready) return;
    this.loops = this.loops || new Map();
    if (this.loops.has(name)) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(this.sfx);
    const nodes = [];
    if (kind === 'rotor') {
      // Low thump: brown noise amplitude-modulated at the blade-pass rate.
      const src = c.createBufferSource();
      src.buffer = this.brown; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const am = c.createGain(); am.gain.value = 0.55;
      const lfo = c.createOscillator(); lfo.frequency.value = 5.2;
      const lfoG = c.createGain(); lfoG.gain.value = 0.5;
      lfo.connect(lfoG); lfoG.connect(am.gain);
      src.connect(lp); lp.connect(am); am.connect(out);
      const boost = c.createGain(); boost.gain.value = 2.2; am.disconnect(); am.connect(boost); boost.connect(out);
      // Turbine whine.
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 410;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      const og = c.createGain(); og.gain.value = 0.035;
      osc.connect(bp); bp.connect(og); og.connect(out);
      // Rotor wash hiss.
      const hiss = c.createBufferSource(); hiss.buffer = this.noise; hiss.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1800; hp.Q.value = 0.5;
      const hg = c.createGain(); hg.gain.value = 0.09;
      hiss.connect(hp); hp.connect(hg); hg.connect(out);
      for (const n of [src, lfo, osc, hiss]) { n.start(); nodes.push(n); }
    } else {
      const src = c.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
      src.connect(bp); bp.connect(out);
      src.start();
      nodes.push(src);
      out._filter = bp;
    }
    this.loops.set(name, { out, nodes });
  }

  setLoop(name, gain, pitch = 1) {
    const l = this.loops?.get(name);
    if (!l) return;
    l.out.gain.setTargetAtTime(Math.max(0, gain), this.now, 0.08);
    if (l.out._filter) l.out._filter.frequency.setTargetAtTime(1000 + pitch * 1200, this.now, 0.1);
  }

  stopLoop(name) {
    const l = this.loops?.get(name);
    if (!l) return;
    this.loops.delete(name);
    l.out.gain.setTargetAtTime(0, this.now, 0.3);
    setTimeout(() => { for (const n of l.nodes) { try { n.stop(); } catch { /* ignored */ } } l.out.disconnect(); }, 1500);
  }

  // ---------- music ----------

  /** Procedural ambient score. mood: menu | tension | victory | none */
  playMusic(mood = 'menu') {
    if (!this.ready) return;
    if (this.musicNodes?.mood === mood) return;
    this.stopMusic();
    if (mood === 'none') return;
    const c = this.ctx;
    const bus = c.createGain();
    bus.gain.value = 0;
    bus.connect(this.music);
    bus.gain.setTargetAtTime(1, this.now, 1.5);
    const nodes = { mood, bus, oscs: [], timer: 0 };
    const root = mood === 'victory' ? 55 * Math.pow(2, 3 / 12) : 55; // A1 / C2
    // Drone: detuned saws through a slow-moving lowpass.
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 2;
    lp.connect(bus);
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 0.05;
    lfoG.gain.value = 220;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    lfo.start();
    nodes.oscs.push(lfo);
    for (const [mult, det] of [[1, -7], [1, 6], [1.5, 0], [2, 3]]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root * mult;
      o.detune.value = det;
      const g = c.createGain();
      g.gain.value = mult === 1 ? 0.12 : 0.06;
      o.connect(g); g.connect(lp);
      o.start();
      nodes.oscs.push(o);
    }
    // Sparse minor-key motif + pulse.
    const scale = mood === 'victory' ? [0, 4, 7, 11, 12, 16] : [0, 3, 7, 10, 12, 15, 19];
    let step = 0;
    const tick = () => {
      if (!this.ready) return;
      const t = this.now + 0.05;
      const out = c.createGain();
      out.gain.value = 0.35;
      out.connect(bus);
      // Pulse on every beat (tension) or every other (menu).
      if (mood === 'tension' || step % 2 === 0) {
        this._tone(out, t, 0.35, { freq: root * 2, freqEnd: root * 1.9, gain: 0.5 });
      }
      if (step % 4 === 0 || Math.random() < 0.25) {
        const n = pick(scale);
        const f = root * 4 * Math.pow(2, n / 12);
        this._tone(out, t, 2.4, { type: 'triangle', freq: f, gain: 0.18, attack: 0.01 });
        this._tone(out, t, 2.4, { type: 'sine', freq: f * 2, gain: 0.05, attack: 0.01 });
      }
      if (mood !== 'victory' && step % 16 === 8) {
        this._noise(out, t, 3, { type: 'bandpass', freq: 400, freqEnd: 2400, q: 3, gain: 0.12, attack: 1.5, decay: 3 });
      }
      step++;
    };
    const bpm = mood === 'tension' ? 96 : 72;
    nodes.timer = setInterval(tick, 60000 / bpm);
    this.musicNodes = nodes;
  }

  stopMusic() {
    if (!this.musicNodes) return;
    const n = this.musicNodes;
    clearInterval(n.timer);
    n.bus.gain.setTargetAtTime(0, this.now, 0.6);
    setTimeout(() => {
      for (const o of n.oscs) { try { o.stop(); } catch { /* ignored */ } }
      n.bus.disconnect();
    }, 3000);
    this.musicNodes = null;
  }
}

export const Audio = new AudioEngine();
