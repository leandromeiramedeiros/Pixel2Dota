// Invoker: orbs (Quas/Wex/Exort), Invoke and the ten invoked spells. Imports: only shared/* and ../events.js (see abilities/index.js).
//
// State (all private to this file, never serialised):  u._inv = { cd: {spellKey: secsLeft}, slots: [keyD, keyF] }
//   u.orbs (public) = last 3 orbs "QWE"-style.  u.abilities = [quas, wex, exort, D, F, invoke]; Invoke rewrites D/F (key, level, flags, mana, cdMax, cd).
//   Cooldowns are PER SPELL: while a spell sits in D/F its slot `cd` is the truth (heroTick ticks it); unslotted spells are ticked here.
//
// Orb-level rule: an invoked spell's value arrays (9 entries) are indexed by the orb level the same way the orb's own arrays are,
// i.e. orb level L (1..8) reads entry L-1 (that is what the game files and the trainer do). server/src/sim/API.md "Invoker / Rubick slot rules" says
// `level = orbLevel + 1` (one entry higher); flip ORB_SHIFT to 1 to follow that text literally. Everything funnels through V().
import { ST, EV, ABF } from '../../../../shared/protocol.js';
import { evMsg, evSpell } from '../events.js';

const ORB_SHIFT = 0;
const ORB_IDX = { Q: 0, W: 1, E: 2 };
const LEVEL_KEY = { quaslevel: 0, wexlevel: 1, exortlevel: 2 };
const INVOKE_SLOT = 5, SLOT_D = 3, SLOT_F = 4;
const EMPTY = ['invoker_empty1', 'invoker_empty2'];

// combination (any order) -> spell
const RECIPES = {};
for (const [combo, spell] of Object.entries({
  QQQ: 'invoker_cold_snap', QQW: 'invoker_ghost_walk', QQE: 'invoker_ice_wall', WWW: 'invoker_emp', WWQ: 'invoker_tornado',
  WWE: 'invoker_alacrity', EEE: 'invoker_sun_strike', EEQ: 'invoker_forge_spirit', EEW: 'invoker_chaos_meteor', QWE: 'invoker_deafening_blast',
})) RECIPES[combo.split('').sort().join('')] = spell;

// Not in the baked data: Deafening Blast knockback speed (trainer: distance = knockback_duration * 150), Forged Spirit unit stats and
// Melting Strike (forged_spirit_melting_strike is not baked).
// Debuff immunity (DATA immunity, see status.addModifier / combat.damage): ENEMIES_NO spells still deal their damage to a debuff-immune
// unit (reduced by its magic resistance) but apply no debuff, lift, knockback or mana burn; Sun Strike (ENEMIES_YES) pierces fully.
const KNOCK_SPEED = 150;
const SPIRIT = { ms: 320, bat: 1.35, atkPoint: 0.2, projSpeed: 1000, radius: 16, vision: 1200, ring: 80 };   // npc_dota_invoker_forged_spirit KV (MovementSpeed, AttackRate, AttackAnimationPoint)
const MELT = { maxArmor: 12, dur: 5 };
const VISION_FALLBACK = { r: 400, dur: 4 };   // Sun Strike vision if the baked data ever loses vision_distance / vision_duration (Dota: 400 / 4 s)

const orbLevel = (u, i) => { const ab = u.abilities[i]; return ab ? ab.level : 0; };
/** Value of an invoked spell for caster u: orb-scaled when the value has a levelKey, else level 1. */
function V(w, u, key, name) {
  const lk = w.data.abilities[key] && w.data.abilities[key].levelKeys && w.data.abilities[key].levelKeys[name];
  return w.val(key, name, lk === undefined ? 1 : orbLevel(u, LEVEL_KEY[lk]) + ORB_SHIFT);
}
const inv = (u) => u._inv || (u._inv = { cd: {}, slots: ['', ''] });
const dirTo = (u, tg) => (Math.hypot(tg.x - u.x, tg.y - u.y) > 1 ? Math.atan2(tg.y - u.y, tg.x - u.x) : u.facing);
const foes = (u) => ({ enemyOf: u, buildings: false });
const countOrbs = (u, ch) => { let n = 0; const s = u.orbs || ''; for (let i = 0; i < s.length; i++) if (s[i] === ch) n++; return n; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ------------------------------------------------------------------------------------------------------------------- orbs
/** Invoke is innate (level 1, not learnable): make sure it exists once any orb is learned. */
function ensureInvoke(w, u) {
  const iv = u.abilities[INVOKE_SLOT];
  if (iv && iv.key === 'invoker_invoke' && iv.level < 1) { iv.level = 1; iv.mana = 0; iv.cdMax = invokeCd(w, u); u._dirty = true; }
  return inv(u);
}

function blocked(u) { return !!(u._dead || (u._st & (ST.STUN | ST.HEX | ST.SILENCE))); }

function castOrb(w, u, ab, ch) {
  if (blocked(u) || ab.level < 1) return false;
  ensureInvoke(w, u);
  u.orbs = ((u.orbs || '') + ch).slice(-3);
  u._dirty = true;
  return true;
}

// Orbs are instant and must not touch the order queue (a Q press must not cancel a move). `autocast: true` makes orders.push route the
// order to `toggle` immediately instead of queueing a cast; we undo the autocast flag it flips.
const orb = (ch, perInstance) => ({
  autocast: true,
  toggle(w, u, ab) { ab.flags &= ~ABF.AUTOCAST_ON; castOrb(w, u, ab, ch); },
  cast(w, u, ab) { castOrb(w, u, ab, ch); },
  passive(w, u) { ensureInvoke(w, u); },
  tick(w, u) { if (u.abilities[INVOKE_SLOT].level < 1) ensureInvoke(w, u); },
  bonus(w, u, ab, b) {
    const n = countOrbs(u, ch);
    if (n) perInstance(w, ab, b, n);
  },
});

// ------------------------------------------------------------------------------------------------------------------- invoke
// Invoke cooldown against total orb levels: linear between the trainer's anchors (7 - 0.3/orb level up to 3 levels, then flatter).
const INVOKE_CD = [[0, 7], [3, 6.1], [6, 4.9], [9, 4.0], [12, 2.8], [15, 1.9], [18, 0.7], [21, 0]];
function invokeCd(w, u) {
  const base = w.field('invoker_invoke', 'cooldown', 1) || 7;
  const sum = orbLevel(u, 0) + orbLevel(u, 1) + orbLevel(u, 2);
  let cd = INVOKE_CD[INVOKE_CD.length - 1][1];
  for (let i = 1; i < INVOKE_CD.length; i++) if (sum <= INVOKE_CD[i][0]) { const [a, ca] = INVOKE_CD[i - 1], [b, cb] = INVOKE_CD[i]; cd = ca + (cb - ca) * (sum - a) / (b - a); break; }
  return cd * (base / 7);
}

function slotFlags(w, key) {
  const d = w.data.abilities[key];
  if (!d) return ABF.PASSIVE;
  const b = d.behavior || [];
  let f = 0;
  if (b.indexOf('NO_TARGET') >= 0) f |= ABF.NO_TARGET;
  if (b.indexOf('UNIT_TARGET') >= 0) f |= ABF.UNIT_TARGET;
  if (b.indexOf('POINT') >= 0) f |= ABF.POINT_TARGET;
  return f;
}

/** Copy slot ability cooldowns into the per-spell table (before any slot rewrite). */
function syncOut(u) {
  const s = inv(u);
  for (let i = 0; i < 2; i++) { const k = s.slots[i]; if (k) s.cd[k] = u.abilities[SLOT_D + i].cd; }
}

function applySlots(w, u) {
  const s = inv(u);
  for (let i = 0; i < 2; i++) {
    const ab = u.abilities[SLOT_D + i], k = s.slots[i];
    if (k) {
      ab.key = k; ab.level = 1; ab.flags = slotFlags(w, k);
      ab.mana = w.field(k, 'manaCost', 1) || 0; ab.cdMax = w.field(k, 'cooldown', 1) || 0; ab.cd = s.cd[k] || 0;
    } else { ab.key = EMPTY[i]; ab.level = 0; ab.flags = ABF.PASSIVE; ab.mana = 0; ab.cdMax = 0; ab.cd = 0; }
  }
  u._dirty = true;
}

/** Try to invoke the spell matching u.orbs. Returns 'new' | 'swap' | 'same' | false (not allowed). `free`: caller already paid the cooldown. */
function doInvoke(w, u, ab, free) {
  if (blocked(u) || ab.level < 1) return false;
  const orbs = u.orbs || '';
  const note = (t) => { const p = u.owner && w.players.get(u.owner); if (p) evMsg(w, t, p.sid); };
  if (orbs.length < 3) { note('Need three orbs'); return false; }
  const spell = RECIPES[orbs.split('').sort().join('')];
  if (!spell) return false;
  const s = inv(u);
  syncOut(u);
  if (s.slots[0] === spell) return 'same';
  if (s.slots[1] === spell) {
    s.slots = [s.slots[1], s.slots[0]];
    applySlots(w, u);
    w.emit({ e: EV.INVOKE, s: u.id, k: spell });
    return 'swap';
  }
  if (!free && ab.cd > 1e-6) { note('Invoke is on cooldown'); return false; }
  s.slots = [spell, s.slots[0]];
  applySlots(w, u);
  ab.cd = ab.cdMax = invokeCd(w, u);
  w.emit({ e: EV.INVOKE, s: u.id, k: spell });
  return 'new';
}

const invokeH = {
  autocast: true,   // see orb(): immediate, never interrupts orders
  toggle(w, u, ab) { ab.flags &= ~ABF.AUTOCAST_ON; doInvoke(w, u, ab, false); },
  // reached via w.castNow (cooldown already paid by executeAbility): refund it unless a brand new spell was invoked
  cast(w, u, ab) { const r = doInvoke(w, u, ab, true); if (r !== 'new') ab.cd = 0; },
  tick(w, u, ab, dt) {
    const s = inv(u);
    ab.cdMax = invokeCd(w, u);
    // slotted spells: slot cd is the truth (heroTick already ticked it); unslotted spells tick here
    for (const k of Object.keys(s.cd)) {
      const i = s.slots.indexOf(k);
      if (i >= 0) s.cd[k] = u.abilities[SLOT_D + i].cd;
      else if (s.cd[k] > 0) s.cd[k] = Math.max(0, s.cd[k] - dt);
      if (s.cd[k] <= 0 && i < 0) delete s.cd[k];
    }
    for (let i = 0; i < 2; i++) { const k = s.slots[i]; if (k && s.cd[k] === undefined) s.cd[k] = u.abilities[SLOT_D + i].cd; }
  },
};

const noop = { cast() {} };

// ------------------------------------------------------------------------------------------------------------------- spells
function coldSnapFreeze(w, src, t, m, key, freezeDur, freezeDmg, freezeCd) {
  w.addModifier(t, { key: 'invoker_cold_snap_freeze', src, dur: freezeDur, status: ST.STUN, debuff: true });
  w.damage(src, t, freezeDmg, 'mag', { ability: key });
  m.freezeCd = freezeCd;
  m.lastHp = t.hp;
}

const spells = {
  invoker_cold_snap: {
    cast(w, u, ab, tg) {
      const key = 'invoker_cold_snap', t = tg.unit;
      if (!t) return;
      const dur = V(w, u, key, 'duration'), trig = V(w, u, key, 'damage_trigger'), fcd = V(w, u, key, 'freeze_cooldown');
      const fdur = V(w, u, key, 'freeze_duration'), fdmg = V(w, u, key, 'freeze_damage');
      const m = w.addModifier(t, {
        key, src: u, dur, debuff: true, freezeCd: 0, lastHp: t.hp,
        onTick(w2, v, mm, dt) {
          if (mm.freezeCd > 0) mm.freezeCd -= dt;
          const drop = mm.lastHp - v.hp;
          mm.lastHp = v.hp;
          if (drop >= trig && mm.freezeCd <= 0) coldSnapFreeze(w2, u, v, mm, key, fdur, fdmg, fcd);
        },
      });
      if (!m) return;
      coldSnapFreeze(w, u, t, m, key, fdur, fdmg, fcd);
      return { dur, r: 0 };
    },
  },

  invoker_ghost_walk: {
    cast(w, u) {
      const key = 'invoker_ghost_walk';
      const dur = V(w, u, key, 'duration'), r = V(w, u, key, 'area_of_effect'), fade = V(w, u, key, 'aura_fade_time');
      const eSlow = V(w, u, key, 'enemy_slow'), sSlow = V(w, u, key, 'self_slow');
      w.addModifier(u, {
        key, src: u, dur, debuff: false, status: ST.INVIS, breakOnAttack: true, stack: 'unique', purge: 'none',
        msPct: sSlow, hpRegen: V(w, u, key, 'health_regen'), manaRegen: V(w, u, key, 'mana_regen'), _t: 0,
        onTick(w2, v, m, dt) {
          m._t -= dt;
          if (m._t > 0) return;
          m._t = 0.5;
          for (const e of w2.unitsInRadius(v.x, v.y, r, foes(v))) w2.addModifier(e, { key: 'invoker_ghost_walk_slow', src: v, dur: fade, msPct: eSlow, debuff: true });
        },
      });
      return { r, dur };
    },
  },

  invoker_ice_wall: {
    cast(w, u) {
      const key = 'invoker_ice_wall';
      const dur = V(w, u, key, 'duration'), dps = V(w, u, key, 'damage_per_second'), iv = V(w, u, key, 'tick_interval') || 0.5;
      const slow = Math.max(-100, V(w, u, key, 'slow')), slowDur = V(w, u, key, 'slow_duration');
      const len = V(w, u, key, 'wall_total_length'), width = V(w, u, key, 'wall_width'), place = V(w, u, key, 'wall_place_distance');
      const f = u.facing, cx = u.x + Math.cos(f) * place, cy = u.y + Math.sin(f) * place, px = -Math.sin(f), py = Math.cos(f), h = len / 2;
      const x1 = cx - px * h, y1 = cy - py * h, x2 = cx + px * h, y2 = cy + py * h, end = w.time + dur;
      const step = (w2) => {
        for (const v of w2.unitsInLine(x1, y1, x2, y2, width, foes(u))) {
          w2.damage(u, v, dps * iv, 'mag', { ability: key, dot: true });
          w2.addModifier(v, { key: 'invoker_ice_wall_slow', src: u, dur: slowDur, msPct: slow, debuff: true });
        }
        if (w2.time + iv < end) w2.after(iv, step);
      };
      w.after(iv, step);
      return { x: Math.round(x1), y: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), r: width / 2, dur };
    },
  },

  invoker_emp: {
    cast(w, u, ab, tg) {
      const key = 'invoker_emp';
      const delay = V(w, u, key, 'delay'), r = V(w, u, key, 'area_of_effect'), burn = V(w, u, key, 'mana_burned');
      const pct = V(w, u, key, 'damage_per_mana_pct') / 100, back = V(w, u, key, 'self_mana_restore_pct') / 100;
      const x = tg.x, y = tg.y;
      w.after(delay, (w2) => {
        let total = 0;
        for (const v of w2.unitsInRadius(x, y, r, foes(u))) {
          if (v._st & (ST.INVULN | ST.MAGIC_IMMUNE)) continue;   // DATA ENEMIES_NO: no mana burn (and so no damage) on debuff-immune units
          const b = Math.min(burn, v.mana);
          if (b <= 0) continue;
          v.mana -= b; total += b;
          w2.damage(u, v, b * pct, 'mag', { ability: key });
        }
        if (total > 0 && !u._dead) w2.restoreMana(u, total * back);
      });
      return { x: Math.round(x), y: Math.round(y), r, dur: delay };
    },
  },

  invoker_tornado: {
    cast(w, u, ab, tg) {
      const key = 'invoker_tornado';
      const dist = V(w, u, key, 'travel_distance'), speed = V(w, u, key, 'travel_speed'), r = V(w, u, key, 'area_of_effect');
      const lift = V(w, u, key, 'lift_duration'), dmg = V(w, u, key, 'base_damage') + V(w, u, key, 'wex_damage') + V(w, u, key, 'quas_damage');
      const dir = dirTo(u, tg);
      const tp = w.spawnProjectile({
        src: u, dir, range: dist, speed, radius: r, pierce: true, k: key,
        onHit(w2, p, v) {
          if (v._building || (v._st & ST.INVULN)) return;
          const m = w2.addModifier(v, {
            key: 'invoker_tornado_lift', src: u, dur: lift, status: ST.STUN | ST.INVULN, debuff: true, lifted: true,   // purge from DATA (dispel YES)
            onExpire(w3, t, m, reason) {
              if (reason !== 'expired') return;
              t._st &= ~ST.INVULN;   // our own modifier is already gone but the status bits are only rebuilt after this hook
              w3.damage(u, t, dmg, 'mag', { ability: key });
            },
          });
          if (!m) { w2.damage(u, v, dmg, 'mag', { ability: key }); return; }   // debuff immune: no lift, the damage lands on contact
          evSpell(w2, key, u.id, { sub: 'lift', t: v.id, x: Math.round(v.x), y: Math.round(v.y), dur: lift });   // the cyclone on the caught unit (client fx)
        },
      });
      w.addVision({ owner: u, x: u.x, y: u.y, r: V(w, u, key, 'vision_distance'), projectile: tp, linger: V(w, u, key, 'end_vision_duration') });
      return { x2: Math.round(u.x + Math.cos(dir) * dist), y2: Math.round(u.y + Math.sin(dir) * dist), r, dur: dist / speed, lift };
    },
  },

  invoker_alacrity: {
    cast(w, u, ab, tg) {
      const key = 'invoker_alacrity', t = tg.unit || u;
      const dur = V(w, u, key, 'duration');
      w.addModifier(t, {
        key, src: u, dur, debuff: false, as: V(w, u, key, 'bonus_attack_speed'), dmg: V(w, u, key, 'bonus_damage'), range: V(w, u, key, 'bonus_attack_range'),
      });
      return { dur };
    },
  },

  invoker_sun_strike: {
    cast(w, u, ab, tg) {
      const key = 'invoker_sun_strike';
      const delay = V(w, u, key, 'delay'), r = V(w, u, key, 'area_of_effect'), dmg = V(w, u, key, 'damage');
      const x = tg.x, y = tg.y;
      // vision of the target area from the cast through the delay and vision_duration after the strike (baked: 400 / 4 s)
      w.addVision({ owner: u, x, y, r: V(w, u, key, 'vision_distance') || VISION_FALLBACK.r, dur: delay + (V(w, u, key, 'vision_duration') || VISION_FALLBACK.dur) });
      w.after(delay, (w2) => {
        const hit = w2.unitsInRadius(x, y, r, foes(u)).filter((v) => !(v._st & ST.INVULN));   // DATA ENEMIES_YES: hits debuff-immune units
        const heroes = hit.filter((v) => v.kind === 'hero').length;
        for (const v of hit) w2.damage(u, v, v.kind === 'hero' && heroes > 1 ? dmg / heroes : dmg, 'pure', { ability: key });   // damage is split among enemy heroes
      });
      return { x: Math.round(x), y: Math.round(y), r, dur: delay };
    },
  },

  invoker_forge_spirit: {
    cast(w, u) {
      const key = 'invoker_forge_spirit';
      const q = orbLevel(u, 0), e = orbLevel(u, 2);
      const n = Math.max(1, Math.min(w.val(key, 'extra_spirit_count_quas', q + ORB_SHIFT), w.val(key, 'extra_spirit_count_exort', e + ORB_SHIFT)));
      const hp = V(w, u, key, 'spirit_hp'), dmg = V(w, u, key, 'spirit_damage'), armor = V(w, u, key, 'spirit_armor');
      const range = V(w, u, key, 'spirit_attack_range'), dur = V(w, u, key, 'spirit_duration'), per = V(w, u, key, 'armor_per_attack');
      for (const v of [...w.units.values()]) if (v._summonOf === u.id && v.key === 'invoker_forged_spirit' && !v._dead) w.killUnit(v, null, null);   // recast replaces the old spirits
      const maxStacks = Math.max(1, Math.floor(MELT.maxArmor / per));
      for (let i = 0; i < n; i++) {
        const a = u.facing + Math.PI * 2 * i / n;
        const s = w.spawnSummon(u, {
          key: 'invoker_forged_spirit', projKey: 'invoker_forged_spirit', x: u.x + Math.cos(a) * SPIRIT.ring, y: u.y + Math.sin(a) * SPIRIT.ring,
          hp, armor, dmgMin: dmg, dmgMax: dmg, atkRange: range, bat: SPIRIT.bat, atkPoint: SPIRIT.atkPoint, projSpeed: SPIRIT.projSpeed,
          ms: SPIRIT.ms, radius: SPIRIT.radius, dur, vision: SPIRIT.vision,
        });
        // Melting Strike: each hit strips armor (stacks, refreshed), shared by all of this caster's spirits
        s._onAttack = (w2, a2, t) => {
          if (t._building) return;
          // hero file forged_spirit_melting_strike: ENEMIES_NO (blocked on debuff immune: default), SPELL_DISPELLABLE_NO (not baked: the key is ours)
          w2.addModifier(t, { key: 'invoker_melting_strike', src: u, dur: MELT.dur, armor: -per, stack: 'stack', maxStacks, debuff: true, purge: 'none' });
        };
      }
      return { n, dur, r: SPIRIT.ring };
    },
  },

  invoker_chaos_meteor: {
    cast(w, u, ab, tg) {
      const key = 'invoker_chaos_meteor';
      const land = V(w, u, key, 'land_time'), r = V(w, u, key, 'area_of_effect'), dist = V(w, u, key, 'travel_distance'), speed = V(w, u, key, 'travel_speed');
      const iv = V(w, u, key, 'damage_interval') || 0.5, main = V(w, u, key, 'main_damage'), bdps = V(w, u, key, 'burn_dps'), bdur = V(w, u, key, 'burn_duration');
      const dir = dirTo(u, tg), cs = Math.cos(dir), sn = Math.sin(dir), x0 = tg.x, y0 = tg.y, roll = dist / speed;
      const t0 = w.time + land;
      const step = (w2) => {
        const el = clamp(w2.time - t0, 0, roll), x = x0 + cs * speed * el, y = y0 + sn * speed * el;
        for (const v of w2.unitsInRadius(x, y, r, foes(u))) {
          w2.damage(u, v, main, 'mag', { ability: key });
          if (bdps > 0 && !v._dead) w2.addModifier(v, { key: 'invoker_chaos_meteor_burn', src: u, dur: bdur, dot: { dps: bdps, interval: iv, type: 'mag' }, debuff: true });
        }
        if (w2.time - t0 < roll - 1e-6) w2.after(iv, step);
      };
      w.after(land, step);
      // vision on the landing spot while it falls, following the meteor as it rolls, then end_vision_duration where it stops
      w.addVision({
        owner: u, x: x0, y: y0, r: V(w, u, key, 'vision_distance'), linger: V(w, u, key, 'end_vision_duration'),
        follow(w2) {
          const el = clamp(w2.time - t0, 0, roll);
          return { x: x0 + cs * speed * el, y: y0 + sn * speed * el, end: w2.time - t0 >= roll };
        },
      });
      return { x: Math.round(x0), y: Math.round(y0), x2: Math.round(x0 + cs * dist), y2: Math.round(y0 + sn * dist), r, dur: land + roll, land, roll };
    },
  },

  invoker_deafening_blast: {
    cast(w, u, ab, tg) {
      const key = 'invoker_deafening_blast';
      const dist = V(w, u, key, 'travel_distance'), speed = V(w, u, key, 'travel_speed'), r0 = V(w, u, key, 'radius_start'), r1 = V(w, u, key, 'radius_end');
      const dmg = V(w, u, key, 'damage'), kb = V(w, u, key, 'knockback_duration'), dis = V(w, u, key, 'disarm_duration');
      const dir = dirTo(u, tg), cs = Math.cos(dir), sn = Math.sin(dir), x0 = u.x, y0 = u.y;
      const p = w.spawnProjectile({
        src: u, dir, range: dist, speed, radius: r1, pierce: true, k: key,
        // the wave widens from r0 to r1 along its path: the engine tests a fixed circle (r1), so refine with the true width
        filter(v) {
          const along = (v.x - x0) * cs + (v.y - y0) * sn, side = Math.abs(-(v.x - x0) * sn + (v.y - y0) * cs);
          const width = r0 + (r1 - r0) * clamp((dist - p.left) / dist, 0, 1);
          return !(v._st & ST.INVULN) && side <= width + v.radius && along > -v.radius;
        },
        onHit(w2, pp, v) {
          if (v._building) return;
          w2.damage(u, v, dmg, 'mag', { ability: key });
          if (v._dead) return;
          const dx = v.x - x0, dy = v.y - y0, l = Math.hypot(dx, dy);
          w2.addModifier(v, { key: 'invoker_deafening_blast_disarm', src: u, dur: kb + dis, status: ST.DISARM, debuff: true });   // blocked by debuff immunity; purge from DATA (NO)
          if (!(v._st & ST.MAGIC_IMMUNE)) w2.knockback(v, { dx: l > 1e-3 ? dx : cs, dy: l > 1e-3 ? dy : sn, dist: kb * KNOCK_SPEED, speed: KNOCK_SPEED });
        },
      });
      w.addVision({ owner: u, x: x0, y: y0, r: r1, projectile: p, linger: V(w, u, key, 'end_vision_duration') });   // the wave's own width; baked has no travel-vision radius
      return { x2: Math.round(x0 + cs * dist), y2: Math.round(y0 + sn * dist), r: r1, r0, dur: dist / speed };
    },
  },
};

export default {
  invoker_quas: orb('Q', (w, ab, b, n) => { b.hpRegen += n * w.val('invoker_quas', 'hp_regen_per_instance', ab.level); }),
  invoker_wex: orb('W', (w, ab, b, n) => {
    b.as += n * w.val('invoker_wex', 'attack_speed_per_instance', ab.level);
    b.msPct += n * w.val('invoker_wex', 'move_speed_per_instance', ab.level);
  }),
  invoker_exort: orb('E', (w, ab, b, n) => { b.dmg += n * w.val('invoker_exort', 'bonus_damage_per_instance', ab.level); }),
  invoker_invoke: invokeH,
  invoker_empty1: noop,
  invoker_empty2: noop,
  ...spells,
};
