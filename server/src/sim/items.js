// ITEMS STUB (sim agent). The items agent replaces the BODIES but must keep these exports and signatures.
// A minimal real implementation is provided so heroes can buy/sell/swap and get passive stats; no recipes, no actives.
//
//   applyStats(w, u, B)            add every owned item's `stats` into the bonus accumulator B (called from heroes.recalc)
//   buy(w, u, key) -> bool         pay cost, put in first empty slot (must be within SHOP_RANGE of a shop; dead heroes cannot)
//   sell(w, u, slot) -> bool       refund SELL_RATIO (full refund within SELL_FULL_WINDOW s of purchase)
//   swap(w, u, a, b) -> bool       swap inventory slots
//   useInfo(w, u, slot) -> null | {targeting:'none'|'unit'|'point', range, castPoint, ready:bool, targetTeam?, targetType?, pierce?}
//   use(w, u, slot, target)        run the active; target = {unit|null, x, y}. Must set cooldown / consume charges itself.
//                                  May return {key, channel: secs, tick?(w,u,ch,dt), end?(w,u,ch,interrupted)} to channel (TP scroll).
//   onEnemySpell(w, u, caster, abilityKey)  u = enemy hero within 1200 of a non-passive ability cast (magic stick/wand charges)
//   hooks (all optional work, called for heroes only): onAttack(w,u,tgt,info) onAttackLanded(w,u,tgt,info,dealt)
//        onAttacked(w,u,attacker,info,dealt) onDamaged(w,u,src,dealt,type) onKill(w,u,victim) onDeath(w,u,killer) tick(w,u,dt)
//   Item state lives on u.items[i] = {key, charges, cd, cdMax} (+ private fields prefixed `_`).
// When items change, set u._dirty = true so stats are recomputed.
import { INV_SLOTS } from '../../../shared/protocol.js';
import { SHOP_RANGE, SELL_RATIO, SELL_FULL_WINDOW } from '../../../shared/constants.js';

const STAT = ['str', 'agi', 'int', 'dmg', 'armor', 'as', 'ms', 'msPct', 'hp', 'mana', 'hpRegen', 'manaRegen', 'mr', 'range'];

export function applyStats(w, u, B) {
  const items = w.data.items;
  for (let i = 0; i < u.items.length; i++) {
    const it = u.items[i]; if (!it.key) continue;
    const d = items[it.key]; if (!d || !d.stats) continue;
    for (const k of STAT) if (d.stats[k]) B[k] += d.stats[k];
  }
}

function nearShop(w, u) {
  const list = w.shopPos(u.team);
  for (const s of list) if (Math.hypot(s.x - u.x, s.y - u.y) <= SHOP_RANGE) return true;
  return false;
}

export function buy(w, u, key) {
  const d = w.data.items[key];
  const p = w.players.get(u.owner);
  if (!d || !p || u._dead || !nearShop(w, u)) return false;
  const slot = u.items.findIndex((it) => !it.key);
  if (slot < 0 || p.gold < d.cost) return false;
  p.gold -= d.cost;
  u.items[slot] = { key, charges: d.charges || 0, cd: 0, cdMax: 0, _t: w.time, _paid: d.cost };
  u._dirty = true;
  return true;
}

export function sell(w, u, slot) {
  const it = u.items[slot], p = w.players.get(u.owner);
  if (!it || !it.key || !p || u._dead || !nearShop(w, u)) return false;
  const d = w.data.items[it.key];
  const cost = it._paid || (d ? d.cost : 0);
  p.gold += Math.round(cost * (w.time - (it._t === undefined ? -1e9 : it._t) <= SELL_FULL_WINDOW ? 1 : SELL_RATIO));
  u.items[slot] = { key: '', charges: 0, cd: 0, cdMax: 0 };
  u._dirty = true;
  return true;
}

export function swap(w, u, a, b) {
  if (a === b || a < 0 || b < 0 || a >= INV_SLOTS || b >= INV_SLOTS) return false;
  const t = u.items[a]; u.items[a] = u.items[b]; u.items[b] = t;
  return true;
}

export function useInfo(w, u, slot) { return null; }
export function use(w, u, slot, target) {}

export function onAttack(w, u, tgt, info) {}
export function onAttackLanded(w, u, tgt, info, dealt) {}
export function onAttacked(w, u, attacker, info, dealt) {}
export function onDamaged(w, u, src, dealt, type) {}
export function onKill(w, u, victim) {}
export function onEnemySpell(w, u, caster, key) {}
export function onDeath(w, u, killer) {}
export function tick(w, u, dt) {
  for (let i = 0; i < u.items.length; i++) { const it = u.items[i]; if (it.cd > 0) it.cd = Math.max(0, it.cd - dt); }
}
