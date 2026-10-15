// Joint-table rig for voxel models (docs/VOXEL.md "Rig"). Browser-safe, no deps. The model is still rebuilt per pose frame: solve() turns
// proportions + a pose into joint world positions and body transforms, and the part builders (parts.js) draw around them.
// Space: model grid coords; x = screen right in the front view, y = depth (the model faces -y), z = up; feet on z = 0 at (cx, cy). Angles in degrees.
// Sides: R = the character's right = -x (s = -1), L = +x (s = +1), as in tools/art/heroes/rig.mjs.
// Pose channels, per joint: rotations (body joints: [pitch, yaw, roll]; + pitch = forward/down, + yaw = turn toward +x, + roll = tilt toward +x),
// limb aims ([el, hd, k]: elevation -90 down .. 90 up, heading 0 = straight out sideways .. 90 = forward, mirrored per side; k = stretch, default 1),
// IK targets (reach* / foot*), and pins: pose.pin[joint] = an exact rest-space position that bypasses the solve (hand-tuned heroes, e.g. Lina's arms).
// Scalars (flick, sway, eyes, ...) pass through untouched for the part builders.

// ---------- vectors ----------
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const len3 = a => Math.hypot(a[0], a[1], a[2]);
export const norm3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Two-bone IK (port of tools/art/lib3d.mjs ik2): root a, target t, bone lengths l1 l2, pole = preferred bend direction. Returns { mid, end }. */
export function ik2(a, t, l1, l2, pole) {
  let d = sub3(t, a), D = len3(d); const max = l1 + l2 - 0.01;
  if (D > max) { d = mul3(d, max / D); D = max; t = add3(a, d); }
  if (D < 0.5) return { mid: add3(a, mul3(norm3(pole), l1)), end: t };
  const dn = mul3(d, 1 / D), x = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pp = norm3(sub3(pole, mul3(dn, dot3(pole, dn))));
  return { mid: add3(add3(a, mul3(dn, x)), mul3(pp, h)), end: t };
}

// ---------- rotations + rigid transforms (null = identity, an exact passthrough so unposed parts match hand-built coordinates) ----------
const D2R = Math.PI / 180;
/** [pitch, yaw, roll] -> row-major 3x3 (Rz(yaw) Rx(pitch) Ry(roll)), or null when all zero. */
export function rotM(e) {
  if (!e || (!e[0] && !e[1] && !e[2])) return null;
  const [p, y, r] = [0, 1, 2].map(i => (e[i] || 0) * D2R), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(y), sy = Math.sin(y), cr = Math.cos(r), sr = Math.sin(r);
  const X = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Y = [cr, 0, sr, 0, 1, 0, -sr, 0, cr], Z = [cy, -sy, 0, sy, cy, 0, 0, 0, 1];
  return mulM(Z, mulM(X, Y));
}
export function mulM(A, B) {
  if (!A) return B; if (!B) return A;
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}
export const apM = (R, p) => (R ? [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]] : p);
const tpM = R => R && [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
/** Transform { R, t }: p' = R p + t. */
export const xfMove = d => (d && (d[0] || d[1] || d[2]) ? { R: null, t: d } : null);
export const xfPivot = (o, R) => (R ? { R, t: sub3(o, apM(R, o)) } : null);
/** outer after inner. */
export function xfChain(outer, inner) {
  if (!outer) return inner; if (!inner) return outer;
  return { R: mulM(outer.R, inner.R), t: add3(apM(outer.R, inner.t), outer.t) };
}
export const xfApply = (T, p) => (T ? add3(apM(T.R, p), T.t) : p);
export const xfInv = T => { if (!T) return null; const Ri = tpM(T.R); return { R: Ri, t: mul3(apM(Ri, T.t), -1) }; };

/** Limb aim [el, hd, k] for side s -> direction * k (body frame). */
export const aimDir = (a, s) => { const e = a[0] * D2R, h = a[1] * D2R, k = a[2] ?? 1; return [s * Math.cos(e) * Math.cos(h) * k, -Math.cos(e) * Math.sin(h) * k, Math.sin(e) * k]; };
const SIDES = [['R', -1], ['L', 1]];

// ---------- rig classes ----------
// Each class: joints (names), sockets (socket -> joint), defaults (proportions for its reference grid), solve(P, pose) -> { J, T, dir }.
//   J: joint -> world position. T: body part -> transform (rest space -> posed). dir: hand / foot -> unit direction of the last bone.

/** Chibi biped: heroes, humanoid creeps and neutrals. Reference grid 34 x 30 x 48 (Lina). */
const biped = {
  joints: ['root', 'hips', 'chest', 'back', 'neck', 'head', 'headTop', 'hairSway',
    'shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL', 'hipR', 'kneeR', 'ankleR', 'footR', 'hipL', 'kneeL', 'ankleL', 'footL'],
  sockets: { handR: 'handR', handL: 'handL', headTop: 'headTop', back: 'back', chest: 'chest' },
  bodies: ['root', 'torso', 'head'],
  defaults: {
    cx: 17, cy: 15, hipZ: 8, hipX: 2.6, footX: 3, ankleY: -0.3, ankleZ: 3.5, thigh: 3, shin: 2.4,
    chestZ: 16, chestD: 3, backD: 3.5, shX: 4.6, shY: 0, shZ: 16.8, upper: 4.5, fore: 4.6,
    neckY: 0.3, neckZ: 20, headY: -0.3, headZ: 28, headTopZ: 34.6, hairZ: 22,
    armRest: [[-70, 10], [-60, 30]],
  },
  solve(P, p) {
    const T = {}, J = {}, dir = {}, pin = p.pin || {};
    T.root = xfMove([0, 0, p.bob || 0]);
    T.torso = xfChain(T.root, xfPivot([P.cx, P.cy, P.hipZ], rotM(p.spine)));
    T.head = xfChain(T.torso, xfPivot([P.cx, P.cy + P.neckY, P.neckZ], rotM(p.head)));
    const at = (t, name, rest) => (J[name] = xfApply(T[t], pin[name] || rest));
    at('root', 'root', [P.cx, P.cy, 0]); at('root', 'hips', [P.cx, P.cy, P.hipZ]);
    at('torso', 'chest', [P.cx, P.cy - P.chestD, P.chestZ]); at('torso', 'back', [P.cx, P.cy + P.backD, P.chestZ]);
    at('torso', 'neck', [P.cx, P.cy + P.neckY, P.neckZ]);
    at('head', 'head', [P.cx, P.cy + P.headY, P.headZ]); at('head', 'headTop', [P.cx, P.cy, P.headTopZ]);
    at('head', 'hairSway', [P.cx, P.cy + P.headY + 4, P.hairZ]);
    const Rt = T.torso && T.torso.R;
    for (const [k, s] of SIDES) {
      const sh = at('torso', 'shoulder' + k, [P.cx + s * P.shX, P.cy + P.shY, P.shZ + (p.shrug?.[k] || 0)]);
      const aim = p['arm' + k] || P.armRest, reach = p['reach' + k];
      let el, hd;
      if (reach) ({ mid: el, end: hd } = ik2(sh, xfApply(T.torso, add3([P.cx + s * P.shX, P.cy + P.shY, P.shZ], reach)), P.upper, P.fore, apM(Rt, [s * 0.4, 0.6, -0.5])));
      else { el = add3(sh, apM(Rt, mul3(aimDir(aim[0], s), P.upper))); hd = add3(el, apM(Rt, mul3(aimDir(aim[1], s), P.fore))); }
      el = pin['elbow' + k] ? xfApply(T.torso, pin['elbow' + k]) : el;
      hd = pin['hand' + k] ? xfApply(T.torso, pin['hand' + k]) : hd;
      J['elbow' + k] = el; J['hand' + k] = hd; dir['hand' + k] = norm3(sub3(hd, el));
      // legs: feet stay planted (no bob), knee by IK toward the front
      const f = p['foot' + k] || [0, 0, 0];
      const hip = at('root', 'hip' + k, [P.cx + s * P.hipX, P.cy, P.hipZ]);
      const foot = J['foot' + k] = pin['foot' + k] || [P.cx + s * P.footX + f[0], P.cy + f[1], f[2]];
      const ank = J['ankle' + k] = pin['ankle' + k] || [foot[0], foot[1] + P.ankleY, foot[2] + P.ankleZ];
      J['knee' + k] = ik2(hip, ank, P.thigh, P.shin, [0, -1, 0.2]).mid; dir['foot' + k] = [0, -1, 0];
    }
    return { J, T, dir };
  },
};

/** Quadruped: wolves, hounds, centaur lower body. Faces -y: chest at -y, pelvis at +y. Reference grid ~30 x 40 x 30. */
const quad = {
  joints: ['root', 'chest', 'pelvis', 'withers', 'neck', 'head', 'jaw', 'headTop', 'tail1', 'tail2', 'tail3',
    'shoulderFR', 'kneeFR', 'footFR', 'shoulderFL', 'kneeFL', 'footFL', 'hipBR', 'kneeBR', 'footBR', 'hipBL', 'kneeBL', 'footBL'],
  sockets: { headTop: 'headTop', back: 'withers', chest: 'chest', mouth: 'jaw' },
  bodies: ['root', 'body', 'head'],
  defaults: {
    cx: 15, cy: 20, len: 16, shZ: 12, hipZ: 11.5, legX: 3.2, footX: 3.4, upper: 6, lower: 6.2,
    neckY: 3, neckZ: 15, headY: -4, headZ: 17, headTopZ: 21, jawLen: 4, tail: [4, 4, 3.5], tailRest: [[20, -90], [0, -90], [-20, -90]],
  },
  solve(P, p) {
    const T = {}, J = {}, dir = {}, pin = p.pin || {};
    const cF = P.cy - P.len / 2, cB = P.cy + P.len / 2;
    T.root = xfMove([0, 0, p.bob || 0]);
    T.body = xfChain(T.root, xfPivot([P.cx, P.cy, (P.shZ + P.hipZ) / 2], rotM(p.body)));
    T.head = xfChain(T.body, xfPivot([P.cx, cF - P.neckY, P.neckZ], rotM(p.head)));
    const at = (t, name, rest) => (J[name] = xfApply(T[t], pin[name] || rest));
    at('root', 'root', [P.cx, P.cy, 0]);
    at('body', 'chest', [P.cx, cF, P.shZ]); at('body', 'pelvis', [P.cx, cB, P.hipZ]); at('body', 'withers', [P.cx, cF + 2, P.shZ + 2]);
    at('body', 'neck', [P.cx, cF - P.neckY, P.neckZ]);
    at('head', 'head', [P.cx, cF + P.headY, P.headZ]); at('head', 'headTop', [P.cx, cF + P.headY, P.headTopZ]);
    const ja = (p.jaw || 0) * D2R;   // jaw opens downward about the head centre
    J.jaw = xfApply(T.head, add3([P.cx, cF + P.headY, P.headZ - 1], [0, -P.jawLen * Math.cos(ja), -P.jawLen * Math.sin(ja)]));
    let q = J.pelvis, R = T.body && T.body.R;
    (p.tail || P.tailRest).forEach((a, i) => { q = J['tail' + (i + 1)] = add3(q, apM(R, mul3(aimDir(a, 1), P.tail[i]))); });
    for (const [k, s] of SIDES) for (const [end, top, y0, z0, pole] of [['F', 'shoulder', cF, P.shZ, [0, 1, 0]], ['B', 'hip', cB, P.hipZ, [0, -1, 0]]]) {
      const n = end + k, f = p['foot' + n] || [0, 0, 0];
      const root = at('body', top + n, [P.cx + s * P.legX, y0, z0]);
      const foot = J['foot' + n] = pin['foot' + n] || [P.cx + s * P.footX + f[0], y0 + f[1], f[2]];
      J['knee' + n] = ik2(root, foot, P.upper, P.lower, pole).mid; dir['foot' + n] = [0, -1, 0];
    }
    return { J, T, dir };
  },
};

/** Flyer: drakes, dragons, wildkin. Body hovers at `fly` above the ground point (cx, cy, 0); wings are 3-bone chains, legs dangle (FK). */
const flyer = {
  joints: ['root', 'body', 'chest', 'neck', 'head', 'headTop', 'jaw', 'tail1', 'tail2', 'tail3',
    'wingR', 'wingR1', 'wingR2', 'wingR3', 'wingL', 'wingL1', 'wingL2', 'wingL3', 'hipR', 'footR', 'hipL', 'footL'],
  sockets: { headTop: 'headTop', back: 'body', chest: 'chest', mouth: 'jaw' },
  bodies: ['root', 'body', 'head'],
  defaults: {
    cx: 20, cy: 18, fly: 12, len: 10, wingX: 2.5, wingY: -1, wingZ: 2, wing: [5, 6, 6], wingRest: [[20, -10], [0, -30], [-10, -60]],
    neckY: 5, neckZ: 3, headY: -3, headZ: 2, headTopZ: 4, jawLen: 3, tail: [4, 4, 4], tailRest: [[0, -90], [-10, -90], [-10, -90]],
    hipX: 2, legLen: 4, legRest: [-80, 20],
  },
  solve(P, p) {
    const T = {}, J = {}, dir = {}, pin = p.pin || {};
    T.root = xfMove([0, 0, p.bob || 0]);
    T.body = xfChain(T.root, xfPivot([P.cx, P.cy, P.fly], rotM(p.body)));
    const nk = [P.cx, P.cy - P.len / 2 - P.neckY, P.fly + P.neckZ];
    T.head = xfChain(T.body, xfPivot(nk, rotM(p.head)));
    const at = (t, name, rest) => (J[name] = xfApply(T[t], pin[name] || rest));
    J.root = [P.cx, P.cy, 0];   // ground point under the hovering body
    at('body', 'body', [P.cx, P.cy, P.fly]); at('body', 'chest', [P.cx, P.cy - P.len / 2, P.fly]); at('body', 'neck', nk);
    at('head', 'head', add3(nk, [0, P.headY, P.headZ])); at('head', 'headTop', add3(nk, [0, P.headY, P.headTopZ]));
    const ja = (p.jaw || 0) * D2R;
    J.jaw = xfApply(T.head, add3(nk, [0, P.headY - P.jawLen * Math.cos(ja), P.headZ - 1 - P.jawLen * Math.sin(ja)]));
    const R = T.body && T.body.R;
    let q = xfApply(T.body, [P.cx, P.cy + P.len / 2, P.fly]);
    (p.tail || P.tailRest).forEach((a, i) => { q = J['tail' + (i + 1)] = add3(q, apM(R, mul3(aimDir(a, 1), P.tail[i]))); });
    for (const [k, s] of SIDES) {
      let w = at('body', 'wing' + k, [P.cx + s * P.wingX, P.cy + P.wingY, P.fly + P.wingZ]);
      (p['wing' + k] || P.wingRest).forEach((a, i) => { w = J['wing' + k + (i + 1)] = add3(w, apM(R, mul3(aimDir(a, s), P.wing[i]))); });
      const hip = at('body', 'hip' + k, [P.cx + s * P.hipX, P.cy + 1, P.fly - 1]);
      J['foot' + k] = add3(hip, apM(R, mul3(aimDir(p['leg' + k] || P.legRest, s), P.legLen))); dir['foot' + k] = [0, -1, 0];
    }
    return { J, T, dir };
  },
};

/** Big: golems, lizards, Roshan. A heavy biped (or quad with P.base = 'quad'): base defaults scaled by P.scale, hunched spine at rest. */
const big = {
  joints: biped.joints, sockets: biped.sockets, bodies: biped.bodies,
  defaults: { base: 'biped', scale: 1.6, hunch: 12, cx: 28, cy: 24 },
  solve(P, p) {
    const base = RIGS[P.base], k = P.scale, B = {};
    for (const [key, val] of Object.entries(base.defaults)) B[key] = typeof val === 'number' && key !== 'cx' && key !== 'cy' ? val * k : val;
    const Q = { ...B, ...P }, sp = p.spine || [0, 0, 0];
    return base.solve(Q, base === biped ? { ...p, spine: [sp[0] + P.hunch, sp[1], sp[2]] } : p);
  },
};

export const RIGS = { biped, quad, flyer, big };

/** Solve rig class `cls` for proportions `prop` (merged over the class defaults) and `pose`. Returns { cls, P, pose, J, T, dir, socket(name) }. */
export function solve(cls, prop = {}, pose = {}) {
  const R = RIGS[cls], P = { ...R.defaults, ...prop }, out = R.solve(P, pose);
  const rig = { cls, P, pose, ...out };
  rig.socket = name => { const j = (R.sockets[name] || name); return { p: out.J[j], dir: out.dir[j] || [0, 0, 1], T: out.T[name === 'headTop' ? 'head' : cls === 'biped' || cls === 'big' ? 'torso' : 'body'] || null }; };
  return rig;
}
