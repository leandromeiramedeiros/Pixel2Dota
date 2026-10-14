// Mirana: Starstorm (blue-white meteors, then a second star), Sacred Arrow (moonlit arrow with a trail), Leap (dust puff + streak), Moonlight Shadow (violet shimmer).
// Events: starfall cast {r}; sub 'rain' {x,y,r} (visual only), 'star' {t,x,y,r}, 'star2' {t,x,y,r}; arrow cast {x2,y2,r,dur}, sub 'hit' {t,x,y,dur,r};
//         leap {x2,y2,r,dur}; invis sub 'fade' {t,x,y,dur} once per allied hero.
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, steel = PAL.steel, ice = PAL.ice, arc = PAL.arc;
  // moonlight palette: silver-blue core, violet fringe
  const moon = { hot: [3.4, 3.8, 6.2], mid: [1.4, 1.8, 4.6], low: [0.5, 0.7, 2.4], dim: [0.2, 0.25, 1], lt: [0.62, 0.74, 1], ramp: ice.ramp };

  // ------------------------------------------------------------------------------------------------ starstorm
  /** One falling star: streak from the sky (down-and-left of the target) landing at (x,y) after `fall` seconds, then an impact of radius r. */
  const star = (x, y, r, fall, big) => {
    const z0 = c.zAt(x, y), H = big ? 1100 : 900, ox = big ? 380 : 300, oy = big ? 120 : 90;
    c.ringDecal(x, y, r * 0.85, fall + 0.1, [1.4, 2.0, 3.6], { emit: 1.1, fadeOut: 0.1, grow: [1.2, 0.6] });
    c.run(fall, (rec, dt) => {
      const k = rec.k, e = k * k, hx = x + ox * (1 - e), hy = y + oy * (1 - e), hz = z0 + 8 + H * (1 - e);
      P.spawn({ x: hx, y: hy, z: hz, life: [0.06, 0.12], size0: [big ? 34 : 24, big ? 46 : 32], size1: 8, col0: steel.hot, col1: moon.mid, a0: 1, a1: 0, mode: 'glow', speed: 0, noScale: true });
      for (let n = c.n(130 * dt * 3); n > 0; n--) {   // comet tail along the path
        const b = Math.random() * 0.12, e2 = Math.max(0, k - b) ** 2;
        P.spawn(c.pix(moon, { x: x + ox * (1 - e2) + rnd(-6, 6), y: y + oy * (1 - e2) + rnd(-6, 6), z: z0 + 8 + H * (1 - e2) + rnd(-6, 6), life: [0.15, 0.4], speed: [0, 30], gravity: -120, drag: 2, settle: false }));
      }
      c.lightNow(hx, hy, hz, moon.lt, 260, 0.9, 0);
    });
    c.later(fall, () => {
      c.flash(x, y, z0 + 40, moon, r * 0.5, 0.25);
      c.ring(x, y, z0, moon, { R: r, life: [0.3, 0.55] });
      c.ring(x, y, z0, arc, { R: r * 0.6, life: [0.25, 0.45] });
      c.sparks(x, y, z0 + 20, moon, { count: big ? 30 : 20, speed: [160, 520] });
      c.stars(x, y, z0 + 30, steel, { count: big ? 14 : 8 });
      c.dust(x, y, z0, { count: 6 });
      c.glow(x, y, z0 + 60, moon.lt, r * 3, big ? 1.8 : 1.3, 0.5);
      c.decal(x, y, 'decal_scorch', r / 160, 2.5, { tint: [0.6, 0.8, 1.6], emit: 0.5, fadeOut: 0.6 });
    });
  };
  R.spell('mirana_starfall', (ev, su) => {
    if (ev.sub === 'rain') { star(ev.x, ev.y, ev.r || 90, 0.35 + Math.random() * 0.2, false); return; }
    if (ev.sub === 'star') { star(ev.x, ev.y, ev.r || 120, 0.25, false); return; }
    if (ev.sub === 'star2') { star(ev.x, ev.y, ev.r || 140, 0.25, true); return; }
    if (!su) return;
    const z = su.z || 0, rad = ev.r || 650;
    c.flash(su.x, su.y, c.chest(su) + 30, moon, 90, 0.3);
    c.ring(su.x, su.y, z, arc, { R: rad, life: [0.5, 0.8], count: 150, px: [0.8, 1.2] });
    c.ringDecal(su.x, su.y, rad, 0.9, [0.5, 0.8, 1.6], { emit: 0.5, fadeOut: 0.6 });
    c.pillar(su.x, su.y, z, moon, { count: 40, radius: 30, up: [300, 900] });
    c.glow(su.x, su.y, z + 120, moon.lt, 700, 1.4, 0.7);
  });

  // ------------------------------------------------------------------------------------------------ sacred arrow
  R.spell('mirana_arrow', (ev, su) => {
    if (ev.sub === 'hit') {   // the long stun lands: ring + stars, brighter the longer the stun
      const z = (tuz(ev)), k = Math.min(1, (ev.dur || 1) / 5);
      c.flash(ev.x, ev.y, z, moon, 40 + 40 * k, 0.18);
      c.ring(ev.x, ev.y, c.zAt(ev.x, ev.y), moon, { R: 110 + 90 * k, life: [0.3, 0.5] });
      c.stars(ev.x, ev.y, z, steel, { count: 8 + Math.round(10 * k) });
      c.sparks(ev.x, ev.y, z, moon, { count: 14, speed: [140, 420] });
      c.glow(ev.x, ev.y, z, moon.lt, 300, 0.8, 0.35);
      return;
    }
    if (!su) return;
    const a = ev.x2 != null ? c.ang(su.x, su.y, ev.x2, ev.y2) : su.facing || 0, z = c.chest(su);
    const px = su.x + Math.cos(a) * 46, py = su.y + Math.sin(a) * 46;
    c.flash(px, py, z, moon, 46, 0.14);
    P.burst(c.pix(moon, { x: px, y: py, z, count: 30, shape: 'cone', dir: [Math.cos(a), Math.sin(a), 0], spread: 0.3, life: [0.15, 0.4], speed: [200, 480], drag: 2.4, gravity: -200 }));
    c.stars(px, py, z, steel, { count: 5 });
  });
  const tuz = (ev) => { const u = c.unit(ev.t); return u ? c.chest(u) : c.zAt(ev.x, ev.y) + 80; };
  R.proj('mirana_arrow', {
    frames: 'arrow_frost', fps: 12, scale: 1.3, tint: [0.9, 1.1, 1.9], emit: 1.3, pal: moon, z: 80,
    light: { col: moon.lt, radius: 300, int: 0.55 },
    trail(cc, p, dt) {
      for (let n = cc.n(150 * dt * 3); n > 0; n--) {   // long silver streak plus a few violet motes
        const a = Math.random() * p.sp * dt;
        P.spawn(cc.pix(Math.random() < 0.3 ? arc : moon, { x: p.x - p.dx * a + rnd(-4, 4), y: p.y - p.dy * a + rnd(-4, 4), z: p.z + rnd(-4, 4), life: [0.3, 0.7], speed: [0, 14], up: [0, 20], gravity: -40, drag: 2.4, settle: false }));
      }
      if (Math.random() < dt * 14) P.spawn({ x: p.x - p.dx * 40, y: p.y - p.dy * 40, z: p.z, life: [0.3, 0.5], size0: 11, size1: 3, col0: steel.hot, col1: moon.mid, a0: 1, a1: 0, stamp: 'p_star', spin: [-4, 4], speed: [0, 20], settle: false });
    },
    hit(cc, p) { cc.flash(p.x, p.y, p.z, moon, 30, 0.12); cc.sparks(p.x, p.y, p.z, moon, { count: 8, speed: [80, 260] }); },
  });

  // ------------------------------------------------------------------------------------------------ leap: x2,y2,r,dur
  R.spell('mirana_leap', (ev, su) => {
    if (!su) return;
    const sid = su.id, dur = ev.dur || 0.4, z = su.z || 0;
    c.dust(su.x, su.y, z, { count: 18, radius: 40, size0: [26, 40], size1: [60, 90] });
    c.ring(su.x, su.y, z, PAL.earth, { R: 120, life: [0.25, 0.4] });
    c.sparks(su.x, su.y, z + 10, moon, { count: 8, speed: [80, 260] });
    c.run(dur, (r, dt) => {   // wind streaks and kicked-up dust behind the cat
      const u = c.unit(sid); if (!u) return false;
      for (let n = c.n(120 * dt * 3); n > 0; n--) P.spawn(c.pix(moon, { x: u.x + rnd(-14, 14), y: u.y + rnd(-14, 14), z: (u.z || 0) + rnd(10, 110), life: [0.15, 0.4], speed: [0, 20], settle: false }));
      if (Math.random() < dt * 18) c.dust(u.x, u.y, u.z || 0, { count: 2, radius: 10 });
    });
    if (ev.x2 != null) c.later(dur, () => {
      const u = c.unit(sid), x = u ? u.x : ev.x2, y = u ? u.y : ev.y2, zz = c.zAt(x, y);
      c.dust(x, y, zz, { count: 20, radius: 40, size0: [26, 40], size1: [64, 96] });
      c.ring(x, y, zz, PAL.earth, { R: 130, life: [0.25, 0.4] });
      c.sparks(x, y, zz + 10, moon, { count: 10, speed: [100, 300] });
    });
  });

  // ------------------------------------------------------------------------------------------------ moonlight shadow: sub 'fade' on each ally, dur = fade delay
  R.spell('mirana_invis', (ev, su, tu) => {
    const u = tu || su; if (!u) return;
    const id = u.id, dur = Math.max(0.5, ev.dur || 1.5);
    c.flash(u.x, u.y, c.chest(u), moon, 60, 0.3);
    c.ring(u.x, u.y, u.z || 0, arc, { R: 130, life: [0.4, 0.7] });
    c.glow(u.x, u.y, c.chest(u), arc.lt, 340, 0.8, dur + 0.4, { mode: 'fade', follow: id, dz: 0 });
    c.run(dur + 0.3, (r, dt) => {   // faint violet shimmer that gathers, then the unit dissolves into it
      const v = c.unit(id); if (!v || v.hp <= 0) return false;
      const k = 1 - Math.abs(2 * r.k - 1) * 0.6, z0 = v.z || 0;
      for (let n = c.n(110 * k * dt * 3); n > 0; n--) {
        const a = rnd(0, TAU), d = rnd(14, 46);
        P.spawn(c.pix(Math.random() < 0.6 ? arc : moon, { x: v.x + Math.cos(a) * d, y: v.y + Math.sin(a) * d, z: z0 + rnd(4, 150), life: [0.4, 0.9], speed: [0, 14], up: [10, 70], drag: 1.2, settle: false }));
      }
      if (Math.random() < dt * 8) P.spawn({ x: v.x + rnd(-24, 24), y: v.y + rnd(-24, 24), z: z0 + rnd(30, 150), life: [0.4, 0.8], size0: 9, size1: 2, col0: moon.hot, col1: arc.mid, a0: 1, a1: 0, stamp: 'p_star', spin: [-3, 3], speed: [0, 12], settle: false });
    });
  });
}
