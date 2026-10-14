// Sven: Storm Bolt (hammer), Great Cleave (passive), Warcry, God's Strength.
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P;
  const boltR = new Map();

  R.spell('sven_storm_bolt', (ev, su) => {
    if (!su) return;
    boltR.set(su.id, ev.r || 255);
    c.flash(su.x, su.y, c.chest(su), PAL.volt, 40, 0.2);
    c.sparks(su.x, su.y, c.chest(su), PAL.volt, { count: 10 });
  });
  R.proj('sven_storm_bolt', {
    frames: 'storm_hammer', fps: 14, scale: 1.1, spin: 18, tint: [1.1, 1.3, 1.8], emit: 1.5, sp: 1000, pal: PAL.volt, arc: 24,
    light: { col: PAL.volt.lt, radius: 300, int: 0.9, elem: 'W' },
    trail: { pal: PAL.volt, rate: 70, size: [6, 11], life: [0.2, 0.4], spread: 6 },
    hit(cc, p) {
      const r = boltR.get(p.sid) || 255, z = cc.zAt(p.x, p.y);
      cc.flash(p.x, p.y, p.z, PAL.steel, 60, 0.22);
      cc.ring(p.x, p.y, z, PAL.volt, { R: r, life: [0.35, 0.55] });
      cc.ringDecal(p.x, p.y, r, 0.5, [1.2, 1.8, 3], { emit: 1.4, fadeOut: 0.8 });
      for (let i = 0; i < 5; i++) { const a = rnd(0, TAU), d = rnd(r * 0.4, r); cc.bolt(p.x, p.y, z + 10, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, z + 6, PAL.volt, { jag: 14, lightR: 260, light: 0.9 }); }
      cc.stars(p.x, p.y, p.z + 40, PAL.sun, { count: 12 });
      cc.sparks(p.x, p.y, z + 30, PAL.volt, { count: 28, speed: [160, 460] });
      cc.glow(p.x, p.y, z + 70, PAL.volt.lt, r * 1.6, 1.4, 0.4, { elem: 'W' });
    },
  });

  R.spell('sven_great_cleave', (ev, su) => { if (su) c.sparks(su.x, su.y, c.chest(su), PAL.steel, { count: 8 }); });

  R.spell('sven_warcry', (ev, su) => {
    if (!su) return;
    const r = ev.r || 700, dur = ev.dur || 8, z = su.z || 0, pal = PAL.gold;
    c.flash(su.x, su.y, c.chest(su), pal, 110, 0.35);
    c.ring(su.x, su.y, z, pal, { R: r, life: [0.6, 0.9] });
    c.ring(su.x, su.y, z, PAL.fire, { R: r * 0.6, life: [0.4, 0.7] });
    c.ringDecal(su.x, su.y, r * 0.5, 1.2, [3, 2, 0.6], { emit: 1.5, fadeOut: 0.7 });
    c.embers(su.x, su.y, z + 60, pal, { count: 50, speed: [200, 600] });
    c.pillar(su.x, su.y, z, pal, { count: 140, radius: 30, up: [500, 1300] });
    c.glow(su.x, su.y, z + 90, pal.lt, r * 0.9, 2.4, 0.8);
    // buffed allies keep a golden shield shimmer for a moment
    const team = su.team;
    const us = c.view && c.view.units || [];
    for (let i = 0; i < us.length; i++) {
      const u = us[i]; if (u.team !== team || u.kind === 'tower' || u.hp <= 0) continue;
      if (Math.hypot(u.x - su.x, u.y - su.y) > r) continue;
      const id = u.id;
      c.swirl(id, Math.min(dur, 1.6), pal, { r: 30, rate: 36, speed: 5 });
      c.glow(u.x, u.y, c.chest(u), pal.lt, 200, 0.9, 1.0, { follow: id, dz: 80 });
    }
  });

  R.spell('sven_gods_strength', (ev, su) => {
    if (!su) return;
    const id = su.id, dur = ev.dur || 25, pal = PAL.volt, z = su.z || 0;
    c.flash(su.x, su.y, c.chest(su), PAL.steel, 140, 0.4);
    c.ring(su.x, su.y, z, pal, { R: 280, life: [0.5, 0.8] });
    c.pillar(su.x, su.y, z, pal, { count: 360, radius: 40, up: [700, 2200] });
    c.sparks(su.x, su.y, z + 60, pal, { count: 40, speed: [200, 600] });
    for (let i = 0; i < 6; i++) { const a = rnd(0, TAU); c.bolt(su.x, su.y, z + 140, su.x + Math.cos(a) * 190, su.y + Math.sin(a) * 190, z + 8, pal, { jag: 20, lightR: 360, light: 1.1 }); }
    c.glow(su.x, su.y, z + 100, pal.lt, 700, 3, 0.8);
    c.glow(su.x, su.y, z + 110, pal.lt, 280, 1.0, dur, { follow: id, dz: 110, mode: 'flat', elem: 'W' });
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      if (u.visible === false || !c.vis(u.x, u.y)) return;
      const n = c.n(30 * dt), zz = u.z || 0;
      for (let i = 0; i < n; i++) P.spawn({ x: u.x + rnd(-20, 20), y: u.y + rnd(-12, 12), z: zz + rnd(10, 170), life: [0.25, 0.5], size0: [8, 14], size1: 2, col0: pal.hot, col1: pal.mid, a0: 1, a1: 0, mode: 'glow', speed: [0, 20], up: [30, 100] });
      if (Math.random() < dt * 4) { const a = rnd(0, TAU); c.bolt(u.x, u.y, zz + rnd(60, 150), u.x + Math.cos(a) * 55, u.y + Math.sin(a) * 40, zz + rnd(10, 140), pal, { jag: 10, noLights: true, thick: 0.6 }); }
      if (r.t < 1.2) c.lightNow(u.x, u.y, zz + 110, pal.lt, 380, 1.4 * (1 - r.t / 1.2), 0);
    });
  });
}
