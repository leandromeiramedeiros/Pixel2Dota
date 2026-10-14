// Axe: Berserker's Call (roar shockwave), Battle Hunger (blood-red curse), Counter Helix (spin slash), Culling Blade (execute).
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, pal = PAL.blood, steel = PAL.steel;

  // ------------------------------------------------------------------------------------------------ berserker's call: r, dur
  R.spell('axe_berserkers_call', (ev, su) => {
    if (!su) return;
    const rad = ev.r || 300, dur = ev.dur || 2, z = su.z || 0, x = su.x, y = su.y;
    c.flash(x, y, c.chest(su), pal, 100, 0.3);
    c.ring(x, y, z, pal, { R: rad, life: [0.4, 0.65] });
    c.ring(x, y, z, PAL.fire, { R: rad * 0.65, life: [0.3, 0.5] });
    c.ringDecal(x, y, rad, 0.7, [3.2, 0.9, 0.5], { emit: 1.4, fadeOut: 0.7 });
    c.dust(x, y, z, { count: 26, radius: rad * 0.3 });
    // war-cry: streaks drawn inward to the hero for the taunt duration
    c.swirl(su.id, Math.min(dur, 1.4), pal, { r: rad * 0.55, rate: 50, speed: 3, h0: 4, h1: 110, up: 20 });
    c.embers(x, y, z + 50, pal, { count: 36, speed: [180, 520] });
    c.glow(x, y, z + 80, pal.lt, rad * 2, 1.7, 0.6);
  });

  // ------------------------------------------------------------------------------------------------ battle hunger: t, dur
  R.spell('axe_battle_hunger', (ev, su, tu) => {
    if (su) c.sparks(su.x, su.y, c.chest(su), pal, { count: 8 });
    if (!tu) return;
    const id = tu.id, dur = ev.dur || 8, z = c.chest(tu);
    c.flash(tu.x, tu.y, z, pal, 60, 0.25);
    c.blob(tu.x, tu.y, z, pal, { count: 20, radius: 22 });
    c.ring(tu.x, tu.y, tu.z || 0, pal, { R: 100, life: [0.3, 0.5] });
    c.glow(tu.x, tu.y, z, pal.lt, 240, 0.7, dur, { mode: 'flat', follow: id, dz: 0, elem: 'E' });
    c.run(dur, (r, dt) => {   // red flame licking off the afflicted
      const u = c.unit(id); if (!u || u.hp <= 0) return false;
      if (u.visible === false) return;
      const n = c.n(90 * dt), zz = u.z || 0;
      for (let i = 0; i < n; i++) P.spawn(c.pix(pal, { x: u.x + rnd(-18, 18), y: u.y + rnd(-12, 12), z: zz + rnd(6, 120), life: [0.4, 0.9], speed: [0, 14], up: [40, 120], gravity: -90, linger: [0.3, 0.8] }));
      for (let q = c.n(16 * dt); q > 0; q--) P.spawn(c.pix(pal, { x: u.x, y: u.y, z: zz + rnd(80, 130), life: [0.5, 0.9], speed: [20, 60], up: [30, 80], gravity: -300 }));
    });
  });

  // ------------------------------------------------------------------------------------------------ counter helix: x,y,r,lv
  R.spell('axe_counter_helix', (ev, su) => {
    if (!su) return;
    const rad = ev.r || 300, z = su.z || 0, x = su.x, y = su.y, zc = c.chest(su) - 20;
    c.ring(x, y, z, steel, { R: rad, life: [0.25, 0.4] });
    c.ringDecal(x, y, rad * 0.9, 0.4, [2.4, 1.2, 1.0], { emit: 1.2, fadeOut: 0.8 });
    const a0 = rnd(0, TAU);   // two sweeping blade arcs, drawn as a burst of motes rotating over 0.28 s
    c.run(0.28, (r, dt) => {
      const u = c.unit(su.id); if (!u) return false;
      const n = c.n(360 * dt);
      for (let i = 0; i < n; i++) {
        const side = i & 1, a = a0 + r.k * TAU * 1.25 + side * Math.PI + rnd(-0.12, 0.12), d = rad * rnd(0.45, 0.95);
        P.spawn(c.pix(steel, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: zc + rnd(-10, 10), life: [0.12, 0.28], speed: 0, vel: [-Math.sin(a) * 200, Math.cos(a) * 200, 0] }));
      }
      c.lightNow(u.x, u.y, zc + 20, steel.lt, 280, 0.5, 0);
    });
    c.sparks(x, y, zc, steel, { count: 14, speed: [180, rad * 1.3] });
  });

  // ------------------------------------------------------------------------------------------------ culling blade: x2,y2 (target), r, dur, kill
  R.spell('axe_culling_blade', (ev, su, tu) => {
    const x = ev.x2 != null ? ev.x2 : tu ? tu.x : su ? su.x : null, y = ev.y2 != null ? ev.y2 : tu ? tu.y : su ? su.y : null;
    if (x == null) return;
    const z = tu ? c.chest(tu) : c.zAt(x, y) + 80, gz = c.zAt(x, y), kill = !!ev.kill;
    if (su) { c.flash(su.x, su.y, c.chest(su), pal, 50, 0.18); }
    // slash cross
    for (let i = 0; i < 2; i++) {
      const a = (i ? 0.75 : -0.75) + rnd(-0.1, 0.1), dx = Math.cos(a) * 110, dz = Math.sin(a) * 90;
      c.line(x - dx, y, z - dz, x + dx, y, z + dz, steel, { life: [0.15, 0.3], size0: [16, 26], count: 36 });
    }
    c.flash(x, y, z, kill ? pal : steel, kill ? 150 : 90, kill ? 0.4 : 0.25);
    c.sparks(x, y, z, steel, { count: kill ? 40 : 22, speed: [200, 560] });
    c.glow(x, y, z, pal.lt, kill ? 520 : 340, kill ? 2.2 : 1.4, 0.5);
    if (!kill) { c.ring(x, y, gz, pal, { R: 140, life: [0.3, 0.5] }); return; }
    // execute: blood burst, ring and an inspiring red shockwave that buffs nearby allies
    const rad = ev.r || 600, dur = ev.dur || 6;
    c.blob(x, y, z, pal, { count: 44, radius: 30, speed: [120, 420] });
    c.embers(x, y, z, pal, { count: 50, speed: [200, 600] });
    c.pillar(x, y, gz, pal, { count: 110, radius: 26, up: [500, 1400] });
    c.ring(x, y, gz, pal, { R: 230, life: [0.4, 0.65] });
    if (su) {
      const sx = su.x, sy = su.y, sz = su.z || 0;
      c.ring(sx, sy, sz, PAL.gold, { R: rad, life: [0.6, 0.9] });
      c.ringDecal(sx, sy, rad * 0.7, 0.9, [3, 2, 0.6], { emit: 1.3, fadeOut: 0.7 });
      c.pillar(sx, sy, sz, PAL.gold, { count: 60, radius: 24, up: [300, 800] });
      c.swirl(su.id, Math.min(dur, 2.0), PAL.gold, { r: 30, rate: 30, speed: 6 });
      const us = c.view && c.view.units || [];
      for (let i = 0; i < us.length; i++) {
        const u = us[i]; if (u.team !== su.team || u.id === su.id || u.kind === 'tower' || u.hp <= 0) continue;
        if (Math.hypot(u.x - sx, u.y - sy) > rad) continue;
        c.swirl(u.id, 1.2, PAL.gold, { r: 28, rate: 22, speed: 6 });
      }
    }
  });
}
