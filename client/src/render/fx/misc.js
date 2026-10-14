// Death / tree / game-end effects (the renderer's builtinFx already draws the hit sparks, numbers, gold, heal, mana, lvl ring, death smoke).
import { EV } from '../../../../shared/protocol.js';
import { PAL, rnd, pick, TAU } from './common.js';

const BUILDING = /tower|rax|barracks|fort|ancient|fountain|building/i;
const FIREWORK = [PAL.gold, PAL.ice, PAL.pink, PAL.green, PAL.fire, PAL.arc];

export function register(c, R) {
  const P = c.P;

  R.on(EV.DEATH, (ev, su, tu) => {
    const k = ev.k || '', x = ev.x, y = ev.y, z = c.zAt(x, y);
    if (x == null || !c.vis(x, y)) return;
    if (k.startsWith('npc_dota_hero_')) {
      // hero: soul flash + ring + rising wisps + embers
      c.flash(x, y, z + 80, PAL.gold, 90, 0.3);
      c.ring(x, y, z, PAL.gold, { R: 200, life: [0.5, 0.8] });
      c.blob(x, y, z + 70, PAL.sun, { count: 40, speed: [80, 300], size0: [26, 44] });
      c.embers(x, y, z + 40, PAL.gold, { count: 36 });
      P.burst(c.pix(PAL.ice, { x, y, z: z + 20, count: 260, shape: 'disc', radius: 24, life: [1.0, 1.9], speed: [0, 30], up: [140, 320], drag: 0.7, settle: false, rampTint: [1.3, 1.3, 1.3] }));
      c.smoke(x, y, z + 30, { count: 16 });
      c.glow(x, y, z + 90, PAL.gold.lt, 520, 2.2, 0.8);
    } else if (BUILDING.test(k)) {
      const big = /fort|ancient/i.test(k);
      const s = big ? 2.2 : 1.3;
      c.flash(x, y, z + 80, PAL.fire, 120 * s, 0.35);
      c.ring(x, y, z, PAL.fire, { R: 260 * s, life: [0.6, 1.0] });
      c.pillar(x, y, z, PAL.fire, { count: Math.round(200 * s), radius: 70 * s, up: [500, 1800] });
      c.embers(x, y, z + 60, PAL.fire, { count: Math.round(50 * s), speed: [200, 600] });
      c.smoke(x, y, z + 40, { count: Math.round(24 * s), radius: 60 * s, size0: [50, 80], size1: [120, 180] });
      c.dust(x, y, z, { count: Math.round(30 * s), speed: [60, 260] });
      c.glow(x, y, z + 110, PAL.fire.lt, 700 * s, 2.6, 1.2);
      if (big) c.later(0.35, () => { c.ring(x, y, z, PAL.sun, { R: 520 }); c.flash(x, y, z + 120, PAL.sun, 200, 0.4); });
    } else {
      // creep / summon / ward: small soul puff
      c.sparks(x, y, z + 40, PAL.mana, { count: 8, speed: [60, 180] });
      P.burst(c.pix(PAL.mana, { x, y, z: z + 20, count: 30, shape: 'disc', radius: 10, life: [0.5, 1.0], speed: [0, 20], up: [60, 140], drag: 0.8, settle: false }));
    }
  });

  R.on(EV.TREE, (ev) => {
    const t = c.map.trees[ev.i]; if (!t) return;
    const x = t[0], y = t[1];
    if (!c.vis(x, y)) return;
    const z = c.zAt(x, y);
    c.leaves(x, y, z + 130, { count: 22, radius: 40 });
    c.dust(x, y, z, { count: 8 }, PAL.earth);
    P.burst({ x, y, z: z + 40, count: 8, shape: 'sphere', radius: 16, life: [0.5, 1.0], size0: 8, size1: 6, col0: [0.9, 0.55, 0.25], col1: [0.35, 0.2, 0.1], a0: 1, a1: 0.3, speed: [100, 260], up: [80, 220], gravity: -520, drag: 0.8, stamp: 'p_ember' });
  });

  // The loser's ancient explodes, the winner's fort throws fireworks for a while.
  R.on(EV.END, (ev) => {
    const us = c.view && c.view.units; if (!us) return;
    let win = null, lose = null;
    for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.kind !== 'ancient') continue; if (u.team === ev.winner) win = u; else lose = u; }
    if (lose) { const x = lose.x, y = lose.y, z = c.zAt(x, y); c.flash(x, y, z + 100, PAL.fire, 260, 0.5); c.pillar(x, y, z, PAL.fire, { count: 420, radius: 120, up: [600, 2400] }); c.ring(x, y, z, PAL.fire, { R: 700 }); c.smoke(x, y, z + 40, { count: 40, radius: 90 }); }
    if (!win) return;
    const wx = win.x, wy = win.y;
    c.run(8, (r, dt) => {
      r._a = (r._a || 0) - dt;
      if (r._a > 0) return;
      r._a = rnd(0.12, 0.3);
      const pal = pick(FIREWORK), ax = wx + rnd(-260, 260), ay = wy + rnd(-180, 180), az = c.zAt(wx, wy) + rnd(400, 640);
      P.burst(c.pix(pal, { x: ax + rnd(-10, 10), y: ay, z: az - 380, count: 60, shape: 'point', life: [0.35, 0.45], speed: 0, up: [900, 1000], settle: false }));
      c.later(0.4, () => {
        P.burst(c.pix(pal, { x: ax, y: ay, z: az, count: 420, shape: 'sphere', radius: 4, life: [0.9, 1.5], speed: [220, 400], gravity: -460, drag: 1.4, linger: [0.6, 1.6] }));
        c.glow(ax, ay, az, pal.lt, 700, 2.2, 0.8);
      });
    });
  });
}
