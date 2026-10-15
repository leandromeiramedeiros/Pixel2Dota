// Voxel HUD portrait library (3/4 bust of any shared/vox model, build(pose) -> Vox). CLI: node tools/vox/portrait.mjs <short> [--no-asset]
//     -> docs/voxel-chibi/<short>_vox_portrait_studio.png            12x preview
//     -> client/src/art/portraits/<short>.js                          the HUD asset (ASCII rows + palette, see client/src/art/portraits.js)
// Lighting (rule 2 of docs/ART-DIRECTION.md): chiaroscuro key from the upper left front over a low ambient, a warm low fill from the right,
// a strong 2 px rim from the back right in the hero's signature colour plus a 1 px cool rim from the back left, emissives (eyes, flames)
// at full brightness, and a dark low-key backdrop with a subtle Bayer glow behind the head in the signature colour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderVox, hex, mix } from './vox.mjs';
import { encodePng } from './png.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PREVIEW_DIR = path.join(ROOT, 'docs', 'voxel-chibi');
export const ASSET_DIR = path.join(ROOT, 'client', 'src', 'art', 'portraits');

/** Output size = the 32x42 the HUD shows: 1 art px = 1 u, so it stays crisp (nearest) at every integer HUD scale. */
export const PW = 32, PH = 42;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const rgbHex = c => '#' + [0, 1, 2].map(k => Math.round(c[k]).toString(16).padStart(2, '0')).join('');

/**
 * Registry: build + pose + framing per hero. center = voxel under the image centre (the face sits in the upper third, so aim a little
 * below the eyes); scale = px per voxel; sig = signature colour of the rim light and the backdrop glow; face = [x, y, w, h] crop (portrait
 * px) of the face for the 24x24 scoreboard / kill-feed icon.
 */
export const HEROES = {};   // per-hero overrides over the model's PORTRAIT export (Lina frames herself: shared/vox/heroes/lina.js PORTRAIT)

/**
 * Backdrop: low-key charcoal tinted with the signature colour, a soft glow pooled behind the head, 5 Bayer-dithered tones; the corners fall
 * to near black (vignette). Returns RGB triples.
 */
export function backdrop(sig, W = PW, H = PH, gx = 0.62, gy = 0.3) {
  const s = hex(sig), tone = (k, glow) => [0, 1, 2].map(c => Math.round(12 + (s[c] * glow + 24) * k * 0.62));
  const T = [tone(0.28, 0.1), tone(0.42, 0.22), tone(0.6, 0.4), tone(0.8, 0.62), tone(1, 0.85)], out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - W * gx) / (W * 0.62), (y - H * gy) / (H * 0.5));
    const edge = Math.hypot((x - W / 2) / (W * 0.75), (y - H / 2) / (H * 0.75));   // vignette
    const t = Math.max(0, 1 - d) ** 1.35 * (T.length - 1) * (1 - 0.35 * Math.min(1, edge * edge)) + (BAYER[y & 3][x & 3] + 0.5) / 16 - 0.5;
    out.push(T[Math.max(0, Math.min(T.length - 1, Math.round(t)))]);
  }
  return out;
}

/**
 * Render a portrait. build(pose) -> Vox. opts: { pose, W, H, center, scale, yaw, pitch, fov, sig, light, fill, ambient, levels }.
 * Returns the renderVox result with the backdrop painted into every empty pixel (rgba is opaque), r.bg = true.
 */
export function renderPortrait(build, opts = {}) {
  const { pose = {}, W = PW, H = PH, sig = '#ff9326' } = opts;
  const sc = hex(sig);
  const r = renderVox(build(pose), {
    yaw: opts.yaw ?? -22, pitch: opts.pitch ?? 3, scale: opts.scale ?? 2.3, W, H, center: opts.center ?? [17, 15, 26], fov: opts.fov ?? 24, ss: 4,
    light: opts.light ?? [-0.8, 0.66, 0.42],              // key: upper left front
    fill: opts.fill ?? [0.85, -0.5, 0.45, 0.2],           // low fill from the right (the ramps are warm, so it reads warm)
    ambient: opts.ambient ?? 0.15, levels: opts.levels ?? [0.4, 0.66, 0.93],
    rim: [
      { dir: [1, -0.45], col: opts.rimCol ?? rgbHex(mix(sc, [255, 246, 206], 0.8)), w: 2, k: 1 },   // hot gold-white rim, back right (brighter than the hair's top step)
      { dir: [-1, -0.3], col: '#86a6ff', w: 1, k: 0.95 },                                               // cool kicker, back left
    ],
  });
  // light falloff: the bottom edge (chest, hair ends) steps down into the dark (2 Bayer-dithered steps, no gradient) so the face holds the frame; kept small so it never reads as a pattern on cloth
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (y / H - 0.86) / 0.1 + (BAYER[y & 3][x & 3] + 0.5) / 16 - 0.5, k = t < 0.5 ? 1 : t < 1.5 ? 1 - (opts.falloff ?? 0.22) : 1 - (opts.falloff ?? 0.22) * 1.9;
    if (k < 1) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) r.rgba[i + c] *= k; }
  }
  const bg = backdrop(sig, W, H);
  for (let i = 0; i < W * H; i++) if (!r.rgba[i * 4 + 3]) { r.rgba.set([...bg[i], 255], i * 4); r.mat[i] = 0; r.bg = true; }
  return r;
}

/** Palette + ASCII rows of a render. Chars are printable ASCII (without '.', quote, backslash) then Latin-1, most frequent first; > 180 colours are merged. */
export function toRows(r, maxColors = 180) {
  const { W, H, rgba } = r, count = new Map();
  for (let i = 0; i < W * H; i++) { const k = rgba[i * 4] << 16 | rgba[i * 4 + 1] << 8 | rgba[i * 4 + 2]; count.set(k, (count.get(k) || 0) + 1); }
  let keys = [...count.keys()].sort((a, b) => count.get(b) - count.get(a)), map = new Map(keys.map(k => [k, k]));
  const dist = (a, b) => [16, 8, 0].reduce((s, sh) => s + (((a >> sh) & 255) - ((b >> sh) & 255)) ** 2, 0);
  // merge the rarest colour into its nearest kept neighbour until it fits
  while (keys.length > maxColors) {
    const lo = keys.pop();
    let best = keys[0]; for (const k of keys) if (dist(lo, k) < dist(lo, best)) best = k;
    for (const [a, b] of map) if (b === lo) map.set(a, best);
  }
  const chars = []; for (let c = 33; c < 256; c++) if (c < 127 ? ![46, 39, 92, 34, 96].includes(c) : c > 160 && c !== 173) chars.push(String.fromCharCode(c));
  const pal = {}, ch = new Map();
  keys.forEach((k, i) => { ch.set(k, chars[i]); pal[chars[i]] = '#' + k.toString(16).padStart(6, '0'); });
  const rows = [];
  for (let y = 0; y < H; y++) {
    let s = ''; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; s += ch.get(map.get(rgba[i] << 16 | rgba[i + 1] << 8 | rgba[i + 2])); }
    rows.push(s);
  }
  return { pal, rows, colors: keys.length, distinct: count.size };
}

/** HUD asset module source. */
export function assetSource(short, rows, pal, face) {
  return `// GENERATED by tools/vox/portrait.mjs (${short}) -- do not edit by hand. Voxel HUD portrait ${rows[0].length}x${rows.length} (= the 32x42 the HUD shows, 1 art px = 1 u), opaque.\n`
    + `// Loaded by client/src/art/portraits.js, which swaps it into the sheet's 'portrait' frame unless ?vox=0.\n`
    + `export default {
  pal: { ${Object.entries(pal).map(([c, v]) => `'${c}':'${v}'`).join(', ')} },
`
    + `  face: [${face.join(', ')}],\n  rows: [\n${rows.map(r => `    '${r}'`).join(',\n')}\n  ]\n};\n`;
}

/** 12x nearest-neighbour preview. */
export function previewPng(r, s = 12) {
  const W = r.W * s, H = r.H * s, px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set(r.rgba.subarray(((y / s | 0) * r.W + (x / s | 0)) * 4, ((y / s | 0) * r.W + (x / s | 0)) * 4 + 4), (y * W + x) * 4);
  return encodePng(W, H, px);
}
