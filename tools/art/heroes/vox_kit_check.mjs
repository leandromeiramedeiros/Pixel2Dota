// Voxel kit check (node tools/art/heroes/vox_kit_check.mjs):
//  1. Lina equivalence: the kit port (shared/vox/heroes/lina.js) vs the frozen hand-built original (lina_vox_ref.mjs), every ANIMS frame:
//     voxel diff by material name, material defs (ramp / emit / noShadow), and a render diff with the showcase camera (lina_vox_shot.mjs).
//  2. Kit models (creeps): every frame builds, feet on z = 0, nothing touches the grid walls, team voxels present (META.team), emissive tiers valid.
//  3. Rig classes: every class solves its default pose and every library pose to finite joints.
import { renderVox } from '../vox.mjs';
import { build as buildLina, ANIMS } from '../../../shared/vox/heroes/lina.js';
import * as linaShim from '../../../shared/vox/lina.js';
import { buildLina as buildRef, ANIMS as REF_ANIMS } from './lina_vox_ref.mjs';
import * as meleeRadiant from '../../../shared/vox/creeps/melee_radiant.js';
import * as meleeDire from '../../../shared/vox/creeps/melee_dire.js';
import { RIGS, solve } from '../../../shared/vox/rig.js';
import { LIBRARY } from '../../../shared/vox/poses.js';
import { TIERS } from '../../../shared/vox/mats.js';

const fail = [], ok = (c, msg) => { if (!c) fail.push(msg); };
const CAM = { yaw: 28, pitch: 30, scale: 2, W: 110, H: 124, center: [17, 15, 19], ss: 3 };   // lina_vox_shot.mjs showcase camera, no terrain
const def = m => JSON.stringify([m.ramp || null, m.emit || null, !!m.noShadow]);

// ---- 1. Lina old vs new
ok(JSON.stringify(ANIMS) === JSON.stringify(REF_ANIMS), 'Lina ANIMS differ from the reference');
ok(linaShim.buildLina === buildLina && linaShim.ANIMS === ANIMS, 'shared/vox/lina.js must re-export the kit Lina');
let total = 0, totalPx = 0;
for (const [anim, poses] of Object.entries(ANIMS)) poses.forEach((p, i) => {
  const a = buildRef(p), b = buildLina(p), tag = `${anim}[${i}]`;
  ok(a.X === b.X && a.Y === b.Y && a.Z === b.Z, `${tag}: grid size`);
  for (const m of a.mats.slice(1)) { const n = b.ids.get(m.name); ok(n && def(b.mats[n]) === def(m), `${tag}: material ${m.name} differs`); }
  let diff = 0, nv = 0;
  for (let k = 0; k < a.g.length; k++) { const na = a.mats[a.g[k]]?.name ?? '', nb = b.mats[b.g[k]]?.name ?? ''; if (na) nv++; if (na !== nb) diff++; }
  const ra = renderVox(a, CAM).rgba, rb = renderVox(b, CAM).rgba;
  let px = 0; for (let k = 0; k < ra.length; k += 4) if (ra[k] !== rb[k] || ra[k + 1] !== rb[k + 1] || ra[k + 2] !== rb[k + 2]) px++;
  console.log(`lina ${tag.padEnd(11)} voxels ${String(nv).padStart(5)}  voxel diff ${diff}  render px diff ${px}`);
  total += diff; totalPx += px;
});
ok(total === 0 && totalPx === 0, `Lina differs from the reference: ${total} voxels, ${totalPx} px`);

// ---- 2. kit models
for (const [name, mod] of Object.entries({ meleeRadiant, meleeDire })) {
  const { cx, cy } = mod.META;
  for (const [anim, poses] of Object.entries(mod.ANIMS)) poses.forEach((p, i) => {
    const v = mod.build(p), tag = `${name} ${anim}[${i}]`;
    let zmin = 1e9, wall = 0, team = 0, nv = 0, sx = 0, sy = 0, nf = 0;
    for (let z = 0; z < v.Z; z++) for (let y = 0; y < v.Y; y++) for (let x = 0; x < v.X; x++) {
      const m = v.g[v.i(x, y, z)]; if (!m) continue; nv++;
      zmin = Math.min(zmin, z); if (x === 0 || y === 0 || x === v.X - 1 || y === v.Y - 1 || z === v.Z - 1) wall++;
      if (v.mats[m].team) team++;
      if (z === 0) { sx += x + 0.5; sy += y + 0.5; nf++; }
    }
    ok(zmin === 0, `${tag}: feet not on z = 0 (min z ${zmin})`);
    ok(wall === 0, `${tag}: ${wall} voxels on the grid walls (clipped)`);
    if (mod.META.team) ok(team > 0, `${tag}: no team voxels`);   // team-tinted models only (lane melee creeps are two models)
    ok(Math.abs(sx / nf - cx) < 2.5, `${tag}: feet centre x ${(sx / nf).toFixed(1)} far from cx ${cx}`);
    for (const m of v.mats.slice(1)) if (m.emit) ok(TIERS.includes(m.tier), `${tag}: emissive ${m.name} without a valid tier`);
    let zmax = 0; for (let k = 0; k < v.g.length; k++) if (v.g[k]) zmax = Math.max(zmax, Math.floor(k / (v.X * v.Y)));
    if (i === 0) console.log(`${tag.padEnd(22)} height ${zmax + 1}  voxels ${nv}  team ${team}  feet centre (${(sx / nf).toFixed(1)}, ${(sy / nf).toFixed(1)})`);
  });
}

// ---- 3. rig classes
const finite = J => Object.values(J).every(p => p.every(Number.isFinite));
for (const cls of Object.keys(RIGS)) {
  const r = solve(cls);
  ok(finite(r.J), `${cls}: default pose has non-finite joints`);
  ok(RIGS[cls].joints.every(j => r.J[j]), `${cls}: joints missing ${RIGS[cls].joints.filter(j => !r.J[j])}`);
  ok(Object.keys(RIGS[cls].sockets).every(s => r.socket(s).p), `${cls}: socket without a joint`);
  let n = 0;
  for (const poses of Object.values(LIBRARY[cls]())) for (const p of poses) { ok(finite(solve(cls, {}, p).J), `${cls}: library pose ${JSON.stringify(p)} non-finite`); n++; }
  console.log(`rig ${cls.padEnd(6)} joints ${RIGS[cls].joints.length}  library poses ${n}`);
}

if (fail.length) { console.error('FAIL\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('OK: all assertions passed');
