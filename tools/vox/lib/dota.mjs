// Unit key / short name -> model files of the LOCAL Dota 2 install, and the Source2Viewer-CLI glb export (cached under tools/.cache/ref/_export/).
// Private visual reference only: nothing from here may reach shared/, client/ or any committed file (docs/VOXEL.md, test/legal.test.js).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseKV } from '../../vdf.mjs';
import { openVpk, DOTA_DIR } from '../../vpk.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const CACHE = path.join(ROOT, 'tools', '.cache', 'ref');
const S2V = [path.join(ROOT, 'tools/.cache/s2v/bin/Source2Viewer-CLI.exe'), path.join(ROOT, 'tools/.cache/s2v/bin/Source2Viewer-CLI')];
export class RefError extends Error {}

let _pak = null;
export function pak() {
  if (_pak) return _pak;
  const f = path.join(DOTA_DIR, 'game/dota/pak01_dir.vpk');
  if (!fs.existsSync(f)) throw new RefError(`no Dota 2 install at ${DOTA_DIR} (set DOTA_DIR to the "dota 2 beta" folder)`);
  return (_pak = openVpk(f));
}
const kvCache = {};
const kv = file => (kvCache[file] ||= parseKV(pak().readText(file)));

// ---- naming: the FULL game roster from the game KV + short names
const OVERRIDE = { observer_wards: 'ward_observer', sentry_wards: 'ward_sentry', watch_tower: 'outpost', flying_courier: 'courier_flying', dota_fountain: 'fountain' };
/** npc_dota_* key -> short ("npc_dota_creep_goodguys_melee" -> melee_radiant, "npc_dota_neutral_kobold" -> neutral_kobold, "npc_dota_goodguys_tower1_top" -> tower1_top_radiant). */
export function shortOf(key) {
  if (key.startsWith('npc_dota_hero_')) return key.slice(14);
  let s = key.replace(/^npc_dota_/, '').replace(/^creep_/, ''), team = '';
  const m = s.match(/^(goodguys|badguys)_(.*)$/);
  if (m) { team = m[1] === 'goodguys' ? '_radiant' : '_dire'; s = m[2]; }
  return (OVERRIDE[s] || s) + team;
}
const kindOf = key => /_hero_/.test(key) ? 'hero' : /neutral/.test(key) ? 'neutral' : /roshan/.test(key) ? 'boss' : /courier/.test(key) ? 'courier' : /ward/.test(key) ? 'ward'
  : /tower|rax|fort|fountain|outpost/.test(key) ? 'building' : 'creep';
export const KINDS = ['hero', 'creep', 'neutral', 'boss', 'courier', 'ward', 'building', 'prop'];
// npc_units.txt keys that belong to the roster: lane creeps + siege (both teams, upgraded / mega), neutrals, Roshan, couriers, wards, buildings
const UNIT_KEYS = /^(npc_dota_creep_(goodguys|badguys)_(melee|ranged|flagbearer)(_upgraded(_mega)?)?|npc_dota_(goodguys|badguys)_siege(_upgraded(_mega)?)?|npc_dota_neutral_(?!default)\w+|npc_dota_roshan|npc_dota_(flying_)?courier|npc_dota_(observer|sentry)_wards|npc_dota_(goodguys|badguys)_(tower\d(_top|_mid|_bot)?|(melee|range)_rax_(top|mid|bot)|fort)|npc_dota_watch_tower|dota_fountain)$/;
// map props with no KV unit (shops, the Radiant fountain); listed only when the model exists in the pak
const PROPS = {
  fountain_radiant: 'models/props_structures/radiant_fountain002.vmdl',
  shop_radiant: 'models/props_structures/good_shop001.vmdl', shop_dire: 'models/props_structures/bad_shop001.vmdl',
  shop_base_radiant: 'models/props_structures/good_base_shop001.vmdl', shop_base_dire: 'models/props_structures/bad_base_shop001.vmdl',
  shop_side_radiant: 'models/props_structures/sideshop_radiant001.vmdl', shop_side_dire: 'models/props_structures/sideshop_right001.vmdl',
  shop_secret_radiant: 'models/props_structures/secretshop_radiant001.vmdl', shop_secret_dire: 'models/props_structures/secretshop_dire001.vmdl',
};
// WORLD props (static map decoration): prop_<group>_<name>_<radiant|dire|any>. The trees, cattails and lily pads are the models the default map places
// (default_ents.vents: pines / oaks / bamboo = Radiant, dire_tree* = Dire); the rest is the matching cliff / rock / clutter set of the same pak dirs. Model paths only.
const dirOf = d => m => 'models/' + d + '/' + m + '.vmdl';
const [tree, nat, rock, deb, str] = ['props_tree', 'props_nature', 'props_rock', 'props_debris', 'props_structures'].map(dirOf);
export const WORLD_PROPS = {
  // trees (Radiant: pine / oak / bamboo; Dire: dead / twisted) + stumps
  prop_tree_pine01_radiant: tree('tree_pine_01'), prop_tree_pine02_radiant: tree('tree_pine_02'), prop_tree_pine03_radiant: tree('tree_pine_03b'),
  prop_tree_oak01_radiant: tree('tree_oak_01'), prop_tree_oak01b_radiant: tree('tree_oak_01b'), prop_tree_oak02_radiant: tree('tree_oak_02'),
  prop_tree_bamboo01_radiant: tree('tree_bamboo_01'), prop_tree_bamboo02_radiant: tree('tree_bamboo_02'), prop_tree_stump_radiant: tree('tree_stump001'),
  prop_tree_dire004_dire: tree('dire_tree004'), prop_tree_dire004b_dire: tree('dire_tree004b'), prop_tree_dire007_dire: tree('dire_tree007'), prop_tree_dire008_dire: tree('dire_tree008'),
  prop_tree_dead01_dire: tree('tree_dead_01'), prop_tree_dead02_dire: tree('tree_dead_02'), prop_tree_gnarly_dire: tree('tree_gnarly001'), prop_tree_split_dire: tree('tree_split001'),
  prop_tree_stump01_dire: tree('dire_tree_stump001_tintable'), prop_tree_stump02_dire: tree('dire_tree_stump002_tintable'), prop_tree_root_dire: tree('root001'),
  // cliffs, rock walls, rocks
  prop_cliff_wall001_any: nat('cliff_wall001'), prop_cliff_wall002_any: nat('cliff_wall002'), prop_cliff_wall003_any: nat('cliff_wall003'), prop_cliff_wall004_any: nat('cliff_wall004'),
  prop_cliff_rock001_any: nat('cliff_rock001'),
  prop_cliff_edgewall001_radiant: rock('riveredge_rock_wall001a'), prop_cliff_edgewall003_radiant: rock('riveredge_rock_wall003a'),
  prop_rock_land001_radiant: rock('land_rock001a'), prop_rock_land002_radiant: rock('land_rock002a'), prop_rock_land003_radiant: rock('land_rock003a'),
  prop_rock_river001_radiant: rock('riveredge_rock001a'), prop_rock_cluster01_radiant: rock('small_rock_cluster_01'),
  prop_rock_badside001_dire: rock('badside_rocks001'), prop_rock_badside002_dire: rock('badside_rocks002'), prop_rock_badside004_dire: rock('badside_rocks004'),
  prop_rock_badside006_dire: rock('badside_rocks006'), prop_rock_crystal_dire: rock('crystal_01'),
  // clutter
  prop_bush_00_radiant: nat('bush_00'), prop_bush_01_radiant: nat('bush_01'), prop_fern001_radiant: nat('fern001'),
  prop_flowers001_radiant: nat('flowers001'), prop_grass_00a_radiant: nat('grass_clump_00a'),
  prop_mushroom_wild001_radiant: nat('mushroom_wild001'), prop_mushroom_morel_radiant: nat('mushroom_morel'), prop_log001_radiant: nat('log001'), prop_log002_radiant: nat('log002'),
  prop_plant001_radiant: nat('plant001'),
  prop_roots_path_dire: nat('badside_roots_path001'), prop_roots_barracks_dire: nat('bad_barracks_roots001'), prop_skeleton_dire: deb('skeleton001'),
  prop_spikefence_dire: deb('spike_fence001a'), prop_torch_dire: str('bad_column_torch'), prop_column_dire: str('dire_column001'),
  prop_barrel001_any: deb('barrel001'), prop_barrel002_any: deb('barrel002'), prop_basket_any: deb('basket001'), prop_claypot_any: deb('clay_pot001'), prop_wagon_any: deb('wagon001'),
  prop_fence_radiant: str('fence001'), prop_torch_radiant: str('torch001'), prop_column_radiant: str('good_column002'), prop_statue_radiant: str('radiant_statue001'),
  prop_campfire_any: deb('camp_fire001'),
  // water edge
  prop_water_cattails001_any: nat('cattails001'), prop_water_cattails002_any: nat('cattails002'), prop_water_lilypads_any: nat('lily_pads001'), prop_water_lilyflower_any: nat('lily_flower00'),
  prop_water_rocks001_any: nat('river_rocks001'),
};
let _units = null;
/** Every unit of the game: [{ short, key, kind }] (heroes from scripts/npc/heroes/*.txt, the rest from npc_units.txt + a few props). */
export function gameUnits() {
  if (_units) return _units;
  const out = [];
  for (const f of pak().list(/^scripts\/npc\/heroes\/npc_dota_hero_\w+\.txt$/).sort()) {
    const key = f.match(/(npc_dota_hero_\w+)\.txt$/)[1];
    if (key !== 'npc_dota_hero_base') out.push({ short: shortOf(key), key, kind: 'hero' });
  }
  const U = kv('scripts/npc/npc_units.txt').DOTAUnits;
  for (const key of Object.keys(U).filter(k => UNIT_KEYS.test(k) && U[k].Model).sort()) out.push({ short: shortOf(key), key, kind: kindOf(key) });
  for (const [short, model] of Object.entries(PROPS)) if (pak().entries.has(model + '_c')) out.push({ short, key: short, kind: 'building' });
  for (const [short, model] of Object.entries(WORLD_PROPS)) if (pak().entries.has(model + '_c')) out.push({ short, key: short, kind: 'prop' });
  return (_units = out);
}

/** Resolve "lina" | "melee_radiant" | "npc_dota_creep_badguys_melee" -> { short, key, kind, model, scale, wearables: [vmdl] }. */
export function resolveUnit(arg) {
  const set = gameUnits(), hit = set.find(u => u.short === arg || u.key === arg);
  if (hit && (PROPS[hit.key] || WORLD_PROPS[hit.key])) return { short: hit.short, key: hit.key, kind: hit.kind, model: PROPS[hit.key] || WORLD_PROPS[hit.key], scale: 1, wearables: [] };
  let key = hit?.key || arg, kind = hit?.kind;
  const heroKV = key.startsWith('npc_dota_hero_') ? (() => { try { return kv(`scripts/npc/heroes/${key}.txt`).DOTAHeroes[key]; } catch { return null; } })() : null;
  const unitKV = heroKV ? null : kv('scripts/npc/npc_units.txt').DOTAUnits[key] || kv('scripts/npc/npc_units.txt').DOTAUnits['npc_dota_' + key];
  if (!heroKV && !unitKV) throw new RefError(`unknown unit "${arg}" (try: node tools/vox/ref.mjs list)`);
  if (unitKV && !hit) key = kv('scripts/npc/npc_units.txt').DOTAUnits[key] ? key : 'npc_dota_' + key;
  const d = heroKV || unitKV;
  const model = d.Model;
  if (!model) throw new RefError(`${key}: no Model in the game KV`);
  const wearables = [];
  if (heroKV) {
    const items = kv('scripts/items/items_game.txt').items_game.items;
    for (const id of Object.keys(items)) {
      const it = items[id];
      if (it.prefab === 'default_item' && it.model_player && !/persona/.test(it.item_slot || '') && typeof it.used_by_heroes === 'object' && it.used_by_heroes[key]) wearables.push(it.model_player);
    }
  } else {
    const aw = d.Creature?.AttachWearables;
    if (aw && typeof aw === 'object') {
      const items = kv('scripts/items/items_game.txt').items_game.items;
      for (const w of Object.values(aw)) { const it = items[w.ItemDef]; if (it?.model_player) wearables.push(it.model_player); }
    }
  }
  return { short: hit?.short || shortOf(key), key, kind: kind || kindOf(key), model, scale: parseFloat(d.ModelScale) || 1, wearables };
}

// ---- Source2Viewer export
function s2v() {
  const f = S2V.find(fs.existsSync);
  if (!f) throw new RefError('Source2Viewer-CLI missing in tools/.cache/s2v/bin (ValveResourceFormat cli-windows-x64, see tools/world/extract.mjs header)');
  return f;
}
const slug = m => m.replace(/^models\//, '').replace(/\.vmdl$/, '').replace(/[^a-z0-9]+/gi, '_');
/** Run Source2Viewer-CLI with args -> stdout Buffer (stderr dropped). Also used by tools/fx (particle KV3 + texture decode). */
export const run = args => execFileSync(s2v(), args, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000, maxBuffer: 256 << 20 });
export const VPK = () => path.join(DOTA_DIR, 'game/dota/pak01_dir.vpk');
const modelDir = vmdl => path.join(CACHE, '_export', slug(vmdl));

/**
 * The model's sequences (embedded ASEQ block): [{ name, loop, acts: [ACT_DOTA_*], mods: [modifier names], weight }]; cached as seq.json.
 * A sequence is what the game plays for an activity (ACT_DOTA_IDLE / RUN / ATTACK / CAST_ABILITY_n / DISABLED / DIE) plus modifiers.
 */
export function sequences(vmdl, isStatic = false) {
  if (isStatic) return [];   // world props: static, no anims wanted (skips the ASEQ read)
  const f = path.join(modelDir(vmdl), 'seq.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let txt = '', failed = false;
  try { txt = run(['-i', VPK(), '-f', vmdl + '_c', '-b', 'ASEQ']).toString('utf8'); } catch { failed = true; /* no ASEQ block (static model) or a failed read */ }
  const seqs = [], i0 = txt.indexOf('m_localS1SeqDescArray');
  if (i0 >= 0) for (const ch of txt.slice(i0).split(/\n\t\t\{\n\t\t\tm_sName = "/).slice(1)) {
    const name = ch.slice(0, ch.indexOf('"')), at = ch.indexOf('m_activityArray'), loop = /m_bLooping = true/.test(ch);
    const acts = [], mods = []; let weight = 1;
    for (const m of (at >= 0 ? ch.slice(at) : '').matchAll(/m_name = "([^"]+)"[\s\S]*?m_nWeight = (\d+)/g)) { if (m[1].startsWith('ACT_')) { acts.push(m[1]); weight = +m[2]; } else mods.push(m[1]); }
    seqs.push({ name, loop, acts, mods, weight });
  }
  if (failed && !seqs.length) return seqs;   // never cache a failed read (a cold first run left heroes with no anims for good)
  fs.mkdirSync(modelDir(vmdl), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(seqs));
  return seqs;
}

/** The model's skeleton { names, parent } (DATA block m_modelSkeleton); cached as skel.json. Wearable meshes index it with JOINTS_0. */
export function skeleton(vmdl) {
  const f = path.join(modelDir(vmdl), 'skel.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let txt = ''; try { txt = run(['-i', VPK(), '-f', vmdl + '_c', '-b', 'DATA']).toString('utf8'); } catch { /* none */ }
  const at = txt.indexOf('m_modelSkeleton'), blk = at >= 0 ? txt.slice(at) : '';
  const arr = k => blk.match(new RegExp(k + ' = \\s*\\[([^\\]]*)\\]'))?.[1] || '';
  const names = [...arr('m_boneName').matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const parent = arr('m_nParent').split(',').map(x => parseInt(x)).filter(x => !isNaN(x));
  const out = { names, parent };
  fs.mkdirSync(modelDir(vmdl), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(out));
  return out;
}

/** Roles of the reference sheets -> the sequence the game plays: { idle, run, attack, cast, ult?, stunned, death } -> { seq, act, loop } (only roles the model has). */
export function pickAnims(seqs) {
  const best = test => {   // fewest modifiers, then highest weight, then first
    let b = null;
    seqs.forEach((q, i) => {
      if (q.name.startsWith('@')) return;
      const a = q.acts.find(test); if (!a) return;
      const sc = [q.mods.length, -q.weight, i];
      if (!b || sc[0] < b.sc[0] || (sc[0] === b.sc[0] && (sc[1] < b.sc[1] || (sc[1] === b.sc[1] && sc[2] < b.sc[2])))) b = { sc, seq: q.name, act: a, loop: q.loop };
    });
    return b && { seq: b.seq, act: b.act, loop: b.loop };
  };
  const out = {}, put = (role, v) => { if (v) out[role] = v; };
  put('idle', best(a => a === 'ACT_DOTA_IDLE')); put('run', best(a => a === 'ACT_DOTA_RUN')); put('attack', best(a => a === 'ACT_DOTA_ATTACK'));
  const casts = [...new Set(seqs.flatMap(q => q.acts).map(a => a.match(/^ACT_DOTA_CAST_ABILITY_(\d)$/)?.[1]).filter(Boolean))].map(Number).sort();
  if (casts.length) { put('cast', best(a => a === 'ACT_DOTA_CAST_ABILITY_' + casts[0])); if (casts.length > 1) put('ult', best(a => a === 'ACT_DOTA_CAST_ABILITY_' + casts.at(-1))); }
  put('stunned', best(a => a === 'ACT_DOTA_DISABLED')); put('death', best(a => a === 'ACT_DOTA_DIE'));
  return out;
}

/**
 * Export a vmdl to <cache>/_export/<slug>/<tag>.glb (+ textures); cached. `anims` = sequence names to include (none: no animations, e.g. wearables).
 * Returns the glb path.
 */
export function exportModel(vmdl, anims = []) {
  const entry = vmdl + '_c';
  if (!pak().entries.has(entry)) throw new RefError(`model not in pak01_dir.vpk: ${vmdl}`);
  const dir = modelDir(vmdl), names = [...new Set(anims)].sort();
  const tag = names.length ? 'a_' + crypto.createHash('md5').update(names.join(',')).digest('hex').slice(0, 8) : 'm', glb = path.join(dir, tag + '.glb');
  if (fs.existsSync(glb)) return glb;
  fs.mkdirSync(dir, { recursive: true });
  try {
    run(['-i', VPK(), '-f', entry, '-o', glb, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials', ...(names.length ? ['--gltf_export_animations', '--gltf_animation_list', names.join(',')] : [])]);
  } catch (e) { if (!fs.existsSync(glb)) throw new RefError(`Source2Viewer export failed for ${vmdl}: ${e.message.split('\n')[0]}`); }
  if (!fs.existsSync(glb)) throw new RefError(`Source2Viewer wrote no glb for ${vmdl}`);
  for (const f of fs.readdirSync(dir)) if (/_physics\.glb$/.test(f)) fs.rmSync(path.join(dir, f));
  return glb;
}
