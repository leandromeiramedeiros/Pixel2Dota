// Juggernaut: Blade Fury (spinning blade ring), Healing Ward (verdant aura), Blade Dance (crit flash), Omni Slash (flurry).
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, steel = PAL.steel, green = PAL.green, fire = PAL.fire;

  // ------------------------------------------------------------------------------------------------ blade fury: r, dur
  R.spell('juggernaut_blade_fury', (ev, su) => {
    if (!su) return;
    const id = su.id, rad = ev.r || 260, dur = ev.dur || 5, z = su.z || 0;
    c.flash(su.x, su.y, c.chest(su), steel, 80, 0.25);
    c.ring(su.x, su.y, z, steel, { R: rad, life: [0.3, 0.5] });
    c.ringDecal(su.x, su.y, rad, dur, [1.4, 1.5, 1.8], { emit: 0.9, follow: id, fadeIn: 0.15, fadeOut: 0.1, spin: 6 });
    c.glow(su.x, su.y, c.chest(su), steel.lt, rad * 1.5, 0.6, dur, { mode: 'flat', follow: id, dz: 80, elem: 'W' });
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u || u.hp <= 0) return false;
      if (u.visible === false) return;
      const zz = (u.z || 0) + 56, spin = c.T * 20, n = c.n(380 * dt);
      for (let b = 0; b < 3; b++) {   // three blade glints at the radius, each smearing a short arc behind it
        for (let i = 0; i < Math.max(1, n / 3); i++) {
          const a = spin + b * TAU / 3 - i * 0.07, d = rad * 0.82;
          P.spawn(c.pix(steel, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: zz + rnd(-8, 8), life: [0.1, 0.22], speed: 0, vel: [-Math.sin(a) * 320, Math.cos(a) * 320, 0] }));
        }
      }
      for (let q = c.n(50 * dt); q > 0; q--) { const a = rnd(0, TAU), d = rad * rnd(0.3, 0.9); P.spawn(c.pix(steel, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: zz, life: [0.3, 0.7], speed: [60, 200], up: [20, 140], gravity: -520, linger: [0.4, 1.0] })); }
      if (Math.random() < dt * 10) c.dust(u.x + rnd(-rad, rad) * 0.6, u.y + rnd(-rad, rad) * 0.6, u.z || 0, { count: 1, size0: [20, 30] });
    });
  });

  // ------------------------------------------------------------------------------------------------ healing ward: r, dur at the ward's spot
  R.spell('juggernaut_healing_ward', (ev, su, tu) => {
    const p = c.at(ev, su, tu); if (!p) return;
    const x = p.x, y = p.y, rad = ev.r || 500, dur = ev.dur || 25, z = c.zAt(x, y);
    c.flash(x, y, z + 40, green, 100, 0.35);
    c.ring(x, y, z, green, { R: rad * 0.7, life: [0.5, 0.8] });
    c.pillar(x, y, z, green, { count: 70, radius: 22, up: [300, 800] });
    c.leaves(x, y, z + 20, { count: 20 });
    c.ringDecal(x, y, rad, dur, [0.6, 1.8, 0.7], { emit: 0.8, fadeIn: 0.3, fadeOut: 0.08, pulse: 0.12, pulseHz: 3 });
    c.glow(x, y, z + 90, green.lt, rad * 0.8, 0.6, dur, { mode: 'flat' });
    c.run(dur, (r, dt) => {
      const n = c.n(50 * dt);
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU), d = rad * Math.sqrt(Math.random()); P.spawn(c.pix(green, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: z + 6, life: [0.8, 1.6], speed: 0, up: [40, 110] })); }
      if (Math.random() < dt * 2.2) c.ring(x, y, z, green, { R: rad, life: [0.9, 1.1], count: 70 });
    });
  });

  // ------------------------------------------------------------------------------------------------ blade dance (crit proc)
  R.spell('juggernaut_blade_dance', (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    const z = c.chest(t);
    c.flash(t.x, t.y, z, steel, 56, 0.16);
    c.line(t.x - 60, t.y, z + 50, t.x + 60, t.y, z - 40, fire, { life: [0.12, 0.25], size0: [10, 18], count: 20 });
    c.sparks(t.x, t.y, z, steel, { count: 14 });
    c.stars(t.x, t.y, z, PAL.gold, { count: 5 });
  });

  // ------------------------------------------------------------------------------------------------ omni slash: t, r, dur ; per hit sub 'slash' {t, x,y (from), x2,y2 (hero)}
  R.spell('juggernaut_omni_slash', (ev, su, tu) => {
    if (ev.sub === 'slash') {
      const ex = ev.x2 != null ? ev.x2 : (su ? su.x : 0), ey = ev.y2 != null ? ev.y2 : (su ? su.y : 0);
      const vx = tu ? tu.x : ev.x, vy = tu ? tu.y : ev.y; if (vx == null) return;
      const vz = tu ? c.chest(tu) : c.zAt(vx, vy) + 70, hz = su ? c.chest(su) : vz;
      if (ev.x != null) c.line(ev.x, ev.y, hz, ex, ey, hz, steel, { life: [0.1, 0.22], size0: [10, 16], count: Math.round(Math.hypot(ex - ev.x, ey - ev.y) * 0.3) });   // afterimage of the jump
      const a = rnd(0, TAU), dx = Math.cos(a) * 90, dy = Math.sin(a) * 90;
      c.line(vx - dx, vy - dy, vz + 30, vx + dx, vy + dy, vz - 30, steel, { life: [0.1, 0.2], size0: [12, 20], count: 18 });
      c.flash(vx, vy, vz, steel, 52, 0.12);
      c.sparks(vx, vy, vz, fire, { count: 8, speed: [140, 380] });
      return;
    }
    if (!su) return;
    const id = su.id, rad = ev.r || 425, dur = ev.dur || 3, z = su.z || 0;
    c.flash(su.x, su.y, c.chest(su), steel, 120, 0.3);
    c.ring(su.x, su.y, z, steel, { R: 160, life: [0.3, 0.5] });
    c.glow(su.x, su.y, c.chest(su), steel.lt, 360, 0.7, dur, { mode: 'flat', follow: id, dz: 70, elem: 'W' });
    c.run(dur, (r, dt) => {   // restless blade sparks while the flurry lasts
      const u = c.unit(id); if (!u || u.hp <= 0) return false;
      if (u.visible === false) return;
      const n = c.n(50 * dt);
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU); P.spawn(c.pix(steel, { x: u.x, y: u.y, z: (u.z || 0) + rnd(20, 110), life: [0.12, 0.28], speed: 0, vel: [Math.cos(a) * 320, Math.sin(a) * 320, rnd(-60, 120)], drag: 3 })); }
    });
  });
}
