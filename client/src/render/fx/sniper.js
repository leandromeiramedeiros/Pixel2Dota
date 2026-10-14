// Sniper: Shrapnel (shell -> lingering zone), Headshot / Take Aim (passive pops), Assassinate (heavy tracking bullet).
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, pal = PAL.sun;
  const muzzle = (su, ang) => {
    const z = c.chest(su), x = su.x + Math.cos(ang) * 60, y = su.y + Math.sin(ang) * 60;
    c.flash(x, y, z, pal, 44, 0.12);
    P.burst({ x, y, z, count: 8, shape: 'cone', dir: [Math.cos(ang), Math.sin(ang), 0.1], spread: 0.35, life: [0.1, 0.25], size0: [5, 9], size1: 1, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, speed: [200, 520], drag: 3, stamp: 'p_spark' });
  };

  // ------------------------------------------------------------------------------------------------ shrapnel: x,y,r,dur ; sub 'zone' when it lands
  R.spell('sniper_shrapnel', (ev, su) => {
    const p = c.at(ev, su, null); if (!p) return;
    const x = p.x, y = p.y, rad = ev.r || 400, z = c.zAt(x, y);
    if (ev.sub !== 'zone') {
      if (su) muzzle(su, c.ang(su.x, su.y, x, y));
      const delay = 1.0;
      c.ringDecal(x, y, rad, delay, [1.6, 1.2, 0.5], { emit: 0.9, fadeOut: 0.1, pulse: 0.2, pulseHz: 10 });
      // the shell: a falling streak of glow
      c.run(delay, (r) => {
        const k = r.k; if (k < 0.55) return;
        const h = 1100 * (1 - (k - 0.55) / 0.45);
        P.spawn({ x, y, z: z + h, life: [0.12, 0.25], size0: [14, 20], size1: 4, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, mode: 'glow', speed: 0 });
        P.spawn({ x, y, z: z + h + 40, life: [0.1, 0.2], size0: [7, 10], size1: 1, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, mode: 'glow', speed: 0 });
      });
      return;
    }
    const dur = ev.dur || 10;
    c.flash(x, y, z + 40, pal, rad * 0.5, 0.3);
    c.ring(x, y, z, pal, { R: rad, life: [0.4, 0.7] });
    c.smoke(x, y, z + 20, { count: 10, radius: rad * 0.4 });
    c.sparks(x, y, z + 20, pal, { count: 40, speed: [200, 600] });
    c.glow(x, y, z + 60, pal.lt, rad * 2, 1.6, 0.6);
    c.decal(x, y, 'decal_scorch', rad / 80, dur, { tint: [1.2, 0.9, 0.4], emit: 0.5, fadeOut: 0.12 });
    c.ringDecal(x, y, rad, dur, [1.3, 1.0, 0.45], { emit: 0.9, fadeOut: 0.1, fadeIn: 0.2 });
    const lt = c.glow(x, y, z + 60, pal.lt, rad * 1.3, 0.35, dur, { mode: 'flat' });
    c.run(dur, (r, dt) => {
      const n = c.n(26 * dt);
      for (let i = 0; i < n; i++) {   // drifting shrapnel glints over the zone
        const a = rnd(0, TAU), d = rad * Math.sqrt(Math.random());
        P.spawn({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: z + rnd(4, 90), life: [0.4, 0.9], size0: [4, 7], size1: 1, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, stamp: 'p_spark', speed: [0, 20], up: [10, 60], spin: [-4, 4] });
      }
      if (Math.random() < dt * 6) { const a = rnd(0, TAU), d = rad * Math.sqrt(Math.random()); c.smoke(x + Math.cos(a) * d, y + Math.sin(a) * d, z + 6, { count: 1, size0: [20, 30], life: [0.8, 1.4] }); }
      lt.int = 0.3 + 0.1 * Math.sin(c.T * 7);
    });
  });

  R.spell('sniper_headshot', (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    const z = c.head(t) - 30;
    c.flash(t.x, t.y, z, pal, 36, 0.12);
    c.stars(t.x, t.y, z, pal, { count: 6 });
    c.sparks(t.x, t.y, z, pal, { count: 8 });
  });

  R.spell('sniper_take_aim', (ev, su) => {
    if (!su) return;
    c.swirl(su.id, 0.8, pal, { r: 26, rate: 24, speed: 8, stamp: 'p_star', size: 9 });
    c.ring(su.x, su.y, su.z || 0, pal, { R: 90, life: [0.3, 0.5] });
  });

  // ------------------------------------------------------------------------------------------------ assassinate: tracking round, SPELL carries t
  R.spell('sniper_assassinate', (ev, su, tu) => {
    if (!su) return;
    muzzle(su, c.ang(su.x, su.y, tu ? tu.x : su.x + Math.cos(su.facing || 0), tu ? tu.y : su.y + Math.sin(su.facing || 0)));
    const z = c.chest(su);
    c.ring(su.x, su.y, su.z || 0, pal, { R: 120, life: [0.3, 0.5] });
    c.glow(su.x, su.y, z, pal.lt, 340, 1.4, 0.3);
    if (tu) c.ringDecal(tu.x, tu.y, 70, 0.5, [3, 0.8, 0.5], { emit: 1.2, fadeOut: 0.5, grow: [1.2, 0.5] });
  });
  R.proj('sniper_assassinate', {
    frames: 'assassinate_bullet', fps: 16, scale: 2.2, tint: [2.2, 1.7, 1.2], emit: 3, pal, arc: 0,
    light: { col: pal.lt, radius: 330, int: 1.0 },
    trail: { pal, rate: 160, size: [6, 11], life: [0.15, 0.35], spread: 1.5 },
    hit(cc, p) {
      const z = p.z;
      cc.flash(p.x, p.y, z, pal, 120, 0.3);
      cc.ring(p.x, p.y, cc.zAt(p.x, p.y), pal, { R: 190, life: [0.35, 0.55] });
      cc.stars(p.x, p.y, z, PAL.gold, { count: 12 });
      cc.sparks(p.x, p.y, z, pal, { count: 30, speed: [200, 560] });
      cc.glow(p.x, p.y, z, pal.lt, 480, 2, 0.45);
    },
  });
}
