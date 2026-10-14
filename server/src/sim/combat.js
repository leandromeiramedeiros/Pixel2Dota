// Combat: attack cycle, projectiles, damage pipeline, kills and rewards. Pure.
import { KIND, ST, TEAM } from '../../../shared/protocol.js';
import { armorMult, DENY_HP_PCT, XP_RADIUS, heroKillGold, heroKillXp, ATTACK_RANGE_BUFFER, CREEP_CALL_HELP } from '../../../shared/constants.js';
import { canAttack, interrupt, endChannel } from './status.js';
import { getHandler } from './abilities/index.js';
import * as items from './items.js';
import * as H from './heroes.js';
import { faceToward } from './move.js';
import { evAtk, evHit, evDeath, evKill, evGold, evProj, evProjEnd } from './events.js';

export const isHero = (u) => u.kind === KIND.HERO;
/** The hero responsible for u (u itself, or the owner of a summon), else null. */
export function heroOf(w, u) {
  if (!u) return null;
  if (u.kind === KIND.HERO) return u;
  if (u._summonOf) { const o = w.units.get(u._summonOf); if (o && o.kind === KIND.HERO) return o; }
  return null;
}

/** Can a (right now, ignoring range / its own status) attack t? Includes denies. */
export function attackable(a, t) {
  if (!t || t._dead || t === a || t.hp <= 0) return false;
  if (t._st & ST.INVULN) return false;
  if (t.team === a.team) return !t._building && t.kind !== KIND.HERO && t.hp < t.maxHp * DENY_HP_PCT;
  if ((t._st & ST.INVIS) && !(t._st & ST.REVEALED)) return false;
  return true;
}

/** Attack reach test: centre distance <= range + hulls (+extra). Buildings attack from their edge. */
export function inAttackRange(a, t, extra) {
  const r = a.atkRange + (extra || 0) + t.radius + (a._building ? 0 : a.radius), dx = t.x - a.x, dy = t.y - a.y;
  return dx * dx + dy * dy <= r * r;
}

// ---------------------------------------------------------------------------------------------------------------- targeting
/** Best enemy for u within `range` (edge distance). Priority: attackers of allied heroes > units > heroes (for non-heroes) > buildings. */
export function acquire(w, u, range) {
  const cand = w.index.query(u.x, u.y, range + 200, w._qb);
  const hero = u.kind === KIND.HERO, t = w.time;
  let best = null, bs = Infinity;
  for (let i = 0; i < cand.length; i++) {
    const v = cand[i];
    if (v._dead || v.team === u.team || !attackable(u, v)) continue;
    const dx = v.x - u.x, dy = v.y - u.y, d = Math.sqrt(dx * dx + dy * dy) - v.radius;
    if (d > range) continue;
    let s = d;
    if (v._building) s += 4000;
    else if (v.kind === KIND.HERO) {
      if (!hero) s += 700;
      if (t - v._atkHeroT < 2.5) { const vic = w.units.get(v._atkHeroId); if (vic && vic.team === u.team) s -= 8000; }
    }
    if (s < bs) { bs = s; best = v; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------- attack cycle
function cancelWind(u) { u._wind = 0; u._windTgt = null; }

/** Called once per tick for every unit after its orders ran. Uses u._tgt as the unit to attack. */
export function tickAttack(w, u, dt) {
  if (u._cd > 0) u._cd -= dt;
  if (u._wind > 0) {
    const tg = u._windTgt;
    if (!tg || tg._dead || !canAttack(u) || !attackable(u, tg)) { cancelWind(u); return; }
    u._wind -= dt;
    if (u._wind <= 0) { cancelWind(u); launch(w, u, tg); }
    return;
  }
  const t = u._tgt;
  if (!t) return;
  if (!attackable(u, t)) { u._tgt = null; return; }
  if (u.atkRate <= 0 || u._noAttack || !canAttack(u) || u._channel) return;
  if (!inAttackRange(u, t, 0)) return;
  if (!u._building) {
    if (faceToward(u, Math.atan2(t.y - u.y, t.x - u.x), dt) > 0.25) return;
    u._mv = null;
  }
  if (u._cd > 0) return;
  u._cd = u._interval;
  u._wind = u._windup; u._windTgt = t;
  u._animType = 'attack'; u._animUntil = w.time + Math.max(u._windup + 0.12, 0.28);
  u.animSeq = (u.animSeq + 1) & 0xffff; u.animRate = Math.max(0.5, Math.min(3, u._asMult));
  if (u._windup <= 0) { u._wind = 0; u._windTgt = null; launch(w, u, t); }
}

function launch(w, u, t) {
  if (!inAttackRange(u, t, ATTACK_RANGE_BUFFER)) return;
  breakInvis(w, u);
  evAtk(w, u.id, t.id, u._ranged ? u._projKey || u._short || 'arrow' : '', u._ranged ? u._base.projSpeed : 0);
  if (u._ranged) {
    w.projs.push({ id: 'a' + (++w._pid), attack: true, linear: false, k: '', srcId: u.id, src: u, tgt: t, tgtId: t.id, x: u.x, y: u.y, speed: u._base.projSpeed || 900 });
  } else resolveAttack(w, u, t);
}

function breakInvis(w, u) {
  if (!u._mods.length) return;
  for (let i = u._mods.length - 1; i >= 0; i--) if (u._mods[i].breakOnAttack) { const m = u._mods.splice(i, 1)[0]; u._dirty = true; if (m.onExpire) m.onExpire(w, u, m, 'attack'); }
}

/** Resolve one attack's damage (melee launch / projectile impact). */
export function resolveAttack(w, a, t) {
  if (t._dead || t._st & ST.INVULN) return 0;
  const hero = a.kind === KIND.HERO;
  const info = { dmg: a.dmgMin + Math.floor(w.rand() * (a.dmgMax - a.dmgMin + 1)) + a.dmgBonus, type: 'phys', crit: 1, noCleave: false, pierce: false, attack: true, final: 0 };
  if (hero) {
    for (const ab of a.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.onAttack) h.onAttack(w, a, ab, t, info); }
    items.onAttack(w, a, t, info);
  } else if (a._onAttack) a._onAttack(w, a, t, info);
  info.final = info.dmg * info.crit;
  const dealt = damage(w, a, t, info.final, info.type, { attack: true, crit: info.crit > 1, pierce: info.pierce });
  if (hero) {
    for (const ab of a.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.onAttackLanded) h.onAttackLanded(w, a, ab, t, info, dealt); }
    items.onAttackLanded(w, a, t, info, dealt);
  }
  if (t.kind === KIND.HERO && !t._dead) {
    for (const ab of t.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.onAttacked) h.onAttacked(w, t, ab, a, info, dealt); }
    items.onAttacked(w, t, a, info, dealt);
  }
  return dealt;
}

// ---------------------------------------------------------------------------------------------------------------- damage
/**
 * damage(w, src, tgt, amount, type, info) -> damage actually dealt (after armor / magic resist).
 *   type: 'phys' (armor) | 'mag' (magic resistance) | 'pure'.   src may be null (environment).
 *   info: {attack, crit, ability, dot, pierce (ignore magic immunity), silent (no EV.HIT), noKill}
 * Blocked entirely by INVULN (incl. protected buildings); mag/pure spell damage is blocked by MAGIC_IMMUNE unless pierce.
 */
export function damage(w, src, tgt, amount, type, info) {
  if (!tgt || tgt._dead || amount <= 0) return 0;
  info = info || NOINFO;
  if (tgt._st & ST.INVULN) return 0;
  if ((tgt._st & ST.MAGIC_IMMUNE) && !info.pierce && !info.attack && type !== 'phys') return 0;
  let d = amount;
  if (type === 'phys') d *= armorMult(tgt.armor);
  else if (type === 'mag') d *= 1 - tgt._mr;
  if (d <= 0) return 0;
  if (d > tgt.hp && info.noKill) d = Math.max(0, tgt.hp - 1);
  tgt.hp -= d;
  const sh = heroOf(w, src);
  if (sh && sh.team !== tgt.team) {
    if (tgt.kind === KIND.HERO) {
      (tgt._assist || (tgt._assist = new Map())).set(sh.id, w.time);
      sh._atkHeroT = w.time; sh._atkHeroId = tgt.id;
      if (src !== sh) { src._atkHeroT = w.time; src._atkHeroId = tgt.id; }
      callForHelp(w, sh, tgt);
    }
    tgt._lastPlayerDmg = w.time;
  } else if (src && src.team !== tgt.team && tgt.kind === KIND.HERO) { src._atkHeroT = w.time; src._atkHeroId = tgt.id; }
  if (!info.silent) evHit(w, src ? src.id : '', tgt.id, d, type, info.crit);
  if (tgt.kind === KIND.HERO) {
    for (const ab of tgt.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.onDamaged) h.onDamaged(w, tgt, ab, src, d, type); }
    items.onDamaged(w, tgt, src, d, type);
  }
  if (tgt.hp <= 0 && !tgt._dead) killUnit(w, tgt, src, info);
  return d;
}
const NOINFO = Object.freeze({});

/** A hero hit an enemy hero: the victim's nearby creeps drop what they're doing and rescan (see acquire priority). */
function callForHelp(w, attacker, victim) {
  const c = w.index.query(victim.x, victim.y, CREEP_CALL_HELP + 40, w._qd);
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    if (v.team === victim.team && v.kind === KIND.CREEP && !v._dead) v._scanT = -1;
  }
}

// ---------------------------------------------------------------------------------------------------------------- death & rewards
export function killUnit(w, v, killer, info) {
  if (v._dead) return;
  v._dead = true; v.hp = 0;
  const kh = heroOf(w, killer);
  const deny = !!killer && killer.team === v.team && killer !== v;
  if (v._channel) endChannel(w, v, true);
  interrupt(w, v, true);
  for (const m of v._mods) if (m.onExpire) m.onExpire(w, v, m, 'death');
  v._mods.length = 0; v._tgt = null; v._mv = null; v._kb = null; v._channel = null;
  v._st = ST.DEAD; v.status = ST.DEAD; v.anim = 'dead'; v.animSeq = (v.animSeq + 1) & 0xffff;
  evDeath(w, v);
  // projectiles aimed at it just vanish
  for (let i = w.projs.length - 1; i >= 0; i--) if (w.projs[i].tgt === v && !w.projs[i].linear) endProj(w, i);

  if (v.kind === KIND.HERO) rewardHeroKill(w, v, killer, kh, deny);
  else if (!v._building || (v._base.goldMax || 0) > 0) rewardUnitKill(w, v, killer, kh, deny);
  if (v._building) w.onBuildingDeath(v, killer);

  // hooks
  if (v.kind === KIND.HERO) {
    for (const ab of v.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.onDeath) h.onDeath(w, v, ab, killer); }
    items.onDeath(w, v, killer);
  }
  if (kh && kh !== v) {
    for (const ab of kh.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.onKill) h.onKill(w, kh, ab, v); }
    items.onKill(w, kh, v);
  }
  if (v.kind === KIND.HERO) {
    v.respawn = H.respawnTime(v);
    const p = w.players.get(v.owner);
    if (p) p.deaths++;
  } else w._rm.push(v);
}

function heroesNear(w, x, y, r, team, out) {
  out.length = 0;
  const c = w.index.query(x, y, r + 40, w._qd);
  for (let i = 0; i < c.length; i++) {
    const h = c[i];
    if (h.kind === KIND.HERO && !h._dead && h.team === team && Math.hypot(h.x - x, h.y - y) <= r) out.push(h);
  }
  return out;
}

function rewardUnitKill(w, v, killer, kh, deny) {
  const enemyTeam = killer ? (deny ? (v.team === TEAM.RADIANT ? TEAM.DIRE : TEAM.RADIANT) : killer.team) : (v.team === TEAM.RADIANT ? TEAM.DIRE : TEAM.RADIANT);
  if (deny) { const p = kh && w.players.get(kh.owner); if (p) p.dn++; return; }
  const b = v._base;
  if (kh && kh.team !== v.team && (b.goldMax || 0) > 0) {
    const g = b.goldMin + Math.floor(w.rand() * (b.goldMax - b.goldMin + 1));
    const p = w.players.get(kh.owner);
    if (p) { p.gold += g; p.lh++; evGold(w, v.id, g); }
  }
  if ((b.xp || 0) > 0) {
    const hs = heroesNear(w, v.x, v.y, XP_RADIUS, enemyTeam, w._hl);
    if (hs.length) { const x = b.xp / hs.length; for (const h of hs) H.addXp(w, h, x); }
  }
}

function rewardHeroKill(w, v, killer, kh, deny) {
  const enemyTeam = v.team === TEAM.RADIANT ? TEAM.DIRE : TEAM.RADIANT;
  const gold = heroKillGold(v.level, v._streak), xp = heroKillXp(v.level);
  const vp = w.players.get(v.owner);
  if (deny || (kh && kh.team === v.team)) { v._streak = 0; return; }   // suicide / deny: no rewards
  // assists: enemy heroes that damaged the victim in the last 10 s
  const assists = [];
  if (v._assist) for (const [id, t] of v._assist) {
    if (w.time - t > 10) continue;
    const h = w.units.get(id);
    if (h && h !== kh && h.team === enemyTeam) assists.push(h);
  }
  v._assist = null;
  let paid = 0;
  if (kh) {
    const p = w.players.get(kh.owner);
    if (p) { p.gold += gold; p.kills++; paid = gold; evGold(w, v.id, gold); }
    kh._streak++;
  }
  if (assists.length) {
    const share = Math.round((kh ? gold * 0.4 : gold) / assists.length);
    for (const h of assists) { const p = w.players.get(h.owner); if (p) { p.gold += share; p.assists++; } }
    if (!kh) paid = gold;
  }
  evKill(w, kh ? kh.owner : '', v.owner, paid, killer ? killer.kind : '', killer ? killer.team : -1);
  v._streak = 0;
  const hs = heroesNear(w, v.x, v.y, XP_RADIUS, enemyTeam, w._hl);
  if (hs.length) { const x = xp / hs.length; for (const h of hs) H.addXp(w, h, x); }
  void vp;
}

// ---------------------------------------------------------------------------------------------------------------- projectiles
/**
 * w.spawnProjectile(o) (see API.md). Tracking: {src, tgt, speed, k, onHit(w,p,tgt)}. Linear: {src, x2,y2 | dir, speed, range, radius, k, pierce, onHit(w,p,unit), onEnd?}
 */
export function spawnProjectile(w, o) {
  const src = o.src;
  const p = {
    id: 'p' + (++w._pid), attack: false, k: o.k || '', srcId: src ? src.id : '', src, speed: o.speed || 900,
    x: o.x !== undefined ? o.x : src.x, y: o.y !== undefined ? o.y : src.y, onHit: o.onHit, onEnd: o.onEnd, data: o.data, linear: !!o.linear || !o.tgt,
    tgt: o.tgt || null, tgtId: o.tgt ? o.tgt.id : '', radius: o.radius || 60, pierce: !!o.pierce, left: 0, dx: 0, dy: 0, hit: null, team: src ? src.team : TEAM.NONE, hitAllies: !!o.hitAllies, filter: o.filter || null, silent: !!o.silent,
  };
  if (p.linear) {
    let dx, dy;
    if (o.dir !== undefined) { dx = Math.cos(o.dir); dy = Math.sin(o.dir); }
    else { dx = o.x2 - p.x; dy = o.y2 - p.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
    p.dx = dx; p.dy = dy; p.left = o.range || (o.x2 !== undefined ? Math.hypot(o.x2 - p.x, o.y2 - p.y) : 1000); p.hit = new Set();
    p.tx = p.x + dx * p.left; p.ty = p.y + dy * p.left;
  }
  w.projs.push(p);
  if (!p.silent) evProj(w, p);
  return p;
}

function endProj(w, i) {
  const P = w.projs, p = P[i];
  P[i] = P[P.length - 1]; P.pop();
  if (!p.attack && !p.silent) evProjEnd(w, p.id);
  return p;
}

export function updateProjectiles(w, dt) {
  const P = w.projs;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    if (!p) continue;
    const step = p.speed * dt;
    if (!p.linear) {
      const t = p.tgt;
      if (t._dead) { endProj(w, i); continue; }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (d - t.radius * 0.4 <= step + 4) {
        endProj(w, i);
        if (p.attack) resolveAttack(w, p.src, t);
        else if (p.onHit) p.onHit(w, p, t);
      } else { p.x += dx / d * step; p.y += dy / d * step; }
    } else {
      const s = Math.min(step, p.left);
      p.x += p.dx * s; p.y += p.dy * s; p.left -= s;
      const list = w.unitsInRadius(p.x, p.y, p.radius, { buildings: false });
      let stop = false;
      for (const u of list) {
        if (p.hit.has(u.id)) continue;
        if (!p.hitAllies && u.team === p.team) continue;
        if (p.filter && !p.filter(u)) continue;
        p.hit.add(u.id);
        if (p.onHit) p.onHit(w, p, u);
        if (!p.pierce) { stop = true; break; }
      }
      if (stop || p.left <= 0.01) { const idx = P.indexOf(p); if (idx >= 0) endProj(w, idx); if (p.onEnd) p.onEnd(w, p); }
    }
  }
}
