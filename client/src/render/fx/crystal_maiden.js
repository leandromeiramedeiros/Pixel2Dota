// Crystal Maiden: Crystal Nova, Frostbite (ice cage), Arcane Aura (brilliance pulse), Freezing Field (channel blizzard + blasts).
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, pal = PAL.ice, Q = c.Q, fShard = c.frame('p_shard_ice');

  // ------------------------------------------------------------------------------------------------ crystal nova: r (at x,y if given, else caster)
  R.spell('crystal_maiden_crystal_nova', (ev, su, tu) => {
    const p = c.at(ev, su, tu); if (!p) return;
    const rad = ev.r || 425, z = c.zAt(p.x, p.y);
    c.flash(p.x, p.y, z + 40, pal, rad * 0.35, 0.3);
    c.ring(p.x, p.y, z, pal, { R: rad, life: [0.45, 0.75] });
    c.ring(p.x, p.y, z, PAL.steel, { R: rad * 0.65, life: [0.3, 0.5] });
    c.ringDecal(p.x, p.y, rad, 0.8, [0.9, 2.0, 3.4], { emit: 1.3, fadeOut: 0.7 });
    c.decal(p.x, p.y, 'decal_frost', rad / 100, 3, { tint: [0.8, 1.6, 2.6], emit: 0.9, fadeOut: 0.6, roll: rnd(0, TAU) });
    c.shards(p.x, p.y, z + 20, pal, { count: 30, speed: [200, rad * 1.3] });
    c.pillar(p.x, p.y, z, pal, { count: 60, radius: 20, up: [300, 800] });
    P.burst(c.pix(pal, { x: p.x, y: p.y, z: z + 30, count: 40, shape: 'disc', radius: rad * 0.7, life: [0.6, 1.2], speed: [10, 60], up: [20, 120], drag: 1 }));
    c.glow(p.x, p.y, z + 70, pal.lt, rad * 1.8, 1.8, 0.6, { elem: 'Q' });
  });

  // ------------------------------------------------------------------------------------------------ frostbite: t, dur (ice cage around the target)
  R.spell('crystal_maiden_frostbite', (ev, su, tu) => {
    if (su) { c.flash(su.x, su.y, c.chest(su), pal, 36, 0.14); c.sparks(su.x, su.y, c.chest(su), pal, { count: 8 }); }
    if (!tu) return;
    const id = tu.id, dur = ev.dur || 3, N = 7, ang = new Float32Array(N), sz = new Float32Array(N), rd = new Float32Array(N);
    for (let i = 0; i < N; i++) { ang[i] = (i / N) * TAU + rnd(-0.2, 0.2); sz[i] = rnd(2.0, 3.2); rd[i] = rnd(32, 44); }
    c.flash(tu.x, tu.y, c.chest(tu), pal, 60, 0.25);
    c.shards(tu.x, tu.y, c.chest(tu), pal, { count: 18, radius: 30 });
    c.ring(tu.x, tu.y, tu.z || 0, pal, { R: 100, life: [0.3, 0.5] });
    c.glow(tu.x, tu.y, c.chest(tu), pal.lt, 260, 1.0, dur, { mode: 'flat', follow: id, dz: 0, elem: 'Q' });
    c.decal(tu.x, tu.y, 'decal_frost', 0.7, dur, { tint: [0.8, 1.6, 2.6], emit: 0.8, follow: id, fadeOut: 0.2 });
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u || u.hp <= 0) return false;
      if (u.visible === false) return;
      const pop = Math.min(1, r.t / 0.25), fade = Math.min(1, (dur - r.t) / 0.4), z0 = u.z || 0;
      for (let i = 0; i < N; i++) {
        const a = ang[i], s = sz[i] * pop;
        Q.put(u.x + Math.cos(a) * rd[i], u.y + Math.sin(a) * rd[i] * 0.8, z0 + 4, fShard, s, 0.9, 1.7, 2.8, fade, 1.3, 0, 0, 0, (i - 3) * 0.12, false, 1.05);
      }
      for (let q = c.n(30 * dt); q > 0; q--) P.spawn(c.pix(pal, { x: u.x + rnd(-30, 30), y: u.y + rnd(-20, 20), z: z0 + rnd(10, 110), life: [0.4, 0.8], speed: 0, up: [10, 40] }));
    });
  });

  // ------------------------------------------------------------------------------------------------ arcane aura (passive pulse)
  R.spell('crystal_maiden_brilliance_aura', (ev, su) => {
    if (!su) return;
    const z = su.z || 0, pm = PAL.mana;
    c.flash(su.x, su.y, c.chest(su), pm, 60, 0.25);
    c.ring(su.x, su.y, z, pm, { R: 260, life: [0.5, 0.8] });
    c.swirl(su.id, 1.0, pm, { r: 36, rate: 30, speed: 4, stamp: 'p_star', size: 9 });
  });

  // ------------------------------------------------------------------------------------------------ freezing field: channel, r, dur ; sub 'blast' at x,y r=explosion radius
  R.spell('crystal_maiden_freezing_field', (ev, su) => {
    if (ev.sub === 'blast') {
      const x = ev.x, y = ev.y; if (x == null) return;
      const rad = ev.r || 300, z = c.zAt(x, y);
      c.flash(x, y, z + 60, pal, rad * 0.4, 0.28);
      c.ring(x, y, z, pal, { R: rad, life: [0.35, 0.6] });
      c.shards(x, y, z + 10, pal, { count: 18, speed: [160, 420] });
      c.pillar(x, y, z, pal, { count: 50, radius: 18, up: [500, 1300] });
      c.ringDecal(x, y, rad, 0.5, [1.0, 2.2, 3.6], { emit: 1.2, fadeOut: 0.7 });
      c.glow(x, y, z + 80, pal.lt, rad * 2.2, 1.8, 0.5);
      return;
    }
    if (!su) return;
    const id = su.id, rad = ev.r || 835, dur = ev.dur || 10, z = su.z || 0;
    c.flash(su.x, su.y, c.chest(su), pal, 130, 0.4);
    c.ring(su.x, su.y, z, pal, { R: rad, life: [0.7, 1.0] });
    c.pillar(su.x, su.y, z, pal, { count: 90, radius: 28, up: [400, 1000] });
    const dec = c.ringDecal(su.x, su.y, rad, dur, [0.7, 1.6, 3.0], { emit: 1.0, fadeIn: 0.3, fadeOut: 0.1, follow: id, pulse: 0.1, pulseHz: 3 });
    c.decal(su.x, su.y, 'decal_frost', rad / 90, dur, { tint: [0.6, 1.3, 2.3], emit: 0.7, follow: id, fadeIn: 0.4, fadeOut: 0.1, spin: 0.15 });
    const lt = c.glow(su.x, su.y, z + 120, pal.lt, rad * 1.1, 0.5, dur, { mode: 'flat', follow: id, dz: 120, elem: 'Q' });
    // blizzard: snow whirling inside the field + wind streaks circling its edge
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u || u.hp <= 0) return false;
      if (u.visible === false) return;
      const ramp = Math.min(1, r.t / 0.8) * Math.min(1, (dur - r.t) / 0.5), zz = u.z || 0;
      const n = c.n(200 * ramp * dt);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU), d = rad * Math.sqrt(Math.random()), sw = 0.9;
        P.spawn(c.pix(pal, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: zz + rnd(160, 420), life: [0.7, 1.3], speed: 0, vel: [-Math.sin(a) * d * sw + 90, Math.cos(a) * d * sw, -300], drag: 0.2, px: [0.8, 1.6], settle: false }));
      }
      const m = c.n(160 * ramp * dt), a1 = c.T * 1.8;
      for (let i = 0; i < m; i++) {
        const a = a1 + rnd(-0.5, 0.5), d = rad * rnd(0.85, 1.0);
        P.spawn(c.pix(pal, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: zz + rnd(10, 90), life: [0.4, 0.8], speed: 0, vel: [-Math.sin(a) * 380, Math.cos(a) * 380, 0], drag: 0.6, settle: false }));
      }
      if (Math.random() < dt * 8) { const a = rnd(0, TAU), d = rad * Math.sqrt(Math.random()); c.smoke(u.x + Math.cos(a) * d, u.y + Math.sin(a) * d, zz + 30, { count: 1, size0: [40, 60], size1: [90, 140], life: [1.0, 1.8] }, PAL.smoke); }
      lt.int = 0.5 * ramp;
    });
  });
}
