// Sniper. Shrapnel charges are simplified to a cooldown (restore time / charges); Take Aim's active and Headshot knockback
// are out (docs/DECISIONS.md).
import { ST, ABF } from '../../../../shared/protocol.js';
import { evSpell } from '../events.js';

const neg = (v) => -Math.abs(v);
const MINI_STUN = 0.2;   // Assassinate mini-stun: not in the ability data

export default {
  // Delayed AoE zone: after damage_delay, every second for `duration` it damages and re-slows enemies inside.
  sniper_shrapnel: {
    cooldown: (w, u, ab) => w.val('sniper_shrapnel', 'AbilityChargeRestoreTime', ab.level) / (w.val('sniper_shrapnel', 'AbilityCharges', ab.level) || 1),
    cast(w, u, ab, tg) {
      const key = 'sniper_shrapnel', lv = ab.level;
      const r = w.val(key, 'radius', lv), dmg = w.val(key, 'shrapnel_damage', lv), delay = w.val(key, 'damage_delay', lv), dur = w.val(key, 'duration', lv);
      const slowDur = w.val(key, 'slow_duration', lv), slow = neg(w.val(key, 'slow_movement_speed', lv));
      const x = tg.x, y = tg.y;
      let left = Math.max(1, Math.floor(dur));
      const pulse = (w2) => {
        for (const v of w2.unitsInRadius(x, y, r, { enemyOf: u, buildings: false })) {
          w2.damage(u, v, dmg, 'mag', { ability: key });
          if (!v._dead) w2.addModifier(v, { key, src: u, dur: slowDur, msPct: slow, debuff: true });
        }
        if (--left > 0) w2.after(1, pulse);
      };
      w.addVision({ owner: u, x, y, r, dur: delay + dur });   // Shrapnel reveals its zone for its whole life; vision radius is not baked, so = the zone radius (Dota)
      w.after(delay, (w2) => { evSpell(w2, key, u.id, { x: Math.round(x), y: Math.round(y), r, dur, sub: 'zone' }); pulse(w2); });
      return { r, dur: delay + dur };
    },
  },

  // Passive proc: extra damage and a brief near-full slow (no knockback).
  sniper_headshot: {
    onAttack(w, u, ab, tgt, info) {
      if (tgt._building || w.rand() * 100 >= w.val('sniper_headshot', 'proc_chance', ab.level)) return;
      info.dmg += w.val('sniper_headshot', 'damage', ab.level);
      info.headshot = true;
    },
    onAttackLanded(w, u, ab, tgt, info) {
      if (!info.headshot || tgt._dead) return;
      const key = 'sniper_headshot', lv = ab.level;
      w.addModifier(tgt, { key, src: u, dur: w.val(key, 'slow_duration', lv), msPct: neg(w.val(key, 'slow', lv)), debuff: true, hidden: true });
    },
  },

  // Passive attack range only.
  sniper_take_aim: {
    targeting: 'passive',
    manaCost: () => 0,
    cooldown: () => 0,
    passive(w, u, ab) { ab.flags = (ab.flags & ~ABF.NO_TARGET) | ABF.PASSIVE; },
    bonus(w, u, ab, b) { b.range += w.val('sniper_take_aim', 'passive_attack_range_bonus', ab.level); },
  },

  // Slow tracking bolt after a 2 s cast point; mini-stun on hit; kill refunds cooldown.
  sniper_assassinate: {
    cast(w, u, ab, tg) {
      const key = 'sniper_assassinate', lv = ab.level, t = tg.unit;
      if (!t) return;
      const dmg = w.val(key, 'damage', lv), refund = w.val(key, 'cooldown_reduction_on_kill', lv);
      w.spawnProjectile({
        src: u, tgt: t, speed: w.val(key, 'projectile_speed', lv), k: key,
        onHit(w2, p, v) {
          w2.damage(u, v, dmg, 'mag', { ability: key });
          if (v._dead) { ab.cd = Math.max(0, ab.cd - refund); return; }
          w2.addModifier(v, { key: key + '_stun', src: u, dur: MINI_STUN, status: ST.STUN, debuff: true });   // purge from DATA (dispel NO)
        },
      });
      return { t: t.id };
    },
  },
};
