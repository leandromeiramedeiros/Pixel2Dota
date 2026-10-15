// Voxel unit checks:   node tools/vox/check.mjs <short|all>     (npm run vox:check -- melee_radiant)
//  1. Per model (registry shared/vox/index.js): META / ANIMS contract, every frame builds on its grid, feet on z = 0 (idle), nothing on the grid walls,
//     feet centred on cx, team voxels when META.team, emissive materials carry a valid tier.
//  2. Mesh: client/test/voxmesh.test.js for the model (every pose frame meshed: winding, footprint, emit gains, GPU bytes < 3 MB, eyes toward the front).
//  3. `all` only: rig classes solve (every default + library pose finite).
// Exit 1 on any failure.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VOX } from '../../shared/vox/index.js';
import { RIGS, solve } from '../../shared/vox/rig.js';
import { LIBRARY } from '../../shared/vox/poses.js';
import { TIERS } from '../../shared/vox/mats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KINDS = ['hero', 'creep', 'neutral', 'boss', 'building'];
const arg = process.argv[2];
if (!arg || (arg !== 'all' && !VOX[arg])) { console.error(`usage: node tools/vox/check.mjs <all|${Object.keys(VOX).join('|')}>`); process.exit(2); }
const names = arg === 'all' ? Object.keys(VOX) : [arg];
let fails = 0;
const report = (name, list) => { for (const m of list) console.error(`FAIL ${name}: ${m}`); fails += list.length; };

// ---- 1. kit contract per model
function kitCheck(name) {
  const { kind, mod } = VOX[name], fail = [], ok = (c, m) => { if (!c) fail.push(m); }, t0 = performance.now();
  const M = mod.META;
  ok(KINDS.includes(kind), `registry kind "${kind}" not in ${KINDS}`);
  ok(M && (M.rig === 'static' || RIGS[M.rig]), `META.rig "${M?.rig}" not a rig class (${Object.keys(RIGS)}, static)`);
  ok(M && Array.isArray(M.grid) && M.grid.length === 3 && Number.isFinite(M.cx) && Number.isFinite(M.cy), 'META needs { rig, grid: [X, Y, Z], cx, cy }');
  ok(typeof mod.build === 'function' && mod.ANIMS?.idle?.length, 'needs build(pose) and ANIMS.idle');
  if (fail.length) return report(name, fail);
  const { cx, cy, grid } = M; let frames = 0, h0 = 0, vox0 = 0;
  for (const [anim, poses] of Object.entries(mod.ANIMS)) poses.forEach((p, i) => {
    const v = mod.build(p), tag = `${anim}[${i}]`; frames++;
    ok(v.X === grid[0] && v.Y === grid[1] && v.Z === grid[2], `${tag}: grid ${v.X}x${v.Y}x${v.Z} differs from META.grid ${grid}`);
    let zmin = 1e9, zmax = 0, wall = 0, team = 0, nv = 0, sx = 0, nf = 0;
    for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) {
      const m = v.g[v.i(x, y, z)]; if (!m) continue; nv++;
      zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
      if (x === 0 || y === 0 || x === v.X - 1 || y === v.Y - 1 || z === v.Z - 1) wall++;
      if (v.mats[m].team) team++;
      if (z === 0) { sx += x + 0.5; nf++; }
    }
    ok(nv > 0, `${tag}: empty`);
    ok(anim === 'idle' ? zmin === 0 : zmin <= 3, `${tag}: feet not on z = 0 (min z ${zmin}; idle must be 0, a lifted foot in other frames <= 3)`);
    ok(wall === 0, `${tag}: ${wall} voxels on the grid walls (clipped; enlarge the grid)`);
    if (M.team) ok(team > 0, `${tag}: META.team but no team voxels`);
    if (nf) ok(Math.abs(sx / nf - cx) < 2.5, `${tag}: feet centre x ${(sx / nf).toFixed(1)} far from cx ${cx}`);
    for (const m of v.mats.slice(1)) if (m.emit) ok(TIERS.includes(m.tier), `${tag}: emissive ${m.name} without a valid tier (${TIERS})`);
    if (anim === 'idle' && i === 0) { h0 = zmax + 1; vox0 = nv; }
  });
  console.log(`${name.padEnd(16)} ${kind.padEnd(8)} rig ${M.rig.padEnd(6)} grid ${grid.join('x')}  height ${h0}  voxels ${vox0}  frames ${frames}  ${Math.round(performance.now() - t0)} ms`);
  report(name, fail);
}
for (const n of names) kitCheck(n);

// ---- 2. mesher (the CI test, narrowed to this model)
if (!fails) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, ['--test', 'client/test/voxmesh.test.js'], { cwd: ROOT, env: { ...process.env, ...(arg === 'all' ? {} : { VOX_ONLY: arg }) }, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/ℹ pass (\d+)/), f = out.match(/ℹ fail (\d+)/);
  console.log(`mesh: ${m ? m[1] : '?'} passed, ${f ? f[1] : '?'} failed  ${Math.round(performance.now() - t0)} ms`);
  if (r.status !== 0) { console.error(out.split('\n').filter(l => /not ok|Error|error|✖|expected|actual|at /.test(l)).slice(0, 30).join('\n')); fails++; }
}

// ---- 3. rig classes
if (arg === 'all') {
  const finite = J => Object.values(J).every(p => p.every(Number.isFinite)), bad = [];
  for (const cls of Object.keys(RIGS)) {
    const r = solve(cls); let n = 0;
    if (!finite(r.J)) bad.push(`${cls}: default pose has non-finite joints`);
    if (!RIGS[cls].joints.every(j => r.J[j])) bad.push(`${cls}: joints missing ${RIGS[cls].joints.filter(j => !r.J[j])}`);
    if (!Object.keys(RIGS[cls].sockets).every(s => r.socket(s).p)) bad.push(`${cls}: socket without a joint`);
    for (const poses of Object.values(LIBRARY[cls]())) for (const p of poses) { if (!finite(solve(cls, {}, p).J)) bad.push(`${cls}: library pose ${JSON.stringify(p)} non-finite`); n++; }
    console.log(`rig ${cls.padEnd(6)} joints ${RIGS[cls].joints.length}  library poses ${n}`);
  }
  report('rigs', bad);

}

if (fails) { console.error(`FAIL: ${fails} problem(s)`); process.exit(1); }
console.log('OK: all assertions passed');
