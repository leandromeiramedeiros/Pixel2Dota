// Lina: Dragon Slave (linear fire wave), Light Strike Array (telegraph -> fire pillar), Fiery Soul (stacking flame aura), Laguna Blade.
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, pal = PAL.fire, slaveW = new Map();

  // ------------------------------------------------------------------------------------------------ dragon slave: x2,y2, r = half width, dur = travel
  R.spell('lina_dragon_slave', (ev, su) => {
    if (!su) return;
    if (ev.r) slaveW.set(su.id, ev.r);
    const a = ev.x2 != null ? c.ang(su.x, su.y, ev.x2, ev.y2) : su.facing || 0, z = c.chest(su);
    const px = su.x + Math.cos(a) * 40, py = su.y + Math.sin(a) * 40;
    c.flash(px, py, z, pal, 60, 0.22);
    P.burst({ x: px, y: py, z, count: 30, shape: 'cone', dir: [Math.cos(a), Math.sin(a), 0], spread: 0.5, life: [0.25, 0.55], size0: [14, 24], size1: 4, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, speed: [260, 620], drag: 2.4, mode: 'glow' });
    c.sparks(px, py, z, pal, { count: 14, speed: [200, 520] });
  });
  R.proj('lina_dragon_slave', {
    frames: 'fireball', fps: 14, scale: 2.2, spin: 0, tint: [1.3, 0.75, 0.4], emit: 1.0, pal, z: 70,
    light: { col: pal.lt, radius: 420, int: 1.1, elem: 'E' },
    trail(cc, p, dt) {
      const n = cc.n(240 * dt); if (!n) return;
      const nx = -p.dy, ny = p.dx, w = slaveW.get(p.sid) || 120;
      for (let i = 0; i < n; i++) {
        const s = rnd(-1, 1), back = rnd(0, p.sp * dt);
        const k = Math.abs(s);   // crescent: wings trail behind the head
        P.spawn({ x: p.x + nx * s * w - p.dx * (back + k * 90), y: p.y + ny * s * w - p.dy * (back + k * 90), z: p.z + rnd(-14, 24), life: [0.3, 0.6], size0: [26, 44], size1: 6, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, mode: 'glow', speed: [0, 30], up: [10, 60], drag: 2 });
      }
      if (Math.random() < dt * 22) P.spawn({ x: p.x + rnd(-w, w) * 0.6, y: p.y + rnd(-w, w) * 0.6, z: p.z, life: [0.3, 0.7], size0: 8, size1: 2, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, stamp: 'p_ember', speed: [20, 90], up: [60, 160], gravity: -200 });
    },
    hit(cc, p) { cc.flash(p.x, p.y, p.z, pal, 50, 0.2); cc.embers(p.x, p.y, p.z, pal, { count: 12, speed: [80, 260] }); },
  });

  // ------------------------------------------------------------------------------------------------ light strike array: x,y,r, dur = delay
  R.spell('lina_light_strike_array', (ev, su) => {
    const p = c.at(ev, su, null); if (!p) return;
    const x = p.x, y = p.y, rad = ev.r || 225, dur = ev.dur || 0.5, z = c.zAt(x, y);
    c.ringDecal(x, y, rad, dur + 0.1, [3.4, 1.2, 0.5], { emit: 1.4, pulse: 0.3, pulseHz: 14, fadeOut: 0.05 });
    c.decal(x, y, 'decal_ring_target', rad * 0.6 / 78, dur, { tint: [3.6, 1.8, 0.7], emit: 1.2, spin: -2, fadeOut: 0.05 });
    const lt = c.glow(x, y, z + 30, pal.lt, rad * 2.2, 0.2, dur, { mode: 'flat', elem: 'E' });
    c.run(dur, (r, dt) => {
      lt.int = 0.2 + 0.9 * r.k;
      const n = c.n((24 + 80 * r.k) * dt);
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU), rr = rad * Math.sqrt(Math.random()); P.spawn({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: z + 4, life: [0.3, 0.7], size0: [8, 12], size1: 1, col0: pal.hot, col1: pal.low, a0: 1, a1: 0, mode: 'glow', speed: 0, up: [70, 200 + 300 * r.k] }); }
    });
    c.later(dur, () => {
      P.burst({ x, y, z, x2: x, y2: y, z2: z + 1500, shape: 'line', count: 90, life: [0.3, 0.55], size0: [rad * 0.28, rad * 0.4], size1: rad * 0.12, col0: pal.hot, col1: pal.mid, a0: 0.5, a1: 0, speed: [0, 20], mode: 'glow', jitter: 8 });
      c.flash(x, y, z + 80, pal, rad * 0.9, 0.35);
      c.ring(x, y, z, pal, { R: rad * 1.25, life: [0.35, 0.6] });
      c.embers(x, y, z + 30, pal, { count: 50, speed: [160, 520] });
      c.smoke(x, y, z + 20, { count: 8 });
      c.glow(x, y, z + 110, pal.lt, rad * 3.2, 1.3, 0.6, { elem: 'E' });
      c.decal(x, y, 'decal_scorch', rad / 80, 5, { tint: [1.2, 0.6, 0.25], emit: 0.7, fadeOut: 0.6 });
    });
  });

  // ------------------------------------------------------------------------------------------------ fiery soul (passive): stack flare
  R.spell('lina_fiery_soul', (ev, su) => {
    if (!su) return;
    const z = su.z || 0;
    c.flash(su.x, su.y, c.chest(su), pal, 50, 0.2);
    c.swirl(su.id, 1.4, pal, { r: 30, rate: 30, speed: 6, stamp: 'p_ember' });
    c.ring(su.x, su.y, z, pal, { R: 110, life: [0.3, 0.5] });
  });

  // ------------------------------------------------------------------------------------------------ laguna blade: x2,y2 = target pos, dur = delay
  R.spell('lina_laguna_blade', (ev, su, tu) => {
    if (!su) return;
    const x1 = ev.x2 != null ? ev.x2 : tu ? tu.x : su.x, y1 = ev.y2 != null ? ev.y2 : tu ? tu.y : su.y, dur = ev.dur || 0.6;
    const sid = su.id, tz = tu ? c.chest(tu) : c.zAt(x1, y1) + 90, arcP = PAL.arc;
    // charge: crackling gather on the hands
    c.run(dur, (r, dt) => {
      const u = c.unit(sid); if (!u) return false;
      const n = c.n((40 + 120 * r.k) * dt), z = c.chest(u) + 10;
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU), d = rnd(50, 110) * (1 - r.k * 0.5); P.spawn({ x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: z + rnd(-30, 30), life: [0.15, 0.3], size0: [7, 11], size1: 1, col0: arcP.hot, col1: arcP.mid, a0: 1, a1: 0, mode: 'glow', speed: 0, vel: [-Math.cos(a) * d * 4, -Math.sin(a) * d * 4, 0] }); }
      if (Math.random() < dt * 16) { const a = rnd(0, TAU); c.bolt(u.x, u.y, z, u.x + Math.cos(a) * 70, u.y + Math.sin(a) * 70, z + rnd(-30, 40), arcP, { jag: 10, noLights: true, thick: 0.6 }); }
      c.lightNow(u.x, u.y, z, arcP.lt, 220 + 160 * r.k, 0.3 + 0.8 * r.k, 0);
    });
    c.later(dur, () => {
      const u = c.unit(sid), sx = u ? u.x : su.x, sy = u ? u.y : su.y, sz = u ? c.chest(u) : c.chest(su);
      const t2 = tu && c.unit(tu.id), ex = t2 ? t2.x : x1, ey = t2 ? t2.y : y1, ez = t2 ? c.chest(t2) : tz;
      for (let i = 0; i < 3; i++) c.bolt(sx, sy, sz, ex, ey, ez, i ? arcP : PAL.steel, { jag: 36, thick: i ? 1.4 : 0.9, lightR: 460, light: 1.1 });
      c.line(sx, sy, sz, ex, ey, ez, arcP, { life: [0.2, 0.45], size0: [26, 40], count: Math.round(Math.hypot(ex - sx, ey - sy) * 0.6) });
      c.flash(ex, ey, ez, arcP, 130, 0.35);
      c.ring(ex, ey, c.zAt(ex, ey), arcP, { R: 220, life: [0.4, 0.65] });
      c.stars(ex, ey, ez, PAL.steel, { count: 14 });
      c.sparks(ex, ey, ez, arcP, { count: 26, speed: [160, 480] });
      c.glow(ex, ey, ez, arcP.lt, 560, 2.2, 0.55, { elem: 'W' });
      c.flash(sx, sy, sz, arcP, 70, 0.2);
    });
  });
}
