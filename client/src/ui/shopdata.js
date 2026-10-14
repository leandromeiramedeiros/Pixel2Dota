// Pure shop logic: categories, recipe trees, affordability (DOM-free, node-testable).
import { DATA } from '../../../shared/data.js';
import { SHOP_RANGE, SELL_RATIO, SELL_FULL_WINDOW } from '../../../shared/constants.js';
import { INV_SLOTS } from '../../../shared/protocol.js';

export const SHOP_CATEGORIES = [
  { id: 'consumables', name: 'Consumables', items: ['item_tango', 'item_flask', 'item_clarity', 'item_faerie_fire', 'item_enchanted_mango', 'item_tpscroll', 'item_ward_observer', 'item_ward_sentry'] },
  { id: 'attributes', name: 'Attributes', items: ['item_branches', 'item_gauntlets', 'item_slippers', 'item_mantle', 'item_circlet', 'item_belt_of_strength', 'item_boots_of_elves', 'item_robe', 'item_ogre_axe', 'item_blade_of_alacrity', 'item_staff_of_wizardry'] },
  { id: 'equipment', name: 'Equipment', items: ['item_ring_of_protection', 'item_quelling_blade', 'item_blades_of_attack', 'item_chainmail', 'item_gloves', 'item_broadsword', 'item_claymore', 'item_mithril_hammer'] },
  { id: 'misc', name: 'Misc', items: ['item_boots', 'item_ring_of_regen', 'item_sobi_mask', 'item_magic_stick'] },
  { id: 'upgrades', name: 'Upgrades', items: ['item_magic_wand', 'item_bracer', 'item_wraith_band', 'item_null_talisman', 'item_phase_boots', 'item_power_treads', 'item_lesser_crit', 'item_black_king_bar', 'item_blink'] },
];

/** category id of an item key (or null). */
export function categoryOf(key) {
  for (const c of SHOP_CATEGORIES) if (c.items.indexOf(key) >= 0) return c.id;
  return null;
}

/** Recipe tree: { key, cost, recipeCost, parts: [tree] }. cost = full price of the (sub)item. */
export function recipeTree(key, data = DATA) {
  const d = data.items[key];
  const node = { key, cost: d ? d.cost : 0, recipeCost: 0, parts: [] };
  if (d && d.recipe) {
    node.recipeCost = d.recipe.cost || 0;
    node.parts = (d.recipe.parts || []).map((p) => recipeTree(p, data));
  }
  return node;
}

/** items that `key` is a direct component of. */
export function usedIn(key, data = DATA) {
  const out = [];
  for (const k in data.items) {
    const r = data.items[k].recipe;
    if (r && (r.parts || []).indexOf(key) >= 0) out.push(k);
  }
  return out;
}

/** inventory array ([{key, charges}]) -> Map(key -> count of slots). */
export function ownedCounts(items) {
  const m = new Map();
  if (items) for (let i = 0; i < items.length; i++) { const k = items[i] && items[i].key; if (k) m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

/**
 * Price of buying `key` given what is already in the inventory: owned components are consumed (auto-combine).
 * @returns {{cost:number, consumed:number, consumedKeys:string[], have:Set<string>}}  `have` = tree node keys satisfied by owned items
 */
export function effectiveCost(key, items, data = DATA) {
  const owned = ownedCounts(items);
  const consumedKeys = [];
  const walk = (k, top) => {
    const d = data.items[k];
    if (!d) return 0;
    if (!top && (owned.get(k) || 0) > 0) { owned.set(k, owned.get(k) - 1); consumedKeys.push(k); return 0; }
    if (!d.recipe) return d.cost;
    let c = d.recipe.cost || 0;
    for (const p of d.recipe.parts || []) c += walk(p, false);
    return c;
  };
  const cost = walk(key, true);
  return { cost, consumed: consumedKeys.length, consumedKeys };
}

/** Which tree-node paths are covered by owned items (for green ticks in the recipe tooltip): returns Map(node object -> bool). */
export function markOwned(tree, items) {
  const owned = ownedCounts(items);
  const m = new Map();
  const walk = (n, top) => {
    if (!top && (owned.get(n.key) || 0) > 0) { owned.set(n.key, owned.get(n.key) - 1); m.set(n, true); return; }
    for (const p of n.parts) walk(p, false);
  };
  walk(tree, true);
  return m;
}

/**
 * Can the player buy `key` now?
 * ctx = { gold, items:[{key,charges}], inRange:boolean, dead?:boolean }
 * @returns {{ok:boolean, reason?:'range'|'gold'|'full'|'dead'|'unknown', cost:number, need?:number}}
 */
export function buyCheck(key, ctx, data = DATA) {
  const d = data.items[key];
  if (!d) return { ok: false, reason: 'unknown', cost: 0 };
  const ec = effectiveCost(key, ctx.items, data);
  const res = { ok: false, cost: ec.cost };
  if (ctx.dead) return { ...res, reason: 'dead' };
  if (!ctx.inRange) return { ...res, reason: 'range' };
  if ((ctx.gold || 0) < ec.cost) return { ...res, reason: 'gold', need: ec.cost - (ctx.gold || 0) };
  let free = 0, stackable = false;
  const list = ctx.items || [];
  for (let i = 0; i < INV_SLOTS; i++) { const it = list[i]; if (!it || !it.key) free++; else if (d.stack && it.key === key) stackable = true; }
  if (free + ec.consumed < 1 && !stackable) return { ...res, reason: 'full' };
  return { ...res, ok: true };
}

export function inShopRange(hero, shopPos, range = SHOP_RANGE) {
  if (!hero || !shopPos) return false;
  return Math.hypot(hero.x - shopPos.x, hero.y - shopPos.y) <= range;
}

/** Gold got back for selling an item bought `ageSeconds` ago (100% inside the grace window). */
export function sellValue(key, ageSeconds, data = DATA) {
  const d = data.items[key];
  if (!d) return 0;
  return Math.round(d.cost * (ageSeconds >= 0 && ageSeconds <= SELL_FULL_WINDOW ? 1 : SELL_RATIO));
}
