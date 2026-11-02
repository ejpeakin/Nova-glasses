// Static collision world: axis-aligned boxes in a uniform XZ grid, fast raycasts,
// a walkable navigation grid with A* pathfinding, and auto-generated cover points.
import * as THREE from '../lib/three.js';
import { clamp } from '../core/Utils.js';

const CELL = 4; // collision broadphase cell size (m)

export class Collider {
  constructor(minX, minY, minZ, maxX, maxY, maxZ, mat = 'concrete') {
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ;
    this.mat = mat;
    this.stamp = 0;
  }
}

export class World {
  constructor() {
    this.colliders = [];
    this.grid = new Map();
    this.stamp = 1;
    this.bounds = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
    this.smokes = []; // { x, y, z, r, until }
    this.groundMat = 'concrete';
    this.indoor = false;
    this.nav = null;
    this.cover = [];
  }

  add(minX, minY, minZ, maxX, maxY, maxZ, mat) {
    const c = new Collider(minX, minY, minZ, maxX, maxY, maxZ, mat);
    this.colliders.push(c);
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = x * 73856093 ^ z * 19349663;
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(c);
      }
    }
    return c;
  }

  _cell(x, z) {
    return this.grid.get(x * 73856093 ^ z * 19349663);
  }

  /** Colliders overlapping an XZ rectangle (deduplicated). */
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const stamp = ++this.stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const arr = this._cell(x, z);
        if (!arr) continue;
        for (const c of arr) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.maxX > minX && c.minX < maxX && c.maxZ > minZ && c.minZ < maxZ) out.push(c);
        }
      }
    }
    return out;
  }

  /** True if the box overlaps any collider. */
  overlaps(minX, minY, minZ, maxX, maxY, maxZ) {
    const list = this.query(minX, minZ, maxX, maxZ, this._tmp || (this._tmp = []));
    for (const c of list) {
      if (c.maxY > minY && c.minY < maxY) return c;
    }
    return null;
  }

  /** Highest walkable surface under (x,z) at or below y + step. Ground is y=0. */
  groundHeight(x, z, y, step = 0.55, radius = 0.25) {
    let h = 0;
    const list = this.query(x - radius, z - radius, x + radius, z + radius, this._tmp2 || (this._tmp2 = []));
    for (const c of list) {
      if (c.maxY <= y + step && c.maxY > h) h = c.maxY;
    }
    return h;
  }

  /** Ceiling height above (x,z) starting from y. */
  ceilingHeight(x, z, y, radius = 0.25) {
    let h = Infinity;
    const list = this.query(x - radius, z - radius, x + radius, z + radius, this._tmp2 || (this._tmp2 = []));
    for (const c of list) {
      if (c.minY >= y && c.minY < h) h = c.minY;
    }
    return h;
  }

  /**
   * Ray vs world boxes. Walks the broadphase grid with a 2D DDA so only nearby
   * cells are tested. Returns { t, point, normal, collider } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const stamp = ++this.stamp;
    let best = maxDist, bestC = null, bestAxis = 0;
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
    const invX = 1 / dx, invY = 1 / dy, invZ = 1 / dz;
    let tCell = 0;
    for (let guard = 0; guard < 400; guard++) {
      const arr = this._cell(cx, cz);
      if (arr) {
        for (const c of arr) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.noRay) continue; // invisible map boundaries don't stop bullets/sight visually
          // Slab test.
          let t1 = (c.minX - ox) * invX, t2 = (c.maxX - ox) * invX;
          let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
          t1 = (c.minY - oy) * invY; t2 = (c.maxY - oy) * invY;
          let a = Math.min(t1, t2), b = Math.max(t1, t2);
          if (a > tmin) { tmin = a; axis = 1; }
          if (b < tmax) tmax = b;
          t1 = (c.minZ - oz) * invZ; t2 = (c.maxZ - oz) * invZ;
          a = Math.min(t1, t2); b = Math.max(t1, t2);
          if (a > tmin) { tmin = a; axis = 2; }
          if (b < tmax) tmax = b;
          if (tmax >= Math.max(tmin, 0) && tmin < best) {
            if (tmin < 0) continue; // ray starts inside: ignore that box
            best = tmin; bestC = c; bestAxis = axis;
          }
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best <= tNext || tNext > maxDist) break;
      tCell = tNext;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; } else { cz += stepZ; tMaxZ += tDeltaZ; }
    }
    void tCell;
    // Ground plane.
    if (dy < 0) {
      const tg = -oy / dy;
      if (tg >= 0 && tg < best) {
        return { t: tg, point: new THREE.Vector3(ox + dx * tg, 0, oz + dz * tg), normal: new THREE.Vector3(0, 1, 0), collider: null, mat: this.groundMat };
      }
    }
    if (!bestC) return null;
    const normal = new THREE.Vector3();
    if (bestAxis === 0) normal.x = -Math.sign(dx);
    else if (bestAxis === 1) normal.y = -Math.sign(dy);
    else normal.z = -Math.sign(dz);
    return { t: best, point: new THREE.Vector3(ox + dx * best, oy + dy * best, oz + dz * best), normal, collider: bestC, mat: bestC.mat };
  }

  /** Line of sight between two points, also blocked by active smoke clouds. */
  los(a, b, ignoreSmoke = false) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return true;
    const hit = this.raycast(a.x, a.y, a.z, dx / len, dy / len, dz / len, len - 0.05);
    if (hit) return false;
    if (!ignoreSmoke && this.smokeBlocks(a, b)) return false;
    return true;
  }

  smokeBlocks(a, b) {
    const now = performance.now() / 1000;
    for (const s of this.smokes) {
      if (s.until < now || s.start > now) continue;
      // Segment-sphere distance.
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const apx = s.x - a.x, apy = s.y - a.y, apz = s.z - a.z;
      const ab2 = abx * abx + aby * aby + abz * abz;
      const t = clamp((apx * abx + apy * aby + apz * abz) / ab2, 0, 1);
      const cx = a.x + abx * t - s.x, cy = a.y + aby * t - s.y, cz = a.z + abz * t - s.z;
      const r = s.r * Math.min(1, (now - s.start) / 2.5);
      if (cx * cx + cy * cy + cz * cz < r * r) return true;
    }
    return false;
  }

  // ---------- navigation ----------

  buildNav(cellSize = 1) {
    const b = this.bounds;
    const w = Math.ceil((b.maxX - b.minX) / cellSize);
    const h = Math.ceil((b.maxZ - b.minZ) / cellSize);
    const blocked = new Uint8Array(w * h);
    const coverH = new Float32Array(w * h); // height of the obstacle occupying a blocked cell
    const R = 0.3; // agent radius (fits 1.6 m+ doorways on the 1 m grid)
    const tmp = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = b.minX + (i + 0.5) * cellSize, z = b.minZ + (j + 0.5) * cellSize;
        const list = this.query(x - R, z - R, x + R, z + R, tmp);
        let blk = 0, top = 0;
        for (const c of list) {
          if (c.minY < 1.75 && c.maxY > 0.3) { blk = 1; top = Math.max(top, c.maxY); }
        }
        blocked[j * w + i] = blk;
        coverH[j * w + i] = top;
      }
    }
    this.nav = { w, h, size: cellSize, minX: b.minX, minZ: b.minZ, blocked, coverH };
    this._buildCover();
  }

  navCell(x, z) {
    const n = this.nav;
    const i = Math.floor((x - n.minX) / n.size), j = Math.floor((z - n.minZ) / n.size);
    if (i < 0 || j < 0 || i >= n.w || j >= n.h) return -1;
    return j * n.w + i;
  }

  walkable(x, z) {
    const c = this.navCell(x, z);
    return c >= 0 && !this.nav.blocked[c];
  }

  cellCenter(idx, out = new THREE.Vector3()) {
    const n = this.nav;
    const i = idx % n.w, j = Math.floor(idx / n.w);
    return out.set(n.minX + (i + 0.5) * n.size, 0, n.minZ + (j + 0.5) * n.size);
  }

  /** Nearest walkable cell to (x,z) within a small search radius. */
  nearestWalkable(x, z, maxR = 6) {
    const n = this.nav;
    const ci = Math.floor((x - n.minX) / n.size), cj = Math.floor((z - n.minZ) / n.size);
    for (let r = 0; r <= maxR; r++) {
      let best = -1, bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= n.w || j >= n.h) continue;
          const idx = j * n.w + i;
          if (n.blocked[idx]) continue;
          const d = di * di + dj * dj;
          if (d < bestD) { bestD = d; best = idx; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** Grid A* with 8-way moves (no corner cutting) and line-of-walk smoothing. */
  findPath(from, to, maxIter = 6000) {
    const n = this.nav;
    if (!n) return null;
    const start = this.nearestWalkable(from.x, from.z, 3);
    const goal = this.nearestWalkable(to.x, to.z, 6);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [this.cellCenter(goal)];
    const W = n.w, size = W * n.h;
    if (!this._g || this._g.length !== size) {
      this._g = new Float32Array(size);
      this._came = new Int32Array(size);
      this._seen = new Uint32Array(size);
      this._closed = new Uint32Array(size);
      this._gen = 0;
    }
    const g = this._g, came = this._came, seen = this._seen, closed = this._closed;
    const gen = ++this._gen;
    const gi = goal % W, gj = Math.floor(goal / W);
    const heur = (idx) => {
      const dx = Math.abs(idx % W - gi), dz = Math.abs(Math.floor(idx / W) - gj);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    // Binary heap of [f, idx].
    const heapF = [], heapI = [];
    const push = (f, idx) => {
      let k = heapF.length;
      heapF.push(f); heapI.push(idx);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p] <= f) break;
        heapF[k] = heapF[p]; heapI[k] = heapI[p];
        k = p;
      }
      heapF[k] = f; heapI[k] = idx;
    };
    const pop = () => {
      const top = heapI[0];
      const lf = heapF.pop(), li = heapI.pop();
      if (heapF.length) {
        let k = 0;
        const len = heapF.length;
        for (;;) {
          let c = 2 * k + 1;
          if (c >= len) break;
          if (c + 1 < len && heapF[c + 1] < heapF[c]) c++;
          if (heapF[c] >= lf) break;
          heapF[k] = heapF[c]; heapI[k] = heapI[c];
          k = c;
        }
        heapF[k] = lf; heapI[k] = li;
      }
      return top;
    };
    g[start] = 0; seen[start] = gen; came[start] = -1;
    push(heur(start), start);
    const blocked = n.blocked;
    let found = false, iter = 0;
    while (heapF.length && iter++ < maxIter) {
      const cur = pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) { found = true; break; }
      const ci = cur % W, cj = Math.floor(cur / W);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= n.h) continue;
          const nIdx = nj * W + ni;
          if (blocked[nIdx] || closed[nIdx] === gen) continue;
          if (di && dj && (blocked[cj * W + ni] || blocked[nj * W + ci])) continue;
          const cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
          if (seen[nIdx] !== gen || cost < g[nIdx]) {
            seen[nIdx] = gen; g[nIdx] = cost; came[nIdx] = cur;
            push(cost + heur(nIdx) * 1.1, nIdx);
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    // String-pull smoothing.
    const out = [];
    let anchor = 0;
    for (let k = 2; k < cells.length; k++) {
      if (!this._gridLine(cells[anchor], cells[k])) {
        out.push(this.cellCenter(cells[k - 1]));
        anchor = k - 1;
      }
    }
    out.push(this.cellCenter(goal));
    return out;
  }

  /** Supercover walk between two cells; false if any blocked cell is crossed. */
  _gridLine(a, b) {
    const n = this.nav, W = n.w;
    let x0 = a % W, y0 = Math.floor(a / W);
    const x1 = b % W, y1 = Math.floor(b / W);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < 500; guard++) {
      if (n.blocked[y0 * W + x0]) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) {
        // Diagonal step: both side cells must be clear.
        if (n.blocked[y0 * W + x0 + sx] || n.blocked[(y0 + sy) * W + x0]) return false;
      }
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return true;
  }

  walkLine(ax, az, bx, bz) {
    const a = this.navCell(ax, az), b = this.navCell(bx, bz);
    if (a < 0 || b < 0) return false;
    return this._gridLine(a, b);
  }

  /** Cover points: walkable cells hugging obstacles at least crouch height. */
  _buildCover() {
    const n = this.nav, W = n.w;
    const pts = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let j = 1; j < n.h - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = j * W + i;
        if (n.blocked[idx]) continue;
        for (const [di, dj] of dirs) {
          const nIdx = (j + dj) * W + i + di;
          if (!n.blocked[nIdx]) continue;
          const h = n.coverH[nIdx];
          if (h < 0.95) continue;
          const p = this.cellCenter(idx);
          // Keep it sparse: skip if a similar point is within 1.8 m.
          let dup = false;
          for (let k = pts.length - 1; k >= Math.max(0, pts.length - 40); k--) {
            const q = pts[k];
            if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) < 1.8 && q.nx === di && q.nz === dj) { dup = true; break; }
          }
          if (!dup) pts.push({ x: p.x, z: p.z, nx: di, nz: dj, h, tall: h > 1.65, owner: null });
          break;
        }
      }
    }
    this.cover = pts;
  }

  /** True if a cover point shields a crouched body from a threat position. */
  coverProtects(cp, threat) {
    const dx = threat.x - cp.x, dz = threat.z - cp.z;
    const len = Math.hypot(dx, dz);
    if (len < 3) return false;
    if ((dx * cp.nx + dz * cp.nz) / len < 0.35) return false;
    const hit = this.raycast(cp.x, 0.95, cp.z, dx / len, (threat.y + 1.3 - 0.95) / len, dz / len, Math.min(len, 3));
    return !!hit;
  }
}
