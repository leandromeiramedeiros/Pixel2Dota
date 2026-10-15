// Screen pick: which unit is under the cursor. Pure (no three / DOM), so test/pick.test.js runs it in node. Hover and click both go through
// renderer.pick -> index.js builds the candidates and calls pickAt, so the highlighted unit is always the one a click selects.
//
// Rule (deterministic, in this order):
//   1. Dead / dying / ragdolling units are never candidates (actors.js addPick).
//   2. Hit = cursor inside the unit's screen box. The box is the visible body (tight bounds of the voxel model / sprite / building mesh at the
//      current camera, leaned like the drawn model), at least MIN_* css px so far or tiny units stay clickable.
//   3. Overlap: units (heroes, creeps, couriers, wards, neutrals) beat buildings; then the box whose centre is closest to the cursor, measured
//      in that box's own half-sizes (the creep you point at beats the one you barely touch); then nearest to the camera (clip w); then id.
//   4. Trees only when no unit is hit.
// End state: once every unit is voxel, replace this with an ID-buffer pick (render unit ids to an offscreen target, read one pixel) - the hit
// shape then equals the drawn pixels exactly. Until then the boxes below are the contract. Not built on purpose.

/** Minimum half-size of a unit box in css px (full size = 2x): mouse / touch. */
export const MIN_HW = 10, MIN_HH = 14, TOUCH_MIN_HW = 15, TOUCH_MIN_HH = 20;
/** Body box below the foot point, as a share of the half-width (the contact shadow / feet). */
export const FOOT_PAD = 0.3;

/**
 * Screen box (css px) of a vertical body: foot point F and head point T, body half-width rpx. Grows around its centre to the minimum half-sizes.
 * Returns { x0, y0, x1, y1 } (y down).
 */
export function bodyBox(fx, fy, tx, ty, rpx, touch = false, pad = FOOT_PAD) {
  return minBox(Math.min(fx, tx) - rpx, Math.min(fy, ty), Math.max(fx, tx) + rpx, Math.max(fy, ty) + rpx * pad, touch);
}

/** Grow a box around its centre to the minimum half-sizes (never shrinks). */
export function minBox(x0, y0, x1, y1, touch = false) {
  const mhw = touch ? TOUCH_MIN_HW : MIN_HW, mhh = touch ? TOUCH_MIN_HH : MIN_HH;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max((x1 - x0) / 2, mhw), hh = Math.max((y1 - y0) / 2, mhh);
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

/**
 * Box of a world-space vertical cylinder (foot x, y, z; radius r; height h; optional lean = { dx, dy, th }: the head tilts th rad along the
 * horizontal unit vector (dx, dy) in game coords, as the shader leans the model about its feet; pad = box below the foot as a share of r, default
 * FOOT_PAD; o = { lean, touch, pad }). project(x, y, z) -> { sx, sy, w, k } | null
 * (css px, clip w, css px per world unit at that depth). null when behind the camera.
 */
export function cylinderBox(project, x, y, z, r, h, o = {}) {
  const lean = o.lean;
  const f = project(x, y, z); if (!f) return null;
  let tx = x, ty = y, tz = z + h;
  if (lean && lean.th > 0) { const s = Math.sin(lean.th) * h; tx = x + lean.dx * s; ty = y + lean.dy * s; tz = z + Math.cos(lean.th) * h; }
  const t = project(tx, ty, tz); if (!t) return null;
  return { ...bodyBox(f.sx, f.sy, t.sx, t.sy, r * f.k, o.touch, o.pad == null ? FOOT_PAD : o.pad), w: f.w };
}

/** Normalised distance of the cursor from a box centre: 0 at the centre, 1 at the edge midpoints (box half-sizes as the unit). */
export function boxScore(c, px, py) {
  const hw = (c.x1 - c.x0) / 2, hh = (c.y1 - c.y0) / 2;
  return Math.hypot((px - (c.x0 + c.x1) / 2) / hw, (py - (c.y0 + c.y1) / 2) / hh);
}

/** True when candidate a beats b at the cursor (the priority rule above). */
export function better(a, b, px, py) {
  const ba = a.building ? 1 : 0, bb = b.building ? 1 : 0;
  if (ba !== bb) return ba < bb;
  const sa = Math.round(boxScore(a, px, py) * 1000), sb = Math.round(boxScore(b, px, py) * 1000);   // 1/1000 of a box: float noise never decides
  if (sa !== sb) return sa < sb;
  const wa = Math.round(a.w * 100), wb = Math.round(b.w * 100);
  if (wa !== wb) return wa < wb;
  return String(a.id) < String(b.id);
}

/**
 * cands: [{ id, building?, x0, y0, x1, y1, w }] (css px boxes of live units). trees: () => tree candidate | null, only called when no unit is hit
 * (alpha test is per tree and costs more). Returns { unit: candidate | null, tree: candidate | null }.
 */
export function pickAt(cands, px, py, trees = null) {
  let best = null;
  for (const c of cands) {
    if (px < c.x0 || px > c.x1 || py < c.y0 || py > c.y1) continue;
    if (!best || better(c, best, px, py)) best = c;
  }
  return { unit: best, tree: !best && trees ? trees() : null };
}
