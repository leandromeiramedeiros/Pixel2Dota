// Lion. Finger of Death: no kill-stack scaling / no aghs punch (docs/DECISIONS.md).
import { ST } from '../../../../shared/protocol.js';

const neg = (v) => -Math.abs(v);

export default {
  // Line of spikes (cast range + buffer): magic damage + stun (airborne) to every enemy in it.
  lion_impale: {
    targeting: 'point',
    cast(w, u, ab, tg) {
      const key = 'lion_impale', lv = ab.level;
      const range = w.field(key, 'castRange', lv) + w.val(key, 'length_buffer', lv), speed = w.val(key, 'speed', lv), width = w.val(key, 'width', lv);
      const dmg = w.val(key, 'damage', lv), dur = w.val(key, 'duration', lv), pierce = w.val(key, 'pierces_immunity', lv) > 0;
      const dir = tg.x === u.x && tg.y === u.y ? u.facing : Math.atan2(tg.y - u.y, tg.x - u.x);
      w.spawnProjectile({
        src: u, dir, range, speed, radius: width / 2, pierce: true, k: key,
        onHit(w2, p, v) {
          w2.damage(u, v, dmg, 'mag', { ability: key, pierce });
          if (!v._dead) w2.addModifier(v, { key, src: u, dur, status: ST.STUN, debuff: true, purge: 'strong', airborne: true, pierce });
        },
      });
      return { x2: Math.round(u.x + Math.cos(dir) * range), y2: Math.round(u.y + Math.sin(dir) * range), r: width / 2, dur: range / speed };
    },
  },

  // Hex: turned into a critter (disarmed, silenced, cannot cast). Recalc forces ms to 100 (data says 120).
  lion_voodoo: {
    cast(w, u, ab, tg) {
      const key = 'lion_voodoo', lv = ab.level, t = tg.unit;
      if (!t) return;
      const dur = w.val(key, 'duration', lv);
      w.addModifier(t, { key, src: u, dur, status: ST.HEX | ST.SILENCE | ST.DISARM, debuff: true, purge: 'strong' });
      return { dur };
    },
  },

  // Channel: move target mana to Lion, slow the target while draining; breaks when the target leaves break_distance.
  lion_mana_drain: {
    cast(w, u, ab, tg) {
      const key = 'lion_mana_drain', lv = ab.level, t = tg.unit;
      if (!t) return;
      const mps = w.val(key, 'mana_per_second', lv), slow = w.val(key, 'movespeed', lv), empty = w.val(key, 'movespeed_bonus_when_empty_pct', lv);
      const brk = w.val(key, 'break_distance', lv), dur = w.val(key, 'duration', lv), iv = w.val(key, 'tick_interval', lv) || 0.1;
      let acc = 0;
      return {
        channel: dur, dur, t: t.id,
        tick(w2, u2, ch, dt) {
          if (t._dead || (t._st & (ST.MAGIC_IMMUNE | ST.INVULN)) || Math.hypot(t.x - u2.x, t.y - u2.y) > brk) { w2.interrupt(u2); return; }
          const take = Math.min(mps * dt, t.mana);
          if (take > 0) { t.mana -= take; u2.mana = Math.min(u2.maxMana, u2.mana + take); }
          acc += dt;
          if (acc >= iv) {
            acc = 0;
            w2.addModifier(t, { key, src: u2, dur: iv * 3 + 0.05, msPct: neg(slow + (t.mana <= 0.01 ? empty : 0)), debuff: true, hidden: true });
          }
        },
        end(w2, u2) { w2.removeModifier(t, key, u2.id); },
      };
    },
  },

  // Delayed single-target nuke.
  lion_finger_of_death: {
    cast(w, u, ab, tg) {
      const key = 'lion_finger_of_death', lv = ab.level, t = tg.unit;
      if (!t) return;
      const dmg = w.val(key, 'damage', lv), delay = w.val(key, 'damage_delay', lv);
      w.after(delay, (w2) => { if (!t._dead) w2.damage(u, t, dmg, 'mag', { ability: key }); });
      return { x2: Math.round(t.x), y2: Math.round(t.y), dur: delay };
    },
  },
};
