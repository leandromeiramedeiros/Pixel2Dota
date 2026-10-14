// Voxel Lina HUD portrait: 3/4 bust (above the chest), 50mm-style perspective, studio key light + dramatic back rim lights,
// neutral photo-backdrop. Returns an RGBA image (PW x PH).
//   node tools/art/heroes/lina_vox_portrait.mjs  -> docs/voxel-chibi/lina_vox_portrait.png (8x preview)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderVox } from '../vox.mjs';
import { encodePng } from '../png.mjs';
import { buildLina } from './lina_vox.mjs';
import { OUT } from './lina_vox_shot.mjs';

export const PW = 48, PH = 64;   // 3:4
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/** Neutral studio backdrop: soft warm-grey pool of light behind the head falling off to charcoal, 4 Bayer-dithered tones. */
export function backdrop(W = PW, H = PH, tones = ['#2a292e', '#36343a', '#433f44', '#524d4c']) {
  const T = tones.map(hex), out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - W * 0.58) / (W * 0.7), (y - H * 0.36) / (H * 0.62));
    const t = Math.max(0, Math.min(1, 1 - d)) * (T.length - 1) + (BAYER[y & 3][x & 3] + 0.5) / 16 - 0.5;
    out.push(T[Math.max(0, Math.min(T.length - 1, Math.round(t)))]);
  }
  return out;
}

export function renderPortrait(model = buildLina({ arm: 'down', flameK: 0 })) {
  const r = renderVox(model, {
    yaw: -20, pitch: 8, scale: 1.55, W: PW, H: PH, center: [17.4, 15, 26.6], fov: 39.6, ss: 4,
    light: [-0.62, 0.5, 0.62], fill: [0.8, 0.1, 0.5, 0.22], ambient: 0.36, levels: [0.46, 0.72, 0.98],
    rim: [{ dir: [1, -0.4], col: '#fff1d6', w: 2, k: 0.85 }, { dir: [-1, -0.6], col: '#9fb4ff', w: 1, k: 0.5 }],
  });
  const bg = backdrop();
  for (let i = 0; i < PW * PH; i++) if (!r.rgba[i * 4 + 3]) { r.rgba.set([...bg[i], 255], i * 4); r.mat[i] = 0; r.bg = true; }
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = renderPortrait(), s = 8, W = PW * s, H = PH * s, px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ((y / s | 0) * PW + (x / s | 0)) * 4; px.set(r.rgba.subarray(i, i + 4), (y * W + x) * 4); }
  const out = path.join(OUT, 'lina_vox_portrait.png');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, encodePng(W, H, px)); console.log(out);
}
