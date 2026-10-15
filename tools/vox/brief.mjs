// Compact brief for an agent about to build a voxel unit:   node tools/vox/brief.mjs <short>     (npm run vox:brief -- melee_radiant)
// Prints: reference paths + proportions + palette from tools/.cache/ref/<short>/ref.json (private, run `npm run vox:ref -- <short>` first),
// the grid / density class (docs/VOXEL.md), a rig guess, the kit (parts, rigs, materials, poses) to reach for, the files to add, the checklist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOX } from '../../shared/vox/index.js';
import { RIGS } from '../../shared/vox/rig.js';
import { MATS, TIERS, TIER_GAIN } from '../../shared/vox/mats.js';
import { LIBRARY } from '../../shared/vox/poses.js';
import { CACHE, shortOf, gameUnits, resolveUnit, RefError } from './lib/dota.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const arg = process.argv[2];
if (!arg) { console.error('usage: node tools/vox/brief.mjs <short>   (e.g. lina, melee_radiant, neutral_kobold; node tools/vox/ref.mjs list)'); process.exit(2); }

// ---- the unit: registry entry, ref.json, else the game KV
const reg = VOX[arg];
let short = reg ? arg : shortOf(arg), info = null, kind = reg?.kind, key = reg?.unit, err = '';
const refDir = path.join(CACHE, short), refJson = path.join(refDir, 'ref.json');
if (fs.existsSync(refJson)) info = JSON.parse(fs.readFileSync(refJson, 'utf8'));
if (!info) {
  try { const u = resolveUnit(arg); short = u.short; kind ??= u.kind; key ??= u.key; } catch (e) { if (!(e instanceof RefError)) throw e; err = e.message; }
} else { kind ??= info.kind; key ??= info.unit; short = info.short; }
kind ??= 'creep';

// ---- class table (docs/VOXEL.md "Grid and densities")
const CLASS = {
  hero: { grid: '34x30x48', h: '~44 voxels tall (Lina 42)', rig: 'biped' },
  creep: { grid: '~30x30x34', h: '25-29 voxels tall', rig: 'biped' },
  neutral: { grid: '30x30x34 small / larger for big, ancient', h: '25-40 voxels (smaller than a hero; ancients near one)', rig: 'biped' },
  boss: { grid: 'larger than a hero (~48x44x56)', h: '~50-55 voxels', rig: 'big' },
  building: { grid: 'tower ~3 heroes tall; fits its footprint', h: 'tower ~130 voxels at the 4.2 u density (check the grid budget first)', rig: 'static' },
}[kind] || {};
const hay = (key + ' ' + (info?.model || '')).toLowerCase();
const guess = /wolf|hound|boar|bear|ursa|lizard|raptor|hellbear|panther|spider|worg|jackal/.test(hay) ? 'quad'
  : /harpy|wisp|bat|bird|wyvern|dragon|gryphon|fly|hawk|owl|bee/.test(hay) ? 'flyer'
    : /golem|giant|ogre|roshan|ancient|troll_warlord|centaur|mammoth|behemoth/.test(hay) ? 'big' : CLASS.rig;
const L = [];
const out = s => L.push(s);

out(`BRIEF ${short}  (${kind}${key ? ', ' + key : ''})${reg ? '  [registered: shared/vox/index.js]' : '  [new]'}`);
out('');
out('REFERENCE (private visual reference: look, never copy, commit or voxelize it)');
if (info) {
  out(`  sheet   ${rel(path.join(refDir, 'sheet.png'))}   views: front q34 side back top .png next to it`);
  out(`  model   ${info.model}  scale ${info.modelScale}  ${info.tris} tris  pose ${info.pose}${info.wearables.length ? '  +' + info.wearables.length + ' wearables' : ''}`);
  const s = info.size, vh = s.height / 4.2;
  out(`  size    height ${s.height}  width ${s.width}  depth ${s.depth} game units  (true scale at 4.2 u/voxel: ${vh.toFixed(0)} tall)`);
  out(`  chibi   start at ${kind === 'hero' ? '44' : Math.round(vh * 0.9)} voxels tall (${kind === 'hero' ? 'fixed' : '0.9 x true'}); head ~40% of it, short legs, keep the signature parts oversized`);
  out(`  palette ${info.palette.join('  ')}`);
  out('  materials (share, top colours):');
  for (const m of info.materials.slice(0, 8)) out(`    ${m.name.padEnd(26)} ${String(m.share).padStart(5)}%  ${m.colors.join('  ')}`);
  out('  bands head -> feet (height share, width x depth, colours):');
  for (const b of info.bands.rows) out(`    ${String(Math.round(b.fromFeet[1] * 100)).padStart(3)}-${String(Math.round(b.fromFeet[0] * 100)).padEnd(3)}%  ${String(b.width).padStart(3)} x ${String(b.depth).padEnd(3)}  ${b.colors.join('  ')}`);
} else {
  out(`  none yet: run  npm run vox:ref -- ${short}  then read tools/.cache/ref/${short}/sheet.png and ref.json (this brief then adds proportions + palette)`);
  if (err) out(`  note: ${err}`);
}
out('');
out('CLASS (docs/VOXEL.md)');
out(`  density 4.2 world units / voxel (characters); size by voxel count, never scale unit.  grid ${CLASS.grid}; ${CLASS.h}`);
out(`  rig     ${guess}${guess === 'static' ? ' (META.rig "static": no rig, props / buildings; lean: false in VOX_UNITS)' : ''}  (guess from the name; confirm on the sheet)  classes: ${Object.keys(RIGS).join(' ')} static`);
out(`  faces -y, feet on z 0, centred on META.cx, cy; voxels must stay off the grid walls (weapon / wings in every pose).`);
out('');
out('KIT (read the sample model first: ' + (kind === 'hero' ? 'shared/vox/heroes/lina.js' : 'shared/vox/creeps/melee_radiant.js') + ')');
const src = fs.readFileSync(path.join(ROOT, 'shared/vox/parts.js'), 'utf8').split('\n'), parts = [];
src.forEach((l, i) => {
  const m = l.match(/^export (?:function (\w+)\(([^)]*)\)|const (\w+) = \(([^)]*)\) =>)/);
  if (m) { const doc = (src[i - 1] || '').match(/^\s*(?:\/\*\*|\/\/)\s*(.*?)\s*(?:\*\/)?$/); parts.push(`${m[1] || m[3]}(${(m[2] ?? m[4]).replace(/\s+/g, ' ')})${doc && !/^-+/.test(doc[1]) ? '  ' + doc[1].replace(/^(.{0,56})(\s.*)?$/, '$1') : ''}`); }
});
out('  parts.js:');
for (const p of parts) out('    ' + p);
const R = RIGS[guess] || RIGS.biped;
out(`  rig ${RIGS[guess] ? guess : 'biped'}: joints ${R.joints.join(' ')}
    sockets ${Object.keys(R.sockets).join(' ')}   (solve(cls, PROP, pose) -> { J, T, socket(name) }; other classes: ${Object.keys(RIGS).filter(c => c !== guess).join(' ')})`);
out(`  poses   LIBRARY[rig](opts) -> { ${Object.keys(LIBRARY[guess] ? LIBRARY[guess]() : LIBRARY.biped()).join(', ')} }; withPoses(anims, { attack: [{}, {...}, {}] }); channels in docs/VOXEL.md`);
out(`  mats    useMat(v, name, { from, ramp: [dark, mid, light, high], emit, tier, gain, team }); library: ${Object.keys(MATS).join(' ')}`);
out(`  tiers   ${TIERS.map(t => `${t} ${TIER_GAIN[t]}`).join(', ')} (default gains; per-model gain allowed, capped 0.5-1.8)`);
out(`  rules   ${kind === 'hero' ? 'one colour scheme (no team tint); ' : kind === 'creep' ? 'Radiant / Dire lane creeps are separate models (no team tint); ' : 'team: true only where the unit shows its side; '}emissive only for eyes + signature parts; hair = shell with a face window; likeness = a few signature params.`);
out('');
out('FILES');
const dir = kind === 'hero' ? 'heroes' : kind === 'building' ? 'buildings' : 'creeps';
out(`  1. shared/vox/${dir}/${short}.js   META { rig, grid, cx, cy }, build(pose) -> Vox, ANIMS { idle, walk, attack, cast?, stunned }  (copy the sample)`);
out(`  2. shared/vox/index.js             ${short}: { kind: '${kind}', unit: '${key || 'npc_dota_...'}', mod: ${short} },   (+ the import)`);
out('  after the director approves: VOX_UNITS in client/src/render/voxactors.js' + (kind === 'hero' ? ', portrait (npm run vox:portrait -- ' + short + ')' : '') + '.');
out('');
out('CHECKLIST');
out('  [ ] 3-4 signature reads written (what is recognizable at a glance), chibified: big head / signature parts, short legs');
out(`  [ ] npm run vox:check -- ${short}  passes (feet z 0, off the walls, tiers, mesh)`);
out(`  [ ] npm run vox:shot -- ${short} --small  looked at, max 3 fix rounds, then the full sheet (docs/voxel-chibi/${short}_vox.png)`);
out('  [ ] likeness of the Dota 2 unit at a glance; restraint (no noise, no whiteout bloom); proportions vs Lina in the true-size strip');
out('  [ ] full sheet sent to the creative director; never self-certify; no Valve data in shared/, client/ or any commit');
console.log(L.join('\n'));
