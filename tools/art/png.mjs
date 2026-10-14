// Zero-dep PNG contact-sheet renderer for ESM art sheets (client/src/art/sheets/<name>.js).
//   node tools/art/png.mjs <sheet> [scale=6] [bg=#1a2030]   -> tools/art/out/<sheet>.png  (rows = anim_dir, cols = frame index; emit pixels glow)
//   node tools/art/png.mjs <sheet> --ingame                 -> tools/art/out/<sheet>_ingame.png (1x and 3x on grass)
//   node tools/art/png.mjs --all [scale]                    -> every sheet
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHEETS = path.join(ROOT, 'client/src/art/sheets');
const OUT = path.join(ROOT, 'tools/art/out');

export function loadSheet(name) {
  const src = fs.readFileSync(path.join(SHEETS, name + '.js'), 'utf8');
  return new Function(src.replace(/export\s+default/, 'return'))();
}
const hex = h => { h = h.replace('#', ''); if (h.length === 6) h += 'ff'; return [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16)); };

function crcOf(b) {
  const T = crcOf.T || (crcOf.T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; }));
  let c = -1; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0;
}
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crcOf(td)); return Buffer.concat([l, td, c]); };
export function encodePng(W, H, img) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(img.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function render(name, a2, a3) {
  const S = loadSheet(name);
  const ingame = a2 === '--ingame';
  const scale = ingame ? 1 : +(a2 || 6);
  const bg = hex(ingame ? '#2a3324' : (a3 || '#1a2030'));
  const only = process.env.FRAMES ? process.env.FRAMES.split(',') : null;
  const keys = Object.keys(S.frames).filter(k => !only || only.includes(k));
  const groups = new Map();
  for (const k of keys) { const m = k.match(/^(.*)_[sne]_\d+$/); const g = m ? m[1] : "_other"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); }
  const pad = 2;
  let maxW = 0, maxH = 0;
  for (const k of keys) { maxW = Math.max(maxW, S.frames[k][0].length); maxH = Math.max(maxH, S.frames[k].length); }
  const gapCols = 0.6; // extra spacing between direction blocks
  const colOf = (ks, ki) => { let col = 0, prev = null; for (let j = 0; j <= ki; j++) { const d = (ks[j].match(/_([sne])_/) || [])[1]; if (j && d !== prev) col += gapCols; if (j) col += 1; prev = d; } return col; };
  const cols = Math.ceil(Math.max(...[...groups.values()].map(g => colOf(g, g.length - 1) + 1)));
  const scales = ingame ? [1, 3] : [scale];
  const cellW = maxW + pad, cellH = maxH + pad, top = Math.max(...scales);
  const W = scales.reduce((a, s) => a + (cellW * cols) * s + 8, 8);
  const H = groups.size * cellH * top + 8;
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set(bg, i * 4);
  if (ingame) for (let i = 0; i < W * H; i++) { const r = (Math.sin(i * 12.9898) * 43758.5453) % 1; if (Math.abs(r) < 0.08) img.set(hex('#344029'), i * 4); }
  const add = (x, y, c, a) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) img[i + k] = Math.min(255, img[i + k] + c[k] * a); };
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4, a = c[3] / 255;
    for (let k = 0; k < 3; k++) img[i + k] = Math.round(img[i + k] * (1 - a) + c[k] * a);
    img[i + 3] = 255;
  };
  const emit = S.emit || {};
  let ox = 4;
  for (const s of scales) {
    let row = 0;
    for (const [, ks] of groups) {
      ks.forEach((k, ci) => {
        const rows = S.frames[k];
        const x0 = ox + Math.round(colOf(ks, ci) * cellW * s), y0 = 4 + row * cellH * top + (maxH - rows.length) * s;
        const em = [];
        rows.forEach((r, y) => [...r].forEach((ch, x) => {
          if (ch === '.') return;
          const c = hex(S.pal[ch]);
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(x0 + x * s + dx, y0 + y * s + dy, c);
          if (emit[ch]) em.push([x, y, c, emit[ch]]);
        }));
        for (const [x, y, c, st] of em) for (let dy = -2 * s; dy < 3 * s; dy++) for (let dx = -2 * s; dx < 3 * s; dx++) { const d = Math.hypot(dx, dy) / s; if (d > 0.8 && d < 2.6) add(x0 + x * s + (s >> 1) + dx, y0 + y * s + (s >> 1) + dy, c, 0.10 * st * (2.6 - d)); }
        // anchor tick
        if (S.anchor && ci === 0 && s >= 4) put(x0 + S.anchor[0] * s + (s >> 1), y0 + S.anchor[1] * s + s, [255, 0, 255, 255]);
      });
      row++;
    }
    ox += cellW * cols * s + 8;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, name + (only ? '_zoom' : '') + (ingame ? '_ingame' : '') + '.png');
  fs.writeFileSync(out, encodePng(W, H, img));
  return `${out} ${W}x${H} rows: ${[...groups.keys()].join(' ')}`;
}


// --lineup: one PNG with idle_s_0 idle_e_0 attack_s_1 cast_s_1 portrait for every sheet (+ optional FR env override)
export function lineup(scale = 5, names) {
  const list = names || fs.readdirSync(SHEETS).filter(f => f.endsWith('.js')).map(f => f.replace(/.js$/, '')).filter(n => { try { return loadSheet(n).frames.idle_s_0; } catch { return false; } });
  const want = (process.env.FR || 'idle_s_0,idle_e_0,attack_s_1,cast_s_1,portrait').split(',');
  const bg = hex('#1a2030');
  const sheets = list.map(n => [n, loadSheet(n)]);
  const cw = Math.max(...sheets.flatMap(([, S]) => want.map(k => S.frames[k] ? S.frames[k][0].length : 0))) + 2;
  const ch = Math.max(...sheets.flatMap(([, S]) => want.map(k => S.frames[k] ? S.frames[k].length : 0))) + 2;
  const W = want.length * cw * scale + 8, H = sheets.length * ch * scale + 8;
  const img = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) img.set(bg, i * 4);
  const add = (x, y, c, a) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) img[i + k] = Math.min(255, img[i + k] + c[k] * a); };
  sheets.forEach(([n, S], r) => want.forEach((k, ci) => {
    const rows = S.frames[k]; if (!rows) return;
    const x0 = 4 + ci * cw * scale, y0 = 4 + r * ch * scale + (ch - 1 - rows.length) * scale;
    const em = [];
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return; const col = hex(S.pal[c]);
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const X = x0 + x * scale + dx, Y = y0 + y * scale + dy, i = (Y * W + X) * 4; if (X >= 0 && Y >= 0 && X < W && Y < H) { img.set(col.slice(0, 3), i); img[i + 3] = 255; } }
      if ((S.emit || {})[c]) em.push([x, y, col, S.emit[c]]);
    }));
    for (const [x, y, c, st] of em) for (let dy = -2 * scale; dy < 3 * scale; dy++) for (let dx = -2 * scale; dx < 3 * scale; dx++) { const d = Math.hypot(dx, dy) / scale; if (d > 0.8 && d < 2.6) add(x0 + x * scale + (scale >> 1) + dx, y0 + y * scale + (scale >> 1) + dy, c, 0.10 * st * (2.6 - d)); }
    if (k === want[0] && S.anchor) for (let t = 0; t < 3; t++) { const X = x0 + S.anchor[0] * scale + (scale >> 1), Y = y0 + rows.length * scale + t; const i = (Y * W + X) * 4; img.set([255, 0, 255, 255], i); }
  }));
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, 'lineup.png'); fs.writeFileSync(out, encodePng(W, H, img));
  return out + ' ' + W + 'x' + H + ' ' + list.join(',');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, a2, a3] = process.argv.slice(2);
  if (!name) { console.log('sheets:', fs.readdirSync(SHEETS).map(f => f.replace(/\.js$/, '')).join(', ')); process.exit(0); }
  if (name === '--lineup') console.log(lineup(+(a2 || 5), process.argv.slice(4).length ? process.argv.slice(4) : undefined));
  else if (name === '--all') for (const f of fs.readdirSync(SHEETS)) { if (f.endsWith('.js')) console.log(render(f.replace(/\.js$/, ''), a2)); }
  else console.log(render(name, a2, a3));
}
