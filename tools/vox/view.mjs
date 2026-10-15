// One compare image for the director: a unit's private Dota reference (top rows) and its voxel model (bottom rows), same views, optionally same anims.
//   node tools/vox/view.mjs <short|npc key> [--ref|--vox|--both (default)] [--poses]       (npm run vox:view -- lina --poses)
// -> tools/.cache/view/<short>.png (gitignored: it contains reference renders, so it is NEVER committed, published or put under docs/). Prints the path.
// Rows: REF (front, 3/4, side, back, top from tools/vox/ref.mjs, cached) / VOX (shared/vox/index.js model, same camera). --poses adds one row per anim:
// 4 reference frames | up to 4 voxel frames, same 3/4 camera. No voxel model in the registry -> reference only. Deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../art/png.mjs';
import { Canvas, renderVox } from '../art/vox.mjs';
import { VOX } from '../../shared/vox/index.js';
import { decodePng } from './lib/pngdec.mjs';
import { drawText } from './lib/font.mjs';
import { VIEWS, POSE_CAM, POSE_LAYOUT, buildRef } from './ref.mjs';
import { CACHE, RefError, resolveUnit } from './lib/dota.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2), flag = f => args.includes(f), arg = args.find(a => !a.startsWith('--'));
const wantRef = !flag('--vox'), wantVox = !flag('--ref'), poses = flag('--poses');
if (!arg) { console.error('usage: node tools/vox/view.mjs <short|npc_dota_key> [--ref|--vox|--both] [--poses]'); process.exit(2); }

const S = 288, PS = POSE_LAYOUT.PS, LW = 64, M = 8, HEAD = 22, BG = '#1c2030', GAP = 20;
const ROLE_ANIMS = { idle: ['idle'], run: ['run', 'walk'], attack: ['attack'], cast: ['cast'], ult: ['ult', 'cast2'], stunned: ['stunned', 'stun'], death: ['death', 'die'] };
const paste = (C, r, x0, y0) => { for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) { const i = (y * r.W + x) * 4, j = ((y0 + y) * C.W + x0 + x) * 4; C.px[j] = r.rgba[i]; C.px[j + 1] = r.rgba[i + 1]; C.px[j + 2] = r.rgba[i + 2]; C.px[j + 3] = 255; } };
const crop = (img, x, y, w, h) => { const rgba = new Uint8ClampedArray(w * h * 4); for (let r = 0; r < h; r++) rgba.set(img.rgba.subarray(((y + r) * img.W + x) * 4, ((y + r) * img.W + x + w) * 4), r * w * 4); return { W: w, H: h, rgba }; };
const evenly = (a, n) => a.length <= n ? a : Array.from({ length: n }, (_, k) => a[Math.round(k * (a.length - 1) / (n - 1))]);
const label = (C, x, y, t, c = '#8892b0') => drawText(C, x, y, t, c, 1);

try {
  const u = resolveUnit(arg), short = u.short;
  const entry = VOX[short] || Object.entries(VOX).find(([, v]) => v.unit === u.key)?.[1];
  const vox = wantVox && entry ? entry.mod : null;
  if (wantVox && !wantRef && !vox) throw new RefError(`${short}: no voxel model in shared/vox/index.js (use --ref or --both)`);
  if (wantVox && !vox) console.log(`${short}: no voxel model in shared/vox/index.js, showing the reference only`);

  // ---- reference (cached in tools/.cache/ref/<short>/)
  let refDir = null, info = null;
  if (wantRef) {
    refDir = path.join(CACHE, short);
    if (!fs.existsSync(path.join(refDir, 'ref.json')) || !fs.existsSync(path.join(refDir, 'front.png'))) buildRef(arg);
    info = JSON.parse(fs.readFileSync(path.join(refDir, 'ref.json'), 'utf8'));
  }
  const refViews = wantRef ? VIEWS.map(([n]) => decodePng(fs.readFileSync(path.join(refDir, n + '.png')))) : null;
  const refPoses = wantRef && poses && fs.existsSync(path.join(refDir, 'poses.png')) ? decodePng(fs.readFileSync(path.join(refDir, 'poses.png'))) : null;
  const roles = refPoses ? Object.entries(info.anims.roles) : [];

  // ---- voxel: height-matched to the reference figure in the views, one fixed cell for the poses
  const stats = () => { const v = vox.build(vox.ANIMS.idle[0]); let h = 0; for (let k = 0; k < v.g.length; k++) if (v.g[k]) h = Math.max(h, Math.floor(k / (v.X * v.Y)) + 1); return h; };
  const vh = vox ? stats() : 0, grid = vox?.META.grid || [0, 0, 0], ctr = h => [vox.META.cx, vox.META.cy, h / 2];
  let vsc = 2.2;
  if (vox && info) { const sz = info.size, refPx = sz.height * (S / (Math.max(sz.height, Math.hypot(sz.width, sz.depth)) * 1.12)); vsc = Math.min(refPx / vh, S / (Math.max(vh, Math.hypot(grid[0], grid[1])) * 1.1)); }
  const psc = vox ? Math.min((PS - 6) / (Math.max(vh, grid[2] * 0.75) * Math.cos(POSE_CAM[1] * Math.PI / 180) + grid[1] * 0.5), (PS - 6) / Math.hypot(grid[0], grid[1])) : 0;
  const voxView = ([, yaw, pitch]) => renderVox(vox.build(vox.ANIMS.idle[0]), { yaw, pitch, scale: vsc, W: S, H: S, center: ctr(vh), ss: 3 });
  const voxFrame = pose => renderVox(vox.build(pose), { yaw: POSE_CAM[0], pitch: POSE_CAM[1], scale: psc, W: PS, H: PS, center: ctr(vh), ss: 3 });

  // ---- compose
  const voxAnim = role => vox && (ROLE_ANIMS[role] || [role]).map(k => vox.ANIMS[k]).find(Boolean);
  const rows = [];   // pose rows: { role, ref: [img], vox: [img] | null }
  if (poses) {
    if (refPoses) for (const [i, [role]] of roles.entries()) {
      const n = info.anims.roles[role].times.length, a = voxAnim(role);
      rows.push({ role, seq: info.anims.roles[role].seq, ref: Array.from({ length: n }, (_, k) => crop(refPoses, POSE_LAYOUT.LW + k * (PS + POSE_LAYOUT.gx), POSE_LAYOUT.HEAD + i * (PS + POSE_LAYOUT.gy), PS, PS)), vox: a ? evenly(a, 4).map(voxFrame) : null });
    } else if (vox) for (const [name, a] of Object.entries(vox.ANIMS)) rows.push({ role: name, seq: '', ref: [], vox: evenly(a, 4).map(voxFrame) });
  }
  const viewsW = LW + VIEWS.length * (S + M), poseHalf = 4 * (PS + 4), poseW = LW + (wantRef && refPoses ? poseHalf : 0) + (wantRef && refPoses && vox ? GAP : 0) + (vox ? poseHalf : 0);
  const W = Math.max(viewsW, poseW) + M, nViewRows = (wantRef ? 1 : 0) + (vox ? 1 : 0);
  const H = HEAD + nViewRows * (S + M) + (rows.length ? 14 + rows.length * (PS + 6) : 0) + M;
  const C = new Canvas(W, H, BG);
  label(C, M, 6, `${short.toUpperCase()}  ${u.kind}  ${wantRef ? 'REF = Dota 2 (private, never commit)' : ''}${wantRef && vox ? '  |  ' : ''}${vox ? 'VOX = shared/vox model' : ''}`, '#e0e6ff');
  let y = HEAD;
  const viewRow = (name, imgs) => {
    label(C, M, y + 4, name, '#e0e6ff');
    imgs.forEach((r, k) => { (r.opaque === false ? C.blit(r, LW + k * (S + M), y) : paste(C, r, LW + k * (S + M), y)); label(C, LW + k * (S + M) + 2, y + S - 8, `${VIEWS[k][0]} ${VIEWS[k][1]}/${VIEWS[k][2]}`); });
    y += S + M;
  };
  if (wantRef) viewRow('REF', refViews);
  if (vox) viewRow('VOX', VIEWS.map(v => Object.assign(voxView(v), { opaque: false })));
  if (rows.length) {
    label(C, M, y, `POSES  yaw ${POSE_CAM[0]} pitch ${POSE_CAM[1]}${wantRef && refPoses ? '  ref frames over the game sequence | ' : '  '}${vox ? 'voxel frames of ANIMS' : ''}`, '#e0e6ff'); y += 14;
    for (const r of rows) {
      label(C, M, y + 4, r.role.toUpperCase(), '#e0e6ff'); if (r.seq) label(C, M, y + 14, r.seq.slice(0, 11), '#6a7290');
      let x = LW;
      if (wantRef && refPoses) { r.ref.forEach((img, k) => paste(C, img, x + k * (PS + 4), y)); x += poseHalf + (vox ? GAP : 0); }
      if (vox) { if (r.vox) r.vox.forEach((img, k) => C.blit(img, x + k * (PS + 4), y)); else label(C, x + 4, y + 8, 'NO VOX ANIM', '#a06060'); }
      y += PS + 6;
    }
  }
  const out = path.join(ROOT, 'tools/.cache/view', short + '.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(C.W, C.H, C.px));
  console.log(`${short}  ${wantRef ? 'ref' : ''}${wantRef && vox ? '+' : ''}${vox ? 'vox' : ''}${poses ? ' +poses' : ''}  ${C.W}x${C.H}  ${path.relative(ROOT, out)}`);
} catch (e) {
  if (!(e instanceof RefError)) throw e;
  console.error(e.message); process.exit(1);
}
