// Invoker: orb casts, Invoke, and the ten invoked spells. Quas = cyan (steady), Wex = violet (strobing), Exort = orange (flickering).
// Orb orbiting visuals live in status.js (they follow the u.orbs string).
// Every spell = real 3D geometry (fx/geo3d.js: tubes, discs, bolts, orbs, shards, rock) + crisp 1-2 art px particles. Colours: one block (INV)
// taken from the Dota 2 particle definitions (offline reference); shells stay below the 1.4 bloom threshold, only small cores bloom.
// Lights: c.glow / c.lightNow kept moderate (c.glow already x0.6): subtle bloom, never a whiteout.
import { EV } from '../../../../shared/protocol.js';
import { PAL, ORB, rnd, pick, TAU, elemMul } from './common.js';
import { LEAN_TO, LEAN_K } from '../voxactors.js';

const ELEM_PAL = { Q: PAL.ice, W: PAL.arc, E: PAL.fire };
const COLD = [0.7, 1.6, 2.6];
const INV = {
  Q: [0.12, 0.42, 0.9], Qc: [0.9, 1.7, 2.3], Qd: [0.05, 0.17, 0.36],   // quas orb / cold snap fleks [42,97,200]..[137,188,224]
  W: [0.5, 0.26, 0.58], Wc: [1.9, 0.95, 2.1], Wd: [0.24, 0.12, 0.28],  // wex / emp rings [160,101,166]
  E: [0.9, 0.38, 0.07], Ec: [2.3, 1.25, 0.35], Ed: [0.5, 0.2, 0.04],   // exort / fire
  teal: [0.28, 0.6, 0.55], tealD: [0.11, 0.24, 0.22],                   // ghost walk ring [112,200,187] / sphere [144,110,233]
  zap: [0.62, 0.17, 0.32], zapC: [1.9, 0.8, 1.35],                      // emp lightning ropes [228,70,122]
  dust: [0.52, 0.47, 0.4], dustD: [0.3, 0.27, 0.24], dustLt: [0.62, 0.7, 0.87],   // tornado funnel [178,173,160] / [99,107,124], trail glow [158,179,222]
  blast: [0.3, 0.44, 0.64], body: [0.42, 0.6, 0.98], edge: [1.25, 0.62, 0.12],                     // deafening blast body [65,93,130]/[89,128,179] (alpha over; body = additive echo / light), edge [255,120,0]
  altV: [0.84, 0.53, 0.87], altO: [0.95, 0.57, 0.29], altLt: [0.9, 0.45, 0.4],  // alacrity trails [214,136,222] + [241,145,74]
  crys: [0.81, 0.94, 1.0], crysL: [0.89, 0.99, 1.0],                     // ice wall crystal CFEFFF / E2FCFF
  heat: [0.9, 0.45, 0.18], heatD: [0.3, 0.12, 0.05],                    // cold snap trail_pull / heat [105,52,23] [123,88,67]
  gold: [0.6, 0.34, 0.1],
};
// single-hue pixel palettes (no ramp: the shared arcane / fire ramps run through near-white / peach at the hot end)
const VIO = { hot: [1.3, 0.62, 1.5], mid: [0.85, 0.4, 1.0], low: [0.45, 0.2, 0.55], dim: [0.18, 0.07, 0.22], lt: [0.66, 0.36, 1], ramp: null };
const EMB = { hot: [1.3, 0.45, 0.08], mid: [1.0, 0.4, 0.08], low: [0.5, 0.16, 0.03], dim: [0.2, 0.06, 0.01], lt: [1, 0.55, 0.18], ramp: null };
const FROST = { hot: [0.7, 1.15, 1.5], mid: [0.4, 0.8, 1.2], low: [0.15, 0.4, 0.8], dim: [0.06, 0.16, 0.35], lt: [0.35, 0.72, 1], ramp: null };
const ELEM = { Q: INV.Q, W: INV.W, E: INV.E }, ELEMC = { Q: INV.Qc, W: INV.Wc, E: INV.Ec };

export function register(c, R) {
  const P = c.P, Q = c.Q;
  const fShard = c.frame('p_shard_ice'), fBall = c.frame('fireball'), fBall1 = c.frame('fireball_1'), fBall2 = c.frame('fireball_2');
  const fireFrames = [fBall, fBall1, fBall2].filter(Boolean);
  const blastDims = new Map();   // source id -> {r0, r1}

  // a point h above u's feet on the voxel lean (voxactors.js: the body tilts back about its feet, away from the camera, from LEAN_TO up),
  // plus the foot pull that keeps geometry there in front of / behind him like his own foot card (see geo3d foot). Shared result object.
  const _b = { x: 0, y: 0, z: 0, pull: 20 };
  function bodyAt(u, h) {
    const z0 = u.z || 0, cp = c.uniforms && c.uniforms.uCamPos ? c.uniforms.uCamPos.value : null;
    let s = 0, co = 1, vx = 0, vy = -1;
    if (cp) {
      const dx = cp.x - u.x, dy = -cp.z - u.y, l = Math.hypot(dx, dy);
      if (l > 1) { vx = dx / l; vy = dy / l; }
      const th = Math.max(0, Math.atan2(cp.y - z0, l) - LEAN_TO) * LEAN_K; s = Math.sin(th); co = Math.cos(th);
    }
    _b.x = u.x - vx * h * s; _b.y = u.y - vy * h * s; _b.z = z0 + h * co; _b.pull = 20 + h * s;
    return _b;
  }

  // ---------------------------------------------------------------------------------------------------------------- orbs + invoke
  // [file: invoker_orb_spawn.vpcf_c] a small burst where the orb appears; here a ground shock ring in the element colour + a few sparks
  const orbCast = (ch) => (ev, su) => {
    if (!su) return;
    const o = ORB[ch], pal = o.pal, z = c.chest(su), id = su.id, col = ELEM[ch], G = c.G;
    const sh = { n: 14, seed: Math.random() * 40, p0: 0, p1: 0.22, p2: 0.25 };
    c.sparks(su.x, su.y, z, pal, { count: 6, speed: [60, 180] });
    c.glow(su.x, su.y, z, o.lt, 220, 0.8, 0.3, { elem: ch });
    c.run(0.32, (r) => {
      const u = c.unit(id) || su, e = 1 - (1 - r.k) * (1 - r.k);
      sh.p0 = 0.2 + 0.8 * e; G.disc(u.x, u.y, u.z || 0, 95, 2, col, 1 - r.k, sh);
    });
  };
  R.spell('invoker_quas', orbCast('Q'));
  R.spell('invoker_wex', orbCast('W'));
  R.spell('invoker_exort', orbCast('E'));
  R.spell('invoker_invoke', () => {});   // EV.INVOKE carries the visual
  R.on(EV.INVOKE, (ev, su) => invokeFx(su, ev.k));

  // Invoke: the three orbs spiral into his hands over a turning gold sigil, then a column braided from the three element colours
  // (three swirl tubes, bands interleaved by phase) rises round him with a ground shock ring
  function invokeFx(su) {
    if (!su || !c.vis(su.x, su.y)) return;
    const orbs = su.orbs || 'QWE', id = su.id, G = c.G;
    const ch3 = [0, 1, 2].map((i) => (orbs[i] || 'Q').toUpperCase());
    const tg = { n: 12, seed: Math.random() * 50, p0: 0, p1: 0.18, p2: 0.8 };
    const oSh = { p2: 0.45, foot: 0, footPull: 20 }, oCo = { p2: 1, foot: 0, footPull: 20 };
    const col = [0, 1, 2].map(() => ({ sweep: TAU / 3 - 0.25, start: 0, edge: 0.3, swirl: 1, pow: 0.1, flare: 1, top: 0.6, phase: 0, foot: 0, footPull: 20 }));
    const sh = { n: 18, seed: Math.random() * 40, p0: 0, p1: 0.18, p2: 0.3 };
    c.run(0.85, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const t = r.t, z0 = u.z || 0;
      const a = Math.min(1, t / 0.08) * Math.max(0, Math.min(1, (0.85 - t) / 0.3));
      tg.p0 = c.T * 4; G.disc(u.x, u.y, z0, 100, 1, INV.gold, a * 0.75, tg);
      if (t < 0.4) {
        const k = t / 0.4, e = k * k, b = bodyAt(u, c.chest(u) - z0 + 8 + 16 * e), bx = b.x, by = b.y, bz = b.z;
        oSh.foot = oCo.foot = z0; oSh.footPull = oCo.footPull = b.pull;
        for (let i = 0; i < 3; i++) {
          const ch = ch3[i], an = c.T * 2 + k * 6 + i * (TAU / 3), rr = 66 * (1 - e) + 4;
          const ox = bx + Math.cos(an) * rr, oy = by + Math.sin(an) * rr;
          G.orb(ox, oy, bz, 5, ELEMC[ch] || INV.Qc, 1, G.GLOW, oCo);
          G.orb(ox, oy, bz, 10, ELEM[ch] || INV.Q, 1, G.GLOW, oSh);
          if (Math.random() < 0.7) P.spawn(c.pix(ELEM_PAL[ch] || PAL.ice, { x: ox, y: oy, z: bz, ramp: null, col0: ELEMC[ch], col1: ELEM[ch], life: [0.12, 0.25], px: 1, speed: [0, 20], settle: false }));
        }
      } else {
        const k = Math.min(1, (t - 0.4) / 0.45), up = 1 - Math.pow(1 - Math.min(1, k * 3), 3), fade = 1 - k * k;
        for (let i = 0; i < 3; i++) {
          const o = col[i]; o.start = c.T * 5 + i * (TAU / 3); o.phase = c.T * 9; o.foot = z0;
          G.tube(u.x, u.y, z0, 260 * up, 44, 36, ELEM[ch3[i]] || INV.Q, fade * 0.6, o);
        }
        if (t < 0.75) { const f = (t - 0.4) / 0.35; sh.p0 = 0.15 + 0.85 * (1 - (1 - f) * (1 - f)); G.disc(u.x, u.y, z0, 130, 2, INV.gold, (1 - f) * 0.75, sh); }
      }
    });
    c.later(0.4, () => {
      const u = c.unit(id) || su, zz = c.chest(u), cx = u.x, cy = u.y;
      for (let i = 0; i < 3; i++) {
        const pal = ELEM_PAL[ch3[i]] || PAL.ice;
        c.pillar(cx + rnd(-10, 10), cy + rnd(-10, 10), u.z || 0, pal, { count: 5, radius: 40, up: [300, 700] });
      }
      const dom = ch3[2];
      c.glow(cx, cy, zz, (ELEM_PAL[dom] || PAL.ice).lt, 300, 0.45, 0.5, { elem: dom });
    });
  }

  // ---------------------------------------------------------------------------------------------------------------- cold snap (t)
  // [file: invoker_cold_snap.vpcf_c] frost fleks [39,55,88]..[137,188,224] + smoke, ground_frost ring_wave scale .25 -> 10 (an expanding
  // ring), and a warm contrast: trail_pull / heat [105,52,23] [123,88,67]. Here: a pooled ice bolt from the caster, ICE shards bursting out
  // of the ground round the victim's feet, an expanding frost shock ring, a frost fill under him for the debuff, warm motes in the cold.
  const SNAP_ICE = [0.3, 0.6, 0.95], SNAP_FR = [0.08, 0.26, 0.52];
  R.spell('invoker_cold_snap', (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    const pal = PAL.ice, id = t.id, sid = su && su.id, dur = Math.min(ev.dur || 5, 8), G = c.G, lo = G.lod === 0;
    const x = t.x, y = t.y, z = t.z || 0;
    if (su && tu && su !== tu) {
      const b = G.newBolt();
      if (b) c.run(0.3, (r) => {
        const s = c.unit(sid) || su, v = c.unit(id) || t;
        b.roll(c.T, 0.05, s.x, s.y, c.chest(s), v.x, v.y, c.chest(v), { depth: 4, branches: 2, branchLen: 0.12 });
        G.bolt(b, INV.Q, 3, INV.Qc, 1, 1 - r.k * r.k);
      }, () => G.free(b));
      c.glow((su.x + x) / 2, (su.y + y) / 2, c.chest(t), pal.lt, 300, 0.5, 0.3, { mode: 'fade' });
    }
    c.shards(x, y, z + 50, FROST, { count: 5 });
    c.pillar(x, y, z, FROST, { count: 14, radius: 40, up: [400, 1000] });
    c.glow(x, y, z + 80, pal.lt, 260, 0.45, Math.min(dur, 3), { follow: id, dz: 70, elem: 'Q', mode: 'flat' });
    // ICE shards: punch up round the feet leaning out, hold, sink back
    const NS = lo ? 5 : 8, sa = new Float32Array(NS), sr = new Float32Array(NS), sL = new Float32Array(NS), sp = new Float32Array(NS), sd = new Float32Array(NS);
    for (let i = 0; i < NS; i++) { sa[i] = (i + rnd(-0.3, 0.3)) / NS * TAU; sr[i] = rnd(18, 34); sL[i] = rnd(46, 78); sp[i] = rnd(0.45, 0.85); sd[i] = rnd(0, 0.06); }
    const os = { lump: 0.1, seed: 0, p1: 0.3, foot: 0, footPull: 20 }, wave = { n: 20, seed: Math.random() * 30, p0: 0, p1: 0.16, p2: 0.4 };
    const fr = { p0: 0, p1: 1.4, p2: 0.55, p3: 0.5, rin: 0.6, n: 6, seed: Math.random() * 20 };
    c.run(1.0, (r) => {
      const u = c.unit(id) || t, ux = u.x, uy = u.y, z0 = u.z || 0, tt = r.t;
      os.foot = z0;
      for (let i = 0; i < NS; i++) {
        const q = (tt - sd[i]) / 0.12; if (q <= 0) continue;
        const e = q >= 1 ? 1 : 1 - Math.pow(1 - q, 3), sink = Math.max(0, (tt - 0.65) / 0.35), L = sL[i];
        os.seed = i * 3.7;
        G.shard(ux + Math.cos(sa[i]) * sr[i], uy + Math.sin(sa[i]) * sr[i], z0 - L * (0.75 - 0.6 * e + 0.8 * sink), L, L * 0.24, sa[i], sp[i], i, SNAP_ICE, 1 - sink * 0.5, G.ICE, os);
      }
      if (tt < 0.45) { const f = tt / 0.45; wave.p0 = 0.12 + 0.88 * (1 - (1 - f) * (1 - f)); G.disc(ux, uy, z0, 170, 2, INV.Q, 1 - f, wave); }
    });
    // debuff: frost fill under the victim + re-freeze motes, a few warm ones in the cold (Dota's heat contrast)
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const z0 = u.z || 0, a = Math.min(1, r.t / 0.15, (dur - r.t) / 0.4);
      fr.p0 = c.T * 0.15; G.disc(u.x, u.y, z0, 70, 3, SNAP_FR, a, fr);
      const n = c.n(50 * dt);
      for (let i = 0; i < n; i++) {
        const warm = Math.random() < 0.2;
        P.spawn(c.pix(pal, { x: u.x + rnd(-18, 18), y: u.y + rnd(-12, 12), z: z0 + rnd(10, 120), life: [0.5, 1], speed: [0, 30], up: [-10, 14], gravity: -90, linger: [0.4, 1.0],
          ...(warm ? { ramp: null, col0: INV.heat, col1: INV.heatD, px: 1 } : null) }));
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- ghost walk (self, r, dur)
  // [file: invoker_ghost_walk.vpcf_c] frost_add projected r 128 (scale 2 -> .5), ring r 200 (flare, scale -> .6), a sphere model scale
  // 5 -> 0 collapsing onto him, violet [144,110,233] + teal [112,200,187] debris / flashes, frost smoke. Here: a violet GLOW sphere that
  // collapses onto him, a teal ring shrinking in, then a faint frost fill at his feet and the slow-aura edge while he walks.
  R.spell('invoker_ghost_walk', (ev, su) => {
    if (!su) return;
    const id = su.id, pal = PAL.ice, dur = ev.dur || 6, rad = ev.r || 400, G = c.G;
    c.sparks(su.x, su.y, c.chest(su), VIO, { count: 4, speed: [40, 160] });
    c.glow(su.x, su.y, c.chest(su), PAL.arc.lt, 260, 0.4, 0.4, { elem: 'W' });
    const sph = { p2: 0.35, lump: 0.08, seed: 0, foot: 0, footPull: 20 }, rg = { rin: 0.88, p1: 1.6, p2: 0.8 }, GW_RING = [0.26, 0.4, 0.9];   // teal-blue: added over grass a greener teal reads lime
    const fr = { p0: 0, p1: 1.2, p2: 0.6, p3: 0.4, rin: 0.6, n: 7, seed: Math.random() * 20 }, aura = { rin: 0.965, p1: 0, p2: 0.5 };
    c.run(0.42, (r) => {
      const u = c.unit(id) || su, k = r.k, z0 = u.z || 0, b = bodyAt(u, c.chest(u) - z0), R0 = 110 * Math.pow(1 - k, 1.5) + 6;
      sph.foot = z0; sph.footPull = b.pull + R0 * 0.6; sph.seed = (c.T * 20) | 0;
      G.orb(b.x, b.y, b.z, R0, INV.W, 1 - k * k, G.GLOW, sph);
      G.disc(u.x, u.y, z0, 200 * (1 - 0.4 * k), 0, GW_RING, (1 - k) * 0.6, rg);
    });
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const z0 = u.z || 0, a = Math.min(1, r.t / 0.25, (dur - r.t) / 0.3);
      fr.p0 = c.T * 0.2; G.disc(u.x, u.y, z0, 90, 3, INV.Qd, a * 0.8, fr);
      G.disc(u.x, u.y, z0, rad, 0, INV.tealD, a * 0.6, aura);
      const n = c.n(40 * dt);
      for (let i = 0; i < n; i++) {
        const an = Math.random() * TAU, rr = rad * Math.sqrt(Math.random());
        P.spawn(c.pix(pal, { x: u.x + Math.cos(an) * rr, y: u.y + Math.sin(an) * rr, z: z0 + 6, life: [0.7, 1.4], speed: 0, up: [40, 120], settle: false, rampTint: [0.7, 0.7, 0.7] }));
      }
      c.lightNow(u.x, u.y, z0 + 80, pal.lt, 240, 0.45, 0);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- ice wall (x,y)-(x2,y2), r = half width, dur
  // [file: particles/units/heroes/hero_invoker/invoker_ice_wall.vpcf_c] a row of up to 48 metaball ice blobs (<= 42 apart, render r 25-55)
  // hugging the ground along the wall, 15 icicle models every 58 units erupting 64-256 up (v +400, drag .7, scale x3.2-4, random yaw + roll)
  // over 0.3 s, glow flares r 160-240, 16 snow decals. Here: ICE orbs (lumpy, squashed) + leaning ICE shards that punch up out of the ground.
  const ICE_BLOB = INV.crys.map((v) => v * 0.42), ICE_SPIKE = INV.crysL.map((v) => v * 0.62);
  R.spell('invoker_ice_wall', (ev) => {
    const x0 = ev.x, y0 = ev.y, x1 = ev.x2, y1 = ev.y2; if (x0 == null || x1 == null) return;
    const G = c.G, lo = G.lod === 0;
    const dur = ev.dur || 6, len = Math.hypot(x1 - x0, y1 - y0) || 1, hw = ev.r || 60;
    const pal = PAL.ice, dx = (x1 - x0) / len, dy = (y1 - y0) / len, nx = -dy, ny = dx, yawW = Math.atan2(dy, dx);
    // budget: <= 24 blobs + 12 spikes per wall (two walls fit MAX_ORBS 64 / MAX_SHARDS 96); low: about half
    const NB = Math.round(Math.min(24, Math.max(6, len / 42)) * (lo ? 0.5 : 1)), NS = Math.round(Math.min(12, Math.max(4, len / 58)) * (lo ? 0.6 : 1));
    const bx = new Float32Array(NB), by = new Float32Array(NB), bz = new Float32Array(NB), bR = new Float32Array(NB), bS = new Float32Array(NB);
    for (let i = 0; i < NB; i++) {
      const k = (i + 0.5 + rnd(-0.3, 0.3)) / NB, off = rnd(-0.45, 0.45) * hw;
      bx[i] = x0 + (x1 - x0) * k + nx * off; by[i] = y0 + (y1 - y0) * k + ny * off; bz[i] = c.zAt(bx[i], by[i]); bR[i] = rnd(25, 55); bS[i] = rnd(0, 99);
    }
    const sx = new Float32Array(NS), sy = new Float32Array(NS), sz = new Float32Array(NS), sL = new Float32Array(NS), sW = new Float32Array(NS);
    const sYaw = new Float32Array(NS), sPit = new Float32Array(NS), sRol = new Float32Array(NS), sDel = new Float32Array(NS);
    for (let i = 0; i < NS; i++) {
      const k = (i + 0.5 + rnd(-0.25, 0.25)) / NS, off = rnd(-0.35, 0.35) * hw;
      sx[i] = x0 + (x1 - x0) * k + nx * off; sy[i] = y0 + (y1 - y0) * k + ny * off; sz[i] = c.zAt(sx[i], sy[i]);
      sL[i] = rnd(110, 175); sW[i] = rnd(22, 34);
      sYaw[i] = yawW + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + rnd(-0.9, 0.9);   // lean out of the wall, either side
      sPit[i] = rnd(0.12, 0.6); sRol[i] = rnd(0, TAU); sDel[i] = Math.abs(k - 0.5) * 0.18 + rnd(0, 0.05);   // erupts from the middle out
    }
    const ob = { sx: 1.25, sy: 0.7, sz: 1, yaw: 0, lump: 0.28, seed: 0, p1: 0.12 }, os = { lump: 0.1, seed: 0, p1: 0.3 };
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = c.zAt(mx, my);
    // eruption
    P.burst(c.pix(FROST, { x: x0, y: y0, z: c.zAt(x0, y0) + 6, x2: x1, y2: y1, z2: c.zAt(x1, y1) + 6, shape: 'line', count: Math.round(len / 8), life: [0.5, 1.0], speed: [0, 60], up: [200, 500], gravity: -620, drag: 1.2, linger: [0.3, 0.8] }));
    c.glow(mx, my, mz + 80, pal.lt, Math.min(500, len * 0.6), 0.3, dur, { mode: 'flat', elem: 'Q' });
    for (let i = 0; i < 4; i++) { const k = (i + 0.5) / 4; c.decal(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 'decal_frost', len / 4 / 100, dur, { tint: COLD, emit: 0.35, fadeOut: 0.25, roll: yawW }); }
    c.run(dur, (r, dt) => {
      const t = r.t, out = Math.max(0, Math.min(1, (dur - t) / 0.6));   // last 0.6 s: everything sinks back into the ground
      // cold mist drifting off the whole width (not a bright centre line)
      for (let n = c.n(len * 0.04 * dt); n > 0; n--) {
        const k = Math.random(), off = rnd(-1.3, 1.3) * hw, px = x0 + (x1 - x0) * k + nx * off, py = y0 + (y1 - y0) * k + ny * off;
        P.spawn(c.pix(FROST, { x: px, y: py, z: c.zAt(px, py) + rnd(4, 60), col0: FROST.low, px: 1, life: [0.6, 1.2], up: [6, 30], speed: [0, 8], settle: false }));
      }
      for (let i = 0; i < NB; i++) {
        const g = Math.min(1, Math.max(0, (t - Math.abs((i + 0.5) / NB - 0.5) * 0.2) / 0.15));
        if (g <= 0) continue;
        const R0 = bR[i] * (0.4 + 0.6 * g) * (0.5 + 0.5 * out);
        ob.yaw = yawW + bS[i]; ob.seed = bS[i];
        G.orb(bx[i], by[i], bz[i] + R0 * 0.25 - (1 - out) * R0, R0, ICE_BLOB, out, G.ICE, ob);
      }
      for (let i = 0; i < NS; i++) {
        const u = (t - sDel[i]) / 0.22; if (u <= 0) continue;
        const e = u >= 1 ? 1 : 1 - Math.pow(1 - u, 3) * (1 - 0.6 * Math.sin(u * Math.PI));   // ease out with a little overshoot
        const L = sL[i], up = -0.85 + 0.75 * Math.min(1.08, e) - (1 - out) * 0.9;           // base sits 10% below the ground when settled
        os.seed = i * 3.7;
        G.shard(sx[i], sy[i], sz[i] + L * up, L, sW[i], sYaw[i], sPit[i], sRol[i], ICE_SPIKE, out, G.ICE, os);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- EMP (x,y,r,dur = delay)
  // [file: invoker_emp.vpcf_c] charge: a sphere model (r 7, grows) in [160,101,166], charge_ground rings, thick lightning ropes [228,70,122]
  // between the charge and the ground, a deferred light [79,19,85]..[103,33,110]; explode: ring ropes r 256-300 racing out, bloom rings,
  // radial electricity, a glow [242,207,245] (near white: kept low here). Here: ground RING + turning TARGET disc, a growing GLOW sphere
  // with an HDR core, pooled bolts crackling sphere -> ground; the pop = SHOCK disc + a low rope band racing out + radial bolts.
  const EMP_V = [0.62, 0.3, 0.7], EMP_O = [0.8, 0.4, 0.95];
  R.spell('invoker_emp', (ev, su) => {
    const x = ev.x, y = ev.y; if (x == null) return;
    const rad = ev.r || 675, dur = ev.dur || 2.9, z = c.zAt(x, y), pal = VIO, G = c.G, lo = G.lod === 0;
    const gs = G.groundSpan(c.zAt, x, y, rad), gz = gs.z;                      // the wide discs sit at the mid ground height, depth pulled over the bumps
    const tg = { n: 16, seed: Math.random() * 50, p0: 0, p1: 0.12, p2: 0, pull: gs.pull }, rg = { rin: 0.93, p1: 1.4, p2: 0.8, pull: gs.pull };
    const sph = { p2: 0.7, lump: 0.12, seed: 0 }, cor = { p2: 1, lump: 0.2, seed: 0 };
    const bolts = []; for (let i = 0; i < (lo ? 1 : 3); i++) { const b = G.newBolt(); if (b) bolts.push(b); }
    const lt = c.glow(x, y, z + 70, pal.lt, rad * 0.8, 0.5, dur, { mode: 'flat', elem: 'W' });
    const HZ = 90;
    c.run(dur, (r, dt) => {
      const k = r.k, a = Math.min(1, r.t / 0.15), w = elemMul('W', c.T, 3);
      lt.int = 0.4 + 0.5 * k;
      G.disc(x, y, gz, rad, 0, EMP_V, a * (0.6 + 0.12 * Math.sin(c.T * 14)), rg);
      tg.p0 = -c.T * 0.6; tg.p1 = 0.08 + 0.2 * k; G.disc(x, y, gz, rad * 0.66, 1, INV.Wd, a, tg);
      const R0 = 30 + 60 * Math.sqrt(k);                                     // a clear violet orb ~90 at the pop
      sph.seed = (c.T * 20) | 0; cor.seed = sph.seed + 3;
      G.orb(x, y, z + HZ, R0, EMP_O, a * (w > 1 ? 1 : 0.8), G.GLOW, sph);
      G.orb(x, y, z + HZ, R0 * 0.3, INV.Wc, a * 0.8, G.GLOW, cor);
      for (let i = 0; i < bolts.length; i++) {
        if (i > k * bolts.length * 1.3) break;                                   // more arcs as the fuse burns
        const b = bolts[i];
        if (c.T - b.last >= 0.07) { const an = rnd(0, TAU), d = rnd(R0, rad * 0.45), ex = x + Math.cos(an) * d, ey = y + Math.sin(an) * d; b.roll(c.T, 0.07, x, y, z + HZ, ex, ey, c.zAt(ex, ey) + 4, { depth: 3, branches: 1 }); }
        G.bolt(b, INV.zap, 3, INV.zapC, 1, 0.9);
      }
      // violet motes on the rim fall inward and tick up faster as the fuse burns down
      const n = c.n((60 + 160 * k) * dt);
      for (let i = 0; i < n; i++) {
        const an = Math.random() * TAU, rr = rad * rnd(0.82, 1.0);
        P.spawn(c.pix(pal, { x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr, z: gz + 6, life: [0.4, 0.8], vel: [-Math.cos(an) * rad * 0.7, -Math.sin(an) * rad * 0.7, 0], speed: 0, up: [60, 220], drag: 1.2, settle: false }));
      }
    }, () => { for (const b of bolts) G.free(b); });
    c.later(dur, () => {
      const wave = { n: 28, seed: Math.random() * 30, p0: 0, p1: 0.12, p2: 0.35, pull: gs.pull }, ringO = { pow: 0.8, top: 0.9, swirl: 0.4, phase: 0 }, pop = { p2: 0.15, lump: 0.15, seed: 3 };
      const xb = []; for (let i = 0; i < (lo ? 3 : 6); i++) { const b = G.newBolt(); if (b) xb.push(b); }
      c.run(0.6, (r) => {
        const t = r.t, f = Math.min(1, t / 0.45), e = 1 - Math.pow(1 - f, 3);
        if (t < 0.45) {
          wave.p0 = 0.08 + 0.92 * e; G.disc(x, y, gz, rad, 2, EMP_V, 1 - f * 0.8, wave);
          ringO.phase = c.T * 10; G.tube(x, y, gz - gs.pull + 10, 44 + 2 * gs.pull * (1 - 0.6 * e), 60 + (rad - 60) * e, 60 + (rad * 1.02 - 60) * e, INV.W, 1 - f * f, ringO);
        }
        if (t < 0.25) { const q = t / 0.25; G.orb(x, y, z + HZ, 90 + 90 * q, INV.W, (1 - q) * 0.8, G.GLOW, pop); }
        if (t < 0.22) for (const b of xb) {
          if (c.T - b.last >= 0.06) { const an = rnd(0, TAU), d = rnd(0.3, 0.95) * rad, ex = x + Math.cos(an) * d, ey = y + Math.sin(an) * d; b.roll(c.T, 0.06, x, y, z + HZ, ex, ey, c.zAt(ex, ey) + 4, { depth: 4, branches: 2 }); }
          G.bolt(b, INV.zap, 3, INV.zapC, 1, 1 - t / 0.22);
        }
      }, () => { for (const b of xb) G.free(b); });
      c.ring(x, y, gz, pal, { R: rad, life: [0.5, 0.8] });
      c.pillar(x, y, z, pal, { count: 24, radius: rad * 0.1, up: [600, 1800] });
      c.sparks(x, y, z + HZ, pal, { count: 12, speed: [200, 700] });
      c.glow(x, y, z + 100, pal.lt, rad * 1.2, 1.0, 0.5);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- tornado: PROJ funnel + cast
  // [file: invoker_tornado.vpcf_c] r 200; funnel smoke sprites [178,173,160] [99,107,124] [123,112,124] (scale .4 -> 4, rotating about the
  // axis), funnel_detail blade-fury swirl, trail glow [158,179,222] / [207,162,214], leaves + twigs, base swirl ring r 15 x3.2, dust trail.
  // Here: two counter-swirling cone tubes (dusty grey-violet shell, pale inner), crisp dust / light pixels spiralling up, a dust skirt.
  R.spell('invoker_tornado', (ev, su, tu) => {
    if (ev.sub === 'lift') return liftFx(ev, tu);
    if (!su) return;
    c.ring(su.x, su.y, su.z || 0, PAL.steel, { R: 100, count: 60 });
    c.swirl(su.id, 0.5, PAL.arc, { r: 30, rate: 30, speed: 8 });
  });
  const TOR = { swirl: 0.5, pow: 0.35, top: 0.8, phase: 0, foot: 0, footPull: 30, smoke: true }, TOR2 = { swirl: 0.8, pow: 0.6, top: 0.7, phase: 0, foot: 0, footPull: 30, smoke: true };
  const TOR_PX = [[0.95, 1, 1.25], [0.75, 0.62, 0.9], [0.55, 0.58, 0.68]], TOR_PX1 = [0.22, 0.22, 0.28];
  const funnel = (cc, p, dt) => {
    const G = cc.G, z0 = cc.zAt(p.x, p.y);
    TOR.phase = cc.T * 14; TOR2.phase = -cc.T * 9 + 1; TOR.foot = TOR2.foot = z0;
    G.tube(p.x, p.y, z0, 420, 40, 200, INV.dust, 1.7, TOR);               // r 200 funnel (vpcf radius): grey-brown banded smoke shell (alpha over)
    G.tube(p.x, p.y, z0, 360, 24, 130, INV.dustD, 1.4, TOR2);
    const n = cc.n(260 * dt);
    for (let i = 0; i < n; i++) {
      const h = Math.random() * 400, a = cc.T * 9 + h * 0.025 + rnd(0, TAU), rr = 36 + h * 0.4 + rnd(-8, 8);
      P.spawn(cc.pix(PAL.steel, { x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, z: z0 + h, ramp: null, col0: pick(TOR_PX), col1: TOR_PX1, px: 1, life: [0.25, 0.5], vel: [-Math.sin(a) * rr * 6, Math.cos(a) * rr * 6, 0], speed: 0, up: [40, 120], drag: 1.4, settle: false }));
    }
    const m = cc.n(12 * dt);
    for (let i = 0; i < m; i++) { const a = rnd(0, TAU); P.spawn({ x: p.x + Math.cos(a) * 70, y: p.y + Math.sin(a) * 70, z: z0 + 6, life: [0.5, 0.9], size0: [24, 40], size1: [50, 80], col0: PAL.earth.low, col1: PAL.earth.dim, a0: 0.6, a1: 0, mode: 'glow', vel: [Math.cos(a) * 60, Math.sin(a) * 60, 0], speed: 0, up: 20, flat: true, drag: 1.5 }); }
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
    frames: null, sp: 1000, z: 0, trail: funnel, light: { col: INV.dustLt.map((v) => v * 1.8), radius: 320, int: 0.6, elem: 'W' }, pal: PAL.ice,
    hit(cc, p) { cc.ring(p.x, p.y, cc.zAt(p.x, p.y), PAL.steel, { R: 140, count: 60 }); cc.sparks(p.x, p.y, cc.zAt(p.x, p.y) + 80, PAL.steel, { count: 10 }); cc.glow(p.x, p.y, cc.zAt(p.x, p.y) + 80, PAL.ice.lt, 300, 0.8, 0.3); },
  });

  // ---------------------------------------------------------------------------------------------------------------- alacrity (t or self)
  // [file: invoker_alacrity.vpcf_c] fire sprites, beam trails [214,136,222] (violet) + [241,145,74] (orange) whipping round the body, a light
  // [143,55,27]; surge_start glow at the cast. Here: two arc ribbons (open tubes) orbiting him at two heights, violet one way, orange the
  // other, spun up fast at the cast and settling into a lazy orbit; per-vertex foot depth so they pass behind and in front of him.
  R.spell('invoker_alacrity', (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    const id = t.id, dur = Math.min(ev.dur || 9, 12), pal = PAL.fire, z = t.z || 0, G = c.G;
    c.ring(t.x, t.y, z, EMB, { R: 130 });
    c.embers(t.x, t.y, z + 60, EMB, { count: 5 });
    c.pillar(t.x, t.y, z, VIO, { count: 12, radius: 40, up: [400, 1000] });
    c.glow(t.x, t.y, c.chest(t), INV.altLt, 240, 0.35, dur, { follow: id, dz: 90, elem: 'E', mode: 'flat' });
    const arcs = [{ sweep: 3.8, start: 0, edge: 0.25, pow: 0.1, top: 0.9, foot: 0, footPull: 20, smoke: true }, { sweep: 3.4, start: Math.PI, edge: 0.25, pow: 0.1, top: 0.9, foot: 0, footPull: 20, smoke: true }];   // alpha over: true violet / orange on any ground
    const H = [30, 78], RA = [44, 38], COL = [INV.altV, INV.altO], DIR = [1, -1];
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const z0 = u.z || 0, a = Math.min(1, r.t / 0.2, (dur - r.t) / 0.4), sp = 3 + 10 * Math.max(0, 1 - r.t / 0.7);
      for (let j = 0; j < 2; j++) {
        const o = arcs[j], b = bodyAt(u, H[j]);
        o.start += DIR[j] * sp * dt; o.foot = z0; o.footPull = b.pull;
        G.tube(b.x, b.y, b.z - 12, 24, RA[j], RA[j] + 24, COL[j], a * 2, o);   // flared band: reads as a ribbon from the top-down game camera
      }
      const n = c.n(40 * dt);
      for (let i = 0; i < n; i++) P.spawn(c.pix(i & 1 ? EMB : VIO, { x: u.x + rnd(-18, 18), y: u.y + rnd(-12, 12), z: z0 + rnd(0, 120), life: [0.3, 0.6], px: 1, speed: 0, up: [50, 110], settle: false }));
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- sun strike (x,y,r,dur = delay)
  // [file: invoker_sun_strike.vpcf_c (impact, 19 children) + invoker_sun_strike_team.vpcf_c (delay indicator, 9 children)]; CP1.x = the
  // radius (175) sizes the column, ground glows and lights. Ring waves travel under per-frame drag (30 Hz): ssDrag.
  // Delay, caster's team + spectators only (as in Dota): faint light column narrowing r 175 -> 9 (team / team_b ropes, fading upward),
  // ground flares growing to r 105 / 197 / 256 (glow_small / glow_large / edge, white -> #c49021), glints on the circle from 0.5 s (edge_c,
  // #d3ffbf -> #ffa56e), an orange flare at z 384 (team_c), a warm light r -> 437 (team_light); the warp sprite (distortion) is not drawn.
  // Impact: the ray column (one 16-node rope up to +2000 z: r 175 -> 9 by 0.36 s -> 87 at 0.6 s, #fffbea -> #d27123), the beam haze
  // (#8b4715 trails from z 128, 0.3 s), ring_c (white rope ring -> r 172, rising, 0.55 s), ring (#959db5 puffs from 0.25 s -> r 234 + puff
  // r 132, 1.1 s), ring_b (#8b4715, r 240, 0.35 s), ground glows glow_b / c / d (white -> #833839, #febc80 / #fde06b), glow_e (peach,
  // 0.25-0.45 s), light (r 700 -> 175, 1.25 s), dark smoke burst (#081830, alpha over) + ambient smoke (#5a5955, 2.8 s + 2-2.5 s), sparks /
  // ash / flame / ambient sparks as 1/4-count pixels, crater (#ceb5a4, 5.2 s) + scorch (8 s) decals.
  const SS = {
    team: [0.42, 0.41, 0.36], teamB: [0.55, 0.57, 0.6], edge0: [0.5, 0.5, 0.5], edge1: [0.42, 0.3, 0.07], glowS: [0.4, 0.44, 0.48],
    flare0: [1.0, 0.93, 0.85], flare1: [1.0, 0.24, 0.0],
    ray0: [1.0, 0.98, 0.92], ray1: [0.82, 0.44, 0.14], beam: [0.55, 0.28, 0.08], ringB: [0.9, 0.46, 0.13], ringC: [0.66, 0.68, 0.72],
    ring: [0.62, 0.64, 0.7], glwB0: [0.5, 0.48, 0.44], glwB1: [0.26, 0.11, 0.11], glw: [1.0, 0.81, 0.46], grey0: [0.15, 0.15, 0.15],
    glowE: [1.0, 0.78, 0.68], dark: [0.03, 0.09, 0.19], smoke: [0.42, 0.42, 0.4],
  };
  const SS_SPK = { hot: [1.25, 0.88, 0.6], mid: [0.9, 0.62, 0.4], low: [0.55, 0.16, 0.03], dim: [0.2, 0.05, 0.01], lt: [1, 0.6, 0.3], ramp: null };   // #876146 / #5d5235 -> #591805
  const SS_ASH = { hot: [0.42, 0.44, 0.47], mid: [0.34, 0.37, 0.41], low: [0.16, 0.18, 0.2], dim: [0.08, 0.08, 0.1], lt: [0.6, 0.64, 0.7], ramp: null };   // white / #95a4b5 at alpha .1
  const SS_FLM = { hot: [1.3, 0.6, 0.4], mid: [0.9, 0.3, 0.14], low: [0.35, 0.06, 0.04], dim: [0.12, 0.02, 0.02], lt: [1, 0.5, 0.3], ramp: null };   // #ffc4aa over #1d0404..#340b0b
  const SS_GLT = { hot: [0.8, 1.0, 0.72], mid: [0.9, 0.85, 0.55], low: [0.9, 0.55, 0.36], dim: [0.3, 0.15, 0.1], lt: [1, 0.65, 0.43], ramp: null };   // #d3ffbf -> #ffa56e
  const SS_SMK = { hot: [0.22, 0.22, 0.21], mid: [0.18, 0.18, 0.17], low: [0.08, 0.08, 0.08], dim: [0.04, 0.04, 0.04], lt: [0.5, 0.5, 0.5], ramp: null };
  const ssBias = (x, b) => x / ((1 / b - 2) * (1 - x) + 1);                                            // Source interpolation bias (0.5 = linear)
  const ssDrag = (v0, d, t) => v0 / 30 * (1 - d) / d * (1 - Math.pow(1 - d, 30 * t));                  // travel at v0 under drag d per 30 Hz frame
  const mix3 = (o, a, b, k, g) => { o[0] = (a[0] + (b[0] - a[0]) * k) * g; o[1] = (a[1] + (b[1] - a[1]) * k) * g; o[2] = (a[2] + (b[2] - a[2]) * k) * g; return o; };
  R.spell('invoker_sun_strike', (ev, su) => {
    const x = ev.x, y = ev.y; if (x == null) return;
    const rad = ev.r || 175, dur = ev.dur || 1.7, z = c.zAt(x, y), G = c.G;
    const gs = G.groundSpan(c.zAt, x, y, rad * 2), gz = gs.z;
    const own = !c.view || c.view.spectator || (su && su.team === c.view.myTeam);   // the delay indicator is the caster's team's only
    if (own) {
      const L = dur + 0.1;   // team systems live 1.8 s
      const oA = { pow: 1.6, top: 0, foot: z, footPull: 20 }, oB = { pow: 0.8, top: 0, foot: z, footPull: 20 };
      const dE = { p1: 0.9, pull: gs.pull }, dS = { p1: 2.2, pull: gs.pull }, dL = { p1: 1.4, pull: gs.pull }, oF = { sz: 0.7 };
      const cE = [0, 0, 0], cF = [0, 0, 0];
      const lt = c.glow(x, y, z + 64, SS.glw, 20, 0, L, { mode: 'flat' });
      c.run(L, (r, dt) => {
        const t = r.t, k = r.k;
        const aT = Math.min(1, k / 0.95, (1 - k) / 0.25), rT = rad * 0.5 * (2 - 1.9 * Math.min(1, k / 0.85));
        G.tube(x, y, z, 1000, rT, rT, SS.team, 0.4 * aT, oA);                                           // team: r 175 -> 9, alpha .04
        const aB = Math.min(1, k / 0.65, (1 - k) / 0.05), rB = rad * 0.5 * (0.1 + 0.2 * ssBias(Math.min(1, k / 0.95), 0.75));
        G.tube(x, y, z, 1000, rB, rB, SS.teamB, 0.9 * aB, oB);                                          // team_b: r 9 -> 26, alpha .11
        const fin = Math.min(1, (1 - k) / 0.08);
        G.disc(x, y, gz, 256 * ssBias(k, 0.5), 3, mix3(cE, SS.edge0, SS.edge1, Math.max(0, k - 0.5) * 2, 1), 1.1 * Math.min(1, k / 0.95) * fin, dE);   // edge / edge_b
        G.disc(x, y, gz, rad * 0.9 * (0.1 + 1.15 * ssBias(k, 0.75)), 3, SS.glowS, 0.25 * fin, dL);                                              // glow_large
        G.disc(x, y, gz, rad * 0.8 * (0.1 + 0.65 * ssBias(k, 0.4)), 3, SS.glowS, 1.1 * fin, dS);                                                // glow_small
        if (t < 1) G.orb(x, y, z + 384, 26, mix3(cF, SS.flare0, SS.flare1, t, 0.45), Math.min(1, t / 0.2, (1 - t) / 0.8), G.GLOW, oF);       // team_c
        lt.rad = rad * 1.25 * (0.1 + 1.9 * ssBias(k, 0.75)); lt.int = 0.75 * Math.min(1, k / 0.25, (1 - k) / 0.75);                     // team_light
        if (t > 0.5 && t < 1) {                                                                                                          // edge_c glints
          const n = c.n(24 * dt);
          for (let i = 0; i < n; i++) { const an = Math.random() * TAU; P.spawn(c.pix(SS_GLT, { x: x + Math.cos(an) * rad, y: y + Math.sin(an) * rad, z: z + 4, life: 1, px: [1, 2], speed: 0, settle: false, a0: 0.6 })); }
        }
      });
    }
    c.later(dur, () => {
      const oRay = { pow: 1.1, top: 0, foot: z, footPull: 20 }, oCore = { pow: 0.6, top: 0, foot: z, footPull: 20 };
      const oBeam = { pow: 2.5, top: 0.3, foot: z, footPull: 20 }, oRingC = { pow: 0.1, top: 0.9, foot: z, footPull: 20 };
      const dRing = { n: 40, seed: Math.random() * 40, p0: 1, p1: 0.4, p2: 0.2, pull: gs.pull }, dRingB = { rin: 0.6, p1: 1.2, p2: 0.6, pull: gs.pull };
      const dGB = { p1: 6, pull: gs.pull }, dGC = { p1: 2.5, pull: gs.pull }, dGD = { p1: 2, pull: gs.pull }, oE = { sz: 0.6 };
      const oDark = { swirl: 0.4, pow: 0.5, top: 0.6, phase: 0, smoke: true, foot: z, footPull: 20 };
      const cRay = [0, 0, 0], cCore = [0, 0, 0], cB = [0, 0, 0], cC = [0, 0, 0];
      const lt = c.glow(x, y, z + 64, SS.glw, rad * 4, 0, 1.25, { mode: 'flat' });
      c.run(1.6, (r, dt) => {
        const t = r.t;
        if (t < 0.6) {                                                                                  // ray (0.6 s) + ray_b (0.5 s, the hot core)
          const k = t / 0.6, s = k < 0.6 ? 2 - 1.9 * k / 0.6 : k < 0.75 ? 0.1 : 0.1 + 0.9 * ssBias((k - 0.75) / 0.25, 0.15);
          const R0 = rad * 0.5 * s;
          G.tube(x, y, z, 1000, R0, R0, mix3(cRay, SS.ray0, SS.ray1, k, 0.75), Math.min(1, k / 0.25, (1 - k) / 0.5), oRay);
          if (t < 0.5) G.tube(x, y, z, 1000, R0 * 0.3, R0 * 0.3, mix3(cCore, SS.ray0, SS.ray1, t / 0.5, 1.5), Math.min(1, t / 0.125, (0.5 - t) / 0.375), oCore);
          const kb = Math.min(1, t / 0.3), Rb = 288 - 252 * ssBias(kb, 0.85);                           // beam: trails r 576 -> 32 (half), alpha ~.05
          G.tube(x, y, z + 128, 1700 * kb, Rb, Rb * 0.5, SS.beam, 0.45 * (1 - k), oBeam);
        }
        if (t < 0.55) {                                                                                 // ring_c: rope ring at 2200 u/s, drag .3, rising
          const k = t / 0.55, Rc = 1 + ssDrag(2200, 0.3, t), w = 128 * ssBias(k, 0.75);
          G.tube(x, y, z + 117 * t, w * 0.5, Rc, Rc + w * 0.4, SS.ringC, 0.67 * (1 - k), oRingC);
        }
        const tr = t - 0.25;
        if (tr > 0 && tr < 1.1) {                                                                       // ring: swirl puffs at 1100-1300 u/s, drag .165
          const k = tr / 1.1, puff = 11 * (1 + 11 * ssBias(k, 0.75)), Ro = 32 + ssDrag(1200, 0.165, tr) + puff;
          dRing.p1 = Math.min(0.95, 2 * puff / Ro); G.disc(x, y, gz, Ro, 2, SS.ring, 0.38 * (1 - k), dRing);
        }
        if (t < 0.35) G.disc(x, y, gz, 15 * (1 + 15 * ssBias(t / 0.35, 0.85)), 0, SS.ringB, 0.3 * (1 - t / 0.35), dRingB);   // ring_b
        if (t < 0.8) { const k = t / 0.8; G.disc(x, y, gz, 1120 * ssBias(k, 0.75), 3, mix3(cB, SS.glwB0, SS.glwB1, k, 1), 0.7 * (1 - k), dGB); }   // glow_b
        { const k = t / 1.5; G.disc(x, y, gz, 560 * ssBias(Math.min(1, k), 0.75), 3, mix3(cC, SS.glw, SS.grey0, Math.max(0, k - 0.33) / 1.0, 0.3), 1 - k, dGC); }   // glow_c (mod2x)
        if (t < 1) G.disc(x, y, gz, rad * 0.8 * (2 - 1.9 * Math.min(1, t / 0.5)), 3, SS.glw, 0.55 * (1 - t), dGD);               // glow_d
        if (t < 0.45) { const k = Math.min(1, t / 0.35); G.orb(x, y, z + 8, 6 * (1 + 47 * ssBias(k, 0.65)) * 0.35, SS.glowE, 0.3 * (1 - k), G.GLOW, oE); }   // glow_e (mod2x)
        if (t < 1.25) { const k = t / 1.25; lt.rad = rad * 2 * (2 - 1.5 * ssBias(k, 0.25)); lt.int = 1.2 * Math.min(1, k / 0.25, (1 - k) / 0.75); }   // light
        if (t < 0.6) { const e = 1 - (1 - t / 0.6) * (1 - t / 0.6); oDark.phase = c.T * 2; G.tube(x, y, z, 30 + 140 * e, 50 + 110 * e, 40 + 130 * e, SS.dark, 0.6 * (1 - t / 0.6), oDark); }   // orange_smoke (dark)
        // pixels at 1/4 of the game counts
        if (t < 0.25) { const n = c.n(112 * dt); for (let i = 0; i < n; i++) { const an = Math.random() * TAU; P.spawn(c.pix(SS_SPK, { x: x + Math.cos(an) * 72, y: y + Math.sin(an) * 72, z: z + 4, life: [0.5, 1], px: [1, 2], speed: 0, vel: [rnd(-400, 400), rnd(-400, 400), 0], up: [250, 600], gravity: -650, drag: 0.3 })); } }   // sparks
        if (t < 0.5) { const n = c.n(100 * dt); for (let i = 0; i < n; i++) P.spawn(c.pix(SS_ASH, { x: x + rnd(-30, 30), y: y + rnd(-30, 30), z: z + rnd(3, 300), life: [1, 1.2], px: 1, speed: 0, jitter: 24, up: [100, 200], gravity: -100, drag: 1.5, settle: false })); }   // ashes
        if (t < 0.2) { const n = c.n(50 * dt); for (let i = 0; i < n; i++) P.spawn(c.pix(SS_FLM, { x: x + rnd(-4, 4), y: y + rnd(-20, 20), z: z + rnd(300, 1000), life: 0.5, px: [1, 2], speed: 0, vel: [rnd(-24, 14), rnd(-424, 424), rnd(-16, 16)], gravity: 25, drag: 3, settle: false })); }   // flame
      });
      const oSmk = { swirl: 0.6, pow: 0.5, top: 0.5, phase: 0, smoke: true, foot: z, footPull: 20 };
      c.run(5.3, (r, dt) => {                                                                           // smoke_ambient 20/s for 2.8 s, life 2-2.5 + sparks_ambient
        const t = r.t, env = Math.min(1, t / 0.4) * (t < 2.8 ? 1 : Math.max(0, 1 - (t - 2.8) / 2.5));
        oSmk.phase = c.T * 1.2;
        G.tube(x, y, z, 120 + 25 * t, 110 + 8 * t, 90 + 10 * t, SS.smoke, 0.7 * env, oSmk);
        if (t < 2.8) { const n = c.n(5 * dt); for (let i = 0; i < n; i++) P.spawn(c.pix(SS_SMK, { x, y, z: z + 20, shape: 'sphere', radius: 75, life: [2, 2.5], px: 1, speed: 0, up: [20, 60], gravity: 80, drag: 1.5, settle: false })); }
        if (t > 0.45 && t < 3.45) { const n = c.n(3.5 * dt); for (let i = 0; i < n; i++) { const an = Math.random() * TAU; P.spawn(c.pix(SS_SPK, { x: x + Math.cos(an) * 84, y: y + Math.sin(an) * 84, z: z + 4, life: [0.5, 1], px: 1, speed: 0, jitter: 20, up: [45, 65], gravity: 85, settle: false })); } }
      });
      c.decal(x, y, 'decal_scorch', rad / 70, 8, { tint: [0.9, 0.6, 0.3], emit: 0.5, fadeIn: 0.0125, fadeOut: 0.2 });                    // crater_scorch 8 s
      c.decal(x, y, 'decal_scorch', rad / 80, 5.2, { tint: [0.81, 0.71, 0.64], emit: 0, roll: 1.3, fadeIn: 0.02, fadeOut: 0.09 });      // crater_proj (#ceb5a4) + crater model, 5-5.4 s
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- forge spirit (n, dur, r)
  // [file: invoker_forge_spirit_dlight.vpcf_c] only a light in the vpcfs (the spirits are models). Here: a fire column (swirled tube, HDR
  // core) erupts where each spirit forms, with a ground shock ring, embers and smoke.
  R.spell('invoker_forge_spirit', (ev, su) => {
    if (!su) return;
    const n = ev.n || 2, rr = Math.max(150, (ev.r || 80) + 70), pal = EMB, f = su.facing || 0, G = c.G;   // columns clear of his body
    c.ring(su.x, su.y, su.z || 0, pal, { R: rr + 60 });
    const FCORE = [1.2, 0.55, 0.12];
    for (let i = 0; i < n; i++) {
      const a = f + TAU * i / n, x = su.x + Math.cos(a) * rr, y = su.y + Math.sin(a) * rr, z = c.zAt(x, y);
      const fo = { swirl: 0.8, pow: 1.2, flare: 1, top: 0.55, phase: 0, foot: z, footPull: 20 }, co = { swirl: 0.5, pow: 0.7, top: 0.5, phase: 0, foot: z, footPull: 20 };
      const sh = { n: 16, seed: Math.random() * 30, p0: 0, p1: 0.2, p2: 0.3 };
      c.run(0.7, (r) => {
        const t = r.t, e = 1 - Math.pow(1 - Math.min(1, t / 0.14), 3), fade = 1 - r.k * r.k;
        fo.phase = c.T * 8 + i; co.phase = c.T * 11;
        G.tube(x, y, z, 230 * e, 32, 14, INV.E, fade, fo);
        G.tube(x, y, z, 120 * e, 7, 3, FCORE, fade * 0.6, co);
        if (t < 0.4) { const q = t / 0.4; sh.p0 = 0.15 + 0.85 * (1 - (1 - q) * (1 - q)); G.disc(x, y, z, 110, 2, INV.E, 1 - q, sh); }
      });
      c.pillar(x, y, z, pal, { count: G.lod ? 6 : 3, radius: 26, up: [400, 1000] });
      c.embers(x, y, z + 30, pal, { count: 3 });
      c.glow(x, y, z + 60, pal.lt, 220, 0.35, 0.6, { elem: 'E' });
      c.smoke(x, y, z + 20, { count: 4 });
    }
  });

  // ---------------------------------------------------------------------------------------------------------------- chaos meteor
  // [file: particles/units/heroes/hero_invoker/invoker_chaos_meteor_fly.vpcf_c + _land + _crumble] a lava-cracked rock model (radius scale
  // 1-1.7) flies down its path in 1.3 s wrapped in a noise-fire shell (r 70-84, gravity +600) and a red glow shell (r 84-96), smoke 128/s
  // (r 140-160, orange -> black), sparks 74/s; lands with a flash (r 800-1200, 0.5 s), a 12-point rope ring (r 100 x25, 0.35 s, red -> gold),
  // debris 500/s + embers 300/s for 0.25 s, a spotlight beam (r 500-1000, 0.6-0.8 s), then rolls with a ground fire trail (50/s, r 164-200,
  // life 1-2) and burnt decals, and finally crumbles (sinks, 2.8 s). Here: opaque lava rock + GLOW fire shells + a trailing fire cone (tube).
  const MET_LAVA = [1.6, 0.52, 0.1], MET_SHELL = [0.3, 0.09, 0.02], MET_HALO = [0.15, 0.035, 0.01], MET_CONE = [0.34, 0.1, 0.02], MET_CORE = [0.55, 0.25, 0.06];
  const MET_RING0 = [0.6, 0.12, 0.06], MET_RING1 = [0.42, 0.32, 0.09], MET_BEAM = [0.18, 0.055, 0.014], MET_ROCK_R = 66;
  R.spell('invoker_chaos_meteor', (ev) => {
    const x = ev.x, y = ev.y; if (x == null) return;
    const G = c.G;
    const x2 = ev.x2 != null ? ev.x2 : x, y2 = ev.y2 != null ? ev.y2 : y;
    const rad = ev.r || 275, land = ev.land || 1.3, roll = ev.roll || 1.8, pal = PAL.fire, RR = MET_ROCK_R;
    const len = Math.hypot(x2 - x, y2 - y) || 1, cs = (x2 - x) / len, sn = (y2 - y) / len, head = Math.atan2(sn, cs);
    const z0 = c.zAt(x, y), sx = x - cs * 650, sy = y - sn * 650, sz = z0 + 1500;
    const fl = Math.hypot(x - sx, y - sy, sz - z0), back = [(sx - x) / fl, (sy - y) / fl, (sz - z0) / fl];   // fire cone axis: back up the flight path
    const ro = { yaw: 0, pitch: 0, roll: 0, lump: 0.32, seed: Math.random() * 50 }, sh = { lump: 0.22, seed: 3, p2: 0, yaw: 0, roll: 0 };
    const cone = { axis: back, swirl: 0.8, pow: 1.1, top: 0.35, phase: 0 }, coreC = { axis: back, swirl: 0.5, pow: 0.8, top: 0.3, phase: 0 };
    c.ringDecal(x, y, rad, land + 0.1, [3, 1.2, 0.3], { emit: 1.2, pulse: 0.25, pulseHz: 11, fadeOut: 0.05 });
    const lt = c.glow(x, y, z0 + 60, pal.lt, rad * 2, 0.4, land, { mode: 'flat', elem: 'E' });
    const shells = (px, py, pz, k, a) => {
      sh.yaw = c.T * 3; sh.roll = c.T * 2; sh.seed = (c.T * 12) | 0;          // re-seeded lumps: the fire shell boils
      G.orb(px, py, pz, RR * 1.3, MET_SHELL, a, G.GLOW, sh);
      if (G.lod) G.orb(px, py, pz, RR * 1.75, MET_HALO, a * k, G.GLOW, sh);
    };
    // flight
    c.run(land, (r, dt) => {
      const k = r.k * r.k * 0.35 + r.k * 0.65, px = sx + (x - sx) * k, py = sy + (y - sy) * k, pz = sz + (z0 + RR * 0.9 - sz) * k;
      lt.int = 0.4 + 1.5 * r.k;
      ro.yaw = head; ro.pitch = r.t * 3; ro.roll = r.t * 5;
      G.rock(px, py, pz, RR, MET_LAVA, 0.75, c.T * 2, 1, ro);
      shells(px, py, pz, 1, 1);
      cone.phase = coreC.phase = c.T * 22;
      G.tube(px, py, pz, 460, RR * 1.3, RR * 0.2, MET_CONE, 1, cone);
      G.tube(px, py, pz, 280, RR * 0.85, RR * 0.12, MET_CORE, 0.9, coreC);
      c.lightNow(px, py, pz, pal.lt, 460, 1.2, 0);
      for (let n = c.n(110 * dt); n > 0; n--) { const d = rnd(0, 300); P.spawn(c.pix(pal, { x: px + back[0] * d + rnd(-40, 40), y: py + back[1] * d + rnd(-40, 40), z: pz + back[2] * d + rnd(-40, 40), life: [0.5, 1.0], px: [0.8, 2.2], speed: [0, 60], gravity: -300, drag: 0.8, linger: [0.4, 1.2] })); }
      for (let n = c.n(26 * dt); n > 0; n--) { const d = rnd(60, 420); P.spawn({ x: px + back[0] * d, y: py + back[1] * d, z: pz + back[2] * d, life: [0.6, 1.1], size0: [40, 60], size1: [90, 130], col0: [0.5, 0.26, 0.1], col1: [0.06, 0.05, 0.05], a0: 0.55, a1: 0, mode: 'glow', speed: [0, 20], up: 20, drag: 1 }); }
    });
    // impact, roll, crumble
    c.later(land, () => {
      c.glow(x, y, z0 + 90, pal.lt, 700, 1.1, 0.6, { elem: 'E' });
      P.burst(c.pix(pal, { x, y, z: z0 + 20, count: c.G.lod ? 120 : 50, shape: 'ring', radius: 84, speed: [60, 220], up: [200, 420], gravity: -900, drag: 2.2, px: [0.8, 2], linger: [0.3, 0.7] }));
      c.dust(x, y, z0, { count: 18, speed: [100, 260], life: [1.0, 1.5] });
      c.smoke(x, y, z0 + 30, { count: 10, radius: rad * 0.3, size0: [50, 80], size1: [110, 150] });
      c.decal(x, y, 'decal_scorch', rad / 90, 7, { tint: [1.2, 0.7, 0.3], emit: 0.8, fadeOut: 0.6 });
      const ringO = { pow: 0.7, top: 0.9 }, beamO = { pow: 2, top: 0.4, swirl: 0.3, phase: 0 }, shock = { n: 20, seed: Math.random() * 30, p0: 0, p1: 0.22, p2: 0.3 };
      const ringC = [0, 0, 0];
      c.run(0.8, (r) => {
        const t = r.t;
        if (t < 0.4) {                                                           // rope ring: r 100 -> 1.3 rad in 0.35 s, red -> gold
          const f = Math.min(1, t / 0.35), e = 1 - Math.pow(1 - f, 2);
          for (let i = 0; i < 3; i++) ringC[i] = MET_RING0[i] + (MET_RING1[i] - MET_RING0[i]) * f;
          G.tube(x, y, z0, 70 * (1 - 0.7 * e), 100 + (rad * 1.3 - 100) * e, 100 + (rad * 1.35 - 100) * e, ringC, 1 - f * f, ringO);
          shock.p0 = 0.15 + 0.85 * e; G.disc(x, y, z0, rad * 1.45, 2, MET_RING0, 1 - f, shock);
        }
        const bk = Math.max(0, 1 - t / 0.7);                                     // spotlight beam
        beamO.phase = c.T * 6; G.tube(x, y, z0, 380, rad * 0.75, rad * 1.05, MET_BEAM, bk * bk, beamO);
      });
      let lastDecal = 0;
      c.run(roll + 0.9, (r, dt) => {
        const rk = Math.min(1, r.t / roll), crumb = Math.max(0, (r.t - roll) / 0.9);    // 0..1 while crumbling
        const px = x + (x2 - x) * rk, py = y + (y2 - y) * rk, gz = c.zAt(px, py), pz = gz + RR * 0.85 - crumb * RR * 1.1;
        ro.yaw = head + Math.PI / 2; ro.pitch = Math.PI / 2; ro.roll = -(len * rk) / RR;   // rolls forward about the horizontal axis
        const heat = 1 - crumb * 0.8;
        G.rock(px, py, pz, RR * (1 - crumb * 0.25), MET_LAVA, heat, c.T * 3, 1, ro);
        shells(px, py, pz + 6, 1 - crumb, 1 - crumb);
        c.lightNow(px, py, pz + 30, pal.lt, 460, 1.5 * (1 - crumb) * (0.8 + 0.2 * Math.sin(c.T * 25)), 0);
        if (crumb > 0) return;
        // ground fire trail behind it (r 164-200, life 1-2) + rising flames off the rock
        for (let n = c.n(60 * dt); n > 0; n--) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 90; P.spawn(c.pix(pal, { x: px + Math.cos(a) * d - cs * 50, y: py + Math.sin(a) * d - sn * 50, z: gz + 4, life: [1, 2], px: [0.8, 2], speed: 0, up: [30, 90], gravity: 40, drag: 1.4, settle: false })); }
        for (let n = c.n(90 * dt); n > 0; n--) { const a = Math.random() * TAU; P.spawn(c.pix(pal, { x: px + Math.cos(a) * RR * 0.8, y: py + Math.sin(a) * RR * 0.8, z: pz + rnd(-20, 40), life: [0.35, 0.7], speed: [0, 40], up: [120, 260], drag: 1.2, settle: false })); }
        if (r.t - lastDecal > 0.25) { lastDecal = r.t; c.decal(px, py, 'decal_scorch', rad / 140, 4, { tint: [1.1, 0.6, 0.25], emit: 0.7, fadeOut: 0.7 }); }
      });
      c.later(roll, () => {
        const ez = c.zAt(x2, y2);
        c.embers(x2, y2, ez + 40, pal, { count: 24 });
        c.smoke(x2, y2, ez + 30, { count: 10 });
      });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- deafening blast: expanding multi-element wave
  // [file: invoker_deafening_blast.vpcf_c] a swoop body r 320 [65,93,130]/[89,128,179], wave + graphic ropes (r 15) blue [117,187,235] with
  // an orange edge [255,120,0] / edge trails [86,153,236] -> [234,167,80], pulse rings, dust. Here: an arc tube (sweep 2.2 rad) whose chord
  // spans the wave width, blue swirling body, a low orange leading edge, a fainter echo arc behind, crisp element pixels.
  R.spell('invoker_deafening_blast', (ev, su) => {
    if (su) {
      blastDims.set(su.id, { r0: ev.r0 || 175, r1: ev.r || 225 });
      const z = c.chest(su);
      for (const o of [0, 1]) c.ring(su.x, su.y, su.z || 0, FROST, { R: 100 + o * 40, life: [0.3 + o * 0.1, 0.5 + o * 0.1] });   // blue-dominant cast
      c.glow(su.x, su.y, z, PAL.ice.lt, 300, 0.5, 0.4);
    }
  });
  const BLAST_PALS = [PAL.ice, PAL.arc, PAL.fire];
  const SW = 2.2, SIN_HALF = Math.sin(SW / 2);
  const BL = { sweep: SW, start: 0, edge: 0.28, swirl: 0.35, pow: 0.1, top: 0.9, phase: 0, foot: 0, footPull: 20, smoke: true };   // solid blue body (alpha over)
  const BLE = { sweep: SW, start: 0, edge: 0.3, swirl: 0, pow: 0.1, top: 0.9, foot: 0, footPull: 20 }, BLB = { sweep: SW, start: 0, edge: 0.3, swirl: 0.4, pow: 1.4, top: 0.9, phase: 0, foot: 0, footPull: 20 };
  R.proj('invoker_deafening_blast', {
    frames: null, sp: 1100, z: 70, pal: PAL.arc,
    light: { col: INV.body.map((v) => v * 1.9), radius: 380, int: 0.9 },
    trail(cc, p, dt) {
      const ev = p.data || {}, d = blastDims.get(p.sid) || { r0: 175, r1: 225 }, G = cc.G;
      const k = Math.min(1, Math.hypot(p.x - (ev.x != null ? ev.x : p.x), p.y - (ev.y != null ? ev.y : p.y)) / p.d0);
      const w = d.r0 + (d.r1 - d.r0) * k;
      const l = Math.hypot(p.dx, p.dy) || 1, fx = p.dx / l, fy = p.dy / l, px = -fy, py = fx;
      // the 3D wave: arc centre behind the front so the arc's chord spans the width
      const Rc = w / SIN_HALF, gz = cc.zAt(p.x, p.y), cx = p.x - fx * Rc, cy = p.y - fy * Rc, st = Math.atan2(fy, fx) - SW / 2;
      BL.start = BLE.start = BLB.start = st; BL.foot = BLE.foot = BLB.foot = gz; BL.phase = cc.T * 12; BLB.phase = cc.T * 7;
      G.tube(cx, cy, gz + 4, 130, Rc, Rc + 8, INV.blast, 2, BL);
      G.tube(cx, cy, gz + 2, 44, Rc + 12, Rc + 15, INV.edge, 1, BLE);
      if (G.lod) G.tube(cx - fx * 70, cy - fy * 70, gz + 4, 90, Rc, Rc + 4, INV.body, 0.6, BLB);
      const n = cc.n(220 * dt);
      for (let i = 0; i < n; i++) {
        const s = rnd(-1, 1), back = s * s * w * 0.5;
        const pl = Math.random() < 0.75 ? FROST : BLAST_PALS[(Math.random() * 3) | 0];
        P.spawn(cc.pix(pl, { x: p.x + px * s * w - fx * back, y: p.y + py * s * w - fy * back, z: gz + rnd(10, 90), life: [0.25, 0.5], px: 1,
          vel: [fx * 90, fy * 90, 0], speed: 0, up: [0, 30], drag: 1.6, settle: false }));
      }
    },
    hit(cc, p) { cc.ring(p.x, p.y, cc.zAt(p.x, p.y), FROST, { R: 140 }); },
  });
}
