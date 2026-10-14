// Lane creeps: wave spawning, lane following, aggro/leash; summon default AI. Pure.
import { KIND, TEAM, ST } from '../../../shared/protocol.js';
import { WAVE_MELEE, WAVE_RANGED, SIEGE_EVERY, AGGRO_RANGE_CREEP, ATTACK_RANGE_BUFFER } from '../../../shared/constants.js';
import { LANES } from '../../../shared/data/lanes.js';
import { makeCreep } from './units.js';
import { acquire, attackable, inAttackRange } from './combat.js';
import { moveTo, follow, stepMove } from './move.js';
import { chase, tauntSource } from './orders.js';

const LANE_NAMES = ['top', 'mid', 'bot'];

/** Dense walkable polylines per lane (Radiant -> Dire). Needs building footprints already blocked in w.nav. */
export function buildLanePaths(w) {
  const out = {};
  for (const lane of LANE_NAMES) {
    const wp = LANES[lane], pts = [{ x: wp[0][0], y: wp[0][1] }];
    for (let i = 1; i < wp.length; i++) {
      const seg = w.nav.findPath(wp[i - 1][0], wp[i - 1][1], wp[i][0], wp[i][1], 20);
      if (!seg.length) pts.push({ x: wp[i][0], y: wp[i][1] });
      for (const p of seg) { const l = pts[pts.length - 1]; if (Math.hypot(l.x - p.x, l.y - p.y) > 1) pts.push({ x: p.x, y: p.y }); }
    }
    out[lane] = pts;
  }
  w._lanes = out;
  return out;
}

/** Lane polyline for a team: Radiant walks it forward, Dire backward. */
export function lanePath(w, team, lane) {
  if (!w._lanes) buildLanePaths(w);
  const k = team + lane;
  const c = w._laneTeam || (w._laneTeam = {});
  return c[k] || (c[k] = team === TEAM.RADIANT ? w._lanes[lane] : w._lanes[lane].slice().reverse());
}

function nearestIdx(path, x, y) {
  let best = 1, bd = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
    if (d < bd) { bd = d; best = i + 1; }
  }
  return best;
}

/** Spawn wave number `no` (1-based) from every standing barracks. */
export function spawnWave(w, no) {
  for (const r of w.rax) {
    if (r._dead) continue;
    const path = lanePath(w, r.team, r._lane);
    if (!r._sp) {
      const idx = nearestIdx(path, r.x, r.y), p = path[idx];
      const d = Math.hypot(p.x - r.x, p.y - r.y) || 1;
      r._sp = { idx, ux: (p.x - r.x) / d, uy: (p.y - r.y) / d };
    }
    const sp = r._sp, types = [];
    if (r._rax === 'melee') { for (let i = 0; i < WAVE_MELEE; i++) types.push('melee'); if (no % SIEGE_EVERY === 0) types.push('siege'); }
    else for (let i = 0; i < WAVE_RANGED; i++) types.push('ranged');
    const bx = r.x + sp.ux * (r.radius + 40), by = r.y + sp.uy * (r.radius + 40);
    for (let i = 0; i < types.length; i++) {
      const side = (i & 1 ? 12 : -12);
      const q = w.nav.nearestWalkable(bx - sp.ux * i * 40 + side * sp.uy, by - sp.uy * i * 40 - side * sp.ux, {});
      const u = makeCreep(w, r.team, types[i], q.x, q.y, r._lane);
      u._lp = path; u._li = sp.idx; u._mvLi = -1; u._wave = no;
      u.facing = Math.atan2(sp.uy, sp.ux);
      u._scanT = (u._nid % 6);
      w.addUnit(u);
    }
  }
}

const rank = (v) => (v._building ? 2 : v.kind === KIND.HERO ? 1 : 0);
function aggroOnAlly(w, u, v) {
  if (v.kind !== KIND.HERO || w.time - v._atkHeroT > 2.5) return false;
  const vic = w.units.get(v._atkHeroId);
  return !!vic && vic.team === u.team;
}

/** Pick a target for an AI unit, keeping the current one unless something clearly better turned up. */
export function retarget(w, u, range) {
  const cur = u._tgt, best = acquire(w, u, range);
  if (!best) return cur && attackable(u, cur) && inAttackRange(u, cur, 0) ? cur : null;
  if (!cur || cur === best || cur._dead || !attackable(u, cur) || !inAttackRange(u, cur, 0)) return best;
  if (aggroOnAlly(w, u, best) && !aggroOnAlly(w, u, cur)) return best;
  if (rank(best) < rank(cur)) return best;
  return cur;
}

export function creepThink(w, u, dt) {
  if (u._kb || (u._st & ST.STUN)) { u._tgt = null; return; }
  if (u._st & ST.TAUNT) { const tm = tauntSource(w, u); if (tm) { chase(w, u, tm, dt); return; } }
  let t = u._tgt;
  if (t) {
    const d = Math.hypot(t.x - u.x, t.y - u.y) - t.radius;
    if (!attackable(u, t) || d > AGGRO_RANGE_CREEP + ATTACK_RANGE_BUFFER) t = u._tgt = null;
    else if (u._lp) { const p = u._lp[Math.min(u._li, u._lp.length - 1)]; if (Math.hypot(p.x - u.x, p.y - u.y) > 1300) t = u._tgt = null; }
  }
  const forced = u._scanT < 0;
  if (forced) u._scanT = 0;
  if (forced || ((w.tick + u._nid) % 6) === 0) {
    const n = retarget(w, u, AGGRO_RANGE_CREEP);
    if (n !== t) { t = u._tgt = n; if (n) u._mv = null; }
  }
  if (t) { chase(w, u, t, dt); return; }
  const P = u._lp;
  if (!P || u._li >= P.length) return;
  if (!u._mv || u._mv.tgt || u._mvLi !== u._li) { const p = P[u._li]; moveTo(w, u, p.x, p.y, 48, true); u._mvLi = u._li; }
  if (stepMove(w, u, dt)) { u._li++; u._mvLi = -1; }
}

/** Default AI for summons / wards without a custom `think`: follow owner, hit things within 500. */
export function summonThink(w, u, dt) {
  if (u._think) { u._think(w, u, dt); return; }
  if (u._kb || (u._st & ST.STUN)) { u._tgt = null; return; }
  if (u._noAttack || u.kind === KIND.WARD) return;
  let t = u._tgt;
  if (t && !(attackable(u, t) && Math.hypot(t.x - u.x, t.y - u.y) < 800)) t = u._tgt = null;
  if (!t && ((w.tick + u._nid) % 6) === 0) t = u._tgt = acquire(w, u, 500);
  if (t) { chase(w, u, t, dt); return; }
  const o = w.units.get(u._summonOf);
  if (o && !o._dead) {
    const d = Math.hypot(o.x - u.x, o.y - u.y);
    if (d > 260) { if (!u._mv || u._mv.tgt !== o) follow(w, u, o, 140, false); stepMove(w, u, dt); }
    else if (u._mv && d <= 160) u._mv = null;
    else if (u._mv) stepMove(w, u, dt);
  }
}
