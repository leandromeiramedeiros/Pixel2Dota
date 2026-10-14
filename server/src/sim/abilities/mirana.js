// Mirana. Imports: only shared/* and ../events.js (see abilities/index.js).
//   Starstorm       (mirana_starfall) instant sweep: every enemy in the radius is hit, then a second star hits the nearest enemy.
//   Sacred Arrow    linear skillshot, hits the first enemy; the stun grows with the distance travelled (min..max over arrow_max_stunrange).
//   Leap            charge-based forward dash (AbilityCharges / AbilityChargeRestoreTime) + move/attack speed buff. While out of charges the
//                   slot's cooldown sweep shows the next charge.
//   Moonlight Shadow every allied hero fades to invisible after fade_delay for the duration (breaks on attack/cast). Not modelled:
//                   bonus_outgoing_damage_pct and arrow_bonus_damage (not wired to a sim stat).
import { ST } from '../../../../shared/protocol.js';
import { evSpell } from '../events.js';

const STAR = 'mirana_starfall', ARROW = 'mirana_arrow', LEAP = 'mirana_leap', MOON = 'mirana_invis';
const SECOND_DELAY = 0.57;
const rnd = Math.round;
const dirTo = (u, tg) => (Math.hypot(tg.x - u.x, tg.y - u.y) > 1 ? Math.atan2(tg.y - u.y, tg.x - u.x) : u.facing);

const leapState = (w, u, ab) => u._leap || (u._leap = { n: w.val(LEAP, 'AbilityCharges', ab.level), t: 0 });

export default {
  // ---------------------------------------------------------------------------------------------------------------- Starstorm
  mirana_starfall: {
    cast(w, u, ab) {
      const lv = ab.level, dmg = w.val(STAR, 'damage', lv), r = w.val(STAR, 'starfall_radius', lv);
      const r2 = w.val(STAR, 'starfall_secondary_radius', lv), pct = w.val(STAR, 'secondary_starfall_damage_percent', lv) / 100;
      const n2 = w.val(STAR, 'secondary_targets', lv) || 1;
      // visual-only rain of stars around Mirana (seeded rng: deterministic)
      for (let i = 0; i < 5; i++) {
        const a = w.rand() * Math.PI * 2, d = Math.sqrt(w.rand()) * r * 0.85;
        evSpell(w, STAR, u.id, { sub: 'rain', x: rnd(u.x + Math.cos(a) * d), y: rnd(u.y + Math.sin(a) * d), r: 90 });
      }
      for (const v of w.unitsInRadius(u.x, u.y, r, { enemyOf: u, buildings: false })) {
        evSpell(w, STAR, u.id, { sub: 'star', t: v.id, x: rnd(v.x), y: rnd(v.y), r: 120 });
        w.damage(u, v, dmg, 'mag', { ability: STAR });
      }
      w.after(SECOND_DELAY, (w2) => {
        if (u._dead) return;
        const seen = new Set();
        for (let i = 0; i < n2; i++) {
          const o = { enemyOf: u, buildings: false, filter: (x) => !seen.has(x.id) };
          const t = w2.nearestUnit(u.x, u.y, r2, { ...o, heroes: true }) || w2.nearestUnit(u.x, u.y, r2, o);
          if (!t) break;
          seen.add(t.id);
          evSpell(w2, STAR, u.id, { sub: 'star2', t: t.id, x: rnd(t.x), y: rnd(t.y), r: 140 });
          w2.damage(u, t, dmg * pct, 'mag', { ability: STAR });
        }
      });
      return { r };
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Sacred Arrow
  mirana_arrow: {
    targeting: 'point',
    cast(w, u, ab, tg) {
      const lv = ab.level;
      const dmg = w.val(ARROW, 'damage', lv), speed = w.val(ARROW, 'arrow_speed', lv), width = w.val(ARROW, 'arrow_width', lv);
      const range = w.val(ARROW, 'arrow_range', lv), sMin = w.val(ARROW, 'arrow_min_stun', lv), sMax = w.val(ARROW, 'arrow_max_stun', lv);
      const sRange = w.val(ARROW, 'arrow_max_stunrange', lv);
      const dir = dirTo(u, tg), ox = u.x, oy = u.y;
      w.spawnProjectile({
        src: u, dir, range, speed, radius: width / 2, k: ARROW,
        onHit(w2, p, v) {
          const dist = Math.hypot(v.x - ox, v.y - oy);
          const stun = sMin + (sMax - sMin) * Math.min(1, dist / sRange);
          w2.damage(u, v, dmg, 'mag', { ability: ARROW });
          if (!v._dead) w2.addModifier(v, { key: ARROW, src: u, dur: stun, status: ST.STUN, debuff: true, purge: 'strong' });
          evSpell(w2, ARROW, u.id, { sub: 'hit', t: v.id, x: rnd(v.x), y: rnd(v.y), dur: stun, r: 90 });
        },
      });
      return { x2: rnd(ox + Math.cos(dir) * range), y2: rnd(oy + Math.sin(dir) * range), r: width / 2, dur: range / speed };
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Leap
  mirana_leap: {
    canCast(w, u, ab) {
      if (u._st & ST.ROOT) return 'Rooted';
      return leapState(w, u, ab).n > 0 ? true : 'No charges';
    },
    cast(w, u, ab) {
      const lv = ab.level, st = leapState(w, u, ab);
      st.n = Math.max(0, st.n - 1);
      const dist = w.val(LEAP, 'leap_distance', lv), speed = w.val(LEAP, 'leap_speed', lv);
      const ox = u.x, oy = u.y;
      w.addModifier(u, {
        key: LEAP, src: u, dur: w.val(LEAP, 'leap_bonus_duration', lv), debuff: false, purge: 'basic',
        msPct: w.val(LEAP, 'leap_speedbonus', lv), as: w.val(LEAP, 'leap_speedbonus_as', lv),
      });
      w.knockback(u, { dir: u.facing, dist, speed });
      ab.cdMax = w.val(LEAP, 'AbilityChargeRestoreTime', lv);
      ab.cd = st.n > 0 ? 0 : Math.max(0, ab.cdMax - st.t);
      return { x2: rnd(ox + Math.cos(u.facing) * dist), y2: rnd(oy + Math.sin(u.facing) * dist), r: 100, dur: dist / speed };
    },
    tick(w, u, ab, dt) {
      const lv = ab.level, st = leapState(w, u, ab);
      const max = w.val(LEAP, 'AbilityCharges', lv), restore = w.val(LEAP, 'AbilityChargeRestoreTime', lv);
      if (st.n < max) {
        st.t += dt;
        if (st.t >= restore) { st.t = 0; st.n++; }
      } else st.t = 0;
      if (st.n > max) st.n = max;
      ab.cdMax = restore;
      ab.cd = st.n > 0 ? 0 : Math.max(0, restore - st.t);
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Moonlight Shadow
  mirana_invis: {
    cast(w, u, ab) {
      const lv = ab.level, dur = w.val(MOON, 'duration', lv), fade = w.val(MOON, 'fade_delay', lv), ms = w.val(MOON, 'bonus_movement_speed', lv);
      for (const v of [...w.units.values()]) {
        if (v.kind !== u.kind || v.team !== u.team || v._dead) continue;   // allied heroes (u is a hero)
        w.addModifier(v, { key: MOON, src: u, dur, fade, status: ST.INVIS, breakOnAttack: true, msPct: ms, debuff: false, purge: 'none' });
        evSpell(w, MOON, u.id, { sub: 'fade', t: v.id, x: rnd(v.x), y: rnd(v.y), dur: fade });
      }
      return { dur, r: 200 };
    },
  },
};
