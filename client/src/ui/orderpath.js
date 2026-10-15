// Order path preview (Invoker Trainer style): after a move / attack / attack-move order, marching dashes run from the hero along its
// A* path (shared/nav.js, the same nav the sim walks) to the target, with a cross at the end; green = move, red = attack, orange = attack-move.
// Fades out after PATH.LIFE ms.  createOrderPaths() -> { note(order, from, unitPos), draw(ctx, now, o), clear() }.  Desktop and touch share it (game.js send wrapper).
import { Nav } from '../../../shared/nav.js';
import { ORDER } from '../../../shared/protocol.js';

export const PATH = { LIFE: 1000, FADE: 400, STEP: 64, DASH: 7, SPEED: 0.05 };   // ms, ms, world units between projected samples, px dash, px / ms march
export const PATH_COL = { [ORDER.MOVE]: '93,255,122', [ORDER.ATTACK]: '255,106,88', [ORDER.AMOVE]: '255,170,70' };

/** Drop the leading waypoints the walker (hx, hy) is already past: it is closer to the next one than that waypoint is. */
export function trimPath(pts, hx, hy) {
  let i = 0;
  while (i + 1 < pts.length) {
    const a = pts[i], b = pts[i + 1];
    if (Math.hypot(hx - a.x, hy - a.y) < 40 || Math.hypot(hx - b.x, hy - b.y) < Math.hypot(a.x - b.x, a.y - b.y)) i++;
    else break;
  }
  return i ? pts.slice(i) : pts;
}

/** Polyline [{x,y}] -> samples no more than `step` apart (so the projected line follows the terrain height). */
export function densify(pts, step = PATH.STEP) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) {
      const a = pts[i - 1], n = Math.floor(Math.hypot(p.x - a.x, p.y - a.y) / step);
      for (let k = 1; k < n; k++) out.push({ x: a.x + (p.x - a.x) * k / n, y: a.y + (p.y - a.y) * k / n });
    }
    out.push(p);
  }
  return out;
}

/** Alpha of a path `age` ms old: 1, then a FADE ms fade to 0 at LIFE. */
export const pathAlpha = (age) => (age >= PATH.LIFE ? 0 : age <= PATH.LIFE - PATH.FADE ? 1 : (PATH.LIFE - age) / PATH.FADE);

export function createOrderPaths() {
  let nav = null, cur = null;   // { t, id, x, y, pts, at }
  return {
    /** order = { t, x?, y?, id? } just sent; from = the hero ({x, y, radius}); unitPos(id) -> {x, y} | null for attack targets */
    note(order, from, unitPos) {
      if (!order || !from || !PATH_COL[order.t] || order.q) return;
      const tg = order.id ? unitPos(order.id) : order;
      if (!tg || !Number.isFinite(tg.x)) return;
      if (!nav) nav = new Nav();
      let pts = nav.findPath(from.x, from.y, tg.x, tg.y, from.radius || 24);
      if (!pts.length) pts = [{ x: tg.x, y: tg.y }];
      cur = { t: order.t, id: order.id || '', x: tg.x, y: tg.y, pts, at: performance.now() };
    },
    clear() { cur = null; },
    /** o = { from:{x,y} (hero as drawn), unitPos(id), toScreen(x, y) -> {x,y}, behind(x, y) -> bool (near-plane clip) } */
    draw(g, now, o) {
      if (!cur || !o.from) return;
      const age = now - cur.at, a = pathAlpha(age);
      if (a <= 0) { cur = null; return; }
      const end = cur.id ? o.unitPos(cur.id) : null, ex = end ? end.x : cur.x, ey = end ? end.y : cur.y;
      cur.pts = trimPath(cur.pts, o.from.x, o.from.y);
      const pts = [{ x: o.from.x, y: o.from.y }, ...cur.pts.slice(0, -1), { x: ex, y: ey }];
      const ws = densify(pts), col = PATH_COL[cur.t];
      const sp = []; for (const p of ws) sp.push(o.behind && o.behind(p.x, p.y) ? null : o.toScreen(p.x, p.y));
      const line = (dx, dy, style, w) => {
        g.beginPath(); let pen = false;
        for (const s of sp) { if (!s) { pen = false; continue; } if (pen) g.lineTo(s.x + dx, s.y + dy); else { g.moveTo(s.x + dx, s.y + dy); pen = true; } }
        g.strokeStyle = style; g.lineWidth = w; g.stroke();
      };
      g.save(); g.lineCap = 'butt'; g.lineJoin = 'round';
      g.setLineDash([PATH.DASH, PATH.DASH]); g.lineDashOffset = -age * PATH.SPEED;   // dashes march toward the target
      line(0, 1.5, `rgba(0,0,0,${(0.55 * a).toFixed(2)})`, 3);
      line(0, 0, `rgba(${col},${a.toFixed(2)})`, 2.5);
      g.setLineDash([]);
      const s = sp[sp.length - 1];
      if (s) {   // target cross
        const x = Math.round(s.x), y = Math.round(s.y), r = 6;
        g.lineWidth = 5; g.strokeStyle = `rgba(0,0,0,${(0.7 * a).toFixed(2)})`;
        g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
        g.lineWidth = 2.5; g.strokeStyle = `rgba(${col},${a.toFixed(2)})`;
        g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
      }
      g.restore();
    },
  };
}
