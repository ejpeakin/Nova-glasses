// Procedurally painted canvas textures. Mostly near-neutral detail maps that the
// materials tint, so a handful of textures cover every surface in the game.
import * as THREE from '../lib/three.js';
import { makeRng } from '../core/Utils.js';

const cache = new Map();
let maxAniso = 4;

export function setAnisotropy(n) { maxAniso = n; }

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function speckle(g, size, rng, count, rMin, rMax, alpha, lightBias = 0.5) {
  for (let i = 0; i < count; i++) {
    const v = rng() < lightBias ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * rng()})`;
    const r = rMin + rng() * (rMax - rMin);
    const x = rng() * size, y = rng() * size;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    // Wrap at edges so the texture tiles seamlessly.
    if (x < r || x > size - r || y < r || y > size - r) {
      for (const [ox, oy] of [[size, 0], [-size, 0], [0, size], [0, -size]]) {
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

function grain(g, size, rng, amount) {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

const painters = {
  concrete(g, s, rng) {
    g.fillStyle = '#b4b4b0'; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 900, 6, 40, 0.06);
    speckle(g, s, rng, 2500, 1, 3, 0.18);
    // Formwork seams.
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
    // Water stains.
    for (let i = 0; i < 8; i++) {
      const x = rng() * s, w = 10 + rng() * 40;
      const grd = g.createLinearGradient(0, 0, 0, s * 0.6);
      grd.addColorStop(0, 'rgba(40,35,30,0.18)'); grd.addColorStop(1, 'rgba(40,35,30,0)');
      g.fillStyle = grd; g.fillRect(x, 0, w, s * 0.6);
    }
    grain(g, s, rng, 22);
  },
  sand(g, s, rng) {
    g.fillStyle = '#d9c39a'; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 600, 10, 60, 0.05);
    for (let y = 0; y < s; y += 6) {
      g.strokeStyle = `rgba(120,90,50,${0.04 + rng() * 0.05})`;
      g.beginPath();
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
      g.stroke();
    }
    speckle(g, s, rng, 4000, 0.5, 1.5, 0.35);
    grain(g, s, rng, 26);
  },
  snow(g, s, rng) {
    g.fillStyle = '#eef3f8'; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 500, 10, 50, 0.05, 0.3);
    speckle(g, s, rng, 2500, 0.5, 1.6, 0.2, 0.7);
    grain(g, s, rng, 10);
  },
  asphalt(g, s, rng) {
    g.fillStyle = '#55575a'; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 6000, 0.5, 1.8, 0.4);
    speckle(g, s, rng, 300, 15, 60, 0.06, 0.2);
    // Cracks.
    g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      let x = rng() * s, y = rng() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    grain(g, s, rng, 20);
  },
  brick(g, s, rng) {
    g.fillStyle = '#9a9086'; g.fillRect(0, 0, s, s);
    const rows = 16, bh = s / rows, bw = s / 8;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let c = -1; c < 9; c++) {
        const v = 150 + rng() * 60;
        g.fillStyle = `rgb(${v},${v * 0.82},${v * 0.7})`;
        g.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
    speckle(g, s, rng, 1500, 0.5, 2, 0.2);
    grain(g, s, rng, 24);
  },
  metal(g, s, rng) {
    g.fillStyle = '#a4a8ac'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? 255 : 0},${rng() < 0.5 ? 255 : 0},255,${rng() * 0.04})`;
      g.fillRect(0, y, s, 1);
    }
    speckle(g, s, rng, 200, 4, 30, 0.08, 0.3);
    grain(g, s, rng, 14);
  },
  corrugated(g, s, rng) {
    g.fillStyle = '#9da0a3'; g.fillRect(0, 0, s, s);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * s;
      const grd = g.createLinearGradient(x, 0, x + s / n, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0.28)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      grd.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grd; g.fillRect(x, 0, s / n, s);
    }
    // Rust streaks.
    for (let i = 0; i < 14; i++) {
      const x = rng() * s, h = 40 + rng() * 200;
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(110,55,20,0.35)'); grd.addColorStop(1, 'rgba(110,55,20,0)');
      g.fillStyle = grd; g.fillRect(x, rng() * s * 0.5, 3 + rng() * 6, h);
    }
    speckle(g, s, rng, 800, 0.5, 2.5, 0.25);
    grain(g, s, rng, 14);
  },
  wood(g, s, rng) {
    g.fillStyle = '#9b7a55'; g.fillRect(0, 0, s, s);
    const planks = 6;
    for (let p = 0; p < planks; p++) {
      const y = (p / planks) * s;
      const v = 0.85 + rng() * 0.3;
      g.fillStyle = `rgba(${120 * v},${92 * v},${60 * v},0.6)`;
      g.fillRect(0, y, s, s / planks - 3);
      for (let k = 0; k < 30; k++) {
        g.strokeStyle = `rgba(60,40,20,${rng() * 0.25})`;
        g.beginPath();
        const yy = y + rng() * (s / planks);
        g.moveTo(0, yy);
        g.bezierCurveTo(s * 0.3, yy + (rng() - 0.5) * 8, s * 0.6, yy + (rng() - 0.5) * 8, s, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(30,20,10,0.6)'; g.fillRect(0, y + s / planks - 3, s, 3);
    }
    grain(g, s, rng, 18);
  },
  tiles(g, s, rng) {
    g.fillStyle = '#7d8286'; g.fillRect(0, 0, s, s);
    const n = 4, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 175 + rng() * 25;
      g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
    speckle(g, s, rng, 400, 2, 12, 0.06, 0.2);
    grain(g, s, rng, 10);
  },
  panel(g, s, rng) {
    g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s / 2 - 4); g.strokeRect(2, s / 2 + 2, s - 4, s / 2 - 4);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (const [x, y] of [[12, 12], [s - 12, 12], [12, s / 2 - 12], [s - 12, s / 2 - 12], [12, s / 2 + 12], [s - 12, s / 2 + 12], [12, s - 12], [s - 12, s - 12]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
    speckle(g, s, rng, 200, 3, 20, 0.05, 0.3);
    grain(g, s, rng, 10);
  },
  rock(g, s, rng) {
    g.fillStyle = '#8a8580'; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 400, 10, 70, 0.12);
    speckle(g, s, rng, 3000, 1, 4, 0.2);
    g.strokeStyle = 'rgba(30,30,30,0.35)';
    for (let i = 0; i < 12; i++) {
      let x = rng() * s, y = rng() * s;
      g.lineWidth = 1 + rng() * 2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 60; y += rng() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    grain(g, s, rng, 26);
  },
  dirt(g, s, rng) {
    g.fillStyle = '#7a6a55'; g.fillRect(0, 0, s, s);
    speckle(g, s, rng, 700, 8, 50, 0.08);
    speckle(g, s, rng, 5000, 0.5, 2, 0.3);
    grain(g, s, rng, 30);
  },
  fabric(g, s, rng) {
    // Woodland-style camo, tinted per faction.
    g.fillStyle = '#9a9a8a'; g.fillRect(0, 0, s, s);
    const cols = ['rgba(60,60,50,0.7)', 'rgba(130,125,100,0.6)', 'rgba(40,40,35,0.6)', 'rgba(170,160,130,0.5)'];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      let x = rng() * s, y = rng() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo(x + (rng() - 0.5) * 50, y + (rng() - 0.5) * 50);
      g.fill();
    }
    grain(g, s, rng, 20);
  },
  hazard(g, s) {
    g.fillStyle = '#e0b020'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1a1a1a';
    for (let i = -s; i < s * 2; i += s / 4) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s / 8, 0); g.lineTo(i + s / 8 - s, s); g.lineTo(i - s, s); g.fill();
    }
  },
};

/** Returns a cached repeating texture. */
export function getTexture(name, size = 512) {
  const key = `${name}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size);
  const g = c.getContext('2d', { willReadFrequently: true });
  painters[name](g, size, makeRng(name.length * 977 + size));
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, tex);
  return tex;
}

/** Soft round sprite used for smoke, dust, glows. */
export function getSpriteTexture(kind = 'soft') {
  const key = `sprite:${kind}`;
  if (cache.has(key)) return cache.get(key);
  const s = 128;
  const c = canvas(s);
  const g = c.getContext('2d');
  if (kind === 'smoke') {
    const rng = makeRng(77);
    for (let i = 0; i < 24; i++) {
      const x = s / 2 + (rng() - 0.5) * s * 0.4, y = s / 2 + (rng() - 0.5) * s * 0.4;
      const r = s * (0.15 + rng() * 0.25);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
    }
  } else if (kind === 'flash') {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,240,1)');
    grd.addColorStop(0.2, 'rgba(255,220,140,0.9)');
    grd.addColorStop(0.5, 'rgba(255,140,40,0.35)');
    grd.addColorStop(1, 'rgba(255,100,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    // Star spikes.
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,230,170,0.6)'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * s * 0.48, s / 2 + Math.sin(a) * s * 0.48); g.stroke();
    }
  } else if (kind === 'spark') {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,220,1)'); grd.addColorStop(0.3, 'rgba(255,190,80,0.8)'); grd.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  } else if (kind === 'hole') {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.25, 'rgba(10,10,10,0.95)');
    grd.addColorStop(0.45, 'rgba(40,38,35,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  } else if (kind === 'scorch') {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.9)'); grd.addColorStop(0.6, 'rgba(10,8,5,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  } else if (kind === 'drop') {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,0.8)');
    g.fillStyle = grd; g.fillRect(s / 2 - 2, 0, 4, s);
  } else {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
