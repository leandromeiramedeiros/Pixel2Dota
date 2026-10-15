// Tile A* (8-dir, no corner cutting) + string pulling + wall sliding on the shared 48u grid. Pure. Shared: the server sim moves units with it, the client previews order paths.
// Blocked = static non-walkable | standing tree tile | building hull footprint. One Nav per World (dynamic layers),
// the big scratch arrays are shared between Worlds (A* is synchronous).
import { getMap, TT, treeTiles } from './map.js';

const SQ2 = Math.SQRT2;
const MAX_EXPAND = 14000;       // A* expansion cap, then the best partial node is used

let S = null;
function statics() {
  if (S) return S;
  const m = getMap(), n = m.w * m.h;
  const base = new Uint8Array(n), cover = new Uint8Array(n);
  for (let j = 0; j < n; j++) { const t = m.type[j]; base[j] = t === TT.GRASS || t === TT.ROAD || t === TT.WATER ? 1 : 0; }
  const tt = [];
  for (let i = 0; i < m.trees.length; i++) { const a = treeTiles(i); tt.push(a); for (const j of a) if (cover[j] < 255) cover[j]++; }
  S = { m, n, base, cover, treeTiles: tt, g: new Float32Array(n), par: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), gen: 0, hn: [], hk: [] };
  return S;
}

export class Nav {
  constructor() {
    const s = statics();
    this.s = s; this.m = s.m; this.w = s.m.w; this.h = s.m.h; this.tile = s.m.tile; this.x0 = s.m.x0; this.y1 = s.m.y1;
    const n = s.n;
    this.bblock = new Uint8Array(n);   // building footprint counter
    this.down = new Uint8Array(n);     // felled trees covering the tile
    this.version = 0;
    this.cache = new Map();
    this.out = { x: 0, y: 0 };
    this.expanded = 0;
  }

  tx(x) { return Math.floor((x - this.x0) / this.tile); }
  ty(y) { return Math.floor((this.y1 - y) / this.tile); }
  cx(tx) { return this.x0 + (tx + 0.5) * this.tile; }
  cy(ty) { return this.y1 - (ty + 0.5) * this.tile; }
  idxOf(x, y) { const tx = this.tx(x), ty = this.ty(y); return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? -1 : ty * this.w + tx; }

  walkIdx(j) {
    if (j < 0) return false;
    if (this.bblock[j]) return false;
    const s = this.s;
    if (s.base[j]) return true;
    return s.m.type[j] === TT.TREE && s.cover[j] > 0 && this.down[j] >= s.cover[j];
  }
  walkTile(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.walkIdx(ty * this.w + tx); }
  walkXY(x, y) { return this.walkTile(this.tx(x), this.ty(y)); }

  /** Block/unblock the tiles whose centre lies within r of (x,y). */
  blockCircle(x, y, r, add) {
    const t = this.tile, tx0 = this.tx(x - r), tx1 = this.tx(x + r), ty0 = this.ty(y + r), ty1 = this.ty(y - r);
    for (let ty = Math.max(ty0, 0); ty <= Math.min(ty1, this.h - 1); ty++) for (let tx = Math.max(tx0, 0); tx <= Math.min(tx1, this.w - 1); tx++) {
      const dx = this.cx(tx) - x, dy = this.cy(ty) - y;
      if (dx * dx + dy * dy <= r * r + t * t * 0.25) { const j = ty * this.w + tx; this.bblock[j] = Math.max(0, this.bblock[j] + (add ? 1 : -1)); }
    }
    this.invalidate();
  }
  cutTree(i, down) {
    for (const j of this.s.treeTiles[i]) this.down[j] = Math.max(0, this.down[j] + (down ? 1 : -1));
    this.invalidate();
  }
  invalidate() { this.version++; this.cache.clear(); }

  nearestWalkable(x, y, out) {
    out = out || this.out;
    if (this.walkXY(x, y)) { out.x = x; out.y = y; return out; }
    const tx = this.tx(x), ty = this.ty(y);
    let bx = x, by = y, bd = Infinity;
    for (let r = 1; r < 80; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.walkTile(tx + dx, ty + dy)) continue;
        const px = this.cx(tx + dx), py = this.cy(ty + dy), d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < bd) { bd = d; bx = px; by = py; }
      }
      if (bd < Infinity && r >= Math.sqrt(bd) / this.tile) break;
    }
    out.x = bx; out.y = by; return out;
  }

  /** true if the segment (fattened by radius r) only crosses walkable tiles */
  lineWalkable(ax, ay, bx, by, r) {
    r = r || 0;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const step = this.tile * 0.4, n = Math.max(1, Math.ceil(len / step));
    const px = len ? -dy / len * r : 0, py = len ? dx / len * r : 0;
    for (let i = 0; i <= n; i++) {
      const x = ax + dx * i / n, y = ay + dy * i / n;
      if (!this.walkXY(x, y)) return false;
      if (r > 0 && (!this.walkXY(x + px, y + py) || !this.walkXY(x - px, y - py))) return false;
    }
    return true;
  }

  circleFree(x, y, r) {
    const t = this.tile;
    const tx0 = this.tx(x - r), tx1 = this.tx(x + r), ty0 = this.ty(y + r), ty1 = this.ty(y - r);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (this.walkTile(tx, ty)) continue;
      const bx0 = this.x0 + tx * t, by1 = this.y1 - ty * t;
      const px = Math.max(bx0, Math.min(x, bx0 + t)), py = Math.max(by1 - t, Math.min(y, by1));
      if ((px - x) * (px - x) + (py - y) * (py - y) < r * r) return false;
    }
    return true;
  }

  /** Move a circle (radius rad) from (x,y) toward (nx,ny), sliding along blocked tiles. Result in this.out. */
  slide(x, y, rad, nx, ny) {
    const r = Math.min(rad, this.tile * 0.45) * 0.9, out = this.out;
    if (!this.circleFree(x, y, r)) {          // inside a wall: let it leave, else snap
      if (this.circleFree(nx, ny, r)) { out.x = nx; out.y = ny; return out; }
      return this.nearestWalkable(nx, ny, out);
    }
    const dist = Math.hypot(nx - x, ny - y), n = Math.max(1, Math.ceil(dist / (this.tile * 0.5)));
    const sx = (nx - x) / n, sy = (ny - y) / n;
    for (let i = 0; i < n; i++) {
      if (this.circleFree(x + sx, y + sy, r)) { x += sx; y += sy; }
      else if (sx && this.circleFree(x + sx, y, r)) x += sx;
      else if (sy && this.circleFree(x, y + sy, r)) y += sy;
      else break;
    }
    out.x = x; out.y = y; return out;
  }

  /** A* then string pull. Returns [{x,y}] (possibly partial, [] when nothing). */
  findPath(x0, y0, x1, y1, radius) {
    const s = this.s, w = this.w, tile = this.tile;
    const st = this.nearestWalkable(x0, y0, {});
    const gl = this.nearestWalkable(x1, y1, {});
    const sx = this.tx(st.x), sy = this.ty(st.y), gx = this.tx(gl.x), gy = this.ty(gl.y);
    if (sx < 0 || gx < 0 || sx >= w || gx >= w || sy < 0 || gy < 0 || sy >= this.h || gy >= this.h) return [];
    if (sx === gx && sy === gy) return [{ x: gl.x, y: gl.y }];
    const si = sy * w + sx, gi = gy * w + gx, key = si * s.n + gi;
    let chain = this.cache.get(key);
    if (!chain) {
      chain = this._astar(si, gi, sx, sy, gx, gy);
      if (this.cache.size > 800) this.cache.clear();
      this.cache.set(key, chain);
    }
    // chain: tile indices start(excluded) -> end; partial when end != gi
    const pts = [];
    for (let k = 0; k < chain.length; k++) { const j = chain[k]; pts.push({ x: this.cx(j % w), y: this.cy((j / w) | 0) }); }
    if (chain.length && chain[chain.length - 1] === gi) pts[pts.length - 1] = { x: gl.x, y: gl.y };
    else if (!chain.length) return [];
    const out = [], r = Math.min(radius || 0, tile * 0.45);
    let ax = x0, ay = y0, i = 0;
    if (!this.walkXY(ax, ay)) { ax = st.x; ay = st.y; }
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && this.lineWalkable(ax, ay, pts[j + 1].x, pts[j + 1].y, r)) j++;
      out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j + 1;
    }
    return out;
  }

  _astar(si, gi, sx, sy, gx, gy) {
    const s = this.s, w = this.w, G = s.g, par = s.par, stamp = s.stamp, closed = s.closed, hn = s.hn, hk = s.hk;
    const gen = ++s.gen; hn.length = 0; hk.length = 0;
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return dx + dy + (SQ2 - 2) * Math.min(dx, dy); };
    G[si] = 0; par[si] = -1; stamp[si] = gen; heapPush(hn, hk, si, h(sx, sy));
    let found = false, best = si, bestH = h(sx, sy), exp = 0;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (hn.length) {
      const cur = heapPop(hn, hk);
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === gi) { found = true; break; }
      if (++exp > MAX_EXPAND) break;
      const cx = cur % w, cy = (cur / w) | 0, gc = G[cur];
      const hc = h(cx, cy); if (hc < bestH) { bestH = hc; best = cur; }
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (!this.walkTile(nx, ny)) continue;
        if (k >= 4 && (!this.walkTile(cx + DX[k], cy) || !this.walkTile(cx, cy + DY[k]))) continue;
        const ni = ny * w + nx;
        if (closed[ni] === gen) continue;
        const ng = gc + (k >= 4 ? SQ2 : 1);
        if (stamp[ni] !== gen || ng < G[ni]) { stamp[ni] = gen; G[ni] = ng; par[ni] = cur; heapPush(hn, hk, ni, ng + h(nx, ny)); }
      }
    }
    this.expanded += exp;
    const endI = found ? gi : best, rev = [];
    for (let i = endI; i !== -1 && i !== si; i = par[i]) rev.push(i);
    rev.reverse();
    return Int32Array.from(rev);
  }
}

function heapPush(hn, hk, node, key) {
  let i = hn.length; hn.push(node); hk.push(key);
  while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= key) break; hn[i] = hn[p]; hk[i] = hk[p]; i = p; }
  hn[i] = node; hk[i] = key;
}
function heapPop(hn, hk) {
  const top = hn[0], ln = hn.pop(), lk = hk.pop(), n = hn.length;
  if (n > 0) {
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= n) break;
      if (c + 1 < n && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= lk) break;
      hn[i] = hn[c]; hk[i] = hk[c]; i = c;
    }
    hn[i] = ln; hk[i] = lk;
  }
  return top;
}
