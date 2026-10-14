// Stats derivation (all units), hero progression: XP/levels, skill points, gold, respawn. Pure.
import { KIND, ST } from '../../../shared/protocol.js';
import { ATTR, MAX_AS, MIN_AS, MAX_MS, MIN_MS, MAX_LEVEL, XP_TABLE, ULT_LEVELS, RESPAWN, PASSIVE_GOLD_PER_S } from '../../../shared/constants.js';
import { collectModBonus, STAT_KEYS, buffList } from './status.js';
import { getHandler } from './abilities/index.js';
import * as items from './items.js';
import { evLvl } from './events.js';

const newBonus = () => { const b = {}; for (const k of STAT_KEYS) b[k] = 0; b.slow = 0; return b; };

/** Recompute every derived stat of u from base + level + items + modifiers + passive bonuses. */
export function recalc(w, u) {
  const b = u._base, B = u._bonus || (u._bonus = newBonus());
  for (const k of STAT_KEYS) B[k] = 0;
  collectModBonus(u, B);
  const hero = u.kind === KIND.HERO;
  if (hero) {
    items.applyStats(w, u, B);
    for (const ab of u.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.bonus) h.bonus(w, u, ab, B); }
  }
  let str = 0, agi = 0, int = 0, prim = 0;
  if (hero) {
    const L = u.level - 1;
    str = b.str + b.strGain * L + B.str; agi = b.agi + b.agiGain * L + B.agi; int = b.int + b.intGain * L + B.int;
    prim = b.attr === 'all' ? ATTR.universalDmgPerAttr * (str + agi + int) : b.attr === 'str' ? str : b.attr === 'agi' ? agi : int;
    u.str = Math.floor(str); u.agi = Math.floor(agi); u.int = Math.floor(int);
  }
  // health / mana
  const maxHp = Math.max(1, b.hp + str * ATTR.hpPerStr + B.hp), maxMana = Math.max(0, b.mana + int * ATTR.manaPerInt + B.mana);
  if (u.maxHp !== maxHp) { if (u.hp > 0) u.hp = Math.min(maxHp, u.hp + Math.max(0, maxHp - u.maxHp)); u.maxHp = maxHp; }
  if (u.maxMana !== maxMana) { if (u.hp > 0) u.mana = Math.min(maxMana, u.mana + Math.max(0, maxMana - u.maxMana)); u.maxMana = maxMana; }
  u._hpRegen = (b.hpRegen || 0) + str * ATTR.hpRegenPerStr + B.hpRegen;
  u._manaRegen = (b.manaRegen || 0) + int * ATTR.manaRegenPerInt + B.manaRegen;
  // combat
  u.armor = b.armor + agi * ATTR.armorPerAgi + B.armor;
  u.dmgMin = Math.round(b.dmgMin + prim); u.dmgMax = Math.round(b.dmgMax + prim); u.dmgBonus = Math.round(B.dmg);
  const as = Math.min(MAX_AS, Math.max(MIN_AS, (b.baseAS || 100) + agi * ATTR.asPerAgi + B.as));
  u._asMult = as / 100;
  u._interval = (b.bat || 1) / u._asMult; u._windup = (b.atkPoint || 0.4) / u._asMult;
  u.atkRate = b.bat > 0 ? 1 / u._interval : 0;
  u.atkRange = b.atkRange + (u._ranged || !hero ? B.range : 0);
  u._mr = 1 - (1 - (b.mr || 0)) * (1 - int * ATTR.mrPerInt / 100) * (1 - B.mr / 100);
  // movement
  let ms = (b.ms + B.ms) * (1 + (B.msPct + agi * ATTR.msPctPerAgi) / 100) * (1 - B.slow / 100);
  if (u._st & ST.HEX) ms = 100;
  if (b.ms === 0) ms = 0;
  u.ms = Math.round(b.ms === 0 ? 0 : Math.min(MAX_MS, Math.max(MIN_MS, ms)));
  u._slowed = B.slow > 0; u._hasted = B.msPct > 0;
  u._turn = (b.turnRate || 0.6) / 0.03;   // rad/s (Dota: 180 deg in 0.03*pi/turnRate s)
  u._dirty = false;
}

/** Final derived status bits for the schema (call after tickStatus). */
export function finalizeStatus(u) {
  let s = u._st;
  if (u._slowed) s |= ST.SLOW;
  if (u._hasted) s |= ST.HASTE;
  u.status = s;
}

export function refreshAbility(w, u, ab) {
  const d = w.data.abilities[ab.key];
  if (!d || ab.level < 1) { ab.mana = 0; return; }
  const h = getHandler(ab.key);
  const lv = Math.min(ab.level, d.manaCost.length) - 1;
  ab.mana = h.manaCost ? h.manaCost(w, u, ab) : (d.manaCost[lv] || 0);
  ab.cdMax = h.cooldown ? h.cooldown(w, u, ab) : (d.cooldown[Math.min(lv, d.cooldown.length - 1)] || 0);
}

export function requiredLevel(w, u, ab) {
  const d = w.data.abilities[ab.key], h = getHandler(ab.key);
  if (h.learnReq) return h.learnReq(w, u, ab);
  return d && d.ult ? ULT_LEVELS[Math.min(ab.level, ULT_LEVELS.length - 1)] : 1 + 2 * ab.level;
}

export function canLearn(w, u, slot) {
  const ab = u.abilities[slot]; if (!ab || u.skillPoints <= 0 || u._dead && false) return false;
  const d = w.data.abilities[ab.key];
  if (!d || ab.stolen || d.behavior.includes('NOT_LEARNABLE') || ab.level >= d.maxLevel) return false;   // ab.stolen: Rubick's borrowed spell slots
  return u.level >= requiredLevel(w, u, ab);
}

export function learn(w, u, slot) {
  if (!canLearn(w, u, slot)) return false;
  const ab = u.abilities[slot];
  ab.level++; u.skillPoints--;
  refreshAbility(w, u, ab);
  const h = getHandler(ab.key);
  if (h.passive) h.passive(w, u, ab);
  u._dirty = true;
  return true;
}

export function addXp(w, u, amount) {
  if (u.kind !== KIND.HERO || amount <= 0) return;
  u.xp += amount;
  while (u.level < MAX_LEVEL && u.xp >= XP_TABLE[u.level]) {
    u.level++; u.skillPoints++; u._dirty = true;
    evLvl(w, u.id);
    for (const ab of u.abilities) if (ab.level > 0) refreshAbility(w, u, ab);
  }
  if (u._dirty) recalc(w, u);
}

export function respawnTime(u) { return RESPAWN[Math.min(u.level, MAX_LEVEL) - 1]; }

export function respawnHero(w, u) {
  const f = w.fountains[u.team];
  u._dead = false; u._mods.length = 0; u._q.length = 0; u._channel = null; u._mv = null; u._kb = null; u._wind = 0; u._cd = 0; u._auto = null;
  if (u._reviveAt) { u.x = u._reviveAt.x; u.y = u._reviveAt.y; u._reviveAt = null; }   // Aegis: reincarnate at the spot of death
  else { u.x = f ? f.x + (w.rand() - 0.5) * 200 : u.x; u.y = f ? f.y + (w.rand() - 0.5) * 200 : u.y; }
  u.respawn = 0; u._st = 0; u._dirty = true;
  recalc(w, u);
  u.hp = u.maxHp; u.mana = u.maxMana; u.anim = 'idle'; u.animSeq++;
  for (const ab of u.abilities) if (ab.level > 0) { const h = getHandler(ab.key); if (h.passive) h.passive(w, u, ab); }
  w.index.insert(u);
}

/** Per-tick hero housekeeping: respawn timer, passive gold, buff list. */
export function heroTick(w, u, dt) {
  const p = w.players.get(u.owner);
  if (u._dead) {
    u.respawn = Math.max(0, u.respawn - dt);
    if (u.respawn <= 0 && w.winner < 0) respawnHero(w, u);
    return;
  }
  if (p && w.time >= 0) {
    u._gfrac += PASSIVE_GOLD_PER_S * dt;
    if (u._gfrac >= 1) { const g = Math.floor(u._gfrac); u._gfrac -= g; p.gold += g; }
  }
  for (const ab of u.abilities) {
    if (ab.cd > 0) ab.cd = Math.max(0, ab.cd - dt);
    if (ab.level > 0) { const h = getHandler(ab.key); if (h.tick) h.tick(w, u, ab, dt); }
  }
  items.tick(w, u, dt);
  if (((w.tick + u._nid) & 7) === 0) u.buffs = buffList(u);
}
