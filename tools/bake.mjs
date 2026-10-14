// Bake Dota 2 KV data from the LOCAL install into shared/data/{heroes,abilities,items,units,meta}.js.
// Usage: node tools/bake.mjs        (npm run bake)   env DOTA_DIR overrides the install dir (see vpk.mjs)
// Reads through tools/vpk.mjs (pak01_dir.vpk) and parses KV with tools/vdf.mjs. Output is deterministic (keys sorted).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKV } from './vdf.mjs';
import { dotaPak, DOTA_DIR } from './vpk.mjs';
import { HEROES, HERO_KEYS } from '../shared/heroes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shared', 'data');

// Items the game uses (docs/DECISIONS.md). Recipe parts are pulled in automatically.
const ITEM_NAMES = [
  'tango', 'flask', 'clarity', 'faerie_fire', 'enchanted_mango', 'tpscroll',
  'branches', 'gauntlets', 'slippers', 'mantle', 'circlet', 'ring_of_protection', 'quelling_blade', 'blades_of_attack', 'broadsword',
  'claymore', 'chainmail', 'ogre_axe', 'mithril_hammer', 'blade_of_alacrity', 'staff_of_wizardry', 'boots', 'gloves', 'ring_of_regen',
  'sobi_mask', 'belt_of_strength', 'boots_of_elves', 'robe', 'magic_stick',
  'magic_wand', 'bracer', 'wraith_band', 'null_talisman', 'phase_boots', 'power_treads', 'lesser_crit', 'black_king_bar', 'blink',
].map((n) => 'item_' + n);

// Engine hull radii (not in KV): documented Dota values.
const HULL = { DOTA_HULL_SIZE_SMALL: 8, DOTA_HULL_SIZE_REGULAR: 16, DOTA_HULL_SIZE_SIEGE: 16, DOTA_HULL_SIZE_HERO: 24,
  DOTA_HULL_SIZE_HUGE: 80, DOTA_HULL_SIZE_BUILDING: 144, DOTA_HULL_SIZE_FILLER: 96, DOTA_HULL_SIZE_BARRACKS: 144, DOTA_HULL_SIZE_TOWER: 144 };

const ATTR = { DOTA_ATTRIBUTE_STRENGTH: 'str', DOTA_ATTRIBUTE_AGILITY: 'agi', DOTA_ATTRIBUTE_INTELLECT: 'int', DOTA_ATTRIBUTE_ALL: 'all' };
const DMG = { DAMAGE_TYPE_MAGICAL: 'mag', DAMAGE_TYPE_PHYSICAL: 'phys', DAMAGE_TYPE_PURE: 'pure' };

// ---------------------------------------------------------------- helpers
const num = (s) => {
  if (typeof s !== 'string') return NaN;
  const t = s.trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
};
function numArr(s) {
  if (typeof s !== 'string') return null;
  const p = s.trim().split(/\s+/);
  if (!p.length || p[0] === '') return null;
  const a = p.map(num);
  return a.every(Number.isFinite) ? a : null;
}
const n0 = (s, d = 0) => { const v = num(s); return Number.isFinite(v) ? v : d; };
const flags = (s, pre) => (s || '').split('|').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(pre, ''));
const fit = (a, levels) => { // arrays always; single values repeat to `levels`, short arrays pad with the last value
  if (a.length === 1) return Array(Math.max(1, levels)).fill(a[0]);
  const o = a.slice();
  while (o.length < levels) o.push(o[o.length - 1]);
  return o;
};

// An AbilityValues entry -> { v:number[], levelKey|null } or null (non numeric). Blocks: take "value", ignore special_bonus_* etc.
function valueOf(raw) {
  if (typeof raw === 'string') { const v = numArr(raw); return v && { v, levelKey: null }; }
  if (!raw || typeof raw !== 'object') return null;
  const v = numArr(raw.value);
  return v && { v, levelKey: raw.levelkey || null };
}

// resolve "_base" inheritance (used by *_ad variants; harmless elsewhere)
function resolveDef(defs, name, seen = new Set()) {
  const d = defs[name];
  if (!d || !d._base || seen.has(name) || !defs[d._base]) return d;
  seen.add(name);
  const b = resolveDef(defs, d._base, seen);
  return { ...b, ...d, AbilityValues: { ...(b.AbilityValues || {}), ...(d.AbilityValues || {}) } };
}

const STRUCT = { castRange: 'AbilityCastRange', castPoint: 'AbilityCastPoint', cooldown: 'AbilityCooldown', manaCost: 'AbilityManaCost', channel: 'AbilityChannelTime' };
const STRUCT_NAMES = new Set(Object.values(STRUCT));
const TOP_EXTRA = ['AbilityDamage', 'AbilityDuration', 'AbilityCharges', 'AbilityChargeRestoreTime'];

// Common: structural fields + numeric values of an ability / item definition.
function readValues(def, levels) {
  const raw = {};
  const levelKeys = {};
  for (const [k, e] of Object.entries(def.AbilityValues || {})) {
    const v = valueOf(e);
    if (!v) continue;
    raw[k] = v.v;
    if (v.levelKey) levelKeys[k] = v.levelKey;
  }
  const st = {};
  for (const [f, name] of Object.entries(STRUCT)) st[f] = raw[name] || numArr(def[name]) || [0];
  const values = {};
  for (const [k, a] of Object.entries(raw)) if (!STRUCT_NAMES.has(k)) values[k] = a;
  for (const k of TOP_EXTRA) { const a = numArr(def[k]); if (a && !values[k]) values[k] = a; }
  if (values.AbilityDamage && !values.damage) values.damage = values.AbilityDamage;
  return { st, values, levelKeys, levels };
}

const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

function bakeAbility(def) {
  const ult = def.AbilityType === 'ABILITY_TYPE_ULTIMATE';
  let maxLevel = def.MaxLevel !== undefined ? n0(def.MaxLevel) : (ult ? 3 : 4);
  if (maxLevel < 1) maxLevel = 1; // invoker_empty1/2 (MaxLevel 0) still need a slot entry
  const { st, values, levelKeys } = readValues(def, maxLevel);
  const o = {
    maxLevel, ult,
    behavior: flags(def.AbilityBehavior, 'DOTA_ABILITY_BEHAVIOR_'),
    targetTeam: flags(def.AbilityUnitTargetTeam, 'DOTA_UNIT_TARGET_TEAM_')[0] || null,
    targetType: flags(def.AbilityUnitTargetType, 'DOTA_UNIT_TARGET_'),
    damageType: DMG[def.AbilityUnitDamageType] || null,
  };
  for (const f of Object.keys(STRUCT)) o[f] = fit(st[f], maxLevel);
  o.values = sortObj(Object.fromEntries(Object.entries(values).map(([k, a]) => [k, fit(a, maxLevel)])));
  if (Object.keys(levelKeys).length) o.levelKeys = sortObj(levelKeys); // e.g. Invoker: damage -> "exortlevel" (index = orb level)
  return sortObj(o);
}

// ---------------------------------------------------------------- serialiser (sorted keys, diff friendly)
function ser(v, ind) {
  const pad = '  '.repeat(ind);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== 'object')) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
    return '[\n' + v.map((x) => pad + '  ' + ser(x, ind + 1)).join(',\n') + '\n' + pad + ']';
  }
  const ks = Object.keys(v).sort();
  if (!ks.length) return '{}';
  const flat = '{ ' + ks.map((k) => JSON.stringify(k) + ': ' + ser(v[k], ind + 1)).join(', ') + ' }';
  if (ind >= 2 && flat.length <= 100 && !flat.includes('\n')) return flat;
  return '{\n' + ks.map((k) => pad + '  ' + JSON.stringify(k) + ': ' + ser(v[k], ind + 1)).join(',\n') + '\n' + pad + '}';
}
function writeModule(name, data, note) {
  const text = `// GENERATED by tools/bake.mjs from the local Dota 2 game files - do not edit by hand (npm run bake).\n// ${note}\nexport default ${ser(data, 0)};\n`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name + '.js'), text);
  return text.length;
}

// ---------------------------------------------------------------- bake
const pak = dotaPak();
const kvOf = (file) => parseKV(pak.readText(file));

// -- heroes + abilities
const heroBase = kvOf('scripts/npc/heroes/npc_dota_hero_base.txt').DOTAHeroes.npc_dota_hero_base;
let globalAbilities = null; // npc_abilities.txt, only loaded if a hero file lacks a definition
const globalDefs = () => (globalAbilities ??= kvOf('scripts/npc/npc_abilities.txt').DOTAAbilities);

const heroesOut = {};
const abilitiesOut = {};
const warnings = [];
for (const hk of HERO_KEYS) {
  const R = HEROES[hk];
  const hkv = kvOf(`scripts/npc/heroes/${hk}.txt`).DOTAHeroes[hk];
  if (!hkv) throw new Error('hero block missing: ' + hk);
  const h = { ...heroBase, ...hkv }; // missing keys inherit from npc_dota_hero_base
  const attr = ATTR[h.AttributePrimary];
  if (!attr) throw new Error('unknown primary attribute for ' + hk + ': ' + h.AttributePrimary);
  const hull = HULL[h.BoundsHullName];
  if (hull === undefined) throw new Error('unknown hull ' + h.BoundsHullName);
  heroesOut[hk] = sortObj({
    short: R.short, name: R.name, attr,
    str: n0(h.AttributeBaseStrength), agi: n0(h.AttributeBaseAgility), int: n0(h.AttributeBaseIntelligence),
    strGain: n0(h.AttributeStrengthGain), agiGain: n0(h.AttributeAgilityGain), intGain: n0(h.AttributeIntelligenceGain),
    dmgMin: n0(h.AttackDamageMin), dmgMax: n0(h.AttackDamageMax), armor: n0(h.ArmorPhysical), mr: n0(h.MagicalResistance),
    ms: n0(h.MovementSpeed), turnRate: n0(h.MovementTurnRate), atkRange: n0(h.AttackRange), projSpeed: n0(h.ProjectileSpeed),
    bat: n0(h.AttackRate), atkPoint: n0(h.AttackAnimationPoint), baseAS: n0(h.BaseAttackSpeed),
    hp: n0(h.StatusHealth), hpRegen: n0(h.StatusHealthRegen), mana: n0(h.StatusMana), manaRegen: n0(h.StatusManaRegen),
    visionDay: n0(h.VisionDaytimeRange), visionNight: n0(h.VisionNighttimeRange), hull,
    abilities: R.abilities.slice(), // authored slot order (shared/heroes.js), not the file's
  });
  const defs = hkv.AbilityDefinitions || {};
  for (const ak of [...R.abilities, ...(R.invoked || [])]) {
    const def = resolveDef(defs, ak) || resolveDef(globalDefs(), ak);
    if (!def) throw new Error(`ability ${ak} (${hk}) not found in the hero file or npc_abilities.txt`);
    if (abilitiesOut[ak]) throw new Error('duplicate ability key ' + ak);
    abilitiesOut[ak] = bakeAbility(def);
  }
}

// -- items
const itemKv = kvOf('scripts/npc/items.txt').DOTAAbilities;
const recipeOf = {}; // result item -> recipe item name
for (const [k, d] of Object.entries(itemKv)) if (d && typeof d === 'object' && d.ItemRecipe === '1' && d.ItemResult) recipeOf[d.ItemResult] = k;

const STAT_MAP = {
  bonus_strength: ['str'], bonus_agility: ['agi'], bonus_intellect: ['int'], bonus_intelligence: ['int'],
  bonus_all_stats: ['str', 'agi', 'int'], bonus_damage: ['dmg'], bonus_armor: ['armor'], bonus_attack_speed: ['as'],
  bonus_movement_speed: ['ms'], bonus_movement_speed_percent: ['msPct'], bonus_movement_speed_percentage: ['msPct'], bonus_movement_speed_pct: ['msPct'],
  bonus_health: ['hp'], bonus_mana: ['mana'], bonus_health_regen: ['hpRegen'], bonus_mana_regen: ['manaRegen'],
  bonus_magical_armor: ['mr'], bonus_magic_resistance: ['mr'], bonus_spell_resist: ['mr'],
};

function bakeItem(name) {
  const def = itemKv[name];
  if (!def) throw new Error('item missing from items.txt: ' + name);
  const { st, values } = readValues(def, 1);
  const stats = {};
  for (const [vk, a] of Object.entries(values)) {
    const targets = STAT_MAP[vk];
    if (!targets || !a[0]) continue;
    for (const t of targets) stats[t] = (stats[t] || 0) + a[0];
  }
  const outValues = {};
  for (const [k, a] of Object.entries(values)) outValues[k] = a.length === 1 ? a[0] : a; // items: scalar, or per-level array (BKB duration)
  let recipe = null;
  const rn = recipeOf[name];
  if (rn) {
    const req = itemKv[rn].ItemRequirements || {};
    const alts = Object.keys(req).sort().map((k) => req[k].split(';').map((s) => s.trim().replace(/\*$/, '')).filter(Boolean));
    recipe = { cost: n0(itemKv[rn].ItemCost), parts: alts[0] || [] };
    if (alts.length > 1) recipe.alts = alts; // alternative part sets (Power Treads: str/agi/int variants)
  }
  return sortObj({
    cost: n0(def.ItemCost), recipe, stats: sortObj(stats),
    cooldown: st.cooldown[0], manaCost: st.manaCost[0], castRange: st.castRange[0],
    behavior: flags(def.AbilityBehavior, 'DOTA_ABILITY_BEHAVIOR_'),
    values: sortObj(outValues),
    charges: n0(def.ItemInitialCharges), stack: def.ItemStackable === '1',
    consumable: def.ItemPermanent === '0' || def.ItemQuality === 'consumable', sell: def.ItemSellable !== '0',
  });
}
const itemsOut = {};
const queue = [...ITEM_NAMES];
while (queue.length) {
  const n = queue.shift();
  if (itemsOut[n]) continue;
  itemsOut[n] = bakeItem(n);
  const r = itemsOut[n].recipe;
  if (r) for (const p of [...r.parts, ...(r.alts || []).flat()]) if (!itemsOut[p]) queue.push(p);
}
for (const [k, it] of Object.entries(itemsOut)) { // sanity: recipe totals
  if (!it.recipe) continue;
  const sum = it.recipe.cost + it.recipe.parts.reduce((s, p) => s + itemsOut[p].cost, 0);
  if (sum !== it.cost) warnings.push(`${k}: cost ${it.cost} != recipe ${it.recipe.cost} + parts ${sum - it.recipe.cost}`);
}

// -- units
const unitKv = kvOf('scripts/npc/npc_units.txt').DOTAUnits;
function bakeUnit(npc) {
  const u = unitKv[npc];
  if (!u) throw new Error('unit missing: ' + npc);
  const hull = HULL[u.BoundsHullName];
  if (hull === undefined) throw new Error(`unknown hull ${u.BoundsHullName} for ${npc}`);
  return sortObj({
    key: npc,
    hp: n0(u.StatusHealth), hpRegen: n0(u.StatusHealthRegen), mana: n0(u.StatusMana), armor: n0(u.ArmorPhysical), mr: n0(u.MagicalResistance),
    dmgMin: n0(u.AttackDamageMin), dmgMax: n0(u.AttackDamageMax), bat: n0(u.AttackRate), atkPoint: n0(u.AttackAnimationPoint),
    atkRange: n0(u.AttackRange), projSpeed: n0(u.ProjectileSpeed), ms: n0(u.MovementSpeed),
    goldMin: n0(u.BountyGoldMin), goldMax: n0(u.BountyGoldMax), xp: n0(u.BountyXP), vision: n0(u.VisionDaytimeRange), hull,
  });
}
const UNIT_SRC = {
  goodguys_melee: 'npc_dota_creep_goodguys_melee', goodguys_ranged: 'npc_dota_creep_goodguys_ranged', goodguys_siege: 'npc_dota_goodguys_siege',
  badguys_melee: 'npc_dota_creep_badguys_melee', badguys_ranged: 'npc_dota_creep_badguys_ranged', badguys_siege: 'npc_dota_badguys_siege',
  tower1: 'npc_dota_goodguys_tower1_mid', tower2: 'npc_dota_goodguys_tower2_mid', tower3: 'npc_dota_goodguys_tower3_mid', tower4: 'npc_dota_goodguys_tower4',
  melee_rax: 'npc_dota_goodguys_melee_rax_mid', ranged_rax: 'npc_dota_goodguys_range_rax_mid',
  fort: 'npc_dota_goodguys_fort', fountain: 'dota_fountain',
};
const unitsOut = {};
for (const [k, npc] of Object.entries(UNIT_SRC)) unitsOut[k] = bakeUnit(npc);
// buildings are identical across teams and lanes in the game files; verify so a patch that changes that doesn't pass silently
const sameStats = (a, b) => JSON.stringify({ ...a, key: 0 }) === JSON.stringify({ ...b, key: 0 });
for (const [k, npcs] of Object.entries({
  tower1: ['npc_dota_goodguys_tower1_top', 'npc_dota_goodguys_tower1_bot', 'npc_dota_badguys_tower1_top', 'npc_dota_badguys_tower1_mid', 'npc_dota_badguys_tower1_bot'],
  tower2: ['npc_dota_goodguys_tower2_top', 'npc_dota_goodguys_tower2_bot', 'npc_dota_badguys_tower2_top', 'npc_dota_badguys_tower2_mid', 'npc_dota_badguys_tower2_bot'],
  tower3: ['npc_dota_goodguys_tower3_top', 'npc_dota_goodguys_tower3_bot', 'npc_dota_badguys_tower3_top', 'npc_dota_badguys_tower3_mid', 'npc_dota_badguys_tower3_bot'],
  tower4: ['npc_dota_badguys_tower4'],
  melee_rax: ['npc_dota_goodguys_melee_rax_top', 'npc_dota_goodguys_melee_rax_bot', 'npc_dota_badguys_melee_rax_top', 'npc_dota_badguys_melee_rax_mid', 'npc_dota_badguys_melee_rax_bot'],
  ranged_rax: ['npc_dota_goodguys_range_rax_top', 'npc_dota_goodguys_range_rax_bot', 'npc_dota_badguys_range_rax_top', 'npc_dota_badguys_range_rax_mid', 'npc_dota_badguys_range_rax_bot'],
  fort: ['npc_dota_badguys_fort'],
})) for (const npc of npcs) if (!sameStats(unitsOut[k], bakeUnit(npc))) warnings.push(`unit ${npc} differs from ${k} (lanes/teams assumed identical)`);
for (const t of ['melee', 'ranged', 'siege']) if (!sameStats(unitsOut['goodguys_' + t], unitsOut['badguys_' + t])) warnings.push(`creep ${t} differs between teams`);

// -- meta
const inf = fs.readFileSync(path.join(DOTA_DIR, 'game/dota/steam.inf'), 'utf8');
const inf$ = (k) => (new RegExp('^' + k + '=(.*)$', 'm').exec(inf) || [])[1]?.trim();
const meta = { source: 'local game files', patch: inf$('PatchVersion') || inf$('ClientVersion') || '', date: inf$('VersionDate') || '', vpk: 'game/dota/pak01_dir.vpk' };

// -- write
const sizes = {
  heroes: writeModule('heroes', heroesOut, 'npc_dota_hero_* stats for the roster in shared/heroes.js (KV base values; attribute bonuses are applied by the sim).'),
  abilities: writeModule('abilities', abilitiesOut, 'Per-level arrays. damageType: mag|phys|pure. levelKeys (Invoker): value arrays indexed by that orb level.'),
  items: writeModule('items', itemsOut, 'Items from docs/DECISIONS.md plus recipe parts. cost = total gold cost; recipe.cost = recipe scroll (0 = none).'),
  units: writeModule('units', unitsOut, 'Lane creeps, towers (all lanes/teams identical), barracks, ancient, fountain.'),
  meta: writeModule('meta', meta, 'Source patch.'),
};
console.log(`baked patch ${meta.patch} (${meta.date}) from ${DOTA_DIR}`);
console.log(`  heroes ${Object.keys(heroesOut).length}, abilities ${Object.keys(abilitiesOut).length}, items ${Object.keys(itemsOut).length}, units ${Object.keys(unitsOut).length}`);
console.log('  bytes: ' + Object.entries(sizes).map(([k, v]) => `${k} ${v}`).join(', '));
for (const w of warnings) console.warn('  WARN ' + w);
