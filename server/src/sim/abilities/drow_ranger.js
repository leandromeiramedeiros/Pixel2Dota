// Drow Ranger.
import { ST, ABF } from '../../../../shared/protocol.js';
import { evSpell } from '../events.js';

const neg = (v) => -Math.abs(v);
const FA = 'drow_ranger_frost_arrows', WS = 'drow_ranger_wave_of_silence', MS = 'drow_ranger_multishot', MM = 'drow_ranger_marksmanship';
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default {
  // Autocast attack modifier (the toggle is handled by the engine, so cast() is never reached): while ON, each attack costs
  // mana, adds `damage` and slows. Defaults to ON when first learned (bots have no toggle logic).
  drow_ranger_frost_arrows: {
    passive(w, u, ab) { if (!u._faInit) { u._faInit = true; ab.flags |= ABF.AUTOCAST_ON; } },
    onAttack(w, u, ab, tgt, info) {
      if (!(ab.flags & ABF.AUTOCAST_ON) || tgt._building || u.mana + 1e-6 < ab.mana) return;
      u.mana -= ab.mana;
      info.dmg += w.val(FA, 'damage', ab.level);
      info.frost = true;
    },
    onAttackLanded(w, u, ab, tgt, info) {
      if (!info.frost || tgt._dead) return;
      w.addModifier(tgt, { key: FA, src: u, dur: w.val(FA, 'AbilityDuration', ab.level), msPct: neg(w.val(FA, 'frost_arrows_movement_speed', ab.level)), debuff: true });
    },
  },

  // Linear wave: silences everything it touches and shoves it away from Drow (more when close).
  drow_ranger_wave_of_silence: {
    cast(w, u, ab, tg) {
      const lv = ab.level;
      const len = w.val(WS, 'wave_length', lv), speed = w.val(WS, 'wave_speed', lv), width = w.val(WS, 'wave_width', lv);
      const sil = w.val(WS, 'silence_duration', lv), kmax = w.val(WS, 'knockback_distance_max', lv);
      const kdur = w.val(WS, 'knockback_duration', lv), kdurMin = w.val(WS, 'knockback_duration_min', lv);
      const dir = tg.x === u.x && tg.y === u.y ? u.facing : Math.atan2(tg.y - u.y, tg.x - u.x);
      const ox = u.x, oy = u.y;
      w.spawnProjectile({
        src: u, dir, range: len, speed, radius: width / 2, pierce: true, k: WS,
        onHit(w2, p, v) {
          w2.addModifier(v, { key: WS, src: u, dur: sil, status: ST.SILENCE, debuff: true, purge: 'basic' });
          if (v._dead || (v._st & ST.MAGIC_IMMUNE)) return;
          const f = clamp01(1 - Math.hypot(v.x - ox, v.y - oy) / len);
          const d = kmax * f, t = kdurMin + (kdur - kdurMin) * f;
          if (d > 1) w2.knockback(v, { dx: v.x - ox || Math.cos(dir), dy: v.y - oy || Math.sin(dir), dist: d, speed: d / t });
        },
      });
      return { x2: Math.round(u.x + Math.cos(dir) * len), y2: Math.round(u.y + Math.sin(dir) * len), r: width / 2, dur: len / speed };
    },
  },

  // Channel: wave_count volleys of arrow_count_per_wave arrows fanned over arrow_angle, each arrow stops at the first unit hit.
  drow_ranger_multishot: {
    cast(w, u, ab, tg) {
      const lv = ab.level;
      const dur = w.field(MS, 'channel', lv), waves = w.val(MS, 'wave_count', lv), per = w.val(MS, 'arrow_count_per_wave', lv);
      const fan = w.val(MS, 'arrow_angle', lv) * Math.PI / 180, pct = w.val(MS, 'arrow_damage_pct', lv) / 100;
      const speed = w.val(MS, 'arrow_speed', lv), width = w.val(MS, 'arrow_width', lv);
      const mult = w.val(MS, 'arrow_range_multiplier', lv) || 1;
      const dir = tg.x === u.x && tg.y === u.y ? u.facing : Math.atan2(tg.y - u.y, tg.x - u.x);
      const iv = dur / waves;
      let t = 0, fired = 0;
      return {
        channel: dur, dur, x2: Math.round(u.x + Math.cos(dir) * 600), y2: Math.round(u.y + Math.sin(dir) * 600),
        tick(w2, u2, ch, dt) {
          t += dt;
          while (fired < waves && t >= fired * iv) {
            fired++;
            const range = Math.max(w2.val(MS, 'arrow_range_base', lv), u2.atkRange * mult);
            const dmg = ((u2.dmgMin + u2.dmgMax) / 2 + u2.dmgBonus) * pct;
            for (let i = 0; i < per; i++) {
              const a = dir + (per > 1 ? (i / (per - 1) - 0.5) * fan : 0);
              w2.spawnProjectile({
                src: u2, dir: a, range, speed, radius: width / 2, k: MS,
                onHit(w3, p, v) { w3.damage(u2, v, dmg, 'phys', { ability: MS }); },
              });
            }
          }
        },
      };
    },
  },

  // Passive: chance for bonus pure damage on top of the attack (ignores armor), off while an enemy hero is within disable_range.
  drow_ranger_marksmanship: {
    onAttack(w, u, ab, tgt, info) {
      const lv = ab.level;
      if (tgt._building || w.rand() * 100 >= w.val(MM, 'chance', lv)) return;
      if (w.nearestUnit(u.x, u.y, w.val(MM, 'disable_range', lv), { enemyOf: u, heroes: true })) return;
      info.marksman = w.val(MM, 'bonus_damage', lv);
    },
    onAttackLanded(w, u, ab, tgt, info) {
      if (info.marksman && !tgt._dead) {
        w.damage(u, tgt, info.marksman, 'pure', { ability: MM, attack: true });
        evSpell(w, MM, u.id, { t: tgt.id, lv: ab.level });
      }
    },
  },
};
