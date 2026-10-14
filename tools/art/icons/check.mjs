// Validates icons.js + fx.js: rows/palette/keys/coverage. Run: node tools/art/icons/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = async p => (await import(pathToFileURL(path.join(ROOT, p)).href)).default;
const errs = [];
const err = m => errs.push(m);

function checkSheet(name, sh, size) {
  if (!sh.pal || !sh.frames) return err(`${name}: missing pal/frames`);
  for (const [c, h] of Object.entries(sh.pal)) if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) err(`${name}: bad colour ${c}=${h}`);
  for (const [c, e] of Object.entries(sh.emit || {})) { if (!(c in sh.pal)) err(`${name}: emit char not in pal ${c}`); if (!(e > 0)) err(`${name}: bad emit ${c}`); }
  const used = new Set();
  for (const [k, rows] of Object.entries(sh.frames)) {
    if (!Array.isArray(rows) || !rows.length) { err(`${name}.${k}: no rows`); continue; }
    const w = [...rows[0]].length;
    if (size && (rows.length !== size || w !== size)) err(`${name}.${k}: ${w}x${rows.length}, expected ${size}x${size}`);
    rows.forEach((r, y) => { const a = [...r]; if (a.length !== w) err(`${name}.${k}: row ${y} width ${a.length} != ${w}`); for (const ch of a) { if (ch === '.') continue; used.add(ch); if (!(ch in sh.pal)) err(`${name}.${k}: char ${JSON.stringify(ch)} not in pal`); } });
  }
  for (const c of Object.keys(sh.pal)) if (!used.has(c)) err(`${name}: unused palette char ${JSON.stringify(c)}`);
}

const icons = await imp('client/src/art/sheets/icons.js');
const fx = await imp('client/src/art/sheets/fx.js');
checkSheet('icons', icons, 20); checkSheet('fx', fx, 0);

const { HEROES } = await import(pathToFileURL(path.join(ROOT, 'shared/heroes.js')).href);
const need = new Set(['gold', 'lock', 'empty', 'attr_str', 'attr_agi', 'attr_int', 'attr_all', 'skillpoint', 'item_recipe']);
for (const h of Object.values(HEROES)) { h.abilities.forEach(a => need.add(a)); (h.invoked || []).forEach(a => need.add(a)); }
const dec = fs.readFileSync(path.join(ROOT, 'docs/DECISIONS.md'), 'utf8');
const sec = dec.split('## Items (simple set)')[1].split('\n## ')[0];
for (const line of sec.split('\n').filter(l => /^(Consumables|Basics|Built):/.test(l)))
  line.split(':')[1].replace(/\(.*?\)/g, '').split(',').map(s => s.trim().replace(/\.$/, '')).filter(Boolean).forEach(k => need.add('item_' + k));
for (const k of need) if (!icons.frames[k]) err(`icons: missing ${k}`);

const fxNeed = ['arrow_frost', 'bullet', 'fireball', 'storm_hammer', 'creep_ranged_r', 'creep_ranged_d', 'tower_r', 'tower_d', 'invoker_orb_q', 'invoker_orb_w', 'invoker_orb_e', 'assassinate_bullet', 'magic_missile',
  'p_spark', 'p_ember', 'p_snow', 'p_smoke_0', 'p_smoke_1', 'p_smoke_2', 'p_smoke_3', 'p_ring', 'p_star', 'p_shard_ice', 'p_bolt_0', 'p_bolt_1', 'p_bolt_2', 'p_leaf', 'p_glow', 'p_hit_0', 'p_hit_1', 'p_hit_2', 'p_hit_3', 'p_coin', 'decal_scorch', 'decal_frost', 'decal_ring_target'];
for (const k of fxNeed) if (!fx.frames[k]) err(`fx: missing ${k}`);

console.log(`icons: ${Object.keys(icons.frames).length} frames, ${Object.keys(icons.pal).length} colours; need ${need.size}`);
console.log(`fx: ${Object.keys(fx.frames).length} frames, ${Object.keys(fx.pal).length} colours, ${Object.keys(fx.emit || {}).length} emit`);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
