// Parameterised voxel part builders (docs/VOXEL.md "Parts"). Browser-safe. Every builder writes into a Vox; materials are ids or
// functions of the cell centre ((px, py, pz) => id), so stripes, bands and trims live inside one part.
// T = a rig body transform (rig.T.torso / .head / .body): the part is described in rest space and posed by T; T null draws the rest
// coordinates exactly (hand-tuned models stay bit-identical). Limbs take posed joint positions straight from the rig.
// Order rules: body -> hair shell / helmet -> face window carved back in skin -> painted details (eyes, mouth, emblems) last; later writes win.
import { add3, sub3, mul3, norm3, cross3, dot3, lerp3, apM, xfApply, xfInv, aimDir } from './rig.js';

// ---------- volume helpers ----------
/** v.each in rest space, posed by T. f gets rest-space cell centres; the rest box still clips like v.each. */
export function vol(v, T, x0, y0, z0, x1, y1, z1, f) {
  if (!T) return v.each(x0, y0, z0, x1, y1, z1, f);
  const I = xfInv(T), b0 = [Math.floor(x0), Math.floor(y0), Math.floor(z0)], b1 = [Math.ceil(x1) + 1, Math.ceil(y1) + 1, Math.ceil(z1) + 1];
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let c = 0; c < 8; c++) {
    const w = xfApply(T, [c & 1 ? b1[0] : b0[0], c & 2 ? b1[1] : b0[1], c & 4 ? b1[2] : b0[2]]);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
  }
  v.each(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], (px, py, pz, x, y, z) => {
    const q = xfApply(I, [px, py, pz]);
    for (let k = 0; k < 3; k++) if (q[k] < b0[k] || q[k] >= b1[k]) return;
    return f(q[0], q[1], q[2], x, y, z);
  });
}
const mat = (m, px, py, pz, t) => (typeof m === 'function' ? m(px, py, pz, t) : m);
/** Ellipsoid in rest space (centre c, radii r), optional mask only(px,py,pz). */
export function ell(v, T, c, r, m, only) {
  if (!T) return v.ellipsoid(c[0], c[1], c[2], r[0], r[1], r[2], m, only);
  vol(v, T, c[0] - r[0], c[1] - r[1], c[2] - r[2], c[0] + r[0], c[1] + r[1], c[2] + r[2], (px, py, pz, x, y, z) => {
    const d = ((px - c[0]) / r[0]) ** 2 + ((py - c[1]) / r[1]) ** 2 + ((pz - c[2]) / r[2]) ** 2;
    if (d <= 1 && (!only || only(px, py, pz, x, y, z))) return mat(m, px, py, pz);
  });
}
/** Capsule between rest-space points a, b (posed by T), radius r0 -> r1. */
export const cap = (v, T, a, b, r0, m, r1 = r0) => v.capsule(xfApply(T, a), xfApply(T, b), r0, m, r1);
/** Oriented box from a to b (posed coords): half width hw along `side`, half thickness ht; m may be a function of (px,py,pz, t along a->b). */
export function obox(v, a, b, side, hw, ht, m) {
  const ab = sub3(b, a), L = Math.hypot(...ab) || 1, u = mul3(ab, 1 / L), w = norm3(sub3(side, mul3(u, dot3(side, u)))), n = cross3(u, w);
  const R = Math.max(typeof hw === 'function' ? Math.max(hw(0), hw(0.5), hw(1)) : hw, ht) + 0.5;
  v.each(Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R, (px, py, pz) => {
    const q = [px - a[0], py - a[1], pz - a[2]], l = dot3(q, u);
    if (l < 0 || l > L) return;
    const t = l / L, hwt = typeof hw === 'function' ? hw(t) : hw;
    if (Math.abs(dot3(q, w)) > hwt || Math.abs(dot3(q, n)) > ht) return;
    return mat(m, px, py, pz, t);
  });
}
/** Disc (cylinder) at c with unit normal n, radius r, thickness th; m(px,py,pz, rad01, front) with front = the +n face layer. */
export function disc(v, c, n, r, th, m) {
  const R = r + th;
  v.each(c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R, (px, py, pz) => {
    const q = [px - c[0], py - c[1], pz - c[2]], h = dot3(q, n), rad = Math.hypot(...sub3(q, mul3(n, h)));
    if (Math.abs(h) > th / 2 || rad > r) return;
    return mat(m, px, py, pz, rad / r, h > th / 2 - 1);
  });
}
/** Recolour front-most voxels: pts [[x, z, m?], ...] with a default m. */
export const decal = (v, pts, m) => { for (const [x, z, mm] of pts) v.paintFront(x, z, mm ?? m); };
/** Two-tone strand stripes: every n-th column below zMax uses b (hair, fur, cloth folds). */
export const stripes = (a, b, n = 3, zMax = 31) => (px, pz = 0) => (pz < zMax && (Math.floor(px) % n) === 0 ? b : a);

// ---------- limbs ----------
/** Tapered capsule chain through posed points pts with radii (one per point). */
export function limb(v, pts, radii, m) { for (let i = 0; i + 1 < pts.length; i++) v.capsule(pts[i], pts[i + 1], radii[i], m, radii[i + 1]); }
/** Band (bracer, cuff, greave) along a -> b between fractions t0..t1. */
export const band = (v, a, b, t0, t1, r, m) => v.capsule(lerp3(a, b, t0), lerp3(a, b, t1), r, m);
/** Hand / fist / paw pad: ellipsoid at the hand joint. */
export const hand = (v, p, r, m) => v.ellipsoid(p[0], p[1], p[2], r[0], r[1], r[2], m);

/** Foot at the rig's foot point f = [x, y, z] (sole), facing -y. type 'boot' | 'bare' | 'hoof' | 'paw'; o sizes (defaults: Lina's boot). */
export function feet(v, f, type, m, o = {}) {
  const [fx, by, bz] = f;
  if (type === 'boot') {
    const hw = o.hw ?? 2, front = o.front ?? 4, back = o.back ?? 2, h = o.h ?? 3.6, toeY = o.toeY ?? 2.5, toeZ = o.toeZ ?? 2.4, tipY = o.tipY ?? 3.2, tipW = o.tipW ?? 1.4;
    v.each(fx - hw, by - front, bz, fx + hw, by + back, bz + 3, (px, py, pz) => {
      const qz = pz - bz;
      if (px < fx - hw || px > fx + hw || py < by - front || py > by + back || qz < 0 || qz > h) return;
      if (py < by - toeY && qz > toeZ) return;                 // rounded toe
      if (py < by - tipY && Math.abs(px - fx) > tipW) return;
      return m;
    });
  } else if (type === 'bare') {
    v.ellipsoid(fx, by - (o.front ?? 1.2), bz + 0.9, o.hw ?? 1.4, o.len ?? 2.4, 1.1, m);
  } else if (type === 'hoof') {
    v.capsule([fx, by, bz + 0.6], [fx, by, bz + (o.h ?? 2.2)], o.r ?? 1.5, m, (o.r ?? 1.5) * 0.8);
  } else if (type === 'paw') {
    v.ellipsoid(fx, by - 0.6, bz + 0.9, o.hw ?? 1.6, o.len ?? 2, 1.1, m);
    for (const dx of [-1, 0, 1]) v.ellipsoid(fx + dx * 0.9, by - (o.len ?? 2) - 0.2, bz + 0.6, 0.6, 0.7, 0.7, o.toe ?? m);
  }
}

// ---------- body ----------
/** Torso / any body of revolution: section(dx, dy, z, px, py, pz) -> id or undefined, dx dy from (c[0], c[1]), z from z0; box half extent `r`. */
export const torso = (v, T, o, section) => vol(v, T, o.c[0] - o.r, o.c[1] - o.r, o.z0, o.c[0] + o.r, o.c[1] + o.r, o.z1, (px, py, pz) => section(px - o.c[0], py - o.c[1], pz - o.z0, px, py, pz));

/**
 * Flared skirt / tabard / gown: radius r0 - dr * t over z0..z1 (t from zr over h), y squash sy, outer shell `shell` thick.
 * hem: [[zTop, cosThreshold | null], ...] trim bands on the shell (cos(angle * scallops) > threshold = scallop), checked in order.
 * Optional (open gowns, split skirts): hollow (true: only the shell, legs stay visible; a number: carve only in front of that dy; (dx, dy, pz) => carve?; a solid core
 * means fewer faces), open (half angle in degrees of a front split, front = -y; or pz => degrees: a coat closed below, open over the chest),
 * edge (degrees of trim along the split), lean (+y shift per voxel below z1: tails trailing back), floor(phi) -> lowest z at phi (radians from the
 * front, 0..PI: pointed tails, back notch), hemH (trim height above the floor), inner (material of the inside layer, seen through the split).
 */
export function skirt(v, T, o, cloth, trim) {
  const [cx, cy] = o.c, R = o.r0 + (o.dr < 0 ? 0 : o.dr * Math.max(0, (o.zr - o.z0) / o.h)) + 1, lean = o.lean || 0, D = Math.PI / 180;
  const openAt = typeof o.open === 'function' ? pz => o.open(pz) * D : () => (o.open || 0) * D;
  const edge = (o.edge || 0) * Math.PI / 180, ly = lean * (o.z1 - o.z0);
  vol(v, T, cx - R, cy - R, o.z0, cx + R, cy + R + ly, o.z1, (px, py, pz) => {
    const t = (pz - o.zr) / o.h, r = o.r0 - o.dr * t, dx = px - cx, dy = (py - cy - lean * (o.z1 - pz)) / o.sy;
    const d = Math.hypot(dx, dy); if (d > r) return;
    const shell = d > r - o.shell, ang = Math.atan2(dy, dx), phi = Math.acos(Math.max(-1, Math.min(1, -dy / (d || 1))));
    const open = openAt(pz); if (phi < open) return;
    const fl = o.floor ? o.floor(phi) : -Infinity; if (pz < fl) return;
    if (o.hollow && !shell) { if (o.hollow === true || (typeof o.hollow === 'function' ? o.hollow(dx, dy, pz) : dy < o.hollow)) return; return o.inner || cloth; }
    if (trim && (pz < fl + (o.hemH ?? 1) || phi < open + edge)) return trim;
    if (o.inner && d < r - o.shell * 0.5) return o.inner;
    for (const [zt, thr] of o.hem || []) {
      if (pz < zt && thr === null) return shell ? trim : cloth;
      if (pz < zt && shell && Math.cos(ang * o.scallops) > thr) return trim;
    }
    return cloth;
  });
}

/**
 * Standing collar / ruff / frill / crest fan: a flared shell around the neck axis (rest space, posed by T) from z0 (radius r0) to z1 (radius r1,
 * r = r0 + (r1 - r0) * f^flare, f = height fraction: flare < 1 opens fast like a funnel), y squash sy, thickness th, lean (+y per voxel of height:
 * flares back). Open at the front: half angle open0 at z0 -> open1 at z1 (degrees from -y). Top edge cut into `spikes` points per side, `spike`
 * deep (phase 0 = a point at the back centre); dip lowers the top toward the back centre (a fan higher at the sides). m(px, py, pz, f, inner):
 * inner = the inside half of the shell (a lighter lining).
 * fill(dx, dy, pz) -> true makes the inside solid there (behind a head: fewer faces, the cavity never shows).
 */
export function collar(v, T, o, m) {
  const [cx, cy] = o.c, H = o.z1 - o.z0, R = Math.max(o.r0, o.r1) + 1, lean = o.lean || 0, sy = o.sy ?? 1, th = o.th ?? 1.2, fl = o.flare ?? 1;
  const D = Math.PI / 180, o0 = (o.open0 ?? 0) * D, o1 = (o.open1 ?? o.open0 ?? 0) * D, n = o.spikes || 0, sp = o.spike || 0, ph = o.phase ?? 0;
  vol(v, T, cx - R, cy - R, o.z0, cx + R, cy + R + Math.max(0, lean * H), o.z1, (px, py, pz) => {
    const f = Math.max(0, (pz - o.z0) / H), r = o.r0 + (o.r1 - o.r0) * f ** fl, dx = px - cx, dy = (py - cy - lean * (pz - o.z0)) / sy, d = Math.hypot(dx, dy);
    if (d > r || (d < r - th && !(o.fill && o.fill(dx, dy, pz)))) return;
    const phi = Math.acos(Math.max(-1, Math.min(1, -dy / (d || 1)))), open = o0 + (o1 - o0) * f; if (phi < open) return;
    const top = o.z1 - (o.dip || 0) * Math.max(0, dy / (d || 1)); if (pz > top) return;
    if (n && sp) { const u = (Math.PI - phi) / (Math.PI - open) * n + 0.5 + ph, tri = Math.abs((u % 1) - 0.5) * 2; if (pz > top - sp * tri) return; }
    return typeof m === 'function' ? m(px, py, pz, f, d < r - th / 2) : m;
  });
}

/** Pauldron: dome over a shoulder joint sh (posed), radii r, trim band on the lower rim. */
export function pauldron(v, sh, r, m, trim, lift = 0.5) {
  const c = [sh[0], sh[1], sh[2] + lift];
  v.ellipsoid(c[0], c[1], c[2], r[0], r[1], r[2], (px, py, pz) => (trim && pz < c[2] + 0.6 ? trim : m), (px, py, pz) => pz > c[2] - 0.4);
}

// ---------- head ----------
/** Face window: front of the head (py < yCut), |dx| < halfW, below a per-column fringe line fringe[k] (k = round(px - cx - 0.5) - x0), above chin. */
export function faceWindow(o) {
  const { cx, yCut, halfW, fringe, x0 = -6, top = Infinity, chin = -Infinity } = o;
  const line = fringe ? px => { const k = Math.round(px - cx - 0.5) - x0; return k < 0 || k >= fringe.length ? 0 : fringe[k]; } : () => top;
  return (px, py, pz) => py < yCut && Math.abs(px - cx) < halfW && pz < line(px) && pz > chin;
}
/** Skull: ellipsoid c, r. With win, only the face window is written (the carve-back after a hair shell or helmet). */
export const head = (v, T, c, r, skin, win) => ell(v, T, c, r, skin, win);

/**
 * Hair shell (c, r: usually the skull + ~1 voxel, shifted back/up) minus the face window, then face: { c, r, m } (the skull's skin carved back
 * into the window), then optional long-hair parts. hair(px, pz) -> id (see stripes()). curtains: side locks in front of the shoulders with pointed tips; back: mass down the back with a jagged hem.
 * Defaults are Lina's; s = side, sway = tip phase.
 */
export function hairShell(v, T, o, hair) {
  const { c, r, win, head: hc, sway = 0 } = o;
  ell(v, T, c, r, (px, py, pz) => hair(px, pz), win && ((px, py, pz) => !win(px, py, pz)));
  if (o.face) head(v, T, o.face.c, o.face.r, o.face.m, win);   // carve the face window back in skin before the locks fall over it
  const [cx, cy] = hc;
  if (o.curtains) {
    const q = { inner: 6.4, outer: 8.9, outerK: 0.02, zRef: 30, front: -3.8, frontK: 0.08, back: 6, tip: 13.5, tipStep: 1.3, tipX: 6.3, tipK: 0.5, box: [-10, -6, 12, 10, 7, 31], ...o.curtains };
    for (const s of [-1, 1]) {
      vol(v, T, cx + q.box[0], cy + q.box[1], q.box[2], cx + q.box[3], cy + q.box[4], q.box[5], (px, py, pz) => {
        const ax = (px - cx) * s; if (ax < q.inner) return;
        const outer = q.outer + (q.zRef - pz) * q.outerK; if (ax > outer) return;
        if (py < cy + q.front + (q.zRef - pz) * q.frontK || py > cy + q.back) return;
        const tip = q.tip + ((Math.floor(py) * 5 + (s > 0 ? 2 : 0) + sway) % 3) * q.tipStep + (ax - q.tipX) * q.tipK;
        if (pz < tip) return;
        return hair(px + py, pz);
      });
    }
  }
  if (o.back) {
    const q = { w: 9.2, wZ: 20, wK: 0.12, depth: 8.4, dZ: 22, dK: 0.12, round: 2.2, tip: 11.6, tipJag: 1.6, tipK: 0.12, box: [-10, 1, 11, 10, 9, 31], ...o.back };
    vol(v, T, cx + q.box[0], cy + q.box[1], q.box[2], cx + q.box[3], cy + q.box[4], q.box[5], (px, py, pz) => {
      const ax = Math.abs(px - cx), w = q.w - Math.max(0, q.wZ - pz) * q.wK;
      if (ax > w) return;
      const back = cy + q.depth - Math.max(0, q.dZ - pz) * q.dK - (ax / w) ** 2 * q.round; if (py > back) return;
      const tip = q.tip + Math.abs(((px - cx) * 0.9 + sway) % 3 - 1.5) * q.tipJag + ax * q.tipK; if (pz < tip) return;
      return hair(px);
    });
  }
}

/** Helmet: shell ellipsoid minus the face window, brim band (z < brimZ + brimH) in `brim`; crest: { c, r, from: z, m } ridge on top. */
export function helmet(v, T, o, m, brim) {
  const { c, r, win, brimZ = -Infinity, brimH = 1 } = o;
  ell(v, T, c, r, (px, py, pz) => (brim && pz >= brimZ && pz < brimZ + brimH ? brim : m), win && ((px, py, pz) => !win(px, py, pz)));
  if (o.crest) { const k = o.crest; ell(v, T, k.c, k.r, k.m, (px, py, pz) => pz > k.from); }
}

/**
 * Painted eyes on the front-most voxels. o: { at: [[x0, wingX], ...] left-to-right, z (bottom row), style 'big' | 'dot', state 'open' | 'shut' | 'x' }.
 * M: { lash, skin, shine, pupil, irisD, iris, irisL } (dot uses lash, shine, pupil). 'big' = Lina's 3 x 5 chibi eye with an outer lash wing.
 */
export function eyes(v, o, M) {
  const z = o.z, st = o.state || 'open';
  for (const [x0, wingX] of o.at) {
    if (o.style === 'dot') {
      if (st === 'shut' || st === 'x') {
        const pts = st === 'x' ? [[0, 1], [1, 0]] : [[0, 0], [1, 0]];
        for (const [dx, dz] of pts) v.paintFront(x0 + dx, z + dz, M.lash);
        for (const dz of [0, 1]) for (let k = 0; k < 2; k++) if (!pts.some(([a, b]) => a === k && b === dz)) v.paintFront(x0 + k, z + dz, M.skin);
      } else { v.paintFront(x0, z + 1, M.shine); v.paintFront(x0 + 1, z + 1, M.pupil); v.paintFront(x0, z, M.pupil); v.paintFront(x0 + 1, z, M.pupil); }
      continue;
    }
    if (st === 'shut' || st === 'x') {   // closed: lash arc; x: crossed
      const pts = st === 'x' ? [[0, 3], [2, 3], [1, 2], [0, 1], [2, 1]] : [[0, 2], [1, 1], [2, 2]];
      for (const [dx, dz] of pts) v.paintFront(x0 + dx, z + dz, M.lash);
      for (let dz = 0; dz < 5; dz++) for (let k = 0; k < 3; k++) if (!pts.some(([a, b]) => a === k && b === dz)) v.paintFront(x0 + k, z + dz, M.skin);
      continue;
    }
    const rows = [[M.irisL, M.irisL, M.irisL], [M.iris, M.pupil, M.iris], [M.irisD, M.pupil, M.iris], [M.shine, M.irisD, M.irisD], [M.lash, M.lash, M.lash]];
    rows.forEach((row, dz) => row.forEach((m, k) => v.paintFront(x0 + k, z + dz, m)));
    if (wingX !== undefined) { v.paintFront(wingX, z + 4, M.lash); v.paintFront(wingX, z + 3, M.lash); }
  }
}
/** Mouth / blush / small painted marks: decal at [[x, z], ...]. */
export const mouth = (v, pts, m) => decal(v, pts, m);

// ---------- flames ----------
/**
 * Flame tongues from base b = [x, y, z] (rest space, posed by T). tongues: [[ox, oy, h, w, lean], ...] (later tongues win where they overlap).
 * o: { pow (taper), r0 (tip radius), bend (sideways sin wiggle), drift (y per z), gk, gb (height -> gradient), core, coreAdd (hotter core),
 *   stops [3] gradient cut points, box [x0, y0, x1, y1] relative to b }. grad: [f1, f2, f3, f4] ids outer -> core.
 */
export function flame(v, T, b, tongues, o, grad) {
  const [bx, by, bz] = b, st = o.stops || [0.3, 0.55, 0.8], bend = o.bend || 0, drift = o.drift || 0, gk = o.gk ?? 1, gb = o.gb || 0;
  const g = f => (f < st[0] ? grad[0] : f < st[1] ? grad[1] : f < st[2] ? grad[2] : grad[3]);
  for (const [ox, oy, h, w, lean = 0] of tongues) {
    vol(v, T, bx + o.box[0], by + o.box[1], bz, bx + o.box[2], by + o.box[3], bz + h, (px, py, pz) => {
      const f = (pz - bz) / h; if (f < 0 || f > 1) return;
      const r = w * Math.pow(1 - f, o.pow) + o.r0, sx = bx + ox + Math.sin(f * 3.2) * bend * f + lean * (pz - bz);
      const dy = drift ? py - (by + oy + drift * (pz - bz)) : py - by - oy, dd = Math.hypot(px - sx, dy);
      if (dd > r) return;
      return g(Math.min(1, f * gk + gb + (dd < r * o.core ? o.coreAdd : 0)));
    });
  }
}

// ---------- props at sockets ----------
/** Blade direction for a hand socket: pose aim (body frame) if given, else the thumb side of the fist (forward-up, off the forearm). */
export function gripDir(rig, k, aim) {
  const s = k === 'R' ? -1 : 1, Rt = rig.T.torso && rig.T.torso.R;
  if (aim) return norm3(apM(Rt, aimDir(aim, s)));
  const f = rig.dir['hand' + k], up = apM(Rt, [0, -1, 0.6]), t = norm3(sub3(up, mul3(f, dot3(up, f))));
  return norm3(add3(t, mul3(f, 0.35)));
}
/**
 * Weapon held in hand k ('R' | 'L'): type 'sword' | 'club' | 'spear' | 'axe' | 'katana' (+ o.curve, edgeOff, edgeSide, guardR). o: { len, w, aim ([el, hd] body frame), mats: { blade, guard, grip, edge? } }.
 * Returns the tip position.
 */
export function weapon(v, rig, k, type, o) {
  const h = rig.J['hand' + k], d = gripDir(rig, k, o.aim), M = o.mats, len = o.len ?? 7, w = o.w ?? 0.9;
  const cr = cross3(d, rig.dir['hand' + k]), side = Math.hypot(...cr) > 1e-3 ? norm3(cr) : apM(rig.T.torso && rig.T.torso.R, [1, 0, 0]);   // blade flat across the fist
  v.capsule(add3(h, mul3(d, -1.6)), add3(h, mul3(d, 0.9)), 0.55, M.grip);                       // grip through the fist
  v.ellipsoid(...add3(h, mul3(d, -1.9)), 0.8, 0.8, 0.8, M.guard);                                // pommel
  const b0 = add3(h, mul3(d, 1.4)), tip = add3(h, mul3(d, 1.4 + len));
  if (type === 'sword') {
    obox(v, add3(h, mul3(d, 1.1)), add3(h, mul3(d, 1.7)), side, 2.1, 0.6, M.guard);                // crossguard
    obox(v, b0, tip, side, t => w * (t > 0.8 ? (1 - t) / 0.2 + 0.15 : 1), 0.75, (px, py, pz, t) => (M.edge && t > 0.15 && t < 0.9 && Math.abs(dot3(sub3([px, py, pz], b0), side)) > w * 0.55 ? M.edge : M.blade));
  } else if (type === 'club') {
    v.capsule(b0, tip, w * 0.9, M.blade, w * 1.8);
  } else if (type === 'spear') {
    v.capsule(add3(h, mul3(d, -4)), tip, 0.5, M.grip);
    obox(v, tip, add3(tip, mul3(d, 3)), side, t => 1.1 * (1 - t) + 0.1, 0.4, M.blade);
  } else if (type === 'katana') {
    // round tsuba, slim blade curving toward the spine (o.curve voxels at the tip), cutting edge = a parallel chain offset by o.edgeOff along
    // the edge side (o.edgeSide: 1 / -1 flips it), M.edge (often emissive) drawn last so the edge line reads; tapers to the tip
    const e = mul3(norm3(cross3(d, side)), o.edgeSide ?? 1), cv = o.curve ?? len * 0.08, eo = o.edgeOff ?? 0.8, N = Math.max(4, Math.ceil(len));
    disc(v, add3(h, mul3(d, 1.3)), d, o.guardR ?? 1.6, 0.9, M.guard);
    const at = t => add3(add3(b0, mul3(d, len * t)), mul3(e, -cv * t * t));
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, r0 = w * (1 - t0 * 0.45), r1 = w * (1 - t1 * 0.45);
      v.capsule(at(t0), at(t1), r0 * 0.7, M.blade, r1 * 0.7);
      if (M.edge && t1 < 0.97) v.capsule(add3(at(t0), mul3(e, eo * (1 - t0 * 0.4))), add3(at(t1), mul3(e, eo * (1 - t1 * 0.4))), r0 * 0.55, M.edge, r1 * 0.55);
    }
    return at(1);
  } else if (type === 'axe') {
    v.capsule(b0, tip, 0.55, M.grip);
    obox(v, add3(tip, mul3(d, -2.6)), tip, side, 1.2, 0.45, M.blade);
    obox(v, add3(add3(tip, mul3(d, -2.6)), mul3(side, 1)), add3(add3(tip, mul3(d, 0.4)), mul3(side, 3.2)), d, 1.6, 0.4, M.edge || M.blade);
  }
  return tip;
}
/** Round shield on hand k: normal from aim (body frame, default forward-out), radius r; M: { face, rim, boss }. */
export function shield(v, rig, k, o, M) {
  const s = k === 'R' ? -1 : 1, Rt = rig.T.torso && rig.T.torso.R, n = norm3(apM(Rt, aimDir(o.aim || [0, 60], s)));
  const c = add3(rig.J['hand' + k], mul3(n, o.off ?? 1.1)), r = o.r ?? 4.2, th = o.th ?? 1.4;
  disc(v, c, n, r, th, (px, py, pz, rad, front) => (rad > 1 - 1.15 / r ? M.rim : rad < 1.3 / r && front ? M.boss : M.face));
  v.ellipsoid(...add3(c, mul3(n, th / 2)), 0.9, 0.9, 0.9, M.boss);
}
/** Recurve bow gripped at g (posed): limbs along unit axis d (tip to tip), string on the archer side n (made perpendicular to d).
 * o: { len (half length), bend (limb sweep toward the string at the tips), recurve (tip flick away from the string over the last quarter),
 * r (limb radius), string (false = none) }. M: { limb, tip?, grip?, string? }; tip = the outer recurve (often emissive). Returns the tips [a, b]. */
export function bow(v, g, d, n0, o, M) {
  const n = norm3(sub3(n0, mul3(d, dot3(d, n0)))), L = o.len ?? 9, bend = o.bend ?? 2.4, rc = o.recurve ?? 1.4, r = o.r ?? 0.6, N = Math.max(6, Math.ceil(L * 1.5));
  const at = t => { const a = Math.abs(t), f = Math.max(0, (a - 0.68) / 0.32); return add3(add3(g, mul3(d, L * t)), mul3(n, bend * a * a - rc * f * f)); };
  const a = at(-1), b = at(1);
  if (o.string !== false) v.capsule(a, b, 0.35, M.string || M.limb);   // string first: the limbs and tips win where they meet
  for (const s of [-1, 1]) for (let i = 0; i < N; i++) {
    const t0 = s * i / N, t1 = s * (i + 1) / N, tip = M.tip && Math.abs(t1) > 0.7;
    v.capsule(at(t0), at(t1), r * (1 - Math.abs(t0) * 0.35), tip ? M.tip : M.limb, r * (1 - Math.abs(t1) * 0.35));
  }
  v.capsule(add3(g, mul3(d, -1.2)), add3(g, mul3(d, 1.2)), r * 1.5, M.grip || M.limb);
  return [a, b];
}
