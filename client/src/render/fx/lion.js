// Lion: Earth Spike (impale), Hex (voodoo), Mana Drain (channel beam), Finger of Death.
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, earth = PAL.earth, dark = PAL.dark, fel = PAL.pink, spikeW = new Map();

  // ------------------------------------------------------------------------------------------------ impale: x2,y2,r half width,dur travel (PROJ lion_impale carries the spikes)
  R.spell('lion_impale', (ev, su) => {
    if (!su) return;
    if (ev.r) spikeW.set(su.id, ev.r);
    const a = ev.x2 != null ? c.ang(su.x, su.y, ev.x2, ev.y2) : su.facing || 0, x = su.x + Math.cos(a) * 50, y = su.y + Math.sin(a) * 50, z = su.z || 0;
    c.flash(x, y, c.chest(su), dark, 40, 0.15);
    c.dust(x, y, z, { count: 12 });
  });
  R.proj('lion_impale', {
    frames: null, sp: 1500,
    trail(cc, p, dt) {
      // spikes erupt along the path
      const w = spikeW.get(p.sid) || 70, step = p.sp * dt, nsp = Math.max(1, Math.round(step / 70));
      for (let i = 0; i < nsp; i++) {
        const f = (i + Math.random()) / nsp, x = p.x - p.dx * step * f, y = p.y - p.dy * step * f, z = cc.zAt(x, y);
        const off = rnd(-w, w) * 0.6, sx = x - p.dy * off, sy = y + p.dx * off;
        P.burst(c.pix(dark, { x: sx, y: sy, z: z + 2, count: 28, shape: 'disc', radius: 8, life: [0.35, 0.65], speed: [0, 8], up: [420, 760], drag: 3.2, gravity: -900, linger: [0.4, 1] }));
        P.burst({ x: sx, y: sy, z: z + 2, count: 3, shape: 'disc', radius: 10, life: [0.5, 0.9], size0: [10, 15], size1: 6, col0: earth.hot, col1: earth.low, a0: 1, a1: 0, speed: [30, 90], up: [250, 560], gravity: -900, drag: 0.8, stamp: 'p_shard_ice', spin: [-6, 6], rot: [0, TAU] });
        if (Math.random() < 0.5) cc.dust(x, y, z, { count: 3, radius: w * 0.5 });
      }
      cc.lightNow(p.x, p.y, cc.zAt(p.x, p.y) + 80, dark.lt, 300, 0.7, 0);
    },
    hit() {},
  });

  // ------------------------------------------------------------------------------------------------ hex: t, dur
  R.spell('lion_voodoo', (ev, su, tu) => {
    const t = tu; if (!t) return;
    const z = c.chest(t), pal = PAL.green;
    c.flash(t.x, t.y, z, pal, 80, 0.3);
    c.blob(t.x, t.y, z, pal, { count: 26, radius: 24 });
    c.smoke(t.x, t.y, z, { count: 12, radius: 24 }, PAL.smoke);
    c.leaves(t.x, t.y, z, { count: 12 });
    c.stars(t.x, t.y, z + 20, PAL.gold, { count: 10 });
    c.ring(t.x, t.y, t.z || 0, pal, { R: 130, life: [0.3, 0.5] });
    c.glow(t.x, t.y, z, pal.lt, 340, 1.4, 0.5);
    if (su) c.sparks(su.x, su.y, c.chest(su), pal, { count: 8 });
  });

  // ------------------------------------------------------------------------------------------------ mana drain: channel dur, t
  R.spell('lion_mana_drain', (ev, su, tu) => {
    if (!su || !tu) return;
    const sid = su.id, tid = tu.id, dur = ev.dur || 5, pal = PAL.mana;
    c.flash(su.x, su.y, c.chest(su), pal, 40, 0.15);
    c.run(dur, (r, dt) => {
      const a = c.unit(sid), b = c.unit(tid);
      if (!a || !b || a.hp <= 0 || b.hp <= 0) return false;
      if (a.visible === false && b.visible === false) return;
      const dx = a.x - b.x, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1;
      if (len > 1400) return false;
      const z0 = c.chest(b), z1 = c.chest(a) + 10, n = c.n(Math.min(480, 150 + len * 0.5) * dt);
      for (let i = 0; i < n; i++) {   // motes streaming from the victim to Lion along a lazy sine
        const f = Math.random(), wob = Math.sin(f * 9 + c.T * 8) * 18 * Math.sin(f * Math.PI);
        P.spawn(c.pix(pal, { x: b.x + dx * f - dy / len * wob, y: b.y + dy * f + dx / len * wob, z: z0 + (z1 - z0) * f + Math.sin(f * Math.PI) * 24, life: [0.15, 0.3], speed: 0, vel: [dx / len * 140, dy / len * 140, 0] }));
      }
      for (let q = c.n(30 * dt); q > 0; q--) P.spawn(c.pix(pal, { x: b.x, y: b.y, z: z0, life: [0.4, 0.8], speed: [30, 110], up: [20, 120], gravity: -400, linger: [0.4, 1] }));
      c.lightNow(b.x, b.y, z0, pal.lt, 200, 0.5, 0);
      c.lightNow(a.x, a.y, z1, pal.lt, 200, 0.6, 0);
    });
  });

  // ------------------------------------------------------------------------------------------------ finger of death: x2,y2 target pos, dur = delay
  R.spell('lion_finger_of_death', (ev, su, tu) => {
    if (!su) return;
    const sid = su.id, dur = ev.dur || 0.25, x1 = ev.x2 != null ? ev.x2 : tu ? tu.x : su.x, y1 = ev.y2 != null ? ev.y2 : tu ? tu.y : su.y;
    c.run(dur, (r, dt) => {
      const u = c.unit(sid); if (!u) return false;
      const n = c.n(260 * dt), z = c.chest(u) + 10, a0 = c.T * 14;
      for (let i = 0; i < n; i++) { const a = a0 + (i / Math.max(1, n)) * TAU, d = 50 * (1 - r.k * 0.6); P.spawn(c.pix(fel, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z, life: [0.1, 0.2], speed: 0, vel: [-Math.cos(a) * 150, -Math.sin(a) * 150, 0] })); }
      c.lightNow(u.x, u.y, z, fel.lt, 220 + 140 * r.k, 0.4 + 0.8 * r.k, 0);
    });
    c.later(dur, () => {
      const u = c.unit(sid), sx = u ? u.x : su.x, sy = u ? u.y : su.y, sz = (u ? c.chest(u) : c.chest(su)) + 10;
      const t2 = tu && c.unit(tu.id), ex = t2 ? t2.x : x1, ey = t2 ? t2.y : y1, ez = t2 ? c.chest(t2) : c.zAt(ex, ey) + 90;
      const len = Math.hypot(ex - sx, ey - sy);
      c.line(sx, sy, sz, ex, ey, ez, fel, { life: [0.2, 0.45], size0: [12, 20], count: Math.round(len * 0.1) });
      for (let i = 0; i < 2; i++) c.bolt(sx, sy, sz, ex, ey, ez, i ? PAL.steel : fel, { jag: 30, thick: i ? 0.35 : 0.7, lightR: 420, light: 0.8, noLights: i > 0 });
      c.flash(ex, ey, ez, fel, 90, 0.3);
      c.ring(ex, ey, c.zAt(ex, ey), fel, { R: 200, life: [0.35, 0.6] });
      c.ring(ex, ey, c.zAt(ex, ey), dark, { R: 120, life: [0.3, 0.5] });
      c.pillar(ex, ey, c.zAt(ex, ey), fel, { count: 40, radius: 24, up: [400, 1000] });
      c.stars(ex, ey, ez, PAL.steel, { count: 14 });
      c.sparks(ex, ey, ez, fel, { count: 24, speed: [160, 460] });
      c.glow(ex, ey, ez, fel.lt, 520, 1.4, 0.5);
      c.flash(sx, sy, sz, fel, 60, 0.18);
    });
  });
}
