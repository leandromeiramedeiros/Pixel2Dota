// FX review sheet:   node tools/fx/view.mjs <hero> [ability ...] [--no-ref]      (npm run fx:view -- lina)
//   -> tools/.cache/ref/<hero>/fx/sheet.png (gitignored, PRIVATE: holds the Dota reference panels): per ability, the OG panel from tools/fx/ref.mjs
//      (og.png, built on demand) on top, OUR FX below at t = 0.1 / 0.4 / 1.0 s. Ours = client/src/fxdemo.js (__fx.fire) in the render sandbox, headless
//      Chrome (swiftshader), Ultra preset, day, fixed camera, sim paused + stepped at 30 Hz. Our frames are also kept as <ability>/ours_<t>.png.
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
const TIMES = [0.1, 0.4, 1.0], HZ = 30;
const VW = 960, VH = 540, CW = 480, CH = 270;          // viewport, sheet cell (screenshot scale 0.5)
const CAM = { x: -800, y: -700, dist: 1134 };          // fxdemo stages the caster at x-380, the enemy at x+260, the ally at (x-160, y-170)
const BG = '#14161f', LABEL = '#e0e6ff', DIM = '#8892b0';
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
    async shot() { const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: VW, height: VH, scale: CW / VW } }); return Buffer.from(r.result.data, 'base64'); },
    close() { try { ws.close(); } catch { /* closed */ } proc.kill(); setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 1500).unref(); },
  };
}

// In-page: Ultra, day, paused, units moved off the stage, camera fixed. Then per ability: fire, step to each t, screenshot.
const SETUP = `(async () => {
  for (let i = 0; i < 240 && !(window.__fx && window.__frame && window.__r); i++) await new Promise((r) => setTimeout(r, 250));
  if (!window.__fx) throw new Error('sandbox did not expose __fx');
  const Q = await import('/src/render/quality.js');
  Q.applyQuality(__r, 'ultra'); Q.applyOptions(__r, Q.levelOptions('ultra'));
  for (const id of ['hud', 'keys']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  window.__calm = true; window.__pause = true; __view.night = false; __r.setClock(150);
  const B = /tower|rax|ancient|fountain|building|shop|ward/;
  for (const u of __units.values()) if (!B.test(u.kind || '') && Math.hypot(u.x - (${CAM.x}), u.y - (${CAM.y})) < 1600) { u.x += 4000; u.goal = null; }
  __r.snapTarget(${CAM.x}, ${CAM.y}); __r.rig.distance = __r.rig.distanceGoal = ${CAM.dist};
  __frame(1 / ${HZ}, 4);
  return __fx.keys.length;
})()`;

/** Our frames for each ability: Map ability -> [png Buffer per TIMES]. One fresh page per ability (no FX left over from the previous one). */
async function captureOurs(hero, abilities, log) {
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
      const shots = []; let t = 0;
      for (const T of TIMES) {
        const n = Math.round((T - t) * HZ); t += n / HZ;
        await B.ev(`(__frame(1 / ${HZ}, ${n}), 1)`);
        await sleep(60);
        shots.push(await B.shot());
      }
      out.set(ab, shots);
      log(`  ${ab}: ${TIMES.join(' / ')} s`);
    }
    if (B.logs.length) log('page errors:\n  ' + [...new Set(B.logs)].slice(0, 8).join('\n  '));
  } finally { kill(); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- sheet
const pngC = (buf) => decodePng(buf);   // { W, H, rgba }: what Canvas.blit takes
async function main() {
  const args = process.argv.slice(2), noRef = args.includes('--no-ref'), pos = args.filter((a) => !a.startsWith('--'));
  const hero = pos[0];
  if (!hero) { console.error('usage: node tools/fx/view.mjs <hero> [ability ...] [--no-ref]'); process.exit(2); }
  let abilities = await ourAbilities(hero);
  if (pos.length > 1) abilities = abilities.filter((a) => pos.slice(1).some((p) => a === p || a === hero + '_' + p));
  const dir = path.join(CACHE, hero, 'fx'), t0 = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  // OG panels (tools/fx/ref.mjs), built when missing
  if (!noRef) {
    const missing = abilities.filter((a) => !fs.existsSync(path.join(dir, a, 'og.png')));
    if (missing.length) { console.log(`ref: ${missing.length} OG panel(s)`); await buildRef(hero, missing, console.log); }
  }
  console.log(`ours: ${abilities.length} abilities (vite :${VITE_PORT}, chrome :${CDP_PORT})`);
  const ours = await captureOurs(hero, abilities, console.log);
  const rows = [];
  for (const ab of abilities) {
    const og = !noRef && fs.existsSync(path.join(dir, ab, 'og.png')) ? pngC(fs.readFileSync(path.join(dir, ab, 'og.png'))) : null;
    const shots = (ours.get(ab) || []).map(pngC);
    fs.mkdirSync(path.join(dir, ab), { recursive: true });
    (ours.get(ab) || []).forEach((b, k) => fs.writeFileSync(path.join(dir, ab, `ours_${TIMES[k]}.png`), b));
    rows.push({ ab, og, shots });
  }
  const PAD = 10, GAP = 6, oursW = TIMES.length * CW + (TIMES.length - 1) * GAP;
  const W = PAD * 2 + Math.max(oursW, ...rows.map((r) => (r.og ? r.og.W : 0)));
  const rowH = (r) => 16 + (r.og ? r.og.H + 8 : 0) + 12 + CH + 14;
  const H = 22 + rows.reduce((s, r) => s + rowH(r), 0);
  const C = new Canvas(W, H, BG);
  drawText(C, PAD, 6, `${hero} FX  -  OG DOTA 2 (TOP)  VS  OURS (BOTTOM)   REF ONLY NEVER COMMIT`, '#ff8080', 2);
  let y = 22;
  for (const r of rows) {
    C.rect(0, y, W, 1, '#2a3350');
    drawText(C, PAD, y + 4, r.ab.replace(hero + '_', '').replace(/_/g, ' '), LABEL, 2); y += 16;
    if (r.og) { C.blit(r.og, PAD, y, 1); y += r.og.H + 8; }
    drawText(C, PAD, y, 'OURS  ' + TIMES.map((t) => `T ${t}S`).join('   ') + '   ULTRA  DAY  FIXED CAMERA', DIM, 1); y += 12;
    if (r.shots.length) r.shots.forEach((s, k) => C.blit(s, PAD + k * (CW + GAP), y, 1));
    else drawText(C, PAD, y + CH / 2, 'NO FXDEMO ENTRY', '#ff8080', 2);
    y += CH + 14;
  }
  const out = path.join(dir, 'sheet.png');
  fs.writeFileSync(out, encodePng(C.W, C.H, C.px));
  console.log(`${out}  ${W}x${H}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
