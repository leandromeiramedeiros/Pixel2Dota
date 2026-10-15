// Pudge. Imports: only shared/* and ../events.js (see abilities/index.js).
//   Meat Hook    linear skillshot, hooks the FIRST unit hit (enemy, ally or creep) and drags it back to Pudge; damage to enemies only.
//   Rot          toggle (cast() runs on every flip; the aura work is in tick). Hurts everything around Pudge AND Pudge himself, slows enemies.
//   Flesh Heap   baked data (patch 6958) is an ACTIVE: magic resistance (damage_block %) for `duration`. The brief's passive part is the
//                strength stack gained on hero kills (onKill; assists have no sim hook so they do not stack). Per-stack strength is not baked.
//   Dismember    single-target channelled disable: stun + damage over time, Pudge is healed by the damage dealt. The pull is not modelled.
import { ST, ABF, KIND } from '../../../../shared/protocol.js';
import { evSpell } from '../events.js';

const HOOK = 'pudge_meat_hook', ROT = 'pudge_rot', FH = 'pudge_flesh_heap', DIS = 'pudge_dismember';
const FH_STR = [0.9, 1.1, 1.3, 1.5];   // strength per Flesh Heap stack by level (Dota value, not in the baked data)
const rnd = Math.round;

export default {
  // ---------------------------------------------------------------------------------------------------------------- Meat Hook
  pudge_meat_hook: {
    targeting: 'point',
    cast(w, u, ab, tg) {
      const lv = ab.level;
      const dmg = w.val(HOOK, 'damage', lv), speed = w.val(HOOK, 'hook_speed', lv), width = w.val(HOOK, 'hook_width', lv);
      const range = w.field(HOOK, 'castRange', lv);
      const dir = Math.hypot(tg.x - u.x, tg.y - u.y) > 1 ? Math.atan2(tg.y - u.y, tg.x - u.x) : u.facing;
      const ox = u.x, oy = u.y;
      const back = (w2, p, hooked) => {   // the chain retracting (visual only: the dragged unit rides the same line at the same speed)
        const d = Math.hypot(p.x - u.x, p.y - u.y);
        if (d < 40) return;
        w2.spawnProjectile({ src: u, x: p.x, y: p.y, x2: u.x, y2: u.y, range: d, speed, radius: 1, k: HOOK + '_back', filter: () => false, data: { hooked: !!hooked } });
      };
      const hook = w.spawnProjectile({
        src: u, dir, range, speed, radius: width / 2, k: HOOK, hitAllies: true, data: { hooked: null },
        filter: (v) => v !== u && !v._dead && !(v._st & ST.INVULN) && !v._building,
        onHit(w2, p, v) {
          p.data.hooked = v;
          if (v.team !== u.team) w2.damage(u, v, dmg, 'pure', { ability: HOOK });
          evSpell(w2, HOOK, u.id, { t: v.id, x: rnd(v.x), y: rnd(v.y), x2: rnd(u.x), y2: rnd(u.y), sub: 'hit' });
          if (v._dead) return;
          const d = Math.hypot(u.x - v.x, u.y - v.y) - u.radius - v.radius - 24;
          if (d > 1) w2.knockback(v, { dir: Math.atan2(u.y - v.y, u.x - v.x), dist: d, speed });
        },
        onEnd(w2, p) { back(w2, p, p.data.hooked); },
      });
      w.addVision({ owner: u, x: ox, y: oy, r: w.val(HOOK, 'vision_radius', lv), projectile: hook, linger: w.val(HOOK, 'vision_duration', lv) });   // follows the hook head, then lingers where it ended
      return { x2: rnd(ox + Math.cos(dir) * range), y2: rnd(oy + Math.sin(dir) * range), r: width / 2, dur: range / speed };
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Rot
  pudge_rot: {
    cast(w, u, ab) {
      u._rotT = 0;
      evSpell(w, ROT, u.id, { sub: ab.flags & ABF.TOGGLE_ON ? 'on' : 'off', r: w.val(ROT, 'rot_radius', ab.level) });
    },
    tick(w, u, ab, dt) {
      if (!(ab.flags & ABF.TOGGLE_ON)) return;
      const lv = ab.level, iv = w.val(ROT, 'rot_tick', lv) || 0.2;
      u._rotT = (u._rotT || 0) + dt;
      if (u._rotT < iv) return;
      u._rotT -= iv;
      const dmg = w.val(ROT, 'rot_damage', lv) * iv, r = w.val(ROT, 'rot_radius', lv), slow = w.val(ROT, 'rot_slow', lv);
      for (const v of w.unitsInRadius(u.x, u.y, r, { enemyOf: u, buildings: false })) {
        w.damage(u, v, dmg, 'mag', { ability: ROT, dot: true, silent: true });
        if (!v._dead) w.addModifier(v, { key: ROT, src: u, dur: iv * 2 + 0.1, msPct: slow, debuff: true, purge: 'basic', hidden: true });
      }
      w.damage(u, u, dmg, 'mag', { ability: ROT, dot: true, silent: true, noKill: true });   // Rot hurts Pudge too but never kills him
    },
    onDeath(w, u, ab) { ab.flags &= ~ABF.TOGGLE_ON; },
  },

  // ---------------------------------------------------------------------------------------------------------------- Flesh Heap
  pudge_flesh_heap: {
    cast(w, u, ab) {
      const lv = ab.level, dur = w.val(FH, 'duration', lv);
      w.addModifier(u, { key: FH, src: u, dur, mr: w.val(FH, 'damage_block', lv), debuff: false });   // purge from DATA (dispel NO)
      return { dur, r: 140 };
    },
    bonus(w, u, ab, b) { b.str += (u._fhStacks || 0) * FH_STR[Math.min(ab.level, FH_STR.length) - 1]; },
    onKill(w, u, ab, victim) {
      if (victim.kind !== KIND.HERO || victim.team === u.team) return;   // enemy heroes only (both are heroes)
      u._fhStacks = (u._fhStacks || 0) + 1;
      u._dirty = true;
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Dismember
  pudge_dismember: {
    cast(w, u, ab, tg) {
      const t = tg.unit;
      if (!t) return;
      const lv = ab.level, dur = w.field(DIS, 'channel', lv), ticks = w.val(DIS, 'ticks', lv) || 6;
      const perSec = w.val(DIS, 'dismember_damage', lv) + w.val(DIS, 'strength_damage', lv) * u.str;
      const iv = dur / ticks;
      w.addModifier(t, { key: DIS, src: u, dur: dur + 0.1, status: ST.STUN, debuff: true, purge: 'strong' });
      let acc = 0;
      return {
        channel: dur, dur, r: 120,
        tick(w2, me, ch, dt) {
          if (t._dead) { w2.interrupt(me); return; }
          acc += dt;
          while (acc >= iv - 1e-6) {
            acc -= iv;
            const dealt = w2.damage(me, t, perSec * iv, 'mag', { ability: DIS, dot: true });
            if (dealt > 0) w2.heal(me, dealt, me);
            if (t._dead) { w2.interrupt(me); return; }
          }
        },
        end(w2) { w2.removeModifier(t, DIS, u.id); },
      };
    },
  },
};
