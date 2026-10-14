// Zeus: Arc Lightning (chain), Lightning Bolt (sky strike), Static Field (pulse), Thundergod's Wrath (global strikes).
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, pal = PAL.volt, white = PAL.steel;

  // ------------------------------------------------------------------------------------------------ arc lightning: cast {r}; chain links sub 'arc' (x,y)->(x2,y2)
  R.spell('zuus_arc_lightning', (ev, su) => {
    if (ev.sub === 'arc') {
      const z0 = c.zAt(ev.x, ev.y) + 85, z1 = c.zAt(ev.x2, ev.y2) + 85;
      c.bolt(ev.x, ev.y, z0, ev.x2, ev.y2, z1, pal, { jag: 22, lightR: 320, light: 0.9 });
      c.bolt(ev.x, ev.y, z0, ev.x2, ev.y2, z1, white, { jag: 14, thick: 0.6, noLights: true });
      c.stars(ev.x2, ev.y2, z1, white, { count: 6 });
      c.sparks(ev.x2, ev.y2, z1, pal, { count: 10 });
      c.flash(ev.x2, ev.y2, z1, pal, 46, 0.14);
      return;
    }
    if (!su) return;
    c.flash(su.x, su.y, c.chest(su), pal, 50, 0.18);
    c.sparks(su.x, su.y, c.chest(su), pal, { count: 10 });
  });

  // ------------------------------------------------------------------------------------------------ lightning bolt: x,y,r
  const strike = (x, y, thick, big) => {
    const z = c.zAt(x, y), top = z + 1600;
    for (let i = 0; i < (big ? 3 : 2); i++) c.bolt(x + rnd(-30, 30), y + rnd(-20, 20), top, x, y, z + 6, i ? white : pal, { jag: 60, thick: thick * (i ? 0.7 : 1.3), lightR: 560, light: 1.2, noLights: i > 0 || big });
    P.burst({ x, y, z, x2: x, y2: y, z2: top, shape: 'line', count: 160, life: [0.12, 0.3], size0: [14 * thick, 22 * thick], size1: 4, col0: white.hot, col1: pal.mid, a0: 1, a1: 0, speed: [0, 10], mode: 'glow', jitter: 6 });
    c.flash(x, y, z + 40, pal, 110 * thick, 0.35);
    c.ring(x, y, z, pal, { R: 190 * thick, life: [0.35, 0.55] });
    c.stars(x, y, z + 60, white, { count: 12 });
    c.sparks(x, y, z + 40, pal, { count: 28, speed: [180, 520] });
    c.dust(x, y, z, { count: 8 });
    c.glow(x, y, z + 100, pal.lt, 640, 2.4 * thick, 0.5, { elem: 'W' });
    c.decal(x, y, 'decal_scorch', 1.3 * thick, 3.5, { tint: [0.8, 1.0, 1.8], emit: 0.5, fadeOut: 0.6 });
    for (let i = 0; i < 4; i++) { const a = rnd(0, TAU), d = rnd(40, 130) * thick; c.bolt(x, y, z + 10, x + Math.cos(a) * d, y + Math.sin(a) * d, z + 6, pal, { jag: 10, noLights: true, thick: 0.6 }); }
  };
  R.spell('zuus_lightning_bolt', (ev, su, tu) => {
    const p = c.at(ev, su, tu); if (!p) return;
    if (su) c.sparks(su.x, su.y, c.chest(su) + 20, pal, { count: 8 });
    strike(p.x, p.y, 1, false);
  });

  // ------------------------------------------------------------------------------------------------ static field (passive pulse around Zeus)
  R.spell('zuus_static_field', (ev, su) => {
    if (!su) return;
    const z = su.z || 0;
    c.ring(su.x, su.y, z, pal, { R: 220, life: [0.25, 0.4] });
    for (let i = 0; i < 4; i++) { const a = rnd(0, TAU); c.bolt(su.x, su.y, c.chest(su), su.x + Math.cos(a) * 120, su.y + Math.sin(a) * 120, z + 10, pal, { jag: 14, noLights: true, thick: 0.6 }); }
    c.flash(su.x, su.y, c.chest(su), pal, 46, 0.14);
  });

  // ------------------------------------------------------------------------------------------------ thundergod's wrath: per-victim sub 'strike' (t,x,y), plus the cast itself
  R.spell('zuus_thundergods_wrath', (ev, su, tu) => {
    if (ev.sub === 'strike') {
      const p = tu || ev; if (p.x == null) return;
      strike(p.x, p.y, 1.5, true);
      return;
    }
    if (!su) return;
    const tg = c.args.target && c.args.target();
    c.flash(su.x, su.y, c.chest(su), pal, 110, 0.35);
    c.ring(su.x, su.y, su.z || 0, pal, { R: 360, life: [0.5, 0.8] });
    c.pillar(su.x, su.y, su.z || 0, pal, { count: 80, radius: 26, up: [600, 1600] });
    c.glow(su.x, su.y, c.chest(su), pal.lt, 800, 2, 0.6);
    if (tg && tg.x != null) c.glow(tg.x, tg.y, 120, pal.lt, 2000, 1.2, 0.5, { mode: 'pop' });   // the whole sky flashes
  });
}
