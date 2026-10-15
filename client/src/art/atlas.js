// Sprite sheet loader + atlas packer. Pure logic (shelfPack, parseColor, resolveKey) is DOM-free so node can test it.
//   loadSheets() -> Promise<{ [name]: sheetDef }>
//   buildAtlas(sheets) -> { texture, emitTexture, width, height, frame(sheet, key), resolve(sheet, anim, dir, i), has(sheet, key), sheets }
// Sheet format: { pal:{ch:'#rrggbb[aa]'}, anchor:[x,y], px?:N, emit?:{ch:strength}, frames:{ key:[rows] } }, '.' = transparent.
//   Dirs: s e n (+ mirrored w) for 1x sheets; 8-dir sheets also paint se ne (sw/nw mirror se/ne). px = pixel density (2 = drawn at 2x, shown at the same world size).
import * as THREE from 'three';
import { withVoxPortrait } from './portraits.js';

let sheetMods = {};
try { sheetMods = import.meta.glob('./sheets/*.js'); } catch { /* not running under vite (node tests) */ }

/** Loads every sheet module; a sheet that fails to load (syntax error while being generated) is skipped with a warning. */
export async function loadSheets() {
  const out = {};
  await Promise.all(Object.keys(sheetMods).map(async (p) => {
    const name = p.slice(p.lastIndexOf('/') + 1).replace(/\.js$/, '');
    try {
      const mod = await sheetMods[p]();
      const def = await withVoxPortrait(name, mod.default);
      if (def && def.frames) out[name] = def;
    } catch (e) { console.warn('[atlas] sheet "' + name + '" failed to load:', e && e.message); }
  }));
  return out;
}

export function parseColor(h) {
  if (!h) return [0, 0, 0, 0];
  let s = h[0] === '#' ? h.slice(1) : h;
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** Shelf packer: items [{w,h}] -> sets item.x/item.y, returns the used height. 1px padding on every side (pad). */
export function shelfPack(items, maxW, pad = 1) {
  const order = items.map((_, i) => i).sort((a, b) => items[b].h - items[a].h || items[b].w - items[a].w);
  let x = pad, y = pad, rowH = 0;
  for (const i of order) {
    const it = items[i];
    if (x + it.w + pad > maxW) { x = pad; y += rowH + pad; rowH = 0; }
    it.x = x; it.y = y; x += it.w + pad; if (it.h > rowH) rowH = it.h;
  }
  return y + rowH + pad;
}

export const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

const DIR_FALLBACK = { se: 'e', ne: 'e', e: 's', n: 's', s: 's' };
const MIRROR = { w: 'e', sw: 'se', nw: 'ne' };
const ANIM_FALLBACK = { channel: ['cast', 'idle'], dead: ['death', 'stunned', 'idle'], death: ['stunned', 'idle'], stunned: ['idle'], cast: ['attack', 'idle'], attack: ['idle'], walk: ['idle'], idle: [] };

/** Index a sheet's frame keys: counts[anim_dir] = n frames. */
export function indexSheet(def) {
  const counts = {};
  for (const k in def.frames) {
    const m = /^(.*)_([sn][ew]|[snew])_(\d+)$/.exec(k);
    if (!m) continue;
    const id = m[1] + '_' + m[2];
    counts[id] = Math.max(counts[id] || 0, +m[3] + 1);
  }
  return counts;
}

/** Resolve (anim, dir, i) to an existing frame key with the contract fallback chain: west -> mirrored east, missing dir -> s,
 *  missing anim -> idle, index mod count. Returns { key, flip } or null. */
export function resolveKey(def, counts, anim, dir, i, prefix = '', clamp = false) {
  const anims = [anim, ...(ANIM_FALLBACK[anim] || ['idle'])];
  if (anims[anims.length - 1] !== 'idle') anims.push('idle');
  for (const a of anims) {
    let d = dir, flip = false;
    if (MIRROR[d]) { d = MIRROR[d]; flip = true; }
    for (let t = 0; t < 3; t++) {
      const n = counts[prefix + a + '_' + d];
      if (n) { const k = clamp ? Math.max(0, Math.min(n - 1, i | 0)) : (((i | 0) % n) + n) % n; return { key: prefix + a + '_' + d + '_' + k, flip, n }; }
      if (d === 's') break;
      d = DIR_FALLBACK[d] || 's'; if (d === 's') flip = false;
    }
  }
  return null;
}

export function rasterize(def, rows, data, W, x0, y0, emitData) {
  const pal = def._pal || (def._pal = Object.fromEntries(Object.entries(def.pal).map(([k, v]) => [k, parseColor(v)])));
  const emit = def.emit;
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x]; if (ch === '.') continue;
      const c = pal[ch]; if (!c || c[3] === 0) continue;
      const o = ((y0 + y) * W + x0 + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3];
      if (emit && emitData && emit[ch]) emitData[o + 3] = Math.max(1, Math.min(255, Math.round((emit[ch] / 4) * 255)));
    }
  }
}

export function makeTexture(data, W, H) {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

/** Pack every frame of every sheet. Frames whose rows are shared (same array) are packed once. */
export function buildAtlas(sheets, opts = {}) {
  const maxW = opts.width || 2048;
  const items = [];
  const reg = {};   // sheetName -> { def, counts, frames: {key: item} }
  for (const name in sheets) {
    const def = sheets[name]; if (!def || !def.frames) continue;
    const r = reg[name] = { def, counts: indexSheet(def), frames: {} };
    const seen = new Map();
    for (const key in def.frames) {
      const rows = def.frames[key]; if (!rows || !rows.length) continue;
      let it = seen.get(rows);
      if (!it) { it = { w: Math.max(...rows.map((s) => s.length)), h: rows.length, rows, x: 0, y: 0 }; seen.set(rows, it); items.push(it); }
      r.frames[key] = it;
    }
  }
  const usedH = shelfPack(items, maxW, 1);
  const W = maxW, H = nextPow2(Math.max(usedH, 16));
  const data = new Uint8Array(W * H * 4), emitData = new Uint8Array(W * H * 4);
  for (const name in reg) {
    const r = reg[name], done = new Set();
    for (const key in r.frames) { const it = r.frames[key]; if (done.has(it)) continue; done.add(it); rasterize(r.def, it.rows, data, W, it.x, it.y, emitData); }
  }
  const texture = makeTexture(data, W, H), emitTexture = makeTexture(emitData, W, H);
  const cache = new Map();

  function build(name, key, flip) {
    const r = reg[name]; const it = r && r.frames[key]; if (!it) return null;
    const ck = name + '|' + key + (flip ? '|f' : '');
    let f = cache.get(ck); if (f) return f;
    let anchor = (r.def.anchors && r.def.anchors[key]) || r.def.anchor || [it.w >> 1, it.h - 1];
    if (anchor[0] === 0 && anchor[1] === 0 && !(r.def.anchors && r.def.anchors[key])) anchor = [it.w >> 1, it.h >> 1];   // [0,0] = centre the frame (fx sheet)
    const x0 = it.x / W, x1 = (it.x + it.w) / W, y0 = it.y / H, y1 = (it.y + it.h) / H;
    f = {
      sheet: name, key, u0: flip ? x1 : x0, u1: flip ? x0 : x1, v0: y0, v1: y1, w: it.w, h: it.h,
      ax: flip ? it.w - 1 - anchor[0] : anchor[0], ay: anchor[1], flip, rows: it.rows, def: r.def, px: it.x, py: it.y, dens: r.def.px || 1,
    };
    cache.set(ck, f); return f;
  }
  const atlas = {
    texture, emitTexture, width: W, height: H, sheets: reg,
    /** frame(sheet, 'walk_w_1') -> frame rect (west = mirrored east); null if missing. */
    frame(name, key) {
      const m = /^(.*)_(w|sw|nw)_(\d+)$/.exec(key);
      if (m) { const k2 = m[1] + '_' + MIRROR[m[2]] + '_' + m[3]; return build(name, reg[name] && reg[name].frames[key] ? key : k2, !(reg[name] && reg[name].frames[key])); }
      return build(name, key, false);
    },
    has(name, key) { return !!(reg[name] && (reg[name].frames[key] || (/_(w|sw|nw)_\d+$/.test(key) && reg[name].frames[key.replace(/_(w|sw|nw)_(\d+)$/, (_, d, i) => '_' + MIRROR[d] + '_' + i)]))); },
    hasSheet(name) { return !!reg[name]; },
    /** resolve(sheet, anim, dir 's'|'n'|'e'|'w', i) -> frame with the fallback chain. */
    resolve(name, anim, dir, i, prefix = '', clamp = false) {
      const r = reg[name]; if (!r) return null;
      const k = resolveKey(r.def, r.counts, anim, dir, i, prefix, clamp); if (!k) return null;
      const f = build(name, k.key, k.flip); if (f) f.n = k.n; return f;
    },
    frameCount(name, anim, dir, prefix = '') { const r = reg[name]; if (!r) return 0; const a = resolveKey(r.def, r.counts, anim, dir, 0, prefix); return a ? a.n : 0; },
    /** Number of frames named base_0, base_1, ... (direction-less sheets such as buildings). */
    seqCount(name, base) { const r = reg[name]; if (!r) return 0; let n = 0; while (r.frames[base + '_' + n]) n++; return n; },
    anchor(name) { const r = reg[name]; return r ? r.def.anchor : null; },
    texel(f, x, y) { const row = f.rows[y]; if (!row || x < 0 || x >= row.length) return false; const ch = row[x]; if (ch === '.') return false; const p = f.def.pal[ch]; return !!p && (p.length < 8 || p.slice(7) !== '00'); },
  };
  return atlas;
}
