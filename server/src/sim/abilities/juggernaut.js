// Juggernaut.
import { ST, KIND } from '../../../../shared/protocol.js';
import { evSpell } from '../events.js';

const BF = 'juggernaut_blade_fury', HW = 'juggernaut_healing_ward', BD = 'juggernaut_blade_dance', OS = 'juggernaut_omni_slash';

/** Blade Dance crit multiplier roll (1 = no crit). Shared by normal attacks and Omnislash hits. */
function critRoll(w, u, ab) {
  if (!ab || ab.level < 1 || w.rand() * 100 >= w.val(BD, 'blade_dance_crit_chance', ab.level)) return 1;
  return w.val(BD, 'blade_dance_crit_mult', ab.level) / 100;
}

export default {
  // Spin: magic immune, cannot attack (can move), magic dps to enemies in radius.
  juggernaut_blade_fury: {
    cast(w, u, ab) {
      const lv = ab.level;
      const r = w.val(BF, 'blade_fury_radius', lv), dur = w.val(BF, 'duration', lv), tick = w.val(BF, 'blade_fury_damage_tick', lv) || 0.2;
      const dps = w.val(BF, 'blade_fury_damage', lv);
      w.addModifier(u, {
        key: BF, src: u, dur, status: ST.MAGIC_IMMUNE | ST.DISARM, debuff: false, stack: 'unique',
        onTick(w2, uu, m, dt) {
          m._acc = (m._acc || 0) + dt;
          if (m._acc < tick) return;
          m._acc -= tick;
          for (const v of w2.unitsInRadius(uu.x, uu.y, r, { enemyOf: uu, buildings: false })) w2.damage(uu, v, dps * tick, 'mag', { ability: BF });
        },
      });
      return { r, dur };
    },
  },

  // Stationary ward (dies to any hit) healing allies in radius for heal_amount % max hp per second.
  juggernaut_healing_ward: {
    cast(w, u, ab, tg) {
      const lv = ab.level;
      const r = w.val(HW, 'healing_ward_aura_radius', lv), dur = w.val(HW, 'AbilityDuration', lv), pct = w.val(HW, 'healing_ward_heal_amount', lv);
      let acc = 0;
      w.spawnSummon(u, {
        key: 'juggernaut_healing_ward', kind: KIND.WARD, x: tg.x, y: tg.y, hp: w.val(HW, 'healing_ward_hits_to_kill_tooltip', lv) || 1, ms: 1,
        radius: 16, dur, vision: 600, noAttack: true, noCollide: true,
        think(w2, ward, dt) {
          acc += dt;
          if (acc < 0.5) return;
          const sec = acc; acc = 0;
          for (const v of w2.unitsInRadius(ward.x, ward.y, r, { allyOf: ward, buildings: false })) w2.heal(v, v.maxHp * pct / 100 * sec, ward);
        },
      });
      return { r, dur };
    },
  },

  // Passive crit via info.crit (multiplier applied on top of the roll by combat.js).
  juggernaut_blade_dance: {
    onAttack(w, u, ab, tgt, info) {
      if (tgt._building) return;
      const m = critRoll(w, u, ab);
      if (m > info.crit) info.crit = m;
    },
  },

  // Untargetable flurry: jumps between random enemies near Juggernaut, one attack hit per (attack interval / rate multiplier).
  juggernaut_omni_slash: {
    cast(w, u, ab, tg) {
      const lv = ab.level, t = tg.unit;
      if (!t) return;
      const dur = w.val(OS, 'duration', lv), r = w.val(OS, 'omni_slash_radius', lv), bonus = w.val(OS, 'bonus_damage', lv), rate = w.val(OS, 'attack_rate_multiplier', lv) || 1;
      const bd = w.getAbility(u, BD);
      const slash = (w2, uu, v) => {
        const a = w2.rand() * Math.PI * 2, off = v.radius + uu.radius + 8;
        const ox = uu.x, oy = uu.y;
        w2.teleport(uu, v.x + Math.cos(a) * off, v.y + Math.sin(a) * off);
        uu.facing = Math.atan2(v.y - uu.y, v.x - uu.x);
        const roll = uu.dmgMin + Math.floor(w2.rand() * (uu.dmgMax - uu.dmgMin + 1)) + uu.dmgBonus + bonus;
        const crit = critRoll(w2, uu, bd);
        w2.damage(uu, v, roll * crit, 'phys', { attack: true, crit: crit > 1, ability: OS });
        evSpell(w2, OS, uu.id, { t: v.id, x: Math.round(ox), y: Math.round(oy), x2: Math.round(uu.x), y2: Math.round(uu.y), sub: 'slash' });
      };
      w.addModifier(u, {
        key: OS, src: u, dur, status: ST.INVULN | ST.ROOT | ST.DISARM | ST.SILENCE, as: w.val(OS, 'bonus_attack_speed', lv), debuff: false, stack: 'unique', purge: 'none',
        onTick(w2, uu, m, dt) {
          m._acc = (m._acc || 0) + dt;
          const iv = uu._interval / rate;
          if (m._acc < iv) return;
          m._acc -= iv;
          const list = w2.unitsInRadius(uu.x, uu.y, r, { enemyOf: uu, buildings: false });
          const v = list.length ? list[Math.floor(w2.rand() * list.length)] : null;
          if (!v) { w2.removeModifier(uu, m); return; }
          slash(w2, uu, v);
        },
      });
      slash(w, u, t);
      return { r, dur, t: t.id };
    },
  },
};
