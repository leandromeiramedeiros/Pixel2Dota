// Temporary vision sources (Sun Strike, Crystal Nova, Mirana Arrow...). Pure. Created through w.addVision(), see API.md.
//
// A source is a vision circle owned by a team. By default it is FLYING (like Dota's unobstructed AddFOWViewer): it ignores cliffs and trees;
// pass `ground: true` for a source that is blocked by high ground / trees like a unit. They are NOT units: nothing can target, see or collide
// with them, and they never show in the minimap / unit lists. The room mirrors w.visionSources (Map id -> src) into
// state.vision ({id, team, x, y, r, fly}); the client fog casts each entry from its position (flying: radius only; ground: rays like a unit).
//   addVision(w, { team|owner, x, y, r, dur?, delay?, linger?, follow?, ground? })
//     dur     seconds the source lives (omit = until `follow` ends). Counted from now.
//     projectile  shorthand for follow: the source rides w.spawnProjectile()'s projectile p until it ends (then lingers)
//     follow  (w, src) -> {x, y, end?} | null   called every tick: moves the source; null or end:true = the moving phase is over
//     linger  seconds the source stays at its last position after `follow` ends (default 0)
import { TEAM } from '../../../shared/protocol.js';

export function addVision(w, o) {
  const team = typeof o.team === 'number' ? o.team : o.owner ? o.owner.team : TEAM.NONE;
  if (!w.visionSources) w.visionSources = new Map();
  const src = {
    id: 'v' + (w._vid = (w._vid || 0) + 1), team, x: o.x, y: o.y, r: o.r, fly: !o.ground,
    until: o.dur ? w.time + o.dur : Infinity, follow: o.follow || (o.projectile ? followProjectile(o.projectile) : null), linger: o.linger || 0,
  };
  if (!(o.r > 0) || team < 0 || team > 1) return null;
  w.visionSources.set(src.id, src);
  return src;
}

export function removeVision(w, src) { if (src && w.visionSources) w.visionSources.delete(src.id); }

/** Per tick: move followers, expire. Called from World.step. */
export function updateVision(w) {
  const m = w.visionSources;
  if (!m || !m.size) return;
  for (const s of m.values()) {
    if (s.follow) {
      const p = s.follow(w, s);
      if (p) { s.x = p.x; s.y = p.y; }
      if (!p || p.end) {
        s.follow = null;
        s.until = Math.min(s.until, w.time + s.linger);
      }
    }
    if (s.until <= w.time + 1e-9) m.delete(s.id);
  }
}

/** Does `team` currently see (x, y)? Radius only: NO cliff / tree blocking (the client fog adds those for ground sources; the sim does not use this for targeting). */
export function teamSees(w, team, x, y) {
  if (w.visionSources) for (const s of w.visionSources.values()) if (s.team === team && Math.hypot(s.x - x, s.y - y) <= s.r) return true;
  for (const u of w.units.values()) {
    if (u.team !== team || u._dead) continue;
    if (Math.hypot(u.x - x, u.y - y) <= w.visionRadius(u)) return true;
  }
  return false;
}

/** follow() for a projectile: tracks p while it is alive, ends (at its last position) afterwards. */
const followProjectile = (p) => (w) => (w.projs.indexOf(p) >= 0 ? { x: p.x, y: p.y } : null);
