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
  dust: [0.39, 0.42, 0.49], dustLt: [0.62, 0.7, 0.87],                  // tornado funnel [99,107,124] [123,112,124], trail glow [158,179,222]
  body: [0.2, 0.3, 0.52], edge: [0.78, 0.5, 0.2],                       // deafening blast body [65,93,130]/[89,128,179], edge -> [234,167,80]
  altV: [0.62, 0.36, 0.66], altO: [0.85, 0.48, 0.2], altLt: [0.9, 0.45, 0.4],   // alacrity trails [214,136,222] + [241,145,74]
  heat: [0.9, 0.45, 0.18], heatD: [0.3, 0.12, 0.05],                    // cold snap trail_pull / heat [105,52,23] [123,88,67]
  gold: [0.55, 0.42, 0.14],
};
const ELEMB = { Q: [0.17, 0.57, 1.2], W: [0.68, 0.35, 0.78], E: [1.2, 0.51, 0.1] };   // invoke column bands (element x1.35, < bloom)
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
    const col = [0, 1, 2].map(() => ({ swirl: 1, pow: 1.3, flare: 1, top: 0.6, phase: 0, foot: 0, footPull: 20 })), cco = { swirl: 0.4, pow: 0.8, top: 0.5, phase: 0, foot: 0, footPull: 20 };
    const sh = { n: 18, seed: Math.random() * 40, p0: 0, p1: 0.18, p2: 0.3 };
    c.run(0.85, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const t = r.t, z0 = u.z || 0;
      const a = Math.min(1, t / 0.08) * Math.max(0, Math.min(1, (0.85 - t) / 0.3));
      tg.p0 = c.T * 4; G.disc(u.x, u.y, z0, 100, 1, INV.gold, a, tg);
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
          const o = col[i]; o.phase = c.T * 9 + i * (TAU / 3); o.foot = z0;
          G.tube(u.x, u.y, z0, 260 * up, 34, 22, ELEMB[ch3[i]] || ELEMB.Q, fade, o);
        }
        cco.phase = c.T * 6; cco.foot = z0; G.tube(u.x, u.y, z0, 200 * up, 7, 4, ELEMC[ch3[2]] || INV.Qc, fade * 0.7, cco);
        if (t < 0.75) { const f = (t - 0.4) / 0.35; sh.p0 = 0.15 + 0.85 * (1 - (1 - f) * (1 - f)); G.disc(u.x, u.y, z0, 130, 2, INV.gold, 1 - f, sh); }
      }
    });
    c.later(0.4, () => {
      const u = c.unit(id) || su, zz = c.chest(u), cx = u.x, cy = u.y;
      for (let i = 0; i < 3; i++) {
        const pal = ELEM_PAL[ch3[i]] || PAL.ice;
        c.pillar(cx + rnd(-10, 10), cy + rnd(-10, 10), u.z || 0, pal, { count: 12, radius: 18, up: [300, 700] });
        c.sparks(cx, cy, zz, pal, { count: 6, speed: [80, 240] });
      }
      const dom = ch3[2];
      c.glow(cx, cy, zz, (ELEM_PAL[dom] || PAL.ice).lt, 300, 1.0, 0.5, { elem: dom });
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
      c.glow((su.x + x) / 2, (su.y + y) / 2, c.chest(t), pal.lt, 300, 0.8, 0.3, { mode: 'fade' });
    }
    c.flash(x, y, c.chest(t), pal, 50, 0.2);
    c.shards(x, y, z + 70, pal, { count: 12 });
    c.pillar(x, y, z, pal, { count: 36, radius: 26, up: [400, 1000] });
    c.glow(x, y, z + 80, pal.lt, 300, 1.0, Math.min(dur, 3), { follow: id, dz: 70, elem: 'Q', mode: 'flat' });
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
    c.blob(su.x, su.y, c.chest(su), PAL.arc, { count: 12, speed: [40, 160] });
    c.glow(su.x, su.y, c.chest(su), PAL.arc.lt, 260, 0.9, 0.4, { elem: 'W' });
    const sph = { p2: 0.2, lump: 0.08, seed: 0, foot: 0, footPull: 20 }, rg = { rin: 0.84, p1: 1.6, p2: 0.8 };
    const fr = { p0: 0, p1: 1.2, p2: 0.6, p3: 0.4, rin: 0.6, n: 7, seed: Math.random() * 20 }, aura = { rin: 0.965, p1: 0, p2: 0.5 };
    c.run(0.42, (r) => {
      const u = c.unit(id) || su, k = r.k, z0 = u.z || 0, b = bodyAt(u, c.chest(u) - z0), R0 = 110 * Math.pow(1 - k, 1.5) + 6;
      sph.foot = z0; sph.footPull = b.pull + R0 * 0.6; sph.seed = (c.T * 20) | 0;
      G.orb(b.x, b.y, b.z, R0, INV.W, (1 - k) * 0.9, G.GLOW, sph);
      G.disc(u.x, u.y, z0, 200 * (1 - 0.4 * k), 0, INV.teal, 1 - k, rg);
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
  const ICE_BLOB = [0.12, 0.26, 0.46], ICE_SPIKE = [0.19, 0.4, 0.68];
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
    c.flash(mx, my, mz + 60, pal, 70, 0.25);
    P.burst(c.pix(pal, { x: x0, y: y0, z: c.zAt(x0, y0) + 6, x2: x1, y2: y1, z2: c.zAt(x1, y1) + 6, shape: 'line', count: Math.round(len / 3), life: [0.6, 1.2], speed: [0, 60], up: [200, 600], gravity: -520, drag: 1.2, linger: [0.4, 1.2] }));
    for (let i = 0; i < 3; i++) { const k = (i + 0.5) / 3; c.glow(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, mz + 80, pal.lt, 220, 0.6, dur, { mode: 'flat', elem: 'Q' }); }
    for (let i = 0; i < 4; i++) { const k = (i + 0.5) / 4; c.decal(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 'decal_frost', len / 4 / 100, dur, { tint: COLD, emit: 1.0, fadeOut: 0.25, roll: yawW }); }
    c.run(dur, (r, dt) => {
      const t = r.t, out = Math.max(0, Math.min(1, (dur - t) / 0.6));   // last 0.6 s: everything sinks back into the ground
      // cold mist drifting off the whole width (not a bright centre line)
      for (let n = c.n(len * 0.25 * dt); n > 0; n--) {
        const k = Math.random(), off = rnd(-1.3, 1.3) * hw, px = x0 + (x1 - x0) * k + nx * off, py = y0 + (y1 - y0) * k + ny * off;
        P.spawn(c.pix(pal, { x: px, y: py, z: c.zAt(px, py) + rnd(4, 60), col0: pal.mid, life: [0.6, 1.2], up: [6, 30], speed: [0, 8], settle: false }));
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
  R.spell('invoker_emp', (ev, su) => {
    const x = ev.x, y = ev.y; if (x == null) return;
    const rad = ev.r || 675, dur = ev.dur || 2.9, z = c.zAt(x, y), pal = PAL.arc, G = c.G, lo = G.lod === 0;
    const tg = { n: 16, seed: Math.random() * 50, p0: 0, p1: 0.12, p2: 0 }, rg = { rin: 0.93, p1: 1.4, p2: 0.8 };
    const sph = { p2: 0.3, lump: 0.12, seed: 0 }, cor = { p2: 1, lump: 0.2, seed: 0 };
    const bolts = []; for (let i = 0; i < (lo ? 1 : 3); i++) { const b = G.newBolt(); if (b) bolts.push(b); }
    const lt = c.glow(x, y, z + 70, pal.lt, rad * 0.8, 0.5, dur, { mode: 'flat', elem: 'W' });
    const HZ = 90;
    c.run(dur, (r, dt) => {
      const k = r.k, a = Math.min(1, r.t / 0.15), w = elemMul('W', c.T, 3);
      lt.int = 0.5 + 0.9 * k;
      G.disc(x, y, z, rad, 0, INV.W, a * (0.6 + 0.12 * Math.sin(c.T * 14)), rg);
      tg.p0 = -c.T * 0.6; tg.p1 = 0.08 + 0.2 * k; G.disc(x, y, z, rad * 0.66, 1, INV.Wd, a, tg);
      const R0 = 8 + 40 * k;
      sph.seed = (c.T * 20) | 0; cor.seed = sph.seed + 3;
      G.orb(x, y, z + HZ, R0, INV.W, a * (w > 1 ? 1 : 0.75), G.GLOW, sph);
      G.orb(x, y, z + HZ, R0 * 0.38, INV.Wc, a, G.GLOW, cor);
      for (let i = 0; i < bolts.length; i++) {
        if (i > k * bolts.length * 1.3) break;                                   // more arcs as the fuse burns
        const b = bolts[i];
        if (c.T - b.last >= 0.07) { const an = rnd(0, TAU), d = rnd(R0, rad * 0.45); b.roll(c.T, 0.07, x, y, z + HZ, x + Math.cos(an) * d, y + Math.sin(an) * d, z + 4, { depth: 3, branches: 1 }); }
        G.bolt(b, INV.zap, 3, INV.zapC, 1, 0.9);
      }
      // violet motes on the rim fall inward and tick up faster as the fuse burns down
      const n = c.n((60 + 160 * k) * dt);
      for (let i = 0; i < n; i++) {
        const an = Math.random() * TAU, rr = rad * rnd(0.82, 1.0);
        P.spawn(c.pix(pal, { x: x + Math.cos(an) * rr, y: y + Math.sin(an) * rr, z: z + 6, life: [0.4, 0.8], vel: [-Math.cos(an) * rad * 0.7, -Math.sin(an) * rad * 0.7, 0], speed: 0, up: [60, 220], drag: 1.2, settle: false }));
      }
    }, () => { for (const b of bolts) G.free(b); });
    c.later(dur, () => {
      const wave = { n: 28, seed: Math.random() * 30, p0: 0, p1: 0.12, p2: 0.35 }, ringO = { pow: 0.8, top: 0.9, swirl: 0.4, phase: 0 }, pop = { p2: 0.15, lump: 0.15, seed: 3 };
      const xb = []; for (let i = 0; i < (lo ? 3 : 6); i++) { const b = G.newBolt(); if (b) xb.push(b); }
      c.run(0.6, (r) => {
        const t = r.t, f = Math.min(1, t / 0.45), e = 1 - Math.pow(1 - f, 3);
        if (t < 0.45) {
          wave.p0 = 0.08 + 0.92 * e; G.disc(x, y, z, rad, 2, INV.W, 1 - f * 0.8, wave);
          ringO.phase = c.T * 10; G.tube(x, y, z, 44 * (1 - 0.6 * e), 60 + (rad - 60) * e, 60 + (rad * 1.02 - 60) * e, INV.W, 1 - f * f, ringO);
        }
        if (t < 0.25) { const q = t / 0.25; G.orb(x, y, z + HZ, 48 + 110 * q, INV.W, (1 - q) * 0.8, G.GLOW, pop); }
        if (t < 0.22) for (const b of xb) {
          if (c.T - b.last >= 0.06) { const an = rnd(0, TAU), d = rnd(0.3, 0.95) * rad; b.roll(c.T, 0.06, x, y, z + HZ, x + Math.cos(an) * d, y + Math.sin(an) * d, z + 4, { depth: 4, branches: 2 }); }
          G.bolt(b, INV.zap, 3, INV.zapC, 1, 1 - t / 0.22);
        }
      }, () => { for (const b of xb) G.free(b); });
      c.flash(x, y, z + 90, pal, 90, 0.2);
      c.ring(x, y, z, pal, { R: rad, life: [0.5, 0.8] });
      c.pillar(x, y, z, pal, { count: 60, radius: rad * 0.1, up: [600, 1800] });
      c.sparks(x, y, z + 40, pal, { count: 30, speed: [200, 700] });
      c.glow(x, y, z + 100, pal.lt, rad * 1.2, 1.4, 0.6);
      c.decal(x, y, 'decal_scorch', rad / 110, 3, { tint: [0.9, 0.3, 1.8], emit: 0.8, fadeOut: 0.7 });
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- tornado: PROJ funnel + cast
  // [file: invoker_tornado.vpcf_c] r 200; funnel smoke sprites [178,173,160] [99,107,124] [123,112,124] (scale .4 -> 4, rotating about the
  // axis), funnel_detail blade-fury swirl, trail glow [158,179,222] / [207,162,214], leaves + twigs, base swirl ring r 15 x3.2, dust trail.
  // Here: two counter-swirling cone tubes (dusty grey-violet shell, pale inner), crisp dust / light pixels spiralling up, a dust skirt.
  R.spell('invoker_tornado', (ev, su) => {
    if (!su) return;
    c.ring(su.x, su.y, su.z || 0, PAL.steel, { R: 100, count: 60 });
    c.swirl(su.id, 0.5, PAL.arc, { r: 30, rate: 30, speed: 8 });
  });
  const TOR = { swirl: 0.9, pow: 1.3, top: 0.75, phase: 0, flare: 1, foot: 0, footPull: 20 }, TOR2 = { swirl: 1, pow: 2.2, top: 0.6, phase: 0, foot: 0, footPull: 20 };
  const TOR_PX = [[0.95, 1, 1.25], [0.75, 0.62, 0.9], [0.55, 0.58, 0.68]], TOR_PX1 = [0.22, 0.22, 0.28];
  const funnel = (cc, p, dt) => {
    const G = cc.G, z0 = cc.zAt(p.x, p.y);
    TOR.phase = cc.T * 14; TOR2.phase = -cc.T * 9 + 1; TOR.foot = TOR2.foot = z0;
    G.tube(p.x, p.y, z0, 340, 22, 120, INV.dust, 0.9, TOR);
    if (G.lod) G.tube(p.x, p.y, z0, 280, 10, 66, INV.dustLt, 0.6, TOR2);
    const n = cc.n(260 * dt);
    for (let i = 0; i < n; i++) {
      const h = Math.random() * 320, a = cc.T * 9 + h * 0.025 + rnd(0, TAU), rr = 18 + h * 0.32 + rnd(-6, 6);
      P.spawn(cc.pix(PAL.steel, { x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, z: z0 + h, ramp: null, col0: pick(TOR_PX), col1: TOR_PX1, px: 1, life: [0.25, 0.5], vel: [-Math.sin(a) * rr * 6, Math.cos(a) * rr * 6, 0], speed: 0, up: [40, 120], drag: 1.4, settle: false }));
    }
    const m = cc.n(12 * dt);
    for (let i = 0; i < m; i++) { const a = rnd(0, TAU); P.spawn({ x: p.x + Math.cos(a) * 50, y: p.y + Math.sin(a) * 50, z: z0 + 6, life: [0.5, 0.9], size0: [20, 34], size1: [40, 60], col0: PAL.earth.low, col1: PAL.earth.dim, a0: 0.5, a1: 0, mode: 'glow', vel: [Math.cos(a) * 60, Math.sin(a) * 60, 0], speed: 0, up: 20, flat: true, drag: 1.5 }); }
  };
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
    c.flash(t.x, t.y, c.chest(t), pal, 50, 0.2);
    c.ring(t.x, t.y, z, pal, { R: 130 });
    c.embers(t.x, t.y, z + 60, pal, { count: 12 });
    c.pillar(t.x, t.y, z, PAL.arc, { count: 30, radius: 28, up: [400, 1000] });
    c.glow(t.x, t.y, c.chest(t), INV.altLt, 280, 0.8, dur, { follow: id, dz: 90, elem: 'E', mode: 'flat' });
    const arcs = [{ sweep: 2.4, start: 0, edge: 0.32, pow: 0.9, top: 1, foot: 0, footPull: 20 }, { sweep: 2.0, start: Math.PI, edge: 0.32, pow: 0.9, top: 1, foot: 0, footPull: 20 }];
    const H = [34, 76], RA = [36, 32], COL = [INV.altV, INV.altO], DIR = [1, -1];
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const z0 = u.z || 0, a = Math.min(1, r.t / 0.2, (dur - r.t) / 0.4), sp = 3 + 10 * Math.max(0, 1 - r.t / 0.7);
      for (let j = 0; j < 2; j++) {
        const o = arcs[j], b = bodyAt(u, H[j]);
        o.start += DIR[j] * sp * dt; o.foot = z0; o.footPull = b.pull;
        G.tube(b.x, b.y, b.z - 6, 12, RA[j], RA[j] + 4, COL[j], a * 0.95, o);
      }
      const n = c.n(40 * dt);
      for (let i = 0; i < n; i++) P.spawn(c.pix(i & 1 ? pal : PAL.arc, { x: u.x + rnd(-18, 18), y: u.y + rnd(-12, 12), z: z0 + rnd(0, 120), life: [0.3, 0.6], px: 1, speed: 0, up: [50, 110], settle: false }));
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
  // [file: invoker_forge_spirit_dlight.vpcf_c] only a light in the vpcfs (the spirits are models). Here: a fire column (swirled tube, HDR
  // core) erupts where each spirit forms, with a ground shock ring, embers and smoke.
  R.spell('invoker_forge_spirit', (ev, su) => {
    if (!su) return;
    const n = ev.n || 2, rr = ev.r || 80, pal = PAL.fire, f = su.facing || 0, G = c.G;
    c.flash(su.x, su.y, c.chest(su), pal, 50, 0.2);
    c.ring(su.x, su.y, su.z || 0, pal, { R: rr + 70 });
    const FCORE = [1.5, 0.75, 0.2];
    for (let i = 0; i < n; i++) {
      const a = f + TAU * i / n, x = su.x + Math.cos(a) * rr, y = su.y + Math.sin(a) * rr, z = c.zAt(x, y);
      const fo = { swirl: 0.8, pow: 1.2, flare: 1, top: 0.55, phase: 0, foot: z, footPull: 20 }, co = { swirl: 0.5, pow: 0.7, top: 0.5, phase: 0, foot: z, footPull: 20 };
      const sh = { n: 16, seed: Math.random() * 30, p0: 0, p1: 0.2, p2: 0.3 };
      c.run(0.7, (r) => {
        const t = r.t, e = 1 - Math.pow(1 - Math.min(1, t / 0.14), 3), fade = 1 - r.k * r.k;
        fo.phase = c.T * 8 + i; co.phase = c.T * 11;
        G.tube(x, y, z, 230 * e, 32, 14, ELEMB.E, fade, fo);
        G.tube(x, y, z, 150 * e, 9, 4, FCORE, fade, co);
        if (t < 0.4) { const q = t / 0.4; sh.p0 = 0.15 + 0.85 * (1 - (1 - q) * (1 - q)); G.disc(x, y, z, 110, 2, INV.E, 1 - q, sh); }
      });
      c.pillar(x, y, z, pal, { count: 30, radius: 22, up: [400, 1100] });
      c.embers(x, y, z + 30, pal, { count: 12 });
      c.glow(x, y, z + 60, pal.lt, 260, 0.7, 0.7, { elem: 'E' });
      c.smoke(x, y, z + 20, { count: 6 });
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
      c.glow(x, y, z0 + 90, pal.lt, 800, 1.5, 0.6, { elem: 'E' });
      P.burst(c.pix(pal, { x, y, z: z0 + 20, count: c.G.lod ? 220 : 90, shape: 'ring', radius: 84, speed: [150, 500], up: [250, 600], gravity: -650, drag: 0.6, px: [0.8, 2.4], linger: [0.6, 1.6] }));
      c.dust(x, y, z0, { count: 26, speed: [224, 500], life: [1.2, 1.8] });
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
      c.flash(su.x, su.y, z, PAL.ice, 50, 0.2);
      for (const [pl, o] of [[PAL.ice, 0], [PAL.arc, 1], [PAL.fire, 2]]) c.ring(su.x, su.y, su.z || 0, pl, { R: 100 + o * 30, life: [0.3 + o * 0.08, 0.5 + o * 0.08] });
      c.glow(su.x, su.y, z, PAL.ice.lt, 340, 1.0, 0.5);
    }
  });
  const BLAST_PALS = [PAL.ice, PAL.arc, PAL.fire];
  const SW = 2.2, SIN_HALF = Math.sin(SW / 2);
  const BL = { sweep: SW, start: 0, edge: 0.28, swirl: 0.5, pow: 1.1, top: 1, phase: 0, foot: 0, footPull: 20 };
  const BLE = { sweep: SW, start: 0, edge: 0.3, swirl: 0, pow: 0.6, top: 1, foot: 0, footPull: 20 }, BLB = { sweep: SW, start: 0, edge: 0.3, swirl: 0.4, pow: 1.4, top: 1, phase: 0, foot: 0, footPull: 20 };
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
      G.tube(cx, cy, gz + 6, 84, Rc, Rc + 6, INV.body, 0.95, BL);
      G.tube(cx, cy, gz + 4, 26, Rc + 12, Rc + 14, INV.edge, 0.85, BLE);
      if (G.lod) G.tube(cx - fx * 70, cy - fy * 70, gz + 6, 60, Rc, Rc + 4, INV.body, 0.45, BLB);
      const n = cc.n(220 * dt);
      for (let i = 0; i < n; i++) {
        const s = rnd(-1, 1), back = s * s * w * 0.5;
        const pl = BLAST_PALS[(Math.random() * 3) | 0];
        P.spawn(cc.pix(pl, { x: p.x + px * s * w - fx * back, y: p.y + py * s * w - fy * back, z: gz + rnd(10, 90), life: [0.25, 0.5], px: 1,
          vel: [fx * 90, fy * 90, 0], speed: 0, up: [0, 30], drag: 1.6, settle: false }));
      }
    },
    hit(cc, p) { for (const pl of BLAST_PALS) cc.ring(p.x, p.y, cc.zAt(p.x, p.y), pl, { R: 140 }); cc.flash(p.x, p.y, p.z, PAL.ice, 40, 0.15); },
  });
}
