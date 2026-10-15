// Lane creeps: wave spawning, lane following, aggro/leash; summon default AI. Pure.
import { KIND, TEAM, ST } from '../../../shared/protocol.js';
import { WAVE_MELEE, WAVE_RANGED, SIEGE_EVERY, WAVE_GROW, ATTACK_RANGE_BUFFER } from '../../../shared/constants.js';
import { LANES } from '../../../shared/data/lanes.js';
import { makeCreep } from './units.js';
import { acquire, attackable, inAttackRange, aggroOnAlly } from './combat.js';
import { moveTo, follow, stepMove } from './move.js';
import { chase, tauntSource } from './orders.js';

const LANE_NAMES = ['top', 'mid', 'bot'];

const PULL_R = 20, PULL_TOL = 120;   // lane string pull: hull clearance, max sideways deviation from the A* polyline

/** Second string pull over the stitched polyline: per-segment A* leaves tile-centre stubs at every waypoint junction.
 *  A shortcut needs a walkable line (hull PULL_R) and must stay within PULL_TOL of every point it skips (keeps the tower line). */
function pullLane(nav, P) {
  const out = [P[0]];
  let i = 0;
  while (i < P.length - 1) {
    let j = i + 1;
    while (j + 1 < P.length && nav.lineWalkable(P[i].x, P[i].y, P[j + 1].x, P[j + 1].y, PULL_R) && maxDev(P, i, j + 1) <= PULL_TOL) j++;
    out.push(P[j]); i = j;
  }
  return out;
}
function maxDev(P, i, k) {
  const a = P[i], b = P[k], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  let m = 0;
  for (let q = i + 1; q < k; q++) m = Math.max(m, Math.abs((P[q].x - a.x) * dy - (P[q].y - a.y) * dx) / l);
  return m;
}

/** Walkable polylines per lane (Radiant -> Dire): A* between the tower-line waypoints, then pulled straight. Needs building footprints blocked in w.nav. */
export function buildLanePaths(w) {
  const out = {};
  for (const lane of LANE_NAMES) {
    const wp = LANES[lane], pts = [{ x: wp[0][0], y: wp[0][1] }];
    for (let i = 1; i < wp.length; i++) {
      const seg = w.nav.findPath(wp[i - 1][0], wp[i - 1][1], wp[i][0], wp[i][1], 20);
      if (!seg.length) pts.push({ x: wp[i][0], y: wp[i][1] });
      for (const p of seg) { const l = pts[pts.length - 1]; if (Math.hypot(l.x - p.x, l.y - p.y) > 1) pts.push({ x: p.x, y: p.y }); }
    }
    out[lane] = pullLane(w.nav, pts);
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

/** Distance from (x,y) to the lane segment path[i]-path[i+1]. */
function segDist(path, i, x, y) {
  const a = path[i], b = path[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

function nearestIdx(path, x, y) {
  let best = 1, bd = Infinity;
  for (let i = 0; i + 1 < path.length; i++) { const d = segDist(path, i, x, y); if (d < bd) { bd = d; best = i + 1; } }
  return best;
}

/** Arc length of the projection of (x,y) on the polyline. */
function alongOf(P, x, y) {
  let best = 0, bd = Infinity, acc = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (l * l))), d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
    if (d < bd) { bd = d; best = acc + t * l; }
    acc += l;
  }
  return best;
}
/** Point at arc length s on the polyline: {x, y, i (index of the segment end), ux, uy (lane direction)}. */
function pointAt(P, s) {
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (s <= l || i + 2 === P.length) { const t = Math.min(1, Math.max(0, s / l)); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, i: i + 1, ux: (b.x - a.x) / l, uy: (b.y - a.y) / l }; }
    s -= l;
  }
  return { x: P[0].x, y: P[0].y, i: 1, ux: 1, uy: 0 };
}

const ROW = 44;   // spawn formation spacing (lateral and front-to-back)
/** Per team+lane spawn point: on the lane line abreast of the barracks pair (the lane runs between them), facing down the lane. */
function spawnPoint(w, team, lane) {
  const c = w._spawnAt || (w._spawnAt = {}), k = team + lane;
  if (c[k]) return c[k];
  const P = lanePath(w, team, lane);
  let s = 0;
  for (const r of w.rax) if (r.team === team && r._lane === lane) s = Math.max(s, alongOf(P, r.x, r.y));
  return (c[k] = pointAt(P, s));
}

/** Spawn wave number `no` (1-based). Dota spawner: one loose block per lane on the lane line, melee row in front, ranged then siege behind,
 *  everyone already facing down the lane. Each creep keeps its lateral slot (_lo) while walking so the wave does not funnel into one file. */
export function spawnWave(w, no) {
  const groups = {}, min = Math.max(0, w.time) / 60;
  const grow = (type) => WAVE_GROW[type].reduce((n, m) => n + (min >= m - 1e-6 ? 1 : 0), 0);
  for (const team of [TEAM.RADIANT, TEAM.DIRE]) {
    // Every lane keeps spawning whatever happens to its own barracks; the ENEMY barracks of that lane decide the grade:
    // melee rax down -> super melee (+ super siege, assumed), ranged rax down -> super ranged, all enemy rax down -> mega creeps.
    const er = w.rax.filter((r) => r.team !== team), mega = er.length > 0 && er.every((r) => r._dead);
    for (const lane of LANE_NAMES) {
      if (!w.rax.some((r) => r.team === team && r._lane === lane)) continue;   // no spawner on this lane (test maps)
      const down = (kind) => er.some((r) => r._lane === lane && r._rax === kind && r._dead);
      const gm = mega ? 'upgraded_mega' : down('melee') ? 'upgraded' : '', gr = mega ? 'upgraded_mega' : down('range') ? 'upgraded' : '';
      groups[team + lane] = { team, lane, melee: WAVE_MELEE + grow('melee'), ranged: WAVE_RANGED + grow('ranged'), siege: no % SIEGE_EVERY === 0 ? 1 + grow('siege') : 0, grade: { melee: gm, ranged: gr, siege: gm } };
    }
  }
  for (const g of Object.values(groups)) {
    const path = lanePath(w, g.team, g.lane), sp = spawnPoint(w, g.team, g.lane);
    const rows = [['melee', g.melee], ['ranged', g.ranged], ['siege', g.siege]].filter((r) => r[1] > 0);
    rows.forEach(([type, n], row) => {
      for (let i = 0; i < n; i++) {
        const lo = (i - (n - 1) / 2) * ROW, back = row * ROW;
        const q = w.nav.nearestWalkable(sp.x - sp.ux * back - sp.uy * lo, sp.y - sp.uy * back + sp.ux * lo, {});
        const u = makeCreep(w, g.team, type, q.x, q.y, g.lane, g.grade[type]);
        u._lp = path; u._li = sp.i; u._lo = lo; u._mvLi = -1; u._wave = no;
        u.facing = Math.atan2(sp.uy, sp.ux);
        u._scanT = (u._nid % 6);
        w.addUnit(u);
      }
    });
  }
}

const rank = (v) => (v._building ? 2 : v.kind === KIND.HERO ? 1 : 0);

/** Pick a target for an AI unit, keeping the current one unless something clearly better turned up. */
export function towerRetarget(w, u) {
  // Dota towers stay on their target until it dies or leaves range; the one exception is tower aggro: an enemy hero in
  // range that attacked an allied hero (aggroOnAlly) pulls the tower off anything that is not itself such a hero.
  const cur = u._tgt && attackable(u, u._tgt) && inAttackRange(u, u._tgt, 0) ? u._tgt : null;
  const best = acquire(w, u, u.atkRange);
  if (!cur) return best;
  if (best && best !== cur && aggroOnAlly(w, u, best) && !aggroOnAlly(w, u, cur)) return best;
  return cur;
}

export function retarget(w, u, range) {
  const cur = u._tgt, best = acquire(w, u, range);
  if (!best) return cur && attackable(u, cur) && inAttackRange(u, cur, 0) ? cur : null;
  if (!cur || cur === best || cur._dead || !attackable(u, cur) || !inAttackRange(u, cur, 0)) return best;
  if (aggroOnAlly(w, u, best) && !aggroOnAlly(w, u, cur)) return best;
  if (rank(best) < rank(cur)) return best;
  return cur;
}

const LEASH = 1300;
/** Distance of a lane creep from the lane segment it is walking (the previous and current one). */
function laneDist(u) {
  const P = u._lp, i = Math.min(Math.max(u._li, 1), P.length - 1);
  return Math.min(segDist(P, i - 1, u.x, u.y), i + 1 < P.length ? segDist(P, i, u.x, u.y) : Infinity);
}

export function creepThink(w, u, dt) {
  if (u._kb || (u._st & ST.STUN)) { u._tgt = null; return; }
  if (u._st & ST.TAUNT) { const tm = tauntSource(w, u); if (tm) { chase(w, u, tm, dt); return; } }
  let t = u._tgt;
  if (t) {
    const d = Math.hypot(t.x - u.x, t.y - u.y) - t.radius;
    if (!attackable(u, t) || d > u._acq + ATTACK_RANGE_BUFFER) t = u._tgt = null;
    else if (u._lp && laneDist(u) > LEASH) t = u._tgt = null;   // leash = distance from the lane line, not from the next waypoint
  }
  const forced = u._scanT < 0;
  if (forced) u._scanT = 0;
  if (forced || ((w.tick + u._nid) % 6) === 0) {
    const n = retarget(w, u, u._acq);
    if (n !== t) { t = u._tgt = n; if (n) u._mv = null; }
  }
  if (t) { u._mvLi = -1; if (u._ranged || !u._lp) chase(w, u, t, dt); else engage(w, u, t, dt); return; }
  laneWalk(w, u, dt);
}

// ---------------------------------------------------------------------------------------------------------------- melee arc
const SLOT_NEAR = 300;   // beyond this (edge distance) a melee creep just chases the target; inside it walks to its own slot on the ring
/** Ring radius (centre distance) a melee unit attacks t from: comfortably inside its attack range. */
const ringR = (u, t) => t.radius + u.radius + u.atkRange * 0.7;
const slotX = (u, t) => t.x + Math.cos(u._slot.a) * ringR(u, t), slotY = (u, t) => t.y + Math.sin(u._slot.a) * ringR(u, t);

/** Is (x,y) taken for a melee slot around t: a body stands there, or another attacker of t has claimed it. */
function slotTaken(w, u, t, x, y) {
  const cand = w.index.query(x, y, u.radius + 64, w._qd);
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i];
    if (o === u || o === t || o._dead || o._building || o._noCollide) continue;
    const m = u.radius + o.radius;
    if ((o.x - x) ** 2 + (o.y - y) ** 2 < m * m) return true;
    if (o._slot && o._slot.t === t && o._tgt === t && (slotX(o, t) - x) ** 2 + (slotY(o, t) - y) ** 2 < m * m) return true;
  }
  return false;
}
/** Dota melee creeps spread in an arc around their target: take the free ring angle nearest the direct approach. */
function pickSlot(w, u, t) {
  const R = ringR(u, t), a0 = Math.atan2(u.y - t.y, u.x - t.x), da = (2 * u.radius + 2) / R;
  for (let k = 0; k * da <= Math.PI; k++) for (const s of k ? [1, -1] : [1]) {
    const a = a0 + s * k * da, x = t.x + Math.cos(a) * R, y = t.y + Math.sin(a) * R;
    if (w.nav.walkXY(x, y) && !slotTaken(w, u, t, x, y)) { u._slot = { t, a }; return; }
  }
  u._slot = { t, a: a0 };
}
/** Melee lane creep vs t: chase from afar, then walk to a free slot on the ring and attack from there.
 *  It stops as soon as it is in range unless it stands inside another body (then it keeps going to its slot). */
function engage(w, u, t, dt) {
  u._tgt = t;
  if (Math.hypot(t.x - u.x, t.y - u.y) - t.radius - u.radius > SLOT_NEAR) { u._slot = null; chase(w, u, t, dt); return; }
  if (!u._slot || u._slot.t !== t || ((w.tick + u._nid) % 15 === 0 && !inAttackRange(u, t, -4))) pickSlot(w, u, t);
  const gx = slotX(u, t), gy = slotY(u, t);
  if (inAttackRange(u, t, -4) && (Math.hypot(gx - u.x, gy - u.y) < 12 || !crowded(w, u))) { if (u._mv) u._mv = null; return; }
  if (!u._mv || u._mv.tgt) moveTo(w, u, gx, gy, 4, true);
  else { u._mv.gx = gx; u._mv.gy = gy; }
  stepMove(w, u, dt);
}
function crowded(w, u) {
  const cand = w.index.query(u.x, u.y, u.radius + 64, w._qd);
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i];
    if (o === u || o._dead || o._building || o._noCollide) continue;
    const m = u.radius + o.radius - 2;
    if ((o.x - u.x) ** 2 + (o.y - u.y) ** 2 < m * m) return true;
  }
  return false;
}

const LANE_ARRIVE = 48;
/** Walk the lane: head for the next lane point shifted sideways by the creep's slot (_lo). Back from a fight (or pushed past a point)
 *  the creep re-syncs to the segment it stands on instead of walking back to a waypoint behind it. */
function laneWalk(w, u, dt) {
  const P = u._lp;
  if (!P || u._li >= P.length) return;
  if (!u._mv || u._mv.tgt || u._mvLi !== u._li) {
    // re-sync: nearest segment among the current and the next two (never backwards)
    let bi = u._li, bd = Infinity;
    for (let i = Math.max(1, u._li); i < Math.min(P.length, u._li + 3); i++) { const d = segDist(P, i - 1, u.x, u.y); if (d < bd - 1) { bd = d; bi = i; } }
    u._li = bi;
    // already past the end of this segment (projection beyond P[_li]) -> next one
    while (u._li < P.length - 1) {
      const a = P[u._li - 1] || P[u._li], b = P[u._li], dx = b.x - a.x, dy = b.y - a.y;
      if ((u.x - b.x) * dx + (u.y - b.y) * dy < 0 && Math.hypot(b.x - u.x, b.y - u.y) > LANE_ARRIVE) break;
      u._li++;
    }
    // sideways = normal of the lane direction across the point (prev -> next), so short stubs and corners do not swing the slot
    const p = P[u._li], a = P[u._li - 1] || p, c = P[u._li + 1] || p, l = Math.hypot(c.x - a.x, c.y - a.y) || 1, lo = u._lo || 0;
    let gx = p.x - (c.y - a.y) / l * lo, gy = p.y + (c.x - a.x) / l * lo;
    if (lo && !w.nav.walkXY(gx, gy)) { gx = p.x; gy = p.y; }
    moveTo(w, u, gx, gy, LANE_ARRIVE, true); u._mvLi = u._li;
  }
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
