// Rubick. Imports: only shared/* and ../events.js (see abilities/index.js).
//   Telekinesis      lift an enemy (stun), it lands where it stood and stuns everything around the landing spot. (Choosing a landing point is
//                    not modelled: the baked data has no telekinesis_land ability.)
//   Fade Bolt        bouncing chain of magic damage; every victim loses attack damage for `duration`.
//   Arcane Supremacy passive: spell amplification (u._spellAmp, read by combat.damage) and bonus cast range (u._castRangeBonus, read by orders.castSpec).
//   Spell Steal      target an enemy hero: copy the LAST ability it cast (victim.u._lastCast, set by orders.executeAbility / toggles) into slot D
//                    (the previous steal moves to F) for `duration`. Slots are the roster's rubick_empty1/2 placeholders (like Invoker's D/F),
//                    rewritten in place: ab.key = stolen key, so the stolen spell runs through its OWN handler with no special casing.
//
// Stolen level: scaled from Spell Steal's level (1..3) onto the spell's own max level: round(ssLevel * maxLevel / 3)  (4-level spell: 1/3/4,
//   3-level ult: 1/2/3). Cooldown is cut by stolen_spell_cooldown_percent. Slots are marked ab.stolen (not learnable).
// Invoker spells: they have one level and read their numbers from the CASTER's Quas/Wex/Exort levels (abilities[0..2]). While a stolen
//   invoker_* spell is cast, Rubick's abilities[0..2].level are set to orb level = 2 * ssLevel (2/4/6) for the synchronous h.cast and restored
//   right after (orders.executeAbility calls u._castCtx). Every invoker value is read at the start of its cast, so nothing deferred is affected.
import { ST, ABF } from '../../../../shared/protocol.js';
import { evSpell, evMsg } from '../events.js';

const TK = 'rubick_telekinesis', FB = 'rubick_fade_bolt', AS = 'rubick_arcane_supremacy', SS = 'rubick_spell_steal';
const SLOT = 3;                         // first stolen slot (D); second is SLOT + 1 (F)
const EMPTY = ['rubick_empty1', 'rubick_empty2'];
const FADE_BOLT_HOPS = 3;               // extra targets after the first (not in the baked data)
const NOT_STEALABLE = /^(invoker_(quas|wex|exort|invoke|empty\d)|rubick_|.*_empty\d)/;
const rnd = Math.round;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ------------------------------------------------------------------------------------------------------------------- Spell Steal
const rub = (u) => u._rub || (u._rub = { s: [null, null] });   // [{key, exp, cd, level}] for D, F

function slotFlags(w, key) {
  const b = (w.data.abilities[key] && w.data.abilities[key].behavior) || [];
  let f = 0;
  if (b.indexOf('PASSIVE') >= 0) f |= ABF.PASSIVE;
  if (b.indexOf('NO_TARGET') >= 0) f |= ABF.NO_TARGET;
  if (b.indexOf('UNIT_TARGET') >= 0) f |= ABF.UNIT_TARGET;
  if (b.indexOf('POINT') >= 0) f |= ABF.POINT_TARGET;
  return f;
}

/** Stolen spell level for Spell Steal level `ss`. Invoker spells have a single level (their strength comes from the orb levels). */
function stolenLevel(w, key, ss) {
  const d = w.data.abilities[key];
  const ml = d ? d.maxLevel : 1;
  return key.startsWith('invoker_') ? 1 : clamp(rnd(ss * ml / 3), 1, ml);
}

const cdOf = (w, key, level, ss) => {
  const base = w.field(key, 'cooldown', level) || 0;
  return base * (1 - (w.val(SS, 'stolen_spell_cooldown_percent', ss) || 0) / 100);
};

/** Write the two stolen entries into the D/F ability slots. */
function applySlots(w, u) {
  const s = rub(u);
  for (let i = 0; i < 2; i++) {
    const ab = u.abilities[SLOT + i], e = s.s[i];
    if (!ab) continue;
    if (e) {
      ab.key = e.key; ab.stolen = true; ab.level = e.level; ab.flags = slotFlags(w, e.key);
      ab.mana = w.field(e.key, 'manaCost', e.level) || 0; ab.cdMax = e.cdMax; ab.cd = e.cd;
    } else {
      ab.key = EMPTY[i]; ab.stolen = false; ab.level = 0; ab.flags = ABF.PASSIVE; ab.mana = 0; ab.cdMax = 0; ab.cd = 0;
    }
  }
  u._dirty = true;
}

/** Copy the live slot cooldowns back into the entries (before any slot rewrite). */
function syncOut(u) {
  const s = rub(u);
  for (let i = 0; i < 2; i++) if (s.s[i] && u.abilities[SLOT + i]) s.s[i].cd = u.abilities[SLOT + i].cd;
}

function clearSlots(w, u) {
  const s = rub(u);
  s.s[0] = s.s[1] = null;
  applySlots(w, u);
}

/** orders.executeAbility hook: a stolen invoker_* spell reads orb levels from abilities[0..2]; lend it those, restore after the cast. */
function castCtx(w, u, ab) {
  if (!ab.stolen || !ab.key.startsWith('invoker_')) return null;
  const ss = w.getAbility(u, SS), orb = 2 * (ss ? ss.level : 1);
  const saved = [0, 1, 2].map((i) => (u.abilities[i] ? u.abilities[i].level : 0));
  for (let i = 0; i < 3; i++) if (u.abilities[i]) u.abilities[i].level = orb;
  return () => { for (let i = 0; i < 3; i++) if (u.abilities[i]) u.abilities[i].level = saved[i]; };
}

function stealable(w, victim) {
  const lc = victim._lastCast;
  if (!lc || NOT_STEALABLE.test(lc.key)) return null;
  const d = w.data.abilities[lc.key];
  if (!d || d.behavior.includes('PASSIVE')) return null;
  for (const ab of victim.abilities) if (ab.stolen && ab.key === lc.key) return null;   // no stealing a stolen spell
  return lc;
}

// ------------------------------------------------------------------------------------------------------------------- handlers
export default {
  // ---------------------------------------------------------------------------------------------------------------- Telekinesis
  rubick_telekinesis: {
    cast(w, u, ab, tg) {
      const t = tg.unit;
      if (!t) return;
      const lv = ab.level;
      const lift = w.val(TK, 'lift_duration', lv), fall = w.val(TK, 'fall_duration', lv), stun = w.val(TK, 'stun_duration', lv), r = w.val(TK, 'radius', lv);
      w.addModifier(t, { key: TK, src: u, dur: lift + fall + stun, status: ST.STUN, debuff: true, purge: 'strong' });
      evSpell(w, TK, u.id, { sub: 'lift', t: t.id, x: rnd(t.x), y: rnd(t.y), dur: lift, lift: 1, r });
      w.after(lift + fall, (w2) => {
        const x = t.x, y = t.y;
        evSpell(w2, TK, u.id, { sub: 'land', t: t.id, x: rnd(x), y: rnd(y), r });
        for (const v of w2.unitsInRadius(x, y, r, { enemyOf: u, buildings: false })) {
          if (v !== t) w2.addModifier(v, { key: TK + '_land', src: u, dur: stun, status: ST.STUN, debuff: true, purge: 'strong' });
        }
      });
      return { dur: lift + fall, r };
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Fade Bolt
  rubick_fade_bolt: {
    cast(w, u, ab, tg) {
      const t = tg.unit;
      if (!t) return;
      const lv = ab.level;
      const dmg = w.val(FB, 'damage', lv), red = w.val(FB, 'damage_reduction', lv), dur = w.val(FB, 'duration', lv);
      const r = w.val(FB, 'radius', lv), delay = w.val(FB, 'jump_delay', lv), jump = w.val(FB, 'jump_damage_reduction_pct', lv) / 100;
      const seen = new Set();
      const hit = (w2, from, to, hops, mult) => {
        seen.add(to.id);
        evSpell(w2, FB, u.id, { sub: 'bolt', t: to.id, x: rnd(from.x), y: rnd(from.y), x2: rnd(to.x), y2: rnd(to.y) });
        w2.damage(u, to, dmg * mult, 'mag', { ability: FB });
        if (!to._dead) w2.addModifier(to, { key: FB, src: u, dur, dmg: -red, debuff: true, purge: 'basic' });
        if (hops <= 0) return;
        w2.after(delay, (w3) => {
          const nxt = w3.nearestUnit(to.x, to.y, r, { enemyOf: u, buildings: false, filter: (x) => !seen.has(x.id) });
          if (nxt) hit(w3, to, nxt, hops - 1, mult * (1 - jump));
        });
      };
      hit(w, u, t, FADE_BOLT_HOPS, 1);
      return { r };
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Arcane Supremacy
  rubick_arcane_supremacy: {
    bonus(w, u, ab) {
      u._spellAmp = w.val(AS, 'spell_amp', ab.level);
      u._castRangeBonus = w.val(AS, 'cast_range', ab.level);
    },
  },

  // ---------------------------------------------------------------------------------------------------------------- Spell Steal
  rubick_spell_steal: {
    passive(w, u) { u._castCtx = castCtx; },
    cast(w, u, ab, tg) {
      u._castCtx = castCtx;
      const t = tg.unit, lc = t && stealable(w, t);
      if (!lc) {   // nothing to steal: refund
        ab.cd = 0; u.mana = Math.min(u.maxMana, u.mana + ab.mana);
        const p = u.owner && w.players.get(u.owner); if (p) evMsg(w, 'Nothing to steal', p.sid);
        return;
      }
      const ss = ab.level, key = lc.key, level = stolenLevel(w, key, ss);
      const s = rub(u);
      syncOut(u);
      const old = s.s.find((e) => e && e.key === key);
      const entry = { key, level, exp: w.time + w.val(SS, 'duration', ss), cd: old ? old.cd : 0, cdMax: cdOf(w, key, key.startsWith('invoker_') ? 1 : level, ss) };
      s.s = [entry, ...s.s.filter((e) => e && e.key !== key)].slice(0, 2);
      while (s.s.length < 2) s.s.push(null);
      applySlots(w, u);
      evSpell(w, SS, u.id, { sub: 'steal', t: t.id, x: rnd(t.x), y: rnd(t.y), k2: key });
      return { k2: key, dur: w.val(SS, 'duration', ss) };
    },
    tick(w, u, ab) {
      u._castCtx = castCtx;
      const s = rub(u);
      let changed = false;
      for (let i = 0; i < 2; i++) {
        const e = s.s[i];
        if (e && w.time >= e.exp) { syncOut(u); s.s[i] = null; changed = true; }
      }
      if (changed) { s.s = s.s.filter(Boolean); while (s.s.length < 2) s.s.push(null); applySlots(w, u); }
    },
    onDeath(w, u) { clearSlots(w, u); },
  },
};
