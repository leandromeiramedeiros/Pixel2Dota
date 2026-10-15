// Spell wind: gusts kicked up by spell casts that make trees / bushes / grass ripple. Pure (no three / DOM) so node tests can import it.
//   Base breeze (the constant sway) stays in the tree / clutter vertex shaders; this module only owns the GUST layer on top of it:
//   a fixed array of MAX_GUSTS gusts (pos, dir, radius, strength, kind, age) -> flat Float32Arrays -> shared uniforms (shaderlib.js).
//   Game coords (x, y) in the gust records; pack() converts to the renderer's three plane (x, z = -y), which is what the GLSL uses.
//
//   Gust shape follows the spell (spellGust()):
//     SWIRL  unit / point targeted -> tangential push circling the impact point, size from the spell's radius / cast range
//     LINE   projectile / vector spells (x2,y2 end point) -> a pulse running along the line, widening into a cone
//     BURST  big area / self-centred spells -> a ring that expands outward from the centre
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

/** A few spells whose shape the generic rules cannot guess. kind / radius (burst or swirl size) / strength (0..1) / start ('xy' = line starts at ev.x,y). */
export const OVERRIDES = {
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
 * abilities = DATA.abilities. Result: { x, y, dx, dy, len, radius, strength, kind, life, key, src }  (game coords; len = half length of a line)
 */
export function spellGust(ev, src, tgt, abilities = DATA.abilities) {
  if (!ev || ev.e !== EV.SPELL || !ev.k || ev.sub) return null;       // sub-events (omnislash cuts, hook hits, arc jumps) are not casts
  if (ev.k.startsWith('item_')) return null;
  const st = abilityStats(ev.k, ev.lv, abilities); if (!st || st.passive) return null;
  const ov = OVERRIDES[ev.k] || {};
  const sx = src && src.x != null ? src.x : ev.x, sy = src && src.y != null ? src.y : ev.y;
  if (sx == null || sy == null) return null;
  const ex = ev.x2, ey = ev.y2;
  const hasEnd = ex != null && ey != null;
  const radius = ev.r && !hasEnd ? Math.max(ev.r, st.radius) : st.radius;
  // ---- strength: damage -> 0..1 (100 dmg ~ 0.38, 300 ~ 0.74, 500+ = 1); ults +25 %; area-only utility spells get a light breeze
  let strength = st.damage > 0 ? Math.pow(clamp(st.damage / 500, 0, 1), 0.6) : radius > 0 ? 0.14 + Math.min(0.2, radius / 4000) : 0.1;
  if (st.ult) strength *= 1.25;
  strength = clamp(ov.strength != null ? ov.strength : strength, 0, 1);
  if (strength < 0.06) return null;
  // ---- shape
  let kind, x, y, dx = 1, dy = 0, len = 0, R;
  const lineStart = ov.start === 'xy' && ev.x != null ? { x: ev.x, y: ev.y } : { x: sx, y: sy };
  const lineLen = hasEnd ? dist(lineStart.x, lineStart.y, ex, ey) : 0;
  if (ov.kind != null) kind = ov.kind;
  else if (hasEnd && !st.aoe && lineLen > 220) kind = KIND.LINE;
  else if (st.noTarget) kind = radius >= 400 || (st.ult && radius > 0) ? KIND.BURST : KIND.SWIRL;
  else if ((st.aoe || st.point) && radius >= 520) kind = KIND.BURST;
  else kind = KIND.SWIRL;
  if (kind === KIND.LINE) {
    if (!hasEnd || lineLen < 60) kind = KIND.SWIRL;
  }
  if (kind === KIND.LINE) {
    const L = lineLen; dx = (ex - lineStart.x) / L; dy = (ey - lineStart.y) / L;
    len = L * 0.5; x = lineStart.x + dx * len; y = lineStart.y + dy * len;
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
  const life = (2.5 + 3 * strength) * (kind === KIND.BURST ? 1.1 : 1);   // lasting: strong spells leave the trees rocking for ~5-6 s
  return { x, y, dx, dy, len, radius: R, strength, kind, life: Math.min(6, life), key: ev.k, src: ev.s };
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
      for (const o of gusts) if (o.key === g.key && o.src === g.src && o.age < REARM) return null;   // channel ticks / duplicate events
      const rec = { x: g.x, y: g.y, dx: g.dx, dy: g.dy, len: g.len || 0, radius: g.radius, strength: g.strength, kind: g.kind, life: g.life, age: 0, key: g.key, src: g.src };
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
      return api.spawn(g);
    },
    update(dt) {
      for (let i = gusts.length - 1; i >= 0; i--) { const g = gusts[i]; g.age += dt; if (g.age >= g.life) gusts.splice(i, 1); }
    },
    clear() { gusts.length = 0; },
    setGain(k) { api.gain = k; if (!(k > 0)) gusts.length = 0; },
    /** write the uniform arrays (vec4 x max each); returns the active count. A: x, z, radius, amp. B: dirx, dirz, kind, half length. C: age. */
    pack(A, B, C) {
      let n = 0;
      for (const g of gusts) {
        const amp = g.strength * envelope(g.age, g.life); if (amp <= 0.002) continue;
        const o = n * 4;
        A[o] = g.x; A[o + 1] = -g.y; A[o + 2] = g.radius; A[o + 3] = amp;
        B[o] = g.dx; B[o + 1] = -g.dy; B[o + 2] = g.kind; B[o + 3] = g.len;
        C[o] = g.age; C[o + 1] = 0; C[o + 2] = 0; C[o + 3] = 0;
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
  const o = i * 4, amp = A[o + 3], R = A[o + 2], age = C[o];
  const dx = px - A[o], dz = pz - A[o + 1];
  const k = B[o + 2];
  let ox = 0, oz = 0;
  if (k < 0.5) {                                                       // SWIRL: outward spiral (tangential + away from the centre), rippling outward
    const r = Math.hypot(dx, dz), nx = dx / Math.max(r, 1), nz = dz / Math.max(r, 1);
    const fall = 1 - smooth(0, 1, r / R), f2 = fall * fall;
    const a = 0.7 + 0.12 * Math.sin(age * 4 - r * 0.02);
    const cx = Math.cos(a), sn = Math.sin(a);
    const tx = -nz, tz = nx;
    const rip = 0.7 + 0.3 * Math.sin(r * 0.035 - age * 9);
    ox = (tx * cx + nx * sn) * f2 * rip * amp; oz = (tz * cx + nz * sn) * f2 * rip * amp;
  } else if (k < 1.5) {                                                // LINE: pulse running along dir, widening into a cone
    const ux = B[o], uz = B[o + 1], L = B[o + 3];
    const s = dx * ux + dz * uz, l = -dx * uz + dz * ux;
    const prog = clamp(age / (0.3 + L / 1500), 0, 1), sf = -L + 2 * L * prog;
    const spread = R * (0.55 + 0.45 * clamp((s + L) / Math.max(2 * L, 1), 0, 1));
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
    const rf = R * Math.min(1, age * 2.2);
    const e = (r - rf) / (R * 0.28 + 30);
    const ring = Math.exp(-e * e);
    const inner = (1 - smooth(0.5 * R, 1.1 * R, r)) * 0.85 * smooth(0, 60, r) * (1 - smooth(rf, rf + 0.1 * R, r));
    const rip = 0.75 + 0.25 * Math.sin(r * 0.04 - age * 12);
    const f = (ring * (1 - smooth(0.7 * R, 1.15 * R, r)) + inner) * rip * amp;
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
// GLSL (kept in step with gustField above). Insert after the uniform block of a vertex shader; call gustAt(foot.xz) -> world push (units 1 = full).
export const WIND_GLSL = /* glsl */ `
uniform float uWind;                 // 0 = no wind at all, 0.5 medium, 1 high (scales base sway and gusts)
uniform int uWN;
uniform vec4 uWA[${MAX_GUSTS}];      // x, z, radius, amplitude
uniform vec4 uWB[${MAX_GUSTS}];      // dirx, dirz, kind, half length
uniform vec4 uWC[${MAX_GUSTS}];      // age
vec2 gustAt(vec2 f){
  vec2 o = vec2(0.);
  for (int i = 0; i < ${MAX_GUSTS}; i++){
    if (i >= uWN) break;
    vec4 A = uWA[i], B = uWB[i];
    float age = uWC[i].x, R = A.z, amp = A.w;
    vec2 d = f - A.xy;
    if (B.z < .5){
      float r = length(d);
      if (r >= R) continue;
      vec2 n = d / max(r, 1.), t = vec2(-n.y, n.x);
      float fall = 1. - smoothstep(0., 1., r / R);
      float a = .7 + .12 * sin(age * 4. - r * .02);
      float rip = .7 + .3 * sin(r * .035 - age * 9.);
      o += (t * cos(a) + n * sin(a)) * (fall * fall * rip * amp);
    } else if (B.z < 1.5){
      vec2 u = B.xy, pu = vec2(-u.y, u.x);
      float L = B.w, s = dot(d, u), l = dot(d, pu);
      float sf = -L + 2. * L * clamp(age / (.3 + L / 1500.), 0., 1.);
      float spread = R * (.55 + .45 * clamp((s + L) / max(2. * L, 1.), 0., 1.));
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
      float rf = R * min(1., age * 2.2);
      float e = (r - rf) / (R * .28 + 30.);
      float ring = exp(-e * e) * (1. - smoothstep(.7 * R, 1.15 * R, r));
      float inner = (1. - smoothstep(.5 * R, 1.1 * R, r)) * .85 * smoothstep(0., 60., r) * (1. - smoothstep(rf, rf + .1 * R, r));
      float rip = .75 + .25 * sin(r * .04 - age * 12.);
      o += n * ((ring + inner) * rip * amp);
    }
  }
  return o;
}
`;
