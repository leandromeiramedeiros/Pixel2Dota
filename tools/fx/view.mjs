// FX review sheet:   node tools/fx/view.mjs <hero> [ability ...] [--no-ref]      (npm run fx:view -- lina)
//   -> tools/.cache/ref/<hero>/fx/sheet.png (gitignored). One block per ability (1580 x 468): title, OG row, colour strip, OURS row.
//      Each row = 4 equal 384x216 frames: t = 0.1 / 0.4 / 1.0 s after the cast event (showcase close-up) + the game camera at 0.4 s.
//   OG row:  <ability>/cap/og_0.1.png og_0.4.png og_1.0.png og_game.png (real-game captures, tools/fx/render/), cover-fit 16:9.
//            Missing -> ref.mjs CPU preview cpu_<t>.png, labelled APPROXIMATION (no game-cam frame).   Strip: ref.json palette.
//   OURS:    client/src/fxdemo.js (__fx.fire) in the render sandbox, headless Chrome (swiftshader), Ultra, day, sim paused + stepped at 30 Hz,
//            960x540 shots kept as <ability>/ours_<0.1|0.4|1.0|game>.png. Staging (fxdemo): caster S faces +x, dummy T = S + 640 x.
//            Close-up = distance 550, pitch 60, fovH43 50, lookH 70, aimed 200 u short of T (UNIT/POINT target) or at S (no target / passive).
//            Game cam = distance 1134, pitch 60, fovH43 70, centred S + 380 x.
// Own ports only (vite 5310, Chrome CDP 9340); both are killed on exit. Never touches the dev server (npm run dev / 5180).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Canvas } from '../art/vox.mjs';
import { encodePng } from '../art/png.mjs';
import { decodePng } from '../vox/lib/pngdec.mjs';
import { drawText } from '../vox/lib/font.mjs';
import { CACHE } from './lib/vpcf.mjs';
import { ourAbilities, buildRef } from './ref.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VITE_PORT = +(process.env.FX_VITE_PORT || 5310), CDP_PORT = +(process.env.FX_CDP_PORT || 9340);
export const TIMES = [0.1, 0.4, 1.0], GAME_T = 0.4, HZ = 30;
export const SLOTS = [...TIMES.map((t) => t.toFixed(1)), 'game'];     // cap/og_<slot>.png, ours_<slot>.png
const VW = 960, VH = 540, FW = 384, FH = 216;                          // viewport, sheet frame (16:9)
const CAM = { x: -800, y: -700, dist: 1134 };                          // game camera centre = fxdemo stage centre (caster at x-380, dummy at x+260)
const CLOSE = { dist: 550, pitch: 60, lead: 200 };                     // showcase close-up; aim = dummy - lead (targeted) or caster
const PAD = 10, GAP = 8, TITLE = 14, STRIP = 10, SG = 3, BOTTOM = 7;
const BG = '#14161f', LABEL = '#e0e6ff', DIM = '#8892b0', OGC = '#ffcf70', WARN = '#ff9a60';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------- headless Chrome (CDP)
async function chrome(port) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'p2d-fxview-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${VW},${VH}`, 'about:blank'], { stdio: 'ignore' });
  let list;
  for (let i = 0; i < 75 && !list; i++) { await sleep(200); try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* not up yet */ } }
  const page = list && list.find((t) => t.type === 'page');
  if (!page) { proc.kill(); throw new Error(`Chrome did not open CDP on ${port}`); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const x = r.result?.exceptionDetails; if (x || r.error) throw new Error((x?.exception?.description || x?.text || JSON.stringify(r.error)).slice(0, 800));
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  return {
    logs, ev,
    async goto(url) { await send('Page.navigate', { url }); },
    async shot() { const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: VW, height: VH, scale: 1 } }); return Buffer.from(r.result.data, 'base64'); },
    close() { try { ws.close(); } catch { /* closed */ } proc.kill(); setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 1500).unref(); },
  };
}

// In-page: Ultra, day, paused, units moved off the stage, game camera on the stage centre (fxdemo stages around the camera target).
const SETUP = `(async () => {
  for (let i = 0; i < 240 && !(window.__fx && window.__frame && window.__r); i++) await new Promise((r) => setTimeout(r, 250));
  if (!window.__fx) throw new Error('sandbox did not expose __fx');
  const Q = await import('/src/render/quality.js');
  Q.applyQuality(__r, 'ultra'); Q.applyOptions(__r, { ...Q.levelOptions('ultra'), dof: false });   // no DoF: FX stay sharp in the close-up
  for (const id of ['hud', 'keys']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  window.__calm = true; window.__pause = true; __view.night = false; __r.setClock(150);
  const B = /tower|rax|ancient|fountain|building|shop|ward/;
  for (const u of __units.values()) if (!B.test(u.kind || '') && Math.hypot(u.x - (${CAM.x}), u.y - (${CAM.y})) < 1600) { u.x += 4000; u.goal = null; }
  window.__cam = (x, y, d, pitch) => { __r.snapTarget(x, y); const g = __r.rig; g.distance = g.distanceGoal = d; g.yaw = g.yawGoal = 0; if (pitch != null) g.pitchUser = g.pitchGoal = pitch; };
  __cam(${CAM.x}, ${CAM.y}, ${CAM.dist});
  __frame(1 / ${HZ}, 4);
  return __fx.keys.length;
})()`;
// after fire(): the staged caster -> close-up aim point
const AIM = (hero, targeted) => `(() => {
  const S = [...__units.values()].find((u) => u.short === ${JSON.stringify(hero)}) || { x: ${CAM.x - 380}, y: ${CAM.y} };
  return ${targeted} ? { x: S.x + 640 - ${CLOSE.lead}, y: S.y } : { x: S.x, y: S.y };
})()`;

/** Our frames per ability: Map ability -> { [slot]: png Buffer }. One fresh page per ability (no FX left over from the previous one). */
async function captureOurs(hero, abilities, targeted, log) {
  const vite = await (await import('vite')).createServer({ configFile: path.join(ROOT, 'client/vite.config.js'), logLevel: 'error', server: { port: VITE_PORT, strictPort: true, host: '127.0.0.1', hmr: false } });
  await vite.listen();
  const B = await chrome(CDP_PORT), out = new Map();
  const kill = () => { B.close(); vite.close(); };
  process.once('SIGINT', () => { kill(); process.exit(130); });
  try {
    for (const ab of abilities) {
      await B.goto(`http://127.0.0.1:${VITE_PORT}/sandbox.html`);
      await sleep(500);
      await B.ev(SETUP);
      const ok = await B.ev(`__fx.fire(${JSON.stringify(ab)})`);
      if (!ok) { log(`  ${ab}: no fxdemo entry`); continue; }
      const a = await B.ev(AIM(hero, targeted(ab)));
      const close = `__cam(${a.x}, ${a.y}, ${CLOSE.dist}, ${CLOSE.pitch})`, game = `__cam(${CAM.x}, ${CAM.y}, ${CAM.dist})`;
      await B.ev(`(${close}, __frame(1e-4, 1), 1)`);
      const shots = {}; let t = 0;
      for (const T of TIMES) {
        const n = Math.round((T - t) * HZ); t += n / HZ;
        await B.ev(`(__frame(1 / ${HZ}, ${n}), 1)`);
        await sleep(60);
        shots[T.toFixed(1)] = await B.shot();
        if (T === GAME_T) {     // same instant, game camera; then back (a ~0 dt frame re-renders without advancing the FX)
          await B.ev(`(${game}, __frame(1e-4, 1), 1)`); await sleep(60);
          shots.game = await B.shot();
          await B.ev(`(${close}, __frame(1e-4, 1), 1)`);
        }
      }
      out.set(ab, shots);
      log(`  ${ab}: ${SLOTS.join(' / ')}  aim ${Math.round(a.x)},${Math.round(a.y)}`);
    }
    if (B.logs.length) log('page errors:\n  ' + [...new Set(B.logs)].slice(0, 8).join('\n  '));
  } finally { kill(); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- sheet
/** Cover-fit (centre crop) + area-average resample to W x H, alpha composited over black. */
function fit(img, W, H) {
  const s = Math.max(W / img.W, H / img.H), cw = W / s, ch = H / s, ox = (img.W - cw) / 2, oy = (img.H - ch) / 2;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = ox + x / s, x1 = ox + (x + 1) / s, y0 = oy + y / s, y1 = oy + (y + 1) / s;
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const wy = Math.min(y1, sy + 1) - Math.max(y0, sy), wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
      if (wx <= 0 || wy <= 0) continue;
      const i = (Math.min(img.H - 1, Math.max(0, sy)) * img.W + Math.min(img.W - 1, Math.max(0, sx))) * 4, w = wx * wy * img.rgba[i + 3] / 255;
      r += img.rgba[i] * w; g += img.rgba[i + 1] * w; b += img.rgba[i + 2] * w; n += wx * wy;
    }
    const d = (y * W + x) * 4; rgba[d] = r / n; rgba[d + 1] = g / n; rgba[d + 2] = b / n; rgba[d + 3] = 255;
  }
  return { W, H, rgba };
}
const load = (f) => (fs.existsSync(f) ? decodePng(fs.readFileSync(f)) : null);
function label(C, x, y, s, color) { C.rect(x, y, s.length * 4 + 4, 9, '#000000'); drawText(C, x + 2, y + 2, s, color, 1); }
function frame(C, x, y, img, tag, color, missing) {
  if (img) C.blit(fit(img, FW, FH), x, y, 1);
  else { C.rect(x, y, FW, FH, '#1c1f2b'); drawText(C, x + 12, y + FH / 2 - 5, missing, DIM, 2); }
  label(C, x + 3, y + 3, tag, color);
}

/** OG frames for one ability: cap/ captures, else the CPU approximation. -> { imgs: { slot: img|null }, approx } */
function ogFrames(adir) {
  const cap = Object.fromEntries(SLOTS.map((s) => [s, load(path.join(adir, 'cap', `og_${s}.png`))]));
  if (TIMES.some((t) => cap[t.toFixed(1)])) return { imgs: cap, approx: false };
  return { imgs: { ...Object.fromEntries(TIMES.map((t) => [t.toFixed(1), load(path.join(adir, `cpu_${t.toFixed(1)}.png`))])), game: null }, approx: true };
}

async function main() {
  const args = process.argv.slice(2), noRef = args.includes('--no-ref'), pos = args.filter((a) => !a.startsWith('--'));
  const hero = pos[0];
  if (!hero) { console.error('usage: node tools/fx/view.mjs <hero> [ability ...] [--no-ref]'); process.exit(2); }
  let abilities = await ourAbilities(hero);
  if (pos.length > 1) abilities = abilities.filter((a) => pos.slice(1).some((p) => a === p || a === hero + '_' + p));
  const dir = path.join(CACHE, hero, 'fx'), t0 = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  if (!noRef) {
    const has = (f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('"palette"');   // pre-v2 ref.json has no palette
    const missing = abilities.filter((a) => !has(path.join(dir, a, 'ref.json')));
    if (missing.length) { console.log(`ref: ${missing.length} abilit(ies)`); await buildRef(hero, missing, console.log); }
  }
  const refOf = (a) => { try { return JSON.parse(fs.readFileSync(path.join(dir, a, 'ref.json'), 'utf8')); } catch { return null; } };
  const targeted = (a) => /UNIT_TARGET|POINT/.test(refOf(a)?.numbers?.behavior || '');
  console.log(`ours: ${abilities.length} abilities (vite :${VITE_PORT}, chrome :${CDP_PORT})`);
  const ours = await captureOurs(hero, abilities, targeted, console.log);

  const W = PAD * 2 + 4 * FW + 3 * GAP, BH = TITLE + FH + SG + STRIP + SG + FH + BOTTOM;
  const C = new Canvas(W, TITLE + abilities.length * BH, BG);
  drawText(C, PAD, 4, `${hero} FX   OG DOTA 2 (TOP)  VS  OURS (BOTTOM)   T AFTER CAST 0.1 / 0.4 / 1.0 S + GAME CAMERA AT ${GAME_T} S`, LABEL, 1);
  let y = TITLE;
  for (const ab of abilities) {
    const adir = path.join(dir, ab), ref = noRef ? null : refOf(ab), og = noRef ? { imgs: {}, approx: true } : ogFrames(adir), shots = ours.get(ab) || {};
    fs.mkdirSync(adir, { recursive: true });
    for (const f of ['ours_1.png']) fs.rmSync(path.join(adir, f), { force: true });   // v1 name
    for (const s of SLOTS) if (shots[s]) fs.writeFileSync(path.join(adir, `ours_${s}.png`), shots[s]);
    C.rect(0, y, W, 1, '#2a3350');
    const roots = ref ? `${ref.mapping.roots.length} ROOTS  ${ref.systems.length} SYSTEMS  ${ref.mapping.source === 'precache' ? 'PRECACHE' : 'FOLDER MATCH'}` : '';
    drawText(C, PAD, y + 4, `${ab.replace(hero + '_', '').replace(/_/g, ' ')}`, LABEL, 1);
    drawText(C, PAD + 200, y + 4, `${(ref?.numbers?.behavior || '').replace(/DOTA_ABILITY_BEHAVIOR_/g, '').replace(/ /g, '')}   ${roots}${og.approx ? '   OG = CPU APPROXIMATION (NO CAP/)' : ''}`, og.approx ? WARN : DIM, 1);
    y += TITLE;
    SLOTS.forEach((s, k) => {
      const x = PAD + k * (FW + GAP), t = s === 'game' ? `GAME CAM T ${GAME_T}S` : `T ${s}S`;
      frame(C, x, y, og.imgs[s], `OG ${og.approx ? 'APPROXIMATION ' : ''}${t}`, og.approx ? WARN : OGC, og.approx && s === 'game' ? 'NO CAPTURE' : 'NO OG FRAME');
      frame(C, x, y + FH + SG + STRIP + SG, shots[s] ? decodePng(shots[s]) : null, `OURS ${t}`, LABEL, 'NO FXDEMO ENTRY');
    });
    y += FH + SG;
    (ref?.palette || []).slice(0, 8).forEach((h, i) => { C.rect(PAD + i * 52, y, 48, STRIP, h); });
    y += STRIP + SG + FH + BOTTOM;
  }
  const out = path.join(dir, 'sheet.png');
  fs.writeFileSync(out, encodePng(C.W, C.H, C.px));
  console.log(`${out}  ${C.W}x${C.H} (block ${W}x${BH})  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
