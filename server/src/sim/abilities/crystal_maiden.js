// Crystal Maiden. Brilliance Aura is global (docs/DECISIONS.md), x proximity_bonus_factor within proximity_bonus_radius.
import { ST, KIND } from '../../../../shared/protocol.js';
import { ATTR } from '../../../../shared/constants.js';
import { evSpell } from '../events.js';

const neg = (v) => -Math.abs(v);
const BA = 'crystal_maiden_brilliance_aura';

export default {
  crystal_maiden_crystal_nova: {
    cast(w, u, ab, tg) {
      const key = 'crystal_maiden_crystal_nova', lv = ab.level;
      const r = w.val(key, 'radius', lv), dmg = w.val(key, 'nova_damage', lv), dur = w.val(key, 'duration', lv);
      const ms = neg(w.val(key, 'movespeed_slow', lv)), as = neg(w.val(key, 'attackspeed_slow', lv));
      for (const v of w.unitsInRadius(tg.x, tg.y, r, { enemyOf: u, buildings: false })) {
        w.damage(u, v, dmg, 'mag', { ability: key });
        if (!v._dead) w.addModifier(v, { key, src: u, dur, msPct: ms, as: as, debuff: true });
      }
      w.addVision({ owner: u, x: tg.x, y: tg.y, r, dur: w.val(key, 'vision_duration', lv) });   // baked vision_duration; radius = the nova's (not baked)
      return { r };
    },
  },

  // Root + disarm + magic DoT. Non-heroes are held creep_multiplier times longer.
  crystal_maiden_frostbite: {
    cast(w, u, ab, tg) {
      const key = 'crystal_maiden_frostbite', lv = ab.level, t = tg.unit;
      if (!t) return;
      let dur = w.val(key, 'duration', lv);
      if (t.kind !== KIND.HERO) dur *= w.val(key, 'creep_multiplier', lv) || 1;
      w.addModifier(t, {
        key, src: u, dur, status: ST.ROOT | ST.DISARM, debuff: true, purge: 'basic',
        dot: { dps: w.val(key, 'damage_per_second', lv), interval: w.val(key, 'tick_interval', lv) || 0.25, type: 'mag' },
      });
      return { dur };
    },
  },

  // Allies' mana regen (everywhere), x factor within the proximity radius. Self: + mana regen amp %.
  crystal_maiden_brilliance_aura: {
    tick(w, u, ab, dt) {
      u._baT = (u._baT || 0) - dt;
      if (u._baT > 0) return;
      u._baT = 0.5;
      const lv = ab.level, base = w.val(BA, 'base_mana_regen', lv), fac = w.val(BA, 'proximity_bonus_factor', lv), pr = w.val(BA, 'proximity_bonus_radius', lv);
      for (const v of w.units.values()) {
        if (v.kind !== KIND.HERO || v._dead || v.team !== u.team) continue;
        const near = Math.hypot(v.x - u.x, v.y - u.y) <= pr;
        w.addModifier(v, { key: BA, src: u, dur: 1.2, manaRegen: near ? base * fac : base, debuff: false, hidden: true, purge: 'none' });
      }
    },
    bonus(w, u, ab, b) {
      const amp = w.val(BA, 'mana_regen_amp', ab.level);
      b.manaRegen += ((u._base.manaRegen || 0) + (u.int || 0) * ATTR.manaRegenPerInt) * amp / 100;
    },
  },

  // Channel: num_explosions blasts at random spots min..max dist around her (damage + slow), plus a slowing aura over `radius`.
  // No armor bonus: the data has no value for it.
  crystal_maiden_freezing_field: {
    cast(w, u, ab) {
      const key = 'crystal_maiden_freezing_field', lv = ab.level;
      const dur = w.val(key, 'AbilityDuration', lv), n = w.val(key, 'num_explosions', lv), dmg = w.val(key, 'damage', lv);
      const exR = w.val(key, 'explosion_radius', lv), minD = w.val(key, 'explosion_min_dist', lv), maxD = w.val(key, 'explosion_max_dist', lv);
      const r = w.val(key, 'radius', lv), slowDur = w.val(key, 'slow_duration', lv);
      const ms = neg(w.val(key, 'movespeed_slow', lv)), as = neg(w.val(key, 'attack_slow', lv));
      const iv = dur / n;
      let acc = 0, auraT = 0, fired = 0;
      const slow = (w2, v, src) => w2.addModifier(v, { key: key + '_slow', src, dur: slowDur, msPct: ms, as: as, debuff: true });
      return {
        channel: dur, r, dur,
        tick(w2, u2, ch, dt) {
          auraT += dt;
          if (auraT >= 0.25) { auraT -= 0.25; for (const v of w2.unitsInRadius(u2.x, u2.y, r, { enemyOf: u2, buildings: false })) slow(w2, v, u2); }
          acc += dt;
          while (acc >= iv && fired < n) {
            acc -= iv; fired++;
            const a = w2.rand() * Math.PI * 2, d = Math.sqrt(minD * minD + w2.rand() * (maxD * maxD - minD * minD));
            const px = u2.x + Math.cos(a) * d, py = u2.y + Math.sin(a) * d;
            for (const v of w2.unitsInRadius(px, py, exR, { enemyOf: u2, buildings: false })) {
              w2.damage(u2, v, dmg, 'mag', { ability: key });
              if (!v._dead) slow(w2, v, u2);
            }
            evSpell(w2, key, u2.id, { x: Math.round(px), y: Math.round(py), r: exR, sub: 'blast' });
          }
        },
      };
    },
  },
};
