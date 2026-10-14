// Movement: path following (A* via nav.js), turn rate, knockback, hull separation. Pure.
import { canMove } from './status.js';

const TAU = Math.PI * 2;
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
  const ang = Math.atan2(wy - u.y, wx - u.x);
  const rem = faceToward(u, ang, dt);
  if (rem > 0.35) return false;
  const step = Math.min(u.ms * dt, Math.hypot(wx - u.x, wy - u.y));
  const o = nav.slide(u.x, u.y, u.radius, u.x + Math.cos(ang) * step, u.y + Math.sin(ang) * step);
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

/** Push overlapping bodies apart (both move half the overlap). */
export function separate(w, u) {
  if (u._noCollide || u._building) return;
  const cand = w.index.query(u.x, u.y, u.radius + 48, w._qc);
  for (let i = 0; i < cand.length; i++) {
    const o = cand[i];
    if (o === u || o._dead || o._building || o._noCollide) continue;
    let dx = u.x - o.x, dy = u.y - o.y;
    const min = (u.radius + o.radius) * 0.85, d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    let d = Math.sqrt(d2);
    if (d < 0.01) { const a = ((u._nid * 2654435761) >>> 0) / 4294967296 * TAU; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
    const push = (min - d) * 0.5, ux = dx / d, uy = dy / d;
    const a = w.nav.slide(u.x, u.y, u.radius, u.x + ux * push, u.y + uy * push); u.x = a.x; u.y = a.y;
    if (!o._kb) { const b = w.nav.slide(o.x, o.y, o.radius, o.x - ux * push, o.y - uy * push); o.x = b.x; o.y = b.y; }
  }
}
