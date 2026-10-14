// DATA loader: baked game data (tools/bake.mjs -> shared/data/*.js). Pure ESM, safe for server and client.
import heroes from './data/heroes.js';
import abilities from './data/abilities.js';
import items from './data/items.js';
import units from './data/units.js';
import meta from './data/meta.js';

export const DATA = { heroes, abilities, items, units, meta };
export default DATA;

const at = (arr, level) => (arr && arr.length ? arr[Math.min(Math.max((level | 0) || 1, 1), arr.length) - 1] : undefined);

// abilityValue('sven_storm_bolt', 'bolt_stun_duration', 2) -> 1.25   (level is 1-based, clamped to the array length)
export function abilityValue(key, name, level = 1) {
  const a = DATA.abilities[key];
  return a && a.values ? at(a.values[name], level) : undefined;
}
// abilityField('sven_storm_bolt', 'cooldown', 2) -> 18   (castRange|castPoint|cooldown|manaCost|channel, or any other per-level array field)
export function abilityField(key, field, level = 1) {
  const a = DATA.abilities[key];
  if (!a) return undefined;
  const v = a[field];
  return Array.isArray(v) ? at(v, level) : v;
}
// itemValue('item_black_king_bar', 'duration', 2) -> 8   (scalars come back as is, per-level arrays are indexed)
export function itemValue(key, name, level = 1) {
  const it = DATA.items[key];
  const v = it && it.values ? it.values[name] : undefined;
  return Array.isArray(v) ? at(v, level) : v;
}
