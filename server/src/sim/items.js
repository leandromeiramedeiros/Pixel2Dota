// ITEMS (items agent). Exports/signatures are the sim contract; see below.
//
//   applyStats(w, u, B)            add every owned item's `stats` into the bonus accumulator B (called from heroes.recalc)
//   buy(w, u, key) -> bool         recipes auto-combine / missing parts are bought; consumables stack; shop range only
//   sell(w, u, slot) -> bool       refund SELL_RATIO (full refund within SELL_FULL_WINDOW s of purchase)
//   swap(w, u, a, b) -> bool       swap slots 0..INV_SLOTS-1; backpack (ACTIVE_SLOTS..) -> main puts the moved item on BACKPACK_SWAP_CD (cd/cdMax)
//   useInfo(w, u, slot) -> null | {targeting:'none'|'unit'|'point', range, castPoint, ready:bool, targetTeam?, targetType?, pierce?}
//   use(w, u, slot, target)        run the active; target = {unit|null, x, y}. Pays mana / cooldown / charges itself.
//                                  Returns {key, channel, tick, end} for the TP scroll.
//   onEnemySpell(w, u, caster, abilityKey)  magic stick / wand charges
//   hooks (heroes only): onAttack onAttackLanded onAttacked onDamaged onKill onDeath tick
//   Inventory = ACTIVE_SLOTS main + backpack (INV_SLOTS total). Backpack items give no stats/passives, cannot be used, charge nothing; they still
//   count for recipes, stacking and selling. Every stats / passive / hook / use path loops i < ACTIVE_SLOTS.
//   Item state lives on u.items[i] = {key, charges, cd, cdMax} (+ private `_t` `_paid` `_attr` `_uses`).
import { INV_SLOTS, ACTIVE_SLOTS, BACKPACK_SWAP_CD, KIND, ST } from '../../../shared/protocol.js';
import { SHOP_RANGE, SELL_RATIO, SELL_FULL_WINDOW } from '../../../shared/constants.js';
import { evSpell, evTp, evMsg } from './events.js';
import { placeWard } from './wards.js';

const STAT = ['str', 'agi', 'int', 'dmg', 'armor', 'as', 'ms', 'msPct', 'hp', 'mana', 'hpRegen', 'manaRegen', 'mr', 'range'];
const BOOTS = { item_boots: 1, item_phase_boots: 1, item_power_treads: 1 };   // movement speed does not stack between boots
const BLINK_RANGE = 1200;          // landing distance cap (DATA also has blink_range_clamp 960; we use the full 1200)
const BLINK_HIT_CD = 3;
const TP_CHANNEL = 3, TP_HIT_RETRY_CD = 5, TP_MANA = 75;
const TREE_REACH_SLACK = 110;      // unit may be this much farther from the tree than the item's cast range
const TREE_PICK = 160;             // tree must be within this of the clicked point
const TANGO_RANGE = 260;           // tree footprints block units: DATA 165 is unreachable from the tree centre
const BKB_BASE = 9, BKB_MIN = 6;

const nMain = (u) => Math.min(u.items.length, ACTIVE_SLOTS);
const empty = () => ({ key: '', charges: 0, cd: 0, cdMax: 0 });
const norm = (w, key) => (w.data.items[key] ? key : w.data.items['item_' + key] ? 'item_' + key : key);
const melee = (u) => !u._ranged;
const val = (d, name, def) => (d && d.values && d.values[name] !== undefined ? d.values[name] : def);

export function applyStats(w, u, B) {
  const items = w.data.items;
  let bootMs = 0;
  for (let i = 0, n = nMain(u); i < n; i++) {
    const it = u.items[i]; if (!it.key) continue;
    const d = items[it.key]; if (!d) continue;
    if (d.stats) for (const k of STAT) if (d.stats[k]) { if (k === 'ms' && BOOTS[it.key]) continue; B[k] += d.stats[k]; }
    switch (it.key) {
      case 'item_boots': bootMs = Math.max(bootMs, d.stats.ms || 0); break;
      case 'item_phase_boots':
        bootMs = Math.max(bootMs, d.stats.ms || 0);
        B.dmg += melee(u) ? val(d, 'bonus_damage_melee', 0) : val(d, 'bonus_damage_range', 0);
        break;
      case 'item_power_treads': {
        bootMs = Math.max(bootMs, melee(u) ? val(d, 'bonus_movement_speed_melee', 55) : val(d, 'bonus_movement_speed_ranged', 45));
        B[it._attr || 'str'] += val(d, 'bonus_stat', 10);
        break;
      }
      case 'item_enchanted_mango': B.hpRegen += val(d, 'hp_regen', 0); break;
    }
  }
  B.ms += bootMs;
}

function nearShop(w, u) {
  const list = w.shopPos(u.team);
  for (const s of list) if (Math.hypot(s.x - u.x, s.y - u.y) <= SHOP_RANGE) return true;
  return false;
}

const msg = (w, u, text) => { const p = w.players.get(u.owner); if (p) evMsg(w, text, p.sid); };

// ------------------------------------------------------------------------------------------------ recipes
/** Cheapest way to obtain `key` given unclaimed inventory. Returns {cost, used:[slot..], parts:[keys]} (cost = gold to pay). */
function plan(w, u, key, claimed, top) {
  const d = w.data.items[key];
  if (!top) {   // an owned copy of the part wins
    for (let i = 0; i < u.items.length; i++) if (u.items[i].key === key && !claimed.has(i)) { claimed.add(i); return { cost: 0, used: [i] }; }
  }
  if (!d.recipe) return top ? null : { cost: d.cost, used: [] };
  const opts = d.recipe.alts && d.recipe.alts.length ? d.recipe.alts : [d.recipe.parts];
  let best = null;
  for (const parts of opts) {
    const cl = new Set(claimed);
    let cost = d.recipe.cost, used = [], ok = true;
    for (const pk of parts) {
      if (!w.data.items[pk]) { ok = false; break; }
      const sub = plan(w, u, pk, cl, false);
      if (!sub) { ok = false; break; }
      cost += sub.cost; for (const s of sub.used) used.push(s);
    }
    if (ok && (!best || cost < best.cost)) best = { cost, used, parts, cl };
  }
  if (!best) return null;
  for (const s of best.cl) claimed.add(s);
  return best;
}

function attrOf(keys) {
  if (keys.indexOf('item_robe') >= 0) return 'int';
  if (keys.indexOf('item_boots_of_elves') >= 0) return 'agi';
  return 'str';
}

/** Build `key` out of the slots in `used`; result goes into the first used slot (or an empty one). */
function assemble(w, u, key, used, paid, tMin) {
  const d = w.data.items[key];
  let stick = 0, belt = [];
  let t = tMin, pd = paid;
  for (const s of used) {
    const it = u.items[s];
    if (it.key === 'item_magic_stick') stick = Math.max(stick, it.charges || 0);
    belt.push(it.key);
    pd += it._paid || (w.data.items[it.key] ? w.data.items[it.key].cost : 0);
    if (it._t !== undefined) t = Math.min(t, it._t);
    u.items[s] = empty();
  }
  let slot = used.length ? Math.min.apply(null, used) : u.items.findIndex((it) => !it.key);
  if (slot >= ACTIVE_SLOTS) { const f = u.items.findIndex((it, j) => j < ACTIVE_SLOTS && !it.key); if (f >= 0) slot = f; }   // built from backpack parts only: result goes to the main inventory
  if (!Number.isFinite(t)) t = w.time;
  const out = { key, charges: d.charges || 0, cd: 0, cdMax: 0, _t: t, _paid: pd };
  if (key === 'item_magic_wand') out.charges = Math.min(stick, val(d, 'max_charges', 20));
  if (key === 'item_power_treads') out._attr = attrOf(belt);
  u.items[slot] = out;
  return slot;
}

/** Free recipes (recipe.cost 0: phase boots, treads) combine as soon as all parts are held. */
function autoCombine(w, u) {
  let again = true, guard = 0;
  while (again && guard++ < 4) {
    again = false;
    for (const k in w.data.items) {
      const d = w.data.items[k];
      if (!d.recipe || d.recipe.cost !== 0) continue;
      if (u.items.some((it) => it.key === k)) continue;
      const cl = new Set();
      let used = null;
      const opts = d.recipe.alts && d.recipe.alts.length ? d.recipe.alts : [d.recipe.parts];
      for (const parts of opts) {
        const c = new Set(); const sl = [];
        for (const pk of parts) {
          const i = u.items.findIndex((it, j) => it.key === pk && !c.has(j));
          if (i < 0) { sl.length = 0; break; }
          c.add(i); sl.push(i);
        }
        if (sl.length === parts.length) { used = sl; break; }
      }
      if (!used) continue;
      assemble(w, u, k, used, 0, Infinity);
      again = true;
    }
  }
  while (u.items.length > INV_SLOTS && !u.items[u.items.length - 1].key) u.items.pop();
}

// ---- shop stock (wards): per team, DATA `stock` {initial, max, time}; one charge restocks every `time` s while below max
function stockOf(w, team, key, d) {
  const all = w._stock || (w._stock = {});
  const s = all[team + key] || (all[team + key] = { n: d.stock.initial, t: null });
  while (s.t !== null && s.n < d.stock.max && w.time >= s.t) { s.n++; s.t += d.stock.time; }
  if (s.n >= d.stock.max) s.t = null;
  return s;
}
/** Units left in the team's stock for a stocked item (null when the item is not stocked). */
export function stockLeft(w, team, key) {
  const d = w.data.items[key];
  return d && d.stock ? stockOf(w, team, key, d).n : null;
}

export function buy(w, u, key) {
  key = norm(w, key);
  const d = w.data.items[key];
  if (key === 'item_aegis') return false;
  const st = d && d.stock && !u._dead && nearShop(w, u) ? stockOf(w, u.team, key, d) : null;
  if (st && st.n < 1) { msg(w, u, 'Out of stock'); return false; }
  const ok = buyInner(w, u, key);
  if (ok && st) { if (st.t === null) st.t = w.time + d.stock.time; st.n--; }
  return ok;
}

function buyInner(w, u, key) {
  const d = w.data.items[key];
  const p = w.players.get(u.owner);
  if (!d || !p || u._dead) return false;
  if (!nearShop(w, u)) { msg(w, u, 'Too far from shop'); return false; }
  // stackable consumable already held: add charges
  if (d.stack) {
    const ex = u.items.find((it) => it.key === key);
    if (ex) {
      if (p.gold < d.cost) { msg(w, u, 'Not enough gold'); return false; }
      p.gold -= d.cost; ex.charges += d.charges || 1; ex._paid = (ex._paid || 0) + d.cost; ex._t = w.time;
      u._dirty = true; return true;
    }
  }
  const claimed = new Set();
  const pl = d.recipe ? plan(w, u, key, claimed, true) : { cost: d.cost, used: [] };
  if (!pl) return false;
  if (p.gold < pl.cost) { msg(w, u, 'Not enough gold'); return false; }
  const free = u.items.findIndex((it) => !it.key);
  if (pl.used.length === 0 && free < 0) {
    // main + backpack full: allowed only if the purchase completes a free recipe
    u.items.push(empty());
    const idx = u.items.length - 1;
    u.items[idx] = { key, charges: d.charges || 0, cd: 0, cdMax: 0, _t: w.time, _paid: d.cost };
    autoCombine(w, u);
    if (u.items.length > INV_SLOTS) { u.items.pop(); msg(w, u, 'Inventory full'); return false; }
    p.gold -= pl.cost; u._dirty = true; return true;
  }
  p.gold -= pl.cost;
  if (pl.used.length) assemble(w, u, key, pl.used, pl.cost, w.time);
  else u.items[free] = { key, charges: d.charges || 0, cd: 0, cdMax: 0, _t: w.time, _paid: d.cost };
  autoCombine(w, u);
  u._dirty = true;
  return true;
}

export function sell(w, u, slot) {
  const it = u.items[slot], p = w.players.get(u.owner);
  if (!it || !it.key || !p || u._dead || !nearShop(w, u)) return false;
  const d = w.data.items[it.key];
  if (d && d.sell === false) return false;
  const cost = it._paid || (d ? d.cost : 0);
  p.gold += Math.round(cost * (w.time - (it._t === undefined ? -1e9 : it._t) <= SELL_FULL_WINDOW ? 1 : SELL_RATIO));
  u.items[slot] = empty();
  u._dirty = true;
  return true;
}

export function swap(w, u, a, b) {
  if (u.items[a] && u.items[a].key === 'item_aegis' && b >= ACTIVE_SLOTS) return false;   // the Aegis only works in the main inventory
  if (u.items[b] && u.items[b].key === 'item_aegis' && a >= ACTIVE_SLOTS) return false;
  if (a === b || a < 0 || b < 0 || a >= INV_SLOTS || b >= INV_SLOTS || a >= u.items.length || b >= u.items.length) return false;
  const t = u.items[a]; u.items[a] = u.items[b]; u.items[b] = t;
  // Dota rule: an item moved from the backpack into the main inventory is unusable for BACKPACK_SWAP_CD s (works for items without a cooldown too)
  const lock = (it) => { if (it.key) { it.cd = Math.max(it.cd, BACKPACK_SWAP_CD); it.cdMax = Math.max(it.cdMax, it.cd); } };
  if (a < ACTIVE_SLOTS && b >= ACTIVE_SLOTS) lock(u.items[a]);
  else if (b < ACTIVE_SLOTS && a >= ACTIVE_SLOTS) lock(u.items[b]);
  u._dirty = true;
  return true;
}

// ------------------------------------------------------------------------------------------------ actives
function consume(u, it) {
  if (it.charges > 1) { it._paid = Math.round((it._paid || 0) * (it.charges - 1) / it.charges); it.charges--; }
  else { const i = u.items.indexOf(it); if (i >= 0) u.items[i] = empty(); }
  u._dirty = true;
}

function rooted(u) { return (u._st & ST.ROOT) !== 0; }
function setCd(it, cd) { it.cd = cd; it.cdMax = cd; }
function treeNear(w, u, x, y, reach) {
  const ids = w.treesInRadius(x, y, TREE_PICK);
  let best = -1, bd = Infinity;
  for (const i of ids) {
    const t = w.map.trees[i];
    const dUnit = Math.hypot(t[0] - u.x, t[1] - u.y);
    if (dUnit > reach + TREE_REACH_SLACK) continue;
    const dPt = Math.hypot(t[0] - x, t[1] - y);
    if (dPt < bd) { bd = dPt; best = i; }
  }
  return best;
}

export function useInfo(w, u, slot) {
  if (!(slot >= 0 && slot < ACTIVE_SLOTS)) return null;   // backpack items cannot be used
  const r = useInfoOf(w, u, slot);
  const it = u.items[slot];
  return r && it.cd > 0 && r.ready ? { ...r, ready: false } : r;   // any cd (incl. the backpack-swap lock) blocks use
}
function useInfoOf(w, u, slot) {
  const it = u.items[slot];
  if (!it || !it.key) return null;
  const d = w.data.items[it.key]; if (!d) return null;
  const cdOk = it.cd <= 0;
  const base = { castPoint: 0, range: 0, targeting: 'none', ready: cdOk };
  switch (it.key) {
    case 'item_tango': return { ...base, targeting: 'point', range: TANGO_RANGE, ready: it.charges > 0 };
    case 'item_quelling_blade': return { ...base, targeting: 'point', range: d.castRange || 350 };
    case 'item_flask':
    case 'item_clarity':
      return { ...base, targeting: 'unit', range: d.castRange || 250, ready: it.charges > 0, targetTeam: 'FRIENDLY', targetType: ['HERO'] };
    case 'item_faerie_fire': return { ...base, ready: cdOk && it.charges > 0 };
    case 'item_enchanted_mango': return { ...base, ready: it.charges > 0 };
    case 'item_tpscroll': return { ...base, targeting: 'point', ready: cdOk && it.charges > 0 && u.mana + 1e-6 >= TP_MANA && !rooted(u) };
    case 'item_magic_stick': case 'item_magic_wand': return { ...base, ready: cdOk && it.charges > 0 };
    case 'item_phase_boots': return base;
    case 'item_power_treads': return { ...base, ready: true };
    case 'item_black_king_bar': return { ...base, ready: cdOk && u.mana + 1e-6 >= (d.manaCost || 0) };
    case 'item_blink': return { ...base, targeting: 'point', ready: cdOk && !rooted(u) };
    case 'item_ward_observer': case 'item_ward_sentry': return { ...base, targeting: 'point', range: d.castRange || 500, ready: cdOk && it.charges > 0 };
    default: return null;
  }
}

function tpDestination(w, u, x, y) {
  let best = null, bd = Infinity;
  const consider = (b) => {
    if (!b || b._dead || b.team !== u.team) return;
    const dd = Math.hypot(b.x - x, b.y - y);
    if (dd < bd) { bd = dd; best = b; }
  };
  for (const b of w.towers) consider(b);
  for (const b of w.rax) consider(b);
  for (const b of w.forts) consider(b);
  consider(w.fountains[u.team]);
  if (!best) return { x: u.x, y: u.y };
  const dx = x - best.x, dy = y - best.y, dl = Math.hypot(dx, dy) || 1;
  const off = best.kind === KIND.FOUNTAIN ? 0 : Math.min(dl, 170);
  return { x: best.x + dx / dl * off, y: best.y + dy / dl * off };
}

export function use(w, u, slot, target) {
  if (!(slot >= 0 && slot < ACTIVE_SLOTS)) return;
  const it = u.items[slot];
  if (!it || !it.key || it.cd > 0) return;   // cd also covers the backpack-swap lock for items with no cooldown of their own
  const d = w.data.items[it.key]; if (!d) return;
  const tx = target && Number.isFinite(target.x) ? target.x : u.x, ty = target && Number.isFinite(target.y) ? target.y : u.y;
  switch (it.key) {
    case 'item_tango': {
      if (it.charges <= 0) return;
      const i = treeNear(w, u, tx, ty, TANGO_RANGE);
      if (i < 0) { msg(w, u, 'No tree in range'); return; }
      w.cutTree(i);
      w.addModifier(u, { key: 'item_tango', src: u, dur: val(d, 'buff_duration', 16), hpRegen: val(d, 'health_regen', 7), debuff: false });
      consume(u, it);
      evSpell(w, 'item_tango', u.id, { x: Math.round(w.map.trees[i][0]), y: Math.round(w.map.trees[i][1]), dur: val(d, 'buff_duration', 16) });
      return;
    }
    case 'item_quelling_blade': {
      if (it.cd > 0) return;
      const i = treeNear(w, u, tx, ty, d.castRange || 350);
      if (i < 0) { msg(w, u, 'No tree in range'); return; }
      w.cutTree(i); setCd(it, d.cooldown || 4);
      evSpell(w, 'item_quelling_blade', u.id, { x: Math.round(w.map.trees[i][0]), y: Math.round(w.map.trees[i][1]) });
      return;
    }
    case 'item_flask': case 'item_clarity': {
      if (it.charges <= 0) return;
      const t = target && target.unit && !target.unit._dead && target.unit.team === u.team ? target.unit : u;
      const flask = it.key === 'item_flask';
      w.addModifier(t, flask
        ? { key: 'item_flask', src: u, dur: val(d, 'buff_duration', 13), hpRegen: val(d, 'health_regen', 30), debuff: false }
        : { key: 'item_clarity', src: u, dur: val(d, 'buff_duration', 25), manaRegen: val(d, 'mana_regen', 6), debuff: false });
      consume(u, it);
      evSpell(w, it.key, u.id, { t: t.id, dur: val(d, flask ? 'buff_duration' : 'buff_duration', 13) });
      return;
    }
    case 'item_faerie_fire': {
      if (it.charges <= 0 || it.cd > 0) return;
      w.heal(u, val(d, 'hp_restore', 85), u);
      setCd(it, d.cooldown || 5);
      consume(u, it);
      evSpell(w, 'item_faerie_fire', u.id, {});
      return;
    }
    case 'item_enchanted_mango': {
      if (it.charges <= 0) return;
      w.restoreMana(u, val(d, 'replenish_amount', 100));
      consume(u, it);
      evSpell(w, 'item_enchanted_mango', u.id, {});
      return;
    }
    case 'item_magic_stick': case 'item_magic_wand': {
      if (it.charges <= 0 || it.cd > 0) return;
      const amt = it.charges * val(d, 'restore_per_charge', 15);
      w.heal(u, amt, u); w.restoreMana(u, amt);
      it.charges = 0; setCd(it, d.cooldown || 15);
      evSpell(w, it.key, u.id, {});
      return;
    }
    case 'item_phase_boots': {
      if (it.cd > 0) return;
      const pct = melee(u) ? val(d, 'phase_movement_speed', 20) : val(d, 'phase_movement_speed_range', 10);
      u._noCollide = true;
      w.addModifier(u, { key: 'item_phase_boots', src: u, dur: val(d, 'phase_duration', 3), msPct: pct, debuff: false, onExpire: (ww, uu) => { uu._noCollide = false; } });
      setCd(it, d.cooldown || 8);
      evSpell(w, 'item_phase_boots', u.id, { dur: val(d, 'phase_duration', 3) });
      return;
    }
    case 'item_power_treads': {
      it._attr = it._attr === 'str' || !it._attr ? 'agi' : it._attr === 'agi' ? 'int' : 'str';
      u._dirty = true;
      return;
    }
    case 'item_black_king_bar': {
      if (it.cd > 0 || u.mana + 1e-6 < (d.manaCost || 0)) return;
      u.mana -= d.manaCost || 0;
      const dur = Math.max(BKB_MIN, BKB_BASE - (it._uses || 0));
      it._uses = (it._uses || 0) + 1;
      w.dispel(u, { debuffs: true });
      w.addModifier(u, { key: 'item_black_king_bar', src: u, dur, status: ST.MAGIC_IMMUNE, purge: 'none', debuff: false });
      setCd(it, d.cooldown || 95);
      evSpell(w, 'item_black_king_bar', u.id, { dur });
      return;
    }
    case 'item_ward_observer': case 'item_ward_sentry': {
      if (it.charges <= 0 || it.cd > 0) return;
      const ward = placeWard(w, u, it.key, tx, ty);
      evSpell(w, it.key, u.id, { x: Math.round(ward.x), y: Math.round(ward.y) });
      setCd(it, d.cooldown || 1);
      consume(u, it);
      return;
    }
    case 'item_blink': {
      if (it.cd > 0 || rooted(u)) return;
      let dx = tx - u.x, dy = ty - u.y; const dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      const L = Math.min(dist, BLINK_RANGE);
      dx /= dist; dy /= dist;
      const x0 = u.x, y0 = u.y;
      u._mv = null;
      w.blink(u, x0 + dx * L, y0 + dy * L);
      setCd(it, d.cooldown || 15);
      return;
    }
    case 'item_tpscroll': {
      if (it.charges <= 0 || it.cd > 0 || u.mana + 1e-6 < TP_MANA || rooted(u)) return;
      const dest = tpDestination(w, u, tx, ty);
      u.mana -= TP_MANA;
      setCd(it, d.cooldown || 80);
      evTp(w, u.id, dest.x, dest.y, TP_CHANNEL);
      return {
        key: 'item_tpscroll', channel: TP_CHANNEL,
        end(ww, uu, ch, interrupted) {
          if (interrupted) { uu.mana = Math.min(uu.maxMana, uu.mana + TP_MANA); it.cd = TP_HIT_RETRY_CD; return; }
          if (uu.items.indexOf(it) < 0) return;
          consume(uu, it);
          ww.teleport(uu, dest.x, dest.y);
          uu._mv = null;
        },
      };
    }
  }
}

// ------------------------------------------------------------------------------------------------ hooks
function heroSource(w, src) {
  if (!src) return false;
  if (src.kind === KIND.HERO) return true;
  return !!(src.owner && w.players.has(src.owner));
}

export function onAttack(w, u, tgt, info) {
  let crit = null;
  for (let i = 0, n = nMain(u); i < n; i++) {
    const it = u.items[i];
    if (it.key === 'item_quelling_blade' && tgt && tgt.kind === KIND.CREEP) {
      const d = w.data.items[it.key];
      info.dmg += melee(u) ? val(d, 'damage_bonus', 8) : val(d, 'damage_bonus_ranged', 4);
    } else if (it.key === 'item_lesser_crit' && !crit) crit = w.data.items[it.key];
  }
  if (crit) {
    if (w.rand() * 100 < val(crit, 'crit_chance', 30)) info.crit = Math.max(info.crit || 1, val(crit, 'crit_multiplier', 160) / 100);
  }
}
export function onAttackLanded(w, u, tgt, info, dealt) {}
export function onAttacked(w, u, attacker, info, dealt) {}

export function onDamaged(w, u, src, dealt, type) {
  if (!(dealt > 0) || !src) return;
  if (src.team === u.team) return;
  const hero = heroSource(w, src);
  if (u._mods.length) {
    if (hero) w.removeModifier(u, 'item_flask');
    w.removeModifier(u, 'item_clarity');
  }
  if (hero) {
    for (let i = 0, n = nMain(u); i < n; i++) {
      const it = u.items[i];
      if (it.key === 'item_blink' && it.cd < BLINK_HIT_CD) { it.cd = BLINK_HIT_CD; if (it.cdMax < BLINK_HIT_CD) it.cdMax = BLINK_HIT_CD; }
    }
  }
}

export function onKill(w, u, victim) {}

export function onEnemySpell(w, u, caster, key) {
  for (let i = 0, n = nMain(u); i < n; i++) {
    const it = u.items[i];
    if (it.key !== 'item_magic_stick' && it.key !== 'item_magic_wand') continue;
    const mx = val(w.data.items[it.key], 'max_charges', 10);
    if (it.charges < mx) it.charges++;
  }
}
export function onDeath(w, u, killer) {}

export function tick(w, u, dt) {   // cooldowns and the Aegis timer run for the backpack too
  for (let i = 0; i < u.items.length; i++) {
    const it = u.items[i];
    if (it.cd > 0) it.cd = Math.max(0, it.cd - dt);
    if (it._exp !== undefined && w.time >= it._exp) { u.items[i] = empty(); u._dirty = true; }   // Aegis timeout
  }
}

// ------------------------------------------------------------------------------------------------ Aegis of the Immortal
/** Put an Aegis (expires after DATA disappear_time, 5 min) in u's main inventory (a main item steps into a free backpack slot if needed). False when full. */
export function grantAegis(w, u) {
  const d = w.data.items.item_aegis, exp = w.time + (d && d.values ? d.values.disappear_time : 300);
  const have = u.items.find((it) => it.key === 'item_aegis');
  if (have) { have._exp = exp; return true; }
  let free = u.items.findIndex((it, j) => j < ACTIVE_SLOTS && !it.key);
  if (free < 0) {
    const bp = u.items.findIndex((it, j) => j >= ACTIVE_SLOTS && !it.key);
    if (bp < 0) return false;
    free = ACTIVE_SLOTS - 1; u.items[bp] = u.items[free];
  }
  u.items[free] = { key: 'item_aegis', charges: 0, cd: 0, cdMax: 0, _t: w.time, _paid: 0, _exp: exp };
  u._dirty = true;
  return true;
}
/** Dying hero: spend its Aegis. Returns true when it had one (killUnit then makes it reincarnate). */
export function consumeAegis(w, u) {
  const i = u.items.findIndex((it) => it.key === 'item_aegis');
  if (i < 0) return false;
  u.items[i] = empty(); u._dirty = true;
  return true;
}
