// Pudge: Meat Hook (iron chain + hook head, drags the victim), Rot (green gas aura toggle), Flesh Heap (gory ward-off), Dismember (blood drain stream).
// Events: hook cast {x2,y2,r,dur}; hook hit sub 'hit' {t,x,y,x2,y2}; projectiles 'pudge_meat_hook' (out) and 'pudge_meat_hook_back' (retract);
//         rot sub 'on' | 'off' {r}; flesh heap {r,dur}; dismember {t,dur}.
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, steel = PAL.steel, iron = { hot: [1.5, 1.55, 1.8], mid: [0.8, 0.85, 1.1], low: [0.35, 0.38, 0.55], dim: [0.15, 0.16, 0.25], lt: PAL.steel.lt, ramp: PAL.steel.ramp }, rust = { hot: [1.9, 1.3, 0.5], mid: [1.0, 0.6, 0.2], low: [0.4, 0.2, 0.06], dim: [0.15, 0.08, 0.02], lt: PAL.gold.lt, ramp: PAL.gold.ramp }, blood = PAL.blood, green = PAL.green, gold = PAL.gold;

  // ------------------------------------------------------------------------------------------------ meat hook
  R.spell('pudge_meat_hook', (ev, su, tu) => {
    if (ev.sub === 'hit') {   // the hook bites: iron sparks + a spray of blood on the victim, shock ring
      const t = tu || ev, x = t.x, y = t.y, z = tu ? c.chest(tu) : c.zAt(x, y) + 70;
      c.flash(x, y, z, steel, 70, 0.2);
      c.sparks(x, y, z, steel, { count: 14, speed: [160, 440] });
      c.sparks(x, y, z, blood, { count: 12, speed: [100, 360] });
      c.ring(x, y, c.zAt(x, y), blood, { R: 110, life: [0.25, 0.4] });
      c.glow(x, y, z, steel.lt, 300, 1.1, 0.3);
      return;
    }
    if (!su) return;
    const a = ev.x2 != null ? c.ang(su.x, su.y, ev.x2, ev.y2) : su.facing || 0, z = c.chest(su);
    const px = su.x + Math.cos(a) * 50, py = su.y + Math.sin(a) * 50;
    c.flash(px, py, z, steel, 50, 0.14);
    P.burst(c.pix(steel, { x: px, y: py, z, count: 36, shape: 'cone', dir: [Math.cos(a), Math.sin(a), 0], spread: 0.4, life: [0.15, 0.4], speed: [200, 480], drag: 2.4, gravity: -380 }));
    c.dust(su.x, su.y, su.z || 0, { count: 6 });
  });

  // iron chain from Pudge to the hook head: a dense, short-lived dotted line re-drawn every frame, links picked out as bright beads
  const chain = (cc, p, dt) => {
    const su = cc.unit(p.sid); if (!su) return;
    const x0 = su.x + Math.cos(su.facing || 0) * 24, y0 = su.y + Math.sin(su.facing || 0) * 24, z0 = cc.chest(su) - 4;
    const len = Math.hypot(p.x - x0, p.y - y0);
    if (len < 8) return;
    P.burst(cc.pix(iron, { x: x0, y: y0, z: z0, x2: p.x, y2: p.y, z2: p.z, count: Math.max(6, Math.round(len / 10)), shape: 'line', life: [0.04, 0.07], speed: [0, 4], px: [0.8, 1.4], settle: false }));
    // links: a few rust-gold beads strung along the line
    P.burst(cc.pix(rust, { x: x0, y: y0, z: z0, x2: p.x, y2: p.y, z2: p.z, count: Math.max(3, Math.round(len / 50)), shape: 'line', life: [0.04, 0.07], speed: 0, px: [1.6, 2.2], settle: false }));
  };
  const head = (cc, p, dt) => {   // hook head: bright iron glints, a sparkle trail
    P.spawn({ x: p.x, y: p.y, z: p.z, life: [0.05, 0.09], size0: [12, 16], size1: 6, col0: iron.hot, col1: iron.mid, a0: 1, a1: 0, mode: 'glow', speed: 0, noScale: true });
    for (let q = cc.n(40 * dt * 3); q > 0; q--) P.spawn(cc.pix(iron, { x: p.x + rnd(-8, 8), y: p.y + rnd(-8, 8), z: p.z + rnd(-10, 10), life: [0.15, 0.35], speed: [0, 40], drag: 2, gravity: -200 }));
  };
  R.proj('pudge_meat_hook', {
    frames: null, z: 86, pal: steel, light: { col: steel.lt, radius: 240, int: 0.7 },
    trail(cc, p, dt) { chain(cc, p, dt); head(cc, p, dt); },
    hit(cc, p) { cc.flash(p.x, p.y, p.z, steel, 40, 0.12); cc.sparks(p.x, p.y, p.z, steel, { count: 6, speed: [80, 260] }); },
  });
  R.proj('pudge_meat_hook_back', {
    frames: null, z: 86, pal: steel, light: { col: steel.lt, radius: 220, int: 0.6 },
    trail(cc, p, dt) {
      chain(cc, p, dt); head(cc, p, dt);
      // a hooked victim rides the chain home: wet red flecks fall from it
      for (let q = cc.n(40 * dt * 3); q > 0; q--) P.spawn(cc.pix(blood, { x: p.x, y: p.y, z: p.z - 30, life: [0.2, 0.5], speed: [0, 30], gravity: -420, linger: [0.3, 0.7] }));
    },
    hit(cc, p) { cc.flash(p.x, p.y, p.z, steel, 36, 0.1); },
  });

  // ------------------------------------------------------------------------------------------------ rot: toggle. sub 'on'/'off', r = radius
  const rot = new Map();   // pudge id -> { r, born }
  R.spell('pudge_rot', (ev, su) => {
    if (!su) return;
    const rad = ev.r || 250, z = su.z || 0;
    if (ev.sub === 'off') {
      rot.delete(su.id);
      c.smoke(su.x, su.y, z + 40, { count: 8, radius: 30 }, green);
      return;
    }
    rot.set(su.id, { r: rad, born: c.T });
    c.ring(su.x, su.y, z, green, { R: rad, life: [0.45, 0.7] });
    c.ring(su.x, su.y, z, PAL.dark, { R: rad * 0.7, life: [0.4, 0.6] });
    c.smoke(su.x, su.y, z + 30, { count: 20, radius: rad * 0.25, size0: [40, 60], size1: [90, 130] }, green);
    c.glow(su.x, su.y, z + 60, green.lt, rad * 1.4, 1.1, 0.5);
  });
  R.each((cc, dt) => {
    for (const [id, st] of rot) {
      const u = cc.unit(id);
      if (!u || u.hp <= 0) { rot.delete(id); continue; }   // gone / dead: the 'off' event may never come
      if (u.visible === false || !cc.vis(u.x, u.y)) continue;
      const z = u.z || 0, rad = st.r;
      // low green gas puffs drifting out of the radius edge, wispy flies and bubbles inside it
      for (let n = cc.n(18 * dt); n > 0; n--) {
        const a = rnd(0, TAU), d = rad * Math.sqrt(Math.random()) * 0.92;
        P.spawn({ x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: z + 8, life: [0.9, 1.7], size0: [34, 52], size1: [70, 110], col0: green.mid, col1: green.low, a0: 0.55, a1: 0, speed: [6, 30], up: [10, 40], gravity: 20, drag: 1.4, mode: 'glow', noScale: true });
      }
      for (let n = cc.n(90 * dt); n > 0; n--) {
        const a = rnd(0, TAU), d = rad * rnd(0.2, 1);
        P.spawn(cc.pix(green, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: z + rnd(4, 40), life: [0.5, 1.1], speed: [0, 20], up: [30, 120], gravity: -40, drag: 1, settle: false }));
      }
      for (let n = cc.n(14 * dt); n > 0; n--) {   // a tight ring of faint fumes marks the edge
        const a = rnd(0, TAU);
        P.spawn(cc.pix(green, { x: u.x + Math.cos(a) * rad, y: u.y + Math.sin(a) * rad, z: z + 4, life: [0.4, 0.8], speed: 0, up: [20, 70], settle: false }));
      }
      cc.lightNow(u.x, u.y, z + 50, green.lt, rad * 1.3, 0.35, 0);
    }
  });

  // ------------------------------------------------------------------------------------------------ flesh heap: r, dur
  R.spell('pudge_flesh_heap', (ev, su) => {
    if (!su) return;
    const z = su.z || 0, dur = Math.min(ev.dur || 5, 2.5);
    c.flash(su.x, su.y, c.chest(su), blood, 80, 0.25);
    c.ring(su.x, su.y, z, blood, { R: ev.r || 140, life: [0.35, 0.55] });
    c.sparks(su.x, su.y, c.chest(su), blood, { count: 14, speed: [100, 340] });
    c.swirl(su.id, dur, blood, { r: 44, rate: 40, speed: 4, h0: 10, h1: 130, up: 20 });
    c.glow(su.x, su.y, c.chest(su), blood.lt, 320, 1.0, 0.5);
  });

  // ------------------------------------------------------------------------------------------------ dismember: t, dur = channel
  R.spell('pudge_dismember', (ev, su, tu) => {
    if (!su || !tu) return;
    const sid = su.id, tid = tu.id, dur = ev.dur || 3;
    c.flash(tu.x, tu.y, c.chest(tu), blood, 70, 0.2);
    c.ring(tu.x, tu.y, tu.z || 0, blood, { R: 90, life: [0.3, 0.5] });
    c.run(dur, (r, dt) => {
      const s = c.unit(sid), t = c.unit(tid);
      if (!s || !t || s.hp <= 0 || t.hp <= 0) return false;
      if (!c.vis(s.x, s.y) && !c.vis(t.x, t.y)) return;
      const sz = c.chest(s), tz = c.chest(t);
      // drain: red-green motes stream from the victim into Pudge in a wavering ribbon
      const n = c.n(160 * dt);
      for (let i = 0; i < n; i++) {
        const k = Math.random(), w = Math.sin(k * 9 + c.T * 14) * 16 * Math.sin(k * Math.PI);
        const nx = -(s.y - t.y), ny = s.x - t.x, nl = Math.hypot(nx, ny) || 1;
        P.spawn(c.pix(i % 3 ? blood : green, { x: t.x + (s.x - t.x) * k + (nx / nl) * w, y: t.y + (s.y - t.y) * k + (ny / nl) * w, z: tz + (sz - tz) * k + 10, life: [0.12, 0.28], speed: [0, 20], settle: false }));
      }
      // the grip: blood spatter off the victim, bright flicker on every tick
      for (let q = c.n(50 * dt); q > 0; q--) P.spawn(c.pix(blood, { x: t.x + rnd(-14, 14), y: t.y + rnd(-14, 14), z: tz + rnd(-20, 30), life: [0.3, 0.7], speed: [30, 160], up: [20, 110], gravity: -520, linger: [0.4, 1] }));
      if (Math.random() < dt * 5) c.flash(t.x, t.y, tz, blood, 46, 0.12);
      c.lightNow(t.x, t.y, tz, blood.lt, 260, 0.6, 0);
    });
  });
}
