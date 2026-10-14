// Modifiers (buffs/debuffs/auras/DoTs) and the status bitmask (protocol ST). Pure.
//
// Modifier def (all optional except key):
//   key        string id ("sven_storm_bolt", "stun"...)         src: unit | unit id     dur: seconds (Infinity = permanent)
//   status     ST.* bits it grants (STUN, ROOT, SILENCE, HEX, INVIS, INVULN, MAGIC_IMMUNE, DISARM, TAUNT, ...)
//   ms msPct as armor dmg str agi int mr hpRegen manaRegen hp mana range   (stat bonuses; msPct < 0 = slow, strongest slow wins)
//   dot        {dps, type:'mag'|'phys'|'pure', interval=1}
//   aura       {radius, team:'ally'|'enemy', def:<modifier def>, interval=0.25}   (applied to units in radius, refreshed)
//   stack      'refresh' (default; same key+src refreshes) | 'stack' (stacks++ up to maxStacks, stat values x stacks) | 'unique' (same key replaces regardless of src)
//   debuff     bool (default: src is an enemy of the target). Debuffs are blocked by MAGIC_IMMUNE unless def.pierce.
//   purge      'basic' | 'strong' | 'none' (default 'basic'; 'none' = not removable by dispel)
//   fade       seconds before the status bits take effect (invis fade)       breakOnAttack  removed when the holder attacks/casts
//   hidden     not shown in `buffs`          taunter  unit id (TAUNT)          onTick(w,u,m,dt)  onExpire(w,u,m,reason)
import { ST } from '../../../shared/protocol.js';
import { damage } from './combat.js';

export const NO_ACT = ST.STUN | ST.DEAD;
export const canMove = (u) => !(u._st & (ST.STUN | ST.ROOT | ST.DEAD)) && !u._kb;
export const canAttack = (u) => !(u._st & (ST.STUN | ST.HEX | ST.DISARM | ST.DEAD));
export const canCast = (u) => !(u._st & (ST.STUN | ST.HEX | ST.SILENCE | ST.DEAD));
export const canUseItem = (u) => !(u._st & (ST.STUN | ST.HEX | ST.MUTE | ST.DEAD));
export const isInvisible = (u) => (u._st & ST.INVIS) && !(u._st & ST.REVEALED);

const STAT_KEYS = ['ms', 'msPct', 'as', 'armor', 'dmg', 'str', 'agi', 'int', 'mr', 'hpRegen', 'manaRegen', 'hp', 'mana', 'range'];

export function addModifier(w, u, def) {
  if (!u || u._dead) return null;
  const src = def.src && typeof def.src === 'object' ? def.src : def.src ? w.units.get(def.src) : null;
  const debuff = def.debuff !== undefined ? def.debuff : !!(src && src.team !== u.team);
  if (debuff && !def.pierce) {
    if (u._st & ST.MAGIC_IMMUNE) return null;
    if (u._st & ST.INVULN) return null;
    if (u._building) return null;
  }
  const srcId = src ? src.id : '';
  let m = null;
  for (const x of u._mods) if (x.key === def.key && (def.stack === 'unique' || x.srcId === srcId)) { m = x; break; }
  if (m) {
    const dur = def.dur === undefined ? Infinity : def.dur;
    if (def.stack === 'stack') { m.stacks = Math.min((m.stacks || 1) + 1, def.maxStacks || 99); m.left = dur; m.dur = dur; }
    else if (dur >= m.left || def.replace) { m.left = dur; m.dur = dur; }
    for (const k of STAT_KEYS) if (def[k] !== undefined) m[k] = def[k];
    if (def.status !== undefined) m.status = def.status;
    if (def.taunter !== undefined) m.taunter = def.taunter;
    if (def.dot) m.dot = def.dot;
    u._dirty = true;
    return m;
  }
  m = Object.assign({ stacks: 1, purge: 'basic', status: 0, fade: 0 }, def);
  m.srcId = srcId; m.debuff = debuff; m.age = 0;
  m.dur = def.dur === undefined ? Infinity : def.dur; m.left = m.dur;
  m._dotT = 0; m._auraT = 0;
  u._mods.push(m);
  u._dirty = true;
  if (m.status & (ST.STUN | ST.HEX)) interrupt(w, u, true);
  else if (m.status & ST.ROOT) { u._mv = null; }
  return m;
}

export function removeModifier(w, u, keyOrMod, srcId, reason) {
  let n = 0;
  for (let i = u._mods.length - 1; i >= 0; i--) {
    const m = u._mods[i];
    if (typeof keyOrMod === 'object' ? m === keyOrMod : (m.key === keyOrMod && (srcId === undefined || m.srcId === srcId))) {
      u._mods.splice(i, 1); n++; u._dirty = true;
      if (m.onExpire) m.onExpire(w, u, m, reason || 'removed');
    }
  }
  return n;
}
export const hasModifier = (u, key) => { for (const m of u._mods) if (m.key === key) return true; return false; };
export const getModifier = (u, key) => { for (const m of u._mods) if (m.key === key) return m; return null; };

/** Remove dispellable modifiers. opts: {debuffs, buffs, strong}. Returns count. */
export function dispel(w, u, opts) {
  opts = opts || {};
  let n = 0;
  for (let i = u._mods.length - 1; i >= 0; i--) {
    const m = u._mods[i];
    if (m.purge === 'none' || (m.purge === 'strong' && !opts.strong)) continue;
    if (opts.debuffs && !m.debuff) continue;
    if (opts.buffs && m.debuff) continue;
    u._mods.splice(i, 1); n++; u._dirty = true;
    if (m.onExpire) m.onExpire(w, u, m, 'dispel');
  }
  return n;
}

/** Cancel windup / cast point / channel (and orders when `clear`). */
export function interrupt(w, u, clear) {
  u._wind = 0; u._windTgt = null;
  if (u._channel) endChannel(w, u, true);
  if (u._q && u._q.length) {
    const o = u._q[0];
    if (o && o._stage) o._stage = 0;
    if (clear) u._q.length = 0;
  }
  u._mv = null;
}

export function beginChannel(w, u, ch) {
  // ch: {key, dur, tick?(w,u,ch,dt), end?(w,u,ch,interrupted), noInterruptOnOrder?}
  if (u._channel) endChannel(w, u, true);
  ch.left = ch.dur; ch.t = 0;
  u._channel = ch;
  u._dirty = true;
  return ch;
}
export function endChannel(w, u, interrupted) {
  const ch = u._channel; if (!ch) return;
  u._channel = null; u._dirty = true;
  if (ch.end) ch.end(w, u, ch, !!interrupted);
}

function computeBits(u) {
  let b = 0;
  for (const m of u._mods) if (m.age >= m.fade) b |= m.status;
  if (u._dead) b |= ST.DEAD;
  if (u._channel) b |= ST.CHANNEL;
  if (u._protected) b |= ST.INVULN;
  u._st = b;
}

/** Per-tick: expire, DoT, onTick, auras, bits. Returns nothing. */
export function tickStatus(w, u, dt) {
  const mods = u._mods;
  if (mods.length) {
    for (let i = mods.length - 1; i >= 0; i--) {
      const m = mods[i];
      m.age += dt;
      if (m.left !== Infinity) m.left -= dt;
      if (m.dot) {
        m._dotT += dt;
        const iv = m.dot.interval || 1;
        if (m._dotT >= iv) { m._dotT -= iv; const src = m.srcId ? w.units.get(m.srcId) : null; damage(w, src, u, m.dot.dps * iv * (m.stacks || 1), m.dot.type || 'mag', { dot: true, ability: m.key }); if (u._dead) return; }
      }
      if (m.onTick) m.onTick(w, u, m, dt);
      if (m.aura) {
        m._auraT += dt;
        const iv = m.aura.interval || 0.25;
        if (m._auraT >= iv) { m._auraT -= iv; applyAura(w, u, m, iv); }
      }
      if (m.left <= 0) { mods.splice(i, 1); u._dirty = true; if (m.onExpire) m.onExpire(w, u, m, 'expired'); }
      else if (m.fade && m.age - dt < m.fade && m.age >= m.fade) u._dirty = true;
    }
  }
  if (u._dirty || mods.length) computeBits(u);
}

function applyAura(w, owner, m, iv) {
  const a = m.aura, src = owner;
  const list = w.unitsInRadius(owner.x, owner.y, a.radius, { alive: true, buildings: !!a.buildings });
  for (const v of list) {
    if (a.team === 'enemy' ? v.team === owner.team : v.team !== owner.team) continue;
    if (v === owner && a.self === false) continue;
    addModifier(w, v, Object.assign({}, a.def, { src, dur: iv * 2 + 0.05 }));
  }
}

/** Aggregate stat bonuses from modifiers into `b` (object with STAT_KEYS fields). Slow = strongest negative msPct. */
export function collectModBonus(u, b) {
  let slow = 0;
  for (const m of u._mods) {
    if (m.age < m.fade) continue;
    const s = m.stacks || 1;
    for (const k of STAT_KEYS) {
      const v = m[k]; if (v === undefined) continue;
      if (k === 'msPct' && v < 0) { if (-v * s > slow) slow = -v * s; continue; }
      b[k] += v * s;
    }
  }
  b.slow = slow;
}

/** HUD strings "key:secondsLeft" (-1 = permanent). */
export function buffList(u) {
  const out = [];
  for (const m of u._mods) if (!m.hidden && !m.aura) out.push(m.key + ':' + (m.left === Infinity ? -1 : Math.max(0, Math.round(m.left * 10) / 10)));
  return out;
}

export { STAT_KEYS };
