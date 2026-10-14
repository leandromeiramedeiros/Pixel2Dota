// Drow Ranger: Frost Arrows (chill pop), Gust (silence wave), Multishot (channel fan), Marksmanship (proc).
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, pal = PAL.ice, steel = PAL.steel, waveW = new Map();
  const arrowDef = {
    frames: 'arrow_frost', fps: 12, scale: 1.1, tint: [1.2, 1.5, 2], emit: 2.2, pal,
    light: { col: pal.lt, radius: 200, int: 0.55, elem: 'Q' },
    trail: { pal, rate: 50, size: [6, 10], stamp: 'p_snow' },
    hit(cc, p) {
      cc.sparks(p.x, p.y, p.z, pal, { count: 8, speed: [60, 220] });
      cc.flash(p.x, p.y, p.z, pal, 30, 0.1);
    },
  };

  // ------------------------------------------------------------------------------------------------ frost arrows (autocast pop on target)
  R.spell('drow_ranger_frost_arrows', (ev, su, tu) => {
    const t = tu || (ev.x != null ? { x: ev.x, y: ev.y, z: c.zAt(ev.x, ev.y) } : null); if (!t) return;
    const z = (tu ? c.chest(tu) : (t.z || 0) + 80);
    c.flash(t.x, t.y, z, pal, 60, 0.2);
    c.shards(t.x, t.y, z, pal, { count: 12, speed: [80, 260] });
    c.ring(t.x, t.y, t.z || 0, pal, { R: 80, life: [0.25, 0.4] });
    c.glow(t.x, t.y, z, pal.lt, 240, 1.0, 0.4);
  });

  // ------------------------------------------------------------------------------------------------ gust / wave of silence: x2,y2,r half width,dur
  R.spell('drow_ranger_wave_of_silence', (ev, su) => {
    if (!su) return;
    if (ev.r) waveW.set(su.id, ev.r);
    const a = ev.x2 != null ? c.ang(su.x, su.y, ev.x2, ev.y2) : su.facing || 0, z = c.chest(su) - 10;
    const x = su.x + Math.cos(a) * 50, y = su.y + Math.sin(a) * 50;
    c.flash(x, y, z, pal, 60, 0.22);
    P.burst({ x, y, z, count: 26, shape: 'cone', dir: [Math.cos(a), Math.sin(a), 0], spread: 0.7, life: [0.3, 0.6], size0: [14, 22], size1: 4, col0: pal.hot, col1: pal.mid, a0: 0.9, a1: 0, speed: [260, 560], drag: 2.4, mode: 'glow' });
  });
  R.proj('drow_ranger_wave_of_silence', {
    frames: null, sp: 1200,
    light: { col: pal.lt, radius: 360, int: 0.8, elem: 'Q' },
    trail(cc, p, dt) {
      const w = waveW.get(p.sid) || 125, nx = -p.dy, ny = p.dx, n = cc.n(150 * dt);
      for (let i = 0; i < n; i++) {   // crescent wave front, wings swept back
        const s = rnd(-1, 1), back = Math.abs(s) * 110 + rnd(0, p.sp * dt);
        P.spawn({ x: p.x + nx * s * w - p.dx * back, y: p.y + ny * s * w - p.dy * back, z: p.z + rnd(-16, 16), life: [0.3, 0.6], size0: [16, 28], size1: 4, col0: i & 1 ? steel.hot : pal.hot, col1: pal.mid, a0: 0.8, a1: 0, mode: 'glow', speed: [0, 20], drag: 2 });
      }
      if (Math.random() < dt * 20) P.spawn({ x: p.x + nx * rnd(-w, w), y: p.y + ny * rnd(-w, w), z: p.z, life: [0.4, 0.8], size0: 8, size1: 2, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, stamp: 'p_snow', speed: [10, 50], up: [10, 50] });
    },
    hit(cc, p) { cc.ring(p.x, p.y, cc.zAt(p.x, p.y), pal, { R: 90, life: [0.25, 0.4] }); },
  });

  // ------------------------------------------------------------------------------------------------ multishot: channel dur, x2,y2 ; arrows arrive as PROJ drow_ranger_multishot
  R.proj('drow_ranger_multishot', Object.assign({}, arrowDef, { scale: 1.15, trail: { pal, rate: 40, size: [5, 9], stamp: 'p_snow' } }));
  R.spell('drow_ranger_multishot', (ev, su) => {
    if (!su) return;
    const id = su.id, dur = ev.dur || 2, a = ev.x2 != null ? c.ang(su.x, su.y, ev.x2, ev.y2) : su.facing || 0;
    c.flash(su.x, su.y, c.chest(su), pal, 50, 0.2);
    c.ring(su.x, su.y, su.z || 0, pal, { R: 120, life: [0.3, 0.5] });
    c.glow(su.x, su.y, c.chest(su), pal.lt, 320, 0.8, dur, { mode: 'flat', follow: id, dz: 90, elem: 'Q' });
    c.run(dur, (r, dt) => {   // frost gathers and spits forward with each volley
      const u = c.unit(id); if (!u || u.hp <= 0) return false;
      if (u.visible === false) return;
      const n = c.n(36 * dt), z = c.chest(u), f = u.facing != null ? u.facing : a;
      for (let i = 0; i < n; i++) {
        const sp = rnd(-0.5, 0.5);
        P.spawn({ x: u.x + Math.cos(f) * 50, y: u.y + Math.sin(f) * 50, z: z + rnd(-14, 14), life: [0.2, 0.4], size0: [6, 10], size1: 1, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, mode: 'glow', speed: 0, vel: [Math.cos(f + sp) * 340, Math.sin(f + sp) * 340, 0], drag: 2 });
      }
    });
  });

  // ------------------------------------------------------------------------------------------------ marksmanship proc: t
  R.spell('drow_ranger_marksmanship', (ev, su, tu) => {
    if (su) c.swirl(su.id, 0.7, steel, { r: 28, rate: 26, speed: 8, stamp: 'p_star', size: 9 });
    if (!tu) return;
    const z = c.chest(tu);
    c.flash(tu.x, tu.y, z, steel, 70, 0.22);
    c.stars(tu.x, tu.y, z, steel, { count: 10 });
    c.sparks(tu.x, tu.y, z, pal, { count: 16, speed: [140, 420] });
    c.glow(tu.x, tu.y, z, pal.lt, 280, 1.2, 0.35);
  });
}
