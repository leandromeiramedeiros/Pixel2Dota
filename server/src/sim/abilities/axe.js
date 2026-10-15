// Axe.
import { ST, KIND } from '../../../../shared/protocol.js';
import { evSpell } from '../events.js';

const neg = (v) => -Math.abs(v);

export default {
  // Taunt every enemy unit in radius (pierces spell immunity); Axe gets bonus armor (+AS) for the duration.
  axe_berserkers_call: {
    pierce: true,
    cast(w, u, ab) {
      const key = 'axe_berserkers_call', lv = ab.level;
      const r = w.val(key, 'radius', lv), dur = w.val(key, 'duration', lv);
      for (const v of w.unitsInRadius(u.x, u.y, r, { enemyOf: u, buildings: false })) {
        w.addModifier(v, { key, src: u, dur, status: ST.TAUNT, taunter: u.id, debuff: true, pierce: true });   // DATA dispel NO -> undispellable
      }
      w.addModifier(u, { key: key + '_armor', src: u, dur, armor: w.val(key, 'bonus_armor', lv), as: w.val(key, 'bonus_attack_speed', lv), debuff: false, hidden: true });
      return { r, dur };
    },
  },

  // Pure DoT + slow. Ends early when the AFFLICTED hero scores a kill or last hit; afflicted creeps just time out.
  axe_battle_hunger: {
    cast(w, u, ab, tg) {
      const key = 'axe_battle_hunger', lv = ab.level, t = tg.unit;
      if (!t) return;
      const p = t.kind === KIND.HERO ? w.players.get(t.owner) : null;
      const score = () => (p ? p.kills + p.lh : 0);
      const m = w.addModifier(t, {
        key, src: u, dur: w.val(key, 'duration', lv), msPct: neg(w.val(key, 'slow', lv)), debuff: true, purge: 'basic',
        dot: { dps: w.val(key, 'damage_per_second', lv), interval: 1, type: 'pure' },
        onTick(w2, v, mod) { if (score() > mod.cnt) w2.removeModifier(v, mod); },
      });
      if (m) m.cnt = score();
      return { dur: w.val(key, 'duration', lv) };
    },
  },

  // Passive: every `trigger_attacks`-th attack taken spins for pure damage around Axe (counter-based, current patch data).
  axe_counter_helix: {
    onAttacked(w, u, ab) {
      const key = 'axe_counter_helix', lv = ab.level;
      u._helix = (u._helix || 0) + 1;
      if (u._helix < w.val(key, 'trigger_attacks', lv)) return;
      if (w.time < (u._helixAt || 0)) return;
      u._helix = 0;
      u._helixAt = w.time + (w.field(key, 'cooldown', lv) || 0);
      const r = w.val(key, 'radius', lv), dmg = w.val(key, 'damage', lv);
      for (const v of w.unitsInRadius(u.x, u.y, r, { enemyOf: u, buildings: false })) w.damage(u, v, dmg, 'pure', { ability: key });
      evSpell(w, key, u.id, { x: Math.round(u.x), y: Math.round(u.y), r, lv });
    },
  },

  // Execute: `damage` is both the kill threshold and the damage dealt above it (data has one value). Kill: reset cooldown,
  // nearby allies (and Axe) get move speed + armor.
  axe_culling_blade: {
    pierce: true,
    cast(w, u, ab, tg) {
      const key = 'axe_culling_blade', lv = ab.level, t = tg.unit;
      if (!t) return;
      const dmg = w.val(key, 'damage', lv);
      w.damage(u, t, dmg, 'pure', { ability: key, pierce: true });   // hp <= dmg: this alone kills
      if (!t._dead) return { x2: Math.round(t.x), y2: Math.round(t.y) };
      ab.cd = 0;
      const r = w.val(key, 'speed_aoe', lv), dur = w.val(key, 'speed_duration', lv);
      const mod = { key, src: u, dur, msPct: w.val(key, 'speed_bonus', lv), armor: w.val(key, 'armor_bonus', lv), debuff: false };
      w.addModifier(u, mod);
      for (const v of w.unitsInRadius(u.x, u.y, r, { allyOf: u, buildings: false })) if (v !== u) w.addModifier(v, mod);
      return { x2: Math.round(t.x), y2: Math.round(t.y), r, dur, kill: 1 };
    },
  },
};
