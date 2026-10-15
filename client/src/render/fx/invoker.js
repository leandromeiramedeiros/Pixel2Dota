// Invoker: orb casts, Invoke, and the ten invoked spells. Quas = cyan (steady), Wex = violet (strobing), Exort = orange (flickering).
// Orb orbiting visuals live in status.js (they follow the u.orbs string).
import { EV } from '../../../../shared/protocol.js';
import { PAL, ORB, rnd, pick, TAU } from './common.js';

const ELEM_PAL = { Q: PAL.ice, W: PAL.arc, E: PAL.fire };
const COLD = [0.7, 1.6, 2.6];

export function register(c, R) {
  const P = c.P, Q = c.Q;
  const fShard = c.frame('p_shard_ice'), fBall = c.frame('fireball'), fBall1 = c.frame('fireball_1'), fBall2 = c.frame('fireball_2');
  const fireFrames = [fBall, fBall1, fBall2].filter(Boolean);
  const blastDims = new Map();   // source id -> {r0, r1}

  // ---------------------------------------------------------------------------------------------------------------- orbs + invoke
  const orbCast = (ch) => (ev, su) => {
    if (!su) return;
    const o = ORB[ch], pal = o.pal, z = c.chest(su);
    c.flash(su.x, su.y, z, pal, 36, 0.18);
    c.ring(su.x, su.y, su.z || 0, pal, { R: 70, life: [0.3, 0.5] });
    c.sparks(su.x, su.y, z, pal, { count: 10, speed: [60, 200] });
    c.glow(su.x, su.y, z, o.lt, 260, 1.4, 0.35, { elem: ch });
  };
  R.spell('invoker_quas', orbCast('Q'));
  R.spell('invoker_wex', orbCast('W'));
  R.spell('invoker_exort', orbCast('E'));
  R.spell('invoker_invoke', () => {});   // EV.INVOKE carries the visual
  R.on(EV.INVOKE, (ev, su) => invokeFx(su, ev.k));

  function invokeFx(su) {
    if (!su || !c.vis(su.x, su.y)) return;
    const orbs = su.orbs || 'QWE', z = c.chest(su), id = su.id;
    // three coloured streams converge into the hero's hands, then a column of mixed light
    c.run(0.45, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const k = r.k;
      for (let i = 0; i < 3; i++) {
        const ch = orbs[i] || 'Q', pal = ELEM_PAL[ch] || PAL.ice;
        const n = c.n(130 * dt);
        for (let j = 0; j < n; j++) {
          const a = c.T * 9 + i * (TAU / 3) + rnd(-0.3, 0.3), rr = 70 * (1 - k) + 6;
          P.spawn(c.pix(pal, { x: u.x + Math.cos(a) * rr, y: u.y + Math.sin(a) * rr * 0.8, z: z + rnd(-14, 24) + k * 20, life: [0.14, 0.3], speed: 0, settle: false }));
        }
      }
    });
    c.later(0.4, () => {
      const u = c.unit(id) || su, zz = c.chest(u), cx = u.x, cy = u.y;
      c.flash(cx, cy, zz, PAL.steel, 50, 0.22);
      for (let i = 0; i < 3; i++) {
        const ch = orbs[i] || 'Q', pal = ELEM_PAL[ch] || PAL.ice;
        c.pillar(cx + rnd(-10, 10), cy + rnd(-10, 10), u.z || 0, pal, { count: 30, radius: 14, up: [300, 800] });
        c.ring(cx, cy, u.z || 0, pal, { R: 90 + i * 26, life: [0.4, 0.7] });
        c.sparks(cx, cy, zz, pal, { count: 12, speed: [80, 280] });
      }
      const dom = orbs[2] || 'Q';
      c.ringDecal(cx, cy, 90, 0.9, [2.2, 2.2, 2.4], { emit: 1.5, spin: 3, fadeOut: 0.5 });
      c.glow(cx, cy, zz, (ELEM_PAL[dom] || PAL.ice).lt, 300, 1.1, 0.5, { elem: dom });
    });
  }

  // ---------------------------------------------------------------------------------------------------------------- cold snap (t)
  R.spell('invoker_cold_snap', (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    const pal = PAL.ice, id = t.id, dur = Math.min(ev.dur || 5, 8);
    if (su && tu) c.bolt(su.x, su.y, c.chest(su), t.x, t.y, c.chest(t), pal, { jag: 14, lightR: 260, light: 1.2 });
    const x = t.x, y = t.y, z = t.z || 0;
    c.flash(x, y, c.chest(t), pal, 70, 0.28);
    c.shards(x, y, z + 70, pal, { count: 34 });
    c.ring(x, y, z, pal, { R: 120 });
    c.pillar(x, y, z, pal, { count: 80, radius: 26, up: [400, 1100] });
    c.decal(x, y, 'decal_frost', 1.1, Math.min(dur, 3), { tint: COLD, emit: 1.3, fadeOut: 0.4, follow: id });
    c.glow(x, y, z + 80, pal.lt, 340, 1.6, Math.min(dur, 3), { follow: id, dz: 70, elem: 'Q', mode: 'flat' });
    // re-freeze pulses on the victim for the debuff duration
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const n = c.n(80 * dt);
      for (let i = 0; i < n; i++) P.spawn(c.pix(pal, { x: u.x + rnd(-18, 18), y: u.y + rnd(-12, 12), z: (u.z || 0) + rnd(10, 120), life: [0.5, 1], speed: [0, 30], up: [-10, 14], gravity: -90, linger: [0.4, 1.0] }));
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- ghost walk (self, r, dur)
  R.spell('invoker_ghost_walk', (ev, su) => {
    if (!su) return;
    const id = su.id, pal = PAL.ice, dur = ev.dur || 6, rad = ev.r || 400;
    c.flash(su.x, su.y, c.chest(su), PAL.arc, 70, 0.3);
    c.ring(su.x, su.y, su.z || 0, pal, { R: 140 });
    c.blob(su.x, su.y, c.chest(su), PAL.arc, { count: 30, speed: [40, 160] });
    c.swirl(id, 1.4, PAL.arc, { r: 34, rate: 60, speed: 6 });
    c.ringDecal(su.x, su.y, rad, dur, [0.35, 0.8, 1.4], { emit: 0.9, follow: id, fadeIn: 0.1, fadeOut: 0.12, spin: 0.1 });
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const n = c.n(70 * dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, rr = rad * Math.sqrt(Math.random());
        P.spawn(c.pix(pal, { x: u.x + Math.cos(a) * rr, y: u.y + Math.sin(a) * rr, z: (u.z || 0) + 6, life: [0.7, 1.4], speed: 0, up: [40, 120], settle: false, rampTint: [0.7, 0.7, 0.7] }));
      }
      c.lightNow(u.x, u.y, (u.z || 0) + 80, pal.lt, 260, 0.6, 0);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- ice wall (x,y)-(x2,y2), r = half width, dur
  R.spell('invoker_ice_wall', (ev, su) => {
    const x0 = ev.x, y0 = ev.y, x1 = ev.x2, y1 = ev.y2; if (x0 == null || x1 == null) return;
    const dur = ev.dur || 6, len = Math.hypot(x1 - x0, y1 - y0) || 1, N = Math.max(6, Math.round(len / 38));
    const pal = PAL.ice, nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const sx = new Float32Array(N * 2), sy = new Float32Array(N * 2), sz = new Float32Array(N * 2), ss = new Float32Array(N * 2), sr = new Float32Array(N * 2);
    for (let i = 0; i < N * 2; i++) {
      const row = i < N ? 0 : 1, k = ((i % N) + 0.5 + rnd(-0.25, 0.25)) / N, off = (row ? 16 : -10) + rnd(-5, 5);
      sx[i] = x0 + (x1 - x0) * k + nx * off; sy[i] = y0 + (y1 - y0) * k + ny * off; sz[i] = c.zAt(sx[i], sy[i]);
      ss[i] = (row ? 2.3 : 2.9) + rnd(0, 1.1); sr[i] = rnd(-0.2, 0.2);
    }
    // eruption
    c.flash((x0 + x1) / 2, (y0 + y1) / 2, c.zAt(x0, y0) + 60, pal, 90, 0.3);
    c.line(x0, y0, c.zAt(x0, y0) + 6, x1, y1, c.zAt(x1, y1) + 6, pal, { life: [0.3, 0.6], size0: [20, 30] });
    P.burst(c.pix(pal, { x: x0, y: y0, z: c.zAt(x0, y0) + 6, x2: x1, y2: y1, z2: c.zAt(x1, y1) + 6, shape: 'line', count: Math.round(len / 1.5), life: [0.6, 1.2], speed: [0, 60], up: [200, 700], gravity: -500, drag: 1.2 }));
    P.emitter(c.pix(PAL.ice, { x: x0, y: y0, z: c.zAt(x0, y0) + 12, x2: x1, y2: y1, z2: c.zAt(x1, y1) + 12, shape: 'line', rate: len * 1.4, duration: dur, life: [0.5, 0.9], up: [14, 50], speed: [0, 6], settle: false }));
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (let i = 0; i < 5; i++) { const k = i / 4; c.glow(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, c.zAt(x0, y0) + 90, pal.lt, len * 0.32, 0.75, dur, { mode: 'flat', elem: 'Q' }); }
    for (let i = 0; i < 4; i++) { const k = (i + 0.5) / 4; c.decal(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 'decal_frost', len / 4 / 100, dur, { tint: COLD, emit: 1.1, fadeOut: 0.25, roll: Math.atan2(y1 - y0, x1 - x0) }); }
    c.run(dur, (r, dt) => {
      const grow = Math.min(1, r.t / 0.3), fade = Math.min(1, (dur - r.t) / 0.7);
      for (let i = 0; i < N * 2; i++) {
        const pop = Math.min(1, Math.max(0, (r.t * 6 - (i % N) / N * 1.2))), s = ss[i] * pop * (0.6 + 0.4 * grow);
        if (s > 0.05) Q.put(sx[i], sy[i], sz[i], fShard, s, 0.9, 1.7, 2.8, fade, 1.5, 0, 0, 0, sr[i], false, 1.05);
      }
      const n = c.n(110 * dt);
      for (let i = 0; i < n; i++) { const k = Math.random(); P.spawn(c.pix(pal, { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, z: c.zAt(x0, y0) + rnd(10, 150), life: [0.35, 0.8], speed: 0, up: [0, 20], gravity: -60 })); }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- EMP (x,y,r,dur = delay)
  R.spell('invoker_emp', (ev, su) => {
    const x = ev.x, y = ev.y; if (x == null) return;
    const rad = ev.r || 675, dur = ev.dur || 2.9, z = c.zAt(x, y), pal = PAL.arc;
    c.ringDecal(x, y, rad, dur + 0.2, [1.4, 0.6, 2.8], { emit: 1.4, spin: 0.3, pulse: 0.2, pulseHz: 14, fadeOut: 0.1 });
    c.ringDecal(x, y, rad * 0.66, dur, [0.8, 0.4, 1.8], { emit: 1, spin: -0.6, pulse: 0.15, pulseHz: 9, fadeOut: 0.1, light: false });
    const lt = c.glow(x, y, z + 70, pal.lt, rad * 0.8, 0.5, dur, { mode: 'flat', elem: 'W' });
    c.run(dur, (r, dt) => {
      lt.int = 0.5 + 1.6 * r.k;
      // violet motes on the rim fall inward and tick up faster as the fuse burns down
      const n = c.n((90 + 250 * r.k) * dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, rr = rad * rnd(0.82, 1.0);
        P.spawn(c.pix(pal, { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: z + 6, life: [0.4, 0.8], vel: [-Math.cos(a) * rad * 0.7, -Math.sin(a) * rad * 0.7, 0], speed: 0, up: [60, 220], drag: 1.2, settle: false }));
      }
      // jittery arcs at the centre
      if (Math.random() < dt * (3 + 10 * r.k)) {
        const a = Math.random() * TAU, d = rnd(30, rad * 0.35);
        c.bolt(x, y, z + 6, x + Math.cos(a) * d, y + Math.sin(a) * d, z + rnd(10, 90), pal, { jag: 20, noLights: true, thick: 0.7 });
      }
      P.spawn({ x, y, z: z + 8, life: 0.07, size0: 50 + 60 * r.k, size1: 50, col0: pal.mid, col1: pal.mid, a0: 0.12 + 0.2 * r.k, a1: 0.08, mode: 'glow', speed: 0, noScale: true, flat: true });
    });
    c.later(dur, () => {
      c.flash(x, y, z + 90, PAL.steel, 200, 0.35);
      c.ring(x, y, z, pal, { R: rad, life: [0.5, 0.8] });
      c.ring(x, y, z, PAL.steel, { R: rad * 0.6, life: [0.3, 0.5] });
      c.pillar(x, y, z, pal, { count: 200, radius: rad * 0.12, up: [700, 2400] });
      for (let i = 0; i < 7; i++) { const a = rnd(0, TAU), d = rnd(rad * 0.2, rad * 0.85); c.bolt(x, y, z + 6, x + Math.cos(a) * d, y + Math.sin(a) * d, z + 4, pal, { lightR: 360, light: 1.2 }); }
      c.sparks(x, y, z + 40, pal, { count: 60, speed: [200, 700] });
      c.glow(x, y, z + 100, pal.lt, rad * 1.4, 3.4, 0.7);
      c.decal(x, y, 'decal_scorch', rad / 110, 3, { tint: [0.9, 0.3, 1.8], emit: 0.8, fadeOut: 0.7 });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- tornado: PROJ funnel + cast
  R.spell('invoker_tornado', (ev, su, tu) => {
    if (ev.sub === 'lift') return liftFx(ev, tu);
    if (!su) return;
    c.flash(su.x, su.y, c.chest(su), PAL.steel, 60, 0.2);
    c.ring(su.x, su.y, su.z || 0, PAL.ice, { R: 120 });
    c.swirl(su.id, 0.5, PAL.arc, { r: 30, rate: 50, speed: 8 });
  });
  const funnel = (cc, p, dt) => {
    const n = cc.n(700 * dt), z0 = cc.zAt(p.x, p.y);
    for (let i = 0; i < n; i++) {
      const h = Math.random() * 320, a = cc.T * 9 + h * 0.025 + rnd(0, TAU), rr = 18 + h * 0.34 + rnd(-6, 6);
      const pl = Math.random() < 0.45 ? PAL.steel : Math.random() < 0.5 ? PAL.ice : PAL.arc;
      P.spawn(cc.pix(pl, { x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, z: z0 + h, life: [0.3, 0.55], vel: [-Math.sin(a) * rr * 6, Math.cos(a) * rr * 6, 0], speed: 0, up: [20, 80], drag: 1.4, settle: false }));
    }
    const m = cc.n(14 * dt);
    for (let i = 0; i < m; i++) { const a = rnd(0, TAU); P.spawn({ x: p.x + Math.cos(a) * 50, y: p.y + Math.sin(a) * 50, z: z0 + 6, life: [0.5, 0.9], size0: [20, 34], size1: [40, 60], col0: PAL.earth.low, col1: PAL.earth.dim, a0: 0.6, a1: 0, mode: 'glow', vel: [Math.cos(a) * 60, Math.sin(a) * 60, 0], speed: 0, up: 20, flat: true, drag: 1.5 }); }
  };
  // a caught unit spins in a small steel / ice cyclone for the lift: crisp motes circling up past it, a cold halo, a ground ring
  function liftFx(ev, t) {
    if (!t) return;
    const tid = t.id, dur = Math.max(0.4, Math.min(ev.dur || 1.5, 4));
    c.ringDecal(t.x, t.y, 70, dur, [0.6, 1.2, 1.6], { emit: 0.6, fadeIn: 0.15, fadeOut: 0.2 });
    c.run(dur, (r, dt) => {
      const u = c.unit(tid); if (!u || u.hp <= 0) return false;
      if (!c.vis(u.x, u.y)) return;
      const z0 = u.z || c.zAt(u.x, u.y);
      for (let n = c.n(180 * dt); n > 0; n--) {
        const h = rnd(0, 150), a = c.T * 10 + h * 0.04 + rnd(0, TAU), rr = 16 + h * 0.18 + rnd(-4, 4), pl = Math.random() < 0.5 ? PAL.steel : PAL.ice;
        P.spawn(c.pix(pl, { x: u.x + Math.cos(a) * rr, y: u.y + Math.sin(a) * rr, z: z0 + h, life: [0.25, 0.45], vel: [-Math.sin(a) * rr * 7, Math.cos(a) * rr * 7, 0], speed: 0, up: [40, 120], drag: 1.2, settle: false }));
      }
      c.lightNow(u.x, u.y, z0 + 70, PAL.ice.lt, 220, 0.45 + 0.15 * Math.sin(c.T * 12), 0);
    });
  }
  R.proj('invoker_tornado', {
    frames: null, sp: 1000, z: 0, trail: funnel, light: { col: PAL.ice.lt, radius: 360, int: 1.0, elem: 'W' }, pal: PAL.ice,
    hit(cc, p) { cc.ring(p.x, p.y, cc.zAt(p.x, p.y), PAL.steel, { R: 160 }); cc.sparks(p.x, p.y, cc.zAt(p.x, p.y) + 80, PAL.ice, { count: 24 }); cc.glow(p.x, p.y, cc.zAt(p.x, p.y) + 80, PAL.ice.lt, 360, 1.4, 0.4); },
  });

  // ---------------------------------------------------------------------------------------------------------------- alacrity (t or self)
  R.spell('invoker_alacrity', (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    const id = t.id, dur = Math.min(ev.dur || 9, 12), pal = PAL.fire, z = t.z || 0;
    c.flash(t.x, t.y, c.chest(t), PAL.sun, 70, 0.3);
    c.ring(t.x, t.y, z, pal, { R: 130 });
    c.embers(t.x, t.y, z + 60, pal, { count: 30 });
    c.pillar(t.x, t.y, z, pal, { count: 80, radius: 28, up: [400, 1000] });
    c.glow(t.x, t.y, c.chest(t), pal.lt, 300, 1.2, dur, { follow: id, dz: 90, elem: 'E', mode: 'flat' });
    c.swirl(id, 1.2, pal, { r: 36, rate: 60, speed: 8 });
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const n = c.n(70 * dt);
      for (let i = 0; i < n; i++) P.spawn(c.pix(pal, { x: u.x + rnd(-18, 18), y: u.y + rnd(-12, 12), z: (u.z || 0) + rnd(0, 120), life: [0.4, 0.8], speed: 0, up: [50, 110], settle: false }));
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- sun strike (x,y,r,dur = delay)
  R.spell('invoker_sun_strike', (ev) => {
    const x = ev.x, y = ev.y; if (x == null) return;
    const rad = ev.r || 175, dur = ev.dur || 1.7, z = c.zAt(x, y), pal = PAL.sun, G = c.G;
    // 3D geometry colours: shells stay below the 1.4 bloom threshold, the core is HDR
    const GOLD = [0.48, 0.34, 0.08], AMB = [0.32, 0.16, 0.03], CORE = [1.05, 0.88, 0.45], HOT = [0.9, 0.68, 0.26];   // toned down (director: too bright)
    const tgt = { n: 10, seed: Math.random() * 50, p0: 0, p1: 0.25, p2: 1.2 }, wave = { n: 24, seed: Math.random() * 40, p0: 0, p1: 0.2, p2: 0.4 }, wave2 = { n: 16, seed: 7.3, p0: 0, p1: 0.16, p2: 0.2 };
    const glowD = { p0: 0, p1: 1.4, p2: 0.55, p3: 0.5, n: 0 }, shell = { swirl: 0.75, pow: 1.6, flare: 0, top: 0.8, phase: 0, front: 0 }, halo = { swirl: 0.2, pow: 2.6, top: 0.7 }, core = { swirl: 0.3, pow: 0.7, flare: 1, top: 0.6, front: 0, phase: 0 };
    const lt = c.glow(x, y, z + 40, pal.lt, rad * 3, 0.3, dur, { mode: 'flat', elem: 'E' });
    // telegraph: golden targeting circle (rotating dashed rings, sun rays) tightening in with a pixel-noisy fill
    c.run(dur + 0.12, (r, dt) => {
      const k = Math.min(1, r.t / dur), a = Math.min(1, r.t / 0.12) * (r.t > dur ? Math.max(0, 1 - (r.t - dur) / 0.12) : 1);
      tgt.p0 = c.T * 1.1; tgt.p1 = 0.35 + 0.6 * k; tgt.p2 = 0.6 + k;
      G.disc(x, y, z, rad, 1, GOLD, a * (0.75 + 0.25 * Math.sin(c.T * 12)), tgt);
      lt.int = 0.3 + 1.4 * k;
      const n = c.n((60 + 160 * k) * dt);
      for (let i = 0; i < n; i++) { const an = Math.random() * TAU, rr = rad * Math.sqrt(Math.random()); P.spawn(c.pix(pal, { x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr, z: z + 4, life: [0.5, 1.0], speed: 0, up: [120, 300 + 500 * k], gravity: -520 })); }
    });
    c.later(dur, () => {
      // impact: light column drops from the sky (bright head), swirling gold shell around a white-hot core, ground shockwaves, ember glow
      c.run(1.05, (r, dt) => {
        const t = r.t, k = r.k, drop = Math.min(1, t / 0.07), fade = Math.min(1, (1 - k) / 0.35), shrink = t > 0.55 ? 1 - Math.pow((t - 0.55) / 0.5, 2) : 1;
        shell.front = 1 - drop; core.front = 1 - drop; halo.front = 1 - drop; shell.phase = core.phase = c.T * 7;
        G.tube(x, y, z, 1700, rad * 0.66 * shrink, rad * 0.62 * shrink, GOLD, fade, shell);
        G.tube(x, y, z, 1700, rad * 0.98 * shrink, rad * 0.9 * shrink, AMB, fade * 0.45, halo);
        G.tube(x, y, z, 1700, rad * 0.2 * shrink, rad * 0.18 * shrink, CORE, fade, core);
        const f1 = 1 - Math.pow(1 - Math.min(1, t / 0.5), 3);
        if (t < 0.5) { wave.p0 = 0.12 + 0.88 * f1; G.disc(x, y, z, rad * 2.0, 2, GOLD, 1 - f1 * 0.7, wave); }
        if (t < 0.32) { const f2 = 1 - Math.pow(1 - t / 0.32, 3); wave2.p0 = 0.1 + 0.9 * f2; G.disc(x, y, z, rad * 1.25, 2, HOT, 1 - f2 * 0.6, wave2); }
        G.disc(x, y, z, rad * 1.1, 3, AMB, Math.min(1, (1 - k) * 1.6), glowD);
        // pixel motes spiralling up the shell
        const n = c.n(50 * dt) * (t < 0.7 ? 1 : 0);
        for (let i = 0; i < n; i++) { const an = Math.random() * TAU, rw = rad * (0.2 + 0.45 * Math.random()); P.spawn(c.pix(pal, { x: x + Math.cos(an) * rw, y: y + Math.sin(an) * rw, z: z + Math.random() * 60, life: [0.4, 0.9], px: [1.2, 2.6], speed: 0, vel: [-Math.sin(an) * rw * 3, Math.cos(an) * rw * 3, 0], up: [900, 1900], drag: 0.4, settle: false })); }
      });
      P.burst(c.pix(pal, { x, y, z: z + 6, count: 60, shape: 'ring', radius: rad * 0.7, speed: [80, 300], up: [200, 520], gravity: -620, linger: [0.8, 2.0], px: [1, 2.4] }));
      c.flash(x, y, z + 80, pal, rad * 0.3, 0.14);
      c.ring(x, y, z, pal, { R: rad * 1.8, life: [0.4, 0.7] });
      c.embers(x, y, z + 40, pal, { count: 20, speed: [200, 650] });
      c.smoke(x, y, z + 20, { count: 8 }, PAL.smoke);
      c.glow(x, y, z + 120, pal.lt, rad * 4.5, 1.4, 0.9, { elem: 'E' });   // lights + shadows the surroundings
      c.decal(x, y, 'decal_scorch', rad / 80, 6, { tint: [1.2, 0.8, 0.35], emit: 0.8, fadeOut: 0.6 });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- forge spirit (n, dur, r)
  R.spell('invoker_forge_spirit', (ev, su) => {
    if (!su) return;
    const n = ev.n || 2, rr = ev.r || 80, pal = PAL.fire, f = su.facing || 0;
    c.flash(su.x, su.y, c.chest(su), pal, 70, 0.3);
    c.ring(su.x, su.y, su.z || 0, pal, { R: rr + 70 });
    for (let i = 0; i < n; i++) {
      const a = f + TAU * i / n, x = su.x + Math.cos(a) * rr, y = su.y + Math.sin(a) * rr, z = c.zAt(x, y);
      c.pillar(x, y, z, pal, { count: 70, radius: 22, up: [400, 1200] });
      c.embers(x, y, z + 30, pal, { count: 20 });
      c.ringDecal(x, y, 60, 0.9, [3, 1.4, 0.4], { emit: 1.4, spin: 3, fadeOut: 0.5 });
      c.glow(x, y, z + 60, pal.lt, 320, 2, 0.7, { elem: 'E' });
      c.smoke(x, y, z + 20, { count: 6 });
    }
  });

  // ---------------------------------------------------------------------------------------------------------------- chaos meteor
  R.spell('invoker_chaos_meteor', (ev, su) => {
    const x = ev.x, y = ev.y; if (x == null) return;
    const x2 = ev.x2 != null ? ev.x2 : x, y2 = ev.y2 != null ? ev.y2 : y;
    const rad = ev.r || 275, land = ev.land || 1.3, roll = ev.roll || 1.8, pal = PAL.fire;
    const len = Math.hypot(x2 - x, y2 - y) || 1, cs = (x2 - x) / len, sn = (y2 - y) / len;
    const z0 = c.zAt(x, y), sx = x - cs * 650, sy = y - sn * 650, sz = z0 + 1500;
    // landing telegraph
    c.ringDecal(x, y, rad, land + 0.1, [3, 1.2, 0.3], { emit: 1.4, pulse: 0.25, pulseHz: 11, fadeOut: 0.05 });
    const lt = c.glow(x, y, z0 + 60, pal.lt, rad * 2, 0.4, land, { mode: 'flat', elem: 'E' });
    // falling ball
    c.run(land, (r, dt) => {
      const k = r.k * r.k * 0.35 + r.k * 0.65, px = sx + (x - sx) * k, py = sy + (y - sy) * k, pz = sz + (z0 + 40 - sz) * k;
      lt.int = 0.4 + 2 * r.k;
      const fr = fireFrames[(r.t * 14 | 0) % fireFrames.length];
      const dx = x - sx, dy = y - sy, dz = z0 - sz;
      if (fr) Q.put(px, py, pz, fr, 3.2 + r.k * 1.4, 1.8, 1.3, 1.0, 1, 3, dx, dy, dz, 0, false, 1.3);
      c.lightNow(px, py, pz, pal.lt, 520, 1.5, 0);
      const n = c.n(650 * dt);
      for (let i = 0; i < n; i++) P.spawn(c.pix(pal, { x: px + rnd(-30, 30), y: py + rnd(-30, 30), z: pz + rnd(-26, 26), life: [0.5, 1.0], px: [0.8, 2.4], speed: [0, 90], vel: [-dx * 0.08, -dy * 0.08, -dz * 0.08], gravity: -420, drag: 0.8, linger: [0.6, 1.6] }));
      if (r.t > 0.3) P.spawn({ x: px, y: py, z: pz, life: 0.06, size0: 50, size1: 44, col0: pal.mid, col1: pal.mid, a0: 0.3, a1: 0.2, mode: 'glow', speed: 0, noScale: true });
    });
    // impact then roll
    c.later(land, () => {
      c.flash(x, y, z0 + 60, PAL.sun, rad * 0.9, 0.4);
      c.ring(x, y, z0, pal, { R: rad * 1.5, life: [0.45, 0.7] });
      c.pillar(x, y, z0, pal, { count: 160, radius: rad * 0.4, up: [500, 1700] });
      c.embers(x, y, z0 + 40, pal, { count: 70, speed: [200, 700] });
      c.smoke(x, y, z0 + 30, { count: 22, radius: rad * 0.4, size0: [50, 80], size1: [110, 160] });
      c.dust(x, y, z0, { count: 30, speed: [100, 380] });
      c.glow(x, y, z0 + 90, pal.lt, rad * 4, 3.4, 0.8, { elem: 'E' });
      c.decal(x, y, 'decal_scorch', rad / 90, 7, { tint: [1.2, 0.7, 0.3], emit: 0.8, fadeOut: 0.6 });
      let lastDecal = 0;
      c.run(roll, (r, dt) => {
        const k = r.k, px = x + (x2 - x) * k, py = y + (y2 - y) * k, pz = c.zAt(px, py) + 60;
        const fr = fireFrames[(r.t * 16 | 0) % fireFrames.length];
        if (fr) Q.put(px, py, pz, fr, 3.6, 1.8, 1.2, 0.8, 1, 3, cs, sn, 0, r.t * 6, false, 1.3);
        c.lightNow(px, py, pz + 20, pal.lt, 540, 1.7 * (0.75 + 0.25 * Math.sin(c.T * 25)), 0);
        const n = c.n(500 * dt);
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU; P.spawn(c.pix(pal, { x: px + Math.cos(a) * rad * 0.3 * Math.random(), y: py + Math.sin(a) * rad * 0.3 * Math.random(), z: pz + rnd(-40, 60), life: [0.4, 0.9], speed: [0, 60], up: [60, 200], drag: 1.4, settle: false })); }
        const m = c.n(260 * dt);
        for (let i = 0; i < m; i++) P.spawn(c.pix(pal, { x: px + rnd(-50, 50), y: py + rnd(-50, 50), z: pz, life: [0.7, 1.4], px: [0.8, 2.4], speed: [20, 140], up: [100, 340], gravity: -480, drag: 0.9, linger: [0.6, 1.6] }));
        if (r.t - lastDecal > 0.25) { lastDecal = r.t; c.decal(px, py, 'decal_scorch', rad / 140, 4, { tint: [1.1, 0.6, 0.25], emit: 0.7, fadeOut: 0.7 }); }
        P.spawn({ x: px, y: py, z: pz, life: 0.06, size0: 56, size1: 50, col0: pal.mid, col1: pal.mid, a0: 0.28, a1: 0.2, mode: 'glow', speed: 0, noScale: true });
      });
      c.later(roll, () => {
        const ez = c.zAt(x2, y2);
        c.flash(x2, y2, ez + 50, pal, rad * 0.6, 0.3);
        c.ring(x2, y2, ez, pal, { R: rad * 1.1 });
        c.embers(x2, y2, ez + 40, pal, { count: 30 });
        c.smoke(x2, y2, ez + 30, { count: 14 });
      });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- deafening blast: expanding multi-element wave
  R.spell('invoker_deafening_blast', (ev, su) => {
    if (su) {
      blastDims.set(su.id, { r0: ev.r0 || 175, r1: ev.r || 225 });
      const z = c.chest(su);
      c.flash(su.x, su.y, z, PAL.steel, 80, 0.3);
      for (const [pl, o] of [[PAL.ice, 0], [PAL.arc, 1], [PAL.fire, 2]]) c.ring(su.x, su.y, su.z || 0, pl, { R: 100 + o * 30, life: [0.3 + o * 0.08, 0.5 + o * 0.08] });
      c.glow(su.x, su.y, z, PAL.steel.lt, 380, 1.6, 0.5);
    }
  });
  const BLAST_PALS = [PAL.ice, PAL.arc, PAL.fire];
  R.proj('invoker_deafening_blast', {
    frames: null, sp: 1100, z: 70, pal: PAL.arc,
    light: { col: PAL.steel.lt, radius: 420, int: 1.2 },
    trail(cc, p, dt) {
      const ev = p.data || {}, d = blastDims.get(p.sid) || { r0: 175, r1: 225 };
      const k = Math.min(1, Math.hypot(p.x - (ev.x != null ? ev.x : p.x), p.y - (ev.y != null ? ev.y : p.y)) / p.d0);
      const w = d.r0 + (d.r1 - d.r0) * k;
      const px = -p.dy, py = p.dx;
      const n = cc.n(600 * dt);
      for (let i = 0; i < n; i++) {
        const s = rnd(-1, 1), back = (1 - s * s) * 0 + s * s * w * 0.55;    // crescent: tips trail behind the centre
        const pl = BLAST_PALS[(Math.random() * 3) | 0];
        P.spawn(cc.pix(pl, { x: p.x + px * s * w - p.dx * back, y: p.y + py * s * w - p.dy * back, z: p.z + rnd(-20, 40), life: [0.3, 0.6],
          vel: [p.dx * 90, p.dy * 90, 0], speed: 0, up: [0, 30], drag: 1.6, settle: false }));
      }
      for (let r = 1; r <= 2; r++) {   // trailing echo arcs
        const m = cc.n(180 * dt);
        for (let i = 0; i < m; i++) { const s = rnd(-1, 1), back = s * s * w * 0.55 + r * 70; const pl = BLAST_PALS[(Math.random() * 3) | 0]; P.spawn(cc.pix(pl, { x: p.x + px * s * w * (1 + 0.05 * r) - p.dx * back, y: p.y + py * s * w * (1 + 0.05 * r) - p.dy * back, z: p.z, life: [0.2, 0.4], speed: 0, settle: false, rampTint: [0.7, 0.7, 0.7] })); }
      }
    },
    hit(cc, p) { for (const pl of BLAST_PALS) cc.ring(p.x, p.y, cc.zAt(p.x, p.y), pl, { R: 140 }); cc.flash(p.x, p.y, p.z, PAL.steel, 60, 0.2); },
  });
}
