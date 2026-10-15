// Tooltip content built from DATA (DOM-free, node-testable). A tip is { title, sub, rows:[{k, v:number|number[], cur?}], notes:[str], cost, mana, cd, range }.
import { DATA } from '../../../shared/data.js';
import { prettyName, prettyValue, fmtNum } from './format.js';
import { recipeTree } from './shopdata.js';

const HIDE = /scepter|facet|shard|talent|vision|model|max_level|upgrade|cataclysm|^abilitydamage$|^abilitycastpoint|^abilityduration$|undispellable|^tooltip_|^cooldown_reduction|^charge_restore|_pct_tooltip/i;
const BEHAVIOR_TEXT = { UNIT_TARGET: 'Unit Target', POINT: 'Point Target', NO_TARGET: 'No Target', PASSIVE: 'Passive', TOGGLE: 'Toggle', AUTOCAST: 'Auto-cast', CHANNELLED: 'Channeled', AOE: 'AoE' };
const DMG_TEXT = { mag: 'Magical', phys: 'Physical', pure: 'Pure' };
const STAT_TEXT = { str: 'Strength', agi: 'Agility', int: 'Intelligence', dmg: 'Damage', armor: 'Armor', as: 'Attack Speed', ms: 'Move Speed', msPct: '% Move Speed', hp: 'Health', mana: 'Mana', hpRegen: 'Health Regen', manaRegen: 'Mana Regen', mr: '% Magic Resist', manaPct: '% Max Mana' };

/** Charge count shown on an inventory slot, or null. DATA showCharges (stick / wand) shows even 0; hideCharges (Faerie Fire) never. */
export function slotCharges(it) {
  if (!it || !it.key) return null;
  const d = DATA.items[it.key];
  if (d && d.hideCharges) return null;
  if (it.charges > 0) return it.charges;
  return d && d.showCharges ? 0 : null;
}

const idx = (arr, level) => Math.min(Math.max((level | 0) || 1, 1), arr.length) - 1;

function valueRow(name, arr, level, orbLevels, levelKey) {
  if (!Array.isArray(arr)) arr = [arr];
  if (!arr.some((x) => Number.isFinite(x) && x !== 0)) return null;
  // Invoker: values are indexed by orb level (0..8), the current one depends on the orb's rank
  if (levelKey && orbLevels) {
    const l = orbLevels[levelKey] | 0;
    const v = arr[Math.min(l, arr.length - 1)];
    return { k: prettyValue(name), v, all: arr.map((x) => fmtNum(x, 2)) };
  }
  const same = arr.every((x) => x === arr[0]);
  if (same) return { k: prettyValue(name), v: arr[0] };
  return { k: prettyValue(name), v: arr, cur: level > 0 ? idx(arr, level) : -1 };
}

/** Ability tooltip. level = the hero's current rank (0 = not learned: shows all ranks). orbLevels = {quaslevel, wexlevel, exortlevel} (Invoker). */
export function abilityTip(key, level, orbLevels, data = DATA) {
  const d = data.abilities[key];
  const tip = { title: prettyName(key), sub: '', rows: [], notes: [], mana: null, cd: null, range: null };
  if (!d) return tip;
  const b = d.behavior || [];
  const parts = [];
  for (const f of ['PASSIVE', 'UNIT_TARGET', 'POINT', 'NO_TARGET', 'TOGGLE', 'AUTOCAST', 'CHANNELLED', 'AOE']) if (b.indexOf(f) >= 0 && !(f === 'NO_TARGET' && b.indexOf('PASSIVE') >= 0)) parts.push(BEHAVIOR_TEXT[f]);
  tip.sub = parts.join(' / ');
  if (d.damageType) tip.notes.push(`Damage: ${DMG_TEXT[d.damageType] || d.damageType}`);
  if (d.targetTeam) tip.notes.push(`Affects: ${d.targetTeam.toLowerCase()}`);
  const lv = Math.max(1, level | 0);
  const lk = d.levelKeys || {};
  for (const name of Object.keys(d.values || {})) {
    if (HIDE.test(name)) continue;
    const row = valueRow(name, d.values[name], level, orbLevels, lk[name] ? lk[name] : null);
    if (row) tip.rows.push(row);
    if (tip.rows.length >= 8) break;
  }
  const arrAt = (a) => (Array.isArray(a) && a.length ? a : null);
  const mana = arrAt(d.manaCost), cd = arrAt(d.cooldown), range = arrAt(d.castRange);
  if (mana && mana.some((x) => x > 0)) tip.mana = mana.every((x) => x === mana[0]) ? [mana[0]] : mana;
  if (cd && cd.some((x) => x > 0)) tip.cd = cd.every((x) => x === cd[0]) ? [cd[0]] : cd;
  if (range && range.some((x) => x > 0)) tip.range = range.every((x) => x === range[0]) ? [range[0]] : range;
  tip.level = level; tip.maxLevel = d.maxLevel; tip.cur = Math.min(lv, d.maxLevel) - 1;
  return tip;
}

/** Item tooltip. */
export function itemTip(key, data = DATA) {
  const d = data.items[key];
  const tip = { title: prettyName(key), sub: '', rows: [], notes: [], cost: d ? d.cost : 0, mana: null, cd: null, range: null, stats: [], recipe: null };
  if (!d) return tip;
  const b = d.behavior || [];
  tip.sub = b.indexOf('PASSIVE') >= 0 && b.length === 1 ? 'Passive' : b.indexOf('UNIT_TARGET') >= 0 ? 'Unit Target' : b.indexOf('POINT') >= 0 ? 'Point Target' : b.indexOf('NO_TARGET') >= 0 ? 'No Target' : '';
  if (d.consumable) tip.notes.push('Consumable');
  for (const k of Object.keys(d.stats || {})) {
    const v = d.stats[k];
    tip.stats.push({ k: STAT_TEXT[k] || k, v, text: (v > 0 ? '+' : '') + fmtNum(v, 2) + (k === 'msPct' || k === 'mr' || k === 'manaPct' ? '%' : '') + ' ' + (STAT_TEXT[k] || k).replace(/^% /, '') });
  }
  const skip = /^bonus_|max_level|model_scale|tooltip_charges/i;
  for (const name of Object.keys(d.values || {})) {
    if (HIDE.test(name) || skip.test(name)) continue;
    const row = valueRow(name, d.values[name], 1);
    if (row) tip.rows.push(row);
    if (tip.rows.length >= 5) break;
  }
  if (d.manaCost > 0) tip.mana = [d.manaCost];
  if (d.cooldown > 0) tip.cd = [d.cooldown];
  if (d.castRange > 0) tip.range = [d.castRange];
  if (d.recipe) tip.recipe = recipeTree(key, data);
  return tip;
}

/** Flat text lines of a recipe tree for plain-text rendering / tests: [{depth, key, cost}]. */
export function recipeLines(tree, depth = 0, out = []) {
  out.push({ depth, key: tree.key, cost: tree.cost });
  for (const p of tree.parts) recipeLines(p, depth + 1, out);
  if (tree.recipeCost > 0) out.push({ depth: depth + 1, key: 'item_recipe', cost: tree.recipeCost });
  return out;
}
