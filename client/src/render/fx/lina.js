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
    P.burst(c.pix(pal, { x: px, y: py, z, count: 160, shape: 'cone', dir: [Math.cos(a), Math.sin(a), 0], spread: 0.5, life: [0.4, 0.9], speed: [260, 620], drag: 2.0, gravity: -520, linger: [0.5, 1.4] }));
    c.sparks(px, py, z, pal, { count: 14, speed: [200, 520] });
  });
  R.proj('lina_dragon_slave', {
    frames: 'fireball', fps: 14, scale: 2.2, spin: 0, tint: [1.3, 0.75, 0.4], emit: 1.0, pal, z: 70,
    light: { col: pal.lt, radius: 420, int: 1.1, elem: 'E' },
    trail(cc, p, dt) {
      const n = cc.n(600 * dt); if (!n) return;
      const nx = -p.dy, ny = p.dx, w = slaveW.get(p.sid) || 120;
      for (let i = 0; i < n; i++) {
        const s = rnd(-1, 1), back = rnd(0, p.sp * dt);
        const k = Math.abs(s);   // crescent: wings trail behind the head
        P.spawn(c.pix(pal, { x: p.x + nx * s * w - p.dx * (back + k * 90), y: p.y + ny * s * w - p.dy * (back + k * 90), z: p.z + rnd(-14, 24), life: [0.3, 0.6], speed: [0, 30], up: [10, 60], drag: 2 }));
      }
      for (let q = cc.n(80 * dt); q > 0; q--) P.spawn(c.pix(pal, { x: p.x + rnd(-w, w) * 0.6, y: p.y + rnd(-w, w) * 0.6, z: p.z, life: [0.3, 0.7], speed: [20, 90], up: [60, 220], gravity: -420, linger: [0.5, 1.2] }));
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
      const n = c.n((80 + 260 * r.k) * dt);
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU), rr = rad * Math.sqrt(Math.random()); P.spawn(c.pix(pal, { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: z + 4, life: [0.5, 1.0], speed: 0, up: [90, 260 + 380 * r.k], gravity: -480, linger: [0.5, 1.2] })); }
    });
    c.later(dur, () => {
      P.burst(c.pix(pal, { x, y, z, x2: x, y2: y, z2: z + 1500, shape: 'line', count: 260, life: [0.3, 0.6], speed: [0, 20], jitter: 8, px: [1, 2.4], settle: false }));
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
  // 3D: ribbon lightning (red sheath + hot core, forks, re-rolled every ~3 frames) from Lina's hand to the target, impact column + shockwave + ember afterglow.
  R.spell('lina_laguna_blade', (ev, su, tu) => {
    if (!su) return;
    const G = c.G, crim = PAL.blood;
    const x1 = ev.x2 != null ? ev.x2 : tu ? tu.x : su.x, y1 = ev.y2 != null ? ev.y2 : tu ? tu.y : su.y, dur = ev.dur || 0.6;
    const sid = su.id, tz = tu ? c.chest(tu) : c.zAt(x1, y1) + 90;
    const RED = [1.25, 0.12, 0.08], CORE = [3.4, 1.7, 1.4], WHITE = [2.4, 2.0, 1.9], EMB = [1.0, 0.32, 0.06], FLARE = [1.25, 0.2, 0.1];
    // charge: red crackling gather on the hand, small ribbon arcs lashing out
    const arcs = [G.newBolt(), G.newBolt()], ao = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], aopt = { depth: 2, jag: 9, branches: 0 };
    c.run(dur, (r, dt) => {
      const u = c.unit(sid); if (!u) return false;
      const n = c.n((120 + 360 * r.k) * dt), z = c.chest(u) + 10;
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU), d = rnd(50, 110) * (1 - r.k * 0.5); P.spawn(c.pix(crim, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: z + rnd(-30, 30), life: [0.15, 0.3], speed: 0, vel: [-Math.cos(a) * d * 4, -Math.sin(a) * d * 4, 0] })); }
      for (let i = 0; i < 2; i++) {
        const b = arcs[i]; if (!b) continue;
        if (c.T - b.last >= 0.07) { const a = rnd(0, TAU), d = rnd(45, 85) * (1 - r.k * 0.4); ao[i].x = Math.cos(a) * d; ao[i].y = Math.sin(a) * d; ao[i].z = rnd(-25, 35); }
        b.roll(c.T, 0.07, u.x, u.y, z, u.x + ao[i].x, u.y + ao[i].y, z + ao[i].z, aopt);
        G.bolt(b, RED, 3, CORE, 1, Math.min(1, 0.4 + r.k));
      }
      c.lightNow(u.x, u.y, z, crim.lt, 220 + 160 * r.k, 0.3 + 0.8 * r.k, 0);
    }, null);
    c.later(dur, () => { G.free(arcs[0]); G.free(arcs[1]); });
    c.later(dur, () => {
      const u = c.unit(sid), sx0 = u ? u.x : su.x, sy0 = u ? u.y : su.y, sz = u ? c.chest(u) : c.chest(su);
      const mainB = G.newBolt(), echoB = G.newBolt(), tArc = [G.newBolt(), G.newBolt(), G.newBolt()];
      const mopt = { depth: 4, jag: 38, branches: 5, branchLen: 0.16 }, eopt = { depth: 3, jag: 26, branches: 2, branchLen: 0.12 }, topt = { depth: 2, jag: 14, branches: 1, branchLen: 0.25 };
      const tgtO = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
      const disc = { n: 26, seed: 3.1, p0: 0, p1: 0.2, p2: 0.35 }, glowD = { p0: 0, p1: 1.7, p2: 0.55, p3: 0.35 }, tube = { pow: 1.2, swirl: 0.25, flare: 1, top: 0.6, phase: 0 }, tubeC = { pow: 0.7, top: 0.5 };
      let sx = sx0, sy = sy0, ex = x1, ey = y1, ez = tz, grounded = c.zAt(x1, y1), spark = 0;
      const ang0 = c.ang(sx0, sy0, x1, y1);
      c.flash(sx0 + Math.cos(ang0) * 30, sy0 + Math.sin(ang0) * 30, sz, crim, 70, 0.2);
      c.flash(x1, y1, tz, crim, 130, 0.3);
      c.sparks(x1, y1, tz, crim, { count: 18, speed: [160, 480] });
      c.stars(x1, y1, tz, PAL.steel, { count: 10 });
      c.embers(x1, y1, grounded + 30, PAL.fire, { count: 14, speed: [120, 420] });
      c.glow(x1, y1, tz, crim.lt, 560, 1.9, 0.55, { elem: 'W' });
      c.glow(sx0, sy0, sz, crim.lt, 300, 1.0, 0.3);
      c.run(0.55, (r, dt) => {
        const uu = c.unit(sid), t2 = tu && c.unit(tu.id);
        if (uu) { sx = uu.x; sy = uu.y; } if (t2) { ex = t2.x; ey = t2.y; ez = c.chest(t2); grounded = t2.z || 0; }
        const hz = uu ? c.chest(uu) : sz, hx = sx + Math.cos(ang0) * 28, hy = sy + Math.sin(ang0) * 28, a = r.t < 0.3 ? 1 : Math.max(0, 1 - (r.t - 0.3) / 0.25);
        if (mainB.roll(c.T, 0.05, hx, hy, hz, ex, ey, ez, mopt) && spark++ < 40) c.boltSparks(mainB, crim, 0.35);
        echoB.roll(c.T, 0.05, hx, hy, hz - 8, ex, ey, ez + 6, eopt);
        G.bolt(mainB, RED, 5, CORE, 2, a);
        G.bolt(echoB, RED, 3, WHITE, 1, a * 0.8);
        // arcs crackling around the target
        for (let i = 0; i < 3; i++) {
          const b = tArc[i]; if (!b) continue;
          if (c.T - b.last >= 0.06) { const an = rnd(0, TAU), d = rnd(60, 150); tgtO[i].x = Math.cos(an) * d; tgtO[i].y = Math.sin(an) * d; tgtO[i].z = rnd(-60, 40); }
          b.roll(c.T, 0.06, ex, ey, ez, ex + tgtO[i].x, ey + tgtO[i].y, ez + tgtO[i].z, topt);
          G.bolt(b, RED, 4, CORE, 1, a);
        }
        // impact: flare column, shockwave and ember afterglow on the ground
        const f = 1 - Math.pow(1 - Math.min(1, r.t / 0.4), 3);
        if (r.t < 0.4) { disc.p0 = 0.1 + 0.9 * f; G.disc(ex, ey, grounded, 250, 2, FLARE, 1 - f * 0.7, disc); }
        if (r.t < 0.3) { const k = 1 - r.t / 0.3; G.tube(ex, ey, grounded, 420, 46 * k + 6, 14, FLARE, k, tube); G.tube(ex, ey, grounded, 420, 18 * k + 3, 6, CORE, k, tubeC); }
        G.disc(ex, ey, grounded, 170, 3, EMB, Math.max(0, 1 - r.t / 0.55) * 1.2, glowD);
        c.lightNow(ex, ey, ez, crim.lt, 420, 1.3 * a, 0);
      });
      c.later(0.55, () => { G.free(mainB); G.free(echoB); for (const b of tArc) G.free(b); });
    });
  });
}
