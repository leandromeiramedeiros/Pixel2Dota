// Sven: fully wired SAMPLE ability file. Copy its shape for other heroes. Imports: only shared/* and ../events.js (see abilities/index.js).
import { ST } from '../../../../shared/protocol.js';

export default {
  // Tracking projectile; on arrival AoE magic damage + stun around the target.
  sven_storm_bolt: {
    cast(w, u, ab, tg) {
      const lv = ab.level, key = 'sven_storm_bolt';
      const aoe = w.val(key, 'bolt_aoe', lv), dmg = w.val(key, 'damage', lv), dur = w.val(key, 'bolt_stun_duration', lv);
      const bolt = w.spawnProjectile({
        src: u, tgt: tg.unit, speed: w.val(key, 'bolt_speed', lv), k: key,
        onHit(w2, p, t) {
          for (const v of w2.unitsInRadius(t.x, t.y, aoe, { enemyOf: u, buildings: false })) {
            w2.damage(u, v, dmg, 'mag', { ability: key });
            w2.addModifier(v, { key: 'stun', src: u, dur, status: ST.STUN, debuff: true, purge: 'strong' });   // DATA dispel YES_STRONG
          }
        },
      });
      w.addVision({ owner: u, x: u.x, y: u.y, r: w.val(key, 'vision_radius', lv), projectile: bolt });   // rides the bolt until it lands / fizzles
      return { r: aoe };
    },
  },

  // Passive: attacks also hit a trapezoid behind/around the target for a percentage of the (unreduced) attack damage.
  sven_great_cleave: {
    onAttackLanded(w, u, ab, tgt, info) {
      if (info.noCleave || tgt._building) return;
      const key = 'sven_great_cleave', lv = ab.level;
      const dist = w.val(key, 'cleave_distance', lv), w0 = w.val(key, 'cleave_starting_width', lv), w1 = w.val(key, 'cleave_ending_width', lv);
      const dmg = info.final * w.val(key, 'great_cleave_damage', lv) / 100;
      const dir = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      for (const v of w.unitsInTrapezoid(u.x, u.y, dir, dist, w0, w1, { enemyOf: u, buildings: false, exclude: tgt })) {
        w.damage(u, v, dmg, 'phys', { ability: key, cleave: true, attack: true });
      }
    },
  },

  // Instant: armor + move speed for allies in radius.
  sven_warcry: {
    cast(w, u, ab) {
      const key = 'sven_warcry', lv = ab.level;
      const r = w.val(key, 'radius', lv), dur = w.val(key, 'duration', lv);
      const armor = w.val(key, 'bonus_armor', lv), ms = w.val(key, 'movespeed', lv);
      for (const v of w.unitsInRadius(u.x, u.y, r, { allyOf: u, buildings: false })) {
        w.addModifier(v, { key, src: u, dur, armor, msPct: ms, debuff: false });
      }
      return { r, dur };
    },
  },

  // Ultimate: bonus damage = pct of base damage for the duration.
  sven_gods_strength: {
    cast(w, u, ab) {
      const key = 'sven_gods_strength', lv = ab.level;
      const dur = w.val(key, 'AbilityDuration', lv), pct = w.val(key, 'gods_strength_damage', lv);
      w.addModifier(u, { key, src: u, dur, dmg: Math.round((u.dmgMin + u.dmgMax) / 2 * pct / 100), debuff: false, stack: 'unique' });
      return { dur };
    },
  },
};
