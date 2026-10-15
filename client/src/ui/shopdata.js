// Pure shop logic: categories, recipe trees, affordability (DOM-free, node-testable).
import { DATA } from '../../../shared/data.js';
import { SHOP_RANGE, SELL_RATIO, SELL_FULL_WINDOW } from '../../../shared/constants.js';
import { INV_SLOTS } from '../../../shared/protocol.js';

// Dota 2 shop columns, in display order, from scripts/shops.txt (pak01). `src` = the shops.txt block; `order` = that block's items
// verbatim (the full Dota list, so new items land in their Dota slot automatically). The sideshop / pregame / event blocks are not columns.
// Groups = Dota's shop tabs (dota_hud_shop GridBasicsTab / GridUpgradesTab), one shown at a time; names = DOTA_Shop_Category_* / DOTA_SUBSHOP_* (dota_english).
export const SHOP_GROUPS = [{ id: 'basic', name: 'BASICS' }, { id: 'upgrades', name: 'UPGRADES' }];
export const SHOP_COLUMNS = [
  { id: 'consumables', name: 'Consumables', group: 'basic', src: 'consumables', order: [
    'item_tpscroll', 'item_clarity', 'item_faerie_fire', 'item_smoke_of_deceit', 'item_ward_observer', 'item_ward_sentry', 'item_enchanted_mango', 'item_flask',
    'item_tango', 'item_blood_grenade', 'item_dust', 'item_bottle', 'item_infused_raindrop', 'item_aghanims_shard'] },
  { id: 'attributes', name: 'Attributes', group: 'basic', src: 'attributes', order: [
    'item_branches', 'item_gauntlets', 'item_slippers', 'item_mantle', 'item_circlet', 'item_belt_of_strength', 'item_boots_of_elves', 'item_robe',
    'item_crown', 'item_ogre_axe', 'item_blade_of_alacrity', 'item_staff_of_wizardry', 'item_diadem', 'item_ghost'] },
  { id: 'equipment', name: 'Equipment', group: 'basic', src: 'weapons_armor', order: [
    'item_quelling_blade', 'item_ring_of_protection', 'item_blades_of_attack', 'item_orb_of_frost', 'item_gloves', 'item_chainmail', 'item_broadsword', 'item_blight_stone',
    'item_blitz_knuckles', 'item_splintmail', 'item_claymore', 'item_orb_of_venom', 'item_javelin', 'item_helm_of_iron_will', 'item_mithril_hammer'] },
  { id: 'misc', name: 'Miscellaneous', group: 'basic', src: 'misc', order: [
    'item_ring_of_regen', 'item_sobi_mask', 'item_wind_lace', 'item_magic_stick', 'item_fluffy_hat', 'item_wizard_hat', 'item_boots', 'item_voodoo_mask',
    'item_shawl', 'item_shadow_amulet', 'item_gem', 'item_lifesteal', 'item_cloak', 'item_chasm_stone', 'item_blink'] },
  { id: 'secret', name: 'Secret Shop', group: 'basic', src: 'secretshop', order: [
    'item_ring_of_health', 'item_void_stone', 'item_talisman_of_evasion', 'item_platemail', 'item_ring_of_tarrasque', 'item_tiara_of_selemene', 'item_hyperstone', 'item_demon_edge',
    'item_vitality_booster', 'item_energy_booster', 'item_point_booster', 'item_relic', 'item_reaver', 'item_eagle', 'item_mystic_staff', 'item_ultimate_orb'] },
  { id: 'accessories', name: 'Accessories', group: 'upgrades', src: 'basics', order: [
    'item_magic_wand', 'item_bracer', 'item_wraith_band', 'item_null_talisman', 'item_power_treads', 'item_soul_ring', 'item_orb_of_corrosion', 'item_falcon_blade',
    'item_phase_boots', 'item_pers', 'item_mask_of_madness', 'item_oblivion_staff', 'item_travel_boots', 'item_hand_of_midas', 'item_moon_shard', 'item_soul_booster'] },
  { id: 'support', name: 'Support', group: 'upgrades', src: 'support', order: [
    'item_ring_of_basilius', 'item_headdress', 'item_urn_of_shadows', 'item_tranquil_boots', 'item_arcane_boots', 'item_mekansm', 'item_essence_distiller', 'item_ancient_janggo',
    'item_pavise', 'item_guardian_greaves', 'item_spirit_vessel', 'item_boots_of_bearing', 'item_solar_crest', 'item_glimmer_cape', 'item_holy_locket', 'item_pipe'] },
  { id: 'magical', name: 'Magical', group: 'upgrades', src: 'magics', order: [
    'item_veil_of_discord', 'item_rod_of_atos', 'item_cyclone', 'item_phylactery', 'item_bloodstone', 'item_gungir', 'item_wind_waker', 'item_angels_demise',
    'item_force_staff', 'item_aether_lens', 'item_meteor_hammer', 'item_dagon', 'item_ultimate_scepter', 'item_crellas_crozier', 'item_octarine_core', 'item_orchid',
    'item_refresher', 'item_ethereal_blade', 'item_sheepstick', 'item_bloodthorn'] },
  { id: 'armor', name: 'Armor', group: 'upgrades', src: 'defense', order: [
    'item_buckler', 'item_vanguard', 'item_blade_mail', 'item_helm_of_the_dominator', 'item_vladmir', 'item_crimson_guard', 'item_armlet', 'item_helm_of_the_overlord',
    'item_consecrated_wraps', 'item_aeon_disk', 'item_lotus_orb', 'item_black_king_bar', 'item_shivas_guard', 'item_sphere', 'item_assault', 'item_heart'] },
  { id: 'weapons', name: 'Weapons', group: 'upgrades', src: 'weapons', order: [
    'item_lesser_crit', 'item_mage_slayer', 'item_heavens_halberd', 'item_desolator', 'item_revenants_brooch', 'item_basher', 'item_maelstrom', 'item_invis_sword',
    'item_greater_crit', 'item_abyssal_blade', 'item_mjollnir', 'item_silver_edge', 'item_bfury', 'item_nullifier', 'item_manta', 'item_radiance',
    'item_rapier', 'item_monkey_king_bar', 'item_butterfly', 'item_satanic'] },
  { id: 'artifacts', name: 'Armaments', group: 'upgrades', src: 'artifacts', order: [
    'item_sange', 'item_yasha', 'item_kaya', 'item_dragon_lance', 'item_kaya_and_sange', 'item_sange_and_yasha', 'item_yasha_and_kaya', 'item_hurricane_pike',
    'item_echo_sabre', 'item_diffusal_blade', 'item_witch_blade', 'item_specialists_array', 'item_harpoon', 'item_disperser', 'item_devastator', 'item_hydras_breath',
    'item_overwhelming_blink', 'item_swift_blink', 'item_arcane_blink', 'item_skadi'] },
];

/** The shop as shown: every column (empty ones too, Dota header order), items = the ones we have, in shops.txt order. */
export function shopCategories(data = DATA) {
  return SHOP_COLUMNS.map((c) => ({ id: c.id, name: c.name, group: c.group, items: c.order.filter((k) => data.items[k] && data.items[k].sell !== false) }));
}
export const SHOP_CATEGORIES = shopCategories();

/** column id of an item key (or null). */
export function categoryOf(key) {
  for (const c of SHOP_CATEGORIES) if (c.items.indexOf(key) >= 0) return c.id;
  return null;
}
/** 'basic' | 'upgrades' | null */
export function groupOf(key) {
  for (const c of SHOP_CATEGORIES) if (c.items.indexOf(key) >= 0) return c.group;
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

// ------------------------------------------------------------------------------------------------ draggable panel helpers (pure)
/** Clamp a panel's top-left so the whole panel stays inside the view. A panel larger than the view pins to the margin. */
export function clampPanelPos(x, y, w, hh, vw, vh, margin = 2) {
  const cl = (v, size, view) => { const max = view - size - margin; return Math.round(Math.max(margin, Math.min(Number.isFinite(v) ? v : margin, Math.max(margin, max)))); };
  return { x: cl(x, w, vw), y: cl(y, hh, vh) };
}

/** Parse a stored panel position ({x,y} JSON); null if missing or malformed. */
export function parsePanelPos(raw) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return o && Number.isFinite(o.x) && Number.isFinite(o.y) ? { x: o.x, y: o.y } : null;
  } catch { return null; }
}
