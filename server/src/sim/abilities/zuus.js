// Zeus. Static Field is an INNATE (docs/DECISIONS.md): level 1 from the start, not skill-pointable. The sim
// does not initialise it (it starts at level 0, so its own hooks never run); every Zeus cast here forces it to 1 and fires the
// pulse itself via staticField().
import { ST, KIND } from '../../../../shared/protocol.js';
import { evSpell } from '../events.js';

const SF = 'zuus_static_field';
const SF_RADIUS = 1200;   // not in the ability data (Dota value)

/** Innate Static Field: every Zeus ability cast shocks nearby enemies for damage_health_pct of their CURRENT health. */
function staticField(w, u) {
  const ab = w.getAbility(u, SF);
  if (!ab) return;
  if (ab.level < 1) { ab.level = 1; u._dirty = true; }
  const pct = w.val(SF, 'damage_health_pct', 1);
  for (const v of w.unitsInRadius(u.x, u.y, SF_RADIUS, { enemyOf: u, buildings: false })) w.damage(u, v, v.hp * pct / 100, 'mag', { ability: SF });
}

const ensureInnate = (w, u) => { const ab = w.getAbility(u, SF); if (ab && ab.level < 1) { ab.level = 1; u._dirty = true; } };

export default {
  // Chain: hits the target, then jumps to the nearest other enemy within radius every jump_delay, jump_count times.
  zuus_arc_lightning: {
    passive: ensureInnate,
    cast(w, u, ab, tg) {
      const key = 'zuus_arc_lightning', lv = ab.level, t = tg.unit;
      if (!t) return;
      const dmg = w.val(key, 'arc_damage', lv), r = w.val(key, 'radius', lv), delay = w.val(key, 'jump_delay', lv);
      const unlimited = w.val(key, 'has_unlimited_jumps', lv) > 0;
      let jumps = w.val(key, 'jump_count', lv);
      const hit = (w2, from, to) => {
        w2.damage(u, to, dmg, 'mag', { ability: key });
        evSpell(w2, key, u.id, { x: Math.round(from.x), y: Math.round(from.y), x2: Math.round(to.x), y2: Math.round(to.y), sub: 'arc' });
        if (!unlimited && jumps-- <= 0) return;
        w2.after(delay, (w3) => {
          if (to._dead) return;
          const nxt = w3.nearestUnit(to.x, to.y, r, { enemyOf: u, buildings: false, exclude: to });
          if (nxt) hit(w3, to, nxt);
        });
      };
      hit(w, u, t);
      staticField(w, u);
      return { r };
    },
  },

  // Strike a unit, or the nearest enemy to the point within spread_aoe: damage, mini stun, true-sight reveal.
  zuus_lightning_bolt: {
    targeting: 'point',
    passive: ensureInnate,
    cast(w, u, ab, tg) {
      const key = 'zuus_lightning_bolt', lv = ab.level;
      const aoe = w.val(key, 'spread_aoe', lv), dmg = w.val(key, 'damage', lv), stun = w.val(key, 'ministun_duration', lv), sight = w.val(key, 'sight_duration', lv);
      const t = tg.unit || w.nearestUnit(tg.x, tg.y, aoe, { enemyOf: u, buildings: false });
      const x = t ? t.x : tg.x, y = t ? t.y : tg.y;
      // vision of the strike spot for sight_duration (day / night radius); true sight over true_sight_radius reveals invisible enemies there
      w.addVision({ owner: u, x, y, r: w.night ? w.val(key, 'sight_radius_night', lv) : w.val(key, 'sight_radius_day', lv), dur: sight });
      for (const v of w.unitsInRadius(x, y, w.val(key, 'true_sight_radius', lv), { enemyOf: u, buildings: false })) {
        if (v !== t && (v._st & ST.INVIS)) w.addModifier(v, { key: key + '_reveal', src: u, dur: sight, status: ST.REVEALED, debuff: true, hidden: true, purge: 'none', pierce: true });
      }
      if (t) {
        w.damage(u, t, dmg, 'mag', { ability: key });
        if (!t._dead) {
          w.addModifier(t, { key: key + '_stun', src: u, dur: stun, status: ST.STUN, debuff: true, purge: 'strong' });
          w.addModifier(t, { key: key + '_reveal', src: u, dur: sight, status: ST.REVEALED, debuff: true, hidden: true, purge: 'none' });
        }
      }
      staticField(w, u);
      return { x: Math.round(x), y: Math.round(y), r: aoe };
    },
  },

  // Innate: the pulse is fired from the other three casts (see staticField); not skill-pointable.
  zuus_static_field: {
    learnReq: () => 999,
  },

  // Global: damage to every living enemy hero.
  zuus_thundergods_wrath: {
    passive: ensureInnate,
    cast(w, u, ab) {
      const key = 'zuus_thundergods_wrath', lv = ab.level;
      const dmg = w.val(key, 'damage', lv), sight = w.val(key, 'sight_duration', lv);
      staticField(w, u);
      for (const v of [...w.units.values()]) {
        if (v.kind !== KIND.HERO || v._dead || v.team === u.team) continue;
        evSpell(w, key, u.id, { t: v.id, x: Math.round(v.x), y: Math.round(v.y), sub: 'strike' });
        w.addVision({ owner: u, x: v.x, y: v.y, r: w.night ? w.val(key, 'sight_radius_night', lv) : w.val(key, 'sight_radius_day', lv), dur: sight });   // each struck spot stays visible
        w.damage(u, v, dmg, 'mag', { ability: key });
        if (!v._dead) w.addModifier(v, { key: key + '_reveal', src: u, dur: sight, status: ST.REVEALED, debuff: true, hidden: true, purge: 'none' });
      }
    },
  },
};
