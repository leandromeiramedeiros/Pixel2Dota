// Movement: path following (A* via nav.js), turn rate, knockback, hull separation. Pure.
import { KIND } from '../../../shared/protocol.js';
import { canMove } from './status.js';

const TAU = Math.PI * 2;
const TURN_FREE = 0.2, TURN_STOP = Math.PI / 2;   // rad: walk straight below FREE, curve between, turn in place at/above STOP
export function norm(a) { while (a > Math.PI) a -= TAU; while (a <= -Math.PI) a += TAU; return a; }
export const angDiff = (a, b) => norm(b - a);

/** Turn u.facing toward `ang` at the unit's turn rate. Returns the remaining |angle| (0 = facing it). */
export function faceToward(u, ang, dt) {
  const d = norm(ang - u.facing), m = u._turn * dt, ad = Math.abs(d);
  if (ad <= m) { u.facing = ang; return 0; }
  u.facing = norm(u.facing + (d > 0 ? m : -m));
  return ad - m;
}

/** Start moving u to (x,y); finishes within `stop` units. direct = no A* (straight line + wall sliding). */
export function moveTo(w, u, x, y, stop, direct) {
  u._mv = { gx: x, gy: y, stop: stop === undefined ? 8 : stop, direct: !!direct, tgt: null, path: null, pi: 0, ver: -1, stuck: 0, rep: 0, pgx: x, pgy: y };
}
/** Follow a unit (re-targets its position every tick) until within `stop` of its centre. */
export function follow(w, u, t, stop, direct) {
  u._mv = { gx: t.x, gy: t.y, stop: stop === undefined ? 8 : stop, direct: direct !== false, tgt: t, path: null, pi: 0, ver: -1, stuck: 0, rep: 0, pgx: t.x, pgy: t.y };
}
export const stopMove = (u) => { u._mv = null; };

/** One tick of u._mv. Returns true when there is nothing (left) to do, false while still en route / blocked. */
export function stepMove(w, u, dt) {
  const m = u._mv;
  if (!m) return true;
  if (u._wind > 0 || !canMove(u) || u._channel) return false;
  if (m.tgt) {
    if (m.tgt._dead) { u._mv = null; return true; }
    m.gx = m.tgt.x; m.gy = m.tgt.y;
  }
  const dx = m.gx - u.x, dy = m.gy - u.y, d = Math.hypot(dx, dy);
  if (d <= m.stop) { u._mv = null; return true; }
  const nav = w.nav;
  let wx = m.gx, wy = m.gy;
  if (!m.direct) {
    m.rep -= dt;
    let need = !m.path;
    if (!need && m.rep <= 0) need = m.ver !== nav.version || (m.tgt && Math.hypot(m.gx - m.pgx, m.gy - m.pgy) > 200);
    if (need && w.pathBudget()) {
      m.path = nav.findPath(u.x, u.y, m.gx, m.gy, u.radius); m.pi = 0; m.ver = nav.version; m.pgx = m.gx; m.pgy = m.gy; m.rep = 0.5;
    }
    const P = m.path;
    if (P && P.length) {
      while (m.pi < P.length - 1 && Math.hypot(P[m.pi].x - u.x, P[m.pi].y - u.y) < 30) m.pi++;
      const p = P[m.pi];
      if (m.pi >= P.length - 1 && Math.hypot(p.x - u.x, p.y - u.y) < 20 && d > m.stop + 40) { u._mv = null; return true; }   // best-effort arrival (goal unreachable)
      wx = p.x; wy = p.y;
    }
  }
  let ang = Math.atan2(wy - u.y, wx - u.x);
  if (u.kind === KIND.HERO) ang = steer(w, u, m, ang, Math.hypot(wx - u.x, wy - u.y));
  // Turn while moving: nearly aligned -> full speed straight at the waypoint; otherwise advance along the current facing at
  // cos(misalignment) speed (a curved start) and only turn in place beyond TURN_STOP. Approximation of Dota's turn-then-walk.
  const rem = faceToward(u, ang, dt);
  if (rem >= TURN_STOP) return false;
  const along = rem <= TURN_FREE;
  const step = Math.min(u.ms * dt * (along ? 1 : Math.cos(rem)), Math.hypot(wx - u.x, wy - u.y));
  const da = along ? ang : u.facing;
  const o = nav.slide(u.x, u.y, u.radius, u.x + Math.cos(da) * step, u.y + Math.sin(da) * step);
  const moved = Math.hypot(o.x - u.x, o.y - u.y);
  u.x = o.x; u.y = o.y;
  if (moved > 0.01) u._moved = true;
  if (moved < step * 0.25) {
    m.stuck += dt;
    if (m.stuck > 0.35) {
      if (m.direct) { m.direct = false; m.path = null; m.stuck = 0; m.rep = 0; }
      else if (m.stuck > 1.5) { u._mv = null; return true; }
      else { m.path = null; m.rep = 0; }
    }
  } else if (m.stuck > 0) m.stuck = Math.max(0, m.stuck - dt);
  return false;
}

const STEER_LOOK = 110, STEER_STEP = 0.2, STEER_MAX = 8;   // look-ahead beyond the own hull; probe angle step (rad) and count per side
/**
 * Unit-aware local steering for heroes (A* only knows trees/cliffs/buildings). If a STANDING body (not walking, so it will not step
 * aside) blocks the straight line toward the waypoint within the look-ahead, probe directions fanning out from it and take the first
 * clear one, sticking to the side picked last time so a row of creeps is passed on one side. Bodies closer than the waypoint only;
 * the move target is ignored. Fully boxed in -> straight on (separation shoves). Dota paths heroes around units; local approximation.
 */
function steer(w, u, m, ang, dist) {
  const look = Math.min(dist, STEER_LOOK + u.radius);
  if (look < u.radius) return ang;
  const cand = w.index.query(u.x, u.y, look + u.radius + 64, w._qs);
  let n = 0;
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i];
    if (o === u || o._dead || o._building || o._noCollide || o === m.tgt || o === u._tgt || yieldOf(o) >= 1) continue;
    cand[n++] = o;
  }
  cand.length = n;
  if (!n || !blocked(u, cand, ang, look)) { m.side = 0; return ang; }
  const s0 = m.side || (u._nid & 1 ? 1 : -1);
  for (let k = 1; k <= STEER_MAX; k++) for (const s of [s0, -s0]) {
    const a = ang + s * k * STEER_STEP;
    if (!blocked(u, cand, a, look)) { m.side = s; return a; }
  }
  return ang;
}
function blocked(u, list, a, look) {
  const cx = Math.cos(a), cy = Math.sin(a);
  for (let i = 0; i < list.length; i++) {
    const o = list[i], rx = o.x - u.x, ry = o.y - u.y, t = rx * cx + ry * cy, R = u.radius + o.radius;
    if (t > 0 && t - o.radius <= look && Math.abs(ry * cx - rx * cy) < R) return true;
  }
  return false;
}

/** Knockback / forced motion: u._kb = {dx,dy,v,left,onEnd?}. Returns true while active. */
export function stepKb(w, u, dt) {
  const k = u._kb;
  if (!k) return false;
  const step = Math.min(k.v * dt, k.left);
  const o = w.nav.slide(u.x, u.y, u.radius, u.x + k.dx * step, u.y + k.dy * step);
  const moved = Math.hypot(o.x - u.x, o.y - u.y);
  u.x = o.x; u.y = o.y; k.left -= step; u._moved = true;
  if (k.left <= 0.01 || moved < step * 0.2) { u._kb = null; u._dirty = true; if (k.onEnd) k.onEnd(w, u); }
  return true;
}

const SEP_RATE = 0.5, SEP_MAX = 3;   // fraction of the overlap resolved per tick, max push per pair per tick (u): damped, no skating
/** How readily a body yields when pushed: walking units step aside, units standing / attacking / channelling barely move. */
const yieldOf = (u) => (u._kb ? 0 : u._mv && !u._wind && !u._channel ? 1 : 0.15);

/** Hull separation, every tick for every non-building body (standing ones too): overlapping hulls are pushed apart, the walker
 *  taking most of the push, so a creep standing and attacking keeps a still hitbox. Position only: facing is never touched here. */
export function separate(w, u) {
  if (u._noCollide || u._building) return;
  const cand = w.index.query(u.x, u.y, u.radius + 48, w._qc), yu = yieldOf(u);
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i];
    if (o === u || o._dead || o._building || o._noCollide) continue;
    let dx = u.x - o.x, dy = u.y - o.y;
    const min = u.radius + o.radius, d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    let d = Math.sqrt(d2);
    if (d < 0.01) { const a = ((u._nid * 2654435761) >>> 0) / 4294967296 * TAU; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
    const yo = yieldOf(o), ys = yu + yo || 1, push = Math.min((min - d) * SEP_RATE, SEP_MAX), ux = dx / d, uy = dy / d;
    const pu = push * yu / ys, po = push * yo / ys;
    if (pu > 0.01) { const a = w.nav.slide(u.x, u.y, u.radius, u.x + ux * pu, u.y + uy * pu); u.x = a.x; u.y = a.y; }
    if (po > 0.01) { const b = w.nav.slide(o.x, o.y, o.radius, o.x - ux * po, o.y - uy * po); o.x = b.x; o.y = b.y; }
  }
}
