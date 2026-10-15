// Item actives: blink, TP scroll, BKB, tango, quelling blade, flask, clarity, faerie fire, mango (self or ally), magic stick/wand, phase boots, power treads, wards (own team).
import { EV } from '../../../../shared/protocol.js';
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P;

  /** Rising spiral of motes at a ground point for dur seconds, with a ground ring decal and a pulsing light. */
  function spiral(x, y, dur, pal, rad, lightInt) {
    const z = c.zAt(x, y), r0 = rad || 70;
    c.ringDecal(x, y, r0 * 1.15, dur, [pal.mid[0] * 0.6, pal.mid[1] * 0.6, pal.mid[2] * 0.6], { emit: 1.2, spin: 0.9, pulse: 0.12, fadeOut: 0.15 });
    c.glow(x, y, z + 60, pal.lt, 340, lightInt || 1.3, dur, { mode: 'pulse' });
    c.run(dur, (r, dt) => {
      const n = c.n(220 * dt);
      for (let i = 0; i < n; i++) {
        const a = c.T * 6 + Math.random() * TAU, rr = r0 * (0.35 + 0.65 * Math.random());
        P.spawn(c.pix(pal, { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, z: z + 4, life: [0.5, 0.9],
          vel: [-Math.sin(a) * rr * 3.2, Math.cos(a) * rr * 3.2, 0], speed: 0, up: [140, 360], drag: 1.1 }));
      }
    });
  }
  c.spiral = spiral;

  // ---------------------------------------------------------------------------------------------------------------- blink
  R.on(EV.BLINK, (ev) => {
    const x0 = ev.x, y0 = ev.y, x1 = ev.x2, y1 = ev.y2;
    if (x0 == null) return;
    const z0 = c.zAt(x0, y0), z1 = c.zAt(x1, y1);
    const pal = PAL.arc;
    P.burst(c.pix(pal, { x: x0, y: y0, z: z0 + 80, count: 160, shape: 'sphere', radius: 90, settle: false, life: [0.25, 0.4], speed: [-260, -140], drag: 1.5 }));
    c.flash(x0, y0, z0 + 80, pal, 70, 0.22);
    c.line(x0, y0, z0 + 70, x1, y1, z1 + 70, pal, { life: [0.15, 0.4], size0: [10, 18] });
    c.later(0.05, () => {
      c.flash(x1, y1, z1 + 80, PAL.steel, 80, 0.22);
      c.ring(x1, y1, z1, pal, { R: 130, life: [0.35, 0.55] });
      c.sparks(x1, y1, z1 + 60, pal, { count: 22, speed: [100, 340] });
      c.glow(x1, y1, z1 + 90, pal.lt, 420, 2, 0.5);
    });
  });

  // ---------------------------------------------------------------------------------------------------------------- teleport scroll (x,y = destination)
  R.on(EV.TP, (ev, su) => {
    const dur = ev.dur || 3, dx = ev.x, dy = ev.y, pal = PAL.steel;
    if (su) {
      spiral(su.x, su.y, dur, pal, 62, 1.2);
      const sx = su.x, sy = su.y, sz = c.zAt(sx, sy);
      c.later(dur, () => { c.flash(sx, sy, sz + 80, pal, 90, 0.3); c.pillar(sx, sy, sz, pal, { count: 120, radius: 36, up: [500, 1200] }); });
    }
    if (dx != null) {
      spiral(dx, dy, dur, pal, 62, 1.2);
      const dz = c.zAt(dx, dy);
      c.later(dur, () => { c.flash(dx, dy, dz + 80, pal, 110, 0.35); c.pillar(dx, dy, dz, pal, { count: 160, radius: 40, up: [600, 1500] }); c.ring(dx, dy, dz, pal, { R: 160 }); });
    }
  });

  // ---------------------------------------------------------------------------------------------------------------- item spells
  R.spell('item_black_king_bar', (ev, su) => {
    if (!su) return;
    const g = PAL.gold, z = su.z || 0;
    c.ring(su.x, su.y, z, g, { R: 190, life: [0.45, 0.7] });
    c.flash(su.x, su.y, z + 90, g, 90, 0.28);
    c.pillar(su.x, su.y, z, g, { count: 140, radius: 30, up: [500, 1300] });
    c.embers(su.x, su.y, z + 60, g, { count: 24 });
    c.glow(su.x, su.y, z + 90, g.lt, 460, 2.0, 0.7);
    c.swirl(su.id, 1.2, g, { r: 38, rate: 50, speed: 7 });
  });

  R.spell('item_tango', (ev, su) => {
    const g = PAL.green;
    if (ev.x != null) {
      const z = c.zAt(ev.x, ev.y);
      c.leaves(ev.x, ev.y, z + 120, { count: 20, radius: 36 });
      c.sparks(ev.x, ev.y, z + 100, g, { count: 12 });
      if (su) {
        const sx = ev.x, sy = ev.y, id = su.id;
        c.run(0.5, (r, dt) => {
          const u = c.unit(id); if (!u) return false;
          const n = c.n(200 * dt), cz = c.chest(u);
          for (let i = 0; i < n; i++) {
            const k = Math.random();
            P.spawn(c.pix(g, { x: sx + (u.x - sx) * k + rnd(-8, 8), y: sy + (u.y - sy) * k + rnd(-8, 8), z: z + 100 + (cz - z - 100) * k, life: [0.15, 0.3], speed: 0 }));
          }
        });
      }
    }
    if (su) { c.leaves(su.x, su.y, c.chest(su), { count: 10, radius: 16 }); c.swirl(su.id, 1.4, g, { r: 28, rate: 18, speed: 4, stamp: 'p_leaf', size: 10 }); }
  });

  R.spell('item_quelling_blade', (ev) => {
    if (ev.x == null) return;
    const z = c.zAt(ev.x, ev.y);
    c.leaves(ev.x, ev.y, z + 110, { count: 16, radius: 30 });
    c.line(ev.x - 40, ev.y + 30, z + 150, ev.x + 40, ev.y - 30, z + 60, PAL.steel, { life: [0.1, 0.25] });
    c.sparks(ev.x, ev.y, z + 100, PAL.steel, { count: 10 });
  });

  const heal = (pal) => (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    const dur = ev.dur || 10, cz = c.chest(t);
    c.blob(t.x, t.y, cz, pal, { count: 18, radius: 20, speed: [40, 140] });
    c.glow(t.x, t.y, cz, pal.lt, 280, 1.3, 0.6);
    c.swirl(t.id, Math.min(dur, 6), pal, { r: 26, rate: 14, speed: 3.5, up: 60, size: 9 });
    c.rise(t.x, t.y, t.z || 0, pal, { count: 12 });
    c.glow(t.x, t.y, cz, pal.lt, 200, 0.6, Math.min(dur, 6), { follow: t.id, dz: 80, mode: 'flat' });
  };
  R.spell('item_flask', heal(PAL.green));
  R.spell('item_clarity', heal(PAL.mana));

  R.spell('item_faerie_fire', (ev, su) => {
    if (!su) return; const p = PAL.pink, z = c.chest(su);
    c.blob(su.x, su.y, z, PAL.sun, { count: 14 }); c.stars(su.x, su.y, z + 20, p, { count: 12 }); c.glow(su.x, su.y, z, p.lt, 300, 1.4, 0.5);
    c.swirl(su.id, 0.6, p, { r: 30, rate: 40, speed: 8 });
  });
  R.spell('item_enchanted_mango', (ev, su, tu) => {   // ev.t = the hero that ate it (self or an ally)
    const t = tu || su; if (!t) return; const z = c.chest(t);
    c.blob(t.x, t.y, z, PAL.mana, { count: 20 }); c.stars(t.x, t.y, z + 20, PAL.sun, { count: 8 }); c.glow(t.x, t.y, z, PAL.mana.lt, 300, 1.4, 0.5);
    c.rise(t.x, t.y, t.z || 0, PAL.mana, { count: 16 });
  });
  R.spell(['item_magic_stick', 'item_magic_wand'], (ev, su) => {
    if (!su) return; const z = c.chest(su);
    c.flash(su.x, su.y, z, PAL.mana, 50, 0.2);
    c.ring(su.x, su.y, su.z || 0, PAL.mana, { R: 90 });
    c.stars(su.x, su.y, z, PAL.mana, { count: 10 });
    c.rise(su.x, su.y, su.z || 0, PAL.mana, { count: 14 });
  });
  R.spell('item_phase_boots', (ev, su) => {
    if (!su) return; const p = PAL.steel;
    c.dust(su.x, su.y, su.z || 0, { count: 10 }, PAL.smoke);
    c.ring(su.x, su.y, su.z || 0, p, { R: 100 });
    const id = su.id, dur = Math.min(ev.dur || 3, 4);
    c.run(dur, (r, dt) => {
      const u = c.unit(id); if (!u) return false;
      const n = c.n(160 * dt);
      for (let i = 0; i < n; i++) P.spawn(c.pix(p, { x: u.x + rnd(-12, 12), y: u.y + rnd(-12, 12), z: (u.z || 0) + rnd(4, 110), life: [0.3, 0.6], speed: 0, up: [0, 20] }));
    });
    c.glow(su.x, su.y, c.chest(su), p.lt, 260, 0.8, dur, { follow: id, dz: 80, mode: 'flat' });
  });
  R.spell(['item_ward_observer', 'item_ward_sentry'], (ev, su) => {   // x,y = the planted ward; hidden from the enemy team (the ward itself is invisible), shown to spectators
    if (ev.x == null || !su || !c.view || (!c.view.spectator && su.team !== c.view.myTeam)) return;
    const z = c.zAt(ev.x, ev.y), p = ev.k === 'item_ward_sentry' ? PAL.mana : PAL.gold;
    c.dust(ev.x, ev.y, z, { count: 8 }, PAL.smoke);
    c.ring(ev.x, ev.y, z, p, { R: 60, life: [0.3, 0.5] });
  });
  R.spell('item_power_treads', (ev, su) => { if (su) { c.flash(su.x, su.y, (su.z || 0) + 8, PAL.gold, 30, 0.15); c.sparks(su.x, su.y, (su.z || 0) + 8, PAL.gold, { count: 8 }); } });
  // blink / tp are driven by EV.BLINK / EV.TP; passives never cast
  R.spell(['item_blink', 'item_tpscroll', 'item_boots', 'item_boots_of_elves', 'item_lesser_crit', 'item_robe'], () => {});
  R.spell('item_*', (ev, su, tu) => {
    const t = tu || su; if (!t) return;
    c.blob(t.x, t.y, c.chest(t), PAL.mana, { count: 14 }); c.glow(t.x, t.y, c.chest(t), PAL.mana.lt, 260, 1, 0.4);
  });
}
