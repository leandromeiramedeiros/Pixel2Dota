// Rubick: Telekinesis (lift glow, landing shockwave), Fade Bolt (teal chain bolt that hops), Arcane Supremacy (passive, no fx), Spell Steal (green swirl drawn into Rubick).
// Events: telekinesis sub 'lift' {t,x,y,dur,r} / 'land' {t,x,y,r}; fade bolt sub 'bolt' {t,x,y,x2,y2} per hop; steal cast sub 'steal' {t,x,y,k2}.
// Stolen spells fire under their OWN ability key with Rubick as the source, so the original hero's module draws them.
import { PAL, rnd, TAU } from './common.js';

export function register(c, R) {
  const P = c.P, steel = PAL.steel, green = PAL.green, arc = PAL.arc;
  const teal = { hot: [2.0, 5.2, 5.0], mid: [0.8, 3.0, 3.4], low: [0.15, 1.1, 1.5], dim: [0.05, 0.4, 0.6], lt: [0.3, 0.95, 0.9], ramp: PAL.ice.ramp };

  // ------------------------------------------------------------------------------------------------ telekinesis
  R.spell('rubick_telekinesis', (ev, su, tu) => {
    if (ev.sub === 'land') {
      const x = ev.x, y = ev.y, z = c.zAt(x, y), rad = ev.r || 325;
      c.flash(x, y, z + 40, teal, rad * 0.4, 0.25);
      c.ring(x, y, z, teal, { R: rad, life: [0.35, 0.6] });
      c.ring(x, y, z, steel, { R: rad * 0.55, life: [0.25, 0.4] });
      c.dust(x, y, z, { count: 22, radius: rad * 0.25 });
      c.stars(x, y, z + 40, steel, { count: 12 });
      c.sparks(x, y, z + 10, teal, { count: 26, speed: [160, 520] });
      c.glow(x, y, z + 60, teal.lt, rad * 2.2, 1.6, 0.5);
      c.decal(x, y, 'decal_scorch', rad / 130, 2.5, { tint: [0.5, 1.2, 1.3], emit: 0.5, fadeOut: 0.6 });
      return;
    }
    const t = tu; if (!t) return;
    const tid = t.id, dur = Math.max(0.5, ev.dur || 1.5);
    if (su) {   // caster -> target tether
      const a = c.ang(su.x, su.y, t.x, t.y);
      c.flash(su.x + Math.cos(a) * 36, su.y + Math.sin(a) * 36, c.chest(su), teal, 50, 0.16);
      c.line(su.x, su.y, c.chest(su), t.x, t.y, c.chest(t), teal, { life: [0.15, 0.4] });
    }
    c.ringDecal(t.x, t.y, ev.r || 325, dur, [0.7, 2.0, 2.2], { emit: 1.0, fadeIn: 0.25, fadeOut: 0.15, grow: [1.3, 0.5], growSpeed: 0.8 });   // the landing ring tightens
    c.glow(t.x, t.y, c.chest(t), teal.lt, 340, 1.0, dur, { mode: 'flat', follow: tid, dz: 0 });
    c.run(dur, (r, dt) => {   // levitation: motes streaming up past the victim, a pulsing teal halo, a floor shadow ring
      const u = c.unit(tid); if (!u || u.hp <= 0) return false;
      if (!c.vis(u.x, u.y)) return;
      const z0 = u.z || 0;
      for (let n = c.n(120 * dt * 3); n > 0; n--) {
        const a = rnd(0, TAU), d = rnd(14, 48);
        P.spawn(c.pix(teal, { x: u.x + Math.cos(a) * d, y: u.y + Math.sin(a) * d, z: z0 + rnd(0, 40), life: [0.4, 0.9], speed: 0, up: [90, 260], drag: 0.8, settle: false }));
      }
      for (let n = c.n(20 * dt * 3); n > 0; n--) P.spawn(c.pix(steel, { x: u.x + rnd(-20, 20), y: u.y + rnd(-20, 20), z: z0 + rnd(60, 160), life: [0.3, 0.6], speed: [0, 10], settle: false }));
      c.lightNow(u.x, u.y, z0 + 90, teal.lt, 280, 0.5 + 0.2 * Math.sin(c.T * 10), 0);
    });
  });

  // ------------------------------------------------------------------------------------------------ fade bolt: one event per hop
  R.spell('rubick_fade_bolt', (ev, su, tu) => {
    if (ev.sub !== 'bolt') {
      if (su) { c.flash(su.x, su.y, c.chest(su), teal, 40, 0.14); c.sparks(su.x, su.y, c.chest(su), teal, { count: 6 }); }
      return;
    }
    const from = c.unit(ev.s), z0 = from && Math.hypot(from.x - ev.x, from.y - ev.y) < 30 ? c.chest(from) : c.zAt(ev.x, ev.y) + 90;
    const z1 = tu ? c.chest(tu) : c.zAt(ev.x2, ev.y2) + 90;
    c.bolt(ev.x, ev.y, z0, ev.x2, ev.y2, z1, teal, { jag: 26, lightR: 330, light: 1.0 });
    c.bolt(ev.x, ev.y, z0, ev.x2, ev.y2, z1, steel, { jag: 14, thick: 0.55, noLights: true });
    c.flash(ev.x2, ev.y2, z1, teal, 56, 0.16);
    c.stars(ev.x2, ev.y2, z1, steel, { count: 6 });
    c.sparks(ev.x2, ev.y2, z1, teal, { count: 12, speed: [100, 340] });
    c.ring(ev.x2, ev.y2, c.zAt(ev.x2, ev.y2), teal, { R: 90, life: [0.2, 0.35] });
    // the damage-sapping curse: wisps drain off the victim for a moment
    if (tu) c.swirl(tu.id, 0.8, teal, { r: 24, rate: 20, speed: 7, up: -30 });
  });

  // ------------------------------------------------------------------------------------------------ spell steal: t, x, y, k2 = stolen ability
  R.spell('rubick_spell_steal', (ev, su, tu) => {
    if (ev.sub !== 'steal') { if (su) c.sparks(su.x, su.y, c.chest(su), green, { count: 8 }); return; }
    if (!su) return;
    const sid = su.id, tid = tu ? tu.id : '', tx = tu ? tu.x : ev.x, ty = tu ? tu.y : ev.y;
    c.flash(tx, ty, tu ? c.chest(tu) : c.zAt(tx, ty) + 90, green, 70, 0.22);
    c.ring(tx, ty, c.zAt(tx, ty), green, { R: 110, life: [0.3, 0.5] });
    c.glow(tx, ty, c.zAt(tx, ty) + 90, green.lt, 340, 1.2, 0.5);
    // green motes spiral out of the victim into Rubick, then Rubick's own swirl settles
    c.run(0.7, (r, dt) => {
      const s = c.unit(sid), t = tid ? c.unit(tid) : null; if (!s) return false;
      const x0 = t ? t.x : tx, y0 = t ? t.y : ty, z0 = t ? c.chest(t) : c.zAt(tx, ty) + 90, z1 = c.chest(s);
      for (let n = c.n(200 * dt * 3); n > 0; n--) {
        const k = Math.random(), ang = k * 11 + c.T * 9, w = 34 * Math.sin(k * Math.PI);
        P.spawn(c.pix(Math.random() < 0.25 ? arc : green, { x: x0 + (s.x - x0) * k + Math.cos(ang) * w, y: y0 + (s.y - y0) * k + Math.sin(ang) * w, z: z0 + (z1 - z0) * k + Math.sin(ang) * w * 0.6, life: [0.15, 0.35], speed: [0, 20], settle: false }));
      }
    });
    c.later(0.5, () => {
      const s = c.unit(sid); if (!s) return;
      c.flash(s.x, s.y, c.chest(s), green, 80, 0.3);
      c.ring(s.x, s.y, s.z || 0, green, { R: 150, life: [0.35, 0.55] });
      c.stars(s.x, s.y, c.chest(s) + 30, PAL.gold, { count: 10 });
      c.swirl(sid, 1.6, green, { r: 42, rate: 36, speed: 6, h0: 10, h1: 140, up: 30 });
      c.swirl(sid, 1.6, arc, { r: 30, rate: 16, speed: -8, h0: 30, h1: 120, up: 20 });
      c.glow(s.x, s.y, c.chest(s), green.lt, 380, 1.4, 0.6);
    });
  });

  // ------------------------------------------------------------------------------------------------ basic attack bolts (Rubick teal missile, Mirana moon arrow)
  R.proj('rubick', { frames: 'magic_missile', fps: 14, scale: 1.1, tint: [0.6, 1.5, 1.4], emit: 2.4, pal: teal, light: { col: teal.lt, radius: 240, int: 0.8 }, trail: { pal: teal, rate: 50, size: [8, 14] } });
  R.proj('mirana', { frames: 'arrow_frost', fps: 12, scale: 1.0, tint: [1.4, 1.5, 2.4], emit: 2.2, pal: teal, light: { col: [0.62, 0.74, 1], radius: 230, int: 0.7, elem: 'Q' }, trail: { pal: PAL.ice, rate: 55, size: [6, 11], stamp: 'p_snow' } });
}
