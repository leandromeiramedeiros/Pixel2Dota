// HUD portrait of a registered hero:   node tools/vox/portrait.mjs <short> [--no-asset]     (wraps tools/art/vox_portrait.mjs)
//   -> docs/voxel-chibi/<short>_vox_portrait_studio.png   12x preview
//   -> client/src/art/portraits/<short>.js                the 32x42 HUD asset (portraits.js swaps it in)
// Framing: the model's optional `PORTRAIT` export { pose, center, scale, fov, sig, face } over defaults from its PROP (head height), over the
// per-hero overrides in vox_portrait.mjs HEROES. `sig` = signature colour (rim light + backdrop glow); face = [x, y, w, h] crop for the 24x24 icon.
import fs from 'node:fs';
import path from 'node:path';
import { VOX } from '../../shared/vox/index.js';
import { HEROES, renderPortrait, toRows, assetSource, previewPng, PW, PH, PREVIEW_DIR, ASSET_DIR } from '../art/vox_portrait.mjs';

const short = process.argv[2];
const heroes = Object.keys(VOX).filter(k => VOX[k].kind === 'hero');
if (!VOX[short] || VOX[short].kind !== 'hero') { console.error(`usage: node tools/vox/portrait.mjs <${heroes.join('|')}> [--no-asset]  (heroes only, registered in shared/vox/index.js)`); process.exit(2); }
const { mod } = VOX[short], M = mod.META, P = mod.PROP || {};
const H = {
  build: mod.build, pose: mod.ANIMS.idle[0], center: [M.cx + 0.4, M.cy, (P.headZ ?? 28) - 0.2], scale: 1.3, fov: 24, sig: '#ffd27a', face: [4, 11, 24, 24],
  ...mod.PORTRAIT, ...HEROES[short],
};
const t0 = performance.now(), r = renderPortrait(H.build, H);
fs.mkdirSync(PREVIEW_DIR, { recursive: true });
const prev = path.join(PREVIEW_DIR, short + '_vox_portrait_studio.png');
fs.writeFileSync(prev, previewPng(r)); console.log(prev, fs.statSync(prev).size + ' B');
const { pal, rows, colors, distinct } = toRows(r);
console.log(`${PW}x${PH}, ${distinct} distinct colours -> ${colors} in the palette, ${Math.round(performance.now() - t0)} ms`);
if (!process.argv.includes('--no-asset')) {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const out = path.join(ASSET_DIR, short + '.js'); fs.writeFileSync(out, assetSource(short, rows, pal, H.face)); console.log(out);
}
