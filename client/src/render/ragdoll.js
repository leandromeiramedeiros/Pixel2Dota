// Hero death ragdoll: a tiny verlet skeleton (10 particles, ~20 distance constraints) per dying hero, pure maths (no three, no DOM).
//   particles: hipR hipL shoulderR shoulderL neck head handR handL ankleR ankleL, in world units relative to the unit's foot point (y up).
//   torso = the five body particles held rigid; the head hangs off the neck inside a bend cone; each hand / ankle is a rod from its shoulder / hip.
//   ground: ground(x, z) -> height relative to the foot point; contact friction damps the slide, a light restitution bounces once; a sudden rise of more
//   than WALL (a cliff face) stops the particle instead of lifting it onto the cliff.
//   launch: the body leaves as one rigid tumbling piece (v = vel + spin x (p - hips), the spin turns head-first toward the launch), but the light hands and
//   ankles start at LAG of that and have more air drag, so the limbs trail and whip on their rods. wind(x, z, t) -> [ax, az] (optional): the live gust
//   field at each particle every step, as debris-scale displacement (voxactors.js WIND_K * gust) times WIND_ACC -> acceleration: push away / pull toward;
//   a particle on the ground takes WIND_GROUND times that against the contact friction, so a downed body slides ~2x the debris offset per second.
// Output per voxmesh segment (SEG order head, torso, armR, armL, legR, legL): a rotation (quaternion) + translation that carry the segment's rest
// voxels (world offset v from the foot point, already yawed) to v' = rot(q, v) + T, plus the ground height under it. voxactors.js uploads them to a
// texture; the vertex shader moves every voxel with its segment's transform (death debris then dissolves from the settled pose).
export const RAG_T = 2.0;           // s: ragdoll time before the voxel dissolve
export const RAG_G = 1100;          // gravity, world units / s^2 (the voxel debris uses the same)
// launch strength s (wind gust / finishing strike, wind.js) -> speed: horizontal LAUNCH_V * s^LAUNCH_POW (superlinear: last hits knock, big hits fly),
// up = (LAUNCH_UP + LAUNCH_UPK * s) of it (stronger = higher arc). LAUNCH_MAX = the strength cap: the one knob for how far the strongest hits fly.
export const LAUNCH_V = 430, LAUNCH_POW = 1.6, LAUNCH_UP = 0.3, LAUNCH_UPK = 0.45;
export const LAUNCH_MAX = 1.25;
export const TILT_V = 70, TILT_K = 0.7;   // head speed of the topple spin: plain collapse; extra per unit of launch speed (the tumble)
export const WIND_ACC = 8, WIND_GROUND = 3;   // 1/s^2: live wind acceleration per unit of debris wind displacement (airborne); x on the ground
const H = 1 / 120, ITER = 6;
const FRIC = 0.03, BOUNCE = 0.2, SETTLE_T = 1.35, WALL = 28;   // per-step contact friction, vertical restitution; velocities fade after SETTLE_T s; cliff step
const WIND_CALM = 25;               // u/s^2: below this the wind does not hold the settle off
const NAMES = ['hipR', 'hipL', 'shoulderR', 'shoulderL', 'neck', 'head', 'handR', 'handL', 'ankleR', 'ankleL'];
export const RAG_JOINTS = NAMES;
// radius (voxels) of the volume each particle stands for: how far its centre stays above the ground
const RAD = { hipR: 3.5, hipL: 3.5, shoulderR: 3.5, shoulderL: 3.5, neck: 3, head: 7, handR: 1.5, handL: 1.5, ankleR: 3, ankleL: 3 };
const MASS = { head: 2, hipR: 1.5, hipL: 1.5, handR: 0.35, handL: 0.35, ankleR: 0.55, ankleL: 0.55 };
const LAG = { handR: 0.35, handL: 0.35, ankleR: 0.55, ankleL: 0.55 };   // share of the launch velocity the limb ends start with (the rest of the body: 1)
const AIR = { handR: 2.4, handL: 2.4, ankleR: 1.4, ankleL: 1.4, head: 0.25 };   // 1/s air drag (default AIR_D): limbs stream behind
const AIR_D = 0.3;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Rotate v by the unit quaternion q = [x, y, z, w] (same formula as rotQ in the vertex shader). */
export function rotQ(q, v) { const c = cross(q, v), c2 = cross(q, [c[0] + q[3] * v[0], c[1] + q[3] * v[1], c[2] + q[3] * v[2]]); return [v[0] + 2 * c2[0], v[1] + 2 * c2[1], v[2] + 2 * c2[2]]; }
const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
/** Shortest-arc rotation taking unit a to unit b. */
export function swing(a, b) {
  const d = dot(a, b);
  if (d < -0.9999) { const ax = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0])); return [ax[0], ax[1], ax[2], 0]; }
  const c = cross(a, b), q = [c[0], c[1], c[2], 1 + d], l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** Rotation matrix (rows) -> unit quaternion. */
function matQ(m) {
  const t = m[0][0] + m[1][1] + m[2][2]; let q;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]; }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]; }
  else if (m[1][1] > m[2][2]) { const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]; }
  else { const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]; }
  const l = Math.hypot(q[0], q[1], q[2], q[3]); return q.map(x => x / l);
}
/** Frame of the torso from four of its joints: columns (lateral, up, forward), as the matrix R (rows). */
function torsoFrame(hipR, hipL, shR, shL, neck) {
  const lat0 = sub(add(hipL, shL), add(hipR, shR)), hm = mul(add(hipR, hipL), 0.5), up0 = sub(neck, hm);
  const lat = norm(lat0), up = norm(sub(up0, mul(lat, dot(up0, lat)))), fw = cross(lat, up);
  return [[lat[0], up[0], fw[0]], [lat[1], up[1], fw[1]], [lat[2], up[2], fw[2]]];
}
const matMulT = (A, B) => { const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] = A[i][0] * B[j][0] + A[i][1] * B[j][1] + A[i][2] * B[j][2]; return m; };   // A * B^T

/**
 * Ragdoll from the rest joints (world offsets, y up; at least RAG_JOINTS + hip joints) of the drawn pose.
 * o: { ground(x, z) -> height (default 0), vel [vx, vy, vz] launch velocity, tilt [tx, tz] horizontal topple direction (unit; falls that way, head first),
 *   tiltV speed of the head in the topple spin, scale world units per voxel (particle radii), wind(x, z, t) -> [ax, az] debris-scale wind (see top) }.
 */
export function createRagdoll(rest, o = {}) {
  const ground = o.ground || (() => 0), sc = o.scale || 4.2, vel = o.vel || [0, 0, 0], tilt = o.tilt || [0, 0], tv = o.tiltV ?? TILT_V, wind = o.wind || null;
  const P = NAMES.map((n) => rest[n].slice()), prev = P.map((p) => p.slice()), ix = {}; NAMES.forEach((n, i) => { ix[n] = i; });
  const w = NAMES.map((n) => 1 / (MASS[n] || 1)), rad = NAMES.map((n) => RAD[n] * sc), air = NAMES.map((n) => 1 - (AIR[n] ?? AIR_D) * H);
  {   // launch: rigid body (vel + spin x r about the hips, the head leads by tiltV toward tilt), limb ends lag
    const hm0 = mul(add(rest.hipR, rest.hipL), 0.5), rH = len(sub(rest.head, hm0)) || 1, tl = Math.hypot(tilt[0], tilt[1]);
    const om = tl > 1e-6 ? mul(cross([0, 1, 0], [tilt[0] / tl, 0, tilt[1] / tl]), tv / rH) : [0, 0, 0];
    NAMES.forEach((n, i) => {
      const v = mul(add(vel, cross(om, sub(P[i], hm0))), LAG[n] ?? 1);
      prev[i] = [P[i][0] - v[0] * H, P[i][1] - v[1] * H, P[i][2] - v[2] * H];
    });
  }
  const D = [];   // [i, j, rest length, min ratio, max ratio]
  const rod = (a, b, lo = 1, hi = 1) => D.push([ix[a], ix[b], len(sub(rest[a], rest[b])), lo, hi]);
  const body = ['hipR', 'hipL', 'shoulderR', 'shoulderL', 'neck'];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) rod(body[i], body[j]);
  rod('neck', 'head'); rod('shoulderR', 'handR'); rod('shoulderL', 'handL'); rod('hipR', 'ankleR'); rod('hipL', 'ankleL');
  const hipMid = mul(add(rest.hipR, rest.hipL), 0.5), restHipHead = len(sub(rest.head, hipMid));
  const R0 = torsoFrame(rest.hipR, rest.hipL, rest.shoulderR, rest.shoulderL, rest.neck);
  const dir0 = {   // rest limb / head directions, in the torso's rest frame (so they follow its roll)
    head: norm(sub(rest.head, rest.neck)), armR: norm(sub(rest.handR, rest.shoulderR)), armL: norm(sub(rest.handL, rest.shoulderL)),
    legR: norm(sub(rest.ankleR, rest.hipR)), legL: norm(sub(rest.ankleL, rest.hipL)),
  };
  const piv0 = [rest.neck, hipMid, rest.shoulderR, rest.shoulderL, rest.hipR, rest.hipL];   // segment order: head, torso, armR, armL, legR, legL
  const touch = new Uint8Array(NAMES.length);   // on the ground last step
  let t = 0, acc = 0, tw = -1, settle = false;   // tw: last time the wind held the body (settle waits for calm)

  function solveConstraints() {
    for (let it = 0; it < ITER; it++) {
      for (const [i, j, L, lo, hi] of D) {
        const d = sub(P[j], P[i]), l = len(d) || 1e-6, tgt = Math.min(hi * L, Math.max(lo * L, l)), k = (l - tgt) / l / (w[i] + w[j]);
        if (k) for (let a = 0; a < 3; a++) { P[i][a] += d[a] * k * w[i]; P[j][a] -= d[a] * k * w[j]; }
      }
      // head bend cone: it stays within ~100 deg of the torso's up (distance to the hips), legs do not fold up into the body
      const hm = mul(add(P[ix.hipR], P[ix.hipL]), 0.5), d = sub(P[ix.head], hm), l = len(d) || 1e-6;
      if (l < 0.68 * restHipHead) { const k = (0.68 * restHipHead - l) / l * 0.5; for (let a = 0; a < 3; a++) { P[ix.head][a] += d[a] * k; P[ix.neck][a] -= d[a] * k * 0.5; } }
      for (const an of ['ankleR', 'ankleL']) {
        const mid = sub(P[ix[an]], hm), lm = len(mid) || 1e-6, min = 0.45 * len(sub(rest[an], hipMid));
        if (lm < min) { const k = (min - lm) / lm; for (let a = 0; a < 3; a++) P[ix[an]][a] += mid[a] * k; }
      }
      ground1();
    }
  }
  function ground1() {
    for (let i = 0; i < P.length; i++) {
      let g = ground(P[i][0], P[i][2]) + rad[i];
      if (P[i][1] < g) {
        if (g - P[i][1] > WALL && ground(prev[i][0], prev[i][2]) + rad[i] < g - WALL) {   // ran into a cliff face: stop against it, do not climb it
          P[i][0] = prev[i][0]; P[i][2] = prev[i][2]; g = ground(P[i][0], P[i][2]) + rad[i];
          if (P[i][1] >= g) continue;
        }
        touch[i] = 1; const vy = P[i][1] - prev[i][1]; P[i][1] = g; prev[i][1] = g + (vy < -2 * H * 60 ? -vy * BOUNCE : 0);   // bounce only an impact faster than ~2 u/step
        const f = settle ? 0.2 : FRIC;
        prev[i][0] += (P[i][0] - prev[i][0]) * f; prev[i][2] += (P[i][2] - prev[i][2]) * f;
      }
    }
  }
  function step() {
    settle = t > SETTLE_T && t - tw > 0.25;
    let wmax = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = prev[i], damp = settle ? 0.97 : air[i];
      for (let a = 0; a < 3; a++) { const v = (p[a] - q[a]) * damp; q[a] = p[a]; p[a] += v; }
      p[1] -= RAG_G * H * H;
      if (wind) {
        const f = wind(p[0], p[2], t), k = WIND_ACC * (touch[i] ? WIND_GROUND : 1), ax = f[0] * k, az = f[1] * k; touch[i] = 0;
        p[0] += ax * H * H; p[2] += az * H * H; wmax = Math.max(wmax, Math.hypot(ax, az));
      }
    }
    if (wmax > WIND_CALM) tw = t;
    solveConstraints(); t += H;
  }
  const api = {
    P, get time() { return t; },
    /** advance by dt seconds (fixed 1/120 steps; stops at RAG_T) */
    advance(dt) { acc += dt; while (acc >= H && t < RAG_T - 1e-9) { step(); acc -= H; } if (t >= RAG_T - 1e-9) acc = 0; },
    /** Mean speed of the particles (units / s), for the settle test. */
    speed() { let s = 0; for (let i = 0; i < P.length; i++) s += len(sub(P[i], prev[i])) / H; return s / P.length; },
    /** Segment transforms into out[seg*8 ..]: quat xyzw, T xyz, ground height under the pivot. 6 segments. */
    segments(out = new Float32Array(48)) {
      const G = (n) => P[ix[n]], R1 = torsoFrame(G('hipR'), G('hipL'), G('shoulderR'), G('shoulderL'), G('neck')), qT = matQ(matMulT(R1, R0));
      const hm = mul(add(G('hipR'), G('hipL')), 0.5);
      const swingQ = (key, dirNow) => qMul(swing(rotQ(qT, dir0[key]), dirNow), qT);
      const qs = [
        swingQ('head', norm(sub(G('head'), G('neck')))), qT,
        swingQ('armR', norm(sub(G('handR'), G('shoulderR')))), swingQ('armL', norm(sub(G('handL'), G('shoulderL')))),
        swingQ('legR', norm(sub(G('ankleR'), G('hipR')))), swingQ('legL', norm(sub(G('ankleL'), G('hipL')))),
      ];
      const piv1 = [G('neck'), hm, G('shoulderR'), G('shoulderL'), G('hipR'), G('hipL')];
      for (let s = 0; s < 6; s++) {
        const r = rotQ(qs[s], piv0[s]), o8 = s * 8;
        out[o8] = qs[s][0]; out[o8 + 1] = qs[s][1]; out[o8 + 2] = qs[s][2]; out[o8 + 3] = qs[s][3];
        out[o8 + 4] = piv1[s][0] - r[0]; out[o8 + 5] = piv1[s][1] - r[1]; out[o8 + 6] = piv1[s][2] - r[2];
        out[o8 + 7] = ground(piv1[s][0], piv1[s][2]);
      }
      return out;
    },
  };
  return api;
}

/** Launch velocity + topple direction (world plane x, z) from a wind sample { dx, dy (game), mag } or a plain collapse (dir = fallback fall direction, plane). */
export function launchOf(l, fallback = [0, 1]) {
  if (!l || !(l.mag > 0)) return { vel: [0, 0, 0], tilt: fallback, tiltV: TILT_V };
  const s = Math.min(LAUNCH_MAX, l.mag), vh = LAUNCH_V * Math.pow(s, LAUNCH_POW), vy = vh * (LAUNCH_UP + LAUNCH_UPK * Math.min(1, s)), tx = l.dx, tz = -l.dy;
  return { vel: [tx * vh, vy, tz * vh], tilt: [tx, tz], tiltV: TILT_V + TILT_K * vh };
}
