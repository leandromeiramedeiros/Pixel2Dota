// Pure formatting helpers for the HUD (DOM-free, node-testable).
import { XP_TABLE, MAX_LEVEL, ATTR } from '../../../shared/constants.js';
import { HEROES } from '../../../shared/heroes.js';

/** Game clock: 75 -> "1:15", -30 -> "-0:30", 3725 -> "1:02:05". */
export function fmtClock(t) {
  t = Math.trunc(Number.isFinite(t) ? t : 0);
  const neg = t < 0; t = Math.abs(t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return neg ? '-' + body : body;
}

/** Cooldown text on an icon: >=1 -> whole seconds (rounded up), <1 -> "0.7". '' when ready. */
export function fmtCd(s) {
  if (!(s > 0)) return '';
  if (s < 1) return s.toFixed(1);
  return String(Math.ceil(s));
}

/** Respawn timer text: whole seconds, rounded up. */
export const fmtRespawn = (s) => (s > 0 ? String(Math.ceil(s)) : '');

/** Gold: 1234 -> "1,234". */
export function fmtGold(g) {
  g = Math.floor(Number.isFinite(g) ? g : 0);
  return String(g).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Short number for stats: integers stay, otherwise `dec` decimals. */
export function fmtNum(n, dec = 1) {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 10 ** dec) / 10 ** dec;
  return Number.isInteger(r) ? String(r) : r.toFixed(dec);
}

/** "+4.2" / "-1.0" / "+0.0". */
export function fmtRegen(n) {
  n = Number.isFinite(n) ? n : 0;
  return (n < 0 ? '-' : '+') + Math.abs(n).toFixed(1);
}

/** hp bar label: "620 / 700". */
export const fmtBar = (cur, max) => `${Math.max(0, Math.ceil(cur || 0))} / ${Math.max(0, Math.round(max || 0))}`;

export const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);

/** XP progress within the current level, 0..1 (1 at max level). */
export function xpProgress(xp, level) {
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
  if (level >= MAX_LEVEL) return 1;
  const a = XP_TABLE[level - 1], b = XP_TABLE[level];
  return clamp01((xp - a) / (b - a));
}

/** Cooldown sweep angle in degrees (0 = ready, 360 = just used). */
export function sweepDeg(cd, cdMax) {
  if (!(cd > 0) || !(cdMax > 0)) return 0;
  return Math.round(clamp01(cd / cdMax) * 360);
}

const NAME_OVERRIDES = {
  item_tpscroll: 'Town Portal Scroll', item_flask: 'Healing Salve', item_lesser_crit: 'Crystalys', item_blink: 'Blink Dagger',
  item_black_king_bar: 'Black King Bar', item_faerie_fire: 'Faerie Fire', item_enchanted_mango: 'Enchanted Mango',
  item_ring_of_regen: 'Ring of Regeneration', item_sobi_mask: "Sage's Mask", item_boots: 'Boots of Speed',
  item_boots_of_elves: 'Band of Elvenskin', item_gauntlets: 'Gauntlets of Strength', item_slippers: 'Slippers of Agility',
  item_mantle: 'Mantle of Intelligence', item_circlet: 'Circlet', item_robe: 'Robe of the Magi', item_recipe: 'Recipe',
  invoker_empty1: 'Empty', invoker_empty2: 'Empty', zuus_thundergods_wrath: "Thundergod's Wrath", axe_berserkers_call: "Berserker's Call",
  sven_gods_strength: "God's Strength", sven_storm_bolt: 'Storm Hammer', lion_voodoo: 'Hex', crystal_maiden_brilliance_aura: 'Arcane Aura',
  rubick_empty1: 'Empty', rubick_empty2: 'Empty', mirana_starfall: 'Starstorm', mirana_arrow: 'Sacred Arrow', mirana_invis: 'Moonlight Shadow',
  drow_ranger_wave_of_silence: 'Gust', juggernaut_omni_slash: 'Omnislash', invoker_emp: 'E.M.P.', lion_impale: 'Earth Spike',
};
const SHORTS = Object.values(HEROES).map((h) => h.short).sort((a, b) => b.length - a.length);
const SMALL = new Set(['of', 'the']);
const title = (s) => s.split('_').filter(Boolean).map((w) => (SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');

/** Ability / item key -> display name ("sven_storm_bolt" -> "Storm Hammer", "item_ogre_axe" -> "Ogre Axe"). */
export function prettyName(key) {
  if (!key) return '';
  if (NAME_OVERRIDES[key]) return NAME_OVERRIDES[key];
  if (key.startsWith('item_')) return title(key.slice(5));
  for (const s of SHORTS) if (key.startsWith(s + '_')) return title(key.slice(s.length + 1));
  return title(key);
}

const findHero = (key) => HEROES[key] || Object.values(HEROES).find((x) => x.short === key);
/** "npc_dota_hero_crystal_maiden" | "crystal_maiden" -> "Crystal Maiden". */
export function heroName(key) {
  const h = findHero(key);
  return h ? h.name : prettyName(String(key || '').replace(/^npc_dota_hero_/, ''));
}
export function heroShort(key) {
  const h = findHero(key);
  return h ? h.short : String(key || '').replace(/^npc_dota_hero_/, '');
}

/** snake_case value name -> "Bolt Stun Duration". */
export const prettyValue = (n) => title(String(n).replace(/^bonus_/, ''));

// The Unit schema has no regen fields: derive hp/s and mana/s from DATA the way the sim does (hero base + attributes + items).
export function heroRegen(u, data) {
  if (!u) return { hp: 0, mana: 0 };
  const h = data && data.heroes && data.heroes[u.key];
  let hp = (h ? h.hpRegen : 0) + (u.str || 0) * ATTR.hpRegenPerStr;
  let mana = (h ? h.manaRegen : 0) + (u.int || 0) * ATTR.manaRegenPerInt;
  if (data && data.items && u.items) {
    for (let i = 0; i < u.items.length; i++) {
      const it = u.items[i]; const d = it && it.key ? data.items[it.key] : null;
      if (d && d.stats) { hp += d.stats.hpRegen || 0; mana += d.stats.manaRegen || 0; }
    }
  }
  return { hp, mana };
}

/** Damage text "37-39" (bonus included). */
export function dmgText(u) {
  const b = u.dmgBonus || 0;
  return `${Math.round((u.dmgMin || 0) + b)}-${Math.round((u.dmgMax || 0) + b)}`;
}
