// BOTS (items agent): simple lane AI for players with isBot. `update(w, dt)` runs once per tick before units think.
//
// Per bot (thinks every THINK ticks, staggered by slot): learn skills, buy (starting set + per-hero build, only in shop range),
// use consumables / BKB / TP, retreat (hp < 30 %, enemy tower without creeps, outnumbered), cast abilities on enemy heroes in range
// (from DATA behaviour), last-hit / deny, attack towers together with creeps, else amove along the lane behind the front creep.
// Orders are only re-issued when they change (a non-queued order cancels attack windups and channels).
import { KIND, TEAM, ST } from '../../../shared/protocol.js';
import { SHOP_RANGE, TOWER_RANGE, armorMult } from '../../../shared/constants.js';
import { lanePath } from './creeps.js';

const THINK = 6;
const LANE5 = ['safe', 'mid', 'off', 'safe', 'off'];
const START = {
  melee: ['item_tango', 'item_flask', 'item_quelling_blade', 'item_tpscroll'],
  caster: ['item_tango', 'item_clarity', 'item_magic_stick', 'item_branches', 'item_branches', 'item_tpscroll'],
};
const BUILD = {
  npc_dota_hero_sven: ['item_phase_boots', 'item_bracer', 'item_lesser_crit', 'item_black_king_bar', 'item_blink'],
  npc_dota_hero_axe: ['item_phase_boots', 'item_bracer', 'item_black_king_bar', 'item_blink'],
  npc_dota_hero_juggernaut: ['item_phase_boots', 'item_wraith_band', 'item_lesser_crit', 'item_black_king_bar', 'item_blink'],
  npc_dota_hero_sniper: ['item_power_treads', 'item_wraith_band', 'item_lesser_crit', 'item_black_king_bar', 'item_blink'],
  npc_dota_hero_drow_ranger: ['item_power_treads', 'item_wraith_band', 'item_lesser_crit', 'item_black_king_bar', 'item_blink'],
  npc_dota_hero_lina: ['item_null_talisman', 'item_boots', 'item_magic_wand', 'item_black_king_bar', 'item_blink'],
  npc_dota_hero_lion: ['item_null_talisman', 'item_boots', 'item_magic_wand', 'item_blink', 'item_black_king_bar'],
  npc_dota_hero_crystal_maiden: ['item_boots', 'item_null_talisman', 'item_magic_wand', 'item_blink', 'item_black_king_bar'],
  npc_dota_hero_zuus: ['item_null_talisman', 'item_boots', 'item_magic_wand', 'item_black_king_bar', 'item_blink'],
  npc_dota_hero_invoker: ['item_null_talisman', 'item_boots', 'item_magic_wand', 'item_black_king_bar', 'item_blink'],
};
const MELEE_CORE = { npc_dota_hero_sven: 1, npc_dota_hero_axe: 1, npc_dota_hero_juggernaut: 1, npc_dota_hero_sniper: 2, npc_dota_hero_drow_ranger: 2 };
const JUNK = ['item_tango', 'item_flask', 'item_clarity', 'item_branches', 'item_faerie_fire', 'item_enchanted_mango', 'item_quelling_blade', 'item_tpscroll'];
const INVOKER_ORBS = [0, 1, 2], INVOKER_INVOKE = 5;
const RECIPE = { invoker_cold_snap: 'QQQ', invoker_sun_strike: 'EEE', invoker_tornado: 'WWQ' };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lvl = (arr, level) => (arr && arr.length ? arr[Math.min(Math.max(level, 1), arr.length) - 1] : 0);
const has = (u, key) => u.items.some((it) => it.key === key);
const slotOf = (u, key) => u.items.findIndex((it) => it.key === key);

export function update(w, dt) {
  if (w.winner >= 0) return;
  for (const [pid, p] of w.players) {
    if (!p.isBot) continue;
    if (((w.tick + (p.slot | 0) * 2 + (p.team === TEAM.DIRE ? 1 : 0)) % THINK) !== 0) continue;
    const u = w.units.get(p.heroId);
    if (!u) continue;
    const st = p._bot || (p._bot = { mode: 'lane', bi: 0, sig: '', cmdT: -99, buyT: -99, shopT: -99, backUntil: -1, orbN: 0, pi: 0, errs: 0, tpTried: true });
    try { think(w, pid, p, u, st); } catch (e) { st.errs++; st.lastErr = e; }
  }
}

// ------------------------------------------------------------------------------------------------ helpers
function laneName(w, p) {
  const k = LANE5[(p.slot | 0) % 5];
  if (k === 'mid') return 'mid';
  const safe = p.team === TEAM.RADIANT ? 'bot' : 'top', off = p.team === TEAM.RADIANT ? 'top' : 'bot';
  return k === 'safe' ? safe : off;
}

function cmd(w, pid, u, st, o) {
  const sig = o.t + ':' + (o.id !== undefined ? o.id : Math.round(o.x / 80) + ',' + Math.round(o.y / 80)) + (o.slot !== undefined ? '#' + o.slot : '');
  if (sig === st.sig && u._q.length > 0) return false;
  st.sig = sig; st.cmdT = w.time;
  return w.order(pid, o);
}

function nearestIdx(path, x, y, from, to) {
  let best = from, bd = Infinity;
  for (let i = Math.max(0, from); i < Math.min(path.length, to); i++) {
    const d = (path[i].x - x) ** 2 + (path[i].y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Per-tick cache: front creep index and creep counts per team+lane. */
function fronts(w) {
  const c = w._botFront;
  if (c && c.tick === w.tick) return c;
  const f = {}, L = {};
  for (const v of w.units.values()) {
    if (v.kind !== KIND.CREEP || v._dead || !v._lane) continue;
    const k = v.team + v._lane;
    (L[k] || (L[k] = [])).push(v);
    if (f[k] === undefined || v._li > f[k]) f[k] = v._li;
  }
  return (w._botFront = { tick: w.tick, f, L });
}

function nearShop(w, u) {
  for (const s of w.shopPos(u.team)) if (dist(s, u) <= SHOP_RANGE - 40) return true;
  return false;
}
function nearestShop(w, u) {
  let b = null, bd = Infinity;
  for (const s of w.shopPos(u.team)) { const d = dist(s, u); if (d < bd) { bd = d; b = s; } }
  return b;
}

function enemyTowerNear(w, u, r) {
  let best = null, bd = Infinity;
  for (const t of w.towers) {
    if (t._dead || t.team === u.team) continue;
    const d = dist(t, u);
    if (d < r && d < bd) { bd = d; best = t; }
  }
  return best;
}

function alliedCreepsNear(w, u, x, y, r) {
  let n = 0;
  for (const v of w.unitsInRadius(x, y, r, { allyOf: u, buildings: false })) if (v.kind === KIND.CREEP) n++;
  return n;
}

// ------------------------------------------------------------------------------------------------ shopping / skills
function learnSkills(w, pid, u) {
  if (u.skillPoints <= 0) return;
  const inv = u.abilities.length > 5 && u.abilities[5].key === 'invoker_invoke';
  const cand = inv ? [0, 2, 1] : [0, 1, 2, 3];
  for (let guard = 0; guard < 3 && u.skillPoints > 0; guard++) {
    // ult first whenever allowed
    if (!inv && w.order(pid, { t: 'learn', slot: 3 })) continue;
    let best = -1, bl = 99;
    for (const s of cand) {
      if (!inv && s === 3) continue;
      const ab = u.abilities[s]; if (!ab) continue;
      const d = w.data.abilities[ab.key];
      if (!d || d.behavior.indexOf('NOT_LEARNABLE') >= 0 || ab.level >= d.maxLevel) continue;
      if (ab.level < bl) { bl = ab.level; best = s; }
    }
    if (best < 0 || !w.order(pid, { t: 'learn', slot: best })) break;
  }
}

function buildOf(u) { return BUILD[u.key] || BUILD.npc_dota_hero_sven; }
function startOf(u) { return MELEE_CORE[u.key] === 1 ? START.melee : MELEE_CORE[u.key] === 2 ? START.melee.filter((k) => k !== 'item_quelling_blade') : START.caster; }

const SUPERSEDED = { item_boots: ['item_phase_boots', 'item_power_treads'], item_magic_stick: ['item_magic_wand'] };

/** next build item: {key, need (gold still needed, held recipe parts discounted)} */
function nextTarget(w, u, p) {
  const build = buildOf(u);
  for (const k of build) {
    if (has(u, k)) continue;
    const sup = SUPERSEDED[k];
    if (sup && sup.some((x) => has(u, x))) continue;
    const d = w.data.items[k]; if (!d) continue;
    let need = d.cost;
    if (d.recipe) for (const pk of d.recipe.parts) if (has(u, pk)) need -= w.data.items[pk].cost;
    return { key: k, need: Math.max(need, 0), d };
  }
  return null;
}

/** what to buy now: the target if affordable, else its priciest affordable missing part (while a slot stays free) */
function buyChoice(w, u, p) {
  const tg = nextTarget(w, u, p);
  if (!tg) return null;
  if (p.gold >= tg.need) return tg.key;
  const parts = tg.d.recipe && tg.d.recipe.parts;
  if (!parts || u.items.filter((it) => !it.key).length < 2) return null;
  let best = null, bc = 0;
  const seen = new Set();
  for (const pk of parts) {
    if (has(u, pk) || seen.has(pk)) continue;
    seen.add(pk);
    const c = w.data.items[pk] ? w.data.items[pk].cost : 0;
    if (c <= p.gold && c > bc) { bc = c; best = pk; }
  }
  return best;
}

function shopping(w, pid, p, u, st) {
  if (w.time - st.buyT < 2) return;
  st.buyT = w.time;
  // starting set once
  const set = startOf(u);
  for (let i = st.startI | 0; i < set.length; i++) {
    const k = set[i];
    if (!w.order(pid, { t: 'buy', key: k }) && p.gold >= (w.data.items[k] ? w.data.items[k].cost : 0)) break;   // out of range: retry later
    st.startI = i + 1;
  }
  for (let guard = 0; guard < 4; guard++) {
    const k = buyChoice(w, u, p);
    if (!k) return;
    if (w.order(pid, { t: 'buy', key: k })) continue;
    // full inventory: sell junk to make room
    if (u.items.every((it) => it.key)) {
      for (const jk of JUNK) { const s = slotOf(u, jk); if (s >= 0) { w.order(pid, { t: 'sell', slot: s }); break; } }
    }
    return;
  }
}

// ------------------------------------------------------------------------------------------------ casting
function foesNear(w, u, r) { return w.unitsInRadius(u.x, u.y, r, { enemyOf: u, heroes: true }); }

function tryCasts(w, pid, p, u, st, foes, hpPct) {
  if (!foes.length) return false;
  if (u._st & (ST.SILENCE | ST.STUN | ST.HEX)) return false;
  const invoker = u.abilities.length > 5 && u.abilities[5].key === 'invoker_invoke';
  for (let i = 0; i < u.abilities.length; i++) {
    const ab = u.abilities[i];
    if (!ab || ab.level < 1 || ab.cd > 0 || u.mana + 1e-6 < (ab.mana || 0)) continue;
    if (invoker && (i <= 2 || i === INVOKER_INVOKE)) continue;
    const d = w.data.abilities[ab.key];
    if (!d || !d.behavior) continue;
    const b = d.behavior;
    if (b.indexOf('PASSIVE') >= 0 || b.indexOf('AUTOCAST') >= 0 || b.indexOf('TOGGLE') >= 0 || b.indexOf('NOT_LEARNABLE') >= 0) continue;
    const range = lvl(d.castRange, ab.level);
    let tgt = null, bd = Infinity;
    const reach = b.indexOf('NO_TARGET') >= 0 ? 450 : (range || 700) + 60;
    for (const f of foes) { const dd = dist(f, u); if (dd < reach && dd < bd && !(f._st & ST.INVULN)) { bd = dd; tgt = f; } }
    if (d.ult && tgt && tgt.hp > tgt.maxHp * 0.65) continue;
    if (b.indexOf('UNIT_TARGET') >= 0) {
      if (d.targetTeam === 'FRIENDLY') { if (hpPct < 0.7) { if (cmd(w, pid, u, st, { t: 'cast', slot: i, id: u.id })) return true; } continue; }
      if (!tgt || (tgt._st & ST.MAGIC_IMMUNE && !(d.dispellable === 'strong'))) continue;
      if (cmd(w, pid, u, st, { t: 'cast', slot: i, id: tgt.id })) return true;
    } else if (b.indexOf('POINT') >= 0) {
      if (!tgt) continue;
      if (cmd(w, pid, u, st, { t: 'cast', slot: i, x: tgt.x, y: tgt.y })) return true;
    } else if (b.indexOf('NO_TARGET') >= 0) {
      if (!tgt) continue;
      if (cmd(w, pid, u, st, { t: 'cast', slot: i })) return true;
    }
  }
  if (invoker) return invokerCombo(w, pid, u, st, foes);
  return false;
}

/** Invoker: pick cold snap / sun strike / tornado, make the orbs match, Invoke, then the generic caster fires it from D/F. */
function invokerCombo(w, pid, u, st, foes) {
  const q = u.abilities[0].level, wx = u.abilities[1].level, e = u.abilities[2].level;
  const near = foes.some((f) => dist(f, u) < 900);
  if (!near || u.mana < 120) return false;
  const inv = u._inv;
  const spellCd = (k) => {
    for (const s of [3, 4]) if (u.abilities[s] && u.abilities[s].key === k) return u.abilities[s].cd;
    return inv && inv.cd && inv.cd[k] > 0 ? inv.cd[k] : 0;
  };
  const wants = [];
  if (q >= 1) wants.push('invoker_cold_snap');
  if (e >= 1) wants.push('invoker_sun_strike');
  if (wx >= 1 && q >= 1) wants.push('invoker_tornado');
  const want = wants.find((k) => spellCd(k) <= 0 && !u.abilities.some((a, i) => (i === 3 || i === 4) && a.key === k));
  if (!want) return false;
  const recipe = RECIPE[want], orbs = (u.orbs || '');
  const sorted = (s) => s.split('').sort().join('');
  if (sorted(orbs) !== sorted(recipe)) {
    const letter = recipe[st.orbN++ % 3];
    return cmd(w, pid, u, st, { t: 'cast', slot: letter === 'Q' ? 0 : letter === 'W' ? 1 : 2, _n: st.orbN });
  }
  st.orbN = 0;
  const iv = u.abilities[INVOKER_INVOKE];
  if (iv && iv.level >= 1 && iv.cd <= 0 && u.mana >= (iv.mana || 0)) return cmd(w, pid, u, st, { t: 'cast', slot: INVOKER_INVOKE, _n: w.tick });
  return false;
}

// ------------------------------------------------------------------------------------------------ consumables
function useItems(w, pid, u, st, hpPct, foes) {
  const item = (key, extra) => {
    const s = slotOf(u, key); if (s < 0) return false;
    const it = u.items[s]; if (it.cd > 0) return false;
    return cmd(w, pid, u, st, Object.assign({ t: 'item', slot: s }, extra));
  };
  const manaPct = u.maxMana > 0 ? u.mana / u.maxMana : 1;
  if (foes.length >= 2 && hpPct < 0.85 && u.mana >= 50 && !(u._st & ST.MAGIC_IMMUNE) && foes.filter((f) => dist(f, u) < 700).length >= 2) {
    if (item('item_black_king_bar')) return true;
  }
  if (hpPct < 0.5 && !foes.length) {
    if (!w.hasModifier(u, 'item_flask') && item('item_flask', { id: u.id })) return true;
    if (!w.hasModifier(u, 'item_tango')) {
      const s = slotOf(u, 'item_tango');
      if (s >= 0) {
        const ids = w.treesInRadius(u.x, u.y, 300);
        if (ids.length) { const t = w.map.trees[ids[0]]; if (cmd(w, pid, u, st, { t: 'item', slot: s, x: t[0], y: t[1] })) return true; }
      }
    }
  }
  if (hpPct < 0.4 || (manaPct < 0.25 && foes.length)) {
    for (const k of ['item_magic_wand', 'item_magic_stick']) { const s = slotOf(u, k); if (s >= 0 && u.items[s].charges >= 3 && item(k)) return true; }
  }
  if (manaPct < 0.35 && !foes.length && !w.hasModifier(u, 'item_clarity') && item('item_clarity', { id: u.id })) return true;
  if (hpPct < 0.6 && item('item_faerie_fire')) return true;
  if (manaPct < 0.3 && item('item_enchanted_mango')) return true;
  return false;
}

// ------------------------------------------------------------------------------------------------ main think
function think(w, pid, p, u, st) {
  if (u._dead) { st.mode = 'lane'; st.sig = ''; st.tpTried = false; return; }
  learnSkills(w, pid, u);
  if (nearShop(w, u)) shopping(w, pid, p, u, st);
  if (u._channel) return;                                        // TP / channelled spell: do not touch
  const q0 = u._q[0];
  if (q0 && (q0.t === 'cast' || q0.t === 'item') && w.time - st.cmdT < 2.5) return;   // let a cast finish
  const team = u.team, hpPct = u.hp / u.maxHp;
  const lane = laneName(w, p);
  const path = lanePath(w, team, lane);
  const foes = foesNear(w, u, 1400);
  const fountain = w.fountains[team];

  // ---- mode switches
  if (st.mode === 'retreat') {
    if ((hpPct > 0.85 && u.mana > u.maxMana * 0.5) || w.time - st.modeT > 70) st.mode = 'lane';
  } else if (hpPct < 0.3) { st.mode = 'retreat'; st.modeT = w.time; }
  if (st.mode === 'shop' && (nearShop(w, u) || w.time - st.modeT > 60)) { st.mode = 'lane'; st.shopT = w.time; }

  if (st.mode === 'retreat') {
    if (!foes.length || hpPct < 0.2) useItems(w, pid, u, st, hpPct, foes);
    if (foes.length && hpPct < 0.3) { const s = slotOf(u, 'item_blink'); if (s >= 0 && u.items[s].cd <= 0) { cmd(w, pid, u, st, { t: 'item', slot: s, x: fountain.x, y: fountain.y }); return; } }
    cmd(w, pid, u, st, { t: 'move', x: fountain.x, y: fountain.y });
    return;
  }

  if (useItems(w, pid, u, st, hpPct, foes)) return;

  // ---- fight: abilities on enemy heroes
  if (tryCasts(w, pid, p, u, st, foes, hpPct)) return;

  // ---- lane geometry
  const F = fronts(w).f[team + lane];
  const tw = enemyTowerNear(w, u, TOWER_RANGE + 140);
  const allies = alliedCreepsNear(w, u, u.x, u.y, 650);
  const allyHeroes = w.unitsInRadius(u.x, u.y, 1000, { allyOf: u, heroes: true }).length;
  const foeHeroes = foes.filter((f) => dist(f, u) < 1000).length;
  const pi = st.pi = nearestIdx(path, u.x, u.y, Math.max(0, st.pi - 25), Math.min(path.length, st.pi + 70));
  const farOff = dist(path[pi], u) > 1100;
  if (farOff) st.pi = nearestIdx(path, u.x, u.y, 0, path.length);

  // ---- back off: under enemy tower without creeps, or heavily outnumbered
  if (st.backUntil > w.time || (tw && allies === 0 && hpPct < 1.01) || foeHeroes - allyHeroes >= 2) {
    if (st.backUntil <= w.time) st.backUntil = w.time + 3;
    const bi = Math.max(0, st.pi - 8), pt = path[bi];
    cmd(w, pid, u, st, { t: 'move', x: pt.x, y: pt.y });
    return;
  }

  // ---- shop trip when a big item is affordable
  if (st.mode === 'lane' && w.time > 60 && w.time - st.shopT > 90 && !foes.length) {
    if (p.gold >= 450 && buyChoice(w, u, p)) {
      st.mode = 'shop'; st.modeT = w.time;
    }
  }
  if (st.mode === 'shop') {
    const sh = nearestShop(w, u);
    const s = slotOf(u, 'item_tpscroll');
    if (s >= 0 && u.items[s].cd <= 0 && u.mana >= 75 && dist(u, sh) > 2800 && fountain) { cmd(w, pid, u, st, { t: 'item', slot: s, x: fountain.x, y: fountain.y }); return; }
    cmd(w, pid, u, st, { t: 'move', x: sh.x, y: sh.y });
    return;
  }

  // ---- far from the lane (after respawn): TP to it
  const dest = laneDest(w, u, path, F, lane, st);
  if (!st.tpTried && dist(u, dest) > 3800 && !foes.length) {
    const s = slotOf(u, 'item_tpscroll');
    st.tpTried = true;
    if (s >= 0 && u.items[s].cd <= 0 && u.mana >= 75) { cmd(w, pid, u, st, { t: 'item', slot: s, x: dest.x, y: dest.y }); return; }
  }

  // ---- last hit / deny
  const dmg = (u.dmgMin + u.dmgMax) / 2;
  let lh = null, lhHp = Infinity;
  const near = w.unitsInRadius(u.x, u.y, u.atkRange + 260, { buildings: false });
  for (const v of near) {
    if (v.kind !== KIND.CREEP || v._dead) continue;
    const enemy = v.team !== team;
    const real = dmg * (enemy ? armorMult(v.armor) : armorMult(v.armor));
    if (v.hp <= real * (u._ranged ? 1.0 : 1.1) && (enemy || v.hp < v.maxHp * 0.5) && v.hp < lhHp) { lhHp = v.hp; lh = v; }
  }
  if (lh) { if (cmd(w, pid, u, st, { t: 'attack', id: lh.id })) return; if (u._q.length) return; }

  // ---- tower push with creeps
  if (tw && hpPct > 0.5 && !(tw._st & ST.INVULN)) {
    const cs = alliedCreepsNear(w, u, tw.x, tw.y, 700);
    if (cs >= 2 && foeHeroes === 0) { cmd(w, pid, u, st, { t: 'attack', id: tw.id }); return; }
  }
  if (u._q.length && u._q[0].t === 'attack' && u._q[0].id && !lh) {
    const t = w.units.get(u._q[0].id);
    if (t && t._building) { const cs = alliedCreepsNear(w, u, t.x, t.y, 700); if (cs >= 2) return; }
  }

  // ---- walk the lane
  cmd(w, pid, u, st, { t: 'amove', x: dest.x, y: dest.y });
}

function laneDest(w, u, path, F, lane, st) {
  const team = u.team;
  let idx;
  if (F !== undefined) {
    // join the wave nearest to us (not one already under an enemy tower)
    let b = null, bd = Infinity;
    for (const c of fronts(w).L[team + lane] || []) {
      if (enemyTowerNear(w, c, TOWER_RANGE + 100)) continue;
      const d = dist(c, u);
      if (d < bd) { bd = d; b = c; }
    }
    if (b) return { x: b.x, y: b.y };
    idx = Math.max(1, Math.min(F, path.length - 1) - 3);
  } else {
    // no creeps yet: wait at our frontmost standing tower of the lane
    let t = null;
    for (const b of w.towers) if (!b._dead && b.team === team && b._lane === lane && (!t || b._tier < t._tier)) t = b;
    idx = t ? nearestIdx(path, t.x, t.y, 0, path.length) : 1;
    idx = Math.max(1, idx - 2);
  }
  return path[Math.min(idx, path.length - 1)];
}
