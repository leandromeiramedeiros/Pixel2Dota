// Pixel-art helpers: sheet frame / glyph -> cached canvas or data URL at integer scale (image-rendering: pixelated).
//   frameCanvas(def, key, scale, crop?) -> cached HTMLCanvasElement (do not insert it twice; use pixelEl for a fresh element)
//   pixelEl(def, key, scale, crop?)     -> a fresh <canvas class="px"> showing the frame (def may be a { pal, rows } glyph)
//   paintInto(el, def, key, scale)      -> repaint an existing canvas
//   frameURL(def, key, scale, crop?)    -> data URL
// Sheet format: { pal:{ch:'#rrggbb[aa]'}, frames:{key:[rows]} }, '.' transparent.
const cache = new Map();
let uid = 0;
const ids = new WeakMap();
const idOf = (o) => { let i = ids.get(o); if (!i) { i = ++uid; ids.set(o, i); } return i; };

export function parseColor(h) {
  if (!h) return [0, 0, 0, 0];
  const s0 = h[0] === '#' ? h.slice(1) : h;
  const s = s0.length === 3 ? s0.split('').map((c) => c + c).join('') : s0;
  const n = parseInt(s.slice(0, 6), 16);
  const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** rows + palette -> { w, h, data: Uint8ClampedArray RGBA } (DOM-free, testable). crop = [x, y, w, h]. */
export function rasterRows(pal, rows, crop) {
  let cx = 0, cy = 0, cw, ch;
  if (crop) [cx, cy, cw, ch] = crop;
  else { cw = Math.max(0, ...rows.map((r) => r.length)); ch = rows.length; }
  const data = new Uint8ClampedArray(cw * ch * 4);
  const colors = {};
  for (let y = 0; y < ch; y++) {
    const row = rows[y + cy]; if (!row) continue;
    for (let x = 0; x < cw; x++) {
      const c = row[x + cx]; if (!c || c === '.') continue;
      let col = colors[c]; if (!col) col = colors[c] = parseColor(pal[c]);
      const o = (y * cw + x) * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = col[3];
    }
  }
  return { w: cw, h: ch, data };
}

function paint(pal, rows, scale, crop) {
  const r = rasterRows(pal, rows, crop);
  const w = Math.max(1, r.w), h = Math.max(1, r.h);
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  src.getContext('2d').putImageData(new ImageData(r.data, w, h), 0, 0);
  if (scale === 1) return src;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Cached canvas for sheet.frames[key]; null if the frame does not exist. */
export function frameCanvas(def, key, scale = 1, crop) {
  const rows = def && def.frames && def.frames[key];
  if (!rows) return null;
  const id = idOf(def) + ':' + key + ':' + scale + ':' + (crop ? crop.join(',') : '');
  let c = cache.get(id);
  if (!c) { c = paint(def.pal, rows, scale, crop); cache.set(id, c); }
  return c;
}

/** Cached canvas for a { pal, rows } glyph. */
export function glyphCanvas(g, scale = 1) {
  const id = 'g' + idOf(g) + ':' + scale;
  let c = cache.get(id);
  if (!c) { c = paint(g.pal, g.rows, scale); cache.set(id, c); }
  return c;
}

const srcOf = (def, key, scale, crop) => (def && def.rows ? glyphCanvas(def, scale) : frameCanvas(def, key, scale, crop));

export function cloneCanvas(src, cls = 'px') {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height; c.className = cls;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

/** A fresh element showing a frame (or a glyph when `def.rows`). */
export function pixelEl(def, key, scale = 1, crop) {
  const src = srcOf(def, key, scale, crop);
  if (!src) { const e = document.createElement('canvas'); e.className = 'px'; e.width = e.height = 1; return e; }
  return cloneCanvas(src);
}

/** Repaint an existing canvas element with another frame. Returns false when the frame is missing. */
export function paintInto(el, def, key, scale = 1, crop) {
  const src = srcOf(def, key, scale, crop);
  if (!src) return false;
  if (el.width !== src.width) el.width = src.width;
  if (el.height !== src.height) el.height = src.height;
  const g = el.getContext('2d'); g.clearRect(0, 0, el.width, el.height); g.drawImage(src, 0, 0);
  return true;
}

export function frameURL(def, key, scale = 1, crop) {
  const c = srcOf(def, key, scale, crop);
  return c ? c.toDataURL() : '';
}
