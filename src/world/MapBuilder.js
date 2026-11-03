// Builds level geometry. Static boxes are merged per material (a few draw calls
// per map) and registered as colliders; helpers assemble buildings and props.
import * as THREE from '../lib/three.js';
import { getTexture } from './Textures.js';
import { makeRng } from '../core/Utils.js';

const MATS = {
  concrete: { tex: 'concrete', color: 0xc9c5bd, scale: 4, rough: 0.92, sound: 'concrete' },
  concreteDark: { tex: 'concrete', color: 0x8b8882, scale: 4, rough: 0.92, sound: 'concrete' },
  plaster: { tex: 'concrete', color: 0xd8cdb6, scale: 3, rough: 0.95, sound: 'concrete' },
  plasterTan: { tex: 'concrete', color: 0xc8a97a, scale: 3, rough: 0.95, sound: 'concrete' },
  sand: { tex: 'sand', color: 0xe0c89e, scale: 7, rough: 1, sound: 'sand' },
  snow: { tex: 'snow', color: 0xf2f6fa, scale: 6, rough: 0.85, sound: 'snow' },
  asphalt: { tex: 'asphalt', color: 0x9a9a9a, scale: 7, rough: 0.95, sound: 'concrete' },
  brick: { tex: 'brick', color: 0xd0c4b8, scale: 3, rough: 0.95, sound: 'concrete' },
  brickRed: { tex: 'brick', color: 0xc08060, scale: 3, rough: 0.95, sound: 'concrete' },
  metal: { tex: 'metal', color: 0x8d949a, scale: 3, rough: 0.45, metal: 0.65, sound: 'metal' },
  metalDark: { tex: 'metal', color: 0x4a4f55, scale: 3, rough: 0.5, metal: 0.6, sound: 'metal' },
  steelBlue: { tex: 'metal', color: 0x3c5268, scale: 3, rough: 0.5, metal: 0.5, sound: 'metal' },
  contRed: { tex: 'corrugated', color: 0x9a3a2a, scale: 2.6, rough: 0.7, metal: 0.3, sound: 'metal' },
  contBlue: { tex: 'corrugated', color: 0x2d5585, scale: 2.6, rough: 0.7, metal: 0.3, sound: 'metal' },
  contGreen: { tex: 'corrugated', color: 0x46663d, scale: 2.6, rough: 0.7, metal: 0.3, sound: 'metal' },
  contOrange: { tex: 'corrugated', color: 0xc06a2a, scale: 2.6, rough: 0.7, metal: 0.3, sound: 'metal' },
  contGrey: { tex: 'corrugated', color: 0x8d9295, scale: 2.6, rough: 0.7, metal: 0.3, sound: 'metal' },
  hangar: { tex: 'corrugated', color: 0x7b8478, scale: 3, rough: 0.75, metal: 0.3, sound: 'metal' },
  wood: { tex: 'wood', color: 0xb08a5c, scale: 1.6, rough: 0.9, sound: 'wood' },
  woodDark: { tex: 'wood', color: 0x6e5338, scale: 1.6, rough: 0.9, sound: 'wood' },
  tiles: { tex: 'tiles', color: 0xc5c9cc, scale: 2.5, rough: 0.6, sound: 'concrete' },
  panel: { tex: 'panel', color: 0xd4d8dc, scale: 2.4, rough: 0.55, metal: 0.2, sound: 'metal' },
  panelDark: { tex: 'panel', color: 0x5c6268, scale: 2.4, rough: 0.55, metal: 0.3, sound: 'metal' },
  rock: { tex: 'rock', color: 0x9a948c, scale: 5, rough: 1, sound: 'concrete' },
  rockDark: { tex: 'rock', color: 0x6a6660, scale: 5, rough: 1, sound: 'concrete' },
  dirt: { tex: 'dirt', color: 0xe0c8a0, scale: 5, rough: 1, sound: 'sand' },
  sandbag: { tex: 'fabric', color: 0xb8a77c, scale: 1.2, rough: 1, sound: 'soft' },
  hesco: { tex: 'dirt', color: 0xb0a07a, scale: 2, rough: 1, sound: 'soft' },
  canvas: { tex: 'fabric', color: 0x8a8a62, scale: 3, rough: 1, sound: 'soft' },
  olive: { tex: 'metal', color: 0x5a6340, scale: 3, rough: 0.7, metal: 0.3, sound: 'metal' },
  tan: { tex: 'metal', color: 0xb9a37a, scale: 3, rough: 0.7, metal: 0.3, sound: 'metal' },
  burnt: { tex: 'metal', color: 0x2c2826, scale: 3, rough: 0.9, metal: 0.4, sound: 'metal' },
  carRed: { tex: 'metal', color: 0x8c2a24, scale: 3, rough: 0.35, metal: 0.6, sound: 'metal' },
  carWhite: { tex: 'metal', color: 0xd8d8d4, scale: 3, rough: 0.35, metal: 0.6, sound: 'metal' },
  carBlue: { tex: 'metal', color: 0x2a3e66, scale: 3, rough: 0.35, metal: 0.6, sound: 'metal' },
  black: { tex: 'metal', color: 0x1f2022, scale: 3, rough: 0.6, metal: 0.3, sound: 'metal' },
  rubber: { color: 0x151515, rough: 0.95, sound: 'soft' },
  glass: { color: 0x223344, rough: 0.1, metal: 0.9, sound: 'metal' },
  hazard: { tex: 'hazard', color: 0xffffff, scale: 1, rough: 0.6, sound: 'metal' },
  foliage: { color: 0x2f4630, rough: 1, sound: 'soft' },
  foliageSnow: { color: 0x3a5040, rough: 1, sound: 'soft' },
  bark: { tex: 'wood', color: 0x5a4532, scale: 1, rough: 1, sound: 'wood' },
  lightPanel: { color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2, rough: 0.4, sound: 'metal', noShadow: true },
  lightWarm: { color: 0xffe0b0, emissive: 0xffc080, emissiveIntensity: 2.5, rough: 0.4, sound: 'metal', noShadow: true },
  lightRed: { color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 2.5, rough: 0.4, sound: 'metal', noShadow: true },
  roadPaint: { color: 0xdedbd0, rough: 0.85, sound: 'concrete' },
  roadYellow: { color: 0xd9b23a, rough: 0.85, sound: 'concrete' },
  tracks: { tex: 'dirt', color: 0xc9ad80, scale: 3, rough: 1, sound: 'sand' },
  puddle: { color: 0x0b1117, rough: 0.04, metal: 0.85, sound: 'soft', noShadow: true },
  tarp: { tex: 'fabric', color: 0x6a6e4c, scale: 2.5, rough: 1, sound: 'soft' },
  scrub: { color: 0x6f6d42, rough: 1, sound: 'soft' },
  mesa: { tex: 'rock', color: 0xc49b6c, scale: 22, rough: 1, sound: 'concrete' },
  rust: { tex: 'corrugated', color: 0x7a4a2a, scale: 2, rough: 0.9, metal: 0.3, sound: 'metal' },
  pipeRed: { tex: 'metal', color: 0x8a2a20, scale: 2, rough: 0.6, metal: 0.4, sound: 'metal' },
  pipeYellow: { tex: 'metal', color: 0xb8902a, scale: 2, rough: 0.6, metal: 0.4, sound: 'metal' },
  signRed: { color: 0xa8261e, rough: 0.6, sound: 'metal' },
  signBlue: { color: 0x1d4f9a, rough: 0.6, sound: 'metal' },
  signGreen: { color: 0x1f6a3a, rough: 0.6, sound: 'metal' },
  signWhite: { color: 0xe8e8e0, rough: 0.6, sound: 'metal' },
  lightGreen: { color: 0x40ff60, emissive: 0x20ff40, emissiveIntensity: 2.2, rough: 0.4, sound: 'metal', noShadow: true },
  lightAmber: { color: 0xffb030, emissive: 0xff9a10, emissiveIntensity: 2.2, rough: 0.4, sound: 'metal', noShadow: true },
  windowLit: { color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 1.6, rough: 0.4, sound: 'metal', noShadow: true },
  screen: { color: 0x0b1a12, emissive: 0x1a6a3a, emissiveIntensity: 0.12, rough: 0.3, sound: 'metal' },
  screenBlue: { color: 0x0a1420, emissive: 0x2a70c0, emissiveIntensity: 0.45, rough: 0.3, sound: 'metal' },
};

export function materialSound(name) {
  return MATS[name]?.sound ?? 'concrete';
}

export class MapBuilder {
  constructor(scene, world, seed = 1, quality = 'high') {
    this.scene = scene;
    this.world = world;
    this.rng = makeRng(seed);
    this.quality = quality;
    this.buckets = new Map(); // material -> { pos, nrm, uv, idx }
    this.materials = new Map();
    this.lights = [];
    this.root = new THREE.Group();
    this.root.name = 'map';
    scene.add(this.root);
    // Data the game modes read.
    this.spawns = { a: [], b: [], ffa: [] };
    this.points = {}; // named positions
    this.domPoints = [];
    this.patrols = {};
    this.perches = [];
    this.interactables = [];
  }

  material(name) {
    if (this.materials.has(name)) return this.materials.get(name);
    const d = MATS[name] ?? MATS.concrete;
    const m = new THREE.MeshStandardMaterial({
      color: d.color,
      roughness: d.rough ?? 0.9,
      metalness: d.metal ?? 0,
      map: d.tex ? getTexture(d.tex) : null,
      emissive: d.emissive ?? 0x000000,
      emissiveIntensity: d.emissiveIntensity ?? 1,
    });
    if (d.tex && (d.tex === 'concrete' || d.tex === 'brick' || d.tex === 'rock' || d.tex === 'corrugated')) {
      m.bumpMap = getTexture(d.tex);
      m.bumpScale = 1.2;
    }
    this.materials.set(name, m);
    return m;
  }

  _bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) { b = { pos: [], nrm: [], uv: [], idx: [] }; this.buckets.set(mat, b); }
    return b;
  }

  /** Axis-aligned box. (cx, cz) centre, y0 bottom. Adds a collider unless collide=false. */
  box(cx, y0, cz, w, h, d, mat = 'concrete', collide = true) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    this.boxMinMax(x0, y0, z0, x1, y1, z1, mat, collide);
  }

  boxMinMax(x0, y0, z0, x1, y1, z1, mat = 'concrete', collide = true) {
    if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return;
    const b = this._bucket(mat);
    const s = MATS[mat]?.scale ?? 4;
    const faces = [
      // normal, 4 corners (ccw from outside), uv axes
      [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 'zy'],
      [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 'zy'],
      [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 'xz'],
      [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 'xz'],
      [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 'xy'],
      [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 'xy'],
    ];
    for (const [n, corners, axes] of faces) {
      const base = b.pos.length / 3;
      for (const c of corners) {
        b.pos.push(c[0], c[1], c[2]);
        b.nrm.push(n[0], n[1], n[2]);
        const u = axes === 'zy' ? c[2] : c[0];
        const v = axes === 'xz' ? c[2] : c[1];
        b.uv.push(u / s, v / s);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (collide) this.world.add(x0, y0, z0, x1, y1, z1, mat);
  }

  /** Merge an arbitrary geometry (with uv) into a material bucket, no collider. */
  geometry(geom, matrix, mat) {
    const b = this._bucket(mat);
    const g = geom.index ? geom : geom;
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = b.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      b.nrm.push(v.x, v.y, v.z);
      if (uv) b.uv.push(uv.getX(i), uv.getY(i)); else b.uv.push(0, 0);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
    }
    geom.dispose();
  }

  mesh(geom, mat, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
    this.geometry(geom, m, mat);
  }

  ground(mat, size = 400) {
    const s = MATS[mat]?.scale ?? 6;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / s, uv.getY(i) * size / s);
    const m = new THREE.Mesh(geo, this.material(mat));
    m.receiveShadow = true;
    this.root.add(m);
    this.world.groundMat = MATS[mat]?.sound ?? 'concrete';
  }

  /** Flat decal-like patch on the ground (roads, pads). */
  patch(cx, cz, w, d, mat, y = 0.02) {
    this.box(cx, y - 0.02, cz, w, 0.02, d, mat, false);
  }

  setBounds(minX, maxX, minZ, maxZ, wallH = 12, visibleMat = null) {
    this.world.bounds = { minX, maxX, minZ, maxZ };
    const t = 1;
    const add = (x0, z0, x1, z1) => {
      if (visibleMat) this.boxMinMax(x0, 0, z0, x1, wallH, z1, visibleMat);
      else this.world.add(x0, -5, z0, x1, 60, z1, 'concrete').noRay = true;
    };
    add(minX - t, minZ - t, maxX + t, minZ);
    add(minX - t, maxZ, maxX + t, maxZ + t);
    add(minX - t, minZ, minX, maxZ);
    add(maxX, minZ, maxX + t, maxZ);
  }

  // ---------- walls & buildings ----------

  /**
   * Wall along X (axis 'x') from a0..a1 at z=c, or along Z (axis 'z') at x=c.
   * openings: [{ at, w, bottom, top }] (centre along the wall, heights relative to y0).
   */
  wall(axis, a0, a1, c, y0, h, t, mat, openings = [], ruined = false) {
    const ops = openings
      .map((o) => ({ s: o.at - o.w / 2, e: o.at + o.w / 2, bottom: o.bottom ?? 0, top: Math.min(o.top ?? 2.3, h) }))
      .filter((o) => o.e > a0 && o.s < a1)
      .sort((p, q) => p.s - q.s);
    const seg = (s, e, yb, yt) => {
      if (e - s < 0.01 || yt - yb < 0.01) return;
      if (axis === 'x') this.boxMinMax(s, yb, c - t / 2, e, yt, c + t / 2, mat);
      else this.boxMinMax(c - t / 2, yb, s, c + t / 2, yt, e, mat);
    };
    const solid = (s, e) => {
      if (!ruined) { seg(s, e, y0, y0 + h); return; }
      let x = s;
      while (x < e - 0.01) {
        const step = Math.min(e - x, 0.8 + this.rng() * 1.4);
        const hh = this.rng() < 0.35 ? h * (0.25 + this.rng() * 0.5) : h;
        seg(x, x + step, y0, y0 + hh);
        x += step;
      }
    };
    let cur = a0;
    for (const o of ops) {
      const s = Math.max(o.s, a0), e = Math.min(o.e, a1);
      solid(cur, s);
      if (o.bottom > 0) seg(s, e, y0, y0 + o.bottom);
      if (o.top < h && !ruined) seg(s, e, y0 + o.top, y0 + h);
      cur = e;
    }
    solid(cur, a1);
  }

  /**
   * Multi-storey building with doors, windows, interior stairs and optional roof access.
   * doors: [{ side: 'n'|'s'|'e'|'w', at: offset from side centre, w }]
   */
  /** Leave buildings over this area without random furniture (for a scripted interior). */
  keepClear(x0, z0, x1, z1) {
    (this.clearAreas ??= []).push({ x0, z0, x1, z1 });
  }

  building(o) {
    const {
      x, z, w, d, floors = 1, fh = 3.3, mat = 'concrete', floorMat = 'tiles',
      doors = [{ side: 's', at: 0 }], windows = true, roof = true, roofAccess = false, ruined = false,
      t = 0.3, stairs = true, props = true, windowSpacing = 3.6, roofMat = 'concreteDark',
    } = o;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const totalH = floors * fh;
    // Ground floor finish (visual only).
    this.boxMinMax(x0 + t / 2, 0, z0 + t / 2, x1 - t / 2, 0.03, z1 - t / 2, floorMat, false);
    // Stair flights alternate between the east and west walls on successive floors
    // so a flight never sits under the one above it.
    const sw = 1.3, steps = Math.ceil(fh / 0.3), run = steps * 0.36;
    const sz0 = z0 + t / 2 + 0.2, sz1 = sz0 + run;
    const lane = (f) => (f % 2 === 0 ? [x1 - t / 2 - sw, x1 - t / 2] : [x0 + t / 2, x0 + t / 2 + sw]);
    const hasStairs = stairs && w >= 6 && d >= run + 2;
    const stairFloors = hasStairs ? (roofAccess ? floors : floors - 1) : 0;

    for (let f = 0; f < floors; f++) {
      const y0 = f * fh;
      const top = f === floors - 1;
      const sides = { n: [], s: [], e: [], w: [] };
      if (f === 0) for (const dr of doors) sides[dr.side].push({ at: dr.at, w: dr.w ?? 1.7, bottom: 0, top: 2.4 });
      if (windows) {
        for (const side of ['n', 's', 'e', 'w']) {
          const len = side === 'n' || side === 's' ? w : d;
          const n = Math.floor((len - 1.5) / windowSpacing);
          for (let k = 0; k < n; k++) {
            const at = -len / 2 + (k + 0.5) * (len / n);
            if (sides[side].some((op) => Math.abs(op.at - at) < 1.8)) continue;
            // No windows beside a stair flight.
            const stairSide = f % 2 === 0 ? 'e' : 'w';
            if (hasStairs && (side === stairSide || (f > 0 && side === (stairSide === 'e' ? 'w' : 'e'))) && z + at < sz1 + 0.8) continue;
            sides[side].push({ at, w: 1.4, bottom: 1.0, top: 2.2 });
          }
        }
      }
      const wr = ruined && top;
      this.wall('x', x0, x1, z1 - t / 2, y0, fh, t, mat, sides.n.map((p) => ({ ...p, at: x + p.at })), wr);
      this.wall('x', x0, x1, z0 + t / 2, y0, fh, t, mat, sides.s.map((p) => ({ ...p, at: x + p.at })), wr);
      this.wall('z', z0 + t, z1 - t, x1 - t / 2, y0, fh, t, mat, sides.e.map((p) => ({ ...p, at: z + p.at })), wr);
      this.wall('z', z0 + t, z1 - t, x0 + t / 2, y0, fh, t, mat, sides.w.map((p) => ({ ...p, at: z + p.at })), wr);
      this._facade({ x, z, x0, x1, z0, z1, y0, fh, sides, ruined: wr || ruined, floor: f, top });
      const [sx0, sx1] = lane(f);
      const hole = hasStairs && f < stairFloors;
      if (hole) {
        for (let k = 0; k < steps; k++) {
          const sy = y0 + (k + 1) * (fh / steps);
          const zA = sz0 + k * (run / steps);
          this.boxMinMax(sx0, y0, zA, sx1, sy, zA + run / steps, 'concreteDark');
        }
        // Railing on the open side.
        const rx = f % 2 === 0 ? sx0 - 0.06 : sx1;
        this.boxMinMax(rx, y0 + fh, sz0 + 0.2, rx + 0.06, y0 + fh + 1.0, sz1, 'metalDark');
      }
      // Slab above this floor (with a hole over the flight).
      const sy = y0 + fh;
      if (!top || (roof && !ruined)) {
        const slabMat = top ? roofMat : floorMat;
        if (hole) {
          const hz = sz1 + 0.05;
          this.boxMinMax(x0, sy - 0.25, hz, x1, sy, z1, slabMat);
          if (sx0 > x0) this.boxMinMax(x0, sy - 0.25, z0, sx0, sy, hz, slabMat);
          if (sx1 < x1) this.boxMinMax(sx1, sy - 0.25, z0, x1, sy, hz, slabMat);
        } else {
          this.boxMinMax(x0, sy - 0.25, z0, x1, sy, z1, slabMat);
        }
      }
      if (top && roof && !ruined) {
        const ph = roofAccess ? 1.0 : 0.5;
        this.boxMinMax(x0, sy, z0, x1, sy + ph, z0 + 0.25, mat);
        this.boxMinMax(x0, sy, z1 - 0.25, x1, sy + ph, z1, mat);
        this.boxMinMax(x0, sy, z0 + 0.25, x0 + 0.25, sy + ph, z1 - 0.25, mat);
        this.boxMinMax(x1 - 0.25, sy, z0 + 0.25, x1, sy + ph, z1 - 0.25, mat);
        if (!roofAccess && this.rng() < 0.7) this.box(x - w * 0.2, sy, z + d * 0.15, 1.4, 1.0, 1.0, 'metal');
      }
      // Ceiling light panel (emissive, cheap) in each floor.
      this.boxMinMax(x - 0.6, sy - 0.29, z - 0.3, x + 0.6, sy - 0.25, z + 0.3, 'lightPanel', false);
      // Interior props.
      // (A mission can keep an interior clear for its own layout: see keepClear.)
      const keep = (this.clearAreas ?? []).some((a) => a.x0 < x1 && a.x1 > x0 && a.z0 < z1 && a.z1 > z0);
      if (props && w >= 5 && d >= 5 && !keep) {
        const r = this.rng;
        const n = Math.floor((w * d) / 30);
        for (let k = 0; k < n; k++) {
          const px = x0 + t + 1.9 + r() * Math.max(0.1, w - 2 * t - 3.8), pz = (hasStairs ? sz1 + 1.2 : z0 + 1.2) + r() * Math.max(0.1, z1 - 1.2 - (hasStairs ? sz1 + 1.2 : z0 + 1.2));
          const kind = r();
          if (kind < 0.4) this.table(px, pz, y0);
          else if (kind < 0.7) this.box(px, y0, pz, 1.0, 1.0, 1.0, 'wood');
          else this.box(px, y0, pz, 0.5, 1.9, 1.6, 'metalDark');
        }
      }
    }
    if (roof && !ruined) this._roofClutter(x, z, w, d, totalH, roofAccess);
    if (!ruined) {
      // Downpipes on two corners.
      for (const [cx, cz] of [[x0 - 0.07, z0 - 0.07], [x1 + 0.07, z1 + 0.07]]) {
        this.mesh(new THREE.CylinderGeometry(0.05, 0.05, totalH + 0.3, 6), 'metalDark', cx, (totalH + 0.3) / 2, cz);
      }
    } else {
      this.debris(x, z0 - 1.5, 10, w * 0.5);
      this.debris(x1 + 1.5, z, 8, d * 0.4);
    }
    return { x0, x1, z0, z1, height: totalH, roofY: totalH };
  }

  /** Window frames, sills, glass, door frames and steps, plinth and floor bands. */
  _facade(o) {
    const trim = o.ruined ? 'concreteDark' : 'concrete';
    const faces = {
      n: { axis: 'x', c: o.z1, n: 1, base: o.x, a0: o.x0, a1: o.x1 },
      s: { axis: 'x', c: o.z0, n: -1, base: o.x, a0: o.x0, a1: o.x1 },
      e: { axis: 'z', c: o.x1, n: 1, base: o.z, a0: o.z0, a1: o.z1 },
      w: { axis: 'z', c: o.x0, n: -1, base: o.z, a0: o.z0, a1: o.z1 },
    };
    for (const [side, f] of Object.entries(faces)) {
      // along: centre along the wall; out: offset from the outer face; depth: size along the normal.
      const place = (along, y, len, h, out, depth, m = trim) => {
        const cx = f.axis === 'x' ? along : f.c + f.n * out;
        const cz = f.axis === 'x' ? f.c + f.n * out : along;
        this.box(cx, y, cz, f.axis === 'x' ? len : depth, h, f.axis === 'x' ? depth : len, m, false);
      };
      const doors = [];
      for (const op of o.sides[side]) {
        const a = f.base + op.at;
        if (op.bottom > 0) {
          place(a, o.y0 + op.bottom - 0.07, op.w + 0.22, 0.07, 0.06, 0.16); // sill
          if (!o.ruined) place(a, o.y0 + op.top, op.w + 0.16, 0.13, 0.03, 0.1); // lintel
          for (const sg of [-1, 1]) place(a + sg * (op.w / 2 + 0.04), o.y0 + op.bottom, 0.08, op.top - op.bottom, 0.02, 0.07);
          if (!o.ruined && this.rng() < 0.55) {
            place(a, o.y0 + op.bottom, op.w, op.top - op.bottom, -0.16, 0.02, this.rng() < 0.12 ? 'windowLit' : 'glass');
            place(a, o.y0 + (op.bottom + op.top) / 2 - 0.02, op.w, 0.04, -0.15, 0.04, 'metalDark'); // transom bar
          }
          if (o.floor > 0 && this.rng() < 0.12) place(a + op.w * 0.3, o.y0 + op.bottom - 0.75, 0.75, 0.48, 0.2, 0.4, 'metal'); // wall AC unit
        } else {
          for (const sg of [-1, 1]) place(a + sg * (op.w / 2 + 0.06), o.y0, 0.12, op.top + 0.12, 0.03, 0.09);
          place(a, o.y0 + op.top, op.w + 0.24, 0.15, 0.03, 0.1);
          place(a, o.y0, op.w + 0.6, 0.06, 0.32, 0.7, 'concreteDark'); // step
          doors.push([a - op.w / 2 - 0.15, a + op.w / 2 + 0.15]);
        }
      }
      if (o.floor === 0 && !o.ruined) {
        // Plinth along the base, broken at doorways.
        let cur = f.a0;
        for (const [d0, d1] of doors.sort((p, q) => p[0] - q[0])) {
          if (d0 > cur) place((cur + d0) / 2, 0, d0 - cur, 0.4, 0.035, 0.07, 'concreteDark');
          cur = Math.max(cur, d1);
        }
        if (f.a1 > cur) place((cur + f.a1) / 2, 0, f.a1 - cur, 0.4, 0.035, 0.07, 'concreteDark');
      }
      if (o.floor > 0) place((f.a0 + f.a1) / 2, o.y0 - 0.08, f.a1 - f.a0 + 0.12, 0.15, 0.04, 0.08); // floor band
    }
  }

  _roofClutter(x, z, w, d, y, walkable) {
    const r = this.rng;
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * (w - 3), pz = z + (r() - 0.5) * (d - 3);
      const k = r();
      if (k < 0.45) {
        this.box(px, y, pz, 1.3, 0.95, 0.9, 'metal', walkable);
        this.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 14), 'metalDark', px, y + 0.97, pz);
      } else if (k < 0.7) {
        for (const lx of [-0.5, 0.5]) for (const lz of [-0.5, 0.5]) this.box(px + lx, y, pz + lz, 0.08, 1.0, 0.08, 'metalDark', false);
        this.mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14), 'metal', px, y + 1.65, pz);
        if (walkable) this.world.add(px - 0.75, y, pz - 0.75, px + 0.75, y + 2.3, pz + 0.75, 'metal');
      } else if (k < 0.85) {
        this.box(px, y, pz, 0.1, 1.0, 0.1, 'metalDark', false);
        this.mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), 'signWhite', px, y + 1.25, pz, r() * 6, -0.9, 0);
      } else {
        this.mesh(new THREE.CylinderGeometry(0.03, 0.05, 4.5, 6), 'metalDark', px, y + 2.25, pz);
        for (let j = 0; j < 3; j++) this.box(px, y + 2.6 + j * 0.6, pz, 0.7 - j * 0.15, 0.03, 0.03, 'metalDark', false);
      }
    }
    // Vent stacks.
    for (let i = 0; i < 2; i++) this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), 'metalDark', x + (r() - 0.5) * (w - 2), y + 0.35, z + (r() - 0.5) * (d - 2));
  }

  /** Non-blocking scattered rubble and litter. */
  debris(x, z, n = 10, spread = 3) {
    for (let i = 0; i < n; i++) {
      const s = 0.12 + this.rng() * 0.35;
      this.mesh(new THREE.BoxGeometry(1, 1, 1), this.rng() < 0.6 ? 'concreteDark' : 'concrete', x + (this.rng() - 0.5) * spread * 2, s * 0.25, z + (this.rng() - 0.5) * spread * 2,
        this.rng() * 3, this.rng(), this.rng(), s, s * 0.5, s * 1.3);
    }
  }

  table(x, z, y0 = 0) {
    this.box(x, y0 + 0.72, z, 1.6, 0.06, 0.9, 'woodDark');
    for (const [dx, dz] of [[-0.7, -0.38], [0.7, -0.38], [-0.7, 0.38], [0.7, 0.38]]) {
      this.box(x + dx, y0, z + dz, 0.06, 0.72, 0.06, 'metalDark', false);
    }
    this.world.add(x - 0.8, y0, z - 0.45, x + 0.8, y0 + 0.78, z + 0.45, 'wood');
  }

  // ---------- props ----------

  crate(x, z, s = 1.2, y = 0, mat = 'wood') {
    this.box(x, y, z, s, s, s, mat);
    // Frame bands.
    this.boxMinMax(x - s / 2 - 0.02, y + s * 0.42, z - s / 2 - 0.02, x + s / 2 + 0.02, y + s * 0.58, z + s / 2 + 0.02, 'woodDark', false);
  }

  crateStack(x, z, n = 3, s = 1.2) {
    this.crate(x, z, s);
    if (n > 1) this.crate(x + s + 0.05, z, s);
    if (n > 2) this.crate(x + (s + 0.05) / 2, z, s, s);
  }

  barrel(x, z, mat = 'steelBlue', y = 0) {
    const g = new THREE.CylinderGeometry(0.3, 0.3, 0.92, 12);
    this.mesh(g, mat, x, y + 0.46, z);
    const ring = new THREE.CylinderGeometry(0.31, 0.31, 0.04, 12);
    this.mesh(ring.clone(), 'metalDark', x, y + 0.3, z);
    this.mesh(ring, 'metalDark', x, y + 0.62, z);
    this.world.add(x - 0.3, y, z - 0.3, x + 0.3, y + 0.92, z + 0.3, 'metal');
  }

  sandbags(x, z, len, axis = 'x', h = 1.0) {
    const rows = Math.round(h / 0.2);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.3;
      const y = r * 0.2;
      const n = Math.floor(len / 0.6);
      for (let k = 0; k < n; k++) {
        const a = -len / 2 + off * 0 + k * 0.6 + 0.3 + (r % 2 ? 0.15 : 0);
        if (a > len / 2 - 0.25) continue;
        const g = new THREE.BoxGeometry(0.58, 0.2, 0.42, 1, 1, 1);
        // Round the top a bit by scaling verts.
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.85); p.setZ(i, p.getZ(i) * 0.8); }
        g.computeVertexNormals();
        if (axis === 'x') this.mesh(g, 'sandbag', x + a, y + 0.1, z, (this.rng() - 0.5) * 0.1);
        else this.mesh(g, 'sandbag', x, y + 0.1, z + a, Math.PI / 2 + (this.rng() - 0.5) * 0.1);
      }
    }
    if (axis === 'x') this.world.add(x - len / 2, 0, z - 0.25, x + len / 2, h, z + 0.25, 'soft');
    else this.world.add(x - 0.25, 0, z - len / 2, x + 0.25, h, z + len / 2, 'soft');
  }

  barrier(x, z, len = 3, axis = 'x') {
    // Jersey barrier: wide base + narrow top.
    const [w, d] = axis === 'x' ? [len, 0.6] : [0.6, len];
    const [w2, d2] = axis === 'x' ? [len, 0.3] : [0.3, len];
    this.box(x, 0, z, w, 0.35, d, 'concrete');
    this.box(x, 0.35, z, w2, 0.6, d2, 'concrete');
  }

  hesco(x, z, len, axis = 'x', h = 1.4) {
    const n = Math.max(1, Math.round(len / 1.1));
    for (let k = 0; k < n; k++) {
      const a = -len / 2 + (k + 0.5) * (len / n);
      if (axis === 'x') this.box(x + a, 0, z, len / n - 0.04, h, 1.1, 'hesco', false);
      else this.box(x, 0, z + a, 1.1, h, len / n - 0.04, 'hesco', false);
    }
    if (axis === 'x') this.world.add(x - len / 2, 0, z - 0.55, x + len / 2, h, z + 0.55, 'soft');
    else this.world.add(x - 0.55, 0, z - len / 2, x + 0.55, h, z + len / 2, 'soft');
  }

  car(x, z, axis = 'x', mat = 'carRed', burnt = false) {
    const m = burnt ? 'burnt' : mat;
    const [L, W] = [4.4, 1.85];
    const ax = axis === 'x';
    const bw = ax ? L : W, bd = ax ? W : L;
    this.box(x, 0.3, z, bw, 0.75, bd, m, false);
    const cw = ax ? L * 0.55 : W * 0.92, cd = ax ? W * 0.92 : L * 0.55;
    this.box(x + (ax ? -0.2 : 0), 1.05, z + (ax ? 0 : -0.2), cw, 0.55, cd, burnt ? 'burnt' : 'glass', false);
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
    for (const [a, b] of [[-1.4, -0.85], [1.4, -0.85], [-1.4, 0.85], [1.4, 0.85]]) {
      const wx = ax ? x + a : x + b, wz = ax ? z + b : z + a;
      this.mesh(wheel.clone(), 'rubber', wx, 0.34, wz, ax ? 0 : Math.PI / 2, Math.PI / 2, 0);
    }
    wheel.dispose();
    this.world.add(x - bw / 2, 0, z - bd / 2, x + bw / 2, 1.55, z + bd / 2, 'metal');
  }

  truck(x, z, axis = 'x', mat = 'olive') {
    const ax = axis === 'x';
    const L = 7, W = 2.4;
    const s = (a, b) => (ax ? [x + a, z + b] : [x + b, z + a]);
    const dim = (l, w) => (ax ? [l, w] : [w, l]);
    let [cx, cz] = s(L / 2 - 1, 0);
    let [w, d] = dim(2, W);
    this.box(cx, 0.6, cz, w, 1.9, d, mat, false);
    [cx, cz] = s(L / 2 - 0.05, 0); [w, d] = dim(0.1, W * 0.8);
    this.box(cx, 1.5, cz, w, 0.7, d, 'glass', false);
    [cx, cz] = s(-1, 0); [w, d] = dim(4.8, W);
    this.box(cx, 0.6, cz, w, 0.5, d, mat, false);
    this.box(cx, 1.1, cz, w, 1.8, d, 'canvas', false);
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14);
    for (const a of [-2.6, -1.2, 2.4]) {
      for (const b of [-1.15, 1.15]) {
        const [wx, wz] = s(a, b);
        this.mesh(wheel.clone(), 'rubber', wx, 0.5, wz, ax ? 0 : Math.PI / 2, Math.PI / 2, 0);
      }
    }
    wheel.dispose();
    [w, d] = dim(L, W);
    this.world.add(x - w / 2, 0, z - d / 2, x + w / 2, 2.9, z + d / 2, 'metal');
  }

  container(x, y, z, axis = 'x', mat = 'contRed') {
    const ax = axis === 'x';
    const L = 6.1, W = 2.44, H = 2.6;
    const w = ax ? L : W, d = ax ? W : L;
    this.box(x, y, z, w, H, d, mat);
    // End frames.
    const fw = ax ? 0.12 : W + 0.06, fd = ax ? W + 0.06 : 0.12;
    const off = L / 2 - 0.06;
    this.box(x + (ax ? off : 0), y, z + (ax ? 0 : off), fw, H + 0.02, fd, 'metalDark', false);
    this.box(x - (ax ? off : 0), y, z - (ax ? 0 : off), fw, H + 0.02, fd, 'metalDark', false);
  }

  tower(x, z, h = 5, mat = 'wood') {
    const s = 3;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.box(x + dx * (s / 2 - 0.15), 0, z + dz * (s / 2 - 0.15), 0.25, h, 0.25, mat);
    }
    this.box(x, h, z, s, 0.2, s, mat);
    // Low walls (cover for the guard).
    this.box(x, h + 0.2, z - s / 2 + 0.06, s, 1.0, 0.12, mat);
    this.box(x, h + 0.2, z + s / 2 - 0.06, s, 1.0, 0.12, mat);
    this.box(x - s / 2 + 0.06, h + 0.2, z, 0.12, 1.0, s - 0.24, mat);
    this.box(x + s / 2 - 0.06, h + 0.2, z, 0.12, 1.0, s - 0.24, mat);
    // Roof on posts.
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.box(x + dx * (s / 2 - 0.1), h + 1.2, z + dz * (s / 2 - 0.1), 0.12, 1.2, 0.12, mat, false);
    }
    this.box(x, h + 2.4, z, s + 0.4, 0.15, s + 0.4, 'metalDark');
    this.perches.push(new THREE.Vector3(x, h + 0.2, z));
  }

  tent(x, z, w = 5, d = 4, axis = 'x', mat = 'canvas') {
    const h = 2.6;
    const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1);
    // Triangular prism roof.
    const ax = axis === 'x';
    this.mesh(g, mat, x, h * 0.55, z, ax ? 0 : Math.PI / 2, 0, Math.PI / 2, h * 0.55, ax ? w : d, (ax ? d : w) * 0.58);
    this.box(x, 0, z, ax ? w : d * 0.98, 1.0, ax ? d * 0.98 : w, mat, false);
    this.world.add(x - (ax ? w : d) / 2, 0, z - (ax ? d : w) / 2, x + (ax ? w : d) / 2, h, z + (ax ? d : w) / 2, 'soft');
  }

  pine(x, z, h = 7, snowy = false) {
    const trunk = new THREE.CylinderGeometry(0.15, 0.25, h * 0.4, 7);
    this.mesh(trunk, 'bark', x, h * 0.2, z);
    const fm = snowy ? 'foliageSnow' : 'foliage';
    for (let k = 0; k < 3; k++) {
      const r = (1.6 - k * 0.4) * h / 7;
      const cone = new THREE.ConeGeometry(r, h * 0.38, 8);
      this.mesh(cone, fm, x, h * (0.35 + k * 0.2), z, this.rng() * 3);
      if (snowy) {
        const cap = new THREE.ConeGeometry(r * 0.75, h * 0.16, 8);
        this.mesh(cap, 'snow', x, h * (0.42 + k * 0.2) + 0.1, z, this.rng() * 3);
      }
    }
    this.world.add(x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3, 'wood');
  }

  rock(x, z, s = 2, mat = 'rock', collide = true) {
    const g = new THREE.DodecahedronGeometry(1, 0);
    const sy = s * (0.5 + this.rng() * 0.4);
    this.mesh(g, mat, x, sy * 0.5, z, this.rng() * 6, this.rng() * 0.5, 0, s, sy, s * (0.8 + this.rng() * 0.4));
    if (collide) this.world.add(x - s * 0.7, 0, z - s * 0.7, x + s * 0.7, sy * 1.3, z + s * 0.7, 'concrete');
  }

  cliff(x0, z0, x1, z1, h = 14, mat = 'rock') {
    this.boxMinMax(x0, 0, z0, x1, h, z1, mat);
    // Break up the silhouette with boulders along the top.
    const n = Math.floor(Math.max(x1 - x0, z1 - z0) / 6);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const g = new THREE.DodecahedronGeometry(1, 0);
      const s = 3 + this.rng() * 3;
      this.mesh(g, mat, x, h - 0.5, z, this.rng() * 6, 0, 0, s, s * 0.6, s);
    }
  }

  rubble(x, z, s = 2) {
    for (let k = 0; k < 7; k++) {
      const g = new THREE.BoxGeometry(1, 1, 1);
      const sz = s * (0.2 + this.rng() * 0.35);
      this.mesh(g, this.rng() < 0.5 ? 'concrete' : 'concreteDark', x + (this.rng() - 0.5) * s, sz * 0.3, z + (this.rng() - 0.5) * s,
        this.rng() * 3, this.rng() * 0.8, this.rng() * 0.8, sz, sz * 0.6, sz * 1.2);
    }
    this.world.add(x - s * 0.45, 0, z - s * 0.45, x + s * 0.45, s * 0.4, z + s * 0.45, 'concrete');
  }

  lamp(x, z, h = 6, light = true, color = 0xffd9a0, intensity = 30) {
    this.box(x, 0, z, 0.18, h, 0.18, 'metalDark');
    this.box(x + 0.5, h - 0.15, z, 1.2, 0.12, 0.3, 'metalDark', false);
    this.box(x + 0.9, h - 0.22, z, 0.4, 0.06, 0.24, 'lightWarm', false);
    if (light) this.light(x + 0.9, h - 0.5, z, color, intensity, 22);
  }

  light(x, y, z, color = 0xffffff, intensity = 20, distance = 18) {
    this.lights.push({ x, y, z, color, intensity, distance });
  }

  crane(x, z, axis = 'z', h = 22) {
    const ax = axis === 'x';
    const span = 14;
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const lx = ax ? x + t * 4 : x + s * span / 2, lz = ax ? z + s * span / 2 : z + t * 4;
        this.box(lx, 0, lz, 0.8, h, 0.8, 'hazard');
      }
    }
    this.box(x, h, z, ax ? 10 : span + 1, 1.4, ax ? span + 1 : 10, 'contOrange', false);
    this.box(x, h + 1.4, z + (ax ? 0 : 0), ax ? 3 : 20, 1.0, ax ? 20 : 3, 'contOrange', false);
  }

  fenceLine(x0, z0, x1, z1, h = 2.2) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.floor(len / 3));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      this.box(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.1, h, 0.1, 'metalDark', false);
    }
    const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    this.boxMinMax(Math.min(x0, x1), h - 0.08, Math.min(z0, z1) - (ax ? 0.03 : 0), Math.max(x0, x1), h, Math.max(z0, z1) + (ax ? 0.03 : 0), 'metalDark', false);
    // Chain-link is see-through but blocks movement.
    if (ax) this.world.add(Math.min(x0, x1), 0, z0 - 0.05, Math.max(x0, x1), h, z0 + 0.05, 'metal');
    else this.world.add(x0 - 0.05, 0, Math.min(z0, z1), x0 + 0.05, h, Math.max(z0, z1), 'metal');
    this.fences = this.fences || [];
    this.fences.push({ x0, z0, x1, z1, h });
  }

  // ---------- markers for game modes ----------

  spawn(team, x, z, yaw = 0, y = 0) {
    this.spawns[team].push({ x, y, z, yaw });
  }

  point(name, x, z, y = 0) {
    this.points[name] = new THREE.Vector3(x, y, z);
  }

  dom(label, x, z) {
    this.domPoints.push({ label, pos: new THREE.Vector3(x, 0, z) });
  }

  patrol(name, pts) {
    this.patrols[name] = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  }

  // ---------- finish ----------

  finalize() {
    for (const [mat, b] of this.buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material(mat));
      const noShadow = MATS[mat]?.noShadow;
      mesh.castShadow = !noShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.root.add(mesh);
    }
    this.buckets.clear();
    // Chain-link fence visuals (transparent grid planes).
    if (this.fences) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.strokeStyle = 'rgba(170,175,180,0.9)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
      for (const f of this.fences) {
        const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
        const geo = new THREE.PlaneGeometry(len, f.h);
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.35, uv.getY(i) * f.h / 0.35);
        const m = new THREE.Mesh(geo, mat);
        m.position.set((f.x0 + f.x1) / 2, f.h / 2, (f.z0 + f.z1) / 2);
        m.rotation.y = -Math.atan2(f.z1 - f.z0, f.x1 - f.x0);
        this.root.add(m);
      }
    }
    // Point lights (capped for performance).
    const cap = this.quality === 'low' ? 2 : this.quality === 'medium' ? 4 : 8;
    for (const l of this.lights.slice(0, cap)) {
      const pl = new THREE.PointLight(l.color, l.intensity, l.distance, 1.6);
      pl.position.set(l.x, l.y, l.z);
      this.root.add(pl);
    }
    this.world.buildNav(1);
  }
}
