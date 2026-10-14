// Uniform spatial hash, rebuilt every tick by World.step (units spawned mid-tick are inserted directly).
// query() returns a SUPERSET (everything in the overlapped cells): callers do their own exact distance test.
// Positions are those at the start of the tick, so callers should pad the radius a little (units move <= ~20u per tick).
export class Grid {
  constructor(size = 256, half = 9216) {
    this.size = size; this.half = half; this.n = Math.ceil((half * 2) / size);
    this.cells = new Array(this.n * this.n);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.used = [];
  }
  clear() { const u = this.used; for (let i = 0; i < u.length; i++) u[i].length = 0; u.length = 0; }
  _c(v) { const c = Math.floor((v + this.half) / this.size); return c < 0 ? 0 : c >= this.n ? this.n - 1 : c; }
  insert(u) {
    const c = this.cells[this._c(u.y) * this.n + this._c(u.x)];
    if (c.length === 0) this.used.push(c);
    c.push(u);
  }
  query(x, y, r, out) {
    out.length = 0;
    const x0 = this._c(x - r), x1 = this._c(x + r), y0 = this._c(y - r), y1 = this._c(y + r), n = this.n, cells = this.cells;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const c = cells[cy * n + cx];
      for (let i = 0; i < c.length; i++) out.push(c[i]);
    }
    return out;
  }
}
