// Player/bot orders: validation, queue, and the per-tick order executor (move / attack / amove / hold / cast / item).
import { KIND, ST, ABF, ORDER, ACTIVE_SLOTS } from '../../../shared/protocol.js';
import { canCast, canUseItem, endChannel, interrupt, beginChannel } from './status.js';
import { getHandler } from './abilities/index.js';
import { attackable, inAttackRange, acquire } from './combat.js';
import { moveTo, follow, stepMove, faceToward } from './move.js';
import * as H from './heroes.js';
import * as items from './items.js';
import { evSpell, evMsg } from './events.js';

const MAX_QUEUE = 8;
const fin = (n) => typeof n === 'number' && Number.isFinite(n);
const lv = (arr, level) => (arr && arr.length ? arr[Math.min(Math.max(level, 1), arr.length) - 1] : 0);

// ---------------------------------------------------------------------------------------------------------------- issuing
/** Validate + apply one order for a player. Returns true when accepted. */
export function issue(w, pid, o) {
  if (!o || typeof o !== 'object') return false;
  const p = w.players.get(pid);
  if (!p) return false;
  const u = w.units.get(p.heroId);
  if (!u) return false;
  switch (o.t) {
    case ORDER.LEARN: return !u._dead && H.learn(w, u, o.slot | 0);
    case ORDER.BUY: { const k = o.key ?? o.item; return typeof k === 'string' && !!items.buy(w, u, k); }
    case ORDER.SELL: return !!items.sell(w, u, o.slot | 0);
    case ORDER.SWAP: return !!items.swap(w, u, o.a | 0, o.b | 0);
  }
  if (u._dead) return false;
  return push(w, u, o);
}

/** Order for any controllable unit (used by bots / summons / ability code). */
export function push(w, u, o) {
  let ord;
  switch (o.t) {
    case ORDER.MOVE: case ORDER.AMOVE:
      if (!fin(o.x) || !fin(o.y)) return false;
      ord = { t: o.t, x: Math.max(-8800, Math.min(8800, o.x)), y: Math.max(-8800, Math.min(8800, o.y)), _s: 0 }; break;
    case ORDER.ATTACK:
      if (typeof o.id !== 'string') return false;
      { const t = w.units.get(o.id); if (!t || !attackable(u, t)) return false; }
      ord = { t: o.t, id: o.id, _s: 0 }; break;
    case ORDER.STOP: ord = { t: ORDER.STOP }; break;
    case ORDER.HOLD: ord = { t: ORDER.HOLD }; break;
    case ORDER.CAST: case ORDER.ITEM:
      if (!Number.isInteger(o.slot) || o.slot < 0) return false;
      if (o.t === ORDER.CAST) {
        const ab = u.abilities[o.slot];
        if (!ab || ab.level < 1) return false;
        if (toggleImmediate(w, u, ab)) return true;
      } else if (o.slot >= ACTIVE_SLOTS || o.slot >= u.items.length || !u.items[o.slot].key) return false;   // backpack items cannot be used
      ord = { t: o.t, slot: o.slot, id: typeof o.id === 'string' ? o.id : '', x: fin(o.x) ? o.x : NaN, y: fin(o.y) ? o.y : NaN, _stage: 0 }; break;
    default: return false;
  }
  if (!o.q || ord.t === ORDER.STOP || ord.t === ORDER.HOLD) {
    if (u._channel && !u._channel.noInterruptOnOrder) endChannel(w, u, true);
    else if (u._channel) return false;
    u._wind = 0; u._windTgt = null; u._q.length = 0; u._mv = null; u._tgt = null;
    if (ord.t === ORDER.STOP) return true;
  } else if (u._q.length >= MAX_QUEUE) return false;
  u._q.push(ord);
  return true;
}

function toggleImmediate(w, u, ab) {
  const h = getHandler(ab.key), d = w.data.abilities[ab.key];
  const b = d ? d.behavior : [];
  if (h.autocast || b.indexOf('AUTOCAST') >= 0) { ab.flags ^= ABF.AUTOCAST_ON; if (h.toggle) h.toggle(w, u, ab); return true; }
  if (b.indexOf('TOGGLE') >= 0) { ab.flags ^= ABF.TOGGLE_ON; u._dirty = true; u._lastCast = { key: ab.key, level: ab.level, t: w.time }; if (h.cast) h.cast(w, u, ab, null); return true; }
  return false;
}

const shift = (u) => { u._q.shift(); u._tgt = null; };

// ---------------------------------------------------------------------------------------------------------------- executor
/** One tick of order processing for a player-controlled unit. Sets u._tgt (unit to auto-attack) and u._mv. */
export function think(w, u, dt) {
  if (u._channel) { tickChannel(w, u, dt); u._tgt = null; return; }
  if (u._st & (ST.STUN | ST.DEAD)) { u._tgt = null; return; }
  if (u._kb) return;
  if (u._st & ST.TAUNT) { const tm = tauntSource(w, u); if (tm) { chase(w, u, tm, dt); return; } }
  const o = u._q[0];
  if (!o) { idle(w, u); return; }
  switch (o.t) {
    case ORDER.MOVE:
      u._tgt = null;
      if (!o._s) { o._s = 1; moveTo(w, u, o.x, o.y, 6, false); }
      if (stepMove(w, u, dt)) shift(u);
      break;
    case ORDER.AMOVE: {
      let t = u._tgt;
      if (t && !attackable(u, t)) t = u._tgt = null;
      if (!t && ((w.tick + u._nid) & 3) === 0) { t = u._tgt = acquire(w, u, scanRange(u)); if (t) { u._mv = null; o._s = 0; } }
      if (t) { chase(w, u, t, dt); break; }
      if (!o._s) { o._s = 1; moveTo(w, u, o.x, o.y, 8, false); }
      if (stepMove(w, u, dt)) shift(u);
      break;
    }
    case ORDER.ATTACK: {
      const t = w.units.get(o.id);
      if (!t || !attackable(u, t)) { shift(u); u._mv = null; break; }
      u._tgt = t; chase(w, u, t, dt);
      break;
    }
    case ORDER.HOLD: {
      let t = u._tgt;
      if (t && !(attackable(u, t) && inAttackRange(u, t, 0))) t = u._tgt = null;
      if (!t && !(u._st & ST.INVIS) && ((w.tick + u._nid) & 3) === 0) u._tgt = acquire(w, u, u.atkRange + u.radius);
      break;
    }
    case ORDER.CAST: case ORDER.ITEM: doCast(w, u, o, dt); break;
    default: shift(u);
  }
}

/** Attack-move scan: the unit's AttackAcquisitionRange (heroes 800, melee 600, Sniper 950) but never shorter than its attack reach. */
const scanRange = (u) => (u._acq ? Math.max(u._acq, u.atkRange + u.radius) : Math.max(u.atkRange + u.radius + 100, 450));

export function tauntSource(w, u) {
  for (const m of u._mods) if (m.status & ST.TAUNT && m.taunter) { const t = w.units.get(m.taunter); if (t && !t._dead) return t; }
  return null;
}

function idle(w, u) {
  let t = u._tgt;
  if (t && !(attackable(u, t) && inAttackRange(u, t, 20))) t = u._tgt = null;
  if (!t && u.atkRate > 0 && !(u._st & ST.INVIS) && ((w.tick + u._nid) & 3) === 0) u._tgt = acquire(w, u, u.atkRange + u.radius + 20);   // invisible units never auto-attack
}

/** Walk into range of t (chasing), attack once there. u._tgt must already be t. */
export function chase(w, u, t, dt) {
  u._tgt = t;
  if (inAttackRange(u, t, -4)) { if (u._mv && u._mv.tgt === t) u._mv = null; return; }
  if (!u._mv || u._mv.tgt !== t) follow(w, u, t, 8, true);
  stepMove(w, u, dt === undefined ? 1 / 30 : dt);
}

function tickChannel(w, u, dt) {
  const ch = u._channel;
  ch.left -= dt;
  if (ch.tick) ch.tick(w, u, ch, dt);
  if (!u._channel) return;
  if (ch.left <= 0) endChannel(w, u, false);
}

// ---------------------------------------------------------------------------------------------------------------- casting
function modeOf(h, d) {
  if (h.targeting) return h.targeting;
  const b = d ? d.behavior : null;
  if (!b) return 'none';
  if (b.indexOf('PASSIVE') >= 0) return 'passive';
  if (b.indexOf('UNIT_TARGET') >= 0) return 'unit';
  if (b.indexOf('POINT') >= 0) return 'point';
  return 'none';
}

function unitTargetOk(w, u, t, d, h, itemSpec) {
  if (!t || t._dead || (t._st & ST.INVULN && !(t.team === u.team))) return false;
  const tt = itemSpec ? itemSpec.targetTeam : d && d.targetTeam;
  const ty = itemSpec ? itemSpec.targetType : d && d.targetType;
  if (tt === 'ENEMY' && t.team === u.team) return false;
  if (tt === 'FRIENDLY' && t.team !== u.team) return false;
  if (ty && ty.length) {
    const isH = t.kind === KIND.HERO, isB = t._building;
    if (!((isH && ty.indexOf('HERO') >= 0) || (isB && ty.indexOf('BUILDING') >= 0) || (!isH && !isB && (ty.indexOf('BASIC') >= 0 || ty.indexOf('CREEP') >= 0)))) return false;
  }
  if (t.team !== u.team && (t._st & ST.MAGIC_IMMUNE) && !(h && h.pierce) && !(itemSpec && itemSpec.pierce)) return false;
  if (t.team !== u.team && (t._st & ST.INVIS) && !(t._st & ST.REVEALED)) return false;
  return true;
}

function notify(w, u, text) { const p = u.owner && w.players.get(u.owner); if (p) evMsg(w, text, p.sid); }

/** Describe the cast for ability or item orders. Returns null when the order is invalid. */
function castSpec(w, u, o) {
  if (o.t === ORDER.CAST) {
    const ab = u.abilities[o.slot];
    if (!ab || ab.level < 1) return null;
    const h = getHandler(ab.key), d = w.data.abilities[ab.key];
    const mode = modeOf(h, d);
    if (mode === 'passive') return null;
    return {
      ab, h, d, mode, itemSpec: null,
      range: (h.castRange ? h.castRange(w, u, ab) : lv(d && d.castRange, ab.level)) + (u._castRangeBonus && mode !== 'none' ? u._castRangeBonus : 0),   // Rubick Arcane Supremacy
      point: h.castPoint ? h.castPoint(w, u, ab) : lv(d && d.castPoint, ab.level),
      ready: () => (canCast(u) ? (ab.cd > 0 ? 'cooldown' : u.mana + 1e-6 < ab.mana ? 'mana' : h.canCast ? h.canCast(w, u, ab, null) : true) : 'silenced'),
      exec: (tgt) => executeAbility(w, u, ab, tgt),
    };
  }
  const info = items.useInfo(w, u, o.slot);
  if (!info) return null;
  return {
    ab: null, h: null, d: null, mode: info.targeting || 'none', itemSpec: info, range: info.range || 0, point: info.castPoint || 0,
    ready: () => (canUseItem(u) ? (info.ready === false ? 'cooldown' : true) : 'muted'),
    exec: (tgt) => {
      const res = items.use(w, u, o.slot, tgt);
      if (res && res.channel > 0) { beginChannel(w, u, { key: res.key || 'item', dur: res.channel, tick: res.tick, end: res.end, noInterruptOnOrder: res.noInterruptOnOrder }); u._mv = null; }
      return res;
    },
  };
}

function doCast(w, u, o, dt) {
  const spec = castSpec(w, u, o);
  if (!spec) { shift(u); return; }
  if (!o._stage) {
    const r = spec.ready();
    if (r !== true) { if (typeof r === 'string') notify(w, u, r); shift(u); return; }
    let tgt = { unit: null, x: u.x, y: u.y };
    if (spec.mode === 'unit') {
      const tt = spec.itemSpec ? spec.itemSpec.targetTeam : spec.d && spec.d.targetTeam;
      const t = w.units.get(o.id) || (o.id == null && /FRIENDLY|ALLY/.test(String(tt)) ? u : null); // ally-target with no id = self-cast
      if (!unitTargetOk(w, u, t, spec.d, spec.h, spec.itemSpec)) { shift(u); return; }
      tgt = { unit: t, x: t.x, y: t.y };
    } else if (spec.mode === 'point') {
      if (fin(o.x) && fin(o.y)) tgt = { unit: null, x: o.x, y: o.y };
      else { const t = w.units.get(o.id); if (!t) { shift(u); return; } tgt = { unit: t, x: t.x, y: t.y }; }
    }
    if (spec.mode !== 'none' && spec.range > 0) {
      const d = Math.hypot(tgt.x - u.x, tgt.y - u.y) - (tgt.unit ? tgt.unit.radius : 0);
      if (d > spec.range) {
        if (!u._mv) { if (tgt.unit) follow(w, u, tgt.unit, Math.max(spec.range - 20, 10) + tgt.unit.radius, true); else moveTo(w, u, tgt.x, tgt.y, Math.max(spec.range - 20, 10), false); }
        stepMove(w, u, dt);
        return;
      }
    }
    u._mv = null;
    if (spec.mode !== 'none' && (tgt.x !== u.x || tgt.y !== u.y)) { if (faceToward(u, Math.atan2(tgt.y - u.y, tgt.x - u.x), dt) > 0.1) return; }
    o._stage = 1; o._cp = spec.point; o._tgt = tgt;
    u._animType = 'cast'; u._animUntil = w.time + spec.point + 0.25; u.animSeq = (u.animSeq + 1) & 0xffff; u.animRate = 1;
  }
  o._cp -= dt;
  if (o._cp > 0) return;
  // execute
  const tg = o._tgt;
  if (tg.unit) {
    if (tg.unit._dead) { shift(u); return; }
    tg.x = tg.unit.x; tg.y = tg.unit.y;
  }
  const r = spec.ready();
  shift(u);
  if (r !== true) return;
  spec.exec(tg);
}

/** Pay mana/cooldown, emit EV.SPELL, run the handler. Callable directly by other systems (no range / cast point). */
export function executeAbility(w, u, ab, tgt) {
  const h = getHandler(ab.key);
  tgt = tgt || { unit: null, x: u.x, y: u.y };
  u.mana -= ab.mana; if (u.mana < 0) u.mana = 0;
  ab.cd = ab.cdMax;
  const keepInvis = (w.data.abilities[ab.key]?.behavior || []).includes('IGNORE_INVISIBLE');
  if (!keepInvis) for (const m of u._mods) if (m.breakOnAttack) { u._mods.splice(u._mods.indexOf(m), 1); u._dirty = true; break; }
  const ev = evSpell(w, ab.key, u.id, { t: tgt.unit ? tgt.unit.id : undefined, x: Math.round(tgt.x), y: Math.round(tgt.y), lv: ab.level });
  u._lastCast = { key: ab.key, level: ab.level, t: w.time };   // Rubick Spell Steal reads this
  let res;
  const post = u._castCtx ? u._castCtx(w, u, ab) : null;   // Rubick: stolen-spell context (restored right after h.cast)
  if (h.cast) res = h.cast(w, u, ab, tgt);
  if (post) post();
  // orchestrator hook: enemy heroes in range see the cast (magic stick/wand charges)
  if (items.onEnemySpell && !(w.data.abilities[ab.key]?.behavior || []).includes('PASSIVE')) {
    for (const v of w.unitsInRadius(u.x, u.y, 1200, { enemyOf: u, heroes: true })) items.onEnemySpell(w, v, u, ab.key);
  }
  if (res && typeof res === 'object') {
    const { channel, tick, end, noInterruptOnOrder, ...extra } = res;
    Object.assign(ev, extra);
    if (channel > 0) {
      beginChannel(w, u, { key: ab.key, dur: channel, tick, end, noInterruptOnOrder });
      u._mv = null;
    }
  }
  u._dirty = true;
  return ev;
}

export { interrupt };
