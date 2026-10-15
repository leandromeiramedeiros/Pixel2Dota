// Spell wind: gusts kicked up by spell casts that make trees / bushes / grass ripple. Pure (no three / DOM) so node tests can import it.
//   Base breeze (the constant sway) stays in the tree / clutter vertex shaders; this module only owns the GUST layer on top of it:
//   a fixed array of MAX_GUSTS gusts (pos, dir, radius, strength, kind, age) -> flat Float32Arrays -> shared uniforms (shaderlib.js).
//   Game coords (x, y) in the gust records; pack() converts to the renderer's three plane (x, z = -y), which is what the GLSL uses.
//
//   Gust shape follows the spell (spellGust()):
//     SWIRL  unit / point targeted -> tangential push circling the impact point, size from the spell's radius / cast range
//     LINE   projectile / vector spells (x2,y2 end point) -> a pulse running along the line, widening into a cone
//     BURST  big area / self-centred spells -> a ring that expands outward from the centre
//   PULL (gust.pull = 1, packed in uWC.y) flips a shape: BURST = an imploding ring that leaves the plants leaning toward the centre, SWIRL spirals
//   inward, LINE (start = the pulled thing, dir toward the caster) runs the pulse home with a cone that narrows toward the caster. Which spells pull
//   is listed in OVERRIDES. A spell can chain a second gust after its delay (`then`, e.g. EMP: pull while it charges, push burst at detonation).
//   Strength follows the spell's damage (ults a little more); basic attacks never gust (only EV.SPELL events are looked at).
import { DATA } from '../../../shared/data.js';
import { EV } from '../../../shared/protocol.js';

export const MAX_GUSTS = 8;
export const KIND = { SWIRL: 0, LINE: 1, BURST: 2 };
export const REARM = 0.3;          // s: same caster + spell does not gust again inside this window (channel ticks)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const at = (arr, level) => (arr && arr.length ? arr[Math.min(Math.max((level | 0) || 1, 1), arr.length) - 1] : 0);

/** Time envelope 0..1: fast rise (0.12 s) to a full lean, then the plants hold a slowly releasing lean while they rock in it
 *  (~2 s sway between 40 % and 100 % of a lean that halves every ~3 s), tapering to exactly 0 at `life`. */
export function envelope(age, life) {
  if (age <= 0 || age >= life) return 0;
  const rise = smooth(0, 0.12, age), t = Math.max(0, age - 0.12);
  const rock = 0.7 + 0.3 * Math.cos(t * 3.2);
  return rise * Math.exp(-0.25 * t) * rock * (1 - smooth(0.7, 1, age / life));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// spell metadata -> gust
const RE_DMG = /damage/i;
const RE_DMG_NOT = /pct|percent|delay|interval|reduction|block|tick|trigger|barrier|per_mana|per_kill|per_str|bonus|scepter|creep|illusion|root|trigger|outgoing|incoming|duration|steal|heal/i;
const RE_DPS = /per_second|dps/i;
const RE_RAD = /radius|aoe|area_of_effect/i;
const RE_RAD_NOT = /vision|sight|secondary|bonus|talent|cleave|self_cast|true_sight|duration/i;

/** Damage / radius / range of an ability at a level, read generically from its baked values (names differ per spell). */
export function abilityStats(key, level, abilities = DATA.abilities) {
  const a = abilities[key]; if (!a) return null;
  const v = a.values || {};
  let damage = 0, radius = 0;
  for (const n of Object.keys(v)) {
    const x = +at(v[n], level) || 0; if (!x) continue;
    if (RE_DMG.test(n) && !RE_DMG_NOT.test(n)) damage = Math.max(damage, RE_DPS.test(n) ? x * 2 : x);
    else if (RE_DMG.test(n) && RE_DPS.test(n)) damage = Math.max(damage, x * 2);
    if (RE_RAD.test(n) && !RE_RAD_NOT.test(n)) radius = Math.max(radius, x);
  }
  if (a.damageType === 'pure' || a.damageType === 'mag' || a.damageType === 'phys') { /* typed: damage already counted from values */ }
  const b = a.behavior || [];
  return {
    damage, radius, castRange: +at(a.castRange, level) || 0, ult: !!a.ult,
    unit: b.includes('UNIT_TARGET'), point: b.includes('POINT'), noTarget: b.includes('NO_TARGET'), aoe: b.includes('AOE'), dir: b.includes('DIRECTIONAL'),
    passive: b.includes('PASSIVE') || b.includes('HIDDEN') && !a.damageType, channel: b.includes('CHANNELLED'),
  };
}

/** A few spells whose shape the generic rules cannot guess. kind / radius (burst or swirl size) / strength (0..1) / start ('xy' = line starts at ev.x,y) /
 *  at ('src' | 'xy' = burst centre) / pull (the wind pulls; a LINE then runs from the target point to the caster) / then ({ radius, strength } = a push
 *  BURST at the same centre after ev.dur) / subs ({ <ev.sub>: override } = the only sub-events that gust). */
export const OVERRIDES = {
  // pulls: the wind drags the plants the way the spell drags the units
  pudge_meat_hook: { subs: { hit: { kind: KIND.LINE, pull: true, strength: 0.6 } } },   // the cast (no sub) pushes along the throw; the hit (victim -> Pudge) pulls back
  pudge_dismember: { kind: KIND.SWIRL, pull: true, radius: 420, strength: 0.55 },
  lion_mana_drain: { kind: KIND.LINE, pull: true, strength: 0.3 },
  rubick_spell_steal: { kind: KIND.LINE, pull: true, strength: 0.3 },
  axe_berserkers_call: { kind: KIND.BURST, pull: true, radius: 480, strength: 0.7, at: 'src' },
  invoker_emp: { kind: KIND.BURST, pull: true, radius: 820, strength: 0.6, at: 'xy', then: { radius: 1000, strength: 1 } },   // the charge (ev.dur) pulls in, the detonation pushes out
  crystal_maiden_freezing_field: { kind: KIND.BURST, radius: 1000, strength: 1 },
  invoker_chaos_meteor: { kind: KIND.BURST, radius: 560, strength: 0.9, at: 'xy' },
  zuus_thundergods_wrath: { kind: KIND.BURST, radius: 1300, strength: 1, at: 'src' },
  mirana_starfall: { kind: KIND.BURST, radius: 760 },
  invoker_ice_wall: { kind: KIND.LINE, start: 'xy', strength: 0.35 },
  invoker_tornado: { kind: KIND.LINE },
};

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * Gust descriptor for a spell event, or null (no gust). ev = EV.SPELL event, src / tgt = units {x, y} (or null),
 * abilities = DATA.abilities. Result: { x, y, dx, dy, len, radius, strength, kind, pull, life, key, src, then? }  (game coords; len = half length of a line;
 * then = the detonation gust to spawn `delay` s later). Sub-events (omnislash cuts, arc jumps) never gust unless the spell lists them in OVERRIDES.subs.
 */
export function spellGust(ev, src, tgt, abilities = DATA.abilities) {
  if (!ev || ev.e !== EV.SPELL || !ev.k) return null;
  if (ev.k.startsWith('item_')) return null;
  let ov = OVERRIDES[ev.k] || {};
  if (ev.sub) { ov = ov.subs && ov.subs[ev.sub]; if (!ov) return null; }
  const st = abilityStats(ev.k, ev.lv, abilities); if (!st || st.passive) return null;
  const pull = !!ov.pull, sOk = !!(src && src.x != null);
  const sx = sOk ? src.x : ev.x, sy = sOk ? src.y : ev.y;
  if (sx == null || sy == null) return null;
  const ex = ev.x2, ey = ev.y2;
  const hasEnd = ex != null && ey != null;
  const radius = ev.r && !hasEnd ? Math.max(ev.r, st.radius) : st.radius;
  // ---- strength: damage -> 0..1 (100 dmg ~ 0.38, 300 ~ 0.74, 500+ = 1); ults +25 %; area-only utility spells get a light breeze
  let strength = st.damage > 0 ? Math.pow(clamp(st.damage / 500, 0, 1), 0.6) : radius > 0 ? 0.14 + Math.min(0.2, radius / 4000) : 0.1;
  if (st.ult) strength *= 1.25;
  strength = clamp(ov.strength != null ? ov.strength : strength, 0, 1);
  if (strength < 0.06) return null;
  // ---- shape. A pull line runs from the pulled point (ev.x,y / target) to the caster; a push line from the caster (or ev.x,y) to (x2,y2).
  let kind, x, y, dx = 1, dy = 0, len = 0, R, a0, a1;
  if (pull) {
    a0 = ev.x != null && ev.y != null ? { x: ev.x, y: ev.y } : tgt && tgt.x != null ? { x: tgt.x, y: tgt.y } : null;
    a1 = sOk ? { x: sx, y: sy } : hasEnd ? { x: ex, y: ey } : null;
  } else {
    a0 = ov.start === 'xy' && ev.x != null ? { x: ev.x, y: ev.y } : { x: sx, y: sy };
    a1 = hasEnd ? { x: ex, y: ey } : null;
  }
  const lineLen = a0 && a1 ? dist(a0.x, a0.y, a1.x, a1.y) : 0;
  if (ov.kind != null) kind = ov.kind;
  else if (hasEnd && !st.aoe && lineLen > 220) kind = KIND.LINE;
  else if (st.noTarget) kind = radius >= 400 || (st.ult && radius > 0) ? KIND.BURST : KIND.SWIRL;
  else if ((st.aoe || st.point) && radius >= 520) kind = KIND.BURST;
  else kind = KIND.SWIRL;
  if (kind === KIND.LINE && lineLen < 60) kind = KIND.SWIRL;
  if (kind === KIND.LINE) {
    const L = lineLen; dx = (a1.x - a0.x) / L; dy = (a1.y - a0.y) / L;
    len = L * 0.5; x = a0.x + dx * len; y = a0.y + dy * len;
    const halfW = ev.r || 100;
    R = clamp(halfW * 2.8, 240, 520);
  } else {
    if (ov.at === 'src' || (st.noTarget && !ov.at)) { x = sx; y = sy; }
    else if (ov.at === 'xy' && ev.x != null) { x = ev.x; y = ev.y; }
    else if (tgt && tgt.x != null) { x = tgt.x; y = tgt.y; }
    else if (ev.x != null && ev.y != null) { x = ev.x; y = ev.y; }
    else { x = sx; y = sy; }
    if (kind === KIND.BURST) R = clamp(ov.radius || Math.max(radius * 1.7, 520), 420, 1400);
    else R = clamp(ov.radius || Math.max(radius * 1.5, 170 + st.castRange * 0.1), 220, 620);
    if (kind === KIND.SWIRL) { dx = 1; dy = 0; }
  }
  const lifeOf = (k, s) => Math.min(6, (2.5 + 3 * s) * (k === KIND.BURST ? 1.1 : 1));   // lasting: strong spells leave the trees rocking for ~5-6 s
  const charge = ov.then && ev.dur > 0 ? ev.dur : 0;
  const g = { x, y, dx, dy, len, radius: R, strength, kind, pull: pull ? 1 : 0, life: charge ? clamp(charge, 0.8, 4) : lifeOf(kind, strength),   // a charging pull ends as the detonation starts
    key: ev.sub ? ev.k + '#' + ev.sub : ev.k, src: ev.s };
  if (charge) {                                                        // the detonation: a push burst at the same centre, dormant until `delay`
    const t = ov.then, ts = clamp(t.strength != null ? t.strength : strength, 0, 1);
    g.then = { x, y, dx: 1, dy: 0, len: 0, radius: clamp(t.radius || R, 420, 1400), strength: ts, kind: KIND.BURST, pull: 0, life: lifeOf(KIND.BURST, ts), key: ev.k + '#then', src: ev.s, delay: charge };
  }
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// gust array
export function createWind({ max = MAX_GUSTS } = {}) {
  const gusts = [];                   // active, oldest first
  const api = {
    gusts, max,
    /** 0 = no wind at all (low quality): spawning is skipped. Otherwise a gain on the gust amplitude (the shader multiplies by the same uWind). */
    gain: 1,
    spawn(g) {
      if (!(api.gain > 0) || !g) return null;
      for (const o of gusts) if (o.key === g.key && o.src === g.src && o.age >= 0 && o.age < REARM) return null;   // channel ticks / duplicate events
      const rec = { x: g.x, y: g.y, dx: g.dx, dy: g.dy, len: g.len || 0, radius: g.radius, strength: g.strength, kind: g.kind, pull: g.pull ? 1 : 0, life: g.life, age: g.age || 0, key: g.key, src: g.src };
      if (gusts.length >= max) {
        // full: replace the gust with the least energy left, unless the new one is weaker than that
        let wi = 0, wv = Infinity;
        for (let i = 0; i < gusts.length; i++) { const o = gusts[i], v = o.strength * (1 - o.age / o.life); if (v < wv) { wv = v; wi = i; } }
        if (rec.strength <= wv) return null;
        gusts.splice(wi, 1);
      }
      gusts.push(rec);
      return rec;
    },
    /** from a raw event + unit lookups (+ optional fog visibility test); returns the gust spawned (or null) */
    report(ev, unit, abilities, visible) {
      if (!(api.gain > 0)) return null;
      const g = spellGust(ev, unit ? unit(ev.s) : null, unit && ev.t != null ? unit(ev.t) : null, abilities);
      if (!g || (visible && !visible(g.x, g.y))) return null;   // fogged casts must not leak through swaying trees
      const rec = api.spawn(g);
      if (rec && g.then) api.spawn({ ...g.then, age: -g.then.delay });   // dormant (age < 0: envelope 0) until the detonation
      return rec;
    },
    update(dt) {
      for (let i = gusts.length - 1; i >= 0; i--) { const g = gusts[i]; g.age += dt; if (g.age >= g.life) gusts.splice(i, 1); }
    },
    clear() { gusts.length = 0; },
    setGain(k) { api.gain = k; if (!(k > 0)) gusts.length = 0; },
    /** write the uniform arrays (vec4 x max each); returns the active count. A: x, z, radius, amp. B: dirx, dirz, kind, half length. C: age, pull (0 | 1). */
    pack(A, B, C) {
      let n = 0;
      for (const g of gusts) {
        const amp = g.strength * envelope(g.age, g.life); if (amp <= 0.002) continue;
        const o = n * 4;
        A[o] = g.x; A[o + 1] = -g.y; A[o + 2] = g.radius; A[o + 3] = amp;
        B[o] = g.dx; B[o + 1] = -g.dy; B[o + 2] = g.kind; B[o + 3] = g.len;
        C[o] = g.age; C[o + 1] = g.pull ? 1 : 0; C[o + 2] = 0; C[o + 3] = 0;
        if (++n >= max) break;
      }
      return n;
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// displacement: JS reference of the GLSL below (tests + documentation). Plane coords (x, z). Returns the horizontal push, ~ -1..1 per unit amp.
export function gustField(A, B, C, i, px, pz) {
  const o = i * 4, amp = A[o + 3], R = A[o + 2], age = C[o], sg = 1 - 2 * C[o + 1];   // sg: +1 push, -1 pull
  const dx = px - A[o], dz = pz - A[o + 1];
  const k = B[o + 2];
  let ox = 0, oz = 0;
  if (k < 0.5) {                                                       // SWIRL: outward spiral (tangential + away from the centre), rippling outward
    const r = Math.hypot(dx, dz), nx = dx / Math.max(r, 1), nz = dz / Math.max(r, 1);
    const fall = 1 - smooth(0, 1, r / R), f2 = fall * fall;
    const a = 0.7 + 0.12 * Math.sin(age * 4 - r * 0.02);   // pull: the radial part flips (spirals in), the ripple travels in
    const cx = Math.cos(a), sn = Math.sin(a);
    const tx = -nz, tz = nx;
    const rip = 0.7 + 0.3 * Math.sin(r * 0.035 - sg * age * 9);
    ox = (tx * cx + nx * sn * sg) * f2 * rip * amp; oz = (tz * cx + nz * sn * sg) * f2 * rip * amp;
  } else if (k < 1.5) {                                                // LINE: pulse running along dir, widening into a cone
    const ux = B[o], uz = B[o + 1], L = B[o + 3];
    const s = dx * ux + dz * uz, l = -dx * uz + dz * ux;
    const prog = clamp(age / (0.3 + L / 1500), 0, 1), sf = -L + 2 * L * prog;
    const fr = clamp((s + L) / Math.max(2 * L, 1), 0, 1);
    const spread = R * (0.55 + 0.45 * (sg > 0 ? fr : 1 - fr));       // push: widens toward the end; pull: wide at the pulled end, narrow at the caster
    const lat = 1 - smooth(0, 1, Math.abs(l) / spread);
    const inseg = smooth(-L - 0.3 * R, -L + 0.1 * R, s) * (1 - smooth(L - 0.1 * R, L + 0.4 * R, s));
    const reached = 1 - smooth(sf, sf + 0.6 * R, s);
    const e = (s - sf) / (0.4 * L + 0.8 * R);
    const pass = 0.6 + 0.4 * Math.exp(-e * e);
    const side = (l >= 0 ? 1 : -1) * 0.35 * Math.min(1, Math.abs(l) / R);
    const f = lat * inseg * reached * pass * amp;
    ox = (ux - uz * side) * f; oz = (uz + ux * side) * f;
  } else {                                                             // BURST: expanding ring, then everything it passed keeps leaning away from the centre
    const r = Math.hypot(dx, dz), nx = dx / Math.max(r, 1), nz = dz / Math.max(r, 1);
    const rk = Math.min(1, age * 2.2), rf = R * (sg > 0 ? rk : 1 - rk);   // push: the ring expands from the centre; pull: it contracts onto it
    const e = (r - rf) / (R * 0.28 + 30);
    const ring = Math.exp(-e * e);
    const done = sg > 0 ? 1 - smooth(rf, rf + 0.1 * R, r) : smooth(rf - 0.1 * R, rf, r);   // what the ring has already passed keeps leaning
    const inner = (1 - smooth(0.5 * R, 1.1 * R, r)) * 0.85 * smooth(0, 60, r) * done;
    const rip = 0.75 + 0.25 * Math.sin(r * 0.04 - sg * age * 12);
    const f = (ring * (1 - smooth(0.7 * R, 1.15 * R, r)) + inner) * rip * amp * sg;
    ox = nx * f; oz = nz * f;
  }
  return [ox, oz];
}

/** Sum over the first n packed gusts (what the vertex shader computes per plant foot). */
export function windAt(A, B, C, n, px, pz) {
  let x = 0, z = 0;
  for (let i = 0; i < n; i++) { const g = gustField(A, B, C, i, px, pz); x += g[0]; z += g[1]; }
  return [x, z];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// ragdoll launch: what the live gusts would do to a body at (x, y) in game coords (a dying hero), as a direction + 0..1.4 strength.
export const LAUNCH_MIN = 0.12;     // below this the gusts say nothing: the caller falls back to a knock from the killer / a plain collapse
/** Sum of the active gusts at the point, each sampled as if its wave had arrived (age >= 1 s: ring already past, line mid-way) and weighted by what
 *  is left of its strength (linear in age; a dormant `then` gust counts in full). A pull whose detonation is queued (`key#then`) is dropped: it is
 *  the push that kills. Returns { dx, dy (unit, game coords), mag } or null. */
export function launchAt(gusts, x, y) {
  const A = new Float32Array(4), B = new Float32Array(4), C = new Float32Array(4);
  let ox = 0, oz = 0;
  for (const g of gusts) {
    if (g.pull && gusts.some(o => o.key === g.key + '#then' && o.src === g.src)) continue;
    const amp = g.strength * (g.age < 0 ? 1 : Math.max(0, 1 - g.age / g.life)); if (amp <= 0.002) continue;
    A[0] = g.x; A[1] = -g.y; A[2] = g.radius; A[3] = amp; B[0] = g.dx; B[1] = -g.dy; B[2] = g.kind; B[3] = g.len || 0; C[0] = Math.max(g.age, 1); C[1] = g.pull ? 1 : 0;
    const w = gustField(A, B, C, 0, x, -y); ox += w[0]; oz += w[1];
  }
  const m = Math.hypot(ox, oz); if (m < LAUNCH_MIN) return null;
  return { dx: ox / m, dy: -oz / m, mag: Math.min(1.4, m) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// GLSL (kept in step with gustField above). Insert after the uniform block of a vertex shader; call gustAt(foot.xz) -> world push (units 1 = full).
export const WIND_GLSL = /* glsl */ `
uniform float uWind;                 // 0 = no wind at all, 0.5 medium, 1 high (scales base sway and gusts)
uniform int uWN;
uniform vec4 uWA[${MAX_GUSTS}];      // x, z, radius, amplitude
uniform vec4 uWB[${MAX_GUSTS}];      // dirx, dirz, kind, half length
uniform vec4 uWC[${MAX_GUSTS}];      // age, pull (0 | 1)
vec2 gustAt(vec2 f){
  vec2 o = vec2(0.);
  for (int i = 0; i < ${MAX_GUSTS}; i++){
    if (i >= uWN) break;
    vec4 A = uWA[i], B = uWB[i];
    float age = uWC[i].x, R = A.z, amp = A.w, sg = 1. - 2. * uWC[i].y;
    vec2 d = f - A.xy;
    if (B.z < .5){
      float r = length(d);
      if (r >= R) continue;
      vec2 n = d / max(r, 1.), t = vec2(-n.y, n.x);
      float fall = 1. - smoothstep(0., 1., r / R);
      float a = .7 + .12 * sin(age * 4. - r * .02);
      float rip = .7 + .3 * sin(r * .035 - sg * age * 9.);
      o += (t * cos(a) + n * (sin(a) * sg)) * (fall * fall * rip * amp);
    } else if (B.z < 1.5){
      vec2 u = B.xy, pu = vec2(-u.y, u.x);
      float L = B.w, s = dot(d, u), l = dot(d, pu);
      float sf = -L + 2. * L * clamp(age / (.3 + L / 1500.), 0., 1.);
      float fr = clamp((s + L) / max(2. * L, 1.), 0., 1.);
      float spread = R * (.55 + .45 * (sg > 0. ? fr : 1. - fr));
      float lat = 1. - smoothstep(0., 1., abs(l) / spread);
      float inseg = smoothstep(-L - .3 * R, -L + .1 * R, s) * (1. - smoothstep(L - .1 * R, L + .4 * R, s));
      float reached = 1. - smoothstep(sf, sf + .6 * R, s);
      float e = (s - sf) / (.4 * L + .8 * R);
      float pse = .6 + .4 * exp(-e * e);
      float side = (l >= 0. ? 1. : -1.) * .35 * min(1., abs(l) / R);
      o += (u + pu * side) * (lat * inseg * reached * pse * amp);
    } else {
      float r = length(d);
      vec2 n = d / max(r, 1.);
      float rk = min(1., age * 2.2), rf = R * (sg > 0. ? rk : 1. - rk);
      float e = (r - rf) / (R * .28 + 30.);
      float ring = exp(-e * e) * (1. - smoothstep(.7 * R, 1.15 * R, r));
      float done = sg > 0. ? 1. - smoothstep(rf, rf + .1 * R, r) : smoothstep(rf - .1 * R, rf, r);
      float inner = (1. - smoothstep(.5 * R, 1.1 * R, r)) * .85 * smoothstep(0., 60., r) * done;
      float rip = .75 + .25 * sin(r * .04 - sg * age * 12.);
      o += n * ((ring + inner) * rip * amp * sg);
    }
  }
  return o;
}
`;
