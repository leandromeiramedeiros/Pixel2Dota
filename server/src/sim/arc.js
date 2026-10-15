// Melee arc: melee attackers (lane creeps, neutrals, heroes, summons) spread around their target on a ring instead of all
// walking into its centre (Dota units path to a free spot next to the target; engine behaviour, not in the files). Pure.
import { inAttackRange } from './combat.js';
import { moveTo, stepMove } from './move.js';

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
/** Melee unit vs t, near it: walk to a free slot on the ring and attack from there. Returns false when t is still far
 *  (> SLOT_NEAR, edge distance): the caller chases it directly. It stops as soon as it is in range unless it stands inside
 *  another body (then it keeps going to its slot). */
export function engage(w, u, t, dt) {
  if (Math.hypot(t.x - u.x, t.y - u.y) - t.radius - u.radius > SLOT_NEAR) { u._slot = null; return false; }
  if (!u._slot || u._slot.t !== t || ((w.tick + u._nid) % 15 === 0 && !inAttackRange(u, t, -4))) pickSlot(w, u, t);
  const gx = slotX(u, t), gy = slotY(u, t);
  if (inAttackRange(u, t, -4) && (Math.hypot(gx - u.x, gy - u.y) < 12 || !crowded(w, u))) { if (u._mv) u._mv = null; return true; }
  if (!u._mv || u._mv.tgt) moveTo(w, u, gx, gy, 4, true);
  else { u._mv.gx = gx; u._mv.gy = gy; }
  stepMove(w, u, dt);
  return true;
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
