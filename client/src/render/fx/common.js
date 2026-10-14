// FX toolbox shared by every hero module: HDR palettes, element-light behaviours, timed effects (run / after / glow / decal) and
// particle recipes (blob, ring, embers, sparks, smoke, pillar, bolt, shards ...). Everything is HDR (values > 1 bloom).
//
// Rules of the road
//  - lights.js clears every frame, so a light registered from an event handler is lost: use c.glow(...) (a record re-added by update()).
//  - bursts are density-scaled by particles.scale; per-frame spawns use c.n(rate*dt) which also scales.
//  - positions are WORLD coords (x east, y north, z up).
import { getMap } from '../../../../shared/map.js';

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[(Math.random() * a.length) | 0];
export const TAU = Math.PI * 2;

/** Palettes: hot = core, mid, low = fade-out colour, lt = point-light colour (0..1). */
export const PAL = {
  fire:  { hot: [6, 3.6, 1.1], mid: [4, 1.8, 0.45], low: [1.5, 0.3, 0.05], dim: [0.5, 0.1, 0.02], lt: [1, 0.55, 0.18] },
  sun:   { hot: [6.5, 5.4, 2.4], mid: [4.4, 3.1, 0.9], low: [2.2, 1.1, 0.2], dim: [0.8, 0.4, 0.05], lt: [1, 0.85, 0.4] },
  ice:   { hot: [3.2, 4.8, 6.2], mid: [0.9, 2.6, 4.6], low: [0.2, 0.7, 2.2], dim: [0.1, 0.3, 0.8], lt: [0.35, 0.72, 1] },
  volt:  { hot: [5.2, 5.8, 6.6], mid: [2.4, 3.4, 6], low: [0.8, 1.2, 4], dim: [0.3, 0.5, 1.6], lt: [0.6, 0.76, 1] },
  arc:   { hot: [4.6, 2.6, 6.4], mid: [2.5, 1.0, 5.2], low: [0.8, 0.25, 2.6], dim: [0.3, 0.1, 1], lt: [0.66, 0.36, 1] },
  dark:  { hot: [4.4, 1.2, 5.2], mid: [2.4, 0.5, 3.6], low: [0.7, 0.1, 1.4], dim: [0.25, 0.04, 0.5], lt: [0.7, 0.25, 0.9] },
  blood: { hot: [6, 1.4, 0.9], mid: [4, 0.6, 0.35], low: [1.4, 0.1, 0.08], dim: [0.5, 0.04, 0.03], lt: [1, 0.25, 0.18] },
  green: { hot: [2.4, 6, 2.2], mid: [1.0, 4, 1.2], low: [0.2, 1.6, 0.4], dim: [0.08, 0.6, 0.15], lt: [0.4, 1, 0.5] },
  mana:  { hot: [2.2, 3.8, 6.6], mid: [1.0, 2.0, 5], low: [0.2, 0.6, 2.6], dim: [0.1, 0.25, 1], lt: [0.4, 0.6, 1] },
  gold:  { hot: [6.4, 5, 1.8], mid: [4.4, 3, 0.7], low: [2, 1, 0.15], dim: [0.8, 0.4, 0.05], lt: [1, 0.8, 0.3] },
  steel: { hot: [5.6, 6, 6.6], mid: [3, 3.4, 4.4], low: [1.2, 1.4, 2.2], dim: [0.5, 0.55, 0.9], lt: [0.8, 0.88, 1] },
  pink:  { hot: [6, 2.4, 4.2], mid: [4, 1.2, 2.8], low: [1.6, 0.3, 1], dim: [0.6, 0.1, 0.4], lt: [1, 0.45, 0.8] },
  earth: { hot: [3.4, 2.5, 1.5], mid: [2.2, 1.5, 0.8], low: [0.9, 0.55, 0.25], dim: [0.3, 0.2, 0.1], lt: [0.9, 0.6, 0.3] },
  smoke: { hot: [0.7, 0.66, 0.62], mid: [0.45, 0.42, 0.4], low: [0.18, 0.17, 0.17], dim: [0.1, 0.1, 0.1], lt: [0.6, 0.55, 0.5] },
};
// Overdraw of many additive HDR particles saturates to white; keep cores around 3-4 and volume colours around 2-3.
// stepped cooling ramp per palette (particles.js RAMPS): every pixel spark steps hot -> cold through it
const RAMP_OF = { fire: 'fire', sun: 'holy', ice: 'ice', volt: 'volt', arc: 'arcane', dark: 'dark', blood: 'blood', green: 'poison', mana: 'ice', gold: 'holy', steel: 'steel', pink: 'pink', earth: 'earth' };
for (const k in PAL) { if (RAMP_OF[k]) PAL[k].ramp = RAMP_OF[k]; }
for (const k in PAL) { if (k === 'smoke') continue; const p = PAL[k]; p.hot = p.hot.map((v) => v * 0.66); p.mid = p.mid.map((v) => v * 0.8); }
/** Invoker orbs: Q cyan (Quas), W violet (Wex), E orange (Exort). */
export const ORB = { Q: { pal: PAL.ice, lt: [0.35, 0.68, 1], frame: 'invoker_orb_q' }, W: { pal: PAL.arc, lt: [0.66, 0.36, 1], frame: 'invoker_orb_w' }, E: { pal: PAL.fire, lt: [1, 0.6, 0.2], frame: 'invoker_orb_e' } };

/** Element light behaviours ported from the trainer: E = flicker .7-1, W = irregular strobes, Q = steady and a little calmer. */
export function elemMul(e, t, seed) {
  if (e === 'E') return 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 23 + seed) * Math.sin(t * 9.1 + seed * 2));
  if (e === 'W') { const s = Math.sin(t * 31 + seed) * Math.sin(t * 13.7 + seed * 1.7) + 0.35 * Math.sin(t * 57 + seed * 3); return s > 0.3 ? 1.5 : 0.5; }
  if (e === 'Q') return 0.85 + 0.15 * Math.sin(t * 3 + seed);
  return 1;
}

const HEAD = { hero: 160, creep: 96, tower: 330, rax: 200, ancient: 340, fountain: 140, building: 160, summon: 100, ward: 84 };

export function createCtx(args) {
  const { scene, particles: P, lights: L, atlas: A, heightAt, sprites, overlay, uniforms, unitById, worldToScreen, quads: Q } = args;
  const map = getMap();
  const c = {
    args, scene, P, L, A, Q, sprites, overlay, uniforms, map, worldToScreen, heightAt,
    T: 0, dt: 0, view: null, night: false,
    unit: (id) => (id ? unitById(id) : undefined),
    zAt: (x, y) => heightAt(x, y),
    head: (u) => (u.z || 0) + (HEAD[u.kind] || 120),
    chest: (u) => (u.z || 0) + (HEAD[u.kind] || 120) * 0.55,
    vis: (x, y) => (args.visible ? args.visible(x, y) : true),
    frame: (name) => A.frame('fx', name),
    n: (x) => { const v = x * P.scale.v; const f = Math.floor(v); return f + (Math.random() < v - f ? 1 : 0); },
  };

  // ---------------------------------------------------------------------------------------------------------------- timed effects
  const runs = [], runFree = [];
  /** Run fn(rec, dt) every frame for dur seconds (rec.t = elapsed, rec.k = t/dur). Return false from fn to end early. rec.stop() ends it. */
  c.run = (dur, fn, data) => {
    const r = runFree.pop() || { t: 0, dur: 0, k: 0, fn: null, alive: false, data: null, stop() { r2(this); } };
    function r2(x) { x.alive = false; }
    r.t = 0; r.dur = dur; r.k = 0; r.fn = fn; r.alive = true; r.data = data || null;
    runs.push(r); return r;
  };
  c.after = (sec, fn) => c.run(sec, null, fn);   // fn(c) at expiry (alive-check happens in update)
  const afterFns = new WeakMap();
  c.later = (sec, fn) => { const r = c.run(sec, null, null); afterFns.set(r, fn); return r; };

  // lights
  const gl = [], glFree = [];
  /** Timed point light, re-added every frame. o: {mode:'fade'|'flat'|'pop'|'pulse', elem:'E'|'W'|'Q', follow:unitId, dz, flicker, delay} Returns the record (x,y,z,int mutable). */
  c.glow = (x, y, z, col, radius, intensity, dur, o) => {
    const r = glFree.pop() || { seed: 0 };
    r.x = x; r.y = y; r.z = z; r.r = col[0]; r.g = col[1]; r.b = col[2]; r.rad = radius; r.int = intensity; r.t = 0; r.dur = dur; r.alive = true;
    r.mode = (o && o.mode) || 'fade'; r.elem = (o && o.elem) || ''; r.fid = (o && o.follow) || ''; r.dz = (o && o.dz) || 0; r.fl = (o && o.flicker) || 0; r.delay = (o && o.delay) || 0;
    r.seed = Math.random() * 100;
    gl.push(r); return r;
  };
  const _l = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, radius: 1, intensity: 1, flicker: 0 };
  /** Immediate (this frame only) light; only valid from update-time code. */
  c.lightNow = (x, y, z, col, radius, intensity, flicker) => {
    _l.x = x; _l.y = y; _l.z = z; _l.r = col[0]; _l.g = col[1]; _l.b = col[2]; _l.radius = radius; _l.intensity = intensity; _l.flicker = flicker || 0;
    L.add(_l);
  };

  // ground decals (decal_scorch / decal_frost / decal_ring_target), HDR tintable, dither-faded
  /** o: {tint:[r,g,b], emit, bright, roll, spin, pulse, follow:id, grow:[s0,s1], fadeIn, fadeOut} scale = multiplier of the frame size (1 = 6 units per art px). */
  c.decal = (x, y, name, scale, dur, o) => {
    const f = A.frame('fx', name); if (!f) return null;
    o = o || {};
    return c.run(dur, (r, dt) => {
      let px = x, py = y;
      if (o.follow) { const u = unitById(o.follow); if (!u) return false; px = u.x; py = u.y; }
      const k = r.k, fi = o.fadeIn || 0.08, fo = o.fadeOut || 0.3;
      const a = Math.min(1, k / fi, (1 - k) / fo);
      const s = o.grow ? o.grow[0] + (o.grow[1] - o.grow[0]) * Math.min(1, k * (o.growSpeed || 1)) : scale;
      const pul = o.pulse ? 1 + o.pulse * Math.sin(c.T * (o.pulseHz || 8)) : 1;
      const t = o.tint || [1, 1, 1];
      Q.put(px, py, heightAt(px, py), f, s, t[0] * pul, t[1] * pul, t[2] * pul, a, o.emit == null ? 1 : o.emit, 0, 0, 0, (o.roll || 0) + (o.spin || 0) * r.t, true, o.bright == null ? 1 : o.bright);
    });
  };
  /** ring decal sized to world radius R */
  c.ringDecal = (x, y, R, dur, tint, o) => {
    o = o || {}; o.tint = tint; return c.decal(x, y, 'decal_ring_target', R / 78, dur, o);
  };

  // ---------------------------------------------------------------------------------------------------------------- updates
  c.begin = (dt, view) => {
    c.dt = dt; c.T += dt; c.view = view; c.night = !!(view && view.night);
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      if (!r.alive) { runs[i] = runs[runs.length - 1]; runs.pop(); r.fn = null; r.data = null; runFree.push(r); continue; }
      r.t += dt; r.k = r.dur > 0 ? Math.min(1, r.t / r.dur) : 0;
      let go = true;
      if (r.fn) { try { go = r.fn(r, dt) !== false; } catch (e) { go = false; if (!c._warned) { c._warned = true; console.warn('[fx] run error', e); } } }
      if (r.t >= r.dur || !go) {
        r.alive = false;
        const f = afterFns.get(r);
        if (f) { afterFns.delete(r); try { f(c); } catch (e) { console.warn('[fx] later error', e); } }
        else if (r.data && typeof r.data === 'function') { try { r.data(c); } catch (e) { console.warn('[fx] after error', e); } }
      }
    }
    for (let i = gl.length - 1; i >= 0; i--) {
      const l = gl[i];
      l.t += dt;
      if (l.t >= l.dur + l.delay) { l.alive = false; gl[i] = gl[gl.length - 1]; gl.pop(); glFree.push(l); continue; }
      if (l.t < l.delay) continue;
      let x = l.x, y = l.y, z = l.z;
      if (l.fid) { const u = unitById(l.fid); if (u) { x = u.x; y = u.y; z = (u.z || 0) + l.dz; l.x = x; l.y = y; l.z = z; } }
      const k = (l.t - l.delay) / l.dur;
      let m;
      switch (l.mode) {
        case 'flat': m = k > 0.85 ? (1 - k) / 0.15 : Math.min(1, k / 0.05); break;
        case 'pop': m = k < 0.08 ? k / 0.08 : Math.pow(1 - (k - 0.08) / 0.92, 1.6); break;
        case 'pulse': m = 0.65 + 0.35 * Math.sin(c.T * 9 + l.seed); if (k > 0.85) m *= (1 - k) / 0.15; break;
        default: m = (1 - k) * (1 - k) * 0.4 + (1 - k) * 0.6;
      }
      const e = l.elem ? elemMul(l.elem, c.T, l.seed) : 1;
      _l.x = x; _l.y = y; _l.z = z; _l.r = l.r; _l.g = l.g; _l.b = l.b;
      _l.radius = l.rad * (l.elem === 'W' ? 0.9 : 1); _l.intensity = l.int * m * e * 0.6; _l.flicker = l.fl;
      if (_l.intensity > 0.01) L.add(_l);
    }
  };

  // ---------------------------------------------------------------------------------------------------------------- particle recipes
  // Noita look: MANY 1-2 art-px square sparks (stepped cooling ramp) on ballistic arcs that land and settle. Soft 'glow' is only for small light cores.
  // Recipe counts are in "old units": each recipe multiplies them (sparks x6, embers x6, blob x5, pillar x2.5 ...) so call sites stay readable.
  const burst = (d, o) => { if (o) Object.assign(d, o); P.burst(d); return d; };
  const gmode = 'glow';
  const PXD = [0.8, 2];     // art px size range (rounded to whole art pixels in the shader: about 60% 1 px, 40% 2 px)
  const K = (o, k) => (o && o.count != null ? Object.assign({}, o, { count: Math.round(o.count * k) }) : o);
  /** Pixel-spark spawn options for a palette: square 1-2 art px, stepped cooling ramp (pal.ramp). o overrides. */
  c.pix = (pal, o) => Object.assign({ mode: 'square', px: PXD, ramp: pal.ramp, col0: pal.hot, col1: pal.low, a0: 1, a1: 0 }, o);
  /** Small soft glow core (light blob). */
  c.core = (x, y, z, pal, o) => burst({ x, y, z, count: 3, life: [0.15, 0.35], size0: [16, 26], size1: 4, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, speed: 0, mode: gmode, noScale: true }, o);

  /** Spark pop: a small glow core and a ball of ballistic sparks. */
  c.blob = (x, y, z, pal, o) => { c.core(x, y, z, pal); return burst(c.pix(pal, { x, y, z, count: 150, shape: 'sphere', radius: 10, life: [0.5, 1.1], speed: [60, 300], gravity: -420, drag: 1.2, up: 60 }), K(o, 5)); };
  /** Flat shock ring that ends at radius R (o.R): a ring of 1-2 px sparks (cooling as they expand). */
  c.ring = (x, y, z, pal, o) => {
    const R = (o && o.R) || 120, life = (o && o.life) || [0.5, 0.8], drag = (o && o.drag) || 3;
    const lm = Array.isArray(life) ? (life[0] + life[1]) / 2 : life;
    const sp = R * drag / (1 - Math.exp(-drag * lm));
    return burst(c.pix(pal, { x, y, z: z + 4, count: Math.max(60, Math.round(R * 1.4)), shape: 'ring', radius: 8, life, speed: [sp * 0.92, sp * 1.08], flat: true, drag, settle: false }), o);
  };
  /** Embers: sparks thrown up and out that fall, land and cool on the ground. */
  c.embers = (x, y, z, pal, o) => burst(c.pix(pal, { x, y, z, count: 180, shape: 'sphere', radius: 8, life: [0.6, 1.3], speed: [120, 420], gravity: -480, up: 180, drag: 0.9, px: [0.8, 2.4], linger: [0.6, 1.6] }), K(o, 6));
  /** Sparks: faster, brighter, shorter. */
  c.sparks = (x, y, z, pal, o) => burst(c.pix(pal, { x, y, z, count: 144, shape: 'sphere', radius: 6, life: [0.35, 0.8], speed: [120, 400], gravity: -520, drag: 1, px: [0.8, 1.8] }), K(o, 6));
  c.smoke = (x, y, z, o, pal) => { const p = pal || PAL.smoke; return burst({ x, y, z, count: 14, shape: 'sphere', radius: 12, life: [0.9, 1.8], size0: [30, 48], size1: [70, 100], col0: p.mid, col1: p.low, a0: 0.8, a1: 0, speed: [20, 90], up: [10, 60], gravity: 30, drag: 1.5, mode: gmode }, o); };
  /** Vertical column of rising sparks (disc radius o.radius, o.up speed). */
  c.pillar = (x, y, z, pal, o) => burst(c.pix(pal, { x, y, z: z + 2, count: 300, shape: 'disc', radius: 50, life: [0.5, 1.0], speed: [0, 20], up: [700, 2200], drag: 1.4, settle: false }), K(o, 2.5));
  /** Ice-like debris: shard sprites that land and settle, plus a spray of sparks in the same ramp. */
  c.shards = (x, y, z, pal, o) => {
    const d = burst({ x, y, z, count: 26, shape: 'sphere', radius: 8, life: [0.6, 1.2], size0: [16, 26], size1: 10, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, speed: [160, 420], up: [60, 240], gravity: -380, drag: 1.4, stamp: 'p_shard_ice', spin: [-6, 6], rot: [0, TAU] }, o);
    c.sparks(x, y, z, pal, { count: Math.max(4, Math.round(d.count * 0.4)), speed: [100, 380] });
    return d;
  };
  c.stars = (x, y, z, pal, o) => burst({ x, y, z, count: 10, shape: 'sphere', radius: 14, life: [0.5, 1.1], size0: [10, 18], size1: 3, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, speed: [40, 160], gravity: -60, drag: 1.2, stamp: 'p_star', spin: [-4, 4], settle: false }, o);
  c.dust = (x, y, z, o, pal) => { const p = pal || PAL.earth; return burst({ x, y, z: z + 4, count: 20, shape: 'disc', radius: 20, life: [0.5, 1.1], size0: [20, 34], size1: [40, 66], col0: p.low, col1: p.dim, a0: 0.8, a1: 0, speed: [30, 140], flat: true, up: 14, drag: 2.2, mode: gmode }, o); };
  c.leaves = (x, y, z, o) => burst({ x, y, z, count: 14, shape: 'sphere', radius: 14, life: [0.9, 1.8], size0: 14, size1: 12, col0: [0.9, 1.2, 0.45], col1: [0.6, 0.9, 0.3], a0: 0.95, a1: 0.4, speed: [60, 190], up: [40, 160], gravity: -170, drag: 1.2, stamp: 'p_leaf', spin: [-5, 5], rot: [0, TAU] }, o);
  /** Flash: bright glow core and a short light. */
  c.flash = (x, y, z, pal, size, dur) => {
    P.burst({ x, y, z, count: 3, life: [dur || 0.18, (dur || 0.18) * 1.5], size0: size * 0.75, size1: size * 1.4, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, mode: gmode, noScale: true });
    c.glow(x, y, z, pal.lt, Math.min(560, size * 5 + 80), 1.5, (dur || 0.18) * 3, { mode: 'fade' });
  };
  /** Line of pixel sparks along a->b (o.count density). */
  c.line = (x0, y0, z0, x1, y1, z1, pal, o) => burst(c.pix(pal, { x: x0, y: y0, z: z0, x2: x1, y2: y1, z2: z1, count: Math.max(16, Math.round(Math.hypot(x1 - x0, y1 - y0) * 0.45)), shape: 'line', life: [0.2, 0.5], speed: [0, 30], settle: false }), o);
  /** Jagged lightning a->b: pixel sparks along every segment plus the bolt sprites. */
  c.bolt = (x0, y0, z0, x1, y1, z1, pal, o) => {
    o = o || {};
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), segs = Math.max(3, Math.min(9, Math.round(len / 90))), jit = o.jag == null ? Math.min(60, len * 0.12) : o.jag;
    const thick = o.thick || 1;
    let px = x0, py = y0, pz = z0;
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    for (let i = 1; i <= segs; i++) {
      const k = i / segs;
      let qx = x0 + (x1 - x0) * k, qy = y0 + (y1 - y0) * k, qz = z0 + (z1 - z0) * k;
      if (i < segs) { const j = rnd(-jit, jit); qx += nx * j; qy += ny * j; qz += rnd(-jit, jit) * 0.5; }
      const segLen = Math.hypot(qx - px, qy - py, qz - pz);
      P.burst(c.pix(pal, { x: px, y: py, z: pz, x2: qx, y2: qy, z2: qz, count: Math.max(10, Math.round(segLen * 0.7)), shape: 'line', life: [0.1, 0.34], px: [0.8, 1.8 * thick], speed: [0, 40], settle: false }));
      P.burst({ x: px, y: py, z: pz, x2: qx, y2: qy, z2: qz, count: Math.max(1, Math.round(segLen / 60)), shape: 'line', life: [0.1, 0.22], size0: [26 * thick, 38 * thick], size1: 16, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, stamp: 'p_bolt_' + ((Math.random() * 3) | 0), speed: [0, 20], rot: [0, TAU] });
      px = qx; py = qy; pz = qz;
    }
    if (!o.noLights) {
      const n = Math.min(5, Math.max(2, Math.round(len / 220)));
      for (let i = 0; i <= n; i++) { const k = i / n; c.glow(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k + 20, pal.lt, o.lightR || 420, (o.light || 1.6) * (i === 0 || i === n ? 1.3 : 0.8), 0.3, { mode: 'fade' }); }
    }
  };
  /** Pixel sparks along a geo3d bolt's segments (call right after bolt.roll() returned true). density ~ sparks per world unit. */
  c.boltSparks = (b, pal, density) => {
    for (let i = 0; i < b.n; i++) {
      const o = i * 8, s = b.seg, ax = s[o], ay = -s[o + 2], az = s[o + 1], bx = s[o + 3], by = -s[o + 5], bz = s[o + 4];
      const len = Math.hypot(bx - ax, by - ay, bz - az), n = Math.round(len * (density || 0.35) * P.scale.v);
      if (n > 0) P.burst(c.pix(pal, { x: ax, y: ay, z: az, x2: bx, y2: by, z2: bz, count: n, shape: 'line', life: [0.12, 0.4], speed: [0, 40], px: [0.8, 1.6], settle: false }));
    }
  };
  /** Emitter anchored to a unit (follows it); returns the emitter. */
  c.follow = (id, dz) => { const o = { x: 0, y: 0, z: 0 }; return () => { const u = unitById(id); if (!u) return null; o.x = u.x; o.y = u.y; o.z = (u.z || 0) + dz; return o; }; };
  c.emitOn = (id, dz, dur, opts) => {
    const u = unitById(id); const x = u ? u.x : 0, y = u ? u.y : 0, z = u ? (u.z || 0) + dz : dz;
    return P.emitter(Object.assign({ x, y, z, follow: c.follow(id, dz), duration: dur }, opts));
  };
  /** Swirl of motes around a unit for dur seconds. o: {r, h0, h1, rate, speed(rad/s), size, pal, up, stamp} */
  c.swirl = (id, dur, pal, o) => {
    o = o || {};
    const r0 = o.r || 40, rate = o.rate || 40, spd = o.speed || 5, h0 = o.h0 == null ? 8 : o.h0, h1 = o.h1 == null ? 150 : o.h1, size = o.size || 12;
    return c.run(dur, (rec, dt) => {
      const u = unitById(id); if (!u) return false;
      if (u.visible === false) return;
      const n = c.n(rate * 2.5 * dt), z0 = u.z || 0;
      for (let i = 0; i < n; i++) {
        const a = c.T * spd + (i / Math.max(1, n)) * TAU + Math.random() * 0.6, hk = Math.random();
        const rr = r0 * (o.cone ? 0.4 + 0.6 * (1 - hk) : 1);
        P.spawn(c.pix(pal, { x: u.x + Math.cos(a) * rr, y: u.y + Math.sin(a) * rr, z: z0 + h0 + (h1 - h0) * hk, life: [0.45, 0.9], stamp: o.stamp, px: [0.8, 1.8], settle: false,
          vel: [-Math.sin(a) * r0 * spd * 0.8, Math.cos(a) * r0 * spd * 0.8, 0], speed: 0, up: o.up == null ? 40 : o.up, drag: 1.2 }));
      }
    });
  };
  c.rise = (x, y, z, pal, o) => burst(c.pix(pal, { x, y, z, count: 80, shape: 'disc', radius: 40, life: [0.8, 1.6], speed: [0, 20], up: [60, 160], drag: 0.6, settle: false }), K(o, 4));

  c.unitPos = (id) => { const u = unitById(id); return u || null; };
  /** world→{x,y} from an event: explicit x,y, else target unit, else source unit. */
  c.at = (ev, su, tu) => (ev.x != null && ev.y != null ? { x: ev.x, y: ev.y, z: heightAt(ev.x, ev.y) } : tu ? { x: tu.x, y: tu.y, z: tu.z || 0 } : su ? { x: su.x, y: su.y, z: su.z || 0 } : null);
  /** Unit direction from (x0,y0) to (x1,y1) as an angle. */
  c.ang = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0);
  c.enemiesNear = (x, y, r, team, max) => {
    const out = []; const us = c.view && c.view.units; if (!us) return out;
    for (let i = 0; i < us.length && out.length < (max || 8); i++) { const u = us[i]; if (u.team !== team && u.kind !== 'tower' && u.hp > 0 && Math.hypot(u.x - x, u.y - y) < r) out.push(u); }
    return out;
  };
  return c;
}
