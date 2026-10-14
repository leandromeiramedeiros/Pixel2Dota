// Lina. No onCast hook exists, so Fiery Soul stacks are added from this file's own casts (fiery()).
import { ST } from '../../../../shared/protocol.js';

const FS = 'lina_fiery_soul';

/** Fiery Soul: each Lina ability cast adds a stack of attack speed + move speed % (all stacks refresh together). */
function fiery(w, u) {
  const ab = w.getAbility(u, FS);
  if (!ab || ab.level < 1) return;
  const lv = ab.level;
  w.addModifier(u, {
    key: FS, src: u, dur: w.val(FS, 'fiery_soul_stack_duration', lv), stack: 'stack', maxStacks: w.val(FS, 'fiery_soul_max_stacks', lv),
    as: w.val(FS, 'fiery_soul_attack_speed_bonus', lv), msPct: w.val(FS, 'fiery_soul_move_speed_bonus', lv), debuff: false, purge: 'none',
  });
}

export default {
  // Linear piercing wave, magic damage. Data says unit+point; we accept both and aim at the point / unit position.
  lina_dragon_slave: {
    targeting: 'point',
    cast(w, u, ab, tg) {
      const key = 'lina_dragon_slave', lv = ab.level;
      const dist = w.val(key, 'dragon_slave_distance', lv), speed = w.val(key, 'dragon_slave_speed', lv), dmg = w.val(key, 'dragon_slave_damage', lv);
      const w0 = w.val(key, 'dragon_slave_width_initial', lv), w1 = w.val(key, 'dragon_slave_width_end', lv);
      const dir = tg.x === u.x && tg.y === u.y ? u.facing : Math.atan2(tg.y - u.y, tg.x - u.x);
      w.spawnProjectile({
        src: u, dir, range: dist, speed, radius: (w0 + w1) / 4, pierce: true, k: key,
        onHit(w2, p, v) { w2.damage(u, v, dmg, 'mag', { ability: key }); },
      });
      fiery(w, u);
      return { x2: Math.round(u.x + Math.cos(dir) * dist), y2: Math.round(u.y + Math.sin(dir) * dist), r: w1 / 2, dur: dist / speed };
    },
  },

  // Delayed column: AoE magic damage + stun when it lands.
  lina_light_strike_array: {
    cast(w, u, ab, tg) {
      const key = 'lina_light_strike_array', lv = ab.level;
      const aoe = w.val(key, 'light_strike_array_aoe', lv), dmg = w.val(key, 'light_strike_array_damage', lv);
      const delay = w.val(key, 'light_strike_array_delay_time', lv), stun = w.val(key, 'light_strike_array_stun_duration', lv);
      const x = tg.x, y = tg.y;
      w.after(delay, (w2) => {
        for (const v of w2.unitsInRadius(x, y, aoe, { enemyOf: u, buildings: false })) {
          w2.damage(u, v, dmg, 'mag', { ability: key });
          w2.addModifier(v, { key, src: u, dur: stun, status: ST.STUN, debuff: true, purge: 'strong' });
        }
      });
      fiery(w, u);
      return { r: aoe, dur: delay };
    },
  },

  // Passive: stacks are applied by fiery() from the casts above/below.
  lina_fiery_soul: {},

  // Single-target nuke after a short delay.
  lina_laguna_blade: {
    cast(w, u, ab, tg) {
      const key = 'lina_laguna_blade', lv = ab.level, t = tg.unit;
      if (!t) return;
      const dmg = w.val(key, 'damage', lv), delay = w.val(key, 'damage_delay', lv), pierce = w.val(key, 'pierce_immunity', lv) > 0;
      w.after(delay, (w2) => { if (!t._dead) w2.damage(u, t, dmg, 'mag', { ability: key, pierce }); });
      fiery(w, u);
      return { x2: Math.round(t.x), y2: Math.round(t.y), dur: delay };
    },
  },
};
